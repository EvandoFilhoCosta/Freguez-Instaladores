// CPF, CNPJ e telefone (Guia Visual 5.2 e 7.1).

export const soDigitos = (s: string) => s.replace(/\D/g, "");

function digitoMod11(base: string, pesos: number[]): number {
  const soma = [...base].reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const cpf = soDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const d1 = digitoMod11(cpf.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoMod11(cpf.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cpf.endsWith(`${d1}${d2}`);
}

export function cnpjValido(valor: string): boolean {
  const cnpj = soDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const d1 = digitoMod11(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoMod11(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** Detecta pelo tamanho: 11 dígitos = CPF, 14 = CNPJ. */
export function tipoDocumento(valor: string): "cpf" | "cnpj" | null {
  const n = soDigitos(valor).length;
  return n === 11 ? "cpf" : n === 14 ? "cnpj" : null;
}

export function documentoValido(valor: string): boolean {
  const tipo = tipoDocumento(valor);
  return tipo === "cpf" ? cpfValido(valor) : tipo === "cnpj" ? cnpjValido(valor) : false;
}

export function formatarDocumento(valor: string): string {
  const d = soDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return valor;
}

/** Mascarado para quem não pode ver o documento inteiro: ***.456.789-** */
export function mascararDocumento(valor: string): string {
  const d = soDigitos(valor);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  return formatarDocumento(valor);
}

/** Salva sempre como +55DDNNNNNNNNN. Aceita com ou sem 55 e com ou sem máscara. */
export function normalizarTelefone(valor: string): string | null {
  let d = soDigitos(valor);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  return `+55${d}`;
}

/** +5583988887777 → (83) 98888-7777 */
export function formatarTelefone(valor: string): string {
  const d = soDigitos(valor).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return valor;
}
