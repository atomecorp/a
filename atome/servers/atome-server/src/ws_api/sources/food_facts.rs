// `food-facts` (server/ws_open_food_facts.js, ported): the public Open Food Facts provider, no
// account: `lookup {barcode, source?}` → { product }, `search {query, source?, limit?}` →
// { products }, `alternatives {barcode}` → { product, alternatives, to_check }. Sources: off = Open
// Food Facts, obf = Open Beauty Facts, opf = Open Products Facts. OFF requires an identifying
// User-Agent (OPEN_FOOD_FACTS_USER_AGENT) and caps each IP address at 15 product reads and 10
// searches per minute (going over can ban the address). Every user reaches OFF through this one
// server address, so the global windows stay below those caps, a per-address window shares them
// out, and the server keeps products, searches and the additives taxonomy in memory for their
// lifetime so repeated questions never reach OFF again. Data licence: ODbL.
use super::Asker;
use super::common::{length, number, ok_with, or_empty, reply, request_id, setting, warn};
use super::food_health::{Risks, database, normalize};
use super::food_requests::{
    Failure, PRODUCTS, READS, SEARCH_WINDOWS, SEARCHES, body_json, consume, failure, json, request,
    risks_or_unknown, thrown,
};
use crate::providers::http;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::sync::{Arc, LazyLock};

const KIND: &str = "food-facts";
const FOOD_SEARCH_ENDPOINT: &str = "https://search.openfoodfacts.org/search";
const FIELDS: &str = "code,product_name,brands,quantity,image_url,nutriscore_grade,nova_group,ecoscore_grade,additives_tags,\
ingredients_n,allergens_tags,traces_tags,nutriments,categories_tags,ingredients_text,lang,origins,manufacturing_places,\
completeness,last_modified_t";
const ALTERNATIVE_COUNT: usize = 3;
// The product page and the search index tag categories slightly differently: the most specific
// category and its two parents are searched in one query, and candidates matching the most
// specific one rank first.
const ALTERNATIVE_DEPTH: usize = 3;
const ERROR_CODES: [&str; 5] = [
    "INVALID_ARGUMENT",
    "NOT_CONFIGURED",
    "RATE_LIMITED",
    "PRODUCT_NOT_FOUND",
    "PROVIDER_UNAVAILABLE",
];
// `PRODUCT_HOSTS[source]` is truthy for these too (Object.prototype's own names): their « host »
// makes no address, so their request fails as an unparsable URL does.
const PROTOTYPE_NAMES: [&str; 12] = [
    "constructor",
    "__defineGetter__",
    "__defineSetter__",
    "hasOwnProperty",
    "__lookupGetter__",
    "__lookupSetter__",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toString",
    "valueOf",
    "__proto__",
    "toLocaleString",
];

static BARCODE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^[0-9]{8,14}$").expect("barcode"));
static CATEGORY: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new("^en:[a-z0-9-]+$").expect("category"));
// The search index reads Lucene syntax; a shopper's words are plain text.
static LUCENE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r#"[:"()\[\]{}^~*?\\/!+&|-]+"#).expect("lucene"));
// JavaScript's `\s`.
static SPACES: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new("[\t\n\u{b}\u{c}\r \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]+")
        .expect("spaces")
});

// `PRODUCT_HOSTS[source]`, a prototype name making no address.
fn host(source: &str) -> Result<&'static str, Failure> {
    database(source)
        .map(|(host, _)| host)
        .ok_or_else(|| thrown("TypeError", "Failed to parse URL"))
}

fn normalized(
    raw: &JsonValue,
    source: &str,
    risks: Option<&Arc<Risks>>,
) -> Result<JsonValue, Failure> {
    normalize(raw, source, risks.map(Arc::as_ref)).map_err(|cause| thrown("RangeError", &cause))
}

async fn lookup(
    barcode: &str,
    source: &str,
    address: &str,
    agent: &str,
    id: &JsonValue,
) -> Result<JsonValue, Failure> {
    let key = format!("{source}:{barcode}");
    if let Some(product) = PRODUCTS.get(&key) {
        return Ok(product);
    }
    let risks = risks_or_unknown(agent, id).await;
    consume(&READS, (10, 14), address)?;
    let response = request(
        &format!("{}/api/v2/product/{barcode}?fields={FIELDS}", host(source)?),
        agent,
    )
    .await?;
    let status = response.status().as_u16();
    if status == 404 {
        return Err(failure("PRODUCT_NOT_FOUND", "PRODUCT_NOT_FOUND"));
    }
    if !response.status().is_success() {
        return Err(failure(
            "PROVIDER_UNAVAILABLE",
            &format!("upstream_status_{status}"),
        ));
    }
    let payload = body_json(response).await?;
    let product = payload
        .get("product")
        .filter(|product| js::truthy(Some(product)));
    let (Some(product), Some(1.0)) = (product, payload.get("status").and_then(JsonValue::as_f64))
    else {
        return Err(failure("PRODUCT_NOT_FOUND", "PRODUCT_NOT_FOUND"));
    };
    let code = js::first(product, &["code"])
        .cloned()
        .unwrap_or_else(|| json!(barcode));
    let raw = js::with(
        &json!(product.as_object().cloned().unwrap_or_default()),
        [("code", code)],
    );
    let product = normalized(&raw, source, risks.as_ref())?;
    if risks.is_some() {
        PRODUCTS.set(key, product.clone());
    }
    Ok(product)
}

async fn search(
    url: Result<String, Failure>,
    list: &str,
    source: &str,
    address: &str,
    agent: &str,
) -> Result<Vec<JsonValue>, Failure> {
    if let Ok(url) = &url
        && let Some(JsonValue::Array(found)) = SEARCHES.get(url)
    {
        return Ok(found);
    }
    let risks = risks_or_unknown(agent, &JsonValue::Null).await;
    consume(&SEARCH_WINDOWS, (5, 8), address)?;
    let url = url?;
    let payload = json(&url, agent).await?;
    let entries = match payload
        .get(list)
        .filter(|entries| js::truthy(Some(entries)))
    {
        None => Vec::new(),
        Some(JsonValue::Array(entries)) => entries.clone(),
        Some(_) => return Err(thrown("TypeError", "listOf(...).filter is not a function")),
    };
    let found = entries
        .iter()
        .filter(|raw| BARCODE.is_match(&or_empty(raw.get("code"))))
        .map(|raw| normalized(raw, source, risks.as_ref()))
        .collect::<Result<Vec<_>, _>>()?;
    if risks.is_some() {
        SEARCHES.set(url, JsonValue::Array(found.clone()));
    }
    Ok(found)
}

async fn search_by_text(
    query: &str,
    source: &str,
    limit: f64,
    address: &str,
    agent: &str,
) -> Result<Vec<JsonValue>, Failure> {
    let size = js::number_json(limit).to_string();
    if source == "off" {
        let words = SPACES
            .replace_all(&LUCENE.replace_all(query, " "), " ")
            .into_owned();
        let params = [
            ("q", js::trim(&words)),
            ("page_size", &size),
            ("fields", FIELDS),
        ];
        return search(
            Ok(format!("{FOOD_SEARCH_ENDPOINT}?{}", http::form(&params))),
            "hits",
            source,
            address,
            agent,
        )
        .await;
    }
    let params = [
        ("search_terms", query),
        ("json", "1"),
        ("page_size", &size),
        ("fields", FIELDS),
    ];
    let url = host(source).map(|host| format!("{host}/cgi/search.pl?{}", http::form(&params)));
    search(url, "products", source, address, agent).await
}

fn grade_index(product: &JsonValue) -> usize {
    product["nutriscore"]
        .as_str()
        .and_then(|grade| "abcde".find(grade))
        .unwrap_or(usize::MAX)
}

fn categories(product: &JsonValue) -> Vec<String> {
    product["categories_tags"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|tag| js::text(Some(tag)))
        .collect()
}

async fn alternatives(barcode: &str, address: &str, agent: &str) -> Result<JsonValue, Failure> {
    let product = lookup(barcode, "off", address, agent, &JsonValue::Null).await?;
    let mut wanted: Vec<String> = categories(&product)
        .into_iter()
        .filter(|tag| CATEGORY.is_match(tag))
        .collect();
    wanted = wanted.split_off(wanted.len().saturating_sub(ALTERNATIVE_DEPTH));
    wanted.reverse();
    let ceiling = if product["nutriscore"].is_string() {
        grade_index(&product)
    } else {
        3
    };
    let grades: Vec<&str> = ["a", "b", "c"]
        .into_iter()
        .enumerate()
        .filter(|(index, _)| *index < ceiling)
        .map(|(_, grade)| grade)
        .collect();
    if wanted.is_empty() || grades.is_empty() {
        return Ok(json!({ "product": product, "alternatives": [], "to_check": [] }));
    }
    let quoted: Vec<String> = wanted.iter().map(|tag| format!("\"{tag}\"")).collect();
    let query = format!(
        "categories_tags:({}) AND nutriscore_grade:({})",
        quoted.join(" OR "),
        grades.join(" OR ")
    );
    let params = [
        ("q", query.as_str()),
        ("sort_by", "nutriscore_grade"),
        ("page_size", "50"),
        ("fields", FIELDS),
    ];
    let url = format!("{FOOD_SEARCH_ENDPOINT}?{}", http::form(&params));
    let candidates = search(Ok(url), "hits", "off", address, agent).await?;
    let mut ranked: Vec<(usize, &JsonValue)> = candidates
        .iter()
        .filter(|candidate| {
            candidate["barcode"] != barcode && js::truthy(candidate.get("nutriscore"))
        })
        .filter_map(|candidate| {
            let tags = categories(candidate);
            wanted
                .iter()
                .position(|tag| tags.contains(tag))
                .map(|depth| (depth, candidate))
        })
        .collect();
    ranked.sort_by(|(a_depth, a), (b_depth, b)| {
        a_depth
            .cmp(b_depth)
            .then(grade_index(a).cmp(&grade_index(b)))
            .then(js::text(a.get("barcode")).cmp(&js::text(b.get("barcode"))))
    });
    let first = |test: &dyn Fn(&JsonValue) -> bool| -> Vec<JsonValue> {
        ranked
            .iter()
            .filter(|(_, candidate)| test(candidate))
            .take(ALTERNATIVE_COUNT)
            .map(|(_, candidate)| (*candidate).clone())
            .collect()
    };
    // The ones the selection policy cannot check come apart, never among the proposals.
    Ok(
        json!({ "product": product, "alternatives": first(&|candidate| candidate["verdict"] == "good"),
        "to_check": first(&|candidate| candidate["selection"]["state"] == "to_check") }),
    )
}

fn known_source(source: &str) -> bool {
    database(source).is_some() || PROTOTYPE_NAMES.contains(&source)
}

pub(super) async fn answer(asker: &Asker<'_>, message: &JsonValue) -> Result<JsonValue, String> {
    let id = request_id(message);
    let action = or_empty(message.get("action"));
    let barcode = js::trim(&or_empty(message.get("barcode"))).to_string();
    let query = js::trim(&or_empty(message.get("query"))).to_string();
    let source = message
        .get("source")
        .map_or_else(|| "off".to_string(), |source| js::text(Some(source)));
    let limit = message
        .get("limit")
        .map_or(10.0, |limit| number(Some(limit)));
    let valid = match action.as_str() {
        "lookup" => BARCODE.is_match(&barcode) && known_source(&source),
        "search" => {
            !query.is_empty()
                && length(&query) <= 120
                && known_source(&source)
                && limit.fract() == 0.0
                && (1.0..=20.0).contains(&limit)
        }
        "alternatives" => BARCODE.is_match(&barcode),
        _ => false,
    };
    if !valid {
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "INVALID_ARGUMENT" }),
        ));
    }
    let agent = js::trim(&setting("OPEN_FOOD_FACTS_USER_AGENT")?.unwrap_or_default()).to_string();
    if agent.is_empty() {
        warn(
            "open_food_facts",
            &id,
            "NOT_CONFIGURED",
            json!({ "missing": "OPEN_FOOD_FACTS_USER_AGENT" }),
        );
        return Ok(reply(
            KIND,
            message,
            json!({ "ok": false, "error": "NOT_CONFIGURED" }),
        ));
    }
    let address = asker.address;
    let answered = match action.as_str() {
        "lookup" => lookup(&barcode, &source, address, &agent, &id)
            .await
            .map(|product| json!({ "ok": true, "product": product })),
        "search" => search_by_text(&query, &source, limit, address, &agent)
            .await
            .map(|products| json!({ "ok": true, "products": products })),
        _ => alternatives(&barcode, address, &agent).await.map(ok_with),
    };
    Ok(reply(
        KIND,
        message,
        answered.unwrap_or_else(|error| {
            let code = error
                .code
                .filter(|code| ERROR_CODES.contains(code))
                .unwrap_or("PROVIDER_UNAVAILABLE");
            if code == "PROVIDER_UNAVAILABLE" || error.cause == "upstream_429" {
                // The client only receives a stable code; the real cause stays in the server log.
                warn(
                    "open_food_facts",
                    &id,
                    code,
                    json!({ "action": action, "exception": error.name,
                "cause": js::slice(&error.cause, 300) }),
                );
            }
            json!({ "ok": false, "error": code })
        }),
    ))
}
