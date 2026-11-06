//! Impressão direta (Start Geral 5.5): manda os bytes ESC/POS ou TSPL montados pelo PDV para a fila
//! do Windows em modo RAW, sem janela de impressão. Funciona com impressora USB, rede ou compartilhada,
//! desde que esteja instalada no Windows (driver do fabricante ou "Generic / Text Only").

#[cfg(windows)]
mod win {
    use windows::core::{PCWSTR, PWSTR};
    use windows::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, EnumPrintersW, OpenPrinterW, StartDocPrinterW, StartPagePrinter,
        WritePrinter, DOC_INFO_1W, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_HANDLE, PRINTER_INFO_4W,
    };

    fn largo(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn listar() -> Result<Vec<String>, String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let (mut precisa, mut qtd) = (0u32, 0u32);
        // 1ª chamada só descobre o tamanho do buffer (falha com "buffer insuficiente" de propósito)
        let _ = unsafe { EnumPrintersW(flags, PCWSTR::null(), 4, None, &mut precisa, &mut qtd) };
        if precisa == 0 {
            return Ok(vec![]);
        }
        let mut buf = vec![0u8; precisa as usize];
        unsafe { EnumPrintersW(flags, PCWSTR::null(), 4, Some(&mut buf), &mut precisa, &mut qtd) }.map_err(|e| e.to_string())?;
        let infos = unsafe { std::slice::from_raw_parts(buf.as_ptr() as *const PRINTER_INFO_4W, qtd as usize) };
        let mut nomes: Vec<String> = infos
            .iter()
            .filter(|i| !i.pPrinterName.is_null())
            .map(|i| unsafe { i.pPrinterName.to_string() }.unwrap_or_default())
            .filter(|n| !n.is_empty())
            .collect();
        nomes.sort();
        Ok(nomes)
    }

    pub fn imprimir(impressora: &str, dados: &[u8], documento: &str) -> Result<(), String> {
        let nome = largo(impressora);
        let mut h = PRINTER_HANDLE::default();
        unsafe { OpenPrinterW(PCWSTR(nome.as_ptr()), &mut h, None) }.map_err(|e| format!("Impressora \"{impressora}\" não encontrada: {e}"))?;
        let resultado = (|| {
            let mut doc_nome = largo(documento);
            let mut tipo = largo("RAW");
            let info = DOC_INFO_1W {
                pDocName: PWSTR(doc_nome.as_mut_ptr()),
                pOutputFile: PWSTR::null(),
                pDatatype: PWSTR(tipo.as_mut_ptr()),
            };
            if unsafe { StartDocPrinterW(h, 1, &info) } == 0 {
                return Err(format!("A impressora recusou o trabalho: {}", windows::core::Error::from_thread()));
            }
            let pagina = unsafe { StartPagePrinter(h) }.as_bool();
            let mut escrito = 0u32;
            let ok = unsafe { WritePrinter(h, dados.as_ptr() as *const _, dados.len() as u32, &mut escrito) }.as_bool();
            if pagina {
                let _ = unsafe { EndPagePrinter(h) };
            }
            let _ = unsafe { EndDocPrinter(h) };
            if !ok || escrito as usize != dados.len() {
                return Err("Falha ao enviar para a impressora. Confira se está ligada e com papel.".into());
            }
            Ok(())
        })();
        let _ = unsafe { ClosePrinter(h) };
        resultado
    }
}

#[tauri::command]
pub fn impressoras() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    return win::listar();
    #[cfg(not(windows))]
    Ok(vec![])
}

#[tauri::command]
pub async fn imprimir(impressora: String, dados: Vec<u8>, documento: Option<String>) -> Result<(), String> {
    if dados.is_empty() || dados.len() > 1_000_000 {
        return Err("Nada para imprimir.".into());
    }
    #[cfg(windows)]
    return tauri::async_runtime::spawn_blocking(move || win::imprimir(&impressora, &dados, documento.as_deref().unwrap_or("Freguez")))
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    {
        let _ = (impressora, documento);
        Err("Impressão direta só no Windows.".into())
    }
}
