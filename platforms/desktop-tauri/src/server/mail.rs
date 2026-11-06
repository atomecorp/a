// The personal mail gateway of the desktop (`/api/eve/mail/*`): the Node mail runtime run for each request.
use super::*;

#[derive(Deserialize, Default)]
pub(super) struct MailSyncRequest {
    initial: Option<bool>,
    mailbox: Option<String>,
    limit: Option<i64>,
    unread_only: Option<bool>,
    credentials: Option<JsonValue>,
}

#[derive(Deserialize, Default)]
pub(super) struct MailSendRequest {
    draft: Option<JsonValue>,
    confirmed: Option<bool>,
    credentials: Option<JsonValue>,
}

#[derive(Deserialize, Default)]
pub(super) struct MailMarkReadRequest {
    message: Option<JsonValue>,
    read: Option<bool>,
    credentials: Option<JsonValue>,
}

#[derive(Deserialize, Default)]
pub(super) struct MailMessageActionRequest {
    message: Option<JsonValue>,
    remote_mailbox: Option<String>,
    credentials: Option<JsonValue>,
}

pub(super) async fn eve_mail_sync_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailSyncRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "initial": payload.initial.unwrap_or(false),
        "mailbox": payload.mailbox,
        "limit": payload.limit.unwrap_or(20),
        "unread_only": payload.unread_only.unwrap_or(false),
        "credentials": payload.credentials.unwrap_or(JsonValue::Null)
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_sync_invalid_json:{}:{}", error, stdout));
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_sync_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_sync_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_sync_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

pub(super) async fn eve_mail_send_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailSendRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "send",
        "draft": payload.draft.unwrap_or(JsonValue::Null),
        "confirmed": payload.confirmed.unwrap_or(true),
        "credentials": payload.credentials.unwrap_or(JsonValue::Null)
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_send_invalid_json:{}:{}", error, stdout));
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_send_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_send_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_send_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

pub(super) async fn eve_mail_mark_read_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailMarkReadRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "mark_read",
        "message": payload.message.unwrap_or(JsonValue::Null),
        "read": payload.read.unwrap_or(true),
        "credentials": payload.credentials.unwrap_or(JsonValue::Null)
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!(
                                "mail_mark_read_invalid_json:{}:{}",
                                error, stdout
                            ));
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_mark_read_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_mark_read_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_mark_read_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

pub(super) async fn eve_mail_archive_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailMessageActionRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "archive",
        "message": payload.message.unwrap_or(JsonValue::Null),
        "remote_mailbox": payload.remote_mailbox.unwrap_or_else(|| "Archive".to_string()),
        "credentials": payload.credentials.unwrap_or(JsonValue::Null)
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_archive_invalid_json:{}:{}", error, stdout));
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_archive_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_archive_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_archive_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}

pub(super) async fn eve_mail_delete_handler(
    State(state): State<AppState>,
    Json(payload): Json<MailMessageActionRequest>,
) -> impl IntoResponse {
    let project_root = state.project_root.as_ref().clone();
    let request_payload = json!({
        "action": "delete",
        "message": payload.message.unwrap_or(JsonValue::Null),
        "remote_mailbox": payload.remote_mailbox.unwrap_or_else(|| "Trash".to_string()),
        "credentials": payload.credentials.unwrap_or(JsonValue::Null)
    })
    .to_string();

    let task = tokio::task::spawn_blocking(move || {
        let node_binary = std::env::var("SQUIRREL_NODE_BINARY")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "node".to_string());
        let script_path = project_root.join("tools").join("axum_mail_sync_bridge.mjs");
        let output = Command::new(node_binary)
            .current_dir(&project_root)
            .arg(script_path)
            .arg(request_payload)
            .output();
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stdout.is_empty() {
                    match serde_json::from_str::<JsonValue>(&stdout) {
                        Ok(value) => return Ok((output.status.success(), value)),
                        Err(error) => {
                            return Err(format!("mail_delete_invalid_json:{}:{}", error, stdout));
                        }
                    }
                }
                Err(if stderr.is_empty() {
                    "mail_delete_bridge_no_output".to_string()
                } else {
                    stderr
                })
            }
            Err(error) => Err(format!("mail_delete_bridge_spawn_failed:{}", error)),
        }
    })
    .await;

    match task {
        Ok(Ok((true, value))) => Json(value).into_response(),
        Ok(Ok((false, value))) => (StatusCode::SERVICE_UNAVAILABLE, Json(value)).into_response(),
        Ok(Err(error)) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "ok": false,
                "error": error
            })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "ok": false,
                "error": format!("mail_delete_bridge_join_failed:{}", error)
            })),
        )
            .into_response(),
    }
}
