import { describe, expect, it } from "vitest";
import { ehUuid, uuidv7 } from "./ids";
import { comandoGaveta, cp850, CupomEscPos, etiquetaTspl } from "./impressao";

const texto = (b: number[]) => String.fromCharCode(...b);

describe("uuidv7", () => {
  it("tem versão 7, variante RFC e começa pelo horário", () => {
    const id = uuidv7(0x0192_7c3e_1234, () => new Uint8Array(16).fill(0xff));
    expect(id).toBe("01927c3e-1234-7fff-bfff-ffffffffffff");
    expect(ehUuid(id)).toBe(true);
  });
  it("ordena pela hora de criação", () => {
    expect(uuidv7(1000) < uuidv7(2000)).toBe(true);
  });
  it("não repete", () => {
    expect(new Set(Array.from({ length: 1000 }, () => uuidv7(5))).size).toBe(1000);
  });
});

describe("cp850", () => {
  it("acentos do português na página 850", () => {
    expect(cp850("ãçéÚº")).toEqual([0xc6, 0x87, 0x82, 0xe9, 0xa7]);
  });
  it("o que não existe vira sem acento ou ?", () => {
    expect(cp850("ŕ€")).toEqual([0x72, 0x3f]);
  });
});

describe("CupomEscPos", () => {
  it("começa inicializando a impressora na página 850", () => {
    expect(new CupomEscPos().bytes().slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 2]);
  });
  it("linha com valor à direita ocupa as colunas exatas", () => {
    const b = new CupomEscPos(32).linha("Camiseta Básica Branca Tamanho M", "R$ 49,90").bytes().slice(5);
    expect(b.length).toBe(33); // 32 colunas + quebra
    expect(texto(b.slice(-9, -1))).toBe("R$ 49,90");
  });
  it("quebra texto longo por palavra", () => {
    const b = new CupomEscPos(10).texto("um dois três quatro").bytes();
    expect(b.filter((x) => x === 0x0a).length).toBe(3); // "um dois" · "três" · "quatro"
  });
  it("QR Code leva o tamanho certo dos dados", () => {
    const b = new CupomEscPos().qr("https://sefaz/abc").bytes();
    const i = b.findIndex((x, k) => x === 0x1d && b[k + 1] === 0x28 && b[k + 2] === 0x6b && b[k + 6] === 0x50);
    expect(b[i + 3]).toBe("https://sefaz/abc".length + 3);
  });
  it("gaveta e corte", () => {
    const b = new CupomEscPos().abrirGaveta().cortar().bytes();
    expect(b.slice(-9)).toEqual([0x1b, 0x70, 0, 0x19, 0xfa, 0x1d, 0x56, 0x42, 0x03]);
    expect(comandoGaveta()).toEqual([0x1b, 0x40, 0x1b, 0x70, 0, 0x19, 0xfa]);
  });
});

describe("etiquetaTspl", () => {
  const d = { nome: "Camiseta Básica", detalhe: "M / Azul · CAM-0001", preco: "R$ 49,90", codigo: "2000000001234" };
  it("EAN-13 válido vai sem o dígito verificador (a impressora calcula)", () => {
    const t = texto(etiquetaTspl({ ...d, codigo: "2000000000015" }, 3));
    expect(t).toContain('"EAN13"');
    expect(t).toContain('"200000000001"');
    expect(t).toContain("PRINT 1,3");
    expect(t).toContain("SIZE 40 mm,25 mm");
  });
  it("código que não é EAN vai em Code 128", () => {
    expect(texto(etiquetaTspl({ ...d, codigo: "CAM-0001-P" }, 1, "50x30"))).toContain('"128"');
  });
  it("aspas no nome não quebram o comando", () => {
    expect(texto(etiquetaTspl({ ...d, nome: 'Bota 7"' }, 1))).toContain("Bota 7'");
  });
  it("recusa quantidade inválida", () => {
    expect(() => etiquetaTspl(d, 0)).toThrow();
  });
});
