// Bounded, revocable test seats on the platform OpenAI key (server/providerSharedGrant.js, ported:
// `claim` and `recordTokens`, and the operator's listing, grant, revoke, unblock and auto-enrollment
// switch, which `atome_admin ai-seats` drives, src/admin/ai_seats.rs).
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

/// The seats' count and each seat's daily allowance (`OPENAI_SHARED_*`).
pub struct Limits {
    pub seats: i64,
    pub operations: i64,
    pub tokens: i64,
    pub realtime: i64,
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

/// A platform key file's one line: refused when missing, blank, oversized or not a single token.
pub fn read_key_file(file: &std::path::Path) -> Result<String, String> {
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
    Ok(value)
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
        let value = read_key_file(file)?;
        *self.key.lock().expect("shared key") = Some(value.clone());
        Ok(Some(value))
    }

    fn day() -> String {
        crate::vault_router::js::iso(atome_js_values::dates::now_ms())[..10].to_string()
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

    /// The limits read from the settings, or the setting that does not read as a whole number.
    pub fn limits(&self) -> Result<&Limits, String> {
        self.limits.as_ref().map_err(Clone::clone)
    }

    /// `activeCount()`: the seats in use.
    pub async fn active_count(&self) -> Result<i64, String> {
        let row = self
            .central
            .get(
                "SELECT COUNT(*) AS count FROM provider_shared_seats WHERE state = 'active'",
                Vec::new(),
            )
            .await?;
        Ok(number(&row, "count"))
    }

    /// `autoEnrollment()`: `open` unless the operator closed the automatic claims.
    pub async fn auto_enrollment(&self) -> Result<String, String> {
        let row = self
            .central
            .get(
                "SELECT value FROM provider_shared_settings WHERE name = 'auto_enrollment'",
                Vec::new(),
            )
            .await?;
        Ok(row
            .as_ref()
            .and_then(|row| row["value"].as_str())
            .filter(|value| !value.is_empty())
            .unwrap_or("open")
            .to_string())
    }

    /// `setAutoEnrollment(open)`.
    pub async fn set_auto_enrollment(&self, open: bool) -> Result<(), String> {
        self.central
            .run(
                "INSERT INTO provider_shared_settings (name, value) VALUES ('auto_enrollment', ?)
                 ON CONFLICT(name) DO UPDATE SET value = excluded.value",
                vec![json!(if open { "open" } else { "closed" })],
            )
            .await
    }

    /// `list()`: every seat with its whole consumption and today's tokens, first claimed first.
    pub async fn list(&self) -> Result<Vec<JsonValue>, String> {
        self.central
            .all(
                "SELECT s.principal_id, s.state, s.granted_by, s.claimed_ms, s.revoked_ms,
                    COALESCE(SUM(u.operations), 0) AS operations, COALESCE(SUM(u.tokens), 0) AS tokens,
                    COALESCE(SUM(u.realtime), 0) AS realtime,
                    COALESCE(SUM(CASE WHEN u.day = ? THEN u.tokens END), 0) AS tokens_today
                 FROM provider_shared_seats s LEFT JOIN provider_shared_usage u ON u.principal_id = s.principal_id
                 GROUP BY s.principal_id ORDER BY s.claimed_ms"
                    .to_string(),
                vec![json!(Self::day())],
            )
            .await
    }

    /// `grant(principal)`: the operator's seat, refused when every seat is taken.
    pub async fn grant(&self, principal: &str) -> Result<Option<JsonValue>, String> {
        let current = self.seat(principal).await?;
        if current.as_ref().map(|seat| &seat["state"]) == Some(&json!("active")) {
            return Ok(current);
        }
        if self.active_count().await? >= self.limits()?.seats {
            return Err("provider_shared_seats_full".into());
        }
        self.central
            .run(
                "INSERT INTO provider_shared_seats (principal_id, state, granted_by, claimed_ms, revoked_ms)
                 VALUES (?, 'active', 'admin', ?, NULL) ON CONFLICT(principal_id) DO UPDATE SET
                 state = 'active', granted_by = 'admin', claimed_ms = excluded.claimed_ms, revoked_ms = NULL",
                vec![json!(principal), json!(atome_js_values::dates::now_ms())],
            )
            .await?;
        self.seat(principal).await
    }

    /// `revoke(principal)`: the seat taken back and the person blocked from claiming another.
    pub async fn revoke(&self, principal: &str) -> Result<Option<JsonValue>, String> {
        let now = atome_js_values::dates::now_ms();
        self.central
            .run(
                "INSERT INTO provider_shared_seats (principal_id, state, granted_by, claimed_ms, revoked_ms)
                 VALUES (?, 'revoked', 'admin', ?, ?) ON CONFLICT(principal_id) DO UPDATE SET
                 state = 'revoked', revoked_ms = excluded.revoked_ms",
                vec![json!(principal), json!(now), json!(now)],
            )
            .await?;
        self.seat(principal).await
    }

    /// `unblock(principal)`: the block removed, so the person may claim a free seat again.
    pub async fn unblock(&self, principal: &str) -> Result<(), String> {
        self.central
            .run(
                "DELETE FROM provider_shared_seats WHERE principal_id = ? AND state = 'revoked'",
                vec![json!(principal)],
            )
            .await
    }

    /// The platform key for an entitled person, or none when the feature is off, the person
    /// blocked or no seat free. A used-up daily seat is eVe's shared credit. A metered call also
    /// reserves its money first (billing/guard.rs, R-193): the person's own balance, or for an
    /// allowed tester atome's test budget; refused otherwise, before any provider is called. The
    /// hold's reference comes back with the key, to settle the real cost once the answer is in.
    pub async fn claim(
        &self,
        principal: &str,
        action: &str,
    ) -> Result<Option<(String, Option<String>)>, String> {
        let limits = self.limits()?;
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
                    vec![json!(principal), json!(atome_js_values::dates::now_ms()), json!(limits.seats)],
                )
                .await?;
            current = self.seat(principal).await?;
        }
        if current.as_ref().map(|seat| &seat["state"]) != Some(&json!("active")) {
            return Ok(None);
        }
        if UNMETERED.contains(&action) {
            return Ok(self.read_key()?.map(|key| (key, None)));
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
        let hold = self.reserve(principal, action).await?;
        self.add_usage(principal, 1, 0, i64::from(realtime)).await?;
        Ok(self.read_key()?.map(|key| (key, Some(hold))))
    }

    // The money reserved before the call; an operation billed per call is settled at once.
    async fn reserve(&self, principal: &str, action: &str) -> Result<String, String> {
        use crate::billing::{guard, pricing, usage};
        let hold = format!("ai:{}", uuid::Uuid::new_v4().simple());
        let (who, what, reference) = (principal.to_string(), action.to_string(), hold.clone());
        self.central
            .transaction(move |db| {
                let now = atome_js_values::dates::now_ms();
                guard::reserve(db, &who, "ai", pricing::hold_cents("ai")?, &reference, now)?;
                if let Ok(flat) = pricing::ai_cost_micro_cents(&what, &JsonValue::Null) {
                    usage::settle_ai(db, &reference, &what, "openai", flat, now)?;
                }
                Ok(())
            })
            .await?;
        Ok(hold)
    }

    /// A hold given back whole: the call it reserved for failed before any provider answered.
    pub async fn release(&self, hold: Option<&str>) -> Result<(), String> {
        let Some(reference) = hold.map(str::to_string) else {
            return Ok(());
        };
        self.central
            .transaction(move |db| {
                crate::billing::guard::release(db, &reference, atome_js_values::dates::now_ms())
            })
            .await
    }

    /// The tokens a metered answer used, and its real cost settled on its hold: the model's dated
    /// price per token, plus `extra` (the router's part, R-120), plus atome's 3 % (billing/usage.rs),
    /// owed to the provider that answered.
    pub async fn record_tokens(
        &self,
        principal: &str,
        usage: &JsonValue,
        hold: Option<&str>,
        priced_as: (&str, &str, i64),
        action: &str,
    ) -> Result<(), String> {
        let (provider, model, extra) = priced_as;
        if let Some(hold) = hold {
            let mut priced = usage.clone();
            if let Some(object) = priced.as_object_mut() {
                object.insert("model".into(), json!(model));
            }
            let cost = crate::billing::pricing::ai_cost_micro_cents(action, &priced)? + extra;
            let (reference, what, supplier) =
                (hold.to_string(), action.to_string(), provider.to_string());
            self.central
                .transaction(move |db| {
                    crate::billing::usage::settle_ai(
                        db,
                        &reference,
                        &what,
                        &supplier,
                        cost,
                        atome_js_values::dates::now_ms(),
                    )
                })
                .await?;
        }
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
