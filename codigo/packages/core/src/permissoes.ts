// Matriz de permissões do vendedor (Start Geral 3.4 e 3.7). Dono e gerente podem tudo na loja.

export const PERMISSOES = {
  vender: "Vender",
  receber_parcela: "Receber parcela do crediário",
  vender_crediario: "Vender no crediário",
  abrir_fechar_caixa: "Abrir e fechar caixa",
  cancelar_item: "Remover item da venda",
  cancelar_venda: "Cancelar venda",
  fazer_troca: "Fazer troca e devolução",
  autorizar_desconto: "Autorizar desconto acima do limite de outro vendedor",
  cadastrar_produto: "Cadastrar e editar produto",
  ajustar_estoque: "Ajustar estoque",
  ver_custo: "Ver custo no app do vendedor",
} as const;

export type Permissao = keyof typeof PERMISSOES;
export type MapaPermissoes = Partial<Record<Permissao, boolean>>;

/** Padrão de um vendedor novo: vende e recebe parcela; o resto o dono libera. */
export const PERMISSOES_PADRAO_VENDEDOR: Record<Permissao, boolean> = {
  vender: true,
  receber_parcela: true,
  vender_crediario: false,
  abrir_fechar_caixa: true,
  cancelar_item: false,
  cancelar_venda: false,
  fazer_troca: false,
  autorizar_desconto: false,
  cadastrar_produto: false,
  ajustar_estoque: false,
  ver_custo: false,
};

export function pode(
  papel: "dono" | "gerente" | "vendedor" | null | undefined,
  permissoes: MapaPermissoes | null | undefined,
  acao: Permissao,
): boolean {
  if (papel === "dono" || papel === "gerente") return true;
  return permissoes?.[acao] ?? PERMISSOES_PADRAO_VENDEDOR[acao];
}
