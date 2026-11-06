// Sincronização do caixa offline (Start Geral 5.4):
// 1. Ao abrir e a cada 5 minutos, baixa funcionários (hash do PIN) e clientes com o crediário para o banco local.
// 2. Venda, recebimento e sangria sem internet entram na fila de saída com ID gerado aqui (UUID v7).
// 3. A fila é enviada em ordem quando a internet volta; o servidor confirma e o item sai da fila.
//    Item recusado (ex.: caixa fechado no painel) fica na fila com o erro, à vista no cabeçalho — nada se perde.

import { alocarPagamento, hojeNoFuso, pode, soDigitos, uuidv7, type Permissao } from "@freguez/core";
import bcrypt from "bcryptjs";
import { api, ErroApi, semInternet } from "./api";
import { estadoConexao, mudarConexao } from "./conexao";
import { local, type ItemFila, type TipoFila } from "./local";
import type { ClienteDetalhe, Funcionario, Inicio, ItemCatalogo } from "./tipos";

type FuncionarioLocal = Funcionario & { pinHash: string };
type Pacote = { geradoEm: string; funcionarios: FuncionarioLocal[]; clientes: ClienteDetalhe[] };

const CINCO_MIN = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
export async function guardarAbertura(inicio: Inicio, catalogo: ItemCatalogo[]) {
  const db = await local();
  await Promise.all([db.gravar("inicio", inicio), db.gravar("catalogo", catalogo)]);
}

export async function aberturaGuardada(): Promise<{ inicio: Inicio; catalogo: ItemCatalogo[] } | null> {
  const db = await local();
  const [inicio, catalogo] = await Promise.all([db.ler<Inicio>("inicio"), db.ler<ItemCatalogo[]>("catalogo")]);
  return inicio && catalogo ? { inicio, catalogo } : null;
}

export async function baixarDados() {
  const p = await api<Pacote>("/pdv/sincronizar");
  const db = await local();
  await Promise.all([db.gravar("funcionarios", p.funcionarios), db.gravar("clientes", p.clientes), db.gravar("baixadoEm", p.geradoEm)]);
  mudarConexao({ baixadoEm: p.geradoEm });
}

/** Baixa o estoque do catálogo guardado depois de uma venda offline (o servidor acerta na próxima sincronização). */
export async function baixarEstoqueLocal(itens: { variacaoId: string; quantidade: number }[]) {
  const db = await local();
  const cat = await db.ler<ItemCatalogo[]>("catalogo");
  if (!cat) return;
  const q = new Map<string, number>();
  for (const i of itens) q.set(i.variacaoId, (q.get(i.variacaoId) ?? 0) + i.quantidade);
  await db.gravar("catalogo", cat.map((c) => (q.has(c.id) ? { ...c, estoque: c.estoque - q.get(c.id)! } : c)));
}

async function clientesGuardados() {
  return (await (await local()).ler<ClienteDetalhe[]>("clientes")) ?? [];
}

/** Busca do F7 sem internet: nome, nº da ficha ou telefone (CPF fica mascarado no caixa). */
export async function buscarClientesLocal(q: string) {
  const t = q.trim().toLowerCase();
  const d = soDigitos(t);
  return (await clientesGuardados())
    .filter(({ cliente: c }) =>
      /^\d+$/.test(t) ? String(c.numero) === t || (d.length >= 4 && soDigitos(c.whatsapp ?? "").includes(d)) : c.nome.toLowerCase().includes(t),
    )
    .slice(0, 15)
    .map((x) => x.cliente);
}

export async function clienteLocal(id: string): Promise<ClienteDetalhe> {
  const c = (await clientesGuardados()).find((x) => x.cliente.id === id);
  if (!c) throw new ErroApi("Cliente não está no caixa. Sem internet só aparecem os clientes da última sincronização.", 404);
  return c;
}

async function atualizarCliente(id: string, mudar: (c: ClienteDetalhe) => ClienteDetalhe) {
  const db = await local();
  const lista = await clientesGuardados();
  await db.gravar("clientes", lista.map((c) => (c.cliente.id === id ? mudar(c) : c)));
}

const recalcular = (c: ClienteDetalhe, parcelas: ClienteDetalhe["parcelas"]): ClienteDetalhe => {
  const emAberto = parcelas.reduce((t, p) => t + p.valor - p.valorPago, 0);
  return {
    ...c,
    parcelas,
    cliente: { ...c.cliente, emAberto, disponivel: c.cliente.limite == null ? null : Math.max(c.cliente.limite - emAberto, 0) },
  };
};

/** Compra no crediário offline: soma ao em aberto do cliente guardado (para o limite da próxima venda). */
export async function somarCrediarioLocal(clienteId: string, parcelas: { numero: number; vencimento: string; valor: number }[], descricao: string) {
  const agora = new Date().toISOString();
  await atualizarCliente(clienteId, (c) =>
    recalcular(c, [
      ...c.parcelas,
      ...parcelas.map((p) => ({ id: `local-${uuidv7()}`, numero: p.numero, total: parcelas.length, descricao, compraCriadaEm: agora, vencimento: p.vencimento, valor: p.valor, valorPago: 0 })),
    ]),
  );
}

/** Recebimento offline: aplica a mesma alocação do servidor nas parcelas guardadas. */
export async function abaterCrediarioLocal(clienteId: string, valor: number, modo: "A" | "B") {
  await atualizarCliente(clienteId, (c) => {
    const { alocacoes } = alocarPagamento(c.parcelas, valor, modo, hojeNoFuso());
    const porId = new Map(alocacoes.map((a) => [a.parcelaId, a.valor]));
    return recalcular(
      c,
      c.parcelas.map((p) => ({ ...p, valorPago: p.valorPago + (porId.get(p.id) ?? 0) })).filter((p) => p.valorPago < p.valor),
    );
  });
}

// ---------------------------------------------------------------------------
// PIN sem internet: confere contra o hash bcrypt guardado. 5 erros bloqueiam por 5 minutos (igual ao servidor).
// ---------------------------------------------------------------------------
let falhas = 0;
let bloqueadoAte = 0;

export async function conferirPinLocal(pin: string, acao?: Permissao): Promise<Funcionario> {
  if (!/^\d{4}$/.test(pin)) throw new ErroApi("Digite o PIN de 4 dígitos.", 401, "pin");
  if (Date.now() < bloqueadoAte) throw new ErroApi("PIN bloqueado por excesso de tentativas. Tente em alguns minutos.", 429);
  const funcs = (await (await local()).ler<FuncionarioLocal[]>("funcionarios")) ?? [];
  if (!funcs.length) throw new ErroApi("Sem internet e este caixa ainda não recebeu os funcionários. Conecte uma vez para sincronizar.", 0);
  let achado: FuncionarioLocal | undefined;
  for (const f of funcs) {
    if (await bcrypt.compare(pin, f.pinHash)) {
      achado = f;
      break;
    }
  }
  if (!achado) {
    if (++falhas >= 5) {
      falhas = 0;
      bloqueadoAte = Date.now() + CINCO_MIN;
    }
    throw new ErroApi("PIN incorreto.", 401, "pin");
  }
  falhas = 0;
  const { pinHash: _, ...f } = achado;
  if (acao && !pode(f.papel, f.permissoes, acao)) throw new ErroApi(`${f.nome} não tem permissão para esta ação.`, 403, "permissao");
  return f;
}

/** PIN do vendedor: com internet pelo servidor; sem internet, pelo banco local. */
export async function conferirPinVendedor(pin: string): Promise<Funcionario> {
  try {
    return (await api<{ funcionario: Funcionario }>("/pdv/pin", { pin })).funcionario;
  } catch (e) {
    if (!semInternet(e)) throw e;
    return conferirPinLocal(pin, "vender");
  }
}

// ---------------------------------------------------------------------------
// Fila de saída
// ---------------------------------------------------------------------------
export async function enfileirar(tipo: TipoFila, dados: Record<string, unknown>, id: string = uuidv7()) {
  await (await local()).enfileirar({ id, tipo, ocorridoEm: new Date().toISOString(), dados });
  await contarFila();
  void enviarFila();
  return id;
}

export async function filaAtual(): Promise<ItemFila[]> {
  return (await local()).fila();
}

async function contarFila() {
  const f = await filaAtual();
  mudarConexao({ pendentes: f.length, comErro: f.filter((x) => x.erro).length });
  return f;
}

let enviando: Promise<void> | null = null;
/** Envia a fila em ordem. Para no primeiro sinal de falta de internet; erro de regra fica marcado e segue. */
export function enviarFila(): Promise<void> {
  enviando ??= (async () => {
    mudarConexao({ enviando: true });
    try {
      const db = await local();
      for (const item of await db.fila()) {
        try {
          await api("/pdv/sincronizar", { id: item.id, tipo: item.tipo, ocorridoEm: item.ocorridoEm, dados: item.dados });
          await db.tirar(item.id);
        } catch (e) {
          if (semInternet(e) || (e instanceof ErroApi && e.status === 401)) break;
          await db.marcarErro(item.id, e instanceof Error ? e.message : "Erro ao enviar.");
        }
      }
    } finally {
      await contarFila();
      mudarConexao({ enviando: false });
      enviando = null;
    }
  })();
  return enviando;
}

let iniciado = false;
/** Liga o ciclo: fila a cada 30 s (se houver), dados a cada 5 min (se online). */
export function iniciarSincronia() {
  if (iniciado) return;
  iniciado = true;
  void local()
    .then((db) => db.ler<string>("baixadoEm"))
    .then((b) => mudarConexao({ baixadoEm: b }));
  void contarFila().then(() => enviarFila());
  void baixarDados().catch(() => {});
  setInterval(() => {
    const e = estadoConexao();
    if (e.pendentes) void enviarFila();
    const velho = !e.baixadoEm || Date.now() - Date.parse(e.baixadoEm) > CINCO_MIN;
    if (velho) void baixarDados().catch(() => {});
  }, 30_000);
  window.addEventListener("online", () => void enviarFila());
}
