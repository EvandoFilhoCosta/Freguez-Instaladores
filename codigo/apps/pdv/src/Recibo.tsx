import { formatarData, formatarDataHora, formatarDinheiro, formatarTelefone } from "@freguez/core";
import { useEffect, useRef, useState } from "react";
import { Button, Dialogo, Erro, Rodape } from "./componentes";
import { api } from "./api";
import { cupomVenda, danfeNfce, imprimirCupom, lerConfigImpressao, type NotaDaVenda } from "./impressao";
import type { Aparencia, Inicio, Recibo } from "./tipos";

const FORMAS: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", debito: "Cartão débito", credito: "Cartão crédito", crediario: "Crediário", vale: "Vale-troca" };

/** Cupom não fiscal 80 mm (Start Geral 4.3 — Recibo). No app Windows com impressora escolhida, sai em ESC/POS direto. */
export function DialogoRecibo({
  recibo,
  loja,
  regras,
  aparencia,
  aoFechar,
}: {
  recibo: Recibo;
  loja: Inicio["loja"];
  regras?: Inicio["regras"];
  aparencia?: Aparencia;
  aoFechar: () => void;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Enter") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);
  const [erroImp, setErroImp] = useState<string>();
  const textos = { cabecalho: aparencia?.cupomCabecalho, trocas: aparencia?.cupomTrocas, rodape: aparencia?.cupomRodape };
  const linhas = (t?: string) => (t ?? "").split(/\r?\n/).filter((l) => l.trim());
  const imprimir = async () => {
    setErroImp(undefined);
    try {
      if (!(await imprimirCupom((cfg) => cupomVenda(recibo, loja, cfg, textos), `Venda ${recibo.numero ?? recibo.codigoOffline}`))) window.print();
    } catch (e) {
      setErroImp(e instanceof Error ? e.message : String(e));
    }
  };
  // Impressão automática ao concluir (uma vez por recibo; o ref segura o duplo efeito do StrictMode)
  const impresso = useRef(false);
  useEffect(() => {
    if (impresso.current) return;
    impresso.current = true;
    void lerConfigImpressao().then((cfg) => {
      if (cfg.cupom && cfg.automatico) void imprimir();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Nota automática (Fase 5): acompanha por até 30 s; autorizada → imprime o DANFE da NFC-e
  const [nota, setNota] = useState<NotaDaVenda | null>(null);
  const esperaNota = !!recibo.id && (!!regras?.nfceAutomatica || recibo.notaPedida);
  const notaImpressa = useRef(false);
  useEffect(() => {
    if (!esperaNota) return;
    let vezes = 0;
    const t = setInterval(async () => {
      vezes++;
      const r = await api<{ nota: NotaDaVenda }>(`/pdv/notas/${recibo.id}`).catch(() => null);
      if (r) setNota(r.nota);
      const fim = r && r.nota.status !== "processando" && r.nota.status !== "pendente";
      if (fim || vezes >= 10) clearInterval(t);
      if (r?.nota.status === "emitida" && r.nota.tipo === "NFC-e" && regras?.imprimirNfce && !notaImpressa.current) {
        notaImpressa.current = true;
        void imprimirCupom((cfg) => danfeNfce(r.nota, recibo, loja, cfg), `NFC-e ${r.nota.numero}`).catch((e) => setErroImp(e instanceof Error ? e.message : String(e)));
      }
    }, 3000);
    return () => clearInterval(t);
  }, [esperaNota]); // eslint-disable-line react-hooks/exhaustive-deps
  const end = loja.endereco ?? {};
  return (
    <Dialogo titulo={recibo.numero != null ? `Venda #${recibo.numero} concluída` : "Venda guardada (sem internet)"} aoFechar={aoFechar} largura="max-w-md">
      {recibo.numero == null && (
        <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Sem internet: a venda ficou guardada neste caixa (código {recibo.codigoOffline}) e é enviada sozinha quando a conexão voltar. O número sai depois.
        </p>
      )}
      {recibo.troco > 0 && (
        <div className="mb-4 rounded-lg bg-success-soft p-3 text-success">
          <p className="text-xs font-medium uppercase">Troco</p>
          <p className="num text-3xl font-extrabold">{formatarDinheiro(recibo.troco)}</p>
        </div>
      )}
      {esperaNota ? (
        <p
          className={`mb-3 rounded-md px-3 py-2 text-sm ${nota?.status === "emitida" ? "bg-success-soft text-success" : nota?.status === "rejeitada" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}
        >
          {!nota || nota.status === "processando" || nota.status === "pendente"
            ? "Emitindo a nota fiscal…"
            : nota.status === "emitida"
              ? `${nota.tipo} autorizada nº ${nota.numero}${nota.homologacao ? " (homologação)" : ""}.`
              : `${nota.tipo} rejeitada: ${nota.mensagem ?? "veja em Notas fiscais no painel"}. A venda está gravada; o dono corrige e reenvia pelo painel.`}
        </p>
      ) : (
        recibo.notaPedida && <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">Nota pedida: o espelho está em Notas fiscais no painel.</p>
      )}
      <div className="imprimir max-h-[50vh] overflow-auto rounded-md border border-dashed border-line p-3 font-mono text-[11px] leading-tight print:max-h-none print:border-0">
        <p className="text-center font-bold">{loja.nome}</p>
        {end.rua && (
          <p className="text-center">
            {end.rua}
            {end.numero ? `, ${end.numero}` : ""} {end.cidade ? `- ${end.cidade}` : ""}
          </p>
        )}
        {loja.telefone && <p className="text-center">{formatarTelefone(loja.telefone)}</p>}
        {linhas(textos.cabecalho).map((l, k) => (
          <p key={k} className="text-center">
            {l}
          </p>
        ))}
        <p className="my-1 text-center">CUPOM NÃO FISCAL · VENDA {recibo.numero != null ? `#${recibo.numero}` : recibo.codigoOffline}</p>
        <p>{formatarDataHora(new Date().toISOString())}</p>
        <p>Vendedor: {recibo.vendedor}</p>
        {recibo.cliente && <p>Cliente: {recibo.cliente}</p>}
        <hr className="my-1 border-dashed border-ink" />
        {recibo.itens.map((i, k) => (
          <div key={k}>
            <p>{i.descricao}</p>
            <p className="flex justify-between">
              <span>
                {i.quantidade} × {formatarDinheiro(i.precoUnit)}
                {i.desconto ? ` -${formatarDinheiro(i.desconto)}` : ""}
              </span>
              <span>{formatarDinheiro(i.total)}</span>
            </p>
          </div>
        ))}
        <hr className="my-1 border-dashed border-ink" />
        <p className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatarDinheiro(recibo.bruto)}</span>
        </p>
        {recibo.descontoTotal > 0 && (
          <p className="flex justify-between">
            <span>Descontos</span>
            <span>-{formatarDinheiro(recibo.descontoTotal)}</span>
          </p>
        )}
        <p className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatarDinheiro(recibo.total)}</span>
        </p>
        {recibo.pagamentos.map((p, k) => (
          <p key={k} className="flex justify-between">
            <span>
              {FORMAS[p.forma] ?? p.forma}
              {p.parcelasCartao && p.parcelasCartao > 1 ? ` ${p.parcelasCartao}×` : ""}
            </span>
            <span>{formatarDinheiro(p.valor)}</span>
          </p>
        ))}
        {recibo.troco > 0 && (
          <p className="flex justify-between">
            <span>Troco</span>
            <span>{formatarDinheiro(recibo.troco)}</span>
          </p>
        )}
        {recibo.parcelas.length > 0 && (
          <>
            <hr className="my-1 border-dashed border-ink" />
            <p className="font-bold">CREDIÁRIO</p>
            {recibo.parcelas.map((p) => (
              <p key={p.numero} className="flex justify-between">
                <span>
                  {p.numero}ª {formatarData(p.vencimento)}
                </span>
                <span>{formatarDinheiro(p.valor)}</span>
              </p>
            ))}
            <p className="mt-2">Assinatura: ______________________</p>
          </>
        )}
        {linhas(textos.trocas).length > 0 && (
          <>
            <hr className="my-1 border-dashed border-ink" />
            {linhas(textos.trocas).map((l, k) => (
              <p key={k}>{l}</p>
            ))}
          </>
        )}
        <div className="mt-2 text-center">
          {(linhas(textos.rodape).length ? linhas(textos.rodape) : ["Obrigado pela preferência!"]).map((l, k) => (
            <p key={k}>{l}</p>
          ))}
        </div>
      </div>
      <Erro>{erroImp}</Erro>
      <Rodape>
        {nota?.status === "emitida" && nota.tipo === "NFC-e" && (
          <Button variant="secondary" onClick={() => void imprimirCupom((cfg) => danfeNfce(nota, recibo, loja, cfg), `NFC-e ${nota.numero}`).then((ok) => ok || setErroImp("Escolha a impressora de cupom em Impressoras."))}>
            Imprimir NFC-e
          </Button>
        )}
        <Button variant="secondary" onClick={() => void imprimir()}>
          Imprimir
        </Button>
        <Button onClick={aoFechar}>Nova venda (Enter)</Button>
      </Rodape>
    </Dialogo>
  );
}
