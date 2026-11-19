//! The operator's tools (`target/release/atome_admin`, src/bin/atome_admin.rs), run on the server
//! from the project root with the service environment loaded. Each group is the port of a former
//! Node script, with its commands, options and output lines:
//!
//!   roles            the accounts' roles (scripts/account_roles_admin.mjs; ws_api/sources/account_roles.rs)
//!   public-events    the reported public events (scripts/public_events_admin.mjs; social/public_events/store.rs)
//!   ai-seats         the shared OpenAI test seats (scripts/ai_shared_key_admin.mjs; providers/shared_grant.rs)
//!   server-identity  the secrets and the identity key pair of the environment file
//!                    (scripts/server_secure_config.js and generate-server-keys.js; server_identity/secure_config.rs)
//!
//! `--db <file>` reads another copy of the central database (the tests' own, a backup).
mod ai_seats;
mod console;
mod identity;
mod public_events;
mod roles;

use crate::auth::accounts;
use crate::settings::Settings;
use crate::vault_router::central::Central;
use rusqlite::Connection;
use serde_json::Value as JsonValue;
use std::path::{Path, PathBuf};

const GROUPS: &str = "Groups: roles | public-events | ai-seats | server-identity";

// The options that take the next word as their value; every other `--word` is a flag.
const VALUED: [&str; 8] = [
    "--handle",
    "--phone",
    "--role",
    "--env-file",
    "--identity-dir",
    "--backup-dir",
    "--output",
    "--db",
];

/// The command line after the group and its command: the plain words, then the options' values.
#[derive(Clone)]
struct Args {
    words: Vec<String>,
    options: Vec<(String, String)>,
}

impl Args {
    fn parse(items: &[String]) -> Self {
        let (mut words, mut options) = (Vec::new(), Vec::new());
        let mut items = items.iter();
        while let Some(item) = items.next() {
            if VALUED.contains(&item.as_str()) {
                options.push((item.clone(), items.next().cloned().unwrap_or_default()));
            } else if !item.starts_with("--") {
                words.push(item.clone());
            }
        }
        Self { words, options }
    }

    /// The option's value, when it is given and not empty (the scripts' `option(name)` read as truthy).
    fn option(&self, name: &str) -> Option<&str> {
        self.options
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
            .filter(|value| !value.is_empty())
    }

    fn word(&self, index: usize) -> Option<&str> {
        self.words.get(index).map(String::as_str)
    }
}

/// `script:<user>`: who granted, in the rows the operator writes.
fn operator() -> String {
    format!(
        "script:{}",
        std::env::var("USER")
            .ok()
            .filter(|user| !user.is_empty())
            .unwrap_or_else(|| "operator".into())
    )
}

/// `new Date(ms).toISOString().slice(0, 16)`.
fn minute(ms: &JsonValue) -> String {
    atome_js_values::iso(ms.as_f64().unwrap_or(0.0) as i64)
        .chars()
        .take(16)
        .collect()
}

/// A value as `Array.prototype.join` writes it: nothing for null.
fn cell(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => atome_js_values::text(Some(value)),
    }
}

/// `findPrincipalByPhone(dataSource, phone)`: the live account holding the verified number, as typed.
fn account_by_phone(db: &Connection, phone: &str) -> Result<Option<JsonValue>, String> {
    let normalized = accounts::normalize_phone(phone);
    if normalized.is_empty() {
        return Ok(None);
    }
    accounts::find_by_phone(db, &normalized)
}

/// The central database the server reads, brought to its schema as the scripts' `initDatabase` did.
fn central(args: &Args, settings: &Settings, project: &Path) -> Result<Central, String> {
    let path = match args.option("--db") {
        Some(path) => PathBuf::from(path),
        None => settings.central_database(project)?,
    };
    crate::central_schema::prepare(&path, project)?;
    Central::open(&path)
}

/// Runs `<group> <command> [arguments]` from the project root `project`; what it prints goes to
/// the standard output, its refusal comes back as the error.
pub async fn run(items: &[String], project: &Path) -> Result<(), String> {
    let (group, rest) = items.split_first().ok_or(GROUPS)?;
    let (command, rest) = rest
        .split_first()
        .map_or(("", &[][..]), |(command, rest)| (command.as_str(), rest));
    let args = Args::parse(rest);
    if group == "server-identity" {
        return identity::run(command, &args, project);
    }
    let settings = Settings::load(project)?;
    match group.as_str() {
        "roles" => roles::run(command, &args, &central(&args, &settings, project)?).await,
        "public-events" => {
            public_events::run(command, &args, central(&args, &settings, project)?).await
        }
        "ai-seats" => {
            let central = central(&args, &settings, project)?;
            ai_seats::run(command, &args, &settings, central).await
        }
        _ => Err(GROUPS.into()),
    }
}
