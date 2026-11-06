import { formatarCodigoPareamento, normalizarCodigoPareamento } from "@freguez/core";
import { useCallback, useEffect, useState } from "react";
import { aplicarAparencia } from "./aparencia";
import { api, ErroApi, semInternet, token } from "./api";
import { Button, CampoDinheiro, Erro, PinPad, Rotulo } from "./componentes";
import { aberturaGuardada, guardarAbertura, iniciarSincronia } from "./sincronia";
import type { Inicio, ItemCatalogo } from "./tipos";
import { definirTelaCheia, alternarTelaCheia, telaCheiaGuardada } from "./desktop";
import { Cadastro } from "./Cadastro";
import { Totem } from "./Totem";
import { Venda } from "./Venda";

// Build do app Freguez Cadastro (VITE_APP=cadastro): pareia como "cadastro" e só abre esse tipo de dispositivo
const APP_CADASTRO = import.meta.env.VITE_APP === "cadastro";

type Fase = { tipo: "carregando" } | { tipo: "parear"; erro?: string } | { tipo: "erro"; mensagem: string } | { tipo: "pronto"; inicio: Inicio };

export function App() {
  const [fase, setFase] = useState<Fase>({ tipo: "carregando" });
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);

  const carregar = useCallback(async () => {
    if (!token.ler()) return setFase({ tipo: "parear" });
    try {
      const inicio = await api<Inicio>("/pdv/inicio");
      if (APP_CADASTRO && inicio.dispositivo.tipo !== "cadastro") {
        token.apagar();
        return setFase({ tipo: "parear", erro: "Este código é de um caixa ou totem. No Freguez Cadastro, gere no painel um dispositivo do tipo “Cadastro de produtos”, ou entre com a conta do dono." });
      }
      // Totem: só a tela de autoatendimento (sem catálogo, sem PINs, sem fila offline)
      if (inicio.dispositivo.tipo === "totem" || inicio.dispositivo.tipo === "cadastro") return setFase({ tipo: "pronto", inicio });
      const cat = await api<{ itens: ItemCatalogo[] }>("/pdv/catalogo");
      setCatalogo(cat.itens);
      setFase({ tipo: "pronto", inicio });
      await guardarAbertura(inicio, cat.itens);
      iniciarSincronia();
    } catch (e) {
      // Sem internet: abre com o que ficou guardado na última vez (Start Geral 5.4)
      const guardado = semInternet(e) ? await aberturaGuardada() : null;
      if (guardado) {
        setCatalogo(guardado.catalogo);
        setFase({ tipo: "pronto", inicio: guardado.inicio });
        iniciarSincronia();
      } else if (e instanceof ErroApi && e.status === 401) {
        token.apagar();
        setFase({ tipo: "parear", erro: e.message });
      } else setFase({ tipo: "erro", mensagem: e instanceof Error ? e.message : "Erro ao carregar." });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);
  // Tela cheia: abre como ficou da última vez; Ctrl+Shift+F liga e desliga em qualquer tela
  useEffect(() => {
    if (telaCheiaGuardada()) void definirTelaCheia(true, false).catch(() => undefined);
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        void alternarTelaCheia().catch(() => undefined);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  // Totem fica sempre em tela cheia (sem guardar: não muda a escolha do caixa neste computador)
  const ehTotem = fase.tipo === "pronto" && fase.inicio.dispositivo.tipo === "totem";
  useEffect(() => {
    if (ehTotem) void definirTelaCheia(true, false).catch(() => undefined);
  }, [ehTotem]);
  // Cores e logo da loja (Configurações › Caixa e totem, no painel)
  useEffect(() => {
    if (fase.tipo === "pronto") aplicarAparencia(fase.inicio.aparencia);
  }, [fase]);

  if (fase.tipo === "carregando") return <Tela><p className="text-navy-100">Carregando o caixa…</p></Tela>;
  if (fase.tipo === "parear") return <Parear erroInicial={fase.erro} aoParear={carregar} />;
  if (fase.tipo === "erro")
    return (
      <Tela>
        <div className="w-full max-w-md rounded-2xl bg-surface p-6 text-ink">
          <Erro>{fase.mensagem}</Erro>
          <Button className="mt-4 w-full" onClick={() => void carregar()}>
            Tentar de novo
          </Button>
        </div>
      </Tela>
    );
  if (fase.inicio.dispositivo.tipo === "totem") return <Totem inicio={fase.inicio} />;
  if (fase.inicio.dispositivo.tipo === "cadastro") return <Cadastro inicio={fase.inicio} />;
  if (!fase.inicio.sessao) return <AbrirCaixa inicio={fase.inicio} aoAbrir={carregar} />;
  return <Venda inicio={fase.inicio} catalogo={catalogo} recarregar={carregar} />;
}

function Tela({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-8 bg-navy-900 p-6">
      <img src="/freguez-logo-horizontal-negativo.svg" alt="Freguez" width={180} height={53} />
      {children}
    </main>
  );
}

function Parear({ erroInicial, aoParear }: { erroInicial?: string; aoParear: () => void }) {
  const [modo, setModo] = useState<"login" | "codigo">("login");
  const [codigo, setCodigo] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState(APP_CADASTRO ? "Cadastro 01" : "Caixa 01");
  const [erro, setErro] = useState(erroInicial);
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setEnviando(true);
    setErro(undefined);
    try {
      const r =
        modo === "login"
          ? await api<{ token: string }>("/dispositivos/parear-login", { email, senha, nome, tipo: APP_CADASTRO ? "cadastro" : "caixa" })
          : await api<{ token: string }>("/dispositivos/parear", { codigo: normalizarCodigoPareamento(codigo) });
      token.salvar(r.token);
      aoParear();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível parear.");
    } finally {
      setEnviando(false);
    }
  };
  const campo = "h-11 w-full rounded-md border border-slate-300 px-3 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none";
  return (
    <Tela>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 text-ink shadow-lg"
      >
        <h1 className="text-xl font-semibold">{APP_CADASTRO ? "Ligar o Freguez Cadastro à loja" : "Ligar este caixa à loja"}</h1>
        <div className="grid grid-cols-2 gap-2 text-sm" role="tablist">
          {(["login", "codigo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={modo === m ? "rounded-md bg-brand py-2 font-medium text-white" : "rounded-md border border-slate-300 py-2 hover:bg-slate-50"}
            >
              {m === "login" ? "Conta do dono" : "Código do painel"}
            </button>
          ))}
        </div>
        <Erro>{erro}</Erro>
        {modo === "login" ? (
          <>
            <p className="text-sm text-ink-muted">Entre com o e-mail e a senha do dono ou do gerente. Só precisa fazer isso uma vez neste computador.</p>
            <div>
              <Rotulo htmlFor="email">E-mail</Rotulo>
              <input id="email" type="email" autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
            </div>
            <div>
              <Rotulo htmlFor="senha">Senha</Rotulo>
              <input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} />
            </div>
            <div>
              <Rotulo htmlFor="nome">{APP_CADASTRO ? "Nome deste computador" : "Nome deste caixa"}</Rotulo>
              <input id="nome" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} className={campo} />
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted">No painel, vá em Configurações › Dispositivos, gere o código e digite aqui.</p>
            <div>
              <Rotulo htmlFor="codigo">Código de pareamento</Rotulo>
              <input
                id="codigo"
                autoFocus
                autoComplete="off"
                value={formatarCodigoPareamento(normalizarCodigoPareamento(codigo))}
                onChange={(e) => setCodigo(e.target.value)}
                maxLength={9}
                placeholder="ABCD-2345"
                className="num h-14 w-full rounded-md border border-slate-300 text-center font-mono text-2xl tracking-widest uppercase focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none"
              />
            </div>
          </>
        )}
        <Button
          type="submit"
          size="lg"
          disabled={enviando || (modo === "login" ? !email || !senha : normalizarCodigoPareamento(codigo).length !== 8)}
        >
          {enviando ? "Ligando…" : "Ligar caixa"}
        </Button>
        <p className="text-xs text-ink-muted">Depois disso, cada vendedor usa só o PIN de 4 dígitos.</p>
      </form>
    </Tela>
  );
}

function AbrirCaixa({ inicio, aoAbrir }: { inicio: Inicio; aoAbrir: () => void }) {
  const [fundo, setFundo] = useState(0);
  const [pedindoPin, setPedindoPin] = useState(false);
  const [erro, setErro] = useState<string>();
  const abrir = async (pin: string) => {
    try {
      await api("/pdv/caixa", { acao: "abrir", pin, valorCentavos: fundo });
      aoAbrir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir.");
    }
  };
  return (
    <Tela>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-surface p-6 text-ink shadow-lg">
        <div>
          <h1 className="text-xl font-semibold">Abrir caixa</h1>
          <p className="text-sm text-ink-muted">
            {inicio.loja.nome} · {inicio.dispositivo.nome}
          </p>
        </div>
        <div>
          <Rotulo htmlFor="fundo">Fundo de troco (dinheiro na gaveta)</Rotulo>
          <CampoDinheiro id="fundo" valor={fundo} aoMudar={setFundo} grande autoFocus aoEnter={() => setPedindoPin(true)} />
        </div>
        {!pedindoPin && <Erro>{erro}</Erro>}
        <Button size="lg" onClick={() => setPedindoPin(true)}>
          Abrir caixa
        </Button>
        <button
          type="button"
          className="text-xs text-ink-muted underline-offset-4 hover:underline"
          onClick={() => {
            token.apagar();
            location.reload();
          }}
        >
          Desparear este computador
        </button>
      </div>
      {pedindoPin && (
        <PinPad
          titulo="PIN de quem abre o caixa"
          erro={erro}
          aoConfirmar={(pin) => void abrir(pin)}
          aoFechar={() => {
            setPedindoPin(false);
            setErro(undefined);
          }}
        />
      )}
    </Tela>
  );
}
