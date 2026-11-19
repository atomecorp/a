// A stored file read through a shared folder (R-202: a project shared live, spec todo/R-202_dossiers_partages_2026-11-17.md).
// The folder's owner and its members read every file the folder holds, whoever of them sent it: the reader and the file's
// owner are both parties to one active linked share of that folder, and the folder (its root and everything under it in
// the owner's vault) holds the file's atome or an atome naming the file. A member may name in the folder only a file
// they may read themselves (`foreign_name`), so a member never reaches another party's file the folder does not hold.
// A folder also holds the media an atome under it declares it plays (`uses_media`: a project's timeline, its clips and its
// instruments' samples, R-194): its parties read them, read only, the file and its atome; a member may declare only media
// they may read themselves (`foreign_use`).
use crate::social::news::db::{all, text};
use crate::vault_router::central::Central;
use crate::vault_router::shares::{self, ACTIVE_LINKED};
use crate::vault_router::{VaultRouter, js};
use serde_json::{Value as JsonValue, json};

// The keys by which an atome names a stored file.
const NAMING_KEYS: [&str; 3] = ["file_name", "media_url", "src"];
// The key by which an atome declares the media atomes it plays (eVe molecule_stores.js#timelineUsedMedia).
const USES_KEY: &str = "uses_media";

/// Whether an atome's state (or a commit's props) declares it plays the atome `id` (`uses_media`).
pub fn uses_atome(state: &JsonValue, id: &str) -> bool {
    !id.is_empty() && used_atomes(props_of(state)).iter().any(|used| used == id)
}

fn used_atomes(props: &JsonValue) -> Vec<String> {
    props
        .get(USES_KEY)
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(js::string)
        .filter(|id| !id.is_empty())
        .collect()
}

/// Whether an atome's state (or a commit's props) names the stored file `name`: its `file_name`, or the last segment of
/// its `media_url` or `src`.
pub fn names_file(state: &JsonValue, name: &str) -> bool {
    !name.is_empty()
        && named_files(props_of(state))
            .iter()
            .any(|named| named == name)
}

fn props_of(state: &JsonValue) -> &JsonValue {
    ["properties", "particles", "props"]
        .iter()
        .filter_map(|key| state.get(*key))
        .find(|props| props.is_object())
        .unwrap_or(state)
}

// The file names a set of props names (`file_name` as it is, an address by its last segment, decoded).
fn named_files(props: &JsonValue) -> Vec<String> {
    NAMING_KEYS
        .iter()
        .filter_map(|key| props.get(*key))
        .map(js::string)
        .filter(|value| !value.is_empty())
        .map(|value| {
            let path = value.split(['?', '#']).next().unwrap_or("").to_string();
            let last = path.rsplit('/').next().unwrap_or("").to_string();
            urlencoding::decode(&last)
                .map(|last| last.into_owned())
                .unwrap_or(last)
        })
        .filter(|name| !name.is_empty())
        .collect()
}

// The folders `user` is party to with `other` (the folder's owner or one of its members): `(owner, root)` pairs.
async fn common_folders(
    central: &Central,
    user: &str,
    other: &str,
) -> Result<Vec<(String, String)>, String> {
    let (user, other) = (user.to_string(), other.to_string());
    let rows = central
        .transaction(move |db| {
            // The roots each of them reaches: as its owner (a share they made) or as a member (a share they hold).
            let sql = format!(
                "SELECT DISTINCT owner_id, atome_id FROM sync_share_requests s
                 WHERE {ACTIVE_LINKED} AND (owner_id = ?1 OR principal_id = ?1)
                   AND EXISTS (SELECT 1 FROM sync_share_requests t WHERE t.atome_id = s.atome_id AND t.owner_id = s.owner_id
                     AND t.status IN ('active', 'accepted') AND t.share_type = 'linked'
                     AND (t.owner_id = ?2 OR t.principal_id = ?2))"
            );
            all(db, &sql, &[&user, &other])
        })
        .await?;
    Ok(rows
        .iter()
        .map(|row| (text(row.get("owner_id")), text(row.get("atome_id"))))
        .filter(|(owner, root)| !owner.is_empty() && !root.is_empty())
        .collect())
}

/// Whether a shared folder both `user` and `file_owner` are party to holds the file (`ids`: its atome and the atomes the
/// central database knows naming it; `name`: its stored name).
pub async fn holds(
    router: &VaultRouter,
    central: &Central,
    user: &str,
    file_owner: &str,
    ids: &[String],
    name: &str,
) -> Result<bool, String> {
    if user.is_empty() || user == "anonymous" || file_owner.is_empty() {
        return Ok(false);
    }
    for (owner, root) in common_folders(central, user, file_owner).await? {
        for state in router.states_within_shared_root(&owner, &root).await? {
            let id = shares::state_atome_id(&state)
                .map(|id| js::id(Some(id)))
                .unwrap_or_default();
            if ids.contains(&id)
                || names_file(&state, name)
                || ids.iter().any(|wanted| uses_atome(&state, wanted))
            {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// The share through which `user` reads `media_owner`'s atome `atome_id` because a folder both are party to plays it
/// (`uses_media`): read only, every property but the owner's credentials (shares.rs#project_shared_state).
pub async fn used_through(
    router: &VaultRouter,
    central: &Central,
    user: &str,
    media_owner: &str,
    atome_id: &str,
) -> Result<Option<JsonValue>, String> {
    if user.is_empty() || user == "anonymous" || media_owner.is_empty() || atome_id.is_empty() {
        return Ok(None);
    }
    for (owner, root) in common_folders(central, user, media_owner).await? {
        let states = router.states_within_shared_root(&owner, &root).await?;
        if states.iter().any(|state| uses_atome(state, atome_id)) {
            // The folder's share `user` is party to names the read (`sync_share_id`), as a share's own read does.
            let (reader, folder, by) = (user.to_string(), root.clone(), owner.clone());
            let share_id = central
                .transaction(move |db| {
                    let sql = format!(
                        "SELECT share_id FROM sync_share_requests WHERE {ACTIVE_LINKED} AND atome_id = ?1 AND owner_id = ?2
                         AND (owner_id = ?3 OR principal_id = ?3) ORDER BY updated_at DESC LIMIT 1"
                    );
                    all(db, &sql, &[&folder, &by, &reader])
                })
                .await?
                .first()
                .map(|row| text(row.get("share_id")))
                .unwrap_or_default();
            return Ok(Some(json!({ "owner_id": media_owner, "share_id": share_id,
                "permissions_json": { "read": true } })));
        }
    }
    Ok(None)
}

/// A member's write into a folder (`share`: theirs) refused when it names a file they may not read (`foreign_name`).
pub async fn guard_write(
    router: &VaultRouter,
    principal: &str,
    share: &JsonValue,
    event: &JsonValue,
) -> Result<(), String> {
    let (owner, root) = (js::id(share.get("owner_id")), js::id(share.get("atome_id")));
    let props = event.pointer("/payload/props").unwrap_or(&JsonValue::Null);
    if foreign_name(router, router.central(), principal, &owner, &root, props)
        .await?
        .is_some()
        || foreign_use(router, router.central(), principal, &owner, &root, props)
            .await?
            .is_some()
    {
        return Err("property_write_denied".into());
    }
    Ok(())
}

/// The media atome a member's write into `owner`'s folder declares it plays (`uses_media`) that the member may not read:
/// one the folder does not hold or play already and that is not the member's own.
pub async fn foreign_use(
    router: &VaultRouter,
    central: &Central,
    principal: &str,
    owner: &str,
    root: &str,
    props: &JsonValue,
) -> Result<Option<String>, String> {
    let used = used_atomes(props);
    if used.is_empty() {
        return Ok(None);
    }
    let held = router.states_within_shared_root(owner, root).await?;
    for id in used {
        let known = held.iter().any(|state| {
            shares::state_atome_id(state).map(|own| js::id(Some(own))) == Some(id.clone())
                || uses_atome(state, &id)
        });
        if known {
            continue;
        }
        let (wanted, reader) = (id.clone(), principal.to_string());
        let theirs = central
            .transaction(move |db| {
                let rows = all(
                    db,
                    "SELECT owner_id FROM atomes WHERE atome_id = ? AND deleted_at IS NULL LIMIT 1",
                    &[&wanted],
                )?;
                Ok(rows.iter().any(|row| text(row.get("owner_id")) == reader))
            })
            .await?;
        if !theirs {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

/// The file a member's write into `owner`'s folder names that the member may not read: a name of `owner`'s files (or of
/// another account's) the folder does not hold already. A name of the member's own files is theirs to place.
pub async fn foreign_name(
    router: &VaultRouter,
    central: &Central,
    principal: &str,
    owner: &str,
    root: &str,
    props: &JsonValue,
) -> Result<Option<String>, String> {
    let names = named_files(props);
    if names.is_empty() {
        return Ok(None);
    }
    let held = router.states_within_shared_root(owner, root).await?;
    for name in names {
        if held.iter().any(|state| names_file(state, &name)) {
            continue;
        }
        let (wanted, reader) = (name.clone(), principal.to_string());
        let foreign = central
            .transaction(move |db| {
                let rows = all(db, "SELECT a.owner_id FROM atomes a JOIN particles p ON p.atome_id = a.atome_id
                     WHERE p.particle_key = 'file_name' AND p.particle_value = ? AND a.deleted_at IS NULL LIMIT 12",
                    &[&json!(wanted).to_string()])?;
                let owners: Vec<String> = rows.iter().map(|row| text(row.get("owner_id"))).collect();
                Ok(!owners.is_empty() && !owners.contains(&reader))
            })
            .await?;
        if foreign {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::{named_files, names_file, uses_atome};
    use serde_json::json;

    #[test]
    fn a_state_names_its_file_by_file_name_media_url_or_src() {
        let by_name = json!({ "properties": { "file_name": "contrat.pdf" } });
        let by_url = json!({ "particles": { "media_url": "/api/uploads/mon%20contrat.pdf?media_user_id=a" } });
        assert!(names_file(&by_name, "contrat.pdf"));
        assert!(names_file(&by_url, "mon contrat.pdf"));
        assert!(!names_file(&by_name, "autre.pdf"));
        assert!(!names_file(&json!({ "properties": {} }), ""));
        assert_eq!(
            named_files(&json!({ "src": "https://x.test/a/b.png#f", "name": "c" })),
            vec!["b.png".to_string()]
        );
    }

    #[test]
    fn a_state_declares_the_media_it_plays_by_uses_media() {
        let project = json!({ "properties": { "uses_media": ["sound_a", "sample_b"] } });
        assert!(uses_atome(&project, "sample_b"));
        assert!(!uses_atome(&project, "sound_c"));
        assert!(!uses_atome(&project, ""));
        assert!(!uses_atome(
            &json!({ "properties": { "uses_media": "sound_a" } }),
            "sound_a"
        ));
    }
}
