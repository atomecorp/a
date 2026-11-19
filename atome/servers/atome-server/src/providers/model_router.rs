// The model of a `chat` answer (R-120): Not Diamond's `modelSelect` chooses among the platform's
// text models, weighed by the person's « Économie ↔ Qualité » setting. Only a model whose platform
// key is present and whose dated price is known (billing_contract.js) is offered; a lone candidate
// is taken as it is, with no router call. The router's answer is checked against the candidates;
// an unreachable or unconfigured router is an explicit error, never a silent choice.
use super::http::{self, Done};
use crate::settings::Settings;
use serde_json::{Value as JsonValue, json};
use std::path::PathBuf;
use std::time::Duration;

const ROUTER_ROOT: &str = "https://api.notdiamond.ai";
// Measured 1.2–2.9 s on 18 Nov. 2026.
const ROUTER_TIMEOUT: Duration = Duration::from_secs(8);

// Cheapest first: the platform's text models and the setting naming each one's key file. OpenAI's
// key is the shared grant's (shared_grant.rs), claimed with the seat.
const MODELS: [(&str, &str, &str); 3] = [
    ("deepseek", "deepseek-v4-flash", "DEEPSEEK_SHARED_KEY_FILE"),
    ("anthropic", "claude-haiku-4-5", "ANTHROPIC_SHARED_KEY_FILE"),
    ("openai", "gpt-5.6-luna", "OPENAI_SHARED_KEY_FILE"),
];

/// The model chosen, its platform key, and whether the router was asked (and so is paid).
pub struct Choice {
    pub provider: &'static str,
    pub model: &'static str,
    pub key: String,
    pub routed: bool,
}

pub struct ModelRouter {
    root: String,
    key_file: Option<PathBuf>,
    key_files: Vec<(&'static str, PathBuf)>,
    roots: Vec<(&'static str, String)>,
}

/// An address setting: HTTPS, or loopback for the probes' stand-ins; another one is ignored.
fn address(settings: &Settings, name: &str, default: &str) -> String {
    let Some(root) = settings.get(name) else {
        return default.to_string();
    };
    let root = root.trim().trim_end_matches('/').to_string();
    let local = ["http://127.0.0.1:", "http://localhost:", "http://[::1]:"]
        .iter()
        .any(|prefix| root.starts_with(prefix));
    if root.starts_with("https://") || local {
        root
    } else {
        eprintln!("[ai-provider] {name} ignored: neither HTTPS nor loopback");
        default.to_string()
    }
}

fn file(settings: &Settings, name: &str) -> Option<PathBuf> {
    settings.get(name).map(PathBuf::from)
}

impl ModelRouter {
    pub fn load(settings: &Settings) -> Self {
        let key_files = MODELS
            .iter()
            .filter(|(provider, ..)| *provider != "openai")
            .filter_map(|(provider, _, setting)| file(settings, setting).map(|f| (*provider, f)))
            .collect();
        Self {
            root: address(settings, "NOT_DIAMOND_API_ROOT", ROUTER_ROOT),
            key_file: file(settings, "NOT_DIAMOND_KEY_FILE"),
            key_files,
            roots: vec![
                (
                    "anthropic",
                    address(settings, "ANTHROPIC_API_ROOT", "https://api.anthropic.com"),
                ),
                (
                    "deepseek",
                    address(settings, "DEEPSEEK_API_ROOT", "https://api.deepseek.com"),
                ),
            ],
        }
    }

    /// The address of `provider`'s API (OpenAI's is openai.rs's own).
    pub fn root(&self, provider: &str) -> String {
        if provider == "openai" {
            return super::openai::root().to_string();
        }
        self.roots
            .iter()
            .find(|(name, _)| *name == provider)
            .map(|(_, root)| root.clone())
            .unwrap_or_default()
    }

    fn candidates(&self, openai_key: &str) -> Result<Vec<Choice>, String> {
        let mut found = Vec::new();
        for (provider, model, _) in MODELS {
            let priced = json!({ "model": model });
            if crate::billing::pricing::ai_cost_micro_cents("chat", &priced).is_err() {
                continue;
            }
            let key = if provider == "openai" {
                Some(openai_key.to_string())
            } else {
                match self.key_files.iter().find(|(name, _)| *name == provider) {
                    Some((_, path)) => Some(super::shared_grant::read_key_file(path)?),
                    None => None,
                }
            };
            if let Some(key) = key {
                let routed = false;
                found.push(Choice {
                    provider,
                    model,
                    key,
                    routed,
                });
            }
        }
        Ok(found)
    }

    /// The model that answers `messages` (system first, then the turns), `tradeoff` the person's
    /// setting from 0 (economy) to 10 (quality).
    pub async fn pick(
        &self,
        openai_key: &str,
        messages: &[JsonValue],
        tradeoff: u8,
    ) -> Done<Choice> {
        let mut candidates = self.candidates(openai_key)?;
        if candidates.len() < 2 {
            return candidates
                .pop()
                .ok_or_else(|| "no_ai_key_configured".into());
        }
        let Some(key_file) = &self.key_file else {
            return Err("provider_router_unconfigured".into());
        };
        let key = super::shared_grant::read_key_file(key_file)?;
        let providers: Vec<JsonValue> = candidates
            .iter()
            .map(|choice| json!({ "provider": choice.provider, "model": choice.model }))
            .collect();
        // Not Diamond's scale runs the other way: 0 favours quality, 10 cost.
        let body = json!({
            "messages": messages,
            "llm_providers": providers,
            "cost_quality_tradeoff": 10 - tradeoff.min(10),
        });
        let response = http::send(
            http::client()
                .post(format!("{}/v2/modelRouter/modelSelect", self.root))
                .bearer_auth(key)
                .timeout(ROUTER_TIMEOUT)
                .json(&body),
        )
        .await
        .map_err(|_| http::Failure::from("provider_router_unavailable"))?;
        if !response.status().is_success() {
            eprintln!(
                "[ai-provider] router answered HTTP {}",
                response.status().as_u16()
            );
            return Err("provider_router_unavailable".into());
        }
        let answer: JsonValue = serde_json::from_slice(&http::bytes(response, 1_000_000).await?)
            .map_err(|_| http::Failure::from("provider_router_invalid_choice"))?;
        let chosen = &answer["providers"][0];
        let index = candidates
            .iter()
            .position(|choice| {
                chosen["provider"] == choice.provider && chosen["model"] == choice.model
            })
            .ok_or_else(|| http::Failure::from("provider_router_invalid_choice"))?;
        let mut choice = candidates.swap_remove(index);
        choice.routed = true;
        Ok(choice)
    }
}
