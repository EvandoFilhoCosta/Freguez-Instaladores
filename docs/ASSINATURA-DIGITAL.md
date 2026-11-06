# Assinatura digital do instalador (tirar o aviso do Windows)

## O que é o aviso

Quando um `.exe` não tem **assinatura digital de código** (*code signing*) de uma autoridade reconhecida pela Microsoft, o Windows mostra "O Windows protegeu o computador" (SmartScreen) e alguns antivírus desconfiam. Não é defeito do programa: é falta de "documento de identidade" do fabricante.

Hoje os instaladores do Freguez:

- **não** têm assinatura de código reconhecida pelo Windows (por isso o aviso);
- **têm** a assinatura própria do Freguez nas **atualizações automáticas**: o programa instalado só aceita uma atualização assinada com a chave do Freguez;
- publicam o **SHA-256** de cada arquivo em cada Release, para conferir se o download é o original.

## Caminhos para assinar

| Caminho | Custo | Serve para o Freguez? |
|---|---|---|
| **[SignPath Foundation](https://signpath.org/terms)** (gratuito para código aberto) | Grátis | **Não, do jeito que está.** Exige que o projeto inteiro tenha licença aberta aprovada pela OSI (sem licença comercial dupla), que o instalador seja **compilado a partir do código deste repositório** (GitHub Actions) e a SignPath passa a constar como editora. Um repositório só com os instaladores não é aceito. |
| **[Certum Open Source Code Signing](https://shop.certum.eu/open-source-code-signing.html)** | a partir de ~€69 | **Não.** É para desenvolvedor pessoa física de projeto de código aberto; o nome sai como "Open Source Developer". |
| **[Azure Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/quickstart)** (Microsoft) | ~US$10/mês | **Ainda não.** A validação de identidade aceita empresas dos EUA, Canadá, União Europeia e Reino Unido e pessoas físicas dos EUA e Canadá. Brasil não está na lista. |
| **Certificado de assinatura de código OV** (Certum, Sectigo, DigiCert e outras) | ~R$ 1.000 a R$ 3.000/ano | **Sim.** Emitido para o **CNPJ** do Freguez, com validação da empresa. Desde 2023 a chave fica em token físico (USB) ou em serviço de nuvem (HSM). O aviso do SmartScreen some aos poucos, conforme o instalador ganha reputação (downloads sem reclamação). |
| **Certificado EV** | ~R$ 2.500 a R$ 5.000/ano | **Sim**, com a validação mais rigorosa. Hoje a Microsoft trata EV e OV de forma parecida no SmartScreen; só vale a pena se algum cliente exigir. |

**Recomendação:** certificado **OV no CNPJ**, de preferência com chave em nuvem (assim dá para assinar no GitHub Actions sem pendrive).

### Caminho gratuito possível: abrir só o código dos programas instalados

O SignPath assina o que é compilado a partir de código aberto. Dá para abrir **apenas** o código dos programas que vão no computador e no celular da loja (a casca Windows, as telas do caixa, totem e cadastro e as regras que eles usam) e manter fechados o **servidor, o painel, o site e o banco de dados**. Os programas instalados já carregam esse código dentro do instalador; o que fica protegido é o serviço.

O que isso exigiria:

1. Separar o código dos programas instalados num repositório próprio, com licença OSI (ex.: MIT ou Apache-2.0), sem segredos nem chaves.
2. Compilar o instalador pelo **GitHub Actions** desse repositório (não mais no computador).
3. Pedir a entrada no SignPath Foundation (com autenticação em dois fatores no GitHub e no SignPath para quem publica).
4. A assinatura sai em nome da **SignPath Foundation**, não do Freguez.

**Situação (06/11/2026):** decidido e feito. O código dos programas instalados está em [`codigo/`](../codigo) com licença MIT e o instalador é compilado pelo GitHub Actions ([instaladores.yml](../.github/workflows/instaladores.yml)). Falta:

1. Ativar a autenticação em dois fatores no GitHub de quem publica.
2. Pedir a entrada em [signpath.org/apply](https://signpath.org/apply.html), informando este repositório.
3. Quando aprovado: criar o projeto no SignPath, colocar o token dele nos *Secrets* do GitHub e acrescentar ao workflow o passo de assinatura (`signpath/github-action-submit-signing-request`).
4. Passar a publicar as versões a partir do que o GitHub Actions compilou e o SignPath assinou.

O nome do programa continua **Freguez Caixa** / **Freguez Cadastro**; só o campo "Editor" da assinatura mostra *SignPath Foundation*.

## Como fica a publicação depois do certificado

1. Compilar o instalador (`npm run compilar` e `npm run compilar:cadastro` no projeto principal).
2. Assinar o `.exe` com o certificado (`signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 ...`, ou o comando do serviço de nuvem). O carimbo de tempo (`/tr`) faz a assinatura continuar válida mesmo depois que o certificado vencer.
3. Publicar no R2 (atualização automática) e criar a Release aqui com o `scripts/publicar-release.mjs`.

O Tauri também aceita assinar sozinho durante a compilação (`bundle.windows.signCommand` no `tauri.conf.json`).
