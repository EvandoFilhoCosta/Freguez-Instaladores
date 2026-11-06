# Instalar no Windows (Freguez Caixa e Freguez Cadastro)

## Antes de começar

- Windows 10 ou 11, 64 bits.
- Internet na hora de instalar e parear (depois o **caixa** funciona sem internet e envia tudo quando ela volta; o **Cadastro** precisa de internet).
- Uma conta de **dono** ou **gerente** da loja, ou um **código de pareamento** gerado no painel.
- Se for usar: impressora térmica de cupom, impressora de etiquetas, leitor de código de barras e, no caixa, um segundo monitor para a tela do cliente.

## Qual instalar

| Computador | Programa |
|---|---|
| Balcão (onde se vende e se recebe) | **Freguez Caixa** |
| Totem de autoatendimento do crediário | **Freguez Caixa** (pareado como *Totem*) |
| Onde se cadastra mercadoria | **Freguez Cadastro** |

O Caixa e o Cadastro podem ficar no mesmo computador: cada um guarda os próprios dados.

## Passo a passo

1. Baixe o instalador na página [Releases](https://github.com/EvandoFilhoCosta/Freguez-Instaladores/releases/latest).
2. (Recomendado) Confira o SHA-256 do arquivo, como explicado no [README](../README.md#conferir-se-o-arquivo-é-original).
3. Abra o arquivo baixado. Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações** e depois em **Executar assim mesmo** (o motivo está em [ASSINATURA-DIGITAL.md](ASSINATURA-DIGITAL.md)).
4. Siga o instalador (**Avançar › Instalar › Concluir**). Não precisa ser administrador: ele instala só para o usuário atual.
5. Na primeira abertura, **pareie** com a loja:
   - **Pela conta:** e-mail e senha do dono ou gerente e escolha o tipo (Caixa, Totem ou Cadastro de produtos); ou
   - **Pelo código:** no painel, **Configurações › Dispositivos › Gerar código**, e digite o código no programa.
6. Pronto. No dia a dia, cada pessoa entra com o **PIN** dela (criado em **Configurações › Funcionários**).

## Atalhos úteis (caixa)

| Tecla | O que faz |
|---|---|
| F10 | Finalizar a venda |
| Ctrl+Shift+F | Entrar e sair da tela cheia |
| Dois cliques na tela do cliente | Tela cheia no segundo monitor |

## Atualizar

Não precisa fazer nada: ao abrir, o programa confere se há versão nova, baixa, confere a assinatura do Freguez e reinicia já atualizado. Para instalar uma versão à mão, basta rodar o instalador novo por cima: os dados e o pareamento ficam.

## Desinstalar

**Configurações do Windows › Aplicativos › Freguez Caixa (ou Freguez Cadastro) › Desinstalar.** Vendas que ainda não subiram (caixa sem internet) se perdem: antes de desinstalar, deixe o caixa aberto com internet até a fila zerar.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| "Caixa não pareado" | O pareamento foi revogado no painel. Gere um código novo em Configurações › Dispositivos. |
| "Sessão vencida. Digite o PIN de novo." | Normal depois de algumas horas. Digite o PIN. |
| A impressora não imprime | No caixa, **Equipamentos › Impressoras**: escolha a impressora e faça um teste. |
| O antivírus bloqueou o instalador | Programa novo sem reputação ainda; confira o SHA-256 e libere. Veja [ASSINATURA-DIGITAL.md](ASSINATURA-DIGITAL.md). |
