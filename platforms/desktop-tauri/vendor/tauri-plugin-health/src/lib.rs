//! Health Connect bridge (Android only), read-only.
//!
//! The plugin registers the Kotlin `HealthPlugin` and exposes ONE Rust entry,
//! [`call`], used by the app's gated `health_invoke` command after it has
//! checked the channel token and the verified account. No JavaScript command
//! is registered, so page code has no direct path to Health Connect.

use serde_json::Value;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct HealthPluginHandle<R: Runtime>(tauri::plugin::PluginHandle<R>);

/// Kotlin methods the app may call. Anything else is refused here.
pub const METHODS: &[&str] = &[
    "capabilities",
    "requestAccess",
    "read",
    "observe",
    "unobserve",
    "reset",
    "isLinked",
    "link",
    "openSettings",
];

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("health")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin("one.atome.health", "HealthPlugin")?;
                _app.manage(HealthPluginHandle(handle));
            }
            Ok(())
        })
        .build()
}

/// Blocking call into Health Connect; run it off the async runtime.
pub fn call<R: Runtime>(_app: &AppHandle<R>, method: &str, _payload: Value) -> Result<Value, String> {
    if !METHODS.contains(&method) {
        return Err("health_command_unknown".into());
    }
    #[cfg(target_os = "android")]
    {
        let handle = _app
            .try_state::<HealthPluginHandle<R>>()
            .ok_or("health_host_unsupported")?;
        return handle
            .0
            .run_mobile_plugin::<Value>(method, _payload)
            .map_err(|error| error.to_string());
    }
    #[cfg(not(target_os = "android"))]
    Err("health_host_unsupported".into())
}
