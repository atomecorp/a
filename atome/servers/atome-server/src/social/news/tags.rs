// A News publication's tags (server/news_broadcast.js `slugifyTag`, `normalizeTags`,
// `acceptsTags`): the slug is computed as the client's `slugifyNewsTag`
// (eVe/domains/news/news_tag_vocabulary.js), so both sides name a tag alike.
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashSet;

/// Lowered, its accents dropped (NFD, then no combining mark U+0300–U+036F), every run outside
/// `[a-z0-9]` one `_`, none at either end.
pub fn slugify(value: &str) -> String {
    let lowered = js::trim(value).to_lowercase();
    let decomposed = icu_normalizer::DecomposingNormalizerBorrowed::new_nfd().normalize(&lowered);
    let mut slug = String::new();
    let mut gap = false;
    for character in decomposed
        .chars()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
    {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            if gap && !slug.is_empty() {
                slug.push('_');
            }
            gap = false;
            slug.push(character);
        } else {
            gap = true;
        }
    }
    slug
}

// `String(value == null ? '' : value)`.
fn text_of(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::string(value),
    }
}

// `a || b` over two JSON values.
fn either<'a>(a: Option<&'a JsonValue>, b: Option<&'a JsonValue>) -> Option<&'a JsonValue> {
    if js::truthy(a) { a } else { b }
}

/// Up to 32 distinct `{ slug, label }`, a slug of 80 characters at most, a label of 120.
pub fn normalize(input: Option<&JsonValue>) -> Vec<JsonValue> {
    let mut seen = HashSet::new();
    let mut tags = Vec::new();
    for entry in input.and_then(JsonValue::as_array).into_iter().flatten() {
        let (label_source, slug_source) = match entry {
            JsonValue::String(_) => (Some(entry), Some(entry)),
            _ => (
                either(entry.get("label"), entry.get("slug")),
                either(entry.get("slug"), entry.get("label")),
            ),
        };
        let label = js::trim(&text_of(label_source)).to_string();
        let slug = slugify(&text_of(slug_source));
        if slug.is_empty() || slug.encode_utf16().count() > 80 || seen.contains(&slug) {
            continue;
        }
        let label = if label.is_empty() {
            slug.clone()
        } else {
            label
        };
        seen.insert(slug.clone());
        tags.push(json!({ "slug": slug, "label": js::slice(&label, 120) }));
        if tags.len() >= 32 {
            break;
        }
    }
    tags
}

/// An empty whitelist takes every publication, else one tag in common.
pub fn accepts(whitelist: &JsonValue, tags: &JsonValue) -> bool {
    let Some(whitelist) = whitelist.as_array().filter(|list| !list.is_empty()) else {
        return true;
    };
    let slugs: Vec<&JsonValue> = tags
        .as_array()
        .into_iter()
        .flatten()
        .map(|tag| tag.get("slug").unwrap_or(&JsonValue::Null))
        .collect();
    whitelist.iter().any(|slug| slugs.contains(&slug))
}
