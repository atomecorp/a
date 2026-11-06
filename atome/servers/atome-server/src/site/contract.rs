// The public website of a project (atome/src/shared/site_contract.js, ported for the server): a
// site page is a Page at the root of its project (`container_kind: 'page'`), in the project's
// order (`hierarchy_order`); the home is the cover page (`page_cover`), else the first. A page's
// name is its title and its address part. Decisions Q5–Q12 of todo/publication_web_2026-10-28.md.
use crate::social::public_events::contract::clip;
use crate::vault_router::js;
use serde_json::Value as JsonValue;
use std::collections::{HashMap, HashSet};

pub const SITE_SLUG_MAX: usize = 48;
pub const SITE_ATOME_TYPE: &str = "site";
pub const SITE_FORM_PROPERTY: &str = "site_form";
// The top-level paths atome.one already serves, and the system words kept for later (Q7).
const RESERVED_SITE_SLUGS: [&str; 65] = [
    "api",
    "ws",
    "atome",
    "eve",
    "src",
    "vendor",
    "assets",
    "auth",
    "ios",
    "health",
    "healthz",
    "dev",
    "client-log",
    "application",
    "css",
    "js",
    "shared",
    "squirrel",
    "utils",
    "wasm",
    "well-known",
    "admin",
    "login",
    "logout",
    "signup",
    "static",
    "www",
    "mail",
    "help",
    "support",
    "legal",
    "terms",
    "privacy",
    "about",
    "contact",
    "sites",
    "site",
    "blog",
    "docs",
    "status",
    "app",
    "apps",
    "download",
    "downloads",
    "store",
    "shop",
    "billing",
    "account",
    "settings",
    "public",
    "media",
    "uploads",
    "cdn",
    "test",
    "robots",
    "sitemap",
    "favicon",
    "index",
    "offline",
    "sw",
    "version",
    "server-config",
    "root",
    "system",
    "atome-one",
];

/// `SITE_TRAFFIC_GB_BY_TIER`: the traffic a month each offer includes (Q15).
pub fn traffic_gb(tier: &str) -> Option<f64> {
    match tier {
        "standard" => Some(89.0),
        "plus" => Some(233.0),
        "max" => Some(610.0),
        _ => None,
    }
}

/// `siteProjectId`: the project a site belongs to, read from its id.
pub fn site_project_id(site_id: &str) -> &str {
    site_id.strip_prefix("site_").unwrap_or("")
}

/// `slugify`: lower case, no accent, words joined by hyphens.
pub fn slugify(value: &str) -> String {
    let decomposed =
        icu_normalizer::DecomposingNormalizerBorrowed::new_nfd().normalize(js::trim(value));
    let lowered: String = decomposed
        .chars()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect::<String>()
        .to_lowercase();
    let mut out = String::new();
    for c in lowered.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let joined = out.trim_matches('-');
    joined
        .chars()
        .take(SITE_SLUG_MAX)
        .collect::<String>()
        .trim_end_matches('-')
        .to_string()
}

/// `siteSlugError`: '' when the address can be used.
pub fn slug_error(slug: &str) -> &'static str {
    let value = js::trim(slug);
    if value.is_empty() {
        return "site_slug_required";
    }
    let bytes = value.as_bytes();
    let inner = |c: &u8| c.is_ascii_lowercase() || c.is_ascii_digit();
    let shaped = bytes.len() <= SITE_SLUG_MAX
        && bytes.iter().all(|c| inner(c) || *c == b'-')
        && inner(&bytes[0])
        && inner(&bytes[bytes.len() - 1]);
    if !shaped || value.contains("--") {
        return "site_slug_invalid";
    }
    if RESERVED_SITE_SLUGS.contains(&value) {
        return "site_slug_reserved";
    }
    ""
}

fn props(record: &JsonValue) -> &JsonValue {
    js::first(record, &["properties", "props"]).unwrap_or(&JsonValue::Null)
}

pub fn id_of(record: &JsonValue) -> String {
    js::trim(
        &js::first(record, &["atome_id", "id"])
            .map(js::string)
            .unwrap_or_default(),
    )
    .to_string()
}

fn is_true(value: Option<&JsonValue>) -> bool {
    matches!(value, Some(JsonValue::Bool(true)))
        || value.and_then(JsonValue::as_str) == Some("true")
        || value.and_then(JsonValue::as_f64) == Some(1.0)
}

fn is_page(record: &JsonValue) -> bool {
    clip(props(record).get("container_kind"), usize::MAX).to_lowercase() == "page"
}

fn is_deleted(record: &JsonValue) -> bool {
    record.get("deleted") == Some(&JsonValue::Bool(true))
        || is_true(props(record).get("deleted"))
        || is_true(record.pointer("/meta/deleted"))
}

fn parent_of(record: &JsonValue) -> String {
    let parent = [
        record.get("parent_id"),
        props(record).get("parent_id"),
        record.pointer("/meta/parent_id"),
    ]
    .into_iter()
    .find(|value| js::truthy(*value))
    .flatten();
    clip(parent, usize::MAX)
}

fn order_of(record: &JsonValue) -> f64 {
    let value = js::number(props(record).get("hierarchy_order"));
    if value.is_finite() {
        value
    } else {
        f64::INFINITY
    }
}

/// `sitePages`: the project's site pages, in the project's order.
pub fn site_pages<'a>(records: &'a [JsonValue], project_id: &str) -> Vec<&'a JsonValue> {
    let project = js::trim(project_id);
    let mut pages: Vec<&JsonValue> = records
        .iter()
        .filter(|record| {
            let parent = parent_of(record);
            is_page(record) && !is_deleted(record) && (parent.is_empty() || parent == project)
        })
        .collect();
    pages.sort_by(|a, b| {
        order_of(a)
            .partial_cmp(&order_of(b))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| id_of(a).cmp(&id_of(b)))
    });
    pages
}

/// `siteHomePage`: the index of the home among `pages`.
pub fn home_index(pages: &[&JsonValue]) -> Option<usize> {
    pages
        .iter()
        .position(|page| is_true(props(page).get("page_cover")))
        .or(if pages.is_empty() { None } else { Some(0) })
}

/// `sitePageName`.
pub fn page_name(page: &JsonValue) -> String {
    let name = clip(props(page).get("name"), usize::MAX);
    if name.is_empty() { "Page".into() } else { name }
}

/// `sitePageSlugs`: each page's address part, '' for the home, its name's slug otherwise, made
/// unique with -2, -3…
pub fn page_slugs(pages: &[&JsonValue]) -> HashMap<String, String> {
    let home = home_index(pages);
    let mut used: HashSet<String> = HashSet::from([String::new()]);
    let mut slugs = HashMap::new();
    for (index, page) in pages.iter().enumerate() {
        if Some(index) == home {
            slugs.insert(id_of(page), String::new());
            continue;
        }
        let mut base = slugify(&page_name(page));
        if base.is_empty() {
            base = "page".into();
        }
        let mut slug = base.clone();
        let mut n = 2;
        while used.contains(&slug) {
            slug = format!("{base}-{n}");
            n += 1;
        }
        used.insert(slug.clone());
        slugs.insert(id_of(page), slug);
    }
    slugs
}
