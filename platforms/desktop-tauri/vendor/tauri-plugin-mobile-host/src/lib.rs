use serde_json::Value;
use tauri::{plugin::{Builder, TauriPlugin}, AppHandle, Runtime};
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct Host<R: Runtime>(tauri::plugin::PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mobile-host").setup(|_app, _api| {
        #[cfg(target_os = "android")]
        _app.manage(Host(_api.register_android_plugin("one.atome.mobile", "AtomeHostPlugin")?));
        Ok(())
    }).build()
}

// The app's authentication, notification and streaming-view owners validate their contracts.
// This plugin registers no JavaScript command and adds no identity authority.
pub fn call<R: Runtime>(_app: &AppHandle<R>, method: &str, _payload: Value) -> Result<Value, String> {
    if !matches!(method, "authDevice" | "notifications" | "streamingView" | "contacts" | "openAppSettings") { return Err("mobile_host_command_invalid".into()); }
    #[cfg(target_os = "android")]
    return _app.try_state::<Host<R>>().ok_or("mobile_host_unavailable")?.0
        .run_mobile_plugin::<Value>(method, _payload).map_err(|_| "mobile_host_operation_failed".into());
    #[cfg(not(target_os = "android"))]
    Err("mobile_host_unsupported".into())
}
