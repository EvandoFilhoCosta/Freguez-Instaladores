// Impressão direta pelo app Windows (Start Geral 5.5): ESC/POS para o cupom 80 mm e a gaveta,
// TSPL para a impressora de etiquetas. Aqui só se montam os bytes; quem envia é o app (Tauri).

import { ean13Valido } from "./ean13";

// Página de código 850 (Latin-1 do DOS): cobre o português e é aceita pelas térmicas comuns
// (Epson, Elgin, Bematech, Tanca e as genéricas) e pelo comando CODEPAGE 850 do TSPL.
const CP850: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, ç: 0x87, ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b, î: 0x8c, ì: 0x8d,
  Ä: 0x8e, É: 0x90, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97, Ö: 0x99, Ü: 0x9a, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3,
  ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7, Á: 0xb5, Â: 0xb6, À: 0xb7, ã: 0xc6, Ã: 0xc7, Ê: 0xd2, Ë: 0xd3, È: 0xd4, Í: 0xd6,
  Î: 0xd7, Ó: 0xe0, Ô: 0xe2, Ò: 0xe3, õ: 0xe4, Õ: 0xe5, Ú: 0xe9, Û: 0xea, Ù: 0xeb, "°": 0xf8,
};

/** Texto → bytes CP850. O que não existe na página vira o caractere sem acento (ou "?"). */
export function cp850(texto: string): number[] {
  const out: number[] = [];
  for (const c of texto.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/×/g, "x")) {
    const code = c.charCodeAt(0);
    if (code >= 0x20 && code < 0x7f) out.push(code);
    else if (CP850[c] != null) out.push(CP850[c]!);
    else if (c === "\n") out.push(0x0a);
    else {
      const simples = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out.push(simples.length === 1 && simples.charCodeAt(0) < 0x7f ? simples.charCodeAt(0) : 0x3f);
    }
  }
  return out;
}

const ESC = 0x1b;
const GS = 0x1d;

/** Corta para caber em n colunas. */
const caber = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** Monta um cupom ESC/POS linha a linha. Colunas: 48 (80 mm, fonte A) ou 32 (58 mm). */
export class CupomEscPos {
  private b: number[] = [ESC, 0x40, ESC, 0x74, 2]; // inicializa + página 850

  constructor(readonly colunas = 48) {}

  private alinhar(a: "esq" | "centro") {
    this.b.push(ESC, 0x61, a === "centro" ? 1 : 0);
  }

  /** Texto com quebra por palavra. */
  texto(s: string, o: { centro?: boolean; negrito?: boolean; grande?: boolean } = {}) {
    const largura = o.grande ? Math.floor(this.colunas / 2) : this.colunas;
    this.alinhar(o.centro ? "centro" : "esq");
    if (o.negrito) this.b.push(ESC, 0x45, 1);
    if (o.grande) this.b.push(GS, 0x21, 0x11);
    for (const linha of quebrar(s, largura)) this.b.push(...cp850(linha), 0x0a);
    if (o.grande) this.b.push(GS, 0x21, 0x00);
    if (o.negrito) this.b.push(ESC, 0x45, 0);
    this.alinhar("esq");
    return this;
  }

  /** "Esquerda ........ direita" na mesma linha (o lado direito nunca é cortado). */
  linha(esq: string, dir: string, o: { negrito?: boolean } = {}) {
    const e = caber(esq, Math.max(this.colunas - dir.length - 1, 0));
    if (o.negrito) this.b.push(ESC, 0x45, 1);
    this.b.push(...cp850(e + " ".repeat(Math.max(this.colunas - e.length - dir.length, 1)) + dir), 0x0a);
    if (o.negrito) this.b.push(ESC, 0x45, 0);
    return this;
  }

  separador(c = "-") {
    this.b.push(...cp850(c.repeat(this.colunas)), 0x0a);
    return this;
  }

  pular(n = 1) {
    this.b.push(ESC, 0x64, n);
    return this;
  }

  /** QR Code nativo da impressora (GS ( k, modelo 2). Usado no DANFE da NFC-e. */
  qr(conteudo: string, tamanho = 5) {
    const dados = cp850(conteudo);
    const n = dados.length + 3;
    this.alinhar("centro");
    this.b.push(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0); // modelo 2
    this.b.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, Math.min(Math.max(tamanho, 1), 16)); // tamanho do módulo
    this.b.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // correção de erro M
    this.b.push(GS, 0x28, 0x6b, n % 256, Math.floor(n / 256), 0x31, 0x50, 0x30, ...dados); // guarda
    this.b.push(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, 0x0a); // imprime
    this.alinhar("esq");
    return this;
  }

  /** Avança o papel e corta (corte parcial, aceito por quase todas as guilhotinas). */
  cortar() {
    this.b.push(GS, 0x56, 0x42, 0x03);
    return this;
  }

  /** Pulso no conector RJ11 da impressora: abre a gaveta de dinheiro. */
  abrirGaveta() {
    this.b.push(ESC, 0x70, 0, 0x19, 0xfa);
    return this;
  }

  bytes(): number[] {
    return [...this.b];
  }
}

/** Só o comando da gaveta (abrir sem imprimir nada). */
export const comandoGaveta = (): number[] => [ESC, 0x40, ESC, 0x70, 0, 0x19, 0xfa];

function quebrar(s: string, n: number): string[] {
  const linhas: string[] = [];
  for (const par of s.split("\n")) {
    let atual = "";
    for (const palavra of par.split(/\s+/).filter(Boolean)) {
      if (!atual) atual = palavra;
      else if ((atual + " " + palavra).length <= n) atual += " " + palavra;
      else {
        linhas.push(atual);
        atual = palavra;
      }
      while (atual.length > n) {
        linhas.push(atual.slice(0, n));
        atual = atual.slice(n);
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// Etiquetas (TSPL — Elgin L42, Argox, TSC, Zebra em modo TSPL e similares, 203 dpi)
// ---------------------------------------------------------------------------
export type TamanhoEtiqueta = "40x25" | "50x30" | "60x40";
export const TAMANHOS_ETIQUETA: TamanhoEtiqueta[] = ["40x25", "50x30", "60x40"];

export type DadosEtiqueta = { nome: string; detalhe: string; preco: string; codigo: string };

const PONTOS_MM = 8; // 203 dpi
const limpar = (s: string) => s.replace(/"/g, "'");

/**
 * Etiqueta de produto (Start Geral 4.2): nome curto, tamanho/cor e referência, preço e código de barras
 * com os dígitos legíveis. EAN-13 válido vai como EAN13; qualquer outro código, como Code 128.
 */
export function etiquetaTspl(d: DadosEtiqueta, copias: number, tamanho: TamanhoEtiqueta = "40x25"): number[] {
  if (!Number.isInteger(copias) || copias < 1 || copias > 999) throw new Error("Quantidade de etiquetas inválida");
  const [l, a] = tamanho.split("x").map(Number) as [number, number];
  const largura = l * PONTOS_MM;
  const altura = a * PONTOS_MM;
  const m = 12; // margem
  const cabe = (larguraCaractere: number) => Math.floor((largura - 2 * m) / larguraCaractere);
  const alturaBarras = Math.max(altura - 130, 40);
  const ean = ean13Valido(d.codigo);
  const linhas = [
    `SIZE ${l} mm,${a} mm`,
    "GAP 2 mm,0 mm",
    "DIRECTION 1",
    "CODEPAGE 850",
    "CLS",
    `TEXT ${m},8,"2",0,1,1,"${limpar(caber(d.nome, cabe(12)))}"`,
    `TEXT ${m},34,"1",0,1,1,"${limpar(caber(d.detalhe, cabe(8)))}"`,
    `TEXT ${m},52,"3",0,1,1,"${limpar(d.preco)}"`,
    ean
      ? `BARCODE ${m + 8},84,"EAN13",${alturaBarras},1,0,2,2,"${d.codigo.slice(0, 12)}"`
      : `BARCODE ${m},84,"128",${alturaBarras},1,0,2,2,"${limpar(d.codigo)}"`,
    `PRINT 1,${copias}`,
    "",
  ];
  return cp850(linhas.join("\r\n"));
}
