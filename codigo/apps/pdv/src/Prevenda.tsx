// Pré-vendas (Fase 8): sacolas montadas pelo vendedor no app. O caixa puxa pelo número (digitando ou
// bipando "P123") ou escolhendo na lista; os itens entram na venda atual.
import { formatarDinheiro } from "@freguez/core";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Button, Dialogo, Erro, Rodape } from "./componentes";

export type PrevendaPuxada = { numero: number; vendedor: string; cliente: string | null; itens: { variacaoId: string; quantidade: number }[] };
type Resumo = { numero: number; vendedor: string; cliente: string | null; total: number; itens: number; criadoEm: string };

/** "P123" ou "p 123" → 123; outro texto → null. */
export const numeroPrevenda = (texto: string) => {
  const m = texto.trim().match(/^P\s?(\d{1,7})$/i);
  return m ? Number(m[1]) : null;
};

export const puxarPrevenda = (numero: number) => api<PrevendaPuxada>(`/pdv/prevendas/${numero}`, {});

/** Pedido do site para retirar e pagar no balcão: "S123" → 123. */
export const numeroPedidoSite = (texto: string) => {
  const m = texto.trim().match(/^S\s?(\d{1,7})$/i);
  return m ? Number(m[1]) : null;
};
export type PedidoSitePuxado = { pedidoId: string; numero: number; cliente: string; descontoCentavos: number; itens: { variacaoId: string; quantidade: number }[] };
export const puxarPedidoSite = (numero: number) => api<PedidoSitePuxado>(`/pdv/pedidos/${numero}`, {});

export function DialogoPrevendas({ aoPuxar, aoFechar }: { aoPuxar: (numero: number) => void; aoFechar: () => void }) {
  const [lista, setLista] = useState<Resumo[]>();
  const [erro, setErro] = useState<string>();
  useEffect(() => {
    api<{ prevendas: Resumo[] }>("/pdv/prevendas").then(
      (r) => setLista(r.prevendas),
      (e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar."),
    );
  }, []);
  return (
    <Dialogo titulo="Pré-vendas do app" aoFechar={aoFechar} largura="max-w-xl">
      <p className="mb-3 text-sm text-ink-muted">Dica: digite ou bipe o código (ex.: P123) direto no campo do código de barras.</p>
      {erro && <Erro>{erro}</Erro>}
      {!lista && !erro && <p className="text-sm text-ink-muted">Carregando…</p>}
      {lista && !lista.length && <p className="text-sm text-ink-muted">Nenhuma pré-venda aberta nas últimas 24 horas.</p>}
      {!!lista?.length && (
        <ul className="flex max-h-96 flex-col divide-y divide-line overflow-y-auto">
          {lista.map((p) => (
            <li key={p.numero}>
              <button onClick={() => aoPuxar(p.numero)} className="flex w-full items-center gap-4 px-2 py-3 text-left hover:bg-slate-50">
                <span className="num w-16 text-lg font-bold">P{p.numero}</span>
                <span className="flex-1">
                  <span className="block font-medium">{p.cliente || "Sem nome"}</span>
                  <span className="text-xs text-ink-muted">
                    {p.vendedor} · {p.itens} item(ns) · {new Date(p.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </span>
                <span className="num font-semibold">{formatarDinheiro(p.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Rodape>
        <Button variant="secondary" onClick={aoFechar}>
          Fechar
        </Button>
      </Rodape>
    </Dialogo>
  );
}
