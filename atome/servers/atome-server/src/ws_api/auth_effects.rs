// What an `auth` operation's effects do once it is done (auth/outcome.rs), before its reply: the
// account's live devices told (server/wsAccountAuth.js `notify`), the sessions it ended
// disconnected (server/wsPhoneLinkAuth.js `disconnectSession`), a pairing's requester followed and
// told (`_authPairRequestId`, `tellRequester`), the connection joined to its account (`me`), and a
// phone link's waiting connections told (`announceLinkReady`). Every open connection is read from
// the live registry (social/live.rs).
use super::{Connection, WsApi};
use crate::auth::{devices, now_ms};
use crate::social::live;
use crate::social::push::Audience;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::HashSet;
use std::sync::Arc;

impl Connection {
    /// One effect of an operation this connection asked; true when it ended this connection's
    /// own session (its close then waits for its reply).
    pub(super) async fn effect(&self, kind: &str, fields: &JsonValue) -> Result<bool, String> {
        match kind {
            "notify" => {
                let principal = js::id(fields.get("principal"));
                notify(
                    &self.ws_api,
                    &principal,
                    &fields["notice"],
                    &fields["options"],
                )
                .await?;
            }
            "disconnect" => {
                let mut own = false;
                for session in fields["sessions"].as_array().into_iter().flatten() {
                    own |= disconnect_session(&js::string(session), self).await;
                }
                return Ok(own);
            }
            "pair" => {
                let pair = js::truthy(fields.get("pairId")).then(|| js::string(&fields["pairId"]));
                *self.pair.lock().expect("pair request") = pair;
            }
            "pair-update" => {
                let pair = js::id(fields.get("pairId"));
                tell_requester(&pair, &js::id(fields.get("state"))).await;
            }
            "attach" => {
                self.attach(&js::id(fields.get("principal"))).await;
                // The attachment lasts as long as the device session that asked for it.
                if let crate::auth::connection::Expiry::At(ms) =
                    crate::auth::connection::Expiry::of(fields)
                {
                    self.identity.held().expiry = crate::auth::connection::Expiry::At(ms);
                }
            }
            "link-ready" => announce_link_ready(&fields["attemptId"]).await,
            _ => return Err(format!("auth_effect_unknown:{kind}")),
        }
        Ok(false)
    }

    /// `connection.close(4001, 'session_revoked')`.
    pub(super) async fn close_revoked(&self) {
        let frame = axum::extract::ws::CloseFrame {
            code: 4001,
            reason: "session_revoked".into(),
        };
        let _ = self
            .sender()
            .send(axum::extract::ws::Message::Close(Some(frame)))
            .await;
    }
}

/// `notify(principal, notice, { exceptDeviceId, personalOnly, push })`: the notice to the
/// connections whose device session is the account's (but the excepted device, and only the
/// personal devices out of probation when asked), then pushed to the devices that heard nothing.
async fn notify(
    ws_api: &WsApi,
    principal: &str,
    notice: &JsonValue,
    options: &JsonValue,
) -> Result<(), String> {
    if principal.is_empty() {
        return Ok(());
    }
    let except = options
        .get("exceptDeviceId")
        .filter(|device| js::truthy(Some(device)));
    let personal_only = js::truthy(options.get("personalOnly"));
    let mut frame = JsonMap::new();
    frame.insert("type".into(), json!("auth-notice"));
    if let JsonValue::Object(fields) = notice {
        frame.extend(fields.clone());
    }
    let frame = JsonValue::Object(frame);
    let mut heard = HashSet::new();
    for connection in live::connections() {
        let Some(claims) = connection.identity.held().claims.clone() else {
            continue;
        };
        if claims.get("sub").and_then(JsonValue::as_str) != Some(principal)
            || connection.sender().is_closed()
        {
            continue;
        }
        let kid = claims
            .pointer("/cnf/kid")
            .and_then(JsonValue::as_str)
            .map(String::from);
        if except.is_some() || personal_only {
            let id = kid.clone().unwrap_or_default();
            let key = ws_api
                .sessions
                .central()
                .transaction(move |db| devices::by_id(db, &id))
                .await?;
            let Some(key) = key else {
                continue;
            };
            if except.is_some_and(|device| device == &json!(devices::device_of(&key))) {
                continue;
            }
            if personal_only && !devices::hears_account_requests(Some(&key), now_ms() as i64) {
                continue;
            }
        }
        connection.reply(frame.clone()).await;
        heard.extend(kid);
    }
    if js::truthy(options.get("push")) {
        let mut item = JsonMap::new();
        for (name, key) in [("id", "pairId"), ("kind", "kind")] {
            if let Some(value) = notice.get(key) {
                item.insert(name.into(), value.clone());
            }
        }
        let push = ws_api.social.push.clone();
        let principal = principal.to_string();
        let kind = notice.get("kind").cloned().unwrap_or(JsonValue::Null);
        tokio::spawn(async move {
            let audience = Audience {
                except_key_ids: Some(heard),
                personal_only,
            };
            match push
                .deliver(&principal, &JsonValue::Object(item), &audience)
                .await
            {
                Ok(result)
                    if result["ok"] != json!(true)
                        && result["error"] != json!("push_configuration_required") =>
                {
                    let results = result["results"].as_array().map_or(0, Vec::len);
                    eprintln!(
                        "[auth] notice push not delivered {}",
                        json!({ "kind": kind, "results": results })
                    );
                }
                Ok(_) => {}
                Err(error) => eprintln!("[auth] notice push failed {error}"),
            }
        });
    }
    Ok(())
}

/// `disconnectSession(sessionId, kept)`: every connection of the session leaves its account; the
/// others close at once, `kept` once its reply is sent. True when `kept` held the session.
async fn disconnect_session(session: &str, kept: &Connection) -> bool {
    let mut held = false;
    for connection in live::connections() {
        if connection.identity.held().session_id.as_deref() != Some(session) {
            continue;
        }
        connection.detach();
        if std::ptr::eq(Arc::as_ptr(&connection), kept) {
            held = true;
        } else {
            tokio::spawn(async move { connection.close_revoked().await });
        }
    }
    held
}

/// `tellRequester(pairId, state)`: the device waiting on a pairing hears it on the socket it asked from.
async fn tell_requester(pair: &str, state: &str) {
    let frame = json!({ "type": "auth-pair-update", "pairId": pair, "state": state });
    for connection in live::connections() {
        if connection.pair.lock().expect("pair request").as_deref() == Some(pair) {
            connection.reply(frame.clone()).await;
        }
    }
}

/// `announceLinkReady(attemptId)`: the link was opened elsewhere; the connections resuming it hear it.
async fn announce_link_ready(attempt: &JsonValue) {
    let frame = json!({ "type": "phone-link-ready", "attemptId": attempt });
    for connection in live::connections() {
        if connection
            .link_attempt
            .lock()
            .expect("link attempt")
            .as_ref()
            == Some(attempt)
        {
            connection.reply(frame.clone()).await;
        }
    }
}
