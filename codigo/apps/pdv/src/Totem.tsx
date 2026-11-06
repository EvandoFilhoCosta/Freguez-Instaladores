// Totem de autoatendimento (Start Geral 4.8). Tela dividida: à esquerda, área branca com as informações
// (parcelas, histórico de compras e pagamentos, QR do Pix, comprovante); à direita, painel azul Freguez com
// os botões (sempre o azul da marca, não a cor da loja). O cliente do crediário consulta quanto deve e paga no Pix
// sem passar no caixa. Dinheiro: gera uma senha para o caixa. Tela de toque, letras grandes, volta ao
// início sozinha. Só funciona com internet (avisa e manda ao caixa).

import { formatarData, formatarDinheiro, soDigitos } from "@freguez/core";
import { cn } from "@freguez/ui";
import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, semInternet } from "./api";
import type { Inicio } from "./tipos";

type Resumo = {
  sessao: string;
  nome: string;
  parcelas: { vencimento: string; valor: number; atrasada: boolean }[];
  emAberto: number;
  atrasado: number;
  ateFimDoMes: number;
  pixAtivo: boolean;
  valorMinimo: number;
  historico?: {
    data: string;
    titulo: string;
    itens: string[];
    total: number;
    crediario: boolean;
    pago: number;
    falta: number;
    situacao: "pago" | "pagando" | "atrasado";
  }[];
  pagamentos?: { data: string; valor: number; forma: string }[];
};

const FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de débito",
  credito: "Cartão de crédito",
  vale: "Vale-troca",
};

type Tela =
  | { t: "inicio" }
  | { t: "cpf"; depois?: "historico" }
  | { t: "confirmar"; cpf: string; depois?: "historico" }
  | { t: "resumo"; r: Resumo }
  | { t: "outro"; r: Resumo }
  | { t: "historico"; r: Resumo }
  | { t: "forma"; r: Resumo; valor: number }
  | {
      t: "pix";
      r: Resumo;
      valor: number;
      id: string;
      qr: string;
      copia: string;
      expiraEm: string;
    }
  | { t: "pago"; valor: number }
  | { t: "senha"; codigo: string; valor: number };

const INATIVO_MS = 60_000;

export function Totem({ inicio }: { inicio: Inicio }) {
  const [tela, setTela] = useState<Tela>({ t: "inicio" });
  const [erro, setErro] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const ultimoToque = useRef(Date.now());
  const [digitos, setDigitos] = useState("");

  const voltar = useCallback(() => {
    setTela({ t: "inicio" });
    setErro(undefined);
  }, []);

  // 60 s sem toque volta ao início (menos enquanto espera o Pix cair)
  useEffect(() => {
    const toque = () => (ultimoToque.current = Date.now());
    window.addEventListener("pointerdown", toque);
    window.addEventListener("keydown", toque);
    const t = setInterval(() => {
      if (
        tela.t !== "inicio" &&
        tela.t !== "pix" &&
        Date.now() - ultimoToque.current > INATIVO_MS
      )
        voltar();
    }, 5000);
    return () => {
      window.removeEventListener("pointerdown", toque);
      window.removeEventListener("keydown", toque);
      clearInterval(t);
    };
  }, [tela.t, voltar]);

  const chamar = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setErro(undefined);
    setOcupado(true);
    try {
      return await fn();
    } catch (e) {
      setErro(
        semInternet(e)
          ? "Sem internet no totem agora. Por favor, vá ao caixa."
          : e instanceof Error
            ? e.message
            : "Algo deu errado.",
      );
      return null;
    } finally {
      setOcupado(false);
    }
  };

  // Pix: consulta a cada 3 s; pago → tela de obrigado; expirou → volta ao resumo
  useEffect(() => {
    if (tela.t !== "pix") return;
    const t = setInterval(async () => {
      const r = await api<{ status: string }>(
        `/totem/pix/${tela.id}?sessao=${encodeURIComponent(tela.r.sessao)}`,
      ).catch(() => null);
      if (r?.status === "paga" || r?.status === "conferir")
        setTela({ t: "pago", valor: tela.valor });
      else if (
        r?.status === "expirada" ||
        r?.status === "cancelada" ||
        Date.parse(tela.expiraEm) < Date.now() - 30_000
      )
        voltar();
    }, 3000);
    return () => clearInterval(t);
  }, [tela, voltar]);

  // Telas finais voltam sozinhas
  useEffect(() => {
    if (tela.t !== "pago" && tela.t !== "senha") return;
    const t = setTimeout(voltar, tela.t === "pago" ? 15_000 : 45_000);
    return () => clearTimeout(t);
  }, [tela.t, voltar]);

  const identificar = async (
    cpf: string,
    confirmacao: string,
    depois?: "historico",
  ) => {
    const r = await chamar(() =>
      api<Resumo>("/totem/identificar", { cpf, confirmacao }),
    );
    if (r)
      setTela(
        depois === "historico" ? { t: "historico", r } : { t: "resumo", r },
      );
  };
  const pagarPix = async (r: Resumo, valor: number) => {
    const c = await chamar(() =>
      api<{ id: string; copiaCola: string; expiraEm: string }>("/totem/pix", {
        sessao: r.sessao,
        valorCentavos: valor,
      }),
    );
    if (c)
      setTela({
        t: "pix",
        r,
        valor,
        id: c.id,
        copia: c.copiaCola,
        expiraEm: c.expiraEm,
        qr: await QRCode.toDataURL(c.copiaCola, { margin: 1, width: 360 }),
      });
  };
  const pagarNoCaixa = async (r: Resumo, valor: number) => {
    const s = await chamar(() =>
      api<{ codigo: string }>("/totem/senha", {
        sessao: r.sessao,
        valorCentavos: valor,
      }),
    );
    if (s) setTela({ t: "senha", codigo: s.codigo, valor });
  };

  const passo =
    tela.t === "cpf"
      ? 1
      : tela.t === "confirmar"
        ? 2
        : ["resumo", "outro", "historico", "forma", "pix"].includes(tela.t)
          ? 3
          : 0;
  const r = "r" in tela ? tela.r : null;

  // Lado esquerdo (branco): o que a pessoa precisa ver. Lado direito (azul Freguez): os botões.
  let esquerda: ReactNode = null;
  let direita: ReactNode = null;

  if (tela.t === "inicio") {
    esquerda = (
      <div className="flex h-full flex-col justify-center">
        <p className="text-sm font-semibold tracking-[0.3em] text-[#e8962e] uppercase">
          Autoatendimento
        </p>
        <h1 className="serifa mt-4 text-6xl leading-[1.04] font-medium text-balance text-[#0f1b2d] xl:text-7xl">
          {inicio.aparencia?.totemTitulo || `Bem-vindo à ${inicio.loja.nome}`}
        </h1>
        <p className="mt-5 max-w-xl text-2xl leading-snug text-[#5b6675]">
          {inicio.aparencia?.totemMensagem ||
            "Veja suas parcelas, suas compras e pague com Pix, sem fila."}
        </p>
        <ol className="mt-12 grid max-w-2xl gap-4 sm:grid-cols-3">
          {[
            ["Digite seu CPF", "Só os números"],
            ["Confirme", "Dia e mês do nascimento"],
            ["Veja e pague", "Pix na hora ou no caixa"],
          ].map(([t, s], i) => (
            <li
              key={t}
              className="rounded-3xl border border-[#e6e9ee] bg-[#f7f8fa] p-5"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-[#1e3a5f] text-lg font-bold text-white">
                {i + 1}
              </span>
              <p className="mt-4 text-xl font-semibold text-[#0f1b2d]">{t}</p>
              <p className="text-base text-[#5b6675]">{s}</p>
            </li>
          ))}
        </ol>
      </div>
    );
    direita = (
      <>
        <Titulo eyebrow="Como posso ajudar?">Escolha uma opção</Titulo>
        <div className="mt-auto flex flex-col gap-4">
          <BotaoAzul
            principal
            onClick={() => setTela({ t: "cpf" })}
            detalhe="Consultar parcelas e pagar"
          >
            Meu crediário
          </BotaoAzul>
          <BotaoAzul
            onClick={() => setTela({ t: "cpf", depois: "historico" })}
            detalhe="Compras e pagamentos, com datas"
          >
            Ver meu extrato
          </BotaoAzul>
        </div>
      </>
    );
  } else if (tela.t === "cpf" || tela.t === "confirmar") {
    const cpf = tela.t === "cpf";
    esquerda = (
      <div className="flex h-full flex-col justify-center">
        <p className="text-sm font-semibold tracking-[0.3em] text-[#e8962e] uppercase">
          Passo {cpf ? 1 : 2} de 3
        </p>
        <h1 className="serifa mt-4 text-6xl font-medium text-[#0f1b2d]">
          {cpf ? "Digite seu CPF" : "Confirme que é você"}
        </h1>
        <p className="mt-4 max-w-xl text-2xl leading-snug text-[#5b6675]">
          {cpf
            ? "Use o teclado ao lado. Seus dados não aparecem na tela."
            : "Dia e mês do seu nascimento (ex.: 0703 para 7 de março) ou os 4 últimos números do seu WhatsApp."}
        </p>
        <Visor digitos={digitos} tamanho={cpf ? 11 : 4} />
        <p className="mt-6 flex items-center gap-2 text-base text-[#8a94a3]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Ninguém além de você vê esses números.
        </p>
      </div>
    );
    direita = (
      <Teclado
        key={tela.t}
        tamanho={cpf ? 11 : 4}
        ocupado={ocupado}
        aoMudar={setDigitos}
        aoConfirmar={(d) =>
          cpf
            ? setTela({ t: "confirmar", cpf: d, depois: tela.depois })
            : void identificar(tela.cpf, d, tela.depois)
        }
        aoVoltar={() =>
          cpf ? voltar() : setTela({ t: "cpf", depois: tela.depois })
        }
      />
    );
  } else if (
    (tela.t === "resumo" || tela.t === "historico" || tela.t === "outro") &&
    r
  ) {
    const proxima = r.parcelas.find((p) => !p.atrasada);
    esquerda =
      tela.t === "historico" ? (
        <Historico r={r} />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <p className="text-xl text-[#5b6675]">Olá,</p>
          <h1 className="serifa text-6xl font-medium text-[#0f1b2d]">
            {r.nome}
          </h1>
          {!r.emAberto ? (
            <div className="mt-8 rounded-3xl bg-[#eef7f1] p-8">
              <p className="serifa text-4xl text-[#1f6b45]">
                Você não tem nada em aberto.
              </p>
              <p className="mt-2 text-xl text-[#3d6b52]">
                Obrigado por comprar com a gente!
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 grid grid-cols-3 gap-4">
                <Numero rotulo="Total em aberto" valor={r.emAberto} forte />
                <Numero
                  rotulo="Vencido"
                  valor={r.atrasado}
                  alerta={r.atrasado > 0}
                />
                <Numero
                  rotulo={
                    proxima
                      ? `Próxima · ${formatarData(proxima.vencimento).slice(0, 5)}`
                      : "Próxima"
                  }
                  valor={proxima?.valor ?? 0}
                />
              </div>
              <p className="mt-8 mb-2 text-sm font-semibold tracking-[0.2em] text-[#8a94a3] uppercase">
                Suas parcelas
              </p>
              <ul className="num min-h-0 flex-1 divide-y divide-[#eef0f3] overflow-auto rounded-3xl border border-[#e6e9ee] text-xl">
                {r.parcelas.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between px-6 py-4"
                  >
                    <span className="flex items-center gap-4">
                      <span className="text-[#0f1b2d]">
                        {formatarData(p.vencimento)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-sm font-semibold",
                          p.atrasada
                            ? "bg-[#fdecec] text-[#b42318]"
                            : "bg-[#eef3f9] text-[#1e3a5f]",
                        )}
                      >
                        {p.atrasada ? "Vencida" : "A vencer"}
                      </span>
                    </span>
                    <span className="font-semibold text-[#0f1b2d]">
                      {formatarDinheiro(p.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      );
    direita =
      tela.t === "outro" ? (
        <OutroValor
          r={r}
          aoEscolher={(v) => setTela({ t: "forma", r, valor: v })}
          aoVoltar={() => setTela({ t: "resumo", r })}
        />
      ) : (
        <>
          <Titulo eyebrow={tela.t === "historico" ? "Extrato" : "Pagar"}>
            {r.emAberto ? "Quanto você quer pagar?" : "Tudo em dia"}
          </Titulo>
          <div className="mt-6 flex flex-col gap-3">
            {r.emAberto > 0 && (
              <>
                {r.atrasado > 0 && r.atrasado < r.emAberto && (
                  <BotaoAzul
                    valor={r.atrasado}
                    onClick={() =>
                      setTela({ t: "forma", r, valor: r.atrasado })
                    }
                  >
                    Só as vencidas
                  </BotaoAzul>
                )}
                {r.ateFimDoMes > r.atrasado && r.ateFimDoMes < r.emAberto && (
                  <BotaoAzul
                    valor={r.ateFimDoMes}
                    onClick={() =>
                      setTela({ t: "forma", r, valor: r.ateFimDoMes })
                    }
                  >
                    Até o fim do mês
                  </BotaoAzul>
                )}
                <BotaoAzul
                  principal
                  valor={r.emAberto}
                  onClick={() => setTela({ t: "forma", r, valor: r.emAberto })}
                >
                  Quitar tudo
                </BotaoAzul>
                <BotaoAzul onClick={() => setTela({ t: "outro", r })}>
                  Outro valor
                </BotaoAzul>
              </>
            )}
          </div>
          <div className="mt-auto flex flex-col gap-3 pt-6">
            <BotaoAzul
              fraco
              onClick={() =>
                setTela(
                  tela.t === "historico"
                    ? { t: "resumo", r }
                    : { t: "historico", r },
                )
              }
            >
              {tela.t === "historico"
                ? "Ver minhas parcelas"
                : "Ver meu extrato"}
            </BotaoAzul>
            <BotaoAzul fraco onClick={voltar}>
              Sair
            </BotaoAzul>
          </div>
        </>
      );
  } else if (tela.t === "forma") {
    // Parcelas que esse valor cobre (da mais antiga para a mais nova)
    let resta = tela.valor;
    const cobre = tela.r.parcelas.filter((p) => {
      if (resta <= 0) return false;
      resta -= p.valor;
      return true;
    });
    esquerda = (
      <div className="flex h-full flex-col justify-center">
        <p className="text-xl text-[#5b6675]">Você vai pagar</p>
        <p className="num serifa text-8xl font-medium text-[#0f1b2d]">
          {formatarDinheiro(tela.valor)}
        </p>
        {cobre.length > 0 && (
          <>
            <p className="mt-10 mb-2 text-sm font-semibold tracking-[0.2em] text-[#8a94a3] uppercase">
              Isso paga
            </p>
            <ul className="num divide-y divide-[#eef0f3] rounded-3xl border border-[#e6e9ee] text-xl">
              {cobre.map((p, i) => (
                <li
                  key={i}
                  className="flex justify-between px-6 py-4 text-[#0f1b2d]"
                >
                  <span>Parcela de {formatarData(p.vencimento)}</span>
                  <span>
                    {i === cobre.length - 1 && resta < 0
                      ? `parte (${formatarDinheiro(p.valor + resta)})`
                      : formatarDinheiro(p.valor)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
    direita = (
      <>
        <Titulo eyebrow="Pagamento">Como quer pagar?</Titulo>
        <div className="mt-auto flex flex-col gap-4">
          {tela.r.pixAtivo && (
            <BotaoAzul
              principal
              disabled={ocupado}
              onClick={() => void pagarPix(tela.r, tela.valor)}
              detalhe="Cai na hora, sem fila"
            >
              {ocupado ? "Gerando o Pix…" : "Pix aqui no totem"}
            </BotaoAzul>
          )}
          <BotaoAzul
            disabled={ocupado}
            onClick={() => void pagarNoCaixa(tela.r, tela.valor)}
            detalhe="Você recebe uma senha"
          >
            Dinheiro ou cartão no caixa
          </BotaoAzul>
          <BotaoAzul fraco onClick={() => setTela({ t: "resumo", r: tela.r })}>
            Voltar
          </BotaoAzul>
        </div>
      </>
    );
  } else if (tela.t === "pix") {
    esquerda = (
      <div className="flex h-full items-center gap-12">
        <img
          src={tela.qr}
          alt="QR Code do Pix"
          width={400}
          height={400}
          className="rounded-3xl border border-[#e6e9ee] p-4"
        />
        <ol className="flex flex-col gap-5 text-2xl text-[#0f1b2d]">
          {[
            "Abra o app do seu banco",
            "Escolha Pix › Ler QR Code",
            "Aponte a câmera para o código",
            "Confirme o pagamento",
          ].map((x, i) => (
            <li key={x} className="flex items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1e3a5f] text-lg font-bold text-white">
                {i + 1}
              </span>
              {x}
            </li>
          ))}
        </ol>
      </div>
    );
    direita = (
      <>
        <Titulo eyebrow="Pix">{formatarDinheiro(tela.valor)}</Titulo>
        <div className="mt-8">
          <Contagem ate={tela.expiraEm} />
        </div>
        <p className="mt-6 text-lg text-white/70">
          Assim que o banco confirmar, esta tela muda sozinha. Se não mudar,
          mostre o comprovante no caixa.
        </p>
        <div className="mt-auto">
          <BotaoAzul fraco onClick={voltar}>
            Cancelar
          </BotaoAzul>
        </div>
      </>
    );
  } else if (tela.t === "pago") {
    esquerda = (
      <Comprovante titulo="Pagamento confirmado" valor={tela.valor}>
        Já baixado no seu crediário. O recibo chega no seu WhatsApp.
      </Comprovante>
    );
    direita = (
      <>
        <Titulo eyebrow="Pronto">Obrigado!</Titulo>
        <div className="mt-auto">
          <BotaoAzul principal onClick={voltar}>
            Concluir
          </BotaoAzul>
        </div>
      </>
    );
  } else if (tela.t === "senha") {
    esquerda = (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="text-2xl text-[#5b6675]">Mostre esta senha no caixa</p>
        <p className="num mt-6 rounded-[2rem] border-2 border-dashed border-[#c8d1dc] px-16 py-10 font-mono text-9xl font-extrabold tracking-[0.2em] text-[#0f1b2d]">
          {tela.codigo}
        </p>
        <p className="num serifa mt-8 text-5xl text-[#0f1b2d]">
          {formatarDinheiro(tela.valor)}
        </p>
        <p className="mt-2 text-xl text-[#5b6675]">Vale por 30 minutos.</p>
      </div>
    );
    direita = (
      <>
        <Titulo eyebrow="Pagar no caixa">Senha gerada</Titulo>
        <p className="mt-6 text-xl text-white/75">
          O caixa digita a senha e recebe em dinheiro ou cartão. O valor sai do
          seu crediário na hora.
        </p>
        <div className="mt-auto">
          <BotaoAzul principal onClick={voltar}>
            Concluir
          </BotaoAzul>
        </div>
      </>
    );
  }

  return (
    <main className="totem grid h-full grid-cols-[1.45fr_1fr] overflow-hidden select-none">
      {/* Esquerda: área branca de informação */}
      <section className="flex min-h-0 flex-col bg-white px-14 pt-10 pb-8 text-[#0f1b2d]">
        <header className="flex items-center justify-between">
          {inicio.aparencia?.logo ? (
            <img
              src={inicio.aparencia.logo}
              alt={inicio.loja.nome}
              className="h-14 w-auto max-w-64 object-contain"
            />
          ) : (
            <span className="serifa text-4xl font-medium">
              {inicio.loja.nome}
            </span>
          )}
          <Relogio />
        </header>
        <div
          key={tela.t + ("r" in tela ? "" : "")}
          className="totem-surgir min-h-0 flex-1 py-10"
        >
          {erro && (
            <p
              role="alert"
              className="mb-6 rounded-2xl bg-[#fdecec] px-6 py-4 text-xl text-[#b42318]"
            >
              {erro}
            </p>
          )}
          {esquerda}
        </div>
        <footer className="flex items-center justify-between text-sm text-[#8a94a3]">
          <span>{inicio.loja.nome}</span>
          <span>Precisa de ajuda? Fale com o caixa.</span>
        </footer>
      </section>

      {/* Direita: painel azul Freguez com as ações */}
      <aside className="totem-azul relative flex min-h-0 flex-col px-12 pt-10 pb-10 text-white">
        <div className="flex items-center justify-between">
          <img
            src="/freguez-logo-horizontal-negativo.svg"
            alt="Freguez"
            width={120}
            height={35}
          />
          {passo > 0 && <Passos atual={passo} />}
        </div>
        <div
          key={tela.t}
          className="totem-surgir mt-10 flex min-h-0 flex-1 flex-col"
        >
          {direita}
        </div>
      </aside>
    </main>
  );
}

function Titulo({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-semibold tracking-[0.3em] text-[#f0b663] uppercase">
        {eyebrow}
      </p>
      <h2 className="serifa mt-3 text-5xl leading-tight font-medium">
        {children}
      </h2>
    </div>
  );
}

function BotaoAzul({
  children,
  onClick,
  principal,
  fraco,
  valor,
  detalhe,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  principal?: boolean;
  fraco?: boolean;
  valor?: number;
  detalhe?: string;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-3xl px-7 text-left transition active:scale-[0.99] disabled:opacity-50",
        fraco
          ? "min-h-16 text-xl text-white/85 ring-1 ring-white/25 hover:bg-white/5"
          : "min-h-24",
        principal
          ? "totem-botao-principal"
          : !fraco && "bg-white/10 ring-1 ring-white/20 hover:bg-white/15",
      )}
    >
      <span>
        <span
          className={cn("block font-semibold", fraco ? "text-xl" : "text-2xl")}
        >
          {children}
        </span>
        {detalhe && (
          <span
            className={cn(
              "block text-base",
              principal ? "text-[#0f1b2d]/65" : "text-white/65",
            )}
          >
            {detalhe}
          </span>
        )}
      </span>
      {valor != null ? (
        <span className="num serifa shrink-0 text-3xl">
          {formatarDinheiro(valor)}
        </span>
      ) : (
        !fraco && <span className="text-3xl opacity-60">›</span>
      )}
    </button>
  );
}

function Numero({
  rotulo,
  valor,
  forte,
  alerta,
}: {
  rotulo: string;
  valor: number;
  forte?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl p-5",
        forte
          ? "bg-[#1e3a5f] text-white"
          : alerta
            ? "bg-[#fdecec] text-[#b42318]"
            : "bg-[#f4f6f9] text-[#0f1b2d]",
      )}
    >
      <p
        className={cn(
          "text-sm font-semibold",
          forte ? "text-white/70" : "opacity-70",
        )}
      >
        {rotulo}
      </p>
      <p className="num serifa mt-1 text-4xl">{formatarDinheiro(valor)}</p>
    </div>
  );
}

type Lancamento = {
  data: string;
  tipo: "compra" | "pagamento" | "avista";
  titulo: string;
  detalhe: string;
  valor: number;
  situacao?: "pago" | "pagando" | "atrasado";
  saldo: number | null;
};

/** Junta compras e pagamentos numa linha do tempo e calcula o saldo depois de cada lançamento (de hoje para trás). */
function lancamentos(r: Resumo): Lancamento[] {
  const lista: Omit<Lancamento, "saldo">[] = [
    ...(r.historico ?? []).map((h) => ({
      data: h.data,
      tipo: h.crediario ? ("compra" as const) : ("avista" as const),
      titulo: h.crediario
        ? `${h.titulo} · crediário`
        : `${h.titulo} · paga na hora`,
      detalhe: h.itens.join(" · "),
      valor: h.total,
      situacao: h.crediario ? h.situacao : undefined,
    })),
    ...(r.pagamentos ?? []).map((p) => ({
      data: p.data,
      tipo: "pagamento" as const,
      titulo: "Pagamento do crediário",
      detalhe: FORMA[p.forma] ?? p.forma,
      valor: p.valor,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data));
  let saldo = r.emAberto;
  return lista.map((l) => {
    const depois = saldo;
    if (l.tipo === "compra") saldo -= l.valor;
    if (l.tipo === "pagamento") saldo += l.valor;
    // Saldo que não fecha (renegociação, compra fora dos 12 meses): não mostra em vez de mostrar errado
    return { ...l, saldo: l.tipo === "avista" || depois < 0 ? null : depois };
  });
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Extrato na área branca: um lançamento abaixo do outro, por mês. Verde = pagamento, vermelho = compra no crediário. */
function Historico({ r }: { r: Resumo }) {
  const itens = lancamentos(r);
  const grupos: [string, Lancamento[]][] = [];
  for (const l of itens) {
    const d = new Date(l.data);
    const mes = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
    const g = grupos.at(-1);
    if (g && g[0] === mes) g[1].push(l);
    else grupos.push([mes, [l]]);
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xl text-[#5b6675]">{r.nome}, últimos 12 meses</p>
          <h1 className="serifa text-5xl font-medium text-[#0f1b2d]">
            Seu extrato
          </h1>
        </div>
        <div className="rounded-3xl bg-[#1e3a5f] px-6 py-4 text-right text-white">
          <p className="text-sm text-white/70">Saldo devedor hoje</p>
          <p className="num serifa text-4xl">{formatarDinheiro(r.emAberto)}</p>
        </div>
      </div>
      <div className="mt-5 flex gap-5 text-base text-[#5b6675]">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#1f8a4c]" /> Pagamento
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#c4321f]" /> Compra no
          crediário
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#9aa3af]" /> Compra paga na
          hora
        </span>
      </div>
      {!itens.length ? (
        <p className="mt-6 rounded-3xl bg-[#f4f6f9] p-8 text-xl text-[#5b6675]">
          Nenhuma compra ou pagamento no último ano.
        </p>
      ) : (
        <div className="mt-5 min-h-0 flex-1 overflow-auto rounded-3xl border border-[#e6e9ee]">
          {grupos.map(([mes, ls]) => (
            <section key={mes}>
              <p className="sticky top-0 z-10 border-b border-[#eef0f3] bg-[#f7f8fa]/95 px-6 py-2.5 text-sm font-semibold tracking-[0.15em] text-[#5b6675] uppercase backdrop-blur">
                {mes}
              </p>
              <ul className="divide-y divide-[#eef0f3]">
                {ls.map((l, i) => {
                  const pag = l.tipo === "pagamento";
                  const comp = l.tipo === "compra";
                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex items-center gap-5 px-6 py-4",
                        pag && "bg-[#f3faf6]",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-12 shrink-0 items-center justify-center rounded-2xl",
                          pag
                            ? "bg-[#dff3e7] text-[#1f8a4c]"
                            : comp
                              ? "bg-[#fbe7e4] text-[#c4321f]"
                              : "bg-[#eef0f3] text-[#6b7480]",
                        )}
                      >
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          {pag ? (
                            <path d="M12 19V5M5 12l7-7 7 7" />
                          ) : (
                            <path d="M12 5v14M5 12l7 7 7-7" />
                          )}
                        </svg>
                      </span>
                      <span className="num w-16 shrink-0 text-center leading-tight text-[#5b6675]">
                        <span className="block text-2xl font-semibold text-[#0f1b2d]">
                          {new Date(l.data).getDate()}
                        </span>
                        <span className="text-sm">
                          {MESES[new Date(l.data).getMonth()]!.slice(
                            0,
                            3,
                          ).toLowerCase()}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xl font-semibold text-[#0f1b2d]">
                            {l.titulo}
                          </span>
                          {l.situacao && (
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                SITUACAO_CLARA[l.situacao][1],
                              )}
                            >
                              {SITUACAO_CLARA[l.situacao][0]}
                            </span>
                          )}
                        </span>
                        {l.detalhe && (
                          <span className="block truncate text-base text-[#5b6675]">
                            {l.detalhe}
                          </span>
                        )}
                      </span>
                      <span className="num shrink-0 text-right">
                        <span
                          className={cn(
                            "block text-2xl font-semibold",
                            pag
                              ? "text-[#1f8a4c]"
                              : comp
                                ? "text-[#c4321f]"
                                : "text-[#6b7480]",
                          )}
                        >
                          {pag ? "+ " : comp ? "− " : ""}
                          {formatarDinheiro(l.valor)}
                        </span>
                        {l.saldo != null && (
                          <span className="text-sm text-[#8a94a3]">
                            saldo {formatarDinheiro(l.saldo)}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const SITUACAO_CLARA = {
  pago: ["Pago", "bg-[#eef7f1] text-[#1f6b45]"],
  pagando: ["Pagando", "bg-[#fdf6ec] text-[#9a5a0c]"],
  atrasado: ["Com parcela vencida", "bg-[#fdecec] text-[#b42318]"],
} as const;

function Comprovante({
  titulo,
  valor,
  children,
}: {
  titulo: string;
  valor: number;
  children: ReactNode;
}) {
  const agora = new Date();
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-xl rounded-[2rem] border border-[#e6e9ee] p-10 text-center shadow-[0_30px_60px_-30px_rgb(15_27_45/0.25)]">
        <span className="mx-auto flex size-24 items-center justify-center rounded-full bg-[#eef7f1] text-[#1f6b45]">
          <svg
            width="52"
            height="52"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path className="totem-check" d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <p className="serifa mt-6 text-5xl font-medium">{titulo}</p>
        <p className="num serifa mt-4 text-6xl">{formatarDinheiro(valor)}</p>
        <p className="num mt-2 text-lg text-[#8a94a3]">
          {agora.toLocaleDateString("pt-BR")} às{" "}
          {agora.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        <p className="mt-6 text-xl text-[#5b6675]">{children}</p>
      </div>
    </div>
  );
}

/** Hora e data (o totem fica ligado o dia todo). */
function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right leading-tight">
      <p className="num text-3xl font-semibold text-[#0f1b2d]">
        {agora.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <p className="text-sm text-[#8a94a3]">
        {agora
          .toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
          .replace(/^./, (c) => c.toUpperCase())}
      </p>
    </div>
  );
}

function Passos({ atual }: { atual: number }) {
  return (
    <ol
      className="flex items-center gap-2 text-sm"
      aria-label={`Passo ${atual} de 3`}
    >
      {[1, 2, 3].map((i) => (
        <li
          key={i}
          className={cn(
            "h-2 rounded-full transition-all",
            i === atual
              ? "w-10 bg-[#f0b663]"
              : i < atual
                ? "w-5 bg-white/70"
                : "w-5 bg-white/25",
          )}
        />
      ))}
    </ol>
  );
}

/** Tempo que falta para o Pix vencer. */
function Contagem({ ate }: { ate: string }) {
  const fim = Date.parse(ate);
  const [agora, setAgora] = useState(Date.now());
  const total = useRef(Math.max(1, fim - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const resta = Math.max(0, fim - agora);
  const m = Math.floor(resta / 60_000);
  const s = Math.floor((resta % 60_000) / 1000);
  return (
    <div className="rounded-3xl bg-white/10 px-6 py-5 ring-1 ring-white/20">
      <div className="flex items-center justify-between text-xl">
        <span className="flex items-center gap-3 text-white/85">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#f0b663] opacity-60" />
            <span className="relative inline-flex size-3 rounded-full bg-[#f0b663]" />
          </span>
          Esperando o pagamento
        </span>
        <span className="num text-2xl font-semibold">
          {m}:{String(s).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-[#f0b663] transition-[width] duration-1000 ease-linear"
          style={{ width: `${(resta / total.current) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Mostra o que foi digitado: CPF formatado ou 4 bolinhas (confirmação). */
function Visor({ digitos, tamanho }: { digitos: string; tamanho: number }) {
  if (tamanho === 4)
    return (
      <div className="mt-10 flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "flex size-20 items-center justify-center rounded-3xl text-4xl font-bold",
              i < digitos.length
                ? "bg-[#1e3a5f] text-white"
                : "border-2 border-[#dfe4ea]",
              i === digitos.length && "border-[#e8962e]",
            )}
          >
            {digitos[i] ? "•" : ""}
          </span>
        ))}
      </div>
    );
  const f = digitos.replace(
    /(\d{3})(\d{3})?(\d{3})?(\d{2})?/,
    (_, a, b, c, e) => [a, b, c].filter(Boolean).join(".") + (e ? `-${e}` : ""),
  );
  return (
    <p
      className={cn(
        "num mt-10 rounded-3xl border-2 border-[#dfe4ea] px-8 py-6 font-mono text-6xl tracking-wider",
        digitos ? "text-[#0f1b2d]" : "text-[#c8d1dc]",
      )}
    >
      {digitos ? f : "000.000.000-00"}
    </p>
  );
}

/** Teclado no painel azul. Também aceita teclado físico. */
function Teclado({
  tamanho,
  ocupado,
  aoMudar,
  aoConfirmar,
  aoVoltar,
}: {
  tamanho: number;
  ocupado?: boolean;
  aoMudar: (d: string) => void;
  aoConfirmar: (d: string) => void;
  aoVoltar: () => void;
}) {
  const [d, setD] = useState("");
  const max = tamanho; // CPF: 11 números; confirmação: 4. Não aceita um a mais.
  const ok = d.length === tamanho;
  useEffect(() => aoMudar(soDigitos(d)), [d, aoMudar]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setD((x) => (x + e.key).slice(0, max));
      if (e.key === "Backspace") setD((x) => x.slice(0, -1));
      if (e.key === "Enter" && ok) aoConfirmar(d);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });
  const tecla =
    "num h-24 rounded-3xl text-4xl font-medium transition active:scale-95";
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <button
            key={n}
            onClick={() => setD((x) => (x + n).slice(0, max))}
            className={cn(
              tecla,
              "bg-white/10 ring-1 ring-white/20 active:bg-white/25",
            )}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => setD((x) => x.slice(0, -1))}
          className={cn(tecla, "text-3xl text-white/75")}
          aria-label="Apagar"
        >
          ⌫
        </button>
        <button
          onClick={() => setD((x) => (x + "0").slice(0, max))}
          className={cn(
            tecla,
            "bg-white/10 ring-1 ring-white/20 active:bg-white/25",
          )}
        >
          0
        </button>
        <button
          disabled={!ok || ocupado}
          onClick={() => aoConfirmar(d)}
          className={cn(
            tecla,
            "totem-botao-principal text-2xl font-bold disabled:opacity-35",
          )}
        >
          {ocupado ? "…" : "OK"}
        </button>
      </div>
      <div className="mt-auto pt-6">
        <BotaoAzul fraco onClick={aoVoltar}>
          ‹ Voltar
        </BotaoAzul>
      </div>
    </div>
  );
}

function OutroValor({
  r,
  aoEscolher,
  aoVoltar,
}: {
  r: Resumo;
  aoEscolher: (v: number) => void;
  aoVoltar: () => void;
}) {
  const [c, setC] = useState(0);
  const valido =
    c > 0 && c <= r.emAberto && (c >= r.valorMinimo || c === r.emAberto);
  const tecla =
    "num h-20 rounded-3xl text-3xl font-medium transition active:scale-95";
  return (
    <div className="flex h-full flex-col">
      <p className="text-lg text-white/70">Quanto quer pagar?</p>
      <p className="num serifa text-6xl">{formatarDinheiro(c)}</p>
      <p className="mt-1 mb-5 text-base text-white/60">
        Mínimo {formatarDinheiro(r.valorMinimo)} · em aberto{" "}
        {formatarDinheiro(r.emAberto)}
      </p>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map(
          (k) => (
            <button
              key={k}
              disabled={k === "OK" && !valido}
              onClick={() =>
                k === "OK"
                  ? aoEscolher(c)
                  : k === "⌫"
                    ? setC((x) => Math.floor(x / 10))
                    : setC((x) => Math.min(x * 10 + Number(k), 99_999_999))
              }
              className={cn(
                tecla,
                k === "OK"
                  ? "totem-botao-principal font-bold disabled:opacity-35"
                  : k === "⌫"
                    ? "text-white/75"
                    : "bg-white/10 ring-1 ring-white/20 active:bg-white/25",
              )}
            >
              {k}
            </button>
          ),
        )}
      </div>
      <div className="mt-auto pt-6">
        <BotaoAzul fraco onClick={aoVoltar}>
          ‹ Voltar
        </BotaoAzul>
      </div>
    </div>
  );
}
