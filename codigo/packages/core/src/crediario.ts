// Crediário (Start Geral 4.5). Valores em centavos, datas AAAA-MM-DD.
import { diasEntre } from "./formato";

export type ModoExcedente = "A" | "B";

export type ParcelaNova = { numero: number; vencimento: string; valor: number };

/** Mesmo dia do mês, ajustado para o último dia quando o mês é curto (dia 31 em fevereiro). */
function dataNoDia(ano: number, mes: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1-12
  const d = Math.min(dia, ultimo);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Primeira parcela: no próximo dia escolhido que esteja a pelo menos `diasMinimos` da compra.
 * Valores iguais; os centavos que sobram vão para a primeira.
 */
export function gerarParcelas(p: {
  total: number;
  entrada?: number;
  parcelas: number;
  diaVencimento: number;
  dataCompra: string;
  diasMinimos?: number;
}): ParcelaNova[] {
  const entrada = p.entrada ?? 0;
  const financiado = p.total - entrada;
  if (!Number.isInteger(p.total) || !Number.isInteger(entrada)) throw new Error("Valores em centavos inteiros");
  if (financiado <= 0) throw new Error("Nada a parcelar");
  if (!Number.isInteger(p.parcelas) || p.parcelas < 1 || p.parcelas > 48) throw new Error("Parcelas entre 1 e 48");
  if (p.diaVencimento < 1 || p.diaVencimento > 31) throw new Error("Dia de vencimento entre 1 e 31");
  const diasMinimos = p.diasMinimos ?? 15;

  let [ano, mes] = p.dataCompra.split("-").map(Number) as [number, number];
  let primeira = dataNoDia(ano, mes, p.diaVencimento);
  while (diasEntre(p.dataCompra, primeira) < diasMinimos) {
    mes++;
    if (mes > 12) (mes = 1), ano++;
    primeira = dataNoDia(ano, mes, p.diaVencimento);
  }

  const base = Math.floor(financiado / p.parcelas);
  const sobra = financiado - base * p.parcelas;
  return Array.from({ length: p.parcelas }, (_, i) => {
    let m = mes + i;
    const a = ano + Math.floor((m - 1) / 12);
    m = ((m - 1) % 12) + 1;
    return { numero: i + 1, vencimento: dataNoDia(a, m, p.diaVencimento), valor: base + (i === 0 ? sobra : 0) };
  });
}

export type ParcelaAberta = {
  id: string;
  compraCriadaEm: string; // desempate: compra mais antiga primeiro
  numero: number;
  vencimento: string;
  valor: number;
  valorPago: number;
};

export type Alocacao = { parcelaId: string; valor: number };

export function emAberto(p: Pick<ParcelaAberta, "valor" | "valorPago">): number {
  return p.valor - p.valorPago;
}

/** Ordem de quitação: vence antes primeiro; empate, compra mais antiga; depois o número. */
export function ordenarParaQuitar<T extends ParcelaAberta>(parcelas: T[]): T[] {
  return [...parcelas].sort(
    (a, b) =>
      a.vencimento.localeCompare(b.vencimento) ||
      a.compraCriadaEm.localeCompare(b.compraCriadaEm) ||
      a.numero - b.numero,
  );
}

/**
 * Distribui um pagamento entre as parcelas (todo centavo fica ligado a uma parcela).
 * Modo A (padrão): quita da mais antiga para a mais nova; a última tocada pode ficar parcial.
 * Modo B: quita a parcela do mês e o que já venceu até `hoje`; o excedente abate por igual
 *         das parcelas restantes, que passam a dever menos cada uma.
 */
export function alocarPagamento(
  parcelas: ParcelaAberta[],
  valor: number,
  modo: ModoExcedente = "A",
  hoje?: string,
): { alocacoes: Alocacao[] } {
  if (!Number.isInteger(valor) || valor <= 0) throw new Error("Valor do pagamento inválido");
  const abertas = ordenarParaQuitar(parcelas.filter((p) => emAberto(p) > 0));
  const totalAberto = abertas.reduce((s, p) => s + emAberto(p), 0);
  if (valor > totalAberto) throw new Error("Pagamento maior que o total em aberto");

  if (modo === "A") {
    const alocacoes: Alocacao[] = [];
    let resta = valor;
    for (const p of abertas) {
      if (!resta) break;
      const v = Math.min(resta, emAberto(p));
      alocacoes.push({ parcelaId: p.id, valor: v });
      resta -= v;
    }
    return { alocacoes };
  }

  // Modo B: quita a primeira em aberto (a "do mês") e tudo que já venceu; o excedente dilui nas demais.
  const referencia = hoje ?? abertas[0]!.vencimento;
  const alocacoes: Alocacao[] = [];
  let resta = valor;
  let i = 0;
  while (i < abertas.length && resta > 0) {
    const p = abertas[i]!;
    const obrigatoria = i === 0 || p.vencimento <= referencia;
    if (!obrigatoria) break;
    const v = Math.min(resta, emAberto(p));
    alocacoes.push({ parcelaId: p.id, valor: v });
    resta -= v;
    i++;
  }
  // Excedente em partes iguais; centavos extras vão para as últimas (a próxima fica com o saldo maior,
  // como na geração das parcelas). Parcela que zera sai da divisão e o resto é redistribuído.
  const restantes = abertas.slice(i).map((p) => ({ id: p.id, falta: emAberto(p), abate: 0 }));
  while (resta > 0) {
    const vivas = restantes.filter((r) => r.falta > r.abate);
    const base = Math.floor(resta / vivas.length);
    let sobra = resta - base * vivas.length;
    for (let k = vivas.length - 1; k >= 0; k--) {
      const r = vivas[k]!;
      const v = Math.min(base + (sobra > 0 ? 1 : 0), r.falta - r.abate);
      if (sobra > 0) sobra--;
      r.abate += v;
      resta -= v;
    }
  }
  for (const r of restantes) if (r.abate) alocacoes.push({ parcelaId: r.id, valor: r.abate });
  return { alocacoes };
}

export type SituacaoParcela = "paga" | "parcial" | "atrasada" | "vence_hoje" | "em_dia" | "renegociada" | "cancelada";

export function situacaoParcela(
  p: { vencimento: string; valor: number; valorPago: number; status: string },
  hoje: string,
): SituacaoParcela {
  if (p.status === "renegociada" || p.status === "cancelada") return p.status;
  if (p.valorPago >= p.valor) return "paga";
  if (p.vencimento < hoje) return "atrasada";
  if (p.vencimento === hoje) return "vence_hoje";
  return p.valorPago > 0 ? "parcial" : "em_dia";
}

/** Faixas de atraso do relatório: 1-30, 31-60, 61-90, 90+ */
export function faixaAtraso(vencimento: string, hoje: string): "1-30" | "31-60" | "61-90" | "90+" | null {
  const dias = diasEntre(vencimento, hoje);
  if (dias <= 0) return null;
  if (dias <= 30) return "1-30";
  if (dias <= 60) return "31-60";
  if (dias <= 90) return "61-90";
  return "90+";
}
