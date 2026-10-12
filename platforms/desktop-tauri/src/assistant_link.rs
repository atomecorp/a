//! Desktop entry of the page's assistant: the `atome://assistant` link, which a
//! macOS Shortcut run by Siri can open. Like CarPlay and Siri on iOS, the host only
//! asks: it keeps the latest request until the page takes it (cold launch, page not
//! yet loaded) and tells a loaded page that one is waiting (assistant_native_link.js).

use std::sync::Mutex;
#[cfg(any(target_os = "macos", target_os = "ios"))]
use tauri::{AppHandle, Manager, Runtime, Url};

#[cfg(any(target_os = "macos", target_os = "ios"))]
const REQUEST_EVENT_SCRIPT: &str = "window.dispatchEvent(new CustomEvent('eve:assistant-request'));";

#[derive(Default)]
pub struct AssistantRequestInbox(Mutex<Option<serde_json::Value>>);

/// Called with the URLs macOS hands the app (`RunEvent::Opened`), cold or warm.
#[cfg(any(target_os = "macos", target_os = "ios"))]
pub fn receive_urls<R: Runtime>(app: &AppHandle<R>, urls: &[Url]) {
    for url in urls {
        if url.scheme() != "atome" {
            continue;
        }
        if url.host_str() != Some("assistant") {
            eprintln!("[assistant_link] unsupported atome link: {}", url);
            continue;
        }
        let inbox = app.state::<AssistantRequestInbox>();
        *inbox.0.lock().expect("assistant request inbox poisoned") = Some(serde_json::json!({
            "action": "open", "source": "desktop_link", "surface": "screen"
        }));
        let Some(window) = app.get_webview_window("main") else {
            eprintln!("[assistant_link] main window missing; request kept for the page");
            continue;
        };
        for (step, result) in [
            ("unminimize", window.unminimize()),
            ("show", window.show()),
            ("focus", window.set_focus()),
            ("notify page", window.eval(REQUEST_EVENT_SCRIPT)),
        ] {
            if let Err(error) = result {
                eprintln!("[assistant_link] {} failed: {}", step, error);
            }
        }
    }
}

#[tauri::command]
pub fn assistant_request_take(inbox: tauri::State<'_, AssistantRequestInbox>) -> Option<serde_json::Value> {
    inbox.0.lock().expect("assistant request inbox poisoned").take()
}
