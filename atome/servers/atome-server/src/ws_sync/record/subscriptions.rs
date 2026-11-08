// A connection's subscriptions: a subscription batch (heads read in bulk, the streams behind
// them replayed), the replay of one stream or of the directory, acks and cursors.
use super::*;

impl Record {
    pub(super) fn subscribe_to(&self, stream: &str, cursor: u64) {
        self.state().subscriptions.insert(
            stream.to_string(),
            Subscription {
                cursor,
                acked: cursor,
            },
        );
    }

    pub(super) async fn subscribe(
        &self,
        runtime: &SyncRuntime,
        message: &JsonValue,
    ) -> Result<(), String> {
        if let Some(entries) = message.get("streams").and_then(JsonValue::as_array) {
            return self
                .subscribe_batch(runtime, entries, message.get("subscription_id"))
                .await;
        }
        let stream = stream_of(message);
        if stream.is_empty() {
            self.send(error("stream_required"));
            return Ok(());
        }
        if self.state().source.is_none() {
            self.send(error("register_required"));
            return Ok(());
        }
        let directory = stream == DIRECTORY_STREAM;
        if !directory && !self.access(runtime, &stream).await? {
            self.send(json!({ "type": "error", "code": "stream_access_denied", "stream": stream }));
            return Ok(());
        }
        let cursor = cursor_of(message.get("cursor"));
        self.subscribe_to(&stream, cursor);
        self.send(json!({ "type": "subscribed", "stream": stream, "cursor": cursor }));
        if directory {
            self.replay_directory(runtime, true).await?;
        } else {
            self.replay(runtime, &stream, true).await?;
        }
        Ok(())
    }

    // A reconnection subscribes every stream it holds, thousands of them: access and heads
    // are read in bulk, only the streams behind their head are replayed, and one
    // `replay-complete` lists those streams.
    async fn subscribe_batch(
        &self,
        runtime: &SyncRuntime,
        entries: &[JsonValue],
        subscription_id: Option<&JsonValue>,
    ) -> Result<(), String> {
        if let Some(id) = subscription_id {
            let valid = matches!(id, JsonValue::String(id) if !id.is_empty() && id.encode_utf16().count() <= 128);
            if !valid {
                self.send(error("subscription_id_invalid"));
                return Ok(());
            }
        }
        if self.state().source.is_none() {
            self.send(error("register_required"));
            return Ok(());
        }
        if entries.len() > SUBSCRIBE_BATCH_LIMIT {
            self.send(json!({ "type": "error", "code": "subscribe_batch_too_large", "limit": SUBSCRIBE_BATCH_LIMIT }));
            return Ok(());
        }
        let mut cursors: IndexMap<String, u64> = IndexMap::new();
        for entry in entries {
            let stream = stream_of(entry);
            if !stream.is_empty() {
                cursors.insert(stream, cursor_of(entry.get("cursor")));
            }
        }
        let directory_cursor = cursors.shift_remove(DIRECTORY_STREAM);
        let pairs = runtime
            .router
            .service(
                "router:stream-heads",
                &json!({ "principal_id": self.principal(), "stream_ids": cursors.keys().collect::<Vec<_>>() }),
            )
            .await?;
        let heads: IndexMap<String, f64> = pairs
            .as_array()
            .into_iter()
            .flatten()
            .map(|pair| (js::string(&pair[0]), js::number(pair.get(1))))
            .collect();
        let mut denied = Vec::new();
        for (stream, cursor) in &cursors {
            if heads.contains_key(stream) {
                self.subscribe_to(stream, *cursor);
            } else {
                denied.push(stream.clone());
            }
        }
        if !denied.is_empty() {
            self.send(
                json!({ "type": "error", "code": "stream_access_denied", "streams": denied }),
            );
        }
        let mut replayed = Vec::new();
        let mut settled = Vec::new();
        if let Some(cursor) = directory_cursor {
            self.subscribe_to(DIRECTORY_STREAM, cursor);
            if let Some(reached) = self.replay_directory(runtime, false).await? {
                replayed.push(json!({ "stream": DIRECTORY_STREAM, "cursor": reached }));
                settled.push(json!({ "stream": DIRECTORY_STREAM, "cursor": reached }));
            }
        }
        let mut behind = IndexMap::new();
        for (stream, cursor) in &cursors {
            let Some(head) = heads.get(stream) else {
                continue;
            };
            if *head <= *cursor as f64 {
                let cursor = js::number_json(head.min(*cursor as f64));
                settled.push(json!({ "stream": stream, "cursor": cursor }));
            } else {
                behind.insert(stream.clone(), *head);
            }
        }
        for stream in self.replay_own(runtime, &behind).await? {
            if self.is_closed() {
                return Ok(());
            }
            self.replay(runtime, &stream, false).await?;
        }
        for stream in behind.keys() {
            if let Some(reached) = self.state().subscriptions.get(stream).map(|s| s.cursor) {
                replayed.push(json!({ "stream": stream, "cursor": reached }));
                settled.push(json!({ "stream": stream, "cursor": reached }));
            }
        }
        if !self.is_closed() {
            let mut complete = json!({ "type": "replay-complete", "streams": replayed });
            if let Some(id) = subscription_id {
                complete["subscription_id"] = id.clone();
                complete["settled_streams"] = json!(settled);
            }
            self.send(complete);
        }
        Ok(())
    }

    // A batch's streams behind their head, replayed together: a restore subscribes tens of
    // thousands of streams of a few events each, and the vault answers one request at a time.
    // The principal's own streams go in pages across the batch (access is read again for
    // every page); the others (shared) are given back for a replay of their own.
    async fn replay_own(
        &self,
        runtime: &SyncRuntime,
        behind: &IndexMap<String, f64>,
    ) -> Result<Vec<String>, String> {
        let mut own = behind.clone();
        let mut others = Vec::new();
        while !own.is_empty() && !self.is_closed() {
            let pairs: Vec<JsonValue> = {
                let state = self.state();
                own.retain(|stream, _| state.subscriptions.contains_key(stream));
                own.keys()
                    .map(|stream| json!([stream, state.subscriptions[stream].cursor]))
                    .collect()
            };
            let page = runtime
                .router
                .service(
                    "router:own-streams-events",
                    &json!({ "principal_id": self.principal(), "streams": pairs }),
                )
                .await?;
            for stream in page["others"].as_array().into_iter().flatten() {
                let stream = js::string(stream);
                own.shift_remove(&stream);
                others.push(stream);
            }
            let events = page["events"].as_array().cloned().unwrap_or_default();
            if events.is_empty() {
                break;
            }
            for event in &events {
                let stream = js::string(&event["stream_id"]);
                if !self.state().subscriptions.contains_key(&stream) {
                    continue;
                }
                self.send(envelope(event, true));
                let cursor = self.advance(&stream, js::number(event.get("sequence")));
                if own.get(&stream).is_some_and(|head| cursor as f64 >= *head) {
                    own.shift_remove(&stream);
                }
            }
        }
        Ok(others)
    }

    pub(super) fn ack(&self, message: &JsonValue) {
        let stream = stream_of(message);
        let sequence = match message.get("sequence") {
            None | Some(JsonValue::Null) => cursor_of(message.get("cursor")),
            sequence => cursor_of(sequence),
        };
        let acked = {
            let mut state = self.state();
            state.subscriptions.get_mut(&stream).map(|subscription| {
                subscription.acked = subscription.acked.max(sequence.min(subscription.cursor));
                subscription.acked
            })
        };
        match acked {
            Some(acked) => {
                self.send(json!({ "type": "acked", "stream": stream, "sequence": acked }))
            }
            None => self.send(
                json!({ "type": "error", "code": "subscription_required", "stream": stream }),
            ),
        }
    }

    // The cursor a sent event moves to: never back, a published event having moved it on meanwhile.
    pub(super) fn advance(&self, stream: &str, sequence: f64) -> u64 {
        let mut state = self.state();
        match state.subscriptions.get_mut(stream) {
            Some(subscription) => {
                if sequence > subscription.cursor as f64 {
                    subscription.cursor = sequence as u64;
                }
                subscription.cursor
            }
            None => sequence.max(0.0) as u64,
        }
    }

    /// The cursor reached, or None when the stream was revoked or the connection closed.
    pub(in crate::ws_sync) async fn replay(
        &self,
        runtime: &SyncRuntime,
        stream: &str,
        announce: bool,
    ) -> Result<Option<u64>, String> {
        let Some(mut cursor) = self.state().subscriptions.get(stream).map(|s| s.cursor) else {
            return Ok(None);
        };
        while !self.is_closed() {
            if !self.access(runtime, stream).await? {
                self.revoke(stream);
                return Ok(None);
            }
            if let Some(current) = self.state().subscriptions.get(stream) {
                cursor = current.cursor;
            }
            let events = runtime
                .router
                .service(
                    "router:stream-events",
                    &json!({ "principal_id": self.principal(), "stream_id": stream,
                        "options": { "cursor": cursor, "limit": REPLAY_PAGE } }),
                )
                .await?;
            let events = events.as_array().cloned().unwrap_or_default();
            if events.is_empty() {
                break;
            }
            // The page was read under that access; a revocation meanwhile reaches the
            // subscriptions (`revoke_stream`) and stops the page there.
            for event in &events {
                if !self.state().subscriptions.contains_key(stream) {
                    return Ok(None);
                }
                self.send(envelope(event, true));
                cursor = self.advance(stream, js::number(event.get("sequence")));
            }
            // A batch is also bounded in bytes by the vault: a short one is not the end.
        }
        if self.is_closed() {
            return Ok(None);
        }
        if announce {
            self.send(json!({ "type": "replay-complete", "stream": stream, "cursor": cursor }));
        }
        Ok(Some(cursor))
    }

    async fn replay_directory(
        &self,
        runtime: &SyncRuntime,
        announce: bool,
    ) -> Result<Option<u64>, String> {
        let Some(mut cursor) = self
            .state()
            .subscriptions
            .get(DIRECTORY_STREAM)
            .map(|s| s.cursor)
        else {
            return Ok(None);
        };
        let events =
            crate::social::directory::events(runtime.router.central(), cursor, DIRECTORY_PAGE)
                .await?;
        for event in &events {
            self.send(envelope(event, true));
            cursor = self.advance(DIRECTORY_STREAM, js::number(event.get("sequence")));
        }
        if announce {
            self.send(
                json!({ "type": "replay-complete", "stream": DIRECTORY_STREAM, "cursor": cursor }),
            );
        }
        Ok(Some(cursor))
    }
}
