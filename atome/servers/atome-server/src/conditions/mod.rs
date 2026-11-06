//! The `conditions` family of `/ws/api` (server/wsAtomeOperations.js `handleConditions` on
//! server/conditionsQueryAuthority.js and the condition engine of atome/src/squirrel/conditions/,
//! ported for the server's path; the browser keeps its JavaScript engine): `properties-discover`
//! lists the properties a condition can name on the asker's candidates, `once` answers the
//! candidates a condition set matches. The candidates are the asker's states as the vault
//! router lists them, each shown as its reader sees it (`readable`); the engine is pure and reads
//! them through [`States`], so a test can feed it fixed lists.
use crate::vault_router::VaultRouter;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::future::Future;

mod catalog;
mod computed;
mod discovery;
mod engine;
mod query;
mod registry;
mod values;

pub(crate) use registry::operator;

/// What a state shows its reader (ws_api's `readable`): `None` when it shows nothing.
pub type Readable = fn(&JsonValue, &str) -> Option<JsonValue>;

/// The states the engine reads, each already shown as its reader sees it.
pub trait States {
    /// The states the vault router lists with `options` (`{ ownerId, includeShared, excludeSystem,
    /// limit, project_id }`, as Fastify's `loadStates` built them).
    fn list(
        &self,
        options: JsonValue,
    ) -> impl Future<Output = Result<Vec<JsonValue>, String>> + Send;
    /// One state by its id, `null` when the reader has none.
    fn get(&self, id: &str) -> impl Future<Output = Result<JsonValue, String>> + Send;
}

struct RouterStates<'a> {
    router: &'a VaultRouter,
    principal: &'a str,
    readable: Readable,
}

impl States for RouterStates<'_> {
    async fn list(&self, options: JsonValue) -> Result<Vec<JsonValue>, String> {
        let states = self.router.list_states(self.principal, &options).await?;
        Ok(states
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|state| (self.readable)(state, self.principal))
            .collect())
    }

    async fn get(&self, id: &str) -> Result<JsonValue, String> {
        let state = self.router.get_state(self.principal, &json!(id)).await?;
        Ok((self.readable)(&state, self.principal).unwrap_or(JsonValue::Null))
    }
}

/// The reply fields of a `conditions` message of `principal` (`action` as `/ws/api` reads it);
/// `Err` is the error Fastify's `errorResponse` answered.
pub async fn answer(
    router: &VaultRouter,
    principal: &str,
    action: &str,
    message: &JsonValue,
    readable: Readable,
) -> Result<JsonValue, String> {
    let states = RouterStates {
        router,
        principal,
        readable,
    };
    answer_from(&states, principal, action, message).await
}

/// [`answer`] on any [`States`].
pub async fn answer_from(
    states: &impl States,
    principal: &str,
    action: &str,
    message: &JsonValue,
) -> Result<JsonValue, String> {
    let request = message
        .get("request")
        .filter(|request| request.is_object() || request.is_array())
        .unwrap_or(message);
    match action {
        "properties-discover" => discover(states, principal, request).await,
        "once" => query::once(states, principal, request).await,
        "" => Err("Unknown conditions action: missing".into()),
        _ => Err(format!("Unknown conditions action: {action}")),
    }
}

// `loadStates(scope, request)`: the states of the scope's project (else the request's), shared
// ones when asked, of the scope's types only (`types` as the scope holds them).
async fn load(
    states: &impl States,
    principal: &str,
    scope_project: Option<&JsonValue>,
    scope_shared: bool,
    types: Option<&JsonValue>,
    request: &JsonValue,
) -> Result<Vec<JsonValue>, String> {
    let at = |key: &str| values::get(Some(request), key);
    let project = [scope_project, at("projectId"), at("project_id")]
        .into_iter()
        .find(|value| js::truthy(*value))
        .flatten();
    let limit = at("candidateLimit").filter(|limit| js::truthy(Some(limit)));
    let options = json!({
        "ownerId": principal,
        "includeShared": scope_shared || at("includeShared") == Some(&JsonValue::Bool(true)),
        "excludeSystem": at("excludeSystem") == Some(&JsonValue::Bool(true)),
        "limit": limit.cloned().unwrap_or_else(|| json!(10000)),
        "project_id": project,
    });
    let listed = states.list(options).await?;
    let types: Vec<String> = match types {
        Some(JsonValue::Array(types)) => types
            .iter()
            .map(|entry| js::text(Some(entry)).to_lowercase())
            .collect(),
        Some(types) if js::truthy(Some(types)) => {
            return Err("(scope.types || []).map is not a function".into());
        }
        _ => Vec::new(),
    };
    if types.is_empty() {
        return Ok(listed);
    }
    Ok(listed
        .into_iter()
        .filter(|state| {
            let kind = js::first(state, &["type", "atome_type"]);
            types.contains(&values::key_text(kind).to_lowercase())
        })
        .collect())
}

// The rows the computed properties are hydrated from: every own state, as the service's `list`
// (`loadStates({ candidateSource: 'atome' }, { type, includeTotal })`) reads them.
async fn computed_rows(states: &impl States, principal: &str) -> Result<Vec<JsonValue>, String> {
    let request = json!({ "type": "condition_computed_property", "includeTotal": false });
    load(states, principal, None, false, None, &request).await
}

// The authority's `discover(request)`.
async fn discover(
    states: &impl States,
    principal: &str,
    request: &JsonValue,
) -> Result<JsonValue, String> {
    let empty = json!({});
    let scope = values::get(Some(request), "scope")
        .filter(|scope| js::truthy(Some(scope)))
        .unwrap_or(&empty);
    let at = |key: &str| values::get(Some(scope), key);
    let project = js::first(scope, &["projectId", "project_id"]);
    let shared = at("includeShared") == Some(&JsonValue::Bool(true));
    let candidates = load(states, principal, project, shared, at("types"), request).await?;
    let mut registry = registry::Registry::default();
    // Computed properties are one discovery provider among others: when their states cannot be
    // read or one does not normalise, the ones before it stay and the others are left out
    // (service.js `properties.discover`, fail closed), the candidates' properties still listed.
    if let Ok(rows) = computed_rows(states, principal).await {
        computed::hydrate(&mut registry, &rows).ok();
    }
    let default_source = js::first(scope, &["candidateSource", "candidate_source"])
        .cloned()
        .unwrap_or_else(|| json!("atome"));
    let source = values::get(Some(request), "source")
        .cloned()
        .unwrap_or(default_source);
    let search = values::plain_text(values::get(Some(request), "search"));
    let preferred = values::get(Some(request), "preferred");
    let items = discovery::discover(&registry, &candidates, &source, &search, preferred)?;
    Ok(json!({ "items": items.iter().map(discovery::Descriptor::to_json).collect::<Vec<_>>() }))
}
