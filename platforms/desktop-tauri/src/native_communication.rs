use serde_json::{json, Value};
use tauri::{AppHandle, Runtime, WebviewWindow};

#[tauri::command]
pub async fn notifications_invoke<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>, command: String, payload: Value) -> Result<Value,String> {
    if window.label() != "main" || !window.url().is_ok_and(|url| url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1"|"localhost")) && url.port() == Some(3000)) {
        return Err("notifications_window_forbidden".into());
    }
    if !cfg!(target_os = "android") { return Err("notifications_host_unsupported".into()); }
    if !matches!(command.as_str(),"notifications_tokens"|"notifications_take"|"notifications_ack"|"notifications_enable"
        |"notifications_call_result"|"notifications_call_end"|"notifications_logout") { return Err("notifications_command_invalid".into()); }
    tauri::async_runtime::spawn_blocking(move || tauri_plugin_mobile_host::call(&app,"notifications",json!({"command":command,"payload":payload})))
        .await.map_err(|_| "notifications_host_unavailable".to_string())?
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "system" fn Java_one_atome_mobile_AtomeNotificationHost_storage(
    mut env: jni::JNIEnv, _class: jni::objects::JClass, root: jni::objects::JString,
    command: jni::objects::JString, payload: jni::objects::JString,
) -> jni::sys::jstring {
    let result = (|| -> Result<Value,String> {
        let root: String = env.get_string(&root).map_err(|_| "notifications_context_invalid")?.into();
        let command: String = env.get_string(&command).map_err(|_| "notifications_command_invalid")?.into();
        let payload: String = env.get_string(&payload).map_err(|_| "notifications_payload_invalid")?.into();
        if payload.len() > 8192 { return Err("notifications_payload_invalid".into()); }
        crate::server::local_auth::notification_storage(std::path::Path::new(&root), &command,
            serde_json::from_str(&payload).map_err(|_| "notifications_payload_invalid")?)
    })();
    let response = result.unwrap_or_else(|error| json!({"ok":false,"error":error}));
    match env.new_string(response.to_string()) {
        Ok(value) => value.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}
