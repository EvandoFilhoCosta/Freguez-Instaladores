use tauri::Manager;

mod impressora;

/// App do caixa: empacota o PDV web (apps/pdv). A verificação de atualização roda na abertura,
/// pela tela do próprio PDV (plugin updater), antes de liberar a venda.
/// Fase 2: banco local SQLite (plugin sql, arquivo caixa.db na pasta de dados do app) para vender
/// sem internet, e impressão direta ESC/POS/TSPL (módulo impressora).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Abrir o atalho de novo só traz a janela que já está aberta (um caixa por computador)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(janela) = app.get_webview_window("main") {
                let _ = janela.unminimize();
                let _ = janela.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![impressora::impressoras, impressora::imprimir])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Freguez Caixa");
}
