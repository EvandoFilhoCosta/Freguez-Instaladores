import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { alternarTelaCheia, atualizarSeHouver, noDesktop, type EtapaAtualizacao } from "./desktop";
import "./estilo.css";
import { TelaCliente } from "./TelaCliente";

// ?tela=cliente abre a segunda tela (monitor virado para o cliente)
if (import.meta.env.VITE_APP === "cadastro") document.title = "Freguez Cadastro";
const segundaTela = new URLSearchParams(location.search).get("tela") === "cliente";
// Na tela do cliente, Ctrl+Shift+F (ou dois cliques) põe a janela em tela cheia no monitor onde ela está
if (segundaTela) {
  const alternar = () => void alternarTelaCheia(false).catch(() => undefined);
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") alternar();
  });
  window.addEventListener("dblclick", alternar);
}

/** No app Windows: antes de abrir o caixa, confere se há versão nova e se atualiza. */
function Inicio() {
  const [etapa, setEtapa] = useState<EtapaAtualizacao | "pronto">(noDesktop ? { etapa: "verificando" } : "pronto");
  useEffect(() => {
    if (!noDesktop) return;
    atualizarSeHouver(setEtapa)
      .catch((e) => console.error("Atualização:", e))
      .finally(() => setEtapa("pronto"));
  }, []);
  if (etapa === "pronto") return <App />;

  const pct = etapa.etapa === "baixando" && etapa.total ? Math.round((etapa.baixado / etapa.total) * 100) : null;
  return (
    <main className="flex h-full flex-col items-center justify-center gap-6 bg-navy-900 p-6 text-white">
      <img src="/freguez-logo-horizontal-negativo.svg" alt="Freguez" width={180} height={53} />
      <p className="text-lg" role="status">
        {etapa.etapa === "verificando"
          ? "Procurando atualizações…"
          : etapa.etapa === "baixando"
            ? `Baixando a versão ${etapa.versao}${pct != null ? ` (${pct}%)` : "…"}`
            : `Instalando a versão ${etapa.versao}. O caixa reabre sozinho.`}
      </p>
      {etapa.etapa === "baixando" && (
        <div className="h-2 w-72 overflow-hidden rounded bg-navy-700">
          <div className="h-2 bg-accent transition-all" style={{ width: `${pct ?? 10}%` }} />
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("raiz")!).render(<StrictMode>{segundaTela ? <TelaCliente /> : <Inicio />}</StrictMode>);
