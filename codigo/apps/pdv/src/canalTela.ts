import { noDesktop } from "./desktop";

// Comunicação caixa → tela do cliente. No app Windows as duas janelas conversam por evento do Tauri (o
// BroadcastChannel não atravessa janelas do WebView2 de forma confiável); no navegador, BroadcastChannel.
// O último estado fica guardado: a tela aberta no meio da venda já começa certa.

export type ItemTela = { nome: string; variacao: string; quantidade: number; preco: number; desconto: number; total: number; foto: string | null };

export type EstadoTela = {
  fase: "livre" | "venda" | "pagamento" | "concluida";
  loja: string;
  logo: string | null;
  corPrimaria: string;
  corDestaque: string;
  mensagem: string;
  itens: ItemTela[];
  bruto: number;
  desconto: number;
  total: number;
  troco: number;
};

const EVENTO = "freguez-tela-cliente";
const GUARDADO = "freguez.tela-cliente";
const canal = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(EVENTO) : null;

export function enviarTela(e: EstadoTela) {
  try {
    localStorage.setItem(GUARDADO, JSON.stringify(e));
  } catch {
    // sem armazenamento: segue só pelo canal
  }
  canal?.postMessage(e);
  if (noDesktop) void import("@tauri-apps/api/event").then((m) => m.emit(EVENTO, e)).catch(() => {});
}

export function ouvirTela(aoMudar: (e: EstadoTela) => void): () => void {
  try {
    const g = localStorage.getItem(GUARDADO);
    if (g) aoMudar(JSON.parse(g) as EstadoTela);
  } catch {
    // ignora estado guardado inválido
  }
  const ouvinte = (ev: MessageEvent) => aoMudar(ev.data as EstadoTela);
  const local = canal ? new BroadcastChannel(EVENTO) : null;
  local?.addEventListener("message", ouvinte);
  const armazenamento = (ev: StorageEvent) => {
    if (ev.key === GUARDADO && ev.newValue) aoMudar(JSON.parse(ev.newValue) as EstadoTela);
  };
  window.addEventListener("storage", armazenamento);
  let pararTauri: (() => void) | null = null;
  let parado = false;
  if (noDesktop) {
    void import("@tauri-apps/api/event")
      .then((m) => m.listen<EstadoTela>(EVENTO, (ev) => aoMudar(ev.payload)))
      .then((f) => (parado ? f() : (pararTauri = f)))
      .catch(() => {});
  }
  return () => {
    parado = true;
    local?.close();
    window.removeEventListener("storage", armazenamento);
    pararTauri?.();
  };
}
