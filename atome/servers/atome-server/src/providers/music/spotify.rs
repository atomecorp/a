// Spotify's Web API (server/music/spotify_operations.js, ported): the player read and driven, a
// page of the person's items, and the three writes, each verified by reading it back.
use super::Mf;
use super::session::Session;
use crate::providers::generation::round;
use crate::providers::http::form;
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

fn shaped_id(value: Option<&JsonValue>) -> bool {
    let id = value
        .filter(|v| js::truthy(Some(v)))
        .map(js::string)
        .unwrap_or_default();
    (1..=100).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_alphanumeric())
}

/// `musicArtworkUrl`: an https cover only.
pub fn artwork(value: Option<&JsonValue>) -> Option<String> {
    let url = value?.as_str()?;
    let rest = url.strip_prefix("https://")?;
    ((1..=2000).contains(&rest.chars().count()) && !rest.chars().any(char::is_whitespace))
        .then(|| url.to_string())
}

/// `musicItem`: a track, artist or playlist as the canonical item, else none.
pub fn item(value: &JsonValue) -> Option<JsonValue> {
    let kind = value
        .get("type")
        .and_then(JsonValue::as_str)
        .filter(|k| ["track", "artist", "playlist"].contains(k))?;
    if !shaped_id(value.get("id")) || !value.get("name").is_some_and(JsonValue::is_string) {
        return None;
    }
    let images = if kind == "track" {
        value.pointer("/album/images")
    } else {
        value.get("images")
    };
    let cover = artwork(
        images
            .and_then(|images| images.get(0))
            .and_then(|image| image.get("url")),
    );
    let duration = js::number(value.get("duration_ms")) / 1000.0;
    let mut out = JsonMap::new();
    out.insert("id".into(), value["id"].clone());
    out.insert("name".into(), value["name"].clone());
    out.insert(
        "kind".into(),
        json!(if kind == "track" { "song" } else { kind }),
    );
    if let Some(artists) = value.get("artists").and_then(JsonValue::as_array) {
        let names: Vec<String> = artists
            .iter()
            .map(|artist| {
                artist
                    .get("name")
                    .filter(|n| !n.is_null())
                    .map(|n| js::text(Some(n)))
                    .unwrap_or_default()
            })
            .collect();
        out.insert("artist".into(), json!(names.join(", ")));
    }
    if let Some(cover) = cover {
        out.insert("artwork_url".into(), json!(cover));
    }
    if duration > 0.0 {
        out.insert("duration".into(), js::number_json(duration));
    }
    Some(JsonValue::Object(out))
}

fn page(input: &JsonValue) -> Vec<(String, String)> {
    let or = |field: &str, default: i64| {
        input
            .get(field)
            .filter(|v| js::truthy(Some(v)))
            .map(js::string)
            .unwrap_or_else(|| default.to_string())
    };
    vec![
        ("limit".into(), or("limit", 10)),
        ("offset".into(), or("offset", 0)),
    ]
}

fn has_more(result: &JsonValue) -> bool {
    result
        .get("next")
        .and_then(JsonValue::as_str)
        .is_some_and(|next| !next.is_empty())
}

/// `readSpotify`: the player's state, the devices, or a page of items.
pub async fn read(
    session: &Session<'_>,
    record: &JsonValue,
    action: &str,
    input: &JsonValue,
) -> Result<JsonValue, Mf> {
    if action == "get_state" {
        let state = session.get(record, "/me/player").await?;
        let playing = state.get("is_playing") == Some(&json!(true));
        let mut out = json!({ "playback": if playing { "playing" } else if js::truthy(Some(&state)) { "paused" } else { "stopped" },
            "current_song": if state.pointer("/item/type") == Some(&json!("track")) { item(&state["item"]) } else { None } });
        let progress = js::number(state.get("progress_ms"));
        if progress >= 0.0 && js::truthy(state.get("item")) {
            out["position"] = js::number_json(progress / 1000.0);
        }
        out["shuffle"] = json!(state.get("shuffle_state") == Some(&json!(true)));
        out["device"] = match state.get("device").filter(|d| js::truthy(Some(d))) {
            Some(device) => json!({ "id": device.get("id"), "name": device.get("name"),
                "restricted": device.get("is_restricted") == Some(&json!(true)) }),
            None => JsonValue::Null,
        };
        return Ok(out);
    }
    if action == "devices" {
        let result = session.get(record, "/me/player/devices").await?;
        let devices = result
            .get("devices")
            .and_then(JsonValue::as_array)
            .cloned()
            .unwrap_or_default();
        let items: Vec<JsonValue> = devices.iter().map(|device| json!({ "id": device.get("id"), "name": device.get("name"),
            "active": device.get("is_active") == Some(&json!(true)), "restricted": device.get("is_restricted") == Some(&json!(true)) })).collect();
        return Ok(json!({ "items": items }));
    }
    let (result, values) = match action {
        "search" => {
            let kind = input
                .get("kind")
                .filter(|k| js::truthy(Some(k)))
                .map(js::string);
            let kind = match kind.as_deref() {
                None | Some("song") => "track".to_string(),
                Some(other) => other.to_string(),
            };
            let mut pairs = vec![
                ("q".to_string(), js::text(input.get("query"))),
                ("type".to_string(), kind.clone()),
            ];
            pairs.extend(page(input));
            let found = session
                .get(record, &format!("/search?{}", form(&pairs)))
                .await?;
            let result = found
                .get(format!("{kind}s"))
                .cloned()
                .unwrap_or(JsonValue::Null);
            let values = result.get("items").cloned();
            (result, values)
        }
        "list_library" => {
            let result = session
                .get(record, &format!("/me/tracks?{}", form(&page(input))))
                .await?;
            let values = result
                .get("items")
                .and_then(JsonValue::as_array)
                .map(|items| {
                    json!(
                        items
                            .iter()
                            .map(|e| e.get("track").cloned().unwrap_or(JsonValue::Null))
                            .collect::<Vec<_>>()
                    )
                });
            (result, values)
        }
        "list_playlists" => {
            let result = session
                .get(record, &format!("/me/playlists?{}", form(&page(input))))
                .await?;
            let values = result.get("items").cloned();
            (result, values)
        }
        "playlist_tracks" => {
            let path = format!(
                "/playlists/{}/items?{}",
                js::text(input.get("id")),
                form(&page(input))
            );
            let result = session.get(record, &path).await?;
            let values = result
                .get("items")
                .and_then(JsonValue::as_array)
                .map(|items| {
                    json!(
                        items
                            .iter()
                            .map(|e| e.get("item").cloned().unwrap_or(JsonValue::Null))
                            .collect::<Vec<_>>()
                    )
                });
            (result, values)
        }
        _ => return Err(Mf::new("INVALID_ARGUMENT")),
    };
    let Some(JsonValue::Array(values)) = values.filter(|_| js::truthy(Some(&result))) else {
        return Err(Mf::new("PROVIDER_REJECTED"));
    };
    Ok(
        json!({ "items": values.iter().filter_map(item).collect::<Vec<_>>(), "has_more": has_more(&result) }),
    )
}

/// `localeCompare(…, { sensitivity: 'base' }) === 0`: equal without case nor accents.
fn same_base(a: &str, b: &str) -> bool {
    let base = |text: &str| -> String {
        icu_normalizer::DecomposingNormalizerBorrowed::new_nfd()
            .normalize(text)
            .chars()
            .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
            .flat_map(char::to_lowercase)
            .collect()
    };
    base(a) == base(b)
}

/// `controlSpotify`: a playback command on the person's device, observed back.
pub async fn control(
    session: &Session<'_>,
    record: &JsonValue,
    action: &str,
    input: &JsonValue,
) -> Result<JsonValue, Mf> {
    let mut target = input.clone();
    if action == "play" && js::truthy(input.get("query")) {
        let mut asked = input.clone();
        asked["limit"] = json!(10);
        let found = read(session, record, "search", &asked).await?;
        let items = found["items"].as_array().cloned().unwrap_or_default();
        let wanted = js::text(input.get("query"));
        let exact: Vec<JsonValue> = items
            .iter()
            .filter(|i| same_base(&js::text(i.get("name")), &wanted))
            .cloned()
            .collect();
        let candidates = if exact.is_empty() {
            items
        } else {
            exact.clone()
        };
        if candidates.len() != 1 || (found["has_more"] == json!(true) && exact.is_empty()) {
            let error = if candidates.is_empty() {
                "ITEM_NOT_FOUND"
            } else {
                "AMBIGUOUS_SELECTION"
            };
            return Ok(json!({ "ok": false, "error": error, "candidates": candidates }));
        }
        if let (Some(target), Some(chosen)) = (target.as_object_mut(), candidates[0].as_object()) {
            target.extend(chosen.clone());
        }
    }
    let state = read(session, record, "get_state", &json!({})).await?;
    let device = input
        .get("device_id")
        .filter(|v| js::truthy(Some(v)))
        .or_else(|| state.pointer("/device/id").filter(|v| js::truthy(Some(v))));
    let Some(device) = device.map(js::string) else {
        return Err(Mf::new("NO_ACTIVE_DEVICE"));
    };
    if !js::truthy(input.get("device_id"))
        && state.pointer("/device/restricted") == Some(&json!(true))
    {
        return Err(Mf::new("PERMISSION_DENIED"));
    }
    let mut pairs = Vec::new();
    if action == "seek" {
        pairs.push((
            "position_ms".to_string(),
            js::string(&js::number_json(round(
                js::number(input.get("seconds")) * 1000.0,
            ))),
        ));
    }
    if action == "shuffle" {
        pairs.push((
            "state".to_string(),
            (input.get("on") == Some(&json!(true))).to_string(),
        ));
    }
    pairs.push(("device_id".to_string(), device));
    let path = if action == "play" || action == "resume" {
        "play"
    } else {
        action
    };
    let kind = js::text(target.get("kind"));
    let id = js::text(target.get("id"));
    let body = (action == "play").then(|| {
        if kind == "song" {
            json!({ "uris": [format!("spotify:track:{id}")] })
        } else {
            json!({ "context_uri": format!("spotify:{kind}:{id}") })
        }
    });
    let method = if action == "next" || action == "previous" {
        reqwest::Method::POST
    } else {
        reqwest::Method::PUT
    };
    session
        .api(
            record,
            &format!("/me/player/{path}?{}", form(&pairs)),
            method,
            body,
            true,
        )
        .await?;
    let observed = read(session, record, "get_state", &json!({})).await?;
    let same_song = kind != "song" || observed.pointer("/current_song/id") == Some(&json!(id));
    let playback = observed["playback"].clone();
    if action == "shuffle" {
        let asked = input.get("on") == Some(&json!(true));
        let confirmed = observed["shuffle"] == json!(asked);
        return Ok(
            json!({ "ok": true, "playback": if confirmed { playback } else { json!("opened_unconfirmed") }, "shuffle": observed["shuffle"] }),
        );
    }
    if action == "seek" {
        let position = observed["position"].as_f64();
        let reached = position.is_some_and(|p| (p - js::number(input.get("seconds"))).abs() <= 2.0);
        let mut out = json!({ "ok": true, "playback": if reached { playback } else { json!("opened_unconfirmed") } });
        if let Some(position) = position {
            out["position"] = js::number_json(position);
        }
        return Ok(out);
    }
    let told = match action {
        "play" | "resume" if playback == json!("playing") && same_song => "playing",
        "pause" if playback == json!("paused") => "paused",
        _ => "opened_unconfirmed",
    };
    Ok(json!({ "ok": true, "playback": told }))
}

/// `writeSpotify`: a durable write's effect, verified by reading it back.
pub async fn write(
    session: &Session<'_>,
    record: &JsonValue,
    action: &str,
    input: &JsonValue,
) -> Result<JsonValue, Mf> {
    let unconfirmed = || Mf::uncertain("OPERATION_UNCONFIRMED", true);
    match action {
        "create_playlist" => {
            let description = input
                .get("description")
                .filter(|v| js::truthy(Some(v)))
                .cloned()
                .unwrap_or_else(|| json!(""));
            let body =
                json!({ "name": input.get("name"), "description": description, "public": false });
            let created = session
                .api(
                    record,
                    "/me/playlists",
                    reqwest::Method::POST,
                    Some(body),
                    true,
                )
                .await?;
            if !shaped_id(created.get("id")) {
                return Err(unconfirmed());
            }
            let saved = session
                .get(
                    record,
                    &format!("/playlists/{}", js::string(&created["id"])),
                )
                .await?;
            if saved.get("id") != created.get("id")
                || saved.get("name") != input.get("name")
                || saved.get("public") != Some(&json!(false))
                || saved.pointer("/owner/id") != record.get("spotify_user_id")
            {
                return Err(unconfirmed());
            }
            Ok(json!({ "ok": true, "playlist_id": saved["id"] }))
        }
        "add_tracks" => {
            let playlist = js::text(input.get("playlist_id"));
            let before = session
                .get(record, &format!("/playlists/{playlist}"))
                .await?;
            let total = before
                .pointer("/items/total")
                .and_then(JsonValue::as_f64)
                .filter(|t| t.fract() == 0.0 && *t >= 0.0);
            let Some(total) = total else {
                return Err(Mf::new("PERMISSION_DENIED"));
            };
            let uris: Vec<String> = input["track_ids"]
                .as_array()
                .into_iter()
                .flatten()
                .map(|id| format!("spotify:track:{}", js::text(Some(id))))
                .collect();
            session
                .api(
                    record,
                    &format!("/playlists/{playlist}/items"),
                    reqwest::Method::POST,
                    Some(json!({ "uris": uris })),
                    true,
                )
                .await?;
            let pairs = [
                ("offset".to_string(), (total as i64).to_string()),
                ("limit".to_string(), uris.len().to_string()),
            ];
            let after = session
                .get(
                    record,
                    &format!("/playlists/{playlist}/items?{}", form(&pairs)),
                )
                .await?;
            let items = after.get("items").and_then(JsonValue::as_array);
            let matches = items.is_some_and(|items| {
                items.len() == uris.len()
                    && items
                        .iter()
                        .zip(&uris)
                        .all(|(entry, uri)| entry.pointer("/item/uri") == Some(&json!(uri)))
            });
            if !matches {
                return Err(unconfirmed());
            }
            Ok(json!({ "ok": true, "playlist_id": input.get("playlist_id") }))
        }
        "favorite_current" => {
            let state = read(session, record, "get_state", &json!({})).await?;
            if state.pointer("/current_song/id") != input.get("song_id") {
                return Err(Mf::new("CURRENT_SONG_CHANGED"));
            }
            let song = js::text(input.get("song_id"));
            let pairs = [("uris".to_string(), format!("spotify:track:{song}"))];
            let suffix = form(&pairs);
            session
                .api(
                    record,
                    &format!("/me/library?{suffix}"),
                    reqwest::Method::PUT,
                    None,
                    true,
                )
                .await?;
            let result = session
                .get(record, &format!("/me/library/contains?{suffix}"))
                .await?;
            if result.get(0) != Some(&json!(true)) || !result.is_array() {
                return Err(unconfirmed());
            }
            Ok(json!({ "ok": true, "song_id": input.get("song_id"), "favorited": true }))
        }
        _ => Err(Mf::new("INVALID_ARGUMENT")),
    }
}
