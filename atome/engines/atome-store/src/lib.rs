//! The one Atome store (ADOLE v3): the canonical schema, the append-only event
//! commit, its projection into `state_current`, `atomes` and `permissions`, the
//! history, the per-property ACL and the type gate, on SQLite.
//!
//! It knows no transport: Axum (Tauri desktop and Android), the cloud vault
//! binary and the iOS host call it with a `rusqlite::Connection`.

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

pub mod append;
mod authorize;
pub mod canonical;
mod commit;
mod communication;
pub mod conflicts;
pub mod containment;
mod event;
pub mod history;
pub mod history_command;
pub mod intent;
mod legacy_columns;
mod model;
mod mutation;
pub mod particles;
mod pending;
mod permissions;
mod projection;
mod reads;
mod row_json;
mod rows;
mod schema;
pub mod security;
mod snapshots;
mod state_projection;
mod stream_pages;
pub mod type_gate;
pub mod vault;

pub use commit::*;
pub use event::*;
pub use legacy_columns::{ensure_legacy_columns, prepare_legacy_columns};
pub use model::*;
pub use permissions::*;
pub use projection::*;
pub use rows::*;
pub use schema::*;
pub use snapshots::restored_atome_ids;

#[cfg(test)]
#[path = "../../../../tests/atome_store/commit_parity.rs"]
mod commit_parity;

#[cfg(test)]
#[path = "../../../../tests/atome_vault/vault_parity.rs"]
mod vault_parity;

#[cfg(test)]
#[path = "../../../../tests/atome_vault/replay_pages.rs"]
mod replay_pages;

#[cfg(test)]
#[path = "../../../../tests/atome_vault/conversations.rs"]
mod conversations;
