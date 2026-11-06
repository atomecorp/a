// Property privacy rules, the output side of Conditions (database/adole_privacy_rules.js
// `allowsPropertyRead`, ported): « share my photo only with my contacts » is a rule about the
// owner's data that applies to whoever reads it. A rule is restrictive only: it is consulted after
// a permission already said yes, and can only turn that into a no.
use crate::social::news::db::{get, run};
use atome_store::append::iso_now;
use atome_store::canonical::sanitize_properties;
use atome_store::security::document_matches;
use rusqlite::Connection;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

// `getEffectiveOwnerId`: the atome's owner, else the owner its creation is pending for.
pub(super) fn effective_owner(db: &Connection, atome_id: &str) -> Result<Option<String>, String> {
    let Some(atome) = get(
        db,
        "SELECT owner_id FROM atomes WHERE atome_id = ?",
        &[&atome_id],
    )?
    else {
        return Ok(None);
    };
    if let Some(owner) = atome["owner_id"].as_str().filter(|owner| !owner.is_empty()) {
        return Ok(Some(owner.to_string()));
    }
    let pending = get(
        db,
        "SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = '_pending_owner_id' LIMIT 1",
        &[&atome_id],
    )?;
    Ok(pending
        .and_then(|row| row["particle_value"].as_str().map(str::to_string))
        .and_then(|raw| serde_json::from_str::<JsonValue>(&raw).ok())
        .map(|owner| crate::vault_router::js::string(&owner)))
}

// `getAtome(id).properties`: the live atome's particles, each read back from its JSON text.
pub(super) fn properties(db: &Connection, atome_id: &str) -> Result<JsonValue, String> {
    if get(
        db,
        "SELECT atome_id FROM atomes WHERE atome_id = ? AND deleted_at IS NULL",
        &[&atome_id],
    )?
    .is_none()
    {
        return Ok(json!({}));
    }
    let rows = crate::social::news::db::all(
        db,
        "SELECT particle_key, particle_value FROM particles WHERE atome_id = ? AND value_type != 'deleted'",
        &[&atome_id],
    )?;
    let mut data = JsonMap::new();
    for row in rows {
        let key = crate::vault_router::js::string(&row["particle_key"]);
        if key == "kind" {
            continue;
        }
        let value = match &row["particle_value"] {
            JsonValue::String(raw) => {
                serde_json::from_str(raw).unwrap_or_else(|_| JsonValue::String(raw.clone()))
            }
            other => other.clone(),
        };
        data.insert(key, value);
    }
    Ok(JsonValue::Object(sanitize_properties(&JsonValue::Object(
        data,
    ))))
}

/// Whether `reader` may read `key` of `atome_id` for `operation`: true when no rule objects.
pub fn allows_read(
    db: &Connection,
    atome_id: &str,
    key: &str,
    reader: &str,
    operation: &str,
) -> Result<bool, String> {
    if atome_id.is_empty() || key.is_empty() {
        return Ok(true);
    }
    let rule = get(
        db,
        "SELECT conditions FROM property_privacy_rules WHERE atome_id = ? AND particle_key = ?",
        &[&atome_id, &key],
    )?;
    // No rule means no opinion: every property without one behaves as before.
    let Some(conditions) = rule
        .and_then(|rule| rule["conditions"].as_str().map(str::to_string))
        .filter(|conditions| !conditions.is_empty())
    else {
        return Ok(true);
    };
    // A rule never hides data from its own owner.
    if effective_owner(db, atome_id)?.as_deref() == Some(reader) {
        return Ok(true);
    }
    let reader_properties = if reader.is_empty() {
        json!({})
    } else {
        properties(db, reader)?
    };
    let context = json!({
        "time": { "now": iso_now() },
        "user": reader_properties,
        "atome": properties(db, atome_id)?,
        "actor": { "id": reader },
        "operation": { "name": operation, "property": key },
        "property": { "key": key }
    });
    // An unreadable rule fails closed; `unknown` is not a match.
    Ok(document_matches(&conditions, &context))
}

/// `setPropertyPrivacyRule(atomeId, particleKey, conditions, actorId)`: only the owner sets the rule
/// guarding one property; no conditions clears it, restoring the ordinary permission.
pub fn set(
    db: &Connection,
    atome_id: &str,
    key: &str,
    conditions: Option<&JsonValue>,
    actor: &str,
) -> Result<JsonValue, String> {
    let (atome, key, actor) = (atome_id.trim(), key.trim(), actor.trim());
    if atome.is_empty() || key.is_empty() || actor.is_empty() {
        return Ok(json!({ "ok": false, "error": "privacy_rule_target_invalid" }));
    }
    let owner = effective_owner(db, atome)?;
    if owner.as_deref() != Some(actor) {
        return Ok(json!({ "ok": false, "error": "privacy_rule_not_owner" }));
    }
    if conditions.is_none_or(JsonValue::is_null) {
        run(
            db,
            "DELETE FROM property_privacy_rules WHERE atome_id = ? AND particle_key = ?",
            &[&atome, &key],
        )?;
        return Ok(json!({ "ok": true, "cleared": true }));
    }
    let Ok(Some(document)) = super::conditions::normalize(conditions) else {
        return Ok(json!({ "ok": false, "error": "privacy_rule_conditions_invalid" }));
    };
    let serialized = document.to_string();
    let existing = get(
        db,
        "SELECT rule_id FROM property_privacy_rules WHERE atome_id = ? AND particle_key = ?",
        &[&atome, &key],
    )?
    .and_then(|row| row["rule_id"].as_str().map(str::to_string))
    .filter(|rule| !rule.is_empty());
    if let Some(rule) = existing {
        run(
            db,
            "UPDATE property_privacy_rules SET conditions = ?, updated_at = datetime('now') WHERE rule_id = ?",
            &[&serialized, &rule],
        )?;
        return Ok(json!({ "ok": true, "rule_id": rule, "updated": true }));
    }
    let rule = uuid::Uuid::new_v4().to_string();
    run(
        db,
        "INSERT INTO property_privacy_rules (rule_id, atome_id, particle_key, owner_id, conditions) VALUES (?, ?, ?, ?, ?)",
        &[&rule, &atome, &key, &actor, &serialized],
    )?;
    Ok(json!({ "ok": true, "rule_id": rule, "created": true }))
}

/// `listPropertyPrivacyRules(atomeId, actorId)`: the rules are their owner's alone to read.
pub fn list(db: &Connection, atome_id: &str, actor: &str) -> Result<JsonValue, String> {
    let atome = atome_id.trim();
    if effective_owner(db, atome)?
        .as_deref()
        .filter(|owner| *owner == actor)
        .is_none()
    {
        return Ok(json!({ "ok": false, "error": "privacy_rule_not_owner", "rules": [] }));
    }
    let rules: Vec<JsonValue> = crate::social::news::db::all(
        db,
        "SELECT rule_id, particle_key, conditions, updated_at FROM property_privacy_rules WHERE atome_id = ?",
        &[&atome],
    )?
    .into_iter()
    .map(|row| {
        let conditions = row["conditions"]
            .as_str()
            .and_then(|raw| serde_json::from_str::<JsonValue>(raw).ok())
            .unwrap_or(JsonValue::Null);
        json!({ "rule_id": row["rule_id"], "particle_key": row["particle_key"],
            "conditions": conditions, "updated_at": row["updated_at"] })
    })
    .collect();
    Ok(json!({ "ok": true, "rules": rules }))
}
