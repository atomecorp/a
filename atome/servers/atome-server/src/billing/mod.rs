// Billing (server/billing/, ported): the single offer's catalog, the ledger of purchases and
// credits, the store proofs (StoreKit 2, Google Play) and the in-app purchase path shared by
// account creation, the `/ws/api` family `billing` (restore, renewals, packs) and the store
// notification routes (web.rs). A store purchase is verified by its store, then bound to an
// account: either the account already holds its original transaction, or the purchase
// carries the account token of one of the account's device keys.
pub mod apple;
pub mod catalog;
pub mod google;
pub mod ledger;
pub mod routes;
mod x509;

use crate::vault_router::central::Central;
use crate::vault_router::js;
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};

/// A verified purchase, normalized for `ledger::apply_purchase`.
#[derive(Default)]
pub struct Purchase {
    pub source: String,
    pub transaction_id: String,
    pub original_transaction_id: String,
    pub product_id: String,
    pub period_start_ms: Option<i64>,
    pub period_end_ms: Option<i64>,
    pub account_token: Option<String>,
    pub revoked: bool,
    // Google Play: whether it is acknowledged (or consumed) already, and its token.
    pub acknowledged: bool,
    pub purchase_token: Option<String>,
}

impl Purchase {
    fn original(&self) -> &str {
        if self.original_transaction_id.is_empty() {
            &self.transaction_id
        } else {
            &self.original_transaction_id
        }
    }
}

const REVOKE_NOTICES: [&str; 2] = ["REFUND", "REVOKE"];

/// Node's `Buffer.from(text, 'base64url' | 'base64')`: either alphabet, padding or not, any
/// other character skipped.
pub(crate) fn lenient(text: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    use base64::engine::DecodePaddingMode;
    use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
    const ENGINE: GeneralPurpose = GeneralPurpose::new(
        &base64::alphabet::URL_SAFE,
        GeneralPurposeConfig::new()
            .with_decode_padding_mode(DecodePaddingMode::Indifferent)
            .with_decode_allow_trailing_bits(true),
    );
    let mut cleaned: String = text
        .chars()
        .filter_map(|c| match c {
            '+' => Some('-'),
            '/' => Some('_'),
            c if c.is_ascii_alphanumeric() || c == '-' || c == '_' => Some(c),
            _ => None,
        })
        .collect();
    // A lone trailing character carries no byte.
    if cleaned.len() % 4 == 1 {
        cleaned.pop();
    }
    ENGINE.decode(cleaned).ok()
}

/// `billingAccountToken`: the UUID that binds a store purchase to the device key that creates
/// (or owns) the account (Apple `appAccountToken`, Google `obfuscatedAccountId`), derived
/// without hashing from the hex SHA-256 key id.
pub fn account_token(key_id: &str) -> Option<String> {
    if key_id.len() != 64
        || !key_id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return None;
    }
    let mut hex: Vec<u8> = key_id.as_bytes()[..32].to_vec();
    hex[12] = b'8';
    let variant = (char::from(hex[16]).to_digit(16)? & 0x3) | 0x8;
    hex[16] = char::from_digit(variant, 16)? as u8;
    let value = String::from_utf8(hex).ok()?;
    Some(format!(
        "{}-{}-{}-{}-{}",
        &value[..8],
        &value[8..12],
        &value[12..16],
        &value[16..20],
        &value[20..]
    ))
}

// The account one of whose device keys the token names. The token keeps the key id's first
// 32 hex digits but the UUID version and variant digits, so the key is found by prefix.
fn principal_of_token(db: &Connection, token: &str) -> Result<Option<String>, String> {
    let normalized = token.to_lowercase();
    let hex = normalized.replace('-', "");
    if hex.len() != 32 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Ok(None);
    }
    let pattern = format!("{}_{}_{}%", &hex[..12], &hex[13..16], &hex[17..]);
    let mut statement = db
        .prepare("SELECT key_id, principal_id FROM auth_device_keys WHERE key_id LIKE ?")
        .map_err(|e| e.to_string())?;
    let rows = statement
        .query_map([pattern], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (key, principal) = row.map_err(|e| e.to_string())?;
        if account_token(&key).as_deref() == Some(normalized.as_str()) {
            return Ok(Some(principal));
        }
    }
    Ok(None)
}

// Records a verified purchase for `principal`. Idempotent: the ledger keys every store
// transaction once.
fn record(db: &Connection, principal: &str, purchase: &Purchase, now: i64) -> Result<(), String> {
    let owner = match ledger::owner_of_original(db, &purchase.source, purchase.original())? {
        Some(owner) => Some(owner),
        None => match &purchase.account_token {
            Some(token) => principal_of_token(db, token)?,
            None => None,
        },
    };
    if owner.as_deref() != Some(principal) {
        return Err("billing_purchase_owned_elsewhere".into());
    }
    if purchase.revoked {
        return ledger::revoke_purchase(db, &purchase.source, &purchase.transaction_id, now)
            .map(drop);
    }
    ledger::apply_purchase(db, principal, purchase, now).map(drop)
}

/// The account-creation payment, prepared before the account's transaction (store I/O) and
/// recorded inside it: a store purchase, or a simulated method (Web and desktop).
pub struct Creation {
    pub method: String,
    purchase: Option<Purchase>,
}

impl Creation {
    pub fn record(&self, db: &Connection, principal: &str, now: i64) -> Result<JsonValue, String> {
        let Some(purchase) = &self.purchase else {
            return ledger::apply_simulated_plan(db, principal, now);
        };
        ledger::apply_purchase(db, principal, purchase, now)?;
        let product = catalog::product(&purchase.product_id).ok_or("billing_product_unknown")?;
        Ok(
            json!({ "mode": self.method, "productId": product["productId"], "amountCents": product["priceCents"],
            "currency": product["currency"], "period": product["period"] }),
        )
    }
}

pub struct Billing {
    central: Central,
    apple: apple::Apple,
    google: google::Google,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl Billing {
    pub fn load(
        settings: &crate::settings::Settings,
        project_root: &std::path::Path,
        central: Central,
    ) -> Result<Self, String> {
        Ok(Self {
            central,
            apple: apple::Apple::new(apple::xcode_root(settings)?),
            google: google::Google::new(settings, project_root)?,
        })
    }

    pub fn central(&self) -> &Central {
        &self.central
    }

    // `apple`: the StoreKit 2 transaction JWS. `google`: `{ productId, purchaseToken }`.
    async fn verify(&self, store: &JsonValue, proof: &JsonValue) -> Result<Purchase, String> {
        if !catalog::listed("stores", store) {
            return Err("billing_store_unknown".into());
        }
        if store == "apple" {
            return self
                .apple
                .verify_transaction(proof, now_ms())
                .map_err(Into::into);
        }
        let proof = if js::truthy(Some(proof)) {
            proof.clone()
        } else {
            json!({})
        };
        self.google.verify_purchase(&proof, now_ms()).await
    }

    // Google keeps refunding a purchase that is never acknowledged (plans) or consumed
    // (packs); this runs once the ledger holds it.
    async fn settle(&self, purchase: &Purchase) -> Result<(), String> {
        if purchase.source == "google" {
            return self.google.settle(purchase).await;
        }
        Ok(())
    }

    /// Account creation: a store proof must be an active plan bought with the creating
    /// device key; the account does not exist yet, so the binding is checked against that
    /// key, not against the ledger. The native apps always send a store proof.
    pub async fn prepare_creation(
        &self,
        payment: &JsonValue,
        key_id: &str,
    ) -> Result<Creation, String> {
        let store = payment.get("store").filter(|store| js::truthy(Some(store)));
        let Some(store) = store else {
            let method = payment.get("method").cloned().unwrap_or(JsonValue::Null);
            if !catalog::listed("simulated_methods", &method) {
                return Err("auth_payment_method_invalid".into());
            }
            return Ok(Creation {
                method: js::string(&method),
                purchase: None,
            });
        };
        let purchase = self.verify(store, &payment["proof"]).await?;
        let plan =
            catalog::product(&purchase.product_id).is_some_and(|product| product["kind"] == "plan");
        if !plan || purchase.revoked {
            return Err("billing_plan_required".into());
        }
        if purchase.account_token.as_deref() != account_token(key_id).as_deref() {
            return Err("billing_purchase_owned_elsewhere".into());
        }
        let (source, original) = (purchase.source.clone(), purchase.original().to_string());
        let held = self
            .central
            .transaction(move |db| ledger::owner_of_original(db, &source, &original))
            .await?;
        if held.is_some() {
            return Err("billing_purchase_owned_elsewhere".into());
        }
        Ok(Creation {
            method: js::string(store),
            purchase: Some(purchase),
        })
    }

    /// After the account's transaction recorded the payment.
    pub async fn settle_creation(&self, creation: &Creation) -> Result<(), String> {
        match &creation.purchase {
            Some(purchase) => self.settle(purchase).await,
            None => Ok(()),
        }
    }

    // The account a store notice's purchase belongs to, and the purchase recorded for it.
    async fn record_for_owner(&self, purchase: Purchase) -> Result<(bool, Purchase), String> {
        self.central
            .transaction(move |db| {
                let owner =
                    match ledger::owner_of_original(db, &purchase.source, purchase.original())? {
                        Some(owner) => Some(owner),
                        None => principal_of_token(
                            db,
                            purchase.account_token.as_deref().unwrap_or_default(),
                        )?,
                    };
                let Some(owner) = owner else {
                    return Ok((false, purchase));
                };
                record(db, &owner, &purchase, now_ms())?;
                Ok((true, purchase))
            })
            .await
    }

    /// App Store Server Notifications v2. A purchase not yet linked to an account is left to
    /// the app, which submits it at creation or restore.
    pub async fn apple_notification(&self, signed: &JsonValue) -> Result<bool, String> {
        let (kind, transaction) = self.apple.verify_notification(signed, now_ms())?;
        let Some(transaction) = transaction else {
            return Ok(false);
        };
        if REVOKE_NOTICES.contains(&kind.as_str()) {
            let id = transaction.transaction_id;
            return self
                .central
                .transaction(move |db| ledger::revoke_purchase(db, "apple", &id, now_ms()))
                .await;
        }
        Ok(self.record_for_owner(transaction).await?.0)
    }

    /// Google Play real-time developer notifications (Pub/Sub push).
    pub async fn google_notification(&self, body: &JsonValue) -> Result<bool, String> {
        let (product, token) = match google::Google::parse_notification(body)? {
            google::Notice::Voided(order) => {
                return self
                    .central
                    .transaction(move |db| ledger::revoke_purchase(db, "google", &order, now_ms()))
                    .await;
            }
            google::Notice::Ignored => return Ok(false),
            google::Notice::Subscription { product, token } => (product, token),
        };
        let proof = json!({ "productId": product, "purchaseToken": token });
        let purchase = match self.verify(&json!("google"), &proof).await {
            Ok(purchase) => purchase,
            // An expired, paused or on-hold subscription grants nothing new.
            Err(error) if error == "billing_proof_invalid" => return Ok(false),
            Err(error) => return Err(error),
        };
        let (handled, purchase) = self.record_for_owner(purchase).await?;
        if handled {
            self.settle(&purchase).await?;
        }
        Ok(handled)
    }

    /// `/ws/api` family `billing`: the authenticated principal's plan and credits, the offer
    /// catalog, and the in-app purchase proofs submitted after the account exists. `principal`
    /// is the account the message's token names (`Err` when its token cannot be read), if
    /// provisioned.
    pub async fn frame(
        &self,
        message: &JsonValue,
        principal: Result<Option<&str>, ()>,
    ) -> (bool, JsonValue) {
        match self.operation(message, principal).await {
            Ok(fields) => (true, fields),
            Err(error) => {
                let public = ["billing_", "not_authenticated", "insufficient_quota"]
                    .iter()
                    .any(|prefix| error.starts_with(prefix));
                (
                    false,
                    json!({ "error": if public { error.as_str() } else { "billing_operation_failed" } }),
                )
            }
        }
    }

    async fn operation(
        &self,
        message: &JsonValue,
        principal: Result<Option<&str>, ()>,
    ) -> Result<JsonValue, String> {
        let principal = match principal {
            Err(()) => return Err("principal_unreadable".into()),
            Ok(None) => return Err("not_authenticated".into()),
            Ok(Some(principal)) => principal.to_string(),
        };
        let action = message
            .get("action")
            .filter(|action| js::truthy(Some(action)))
            .or_else(|| message.get("op"))
            .filter(|action| js::truthy(Some(action)))
            .map(|action| js::trim(&js::string(action)).to_lowercase())
            .unwrap_or_default();
        let store = match action.as_str() {
            "status" => {
                return self
                    .central
                    .transaction(move |db| ledger::status(db, &principal, now_ms()))
                    .await;
            }
            "offers" => {
                let catalog = catalog::catalog();
                return Ok(json!({ "plans": catalog["plans"], "packs": catalog["packs"] }));
            }
            "apple.verify" => "apple",
            "google.verify" => "google",
            _ => return Err("billing_operation_not_allowed".into()),
        };
        let purchase = self.verify(&json!(store), &message["proof"]).await?;
        let owner = principal.clone();
        let purchase = self
            .central
            .transaction(move |db| record(db, &owner, &purchase, now_ms()).map(|()| purchase))
            .await?;
        self.settle(&purchase).await?;
        self.central
            .transaction(move |db| ledger::status(db, &principal, now_ms()))
            .await
    }
}
