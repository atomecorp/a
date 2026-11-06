// The DATAtourisme places of the Temps libre rubric (server/shows_tourism.js, ported): museums,
// nature, hikes, experiences and well-being around a position, from the official tourism base of
// France (api.datatourisme.fr/v1, Licence Ouverte Etalab). ONE Atome key for every user
// (`DATATOURISME_API_KEY`), never on a device. The key's quota (1,000 requests an hour) is shared by
// every user: a page read is kept PAGE_TTL_MS for the same place (a ~1 km cell), and past
// HOURLY_BUDGET calls in the hour the kinds answer `shows_tourism_busy` until the hour turns. A photo
// is shown only with its credits.
use super::common::{number, number_text, text};
use super::shows::{Failed, PAGE_SIZE, Spec, distance, https_url, read_json, total};
use crate::providers::http::{client, form};
use indexmap::IndexMap;
use serde_json::{Value as JsonValue, json};
use std::sync::{LazyLock, Mutex};

const API: &str = "https://api.datatourisme.fr/v1/catalog";
const PAGE_TTL_MS: i64 = 6 * 60 * 60 * 1000;
const HOUR_MS: i64 = 60 * 60 * 1000;
const HOURLY_BUDGET: u32 = 900;
const MAX_PAGES_KEPT: usize = 5000;
const FIELDS: &str = "uuid,label,isLocatedAt.geo,isLocatedAt.address,hasContact.homepage,hasDescription.shortDescription,hasMainRepresentation,hasBeenCreatedBy.legalName,lastUpdateDatatourisme";

const KINDS: [(&str, &[&str]); 5] = [
    (
        "museums",
        &[
            "Museum",
            "ArtGalleryOrExhibitionGallery",
            "InterpretationCentre",
        ],
    ),
    (
        "nature",
        &[
            "NaturalHeritage",
            "ParkAndGarden",
            "NaturalPark",
            "NaturalCuriosity",
            "Lake",
            "Waterfall",
            "CaveSinkholeOrAven",
            "Gorge",
            "Canyon",
            "PointOfView",
            "OutstandingTree",
            "Forest",
            "Beach",
        ],
    ),
    (
        "hiking",
        &[
            "WalkingTour",
            "CyclingTour",
            "HorseTour",
            "EducationalTrail",
        ],
    ),
    (
        "experiences",
        &[
            "ThemePark",
            "AdventurePark",
            "LeisureComplex",
            "ZooAnimalPark",
            "VivariumAquarium",
            "MiniGolf",
            "BowlingAlley",
            "IceSkatingRink",
            "SummerToboggan",
            "TeachingFarm",
            "TouristTrain",
            "SightseeingBoat",
        ],
    ),
    (
        "wellbeing",
        &[
            "Spa",
            "SpaResort",
            "ThalassotherapyCentre",
            "BalneotherapyCentre",
            "Hammam",
            "SwimmingPool",
        ],
    ),
];

type Answer = (f64, Vec<JsonValue>);
static PAGES: LazyLock<Mutex<IndexMap<String, (Answer, i64)>>> = LazyLock::new(Mutex::default);
static BUDGET: Mutex<(i64, u32)> = Mutex::new((0, 0));

/// `TOURISM_KINDS[kind]`: the DATAtourisme classes a tourism kind reads.
pub(super) fn kind(kind: &str) -> Option<&'static [&'static str]> {
    KINDS
        .iter()
        .find(|(name, _)| *name == kind)
        .map(|(_, classes)| *classes)
}

// A DATAtourisme value: a plain value, a list of them, or a language map (`{ "@fr": … }`).
fn first(value: Option<&JsonValue>) -> Option<&JsonValue> {
    match value {
        Some(JsonValue::Array(items)) => first(items.first()),
        value => value,
    }
}

fn french(value: Option<&JsonValue>) -> String {
    match value {
        Some(value @ JsonValue::Object(_)) => text(first(value.get("@fr"))),
        value => text(first(value)),
    }
}

fn spend(now: i64) -> bool {
    let hour = now.div_euclid(HOUR_MS);
    let mut budget = BUDGET.lock().expect("tourism budget");
    if budget.0 != hour {
        *budget = (hour, 0);
    }
    if budget.1 >= HOURLY_BUDGET {
        return false;
    }
    budget.1 += 1;
    true
}

// The photo of a place with its credits, else none (a picture without its credits is not shown).
fn photo(poi: &JsonValue) -> (String, String) {
    let media = first(poi.get("hasMainRepresentation"));
    let credits =
        french(first(media.and_then(|m| m.get("hasAnnotation"))).and_then(|a| a.get("credits")));
    let resource = first(media.and_then(|m| m.get("hasRelatedResource")));
    let image = https_url(first(resource.and_then(|r| r.get("locator"))));
    if !image.is_empty() && !credits.is_empty() {
        (image, credits)
    } else {
        (String::new(), String::new())
    }
}

fn entry_of(kind: &str, poi: &JsonValue, spec: &Spec) -> JsonValue {
    let place = first(poi.get("isLocatedAt")).filter(|p| crate::vault_router::js::truthy(Some(p)));
    let address = first(place.and_then(|p| p.get("address")))
        .filter(|a| crate::vault_router::js::truthy(Some(a)));
    let geo = place.and_then(|p| p.get("geo"));
    let (lat, lon) = (
        number(geo.and_then(|g| g.get("latitude"))),
        number(geo.and_then(|g| g.get("longitude"))),
    );
    let title = french(poi.get("label"));
    let last_update = crate::vault_router::js::slice(&text(poi.get("lastUpdateDatatourisme")), 10);
    let (image, credit) = photo(poi);
    // The licence asks for the producer of each record and its last update.
    let source: Vec<String> = [
        french(poi.get("hasBeenCreatedBy").and_then(|c| c.get("legalName"))),
        last_update,
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect();
    json!({ "id": format!("{kind}_{}", text(poi.get("uuid"))), "kind": "place", "title": title, "place": title,
        "summary": french(first(poi.get("hasDescription")).and_then(|d| d.get("shortDescription"))),
        "address": french(address.and_then(|a| a.get("streetAddress"))),
        "city": french(address.and_then(|a| a.get("addressLocality"))),
        "lat": crate::vault_router::js::number_json(lat), "lon": crate::vault_router::js::number_json(lon),
        "distanceKm": distance(spec, lat, lon),
        "url": https_url(first(first(poi.get("hasContact")).and_then(|c| c.get("homepage")))),
        "image": image, "credit": credit, "source": source.join(", ") })
}

/// `readTourism(kind, spec)`: one page of a tourism kind around the position.
pub(super) async fn read(spec: &Spec, key: &str, now: i64) -> Result<Answer, Failed> {
    let classes = kind(&spec.kind).expect("tourism kind");
    let page = spec.offset / PAGE_SIZE + 1;
    let cell = format!(
        "{}|{:.2}|{:.2}|{}|{}|{page}",
        spec.kind,
        spec.lat,
        spec.lon,
        number_text(spec.radius_km),
        spec.query
    );
    if let Some((answer, at)) = PAGES.lock().expect("tourism pages").get(&cell)
        && now - at < PAGE_TTL_MS
    {
        return Ok(answer.clone());
    }
    if !spend(now) {
        return Err(("shows_tourism_busy".into(), 0));
    }
    let mut params = vec![
        ("filters", format!("type[in]={}", classes.join(","))),
        (
            "geo_distance",
            format!(
                "{},{},{}km",
                number_text(spec.lat),
                number_text(spec.lon),
                number_text(spec.radius_km)
            ),
        ),
        ("lang", "fr".into()),
        ("fields", FIELDS.into()),
        ("page", page.to_string()),
        ("page_size", PAGE_SIZE.to_string()),
    ];
    if !spec.query.is_empty() {
        params.push(("search", spec.query.clone()));
    }
    let payload = read_json(
        client()
            .get(format!("{API}?{}", form(&params)))
            .header("X-API-Key", key),
    )
    .await?;
    let entries: Vec<JsonValue> = payload
        .get("objects")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|poi| entry_of(&spec.kind, poi, spec))
        .filter(|entry| {
            !text(entry.get("title")).is_empty()
                && entry["lat"].as_f64().is_some()
                && entry["lon"].as_f64().is_some()
        })
        .collect();
    let answer = (
        total(payload.get("meta").and_then(|meta| meta.get("total"))),
        entries,
    );
    let mut pages = PAGES.lock().expect("tourism pages");
    if pages.len() >= MAX_PAGES_KEPT {
        pages.shift_remove_index(0);
    }
    // A cell kept again keeps its place, as a Map's `set` does.
    pages.insert(cell, (answer.clone(), now));
    Ok(answer)
}
