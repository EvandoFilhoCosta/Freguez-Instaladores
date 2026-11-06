// Pareamento de dispositivos (Start Geral 3.6): o dono gera um código no painel e digita no caixa.

// Sem 0/O, 1/I/L: o código é lido em voz alta e digitado.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PAREAMENTO_MINUTOS = 10;

export function gerarCodigoPareamento(tamanho = 8): string {
  const buf = new Uint8Array(tamanho);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => ALFABETO[b % ALFABETO.length]).join("");
}

/** Aceita com espaço, hífen ou minúscula: "abcd-2345" → "ABCD2345" */
export function normalizarCodigoPareamento(codigo: string): string {
  return codigo.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function formatarCodigoPareamento(codigo: string): string {
  return codigo.replace(/(.{4})(?=.)/g, "$1-");
}
