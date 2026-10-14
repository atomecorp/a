//! Axum owns GPS authorization, trip reads and durable writes. The host supplies location and JavaScriptCore.
use super::super::{local_atome, public_relay, local_auth};
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use tokio::sync::oneshot;

#[cfg(target_os = "macos")]
extern "C" {
    fn atome_gps_invoke(request: *const std::ffi::c_char, engine: *const std::ffi::c_char) -> *mut std::ffi::c_char;
    fn atome_gps_set_effect_callback(callback: extern "C" fn(*const std::ffi::c_char));
    fn atome_gps_set_authorization_callback(callback: extern "C" fn(*const std::ffi::c_char, *const std::ffi::c_char) -> bool);
    fn atome_gps_free(value: *mut std::ffi::c_char);
}
#[derive(Clone)]
struct Session { owner: String, trip: String, id: String, token: String, revision: u64, auth: local_auth::LocalAuthState, state: local_atome::LocalAtomeState }
static SESSION: Mutex<Option<Session>> = Mutex::new(None);
static RUNTIME: OnceLock<tokio::runtime::Handle> = OnceLock::new();
static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LOCATES: OnceLock<Mutex<std::collections::HashMap<String, oneshot::Sender<Value>>>> = OnceLock::new();
extern "C" fn authorize(owner: *const std::ffi::c_char, id: *const std::ffi::c_char) -> bool {
    if owner.is_null() || id.is_null() { return false; }
    let Ok(owner) = (unsafe { std::ffi::CStr::from_ptr(owner).to_str() }) else { return false; };
    let Ok(id) = (unsafe { std::ffi::CStr::from_ptr(id).to_str() }) else { return false; };
    let Ok(guard) = SESSION.lock() else { return false; };
    guard.as_ref().is_some_and(|session| session.owner == owner && session.id == id
        && local_auth::verified_user_id_from_token(&session.auth, Some(&session.token)).as_deref() == Some(owner))
}

fn invoke_raw(request: Value) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    unsafe {
        let request = std::ffi::CString::new(request.to_string()).map_err(|_| "INVALID_ARGUMENT")?;
        let source = std::ffi::CString::new(include_str!("../../../../atome/src/wasm/gps_navigation_engine.js")).map_err(|_| "NOT_CONFIGURED")?;
        let output = atome_gps_invoke(request.as_ptr(), source.as_ptr());
        if output.is_null() { return Err("HOST_UNSUPPORTED".into()); }
        let result = serde_json::from_slice::<Value>(std::ffi::CStr::from_ptr(output).to_bytes()).map_err(|_| "INVALID_PROVIDER_RESPONSE".to_string());
        atome_gps_free(output);
        let result = result?;
        if result.get("ok").and_then(Value::as_bool) != Some(true) {
            return Err(result.get("error").and_then(Value::as_str).unwrap_or("HOST_UNSUPPORTED").into());
        }
        Ok(result)
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = request; Err("HOST_UNSUPPORTED".into()) }
}
async fn invoke(request: Value) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || invoke_raw(request)).await.map_err(|_| "HOST_UNSUPPORTED".to_string())?
}
async fn read(session: &Session) -> Result<Value, String> {
    let response = local_atome::handle_state_current_message(json!({"action":"get", "atome_id":session.trip}), &session.owner, &session.state).await;
    let record = response.data.as_ref().and_then(|v| v.get("state")).ok_or("TRIP_NOT_FOUND")?;
    let props = record.get("properties").ok_or("TRIP_NOT_FOUND")?;
    if record.get("owner_id").and_then(Value::as_str) != Some(&session.owner)
        || props.get("type").and_then(Value::as_str) != Some("gps_trip")
        || record.get("project_id").is_some_and(|v| !v.is_null())
        || props.get("__deleted").and_then(Value::as_bool) == Some(true) { return Err("TRIP_NOT_FOUND".into()); }
    Ok(props.clone())
}
async fn persist(session: &Session, patch: Value) -> Result<(), String> {
    if SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.as_ref().map(|s| s.id.as_str()) != Some(&session.id) { return Err("CONTEXT_CHANGED".into()); }
    let props = read(session).await?;
    let revision = props.get("revision").and_then(Value::as_u64).ok_or("VERSION_CONFLICT")?;
    if SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.as_ref().map(|s| s.revision) != Some(revision) { return Err("VERSION_CONFLICT".into()); }
    let mut next = patch.as_object().ok_or("INVALID_ARGUMENT")?.clone();
    next.insert("type".into(), json!("gps_trip")); next.insert("revision".into(), json!(revision + 1));
    let response = local_atome::handle_events_message(json!({"action":"commit", "event":{
        "id":uuid::Uuid::new_v4().to_string(), "atome_id":session.trip, "kind":"set", "scope":"global",
        "payload":{"props":next, "expected_versions":{"revision":revision + 1}}
    }}), &session.owner, &session.state).await;
    if response.success {
        if let Some(current) = SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.as_mut() { current.revision = revision + 1; }
        Ok(())
    } else { Err("VERSION_CONFLICT".into()) }
}
extern "C" fn receive_effect(raw: *const std::ffi::c_char) {
    if raw.is_null() { return; }
    let Ok(effect) = (unsafe { serde_json::from_slice::<Value>(std::ffi::CStr::from_ptr(raw).to_bytes()) }) else { return; };
    if effect.get("type").and_then(Value::as_str) == Some("located") {
        if let Some(id) = effect.get("request_id").and_then(Value::as_str) {
            if let Ok(mut requests) = LOCATES.get_or_init(Default::default).lock() {
                if let Some(sender) = requests.remove(id) { let _ = sender.send(effect.clone()); }
            }
        }
        return;
    }
    if let Some(runtime) = RUNTIME.get() { runtime.spawn(async move {
        let effect_session = effect.get("session_id").and_then(Value::as_str).unwrap_or("").to_owned();
        if let Err(error) = process_effect(effect).await {
            let _guard = SERIAL.lock().await;
            if SESSION.lock().ok().and_then(|s| s.as_ref().map(|v| v.id.clone())).as_deref() != Some(&effect_session) { return; }
            tracing::warn!(component="gps", code=%error, "GPS effect refused");
            if let Err(release_error) = invoke(json!({"operation":"fail", "error":error})).await {
                tracing::warn!(component="gps", code=%release_error, "GPS release refused");
            }
            if let Ok(mut session) = SESSION.lock() { *session = None; }
        }
    }); }
}
async fn process_effect(effect: Value) -> Result<(), String> {
    let Some(session) = SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.clone() else { return Ok(()); };
    if effect.get("session_id").and_then(Value::as_str) != Some(&session.id) { return Ok(()); }
    if local_auth::verified_user_id_from_token(&session.auth, Some(&session.token)).as_deref() != Some(&session.owner) {
        return Err("AUTH_REQUIRED".into());
    }
    match effect.get("type").and_then(Value::as_str).unwrap_or("") {
        "arrived" | "interrupted" => {
            let _guard = SERIAL.lock().await;
            if SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.as_ref().map(|s| s.id.as_str()) != Some(&session.id) { return Ok(()); }
            invoke(json!({"operation":"stop"})).await?;
            persist(&session, json!({"status":effect["type"], "ended_at":chrono::Utc::now().to_rfc3339()})).await?;
            *SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")? = None;
        },
        "recalculate" => {
            let props = read(&session).await?;
            let offset = props["waypoint_offset"].as_u64().unwrap_or(0) + effect["passed_waypoints"].as_u64().unwrap_or(0);
            let waypoints: Vec<Value> = props["waypoints"].as_array().into_iter().flatten().skip(offset as usize).cloned().collect();
            let response = public_relay::relay(&json!({"type":"gps-resource", "action":"route", "requestId":uuid::Uuid::new_v4().to_string(),
                "input":{"origin":effect["origin"], "destination":props["destination"], "waypoints":waypoints}})).await;
            // Provider work never holds the command lock: stop remains immediate.
            let _guard = SERIAL.lock().await;
            if SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.as_ref().map(|s| s.id.as_str()) != Some(&session.id) { return Ok(()); }
            if local_auth::verified_user_id_from_token(&session.auth, Some(&session.token)).as_deref() != Some(&session.owner) { return Err("AUTH_REQUIRED".into()); }
            if response.get("ok").and_then(Value::as_bool) != Some(true) {
                invoke(json!({"operation":"set_error", "session_id":session.id, "error":response["error"]})).await?;
                return Ok(());
            }
            persist(&session, json!({"route":response["route"], "waypoint_offset":offset})).await?;
            invoke(json!({"operation":"replace_route", "session_id":session.id, "route":response["route"]})).await?;
        },
        _ => {}
    }
    Ok(())
}
pub(super) async fn handle(request: &Value, owner: &str, state: &local_atome::LocalAtomeState, auth: Option<&local_auth::LocalAuthState>) -> Value {
    RUNTIME.get_or_init(tokio::runtime::Handle::current);
    #[cfg(target_os = "macos")]
    unsafe { atome_gps_set_effect_callback(receive_effect); atome_gps_set_authorization_callback(authorize); }
    let result = execute(request, owner, state, auth).await;
    let mut response = result.unwrap_or_else(|error| json!({"ok":false, "error":error}));
    response["success"] = response["ok"].clone(); response["type"] = json!("gps-native-response");
    response["requestId"] = request.get("requestId").or_else(|| request.get("request_id")).cloned().unwrap_or(Value::Null);
    response
}
pub(super) async fn release(request: &Value) -> Value {
    let _guard = SERIAL.lock().await;
    let result = invoke(json!({"operation":"release"})).await;
    if let Ok(mut session) = SESSION.lock() { *session = None; }
    match result {
        Ok(_) => json!({"type":"gps-native-response", "requestId":request["requestId"], "success":true, "ok":true}),
        Err(error) => json!({"type":"gps-native-response", "requestId":request["requestId"], "success":false, "ok":false, "error":error})
    }
}
async fn execute(request: &Value, owner: &str, state: &local_atome::LocalAtomeState, auth: Option<&local_auth::LocalAuthState>) -> Result<Value, String> {
    let operation = request.get("action").and_then(Value::as_str).ok_or("INVALID_ARGUMENT")?;
    if operation == "locate" {
        let id = uuid::Uuid::new_v4().to_string(); let (sender, receiver) = oneshot::channel();
        LOCATES.get_or_init(Default::default).lock().map_err(|_| "HOST_UNSUPPORTED")?.insert(id.clone(), sender);
        if let Err(error) = invoke(json!({"operation":"locate", "request_id":id})).await {
            LOCATES.get_or_init(Default::default).lock().map_err(|_| "HOST_UNSUPPORTED")?.remove(&id); return Err(error);
        }
        let effect = tokio::time::timeout(std::time::Duration::from_secs(20), receiver).await;
        LOCATES.get_or_init(Default::default).lock().map_err(|_| "HOST_UNSUPPORTED")?.remove(&id);
        invoke(json!({"operation":"cancel_locate", "request_id":id})).await?;
        if local_auth::verified_user_id_from_token(auth.ok_or("AUTH_REQUIRED")?, request.get("token").and_then(Value::as_str)).as_deref() != Some(owner) { return Err("CONTEXT_CHANGED".into()); }
        let effect = effect.map_err(|_| "LOCATION_UNAVAILABLE")?.map_err(|_| "CANCELLED")?;
        if let Some(error) = effect.get("error").and_then(Value::as_str) { return Err(error.into()); }
        let mut result = effect["position"].clone(); result["ok"] = json!(true); return Ok(result);
    }
    let _guard = SERIAL.lock().await;
    let has_session = SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.is_some();
    if has_session {
        let current = invoke(json!({"operation":"state"})).await?;
        if current.get("active").and_then(Value::as_bool) != Some(true) { *SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")? = None; }
    }
    let current = SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")?.clone();
    match operation {
        "release" => { invoke(json!({"operation":"release"})).await?; *SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")? = None; Ok(json!({"ok":true})) },
        "state" => {
            if current.is_none() || current.as_ref().is_some_and(|s| s.owner == owner) { invoke(json!({"operation":"state"})).await }
            else { Ok(json!({"ok":true, "active":false, "trip_id":"", "background":cfg!(target_os="macos")})) }
        },
        "stop" => {
            if let Some(session) = current.filter(|s| s.owner == owner) {
                invoke(json!({"operation":"stop"})).await?;
                persist(&session, json!({"status":"stopped", "ended_at":chrono::Utc::now().to_rfc3339()})).await?;
                *SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")? = None;
            }
            Ok(json!({"ok":true}))
        },
        "start" => {
            let trip = request.pointer("/input/trip_id").and_then(Value::as_str).ok_or("INVALID_ARGUMENT")?;
            if let Some(session) = current { return if session.owner == owner && session.trip == trip {
                invoke(json!({"operation":"state"})).await
            } else { Err("NAVIGATION_ALREADY_ACTIVE".into()) }; }
            let mut session = Session { owner:owner.into(), trip:trip.into(), id:uuid::Uuid::new_v4().to_string(), state:state.clone(), revision:0,
                token:request.get("token").and_then(Value::as_str).ok_or("AUTH_REQUIRED")?.into(), auth:auth.ok_or("AUTH_REQUIRED")?.clone() };
            let props = read(&session).await?;
            session.revision = props["revision"].as_u64().ok_or("VERSION_CONFLICT")?;
            if !props["route"].is_object() { return Err("NO_ROUTE".into()); }
            *SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")? = Some(session.clone());
            let result = match invoke(json!({"operation":"start", "trip_id":trip, "owner_id":owner, "session_id":session.id, "route":props["route"]})).await {
                Ok(result) => result,
                Err(error) => { *SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")? = None; return Err(error); }
            };
            if let Err(error) = persist(&session, json!({"status":"navigating", "navigation_device":"tauri_macos",
                "started_at":chrono::Utc::now().to_rfc3339(), "ended_at":""})).await {
                invoke(json!({"operation":"release"})).await?; *SESSION.lock().map_err(|_| "HOST_UNSUPPORTED")? = None; return Err(error);
            }
            Ok(result)
        },
        _ => Err("INVALID_ARGUMENT".into())
    }
}
