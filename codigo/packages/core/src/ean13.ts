// Código de barras EAN-13 (Start Geral 4.2).
// Interno: "20" + sequência da loja (10 dígitos) + dígito verificador. Prefixo 2 é a faixa GS1 de uso interno.

export function digitoVerificadorEan13(doze: string): number {
  if (!/^\d{12}$/.test(doze)) throw new Error("EAN-13 precisa de 12 dígitos antes do verificador");
  const soma = [...doze].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (soma % 10)) % 10;
}

export function ean13Valido(codigo: string): boolean {
  return /^\d{13}$/.test(codigo) && digitoVerificadorEan13(codigo.slice(0, 12)) === Number(codigo[12]);
}

export function codigoInterno(sequencia: number): string {
  if (!Number.isInteger(sequencia) || sequencia < 1 || sequencia > 9_999_999_999) {
    throw new Error("Sequência fora da faixa do código interno");
  }
  const doze = "20" + String(sequencia).padStart(10, "0");
  return doze + digitoVerificadorEan13(doze);
}

export function codigoEhInterno(codigo: string): boolean {
  return codigo.startsWith("20") && ean13Valido(codigo);
}

// Padrões de barras do EAN-13 (L, G, R) e paridade do primeiro dígito
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** 95 módulos ("1" = barra) para desenhar o código. */
export function modulosEan13(codigo: string): string {
  if (!ean13Valido(codigo)) throw new Error("EAN-13 inválido");
  const d = [...codigo].map(Number);
  const paridade = PARIDADE[d[0]!]!;
  let barras = "101";
  for (let i = 1; i <= 6; i++) barras += (paridade[i - 1] === "L" ? L : G)[d[i]!]!;
  barras += "01010";
  for (let i = 7; i <= 12; i++) barras += R[d[i]!]!;
  return barras + "101";
}
