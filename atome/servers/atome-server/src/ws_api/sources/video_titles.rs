// The titles of Divertissement › Vidéo › Films & séries as TMDB describes them (server/tmdb_client.js
// and the title half of server/ws_video_catalog.js, ported): the server's one TMDB client (one
// Atome key for every user, `TMDB_API_KEY`: the environment, in development also
// `Private/tmdb.env`), the answers it keeps, and a title made an entry: what can be watched without
// buying it (atome/src/squirrel/shared/streaming_services.js) and its trailer.
use super::common::{either, environment, plain, response_json, text};
use crate::providers::http;
use crate::vault_router::js;
use futures_util::{StreamExt, TryStreamExt};
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

const TMDB: &str = "https://api.themoviedb.org/3";
const TMDB_IMAGES: &str = "https://image.tmdb.org/t/p";
const DETAILS_IN_FLIGHT: usize = 20;
const DETAIL_TTL_MS: f64 = 12.0 * 60.0 * 60.0 * 1000.0;
const MAX_KEPT: usize = 5000;

/// A subscription service a user declares: its key, its name, its TMDB watch-provider ids in
/// France (its offers with ads included) and its TMDB logo.
pub(super) struct Service {
    pub key: &'static str,
    label: &'static str,
    pub tmdb: &'static [f64],
    logo: &'static str,
}

pub(super) const SERVICES: [Service; 12] = [
    Service {
        key: "netflix",
        label: "Netflix",
        tmdb: &[8.0, 1796.0],
        logo: "/rK1KljqmbvO9HQa1PBFLILWah72.png",
    },
    Service {
        key: "disney",
        label: "Disney+",
        tmdb: &[337.0],
        logo: "/5eZ872CghnHFLB1j8grszbrx0dx.png",
    },
    Service {
        key: "prime",
        label: "Prime Video",
        tmdb: &[119.0, 2100.0],
        logo: "/gMZdpavHmxFNnLpMHwVxfqeux2g.png",
    },
    Service {
        key: "canal",
        label: "CANAL+",
        tmdb: &[381.0, 345.0],
        logo: "/gliWKhLJVdm7QwL1braBCRko5dx.png",
    },
    Service {
        key: "paramount",
        label: "Paramount+",
        tmdb: &[531.0, 2303.0],
        logo: "/pkx3klJlwW5JdtaulvDx6hDNtch.png",
    },
    Service {
        key: "apple",
        label: "Apple TV+",
        tmdb: &[350.0],
        logo: "/9icYBfYFcwgCbky5VdGUIKJ4C5i.png",
    },
    Service {
        key: "max",
        label: "HBO Max",
        tmdb: &[1899.0],
        logo: "/skypuy7SXuugIQeYg0IglmzoKaS.png",
    },
    Service {
        key: "crunchyroll",
        label: "Crunchyroll",
        tmdb: &[283.0],
        logo: "/uFL3c4Cq8M6WoLymlC5Y8bmGytV.png",
    },
    Service {
        key: "mubi",
        label: "MUBI",
        tmdb: &[11.0],
        logo: "/k7iSlvgWzZuO4zU5PcBjhABMuia.png",
    },
    Service {
        key: "adn",
        label: "ADN",
        tmdb: &[415.0],
        logo: "/lqW5wpRdZQrAPiHv1nZo3j8t4BW.png",
    },
    Service {
        key: "shadowz",
        label: "Shadowz",
        tmdb: &[513.0],
        logo: "/4Hmt479nSu8j4JIFDu6WPqsc6AT.png",
    },
    Service {
        key: "molotov",
        label: "Molotov",
        tmdb: &[1967.0],
        logo: "/g8P4BJ2Wrya0VkbGUxBoUqpXtSs.png",
    },
];

/// What is asked: the region, the language, the declared services' provider ids, and whether free
/// channels count.
pub(super) struct Spec {
    pub op: String,
    pub region: String,
    pub language: String,
    pub page: f64,
    pub query: String,
    pub reference: String,
    pub free: bool,
    pub provider_ids: Vec<f64>,
}

impl Spec {
    pub(super) fn locale(&self) -> String {
        format!("{}-{}", self.language, self.region)
    }
}

/// A failed TMDB read: its HTTP status (0 when none) and its cause.
pub(super) struct Failure {
    pub status: u16,
    pub cause: String,
}

impl From<&str> for Failure {
    fn from(cause: &str) -> Self {
        Self {
            status: 0,
            cause: cause.into(),
        }
    }
}

// The development key file, read once it is read whole.
static KEY_FILE: LazyLock<Mutex<Option<HashMap<String, String>>>> = LazyLock::new(Mutex::default);

/// `tmdbKey(env)`: the environment's key, else the development file's; a bad file throws.
pub(super) fn key() -> Result<String, String> {
    let (settings, root) = environment()?;
    let mut file = KEY_FILE.lock().expect("tmdb key file");
    if file.is_none() {
        *file = Some(settings.secret_file(
            root,
            "ATOME_SHOWS_ENV_FILE",
            "tmdb.env",
            &["TMDB_API_KEY"],
            "shows_secret_file",
        )?);
    }
    let found = settings
        .value("TMDB_API_KEY")
        .or_else(|| file.as_ref()?.get("TMDB_API_KEY").cloned());
    Ok(js::trim(&found.unwrap_or_default()).to_string())
}

/// `tmdbImage(size, file)`: an image of TMDB at `size`; '' without a file.
fn image(size: &str, file: Option<&JsonValue>) -> String {
    let file = text(file);
    if file.is_empty() {
        file
    } else {
        format!("{TMDB_IMAGES}/{size}{file}")
    }
}

/// `readTmdb({ key }, route, params)`: a TMDB refusal fails with its status.
pub(super) async fn read(
    key: &str,
    route: &str,
    params: &[(&str, String)],
) -> Result<JsonValue, Failure> {
    let mut pairs = vec![("api_key", key.to_string())];
    pairs.extend(params.iter().map(|(name, value)| (*name, value.clone())));
    let response = http::client()
        .get(format!("{TMDB}/{route}?{}", http::form(&pairs)))
        .timeout(Duration::from_secs(8))
        .header("accept", "application/json")
        .send()
        .await
        .map_err(|_| Failure::from("fetch failed"))?;
    let status = response.status();
    if status.is_redirection() {
        return Err("fetch failed".into());
    }
    if !status.is_success() {
        return Err(Failure {
            status: status.as_u16(),
            cause: format!("status_{}", status.as_u16()),
        });
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|_| Failure::from("terminated"))?;
    response_json(&bytes).map_err(|error| Failure::from(error.as_str()))
}

/// TMDB answers kept a while, the oldest leaving first once MAX_KEPT are kept.
pub(super) struct Kept(Mutex<IndexMap<String, (JsonValue, f64)>>);

impl Kept {
    pub(super) fn new() -> Self {
        Self(Mutex::new(IndexMap::new()))
    }

    /// `kept(cache, key, ttl, now, read)`.
    pub(super) async fn get(
        &self,
        key: String,
        ttl: f64,
        now: f64,
        read: impl Future<Output = Result<JsonValue, Failure>>,
    ) -> Result<JsonValue, Failure> {
        if let Some((value, at)) = self.0.lock().expect("tmdb kept").get(&key)
            && now - at < ttl
        {
            return Ok(value.clone());
        }
        let value = read.await?;
        let mut kept = self.0.lock().expect("tmdb kept");
        kept.shift_remove(&key);
        kept.insert(key, (value.clone(), now));
        while kept.len() > MAX_KEPT {
            kept.shift_remove_index(0);
        }
        Ok(value)
    }
}

static DETAILS: LazyLock<Kept> = LazyLock::new(Kept::new);

fn service_of(id: f64) -> Option<&'static Service> {
    SERVICES.iter().find(|service| service.tmdb.contains(&id))
}

// What can be watched in the region without buying: the declared services' offers, then the free ones.
fn offers_of(detail: &JsonValue, spec: &Spec) -> Result<Vec<JsonValue>, Failure> {
    let local = detail
        .get("watch/providers")
        .and_then(|providers| providers.get("results"))
        .and_then(|results| results.get(&spec.region))
        .filter(|local| js::truthy(Some(local)));
    let monetizations: &[&str] = if spec.free {
        &["flatrate", "free", "ads"]
    } else {
        &["flatrate"]
    };
    let mut offers: Vec<(String, String, JsonValue)> = Vec::new();
    for monetization in monetizations {
        let providers = local
            .and_then(|local| local.get(*monetization))
            .and_then(JsonValue::as_array);
        for provider in providers.into_iter().flatten() {
            if provider.is_null() {
                return Err("TypeError: provider is null".into());
            }
            let id = provider.get("provider_id");
            let declared = id
                .and_then(JsonValue::as_f64)
                .is_some_and(|id| spec.provider_ids.contains(&id));
            if *monetization == "flatrate" && !declared {
                continue;
            }
            let service = service_of(super::common::number(id));
            let key = service.map_or_else(
                || format!("tmdb_{}", js::text(id)),
                |service| service.key.to_string(),
            );
            let name = service.map_or_else(
                || text(provider.get("provider_name")),
                |service| service.label.to_string(),
            );
            // A channel of a provider already named (« Plex Channel » after « Plex ») is that provider again.
            if offers.iter().any(|(known, known_name, _)| {
                *known == key || name.starts_with(&format!("{known_name} "))
            }) {
                continue;
            }
            let logo = match service {
                Some(service) => image("w92", Some(&json!(service.logo))),
                None => image("w92", provider.get("logo_path")),
            };
            let offer = json!({ "key": key, "service": service.map_or("", |service| service.key), "name": name,
                "logo": logo, "monetization": monetization });
            offers.push((key, name, offer));
        }
    }
    Ok(offers.into_iter().map(|(_, _, offer)| offer).collect())
}

// Its trailer: an official YouTube trailer in the user's language first, then in English, then a teaser.
fn trailer_of(detail: &JsonValue, language: &str) -> Result<JsonValue, Failure> {
    static KEY: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new("^[A-Za-z0-9_-]{11}$").expect("key"));
    let mut videos = Vec::new();
    let results = detail
        .get("videos")
        .and_then(|videos| videos.get("results"))
        .and_then(JsonValue::as_array);
    for video in results.into_iter().flatten() {
        if video.is_null() {
            return Err("TypeError: video is null".into());
        }
        let kind = video.get("type").and_then(JsonValue::as_str);
        if video.get("site") == Some(&json!("YouTube"))
            && KEY.is_match(&text(video.get("key")))
            && matches!(kind, Some("Trailer" | "Teaser"))
        {
            let rank = if kind == Some("Trailer") { 0 } else { 2 }
                + if video.get("iso_639_1").and_then(JsonValue::as_str) == Some(language) {
                    0
                } else {
                    1
                }
                + if js::truthy(video.get("official")) {
                    0
                } else {
                    4
                };
            videos.push((rank, video));
        }
    }
    videos.sort_by_key(|(rank, _)| *rank);
    Ok(videos
        .first()
        .and_then(|(_, video)| video.get("key"))
        .filter(|key| js::truthy(Some(key)))
        .map_or_else(|| json!(""), plain))
}

fn entry_of(media: &str, detail: &JsonValue, spec: &Spec) -> Result<Option<JsonValue>, Failure> {
    let offers = offers_of(detail, spec)?;
    if offers.is_empty() {
        return Ok(None);
    }
    let date = text(either(
        detail.get("release_date"),
        detail.get("first_air_date"),
    ));
    Ok(Some(json!({
        "id": format!("{media}:{}", js::text(detail.get("id"))), "media": media,
        "title": text(either(detail.get("title"), detail.get("name"))), "year": js::slice(&date, 4), "date": date,
        "image": image("w342", detail.get("poster_path")), "overview": js::slice(&text(detail.get("overview")), 400),
        "offers": offers, "trailer": trailer_of(detail, &spec.language)?,
    })))
}

/// The kept entries of `found` (`(media, id)`), in their order, DETAILS_IN_FLIGHT read at once;
/// a title TMDB no longer knows (404) is left out.
pub(super) async fn entries_of(
    found: Vec<(String, JsonValue)>,
    spec: &Spec,
    key: &str,
    now: f64,
) -> Result<Vec<JsonValue>, Failure> {
    let entries: Vec<Option<JsonValue>> = futures_util::stream::iter(found)
        .map(|(media, id)| async move {
            let id = js::text(Some(&id));
            // A title's whole record: its providers in every country and its videos.
            let params = [
                ("language", spec.locale()),
                ("append_to_response", "watch/providers,videos".into()),
                ("include_video_language", format!("{},en", spec.language)),
            ];
            let route = format!("{media}/{id}");
            let detail = DETAILS.get(
                format!("{media}:{id}:{}", spec.language),
                DETAIL_TTL_MS,
                now,
                read(key, &route, &params),
            );
            match detail.await {
                Ok(detail) => entry_of(&media, &detail, spec),
                Err(failure) if failure.status == 404 => Ok(None),
                Err(failure) => Err(failure),
            }
        })
        .buffered(DETAILS_IN_FLIGHT)
        .try_collect()
        .await?;
    Ok(entries.into_iter().flatten().collect())
}
