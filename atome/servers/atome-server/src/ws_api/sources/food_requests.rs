// What `food-facts` keeps and how it reaches Open Food Facts (server/ws_open_food_facts.js,
// ported): its requests with the operator's User-Agent, the products and searches it keeps, the
// rate windows that keep every user together below OFF's caps, and the additives taxonomy.
use super::common::{response_json, warn};
use super::food_health::{Risks, additive_risks};
use crate::providers::http;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

const ADDITIVES_TAXONOMY: &str = "https://static.openfoodfacts.org/data/taxonomies/additives.json";
const WINDOW_MS: f64 = 60_000.0;
const TAXONOMY_TTL_MS: f64 = 24.0 * 60.0 * 60.0 * 1000.0;
const TAXONOMY_RETRY_MS: f64 = 5.0 * 60.0 * 1000.0;
const MAX_CACHE_ENTRIES: usize = 2000;

/// A failure: its code when it is one of ERROR_CODES's, its cause and its exception's name.
pub(super) struct Failure {
    pub code: Option<&'static str>,
    pub cause: String,
    pub name: &'static str,
}

pub(super) fn failure(code: &'static str, cause: &str) -> Failure {
    Failure {
        code: Some(code),
        cause: cause.into(),
        name: "Error",
    }
}

pub(super) fn thrown(name: &'static str, cause: &str) -> Failure {
    Failure {
        code: None,
        cause: cause.into(),
        name,
    }
}

/// `createTtlCache(ttl)`: an answer kept `ttl`, every entry dropped once MAX_CACHE_ENTRIES are kept.
pub(super) struct Kept {
    ttl: f64,
    entries: Mutex<HashMap<String, (JsonValue, f64)>>,
}

impl Kept {
    fn new(ttl: f64) -> Self {
        Self {
            ttl,
            entries: Mutex::default(),
        }
    }

    pub(super) fn get(&self, key: &str) -> Option<JsonValue> {
        let now = crate::auth::now_ms();
        let entries = self.entries.lock().expect("food kept");
        entries
            .get(key)
            .filter(|(_, at)| now - at < self.ttl)
            .map(|(value, _)| value.clone())
    }

    pub(super) fn set(&self, key: String, value: JsonValue) {
        let mut entries = self.entries.lock().expect("food kept");
        if entries.len() >= MAX_CACHE_ENTRIES {
            entries.clear();
        }
        entries.insert(key, (value, crate::auth::now_ms()));
    }
}

pub(super) static PRODUCTS: LazyLock<Kept> =
    LazyLock::new(|| Kept::new(6.0 * 60.0 * 60.0 * 1000.0));
pub(super) static SEARCHES: LazyLock<Kept> = LazyLock::new(|| Kept::new(30.0 * 60.0 * 1000.0));

/// One kind's windows (`createRateWindows`): every address together, and each address.
#[derive(Default)]
pub(super) struct Windows {
    global: Vec<f64>,
    by_address: HashMap<String, Vec<f64>>,
}

pub(super) static READS: LazyLock<Mutex<Windows>> = LazyLock::new(Mutex::default);
pub(super) static SEARCH_WINDOWS: LazyLock<Mutex<Windows>> = LazyLock::new(Mutex::default);

// A read or a search counted, refused past either window's limit.
pub(super) fn consume(
    windows: &Mutex<Windows>,
    (own_limit, global_limit): (usize, usize),
    address: &str,
) -> Result<(), Failure> {
    let now = crate::auth::now_ms();
    let key = if address.is_empty() {
        "unknown"
    } else {
        address
    };
    let mut windows = windows.lock().expect("food windows");
    windows.global.retain(|at| now - at < WINDOW_MS);
    let mut own: Vec<f64> = windows
        .by_address
        .get(key)
        .into_iter()
        .flatten()
        .copied()
        .filter(|at| now - at < WINDOW_MS)
        .collect();
    if windows.global.len() >= global_limit || own.len() >= own_limit {
        return Err(failure("RATE_LIMITED", "RATE_LIMITED"));
    }
    windows.global.push(now);
    own.push(now);
    windows.by_address.insert(key.to_string(), own);
    if windows.by_address.len() > 10_000 {
        windows
            .by_address
            .retain(|_, times| times.iter().any(|at| now - at < WINDOW_MS));
    }
    Ok(())
}

/// The additives taxonomy: its risks, when it was read, and when a failed read may be tried again.
#[derive(Default)]
struct Taxonomy {
    risks: Option<Arc<Risks>>,
    at: f64,
    retry_at: f64,
}

// Held across its read: a second caller waits for the first one's answer.
static TAXONOMY: LazyLock<tokio::sync::Mutex<Taxonomy>> =
    LazyLock::new(tokio::sync::Mutex::default);

pub(super) async fn request(url: &str, agent: &str) -> Result<reqwest::Response, Failure> {
    let response = http::following()
        .get(url)
        .timeout(Duration::from_secs(8))
        .header("user-agent", agent)
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|_| thrown("TypeError", "fetch failed"))?;
    if response.status().as_u16() == 429 {
        return Err(failure("RATE_LIMITED", "upstream_429"));
    }
    Ok(response)
}

pub(super) async fn body_json(response: reqwest::Response) -> Result<JsonValue, Failure> {
    let bytes = response
        .bytes()
        .await
        .map_err(|_| thrown("TypeError", "terminated"))?;
    response_json(&bytes).map_err(|cause| thrown("SyntaxError", &cause))
}

pub(super) async fn json(url: &str, agent: &str) -> Result<JsonValue, Failure> {
    let response = request(url, agent).await?;
    if !response.status().is_success() {
        return Err(failure(
            "PROVIDER_UNAVAILABLE",
            &format!("upstream_status_{}", response.status().as_u16()),
        ));
    }
    body_json(response).await
}

async fn taxonomy_risks(agent: &str) -> Result<Arc<Risks>, Failure> {
    let mut taxonomy = TAXONOMY.lock().await;
    if let Some(risks) = &taxonomy.risks
        && crate::auth::now_ms() - taxonomy.at < TAXONOMY_TTL_MS
    {
        return Ok(risks.clone());
    }
    if crate::auth::now_ms() < taxonomy.retry_at {
        return Err(failure(
            "PROVIDER_UNAVAILABLE",
            "additives_taxonomy_retry_pending",
        ));
    }
    match json(ADDITIVES_TAXONOMY, agent).await {
        Ok(data) => {
            let risks = Arc::new(additive_risks(&data));
            (taxonomy.risks, taxonomy.at) = (Some(risks.clone()), crate::auth::now_ms());
            Ok(risks)
        }
        Err(error) => {
            taxonomy.retry_at = crate::auth::now_ms() + TAXONOMY_RETRY_MS;
            Err(error)
        }
    }
}

// The taxonomy failing must not fail every product read for its retry delay: the product is read,
// its additives' risks unknown (`additives_evaluated: false`), the cause logged, and it is not
// kept, so the next read judges it once the taxonomy answers.
pub(super) async fn risks_or_unknown(agent: &str, id: &JsonValue) -> Option<Arc<Risks>> {
    match taxonomy_risks(agent).await {
        Ok(risks) => Some(risks),
        Err(error) => {
            warn(
                "open_food_facts",
                id,
                "ADDITIVES_TAXONOMY_UNAVAILABLE",
                json!({ "cause": js::slice(&error.cause, 300) }),
            );
            None
        }
    }
}
