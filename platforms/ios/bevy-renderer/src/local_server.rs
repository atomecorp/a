// The local server of the iOS app and of its AUv3 extension: `atome_server::local`, the same
// one-person host as Tauri's, run in this process (iOS starts no process). Each process serves
// its own loopback port on the one app-group vault. Swift starts it, hands it the session key
// it keeps in the keychain and the device key's verifier, and rebinds it when iOS took the
// listening socket back during a suspension.

use crate::audio::{read, reply};
use atome_server::local::{self, AppState, Host, Prepared};
use serde_json::{Value as JsonValue, json};
use std::ffi::{CString, c_char};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, Mutex, OnceLock};

/// Swift's verifier of a device-key signature (`AuthDeviceKey.verify`): 1 valid, 0 invalid,
/// -1 the key is unavailable.
pub type VerifyDeviceSignature =
    extern "C" fn(scope: *const c_char, message: *const c_char, signature: *const c_char) -> i32;

struct IosHost {
    session_secret: String,
    verify: VerifyDeviceSignature,
}

impl Host for IosHost {
    fn device_key(
        &self,
        action: String,
        scope: String,
        message: Option<String>,
        signature: Option<String>,
    ) -> Result<JsonValue, String> {
        // The server only verifies; the page's own public/sign go through the native bridge.
        if action != "verify" {
            return Err("auth_device_action_invalid".into());
        }
        let text = |value: String| CString::new(value).map_err(|_| "auth_request_invalid");
        let scope = text(scope)?;
        let message = text(message.ok_or("auth_device_message_required")?)?;
        let signature = text(signature.ok_or("auth_device_signature_required")?)?;
        match (self.verify)(scope.as_ptr(), message.as_ptr(), signature.as_ptr()) {
            1 => Ok(JsonValue::Bool(true)),
            0 => Ok(JsonValue::Bool(false)),
            _ => Err("auth_protected_device_key_unavailable".into()),
        }
    }

    fn session_secret(&self, _data_dir: &Path) -> Result<String, String> {
        Ok(self.session_secret.clone())
    }

    // An idle WAL handle keeps its shared locks in the app group: iOS kills a suspended
    // process that holds them (0xDEAD10CC).
    fn journal_mode(&self) -> &'static str {
        "DELETE"
    }

    fn answer(
        &self,
        _kind: &str,
        _data: &JsonValue,
        _state: &AppState,
    ) -> Option<Pin<Box<dyn Future<Output = JsonValue> + Send>>> {
        None
    }

    fn routes(&self) -> axum::Router<AppState> {
        axum::Router::new()
    }
}

struct Server {
    runtime: tokio::runtime::Runtime,
    prepared: Prepared,
    serving: Mutex<Option<(u16, tokio::task::JoinHandle<()>)>>,
    // Stops the vault's running statement (SQLite rolls its transaction back).
    interrupt: Box<dyn Fn() + Send + Sync>,
}

static SERVER: OnceLock<Server> = OnceLock::new();

fn bind(server: &Server, preferred_port: u16) -> Result<u16, String> {
    let mut serving = server
        .serving
        .lock()
        .map_err(|_| "local_server_state_unavailable")?;
    if let Some((_, task)) = serving.take() {
        // The old listener is closed before its port is asked for again.
        task.abort();
        let _ = server.runtime.block_on(task);
    }
    let listener = std::net::TcpListener::bind(("127.0.0.1", preferred_port))
        .or_else(|_| std::net::TcpListener::bind(("127.0.0.1", 0)))
        .map_err(|error| format!("local_server_bind_failed:{error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("local_server_bind_failed:{error}"))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("local_server_bind_failed:{error}"))?;
    let app = server.prepared.app.clone();
    let task = server.runtime.spawn(async move {
        match tokio::net::TcpListener::from_std(listener) {
            Ok(listener) => local::serve(listener, app).await,
            Err(error) => eprintln!("ERROR: the local server cannot listen: {error}"),
        }
    });
    *serving = Some((port, task));
    Ok(port)
}

fn start(
    static_dir: PathBuf,
    storage_dir: PathBuf,
    data_dir: PathBuf,
    session_secret: String,
    verify: VerifyDeviceSignature,
    preferred_port: u16,
) -> Result<u16, String> {
    if let Some(server) = SERVER.get() {
        return server
            .serving
            .lock()
            .map_err(|_| "local_server_state_unavailable".to_string())?
            .as_ref()
            .map(|(port, _)| *port)
            .ok_or_else(|| "local_server_not_listening".to_string());
    }
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .thread_name("atome-local-server")
        .enable_all()
        .build()
        .map_err(|error| format!("local_server_runtime_failed:{error}"))?;
    let host = Arc::new(IosHost {
        session_secret,
        verify,
    });
    let prepared = runtime.block_on(local::prepare(static_dir, storage_dir, data_dir, host))?;
    let interrupt = {
        let atome = prepared
            .state
            .atome_state
            .as_ref()
            .ok_or("local_vault_unavailable")?;
        let handle = atome
            .db
            .lock()
            .map_err(|_| "local_vault_unavailable")?
            .get_interrupt_handle();
        Box::new(move || handle.interrupt())
    };
    let server = SERVER.get_or_init(|| Server {
        runtime,
        prepared,
        serving: Mutex::new(None),
        interrupt,
    });
    bind(server, preferred_port)
}

/// Starts the local server once per process and returns its port (the preferred one when it is
/// free), or 0 with the reason in `error_out` (released with `atome_ios_audio_string_free`).
/// `static_dir` holds the application's files, `storage_dir` the person's (`data/users/<id>/…`),
/// `data_dir` the vault (the app group's root), `session_secret` the key that signs the local
/// sessions.
#[unsafe(no_mangle)]
pub extern "C" fn atome_ios_local_server_start(
    static_dir: *const c_char,
    storage_dir: *const c_char,
    data_dir: *const c_char,
    session_secret: *const c_char,
    verify: VerifyDeviceSignature,
    preferred_port: u16,
    error_out: *mut *mut c_char,
) -> u16 {
    let paths = (read(static_dir), read(storage_dir), read(data_dir));
    let result = match (paths, read(session_secret)) {
        ((Some(static_dir), Some(storage_dir), Some(data_dir)), Some(secret))
            if !secret.is_empty() =>
        {
            start(
                PathBuf::from(static_dir),
                PathBuf::from(storage_dir),
                PathBuf::from(data_dir),
                secret,
                verify,
                preferred_port,
            )
        }
        _ => Err("local_server_arguments_invalid".into()),
    };
    port_or_error(result, error_out)
}

/// Serves the started server on a new listening socket (the same port when it is free) and
/// returns its port, or 0 with the reason in `error_out`.
#[unsafe(no_mangle)]
pub extern "C" fn atome_ios_local_server_rebind(
    preferred_port: u16,
    error_out: *mut *mut c_char,
) -> u16 {
    let result = SERVER
        .get()
        .ok_or_else(|| "local_server_not_started".to_string())
        .and_then(|server| bind(server, preferred_port));
    port_or_error(result, error_out)
}

fn port_or_error(result: Result<u16, String>, error_out: *mut *mut c_char) -> u16 {
    match result {
        Ok(port) => port,
        Err(error) => {
            if !error_out.is_null() {
                // SAFETY: Swift passes the address of a pointer it owns for the call.
                unsafe { *error_out = reply(JsonValue::String(error)) };
            }
            0
        }
    }
}

/// Answers one `/ws/api` frame for a native controller (GPS, Health, Apple Music, the native
/// bridge's `auth`) exactly as the page's socket would; the reply is released with
/// `atome_ios_audio_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn atome_ios_local_server_answer(frame_json: *const c_char) -> *mut c_char {
    let Some(server) = SERVER.get() else {
        return reply(
            json!({"type": "error", "success": false, "error": "local_server_not_started"}),
        );
    };
    let frame = read(frame_json).and_then(|text| serde_json::from_str::<JsonValue>(&text).ok());
    let Some(frame) = frame.filter(JsonValue::is_object) else {
        return reply(json!({"type": "error", "success": false, "error": "Invalid JSON"}));
    };
    let state = &server.prepared.state;
    reply(server.runtime.block_on(local::ws_api::answer(frame, state)))
}

/// The person a local session token names, as `{"user_id":…}` or `{"user_id":null}` when the
/// token is not a valid local session; released with `atome_ios_audio_string_free`.
#[unsafe(no_mangle)]
pub extern "C" fn atome_ios_local_server_verify(token: *const c_char) -> *mut c_char {
    let user = SERVER.get().and_then(|server| {
        let auth = server.prepared.state.auth_state.as_ref()?;
        local::local_auth::verified_user_id_from_token(auth, read(token).as_deref())
    });
    reply(json!({ "user_id": user }))
}

/// The background time of one unit of work on the vault (`UIApplication.beginBackgroundTask`):
/// its id, or -1 when none is left.
pub type BeginBackgroundTime = extern "C" fn() -> i64;
pub type EndBackgroundTime = extern "C" fn(identifier: i64);

/// On the way to the background: from now on a unit of work on the vault starts only under
/// the background time `begin` grants it, else it is refused; returns once the units under way
/// are over, so the app is never suspended holding a lock on the app group's database
/// (0xDEAD10CC). Called under the app's own background-time assertion.
#[unsafe(no_mangle)]
pub extern "C" fn atome_ios_local_server_quiesce(
    begin: BeginBackgroundTime,
    end: EndBackgroundTime,
) {
    if let Some(atome) = SERVER
        .get()
        .and_then(|server| server.prepared.state.atome_state.as_ref())
    {
        atome.db.quiesce(Arc::new(move || {
            let identifier = begin();
            (identifier >= 0).then(|| Box::new(move || end(identifier)) as Box<dyn FnOnce() + Send>)
        }));
    }
}

/// Back in the foreground: the units start freely again and the background loops go on.
#[unsafe(no_mangle)]
pub extern "C" fn atome_ios_local_server_resume() {
    if let Some(atome) = SERVER
        .get()
        .and_then(|server| server.prepared.state.atome_state.as_ref())
    {
        atome.db.resume();
    }
}

/// A unit's background time ran out: the running statement stops now and its transaction is
/// rolled back, instead of being suspended with its lock.
#[unsafe(no_mangle)]
pub extern "C" fn atome_ios_local_server_interrupt() {
    if let Some(server) = SERVER.get() {
        (server.interrupt)();
    }
}
