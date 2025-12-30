use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;
use tracing::{debug, error, info, warn};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[derive(Debug, Deserialize)]
pub struct WebviewLogPayload {
    pub timestamp: Option<String>,
    pub level: Option<String>,
    pub source: Option<String>,
    pub component: Option<String>,
    pub request_id: Option<String>,
    pub session_id: Option<String>,
    pub message: Option<String>,
    pub data: Option<Value>,
}

fn resolve_log_dir() -> PathBuf {
    if let Ok(raw) = std::env::var("SQUIRREL_LOG_DIR") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let direct = cwd.join("logs");
    if direct.exists() {
        return direct;
    }

    if let Some(parent) = cwd.parent() {
        let parent_logs = parent.join("logs");
        if parent_logs.exists() {
            return parent_logs;
        }
    }

    // Finder-launched macOS apps often start with cwd = "/".
    // Never default to "/logs" because it is not writable.
    if cwd.as_os_str() == "/" {
        if let Ok(home) = std::env::var("HOME") {
            let trimmed = home.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed)
                    .join("Library")
                    .join("Logs")
                    .join("squirrel");
            }
        }
    }

    // Fallback when we are outside the repo and no logs dir exists yet.
    if let Ok(home) = std::env::var("HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed)
                .join("Library")
                .join("Logs")
                .join("squirrel");
        }
    }

    direct
}

pub fn init_tracing() -> Option<WorkerGuard> {
    let log_dir = resolve_log_dir();
    let file_logging_enabled = match std::fs::create_dir_all(&log_dir) {
        Ok(_) => true,
        Err(err) => {
            eprintln!("WARN: Unable to create log directory {:?}: {}", log_dir, err);
            false
        }
    };

    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let stdout_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_target(false)
        .with_writer(std::io::stdout);

    if file_logging_enabled {
        let file_appender = tracing_appender::rolling::never(log_dir, "axum.log");
        let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
        let file_layer = tracing_subscriber::fmt::layer()
            .json()
            .with_target(false)
            .with_writer(file_writer);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(stdout_layer)
            .with(file_layer)
            .init();

        return Some(guard);
    }

    tracing_subscriber::registry()
        .with(env_filter)
        .with(stdout_layer)
        .init();

    None
}

#[tauri::command]
pub fn log_from_webview(payload: WebviewLogPayload) {
    let level = payload.level.as_deref().unwrap_or("info");
    let webview_source = payload.source.as_deref().unwrap_or("tauri_webview");
    let webview_timestamp = payload.timestamp.as_deref().unwrap_or("");
    let component = payload.component.as_deref().unwrap_or("ui");
    let message = payload.message.as_deref().unwrap_or("");
    let request_id = payload.request_id.as_deref().unwrap_or("");
    let session_id = payload.session_id.as_deref().unwrap_or("");
    let data = payload.data.unwrap_or(Value::Null);

    match level {
        "debug" => debug!(
            source = "tauri_webview",
            webview_source = webview_source,
            webview_timestamp = webview_timestamp,
            component = component,
            request_id = request_id,
            session_id = session_id,
            message = message,
            data = ?data
        ),
        "warn" => warn!(
            source = "tauri_webview",
            webview_source = webview_source,
            webview_timestamp = webview_timestamp,
            component = component,
            request_id = request_id,
            session_id = session_id,
            message = message,
            data = ?data
        ),
        "error" => error!(
            source = "tauri_webview",
            webview_source = webview_source,
            webview_timestamp = webview_timestamp,
            component = component,
            request_id = request_id,
            session_id = session_id,
            message = message,
            data = ?data
        ),
        _ => info!(
            source = "tauri_webview",
            webview_source = webview_source,
            webview_timestamp = webview_timestamp,
            component = component,
            request_id = request_id,
            session_id = session_id,
            message = message,
            data = ?data
        ),
    }
}
