// Google Play purchases (server/billing/google_play_verify.js, ported): the Play Developer API
// is the only authority on a Play purchase; a purchase token from the device or from a
// Pub/Sub notification is a lookup key, never a proof by itself. Subscriptions are
// acknowledged and packs consumed once the caller has recorded them, so Google neither
// refunds them nor blocks rebuying. The service account is a runtime input:
// `ATOME_PLAY_SERVICE_ACCOUNT_FILE`, or the `serviceAccountFile` of the Play release
// configuration (scripts/android/play_configuration.mjs); without it every Play operation
// answers `billing_store_unconfigured`.
use super::{Purchase, catalog, lenient};
use crate::google_access::GoogleAccess;
use crate::http::uri::encode_uri_component as encode;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::path::{Path, PathBuf};

const PACKAGE: &str = "one.atome.app";
const API: &str = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
// A cancelled subscription keeps its paid period; the others carry no entitlement.
const ENTITLED: [&str; 3] = [
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
];
const INVALID: &str = "billing_proof_invalid";
// A configuration or service account Fastify throws on: no `billing_` code.
const ACCOUNT_INVALID: &str = "play_service_account_invalid";

pub enum Notice {
    Subscription {
        product: JsonValue,
        token: JsonValue,
    },
    Voided(String),
    Ignored,
}

pub struct Google {
    access: GoogleAccess,
    client: reqwest::Client,
    project_root: PathBuf,
    account_file: Option<String>,
    config_file: PathBuf,
}

fn token(value: &JsonValue) -> Result<&str, &'static str> {
    value
        .as_str()
        .filter(|token| {
            (10..=4096).contains(&token.len())
                && token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._:-".contains(&b))
        })
        .ok_or(INVALID)
}

fn token_ref(token: &str) -> String {
    let digest = ring::digest::digest(&ring::digest::SHA256, token.as_bytes());
    let hex: String = digest.as_ref().iter().map(|b| format!("{b:02x}")).collect();
    format!("token:{}", &hex[..40])
}

// Renewals are `GPA.x..N`; the subscription's original order is `GPA.x`.
fn original_order(order: &str) -> String {
    match order.rsplit_once("..") {
        Some((head, tail)) if !tail.is_empty() && tail.bytes().all(|b| b.is_ascii_digit()) => {
            head.to_string()
        }
        _ => order.to_string(),
    }
}

// `readPlayConfiguration`: the release configuration's `serviceAccountFile`, none without a file.
fn configured_account(file: &Path) -> Result<Option<String>, &'static str> {
    let text = match std::fs::read_to_string(file) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(ACCOUNT_INVALID),
    };
    let config: JsonValue = serde_json::from_str(&text).map_err(|_| ACCOUNT_INVALID)?;
    const ALLOWED: [&str; 7] = [
        "packageName",
        "track",
        "serviceAccountFile",
        "uploadCertificateSha256",
        "initialUploadComplete",
        "testerOptInUrl",
        "releaseNotes",
    ];
    let keys = config.as_object().ok_or(ACCOUNT_INVALID)?;
    let account = config
        .get("serviceAccountFile")
        .filter(|f| js::truthy(Some(f)));
    let account_valid =
        account.is_none_or(|f| f.as_str().is_some_and(|f| Path::new(f).is_absolute()));
    let fingerprint = config
        .get("uploadCertificateSha256")
        .filter(|f| js::truthy(Some(f)));
    let fingerprint_valid = fingerprint.is_none_or(|f| {
        let hex = js::string(f).replace(':', "").to_lowercase();
        hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit())
    });
    let opt_in = config.get("testerOptInUrl").filter(|u| js::truthy(Some(u)));
    let opt_in_valid = opt_in
        .is_none_or(|u| u == &json!(format!("https://play.google.com/apps/testing/{PACKAGE}")));
    let note_valid = |note: &JsonValue| {
        let language = note["language"].as_str().unwrap_or_default();
        let mut parts = language.split('-');
        let base = parts.next().unwrap_or_default();
        let text = note["text"].as_str();
        note.as_object()
            .is_some_and(|keys| keys.keys().all(|key| key == "language" || key == "text"))
            && (2..=3).contains(&base.len())
            && base.bytes().all(|b| b.is_ascii_lowercase())
            && parts.all(|part| {
                (2..=8).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_alphanumeric())
            })
            && text.is_some_and(|text| !js::trim(text).is_empty() && text.chars().count() <= 500)
    };
    let notes_valid = config.get("releaseNotes").is_none_or(|notes| {
        notes
            .as_array()
            .is_some_and(|notes| notes.len() <= 20 && notes.iter().all(note_valid))
    });
    let valid = keys.keys().all(|key| ALLOWED.contains(&key.as_str()))
        && config["packageName"] == PACKAGE
        && config["track"] == "internal"
        && account_valid
        && fingerprint_valid
        && config["initialUploadComplete"].is_boolean()
        && opt_in_valid
        && notes_valid;
    if !valid {
        return Err(ACCOUNT_INVALID);
    }
    Ok(account.and_then(JsonValue::as_str).map(str::to_string))
}

// `readServiceAccount`: a private file (chmod 600) outside the sources (or under `Private/`).
fn service_account(file: &str, root: &Path) -> Result<(String, String), &'static str> {
    use std::os::unix::fs::PermissionsExt;
    let resolved = std::fs::canonicalize(file).map_err(|_| ACCOUNT_INVALID)?;
    let info = std::fs::metadata(&resolved).map_err(|_| ACCOUNT_INVALID)?;
    if !info.is_file() || info.permissions().mode() & 0o077 != 0 {
        return Err(ACCOUNT_INVALID);
    }
    let root = std::fs::canonicalize(root).map_err(|_| ACCOUNT_INVALID)?;
    if let Ok(inside) = resolved.strip_prefix(&root)
        && !inside.starts_with("Private")
    {
        return Err(ACCOUNT_INVALID);
    }
    let content: JsonValue = std::fs::read_to_string(&resolved)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .ok_or(ACCOUNT_INVALID)?;
    let email = content["client_email"].as_str().unwrap_or_default();
    let email_valid = email.split_once('@').is_some_and(|(name, domain)| {
        let clean = |part: &str| {
            !part.is_empty() && !part.contains(['@']) && !part.contains(char::is_whitespace)
        };
        clean(name)
            && domain
                .strip_suffix(".iam.gserviceaccount.com")
                .is_some_and(clean)
    });
    let (true, true, true, Some(key)) = (
        content["type"] == "service_account",
        content["token_uri"] == "https://oauth2.googleapis.com/token",
        email_valid,
        content["private_key"].as_str(),
    ) else {
        return Err(ACCOUNT_INVALID);
    };
    Ok((email.to_string(), key.to_string()))
}

impl Google {
    pub fn new(settings: &crate::settings::Settings, project_root: &Path) -> Result<Self, String> {
        let client = crate::tls::http_client()?
            .timeout(std::time::Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                attempt.error("redirect")
            }))
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            access: GoogleAccess::new(
                "https://www.googleapis.com/auth/androidpublisher",
                client.clone(),
            ),
            client,
            project_root: project_root.to_path_buf(),
            account_file: settings.get("ATOME_PLAY_SERVICE_ACCOUNT_FILE"),
            config_file: project_root.join(
                settings
                    .get("ATOME_PLAY_CONFIG")
                    .unwrap_or_else(|| "Private/android-play.json".into()),
            ),
        })
    }

    async fn authorize(&self) -> Result<String, &'static str> {
        let file = match &self.account_file {
            Some(file) => Some(file.clone()),
            None => configured_account(&self.config_file)?,
        };
        let file = file.ok_or("billing_store_unconfigured")?;
        let (email, key) = service_account(&file, &self.project_root)?;
        self.access
            .token(&email, &key)
            .await
            .map_err(|_| "play_authorization_failed")
    }

    async fn send(&self, post: bool, url: &str, operation: &str) -> Result<JsonValue, String> {
        let bearer = self.authorize().await?;
        let request = if post {
            self.client
                .post(url)
                .header("content-type", "application/json")
                .body("{}")
        } else {
            self.client.get(url)
        };
        let response = request
            .bearer_auth(bearer)
            .send()
            .await
            .map_err(|_| "billing_store_unavailable")?;
        let status = response.status().as_u16();
        if status == 404 || status == 410 {
            return Err(INVALID.into());
        }
        if !response.status().is_success() {
            return Err(if status >= 500 {
                "billing_store_unavailable".into()
            } else {
                format!("billing_store_{operation}_refused")
            });
        }
        if status == 204 {
            return Ok(json!({}));
        }
        response
            .json()
            .await
            .map_err(|_| "billing_store_unavailable".into())
    }

    /// `{ productId, purchaseToken }` as Google holds it, now.
    pub async fn verify_purchase(&self, proof: &JsonValue, now: i64) -> Result<Purchase, String> {
        let product = proof["productId"]
            .as_str()
            .and_then(catalog::product)
            .ok_or("billing_product_unknown")?;
        let product_id = product["productId"].as_str().unwrap_or_default();
        let purchase = token(&proof["purchaseToken"])?;
        let base = format!("{API}/{PACKAGE}/purchases");
        if product["kind"] == "plan" {
            let url = format!("{base}/subscriptionsv2/tokens/{}", encode(purchase));
            let sub = self.send(false, &url, "read").await?;
            let line = sub["lineItems"]
                .as_array()
                .and_then(|lines| lines.iter().find(|line| line["productId"] == product_id));
            let entitled = sub["subscriptionState"]
                .as_str()
                .is_some_and(|state| ENTITLED.contains(&state));
            let (Some(line), true) = (line, entitled) else {
                return Err(INVALID.into());
            };
            let end = js::date(line.get("expiryTime"));
            let latest = sub.get("latestOrderId").filter(|id| js::truthy(Some(id)));
            let order = latest.map_or_else(|| token_ref(purchase), js::string);
            let original = if latest.is_some() {
                original_order(&order)
            } else {
                order.clone()
            };
            return Ok(Purchase {
                source: "google".into(),
                transaction_id: order,
                original_transaction_id: original,
                product_id: product_id.into(),
                period_start_ms: end.map(|end| now.min(end - 1)),
                period_end_ms: end,
                account_token: sub
                    .pointer("/externalAccountIdentifiers/obfuscatedExternalAccountId")
                    .filter(|id| js::truthy(Some(id)))
                    .map(js::string),
                acknowledged: sub["acknowledgementState"] == "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
                purchase_token: Some(purchase.into()),
                ..Purchase::default()
            });
        }
        let url = format!(
            "{base}/products/{}/tokens/{}",
            encode(product_id),
            encode(purchase)
        );
        let item = self.send(false, &url, "read").await?;
        if item["purchaseState"] != json!(0) {
            return Err(INVALID.into());
        }
        let order = item
            .get("orderId")
            .filter(|id| js::truthy(Some(id)))
            .map_or_else(|| token_ref(purchase), js::string);
        Ok(Purchase {
            source: "google".into(),
            transaction_id: order.clone(),
            original_transaction_id: order,
            product_id: product_id.into(),
            account_token: item
                .get("obfuscatedExternalAccountId")
                .filter(|id| js::truthy(Some(id)))
                .map(js::string),
            acknowledged: item["consumptionState"] == json!(1),
            purchase_token: Some(purchase.into()),
            ..Purchase::default()
        })
    }

    /// Called after the ledger recorded the purchase.
    pub async fn settle(&self, purchase: &Purchase) -> Result<(), String> {
        if purchase.acknowledged {
            return Ok(());
        }
        let held = json!(purchase.purchase_token);
        let (id, token) = (encode(&purchase.product_id), encode(token(&held)?));
        let plan =
            catalog::product(&purchase.product_id).is_some_and(|product| product["kind"] == "plan");
        let url = if plan {
            format!("{API}/{PACKAGE}/purchases/subscriptions/{id}/tokens/{token}:acknowledge")
        } else {
            format!("{API}/{PACKAGE}/purchases/products/{id}/tokens/{token}:consume")
        };
        self.send(true, &url, "settle").await.map(drop)
    }

    /// A real-time developer notification (Pub/Sub push). Only the identifiers are read; the
    /// state always comes back from the API.
    pub fn parse_notification(body: &JsonValue) -> Result<Notice, &'static str> {
        let data = js::text(
            body.pointer("/message/data")
                .filter(|d| js::truthy(Some(d))),
        );
        let notice: JsonValue = lenient(&data)
            .and_then(|bytes| serde_json::from_str(&String::from_utf8_lossy(&bytes)).ok())
            .ok_or(INVALID)?;
        if notice["packageName"] != PACKAGE {
            return Err(INVALID);
        }
        if let Some(sub) = notice
            .get("subscriptionNotification")
            .filter(|n| js::truthy(Some(n)))
        {
            return Ok(Notice::Subscription {
                product: sub["subscriptionId"].clone(),
                token: sub["purchaseToken"].clone(),
            });
        }
        if let Some(voided) = notice
            .get("voidedPurchaseNotification")
            .filter(|n| js::truthy(Some(n)))
        {
            let order = voided.get("orderId").filter(|id| js::truthy(Some(id)));
            return Ok(Notice::Voided(order.map(js::string).unwrap_or_default()));
        }
        Ok(Notice::Ignored)
    }
}
