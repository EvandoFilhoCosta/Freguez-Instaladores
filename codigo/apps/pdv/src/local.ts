// Banco local do caixa (Start Geral 5.4). No app Windows é SQLite (caixa.db na pasta de dados do app);
// no navegador, localStorage — só como medida de emergência (Fase 1).
// Guarda duas coisas: o cache do que veio do servidor (catálogo, clientes, funcionários…) e a fila de saída.

import { noDesktop } from "./desktop";

export type TipoFila = "venda" | "recebimento" | "movimento";
export type ItemFila = { id: string; tipo: TipoFila; ocorridoEm: string; dados: Record<string, unknown>; tentativas: number; erro: string | null };

type Armazem = {
  ler<T>(chave: string): Promise<T | null>;
  gravar(chave: string, valor: unknown): Promise<void>;
  enfileirar(item: Omit<ItemFila, "tentativas" | "erro">): Promise<void>;
  fila(): Promise<ItemFila[]>;
  tirar(id: string): Promise<void>;
  marcarErro(id: string, erro: string): Promise<void>;
};

async function sqlite(): Promise<Armazem> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const db = await Database.load("sqlite:caixa.db");
  await db.execute(`create table if not exists cache (chave text primary key, valor text not null, atualizado_em text not null)`);
  await db.execute(
    `create table if not exists fila (id text primary key, tipo text not null, ocorrido_em text not null, dados text not null,
                                      tentativas integer not null default 0, erro text)`,
  );
  type Linha = { id: string; tipo: TipoFila; ocorrido_em: string; dados: string; tentativas: number; erro: string | null };
  return {
    async ler(chave) {
      const r = await db.select<{ valor: string }[]>("select valor from cache where chave = $1", [chave]);
      return r[0] ? JSON.parse(r[0].valor) : null;
    },
    async gravar(chave, valor) {
      await db.execute(
        "insert into cache (chave, valor, atualizado_em) values ($1, $2, $3) on conflict (chave) do update set valor = excluded.valor, atualizado_em = excluded.atualizado_em",
        [chave, JSON.stringify(valor), new Date().toISOString()],
      );
    },
    async enfileirar(i) {
      await db.execute("insert into fila (id, tipo, ocorrido_em, dados) values ($1, $2, $3, $4)", [i.id, i.tipo, i.ocorridoEm, JSON.stringify(i.dados)]);
    },
    async fila() {
      // UUID v7 ordena pela hora: envia na ordem em que aconteceu
      const r = await db.select<Linha[]>("select * from fila order by id");
      return r.map((l) => ({ id: l.id, tipo: l.tipo, ocorridoEm: l.ocorrido_em, dados: JSON.parse(l.dados), tentativas: l.tentativas, erro: l.erro }));
    },
    async tirar(id) {
      await db.execute("delete from fila where id = $1", [id]);
    },
    async marcarErro(id, erro) {
      await db.execute("update fila set tentativas = tentativas + 1, erro = $2 where id = $1", [id, erro]);
    },
  };
}

function navegador(): Armazem {
  const P = "freguez.pdv.";
  const lerFila = (): ItemFila[] => JSON.parse(localStorage.getItem(P + "fila") ?? "[]");
  const gravarFila = (f: ItemFila[]) => localStorage.setItem(P + "fila", JSON.stringify(f));
  return {
    async ler(chave) {
      try {
        const v = localStorage.getItem(P + "cache." + chave);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    },
    async gravar(chave, valor) {
      try {
        localStorage.setItem(P + "cache." + chave, JSON.stringify(valor));
      } catch {
        // Cota cheia: o cache é só conveniência; a fila tem prioridade
      }
    },
    async enfileirar(i) {
      gravarFila([...lerFila(), { ...i, tentativas: 0, erro: null }]);
    },
    async fila() {
      return lerFila().sort((a, b) => (a.id < b.id ? -1 : 1));
    },
    async tirar(id) {
      gravarFila(lerFila().filter((x) => x.id !== id));
    },
    async marcarErro(id, erro) {
      gravarFila(lerFila().map((x) => (x.id === id ? { ...x, tentativas: x.tentativas + 1, erro } : x)));
    },
  };
}

let armazem: Promise<Armazem> | null = null;
/** Abre o banco uma vez. Se o SQLite falhar (não deveria), cai no localStorage para não parar o caixa. */
export function local(): Promise<Armazem> {
  armazem ??= noDesktop ? sqlite().catch((e) => (console.error("SQLite:", e), navegador())) : Promise.resolve(navegador());
  return armazem;
}
