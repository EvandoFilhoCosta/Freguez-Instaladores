# Compila o app do caixa (ou o Freguez Cadastro) nesta máquina (Windows).
# Uso, na raiz do repositório:  npm run compilar --workspace @freguez/desktop
#                               npm run compilar:cadastro --workspace @freguez/desktop
param([string]$App = "caixa")
# Precisa: Visual Studio 2022 (C++), Windows SDK, Rust (rustup) e a chave em ~/.tauri/freguez-caixa.key
$ErrorActionPreference = "Stop"
$vs = & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -property installationPath
Import-Module "$vs\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
# Carrega o link.exe do Visual Studio (o "link" do Git atrapalha) e o Windows SDK
Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments "-arch=x64 -host_arch=x64" | Out-Null
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\freguez-caixa.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
if (-not $env:VITE_API_URL) { $env:VITE_API_URL = "https://www.freguez.com" }
if (-not (Test-Path $env:TAURI_SIGNING_PRIVATE_KEY)) { throw "Chave de assinatura não encontrada em $env:TAURI_SIGNING_PRIVATE_KEY" }
Write-Host "Compilando $App com VITE_API_URL=$env:VITE_API_URL"
if ($App -eq "cadastro") {
  # Mesmo código do caixa; o app abre só a tela de cadastro e pareia como "Cadastro de produtos"
  $env:VITE_APP = "cadastro"
  npx tauri build --config src-tauri/tauri.cadastro.conf.json
} else {
  $env:VITE_APP = ""
  npx tauri build
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
