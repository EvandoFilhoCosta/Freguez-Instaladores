// Regras da venda no caixa (Start Geral 4.3). Centavos inteiros; o servidor recalcula tudo com estas funções.

export type PrecoVariacao = {
  preco_centavos: number;
  preco_promo_centavos: number | null;
  promo_inicio: string | null;
  promo_fim: string | null;
};

/** Preço do dia: promoção vale dentro do período (promoção não conta como desconto do vendedor). */
export function precoVigente(v: PrecoVariacao, hoje: string): { preco: number; promocao: boolean } {
  const promo =
    v.preco_promo_centavos != null &&
    v.preco_promo_centavos < v.preco_centavos &&
    (!v.promo_inicio || v.promo_inicio <= hoje) &&
    (!v.promo_fim || v.promo_fim >= hoje);
  return promo ? { preco: v.preco_promo_centavos!, promocao: true } : { preco: v.preco_centavos, promocao: false };
}

export type ItemCarrinho = { quantidade: number; precoUnit: number; desconto: number };

export function totalItem(i: ItemCarrinho): number {
  return Math.round(i.quantidade * i.precoUnit) - i.desconto;
}

export function totaisVenda(itens: ItemCarrinho[], descontoGeral = 0) {
  const bruto = itens.reduce((t, i) => t + Math.round(i.quantidade * i.precoUnit), 0);
  const descontoItens = itens.reduce((t, i) => t + i.desconto, 0);
  const subtotal = bruto - descontoItens;
  if (descontoGeral < 0 || descontoGeral > subtotal) throw new Error("Desconto maior que o valor da venda");
  if (itens.some((i) => i.desconto < 0 || i.desconto > Math.round(i.quantidade * i.precoUnit))) {
    throw new Error("Desconto do item inválido");
  }
  return { bruto, descontoItens, subtotal, descontoGeral, descontoTotal: descontoItens + descontoGeral, total: subtotal - descontoGeral };
}

/** % de desconto sobre o valor cheio (preço do dia × quantidade). */
export function percentualDesconto(desconto: number, bruto: number): number {
  return bruto > 0 ? (desconto / bruto) * 100 : 0;
}

/**
 * Regra de desconto (Start Geral 4.3): até o limite do vendedor passa direto;
 * acima, precisa do PIN de alguém com permissão e limite suficiente (dono/gerente = sem limite).
 */
export function descontoPermitido(pct: number, limitePct: number): boolean {
  return pct <= limitePct + 1e-9;
}

/** Desconto digitado em % → centavos (arredondado). */
export function descontoDePercentual(base: number, pct: number): number {
  return Math.round((base * pct) / 100);
}

export type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito" | "crediario" | "vale";
export type Pagamento = { forma: FormaPagamento; valor: number };

/**
 * Formas somadas precisam cobrir o total; só o dinheiro pode passar do total (vira troco).
 * Retorna o troco ou lança erro com a mensagem para o caixa.
 */
export function calcularTroco(total: number, pagamentos: Pagamento[]): number {
  if (pagamentos.some((p) => !Number.isInteger(p.valor) || p.valor <= 0)) throw new Error("Valor de pagamento inválido");
  const soma = pagamentos.reduce((t, p) => t + p.valor, 0);
  const semDinheiro = pagamentos.filter((p) => p.forma !== "dinheiro").reduce((t, p) => t + p.valor, 0);
  if (semDinheiro > total) throw new Error("Pix, cartão, vale e crediário não podem passar do total");
  if (soma < total) throw new Error(`Faltam ${total - soma} centavos`);
  return soma - total;
}

export type TaxasCartao = {
  taxaDebitoPct: number;
  taxaCreditoPct: number;
  taxaParceladoPct: number;
  prazoDebitoDias: number;
  prazoCreditoDias: number;
};

function somarDias(data: string, dias: number): string {
  const d = new Date(data + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Recebível da maquininha (Ton manual): quanto cai, quando e a taxa aplicada. */
export function recebivelCartao(
  forma: "debito" | "credito",
  valor: number,
  parcelas: number,
  taxas: TaxasCartao,
  hoje: string,
): { taxaPct: number; liquido: number; previsao: string } {
  const taxaPct = forma === "debito" ? taxas.taxaDebitoPct : parcelas > 1 ? taxas.taxaParceladoPct : taxas.taxaCreditoPct;
  const prazo = forma === "debito" ? taxas.prazoDebitoDias : taxas.prazoCreditoDias;
  return { taxaPct, liquido: valor - Math.round((valor * taxaPct) / 100), previsao: somarDias(hoje, prazo) };
}

/** Limite de crédito: o que ainda cabe para comprar a prazo (null = sem limite). */
export function creditoDisponivel(limite: number | null, emAberto: number): number | null {
  return limite == null ? null : Math.max(limite - emAberto, 0);
}

/** NFC-e de R$ 500 ou mais exige CPF/CNPJ do comprador (Sefaz-PB, maio/2026). */
export const exigeDocumento = (totalCentavos: number, limiteCentavos = 50000) => totalCentavos >= limiteCentavos;
