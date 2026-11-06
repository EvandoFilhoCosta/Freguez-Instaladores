import {
  calcularTroco,
  descontoPermitido,
  formatarDataHora,
  formatarDinheiro,
  formatarPercentual,
  formatarQuantidade,
  gerarParcelas,
  hojeNoFuso,
  percentualDesconto,
  totaisVenda,
  uuidv7,
} from "@freguez/core";
import { Badge, cn } from "@freguez/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ErroApi, semInternet } from "./api";
import { Button, PinPad } from "./componentes";
import { useConexao } from "./conexao";
import { abrirTelaCliente, alternarTelaCheia, estaEmTelaCheia, noDesktop, versaoDoApp } from "./desktop";
import { imprimirPedidosDoApp } from "./impressao";
import { DialogoEtiquetas, DialogoImpressoras } from "./Impressoras";
import {
  DialogoAtalhos,
  DialogoBusca,
  DialogoCaixa,
  DialogoCliente,
  DialogoDesconto,
  DialogoFechar,
  DialogoFila,
  DialogoQuantidade,
  DialogoReceber,
  DialogoSuspensas,
  DialogoTroca,
  type Suspensa,
} from "./Operacoes";
import { Pagamento } from "./Pagamento";
import { DialogoPrevendas, numeroPedidoSite, numeroPrevenda, puxarPedidoSite, puxarPrevenda } from "./Prevenda";
import { DialogoProjeto, type ProjetoDaVenda } from "./Projeto";
import { DialogoRecibo } from "./Recibo";
import { enviarTela } from "./canalTela";
import { baixarEstoqueLocal, clienteLocal, conferirPinLocal, conferirPinVendedor, enfileirar, somarCrediarioLocal } from "./sincronia";
import type { ClienteDetalhe, Funcionario, Inicio, ItemCatalogo, ItemVenda, PagamentoEscolhido, Recibo } from "./tipos";

type Dialogo =
  | null
  | "busca"
  | "consulta"
  | "qtd"
  | "desconto"
  | "cliente"
  | "pagamento"
  | "receber"
  | "sangria"
  | "fechar"
  | "troca"
  | "suspensas"
  | "atalhos"
  | "fila"
  | "impressoras"
  | "etiquetas"
  | "prevendas"
  | "projeto";

type PedidoPin = { titulo: string; subtitulo?: string; erro?: string; resolver: (pin: string | null) => void };

const ATALHOS: [string, string][] = [
  ["F1", "Ajuda"],
  ["F2", "Buscar"],
  ["F3", "Quantidade"],
  ["F4", "Desconto"],
  ["F5", "Remover item"],
  ["F6", "Consultar preço"],
  ["F7", "Cliente"],
  ["F8", "Suspender"],
  ["F9", "Receber parcela"],
  ["F10", "Finalizar"],
  ["F11", "Sangria"],
  ["F12", "Projeto"],
  ["Ctrl+Shift+F", "Tela cheia"],
];

const SUSPENSAS = "freguez.pdv.suspensas";
const lerSuspensas = (): Suspensa[] => {
  try {
    return JSON.parse(localStorage.getItem(SUSPENSAS) ?? "[]");
  } catch {
    return [];
  }
};

let proximaChave = 1;

export function Venda({ inicio, catalogo, recarregar }: { inicio: Inicio; catalogo: ItemCatalogo[]; recarregar: () => Promise<void> }) {
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [descontoGeral, setDescontoGeral] = useState(0);
  const [cliente, setCliente] = useState<ClienteDetalhe | null>(null);
  const [projeto, setProjeto] = useState<ProjetoDaVenda | null>(null);
  // Pedido do site puxado ("S123"): a venda fecha o pedido e devolve a reserva do estoque
  const [pedidoSite, setPedidoSite] = useState<{ pedidoId: string; numero: number; cliente: string } | null>(null);
  const [vendedor, setVendedor] = useState<{ f: Funcionario; pin: string } | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [pedidoPin, setPedidoPin] = useState<PedidoPin | null>(null);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: "erro" | "ok" } | null>(null);
  const [codigo, setCodigo] = useState("");
  const conexao = useConexao();
  const online = conexao.online;
  // ID da venda nasce no caixa: o mesmo no envio na hora e na fila offline (nunca duplica)
  const idVenda = useRef(uuidv7());
  const [suspensas, setSuspensas] = useState<Suspensa[]>(lerSuspensas);
  const [versao, setVersao] = useState<string | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  useEffect(() => {
    const conferir = () => void estaEmTelaCheia().then(setTelaCheia, () => undefined);
    conferir();
    window.addEventListener("resize", conferir);
    return () => window.removeEventListener("resize", conferir);
  }, []);
  useEffect(() => {
    void versaoDoApp().then(setVersao);
  }, []);
  // Etiquetas pedidas pelo app do vendedor saem na impressora deste caixa (a cada 15 s)
  useEffect(() => {
    if (!noDesktop) return;
    const t = setInterval(() => {
      void imprimirPedidosDoApp(api)
        .then((n) => n && setAviso({ texto: `${n} pedido(s) de etiqueta do app impresso(s).`, tom: "ok" }))
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(t);
  }, []);
  const campo = useRef<HTMLInputElement>(null);
  // Venda recém-concluída: a tela do cliente mostra o "obrigado" por alguns segundos
  const [concluida, setConcluida] = useState<{ total: number; desconto: number; troco: number } | null>(null);
  useEffect(() => {
    if (!concluida) return;
    const t = setTimeout(() => setConcluida(null), 7000);
    return () => clearTimeout(t);
  }, [concluida]);
  // Desconto pedido de dentro da finalização: aplica e volta para o pagamento
  const voltarAoPagamento = useRef(false);

  // Índice para bipar: código de barras e SKU → item
  const porCodigo = useMemo(() => {
    const m = new Map<string, ItemCatalogo>();
    for (const i of catalogo) {
      for (const c of i.codigos) m.set(c, i);
      m.set(i.sku.toUpperCase(), i);
    }
    return m;
  }, [catalogo]);

  const totais = useMemo(
    () => totaisVenda(itens.map((i) => ({ quantidade: i.quantidade, precoUnit: i.item.preco, desconto: i.desconto })), Math.min(descontoGeral, Number.MAX_SAFE_INTEGER)),
    [itens, descontoGeral],
  );
  const pctDesconto = percentualDesconto(totais.descontoTotal, totais.bruto);

  const focar = useCallback(() => setTimeout(() => campo.current?.focus(), 0), []);
  const fechar = useCallback(() => {
    setDialogo(null);
    focar();
  }, [focar]);
  const avisar = (texto: string, tom: "erro" | "ok" = "erro") => {
    setAviso({ texto, tom });
    setTimeout(() => setAviso((a) => (a?.texto === texto ? null : a)), 5000);
  };

  // Pede um PIN e roda a ação; PIN errado pergunta de novo mostrando o erro.
  const pedirPin = (titulo: string, subtitulo?: string, erro?: string) =>
    new Promise<string | null>((resolver) => setPedidoPin({ titulo, subtitulo, erro, resolver }));
  const comPin = useCallback(async <T,>(titulo: string, acao: (pin: string) => Promise<T>, subtitulo?: string): Promise<T | null> => {
    let erro: string | undefined;
    for (;;) {
      const pin = await pedirPin(titulo, subtitulo, erro);
      if (!pin) return null;
      try {
        const r = await acao(pin);
        setPedidoPin(null);
        return r;
      } catch (e) {
        if (e instanceof ErroApi && e.codigo === "pin") {
          erro = e.message;
          continue;
        }
        setPedidoPin(null);
        throw e;
      }
    }
  }, []);

  // Segunda tela acompanha a venda: itens com foto, total até agora, conferência na finalização e "obrigado"
  const pagando = dialogo === "pagamento";
  useEffect(() => {
    const a = inicio.aparencia;
    enviarTela({
      fase: itens.length ? (pagando ? "pagamento" : "venda") : concluida ? "concluida" : "livre",
      loja: inicio.loja.nome,
      logo: a?.logo ?? null,
      corPrimaria: a?.corPrimaria ?? "#1e3a5f",
      corDestaque: a?.corDestaque ?? "#e8962e",
      mensagem: a?.telaClienteMensagem ?? "",
      itens: itens.map((i) => ({
        nome: i.item.nomeCurto || i.item.nome,
        variacao: i.item.variacao,
        quantidade: i.quantidade,
        preco: i.item.preco,
        desconto: i.desconto,
        total: Math.round(i.quantidade * i.item.preco) - i.desconto,
        foto: i.item.foto ?? null,
      })),
      bruto: itens.length ? totais.bruto : (concluida?.total ?? 0) + (concluida?.desconto ?? 0),
      desconto: itens.length ? totais.descontoTotal : (concluida?.desconto ?? 0),
      total: itens.length ? totais.total : (concluida?.total ?? 0),
      troco: concluida?.troco ?? 0,
    });
  }, [itens, totais, pagando, concluida, inicio.loja.nome, inicio.aparencia]);

  // Início da venda: PIN do vendedor (Start Geral 4.3, passo 2)
  const garantirVendedor = useCallback(async () => {
    if (vendedor) return vendedor;
    try {
      const r = await comPin("PIN do vendedor", (pin) => conferirPinVendedor(pin).then((f) => ({ f, pin })), "Quem está vendendo?");
      if (r) setVendedor(r);
      return r;
    } catch (e) {
      avisar(e instanceof Error ? e.message : "PIN não conferiu.");
      return null;
    } finally {
      focar();
    }
  }, [vendedor, comPin, focar]);

  const adicionar = useCallback(
    async (item: ItemCatalogo, quantidade = 1) => {
      if (!(await garantirVendedor())) return;
      if (!inicio.regras.venderSemEstoque && item.estoque < quantidade) {
        avisar(`Sem estoque de ${item.nome} ${item.variacao}.`);
        return;
      }
      if (item.estoque < quantidade) avisar(`${item.nome} ${item.variacao}: estoque do sistema é ${item.estoque}. A venda gera pendência de ajuste.`);
      setItens((xs) => {
        const existente = xs.find((x) => x.item.id === item.id && x.desconto === 0);
        if (existente) {
          setSelecionado(existente.chave);
          return xs.map((x) => (x === existente ? { ...x, quantidade: x.quantidade + quantidade } : x));
        }
        const novo = { chave: proximaChave++, item, quantidade, desconto: 0 };
        setSelecionado(novo.chave);
        return [...xs, novo];
      });
    },
    [garantirVendedor, inicio.regras.venderSemEstoque],
  );

  // Pré-venda do app: traz os itens para a venda atual
  const puxar = async (numero: number) => {
    try {
      const p = await puxarPrevenda(numero);
      const faltando: string[] = [];
      for (const i of p.itens) {
        const item = catalogo.find((c) => c.id === i.variacaoId);
        if (item) await adicionar(item, i.quantidade);
        else faltando.push(i.variacaoId);
      }
      avisar(
        faltando.length
          ? `Pré-venda P${p.numero}: ${faltando.length} item(ns) não estão no catálogo do caixa (atualize o catálogo).`
          : `Pré-venda P${p.numero} de ${p.vendedor}${p.cliente ? ` (${p.cliente})` : ""} carregada.`,
        faltando.length ? "erro" : "ok",
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível puxar a pré-venda.");
    }
  };

  // Pedido do site: cliente veio retirar e paga aqui
  const puxarPedido = async (numero: number) => {
    if (pedidoSite) return avisar(`Esta venda já é do pedido S${pedidoSite.numero}. Finalize ou limpe antes de puxar outro.`);
    try {
      const p = await puxarPedidoSite(numero);
      const faltando: string[] = [];
      for (const i of p.itens) {
        const item = catalogo.find((c) => c.id === i.variacaoId);
        if (item) await adicionar(item, i.quantidade);
        else faltando.push(i.variacaoId);
      }
      setPedidoSite({ pedidoId: p.pedidoId, numero: p.numero, cliente: p.cliente });
      avisar(
        faltando.length
          ? `Pedido S${p.numero}: ${faltando.length} item(ns) não estão no catálogo do caixa (atualize o catálogo).`
          : `Pedido do site S${p.numero} de ${p.cliente} carregado.${p.descontoCentavos ? ` Tinha cupom de ${formatarDinheiro(p.descontoCentavos)}: dê o desconto com F4.` : ""}`,
        faltando.length ? "erro" : "ok",
      );
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Não foi possível puxar o pedido.");
    }
  };

  // Bipar: "3*789..." multiplica; Enter adiciona; "P123" puxa a pré-venda 123; "S123" o pedido do site
  const bipar = async () => {
    const texto = codigo.trim();
    setCodigo("");
    if (!texto) return;
    const pv = numeroPrevenda(texto);
    if (pv) return puxar(pv);
    const ps = numeroPedidoSite(texto);
    if (ps) return puxarPedido(ps);
    const m = texto.match(/^(\d+(?:[.,]\d+)?)\*(.*)$/);
    const qtd = m ? Number(m[1]!.replace(",", ".")) : 1;
    const chave = (m ? m[2]! : texto).trim().toUpperCase();
    const item = porCodigo.get(chave);
    if (!item) return avisar(`Código ${chave} não encontrado. Use F2 para buscar pelo nome.`);
    await adicionar(item, qtd);
  };

  const limparVenda = () => {
    setItens([]);
    setSelecionado(null);
    setDescontoGeral(0);
    setCliente(null);
    setVendedor(null);
    setProjeto(null);
    setPedidoSite(null);
    idVenda.current = uuidv7();
    focar();
  };

  const suspender = () => {
    if (!itens.length) return setDialogo("suspensas");
    const lista = [...suspensas, { id: Date.now(), itens, descontoGeral, clienteId: cliente?.cliente.id ?? null, clienteNome: cliente?.cliente.nome ?? null, em: new Date().toISOString() }];
    setSuspensas(lista);
    localStorage.setItem(SUSPENSAS, JSON.stringify(lista));
    limparVenda();
    avisar("Venda suspensa. F8 para retomar.", "ok");
  };
  const retomar = async (s: Suspensa) => {
    if (itens.length) return avisar("Finalize ou suspenda a venda atual antes de retomar outra.");
    const lista = suspensas.filter((x) => x.id !== s.id);
    setSuspensas(lista);
    localStorage.setItem(SUSPENSAS, JSON.stringify(lista));
    // Preço atualizado do catálogo
    setItens(s.itens.map((i) => ({ ...i, item: catalogo.find((c) => c.id === i.item.id) ?? i.item })));
    setDescontoGeral(s.descontoGeral);
    if (s.clienteId) {
      const id = s.clienteId;
      setCliente(await api<ClienteDetalhe>(`/pdv/clientes/${id}`).catch((e) => (semInternet(e) ? clienteLocal(id) : null)).catch(() => null));
    }
    fechar();
  };

  const finalizar = async (pagamentos: PagamentoEscolhido[], crediario: { parcelas: number; diaVencimento: number } | null, notaPedida: boolean, enviarRecibo: boolean) => {
    const v = vendedor ?? (await garantirVendedor());
    if (!v) throw new Error("Informe o PIN do vendedor para finalizar.");
    const corpo = {
      id: idVenda.current,
      pin: v.pin,
      clienteId: cliente?.cliente.id ?? null,
      itens: itens.map((i) => ({ variacaoId: i.item.id, quantidade: i.quantidade, descontoCentavos: i.desconto })),
      descontoGeralCentavos: descontoGeral,
      pagamentos,
      crediario,
      notaPedida,
      enviarRecibo,
      projeto: projeto ? { projetoId: projeto.projetoId, beneficiarioId: projeto.beneficiarioId, presenteId: projeto.presenteId || null } : null,
      pedidoId: pedidoSite?.pedidoId ?? null,
    };
    try {
      let r: { venda: Recibo };
      try {
        r = await api<{ venda: Recibo }>("/pdv/vendas", corpo);
      } catch (e) {
        if (!(e instanceof ErroApi && e.codigo === "precisa_autorizacao")) throw e;
        const autorizado = await comPin("PIN de quem autoriza o desconto", (pinAutorizador) => api<{ venda: Recibo }>("/pdv/vendas", { ...corpo, pinAutorizador }), e.message);
        if (!autorizado) throw new Error("Desconto não autorizado. Diminua o desconto ou peça o PIN do dono ou gerente.");
        r = autorizado;
      }
      setRecibo(r.venda);
      setConcluida({ total: r.venda.total, desconto: r.venda.descontoTotal, troco: r.venda.troco });
      setDialogo(null);
      limparVenda();
      void recarregar(); // estoque atualizado no catálogo
    } catch (e) {
      if (semInternet(e)) {
        if (pedidoSite) throw new Error("Pedido do site precisa de internet para fechar. Tente de novo quando a conexão voltar.");
        await finalizarOffline(v.f, pagamentos, crediario, notaPedida, enviarRecibo);
        return;
      }
      // Quem mostra o erro é a janela de pagamento (ela fica por cima e esconderia o aviso da tela)
      throw e instanceof Error ? e : new Error("Não foi possível finalizar.");
    }
  };

  // Sem internet (Start Geral 5.4): confere tudo aqui com os dados da última sincronização, guarda na fila
  // e mostra o recibo com código provisório. O servidor lança quando a internet voltar (mesmo ID: não duplica).
  const finalizarOffline = async (
    f: Funcionario,
    pagamentos: PagamentoEscolhido[],
    crediario: { parcelas: number; diaVencimento: number } | null,
    notaPedida: boolean,
    enviarRecibo: boolean,
  ) => {
    if (pagamentos.some((p) => p.forma === "vale")) throw new Error("Vale-troca precisa de internet. Escolha outra forma de pagamento.");
    const gestor = (x: Funcionario) => x.papel === "dono" || x.papel === "gerente";
    const soGestor = (pin: string) =>
      conferirPinLocal(pin).then((x) => {
        if (!gestor(x)) throw new ErroApi(`${x.nome} não é dono nem gerente.`, 403, "pin");
        return x;
      });

    let autorizadorId: string | null = null;
    if (pctDesconto > 0 && !gestor(f) && !descontoPermitido(pctDesconto, f.limiteDescontoPct)) {
      const aut = await comPin("PIN de quem autoriza o desconto", (pin) => conferirPinLocal(pin, "autorizar_desconto"), `Desconto de ${formatarPercentual(pctDesconto)} passa do limite de ${f.nome}.`);
      if (!aut) throw new Error("Desconto não autorizado. Diminua o desconto ou peça o PIN do dono ou gerente.");
      if (!gestor(aut) && !descontoPermitido(pctDesconto, aut.limiteDescontoPct)) throw new Error(`${aut.nome} pode autorizar até ${formatarPercentual(aut.limiteDescontoPct)}.`);
      autorizadorId = aut.id;
    }

    const valorCrediario = pagamentos.filter((p) => p.forma === "crediario").reduce((t, p) => t + p.valorCentavos, 0);
    let autorizadorCrediarioId: string | null = null;
    const limiteOffline = inicio.regras.limiteOfflineCentavos ?? 30000;
    if (valorCrediario > 0) {
      if (!(f.papel !== "vendedor" || f.permissoes?.vender_crediario)) throw new Error(`${f.nome} não pode vender no crediário. Peça a quem pode.`);
      if (valorCrediario > limiteOffline && !gestor(f)) {
        const g = await comPin("PIN do dono ou gerente", soGestor, `Sem internet: crediário acima de ${formatarDinheiro(limiteOffline)} precisa de autorização.`);
        if (!g) throw new Error("Crediário sem internet não autorizado.");
        autorizadorCrediarioId = g.id;
      }
    }

    const id = idVenda.current;
    const codigo = id.slice(-6).toUpperCase();
    const troco = calcularTroco(totais.total, pagamentos.map((p) => ({ forma: p.forma, valor: p.valorCentavos })));
    const parcelas = valorCrediario
      ? gerarParcelas({
          total: valorCrediario,
          parcelas: crediario?.parcelas ?? 1,
          diaVencimento: crediario?.diaVencimento ?? inicio.regras.diasSugeridos[0] ?? 10,
          dataCompra: hojeNoFuso(),
          diasMinimos: inicio.regras.diasMinimos,
        })
      : [];
    const descricao = (i: ItemCatalogo) => `${i.nomeCurto || i.nome}${i.variacao !== "Padrão" ? ` ${i.variacao}` : ""}`;

    await enfileirar(
      "venda",
      {
        vendedorId: f.id,
        autorizadorId,
        autorizadorCrediarioId,
        clienteId: cliente?.cliente.id ?? null,
        itens: itens.map((i) => ({ variacaoId: i.item.id, quantidade: i.quantidade, descontoCentavos: i.desconto, precoUnitCentavos: i.item.preco })),
        descontoGeralCentavos: descontoGeral,
        pagamentos,
        crediario,
        notaPedida,
        enviarRecibo,
        projeto: projeto ? { projetoId: projeto.projetoId, beneficiarioId: projeto.beneficiarioId, presenteId: projeto.presenteId || null } : null,
      },
      id,
    );
    await baixarEstoqueLocal(itens.map((i) => ({ variacaoId: i.item.id, quantidade: i.quantidade })));
    if (valorCrediario && cliente) await somarCrediarioLocal(cliente.cliente.id, parcelas, `Venda ${codigo} (sem internet)`);

    setRecibo({
      numero: null,
      codigoOffline: codigo,
      vendedor: f.nome,
      cliente: cliente?.cliente.nome ?? null,
      itens: itens.map((i) => ({ descricao: descricao(i.item), quantidade: i.quantidade, precoUnit: i.item.preco, desconto: i.desconto, total: Math.round(i.quantidade * i.item.preco) - i.desconto })),
      bruto: totais.bruto,
      descontoTotal: totais.descontoTotal,
      total: totais.total,
      troco,
      pagamentos: pagamentos.map((x) => ({ forma: x.forma, valor: x.valorCentavos, parcelasCartao: x.parcelasCartao })),
      parcelas,
      notaPedida,
    });
    setConcluida({ total: totais.total, desconto: totais.descontoTotal, troco });
    setDialogo(null);
    limparVenda();
    void recarregar(); // catálogo guardado já com o estoque baixado
  };

  // Atalhos de teclado (Guia Visual 6.2)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (pedidoPin || recibo) return;
      const mapa: Record<string, () => void> = {
        F1: () => setDialogo("atalhos"),
        F2: () => setDialogo("busca"),
        F3: () => selecionado != null && setDialogo("qtd"),
        F4: () => itens.length && setDialogo("desconto"),
        F5: () => {
          if (selecionado == null) return;
          setItens((xs) => xs.filter((x) => x.chave !== selecionado));
          setSelecionado(null);
        },
        F6: () => setDialogo("consulta"),
        F7: () => setDialogo("cliente"),
        F8: suspender,
        F9: () => setDialogo("receber"),
        F10: () => itens.length && setDialogo("pagamento"),
        F11: () => setDialogo("sangria"),
        F12: () => setDialogo("projeto"),
      };
      if (mapa[e.key] && !dialogo) {
        e.preventDefault();
        mapa[e.key]!();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const itemSel = itens.find((i) => i.chave === selecionado);

  return (
    <div className="caixa-fundo flex h-full flex-col">
      <header className="caixa-topo flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm text-white">
        <div className="flex items-center gap-3.5">
          {inicio.aparencia?.logo ? (
            <img src={inicio.aparencia.logo} alt={inicio.loja.nome} className="h-9 w-auto max-w-32 rounded-md bg-white object-contain px-1.5 py-1" />
          ) : (
            <img src="/freguez-simbolo.svg" alt="" width={36} height={36} className="rounded-xl bg-white p-1.5 shadow-sm" />
          )}
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight">{inicio.loja.nome}</p>
            <p className="text-xs text-white/60">
              {inicio.dispositivo.nome} · Vendedor: {vendedor?.f.nome ?? "—"}
            </p>
          </div>
          <Relogio />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            title={conexao.baixadoEm ? `Dados de ${formatarDataHora(conexao.baixadoEm)}` : undefined}
            className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold", online ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-400 text-navy-950")}
          >
            <span className={cn("size-2 rounded-full", online ? "bg-emerald-400" : "bg-navy-950")} />
            {online ? "Online" : "Sem internet: as vendas ficam guardadas neste caixa"}
          </span>
          {conexao.pendentes > 0 && (
            <button
              className={cn("rounded px-2 py-1 font-medium", conexao.comErro ? "bg-danger text-white" : "bg-black/10 hover:bg-black/20")}
              onClick={() => setDialogo("fila")}
            >
              {conexao.enviando ? "Enviando…" : `${conexao.pendentes} para enviar`}
              {conexao.comErro > 0 && ` · ${conexao.comErro} com erro`}
            </button>
          )}
          {versao && <span className="px-1 text-xs text-white/40">v{versao}</span>}
          <button
            className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
            title="Atalho: Ctrl+Shift+F"
            onClick={() => void alternarTelaCheia().then(setTelaCheia, () => undefined)}
          >
            {telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          </button>
          <button className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/10 hover:text-white" onClick={() => void abrirTelaCliente()}>
            Tela do cliente
          </button>
          {noDesktop && (
            <>
              <button className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/10 hover:text-white" onClick={() => setDialogo("etiquetas")}>
                Etiquetas
              </button>
              <button className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/10 hover:text-white" onClick={() => setDialogo("impressoras")}>
                Equipamentos
              </button>
            </>
          )}
          <button className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/10 hover:text-white" onClick={() => setDialogo("troca")}>
            Troca / devolução
          </button>
          <button className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/10 hover:text-white" onClick={() => setDialogo("fechar")}>
            Fechar caixa
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[62fr_38fr]">
        <section className="flex min-h-0 flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void bipar();
            }}
          >
            <label htmlFor="codigo" className="sr-only">
              Código de barras
            </label>
            <span className="relative block">
            <svg aria-hidden="true" className="pointer-events-none absolute top-1/2 left-5 size-6 -translate-y-1/2 text-navy-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" />
            </svg>
            <input
              id="codigo"
              ref={campo}
              autoFocus
              autoComplete="off"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              onBlur={() => !dialogo && !pedidoPin && focar()}
              placeholder="Bipe o código ou digite (F2 busca) — 3* antes do código multiplica"
              className="caixa-cartao h-16 w-full rounded-2xl border-2 border-transparent pr-5 pl-14 text-xl placeholder:text-slate-400 focus-visible:border-navy-500 focus-visible:outline-none"
            />
            </span>
          </form>
          {aviso && (
            <p role="alert" className={cn("rounded-md px-3 py-2 text-sm", aviso.tom === "erro" ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
              {aviso.texto}
            </p>
          )}
          {pedidoSite && itens.length > 0 && (
            <p className="rounded-md bg-navy-50 px-3 py-2 text-sm font-medium text-navy-900">
              Pedido do site S{pedidoSite.numero} · {pedidoSite.cliente} — ao finalizar, o pedido fica entregue
            </p>
          )}
          <div className="caixa-cartao min-h-0 flex-1 overflow-auto rounded-2xl">
            {!itens.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 p-10 text-center">
                <span className="flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-navy-50 to-navy-100 text-navy-700 ring-1 ring-navy-100">
                  <svg aria-hidden="true" className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" />
                  </svg>
                </span>
                <div>
                  <p className="text-4xl font-extrabold tracking-tight text-navy-900">Pronto para vender</p>
                  <p className="mt-2 text-lg text-ink-muted">Bipe o primeiro produto ou digite o código.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-3 text-sm text-ink-muted">
                  {[
                    ["F2", "buscar pelo nome"],
                    ["F7", "escolher o cliente"],
                    ["P123", "puxar pré-venda do app"],
                    ["S123", "puxar pedido do site"],
                  ].map(([k, t]) => (
                    <span key={k} className="inline-flex items-center gap-2 rounded-lg bg-canvas px-3 py-2">
                      <kbd className="rounded-md bg-surface px-2 py-0.5 font-sans text-xs font-bold text-ink shadow-[0_1px_0_rgb(16_31_51/0.15)] ring-1 ring-line">{k}</kbd>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                <li aria-hidden="true" className="sticky top-0 z-10 flex justify-between bg-white/95 px-5 py-2.5 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase backdrop-blur">
                  <span>Produto · {itens.length} {itens.length === 1 ? "item" : "itens"}</span>
                  <span>Qtd × preço · Total</span>
                </li>
                {itens.map((i) => (
                  <li key={i.chave}>
                    <button
                      onClick={() => setSelecionado(i.chave)}
                      className={cn("bipado relative flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-canvas", selecionado === i.chave && "bg-navy-50 hover:bg-navy-50 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-navy-600")}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <Miniatura item={i.item} />
                        <span className="min-w-0">
                        <span className="text-[16px] font-semibold">{i.item.nome}</span> <span className="text-ink-muted">{i.item.variacao !== "Padrão" ? i.item.variacao : ""}</span>
                        {i.item.promocao && <Badge tone="warning" className="ml-2">Promoção</Badge>}
                        {i.desconto > 0 && <span className="ml-2 text-xs text-warning">desc. {formatarDinheiro(i.desconto)}</span>}
                        </span>
                      </span>
                      <span className="num shrink-0 text-right">
                        <span className="text-sm text-ink-muted">
                          {formatarQuantidade(i.quantidade, i.item.unidade)} × {formatarDinheiro(i.item.preco)}
                        </span>
                        <span className="ml-5 text-[17px] font-bold">{formatarDinheiro(Math.round(i.quantidade * i.item.preco) - i.desconto)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-3">
          {projeto && (
            <button onClick={() => setDialogo("projeto")} className="rounded-lg border border-accent bg-amber-50 p-3 text-left text-sm">
              <span className="text-xs text-ink-muted uppercase">Projeto (F12)</span>
              <span className="block">
                <strong>{projeto.beneficiarioNome}</strong> · {projeto.projetoNome}
                {projeto.presenteId && <span className="num text-ink-muted"> · {projeto.presenteId}</span>}
              </span>
            </button>
          )}
          <button onClick={() => setDialogo("cliente")} className="caixa-cartao rounded-2xl p-4 text-left transition hover:ring-2 hover:ring-navy-200">
            <span className="text-xs font-medium text-ink-muted">Cliente · F7</span>
            {cliente ? (
              <span className="block">
                <span className="font-medium">{cliente.cliente.nome}</span> <span className="num text-sm text-ink-muted">#{cliente.cliente.numero}</span>
                {cliente.cliente.atrasado > 0 && <Badge tone="danger" className="ml-2">Atrasado {formatarDinheiro(cliente.cliente.atrasado)}</Badge>}
                {cliente.cliente.status === "bloqueado" && <Badge tone="danger" className="ml-2">Bloqueado</Badge>}
              </span>
            ) : (
              <span className="block text-ink-muted">Não identificado</span>
            )}
          </button>
          <div className="caixa-total rounded-2xl p-6 text-white">
            <dl className="num flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-white/60">Subtotal · {itens.reduce((t, i) => t + i.quantidade, 0)} item(ns)</dt>
                <dd>{formatarDinheiro(totais.bruto)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-white/60">Descontos {pctDesconto > 0 && `(${formatarPercentual(pctDesconto)})`}</dt>
                <dd className={totais.descontoTotal ? "text-amber-300" : ""}>-{formatarDinheiro(totais.descontoTotal)}</dd>
              </div>
            </dl>
            <div className="my-4 h-px bg-gradient-to-r from-white/0 via-white/15 to-white/0" />
            <p className="text-[11px] font-semibold tracking-[0.25em] text-white/55 uppercase">Total a pagar</p>
            <p className="num mt-1 text-[3.5rem] leading-none font-extrabold tracking-tight">{formatarDinheiro(totais.total)}</p>
            {vendedor && pctDesconto > 0 && vendedor.f.papel === "vendedor" && pctDesconto > vendedor.f.limiteDescontoPct && (
              <p className="mt-2 text-xs text-amber-300">Acima do limite de {vendedor.f.nome}: vai pedir autorização.</p>
            )}
          </div>
          <button className="caixa-finalizar flex h-16 w-full items-center justify-between rounded-2xl px-6 text-xl font-extrabold tracking-tight transition active:scale-[0.99]" disabled={!itens.length} onClick={() => setDialogo("pagamento")}>
            <span>Finalizar venda</span>
            <kbd className="rounded-lg bg-black/10 px-2.5 py-1 font-sans text-sm font-bold">F10</kbd>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDialogo("receber")}>
              Receber parcela (F9)
            </Button>
            <Button variant="secondary" onClick={suspender}>
              {itens.length ? "Suspender (F8)" : `Suspensas (${suspensas.length})`}
            </Button>
            <Button variant="ghost" disabled={!itens.length} onClick={() => setDialogo("desconto")}>
              Desconto (F4)
            </Button>
            <Button variant="ghost" disabled={!itens.length} onClick={limparVenda}>
              Cancelar venda
            </Button>
            <Button variant="ghost" className="col-span-2" onClick={() => setDialogo("prevendas")}>
              Pré-vendas do app
            </Button>
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line bg-white/80 px-5 py-2.5 text-xs text-ink-muted backdrop-blur">
        {ATALHOS.filter(([k]) => k.startsWith("F")).map(([k, t]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <kbd className="rounded-md bg-canvas px-1.5 py-0.5 font-sans text-[11px] font-bold text-ink shadow-[0_1px_0_rgb(16_31_51/0.15)] ring-1 ring-line">{k}</kbd> {t}
          </span>
        ))}
      </footer>

      {dialogo === "atalhos" && (
        <DialogoAtalhos atalhos={ATALHOS} aoFechar={fechar} />
      )}
      {(dialogo === "busca" || dialogo === "consulta") && (
        <DialogoBusca
          catalogo={catalogo}
          soConsulta={dialogo === "consulta"}
          aoEscolher={(item) => {
            fechar();
            void adicionar(item);
          }}
          aoFechar={fechar}
        />
      )}
      {dialogo === "qtd" && itemSel && (
        <DialogoQuantidade
          item={itemSel}
          aoConfirmar={(q) => {
            setItens((xs) => xs.map((x) => (x.chave === itemSel.chave ? { ...x, quantidade: q } : x)));
            fechar();
          }}
          aoFechar={fechar}
        />
      )}
      {dialogo === "desconto" && (
        <DialogoDesconto
          item={itemSel}
          subtotal={totais.subtotal}
          aoAplicar={(alvo, valor) => {
            if (alvo === "item" && itemSel) setItens((xs) => xs.map((x) => (x.chave === itemSel.chave ? { ...x, desconto: valor } : x)));
            else setDescontoGeral(valor);
            if (voltarAoPagamento.current) {
              voltarAoPagamento.current = false;
              setDialogo("pagamento");
            } else fechar();
          }}
          aoFechar={() => {
            if (voltarAoPagamento.current) {
              voltarAoPagamento.current = false;
              setDialogo("pagamento");
            } else fechar();
          }}
        />
      )}
      {dialogo === "cliente" && (
        <DialogoCliente
          atual={cliente}
          aoEscolher={(c) => {
            setCliente(c);
            fechar();
          }}
          aoFechar={fechar}
        />
      )}
      {dialogo === "pagamento" && (
        <Pagamento
          total={totais.total}
          cliente={cliente}
          regras={inicio.regras}
          hoje={online ? inicio.hoje : hojeNoFuso()}
          aviso={
            online
              ? undefined
              : `Sem internet: a venda fica guardada e é enviada depois. Crediário usa o saldo de ${conexao.baixadoEm ? formatarDataHora(conexao.baixadoEm) : "quando o caixa abriu"}; vale-troca só com internet.`
          }
          aoConfirmar={finalizar}
          aoPedirCliente={() => setDialogo("cliente")}
          desconto={totais.descontoTotal}
          aoPedirDesconto={() => {
            voltarAoPagamento.current = true;
            setDialogo("desconto");
          }}
          aoFechar={fechar}
        />
      )}
      {dialogo === "receber" && (
        <DialogoReceber clienteInicial={cliente} loja={inicio.loja} modoLoja={inicio.regras.modoExcedente} hoje={inicio.hoje} comPin={comPin} aoFechar={fechar} aoConcluir={(msg) => avisar(msg, "ok")} />
      )}
      {dialogo === "sangria" && <DialogoCaixa comPin={comPin} aoFechar={fechar} aoConcluir={(msg) => avisar(msg, "ok")} />}
      {dialogo === "fechar" && <DialogoFechar comPin={comPin} aoFechar={fechar} aoFechado={() => void recarregar()} />}
      {dialogo === "troca" && <DialogoTroca comPin={comPin} aoFechar={fechar} aoConcluir={(msg) => avisar(msg, "ok")} />}
      {dialogo === "suspensas" && <DialogoSuspensas suspensas={suspensas} aoRetomar={(s) => void retomar(s)} aoFechar={fechar} />}
      {dialogo === "fila" && <DialogoFila aoFechar={fechar} />}
      {dialogo === "projeto" && (
        <DialogoProjeto
          atual={projeto}
          aoEscolher={(p) => {
            setProjeto(p);
            fechar();
          }}
          aoFechar={fechar}
        />
      )}
      {dialogo === "impressoras" && <DialogoImpressoras aoFechar={fechar} />}
      {dialogo === "prevendas" && (
        <DialogoPrevendas
          aoPuxar={(n) => {
            fechar();
            void puxar(n);
          }}
          aoFechar={fechar}
        />
      )}
      {dialogo === "etiquetas" && <DialogoEtiquetas catalogo={catalogo} aoFechar={fechar} />}

      {pedidoPin && (
        <PinPad
          titulo={pedidoPin.titulo}
          subtitulo={pedidoPin.subtitulo}
          erro={pedidoPin.erro}
          aoConfirmar={(pin) => pedidoPin.resolver(pin)}
          aoFechar={() => {
            pedidoPin.resolver(null);
            setPedidoPin(null);
            focar();
          }}
        />
      )}
      {recibo && (
        <DialogoRecibo
          recibo={recibo}
          loja={inicio.loja}
          regras={inicio.regras}
          aparencia={inicio.aparencia}
          aoFechar={() => {
            setRecibo(null);
            focar();
          }}
        />
      )}
    </div>
  );
}

/** Miniatura do produto na lista (a foto vem da internet; sem foto ou offline, a inicial do nome). */
function Miniatura({ item }: { item: ItemCatalogo }) {
  const [erro, setErro] = useState(false);
  if (!item.foto || erro) {
    return <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-navy-50 to-navy-100 text-base font-bold text-navy-700 ring-1 ring-navy-100">{item.nome.trim()[0]?.toUpperCase()}</span>;
  }
  return <img src={item.foto} alt="" onError={() => setErro(true)} className="size-11 shrink-0 rounded-xl bg-white object-cover ring-1 ring-line" />;
}

function Relogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="ml-3 hidden rounded-lg bg-white/[0.07] px-3 py-1.5 text-[13px] font-semibold tabular-nums text-white/80 lg:inline">
      {agora.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })} · {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}
