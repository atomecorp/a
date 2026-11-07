mod android_assets;
mod assistant_link;
mod audio_engine;
mod auth_device;
mod code_workspace;
mod dev_logging;
mod local_http_navigation;
mod native_billing;
mod native_clipboard;
mod native_communication;
mod native_contacts;
mod native_file_export;
mod native_health;
mod native_midi;
mod native_personal_import;
mod server;
mod streaming_view;
mod taxonomy_editor;
#[cfg(not(target_os = "android"))]
mod viewport_runtime;

use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Manager, State};

const TAURI_LOCAL_HTTP_PORT: u16 = 3000;
const TAURI_LOCAL_HTTP_URL: &str = "http://127.0.0.1:3000/";
#[cfg(target_os = "android")]
const TAURI_LOCAL_HTTP_WAIT_SECS: u64 = 120;
// Un ecran vide ne dit rien. Celui-ci nomme la panne : le serveur local n'a pas
// demarre, l'application n'est donc pas chargee — et aucune donnee n'est perdue.
const TAURI_LOCAL_HTTP_FAILURE_SCRIPT: &str = concat!(
    "(function(){var b=document.createElement('div');",
    "b.setAttribute('data-role','atome-local-server-failure');",
    "b.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;",
    "padding:32px;background:#1b0d1f;color:#f6eaf8;font:16px/1.5 system-ui,sans-serif;text-align:center';",
    "b.textContent='Le serveur local (port 3000) n a pas demarre : l application n est pas chargee. ",
    "Vos donnees sont intactes. Consultez la console du terminal pour la cause, puis relancez.';",
    "document.body.appendChild(b);})();"
);
macro_rules! println {
    ($($arg:tt)*) => {
        if atome_server::local::xcode_logs_enabled() {
            std::println!($($arg)*);
        }
    };
}

macro_rules! eprintln {
    ($($arg:tt)*) => {
        if atome_server::local::xcode_logs_enabled() {
            std::eprintln!($($arg)*);
        }
    };
}

#[derive(Clone)]
pub struct ProjectPaths {
    pub project_root: PathBuf,
}

#[tauri::command]
fn project_root(state: State<ProjectPaths>) -> String {
    state.project_root.to_string_lossy().to_string()
}

fn project_root_from_static_dir(static_dir: &Path) -> PathBuf {
    if static_dir.file_name().and_then(|name| name.to_str()) == Some("src")
        && let Some(atome_dir) = static_dir.parent()
        && atome_dir.file_name().and_then(|name| name.to_str()) == Some("atome")
        && let Some(root) = atome_dir.parent()
    {
        return root.to_path_buf();
    }

    static_dir.parent().unwrap_or(static_dir).to_path_buf()
}

fn resolve_shared_uploads_dir(static_dir: &Path, default_uploads_dir: &Path) -> PathBuf {
    match std::env::var("SQUIRREL_UPLOADS_DIR") {
        Ok(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                eprintln!(
                    "[tauri] SQUIRREL_UPLOADS_DIR is empty; using default uploads dir: {:?}",
                    default_uploads_dir
                );
                return default_uploads_dir.to_path_buf();
            }

            let mut candidate = PathBuf::from(trimmed);
            if !candidate.is_absolute() {
                let project_root = project_root_from_static_dir(static_dir);
                candidate = project_root.join(candidate);
            }
            candidate
        }
        Err(_) => {
            eprintln!(
                "[tauri] SQUIRREL_UPLOADS_DIR is not set; using default uploads dir: {:?}",
                default_uploads_dir
            );
            default_uploads_dir.to_path_buf()
        }
    }
}

#[allow(
    unsafe_code,
    reason = "sets the process environment before any thread exists"
)]
fn load_env_file(path: &Path, override_existing: bool) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.splitn(2, '=');
        let key = parts.next().unwrap_or("").trim();
        if key.is_empty() {
            continue;
        }
        let value_raw = parts.next().unwrap_or("").trim();
        if !override_existing && std::env::var_os(key).is_some() {
            continue;
        }
        let mut value = value_raw.to_string();
        if (value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\''))
        {
            value = value[1..value.len().saturating_sub(1)].to_string();
        }
        let value = value.replace("\\n", "\n");
        // SAFETY: run() loads the .env files first, before any thread exists.
        unsafe { std::env::set_var(key, value) };
    }
    Ok(true)
}

fn load_env_from_candidates() {
    let mut bases: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        bases.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe()
        && let Some(parent) = exe.parent()
    {
        bases.push(parent.to_path_buf());
    }

    for base in bases {
        let mut dir = base.clone();
        for _ in 0..8 {
            let env_path = dir.join(".env");
            if let Ok(true) = load_env_file(&env_path, false) {
                println!("[tauri] Loaded environment from {:?}", env_path);
                let env_local = dir.join(".env.local");
                match load_env_file(&env_local, true) {
                    Ok(true) => println!("[tauri] Loaded environment from {:?}", env_local),
                    Ok(false) => {}
                    Err(e) => eprintln!(
                        "[tauri] Warning: Failed to load .env.local from {:?}: {}",
                        env_local, e
                    ),
                }
                return;
            }
            if !dir.pop() {
                break;
            }
        }
    }

    println!("[tauri] No .env file found in cwd/exe path hierarchy");
}

#[cfg(not(target_os = "android"))]
fn live_repo_src_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|platforms| platforms.parent())
        .map(|root| root.join("atome/src"))
        .unwrap_or_else(|| PathBuf::from("../../atome/src"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The dependency graph enables both rustls providers (Tauri/Bevy bring
    // aws-lc-rs while the native authentication socket uses ring). Rustls 0.23
    // refuses to guess in that situation and otherwise panics on the first
    // wss:// authentication request. Select the provider before any runtime or
    // background service can create a TLS client.
    let _ = rustls::crypto::ring::default_provider().install_default();
    load_env_from_candidates();

    let _log_guard = dev_logging::init_tracing();
    let runtime_init_script = local_http_navigation::runtime_init_script();

    tauri::Builder::default()
        .append_invoke_initialization_script(runtime_init_script)
        .plugin(tauri_plugin_stt::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Opens the official social login pages in the system browser.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_health::init())
        .plugin(tauri_plugin_billing::init())
        .plugin(tauri_plugin_mobile_host::init())
        .manage(std::sync::Mutex::new(native_health::state()))
        .manage(assistant_link::AssistantRequestInbox::default())
        // A main-frame page load claims a new health channel (see native_health.rs).
        .on_page_load(|webview, payload| {
            if webview.label() != "main" {
                return;
            }
            match payload.event() {
                tauri::webview::PageLoadEvent::Started => native_health::reset_on_page_load(
                    &webview.state::<std::sync::Mutex<native_health::HealthChannelState>>(),
                ),
                // The loaded page learns the window's size (then each resize, `on_window_event`).
                #[cfg(not(target_os = "android"))]
                tauri::webview::PageLoadEvent::Finished => {
                    if let Some(win) = webview.app_handle().get_webview_window("main") {
                        viewport_runtime::publish_current_webview_viewport(&win);
                    }
                }
                #[cfg(target_os = "android")]
                tauri::webview::PageLoadEvent::Finished => {}
            }
        })
        .on_window_event(|_window, event| {
            // Android: the Kotlin host (MainActivity) owns the viewport and its safe-area insets.
            #[cfg(not(target_os = "android"))]
            viewport_runtime::publish_native_viewport(_window, event);
            if let tauri::WindowEvent::Focused(focused) = event
                && let Err(error) = audio_engine::wake_capture::set_foreground(*focused)
            {
                eprintln!("wake foreground transition failed: {}", error);
            }
        })
        .invoke_handler(tauri::generate_handler![
            auth_device::auth_device_key,
            auth_device::auth_local_request,
            auth_device::auth_development_request,
            dev_logging::log_from_webview,
            native_contacts::macos_contacts_snapshot,
            native_contacts::contacts_open_settings,
            native_personal_import::native_calendar_snapshot,
            native_personal_import::native_import_device_id,
            native_midi::start_native_midi,
            native_midi::send_native_midi,
            audio_engine::bridge::audio_init,
            audio_engine::bridge::audio_load_clip,
            audio_engine::bridge::audio_load_clip_from_bytes,
            audio_engine::bridge::audio_has_clip,
            audio_engine::bridge::audio_play,
            audio_engine::bridge::audio_play_instance,
            audio_engine::bridge::audio_schedule_instances,
            audio_engine::bridge::audio_measure_input_latency,
            audio_engine::bridge::audio_render_clock,
            audio_engine::bridge::audio_mix_apply,
            audio_engine::bridge::audio_mix_levels,
            audio_engine::bridge::audio_mix_devices,
            audio_engine::bridge::audio_mix_cut_tail,
            audio_engine::bridge::audio_mix_asset_load,
            audio_engine::bridge::audio_mix_asset_unload,
            audio_engine::bridge::audio_mix_module_state,
            audio_engine::bridge::audio_instrument_sample_load,
            audio_engine::bridge::audio_instrument,
            audio_engine::bridge::audio_direct_apply,
            audio_engine::bridge::audio_direct_levels,
            audio_engine::bridge::audio_direct_cut_tail,
            audio_engine::bridge::audio_direct_module_state,
            audio_engine::bridge::audio_direct_measure_latency,
            audio_engine::bridge::audio_stop,
            audio_engine::bridge::audio_stop_instance,
            audio_engine::bridge::audio_set_voice_end,
            audio_engine::bridge::audio_destroy_clip,
            audio_engine::bridge::audio_set_volume,
            audio_engine::bridge::audio_set_pan,
            audio_engine::bridge::audio_set_playback_rate,
            audio_engine::bridge::audio_wake_start,
            audio_engine::bridge::audio_wake_stop,
            audio_engine::bridge::audio_wake_read,
            audio_engine::bridge::audio_voice_start,
            audio_engine::bridge::audio_voice_stop,
            audio_engine::bridge::audio_voice_set_phrases,
            audio_engine::bridge::audio_voice_set_speaking,
            audio_engine::bridge::audio_voice_set_listening,
            audio_engine::bridge::audio_voice_set_wake_verifier,
            audio_engine::bridge::audio_voice_read,
            audio_engine::bridge::audio_record_start,
            audio_engine::bridge::audio_record_stop,
            audio_engine::bridge::audio_get_levels,
            audio_engine::bridge::audio_get_scope,
            audio_engine::bridge::audio_shutdown,
            native_clipboard::clipboard_write_text,
            native_clipboard::clipboard_read_text,
            native_clipboard::clipboard_read_items,
            native_clipboard::clipboard_has_text,
            native_file_export::export_file_save,
            native_file_export::export_file_print,
            native_health::health_invoke,
            native_billing::billing_invoke,
            native_communication::notifications_invoke,
            streaming_view::streaming_view_invoke,
            taxonomy_editor::taxonomy_read,
            taxonomy_editor::taxonomy_save,
            code_workspace::code_repo_list,
            code_workspace::code_repo_read,
            code_workspace::code_repo_search,
            code_workspace::code_todo_write,
            assistant_link::assistant_request_take,
            project_root
        ])
        .setup(|app| {
            let path_resolver = app.path();
            // Android exposes no file system path for bundled resources:
            // `resource_dir()` returns the URI "asset://localhost/" there. The staged
            // web root is therefore written to the application data directory before
            // the Axum server starts, and every consumer below works unchanged.
            // Only its path is resolved here: the extraction runs on the server
            // thread, because `setup` runs on the Android main thread.
            #[cfg(target_os = "android")]
            let static_dir: PathBuf = match android_assets::project_static_dir(app.handle()) {
                Ok(dir) => dir,
                Err(err) => panic!("Android assets directory is unavailable: {err}"),
            };

            #[cfg(not(target_os = "android"))]
            let static_dir: PathBuf = if cfg!(debug_assertions) {
                live_repo_src_dir()
            } else {
                match path_resolver.resource_dir() {
                    Ok(dir) => {
                        let mut resolved: Option<PathBuf> = None;
                        // `bundle.resources` maps every tree under `project/`, so a released
                        // bundle carries one project root at `<resource_dir>/project` and the
                        // frontend at `<resource_dir>/project/atome/src`.
                        let candidates: Vec<PathBuf> = vec![
                            dir.join("project/atome/src"),
                            dir.join("dist"),
                            dir.join("public"),
                            dir.join("src"),
                            dir.join("_up_/dist"),
                            dir.join("_up_/public"),
                            dir.join("_up_/src"),
                            dir.clone(),
                        ];

                        for candidate in candidates {
                            if candidate.join("index.html").exists() {
                                resolved = Some(candidate);
                                break;
                            }
                        }

                        resolved.unwrap_or_else(|| PathBuf::from("../../atome/src"))
                    }
                    Err(_) => PathBuf::from("../../atome/src"),
                }
            };

            #[cfg(not(target_os = "android"))]
            if !static_dir.join("index.html").exists() {
                eprintln!(
                    "⚠️  Static directory does not contain index.html: {:?}",
                    static_dir
                );
            }

            println!("📂 Static assets directory: {:?}", static_dir);

            let static_dir_abs = static_dir
                .canonicalize()
                .unwrap_or_else(|_| static_dir.clone());
            let project_root = project_root_from_static_dir(&static_dir_abs);
            app.manage(ProjectPaths {
                project_root: project_root.clone(),
            });

            let default_base = path_resolver
                .download_dir()
                .ok()
                .or_else(|| path_resolver.app_data_dir().ok())
                .or_else(|| std::env::current_dir().ok())
                .unwrap_or_else(|| PathBuf::from("."));
            let default_uploads_dir = default_base.join("squirrel").join("Uploads");

            let data_base = path_resolver
                .app_data_dir()
                .ok()
                .or_else(|| path_resolver.download_dir().ok())
                .or_else(|| std::env::current_dir().ok())
                .unwrap_or_else(|| PathBuf::from("."));
            let data_dir = data_base.join("squirrel").join("Data");

            let uploads_dir = resolve_shared_uploads_dir(&static_dir, &default_uploads_dir);
            if let Err(err) = fs::create_dir_all(&uploads_dir) {
                panic!(
                    "Unable to prepare shared uploads directory {:?}: {}",
                    uploads_dir, err
                );
            }
            println!("📁 Uploads directory: {:?}", uploads_dir);

            let static_dir_for_server = static_dir.clone();
            let uploads_dir_for_server = uploads_dir.clone();
            let data_dir_for_server = data_dir.clone();

            // Desktop: Axum's port is bound before the window exists (`create: false` in tauri.conf.json), so the page's
            // first request waits in the listener's backlog until Axum serves it: one load, never a request refused
            // by a server not yet up (a blank page until a second, navigated load).
            #[cfg(not(target_os = "android"))]
            let listener = std::net::TcpListener::bind(("127.0.0.1", TAURI_LOCAL_HTTP_PORT));
            #[cfg(target_os = "android")]
            let materialize_handle = app.handle().clone();
            #[cfg(not(target_os = "android"))]
            let server_handle = app.handle().clone();
            std::thread::spawn(move || {
                // No server without the web root: the navigation thread then
                // reports the failure on screen instead of the app crashing.
                #[cfg(target_os = "android")]
                if let Err(err) = android_assets::materialize_project_root(&materialize_handle) {
                    eprintln!("[tauri] Android assets could not be materialized: {err}");
                    return;
                }
                #[cfg(target_os = "android")]
                let listener = std::net::TcpListener::bind(("127.0.0.1", TAURI_LOCAL_HTTP_PORT));
                let rt = tokio::runtime::Runtime::new().unwrap();
                let served = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    rt.block_on(server::start_server(
                        static_dir_for_server,
                        uploads_dir_for_server,
                        data_dir_for_server,
                        listener,
                    ))
                }));
                if served.is_err() {
                    eprintln!("[tauri] Local Axum server panicked");
                }
                // The server only returns when it could not start or stopped: the window says so instead of staying blank.
                #[cfg(not(target_os = "android"))]
                if let Some(win) = server_handle.get_webview_window("main") {
                    let _ = win.eval(TAURI_LOCAL_HTTP_FAILURE_SCRIPT);
                }
            });

            #[cfg(not(target_os = "android"))]
            {
                let mut config = app
                    .config()
                    .app
                    .windows
                    .iter()
                    .find(|window| window.label == "main")
                    .ok_or("main window missing from tauri.conf.json")?
                    .clone();
                // The page is always Axum's: `frontendDist` names it only for a bundled build,
                // `tauri dev` would open `tauri://localhost` and find no asset there.
                config.url = tauri::WebviewUrl::External(tauri::Url::parse(TAURI_LOCAL_HTTP_URL)?);
                tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
                    .initialization_script(format!(
                        "window.__ATOME_PROJECT_ROOT__={:?};",
                        project_root.to_string_lossy()
                    ))
                    .build()?;
            }

            #[cfg(target_os = "android")]
            let navigation_handle = app.handle().clone();
            #[cfg(target_os = "android")]
            std::thread::spawn(move || {
                let address = std::net::SocketAddr::from(([127, 0, 0, 1], TAURI_LOCAL_HTTP_PORT));
                // The boot page stays until Axum answers; the failure is said on screen, never silent.
                let mut waited_secs = 0u64;
                let mut ready = false;
                while waited_secs < TAURI_LOCAL_HTTP_WAIT_SECS {
                    if local_http_navigation::wait_for_local_http(
                        address,
                        std::time::Duration::from_secs(5),
                    ) {
                        ready = true;
                        break;
                    }
                    waited_secs += 5;
                    eprintln!(
                        "[tauri] Local Axum server not ready after {}s (port {})",
                        waited_secs, TAURI_LOCAL_HTTP_PORT
                    );
                }
                let Some(win) = navigation_handle.get_webview_window("main") else {
                    eprintln!("[tauri] Unable to navigate main window: window not found");
                    return;
                };
                if !ready {
                    eprintln!(
                        "[tauri] Local Axum server never answered on port {}",
                        TAURI_LOCAL_HTTP_PORT
                    );
                    let _ = win.eval(TAURI_LOCAL_HTTP_FAILURE_SCRIPT);
                    return;
                }
                let Ok(url) = tauri::Url::parse(TAURI_LOCAL_HTTP_URL) else {
                    eprintln!("[tauri] Unable to parse local Axum URL");
                    return;
                };
                // The boot page is replaced, never stacked, so the system Back
                // (Tauri's app plugin goes back in the WebView history) cannot return to it.
                if let Err(err) = win.eval(&format!("location.replace({:?})", url.as_str())) {
                    eprintln!(
                        "[tauri] Unable to navigate main window to local Axum server: {}",
                        err
                    );
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tauri")
        .run(|_app, _event| {
            // `atome://assistant` (a Shortcut run by Siri) opens the page's assistant.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &_event {
                assistant_link::receive_urls(_app, urls);
            }
        });
}
