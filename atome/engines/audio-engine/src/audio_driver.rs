// The driver the engine plays through, as the hosts ask for it (Tauri `audio_driver`,
// `audio_driver_set`; eVe/domains/audio_fx/audio_driver.js). Only Windows has a choice: WASAPI
// exclusive, or one of the ASIO drivers installed (windows_driver.rs). Elsewhere nothing is
// selectable and a choice is refused as such.

use serde_json::{Value, json};

#[cfg(target_os = "windows")]
pub fn state() -> Result<Value, String> {
    use super::windows_driver::{self, Driver};
    let (driver, asio_driver) = match windows_driver::current() {
        Driver::Wasapi => ("wasapi", None),
        Driver::Asio(name) => ("asio", Some(name)),
    };
    Ok(json!({
        "success": true,
        "selectable": true,
        "driver": driver,
        "asio_driver": asio_driver,
        "asio_built": windows_driver::asio_built(),
        "asio_drivers": windows_driver::asio_drivers(),
        "handover_error": windows_driver::handover_error(),
    }))
}

#[cfg(not(target_os = "windows"))]
pub fn state() -> Result<Value, String> {
    Ok(json!({ "success": true, "selectable": false }))
}

/// `driver`: "wasapi", or "asio" with the ASIO driver's `name`.
#[cfg(target_os = "windows")]
pub fn set(driver: &str, name: Option<&str>) -> Result<Value, String> {
    use super::windows_driver::{self, Driver};
    let chosen = match (driver, name.map(str::trim).filter(|name| !name.is_empty())) {
        ("wasapi", _) => Driver::Wasapi,
        ("asio", Some(name)) => Driver::Asio(name.to_string()),
        ("asio", None) => return Err("asio_driver_required".into()),
        (other, _) => return Err(format!("audio_driver_unknown:{other}")),
    };
    windows_driver::choose(chosen)?;
    state()
}

#[cfg(not(target_os = "windows"))]
pub fn set(_driver: &str, _name: Option<&str>) -> Result<Value, String> {
    Err("audio_driver_windows_only".into())
}
