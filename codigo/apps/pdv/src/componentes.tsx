import { formatarDinheiro } from "@freguez/core";
import { Button, cn } from "@freguez/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Diálogo do PDV: centralizado, fecha com Esc (Guia Visual 6.2). */
export function Dialogo({
  titulo,
  aoFechar,
  largura = "max-w-lg",
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  largura?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-lg bg-surface p-6 text-ink shadow-lg backdrop:bg-navy-950/60", largura)}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        <button type="button" onClick={aoFechar} className="rounded-md px-2 text-sm text-ink-muted hover:bg-slate-100" aria-label="Fechar (Esc)">
          Esc
        </button>
      </div>
      {children}
    </dialog>
  );
}

/** Teclado de PIN: 4 bolinhas, teclas grandes, aceita teclado físico (Guia Visual 5.4). */
export function PinPad({
  titulo,
  subtitulo,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  titulo: string;
  subtitulo?: string;
  erro?: string;
  aoConfirmar: (pin: string) => void;
  aoFechar: () => void;
}) {
  const [pin, setPin] = useState("");
  const confirmar = useRef(aoConfirmar);
  confirmar.current = aoConfirmar;
  const digitar = (d: string) => setPin((p) => (p + d).slice(0, 4));
  useEffect(() => {
    if (pin.length === 4) {
      confirmar.current(pin);
      setPin("");
    }
  }, [pin]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) digitar(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialogo titulo={titulo} aoFechar={aoFechar} largura="max-w-sm">
      {subtitulo && <p className="-mt-2 mb-4 text-sm text-ink-muted">{subtitulo}</p>}
      <div className="mb-4 flex justify-center gap-4" aria-label={`${pin.length} de 4 dígitos`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("size-4 rounded-full border-2 border-brand", i < pin.length && "bg-brand")} />
        ))}
      </div>
      {erro && (
        <p role="alert" className="mb-3 text-center text-sm text-danger">
          {erro}
        </p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => digitar(d)} className="num h-16 rounded-lg bg-slate-100 text-2xl font-semibold hover:bg-slate-200">
            {d}
          </button>
        ))}
        <button type="button" onClick={() => setPin("")} className="h-16 rounded-lg text-sm text-ink-muted hover:bg-slate-100">
          Limpar
        </button>
        <button type="button" onClick={() => digitar("0")} className="num h-16 rounded-lg bg-slate-100 text-2xl font-semibold hover:bg-slate-200">
          0
        </button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} className="h-16 rounded-lg text-sm text-ink-muted hover:bg-slate-100">
          Apagar
        </button>
      </div>
    </Dialogo>
  );
}

/** Dinheiro digitado da direita para a esquerda. */
export function CampoDinheiro({
  id,
  valor,
  aoMudar,
  grande,
  autoFocus,
  aoEnter,
}: {
  id: string;
  valor: number;
  aoMudar: (v: number) => void;
  grande?: boolean;
  autoFocus?: boolean;
  aoEnter?: () => void;
}) {
  return (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      value={valor ? formatarDinheiro(valor) : ""}
      placeholder="R$ 0,00"
      onChange={(e) => aoMudar(Math.min(Number(e.target.value.replace(/\D/g, "") || 0), 99_999_999))}
      onKeyDown={(e) => e.key === "Enter" && aoEnter?.()}
      className={cn(
        "num w-full rounded-md border border-slate-300 bg-surface px-3 text-right focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none",
        grande ? "h-14 text-2xl font-bold" : "h-10 text-sm",
      )}
    />
  );
}

export function Rotulo({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

export function Erro({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  );
}

export function Rodape({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex justify-end gap-2">{children}</div>;
}

export { Button };
