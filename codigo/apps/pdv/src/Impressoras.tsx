import { formatarDinheiro, TAMANHOS_ETIQUETA, type TamanhoEtiqueta } from "@freguez/core";
import { cn } from "@freguez/ui";
import { useEffect, useMemo, useState } from "react";
import { Button, Dialogo, Erro, Rodape, Rotulo } from "./componentes";
import { cupomTeste, enviar, etiquetaProduto, gaveta, lerConfigImpressao, listarImpressoras, salvarConfigImpressao, type ConfigImpressao } from "./impressao";
import type { ItemCatalogo } from "./tipos";

const campo = "h-10 w-full rounded-md border border-slate-300 bg-surface px-3 focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:outline-none";
const msg = (e: unknown) => (e instanceof Error ? e.message : typeof e === "string" ? e : "Algo deu errado.");

/** Escolha das impressoras deste computador (cupom 80 mm e etiquetas) e testes. */
export function DialogoImpressoras({ aoFechar }: { aoFechar: () => void }) {
  const [cfg, setCfg] = useState<ConfigImpressao>();
  const [lista, setLista] = useState<string[]>([]);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  useEffect(() => {
    void lerConfigImpressao().then(setCfg);
    listarImpressoras().then(setLista, (e) => setErro(msg(e)));
  }, []);
  if (!cfg) return null;

  const mudar = (p: Partial<ConfigImpressao>) => {
    const novo = { ...cfg, ...p };
    setCfg(novo);
    void salvarConfigImpressao(novo);
  };
  const testar = async (oQue: string, impressora: string | null, dados: () => number[]) => {
    setErro(undefined);
    setOk(undefined);
    if (!impressora) return setErro("Escolha a impressora primeiro.");
    try {
      await enviar(impressora, dados(), `Freguez — ${oQue}`);
      setOk(`${oQue}: enviado para ${impressora}.`);
    } catch (e) {
      setErro(msg(e));
    }
  };
  const opcoes = (atual: string | null) => (
    <>
      <option value="">— Nenhuma (usar janela de impressão) —</option>
      {atual && !lista.includes(atual) && <option value={atual}>{atual} (não encontrada)</option>}
      {lista.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </>
  );

  return (
    <Dialogo titulo="Equipamentos deste caixa" aoFechar={aoFechar} largura="max-w-xl">
      <div className="flex flex-col gap-5 text-sm">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-semibold">Impressora de cupom 80 mm (ESC/POS)</legend>
          <p className="-mt-1 text-xs text-ink-muted">Sem impressora? Deixe em “Nenhuma”: a venda finaliza normalmente e o recibo fica na tela.</p>
          <div>
            <Rotulo htmlFor="imp-cupom">Impressora</Rotulo>
            <select id="imp-cupom" value={cfg.cupom ?? ""} onChange={(e) => mudar({ cupom: e.target.value || null })} className={campo}>
              {opcoes(cfg.cupom)}
            </select>
          </div>
          <div>
            <Rotulo htmlFor="imp-colunas">Largura</Rotulo>
            <select id="imp-colunas" value={cfg.colunas} onChange={(e) => mudar({ colunas: Number(e.target.value) as ConfigImpressao["colunas"] })} className={campo}>
              <option value={48}>80 mm — 48 colunas (padrão)</option>
              <option value={42}>80 mm — 42 colunas (Elgin i7, Bematech)</option>
              <option value={32}>58 mm — 32 colunas</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.automatico} onChange={(e) => mudar({ automatico: e.target.checked })} className="size-4" />
            Imprimir o cupom sozinho ao finalizar a venda
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={cfg.gaveta} onChange={(e) => mudar({ gaveta: e.target.checked })} className="size-4" />
            Tenho gaveta ligada na impressora (abre quando a venda tiver dinheiro)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void testar("Teste do cupom", cfg.cupom, () => cupomTeste(cfg))}>
              Imprimir teste
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void testar("Gaveta", cfg.cupom, gaveta)}>
              Abrir gaveta
            </Button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-semibold">Impressora de etiquetas (TSPL)</legend>
          <div>
            <Rotulo htmlFor="imp-etq">Impressora</Rotulo>
            <select id="imp-etq" value={cfg.etiqueta ?? ""} onChange={(e) => mudar({ etiqueta: e.target.value || null })} className={campo}>
              {opcoes(cfg.etiqueta)}
            </select>
          </div>
          <div>
            <Rotulo htmlFor="imp-tam">Tamanho da etiqueta (mm)</Rotulo>
            <select id="imp-tam" value={cfg.tamanho} onChange={(e) => mudar({ tamanho: e.target.value as TamanhoEtiqueta })} className={campo}>
              {TAMANHOS_ETIQUETA.map((t) => (
                <option key={t} value={t}>
                  {t.replace("x", " × ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void testar("Teste de etiqueta", cfg.etiqueta, () =>
                  etiquetaProduto({ id: "", sku: "TESTE-01", nome: "Etiqueta de teste", nomeCurto: null, variacao: "M / Azul", unidade: "UN", preco: 4990, precoCheio: 4990, promocao: false, codigos: ["2000000000015"], estoque: 0 }, 1, cfg),
                )
              }
            >
              Imprimir etiqueta de teste
            </Button>
          </div>
        </fieldset>
        <p className="text-xs text-ink-muted">
          Leitor de código de barras: não precisa configurar, ele funciona como teclado (é só bipar no campo do código). As impressoras precisam estar instaladas no Windows (driver do fabricante ou “Generic / Text Only”). A escolha fica só neste computador.
        </p>
        <Erro>{erro}</Erro>
        {ok && <p className="rounded-md bg-success-soft px-3 py-2 text-success">{ok}</p>}
      </div>
      <Rodape>
        <Button onClick={aoFechar}>Pronto</Button>
      </Rodape>
    </Dialogo>
  );
}

/** Etiquetas direto na impressora de etiquetas: escolhe o produto (bipe ou nome) e a quantidade. */
export function DialogoEtiquetas({ catalogo, aoFechar }: { catalogo: ItemCatalogo[]; aoFechar: () => void }) {
  const [q, setQ] = useState("");
  const [item, setItem] = useState<ItemCatalogo>();
  const [qtd, setQtd] = useState("1");
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const termo = q.trim().toLowerCase();
  const achados = useMemo(() => {
    if (termo.length < 2) return [];
    const exato = catalogo.filter((i) => i.codigos.includes(q.trim()) || i.sku.toLowerCase() === termo);
    if (exato.length) return exato;
    return catalogo.filter((i) => `${i.nome} ${i.variacao} ${i.sku}`.toLowerCase().includes(termo)).slice(0, 20);
  }, [catalogo, termo, q]);
  const n = Number(qtd);
  const pecas = (i: ItemCatalogo) => (i.estoque > 0 ? Math.ceil(i.estoque) : 0);
  // Outras variações do mesmo produto (mesma referência: as duas primeiras partes do SKU)
  const ref = (i: ItemCatalogo) => i.sku.split("-").slice(0, 2).join("-");
  const irmaos = item ? catalogo.filter((i) => ref(i) === ref(item) && pecas(i) > 0) : [];
  const totalIrmaos = irmaos.reduce((t, i) => t + pecas(i), 0);
  const escolher = (i: ItemCatalogo) => {
    setItem(i);
    setQtd(String(pecas(i) || 1)); // começa com a quantidade em estoque
  };

  const imprimirEstoque = async () => {
    setErro(undefined);
    setOk(undefined);
    try {
      const cfg = await lerConfigImpressao();
      if (!cfg.etiqueta) throw new Error("Escolha a impressora de etiquetas em Impressoras.");
      for (const i of irmaos) await enviar(cfg.etiqueta, etiquetaProduto(i, pecas(i), cfg), `Etiquetas ${i.sku}`);
      setOk(`${totalIrmaos} etiqueta(s) de ${item!.nome} enviada(s): ${irmaos.map((i) => `${pecas(i)} ${i.variacao}`).join(", ")}.`);
      setItem(undefined);
      setQ("");
      setQtd("1");
    } catch (e) {
      setErro(msg(e));
    }
  };

  const imprimir = async () => {
    setErro(undefined);
    setOk(undefined);
    try {
      const cfg = await lerConfigImpressao();
      if (!cfg.etiqueta) throw new Error("Escolha a impressora de etiquetas em Impressoras.");
      await enviar(cfg.etiqueta, etiquetaProduto(item!, n, cfg), `Etiquetas ${item!.sku}`);
      setOk(`${n} etiqueta(s) de ${item!.nome} ${item!.variacao} enviada(s).`);
      setItem(undefined);
      setQ("");
      setQtd("1");
    } catch (e) {
      setErro(msg(e));
    }
  };

  return (
    <Dialogo titulo="Imprimir etiquetas" aoFechar={aoFechar} largura="max-w-xl">
      {!item ? (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && achados.length === 1 && escolher(achados[0]!)}
            placeholder="Bipe o código ou digite o nome"
            aria-label="Produto"
            className={cn(campo, "h-12 text-lg")}
          />
          <ul className="mt-3 max-h-[50vh] divide-y divide-line overflow-auto">
            {achados.map((i) => (
              <li key={i.id}>
                <button onClick={() => escolher(i)} className="flex w-full justify-between gap-3 px-3 py-2 text-left hover:bg-navy-50">
                  <span>
                    <span className="font-medium">{i.nome}</span> <span className="text-ink-muted">{i.variacao}</span>
                    <span className="block text-xs text-ink-muted">{i.sku}</span>
                  </span>
                  <span className="num text-right">
                    {formatarDinheiro(i.preco)}
                    <span className={cn("block text-xs", pecas(i) ? "text-ink-muted" : "text-warning")}>{pecas(i) ? `${pecas(i)} em estoque` : "sem estoque"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p>
            <strong>{item.nome}</strong> {item.variacao} · <span className="num">{formatarDinheiro(item.preco)}</span>
            <span className="block text-xs text-ink-muted">
              {item.sku} · {item.codigos[0] ?? "sem código de barras (usa a referência)"}
            </span>
          </p>
          <div>
            <Rotulo htmlFor="etq-qtd">Quantas etiquetas</Rotulo>
            <input
              id="etq-qtd"
              autoFocus
              inputMode="numeric"
              value={qtd}
              onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && n >= 1 && void imprimir()}
              className={cn(campo, "num h-14 text-2xl")}
            />
            <p className="mt-1 text-xs text-ink-muted">Em estoque: {pecas(item)} {pecas(item) === 1 ? "peça" : "peças"}</p>
          </div>
          {irmaos.length > 1 && (
            <div className="rounded-lg bg-navy-50 p-3 text-sm">
              <p>
                Este produto tem <strong>{totalIrmaos}</strong> peça(s) em estoque: {irmaos.map((i) => `${pecas(i)} ${i.variacao}`).join(" · ")}
              </p>
              <Button className="mt-2" variant="secondary" onClick={() => void imprimirEstoque()}>
                Imprimir só o que tem em estoque ({totalIrmaos})
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="mt-3">
        <Erro>{erro}</Erro>
        {ok && <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">{ok}</p>}
      </div>
      {item && (
        <Rodape>
          <Button variant="ghost" onClick={() => setItem(undefined)}>
            Outro produto
          </Button>
          <Button disabled={!(n >= 1 && n <= 999)} onClick={() => void imprimir()}>
            Imprimir {n || ""}
          </Button>
        </Rodape>
      )}
    </Dialogo>
  );
}
