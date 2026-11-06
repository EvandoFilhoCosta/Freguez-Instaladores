import { describe, expect, it } from "vitest";
import { alocarPagamento, faixaAtraso, gerarParcelas, situacaoParcela, type ParcelaAberta } from "./crediario";

describe("gerarParcelas", () => {
  it("exemplo do documento: R$ 200 em 4× todo dia 10, compra em 10/10", () => {
    const p = gerarParcelas({ total: 20000, parcelas: 4, diaVencimento: 10, dataCompra: "2026-10-10" });
    expect(p).toEqual([
      { numero: 1, vencimento: "2026-11-10", valor: 5000 },
      { numero: 2, vencimento: "2026-12-10", valor: 5000 },
      { numero: 3, vencimento: "2027-01-10", valor: 5000 },
      { numero: 4, vencimento: "2027-02-10", valor: 5000 },
    ]);
  });

  it("centavos que sobram vão para a primeira", () => {
    const p = gerarParcelas({ total: 10000, parcelas: 3, diaVencimento: 20, dataCompra: "2026-10-01" });
    expect(p.map((x) => x.valor)).toEqual([3334, 3333, 3333]);
  });

  it("respeita os dias mínimos até a primeira parcela", () => {
    // compra dia 01, vencimento dia 10: só 9 dias → pula para o mês seguinte
    const p = gerarParcelas({ total: 1000, parcelas: 1, diaVencimento: 10, dataCompra: "2026-10-01" });
    expect(p[0]!.vencimento).toBe("2026-11-10");
    const q = gerarParcelas({ total: 1000, parcelas: 1, diaVencimento: 20, dataCompra: "2026-10-01" });
    expect(q[0]!.vencimento).toBe("2026-10-20");
  });

  it("desconta a entrada", () => {
    const p = gerarParcelas({ total: 30000, entrada: 10000, parcelas: 2, diaVencimento: 10, dataCompra: "2026-10-10" });
    expect(p.map((x) => x.valor)).toEqual([10000, 10000]);
  });

  it("dia 31 cai no último dia dos meses curtos", () => {
    const p = gerarParcelas({ total: 3000, parcelas: 3, diaVencimento: 31, dataCompra: "2026-12-01" });
    expect(p.map((x) => x.vencimento)).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("recusa valores inválidos", () => {
    expect(() => gerarParcelas({ total: 1000, entrada: 1000, parcelas: 2, diaVencimento: 10, dataCompra: "2026-10-10" })).toThrow();
    expect(() => gerarParcelas({ total: 1000, parcelas: 0, diaVencimento: 10, dataCompra: "2026-10-10" })).toThrow();
  });
});

const compra = (valores: number[], pagos: number[] = [], criada = "2026-10-10", prefixo = "p"): ParcelaAberta[] =>
  valores.map((valor, i) => ({
    id: `${prefixo}${i + 1}`,
    compraCriadaEm: criada,
    numero: i + 1,
    vencimento: ["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"][i]!,
    valor,
    valorPago: pagos[i] ?? 0,
  }));

describe("alocarPagamento — exemplos do documento (4× R$ 50)", () => {
  const p = compra([5000, 5000, 5000, 5000]);

  it("paga R$ 100 — modo A: nov e dez quitadas", () => {
    expect(alocarPagamento(p, 10000, "A")).toEqual({
      alocacoes: [
        { parcelaId: "p1", valor: 5000 },
        { parcelaId: "p2", valor: 5000 },
      ],
    });
  });

  it("paga R$ 100 — modo B: nov quitada, restam R$ 100 em 3×", () => {
    const r = alocarPagamento(p, 10000, "B", "2026-11-10");
    expect(r.alocacoes.map((a) => a.valor)).toEqual([5000, 1666, 1667, 1667]);
    // o que falta em cada restante: 33,34 · 33,33 · 33,33
    expect(r.alocacoes.slice(1).map((a) => 5000 - a.valor)).toEqual([3334, 3333, 3333]);
  });

  it("paga R$ 70 — modo A: nov quitada, dez parcial (20)", () => {
    expect(alocarPagamento(p, 7000, "A").alocacoes).toEqual([
      { parcelaId: "p1", valor: 5000 },
      { parcelaId: "p2", valor: 2000 },
    ]);
  });

  it("paga R$ 70 — modo B: restam R$ 130 em 3× de 43,33", () => {
    const r = alocarPagamento(p, 7000, "B", "2026-11-10");
    expect(r.alocacoes.slice(1).map((a) => 5000 - a.valor)).toEqual([4334, 4333, 4333]);
  });

  it("paga R$ 30 — nov parcial nos dois modos", () => {
    expect(alocarPagamento(p, 3000, "A").alocacoes).toEqual([{ parcelaId: "p1", valor: 3000 }]);
    expect(alocarPagamento(p, 3000, "B", "2026-11-10")).toEqual({
      alocacoes: [{ parcelaId: "p1", valor: 3000 }],
    });
  });

  it("duas compras no mesmo dia: quita a da compra mais antiga primeiro", () => {
    const antiga = compra([5000], [], "2026-09-01", "a");
    const nova = compra([5000], [], "2026-10-01", "n");
    expect(alocarPagamento([...nova, ...antiga], 5000, "A").alocacoes).toEqual([{ parcelaId: "a1", valor: 5000 }]);
  });

  it("modo B quita também o que já venceu antes de diluir", () => {
    const r = alocarPagamento(p, 15000, "B", "2026-12-15");
    expect(r.alocacoes.map((a) => a.valor)).toEqual([5000, 5000, 2500, 2500]);
  });

  it("modo B: parcela que zera sai da divisão", () => {
    const desigual = compra([5000, 5000, 5000], [0, 4900, 0]); // dez só deve 1,00
    const r = alocarPagamento(desigual, 7000, "B", "2026-11-10");
    expect(r.alocacoes).toEqual([
      { parcelaId: "p1", valor: 5000 },
      { parcelaId: "p2", valor: 100 },
      { parcelaId: "p3", valor: 1900 },
    ]);
  });

  it("considera o que já foi pago", () => {
    const parcial = compra([5000, 5000], [2000]);
    expect(alocarPagamento(parcial, 4000, "A").alocacoes).toEqual([
      { parcelaId: "p1", valor: 3000 },
      { parcelaId: "p2", valor: 1000 },
    ]);
  });

  it("não aceita pagar mais que o total em aberto", () => {
    expect(() => alocarPagamento(p, 20001)).toThrow();
  });
});

describe("situação e atraso", () => {
  const base = { vencimento: "2026-11-10", valor: 5000, valorPago: 0, status: "aberta" };
  it("classifica", () => {
    expect(situacaoParcela(base, "2026-11-09")).toBe("em_dia");
    expect(situacaoParcela(base, "2026-11-10")).toBe("vence_hoje");
    expect(situacaoParcela(base, "2026-11-11")).toBe("atrasada");
    expect(situacaoParcela({ ...base, valorPago: 2000 }, "2026-11-01")).toBe("parcial");
    expect(situacaoParcela({ ...base, valorPago: 5000 }, "2026-12-01")).toBe("paga");
    expect(situacaoParcela({ ...base, status: "renegociada" }, "2026-12-01")).toBe("renegociada");
  });
  it("faixas", () => {
    expect(faixaAtraso("2026-11-10", "2026-11-10")).toBeNull();
    expect(faixaAtraso("2026-11-10", "2026-11-11")).toBe("1-30");
    expect(faixaAtraso("2026-11-10", "2027-01-05")).toBe("31-60");
    expect(faixaAtraso("2026-11-10", "2027-02-01")).toBe("61-90");
    expect(faixaAtraso("2026-11-10", "2027-03-01")).toBe("90+");
  });
});
