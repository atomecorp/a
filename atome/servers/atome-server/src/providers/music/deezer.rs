// Deezer (server/music/deezer_catalog.js, ported): the verified public catalog contract only, no
// guessed authorization, private library or playback. The profile the person enters in Passwords
// & keys must exist in that catalog.
use super::Mf;
use super::session::Check;
use super::spotify::artwork;
use crate::providers::http::{self, Done};
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

async fn get(url: String) -> Result<reqwest::Response, ()> {
    http::send(http::client().get(url)).await.map_err(|_| ())
}

/// `verifyDeezerProfile`.
pub async fn verify(id: &str) -> Done<()> {
    if !(1..=20).contains(&id.len()) || !id.bytes().all(|c| c.is_ascii_digit()) {
        return Err("provider_key_invalid".into());
    }
    let response = get(format!("https://api.deezer.com/user/{id}"))
        .await
        .map_err(|()| "provider_connection_failed")?;
    if !response.status().is_success() {
        return Err("provider_connection_failed".into());
    }
    let body = http::bytes(response, usize::MAX)
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice::<JsonValue>(&bytes).ok());
    if body.as_ref().map(|body| js::text(body.get("id"))) != Some(id.to_string()) {
        return Err("provider_key_invalid".into());
    }
    Ok(())
}

/// `readDeezerCatalog`: the readiness, a song's page, or a page of the catalog's songs.
pub async fn catalog(action: &str, input: &JsonValue, check: &Check<'_>) -> Result<JsonValue, Mf> {
    if action == "get_state" {
        return Ok(
            json!({ "ok": true, "provider": "deezer", "supported": true, "configured": true,
            "state": "catalog_only", "capabilities": ["get_state", "search", "open_item"] }),
        );
    }
    let id = js::text(input.get("id"));
    if action == "open_item"
        && input.get("kind") == Some(&json!("song"))
        && (1..=30).contains(&id.len())
        && id.bytes().all(|c| c.is_ascii_digit())
    {
        return Ok(
            json!({ "ok": true, "url": format!("https://www.deezer.com/track/{id}"),
            "playback": "opened_unconfirmed" }),
        );
    }
    let kind = input.get("kind").filter(|kind| js::truthy(Some(kind)));
    if action != "search" || kind.is_some_and(|kind| kind != "song") {
        return Ok(json!({ "ok": false, "error": "DEVELOPER_ACCESS_REQUIRED" }));
    }
    let or = |field: &str, default: &str| {
        input
            .get(field)
            .filter(|value| js::truthy(Some(value)))
            .map(js::string)
            .unwrap_or_else(|| default.into())
    };
    let mut url = url::Url::parse("https://api.deezer.com/search").expect("Deezer's address");
    url.query_pairs_mut()
        .append_pair("q", &js::text(input.get("query")))
        .append_pair("limit", &or("limit", "10"))
        .append_pair("index", &or("offset", "0"));
    check().await?;
    let response = get(url.to_string())
        .await
        .map_err(|()| Mf::new("PROVIDER_UNAVAILABLE"))?;
    if !response.status().is_success() {
        let limited = response.status().as_u16() == 429;
        return Err(Mf::new(if limited {
            "RATE_LIMITED"
        } else {
            "PROVIDER_UNAVAILABLE"
        }));
    }
    let body: JsonValue = http::bytes(response, usize::MAX)
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .ok_or_else(|| Mf::new("PROVIDER_REJECTED"))?;
    check().await?;
    let Some(data) = body
        .get("data")
        .and_then(JsonValue::as_array)
        .filter(|_| !js::truthy(body.get("error")))
    else {
        return Err(Mf::new("PROVIDER_REJECTED"));
    };
    let items: Vec<JsonValue> = data
        .iter()
        .filter(|item| {
            item.get("type") == Some(&json!("track"))
                && item
                    .get("id")
                    .and_then(JsonValue::as_f64)
                    .is_some_and(|id| {
                        id.fract() == 0.0 && id > 0.0 && id <= 9_007_199_254_740_991.0
                    })
                && item.get("title").is_some_and(JsonValue::is_string)
        })
        .map(|item| {
            let mut song = JsonMap::new();
            song.insert("id".into(), json!(js::string(&item["id"])));
            song.insert("name".into(), item["title"].clone());
            song.insert("kind".into(), json!("song"));
            let artist = item
                .pointer("/artist/name")
                .filter(|name| js::truthy(Some(name)));
            song.insert(
                "artist".into(),
                json!(artist.map(js::string).unwrap_or_default()),
            );
            if let Some(cover) = artwork(item.pointer("/album/cover_medium")) {
                song.insert("artwork_url".into(), json!(cover));
            }
            let duration = js::number(item.get("duration"));
            if duration > 0.0 {
                song.insert("duration".into(), js::number_json(duration));
            }
            JsonValue::Object(song)
        })
        .collect();
    let has_more = body
        .get("next")
        .and_then(JsonValue::as_str)
        .is_some_and(|next| !next.is_empty());
    Ok(json!({ "ok": true, "items": items, "has_more": has_more }))
}
