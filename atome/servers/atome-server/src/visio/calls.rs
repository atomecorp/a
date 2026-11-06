// The calls of a room (server/visio_commands.js `createVisioCommands`, ported): `create`,
// `schedule`, `invite`, `state`, `accept`, `decline`, `cancel`, and a call's end when its caller or
// callee leaves (`peerLeft`). A planned room, with no status of its own, is a live call
// (`Meta::status`). A call rings for CALL_RING_TIMEOUT_MS, then turns to a recording; no await
// separates a status check from its transition (the state's lock spans both).
use super::Visio;
use super::state::{self, Meta};
use crate::social::contract::{CALL_RING_TIMEOUT_MS, call_mode};
use crate::social::push::Audience;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

pub(super) fn now() -> i64 {
    crate::auth::now_ms() as i64
}

pub(super) fn text(input: &JsonValue, key: &str) -> Option<String> {
    js::first(input, &[key]).map(js::string)
}

impl Visio {
    /// `announce`: the call's state to its owner and every invited account; the state.
    pub(super) fn announce(&self, meta: &Meta) -> (JsonValue, Vec<String>) {
        let state = meta.snapshot();
        let people = meta
            .owner
            .iter()
            .chain(meta.invites.iter())
            .cloned()
            .collect();
        (state, people)
    }

    /// `publish` of an announced state: to each person's live connections, then (once it neither
    /// prepares nor rings) to their devices.
    pub(super) async fn publish(&self, (state, people): (JsonValue, Vec<String>)) -> JsonValue {
        let mut data = json!({ "type": "callState" });
        if let (Some(data), Some(fields)) = (data.as_object_mut(), state.as_object()) {
            data.extend(fields.clone());
        }
        let room_id = js::string(&state["roomId"]);
        let status = js::string(&state["status"]);
        for person in people {
            crate::social::live::tell(&person, &state::event(Some(&room_id), data.clone())).await;
            if status == "ringing" || status == "preparing" {
                continue;
            }
            let mut item = data.clone();
            item["kind"] = json!("call-state");
            item["room_id"] = json!(room_id);
            let key = state["acceptedKeyId"].as_str().unwrap_or_default();
            item["id"] = json!(format!("call-state:{room_id}:{status}:{key}"));
            let push = self.social.push.clone();
            tokio::spawn(async move {
                match push.deliver(&person, &item, &Audience::default()).await {
                    Ok(result) if result["ok"] == true => {}
                    _ => eprintln!("[visio] Android call state push unavailable"),
                }
            });
        }
        state
    }

    /// `finishRinging`: a ringing call turned to `status`, announced; any other call as it is.
    fn finish_ringing(
        &self,
        meta: &mut Meta,
        status: &str,
        timers: &mut std::collections::HashMap<String, tokio::task::AbortHandle>,
    ) -> Result<(JsonValue, Vec<String>), JsonValue> {
        if !meta.status_is("ringing") {
            return Err(meta.snapshot());
        }
        meta.call_status = Some(status.into());
        if let Some(timer) = timers.remove(&meta.room_id) {
            timer.abort();
        }
        Ok(self.announce(meta))
    }

    // `finishRinging` under the state's lock, then its announce published.
    pub(super) async fn finish(&self, room_id: &str, status: &str) -> JsonValue {
        let outcome = {
            let mut guard = self.state();
            let state = &mut *guard;
            match state.metas.get_mut(room_id) {
                Some(meta) => self.finish_ringing(meta, status, &mut state.timers),
                None => return JsonValue::Null,
            }
        };
        match outcome {
            Ok(announced) => self.publish(announced).await,
            Err(snapshot) => snapshot,
        }
    }

    /// `metaFor`: a room the caller owns or is invited to.
    async fn member(&self, user: &str, input: &JsonValue) -> Result<String, String> {
        let room_id = text(input, "roomId").unwrap_or_default();
        let known = self.resolve_meta(&room_id).await?;
        let state = self.state();
        match state.metas.get(&room_id) {
            Some(meta) if known && (meta.owned_by(user) || meta.invites.contains(user)) => {
                Ok(room_id)
            }
            _ => Err("visio_room_denied".into()),
        }
    }

    pub(super) fn create_meta(&self, owner: &str, name: String) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.state()
            .metas
            .insert(id.clone(), Meta::new(&id, Some(owner.into()), Some(name)));
        id
    }

    /// One room command for `user`; `input.deviceKey` is the connection's device key.
    pub(super) async fn command(
        &'static self,
        user: &str,
        action: &str,
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        if action == "create" {
            let mode = call_mode(js::first(input, &["mode"]).unwrap_or(&json!("visio")))?;
            let id = self.create_meta(user, text(input, "name").unwrap_or_else(|| "Visio".into()));
            let mut state = self.state();
            let meta = state.metas.get_mut(&id).expect("created room");
            meta.call_mode = Some(mode);
            meta.call_status = Some(
                if input.get("messageOnMiss") == Some(&json!(true)) {
                    "preparing"
                } else {
                    "live"
                }
                .into(),
            );
            return Ok(meta.snapshot());
        }
        if action == "schedule" {
            return self.schedule(user, input).await;
        }
        let room_id = self.member(user, input).await?;
        let status = self.state().metas[&room_id].status().to_string();
        match action {
            "invite" => {
                let owner = self.state().metas[&room_id].owned_by(user);
                if status == "preparing" && owner {
                    return self
                        .invite(
                            user,
                            &room_id,
                            input.get("target"),
                            true,
                            Some(&self.router),
                            false,
                        )
                        .await;
                }
                if status != "live" {
                    return Err("visio_call_ended".into());
                }
                self.invite(user, &room_id, input.get("target"), false, None, false)
                    .await
            }
            "state" => {
                let expires_at = self.state().metas[&room_id].expires_at;
                let expired = status == "ringing" && expires_at.is_some_and(|at| now() >= at);
                if expired {
                    self.finish(&room_id, "recording").await;
                }
                Ok(self.state().metas[&room_id].snapshot())
            }
            "accept" => self.accept(user, &room_id, input).await,
            "decline" => {
                if self.state().metas[&room_id].owned_by(user) {
                    return Err("visio_decline_denied".into());
                }
                if status == "ringing" {
                    return Ok(self.finish(&room_id, "recording").await);
                }
                let reason = text(input, "reason").unwrap_or_else(|| "declined".into());
                let owner = self.state().metas[&room_id]
                    .owner
                    .clone()
                    .unwrap_or_default();
                let notice = json!({ "kind": "call-declined", "message": reason,
                    "extra": { "room_id": room_id, "reason": reason } });
                self.social
                    .notifier
                    .notify(&owner, Some(user), &notice)
                    .await?;
                Ok(self.state().metas[&room_id].snapshot())
            }
            "cancel" => {
                let (announced, frames) = {
                    let mut state = self.state();
                    if !state.metas[&room_id].owned_by(user) {
                        return Err("visio_cancel_denied".into());
                    }
                    if let Some(timer) = state.timers.remove(&room_id) {
                        timer.abort();
                    }
                    state.metas.get_mut(&room_id).expect("room").call_status =
                        Some("cancelled".into());
                    let frames = state.close_room(&room_id);
                    (self.announce(&state.metas[&room_id]), frames)
                };
                state::send(frames).await;
                Ok(self.publish(announced).await)
            }
            _ => Err("visio_action_unsupported".into()),
        }
    }

    async fn accept(
        &self,
        user: &str,
        room_id: &str,
        input: &JsonValue,
    ) -> Result<JsonValue, String> {
        let expired = {
            let mut state = self.state();
            let meta = state.metas.get_mut(room_id).expect("room");
            if meta.owned_by(user) {
                return Err("visio_accept_denied".into());
            }
            let devices = meta.accepted_devices.get_or_insert_default();
            let key = input
                .get("deviceKey")
                .and_then(JsonValue::as_str)
                .filter(|key| !key.is_empty());
            let Some(key) = key else {
                return Err("visio_device_session_required".into());
            };
            if devices.get(user).is_some_and(|held| held != key) {
                return Err("visio_answered_elsewhere".into());
            }
            meta.status_is("ringing") && meta.expires_at.is_some_and(|at| now() >= at)
        };
        if expired {
            self.finish(room_id, "recording").await;
        }
        let key = js::string(&input["deviceKey"]);
        let announced = {
            let mut guard = self.state();
            let state = &mut *guard;
            let meta = state.metas.get_mut(room_id).expect("room");
            let ringing = meta.status_is("ringing");
            if !ringing && !meta.status_is("live") {
                return Err("visio_call_ended".into());
            }
            meta.accepted_devices
                .get_or_insert_default()
                .insert(user.into(), key.clone());
            meta.accepted_principal = Some(user.into());
            meta.accepted_key = Some(key);
            if ringing {
                self.finish_ringing(meta, "live", &mut state.timers)
                    .map_err(|_| "visio_call_ended".to_string())?
            } else {
                self.announce(meta)
            }
        };
        Ok(self.publish(announced).await)
    }

    /// `peerLeft`: a placed call ends when its caller or callee leaves it.
    pub(super) async fn peer_left(&self, room_id: &str, user: &str) {
        let (announced, frames) = {
            let mut state = self.state();
            let Some(meta) = state.metas.get_mut(room_id) else {
                return;
            };
            let party = meta.owned_by(user) || meta.call_target.as_deref() == Some(user);
            if meta.call_target.is_none() || !meta.status_is("live") || !party {
                return;
            }
            meta.call_status = Some("cancelled".into());
            if let Some(timer) = state.timers.remove(room_id) {
                timer.abort();
            }
            let frames = state.close_room(room_id);
            (self.announce(&state.metas[room_id]), frames)
        };
        state::send(frames).await;
        self.publish(announced).await;
    }

    /// The ringing call's own end, once CALL_RING_TIMEOUT_MS passed.
    pub(super) fn ring_timer(&'static self, room_id: &str) -> tokio::task::AbortHandle {
        let room_id = room_id.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(
                CALL_RING_TIMEOUT_MS as u64,
            ))
            .await;
            // Its own handle goes first: aborting it would stop this very task mid-announce.
            self.state().timers.remove(&room_id);
            self.finish(&room_id, "recording").await;
        })
        .abort_handle()
    }
}
