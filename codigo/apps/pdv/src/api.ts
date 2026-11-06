// Conversa com o servidor do painel (app.freguez.com.br/api/pdv). O token do dispositivo fica neste navegador.

import { mudarConexao } from "./conexao";

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:3000";
const CHAVE = "freguez.pdv.token";
// Internet ruim conta como sem internet: o caixa não pode ficar travado esperando
const LIMITE_MS = 15000;

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    public status: number,
    public codigo?: string,
  ) {
    super(mensagem);
  }
}

/** Falha de rede (sem resposta do servidor): a operação pode ir para a fila offline. */
export const semInternet = (e: unknown) => e instanceof ErroApi && e.codigo === "offline";

export const token = {
  ler: () => {
    try {
      return localStorage.getItem(CHAVE);
    } catch {
      return null;
    }
  },
  salvar: (t: string) => localStorage.setItem(CHAVE, t),
  apagar: () => localStorage.removeItem(CHAVE),
};

export async function api<T>(caminho: string, corpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BASE}/api${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token.ler() ? { Authorization: `Bearer ${token.ler()}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(LIMITE_MS),
    });
  } catch {
    mudarConexao({ online: false });
    throw new ErroApi("Sem conexão com a internet. Verifique o roteador e tente de novo.", 0, "offline");
  }
  // Servidor fora do ar (gateway) também conta como sem internet: a operação vai para a fila
  if (r.status >= 502 && r.status <= 504) {
    mudarConexao({ online: false });
    throw new ErroApi("Servidor do Freguez fora do ar. Tente de novo em instantes.", 0, "offline");
  }
  mudarConexao({ online: true });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi(dados.erro ?? "Algo deu errado.", r.status, dados.codigo);
  return dados as T;
}
