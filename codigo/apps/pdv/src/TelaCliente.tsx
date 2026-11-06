import { formatarDinheiro } from "@freguez/core";
import { useEffect, useState } from "react";
import { aplicarAparencia } from "./aparencia";
import { ouvirTela, type EstadoTela, type ItemTela } from "./canalTela";

/** Segunda tela (monitor virado para o cliente): acompanha a venda do caixa. */
export function TelaCliente() {
  const [e, setE] = useState<EstadoTela | null>(null);
  useEffect(() => ouvirTela(setE), []);
  useEffect(() => {
    if (e) aplicarAparencia({ corPrimaria: e.corPrimaria, corDestaque: e.corDestaque, logo: e.logo, totemTitulo: "", totemMensagem: "" });
  }, [e?.corPrimaria, e?.corDestaque]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!e || e.fase === "livre" || (!e.itens.length && e.fase !== "concluida")) return <Livre e={e} />;
  if (e.fase === "concluida") return <Obrigado e={e} />;
  return <Compra e={e} />;
}

function Marca({ e, claro }: { e: EstadoTela | null; claro?: boolean }) {
  if (e?.logo) return <img src={e.logo} alt={e.loja} className={`max-h-24 max-w-72 object-contain ${claro ? "rounded-2xl bg-white px-5 py-3" : ""}`} />;
  return <p className="text-5xl font-extrabold tracking-tight">{e?.loja ?? "Bem-vindo"}</p>;
}

function Livre({ e }: { e: EstadoTela | null }) {
  return (
    <main className="relative flex h-full flex-col items-center justify-center gap-8 overflow-hidden bg-navy-950 p-10 text-center text-white">
      <div className="pointer-events-none absolute -top-40 -right-40 size-[34rem] rounded-full bg-navy-700/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-32 size-[30rem] rounded-full bg-amber-500/15 blur-3xl" />
      <div className="tc-entra relative flex flex-col items-center gap-6">
        <Marca e={e} claro />
        <p className="max-w-3xl text-3xl font-medium text-white/80">{e?.mensagem || "Obrigado pela preferência"}</p>
      </div>
    </main>
  );
}

function Foto({ i, grande }: { i: ItemTela; grande?: boolean }) {
  const [erro, setErro] = useState(false);
  const tam = grande ? "size-56" : "size-16";
  if (!i.foto || erro) {
    return <div className={`${tam} flex shrink-0 items-center justify-center rounded-2xl bg-navy-100 font-extrabold text-navy-700 ${grande ? "text-7xl" : "text-2xl"}`}>{i.nome.trim()[0]?.toUpperCase()}</div>;
  }
  return <img src={i.foto} alt="" onError={() => setErro(true)} className={`${tam} shrink-0 rounded-2xl bg-white object-cover ring-1 ring-line`} />;
}

function Compra({ e }: { e: EstadoTela }) {
  const ultimo = e.itens[e.itens.length - 1]!;
  const pecas = e.itens.reduce((t, i) => t + i.quantidade, 0);
  const pagando = e.fase === "pagamento";
  return (
    <main className="grid h-full grid-cols-[1.35fr_1fr] gap-6 bg-canvas p-6">
      <section className="flex min-h-0 flex-col gap-5">
        <header className="flex items-center justify-between">
          {e.logo ? <img src={e.logo} alt={e.loja} className="h-12 max-w-56 object-contain" /> : <p className="text-2xl font-extrabold text-navy-900">{e.loja}</p>}
          <p className="text-lg text-ink-muted">
            {pecas} {pecas === 1 ? "peça" : "peças"}
          </p>
        </header>
        {!pagando && (
          <div key={`${e.itens.length}-${ultimo.nome}-${ultimo.quantidade}`} className="tc-entra flex items-center gap-7 rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-line">
            <Foto i={ultimo} grande />
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-widest text-amber-600 uppercase">Acabou de entrar</p>
              <p className="mt-2 text-4xl leading-tight font-extrabold text-navy-950">{ultimo.nome}</p>
              {ultimo.variacao !== "Padrão" && <p className="mt-1 text-2xl text-ink-muted">{ultimo.variacao}</p>}
              <p className="num mt-4 text-5xl font-extrabold text-navy-800">{formatarDinheiro(ultimo.preco)}</p>
              {ultimo.quantidade > 1 && <p className="num mt-1 text-xl text-ink-muted">{ultimo.quantidade} × · {formatarDinheiro(ultimo.total)}</p>}
            </div>
          </div>
        )}
        <ul className="min-h-0 flex-1 divide-y divide-line overflow-auto rounded-3xl bg-surface px-5 ring-1 ring-line">
          {[...e.itens].reverse().map((i, k) => (
            <li key={e.itens.length - k} className="flex items-center gap-4 py-3 text-xl">
              <Foto i={i} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{i.nome}</span>
                <span className="num text-base text-ink-muted">
                  {i.variacao !== "Padrão" ? `${i.variacao} · ` : ""}
                  {i.quantidade} × {formatarDinheiro(i.preco)}
                  {i.desconto > 0 && <span className="text-warning"> · -{formatarDinheiro(i.desconto)}</span>}
                </span>
              </span>
              <span className="num font-bold">{formatarDinheiro(i.total)}</span>
            </li>
          ))}
        </ul>
      </section>
      <aside className="flex flex-col justify-center gap-6 rounded-3xl bg-navy-950 p-10 text-white">
        {pagando && <p className="tc-entra text-3xl font-bold">Confira sua compra</p>}
        <dl className="num flex flex-col gap-3 text-2xl">
          <div className="flex justify-between text-white/70">
            <dt>Subtotal</dt>
            <dd>{formatarDinheiro(e.bruto)}</dd>
          </div>
          {e.desconto > 0 && (
            <div className="tc-entra flex justify-between text-amber-300">
              <dt>Desconto</dt>
              <dd>-{formatarDinheiro(e.desconto)}</dd>
            </div>
          )}
        </dl>
        <div className="border-t border-white/15 pt-6">
          <p className="text-xl tracking-wide text-white/60 uppercase">{pagando ? "Total a pagar" : "Total até agora"}</p>
          <p className="num mt-1 text-[clamp(3rem,6.2vw,6rem)] leading-none font-extrabold tracking-tight whitespace-nowrap">{formatarDinheiro(e.total)}</p>
        </div>
        {e.desconto > 0 && <p className="tc-entra rounded-2xl bg-amber-500 px-5 py-3 text-center text-2xl font-bold text-navy-950">Você economizou {formatarDinheiro(e.desconto)}</p>}
      </aside>
    </main>
  );
}

function Obrigado({ e }: { e: EstadoTela }) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-8 bg-navy-950 p-10 text-center text-white">
      <div className="relative flex size-56 items-center justify-center">
        <span className="tc-anel absolute inset-0 rounded-full bg-amber-500" />
        <span className="tc-joinha relative flex size-48 items-center justify-center rounded-full bg-amber-500 text-navy-950 shadow-2xl">
          <svg viewBox="0 0 24 24" className="size-24" fill="currentColor" aria-hidden="true">
            <path d="M2 21h4V9H2v12Zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3a1.5 1.5 0 0 0-.5-1.1L13.2 1 6.6 7.6A2 2 0 0 0 6 9v10a2 2 0 0 0 2 2h9a2 2 0 0 0 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2Z" />
          </svg>
        </span>
      </div>
      <div className="tc-entra" style={{ animationDelay: "250ms" }}>
        <p className="text-6xl font-extrabold tracking-tight">Obrigado pela preferência!</p>
        <p className="num mt-4 text-3xl text-white/75">
          Total pago {formatarDinheiro(e.total)}
          {e.desconto > 0 && <span className="text-amber-300"> · você economizou {formatarDinheiro(e.desconto)}</span>}
        </p>
        {e.troco > 0 && <p className="num mt-6 inline-block rounded-2xl bg-white/10 px-6 py-3 text-4xl font-bold">Seu troco: {formatarDinheiro(e.troco)}</p>}
        <p className="mt-8 text-2xl text-white/60">Volte sempre à {e.loja}</p>
      </div>
    </main>
  );
}
