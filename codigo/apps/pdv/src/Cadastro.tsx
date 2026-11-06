// Freguez Cadastro (app Windows separado do caixa): bipa o código e o app decide.
// Código conhecido → dá entrada no estoque. Código novo → produto novo, ou mais um tamanho/cor de um produto
// que já existe (a "família": a camisa P, depois a M). Fotos pela câmera do computador ou por arquivo.
// Etiqueta do Freguez é opcional: quem preferir usa o código que já veio no produto — os dois acham o mesmo item.
import { combinarGrade, formatarDinheiro, nomeVariacao } from "@freguez/core";
import { cn } from "@freguez/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi } from "./api";
import {
  Button,
  CampoDinheiro,
  Dialogo,
  Erro,
  PinPad,
  Rotulo,
} from "./componentes";
import { alternarTelaCheia, noDesktop } from "./desktop";
import { DialogoImpressoras } from "./Impressoras";
import { enviar, etiquetaProduto, lerConfigImpressao } from "./impressao";
import type { Inicio } from "./tipos";

type Variacao = {
  id: string;
  sku: string;
  nome: string;
  atributos: Record<string, string>;
  preco: number;
  custo: number | null;
  codigos: { codigo: string; tipo: string }[];
  estoque: number;
};
type Produto = {
  id: string;
  nome: string;
  referencia: string;
  descricao: string;
  visivelSite: boolean;
  categoriaId: string | null;
  grade: string[];
  fotos: string[];
  variacoes: Variacao[];
};
type Resumo = {
  id: string;
  nome: string;
  referencia: string;
  foto: string | null;
  opcoes: string[];
};
type Categoria = { id: string; nome: string };
type Feito = { quando: number; texto: string };
type Recebida = { id: string; quantidade: number };

type Tela =
  | { t: "bipar" }
  | { t: "entrada"; produto: Produto; variacaoId: string }
  | { t: "novoCodigo"; codigo: string | null }
  | { t: "novo"; codigo: string | null }
  | { t: "opcao"; produto: Produto; codigo: string | null }
  | { t: "salvo"; produto: Produto; recebidas: Recebida[]; novo: boolean };

const campo =
  "h-11 w-full rounded-md border border-slate-300 bg-surface px-3 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none";
/** "P 3, M 5" (ou só "3" quando o produto não tem tamanho/cor) */
const resumo = (p: Produto, r: Recebida[]) =>
  r
    .map((x) => {
      const n = p.variacoes.find((v) => v.id === x.id)?.nome;
      return n && n !== "Padrão"
        ? `${n} ${x.quantidade}`
        : String(x.quantidade);
    })
    .join(", ");
const msg = (e: unknown) =>
  e instanceof Error ? e.message : "Algo deu errado.";

/** Reduz a foto no próprio computador (até 1600 px, JPEG) antes de enviar. */
async function reduzir(fonte: Blob | HTMLVideoElement): Promise<string> {
  let img: CanvasImageSource;
  let w: number;
  let h: number;
  if (fonte instanceof HTMLVideoElement) {
    img = fonte;
    w = fonte.videoWidth;
    h = fonte.videoHeight;
  } else {
    const b = await createImageBitmap(fonte);
    img = b;
    w = b.width;
    h = b.height;
  }
  const k = Math.min(1, 1600 / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}

export function Cadastro({ inicio }: { inicio: Inicio }) {
  const [sessao, setSessao] = useState<{
    token: string;
    nome: string;
    categorias: Categoria[];
  } | null>(null);
  const [erroPin, setErroPin] = useState<string>();
  const [tela, setTela] = useState<Tela>({ t: "bipar" });
  const [erro, setErro] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const [feitos, setFeitos] = useState<Feito[]>([]);
  const [ultimo, setUltimo] = useState<Produto | null>(null);
  const [impressoras, setImpressoras] = useState(false);

  const chamar = useCallback(
    async <T,>(corpo: Record<string, unknown>): Promise<T> => {
      try {
        return await api<T>("/pdv/cadastro", {
          ...corpo,
          sessao: sessao?.token,
        });
      } catch (e) {
        if (e instanceof ErroApi && e.codigo === "sessao") setSessao(null);
        throw e;
      }
    },
    [sessao],
  );
  const registrar = (texto: string) =>
    setFeitos((f) => [{ quando: Date.now(), texto }, ...f].slice(0, 30));

  const rodar = async (fn: () => Promise<void>) => {
    setErro(undefined);
    setOcupado(true);
    try {
      await fn();
    } catch (e) {
      setErro(msg(e));
    } finally {
      setOcupado(false);
    }
  };

  const bipar = (codigo: string) =>
    rodar(async () => {
      const c = codigo.trim();
      if (!c) return;
      const r = await chamar<{
        achou: boolean;
        codigo: string;
        variacaoId?: string;
        produto?: Produto;
      }>({ acao: "bipar", codigo: c });
      if (r.achou)
        setTela({
          t: "entrada",
          produto: r.produto!,
          variacaoId: r.variacaoId!,
        });
      else setTela({ t: "novoCodigo", codigo: r.codigo });
    });

  if (!sessao)
    return (
      <Fundo inicio={inicio}>
        <PinPad
          titulo="Cadastro de produtos"
          subtitulo="Digite seu PIN. Só quem pode cadastrar produto entra."
          erro={erroPin}
          aoFechar={() => undefined}
          aoConfirmar={async (pin) => {
            try {
              const r = await api<{
                sessao: string;
                nome: string;
                categorias: Categoria[];
              }>("/pdv/cadastro", { acao: "entrar", pin });
              setSessao({
                token: r.sessao,
                nome: r.nome,
                categorias: r.categorias,
              });
              setErroPin(undefined);
            } catch (e) {
              setErroPin(msg(e));
            }
          }}
        />
      </Fundo>
    );

  const voltar = () => (setErro(undefined), setTela({ t: "bipar" }));

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      <header className="flex flex-wrap items-center gap-3 bg-navy-900 px-5 py-3 text-white">
        <img
          src="/freguez-logo-horizontal-negativo.svg"
          alt="Freguez"
          width={110}
          height={32}
        />
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">
          Cadastro de produtos
        </span>
        <span className="text-sm text-white/60">{inicio.loja.nome}</span>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <span className="px-2 text-white/70">{sessao.nome}</span>
          {noDesktop && (
            <button
              className="rounded-full px-3 py-1.5 text-white/80 hover:bg-white/10"
              onClick={() => setImpressoras(true)}
            >
              Impressora de etiquetas
            </button>
          )}
          <button
            className="rounded-full px-3 py-1.5 text-white/80 hover:bg-white/10"
            title="Ctrl+Shift+F"
            onClick={() => void alternarTelaCheia().catch(() => undefined)}
          >
            Tela cheia
          </button>
          <button
            className="rounded-full px-3 py-1.5 text-white/80 hover:bg-white/10"
            onClick={() => (setSessao(null), setTela({ t: "bipar" }))}
          >
            Trocar pessoa
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 p-5 lg:grid-cols-[1fr_320px]">
        <main className="flex min-h-0 flex-col gap-4 overflow-auto">
          <CampoBipar
            ocupado={ocupado}
            ativo={tela.t === "bipar" || tela.t === "salvo"}
            aoBipar={bipar}
          />
          {erro && <Erro>{erro}</Erro>}

          {tela.t === "bipar" && (
            <Cartao>
              <p className="text-lg font-semibold">Bipe o código do produto</p>
              <p className="mt-1 text-ink-muted">
                Se ele já estiver cadastrado, você só diz quantas peças
                chegaram. Se for novo, o app abre o cadastro. Produto sem
                código? Cadastre e o Freguez gera um.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  onClick={() => setTela({ t: "novoCodigo", codigo: null })}
                >
                  Cadastrar produto sem código
                </Button>
              </div>
            </Cartao>
          )}

          {tela.t === "entrada" && (
            <Entrada
              produto={tela.produto}
              variacaoId={tela.variacaoId}
              chamar={chamar}
              aoFeito={(p, recebidas) => {
                registrar(`+${resumo(p, recebidas)} ${p.nome}`);
                setUltimo(p);
                setTela({ t: "salvo", produto: p, recebidas, novo: false });
              }}
              aoNovaOpcao={() =>
                setTela({ t: "opcao", produto: tela.produto, codigo: null })
              }
              aoVoltar={voltar}
            />
          )}

          {tela.t === "novoCodigo" && (
            <Cartao>
              <p className="text-lg font-semibold">
                {tela.codigo
                  ? `O código ${tela.codigo} ainda não está cadastrado`
                  : "Produto sem código de barras"}
              </p>
              <p className="mt-1 text-ink-muted">
                É um produto novo ou mais um tamanho/cor de um produto que já
                existe?
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setTela({ t: "novo", codigo: tela.codigo })}
                  className="rounded-lg border-2 border-brand bg-surface p-4 text-left hover:bg-navy-50"
                >
                  <span className="block text-lg font-semibold">
                    Produto novo
                  </span>
                  <span className="text-sm text-ink-muted">
                    Nome, preço, fotos e quantidade
                  </span>
                </button>
                {ultimo && (
                  <button
                    onClick={() =>
                      setTela({
                        t: "opcao",
                        produto: ultimo,
                        codigo: tela.codigo,
                      })
                    }
                    className="rounded-lg border-2 border-slate-300 bg-surface p-4 text-left hover:border-brand hover:bg-navy-50"
                  >
                    <span className="block text-lg font-semibold">
                      Outro tamanho/cor de “{ultimo.nome}”
                    </span>
                    <span className="text-sm text-ink-muted">
                      Já tem: {ultimo.variacoes.map((v) => v.nome).join(", ")}
                    </span>
                  </button>
                )}
              </div>
              <ProcurarProduto
                chamar={chamar}
                titulo={
                  ultimo
                    ? "Ou outro produto já cadastrado:"
                    : "Outro tamanho/cor de um produto já cadastrado:"
                }
                aoEscolher={(p) =>
                  setTela({ t: "opcao", produto: p, codigo: tela.codigo })
                }
              />
              <div className="mt-4">
                <Button variant="secondary" onClick={voltar}>
                  Cancelar
                </Button>
              </div>
            </Cartao>
          )}

          {(tela.t === "novo" || tela.t === "opcao") && (
            <Formulario
              key={
                tela.t +
                (tela.t === "opcao" ? tela.produto.id : "") +
                (tela.codigo ?? "")
              }
              produto={tela.t === "opcao" ? tela.produto : null}
              codigo={tela.codigo}
              categorias={sessao.categorias}
              aoCategoriaCriada={(c) =>
                setSessao(
                  (s) =>
                    s && {
                      ...s,
                      categorias: [
                        ...s.categorias.filter((x) => x.id !== c.id),
                        c,
                      ].sort((a, b) => a.nome.localeCompare(b.nome)),
                    },
                )
              }
              chamar={chamar}
              aoSalvar={(p, recebidas, novo) => {
                registrar(
                  `${novo ? "Novo" : "Novas opções"}: ${p.nome} (${resumo(p, recebidas)})`,
                );
                setUltimo(p);
                setTela({ t: "salvo", produto: p, recebidas, novo });
              }}
              aoVoltar={voltar}
            />
          )}

          {tela.t === "salvo" && (
            <Salvo
              produto={tela.produto}
              recebidas={tela.recebidas}
              novo={tela.novo}
              chamar={chamar}
              aoAtualizar={(p) => (
                setUltimo(p),
                setTela({ ...tela, produto: p })
              )}
              aoNovaOpcao={() =>
                setTela({ t: "opcao", produto: tela.produto, codigo: null })
              }
            />
          )}
        </main>

        <aside className="flex min-h-0 flex-col gap-2 overflow-auto rounded-lg bg-surface p-4 shadow-sm">
          <p className="font-semibold">Feito agora</p>
          {!feitos.length && (
            <p className="text-sm text-ink-muted">
              O que você cadastrar ou der entrada aparece aqui.
            </p>
          )}
          <ul className="flex flex-col gap-1.5 text-sm">
            {feitos.map((f) => (
              <li
                key={f.quando}
                className="flex justify-between gap-2 border-b border-line pb-1.5"
              >
                <span>{f.texto}</span>
                <span className="num shrink-0 text-ink-muted">
                  {new Date(f.quando).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {impressoras && (
        <DialogoImpressoras aoFechar={() => setImpressoras(false)} />
      )}
    </div>
  );
}

function Fundo({
  inicio,
  children,
}: {
  inicio: Inicio;
  children: React.ReactNode;
}) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 bg-navy-900 p-6 text-white">
      <img
        src="/freguez-logo-horizontal-negativo.svg"
        alt="Freguez"
        width={180}
        height={53}
      />
      <p className="text-navy-100">{inicio.loja.nome}</p>
      {children}
    </main>
  );
}

const Cartao = ({ children }: { children: React.ReactNode }) => (
  <section className="rounded-lg bg-surface p-5 shadow-sm">{children}</section>
);

/** Campo do leitor: o leitor digita o código e manda Enter. Volta o foco sozinho para o próximo bipe. */
function CampoBipar({
  ocupado,
  ativo,
  aoBipar,
}: {
  ocupado: boolean;
  ativo: boolean;
  aoBipar: (c: string) => void;
}) {
  const [valor, setValor] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ativo && !ocupado) ref.current?.focus();
  }, [ativo, ocupado]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoBipar(valor);
        setValor("");
      }}
      className="flex gap-2"
    >
      <input
        ref={ref}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        disabled={ocupado}
        placeholder="Bipe o código de barras (ou digite e aperte Enter)"
        aria-label="Código de barras"
        className="num h-14 flex-1 rounded-lg border-2 border-brand bg-surface px-4 text-xl focus-visible:outline-none"
      />
      <Button
        type="submit"
        className="h-14 px-6"
        disabled={ocupado || !valor.trim()}
      >
        {ocupado ? "Buscando…" : "Buscar"}
      </Button>
    </form>
  );
}

type Chamar = <T>(corpo: Record<string, unknown>) => Promise<T>;

function ProcurarProduto({
  chamar,
  titulo,
  aoEscolher,
}: {
  chamar: Chamar;
  titulo: string;
  aoEscolher: (p: Produto) => void;
}) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Resumo[]>([]);
  const [erro, setErro] = useState<string>();
  useEffect(() => {
    const t = setTimeout(() => {
      chamar<{ produtos: Resumo[] }>({ acao: "procurar", q }).then(
        (r) => setLista(r.produtos),
        (e) => setErro(msg(e)),
      );
    }, 250);
    return () => clearTimeout(t);
  }, [q, chamar]);
  return (
    <div className="mt-5">
      <Rotulo htmlFor="procurar">{titulo}</Rotulo>
      <input
        id="procurar"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nome ou referência"
        className={campo}
      />
      {erro && <Erro>{erro}</Erro>}
      <ul className="mt-2 grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">
        {lista.map((p) => (
          <li key={p.id}>
            <button
              onClick={() =>
                chamar<{ produto: Produto }>({
                  acao: "produto",
                  produtoId: p.id,
                }).then(
                  (r) => aoEscolher(r.produto),
                  (e) => setErro(msg(e)),
                )
              }
              className="flex w-full items-center gap-3 rounded-md border border-line p-2 text-left hover:border-brand hover:bg-navy-50"
            >
              <span className="size-12 shrink-0 overflow-hidden rounded bg-slate-100">
                {p.foto && (
                  <img src={p.foto} alt="" className="size-full object-cover" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.nome}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {p.referencia} · {p.opcoes.join(", ")}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Enter passa para o próximo campo (o leitor de código manda Enter depois de bipar); salvar é no botão. */
function enterAvanca(e: React.KeyboardEvent<HTMLElement>) {
  const alvo = e.target as HTMLElement;
  if (e.key !== "Enter" || alvo.tagName !== "INPUT") return;
  e.preventDefault();
  const campos = [
    ...e.currentTarget.querySelectorAll<HTMLElement>(
      "input:not([type=checkbox]):not([disabled]), select, button[data-proximo]",
    ),
  ];
  campos[campos.indexOf(alvo) + 1]?.focus();
}

/** Código conhecido: entrada de todos os tamanhos/cores do produto de uma vez (o bipado já vem com 1). */
function Entrada({
  produto,
  variacaoId,
  chamar,
  aoFeito,
  aoNovaOpcao,
  aoVoltar,
}: {
  produto: Produto;
  variacaoId: string;
  chamar: Chamar;
  aoFeito: (p: Produto, recebidas: Recebida[]) => void;
  aoNovaOpcao: () => void;
  aoVoltar: () => void;
}) {
  const [qtds, setQtds] = useState<Record<string, string>>({
    [variacaoId]: "1",
  });
  const [custo, setCusto] = useState(0);
  const [erro, setErro] = useState<string>();
  const [indo, setIndo] = useState(false);
  const itens = produto.variacoes
    .map((v) => ({
      variacaoId: v.id,
      quantidade: Math.floor(Number(qtds[v.id] || 0)),
    }))
    .filter((i) => i.quantidade > 0);
  const total = itens.reduce((s, i) => s + i.quantidade, 0);
  const varias = produto.variacoes.length > 1;
  const dar = async () => {
    if (!total) return setErro("Quantas peças chegaram?");
    setIndo(true);
    setErro(undefined);
    try {
      const r = await chamar<{ produto: Produto; recebidas: Recebida[] }>({
        acao: "entradas",
        itens,
        custo: custo || null,
      });
      aoFeito(r.produto, r.recebidas);
    } catch (e) {
      setErro(msg(e));
    } finally {
      setIndo(false);
    }
  };
  const bipada = produto.variacoes.find((x) => x.id === variacaoId);
  return (
    <Cartao>
      <Cabecalho produto={produto} variacao={varias ? undefined : bipada} />
      <p className="mt-3 text-sm text-ink-muted">
        Já cadastrado.{" "}
        {varias
          ? "Diga quantas peças de cada tamanho/cor chegaram (deixe vazio o que não chegou)."
          : "Quantas peças chegaram?"}
      </p>
      <div onKeyDown={enterAvanca}>
        {varias ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-ink-muted">
              <tr>
                <th className="py-1 font-medium">Opção</th>
                <th className="py-1 font-medium">Código</th>
                <th className="py-1 text-right font-medium">Em estoque</th>
                <th className="w-32 py-1 text-right font-medium">Chegaram</th>
              </tr>
            </thead>
            <tbody>
              {produto.variacoes.map((v) => (
                <tr
                  key={v.id}
                  className={cn(
                    "border-t border-line",
                    v.id === variacaoId && "bg-navy-50",
                  )}
                >
                  <td className="py-1.5 pr-2 font-medium">
                    {v.nome}
                    {v.id === variacaoId && (
                      <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-[11px] text-white">
                        bipado
                      </span>
                    )}
                  </td>
                  <td className="num py-1.5 pr-2 text-ink-muted">
                    {v.codigos[0]?.codigo ?? "—"}
                  </td>
                  <td className="num py-1.5 pr-2 text-right">{v.estoque}</td>
                  <td className="py-1.5 text-right">
                    <input
                      aria-label={`Chegaram de ${v.nome}`}
                      autoFocus={v.id === variacaoId}
                      onFocus={(e) => e.target.select()}
                      inputMode="numeric"
                      value={qtds[v.id] ?? ""}
                      onChange={(e) =>
                        setQtds((q) => ({
                          ...q,
                          [v.id]: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      className={cn(
                        campo,
                        "num h-10 w-24 text-right text-lg font-bold",
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mt-2 w-32">
            <Rotulo htmlFor="ent-qtd">Quantidade</Rotulo>
            <input
              id="ent-qtd"
              autoFocus
              onFocus={(e) => e.target.select()}
              inputMode="numeric"
              value={qtds[variacaoId] ?? ""}
              onChange={(e) =>
                setQtds({ [variacaoId]: e.target.value.replace(/\D/g, "") })
              }
              className={cn(campo, "num h-14 text-2xl font-bold")}
            />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-44">
            <Rotulo htmlFor="ent-custo">Custo por peça (opcional)</Rotulo>
            <CampoDinheiro id="ent-custo" valor={custo} aoMudar={setCusto} />
          </div>
          <Button
            data-proximo
            className="h-12 px-6"
            onClick={() => void dar()}
            disabled={indo || !total}
          >
            {indo
              ? "Salvando…"
              : `Dar entrada de ${total} peça${total === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
      {erro && <Erro>{erro}</Erro>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={aoNovaOpcao}>
          Cadastrar outro tamanho/cor deste produto
        </Button>
        <Button variant="ghost" onClick={aoVoltar}>
          Cancelar
        </Button>
      </div>
    </Cartao>
  );
}

function Cabecalho({
  produto,
  variacao,
}: {
  produto: Produto;
  variacao?: Variacao;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="size-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
        {produto.fotos[0] && (
          <img
            src={produto.fotos[0]}
            alt=""
            className="size-full object-cover"
          />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-ink-muted">{produto.referencia}</p>
        <p className="text-xl font-semibold">
          {produto.nome}{" "}
          {variacao && variacao.nome !== "Padrão" && (
            <span className="text-ink-muted">· {variacao.nome}</span>
          )}
        </p>
        {variacao && (
          <p className="num text-sm">
            {formatarDinheiro(variacao.preco)} ·{" "}
            <strong>{variacao.estoque}</strong> em estoque · código{" "}
            {variacao.codigos[0]?.codigo ?? "—"}
          </p>
        )}
        {!variacao && (
          <p className="text-sm text-ink-muted">
            Já tem:{" "}
            {produto.variacoes.map((x) => x.nome).join(", ") || "nenhuma opção"}
          </p>
        )}
      </div>
    </div>
  );
}

/** Categoria: escolhe da lista ou cria uma nova ali mesmo. */
function EscolherCategoria({
  valor,
  aoMudar,
  categorias,
  aoCriada,
  chamar,
}: {
  valor: string;
  aoMudar: (id: string) => void;
  categorias: Categoria[];
  aoCriada: (c: Categoria) => void;
  chamar: Chamar;
}) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string>();
  const [indo, setIndo] = useState(false);
  const criar = async () => {
    if (!nome.trim()) return setErro("Digite o nome.");
    setIndo(true);
    setErro(undefined);
    try {
      const r = await chamar<{ categoria: Categoria }>({
        acao: "categoria",
        nome: nome.trim(),
      });
      aoCriada(r.categoria);
      aoMudar(r.categoria.id);
      setCriando(false);
      setNome("");
    } catch (e) {
      setErro(msg(e));
    } finally {
      setIndo(false);
    }
  };
  if (criando)
    return (
      <div>
        <Rotulo htmlFor="c-cat-nova">Nova categoria</Rotulo>
        <div className="flex gap-2">
          <input
            id="c-cat-nova"
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void criar();
              }
              if (e.key === "Escape") setCriando(false);
            }}
            maxLength={60}
            placeholder="Ex.: Vestidos"
            className={campo}
          />
          <Button
            type="button"
            className="h-11"
            onClick={() => void criar()}
            disabled={indo}
          >
            {indo ? "…" : "Criar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => setCriando(false)}
          >
            Voltar
          </Button>
        </div>
        {erro && <p className="mt-1 text-sm text-danger">{erro}</p>}
      </div>
    );
  return (
    <div>
      <Rotulo htmlFor="c-cat">Categoria</Rotulo>
      <div className="flex gap-2">
        <select
          id="c-cat"
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className={campo}
        >
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="secondary"
          className="h-11 shrink-0"
          onClick={() => setCriando(true)}
        >
          + Nova
        </Button>
      </div>
    </div>
  );
}

type Atributo = { nome: string; valores: string };
const separar = (s: string) => [
  ...new Set(
    s
      .split(/[,;]+/)
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
const chave = (c: Record<string, string>) => nomeVariacao(c).toLowerCase();

/**
 * Produto novo (produto = null) ou mais opções de um produto existente.
 * Tamanhos "P, M, G" e cores "Azul, Preto" viram a grade; cada opção tem a quantidade que chegou e o código (opcional).
 */
function Formulario({
  produto,
  codigo,
  categorias,
  aoCategoriaCriada,
  chamar,
  aoSalvar,
  aoVoltar,
}: {
  produto: Produto | null;
  codigo: string | null;
  categorias: Categoria[];
  aoCategoriaCriada: (c: Categoria) => void;
  chamar: Chamar;
  aoSalvar: (p: Produto, recebidas: Recebida[], novo: boolean) => void;
  aoVoltar: () => void;
}) {
  const base = produto?.variacoes.at(-1);
  const fixos = !!produto?.grade.length;
  const [attrs, setAttrs] = useState<Atributo[]>(
    (fixos ? produto!.grade : ["Tamanho", "Cor"]).map((nome) => ({
      nome,
      valores: "",
    })),
  );
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [site, setSite] = useState(true);
  const [preco, setPreco] = useState(base?.preco ?? 0);
  const [custo, setCusto] = useState(base?.custo ?? 0);
  // Por opção (chave "p / azul"): quantidade, código e se foi tirada da grade
  const [linhas, setLinhas] = useState<
    Record<string, { qtd: string; cod: string; fora?: boolean }>
  >({});
  const [erro, setErro] = useState<string>();
  const [indo, setIndo] = useState(false);

  const existentes = new Set(
    produto?.variacoes.map((v) => chave(v.atributos)) ?? [],
  );
  const combos = combinarGrade(
    attrs.map((a) => ({ nome: a.nome, valores: separar(a.valores) })),
  ).filter((c) => !produto || Object.keys(c).length);
  const opcoes = combos.map((c, i) => {
    const k = chave(c);
    // O código bipado antes de abrir o cadastro vai para a primeira opção
    const l = linhas[k] ?? { qtd: "", cod: i === 0 && codigo ? codigo : "" };
    return {
      k,
      atributos: c,
      nome: nomeVariacao(c),
      ja: existentes.has(k),
      ...l,
    };
  });
  const validas = opcoes.filter((o) => !o.ja && !o.fora);
  const total = validas.reduce((s, o) => s + (Number(o.qtd) || 0), 0);
  const mudar = (
    o: (typeof opcoes)[number],
    m: Partial<{ qtd: string; cod: string; fora: boolean }>,
  ) =>
    setLinhas((x) => ({
      ...x,
      [o.k]: { qtd: o.qtd, cod: o.cod, fora: o.fora, ...m },
    }));

  const salvar = async () => {
    setErro(undefined);
    if (!produto && nome.trim().length < 2)
      return setErro("Informe o nome do produto.");
    if (!preco) return setErro("Informe o preço de venda.");
    if (!validas.length)
      return setErro(
        produto
          ? "Diga o tamanho/cor da opção nova (ex.: Tamanho M)."
          : "Nenhuma opção para salvar.",
      );
    if (validas.length > 100)
      return setErro("Até 100 opções de uma vez. Divida em duas partes.");
    setIndo(true);
    try {
      const r = await chamar<{ produto: Produto; recebidas: Recebida[] }>({
        acao: "salvarGrade",
        produtoId: produto?.id ?? null,
        produto: produto
          ? undefined
          : { nome: nome.trim(), descricao, categoriaId, visivelSite: site },
        preco,
        custo: custo || null,
        opcoes: validas.map((o) => ({
          atributos: o.atributos,
          quantidade: Number(o.qtd) || 0,
          codigo: o.cod.trim() || null,
        })),
      });
      aoSalvar(r.produto, r.recebidas, !produto);
    } catch (e) {
      setErro(msg(e));
    } finally {
      setIndo(false);
    }
  };

  const umaSo =
    opcoes.length === 1 && !Object.keys(opcoes[0]!.atributos).length;

  return (
    <Cartao>
      {produto ? (
        <>
          <p className="mb-2 text-sm font-semibold text-brand">
            Novos tamanhos/cores de
          </p>
          <Cabecalho produto={produto} />
        </>
      ) : (
        <p className="text-lg font-semibold">Produto novo</p>
      )}
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onKeyDown={enterAvanca}
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        {!produto && (
          <>
            <div className="sm:col-span-2">
              <Rotulo htmlFor="c-nome">Nome do produto</Rotulo>
              <input
                id="c-nome"
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                placeholder="Ex.: Camisa polo piquet"
                className={campo}
              />
            </div>
            <EscolherCategoria
              valor={categoriaId}
              aoMudar={setCategoriaId}
              categorias={categorias}
              aoCriada={aoCategoriaCriada}
              chamar={chamar}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={site}
                onChange={(e) => setSite(e.target.checked)}
                className="size-5"
              />
              Mostrar no site da loja
            </label>
          </>
        )}
        <div>
          <Rotulo htmlFor="c-preco">Preço de venda</Rotulo>
          <CampoDinheiro id="c-preco" valor={preco} aoMudar={setPreco} />
        </div>
        <div>
          <Rotulo htmlFor="c-custo">Custo por peça (opcional)</Rotulo>
          <CampoDinheiro id="c-custo" valor={custo} aoMudar={setCusto} />
        </div>

        <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-medium">
            {produto
              ? "Tamanhos/cores novos"
              : "Tamanhos, cores… (separe por vírgula; deixe vazio se o produto não tiver)"}
          </legend>
          {attrs.map((a, i) => (
            <div key={i}>
              {fixos ? (
                <Rotulo htmlFor={`c-a${i}`}>{a.nome}</Rotulo>
              ) : (
                <input
                  aria-label="Nome do atributo"
                  value={a.nome}
                  onChange={(e) =>
                    setAttrs((x) =>
                      x.map((y, j) =>
                        j === i ? { ...y, nome: e.target.value } : y,
                      ),
                    )
                  }
                  className="mb-1 w-full bg-transparent text-sm font-medium focus:outline-none"
                />
              )}
              <input
                id={`c-a${i}`}
                autoFocus={!!produto && i === 0}
                value={a.valores}
                onChange={(e) =>
                  setAttrs((x) =>
                    x.map((y, j) =>
                      j === i ? { ...y, valores: e.target.value } : y,
                    ),
                  )
                }
                placeholder={
                  /tam/i.test(a.nome)
                    ? "P, M, G"
                    : /cor/i.test(a.nome)
                      ? "Azul, Preto, Branco"
                      : "Separe por vírgula"
                }
                className={campo}
              />
            </div>
          ))}
          {attrs.length < 3 && !fixos && (
            <button
              type="button"
              onClick={() => setAttrs((a) => [...a, { nome: "", valores: "" }])}
              className="self-end text-left text-sm font-medium text-brand underline"
            >
              + outro atributo
            </button>
          )}
        </fieldset>

        {/* A grade: uma linha por opção, com a quantidade que chegou e o código */}
        <div className="sm:col-span-2">
          {opcoes.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-1 font-medium">
                    {umaSo ? "" : `Opções (${validas.length})`}
                  </th>
                  <th className="w-28 py-1 font-medium">Chegaram</th>
                  <th className="py-1 font-medium">
                    Código de barras (vazio: o Freguez gera)
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {opcoes.map((o) => (
                  <tr
                    key={o.k}
                    className={cn(
                      "border-t border-line",
                      (o.ja || o.fora) && "text-ink-muted",
                    )}
                  >
                    <td className="py-1.5 pr-2 font-medium">
                      {umaSo ? "Quantidade e código" : o.nome}
                    </td>
                    {o.ja ? (
                      <td colSpan={3} className="py-1.5 text-xs">
                        já cadastrado — bipe o código para dar entrada
                      </td>
                    ) : o.fora ? (
                      <td colSpan={3} className="py-1.5 text-xs">
                        fora da grade ·{" "}
                        <button
                          type="button"
                          className="font-medium text-brand underline"
                          onClick={() => mudar(o, { fora: false })}
                        >
                          incluir de novo
                        </button>
                      </td>
                    ) : (
                      <>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Chegaram de ${o.nome}`}
                            inputMode="numeric"
                            value={o.qtd}
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              mudar(o, {
                                qtd: e.target.value.replace(/\D/g, ""),
                              })
                            }
                            className={cn(
                              campo,
                              "num h-10 w-24 text-right text-lg font-bold",
                            )}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Código de ${o.nome}`}
                            value={o.cod}
                            onChange={(e) =>
                              mudar(o, { cod: e.target.value.trim() })
                            }
                            placeholder="Bipe ou deixe vazio"
                            className={cn(campo, "num h-10")}
                          />
                        </td>
                        <td className="py-1.5 text-right">
                          {!umaSo && (
                            <button
                              type="button"
                              title="Tirar da grade (não tenho esta)"
                              onClick={() => mudar(o, { fora: true })}
                              className="size-8 rounded text-lg text-ink-muted hover:bg-slate-100"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!umaSo && validas.length > 0 && (
            <p className="mt-2 text-sm text-ink-muted">
              {validas.length} opção(ões) ·{" "}
              <strong className="text-ink">{total}</strong> peça(s) no total.
              Opção com 0 fica cadastrada sem estoque.
            </p>
          )}
        </div>

        {!produto && (
          <div className="sm:col-span-2">
            <Rotulo htmlFor="c-desc">
              Descrição (opcional, aparece no site)
            </Rotulo>
            <textarea
              id="c-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={2000}
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-surface p-3 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none"
            />
          </div>
        )}
        {erro && (
          <div className="sm:col-span-2">
            <Erro>{erro}</Erro>
          </div>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            type="submit"
            data-proximo
            className="h-12 px-6"
            disabled={indo}
          >
            {indo
              ? "Salvando…"
              : produto
                ? `Salvar ${validas.length > 1 ? `${validas.length} opções` : "esta opção"}`
                : "Salvar produto"}
          </Button>
          <Button type="button" variant="ghost" onClick={aoVoltar}>
            Cancelar
          </Button>
        </div>
        <p className="text-xs text-ink-muted sm:col-span-2">
          Fotos e etiquetas você faz na próxima tela, depois de salvar.
        </p>
      </form>
    </Cartao>
  );
}

/** Depois de salvar: fotos (câmera ou arquivo), etiquetas de cada opção e o atalho para mais tamanhos. */
function Salvo({
  produto,
  recebidas,
  novo,
  chamar,
  aoAtualizar,
  aoNovaOpcao,
}: {
  produto: Produto;
  recebidas: Recebida[];
  novo: boolean;
  chamar: Chamar;
  aoAtualizar: (p: Produto) => void;
  aoNovaOpcao: () => void;
}) {
  const linhas = recebidas.flatMap((r) => {
    const v = produto.variacoes.find((x) => x.id === r.id);
    return v ? [{ v, quantidade: r.quantidade }] : [];
  });
  const total = linhas.reduce((s, l) => s + l.quantidade, 0);
  const [copias, setCopias] = useState<Record<string, string>>(() =>
    Object.fromEntries(linhas.map((l) => [l.v.id, String(l.quantidade)])),
  );
  const [aviso, setAviso] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [camera, setCamera] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enviarFoto = async (dataUrl: string) => {
    setEnviando(true);
    setErro(undefined);
    try {
      const r = await chamar<{ foto: string }>({
        acao: "foto",
        produtoId: produto.id,
        imagem: dataUrl,
      });
      aoAtualizar({ ...produto, fotos: [...produto.fotos, r.foto] });
    } catch (e) {
      setErro(msg(e));
    } finally {
      setEnviando(false);
    }
  };

  const imprimir = async (quais: { v: Variacao }[]) => {
    setErro(undefined);
    setAviso(undefined);
    try {
      const cfg = await lerConfigImpressao();
      if (!cfg.etiqueta)
        throw new Error(
          "Escolha a impressora de etiquetas no botão “Impressora de etiquetas”, no topo.",
        );
      let soma = 0;
      for (const { v } of quais) {
        const n = Math.min(500, Number(copias[v.id]) || 0);
        if (!n) continue;
        await enviar(
          cfg.etiqueta,
          etiquetaProduto(
            {
              id: v.id,
              sku: v.sku,
              nome: produto.nome,
              nomeCurto: null,
              variacao: v.nome,
              unidade: "UN",
              preco: v.preco,
              precoCheio: v.preco,
              promocao: false,
              codigos: v.codigos.map((c) => c.codigo),
              estoque: v.estoque,
            },
            n,
            cfg,
          ),
          `Etiquetas ${v.sku}`,
        );
        soma += n;
      }
      setAviso(
        soma
          ? `${soma} etiqueta(s) enviada(s) para a impressora.`
          : "Diga quantas etiquetas de cada opção.",
      );
    } catch (e) {
      setErro(msg(e));
    }
  };

  const uma = linhas.length === 1 ? linhas[0]!.v : undefined;

  return (
    <Cartao>
      <p
        className="mb-3 rounded-md bg-success-soft px-3 py-2 font-medium text-success"
        role="status"
      >
        {novo ? "Produto salvo" : "Salvo"}
        {total ? ` · ${total} peça(s) no estoque` : ""}. Pode bipar o próximo.
      </p>
      <Cabecalho produto={produto} variacao={uma} />

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 font-semibold">
            Fotos ({produto.fotos.length} de 8)
          </p>
          <div className="flex flex-wrap gap-2">
            {produto.fotos.map((f) => (
              <img
                key={f}
                src={f}
                alt=""
                className="size-16 rounded-md object-cover"
              />
            ))}
          </div>
          {produto.fotos.length < 8 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setCamera(true)}
                disabled={enviando}
              >
                Tirar foto com a câmera
              </Button>
              <label
                className={cn(
                  "inline-flex h-10 cursor-pointer items-center rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50",
                  enviando && "opacity-50",
                )}
              >
                Escolher arquivo
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={enviando}
                  onChange={async (e) => {
                    const arquivos = [...(e.target.files ?? [])].slice(
                      0,
                      8 - produto.fotos.length,
                    );
                    e.target.value = "";
                    for (const a of arquivos)
                      await enviarFoto(await reduzir(a));
                  }}
                />
              </label>
              {enviando && (
                <span className="self-center text-sm text-ink-muted">
                  Enviando…
                </span>
              )}
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 font-semibold">Etiqueta do Freguez (opcional)</p>
          <p className="mb-2 text-sm text-ink-muted">
            Se preferir, use a etiqueta que já veio no produto: o caixa acha
            pelos dois códigos.
          </p>
          <table className="w-full text-sm">
            <tbody>
              {linhas.map(({ v }) => (
                <tr key={v.id} className="border-t border-line">
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{v.nome}</span>
                    <span className="num block text-xs text-ink-muted">
                      {v.codigos[0]?.codigo}
                    </span>
                  </td>
                  <td className="w-24 py-1.5 pr-2">
                    <input
                      aria-label={`Etiquetas de ${v.nome}`}
                      inputMode="numeric"
                      value={copias[v.id] ?? ""}
                      onChange={(e) =>
                        setCopias((c) => ({
                          ...c,
                          [v.id]: e.target.value.replace(/\D/g, ""),
                        }))
                      }
                      className={cn(campo, "num h-10 text-right")}
                    />
                  </td>
                  {linhas.length > 1 && (
                    <td className="w-24 py-1.5 text-right">
                      <Button
                        variant="ghost"
                        onClick={() => void imprimir([{ v }])}
                        disabled={!noDesktop}
                      >
                        Imprimir
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            className="mt-2"
            variant="secondary"
            onClick={() => void imprimir(linhas)}
            disabled={!noDesktop}
          >
            {linhas.length > 1 ? "Imprimir todas" : "Imprimir etiquetas"}
          </Button>
        </div>
      </div>
      {aviso && <p className="mt-3 text-sm text-success">{aviso}</p>}
      {erro && <Erro>{erro}</Erro>}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button onClick={aoNovaOpcao}>
          Cadastrar mais tamanhos/cores de “{produto.nome}”
        </Button>
      </div>
      {camera && (
        <Camera
          aoFechar={() => setCamera(false)}
          aoCapturar={async (d) => {
            setCamera(false);
            await enviarFoto(d);
          }}
        />
      )}
    </Cartao>
  );
}

/** Câmera do computador (webcam): mostra a imagem e tira a foto. */
function Camera({
  aoFechar,
  aoCapturar,
}: {
  aoFechar: () => void;
  aoCapturar: (dataUrl: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string>();
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      })
      .catch(() =>
        setErro(
          "Não achei a câmera. Confira se está ligada e se o Windows deixou o app usar a câmera.",
        ),
      );
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  return (
    <Dialogo titulo="Tirar foto" aoFechar={aoFechar} largura="max-w-3xl">
      {erro ? (
        <Erro>{erro}</Erro>
      ) : (
        <video
          ref={video}
          playsInline
          muted
          className="aspect-video w-full rounded-md bg-black object-contain"
        />
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
        <Button
          disabled={!!erro}
          onClick={async () =>
            video.current && aoCapturar(await reduzir(video.current))
          }
        >
          Tirar foto
        </Button>
      </div>
    </Dialogo>
  );
}
