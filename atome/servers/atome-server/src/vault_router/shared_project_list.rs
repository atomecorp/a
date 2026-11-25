// A project another account shares with this one, listed by its id (R-202, R-349): its Atomes live in the sharer's
// vault, so a list scoped to it reads them there, exactly as `get_state` reads one of them — what the share reaches,
// as the share shows it. Without this, a recipient who opened the project saw none of its objects, and its views
// (List, Matrix, Timeline playback) listed nothing.
use super::VaultRouter;
use super::js::{self, first};
use super::shares;
use serde_json::Value as JsonValue;

impl VaultRouter {
    /// The page of `options` (project, type, system filters; `offset`, `limit`) when its `project_id` is a project of
    /// another account shared with `principal`; `None` when it is the principal's own, unknown, or not shared.
    pub(super) async fn shared_project_states(
        &self,
        principal: &str,
        options: &JsonValue,
    ) -> Result<Option<Vec<JsonValue>>, String> {
        let project = js::id(first(options, &["project_id", "projectId"]));
        if project.is_empty() {
            return Ok(None);
        }
        let Some(owner) = self.owner_of(&project).await? else {
            return Ok(None);
        };
        if owner == principal {
            return Ok(None);
        }
        let share = match self
            .share_for_atome(principal, &project, Some(owner.clone()))
            .await
        {
            Ok(Some(share)) => share,
            Ok(None) => return Ok(None),
            // Listened only (« Écoute »): the project and its proxy alone, as the share's own listing gives them.
            Err(error) if error == shares::LISTEN_ONLY => return Ok(None),
            Err(error) => return Err(error),
        };
        let root = js::string(&share["atome_id"]);
        let states: Vec<JsonValue> = self
            .states_within_shared_root(&owner, &root)
            .await?
            .into_iter()
            .filter(|state| {
                shares::reaches(&share, state) && shares::matches_list_scope(state, options)
            })
            .map(|state| shares::project_shared_state(&state, &share))
            .collect();
        let limit = js::number_or(options.get("limit"), 1000.0).clamp(1.0, 10000.0) as usize;
        let offset = js::number_or(options.get("offset"), 0.0).max(0.0) as usize;
        Ok(Some(states.into_iter().skip(offset).take(limit).collect()))
    }
}
