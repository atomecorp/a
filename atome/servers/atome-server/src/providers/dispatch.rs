// One `ai-provider` frame (`handleWsAiProviderOperation`, ported): the account the message's token
// names, the operation admitted within the connection's limits and run until it answers, is
// cancelled or reaches its deadline (waiting for an official login page, or a provider processing a
// long video, outlasts a model call), then the canonical reply envelope.
use super::credentials::Credentials;
use super::http::{Done, Failure};
use super::{Attached, Link, Providers, failed, models, music, openai, realtime, speech};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

fn deadline(action: &str) -> Duration {
    Duration::from_millis(match action {
        "models" => 15_000,
        "music.await_connection" | "strava.await_connection" | "social.connect.await" => {
            11 * 60_000
        }
        "social.publish" => 20 * 60_000,
        "social.status" => 5 * 60_000,
        _ => 180_000,
    })
}

// `wsResponse('ai-provider', message, ok, fields)`.
fn envelope(message: &JsonValue, ok: bool, fields: JsonValue) -> JsonValue {
    let mut reply = JsonMap::new();
    reply.insert("type".into(), json!("ai-provider-response"));
    reply.insert(
        "requestId".into(),
        js::first(message, &["requestId", "request_id"])
            .cloned()
            .unwrap_or(JsonValue::Null),
    );
    reply.insert("success".into(), json!(ok));
    reply.insert("ok".into(), json!(ok));
    if let JsonValue::Object(fields) = fields {
        reply.extend(fields);
    }
    JsonValue::Object(reply)
}

/// The reply to `message`, from the account the connection read in its token: `Err` when the token
/// cannot be read, none when there is no provisioned account.
pub async fn answer<L: Link>(
    providers: &Providers,
    attached: &Attached,
    link: &L,
    message: &JsonValue,
    principal: Result<Option<String>, ()>,
) -> JsonValue {
    let principal = match principal {
        // `jwt.verify` threw: its text is no known code.
        Err(()) => return envelope(message, false, failed(&"jwt".into(), false, false)),
        Ok(None) => {
            return envelope(
                message,
                false,
                failed(&"not_authenticated".into(), false, false),
            );
        }
        Ok(Some(principal)) => principal,
    };
    attached.abort_others(&principal);
    let action = message
        .get("action")
        .filter(|action| js::truthy(Some(action)))
        .map(js::string)
        .unwrap_or_default();
    if action == "cancel" {
        let id = js::id(message.get("operation_id"));
        let cancelled = attached.cancel(&principal, &id);
        return envelope(message, true, json!({ "cancelled": cancelled }));
    }
    let request_id = js::first(message, &["requestId", "request_id"])
        .map(js::string)
        .unwrap_or_default();
    let provider = js::first(message, &["provider"])
        .or_else(|| {
            message
                .get("payload")
                .and_then(|payload| js::first(payload, &["provider"]))
        })
        .map(js::string)
        .unwrap_or_else(|| "openai".into());
    let mut cancelled = match attached.admit(&principal, &action, &request_id, provider.clone()) {
        Ok(cancelled) => cancelled,
        Err(code) => return envelope(message, false, failed(&code.into(), false, false)),
    };
    let shared = AtomicBool::new(false);
    let work = run(
        providers,
        attached,
        link,
        message,
        &principal,
        &action,
        &request_id,
        &provider,
        &shared,
    );
    let outcome = tokio::select! {
        outcome = work => outcome.map_err(|failure| (failure, false)),
        _ = cancelled.wait_for(|cancelled| *cancelled) => Err((Failure::default(), true)),
        () = tokio::time::sleep(deadline(&action)) => Err((Failure::default(), true)),
    };
    attached.finish(&request_id);
    match outcome {
        Ok(fields) => envelope(message, true, fields),
        Err((failure, cancelled)) => {
            let fields = failed(&failure, cancelled, shared.load(Ordering::Relaxed));
            // A cause that does not travel as itself is kept in the server's journal, never lost.
            if !cancelled && fields["error"] != failure.message.as_str() {
                eprintln!("[ai-provider] {action} failed: {}", failure.message);
            }
            envelope(message, false, fields)
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run<L: Link>(
    providers: &Providers,
    attached: &Attached,
    link: &L,
    message: &JsonValue,
    principal: &str,
    action: &str,
    request_id: &str,
    provider: &str,
    shared: &AtomicBool,
) -> Done<JsonValue> {
    let vault = Credentials::open(&providers.router, &providers.vault_root, principal).await?;
    let payload = message
        .get("payload")
        .filter(|payload| js::truthy(Some(payload)))
        .cloned()
        .unwrap_or_else(|| json!({}));
    if action.starts_with("secret.") {
        let data = match action {
            "secret.list" => json!({ "items": vault.secret_list().await? }),
            "secret.read" => vault.secret_read(payload.get("entry_id")).await?,
            "secret.store" => {
                vault
                    .secret_store(
                        payload.get("entry_id"),
                        payload.get("value"),
                        payload.get("metadata"),
                    )
                    .await?
            }
            "secret.remove" => vault.secret_remove(payload.get("entry_id")).await?,
            _ => return Err("provider_operation_not_allowed".into()),
        };
        return Ok(json!({ "data": data }));
    }
    if provider != "openai" && action.starts_with("credential.") {
        return other_credential(
            providers, link, message, principal, action, provider, &vault,
        )
        .await;
    }
    if action == "models" {
        let own = if provider == "openai" {
            vault.read("openai").await?.filter(|key| !key.is_empty())
        } else {
            payload
                .get("key")
                .filter(|key| js::truthy(Some(key)))
                .map(js::string)
        };
        let on_shared = provider == "openai" && own.is_none();
        shared.store(on_shared, Ordering::Relaxed);
        let key = match own {
            Some(key) => Some(key),
            None if on_shared => providers.shared.claim(principal, action).await?,
            None => None,
        };
        let Some(key) = key else {
            return Err("no_ai_key_configured".into());
        };
        let data = models::list(provider, &key).await?;
        link.check(principal).await?;
        return Ok(json!({ "data": data }));
    }
    if action.starts_with("music.") {
        let data = providers
            .music
            .answer(&providers.oauth, link, &vault, principal, action, &payload)
            .await?;
        link.check(principal).await?;
        return Ok(json!({ "data": data }));
    }
    if action.starts_with("strava.") {
        let data = providers
            .strava
            .answer(&providers.oauth, link, &vault, principal, action, &payload)
            .await?;
        link.check(principal).await?;
        return Ok(json!({ "data": data }));
    }
    if action.starts_with("social.") {
        let social = &providers.social;
        let data = social
            .answer(
                &providers.oauth,
                &vault,
                link.files(),
                principal,
                action,
                &payload,
            )
            .await?;
        link.check(principal).await?;
        return Ok(json!({ "data": data }));
    }
    if action.starts_with("video.") {
        let data = providers
            .video
            .action(action, &payload, principal, &vault)
            .await?;
        return Ok(json!({ "data": data }));
    }
    if action.starts_with("audio.") {
        let data = providers
            .audio
            .action(action, &payload, principal, &vault)
            .await?;
        return Ok(json!({ "data": data }));
    }
    let nothing = json!({});
    let close_all = || {
        realtime::control(
            &attached.realtime,
            &providers.everyone,
            link.relay(),
            realtime::Call {
                action: "realtime-close-all",
                payload: &nothing,
                principal,
                key: "",
            },
        )
    };
    if action == "credential.store" {
        let candidate = js::id(message.get("key"));
        let validation = super::http::send(
            super::http::client()
                .get(format!("{}/models", openai::ROOT))
                .header("Authorization", format!("Bearer {candidate}")),
        )
        .await?;
        if !validation.status().is_success() {
            return Err(super::http::failure(validation).await);
        }
        link.check(principal).await?;
        let stored = vault.store("openai", &candidate).await?;
        close_all().await?;
        attached.abort_openai(principal, request_id);
        return Ok(stored);
    }
    if action == "credential.remove" {
        close_all().await?;
        attached.abort_openai(principal, request_id);
        return Ok(vault.remove("openai").await?);
    }
    let own = vault.read("openai").await?.filter(|key| !key.is_empty());
    shared.store(own.is_none(), Ordering::Relaxed);
    let key = match &own {
        Some(key) => Some(key.clone()),
        None => providers.shared.claim(principal, action).await?,
    };
    if action == "credential.status" {
        return Ok(json!({ "configured": key.is_some() }));
    }
    // Closing a voice session needs no key: a revoked seat must still end it.
    if key.is_none() && action != "realtime-close" {
        return Err("no_ai_key_configured".into());
    }
    let key = key.unwrap_or_default();
    if action.starts_with("realtime-") {
        let call = realtime::Call {
            action,
            payload: &payload,
            principal,
            key: &key,
        };
        let data =
            realtime::control(&attached.realtime, &providers.everyone, link.relay(), call).await?;
        return Ok(json!({ "data": data }));
    }
    if action == "speech" {
        let data =
            speech::synthesize(message.get("payload").unwrap_or(&JsonValue::Null), &key).await?;
        link.check(principal).await?;
        return Ok(json!({ "data": data }));
    }
    let (data, usage) = openai::call(
        link,
        principal,
        action,
        message,
        &key,
        request_id,
        &attached.hosted,
    )
    .await?;
    // Usage on the platform key is metered per seat; an own key is not.
    if own.is_none()
        && let Some(usage) = usage
    {
        providers.shared.record_tokens(principal, &usage).await?;
    }
    Ok(json!({ "data": data }))
}

/// A key of another provider than OpenAI (audio, video, music): its status, removal or check
/// with that provider before it is sealed.
async fn other_credential<L: Link>(
    providers: &Providers,
    link: &L,
    message: &JsonValue,
    principal: &str,
    action: &str,
    provider: &str,
    vault: &Credentials,
) -> Done<JsonValue> {
    let audio = providers.audio.holds_credential(provider);
    let video = providers.video.holds_credential(provider);
    let sound = music::Music::holds_credential(provider);
    if !audio && !video && !sound {
        return Err("provider_not_supported".into());
    }
    match action {
        "credential.status" => {
            let configured = vault
                .read(provider)
                .await?
                .is_some_and(|key| !key.is_empty());
            Ok(json!({ "configured": configured }))
        }
        "credential.remove" => {
            providers
                .music
                .removed(&providers.oauth, vault, principal, provider)
                .await?;
            Ok(vault.remove(provider).await?)
        }
        "credential.store" => {
            let candidate = js::id(message.get("key"));
            if candidate.is_empty()
                || candidate.encode_utf16().count() > 1024
                || candidate.chars().any(char::is_whitespace)
            {
                return Err("provider_key_invalid".into());
            }
            if audio {
                providers.audio.validate_key(provider, &candidate).await?;
            } else if video {
                providers.video.validate_key(provider, &candidate).await?;
            } else {
                music::Music::validate_key(provider, &candidate).await?;
            }
            link.check(principal).await?;
            Ok(vault.store(provider, &candidate).await?)
        }
        _ => Err("provider_operation_not_allowed".into()),
    }
}
