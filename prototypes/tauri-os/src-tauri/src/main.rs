use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};

fn authorize(caller: &tauri::Webview) -> Result<(), String> {
    if caller.label() != "main" {
        return Err("Only the workspace may control browser guests".into());
    }
    Ok(())
}

fn guest_label(id: &str) -> Result<String, String> {
    if id.is_empty() || id.len() > 100 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("Invalid browser identity".into());
    }
    Ok(format!("browser-{id}"))
}

#[tauri::command]
async fn browser(
    caller: tauri::Webview,
    app: tauri::AppHandle,
    id: String,
    action: String,
    url: Option<String>,
    bounds: Option<[f64; 4]>,
    script: Option<String>,
) -> Result<(), String> {
    authorize(&caller)?;
    let label = guest_label(&id)?;
    if action == "create" {
        if app.get_webview(&label).is_some() {
            return Ok(());
        }
        let target = url
            .ok_or("URL required")?
            .parse::<tauri::Url>()
            .map_err(|e| e.to_string())?;
        if !matches!(target.scheme(), "http" | "https") || target.host_str().is_none() {
            return Err("Browser guests require HTTP(S) URLs".into());
        }
        let builder = tauri::webview::WebviewBuilder::new(&label, WebviewUrl::External(target))
            .on_navigation(|url| matches!(url.scheme(), "http" | "https"))
            .on_page_load(|view, payload| {
                use tauri::Emitter;
                let _ = view.app_handle().emit_to("main", "prototype-browser-load", serde_json::json!({
                    "label": view.label(), "url": payload.url().as_str(), "event": format!("{:?}", payload.event())
                }));
            });
        app.get_window("main")
            .ok_or("Workspace unavailable")?
            .add_child(
                builder,
                LogicalPosition::new(0., 0.),
                LogicalSize::new(800., 600.),
            )
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    let guest = app.get_webview(&label).ok_or("Browser guest unavailable")?;
    match action.as_str() {
        "bounds" => {
            let b = bounds.ok_or("Bounds required")?;
            if b.iter().any(|n| !n.is_finite()) || b[2] < 1. || b[3] < 1. {
                return Err("Invalid bounds".into());
            }
            guest
                .set_position(LogicalPosition::new(b[0], b[1]))
                .map_err(|e| e.to_string())?;
            guest
                .set_size(LogicalSize::new(b[2], b[3]))
                .map_err(|e| e.to_string())?;
        }
        "navigate" => {
            let target = url
                .ok_or("URL required")?
                .parse::<tauri::Url>()
                .map_err(|e| e.to_string())?;
            if !matches!(target.scheme(), "http" | "https") {
                return Err("HTTP(S) required".into());
            }
            guest.navigate(target).map_err(|e| e.to_string())?;
        }
        "eval" => guest
            .eval(script.ok_or("Script required")?)
            .map_err(|e| e.to_string())?,
        "hide" => guest.hide().map_err(|e| e.to_string())?,
        "show" => guest.show().map_err(|e| e.to_string())?,
        "focus" => guest.set_focus().map_err(|e| e.to_string())?,
        "close" => guest.close().map_err(|e| e.to_string())?,
        _ => return Err("Unsupported browser operation".into()),
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![browser])
        .setup(|app| {
            let url = std::env::var("KRONTERM_PROTOTYPE_URL")?.parse::<tauri::Url>()?;
            if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") {
                return Err("Prototype URL must be loopback HTTP".into());
            }
            let origin = url.origin().ascii_serialization();
            tauri::WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("KronTerm OS — Tauri Prototype")
                .inner_size(1440., 900.)
                .on_page_load(|view, payload| {
                    if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
                        for (label, guest) in view.app_handle().webviews() {
                            if label.starts_with("browser-") {
                                let _ = guest.close();
                            }
                        }
                    }
                })
                .on_navigation(move |target| target.origin().ascii_serialization() == origin)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri prototype failed");
}

#[cfg(test)]
mod tests {
    use super::guest_label;

    #[test]
    fn browser_id_cannot_address_workspace_or_paths() {
        assert!(guest_label("../../main").is_err());
        assert!(guest_label("").is_err());
        assert!(guest_label(&"x".repeat(101)).is_err());
        assert_eq!(guest_label("abc-123").unwrap(), "browser-abc-123");
    }
}
