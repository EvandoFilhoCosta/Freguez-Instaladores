// Formatos da loja (Guia Visual 7.1). Dinheiro sempre em centavos (inteiro).

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const FUSO_PADRAO = "America/Fortaleza";

export function formatarDinheiro(centavos: number): string {
  return brl.format(centavos / 100).replace(/ /g, " ");
}

export function formatarPercentual(valor: number): string {
  return `${pct.format(valor)}%`;
}

/** "19,90", "1.234,5", "R$ 10" → centavos. Retorna null se não for número. */
export function lerDinheiro(texto: string): number | null {
  const limpo = texto.replace(/[R$\s.]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{0,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

/** Data de hoje (AAAA-MM-DD) no fuso da loja. */
export function hojeNoFuso(fuso: string = FUSO_PADRAO, agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** AAAA-MM-DD → 26/10/2026 */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Data e hora no fuso da loja: 26/10/2026 14:05 */
export function formatarDataHora(iso: string, fuso: string = FUSO_PADRAO): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Diferença em dias entre duas datas AAAA-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

export function formatarQuantidade(qtd: number, unidade = "UN"): string {
  const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(qtd);
  const nomes: Record<string, [string, string]> = {
    UN: ["un", "un"],
    PAR: ["par", "pares"],
    KG: ["kg", "kg"],
    M: ["m", "m"],
    CX: ["cx", "cx"],
  };
  const [um, varios] = nomes[unidade] ?? [unidade.toLowerCase(), unidade.toLowerCase()];
  return `${n} ${Math.abs(qtd) === 1 ? um : varios}`;
}
