// The input iPadOS routes (R-286). The system routes one input at a time
// (the app's AVAudioSession, AppNativeAudioInputRoute.swift): cpal sees it as
// its one input, « Default Device ». A strip names a port by its session uid,
// stable across reconnections; the app routes that port, checks it is the
// active route and tells the engine (`input_routed`), which then opens its one
// input for that uid, and only for it: a uid not routed is an error, never the
// built-in microphone in its place.

use std::sync::Mutex;

static ROUTED: Mutex<Option<String>> = Mutex::new(None);

pub(crate) fn routed() -> Option<String> {
    ROUTED.lock().ok().and_then(|routed| routed.clone())
}

// The port now routed (None: none of a strip's); the inputs already open are
// opened again, since the route's channels changed with it.
pub fn set_routed(uid: Option<String>) -> Result<serde_json::Value, String> {
    let uid = uid
        .map(|uid| uid.trim().to_string())
        .filter(|uid| !uid.is_empty());
    *ROUTED
        .lock()
        .map_err(|error| format!("Lock error: {error}"))? = uid.clone();
    let unavailable = super::live_input::reopen()?;
    Ok(serde_json::json!({ "success": true, "routed": uid, "inputs_unavailable": unavailable }))
}
