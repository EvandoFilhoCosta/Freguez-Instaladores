# Código dos programas instalados

Freguez Caixa (com o totem e a tela do cliente) e Freguez Cadastro, para Windows. Licença [MIT](../LICENSE).

| Pasta | O que é |
|---|---|
| `apps/pdv` | Telas (React + Vite): caixa, totem, tela do cliente e cadastro de produtos |
| `apps/desktop` | Programa Windows (Tauri 2 / Rust): janelas, impressora térmica, banco local para vender sem internet, atualização automática |
| `packages/core` | Regras usadas pelas telas: crediário, venda, permissões, códigos de barras, etiquetas |
| `packages/ui` | Componentes visuais |

Os programas falam com o serviço do Freguez (`VITE_API_URL`, por padrão `https://www.freguez.com`); sem uma conta do Freguez, eles abrem só a tela de pareamento.

## Compilar

Precisa: Node 24, Rust (rustup), Visual Studio 2022 com C++ e o Windows SDK.

```bash
npm ci
npm test && npm run typecheck
cd apps/desktop
npx tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'                        # Freguez Caixa
VITE_APP=cadastro npx tauri build --config src-tauri/tauri.cadastro.conf.json \
  --config '{"bundle":{"createUpdaterArtifacts":false}}'                                       # Freguez Cadastro
```

O instalador fica em `apps/desktop/src-tauri/target/release/bundle/nsis/`. O `createUpdaterArtifacts:false` dispensa a chave privada das atualizações automáticas, que só os instaladores oficiais usam.

Os instaladores oficiais são compilados pelo GitHub Actions deste repositório (`.github/workflows/instaladores.yml`).
