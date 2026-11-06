# O que muda em cada versão

Cada versão nova entra no topo. **Corrige** = problema resolvido; **Novo** = função que não existia; **Melhora** = algo que já existia ficou melhor.

O **Freguez Caixa** e o **Freguez Cadastro** usam sempre o mesmo número de versão (saem juntos). O app do vendedor tem numeração própria.

---

## Windows: Freguez Caixa e Freguez Cadastro

### 0.7.3 · 06/11/2026
- **Corrige (totem):** o teclado do CPF deixava digitar mais de 11 números. Agora aceita exatamente 11 no CPF e 4 na confirmação (dia e mês do nascimento ou final do WhatsApp).

### 0.7.2 · 05/11/2026
- **Novo (Cadastro):** grade inteira de uma vez. Digite os tamanhos ("P, M, G") e as cores ("Azul, Preto"); o app monta todas as combinações, cada uma com a **quantidade que chegou** e o código de barras (bipado ou gerado pelo Freguez). O × tira da grade a combinação que a loja não tem. Salva tudo ou nada.
- **Novo (Cadastro):** ao bipar um produto já cadastrado, aparecem **todos os tamanhos e cores** dele para dar entrada de vários de uma vez.
- **Novo (Cadastro):** criar **categoria nova** sem sair do cadastro (botão "+ Nova").
- **Melhora (Cadastro):** etiquetas por opção, já com a quantidade que chegou, e "Imprimir todas".
- **Melhora (Cadastro):** Enter passa para o próximo campo (o leitor de código manda Enter depois de bipar).

### 0.7.1 · 05/11/2026
- **Novo (totem):** histórico em forma de **extrato**, um lançamento abaixo do outro, separado por mês: pagamento em verde (+), compra no crediário em vermelho (−), compra paga na hora em cinza, com o saldo depois de cada lançamento.

### 0.7.0 · 05/11/2026
- **Novo (totem):** visual novo em duas áreas: à esquerda (branca) as informações do cliente, parcelas, total e histórico; à direita o painel azul Freguez com os botões e o teclado.
- **Melhora (caixa):** acabamento novo na tela de venda (total em destaque, botão de finalizar com o atalho F10, lista de itens com cabeçalho fixo).

### 0.6.0 · 05/11/2026
- **Novo:** primeira versão do **Freguez Cadastro**, app separado do caixa para quem cadastra mercadoria. Bipa o código: se o produto existe, dá entrada no estoque; se não existe, cadastra (produto novo ou mais um tamanho/cor de um que já existe). Fotos pela webcam ou por arquivo; etiqueta opcional; o código de fábrica e o do Freguez acham o mesmo produto.
- **Novo (caixa):** **tela cheia** (botão no topo ou Ctrl+Shift+F), lembrada no computador; o totem abre sempre em tela cheia; a tela do cliente entra e sai da tela cheia com dois cliques.
- **Corrige (caixa):** erro ao finalizar a venda agora aparece na janela de pagamento (antes ficava escondido e o caixa parecia travado); impressora com tempo limite.
- **Novo (caixa):** pedido do site pago no balcão: digite S e o número do pedido.
- **Novo (caixa):** Pix pela chave da loja (qualquer banco), com QR no valor certo.

### 0.5.0 · 28/10/2026
- **Novo:** tela do cliente nova (o que está sendo comprado, total e QR do Pix).
- **Novo:** cupom (recibo) editável e desconto na hora de finalizar.
- **Novo:** etiquetas a partir do estoque.

### 0.4.0 · 28/10/2026
- **Melhora:** visual novo do caixa, com as cores da loja.

### 0.3.0 · 27/10/2026
- **Novo:** puxar no caixa as pré-vendas feitas pelo app do vendedor.

### 0.2.0 · 27/10/2026
- **Novo:** caixa funciona **sem internet**: as vendas ficam guardadas no computador e sobem quando a conexão volta.
- **Novo:** impressão direta em impressora térmica (cupom ESC/POS e etiqueta TSPL), sem janela do Windows.

### 0.1.1 · 27/10/2026
- **Melhora:** download do caixa e código de pareamento no painel (Configurações › Dispositivos).

### 0.1.0 · 27/10/2026
- **Novo:** primeira versão do caixa para Windows, com instalador, atualização automática assinada, pareamento pela conta do dono e segunda tela (tela do cliente) em janela própria.

---

## App do vendedor: Freguez Vendedor (Android e iPhone)

### iPhone (Expo Go) · 06/11/2026
- **Novo:** o app do vendedor também no **iPhone**, pelo Expo Go. Mesmas telas e funções do Android. Abre pelo QR Code do [README](README.md#iphone).

### 0.2.0 · 28/10/2026 (Android)
- **Novo:** aviso na tela quando há versão nova do app, com o botão para baixar.

### 0.1.0 · 27/10/2026 (Android)
- **Novo:** primeira versão: consulta de produto pela câmera (código de barras), pré-venda que o caixa puxa, inventário e etiqueta.
