// A vault's objects seen through an active share (server/syncShareHierarchy.js,
// server/userVaultShareProjection.js, atome/src/shared/share_rights.js): which
// share covers an object (its root holds it and no private program lies on the
// way), the rights and property lists it grants, and the state it shows.
use super::VaultRouter;
use super::js::{self, first, truthy};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::HashSet;
use url::Url;

pub const ACTIVE_LINKED: &str = "status IN ('active', 'accepted')
    AND share_type = 'linked'
    AND (expires_at IS NULL OR expires_at > datetime('now'))";

pub fn state_parent_id(state: &JsonValue) -> Option<&JsonValue> {
    let properties = state
        .get("properties")
        .filter(|value| truthy(Some(value)))
        .or_else(|| state.get("particles"))
        .unwrap_or(&JsonValue::Null);
    first(properties, &["parent_id", "parentId"])
        .or_else(|| {
            state
                .get("meta")
                .and_then(|meta| first(meta, &["parent_id", "parentId"]))
        })
        .or_else(|| first(state, &["parent_id", "parentId"]))
}

pub fn state_atome_id(state: &JsonValue) -> Option<&JsonValue> {
    first(state, &["atome_id", "atomeId", "id"]).or_else(|| {
        state
            .get("atome")
            .and_then(|atome| first(atome, &["id", "atome_id"]))
    })
}

// A programme (a project holding `project_program`) is shared as its plan alone, when it is the share's root
// itself (register R-115 D25): what lies under it (its sessions, its measures) stays its maker's, and a
// programme inside another shared root is not shared with it.
fn is_private_program(state: &JsonValue) -> bool {
    let properties = state
        .get("properties")
        .filter(|value| truthy(Some(value)))
        .or_else(|| state.get("particles"));
    truthy(properties.and_then(|properties| properties.get("project_program")))
}

// Share rows store permissions and property lists as JSON text (`null` reads as absent).
fn parse_json(value: Option<&JsonValue>) -> Option<JsonValue> {
    match value? {
        JsonValue::Null => None,
        JsonValue::String(text) => serde_json::from_str(text)
            .ok()
            .filter(|value: &JsonValue| !value.is_null()),
        other => Some(other.clone()),
    }
}

#[derive(Default)]
pub struct Rights {
    pub read: bool,
    pub write: bool,
    pub create: bool,
    pub delete: bool,
    pub reshare: bool,
    // R-349: the project's proxy alone (social/sharing/rights.rs), `read` bringing it along.
    pub listen: bool,
}

// Every historical spelling of a capability (`alter`, `can_write`, `share`…), read by the one
// owner of a share's rights (social/sharing/rights.rs#normalized).
pub fn rights(share: Option<&JsonValue>) -> Rights {
    let permissions = parse_json(share.and_then(|share| share.get("permissions_json")))
        .unwrap_or_else(|| json!({}));
    let [read, write, create, delete, reshare, _manage, listen] =
        crate::social::sharing::rights::normalized(&permissions);
    Rights {
        read,
        write,
        create,
        delete,
        reshare,
        listen,
    }
}

/// A listener's read of what a project shared at « Écoute » keeps from them (its tracks, its
/// events): refused by name (R-349).
pub const LISTEN_ONLY: &str = "share_access_listen_only";
// The key by which a media atome marks itself the light proxy of a project (R-349 lot 3 renders
// it): `properties.proxy_of` = the project's id. The store's `meta` holds only its own fields, so
// the mark is a property, committed with the media as every property is.
const PROXY_KEY: &str = "proxy_of";
// What a listener reads of the project atome itself: what names it, never its content.
const LISTEN_ROOT_PROPERTIES: [&str; 3] = ["name", "type", "kind"];

/// Whether `state` is a proxy of the project `root` (`properties.proxy_of`).
pub fn is_proxy_of(state: &JsonValue, root: &str) -> bool {
    !root.is_empty()
        && state
            .get("properties")
            .and_then(|properties| properties.get(PROXY_KEY))
            .is_some_and(|mark| js::id(Some(mark)) == root)
}

/// A share at « Écoute »: it holds `listen` without `read` (R-349).
pub fn listens_only(share: &JsonValue) -> bool {
    let rights = rights(Some(share));
    rights.listen && !rights.read
}

/// Whether `share` reaches `state`, an atome of its branch: a share reaches all of it (its rights
/// then say what it may do there), a listener only its root (its name) and its proxy.
pub fn reaches(share: &JsonValue, state: &JsonValue) -> bool {
    if !listens_only(share) {
        return true;
    }
    let root = js::id(share.get("atome_id"));
    js::id(state_atome_id(state)) == root || is_proxy_of(state, &root)
}

// What the recipient SEES and what it may CHANGE (D8); `allowed_properties_json`
// stands for both when its own list is absent. `None`: every property.
fn property_set(share: &JsonValue, column: &str) -> Option<HashSet<String>> {
    let value = parse_json(share.get(column))
        .or_else(|| parse_json(share.get("allowed_properties_json")))?;
    let items = value.as_array().filter(|items| !items.is_empty())?;
    Some(items.iter().map(js::string).collect())
}

pub fn readable(share: &JsonValue) -> Option<HashSet<String>> {
    property_set(share, "readable_properties_json")
}

pub fn writable(share: &JsonValue) -> Option<HashSet<String>> {
    property_set(share, "writable_properties_json")
}

// A recipient never receives the owner's session capability a media URL may carry.
const OWNER_CREDENTIALS: [&str; 3] = ["media_token", "token", "access_token"];

fn without_owner_credentials(value: &str) -> String {
    if !OWNER_CREDENTIALS
        .iter()
        .any(|name| value.contains(&format!("{name}=")))
    {
        return value.to_string();
    }
    let relative = value.starts_with('/');
    let Ok(base) = Url::parse("http://relative.invalid") else {
        return value.to_string();
    };
    let Ok(mut url) = base.join(value) else {
        return value.to_string();
    };
    let kept: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(name, _)| !OWNER_CREDENTIALS.contains(&name.as_ref()))
        .map(|(name, value)| (name.into_owned(), value.into_owned()))
        .collect();
    if url.query().is_some() {
        url.set_query(None);
        if !kept.is_empty() {
            url.query_pairs_mut().extend_pairs(kept);
        }
    }
    if !relative {
        return url.to_string();
    }
    let mut out = url.path().to_string();
    if let Some(query) = url.query().filter(|query| !query.is_empty()) {
        out.push('?');
        out.push_str(query);
    }
    if let Some(fragment) = url.fragment().filter(|fragment| !fragment.is_empty()) {
        out.push('#');
        out.push_str(fragment);
    }
    out
}

pub fn filter_properties(properties: Option<&JsonValue>, share: &JsonValue) -> JsonValue {
    let allowed = readable(share);
    let mut kept = JsonMap::new();
    for (key, value) in properties
        .and_then(JsonValue::as_object)
        .into_iter()
        .flatten()
    {
        if allowed
            .as_ref()
            .is_some_and(|allowed| !allowed.contains(key))
        {
            continue;
        }
        let value = match value {
            JsonValue::String(text) => JsonValue::String(without_owner_credentials(text)),
            other => other.clone(),
        };
        kept.insert(key.clone(), value);
    }
    JsonValue::Object(kept)
}

/// The properties of `atome_id` a share shows: its readable ones, and of the project itself a
/// listener reads only what names it (R-349).
pub fn shown_properties(
    properties: Option<&JsonValue>,
    share: &JsonValue,
    atome_id: &str,
) -> JsonValue {
    let mut shown = filter_properties(properties, share);
    if listens_only(share)
        && atome_id == js::id(share.get("atome_id")).as_str()
        && let Some(fields) = shown.as_object_mut()
    {
        fields.retain(|key, _| LISTEN_ROOT_PROPERTIES.contains(&key.as_str()));
    }
    shown
}

// Another vault's state through an active share: its readable properties, the share's rights.
pub fn project_shared_state(state: &JsonValue, share: &JsonValue) -> JsonValue {
    let rights = rights(Some(share));
    let atome_id = js::id(state_atome_id(state));
    js::with(
        state,
        [
            (
                "properties",
                shown_properties(state.get("properties"), share, &atome_id),
            ),
            (
                "vault_principal_id",
                share.get("owner_id").cloned().unwrap_or(JsonValue::Null),
            ),
            (
                "sync_share_id",
                share.get("share_id").cloned().unwrap_or(JsonValue::Null),
            ),
            (
                "capabilities",
                json!({ "read": rights.read, "write": rights.write, "create": rights.create,
                        "delete": rights.delete, "share": rights.reshare }),
            ),
        ],
    )
}

const SYSTEM_STATE_TYPES: [&str; 9] = [
    "project",
    "user",
    "blackhole",
    "tool",
    "tool_macro",
    "toolbox",
    "tool_block",
    "panel",
    "system",
];

fn state_type(state: &JsonValue) -> String {
    let properties = state.get("properties").unwrap_or(&JsonValue::Null);
    first(state, &["type", "atome_type"])
        .or_else(|| first(properties, &["type", "kind"]))
        .map(js::string)
        .unwrap_or_default()
        .to_lowercase()
}

// The owner side's list filters (`listStateCurrent`, database/adole.js).
pub fn matches_list_scope(state: &JsonValue, options: &JsonValue) -> bool {
    if let Some(project) = first(options, &["project_id", "projectId"]) {
        let own = state
            .get("meta")
            .and_then(|meta| meta.get("project_id"))
            .filter(|value| truthy(Some(value)))
            .or_else(|| first(state, &["project_id"]))
            .or_else(|| {
                state
                    .get("properties")
                    .and_then(|p| first(p, &["project_id"]))
            });
        if own.map(js::string).unwrap_or_default() != js::string(project) {
            return false;
        }
    }
    let wanted = js::id(first(options, &["atome_type", "atomeType"])).to_lowercase();
    let kind = state
        .get("kind")
        .filter(|v| truthy(Some(v)))
        .map(js::string)
        .unwrap_or_default()
        .to_lowercase();
    if !wanted.is_empty() && state_type(state) != wanted && kind != wanted {
        return false;
    }
    let exclude = [options.get("exclude_system"), options.get("excludeSystem")]
        .iter()
        .any(|value| *value == Some(&JsonValue::Bool(true)));
    if exclude {
        let id = state_atome_id(state)
            .map(js::string)
            .unwrap_or_default()
            .to_lowercase();
        if SYSTEM_STATE_TYPES.contains(&state_type(state).as_str())
            || id.starts_with("tool.ui.")
            || id.starts_with("tool_ui.")
        {
            return false;
        }
    }
    true
}

impl VaultRouter {
    async fn state_of(&self, owner: &str, atome_id: &str) -> Result<JsonValue, String> {
        self.ask(owner, "state:get", json!({ "atome_id": atome_id }))
            .await
    }

    pub async fn has_private_program_ancestor(
        &self,
        owner: &str,
        atome_id: &str,
    ) -> Result<bool, String> {
        let mut cursor = atome_id.trim().to_string();
        let mut visited = HashSet::new();
        while !cursor.is_empty() && visited.insert(cursor.clone()) {
            let state = self.state_of(owner, &cursor).await?;
            if is_private_program(&state) {
                return Ok(true);
            }
            cursor = js::id(state_parent_id(&state));
        }
        Ok(false)
    }

    // Whether a programme lies strictly above `atome_id` (the atome itself not counted): a programme's interior.
    pub async fn within_private_program(
        &self,
        owner: &str,
        atome_id: &str,
    ) -> Result<bool, String> {
        let state = self.state_of(owner, atome_id.trim()).await?;
        let parent = js::id(state_parent_id(&state));
        if parent.is_empty() {
            return Ok(false);
        }
        self.has_private_program_ancestor(owner, &parent).await
    }

    pub async fn within_shared_root(
        &self,
        owner: &str,
        atome_id: &str,
        root: &str,
    ) -> Result<bool, String> {
        let start = atome_id.trim().to_string();
        let mut cursor = start.clone();
        let root = root.trim();
        let mut visited = HashSet::new();
        while !cursor.is_empty() && !visited.contains(&cursor) {
            let state = self.state_of(owner, &cursor).await?;
            if cursor == root {
                // A programme root shows itself alone, never what lies under it.
                if cursor != start && is_private_program(&state) {
                    return Ok(false);
                }
                return Ok(!self.within_private_program(owner, &cursor).await?);
            }
            if is_private_program(&state) {
                return Ok(false);
            }
            visited.insert(cursor.clone());
            cursor = js::id(state_parent_id(&state));
        }
        Ok(false)
    }

    pub async fn active_shares(
        &self,
        principal: &str,
        owner: Option<&str>,
    ) -> Result<Vec<JsonValue>, String> {
        let (filter, values) = match owner {
            Some(owner) => ("AND owner_id = ?", vec![json!(principal), json!(owner)]),
            None => ("", vec![json!(principal)]),
        };
        self.central
            .all(
                format!("SELECT * FROM sync_share_requests WHERE principal_id = ? {filter} AND {ACTIVE_LINKED} ORDER BY updated_at DESC"),
                values,
            )
            .await
    }

    // The share through which `principal` reaches `atome_id`; a share whose branch holds it but
    // that only listens (R-349) refuses it by name, unless another share reaches it.
    async fn find_share(
        &self,
        principal: &str,
        owner: &str,
        atome_id: &str,
    ) -> Result<Option<JsonValue>, String> {
        let mut listened = false;
        for share in self.active_shares(principal, Some(owner)).await? {
            let share_owner = js::id(share.get("owner_id"));
            let root = js::id(share.get("atome_id"));
            if !self
                .within_shared_root(&share_owner, atome_id, &root)
                .await?
            {
                continue;
            }
            if self.share_reaches(&share, atome_id).await? {
                return Ok(Some(share));
            }
            listened = true;
        }
        if listened {
            return Err(LISTEN_ONLY.into());
        }
        Ok(None)
    }

    /// Whether `share` reaches `atome_id` of its branch (`reaches`, the state read only when the
    /// share listens and the atome is not its root).
    pub async fn share_reaches(&self, share: &JsonValue, atome_id: &str) -> Result<bool, String> {
        if !listens_only(share) || atome_id == js::id(share.get("atome_id")) {
            return Ok(true);
        }
        let state = self
            .state_of(&js::id(share.get("owner_id")), atome_id)
            .await?;
        Ok(reaches(share, &state))
    }

    pub async fn share_for_atome(
        &self,
        principal: &str,
        atome_id: &str,
        owner: Option<String>,
    ) -> Result<Option<JsonValue>, String> {
        let owner = match owner {
            Some(owner) => Some(owner),
            None => self.owner_of(atome_id).await?,
        };
        match owner {
            Some(owner) => self.find_share(principal, &owner, atome_id).await,
            None => Ok(None),
        }
    }

    // The states of `owner`'s vault under `root`, none inside a programme (a programme root shows itself alone).
    pub async fn states_within_shared_root(
        &self,
        owner: &str,
        root: &str,
    ) -> Result<Vec<JsonValue>, String> {
        let states = self.branch_states(owner, root).await?;
        Ok(states_within_root(&states, root))
    }

    // `root` and everything under it in `owner`'s vault, read as one branch (never the whole vault).
    pub async fn branch_states(&self, owner: &str, root: &str) -> Result<Vec<JsonValue>, String> {
        let states = self
            .ask(owner, "state:within", json!({ "root_atome_id": root }))
            .await?;
        Ok(states.as_array().cloned().unwrap_or_default())
    }
}

/// The states of one owner's listing under `root`, none inside a programme (a programme root shows itself alone).
/// Pure: a caller walking several shares of one owner lists that owner's vault once.
pub fn states_within_root(states: &[JsonValue], root: &str) -> Vec<JsonValue> {
    let by_id: std::collections::HashMap<String, &JsonValue> = states
        .iter()
        .map(|state| {
            (
                state_atome_id(state).map(js::string).unwrap_or_default(),
                state,
            )
        })
        .collect();
    let private = |id: &str| by_id.get(id).is_some_and(|state| is_private_program(state));
    let parent_of = |id: &str| {
        by_id
            .get(id)
            .map(|state| js::id(state_parent_id(state)))
            .unwrap_or_default()
    };
    let within = |state: &JsonValue| {
        let start = js::id(state_atome_id(state));
        let mut cursor = start.clone();
        let mut visited = HashSet::new();
        while !cursor.is_empty() && !visited.contains(&cursor) {
            if cursor == root {
                if cursor != start && private(&cursor) {
                    return false;
                }
                let mut parent = parent_of(&cursor);
                let mut ancestors = HashSet::new();
                while !parent.is_empty() && ancestors.insert(parent.clone()) {
                    if private(&parent) {
                        return false;
                    }
                    parent = parent_of(&parent);
                }
                return true;
            }
            if private(&cursor) {
                return false;
            }
            visited.insert(cursor.clone());
            cursor = parent_of(&cursor);
        }
        false
    };
    states
        .iter()
        .filter(|state| within(state))
        .cloned()
        .collect()
}

impl VaultRouter {
    pub async fn authorize_shared_create(
        &self,
        principal: &str,
        owner: &str,
        parent_id: &str,
        event: &JsonValue,
    ) -> Result<(), String> {
        let share = self.share_for_atome(principal, parent_id, Some(owner.to_string()));
        let Some(share) = share.await?.filter(|share| rights(Some(share)).create) else {
            return Err("property_create_denied".into());
        };
        crate::media::shared_folders::guard_write(self, principal, &share, event).await
    }

    pub async fn authorize_shared_write(
        &self,
        principal: &str,
        event: &JsonValue,
        owner: Option<String>,
    ) -> Result<(), String> {
        let atome_id = js::id(event.get("atome_id"));
        let Some(share) = self.share_for_atome(principal, &atome_id, owner).await? else {
            return Err("property_write_denied".into());
        };
        let rights = rights(Some(&share));
        // Deleting is a capability of its own: it does not also need `write`.
        if js::id(event.get("kind")).to_lowercase() == "delete" {
            return if rights.delete {
                Ok(())
            } else {
                Err("property_delete_denied".into())
            };
        }
        if !rights.write {
            return Err("property_write_denied".into());
        }
        crate::media::shared_folders::guard_write(self, principal, &share, event).await?;
        let Some(allowed) = writable(&share) else {
            return Ok(());
        };
        let payload = event.get("payload").unwrap_or(&JsonValue::Null);
        let props = payload.get("props").and_then(JsonValue::as_object);
        let deleted = first(payload, &["delete_keys", "deleteKeys"]).and_then(JsonValue::as_array);
        let touched = props
            .into_iter()
            .flat_map(|props| props.keys().cloned())
            .chain(deleted.into_iter().flatten().map(js::string));
        if touched.into_iter().any(|key| !allowed.contains(&key)) {
            return Err("property_write_denied".into());
        }
        Ok(())
    }
}

// R-349: the three access levels of a project shared live, as a share row carries them.
#[cfg(test)]
mod access_levels {
    use super::*;

    const PROJECT: &str = "project_concert";

    fn share(permissions: JsonValue) -> JsonValue {
        json!({ "share_id": "s1", "owner_id": "alice", "atome_id": PROJECT,
            "permissions_json": permissions.to_string() })
    }

    fn state(id: &str, properties: JsonValue) -> JsonValue {
        json!({ "atome_id": id, "properties": properties })
    }

    #[test]
    fn a_listener_reaches_the_project_and_its_proxy_never_a_track() {
        let listener = share(json!({ "can_listen": true }));
        let project = state(
            PROJECT,
            json!({ "name": "Concert", "uses_media": ["m1"], "timeline": { "bpm": 120 } }),
        );
        // Lot 3 renders the proxy; one made by hand carries the mark it will carry.
        let proxy = state(
            "proxy_1",
            json!({ "type": "audio", "proxy_of": PROJECT, "file_name": "concert.ogg" }),
        );
        let track = state("track_1", json!({ "type": "audio", "parent_id": PROJECT }));
        let other_proxy = state("proxy_2", json!({ "proxy_of": "another_project" }));
        assert!(reaches(&listener, &project));
        assert!(reaches(&listener, &proxy));
        assert!(!reaches(&listener, &track));
        assert!(!reaches(&listener, &other_proxy));
        // Of the project itself, what names it alone.
        let shown = project_shared_state(&project, &listener);
        assert_eq!(shown["properties"], json!({ "name": "Concert" }));
        // The proxy keeps what plays it.
        assert_eq!(
            project_shared_state(&proxy, &listener)["properties"]["file_name"],
            json!("concert.ogg")
        );
        let rights = rights(Some(&listener));
        assert!(rights.listen && !rights.read && !rights.write && !rights.create && !rights.delete);
    }

    #[test]
    fn a_reader_reaches_every_track_and_writes_none() {
        // A share made read only before R-349 (`{ read }`) reads as one now: `read` brings `listen` along.
        for permissions in [json!({ "read": true }), json!({ "can_read": 1 })] {
            let reader = share(permissions);
            let track = state("track_1", json!({ "type": "audio", "parent_id": PROJECT }));
            assert!(reaches(&reader, &track));
            let rights = rights(Some(&reader));
            assert!(
                rights.read && rights.listen && !rights.write && !rights.delete && !rights.create
            );
            assert_eq!(
                project_shared_state(
                    &state(PROJECT, json!({ "name": "Concert", "bpm": 120 })),
                    &reader
                )["properties"]["bpm"],
                json!(120)
            );
        }
    }

    #[test]
    fn a_writer_reaches_and_writes_everything() {
        let writer = share(json!({ "read": true, "write": true, "create": true, "delete": true }));
        let track = state("track_1", json!({ "parent_id": PROJECT }));
        assert!(reaches(&writer, &track));
        let rights = rights(Some(&writer));
        assert!(rights.read && rights.write && rights.create && rights.delete && rights.listen);
        assert!(!listens_only(&writer));
    }

    #[test]
    fn a_proxy_is_marked_by_its_project_alone() {
        assert!(is_proxy_of(
            &state("p", json!({ "proxy_of": PROJECT })),
            PROJECT
        ));
        assert!(!is_proxy_of(&state("p", json!({})), PROJECT));
        assert!(!is_proxy_of(&state("p", json!({ "proxy_of": "" })), ""));
    }
}
