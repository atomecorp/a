// The listings of `shows-nearby` (server/ws_shows.js `readAgenda`, `readFilms`, `readMatches`,
// ported): the OpenAgenda kinds (the public OpenAgenda events dataset, OpenDataSoft, no key), the
// films showing in a region (TMDB `now_playing`, kept 12 h) and the next match of each French
// professional league (TheSportsDB, kept an hour).
use super::common::{number_text, text};
use super::shows::{
    Failed, ODS, PAGE_SIZE, Spec, distance, geo, https_url, point, read_json, results, total,
};
use crate::providers::http::{client, form};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

const TMDB: &str = "https://api.themoviedb.org/3";
const TMDB_IMAGES: &str = "https://image.tmdb.org/t/p/w342";
const SPORTS: &str = "https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php";
// Ligue 1, Ligue 2, Coupe de France, Top 14, Pro D2, LNB (basketball), LNH (handball), Ligue Magnus.
const FRENCH_LEAGUES: [&str; 8] = [
    "4334", "4401", "4484", "4430", "5172", "4423", "4536", "4927",
];

const MAX_FILM_PAGES: f64 = 5.0;
const FILM_TTL_MS: i64 = 12 * 60 * 60 * 1000;
const MATCH_TTL_MS: i64 = 60 * 60 * 1000;

// The OpenAgenda words of each agenda kind: the words of the activity categories feeding it
// (`activityAgendaWords()` of atome/src/shared/activity_categories.js); `free` reads the conditions.
pub(super) const AGENDA_WORDS: [(&str, &[&str]); 8] = [
    (
        "concerts",
        &["concert", "musique", "jazz", "rock", "chanson", "récital"],
    ),
    (
        "stage",
        &[
            "théâtre",
            "humour",
            "cirque",
            "opéra",
            "danse",
            "spectacle",
            "marionnette",
            "stand-up",
        ],
    ),
    (
        "sport",
        &[
            "sport",
            "match",
            "course",
            "tournoi",
            "marathon",
            "football",
            "rugby",
            "basket",
            "handball",
            "vélo",
            "randonnée",
        ],
    ),
    (
        "events",
        &["festival", "fête", "carnaval", "foire", "salon", "kermesse"],
    ),
    ("expos", &["exposition", "expo", "musée", "vernissage"]),
    ("family", &["jeune public", "enfant", "famille", "conte"]),
    (
        "outings",
        &[
            "repas",
            "dîner",
            "banquet",
            "pique-nique",
            "dégustation",
            "soirée",
            "bal",
            "guinguette",
            "atelier",
            "initiation",
            "marché",
            "brocante",
            "vide-grenier",
        ],
    ),
    ("free", &[]),
];

static FILMS: LazyLock<Mutex<HashMap<String, (Vec<JsonValue>, i64)>>> =
    LazyLock::new(Mutex::default);
static MATCHES: LazyLock<Mutex<Option<(Vec<JsonValue>, i64)>>> = LazyLock::new(Mutex::default);

// The next session of an event still to come (its `timings`), else its first.
fn next_timing(record: &JsonValue, now: i64) -> (String, String) {
    let raw = record
        .get("timings")
        .filter(|t| js::truthy(Some(t)))
        .map_or_else(|| "[]".to_string(), |t| js::text(Some(t)));
    let timings: Vec<JsonValue> = serde_json::from_str::<JsonValue>(&raw)
        .ok()
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();
    let parse = |value: Option<&JsonValue>| js::date(Some(&json!(js::text(value))));
    let mut upcoming: Vec<(i64, i64)> = timings
        .iter()
        .filter_map(|timing| Some((parse(timing.get("begin"))?, parse(timing.get("end"))?)))
        .filter(|(_, end)| *end >= now)
        .collect();
    upcoming.sort_by_key(|(begin, _)| *begin);
    match upcoming.first() {
        Some((begin, end)) => (js::iso(*begin), js::iso(*end)),
        None => (
            text(record.get("firstdate_begin")),
            text(record.get("firstdate_end")),
        ),
    }
}

// The organiser's booking (OpenAgenda `registration`): its first https link.
fn ticket_url(value: Option<&JsonValue>) -> String {
    let entries = match value {
        Some(JsonValue::String(raw)) => match serde_json::from_str::<JsonValue>(raw) {
            Ok(parsed) => parsed,
            Err(_) => return String::new(),
        },
        Some(value) => value.clone(),
        None => JsonValue::Null,
    };
    entries
        .as_array()
        .into_iter()
        .flatten()
        .filter(|entry| entry.get("type") == Some(&json!("link")))
        .map(|entry| https_url(entry.get("value")))
        .find(|url| !url.is_empty())
        .unwrap_or_default()
}

pub(super) async fn read_agenda(spec: &Spec, now: i64) -> Result<(f64, Vec<JsonValue>), Failed> {
    let words = |list: &[&str]| {
        let tests: Vec<String> = list
            .iter()
            .map(|word| format!("title_fr like \"{word}\" or keywords_fr like \"{word}\""))
            .collect();
        format!("({})", tests.join(" or "))
    };
    let kind = spec.kind.as_str();
    let own = AGENDA_WORDS
        .iter()
        .find(|(name, _)| *name == kind)
        .map_or(&[][..], |(_, words)| words);
    let mut clauses = vec![
        format!(
            "within_distance(location_coordinates, {}, {}km)",
            point(spec),
            number_text(spec.radius_km)
        ),
        // An exhibition is shown while it lasts; anything else from its first session on.
        if kind == "expos" {
            "lastdate_end >= now()"
        } else {
            "firstdate_begin >= now(hours=-3)"
        }
        .to_string(),
        "onlineaccesslink is null".into(),
        "not originagenda_title like \"France Travail\"".into(),
    ];
    if kind == "free" {
        clauses
            .push("(conditions_fr like \"gratuit\" or conditions_fr like \"entrée libre\")".into());
    }
    if kind == "family" {
        clauses.push(format!("(age_max <= 12 or {})", words(own)));
    } else if !own.is_empty() {
        clauses.push(words(own));
    }
    if !spec.query.is_empty() {
        let q = &spec.query;
        clauses.push(format!(
            "(title_fr like \"{q}\" or keywords_fr like \"{q}\" or location_name like \"{q}\" or location_city like \"{q}\")"
        ));
    }
    let order = match spec.sort.as_str() {
        "distance" => format!(
            "distance(location_coordinates, {}), firstdate_begin",
            point(spec)
        ),
        "name" => "location_name, firstdate_begin".into(),
        _ => "firstdate_begin".into(),
    };
    let params = form(&[
        ("where", clauses.join(" and ")),
        ("order_by", order),
        ("limit", PAGE_SIZE.to_string()),
        ("offset", spec.offset.to_string()),
        ("select", "uid,title_fr,description_fr,daterange_fr,firstdate_begin,firstdate_end,timings,conditions_fr,registration,thumbnail,image,canonicalurl,location_name,location_address,location_city,location_coordinates".into()),
    ]);
    let payload = read_json(client().get(format!(
        "{ODS}/evenements-publics-openagenda/records?{params}"
    )))
    .await?;
    let entries = results(&payload, "results")
        .iter()
        .map(|record| {
            let (lat, lon) = geo(record.get("location_coordinates"));
            let (start, end) = next_timing(record, now);
            let image = if js::truthy(record.get("thumbnail")) { record.get("thumbnail") } else { record.get("image") };
            json!({ "id": format!("agenda_{}", text(record.get("uid"))), "kind": "event", "title": text(record.get("title_fr")),
                "summary": text(record.get("description_fr")), "dateLabel": text(record.get("daterange_fr")), "start": start, "end": end,
                "place": text(record.get("location_name")), "address": text(record.get("location_address")),
                "city": text(record.get("location_city")), "lat": js::number_json(lat), "lon": js::number_json(lon),
                "distanceKm": distance(spec, lat, lon), "price": text(record.get("conditions_fr")), "image": https_url(image),
                "url": https_url(record.get("canonicalurl")), "ticketUrl": ticket_url(record.get("registration")), "source": "OpenAgenda" })
        })
        .collect();
    Ok((total(payload.get("total_count")), entries))
}

pub(super) async fn read_films(spec: &Spec, key: &str, now: i64) -> Result<Vec<JsonValue>, Failed> {
    let cache_key = format!("{}:{}", spec.region, spec.language);
    if let Some((entries, at)) = FILMS.lock().expect("films").get(&cache_key)
        && now - at < FILM_TTL_MS
    {
        return Ok(entries.clone());
    }
    let page = |number: usize| {
        let query = form(&[
            ("api_key", key.to_string()),
            ("region", spec.region.clone()),
            ("language", format!("{}-{}", spec.language, spec.region)),
            ("page", number.to_string()),
        ]);
        read_json(client().get(format!("{TMDB}/movie/now_playing?{query}")))
    };
    let first = page(1).await?;
    let pages = super::common::number_or_zero(first.get("total_pages"));
    let more = (MAX_FILM_PAGES.min(if pages == 0.0 { 1.0 } else { pages }) - 1.0)
        .floor()
        .max(0.0) as usize;
    let rest = futures_util::future::try_join_all((0..more).map(|index| page(index + 2))).await?;
    let mut seen: Vec<JsonValue> = Vec::new();
    let mut films: Vec<JsonValue> = Vec::new();
    for payload in std::iter::once(&first).chain(&rest) {
        for film in results(payload, "results") {
            let id = film.get("id").cloned().unwrap_or(JsonValue::Null);
            if js::truthy(Some(&id)) && !seen.contains(&id) {
                seen.push(id);
                films.push(film);
            }
        }
    }
    let popularity = |film: &JsonValue| super::common::number_or_zero(film.get("popularity"));
    films.sort_by(|a, b| popularity(b).total_cmp(&popularity(a)));
    let entries: Vec<JsonValue> = films
        .iter()
        .map(|film| {
            let id = js::text(film.get("id"));
            let poster = film.get("poster_path").filter(|p| js::truthy(Some(p)));
            json!({ "id": format!("film_{id}"), "kind": "film", "title": text(film.get("title")), "summary": text(film.get("overview")),
                "start": text(film.get("release_date")),
                "image": poster.map_or_else(String::new, |p| format!("{TMDB_IMAGES}{}", js::text(Some(p)))),
                "url": format!("https://www.themoviedb.org/movie/{id}"), "source": "TMDB" })
        })
        .collect();
    FILMS
        .lock()
        .expect("films")
        .insert(cache_key, (entries.clone(), now));
    Ok(entries)
}

pub(super) async fn read_matches(now: i64) -> Result<Vec<JsonValue>, Failed> {
    if let Some((entries, at)) = &*MATCHES.lock().expect("matches")
        && now - at < MATCH_TTL_MS
    {
        return Ok(entries.clone());
    }
    let leagues = futures_util::future::try_join_all(
        FRENCH_LEAGUES
            .iter()
            .map(|id| read_json(client().get(format!("{SPORTS}?id={id}")))),
    )
    .await?;
    let stamp = |event: &JsonValue| {
        js::date(Some(&json!(format!(
            "{}Z",
            js::text(event.get("strTimestamp"))
        ))))
    };
    let mut entries: Vec<(i64, JsonValue)> = leagues
        .iter()
        .flat_map(|payload| results(payload, "events"))
        .filter_map(|event| {
            let at = stamp(&event).filter(|at| js::truthy(event.get("idEvent")) && *at >= now - 3 * 3_600_000)?;
            Some((at, json!({ "id": format!("match_{}", js::text(event.get("idEvent"))), "kind": "match",
                "title": text(event.get("strEvent")).replacen(" vs ", " – ", 1), "league": text(event.get("strLeague")),
                "sport": text(event.get("strSport")), "start": js::iso(at), "place": text(event.get("strVenue")),
                // TheSportsDB's pictures carry no CORS header: a page cannot draw them, the row keeps its glyph.
                "city": text(event.get("strCity")), "image": "", "source": "TheSportsDB" })))
        })
        .collect();
    entries.sort_by_key(|(at, _)| *at);
    let entries: Vec<JsonValue> = entries.into_iter().map(|(_, entry)| entry).collect();
    *MATCHES.lock().expect("matches") = Some((entries.clone(), now));
    Ok(entries)
}
