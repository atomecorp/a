//! The internal page of a service (eVe/domains/media/streaming_view.js): its own site in a web
//! view of its own, laid behind the app page and seen through the canvas cut-out. macOS lays it
//! with the native owner shared with iOS (platforms/ios/atome-auv3/Common/AtomeStreamingView.m),
//! Android with the host plugin (vendor/tauri-plugin-mobile-host, StreamingView.kt). Windows and
//! Linux have none: their web views are separate native windows the app page cannot see through.
use serde_json::Value;
use tauri::{AppHandle, Runtime, WebviewWindow};

const COMMANDS: [&str; 7] = ["streaming_view_open", "streaming_view_place", "streaming_view_front",
    "streaming_view_media", "streaming_view_navigate", "streaming_view_page", "streaming_view_close"];

#[cfg(target_os = "macos")]
extern "C" {
    fn atome_streaming_view_invoke(host: *mut std::ffi::c_void, command: *const std::ffi::c_char,
        payload_json: *const std::ffi::c_char, context: *mut std::ffi::c_void,
        reply: extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_char));
}

// Called once by the native owner, on the main thread, with the boxed reply channel.
#[cfg(target_os = "macos")]
extern "C" fn native_reply(context: *mut std::ffi::c_void, json: *const std::ffi::c_char) {
    let sender = unsafe { Box::from_raw(context as *mut tokio::sync::oneshot::Sender<String>) };
    let text = if json.is_null() { String::new() } else { unsafe { std::ffi::CStr::from_ptr(json) }.to_string_lossy().into_owned() };
    let _ = sender.send(text);
}

#[tauri::command]
pub async fn streaming_view_invoke<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, command: String, payload: Value) -> Result<Value, String> {
    if window.label() != "main" || !window.url().is_ok_and(|url| url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1"|"localhost")) && url.port() == Some(3000)) {
        return Err("streaming_view_window_forbidden".into());
    }
    if !COMMANDS.contains(&command.as_str()) { return Err("streaming_view_command_invalid".into()); }
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        let command = std::ffi::CString::new(command).map_err(|_| "streaming_view_command_invalid")?;
        let payload = std::ffi::CString::new(payload.to_string()).map_err(|_| "streaming_view_request_invalid")?;
        let (sender, receiver) = tokio::sync::oneshot::channel::<String>();
        let context = Box::into_raw(Box::new(sender)) as usize;
        window.with_webview(move |webview| unsafe {
            atome_streaming_view_invoke(webview.inner(), command.as_ptr(), payload.as_ptr(), context as *mut std::ffi::c_void, native_reply);
        }).map_err(|_| "streaming_view_unavailable")?;
        let text = receiver.await.map_err(|_| "streaming_view_unavailable")?;
        return serde_json::from_str(&text).map_err(|_| "streaming_view_reply_invalid".into());
    }
    #[cfg(target_os = "android")]
    {
        let _ = window;
        return tauri::async_runtime::spawn_blocking(move || tauri_plugin_mobile_host::call(&app, "streamingView",
            serde_json::json!({ "command": command, "payload": payload })))
            .await.map_err(|_| "streaming_view_unavailable".to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "android")))]
    {
        let _ = (app, payload);
        Err("streaming_view_unsupported".into())
    }
}
