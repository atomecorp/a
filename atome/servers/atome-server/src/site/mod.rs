// The websites (server/site_services.js and ws_site.js, ported; todo/publication_web_2026-10-28.md):
// the publishing of a project at atome.one/<slug> (publishing.rs, its pages made by
// projection.rs), the domains and mail of a simulated provider and the hosting summary
// (domains.rs), the public pages, media and personal domains (http.rs) and the contact form
// (contact.rs). The `site` frames of `/ws/api` are an account's.
mod assets;
mod contact;
pub mod contract;
mod css;
mod dns;
mod domain_link;
mod domains;
pub mod http;
mod mail;
mod media;
mod objects;
mod operations;
mod projection;
mod publishing;
mod store;

use crate::billing::Billing;
use crate::media::downloads::Downloads;
use crate::settings::Settings;
use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use crate::ws_sync::SyncRuntime;
use base64::Engine;
use ring::rand::{SecureRandom, SystemRandom};
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

/// A media a preview shows, read from its original file.
pub struct Held {
    pub file_path: PathBuf,
    pub mime: &'static str,
}

// A preview (« Aperçu »): its pages by address part and its media by content, for half an hour.
struct Preview {
    site_id: String,
    expires: i64,
    pages: HashMap<String, String>,
    media: HashMap<String, Held>,
}

/// What the environment says of the websites, read as Fastify reads it: `ATOME_SITE_ORIGIN`,
/// `ATOME_SITES_ROOT` (from the project's root), `ATOME_SITE_CERT_COMMAND`; the font and the mark
/// the pages use.
#[derive(Clone)]
pub struct Setup {
    origin: String,
    sites_root: PathBuf,
    cert_command: Option<String>,
    fonts: PathBuf,
    logo: PathBuf,
}

impl Setup {
    pub fn load(settings: &Settings, project_root: &Path) -> Self {
        let set = |name: &str| settings.get(name).filter(|value| !value.is_empty());
        let assets = project_root.join("atome").join("src").join("assets");
        Self {
            origin: set("ATOME_SITE_ORIGIN").unwrap_or_else(|| "https://atome.one".into()),
            sites_root: project_root
                .join(set("ATOME_SITES_ROOT").unwrap_or_else(|| "data/sites".into())),
            cert_command: set("ATOME_SITE_CERT_COMMAND"),
            fonts: assets.join("fonts").join("Roboto"),
            logo: assets.join("images").join("icons").join("atome.svg"),
        }
    }
}

pub struct Site {
    store: store::Store,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
    billing: Arc<Billing>,
    origin: String,
    sites_root: PathBuf,
    // The people's homes, whose size the hosting summary tells.
    user_root: PathBuf,
    fonts: PathBuf,
    logo: PathBuf,
    cert_command: Option<String>,
    previews: Mutex<HashMap<String, Preview>>,
    // A domain's price held for a quarter of an hour (`domain_quote`, then `domain_buy`).
    quotes: Mutex<HashMap<String, JsonValue>>,
    // Woken when a planned operation is added or moved.
    clock: Notify,
}

fn fail(error: &str) -> JsonValue {
    json!({ "ok": false, "error": error })
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn random_bytes(count: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; count];
    SystemRandom::new().fill(&mut bytes).expect("system random");
    bytes
}

/// `crypto.randomBytes(count).toString('base64url')`.
fn random_token(count: usize) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(random_bytes(count))
}

/// `crypto.randomBytes(count).toString('hex')`.
fn random_hex(count: usize) -> String {
    random_bytes(count)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

impl Site {
    /// On the central database, the people's vaults and homes, the ledger of the plans.
    pub fn new(
        central: Central,
        router: Arc<VaultRouter>,
        sync: Arc<SyncRuntime>,
        billing: Arc<Billing>,
        setup: Setup,
        user_root: PathBuf,
    ) -> Arc<Self> {
        Arc::new(Self {
            store: store::Store { central },
            router,
            sync,
            billing,
            origin: setup.origin,
            sites_root: setup.sites_root,
            user_root,
            fonts: setup.fonts,
            logo: setup.logo,
            cert_command: setup.cert_command,
            previews: Mutex::new(HashMap::new()),
            quotes: Mutex::new(HashMap::new()),
            clock: Notify::new(),
        })
    }

    /// A `site` frame of the account `user`: its answer, none for an unknown action.
    pub async fn frame(
        &self,
        files: &Downloads<'_>,
        data: &JsonValue,
        user: &str,
    ) -> Result<Option<JsonValue>, String> {
        let action = data
            .get("action")
            .filter(|action| js::truthy(Some(action)))
            .map(|action| js::text(Some(action)))
            .unwrap_or_default();
        if action.starts_with("domain_") || action.starts_with("mail_") || action == "hosting" {
            return self.domains(data, user, &action).await;
        }
        self.publishing(files, data, user, &action).await
    }
}
