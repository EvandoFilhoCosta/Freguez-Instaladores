import type { FormaPagamento } from "@freguez/core";

export type ItemCatalogo = {
  id: string;
  sku: string;
  nome: string;
  nomeCurto: string | null;
  variacao: string;
  unidade: string;
  preco: number;
  precoCheio: number;
  promocao: boolean;
  codigos: string[];
  estoque: number;
  foto?: string | null; // miniatura (precisa de internet para carregar)
};

export type ItemVenda = { chave: number; item: ItemCatalogo; quantidade: number; desconto: number };

export type Funcionario = { id: string; nome: string; papel: "dono" | "gerente" | "vendedor"; limiteDescontoPct: number; permissoes: Record<string, boolean> };

export type Inicio = {
  dispositivo: { id: string; nome: string; tipo: string };
  loja: { nome: string; telefone: string | null; endereco: Record<string, string | null> | null };
  hoje: string;
  regras: { venderSemEstoque: boolean; maxParcelas: number; diasSugeridos: number[]; diasMinimos: number; modoExcedente: "A" | "B" | "C"; limiteOfflineCentavos?: number; nfceAutomatica?: boolean; imprimirNfce?: boolean };
  sessao: { id: string; fundo: number; abertoEm: string; abertoPor?: string } | null;
  /** Cores, logo e textos do totem escolhidos no painel (Configurações › Caixa e totem) */
  aparencia?: Aparencia;
};

export type ClienteResumo = {
  id: string;
  numero: number;
  nome: string;
  tipo: string;
  documento: string | null;
  whatsapp?: string | null;
  status: string;
  dadosIncompletos: boolean;
};

export type ClienteDetalhe = {
  cliente: ClienteResumo & {
    podeNota: boolean;
    diaVencimento: number | null;
    limite: number | null;
    disponivel: number | null;
    emAberto: number;
    atrasado: number;
  };
  parcelas: { id: string; numero: number; total: number; descricao: string | null; compraCriadaEm: string; vencimento: string; valor: number; valorPago: number }[];
  vales: { id: string; saldo: number; criadoEm: string }[];
};

export type PagamentoEscolhido = { forma: FormaPagamento; valorCentavos: number; parcelasCartao?: number; creditoId?: string; referencia?: string };

export type Recibo = {
  /** id da venda (para acompanhar a nota fiscal) */
  id?: string;
  /** null: venda feita sem internet, ainda na fila (o número nasce no servidor) */
  numero: number | null;
  codigoOffline?: string;
  vendedor: string;
  cliente: string | null;
  itens: { descricao: string; quantidade: number; precoUnit: number; desconto: number; total: number }[];
  bruto: number;
  descontoTotal: number;
  total: number;
  troco: number;
  pagamentos: { forma: string; valor: number; parcelasCartao?: number }[];
  parcelas: { numero: number; vencimento: string; valor: number }[];
  notaPedida: boolean;
};

export type Aparencia = { corPrimaria: string; corDestaque: string; logo: string | null; totemTitulo: string; totemMensagem: string; cupomCabecalho?: string; cupomTrocas?: string; cupomRodape?: string; telaClienteMensagem?: string };
