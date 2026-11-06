// The device seats' shared side (server/surfaceGrants.js and the store of
// server/wsTeleportOperations.js, ported): the grants an owner gives another account on one of
// their surfaces, kept in the central database (grants.rs), and the teleported objects, read and
// patched in their owner's vault through the vault router, each inserted event told to the devices
// following its stream. The live seats themselves are the `/ws/api` connections'
// (ws_api/seats.rs).
pub mod grants;
pub mod teleport_state;

use crate::vault_router::VaultRouter;
use crate::vault_router::central::Central;
use crate::vault_router::js;
use crate::ws_sync::SyncRuntime;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

pub struct Surfaces {
    central: Central,
    router: Arc<VaultRouter>,
    sync: Arc<SyncRuntime>,
}

impl Surfaces {
    pub fn new(central: Central, router: Arc<VaultRouter>, sync: Arc<SyncRuntime>) -> Self {
        Self {
            central,
            router,
            sync,
        }
    }

    /// An atome's properties as `principal` may read them, none when it is missing or unreadable
    /// (`readAtomeProperties`).
    pub async fn properties(
        &self,
        principal: &str,
        atome_id: &str,
    ) -> Result<Option<JsonValue>, String> {
        let state = self.router.get_state(principal, &json!(atome_id)).await?;
        if state.is_null() {
            return Ok(None);
        }
        Ok(Some(
            js::first(&state, &["properties", "particles"])
                .cloned()
                .unwrap_or_else(|| json!({})),
        ))
    }

    /// A teleport patch committed as `principal` (the vault refuses one that may not write
    /// it), its event told to the stream's followers when inserted (`commitTeleportPatch`).
    pub async fn commit(
        &self,
        atome_id: &str,
        patch: JsonValue,
        principal: &str,
    ) -> Result<JsonValue, String> {
        let event = json!({ "kind": "set", "atome_id": atome_id, "payload": { "props": patch },
            "actor": { "type": "user", "id": principal } });
        let entry = self.router.commit(principal, &event, &json!({})).await?;
        if entry.get("inserted") == Some(&json!(true)) {
            self.sync.publish(&entry["event"]).await?;
        }
        Ok(entry["event"].clone())
    }

    /// The atomes of `owner`'s vault living on `surface_id` (`teleportHostedAtomes`).
    pub async fn hosted(&self, owner: &str, surface_id: &str) -> Result<Vec<String>, String> {
        let hosted = self
            .router
            .service(
                "router:teleport-hosted",
                &json!({ "owner_id": owner, "surface_id": surface_id }),
            )
            .await?;
        Ok(hosted
            .as_array()
            .into_iter()
            .flatten()
            .map(js::string)
            .collect())
    }
}
