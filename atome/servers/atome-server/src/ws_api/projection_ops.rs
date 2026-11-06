// The `/ws/api` families of what the server projects from the people's vaults into shared bases
// (server/wsApiOperationChain.js `FAMILIES`, ported family by family): the objectives network
// (server/ws_objective_network.js), the reports on a public event (server/ws_public_events.js) and
// the shop (server/ws_shop.js), the coaches (server/ws_coaches.js), an account's public sharing key
// (server/ws_share_keys.js), its plan and credits (server/billing/ws_billing_operations.js), its
// scheduled sends (scheduled/) and its websites (server/ws_site.js). The connection says who it is
// (identity.rs `connection_of`, the account it is attached to). As on Fastify, a family's
// thrown error answers nothing: it is told to the operator.
use super::Connection;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::Arc;

pub(super) const KINDS: [&str; 10] = [
    "objective-network",
    "public-events",
    "shop",
    "shop-public",
    "coaches",
    "coaches-public",
    "share-key",
    "billing",
    super::scheduled::KIND,
    "site",
];

// `wsResponse(type, message, success, fields)`.
pub(super) fn response(
    kind: &str,
    message: &JsonValue,
    success: bool,
    fields: JsonValue,
) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!(format!("{kind}-response")));
    reply.insert(
        "requestId".into(),
        js::first(message, &["requestId", "request_id"])
            .cloned()
            .unwrap_or(JsonValue::Null),
    );
    reply.insert("success".into(), json!(success));
    reply.insert("ok".into(), json!(success));
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

async fn decided(
    connection: &Connection,
    kind: &str,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    // `share-key` and `billing` read the account the message's token names
    // (`wsSignedInPrincipal`, `resolveWsApiPrincipal(connection, message)`), the others the account
    // the connection is attached to.
    let signed = kind == "share-key" || kind == "billing";
    let front = connection
        .connection_of(json!({ "message": message, "signed": signed }))
        .await?;
    if let Some(session_error) = front.get("session_error") {
        return Ok(session_error.clone());
    }
    let principal = front.get("principal").and_then(JsonValue::as_str);
    let user = principal.filter(|_| front.get("provisioned") == Some(&json!(true)));
    if kind == "billing" {
        let user = if front.get("unreadable") == Some(&json!(true)) {
            Err(())
        } else {
            Ok(user)
        };
        let (success, fields) = connection.ws_api.billing.frame(message, user).await;
        return Ok(response(kind, message, success, fields));
    }
    if signed {
        return share_key(connection, message, user).await;
    }
    if kind == super::scheduled::KIND {
        return Ok(match user {
            Some(user) => super::scheduled::frame(&connection.ws_api, message, user).await,
            None => response(
                kind,
                message,
                false,
                json!({ "error": "scheduled_auth_required" }),
            ),
        });
    }
    if kind == "site" {
        // A site's thrown error is answered (`WRITE_FAILED`), as server/ws_site.js answers it.
        let Some(user) = user else {
            return Ok(response(
                kind,
                message,
                false,
                json!({ "error": "AUTH_REQUIRED" }),
            ));
        };
        let ws_api = &connection.ws_api;
        return Ok(
            match ws_api.site.frame(&ws_api.downloads(), message, user).await {
                Ok(Some(result)) => response(
                    kind,
                    message,
                    result.get("ok") != Some(&json!(false)),
                    result,
                ),
                Ok(None) => response(kind, message, false, json!({ "error": "INVALID_ARGUMENT" })),
                Err(error) => response(
                    kind,
                    message,
                    false,
                    json!({ "error": "WRITE_FAILED", "detail": error }),
                ),
            },
        );
    }
    let social = &connection.ws_api.social;
    let action = message
        .get("action")
        .filter(|action| js::truthy(Some(action)));
    let action = action
        .map(|action| js::text(Some(action)))
        .unwrap_or_default();
    match kind {
        "shop-public" => {
            return Ok(match social.shop.public(message, principal).await? {
                Some(result) => response(kind, message, true, result),
                None => response(
                    kind,
                    message,
                    false,
                    json!({ "error": "shop_action_invalid" }),
                ),
            });
        }
        "shop" if !crate::social::shop::Shop::account_action(&action) => {
            return Ok(response(
                kind,
                message,
                false,
                json!({ "error": "shop_action_invalid" }),
            ));
        }
        "coaches-public" => {
            return Ok(match social.coaches.public(message, principal).await? {
                Some(result) => {
                    let success = result.get("ok") != Some(&json!(false));
                    response(kind, message, success, result)
                }
                None => response(
                    kind,
                    message,
                    false,
                    json!({ "error": "coach_action_invalid" }),
                ),
            });
        }
        "coaches" if !crate::social::coaches::Coaches::account_action(message) => {
            return Ok(response(
                kind,
                message,
                false,
                json!({ "error": "coach_action_invalid" }),
            ));
        }
        _ => {}
    }
    let Some(user) = user else {
        let error = match kind {
            "public-events" => "events_auth_required",
            "shop" => "shop_auth_required",
            "coaches" => "coach_auth_required",
            _ => "objective_network_auth_required",
        };
        return Ok(response(kind, message, false, json!({ "error": error })));
    };
    let result = match kind {
        "public-events" => social.events.handle(message, user).await?,
        "coaches" => {
            social
                .coaches
                .account(&social.directory, message, user)
                .await?
        }
        "shop" => {
            social
                .shop
                .account(&social.directory, message, user)
                .await?
        }
        _ => {
            social
                .objectives
                .handle(&social.directory, message, user)
                .await?
        }
    };
    Ok(response(
        kind,
        message,
        result.get("ok") != Some(&json!(false)),
        result,
    ))
}

// `share-key` (server/ws_share_keys.js, atome/src/shared/share_key_contract.js): an account's
// published public key, read by another account before it seals a health list for it. Only the
// public half is answered; a stored key that is not one is an error told to the operator.
async fn share_key(
    connection: &Connection,
    message: &JsonValue,
    user: Option<&str>,
) -> Result<JsonValue, String> {
    const KIND: &str = "share-key";
    let fail = |error: &str| response(KIND, message, false, json!({ "error": error }));
    if user.is_none() {
        return Ok(fail("AUTH_REQUIRED"));
    }
    if js::text(message.get("action").filter(|a| js::truthy(Some(a)))) != "read" {
        return Ok(fail("INVALID_ARGUMENT"));
    }
    let principal = message
        .get("principal_id")
        .filter(|p| js::truthy(Some(p)))
        .map(|p| js::trim(&js::text(Some(p))).to_string())
        .unwrap_or_default();
    if principal.is_empty() {
        return Ok(fail("INVALID_ARGUMENT"));
    }
    let id = format!(
        "share_key:{}",
        crate::http::uri::encode_uri_component(&principal)
    );
    let state = connection
        .router()
        .get_state(&principal, &json!(id))
        .await?;
    let jwk = &state["properties"]["public_jwk"];
    if !js::truthy(Some(jwk)) {
        return Ok(fail("SHARE_KEY_UNAVAILABLE"));
    }
    let part = |name: &str| {
        jwk[name].as_str().is_some_and(|part| {
            part.len() == 43
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        })
    };
    let valid = jwk.as_object().is_some_and(|keys| keys.len() == 4)
        && jwk["kty"] == json!("EC")
        && jwk["crv"] == json!("P-256")
        && part("x")
        && part("y");
    if !valid {
        return Err("SHARE_KEY_INVALID".into());
    }
    Ok(response(KIND, message, true, json!({ "public_jwk": jwk })))
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let kind = js::text(message.get("type"));
    match decided(&connection, &kind, &message).await {
        Ok(reply) => connection.reply(reply).await,
        Err(error) => eprintln!("[ws/api] {kind} failed {error}"),
    }
}
