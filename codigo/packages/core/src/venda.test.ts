import { describe, expect, it } from "vitest";
import {
  calcularTroco,
  creditoDisponivel,
  descontoDePercentual,
  descontoPermitido,
  percentualDesconto,
  precoVigente,
  recebivelCartao,
  totaisVenda,
} from "./venda";

describe("preço do dia", () => {
  const v = { preco_centavos: 4990, preco_promo_centavos: 3990, promo_inicio: "2026-10-01", promo_fim: "2026-10-31" };
  it("promoção dentro do período", () => {
    expect(precoVigente(v, "2026-10-15")).toEqual({ preco: 3990, promocao: true });
  });
  it("fora do período volta ao preço cheio", () => {
    expect(precoVigente(v, "2026-11-01")).toEqual({ preco: 4990, promocao: false });
    expect(precoVigente({ ...v, preco_promo_centavos: null }, "2026-10-15").promocao).toBe(false);
  });
});

describe("totais e desconto", () => {
  it("exemplo da tela do PDV: 279,60 − 10,00 = 269,60", () => {
    const t = totaisVenda(
      [
        { quantidade: 1, precoUnit: 4990, desconto: 0 },
        { quantidade: 1, precoUnit: 18990, desconto: 0 },
        { quantidade: 2, precoUnit: 1990, desconto: 0 },
      ],
      1000,
    );
    expect(t).toMatchObject({ bruto: 27960, subtotal: 27960, total: 26960, descontoTotal: 1000 });
  });
  it("desconto por item e geral somam", () => {
    const t = totaisVenda([{ quantidade: 2, precoUnit: 1000, desconto: 200 }], 300);
    expect(t).toMatchObject({ bruto: 2000, subtotal: 1800, total: 1500, descontoTotal: 500 });
  });
  it("recusa desconto maior que a venda", () => {
    expect(() => totaisVenda([{ quantidade: 1, precoUnit: 1000, desconto: 0 }], 1001)).toThrow();
    expect(() => totaisVenda([{ quantidade: 1, precoUnit: 1000, desconto: 1001 }])).toThrow();
  });
  it("limite do vendedor", () => {
    expect(percentualDesconto(500, 10000)).toBe(5);
    expect(descontoPermitido(5, 5)).toBe(true);
    expect(descontoPermitido(5.01, 5)).toBe(false);
    expect(descontoDePercentual(4990, 10)).toBe(499);
  });
});

describe("troco", () => {
  it("dinheiro a mais vira troco", () => {
    expect(calcularTroco(26960, [{ forma: "dinheiro", valor: 30000 }])).toBe(3040);
  });
  it("misto: R$ 100 no Pix + restante no crediário", () => {
    expect(calcularTroco(30000, [{ forma: "pix", valor: 10000 }, { forma: "crediario", valor: 20000 }])).toBe(0);
  });
  it("só dinheiro pode passar do total; falta valor dá erro", () => {
    expect(() => calcularTroco(1000, [{ forma: "pix", valor: 1500 }])).toThrow();
    expect(() => calcularTroco(1000, [{ forma: "dinheiro", valor: 500 }])).toThrow();
  });
});

describe("recebíveis do cartão e crédito", () => {
  const taxas = { taxaDebitoPct: 1.99, taxaCreditoPct: 4.98, taxaParceladoPct: 9.9, prazoDebitoDias: 1, prazoCreditoDias: 30 };
  it("débito cai no dia seguinte, com a taxa", () => {
    expect(recebivelCartao("debito", 10000, 1, taxas, "2026-10-27")).toEqual({ taxaPct: 1.99, liquido: 9801, previsao: "2026-10-28" });
  });
  it("crédito parcelado usa a taxa de parcelado", () => {
    expect(recebivelCartao("credito", 10000, 3, taxas, "2026-10-27")).toEqual({ taxaPct: 9.9, liquido: 9010, previsao: "2026-11-26" });
  });
  it("limite de crédito disponível", () => {
    expect(creditoDisponivel(null, 5000)).toBeNull();
    expect(creditoDisponivel(10000, 4000)).toBe(6000);
    expect(creditoDisponivel(10000, 12000)).toBe(0);
  });
});
