import {
  alocarPagamento,
  descontoDePercentual,
  formatarData,
  formatarDataHora,
  formatarDinheiro,
  formatarQuantidade,
} from "@freguez/core";
import { Badge, cn } from "@freguez/ui";
import { useEffect, useMemo, useState } from "react";
import { api, semInternet } from "./api";
import { Button, CampoDinheiro, Dialogo, Erro, Rodape, Rotulo } from "./componentes";
import { comprovanteRecebimento, cupomLinhas, imprimirCupom } from "./impressao";
import { type ItemFila } from "./local";
import { abaterCrediarioLocal, buscarClientesLocal, clienteLocal, conferirPinLocal, enfileirar, enviarFila, filaAtual } from "./sincronia";
import type { ClienteDetalhe, ClienteResumo, Inicio, ItemCatalogo, ItemVenda } from "./tipos";

type ComPin = <T>(titulo: string, acao: (pin: string) => Promise<T>, subtitulo?: string) => Promise<T | null>;
export type Suspensa = { id: number; itens: ItemVenda[]; descontoGeral: number; clienteId: string | null; clienteNome: string | null; em: string };

const campo = "h-10 w-full rounded-md border border-slate-300 bg-surface px-3 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado.");

export function DialogoAtalhos({ atalhos, aoFechar }: { atalhos: [string, string][]; aoFechar: () => void }) {
  return (
    <Dialogo titulo="Atalhos do caixa" aoFechar={aoFechar} largura="max-w-md">
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {atalhos.map(([k, t]) => (
          <li key={k}>
            <kbd className="mr-2 rounded border border-line bg-slate-50 px-1.5 font-semibold">{k}</kbd>
            {t}
          </li>
        ))}
        <li>
          <kbd className="mr-2 rounded border border-line bg-slate-50 px-1.5 font-semibold">Esc</kbd>Cancelar ação
        </li>
        <li>
          <kbd className="mr-2 rounded border border-line bg-slate-50 px-1.5 font-semibold">3*</kbd>Multiplica o próximo bipe
        </li>
      </ul>
    </Dialogo>
  );
}

export function DialogoBusca({
  catalogo,
  soConsulta,
  aoEscolher,
  aoFechar,
}: {
  catalogo: ItemCatalogo[];
  soConsulta: boolean;
  aoEscolher: (i: ItemCatalogo) => void;
  aoFechar: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const termo = q.trim().toLowerCase();
  const achados = useMemo(
    () =>
      termo.length < 2
        ? []
        : catalogo
            .filter((i) => `${i.nome} ${i.variacao} ${i.sku} ${i.codigos.join(" ")}`.toLowerCase().includes(termo))
            .slice(0, 30),
    [catalogo, termo],
  );
  return (
    <Dialogo titulo={soConsulta ? "Consultar preço (F6)" : "Buscar produto (F2)"} aoFechar={aoFechar} largura="max-w-2xl">
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, achados.length - 1));
          if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
          if (e.key === "Enter" && achados[sel] && !soConsulta) aoEscolher(achados[sel]!);
        }}
        placeholder="Nome, referência ou código"
        aria-label="Buscar"
        className={cn(campo, "h-12 text-lg")}
      />
      <ul className="mt-3 max-h-[55vh] divide-y divide-line overflow-auto">
        {achados.map((i, k) => (
          <li key={i.id}>
            <button
              disabled={soConsulta}
              onClick={() => aoEscolher(i)}
              className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left disabled:cursor-default", k === sel && "bg-navy-50")}
            >
              <span>
                <span className="font-medium">{i.nome}</span> <span className="text-ink-muted">{i.variacao}</span>
                <span className="block text-xs text-ink-muted">
                  {i.sku} · estoque {formatarQuantidade(i.estoque, i.unidade)}
                </span>
              </span>
              <span className="num text-right">
                {i.promocao && <span className="block text-xs text-ink-muted line-through">{formatarDinheiro(i.precoCheio)}</span>}
                <span className="font-semibold">{formatarDinheiro(i.preco)}</span>
              </span>
            </button>
          </li>
        ))}
        {termo.length >= 2 && !achados.length && <li className="p-4 text-center text-ink-muted">Nada encontrado.</li>}
      </ul>
    </Dialogo>
  );
}

export function DialogoQuantidade({ item, aoConfirmar, aoFechar }: { item: ItemVenda; aoConfirmar: (q: number) => void; aoFechar: () => void }) {
  const [q, setQ] = useState(String(item.quantidade));
  const n = Number(q.replace(",", "."));
  return (
    <Dialogo titulo={`Quantidade · ${item.item.nome}`} aoFechar={aoFechar} largura="max-w-sm">
      <input
        autoFocus
        inputMode="decimal"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && n > 0 && aoConfirmar(n)}
        aria-label="Quantidade"
        className={cn(campo, "num h-14 text-2xl")}
      />
      <Rodape>
        <Button disabled={!(n > 0)} onClick={() => aoConfirmar(n)}>
          Confirmar
        </Button>
      </Rodape>
    </Dialogo>
  );
}

export function DialogoDesconto({
  item,
  subtotal,
  aoAplicar,
  aoFechar,
}: {
  item?: ItemVenda;
  subtotal: number;
  aoAplicar: (alvo: "item" | "venda", centavos: number) => void;
  aoFechar: () => void;
}) {
  const [alvo, setAlvo] = useState<"item" | "venda">(item ? "item" : "venda");
  const [modo, setModo] = useState<"pct" | "valor">("pct");
  const [pct, setPct] = useState("");
  const [valor, setValor] = useState(0);
  const base = alvo === "item" && item ? Math.round(item.quantidade * item.item.preco) : subtotal;
  const centavos = modo === "pct" ? descontoDePercentual(base, Number(pct.replace(",", ".")) || 0) : valor;
  const invalido = centavos < 0 || centavos > base;
  return (
    <Dialogo titulo="Desconto (F4)" aoFechar={aoFechar} largura="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={alvo === "item" ? "primary" : "secondary"} disabled={!item} onClick={() => setAlvo("item")}>
            No item
          </Button>
          <Button variant={alvo === "venda" ? "primary" : "secondary"} onClick={() => setAlvo("venda")}>
            Na venda toda
          </Button>
        </div>
        <p className="text-sm text-ink-muted">
          {alvo === "item" && item ? `${item.item.nome} ${item.item.variacao}` : "Total"} · base {formatarDinheiro(base)}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant={modo === "pct" ? "primary" : "secondary"} size="sm" onClick={() => setModo("pct")}>
            Em %
          </Button>
          <Button variant={modo === "valor" ? "primary" : "secondary"} size="sm" onClick={() => setModo("valor")}>
            Em R$
          </Button>
        </div>
        {modo === "pct" ? (
          <input autoFocus inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0 %" aria-label="Percentual" className={cn(campo, "num h-14 text-2xl")} />
        ) : (
          <CampoDinheiro id="desc-valor" valor={valor} aoMudar={setValor} grande autoFocus />
        )}
        <p className="num text-sm">
          Desconto: <strong>{formatarDinheiro(centavos)}</strong>
        </p>
        <p className="text-xs text-ink-muted">Acima do limite do vendedor, o caixa pede o PIN de quem pode autorizar ao finalizar.</p>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={() => aoAplicar(alvo, 0)}>
          Tirar desconto
        </Button>
        <Button disabled={invalido} onClick={() => aoAplicar(alvo, centavos)}>
          Aplicar
        </Button>
      </Rodape>
    </Dialogo>
  );
}

function BuscaCliente({ aoEscolher }: { aoEscolher: (c: ClienteDetalhe) => void }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<ClienteResumo[]>([]);
  const [erro, setErro] = useState<string>();
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return setLista([]);
    const t = setTimeout(async () => {
      try {
        setLista((await api<{ clientes: ClienteResumo[] }>(`/pdv/clientes?q=${encodeURIComponent(q.trim())}`)).clientes);
        setErro(undefined);
      } catch (e) {
        if (!semInternet(e)) return setErro(msg(e));
        setLista(await buscarClientesLocal(q));
        setErro("Sem internet: mostrando os clientes da última sincronização.");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const escolher = async (id: string) => {
    setCarregando(true);
    try {
      aoEscolher(await api<ClienteDetalhe>(`/pdv/clientes/${id}`).catch((e) => (semInternet(e) ? clienteLocal(id) : Promise.reject(e))));
    } catch (e) {
      setErro(msg(e));
    } finally {
      setCarregando(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, nº da ficha, CPF ou telefone" aria-label="Buscar cliente" className={cn(campo, "h-12 text-lg")} />
      <Erro>{erro}</Erro>
      <ul className="max-h-[45vh] divide-y divide-line overflow-auto">
        {lista.map((c) => (
          <li key={c.id}>
            <button disabled={carregando} onClick={() => void escolher(c.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-navy-50">
              <span>
                <span className="num mr-2 text-xs text-ink-muted">#{c.numero}</span>
                <span className="font-medium">{c.nome}</span>
                <span className="block text-xs text-ink-muted">{[c.documento, c.whatsapp].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex gap-1">
                {c.status === "bloqueado" && <Badge tone="danger">Bloqueado</Badge>}
                {c.dadosIncompletos && <Badge tone="warning">Dados incompletos</Badge>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DialogoCliente({ atual, aoEscolher, aoFechar }: { atual: ClienteDetalhe | null; aoEscolher: (c: ClienteDetalhe | null) => void; aoFechar: () => void }) {
  return (
    <Dialogo titulo="Cliente (F7)" aoFechar={aoFechar} largura="max-w-2xl">
      {atual && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-navy-50 px-3 py-2 text-sm">
          <span>
            Na venda: <strong>{atual.cliente.nome}</strong>
            {atual.cliente.dadosIncompletos && <span className="ml-2 text-warning">Peça para completar o cadastro (CPF/WhatsApp).</span>}
          </span>
          <button className="text-danger hover:underline" onClick={() => aoEscolher(null)}>
            Tirar
          </button>
        </div>
      )}
      <BuscaCliente aoEscolher={aoEscolher} />
    </Dialogo>
  );
}

export function DialogoReceber({
  clienteInicial,
  loja,
  modoLoja,
  hoje,
  comPin,
  aoFechar,
  aoConcluir,
}: {
  clienteInicial: ClienteDetalhe | null;
  loja: Inicio["loja"];
  modoLoja: "A" | "B" | "C";
  hoje: string;
  comPin: ComPin;
  aoFechar: () => void;
  aoConcluir: (m: string) => void;
}) {
  const [c, setC] = useState(clienteInicial);
  const total = c ? c.parcelas.reduce((t, p) => t + p.valor - p.valorPago, 0) : 0;
  const sugerido = c ? c.parcelas.filter((p) => p.vencimento <= hoje.slice(0, 8) + "31").reduce((t, p) => t + p.valor - p.valorPago, 0) : 0;
  const [valor, setValor] = useState(Math.min(sugerido || total, total));
  const [forma, setForma] = useState<"dinheiro" | "pix" | "debito" | "credito">("dinheiro");
  const [modo, setModo] = useState<"A" | "B">(modoLoja === "B" ? "B" : "A");
  const [erro, setErro] = useState<string>();
  const [recibo, setRecibo] = useState<{ mensagem: string; operador?: string; offline: boolean }>();
  // Senha do totem: cliente e valor já escolhidos lá
  const [valorTotem, setValorTotem] = useState<number | null>(null);
  const [senha, setSenha] = useState("");

  useEffect(() => {
    setValor(valorTotem != null ? Math.min(valorTotem, total) : Math.min(sugerido || total, total));
  }, [c?.cliente.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const usarSenha = async () => {
    setErro(undefined);
    try {
      const s = await api<{ clienteId: string; valor: number }>(`/pdv/senha/${senha}`);
      setValorTotem(s.valor);
      setC(await api<ClienteDetalhe>(`/pdv/clientes/${s.clienteId}`));
    } catch (e) {
      setErro(msg(e));
    }
  };

  const previa = useMemo(() => {
    if (!c || valor <= 0 || valor > total) return [];
    const { alocacoes } = alocarPagamento(c.parcelas, valor, modo, hoje);
    return alocacoes.map((a) => {
      const p = c.parcelas.find((x) => x.id === a.parcelaId)!;
      return { ...a, vencimento: p.vencimento, quita: a.valor === p.valor - p.valorPago };
    });
  }, [c, valor, modo, hoje, total]);

  const receber = async () => {
    setErro(undefined);
    try {
      const r = await comPin("PIN de quem recebe", async (pin) => {
        try {
          const x = await api<{ recibo: { mensagem: string; operador: string } }>("/pdv/crediario/receber", { pin, clienteId: c!.cliente.id, valorCentavos: valor, forma, modo });
          return { ...x.recibo, offline: false };
        } catch (e) {
          if (!semInternet(e)) throw e;
          // Sem internet: confere o PIN aqui, guarda na fila; a alocação definitiva é recalculada no servidor
          const f = await conferirPinLocal(pin, "receber_parcela");
          await enfileirar("recebimento", { funcionarioId: f.id, clienteId: c!.cliente.id, valorCentavos: valor, forma, modo });
          await abaterCrediarioLocal(c!.cliente.id, valor, modoLoja === "C" ? modo : modoLoja);
          const restante = total - valor;
          return {
            mensagem: `Recebido ${formatarDinheiro(valor)} (sem internet, lança quando a conexão voltar). ${restante > 0 ? `Saldo restante: ${formatarDinheiro(restante)}.` : "Crediário quitado."}`,
            operador: f.nome,
            offline: true,
          };
        }
      });
      if (r) {
        setRecibo(r);
        aoConcluir(r.mensagem);
      }
    } catch (e) {
      setErro(msg(e));
    }
  };

  if (recibo)
    return (
      <Dialogo titulo="Recebimento registrado" aoFechar={aoFechar} largura="max-w-md">
        <p className="rounded-md bg-success-soft p-3 text-success">{recibo.mensagem}</p>
        <div className="imprimir hidden p-3 font-mono text-xs print:block">
          <p>RECEBIMENTO DE CREDIÁRIO</p>
          <p>{c?.cliente.nome}</p>
          <p>{recibo.mensagem}</p>
          <p>{formatarDataHora(new Date().toISOString())}</p>
        </div>
        <div className="mt-3">
          <Erro>{erro}</Erro>
        </div>
        <Rodape>
          <Button
            variant="secondary"
            onClick={() =>
              void imprimirCupom((cfg) => comprovanteRecebimento({ loja, cliente: c?.cliente.nome ?? "", ...recibo }, cfg), "Recebimento").then(
                (direto) => direto || window.print(),
                (e) => setErro(msg(e)),
              )
            }
          >
            Imprimir comprovante
          </Button>
          <Button onClick={aoFechar}>Fechar</Button>
        </Rodape>
      </Dialogo>
    );

  return (
    <Dialogo titulo="Receber parcela (F9)" aoFechar={aoFechar} largura="max-w-2xl">
      {!c ? (
        <div className="flex flex-col gap-4">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void usarSenha();
            }}
          >
            <div className="flex-1">
              <Rotulo htmlFor="senha-totem">Senha do totem (se o cliente trouxe)</Rotulo>
              <input
                id="senha-totem"
                inputMode="numeric"
                maxLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className={cn(campo, "num font-mono tracking-widest")}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={senha.length !== 6}>
              Abrir
            </Button>
          </form>
          <Erro>{erro}</Erro>
          <BuscaCliente aoEscolher={setC} />
        </div>
      ) : !c.parcelas.length ? (
        <p className="text-ink-muted">{c.cliente.nome} não tem parcelas em aberto.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 font-medium">
              {c.cliente.nome} <span className="num text-sm text-ink-muted">#{c.cliente.numero}</span>
            </p>
            <ul className="num max-h-64 divide-y divide-line overflow-auto rounded-md border border-line text-sm">
              {c.parcelas.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 px-3 py-1.5">
                  <span className={p.vencimento < hoje ? "text-danger" : ""}>
                    {formatarData(p.vencimento)} · {p.numero}/{p.total}
                  </span>
                  <span>{formatarDinheiro(p.valor - p.valorPago)}</span>
                </li>
              ))}
            </ul>
            <p className="num mt-2 text-sm">
              Total em aberto: <strong>{formatarDinheiro(total)}</strong>
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <Rotulo htmlFor="valor-rec">Valor recebido</Rotulo>
              <CampoDinheiro id="valor-rec" valor={valor} aoMudar={setValor} grande autoFocus />
            </div>
            <div className="flex flex-wrap gap-2">
              {sugerido > 0 && sugerido < total && (
                <Button size="sm" variant="secondary" onClick={() => setValor(sugerido)}>
                  Vencidas + do mês
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setValor(total)}>
                Quitar tudo
              </Button>
            </div>
            <select value={forma} onChange={(e) => setForma(e.target.value as typeof forma)} aria-label="Forma" className={campo}>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
            </select>
            {modoLoja === "C" && (
              <select value={modo} onChange={(e) => setModo(e.target.value as "A" | "B")} aria-label="Valor a mais" className={campo}>
                <option value="A">Valor a mais: quitar as próximas</option>
                <option value="B">Valor a mais: diminuir as restantes</option>
              </select>
            )}
            {previa.length > 0 && (
              <ul className="num rounded-md bg-slate-50 p-2 text-xs">
                {previa.map((a) => (
                  <li key={a.parcelaId} className="flex justify-between">
                    <span>{formatarData(a.vencimento)}</span>
                    <span>
                      {formatarDinheiro(a.valor)} {a.quita ? "· quitada" : "· parcial"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Erro>{erro}</Erro>
          </div>
        </div>
      )}
      {c && c.parcelas.length > 0 && (
        <Rodape>
          <Button
            variant="ghost"
            onClick={() => {
              setC(null);
              setValorTotem(null);
            }}
          >
            Outro cliente
          </Button>
          <Button disabled={!previa.length} onClick={() => void receber()}>
            Receber {formatarDinheiro(valor)}
          </Button>
        </Rodape>
      )}
    </Dialogo>
  );
}

export function DialogoCaixa({ comPin, aoFechar, aoConcluir }: { comPin: ComPin; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [tipo, setTipo] = useState<"sangria" | "suprimento">("sangria");
  const [valor, setValor] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();
  const enviar = async () => {
    setErro(undefined);
    try {
      const r = await comPin(`PIN para ${tipo}`, async (pin) => {
        try {
          await api("/pdv/caixa", { acao: tipo, pin, valorCentavos: valor, motivo });
          return "";
        } catch (e) {
          if (!semInternet(e)) throw e;
          const f = await conferirPinLocal(pin, "abrir_fechar_caixa");
          await enfileirar("movimento", { funcionarioId: f.id, tipo, valorCentavos: valor, motivo });
          return " (sem internet, lança quando a conexão voltar)";
        }
      });
      if (r != null) {
        aoConcluir(`${tipo === "sangria" ? "Sangria" : "Suprimento"} de ${formatarDinheiro(valor)} registrada${r}.`);
        aoFechar();
      }
    } catch (e) {
      setErro(msg(e));
    }
  };
  return (
    <Dialogo titulo="Sangria / suprimento (F11)" aoFechar={aoFechar} largura="max-w-md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={tipo === "sangria" ? "primary" : "secondary"} onClick={() => setTipo("sangria")}>
            Sangria (retirar)
          </Button>
          <Button variant={tipo === "suprimento" ? "primary" : "secondary"} onClick={() => setTipo("suprimento")}>
            Suprimento (reforço)
          </Button>
        </div>
        <div>
          <Rotulo htmlFor="valor-cx">Valor</Rotulo>
          <CampoDinheiro id="valor-cx" valor={valor} aoMudar={setValor} grande autoFocus />
        </div>
        <div>
          <Rotulo htmlFor="motivo-cx">Motivo</Rotulo>
          <input id="motivo-cx" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: depósito no banco" className={campo} />
        </div>
        <Erro>{erro}</Erro>
      </div>
      <Rodape>
        <Button disabled={!valor || !motivo.trim()} onClick={() => void enviar()}>
          Registrar
        </Button>
      </Rodape>
    </Dialogo>
  );
}

type Resumo = {
  fundo: number;
  vendas_por_forma: Record<string, number>;
  recebimentos_por_forma: Record<string, number>;
  vendas_qtd: number;
  vendas_total: number;
  descontos: number;
  cancelamentos: number;
  troco: number;
  sangrias: number;
  suprimentos: number;
  devolucoes: number;
  esperado_dinheiro: number;
  contado: number;
  diferenca: number;
};
const FORMAS: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito", crediario: "Crediário", vale: "Vale" };

/** Fechamento cego: primeiro o operador informa o que contou; só depois vê o esperado (Start Geral 4.3). */
export function DialogoFechar({ comPin, aoFechar, aoFechado }: { comPin: ComPin; aoFechar: () => void; aoFechado: () => void }) {
  const [contado, setContado] = useState(0);
  const [resumo, setResumo] = useState<Resumo>();
  const [operador, setOperador] = useState("");
  const [erro, setErro] = useState<string>();
  const fechar = async () => {
    setErro(undefined);
    await enviarFila();
    const pendentes = (await filaAtual()).length;
    if (pendentes) {
      return setErro(`Há ${pendentes} operação(ões) deste caixa esperando a internet. Elas precisam ser enviadas antes de fechar (veja no topo da tela).`);
    }
    try {
      const r = await comPin("PIN de quem fecha o caixa", (pin) => api<{ resumo: Resumo; operador: string }>("/pdv/caixa", { acao: "fechar", pin, valorCentavos: contado }));
      if (r) {
        setResumo(r.resumo);
        setOperador(r.operador);
      }
    } catch (e) {
      setErro(msg(e));
    }
  };
  if (resumo) {
    const linha = (rotulo: string, v: number, destaque?: string) => (
      <div className="flex justify-between">
        <dt>{rotulo}</dt>
        <dd className={destaque}>{formatarDinheiro(v)}</dd>
      </div>
    );
    return (
      <Dialogo titulo="Caixa fechado" aoFechar={aoFechado} largura="max-w-md">
        <div className="imprimir num text-sm">
          <p className="mb-2 font-semibold print:font-mono">FECHAMENTO DE CAIXA · {operador}</p>
          <p className="mb-3 text-xs text-ink-muted">{formatarDataHora(new Date().toISOString())}</p>
          <dl className="flex flex-col gap-1">
            {linha("Fundo de troco", resumo.fundo)}
            {Object.entries(resumo.vendas_por_forma).map(([f, v]) => linha(`Vendas · ${FORMAS[f] ?? f}`, v))}
            {Object.entries(resumo.recebimentos_por_forma).map(([f, v]) => linha(`Crediário recebido · ${FORMAS[f] ?? f}`, v))}
            {linha("Troco dado", resumo.troco)}
            {linha("Suprimentos", resumo.suprimentos)}
            {linha("Sangrias", resumo.sangrias)}
            {linha("Devoluções em dinheiro", resumo.devolucoes)}
            {linha("Descontos", resumo.descontos)}
            <div className="flex justify-between">
              <dt>Vendas / cancelamentos</dt>
              <dd>
                {resumo.vendas_qtd} / {resumo.cancelamentos}
              </dd>
            </div>
            <hr className="my-2 border-line" />
            {linha("Dinheiro esperado", resumo.esperado_dinheiro)}
            {linha("Dinheiro contado", resumo.contado)}
            {linha("Diferença", resumo.diferenca, resumo.diferenca === 0 ? "font-bold text-success" : "font-bold text-danger")}
          </dl>
        </div>
        <Erro>{erro}</Erro>
        <Rodape>
          <Button
            variant="secondary"
            onClick={() => {
              const linhas: [string, string][] = [
                ["Fundo de troco", formatarDinheiro(resumo.fundo)],
                ...Object.entries(resumo.vendas_por_forma).map(([f, v]): [string, string] => [`Vendas · ${FORMAS[f] ?? f}`, formatarDinheiro(v)]),
                ...Object.entries(resumo.recebimentos_por_forma).map(([f, v]): [string, string] => [`Crediário · ${FORMAS[f] ?? f}`, formatarDinheiro(v)]),
                ["Troco dado", formatarDinheiro(resumo.troco)],
                ["Suprimentos", formatarDinheiro(resumo.suprimentos)],
                ["Sangrias", formatarDinheiro(resumo.sangrias)],
                ["Devoluções em dinheiro", formatarDinheiro(resumo.devolucoes)],
                ["Descontos", formatarDinheiro(resumo.descontos)],
                ["Vendas / cancelamentos", `${resumo.vendas_qtd} / ${resumo.cancelamentos}`],
                ["Dinheiro esperado", formatarDinheiro(resumo.esperado_dinheiro)],
                ["Dinheiro contado", formatarDinheiro(resumo.contado)],
                ["Diferença", formatarDinheiro(resumo.diferenca)],
              ];
              void imprimirCupom((cfg) => cupomLinhas(`FECHAMENTO DE CAIXA · ${operador}`, linhas, cfg), "Fechamento de caixa").then(
                (direto) => direto || window.print(),
                (e) => setErro(msg(e)),
              );
            }}
          >
            Imprimir
          </Button>
          <Button onClick={aoFechado}>Concluir</Button>
        </Rodape>
      </Dialogo>
    );
  }
  return (
    <Dialogo titulo="Fechar caixa" aoFechar={aoFechar} largura="max-w-md">
      <p className="mb-4 text-sm text-ink-muted">Conte o dinheiro da gaveta e confira os comprovantes de cartão e Pix. Informe só o dinheiro contado.</p>
      <Rotulo htmlFor="contado">Dinheiro contado</Rotulo>
      <CampoDinheiro id="contado" valor={contado} aoMudar={setContado} grande autoFocus />
      <div className="mt-3">
        <Erro>{erro}</Erro>
      </div>
      <Rodape>
        <Button variant="ghost" onClick={aoFechar}>
          Voltar
        </Button>
        <Button onClick={() => void fechar()}>Fechar caixa</Button>
      </Rodape>
    </Dialogo>
  );
}

type VendaTroca = {
  id: string;
  numero: number;
  criadoEm: string;
  status: string;
  total: number;
  cliente: string | null;
  temCliente: boolean;
  itens: { id: string; descricao: string; quantidade: number; devolvido: number; total: number }[];
};

export function DialogoTroca({ comPin, aoFechar, aoConcluir }: { comPin: ComPin; aoFechar: () => void; aoConcluir: (m: string) => void }) {
  const [numero, setNumero] = useState("");
  const [venda, setVenda] = useState<VendaTroca>();
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [destino, setDestino] = useState<"vale" | "dinheiro">("vale");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string>();

  const buscar = async () => {
    setErro(undefined);
    try {
      const r = await api<{ venda: VendaTroca }>(`/pdv/vendas?numero=${Number(numero)}`);
      setVenda(r.venda);
      setDestino(r.venda.temCliente ? "vale" : "dinheiro");
      setQtd({});
    } catch (e) {
      setErro(msg(e));
    }
  };
  const itens = Object.entries(qtd).filter(([, q]) => q > 0).map(([vendaItemId, quantidade]) => ({ vendaItemId, quantidade }));

  const devolver = async () => {
    setErro(undefined);
    try {
      const corpo = { vendaId: venda!.id, itens, destino, motivo };
      const pedir = (pin: string, pinAutorizador?: string) => api<{ resultado: { valor: number; abatido_crediario: number; vale: number; dinheiro: number } }>("/pdv/trocas", { ...corpo, pin, pinAutorizador });
      let r = await comPin("PIN de quem faz a troca", async (pin) => {
        try {
          return await pedir(pin);
        } catch (e) {
          if (e instanceof Error && "codigo" in e && (e as { codigo?: string }).codigo === "precisa_autorizacao") {
            return { autorizar: pin, aviso: e.message } as const;
          }
          throw e;
        }
      });
      if (r && "autorizar" in r) {
        const pinVendedor = r.autorizar;
        r = await comPin("PIN do dono ou gerente", (pinAut) => pedir(pinVendedor, pinAut), r.aviso);
      }
      if (r && "resultado" in r) {
        const x = r.resultado;
        const partes = [
          x.abatido_crediario && `${formatarDinheiro(x.abatido_crediario)} abatido do crediário`,
          x.vale && `vale-troca de ${formatarDinheiro(x.vale)}`,
          x.dinheiro && `${formatarDinheiro(x.dinheiro)} devolvido em dinheiro`,
        ].filter(Boolean);
        aoConcluir(`Devolução de ${formatarDinheiro(x.valor)}: ${partes.join(", ")}. Para trocar por outra peça, faça a nova venda pagando com o vale.`);
        aoFechar();
      }
    } catch (e) {
      setErro(msg(e));
    }
  };

  const cancelar = async () => {
    setErro(undefined);
    try {
      const r = await comPin("PIN de quem cancela a venda", (pin) => api(`/pdv/vendas/${venda!.id}/cancelar`, { pin, motivo }));
      if (r) {
        aoConcluir(`Venda #${venda!.numero} cancelada. Estoque e pagamentos estornados.`);
        aoFechar();
      }
    } catch (e) {
      setErro(msg(e));
    }
  };

  return (
    <Dialogo titulo="Troca, devolução ou cancelamento" aoFechar={aoFechar} largura="max-w-2xl">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
      >
        <input autoFocus inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))} placeholder="Nº da venda (no recibo)" aria-label="Número da venda" className={campo} />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
      {venda && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">
            Venda <strong>#{venda.numero}</strong> · {formatarDataHora(venda.criadoEm)} · {formatarDinheiro(venda.total)}
            {venda.cliente && ` · ${venda.cliente}`}
            {venda.status === "cancelada" && <Badge tone="danger" className="ml-2">Cancelada</Badge>}
          </p>
          {venda.status !== "cancelada" && (
            <>
              <ul className="divide-y divide-line rounded-md border border-line">
                {venda.itens.map((i) => {
                  const max = i.quantidade - i.devolvido;
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>
                        {i.descricao} <span className="num text-ink-muted">· {i.quantidade} un · {formatarDinheiro(i.total)}</span>
                        {i.devolvido > 0 && <span className="ml-2 text-xs text-warning">{i.devolvido} já devolvido(s)</span>}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={max}
                        disabled={max <= 0}
                        value={qtd[i.id] ?? 0}
                        onChange={(e) => setQtd((q) => ({ ...q, [i.id]: Math.max(0, Math.min(max, Number(e.target.value))) }))}
                        aria-label={`Devolver quantos de ${i.descricao}`}
                        className="num h-9 w-20 rounded-md border border-slate-300 px-2"
                      />
                    </li>
                  );
                })}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={destino === "vale" ? "primary" : "secondary"} disabled={!venda.temCliente} onClick={() => setDestino("vale")}>
                  Vale-troca
                </Button>
                <Button variant={destino === "dinheiro" ? "primary" : "secondary"} onClick={() => setDestino("dinheiro")}>
                  Devolver dinheiro
                </Button>
              </div>
              {!venda.temCliente && <p className="text-xs text-ink-muted">Venda sem cliente: vale-troca não disponível.</p>}
              <div>
                <Rotulo htmlFor="motivo-troca">Motivo</Rotulo>
                <input id="motivo-troca" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: tamanho não serviu" className={campo} />
              </div>
            </>
          )}
        </div>
      )}
      <div className="mt-3">
        <Erro>{erro}</Erro>
      </div>
      {venda && venda.status !== "cancelada" && (
        <Rodape>
          <Button variant="danger" disabled={!motivo.trim()} onClick={() => void cancelar()}>
            Cancelar venda inteira
          </Button>
          <Button disabled={!itens.length || !motivo.trim()} onClick={() => void devolver()}>
            Registrar devolução
          </Button>
        </Rodape>
      )}
    </Dialogo>
  );
}

export function DialogoSuspensas({ suspensas, aoRetomar, aoFechar }: { suspensas: Suspensa[]; aoRetomar: (s: Suspensa) => void; aoFechar: () => void }) {
  return (
    <Dialogo titulo="Vendas suspensas (F8)" aoFechar={aoFechar} largura="max-w-md">
      {!suspensas.length ? (
        <p className="text-ink-muted">Nenhuma venda suspensa.</p>
      ) : (
        <ul className="divide-y divide-line">
          {suspensas.map((s) => (
            <li key={s.id}>
              <button onClick={() => aoRetomar(s)} className="flex w-full justify-between gap-3 px-2 py-3 text-left hover:bg-navy-50">
                <span>
                  {s.itens.length} item(ns){s.clienteNome && ` · ${s.clienteNome}`}
                  <span className="block text-xs text-ink-muted">{formatarDataHora(s.em)}</span>
                </span>
                <span className="text-sm text-brand">Retomar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialogo>
  );
}

const TIPOS_FILA: Record<ItemFila["tipo"], string> = { venda: "Venda", recebimento: "Recebimento de crediário", movimento: "Sangria / suprimento" };

/** O que este caixa fez sem internet e ainda não chegou ao servidor. */
export function DialogoFila({ aoFechar }: { aoFechar: () => void }) {
  const [fila, setFila] = useState<ItemFila[]>();
  const [enviando, setEnviando] = useState(false);
  const carregar = () => void filaAtual().then(setFila);
  useEffect(carregar, []);
  const valor = (i: ItemFila) => {
    const d = i.dados as { valorCentavos?: number; pagamentos?: { valorCentavos: number }[] };
    return d.valorCentavos ?? d.pagamentos?.reduce((t, p) => t + p.valorCentavos, 0) ?? 0;
  };
  return (
    <Dialogo titulo="Esperando a internet" aoFechar={aoFechar} largura="max-w-2xl">
      <p className="mb-3 text-sm text-ink-muted">
        Ficam guardadas neste computador e são enviadas sozinhas, na ordem, quando a conexão volta. Não feche o caixa antes de enviar tudo.
      </p>
      {!fila ? null : !fila.length ? (
        <p className="rounded-md bg-success-soft p-3 text-success">Tudo enviado.</p>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-line overflow-auto rounded-md border border-line text-sm">
          {fila.map((i) => (
            <li key={i.id} className="px-3 py-2">
              <span className="flex justify-between gap-3">
                <span>
                  {TIPOS_FILA[i.tipo]} <span className="num text-ink-muted">· {i.id.slice(-6).toUpperCase()}</span>
                </span>
                <span className="num">{formatarDinheiro(valor(i))}</span>
              </span>
              <span className="block text-xs text-ink-muted">{formatarDataHora(i.ocorridoEm)}</span>
              {i.erro && (
                <span className="mt-1 block rounded bg-danger-soft px-2 py-1 text-xs text-danger">
                  Recusado pelo servidor ({i.tentativas}×): {i.erro} — fale com o dono ou o suporte; o registro continua guardado.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Rodape>
        <Button
          variant="secondary"
          disabled={enviando || !fila?.length}
          onClick={async () => {
            setEnviando(true);
            await enviarFila();
            setEnviando(false);
            carregar();
          }}
        >
          {enviando ? "Enviando…" : "Enviar agora"}
        </Button>
        <Button onClick={aoFechar}>Fechar</Button>
      </Rodape>
    </Dialogo>
  );
}
