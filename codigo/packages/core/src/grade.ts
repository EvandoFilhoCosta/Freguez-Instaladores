// Grade de variações (Start Geral 4.1): atributos como Tamanho × Cor geram as variações em lote.

export type AtributoGrade = { nome: string; valores: string[] };
export type Combinacao = Record<string, string>;

/** Produto cartesiano dos atributos. Sem atributos = uma variação "padrão" ({}). */
export function combinarGrade(atributos: AtributoGrade[]): Combinacao[] {
  const validos = atributos
    .map((a) => ({ nome: a.nome.trim(), valores: [...new Set(a.valores.map((v) => v.trim()).filter(Boolean))] }))
    .filter((a) => a.nome && a.valores.length);
  return validos.reduce<Combinacao[]>(
    (acc, a) => acc.flatMap((c) => a.valores.map((v) => ({ ...c, [a.nome]: v }))),
    [{}],
  );
}

/** "Camiseta básica algodão", 42 → "CAM-0042" */
export function referenciaProduto(nome: string, numero: number): string {
  const letras = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, "X");
  return `${letras}-${String(numero).padStart(4, "0")}`;
}

/** "CAM-0042" + {Tamanho: "M", Cor: "Preto"} → "CAM-0042-M-PRE" */
export function skuVariacao(referencia: string, combinacao: Combinacao): string {
  const partes = Object.values(combinacao).map((v) =>
    v
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 3),
  );
  return [referencia, ...partes].join("-");
}

/** {Tamanho: "M", Cor: "Preto"} → "M / Preto"; variação padrão → "Padrão" */
export function nomeVariacao(combinacao: Combinacao): string {
  const v = Object.values(combinacao);
  return v.length ? v.join(" / ") : "Padrão";
}
