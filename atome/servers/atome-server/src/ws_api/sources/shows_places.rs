// The places of `shows-nearby` (server/ws_shows.js `readPlaces`, ported): the places of France from
// OpenStreetMap (OpenDataSoft, no key, ODbL), nearest first (or by name), with their own website
// (sessions are never invented here) and the card facts their record fills.
use super::common::{number, text};
use super::shows::{
    Failed, ODS, PAGE_SIZE, Spec, distance, geo, https_url, point, read_json, results, total,
};
use crate::providers::http::{client, form};
use crate::vault_router::js;
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::sync::LazyLock;

/// What a place kind reads: its OpenStreetMap dataset, the `type` values it keeps and its fields.
pub(super) struct Place {
    pub kind: &'static str,
    dataset: &'static str,
    types: &'static [&'static str],
    fields: &'static str,
}

pub(super) const PLACES: [Place; 5] = [
    Place {
        kind: "cinemas",
        dataset: "osm-france-cinema",
        types: &[],
        fields: "website,phone",
    },
    Place {
        kind: "heritage",
        dataset: "osm-france-historic",
        fields: "type,website,wikipedia,description,ref_mhs,civilization",
        types: &[
            "castle",
            "manor",
            "fort",
            "city_gate",
            "citywalls",
            "tower",
            "ruins",
            "archaeological_site",
            "monument",
            "church",
            "chapel",
            "monastery",
            "place_of_worship",
        ],
    },
    Place {
        kind: "restaurants",
        dataset: "osm-france-food-service",
        types: &["restaurant", "cafe"],
        fields: "type,website,phone,cuisine,opening_hours",
    },
    // Every staffed lodging of OpenStreetMap's tourism=*; an unstaffed wilderness hut is not one.
    Place {
        kind: "lodging",
        dataset: "osm-france-tourism-accommodation",
        types: &[
            "hotel",
            "motel",
            "guest_house",
            "hostel",
            "apartment",
            "chalet",
            "camp_site",
            "caravan_site",
            "alpine_hut",
        ],
        fields: "type,website,phone,email,stars,rooms",
    },
    Place {
        kind: "bars",
        dataset: "osm-france-food-service",
        types: &["bar", "pub", "biergarten"],
        fields: "type,website,phone,cuisine,opening_hours",
    },
];

// `encodeURIComponent`: everything but `A-Z a-z 0-9 - _ . ! ~ * ' ( )`.
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

// A thermal establishment: its own name says it (« Les Thermes », « Établissement thermal »).
static THERMAL_NAME: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)(^|[\s'’-])(thermes?|thermal|thermale|thermaux)($|[\s'’-])")
        .expect("thermal")
});

// `/^([a-z]{2,3}):(.+)$/.exec(value)`: a Wikipedia reference of OpenStreetMap (`fr:Château de Versailles`).
fn wikipedia_reference(value: &str) -> Option<(&str, &str)> {
    let (language, title) = value.split_once(':')?;
    let language_ok =
        (2..=3).contains(&language.len()) && language.bytes().all(|b| b.is_ascii_lowercase());
    let title_ok = !title.is_empty() && !title.contains(['\n', '\r', '\u{2028}', '\u{2029}']);
    (language_ok && title_ok).then_some((language, title))
}

fn wikipedia_url(value: Option<&JsonValue>) -> String {
    match wikipedia_reference(&text(value)) {
        Some((language, title)) => {
            let title = utf8_percent_encode(&title.replace(' ', "_"), COMPONENT).to_string();
            https_url(Some(&json!(format!(
                "https://{language}.wikipedia.org/wiki/{title}"
            ))))
        }
        None => String::new(),
    }
}

// `/^[^@\s]+@[^@\s]+$/`.
fn email_shape(value: &str) -> bool {
    let mut parts = value.split('@');
    let plain = |part: &str| !part.is_empty() && !part.chars().any(char::is_whitespace);
    matches!((parts.next(), parts.next(), parts.next()), (Some(a), Some(b), None) if plain(a) && plain(b))
}

// A place's card facts, only those its record fills.
fn place_facts(record: &JsonValue) -> JsonMap<String, JsonValue> {
    let (stars, rooms) = (number(record.get("stars")), number(record.get("rooms")));
    let integral = |n: f64| n.is_finite() && n.fract() == 0.0;
    let wikipedia = text(record.get("wikipedia"));
    let wiki = wikipedia_reference(&wikipedia).map_or("", |(_, title)| title);
    let cuisine: Vec<String> = match record.get("cuisine") {
        Some(JsonValue::Array(items)) => items.iter().map(|item| text(Some(item))).collect(),
        value => text(value)
            .split(';')
            .map(|item| js::trim(item).to_string())
            .collect(),
    };
    let cuisine: Vec<String> = cuisine
        .into_iter()
        .filter(|item| !item.is_empty())
        .collect();
    let email = text(record.get("email"));
    let ref_mhs = text(record.get("ref_mhs"));
    let facts = [
        ("type", json!(text(record.get("type")))),
        (
            "stars",
            json!(if integral(stars) && stars > 0.0 && stars <= 5.0 {
                stars as i64
            } else {
                0
            }),
        ),
        (
            "rooms",
            json!(if integral(rooms) && rooms > 0.0 {
                js::number_json(rooms)
            } else {
                json!(0)
            }),
        ),
        (
            "email",
            json!(if email_shape(&email) {
                email
            } else {
                String::new()
            }),
        ),
        ("cuisine", json!(cuisine)),
        ("hours", json!(text(record.get("opening_hours")))),
        ("description", json!(text(record.get("description")))),
        ("listed", json!(!ref_mhs.is_empty())),
        ("mhs", json!(ref_mhs)),
        ("era", json!(text(record.get("civilization")))),
        ("wikipedia", json!(js::trim(wiki))),
    ];
    facts
        .into_iter()
        .filter(|(_, value)| match value {
            JsonValue::Array(items) => !items.is_empty(),
            value => js::truthy(Some(value)),
        })
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

pub(super) async fn read(spec: &Spec) -> Result<(f64, Vec<JsonValue>), Failed> {
    let place = PLACES
        .iter()
        .find(|place| place.kind == spec.kind)
        .expect("place kind");
    let mut clauses = vec![
        format!(
            "within_distance(meta_geo_point, {}, {}km)",
            point(spec),
            super::common::number_text(spec.radius_km)
        ),
        "name is not null".to_string(),
    ];
    if !place.types.is_empty() {
        let types: Vec<String> = place
            .types
            .iter()
            .map(|kind| format!("type = \"{kind}\""))
            .collect();
        clauses.push(format!("({})", types.join(" or ")));
    }
    if !spec.query.is_empty() {
        let q = &spec.query;
        clauses.push(format!("(name like \"{q}\" or meta_name_com like \"{q}\")"));
    }
    let order = if spec.sort == "name" {
        "name".to_string()
    } else {
        format!("distance(meta_geo_point, {})", point(spec))
    };
    let params = form(&[
        ("where", clauses.join(" and ")),
        ("order_by", order),
        ("limit", PAGE_SIZE.to_string()),
        ("offset", spec.offset.to_string()),
        (
            "select",
            format!(
                "meta_osm_id,name,meta_name_com,meta_geo_point,meta_last_update,{}",
                place.fields
            ),
        ),
    ]);
    let payload =
        read_json(client().get(format!("{ODS}/{}/records?{params}", place.dataset))).await?;
    let entries = results(&payload, "results")
        .iter()
        .filter(|record| !text(record.get("name")).is_empty())
        .map(|record| {
            let (lat, lon) = geo(record.get("meta_geo_point"));
            let facts = place_facts(record);
            let last_update = text(record.get("meta_last_update"));
            let updated = js::slice(&last_update, 10);
            let dated = updated.len() == 10
                && updated.bytes().enumerate().all(|(at, b)| if at == 4 || at == 7 { b == b'-' } else { b.is_ascii_digit() });
            let name = text(record.get("name"));
            let website = https_url(record.get("website"));
            let mut entry = json!({ "id": format!("{}_{}", spec.kind, text(record.get("meta_osm_id"))),
                "kind": if spec.kind == "cinemas" { "cinema" } else { "place" }, "title": name, "place": name,
                "city": text(record.get("meta_name_com")), "lat": js::number_json(lat), "lon": js::number_json(lon),
                "distanceKm": distance(spec, lat, lon), "phone": text(record.get("phone")),
                "url": if website.is_empty() { wikipedia_url(record.get("wikipedia")) } else { website },
                "image": "", "source": "© OpenStreetMap" });
            if !facts.is_empty() {
                entry["facts"] = JsonValue::Object(facts);
            }
            if dated {
                entry["updated"] = json!(updated);
            }
            if THERMAL_NAME.is_match(&name) {
                entry["thermal"] = json!(true);
            }
            entry
        })
        .collect();
    Ok((total(payload.get("total_count")), entries))
}
