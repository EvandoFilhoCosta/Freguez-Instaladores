// Integração com o app Windows (Tauri). No navegador nada disso roda.

export const noDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function versaoDoApp(): Promise<string | null> {
  if (!noDesktop) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export type EtapaAtualizacao =
  | { etapa: "verificando" }
  | { etapa: "baixando"; versao: string; baixado: number; total: number | null }
  | { etapa: "instalando"; versao: string };

/**
 * Procura versão nova (latest.json no R2, assinada). Se houver: baixa, instala e reinicia.
 * Sem internet ou com erro, segue com a versão atual — o caixa nunca fica travado por causa disso.
 */
export async function atualizarSeHouver(aviso: (e: EtapaAtualizacao) => void): Promise<void> {
  if (!noDesktop) return;
  const [{ check }, { relaunch }] = await Promise.all([import("@tauri-apps/plugin-updater"), import("@tauri-apps/plugin-process")]);
  aviso({ etapa: "verificando" });
  const atualizacao = await Promise.race([
    check().catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 8000)),
  ]);
  if (!atualizacao) return;

  let baixado = 0;
  let total: number | null = null;
  await atualizacao.downloadAndInstall((ev) => {
    if (ev.event === "Started") total = ev.data.contentLength ?? null;
    if (ev.event === "Progress") {
      baixado += ev.data.chunkLength;
      aviso({ etapa: "baixando", versao: atualizacao.version, baixado, total });
    }
    if (ev.event === "Finished") aviso({ etapa: "instalando", versao: atualizacao.version });
  });
  await relaunch();
}

/** Segunda tela: no app Windows abre uma janela própria (dá para arrastar para o outro monitor). */
export async function abrirTelaCliente() {
  if (!noDesktop) {
    window.open("?tela=cliente", "tela-cliente", "popup");
    return;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existente = await WebviewWindow.getByLabel("tela-cliente");
  if (existente) return existente.setFocus();
  new WebviewWindow("tela-cliente", { url: "index.html?tela=cliente", title: "Freguez — Tela do cliente", width: 1024, height: 600 });
}

// Tela cheia (sem barra do Windows e sem a barra de título). A escolha fica guardada neste computador
// e vale na próxima vez que o caixa abrir. No navegador usa a tela cheia do próprio navegador.
const CHAVE_TELA_CHEIA = "freguez.telaCheia";

export function telaCheiaGuardada(): boolean {
  try {
    return localStorage.getItem(CHAVE_TELA_CHEIA) === "1";
  } catch {
    return false;
  }
}

export async function estaEmTelaCheia(): Promise<boolean> {
  if (!noDesktop) return !!document.fullscreenElement;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().isFullscreen();
}

export async function definirTelaCheia(ligar: boolean, guardar = true): Promise<void> {
  if (guardar) {
    try {
      localStorage.setItem(CHAVE_TELA_CHEIA, ligar ? "1" : "0");
    } catch {
      /* sem armazenamento: só não lembra na próxima vez */
    }
  }
  if (!noDesktop) {
    if (ligar && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
    if (!ligar && document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    return;
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setFullscreen(ligar);
}

export async function alternarTelaCheia(guardar = true): Promise<boolean> {
  const ligar = !(await estaEmTelaCheia());
  await definirTelaCheia(ligar, guardar);
  return ligar;
}
