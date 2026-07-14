use super::{require_remote_control, AppState};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value as JsonValue};

pub(super) async fn status(
    headers: HeaderMap,
    State(state): State<AppState>,
) -> (StatusCode, Json<JsonValue>) {
    let auth = require_remote_control(&headers, &state);
    let authorized = auth.is_ok();
    let user_id = auth.ok().flatten();
    (
        if authorized {
            StatusCode::OK
        } else {
            StatusCode::UNAUTHORIZED
        },
        Json(json!({
            "success": authorized,
            "runtime": "tauri",
            "enabled": state.remote_control_enabled,
            "token_required": state.remote_control_token.is_some(),
            "user_id": user_id,
            "error": if authorized { JsonValue::Null } else { JsonValue::String("remote_control_unauthorized".to_string()) }
        })),
    )
}
