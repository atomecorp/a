// Bounded, revocable test seats on the platform OpenAI key (server/providerSharedGrant.js, ported:
// `claim` and `recordTokens`; the operator's grant, revoke and listing stay the operator script's).
// The key file never leaves the server: it is not returned, logged, synchronized or stored in a
// vault. A person's own key always takes precedence and never takes a seat.
use crate::settings::Settings;
use crate::vault_router::central::Central;
use serde_json::{Value as JsonValue, json};
use std::path::PathBuf;
use std::sync::Mutex;

// Reading the key state or the model catalog is not a metered provider call; a voice session is
// metered once at `realtime-connect`, not per relayed event. These still need an active seat.
const UNMETERED: [&str; 4] = [
    "credential.status",
    "models",
    "realtime-send",
    "realtime-close",
];

struct Limits {
    seats: i64,
    operations: i64,
    tokens: i64,
    realtime: i64,
}

pub struct SharedGrant {
    central: Central,
    key_file: Option<PathBuf>,
    limits: Result<Limits, String>,
    key: Mutex<Option<String>>,
}

fn limit(settings: &Settings, name: &str, default: i64) -> Result<i64, String> {
    match settings.get(name).filter(|raw| !raw.is_empty()) {
        None => Ok(default),
        Some(raw) => match raw.trim().parse::<f64>() {
            Ok(value) if value.fract() == 0.0 && value >= 0.0 && !raw.trim().is_empty() => {
                Ok(value as i64)
            }
            _ => Err(format!("provider_shared_limit_invalid:{name}")),
        },
    }
}

fn number(row: &Option<JsonValue>, field: &str) -> i64 {
    row.as_ref()
        .and_then(|row| row[field].as_f64())
        .unwrap_or(0.0) as i64
}

impl SharedGrant {
    pub fn load(settings: &Settings, central: Central) -> Self {
        let limits = (|| {
            Ok(Limits {
                seats: limit(settings, "OPENAI_SHARED_KEY_SEATS", 10)?,
                operations: limit(settings, "OPENAI_SHARED_DAILY_OPS", 400)?,
                tokens: limit(settings, "OPENAI_SHARED_DAILY_TOKENS", 300_000)?,
                realtime: limit(settings, "OPENAI_SHARED_DAILY_REALTIME", 20)?,
            })
        })();
        Self {
            central,
            key_file: settings
                .get("OPENAI_SHARED_KEY_FILE")
                .filter(|file| !file.is_empty())
                .map(PathBuf::from),
            limits,
            key: Mutex::new(None),
        }
    }

    fn read_key(&self) -> Result<Option<String>, String> {
        let Some(file) = &self.key_file else {
            return Ok(None);
        };
        if let Some(key) = self.key.lock().expect("shared key").clone() {
            return Ok(Some(key));
        }
        let value = std::fs::read_to_string(file)
            .map_err(|_| "provider_shared_key_unavailable".to_string())?
            .trim()
            .to_string();
        if value.is_empty()
            || value.encode_utf16().count() > 1024
            || value.chars().any(char::is_whitespace)
        {
            return Err("provider_shared_key_unavailable".into());
        }
        *self.key.lock().expect("shared key") = Some(value.clone());
        Ok(Some(value))
    }

    fn day() -> String {
        crate::vault_router::js::iso(chrono::Utc::now().timestamp_millis())[..10].to_string()
    }

    async fn seat(&self, principal: &str) -> Result<Option<JsonValue>, String> {
        self.central
            .get(
                "SELECT * FROM provider_shared_seats WHERE principal_id = ?",
                vec![json!(principal)],
            )
            .await
    }

    async fn add_usage(
        &self,
        principal: &str,
        operations: i64,
        tokens: i64,
        realtime: i64,
    ) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO provider_shared_usage (principal_id, day, operations, tokens, realtime) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(principal_id, day) DO UPDATE SET operations = operations + excluded.operations,
                     tokens = tokens + excluded.tokens, realtime = realtime + excluded.realtime",
                vec![json!(principal), json!(Self::day()), json!(operations), json!(tokens), json!(realtime)],
            )
            .await
    }

    /// The platform key for an entitled person, or none when the feature is off, the person
    /// blocked or no seat free. A used-up daily seat is eVe's shared credit.
    pub async fn claim(&self, principal: &str, action: &str) -> Result<Option<String>, String> {
        let limits = self.limits.as_ref().map_err(Clone::clone)?;
        if principal.is_empty() || self.read_key()?.is_none() {
            return Ok(None);
        }
        let mut current = self.seat(principal).await?;
        if current.is_none() {
            // One statement: the seat count and the auto-enrollment switch are checked with the insert.
            self.central
                .run(
                    "INSERT INTO provider_shared_seats (principal_id, state, granted_by, claimed_ms)
                     SELECT ?, 'active', 'auto', ?
                     WHERE (SELECT COUNT(*) FROM provider_shared_seats WHERE state = 'active') < ?
                       AND NOT EXISTS (SELECT 1 FROM provider_shared_settings WHERE name = 'auto_enrollment' AND value = 'closed')
                     ON CONFLICT(principal_id) DO NOTHING",
                    vec![json!(principal), json!(chrono::Utc::now().timestamp_millis()), json!(limits.seats)],
                )
                .await?;
            current = self.seat(principal).await?;
        }
        if current.as_ref().map(|seat| &seat["state"]) != Some(&json!("active")) {
            return Ok(None);
        }
        if UNMETERED.contains(&action) {
            return self.read_key();
        }
        let usage = self
            .central
            .get(
                "SELECT * FROM provider_shared_usage WHERE principal_id = ? AND day = ?",
                vec![json!(principal), json!(Self::day())],
            )
            .await?;
        let realtime = action == "realtime-connect";
        if number(&usage, "operations") >= limits.operations
            || number(&usage, "tokens") >= limits.tokens
            || (realtime && number(&usage, "realtime") >= limits.realtime)
        {
            return Err("provider_shared_quota_exceeded".into());
        }
        self.add_usage(principal, 1, 0, i64::from(realtime)).await?;
        self.read_key()
    }

    /// The tokens a metered answer used.
    pub async fn record_tokens(&self, principal: &str, usage: &JsonValue) -> Result<(), String> {
        let value = |name: &str| usage.get(name).and_then(JsonValue::as_f64).unwrap_or(0.0);
        let total = value("total_tokens");
        let tokens = if total != 0.0 && !total.is_nan() {
            total
        } else {
            value("input_tokens") + value("output_tokens")
        };
        if tokens > 0.0 {
            self.add_usage(principal, 0, tokens as i64, 0).await?;
        }
        Ok(())
    }
}
