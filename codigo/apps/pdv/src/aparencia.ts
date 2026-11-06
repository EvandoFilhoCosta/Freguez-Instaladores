// Cores da loja no caixa e no totem: a paleta "navy" vira tons da cor principal e a "amber" tons da cor de
// destaque. O Tailwind 4 lê as cores de variáveis CSS, então trocar as variáveis repinta todas as telas.
import type { Aparencia } from "./tipos";

const TONS_PRINCIPAL: [string, number][] = [
  ["50", 7],
  ["100", 16],
  ["200", 32],
  ["300", 52],
  ["400", 72],
  ["500", 88],
];
const ESCUROS: [string, number][] = [
  ["600", 88],
  ["700", 100],
  ["800", 78],
  ["900", 58],
  ["950", 38],
];

const hex = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null);

export function aplicarAparencia(a: Aparencia | undefined) {
  const raiz = document.documentElement.style;
  const p = hex(a?.corPrimaria);
  const d = hex(a?.corDestaque);
  if (p) {
    for (const [t, pct] of TONS_PRINCIPAL) raiz.setProperty(`--color-navy-${t}`, `color-mix(in srgb, ${p} ${pct}%, white)`);
    for (const [t, pct] of ESCUROS) raiz.setProperty(`--color-navy-${t}`, pct === 100 ? p : `color-mix(in srgb, ${p} ${pct}%, black)`);
  }
  if (d) {
    raiz.setProperty("--color-amber-50", `color-mix(in srgb, ${d} 8%, white)`);
    raiz.setProperty("--color-amber-100", `color-mix(in srgb, ${d} 18%, white)`);
    raiz.setProperty("--color-amber-300", `color-mix(in srgb, ${d} 60%, white)`);
    raiz.setProperty("--color-amber-400", `color-mix(in srgb, ${d} 82%, white)`);
    raiz.setProperty("--color-amber-500", d);
    raiz.setProperty("--color-amber-600", `color-mix(in srgb, ${d} 85%, black)`);
  }
}
