import { exigeDocumento, formatarData, formatarDinheiro, gerarParcelas, type FormaPagamento } from "@freguez/core";
import { cn } from "@freguez/ui";
import { useEffect, useMemo, useState } from "react";
import { Button, CampoDinheiro, Dialogo, Erro, Rodape, Rotulo } from "./componentes";
import type { ClienteDetalhe, Inicio, PagamentoEscolhido } from "./tipos";

const NOMES: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  crediario: "Crediário",
  vale: "Vale-troca",
};

export function Pagamento({
  total,
  desconto = 0,
  cliente,
  regras,
  hoje,
  aviso,
  aoConfirmar,
  aoPedirCliente,
  aoPedirDesconto,
  aoFechar,
}: {
  total: number;
  desconto?: number;
  cliente: ClienteDetalhe | null;
  regras: Inicio["regras"];
  hoje: string;
  aviso?: string;
  aoConfirmar: (p: PagamentoEscolhido[], crediario: { parcelas: number; diaVencimento: number } | null, notaPedida: boolean, enviarRecibo: boolean) => Promise<void>;
  aoPedirCliente: () => void;
  aoPedirDesconto?: () => void;
  aoFechar: () => void;
}) {
  const [lista, setLista] = useState<PagamentoEscolhido[]>([]);
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const pago = lista.reduce((t, p) => t + p.valorCentavos, 0);
  const restante = Math.max(total - pago, 0);
  const [valor, setValor] = useState(total);
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [referencia, setReferencia] = useState("");
  const [nParcelas, setNParcelas] = useState(1);
  const [dia, setDia] = useState(cliente?.cliente.diaVencimento ?? regras.diasSugeridos[0] ?? 10);
  const [valeId, setValeId] = useState(cliente?.vales[0]?.id ?? "");
  const [nota, setNota] = useState(false);
  const [recibo, setRecibo] = useState(!!cliente?.cliente.whatsapp);
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  const faltaCpf = !!regras.nfceAutomatica && exigeDocumento(total) && !cliente?.cliente.documento;
  const semDinheiro = lista.filter((p) => p.forma !== "dinheiro").reduce((t, p) => t + p.valorCentavos, 0);
  const troco = Math.max(pago - total, 0);
  const cobre = pago >= total && semDinheiro <= total;
  const crediarioValor = lista.filter((p) => p.forma === "crediario").reduce((t, p) => t + p.valorCentavos, 0);
  const previa = useMemo(() => {
    if (!crediarioValor) return [];
    try {
      return gerarParcelas({ total: crediarioValor, parcelas: nParcelas, diaVencimento: dia, dataCompra: hoje, diasMinimos: regras.diasMinimos });
    } catch {
      return [];
    }
  }, [crediarioValor, nParcelas, dia, hoje, regras.diasMinimos]);

  const adicionar = () => {
    setErro(undefined);
    if (!valor) return;
    if (forma !== "dinheiro" && valor > restante) return setErro(`${NOMES[forma]} não pode passar do que falta (${formatarDinheiro(restante)}).`);
    if ((forma === "crediario" || forma === "vale") && !cliente) return setErro("Identifique o cliente (F7) para crediário ou vale.");
    if (forma === "crediario" && cliente?.cliente.status === "bloqueado") return setErro(`${cliente.cliente.nome} está bloqueado(a) no crediário.`);
    if (forma === "crediario" && cliente?.cliente.disponivel != null && crediarioValor + valor > cliente.cliente.disponivel) {
      return setErro(`Passa do limite. Disponível: ${formatarDinheiro(cliente.cliente.disponivel)}.`);
    }
    if (forma === "vale") {
      const vale = cliente?.vales.find((v) => v.id === valeId);
      if (!vale) return setErro("Este cliente não tem vale-troca.");
      if (valor > vale.saldo) return setErro(`O vale tem ${formatarDinheiro(vale.saldo)}.`);
    }
    const novo: PagamentoEscolhido = {
      forma,
      valorCentavos: valor,
      ...(forma === "credito" ? { parcelasCartao } : {}),
      ...(forma === "vale" ? { creditoId: valeId } : {}),
      ...(referencia ? { referencia } : {}),
    };
    const nova = [...lista, novo];
    setLista(nova);
    setValor(Math.max(total - nova.reduce((t, p) => t + p.valorCentavos, 0), 0));
    setReferencia("");
  };

  const confirmar = async () => {
    setEnviando(true);
    setErro(undefined);
    try {
      await aoConfirmar(lista, crediarioValor ? { parcelas: nParcelas, diaVencimento: dia } : null, nota, recibo && !!cliente?.cliente.whatsapp);
    } catch (e) {
      // O erro tem que aparecer aqui: esta janela fica por cima de tudo e esconde os avisos da tela de trás
      setErro(e instanceof Error ? e.message : "Não foi possível finalizar a venda.");
    } finally {
      setEnviando(false);
    }
  };

  // Atalho: dar desconto sem sair da finalização (F4). Só antes de lançar pagamentos, porque muda o total.
  const podeDesconto = !!aoPedirDesconto && lista.length === 0;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "F4" && podeDesconto) {
        e.preventDefault();
        aoPedirDesconto?.();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [podeDesconto, aoPedirDesconto]);

  const formas: FormaPagamento[] = ["dinheiro", "pix", "debito", "credito", "crediario", ...(cliente?.vales.length ? (["vale"] as const) : [])];

  return (
    <Dialogo titulo={`Pagamento · ${formatarDinheiro(total)}`} aoFechar={aoFechar} largura="max-w-2xl">
      {aviso && <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{aviso}</p>}
      {faltaCpf && (
        <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          Venda de R$ 500 ou mais sai com NFC-e e precisa do CPF do cliente (regra da Sefaz-PB).{" "}
          <button type="button" className="font-semibold underline" onClick={aoPedirCliente}>
            Identificar cliente (F7)
          </button>
        </p>
      )}
      {aoPedirDesconto && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-3">
          <p className="text-sm">
            {desconto > 0 ? (
              <>
                Desconto aplicado: <strong className="num text-warning">-{formatarDinheiro(desconto)}</strong>
              </>
            ) : (
              <span className="text-ink-muted">Sem desconto nesta venda.</span>
            )}
          </p>
          <Button variant="secondary" disabled={!podeDesconto} title={podeDesconto ? undefined : "Remova os pagamentos lançados para mudar o desconto"} onClick={aoPedirDesconto}>
            {desconto > 0 ? "Mudar desconto (F4)" : "Dar desconto (F4)"}
          </Button>
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {formas.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setForma(f);
                  setValor(restante || total);
                }}
                className={cn(
                  "h-14 rounded-lg border text-sm font-semibold",
                  forma === f ? "border-brand bg-brand text-white" : "border-slate-300 bg-surface hover:bg-slate-50",
                )}
              >
                {NOMES[f]}
              </button>
            ))}
          </div>
          <div>
            <Rotulo htmlFor="valor-pag">Valor em {NOMES[forma]}</Rotulo>
            <CampoDinheiro id="valor-pag" valor={valor} aoMudar={setValor} grande autoFocus aoEnter={adicionar} />
          </div>
          {forma === "credito" && (
            <div>
              <Rotulo htmlFor="parc-cartao">Parcelas no cartão</Rotulo>
              <select id="parc-cartao" value={parcelasCartao} onChange={(e) => setParcelasCartao(Number(e.target.value))} className="h-10 w-full rounded-md border border-slate-300 px-3">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "À vista" : `${n}×`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(forma === "pix" || forma === "debito" || forma === "credito") && (
            <div>
              <Rotulo htmlFor="ref">Final do comprovante / NSU (opcional)</Rotulo>
              <input id="ref" value={referencia} maxLength={40} onChange={(e) => setReferencia(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3" />
            </div>
          )}
          {forma === "vale" && cliente && (
            <div>
              <Rotulo htmlFor="vale">Vale-troca</Rotulo>
              <select id="vale" value={valeId} onChange={(e) => setValeId(e.target.value)} className="h-10 w-full rounded-md border border-slate-300 px-3">
                {cliente.vales.map((v) => (
                  <option key={v.id} value={v.id}>
                    Saldo {formatarDinheiro(v.saldo)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(forma === "crediario" || forma === "vale") && !cliente && (
            <Button variant="secondary" onClick={aoPedirCliente}>
              Identificar cliente (F7)
            </Button>
          )}
          {forma === "crediario" && cliente && (
            <p className="text-xs text-ink-muted">
              {cliente.cliente.nome} · em aberto {formatarDinheiro(cliente.cliente.emAberto)}
              {cliente.cliente.disponivel != null && ` · disponível ${formatarDinheiro(cliente.cliente.disponivel)}`}
              {cliente.cliente.atrasado > 0 && <span className="text-danger"> · atrasado {formatarDinheiro(cliente.cliente.atrasado)}</span>}
            </p>
          )}
          <Button variant="secondary" onClick={adicionar} disabled={!valor}>
            Adicionar {NOMES[forma]} (Enter)
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1 text-sm">
            {lista.map((p, i) => (
              <li key={i} className="num flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                <span>
                  {NOMES[p.forma]}
                  {p.parcelasCartao && p.parcelasCartao > 1 ? ` ${p.parcelasCartao}×` : ""}
                </span>
                <span className="flex items-center gap-2">
                  {formatarDinheiro(p.valorCentavos)}
                  <button className="text-xs text-danger hover:underline" onClick={() => setLista((l) => l.filter((_, j) => j !== i))}>
                    tirar
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <dl className="num text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Pago</dt>
              <dd>{formatarDinheiro(pago)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Falta</dt>
              <dd className={restante ? "text-danger" : ""}>{formatarDinheiro(restante)}</dd>
            </div>
          </dl>
          {troco > 0 && (
            <div className="rounded-lg bg-success-soft p-3 text-success">
              <p className="text-xs font-medium uppercase">Troco</p>
              <p className="num text-3xl font-extrabold">{formatarDinheiro(troco)}</p>
            </div>
          )}

          {crediarioValor > 0 && (
            <div className="rounded-lg border border-line p-3">
              <p className="mb-2 text-sm font-medium">Crediário: {formatarDinheiro(crediarioValor)}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Rotulo htmlFor="n-parc">Parcelas</Rotulo>
                  <select id="n-parc" value={nParcelas} onChange={(e) => setNParcelas(Number(e.target.value))} className="h-10 w-full rounded-md border border-slate-300 px-2">
                    {Array.from({ length: regras.maxParcelas }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}×
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Rotulo htmlFor="dia">Todo dia</Rotulo>
                  <input id="dia" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(Number(e.target.value))} className="num h-10 w-full rounded-md border border-slate-300 px-2" />
                </div>
              </div>
              <ul className="num mt-2 text-xs text-ink-muted">
                {previa.map((p) => (
                  <li key={p.numero} className="flex justify-between">
                    <span>
                      {p.numero}ª · {formatarData(p.vencimento)}
                    </span>
                    <span>{formatarDinheiro(p.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cliente?.cliente.podeNota && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nota} onChange={(e) => setNota(e.target.checked)} className="size-4 accent-brand" />
              Precisa de nota (o painel monta o espelho da NFA-e)
            </label>
          )}
          {cliente?.cliente.whatsapp && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recibo} onChange={(e) => setRecibo(e.target.checked)} className="size-4 accent-brand" />
              Enviar recibo no WhatsApp ({cliente.cliente.whatsapp})
            </label>
          )}
        </div>
      </div>
      {erro && (
        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {erro}
        </p>
      )}
      <Rodape>
        <Button variant="ghost" onClick={aoFechar}>
          Voltar
        </Button>
        <Button size="lg" disabled={!cobre || enviando || faltaCpf || (crediarioValor > 0 && !previa.length)} onClick={() => void confirmar()}>
          {enviando ? "Finalizando…" : troco ? `Finalizar · troco ${formatarDinheiro(troco)}` : "Finalizar venda"}
        </Button>
      </Rodape>
    </Dialogo>
  );
}
