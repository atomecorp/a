//! Google Play Billing bridge (Android only).
//!
//! The plugin registers the Kotlin `BillingPlugin` and exposes ONE Rust entry,
//! [`call`], used by the app's gated `billing_invoke` command. No JavaScript
//! command is registered. The purchase it returns is only a lookup key: the
//! server verifies it with the Google Play Developer API before granting it.

use serde_json::Value;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct BillingPluginHandle<R: Runtime>(tauri::plugin::PluginHandle<R>);

/// Kotlin methods the app may call. Anything else is refused here.
pub const METHODS: &[&str] = &["purchase"];

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("billing")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin("one.atome.billing", "BillingPlugin")?;
                _app.manage(BillingPluginHandle(handle));
            }
            Ok(())
        })
        .build()
}

/// Blocking call into Play Billing (the purchase sheet may stay open for
/// minutes); run it off the async runtime.
pub fn call<R: Runtime>(_app: &AppHandle<R>, method: &str, _payload: Value) -> Result<Value, String> {
    if !METHODS.contains(&method) {
        return Err("billing_command_unknown".into());
    }
    #[cfg(target_os = "android")]
    {
        let handle = _app
            .try_state::<BillingPluginHandle<R>>()
            .ok_or("billing_store_unavailable")?;
        return handle
            .0
            .run_mobile_plugin::<Value>(method, _payload)
            .map_err(|error| error.to_string());
    }
    #[cfg(not(target_os = "android"))]
    Err("billing_store_unavailable".into())
}
