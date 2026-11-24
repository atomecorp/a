// Surface grants (server/surfaceGrants.js, ported): what a grantee may do on an owner's
// surface, each capability checked on its own, so a grant to receive an object confers nothing
// about driving the pointer. A grant never transfers the ownership of anything.
use super::Surfaces;
use crate::vault_router::central::row_json;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

pub const TELEPORT_RECEIVE: &str = "teleport_receive";
pub const TELEPORT_DISPLAY: &str = "teleport_display";
pub const REMOTE_COMMAND: &str = "remote_command";

const KNOWN: [&str; 9] = [
    TELEPORT_RECEIVE,
    TELEPORT_DISPLAY,
    "teleport_manipulate",
    "teleport_persist",
    "teleport_return",
    "remote_pointer",
    "remote_keyboard",
    "remote_surface",
    REMOTE_COMMAND,
];

/// Receiving and displaying: the smallest useful grant, not enough to control anything.
pub const DEFAULT_REQUESTED: [&str; 2] = [TELEPORT_RECEIVE, TELEPORT_DISPLAY];

/// The known capabilities among `values`, once each, in their first order (`normalizeCapabilities`).
pub fn normalized(values: Option<&JsonValue>) -> Vec<String> {
    let mut capabilities: Vec<String> = Vec::new();
    for value in values.and_then(JsonValue::as_array).into_iter().flatten() {
        let key = js::id(Some(value)).to_lowercase();
        if KNOWN.contains(&key.as_str()) && !capabilities.contains(&key) {
            capabilities.push(key);
        }
    }
    capabilities
}

fn default_requested() -> Vec<String> {
    DEFAULT_REQUESTED.iter().map(|c| c.to_string()).collect()
}

// `rowToGrant`.
fn grant(row: &JsonValue) -> JsonValue {
    let capabilities = serde_json::from_str::<JsonValue>(
        row.get("capabilities")
            .filter(|c| js::truthy(Some(c)))
            .and_then(JsonValue::as_str)
            .unwrap_or("[]"),
    )
    .map(|parsed| normalized(Some(&parsed)))
    .unwrap_or_default();
    let or_null = |key: &str| js::first(row, &[key]).cloned().unwrap_or(JsonValue::Null);
    json!({ "grant_id": row["grant_id"], "owner_id": js::string(&row["owner_id"]),
        "surface_id": js::string(&row["surface_id"]), "grantee_id": js::string(&row["grantee_id"]),
        "capabilities": capabilities, "status": row["status"], "requested_at": row["requested_at"],
        "decided_at": or_null("decided_at"), "revoked_at": or_null("revoked_at"), "expires_at": or_null("expires_at"),
        "once": row.get("once") == Some(&json!(1)) })
}

fn text(grant: &JsonValue, key: &str) -> String {
    js::string(&grant[key])
}

fn live(grant: &JsonValue, now: i64) -> bool {
    if grant["status"] != json!("granted") {
        return false;
    }
    if !js::truthy(grant.get("expires_at")) {
        return true;
    }
    js::date(Some(&grant["expires_at"])).is_some_and(|expires| expires > now)
}

/// How long an accepted grant lasts: until `expires_at` (ISO) when given, and only to its first
/// use when `once`.
#[derive(Default)]
pub struct Limits {
    pub expires_at: Option<String>,
    pub once: bool,
}

/// A request's outcome: the grant, and whether it was the pending one asked before.
pub struct Requested {
    pub grant: JsonValue,
    pub reused: bool,
}

/// A decision's or a revocation's outcome: the grant, else the refusal.
pub type Decided = Result<JsonValue, String>;

const BY_ID: &str = "SELECT * FROM surface_grants WHERE grant_id = ?";

impl Surfaces {
    pub async fn grant(&self, grant_id: &str) -> Result<Option<JsonValue>, String> {
        let row = self.central.get(BY_ID, vec![json!(grant_id)]).await?;
        Ok(row.as_ref().map(grant))
    }

    /// Asks an owner for capabilities on one of their surfaces; re-asking while a request is
    /// pending gives that request back. The outer error is a database failure, the inner a refusal.
    pub async fn request(
        &self,
        owner: &str,
        surface: &str,
        grantee: &str,
        capabilities: &[String],
        expires_at: JsonValue,
    ) -> Result<Result<Requested, String>, String> {
        let (owner, surface, grantee) = (js::trim(owner), js::trim(surface), js::trim(grantee));
        if owner.is_empty() || surface.is_empty() || grantee.is_empty() {
            return Ok(Err("surface_grant_target_invalid".into()));
        }
        if owner == grantee {
            return Ok(Err("surface_grant_self".into()));
        }
        let asked = if capabilities.is_empty() {
            default_requested()
        } else {
            capabilities.to_vec()
        };
        let requested = normalized(Some(&json!(asked)));
        if requested.is_empty() {
            return Ok(Err("surface_grant_capabilities_invalid".into()));
        }
        let existing = self
            .central
            .get(
                "SELECT * FROM surface_grants
                 WHERE owner_id = ? AND surface_id = ? AND grantee_id = ? AND status = 'pending'
                 ORDER BY requested_at DESC LIMIT 1",
                vec![json!(owner), json!(surface), json!(grantee)],
            )
            .await?;
        if let Some(existing) = existing {
            let mut pending = grant(&existing);
            // Asked again for more, the pending request grows to it, and its owner is told again.
            let mut held = normalized(pending.get("capabilities"));
            let before = held.len();
            held.extend(
                requested
                    .iter()
                    .filter(|c| !held.contains(c))
                    .cloned()
                    .collect::<Vec<_>>(),
            );
            if held.len() != before {
                self.central
                    .run(
                        "UPDATE surface_grants SET capabilities = ? WHERE grant_id = ?",
                        vec![json!(json!(held).to_string()), pending["grant_id"].clone()],
                    )
                    .await?;
                pending["capabilities"] = json!(held);
            }
            return Ok(Ok(Requested {
                grant: pending,
                reused: held.len() == before,
            }));
        }
        let grant_id = uuid::Uuid::new_v4().to_string();
        self.central
            .run(
                "INSERT INTO surface_grants (grant_id, owner_id, surface_id, grantee_id, capabilities, status, expires_at)
                 VALUES (?, ?, ?, ?, ?, 'pending', ?)",
                vec![json!(grant_id), json!(owner), json!(surface), json!(grantee),
                    json!(json!(requested).to_string()), expires_at],
            )
            .await?;
        let created = self.grant(&grant_id).await?.unwrap_or(JsonValue::Null);
        Ok(Ok(Requested {
            grant: created,
            reused: false,
        }))
    }

    /// Only the owner decides, and may grant less than was asked, never more. An accepted grant
    /// may end at `limits.expires_at`, or at its first use when `limits.once`.
    pub async fn decide(
        &self,
        grant_id: &str,
        owner: &str,
        accept: bool,
        capabilities: Option<&JsonValue>,
        limits: Limits,
    ) -> Result<Decided, String> {
        let (id, owner) = (js::trim(grant_id), js::trim(owner));
        let Some(mut grant) = self.grant(id).await? else {
            return Ok(Err("surface_grant_unknown".into()));
        };
        if text(&grant, "owner_id") != owner {
            return Ok(Err("surface_grant_not_owner".into()));
        }
        if grant["status"] != json!("pending") {
            return Ok(Err(format!(
                "surface_grant_already_{}",
                js::text(grant.get("status"))
            )));
        }
        if !accept {
            self.central
                .run(
                    "UPDATE surface_grants SET status = 'denied', decided_at = datetime('now') WHERE grant_id = ?",
                    vec![json!(id)],
                )
                .await?;
            grant["status"] = json!("denied");
            return Ok(Ok(grant));
        }
        let requested = normalized(grant.get("capabilities"));
        let approved = match capabilities {
            None => requested,
            Some(asked) => normalized(Some(asked))
                .into_iter()
                .filter(|capability| requested.contains(capability))
                .collect(),
        };
        if approved.is_empty() {
            return Ok(Err("surface_grant_capabilities_invalid".into()));
        }
        let expires_at = match limits.expires_at {
            None => grant["expires_at"].clone(),
            Some(at) if js::date(Some(&json!(at))).is_some() => json!(at),
            Some(_) => return Ok(Err("surface_grant_expires_invalid".into())),
        };
        self.central
            .run(
                "UPDATE surface_grants SET status = 'granted', decided_at = datetime('now'), capabilities = ?, expires_at = ?, once = ? WHERE grant_id = ?",
                vec![json!(json!(approved).to_string()), expires_at.clone(), json!(limits.once), json!(id)],
            )
            .await?;
        grant["status"] = json!("granted");
        grant["capabilities"] = json!(approved);
        grant["expires_at"] = expires_at;
        grant["once"] = json!(limits.once);
        Ok(Ok(grant))
    }

    /// Either party may end a grant: the grant, and who ended it (none when it already was).
    pub async fn revoke(
        &self,
        grant_id: &str,
        principal: &str,
    ) -> Result<Result<(JsonValue, Option<&'static str>), String>, String> {
        let (id, principal) = (js::trim(grant_id), js::trim(principal));
        let Some(mut grant) = self.grant(id).await? else {
            return Ok(Err("surface_grant_unknown".into()));
        };
        let owner = text(&grant, "owner_id") == principal;
        if !owner && text(&grant, "grantee_id") != principal {
            return Ok(Err("surface_grant_not_party".into()));
        }
        if grant["status"] == json!("revoked") {
            return Ok(Ok((grant, None)));
        }
        self.central
            .run(
                "UPDATE surface_grants SET status = 'revoked', revoked_at = datetime('now') WHERE grant_id = ?",
                vec![json!(id)],
            )
            .await?;
        grant["status"] = json!("revoked");
        Ok(Ok((grant, Some(if owner { "owner" } else { "grantee" }))))
    }

    /// The check every cross-account action goes through (`hasSurfaceCapability`): each of
    /// `capabilities` held by a live grant of `owner` to `grantee` on that surface. A grant given
    /// for one use is spent by this check, a lasting grant taking precedence; `Some` lists the
    /// grants it spent, `None` is a refusal. One transaction: two uses never share a single one.
    pub async fn use_capabilities(
        &self,
        owner: &str,
        surface: &str,
        grantee: &str,
        capabilities: &[&str],
    ) -> Result<Option<Vec<JsonValue>>, String> {
        let (owner, grantee) = (js::trim(owner).to_string(), js::trim(grantee).to_string());
        if owner.is_empty() || grantee.is_empty() {
            return Ok(None);
        }
        if owner == grantee {
            return Ok(Some(Vec::new()));
        }
        let needed: Vec<String> = capabilities
            .iter()
            .map(|capability| js::trim(capability).to_lowercase())
            .collect();
        if needed.is_empty() || needed.iter().any(|c| !KNOWN.contains(&c.as_str())) {
            return Ok(None);
        }
        let surface = js::trim(surface).to_string();
        self.central
            .transaction(move |db| {
                let mut statement = db
                    .prepare_cached(
                        "SELECT * FROM surface_grants
                         WHERE owner_id = ? AND surface_id = ? AND grantee_id = ? AND status = 'granted'",
                    )
                    .map_err(|e| e.to_string())?;
                let rows = statement
                    .query_map(rusqlite::params![owner, surface, grantee], row_json)
                    .map_err(|e| e.to_string())?
                    .collect::<rusqlite::Result<Vec<_>>>()
                    .map_err(|e| e.to_string())?;
                let now = atome_js_values::dates::now_ms();
                let held: Vec<JsonValue> = rows
                    .iter()
                    .map(grant)
                    .filter(|grant| live(grant, now))
                    .collect();
                let holding = |capability: &String, once: bool| {
                    held.iter().find(|grant| {
                        grant["once"] == json!(once)
                            && grant["capabilities"]
                                .as_array()
                                .is_some_and(|caps| caps.contains(&json!(capability)))
                    })
                };
                let mut spent: Vec<JsonValue> = Vec::new();
                for capability in &needed {
                    if holding(capability, false).is_some() {
                        continue;
                    }
                    let Some(once) = holding(capability, true) else {
                        return Ok(None);
                    };
                    if !spent.iter().any(|g| g["grant_id"] == once["grant_id"]) {
                        spent.push(once.clone());
                    }
                }
                for grant in &mut spent {
                    db.execute(
                        "UPDATE surface_grants SET status = 'revoked', revoked_at = datetime('now') WHERE grant_id = ?",
                        rusqlite::params![js::string(&grant["grant_id"])],
                    )
                    .map_err(|e| e.to_string())?;
                    grant["status"] = json!("revoked");
                }
                Ok(Some(spent))
            })
            .await
    }

    /// The pending and granted grants `principal` gave (`incoming`) or holds (`outgoing`).
    pub async fn list(&self, principal: &str, role: &JsonValue) -> Result<JsonValue, String> {
        let principal = js::trim(principal);
        if principal.is_empty() {
            return Ok(json!({ "incoming": [], "outgoing": [] }));
        }
        let side = |column: &str| {
            format!(
                "SELECT * FROM surface_grants WHERE {column} = ? AND status IN ('pending', 'granted') ORDER BY requested_at DESC"
            )
        };
        let mut lists = [Vec::new(), Vec::new()];
        for (index, (column, skipped)) in [("owner_id", "outgoing"), ("grantee_id", "incoming")]
            .into_iter()
            .enumerate()
        {
            if role != &json!(skipped) {
                let rows = self
                    .central
                    .all(side(column), vec![json!(principal)])
                    .await?;
                lists[index] = rows.iter().map(grant).collect();
            }
        }
        let [incoming, outgoing] = lists;
        Ok(json!({ "incoming": incoming, "outgoing": outgoing }))
    }
}
