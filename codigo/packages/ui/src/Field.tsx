import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

// Guia Visual 5.2: rótulo acima, ajuda abaixo, erro abaixo em vermelho.
export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  help?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-ink-muted">{help}</p>
      ) : null}
    </div>
  );
}

const campo =
  "h-10 w-full rounded-lg border border-slate-200 bg-surface px-3 text-sm text-ink shadow-campo placeholder:text-slate-400 transition-colors " +
  "hover:border-slate-300 focus-visible:border-navy-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-navy-500/15 " +
  "disabled:bg-slate-100 aria-invalid:border-danger";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(campo, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(campo, className)} {...props} />;
}
