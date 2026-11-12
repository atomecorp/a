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
    // iOS: the vault's folder (the app group) also holds the native captures, apart from the
    // files' root (the app's Documents); a media missing from the first is looked up there.
    pub(super) media_fallback_root: Option<PathBuf>,
    pub(crate) recent_request_ids: Arc<Mutex<DedupeCache>>,
    pub(crate) remote_sync_credentials: Arc<Mutex<HashMap<String, RemoteSyncCredential>>>,
}

impl LocalAtomeState {
    pub(crate) fn storage_root(&self) -> &Path {
        &self.storage_root
    }

    /// A person's file at `relative` (from the root): the files' root, else the vault's folder
    /// when only that one holds it.
    pub(crate) fn media_file(&self, relative: &Path) -> PathBuf {
        let primary = self.storage_root.join(relative);
        if primary.exists() {
            return primary;
        }
        self.media_fallback_root
            .as_ref()
            .map(|root| root.join(relative))
            .filter(|candidate| candidate.exists())
            .unwrap_or(primary)
    }
}

#[derive(Clone)]
pub(crate) struct RemoteSyncCredential {
    pub(crate) remote_user_id: String,
    pub(crate) token: String,
    pub(crate) remote_url: String,
    pub(crate) environment_fingerprint: String,
}
