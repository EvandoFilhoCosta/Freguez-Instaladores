// Parte do core que vai dentro dos programas instalados (caixa, totem, cadastro) e é publicada como
// código aberto no GitHub dos instaladores. Só regras que o caixa usa; servidor, site, nota fiscal e
// robô ficam fora (estão em index.ts). Ao usar algo novo do core no apps/pdv, exporte aqui.
export * from "./crediario";
export * from "./dispositivo";
export * from "./documentos";
export * from "./ean13";
export * from "./formato";
export * from "./grade";
export * from "./ids";
export * from "./impressao";
export * from "./permissoes";
export * from "./venda";
