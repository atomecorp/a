// An account's roles (server/auth_account_roles.js, ported), kept in the account store
// (database/auth_security_schema.sql, table `auth_account_roles`): `admin` validates or refuses the
// feature requests and moves them on the Roadmap (feature_requests.rs). A role is given and taken
// back only on the server (scripts/account_roles_admin.mjs); no frame grants one.
//
// `account-roles` on /ws/api: the roles of the signed-in account asking, so the app shows the
// admin's views; the server checks the role again on every admin frame.
use super::{Asker, response};
use crate::social::news::db::{all, get};
use serde_json::{Value as JsonValue, json};

pub(super) const KIND: &str = "account-roles";

/// `wsSignedInPrincipal(connection, message)`: the account the message's own token names, else the
/// connection's still valid one, when provisioned; none when its token does not verify. The
/// device session's own refusal is answered as it is (`Err`).
pub(super) async fn signed_principal(
    asker: &Asker<'_>,
    message: &JsonValue,
) -> Result<Result<Option<String>, JsonValue>, String> {
    let front = asker
        .connection
        .connection_of(json!({ "message": message, "signed": true }))
        .await?;
    if let Some(session_error) = front.get("session_error") {
        return Ok(Err(session_error.clone()));
    }
    Ok(Ok(front
        .get("principal")
        .and_then(JsonValue::as_str)
        .filter(|_| front.get("provisioned") == Some(&json!(true)))
        .map(str::to_string)))
}

/// `roles.has(principalId, role)`.
pub(super) async fn has(
    asker: &Asker<'_>,
    principal: &str,
    role: &'static str,
) -> Result<bool, String> {
    let principal = principal.to_string();
    asker
        .connection
        .ws_api
        .sessions
        .central()
        .transaction(move |db| {
            get(
                db,
                "SELECT 1 AS found FROM auth_account_roles WHERE principal_id = ? AND role = ?",
                &[&principal, &role],
            )
            .map(|row| row.is_some())
        })
        .await
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let principal = match signed_principal(asker, message).await? {
        Ok(principal) => principal,
        Err(session_error) => return Ok(session_error),
    };
    // A guest or a visitor has no role: an empty answer, not a failure.
    let roles = match principal {
        Some(principal) => asker
            .connection
            .ws_api
            .sessions
            .central()
            .transaction(move |db| {
                all(
                    db,
                    "SELECT role FROM auth_account_roles WHERE principal_id = ? ORDER BY role",
                    &[&principal],
                )
            })
            .await?
            .into_iter()
            .map(|row| row["role"].clone())
            .collect(),
        None => Vec::new(),
    };
    Ok(response(
        KIND,
        message,
        true,
        json!({ "ok": true, "roles": roles }),
    ))
}
