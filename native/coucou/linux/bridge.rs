use serde_json::Value;
use std::io::{BufRead, Write};
use tauri::{AppHandle, Emitter};

pub fn enabled() -> bool {
    std::env::args().any(|arg| arg == "--kronterm-hud")
}

#[tauri::command]
pub fn kronterm_enabled() -> bool { enabled() }

pub fn start(app: AppHandle) {
    if !enabled() { return; }
    std::thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines() {
            let Ok(line) = line else { break };
            if line.len() > 8 * 1024 * 1024 { continue; }
            let Ok(value) = serde_json::from_str::<Value>(&line) else { continue };
            if value.is_object() {
                let _ = app.emit("kronterm-state", value);
            }
        }
        // HUD ownership belongs to the parent, unlike standalone Coucou.
        app.exit(0);
    });
}

#[tauri::command]
pub fn kronterm_event(payload: Value) -> Result<(), String> {
    if !enabled() { return Err("KronTerm HUD is not connected".into()); }
    let event = payload.get("event").and_then(Value::as_str).unwrap_or("");
    if !["ready", "action", "preview-layout", "chat-layout", "chat-open", "chat-close"].contains(&event) {
        return Err("Unsupported HUD event".into());
    }
    let mut stdout = std::io::stdout().lock();
    serde_json::to_writer(&mut stdout, &payload).map_err(|e| e.to_string())?;
    writeln!(stdout).map_err(|e| e.to_string())?;
    stdout.flush().map_err(|e| e.to_string())
}
