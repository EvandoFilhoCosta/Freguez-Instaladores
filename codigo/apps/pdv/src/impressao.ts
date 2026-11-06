// Impressão direta no app Windows (Start Geral 5.5): cupom 80 mm em ESC/POS, gaveta e etiquetas em TSPL.
// As impressoras escolhidas ficam no banco local deste computador. No navegador continua o window.print().

import {
  comandoGaveta,
  CupomEscPos,
  etiquetaTspl,
  formatarData,
  formatarDataHora,
  formatarDinheiro,
  formatarTelefone,
  type TamanhoEtiqueta,
} from "@freguez/core";
import { noDesktop } from "./desktop";
import { local } from "./local";
import type { Inicio, ItemCatalogo, Recibo } from "./tipos";

export type ConfigImpressao = {
  cupom: string | null;
  etiqueta: string | null;
  colunas: 48 | 42 | 32;
  automatico: boolean;
  gaveta: boolean;
  tamanho: TamanhoEtiqueta;
};

// Nada ligado por padrão: cada caixa diz o que tem (impressora de cupom, gaveta, impressora de etiqueta)
const PADRAO: ConfigImpressao = { cupom: null, etiqueta: null, colunas: 48, automatico: true, gaveta: false, tamanho: "40x25" };

export async function lerConfigImpressao(): Promise<ConfigImpressao> {
  return { ...PADRAO, ...((await (await local()).ler<Partial<ConfigImpressao>>("impressao")) ?? {}) };
}

export async function salvarConfigImpressao(c: ConfigImpressao) {
  await (await local()).gravar("impressao", c);
}

export async function listarImpressoras(): Promise<string[]> {
  if (!noDesktop) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("impressoras");
}

export async function enviar(impressora: string, dados: number[], documento: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  // Impressora desligada ou travada não pode prender o caixa: desiste em 10 s e avisa
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rejeitar) => {
    t = setTimeout(() => rejeitar(new Error(`A impressora "${impressora}" não respondeu. Confira se está ligada e com papel.`)), 10000);
  });
  try {
    await Promise.race([invoke("imprimir", { impressora, dados, documento }), limite]);
  } finally {
    clearTimeout(t);
  }
}

const FORMAS: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", debito: "Cartão débito", credito: "Cartão crédito", crediario: "Crediário", vale: "Vale-troca" };
const R = formatarDinheiro;

function cabecalho(c: CupomEscPos, loja: Inicio["loja"]) {
  const end = loja.endereco ?? {};
  c.texto(loja.nome, { centro: true, negrito: true, grande: true });
  if (end.rua) c.texto(`${end.rua}${end.numero ? `, ${end.numero}` : ""}${end.cidade ? ` - ${end.cidade}` : ""}`, { centro: true });
  if (loja.telefone) c.texto(formatarTelefone(loja.telefone), { centro: true });
}

/** Cupom não fiscal da venda (mesmo conteúdo do recibo na tela). */
export type TextosCupom = { cabecalho?: string; trocas?: string; rodape?: string };
const linhasDe = (t?: string) => (t ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function cupomVenda(recibo: Recibo, loja: Inicio["loja"], cfg: ConfigImpressao, textos: TextosCupom = {}): number[] {
  const c = new CupomEscPos(cfg.colunas);
  cabecalho(c, loja);
  for (const l of linhasDe(textos.cabecalho)) c.texto(l, { centro: true });
  c.texto(recibo.numero != null ? `CUPOM NÃO FISCAL · VENDA #${recibo.numero}` : `CUPOM NÃO FISCAL · VENDA ${recibo.codigoOffline}`, { centro: true, negrito: true });
  if (recibo.numero == null) c.texto("Feita sem internet: o número sai quando sincronizar", { centro: true });
  c.texto(formatarDataHora(new Date().toISOString()));
  c.texto(`Vendedor: ${recibo.vendedor}`);
  if (recibo.cliente) c.texto(`Cliente: ${recibo.cliente}`);
  c.separador();
  for (const i of recibo.itens) {
    c.texto(i.descricao);
    c.linha(`  ${i.quantidade} x ${R(i.precoUnit)}${i.desconto ? ` -${R(i.desconto)}` : ""}`, R(i.total));
  }
  c.separador();
  c.linha("Subtotal", R(recibo.bruto));
  if (recibo.descontoTotal > 0) c.linha("Descontos", `-${R(recibo.descontoTotal)}`);
  c.linha("TOTAL", R(recibo.total), { negrito: true });
  for (const p of recibo.pagamentos) c.linha(`${FORMAS[p.forma] ?? p.forma}${p.parcelasCartao && p.parcelasCartao > 1 ? ` ${p.parcelasCartao}x` : ""}`, R(p.valor));
  if (recibo.troco > 0) c.linha("Troco", R(recibo.troco), { negrito: true });
  if (recibo.parcelas.length) {
    c.separador();
    c.texto("CREDIÁRIO", { negrito: true });
    for (const p of recibo.parcelas) c.linha(`${p.numero}ª ${formatarData(p.vencimento)}`, R(p.valor));
    c.pular(2).texto("Assinatura: ______________________________");
  }
  if (linhasDe(textos.trocas).length) {
    c.separador();
    for (const l of linhasDe(textos.trocas)) c.texto(l);
  }
  c.pular(1);
  for (const l of linhasDe(textos.rodape).length ? linhasDe(textos.rodape) : ["Obrigado pela preferência!"]) c.texto(l, { centro: true });
  c.pular(3);
  if (cfg.gaveta && recibo.pagamentos.some((p) => p.forma === "dinheiro")) c.abrirGaveta();
  return c.cortar().bytes();
}

export function comprovanteRecebimento(d: { loja: Inicio["loja"]; cliente: string; mensagem: string; operador?: string; offline: boolean }, cfg: ConfigImpressao): number[] {
  const c = new CupomEscPos(cfg.colunas);
  cabecalho(c, d.loja);
  c.texto("RECEBIMENTO DE CREDIÁRIO", { centro: true, negrito: true });
  c.texto(formatarDataHora(new Date().toISOString()));
  c.texto(`Cliente: ${d.cliente}`);
  if (d.operador) c.texto(`Recebido por: ${d.operador}`);
  c.separador().texto(d.mensagem);
  if (d.offline) c.texto("Feito sem internet: o saldo definitivo é confirmado quando o caixa sincronizar.");
  return c.pular(4).cortar().bytes();
}

export function cupomLinhas(titulo: string, linhas: [string, string][], cfg: ConfigImpressao): number[] {
  const c = new CupomEscPos(cfg.colunas);
  c.texto(titulo, { negrito: true }).texto(formatarDataHora(new Date().toISOString())).separador();
  for (const [e, d] of linhas) c.linha(e, d);
  return c.pular(4).cortar().bytes();
}

export function cupomTeste(cfg: ConfigImpressao): number[] {
  const c = new CupomEscPos(cfg.colunas);
  c.texto("Freguez", { centro: true, grande: true, negrito: true })
    .texto("Teste de impressão", { centro: true })
    .separador()
    .linha("Acentos: ação, pão, você", "OK")
    .linha("Colunas", String(cfg.colunas))
    .separador("=")
    .pular(4);
  return c.cortar().bytes();
}

export const gaveta = comandoGaveta;

export function etiquetaProduto(item: ItemCatalogo, copias: number, cfg: ConfigImpressao): number[] {
  return etiquetaTspl(
    {
      nome: item.nomeCurto || item.nome,
      detalhe: [item.variacao !== "Padrão" ? item.variacao : null, item.sku].filter(Boolean).join(" · "),
      preco: R(item.preco),
      codigo: item.codigos[0] ?? item.sku,
    },
    copias,
    cfg.tamanho,
  );
}

/** Imprime no cupom configurado; devolve false se não há impressora direta (aí a tela usa window.print). */
export async function imprimirCupom(montar: (cfg: ConfigImpressao) => number[], documento: string): Promise<boolean> {
  if (!noDesktop) return false;
  const cfg = await lerConfigImpressao();
  if (!cfg.cupom) return false;
  await enviar(cfg.cupom, montar(cfg), documento);
  return true;
}

type PedidoEtiqueta = { id: string; copias: number; item: Pick<ItemCatalogo, "id" | "sku" | "nome" | "nomeCurto" | "variacao" | "preco" | "codigos"> };

/**
 * Etiquetas pedidas pelo app do vendedor (Fase 4): o caixa com impressora de etiquetas busca a fila do
 * servidor, imprime e confirma. Sem impressora configurada aqui, não pega nada (outro caixa pode pegar).
 */
export async function imprimirPedidosDoApp(api: <T>(caminho: string, corpo?: unknown) => Promise<T>): Promise<number> {
  if (!noDesktop) return 0;
  const cfg = await lerConfigImpressao();
  if (!cfg.etiqueta) return 0;
  const { pedidos } = await api<{ pedidos: PedidoEtiqueta[] }>("/pdv/impressao");
  let n = 0;
  for (const p of pedidos) {
    try {
      await enviar(cfg.etiqueta, etiquetaProduto({ ...p.item, unidade: "UN", precoCheio: p.item.preco, promocao: false, estoque: 0 }, p.copias, cfg), `Etiquetas ${p.item.sku}`);
      await api(`/pdv/impressao/${p.id}`, { ok: true });
      n++;
    } catch (e) {
      await api(`/pdv/impressao/${p.id}`, { ok: false, erro: e instanceof Error ? e.message : String(e) }).catch(() => {});
    }
  }
  return n;
}

export type NotaDaVenda = {
  tipo: string;
  status: string;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  qrcodeUrl: string | null;
  consultaUrl: string | null;
  mensagem: string | null;
  homologacao: boolean;
  emitidaEm: string | null;
};

/**
 * DANFE da NFC-e (Documento Auxiliar) em 80 mm: emitente, itens, totais, pagamento, consulta pela chave
 * e o QR Code da Sefaz. Em homologação sai o aviso de "sem valor fiscal".
 */
export function danfeNfce(nota: NotaDaVenda, recibo: Recibo, loja: Inicio["loja"], cfg: ConfigImpressao): number[] {
  const c = new CupomEscPos(cfg.colunas);
  cabecalho(c, loja);
  c.texto("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", { centro: true });
  if (nota.homologacao) c.texto("EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL", { centro: true, negrito: true });
  c.separador();
  for (const i of recibo.itens) {
    c.texto(i.descricao);
    c.linha(`  ${i.quantidade} x ${R(i.precoUnit)}${i.desconto ? ` -${R(i.desconto)}` : ""}`, R(i.total));
  }
  c.separador();
  c.linha("Qtde. total de itens", String(recibo.itens.reduce((t, i) => t + i.quantidade, 0)));
  c.linha("Valor total R$", R(recibo.bruto));
  if (recibo.descontoTotal) c.linha("Descontos R$", `-${R(recibo.descontoTotal)}`);
  c.linha("Valor a pagar R$", R(recibo.total), { negrito: true });
  c.linha("FORMA PAGAMENTO", "VALOR PAGO R$");
  for (const p of recibo.pagamentos) c.linha(FORMAS[p.forma] ?? p.forma, R(p.valor));
  if (recibo.troco) c.linha("Troco R$", R(recibo.troco));
  c.separador();
  if (nota.consultaUrl) c.texto(`Consulte pela Chave de Acesso em ${nota.consultaUrl}`, { centro: true });
  if (nota.chave) c.texto(nota.chave.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 "), { centro: true });
  c.texto(recibo.cliente ? `CONSUMIDOR: ${recibo.cliente}` : "CONSUMIDOR NÃO IDENTIFICADO", { centro: true });
  c.texto(`NFC-e nº ${nota.numero ?? "-"} Série ${nota.serie ?? "-"} ${formatarDataHora(nota.emitidaEm ?? new Date().toISOString())}`, { centro: true, negrito: true });
  if (nota.qrcodeUrl) c.pular(1).qr(nota.qrcodeUrl, cfg.colunas >= 42 ? 5 : 4);
  return c.pular(4).cortar().bytes();
}
