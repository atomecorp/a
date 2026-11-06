use super::local_atome::DedupeCache;
use super::local_vault::LocalVault;
use serde_json::Value as JsonValue;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

#[derive(Clone)]
pub struct LocalAtomeState {
    pub(crate) sync_progress: Arc<Mutex<HashMap<String, JsonValue>>>,
    pub db: Arc<LocalVault>,
    pub(super) storage_root: PathBuf,
    pub(crate) recent_request_ids: Arc<Mutex<DedupeCache>>,
    pub(crate) remote_sync_credentials: Arc<Mutex<HashMap<String, RemoteSyncCredential>>>,
}

impl LocalAtomeState {
    pub(crate) fn storage_root(&self) -> &Path {
        &self.storage_root
    }
}

#[derive(Clone)]
pub(crate) struct RemoteSyncCredential {
    pub(crate) remote_user_id: String,
    pub(crate) token: String,
    pub(crate) remote_url: String,
    pub(crate) environment_fingerprint: String,
}
