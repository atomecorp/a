// Inviting to a room and planning one (server/visio_commands.js `invite` and `schedule`, ported):
// an account reached by id or by number, through the one peer-to-peer verdict (a number without
// an account answers like a contact not yet accepted, D4), five invited at most. A placed call
// (`managed`) rings its target, or turns to a recording at once when the target is offline or
// does not want to be disturbed; an invitation and a planned room are told through the
// notification stack (social/live.rs `Notifier`).
use super::Visio;
use super::calls::{now, text};
use crate::social::contract::CALL_RING_TIMEOUT_MS;
use crate::vault_router::{VaultRouter, js};
use serde_json::{Value as JsonValue, json};

impl Visio {
    /// The person may be called now: a live connection, else a device a VoIP push reaches.
    async fn online(&self, user: &str) -> Result<bool, String> {
        Ok(crate::social::live::present(user) || self.social.push.available(user).await?)
    }

    // `preferences.notifications.do_not_disturb` of the person's own profile.
    async fn do_not_disturb(&self, router: &VaultRouter, user: &str) -> Result<bool, String> {
        let state = router.get_state(user, &json!(user)).await?;
        let profile = match state.pointer("/properties/eve_profile") {
            Some(JsonValue::String(text)) => {
                serde_json::from_str(text).map_err(|e| e.to_string())?
            }
            Some(profile) => profile.clone(),
            None => JsonValue::Null,
        };
        Ok(profile.pointer("/preferences/notifications/do_not_disturb") == Some(&json!(true)))
    }

    /// `invite(userId, meta, target, managed, vaultRouter, scheduled)`.
    pub(super) async fn invite(
        &'static self,
        user: &str,
        room_id: &str,
        target: Option<&JsonValue>,
        managed: bool,
        router: Option<&VaultRouter>,
        scheduled: bool,
    ) -> Result<JsonValue, String> {
        let candidate = match target {
            Some(JsonValue::Null) => {
                return Err("Cannot read properties of null (reading 'id')".into());
            }
            Some(candidate @ (JsonValue::Object(_) | JsonValue::Array(_))) => candidate.clone(),
            Some(id) => json!({ "id": id }),
            None => json!({}),
        };
        let id = js::first(&candidate, &["id", "userId"]).map(js::string);
        let number = js::first(&candidate, &["phone"]).map(js::string);
        let Some(target) = self.account(id, number).await? else {
            return Err("contact_required".into());
        };
        if target == user {
            return Err("visio_target_unavailable".into());
        }
        let verdict = self.verdict(user, &target).await?;
        let silent = verdict["silent"] == true;
        if verdict["ok"] != true && !silent {
            return Err(js::first(&verdict, &["error"])
                .map_or_else(|| "contact_required".into(), js::string));
        }
        {
            let mut state = self.state();
            let meta = state.metas.get_mut(room_id).expect("room");
            if meta.invites.len() >= 5 && !meta.invites.contains(&target) {
                return Err("room_full".into());
            }
            if managed {
                meta.call_target = Some(target.clone());
                meta.call_status = Some("ringing".into());
                meta.expires_at = Some(now() + CALL_RING_TIMEOUT_MS);
            }
            if !silent {
                meta.invites.insert(target.clone());
                if !scheduled && !managed {
                    meta.expires_at = Some(now() + CALL_RING_TIMEOUT_MS);
                }
            }
            if managed {
                state
                    .timers
                    .insert(room_id.to_string(), self.ring_timer(room_id));
            }
        }
        if !silent {
            if let Some(router) = router.filter(|_| managed) {
                let do_not_disturb = self.do_not_disturb(router, &target).await?;
                if !self.online(&target).await? || do_not_disturb {
                    return Ok(self.finish(room_id, "recording").await);
                }
            }
            if !scheduled {
                let notice = {
                    let state = self.state();
                    let meta = &state.metas[room_id];
                    json!({ "kind": "call-invitation", "message": meta.name,
                        "extra": { "room_id": room_id, "call_mode": meta.call_mode.as_deref().unwrap_or("visio"),
                            "expires_at": meta.expires_at } })
                };
                self.social
                    .notifier
                    .notify(&target, Some(user), &notice)
                    .await?;
            }
        }
        if !managed {
            return Ok(self.state().metas[room_id].snapshot());
        }
        let announced = self.announce(&self.state().metas[room_id]);
        Ok(self.publish(announced).await)
    }

    /// `schedule`: a planned room, its participants invited without ringing, kept in
    /// `visio_rooms`, each told.
    pub(super) async fn schedule(
        &'static self,
        user: &str,
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        let starts = js::date(input.get("start"));
        let ends = match js::truthy(input.get("end")) {
            true => Some(js::date(input.get("end"))),
            false => None,
        };
        let (Some(starts), Some(ends)) = (starts, ends.map_or(Some(None), |end| end.map(Some)))
        else {
            return Err("invalid_schedule".into());
        };
        if ends.is_some_and(|ends| ends < starts) {
            return Err("invalid_schedule".into());
        }
        let participants = match input.get("participants") {
            Some(JsonValue::Array(items)) if !items.is_empty() && items.len() <= 5 => items,
            _ => return Err("participants_required".into()),
        };
        let room_id =
            self.create_meta(user, text(input, "title").unwrap_or_else(|| "Visio".into()));
        let (starts_at, ends_at) = (
            json!(js::iso(starts)),
            ends.map_or(JsonValue::Null, |ends| json!(js::iso(ends))),
        );
        {
            let mut state = self.state();
            let meta = state.metas.get_mut(&room_id).expect("created room");
            meta.starts_at = Some(starts_at.clone());
            meta.ends_at = Some(ends_at.clone());
        }
        for target in participants {
            self.invite(user, &room_id, Some(target), false, None, true)
                .await?;
        }
        self.save_scheduled(&room_id).await?;
        let (name, invited): (String, Vec<String>) = {
            let state = self.state();
            let meta = &state.metas[&room_id];
            (meta.name.clone(), meta.invites.iter().cloned().collect())
        };
        for person in &invited {
            let notice = json!({ "kind": "call-scheduled", "message": name,
                "extra": { "room_id": room_id, "starts_at": starts_at, "ends_at": ends_at } });
            self.social
                .notifier
                .notify(person, Some(user), &notice)
                .await?;
        }
        Ok(
            json!({ "roomId": room_id, "startsAt": starts_at, "endsAt": ends_at, "invited": invited }),
        )
    }
}
