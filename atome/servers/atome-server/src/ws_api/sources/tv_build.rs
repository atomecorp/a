// Building the public television catalogue (server/ws_tv_catalog.js `buildTvCatalog`, `parseM3u`,
// `streamOf`, ported): the union of two open, community-maintained lists of free channels, grouped
// by country. Free-TV/IPTV (curated free-to-air M3U playlist) and IPTV-org (CC0 JSON API: channels,
// streams, blocklist, countries, logos, feeds). Channels on the IPTV-org blocklist, flagged NSFW or
// closed are dropped, and only streams a browser can open are kept: HLS/MP4 without a required user
// agent or referrer, or a YouTube video id.
use super::tv_streams::{by_name, clean, country_code, parse_m3u, stream_of};
use crate::vault_router::js;
use indexmap::{IndexMap, IndexSet};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

const MAX_STREAMS: usize = 8;
static FRANCE_TV_OWNER: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"(?i)france t[ée]l[ée]visions?").expect("owner"));
// France Télévisions streams its channels only on its own site, behind its sign-in: each channel's
// live page is played in the app's internal page of the service.
const FRANCE_TV_LIVE_PAGES: [(&str, &str); 5] = [
    ("France2.fr", "france-2"),
    ("France3.fr", "france-3"),
    ("France4.fr", "france-4"),
    ("France5.fr", "france-5"),
    ("Franceinfo.fr", "franceinfo"),
];

/// The catalogue built: its countries, its channels by country and by id, when it was built.
pub(super) struct Catalog {
    pub countries: Vec<JsonValue>,
    pub by_country: IndexMap<String, Vec<JsonValue>>,
    pub by_id: IndexMap<String, JsonValue>,
    pub built_at: i64,
}

/// What the lists answered.
pub(super) struct Sources {
    pub channels: Vec<JsonValue>,
    pub streams: Vec<JsonValue>,
    pub blocklist: Vec<JsonValue>,
    pub countries: Vec<JsonValue>,
    pub logos: Vec<JsonValue>,
    pub feeds: Vec<JsonValue>,
    pub free_tv: String,
}

struct Entry {
    name: JsonValue,
    country: String,
    categories: JsonValue,
    logo: JsonValue,
    providers: IndexSet<String>,
    streams: Vec<JsonValue>,
    urls: HashSet<String>,
}

impl Entry {
    fn add(&mut self, provider: &str, stream: Option<JsonValue>) {
        let Some(mut stream) = stream else { return };
        let url = js::text(stream.get("url"));
        if self.urls.contains(&url) || self.streams.len() >= MAX_STREAMS {
            return;
        }
        self.urls.insert(url);
        self.providers.insert(provider.into());
        stream["provider"] = json!(provider);
        self.streams.push(stream);
    }
}

// `value || fallback`.
fn or(value: Option<&JsonValue>, fallback: JsonValue) -> JsonValue {
    value
        .filter(|value| js::truthy(Some(value)))
        .cloned()
        .unwrap_or(fallback)
}

struct Builder<'a> {
    blocked: HashSet<String>,
    known: HashMap<String, &'a JsonValue>,
    logo_of: HashMap<String, JsonValue>,
    index: IndexMap<String, Entry>,
}

impl Builder<'_> {
    fn allowed(&self, id: &str) -> bool {
        let closed = self
            .known
            .get(id)
            .is_some_and(|c| js::truthy(c.get("is_nsfw")) || js::truthy(c.get("closed")));
        !self.blocked.contains(id) && !closed
    }

    fn entry_for(
        &mut self,
        id: &str,
        name: JsonValue,
        country: &str,
        categories: Option<&JsonValue>,
        logo: Option<&JsonValue>,
    ) -> &mut Entry {
        if !self.index.contains_key(id) {
            // Owner tags follow the channel, whichever list supplies its streams.
            let owners = self
                .known
                .get(id)
                .and_then(|c| c.get("owners"))
                .and_then(JsonValue::as_array);
            let owned = owners
                .into_iter()
                .flatten()
                .any(|owner| FRANCE_TV_OWNER.is_match(&js::text(Some(owner))));
            let entry = Entry {
                name,
                country: country.to_string(),
                categories: or(categories, json!([])),
                logo: or(logo, json!("")),
                providers: if owned {
                    IndexSet::from(["francetv".to_string()])
                } else {
                    IndexSet::new()
                },
                streams: Vec::new(),
                urls: HashSet::new(),
            };
            self.index.insert(id.to_string(), entry);
        }
        &mut self.index[id]
    }

    fn logo(&self, id: &str) -> Option<JsonValue> {
        self.logo_of.get(id).cloned()
    }
}

fn texts(list: &[JsonValue], key: &str) -> impl Iterator<Item = String> {
    list.iter().map(move |entry| js::text(entry.get(key)))
}

/// `buildTvCatalog(sources)`.
pub(super) fn build(sources: &Sources, built_at: i64) -> Catalog {
    let mut names: HashMap<String, (JsonValue, JsonValue)> = HashMap::new();
    let mut languages_of: HashMap<String, HashSet<String>> = HashMap::new();
    for entry in &sources.countries {
        let code = js::text(entry.get("code"));
        names.insert(
            code.clone(),
            (
                entry.get("name").cloned().unwrap_or(JsonValue::Null),
                or(entry.get("flag"), json!("")),
            ),
        );
        let languages = entry
            .get("languages")
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten();
        languages_of.insert(
            code,
            languages.map(|language| js::text(Some(language))).collect(),
        );
    }
    let mut builder = Builder {
        blocked: texts(&sources.blocklist, "channel").collect(),
        known: sources
            .channels
            .iter()
            .map(|channel| (js::text(channel.get("id")), channel))
            .collect(),
        logo_of: HashMap::new(),
        index: IndexMap::new(),
    };
    for logo in &sources.logos {
        let channel = js::text(logo.get("channel"));
        if !builder.logo_of.contains_key(&channel)
            && js::truthy(logo.get("url"))
            && !js::truthy(logo.get("feed"))
        {
            builder.logo_of.insert(channel, logo["url"].clone());
        }
    }
    // Free-TV first: its streams are curated, so they lead each channel.
    for item in parse_m3u(&sources.free_tv) {
        let attr = |key: &str| item.attrs.get(key).map_or("", String::as_str);
        let group = attr("group-title").to_lowercase();
        if group
            .strip_prefix("vod")
            .is_some_and(|rest| !rest.starts_with(|c: char| c.is_ascii_alphanumeric() || c == '_'))
        {
            continue;
        }
        let id = attr("tvg-id");
        let tail = id.rsplit('.').next().unwrap_or("");
        let country = (if attr("tvg-country").is_empty() {
            tail
        } else {
            attr("tvg-country")
        })
        .to_uppercase();
        if !country_code(&country) || (!id.is_empty() && !builder.allowed(id)) {
            continue;
        }
        let key = if id.is_empty() {
            let plain: String = clean(&item.name)
                .to_lowercase()
                .chars()
                .map(|c| {
                    if c.is_ascii_lowercase() || c.is_ascii_digit() {
                        c
                    } else {
                        ' '
                    }
                })
                .collect();
            format!(
                "{}.{}",
                plain.split(' ').collect::<String>(),
                country.to_lowercase()
            )
        } else {
            id.to_string()
        };
        let channel = builder.known.get(id).copied();
        let name = clean(attr("tvg-name"));
        let name = json!(if name.is_empty() {
            item.name.clone()
        } else {
            name
        });
        let logo = if attr("tvg-logo").is_empty() {
            builder.logo(id)
        } else {
            Some(json!(attr("tvg-logo")))
        };
        let stream = stream_of(Some(&json!(item.url)), None);
        builder
            .entry_for(
                &key,
                name,
                &country,
                channel.and_then(|c| c.get("categories")),
                logo.as_ref(),
            )
            .add("free-tv", stream);
    }
    // A channel's main feed first, then feeds in its country's languages: the stream cap must never
    // be filled with another language's copies.
    let mut feed_rank: HashMap<String, u8> = HashMap::new();
    for feed in &sources.feeds {
        let channel = js::text(feed.get("channel"));
        let country = builder
            .known
            .get(&channel)
            .map(|c| js::text(c.get("country")));
        let local = country.and_then(|country| languages_of.get(&country));
        let languages = feed
            .get("languages")
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten();
        let rank = if js::truthy(feed.get("is_main")) {
            0
        } else if languages
            .into_iter()
            .any(|l| local.is_some_and(|local| local.contains(&js::text(Some(l)))))
        {
            1
        } else {
            2
        };
        feed_rank.insert(format!("{channel}|{}", js::text(feed.get("id"))), rank);
    }
    let rank_of = |stream: &JsonValue| match js::truthy(stream.get("feed")) {
        true => feed_rank
            .get(&format!(
                "{}|{}",
                js::text(stream.get("channel")),
                js::text(stream.get("feed"))
            ))
            .copied()
            .unwrap_or(2),
        false => 1,
    };
    let mut ordered: Vec<&JsonValue> = sources.streams.iter().collect();
    ordered.sort_by_key(|stream| rank_of(stream));
    for stream in ordered {
        let id = js::text(stream.get("channel"));
        if !js::truthy(stream.get("channel"))
            || js::truthy(stream.get("user_agent"))
            || js::truthy(stream.get("referrer"))
            || !builder.allowed(&id)
        {
            continue;
        }
        let Some(channel) = builder.known.get(&id).copied() else {
            continue;
        };
        let country = channel
            .get("country")
            .and_then(JsonValue::as_str)
            .unwrap_or("");
        if !country_code(country) {
            continue;
        }
        let (channel_id, logo) = (
            js::text(channel.get("id")),
            builder.logo(&js::text(channel.get("id"))),
        );
        let name = channel.get("name").cloned().unwrap_or(JsonValue::Null);
        builder
            .entry_for(
                &channel_id,
                name,
                country,
                channel.get("categories"),
                logo.as_ref(),
            )
            .add(
                "iptv-org",
                stream_of(stream.get("url"), stream.get("quality")),
            );
    }
    // The service's own page leads: it is the channel's official source.
    for (id, slug) in FRANCE_TV_LIVE_PAGES {
        let Some(channel) = builder.known.get(id).copied() else {
            continue;
        };
        if !builder.allowed(id) {
            continue;
        }
        let logo = builder.logo(id);
        let name = channel.get("name").cloned().unwrap_or(JsonValue::Null);
        let country = js::text(channel.get("country"));
        let entry = builder.entry_for(id, name, &country, channel.get("categories"), logo.as_ref());
        let url = format!("https://www.france.tv/{slug}/direct.html");
        entry.urls.insert(url.clone());
        entry.providers.insert("francetv".into());
        entry.streams.insert(0, json!({ "url": url, "kind": "service_page", "service": "francetv", "quality": "", "secure": true, "provider": "francetv" }));
    }
    let mut by_country: IndexMap<String, Vec<JsonValue>> = IndexMap::new();
    for (id, mut entry) in builder.index {
        if entry.streams.is_empty() {
            continue;
        }
        // https first (plain http cannot play inside an https or iOS page); the sort is stable,
        // so the feed order holds within each.
        entry
            .streams
            .sort_by_key(|stream| stream.get("secure") != Some(&json!(true)));
        let mut providers: Vec<String> = entry.providers.into_iter().collect();
        providers.sort();
        let channel = json!({ "id": id, "name": entry.name, "country": entry.country, "categories": entry.categories,
            "logo": entry.logo, "providers": providers, "streams": entry.streams });
        by_country.entry(entry.country).or_default().push(channel);
    }
    for list in by_country.values_mut() {
        list.sort_by(by_name);
    }
    let mut countries: Vec<JsonValue> = by_country
        .iter()
        .map(|(code, list)| {
            let (name, flag) = names
                .get(code)
                .cloned()
                .unwrap_or((JsonValue::Null, json!("")));
            let mut country = JsonMap::new();
            country.insert("code".into(), json!(code));
            country.insert("name".into(), or(Some(&name), json!(code)));
            country.insert("flag".into(), or(Some(&flag), json!("")));
            country.insert("count".into(), json!(list.len()));
            JsonValue::Object(country)
        })
        .collect();
    countries.sort_by(by_name);
    let by_id = by_country
        .values()
        .flatten()
        .map(|channel| (js::text(channel.get("id")), channel.clone()))
        .collect();
    Catalog {
        countries,
        by_country,
        by_id,
        built_at,
    }
}
