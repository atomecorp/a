// What the provider-neutral generation services share (server/ai_generation/core.js, ported): the
// domain's closed list of codes, the provider registry with its capability-based `auto` routing
// (registration order is the preference), per-person jobs kept a day, and the HTTP status read as
// a code. Each domain (audio.rs, video.rs) keeps its own request, job and vocabulary. The keys are
// the platform's (R-120): a generation is atome's service, paid on the ledger (generation_ledger.rs),
// never on a person's own key.
use super::http::{Done, Failure};
use crate::settings::Settings;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

pub const JOB_TTL_MS: i64 = 24 * 3600 * 1000;

/// A generation service's platform keys: each provider's key file (`<ID>_SHARED_KEY_FILE`), read
/// when used, never returned, logged or stored. A provider without one is unavailable.
pub struct PlatformKeys(Vec<(&'static str, PathBuf)>);

impl PlatformKeys {
    /// `files`: each credential and the setting naming its key file.
    pub fn load(settings: &Settings, files: &[(&'static str, &str)]) -> Self {
        Self(
            files
                .iter()
                .filter_map(|(credential, setting)| {
                    settings
                        .get(setting)
                        .filter(|file| !file.is_empty())
                        .map(|file| (*credential, PathBuf::from(file)))
                })
                .collect(),
        )
    }

    fn read(&self, credential: &str) -> Done<Option<String>> {
        match self.0.iter().find(|(name, _)| *name == credential) {
            Some((_, file)) => Ok(Some(super::shared_grant::read_key_file(file)?)),
            None => Ok(None),
        }
    }
}

pub fn now_ms() -> i64 {
    atome_js_values::dates::now_ms()
}

/// `Math.round`: halves go up.
pub fn round(value: f64) -> f64 {
    (value + 0.5).floor()
}

/// `encodeURIComponent(String(value))`.
pub fn component(value: &JsonValue) -> String {
    percent_encoding::utf8_percent_encode(&js::string(value), crate::http::uri::URI_COMPONENT)
        .to_string()
}

/// `typeof value === 'string' ? value.trim().slice(0, max) : ''` (no `max`, no cut).
pub fn text(value: Option<&JsonValue>, max: Option<usize>) -> String {
    let Some(JsonValue::String(value)) = value else {
        return String::new();
    };
    let trimmed = js::trim(value);
    max.map_or_else(|| trimmed.to_string(), |max| js::slice(trimmed, max))
}

/// The empty string as `null`, as `text(…) || null` reads it.
pub fn or_null(value: String) -> JsonValue {
    if value.is_empty() {
        JsonValue::Null
    } else {
        json!(value)
    }
}

/// A domain's closed codes: one outside the list becomes the fallback.
pub struct Codes {
    pub list: &'static [&'static str],
    pub fallback: &'static str,
    // What the domain calls a missing capability (`codes.capability`).
    pub capability: &'static str,
}

impl Codes {
    pub fn error(&self, code: &str) -> Failure {
        Failure::from(if self.list.contains(&code) {
            code
        } else {
            self.fallback
        })
    }

    /// `codeFromHttpStatus(status, names)`: the domain names only what it calls otherwise
    /// when nothing else matches (`failed`).
    pub fn for_status(&self, status: u16, failed: &'static str) -> Failure {
        self.error(match status {
            401 | 403 => "AUTH_ERROR",
            402 => "PAYMENT_REQUIRED",
            429 => "RATE_LIMITED",
            400 | 404 | 422 => "INVALID_REQUEST",
            500.. => "PROVIDER_UNAVAILABLE",
            _ => failed,
        })
    }
}

/// A registered provider's description.
pub trait Provider {
    fn id(&self) -> &'static str;
    fn label(&self) -> &'static str;
    fn remote(&self) -> bool;
    fn credential(&self) -> Option<&'static str>;
    fn capabilities(&self) -> JsonValue;
    fn models(&self) -> Option<JsonValue>;
}

/// The provider's platform key, none when it needs none or has none.
pub fn key_for(provider: &impl Provider, keys: &PlatformKeys) -> Done<Option<String>> {
    match provider.credential() {
        Some(credential) => keys.read(credential),
        None => Ok(None),
    }
}

fn describe(provider: &impl Provider, configured: JsonValue) -> JsonValue {
    let mut out = json!({ "id": provider.id(), "label": provider.label(), "remote": provider.remote(),
        "requiresKey": provider.credential().is_some(), "configured": configured,
        "capabilities": provider.capabilities() });
    if let Some(models) = provider.models() {
        out["models"] = models;
    }
    out
}

/// Every provider, with whether its platform key is there.
pub fn list(providers: &[impl Provider], keys: &PlatformKeys) -> Done<JsonValue> {
    let mut out = Vec::new();
    for provider in providers {
        let configured = provider.credential().is_none() || key_for(provider, keys)?.is_some();
        out.push(describe(provider, json!(configured)));
    }
    Ok(json!(out))
}

/// `registry.describe(id)`.
pub fn capabilities(providers: &[impl Provider], codes: &Codes, id: &str) -> Done<JsonValue> {
    providers
        .iter()
        .find(|provider| provider.id() == id)
        .map(|provider| describe(provider, JsonValue::Null))
        .ok_or_else(|| codes.error("PROVIDER_UNAVAILABLE"))
}

fn supports(provider: &impl Provider, required: &[&str]) -> bool {
    let capabilities = provider.capabilities();
    required
        .iter()
        .all(|name| capabilities[*name] == json!(true))
}

/// The chosen provider, its key and why: the one named, or under `auto` the first with every
/// required capability, a platform key, and `accept`'s consent. A provider whose key is absent is
/// unavailable (`PROVIDER_UNAVAILABLE`).
pub fn resolve<'a, P: Provider>(
    providers: &'a [P],
    codes: &Codes,
    wanted: &str,
    required: &[&str],
    keys: &PlatformKeys,
    accept: impl Fn(&P) -> Done<Option<&'static str>>,
) -> Done<(&'a P, Option<String>, String)> {
    if !wanted.is_empty() && wanted != "auto" {
        let Some(provider) = providers.iter().find(|provider| provider.id() == wanted) else {
            return Err(codes.error("PROVIDER_UNAVAILABLE"));
        };
        if !supports(provider, required) {
            return Err(codes.error(codes.capability));
        }
        let key = key_for(provider, keys)?;
        if provider.credential().is_some() && key.is_none() {
            return Err(codes.error("PROVIDER_UNAVAILABLE"));
        }
        if let Some(verdict) = accept(provider)? {
            return Err(codes.error(verdict));
        }
        return Ok((provider, key, "explicit".into()));
    }
    let mut capable = false;
    let mut rejection = None;
    for provider in providers {
        if !supports(provider, required) {
            continue;
        }
        capable = true;
        let key = key_for(provider, keys)?;
        if provider.credential().is_some() && key.is_none() {
            continue;
        }
        if let Some(verdict) = accept(provider)? {
            rejection = rejection.or(Some(verdict));
            continue;
        }
        return Ok((
            provider,
            key,
            format!("auto:first_capable({})", required.join("+")),
        ));
    }
    Err(codes.error(rejection.unwrap_or(if capable {
        "PROVIDER_UNAVAILABLE"
    } else {
        codes.capability
    })))
}

/// What a job store needs of a job.
pub trait Job: Clone {
    fn principal(&self) -> &str;
    fn created_at(&self) -> i64;
}

/// In-memory jobs, each its person's own, gone after a day.
pub struct Jobs<J> {
    entries: Mutex<HashMap<String, J>>,
}

impl<J: Job> Default for Jobs<J> {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }
}

impl<J: Job> Jobs<J> {
    fn live(&self) -> std::sync::MutexGuard<'_, HashMap<String, J>> {
        let mut entries = self.entries.lock().expect("jobs");
        let limit = now_ms() - JOB_TTL_MS;
        entries.retain(|_, job| job.created_at() >= limit);
        entries
    }

    pub fn put(&self, id: &str, job: J) {
        self.live().insert(id.to_string(), job);
    }

    /// `jobs.owned(principal, jobId)`: a copy, written back by `put`.
    pub fn owned(&self, codes: &Codes, principal: &str, id: Option<&JsonValue>) -> Done<J> {
        let id = id
            .filter(|id| js::truthy(Some(id)))
            .map(js::string)
            .unwrap_or_default();
        self.live()
            .get(&id)
            .filter(|job| job.principal() == principal)
            .cloned()
            .ok_or_else(|| codes.error("JOB_NOT_FOUND"))
    }
}
