// Estado da conexão e da fila, para o cabeçalho do caixa (useSyncExternalStore).

import { useSyncExternalStore } from "react";

export type EstadoConexao = { online: boolean; pendentes: number; comErro: number; enviando: boolean; baixadoEm: string | null };

let estado: EstadoConexao = { online: typeof navigator === "undefined" || navigator.onLine, pendentes: 0, comErro: 0, enviando: false, baixadoEm: null };
const ouvintes = new Set<() => void>();

export function mudarConexao(parcial: Partial<EstadoConexao>) {
  const novo = { ...estado, ...parcial };
  if (Object.entries(parcial).every(([k, v]) => estado[k as keyof EstadoConexao] === v)) return;
  estado = novo;
  for (const o of ouvintes) o();
}

export const estadoConexao = () => estado;

export function useConexao() {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => estado,
  );
}
