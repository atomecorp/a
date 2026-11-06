// A project's atomes → the static pages of its public site (server/site_projection.js, ported;
// decisions Q1, Q2, Q5, Q6, Q8, Q9, Q12, Q17 of todo/publication_web_2026-10-28.md). A
// projection, never a truth nor an editor: the version it makes is frozen and served as is.
// Text, shapes, images, video and sound become HTML; a link is the object's « Aller »
// interaction; a contact form posts to the server. What a web page cannot show is reported,
// never silently dropped.
use super::contract::{self, SITE_FORM_PROPERTY};
use super::css::{css_number, ink_on, stylesheet};
use super::objects::{Context, Item, Link, escape_html, row_html, rows_of};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::{HashMap, HashSet};

pub const MEDIA_TYPES: [&str; 5] = ["image", "video", "audio", "sound", "svg"];
const SHOWN_TYPES: [&str; 9] = [
    "text", "shape", "form", "group", "image", "video", "audio", "sound", "svg",
];

/// `parse(value)`: a JSON text read back, else the value as it is.
pub fn parse(value: Option<&JsonValue>) -> Option<JsonValue> {
    match value {
        Some(JsonValue::String(raw)) => {
            Some(serde_json::from_str(raw).unwrap_or_else(|_| JsonValue::String(raw.clone())))
        }
        value => value.cloned(),
    }
}

// `String(value)`.
fn text_of(value: &JsonValue) -> String {
    js::text(Some(value))
}

fn id_of(record: &JsonValue) -> String {
    js::first(record, &["atome_id", "id"])
        .map(text_of)
        .unwrap_or_default()
}

fn props_of(record: &JsonValue) -> &JsonValue {
    record
        .get("properties")
        .filter(|value| js::truthy(Some(value)))
        .unwrap_or(&JsonValue::Null)
}

fn parent_of(record: &JsonValue) -> String {
    [
        record.pointer("/meta/parent_id"),
        record.get("parent_id"),
        props_of(record).get("parent_id"),
    ]
    .into_iter()
    .find(|value| js::truthy(*value))
    .flatten()
    .map(text_of)
    .unwrap_or_default()
}

fn is_form(record: &JsonValue) -> bool {
    matches!(
        props_of(record).get(SITE_FORM_PROPERTY),
        Some(JsonValue::Bool(true))
    ) || props_of(record)
        .get(SITE_FORM_PROPERTY)
        .and_then(JsonValue::as_str)
        == Some("true")
}

fn type_of(record: &JsonValue) -> String {
    if is_form(record) {
        return "form".into();
    }
    [
        record.get("type"),
        record.get("kind"),
        props_of(record).get("type"),
    ]
    .into_iter()
    .find(|value| js::truthy(*value))
    .flatten()
    .map(text_of)
    .unwrap_or_default()
    .to_lowercase()
}

fn item_of(record: &JsonValue) -> Item<'_> {
    let p = props_of(record);
    Item {
        id: id_of(record),
        kind: type_of(record),
        props: p,
        left: css_number(p.get("left"), 0.0),
        top: css_number(p.get("top"), 0.0),
        width: css_number(p.get("width"), 0.0),
        height: css_number(p.get("height"), 0.0),
        style: String::new(),
    }
}

// Every descendant of a page (a group or a nested page lays its own members at their canvas
// place). A contact form's members are its look in the editor: the form stands for them.
fn descendants<'a>(records: &'a [JsonValue], root: &str) -> Result<Vec<&'a JsonValue>, String> {
    let mut children: HashMap<String, Vec<&JsonValue>> = HashMap::new();
    for record in records {
        children.entry(parent_of(record)).or_default().push(record);
    }
    let (mut out, mut walked) = (Vec::new(), HashSet::new());
    let mut stack = vec![(root.to_string(), 0usize)];
    // Depth first, in the records' order, as the recursive walk of the original.
    while let Some((id, at)) = stack.pop() {
        let Some(child) = children.get(&id).and_then(|list| list.get(at)) else {
            continue;
        };
        stack.push((id, at + 1));
        out.push(*child);
        if !is_form(child) {
            let child_id = id_of(child);
            if !walked.insert(child_id.clone()) {
                return Err("site_page_cycle".into());
            }
            stack.push((child_id, 0));
        }
    }
    Ok(out)
}

fn goto_of(record: &JsonValue) -> Option<JsonValue> {
    match parse(props_of(record).get("actions")) {
        Some(JsonValue::Array(actions)) => actions
            .into_iter()
            .find(|action| action.get("tool_id").and_then(JsonValue::as_str) == Some("site.goto")),
        _ => None,
    }
}

// « Aller » interactions: the object touched → its link.
fn links_of(
    records: &[JsonValue],
    href_of_page: &dyn Fn(&str) -> Option<String>,
) -> HashMap<String, Link> {
    let mut links = HashMap::new();
    for record in records
        .iter()
        .filter(|record| type_of(record) == "interaction")
    {
        let props = props_of(record);
        let trigger = parse(props.get("trigger")).unwrap_or(JsonValue::Null);
        let enabled = props.get("enabled");
        if enabled == Some(&JsonValue::Bool(false))
            || enabled.and_then(JsonValue::as_str) == Some("false")
            || trigger.get("kind").and_then(JsonValue::as_str) != Some("activate")
            || !js::truthy(trigger.get("atome_id"))
        {
            continue;
        }
        let Some(target) = trigger.get("atome_id").and_then(JsonValue::as_str) else {
            continue;
        };
        let parameters = goto_of(record)
            .and_then(|go| parse(go.get("parameters")))
            .unwrap_or(JsonValue::Null);
        if js::truthy(parameters.get("page_id")) {
            if let Some(href) = href_of_page(&text_of(&parameters["page_id"])) {
                links.insert(
                    target.to_string(),
                    Link {
                        href,
                        new_tab: false,
                    },
                );
            }
            continue;
        }
        let url = parameters
            .get("url")
            .filter(|url| js::truthy(Some(url)))
            .map(text_of)
            .unwrap_or_default();
        let lowered = url.to_ascii_lowercase();
        if lowered.starts_with("http://") || lowered.starts_with("https://") {
            links.insert(
                target.to_string(),
                Link {
                    href: url,
                    new_tab: parameters.get("new_tab") == Some(&JsonValue::Bool(true)),
                },
            );
        }
    }
    links
}

pub struct Wanted<'a> {
    pub project_id: &'a str,
    pub site_id: &'a str,
    pub slug: &'a str,
    pub title: &'a str,
    pub description: &'a str,
    pub page_ids: Option<&'a [String]>,
    pub credit: bool,
    /// Atome id → public address of its file (resolved by the caller, publishing.rs).
    pub media: &'a HashMap<String, String>,
    pub origin: &'a str,
    /// Where the pages are served (the site's address, or a preview's).
    pub base: Option<&'a str>,
}

/// A page made: its manifest entry, then its HTML.
pub struct Page {
    pub entry: JsonValue,
    pub slug: String,
    pub html: String,
}

pub struct Projected {
    pub pages: Vec<Page>,
    pub issues: Vec<JsonValue>,
    pub error: Option<&'static str>,
    pub home: String,
    pub title: String,
}

/// `projectSite`.
pub fn project_site(records: &[JsonValue], wanted: &Wanted<'_>) -> Result<Projected, String> {
    let base = wanted
        .base
        .map_or_else(|| format!("/{}/", wanted.slug), str::to_string);
    let all = contract::site_pages(records, wanted.project_id);
    let pages: Vec<&JsonValue> = match wanted.page_ids.filter(|ids| !ids.is_empty()) {
        Some(ids) => all
            .into_iter()
            .filter(|page| ids.contains(&id_of(page)))
            .collect(),
        None => all,
    };
    let mut issues = Vec::new();
    let Some(home) = contract::home_index(&pages) else {
        return Ok(Projected {
            pages: Vec::new(),
            issues,
            error: Some("NO_PAGE"),
            home: String::new(),
            title: String::new(),
        });
    };
    let slugs = contract::page_slugs(&pages);
    let href_of_page = |id: &str| {
        slugs.get(id).map(|slug| {
            if slug.is_empty() {
                base.clone()
            } else {
                format!("{base}{slug}/")
            }
        })
    };
    let links = links_of(records, &href_of_page);
    for record in records
        .iter()
        .filter(|record| type_of(record) == "interaction")
    {
        let target = goto_of(record)
            .and_then(|go| parse(go.get("parameters")))
            .and_then(|parameters| parameters.get("page_id").cloned())
            .filter(|target| js::truthy(Some(target)))
            .map(|target| text_of(&target))
            .filter(|target| !slugs.contains_key(target));
        if let Some(target) = target {
            let trigger = parse(props_of(record).get("trigger"))
                .and_then(|trigger| trigger.get("atome_id").cloned())
                .filter(|id| js::truthy(Some(id)))
                .unwrap_or(json!(""));
            issues.push(
                json!({ "kind": "link_unpublished", "atome_id": trigger, "page_id": target }),
            );
        }
    }
    let title = js::trim(&if wanted.title.is_empty() {
        contract::page_name(pages[home])
    } else {
        wanted.title.to_string()
    })
    .to_string();
    let mut out = Vec::new();
    for (index, page) in pages.iter().enumerate() {
        let props = props_of(page);
        let frame = item_of(page);
        let page_id = id_of(page);
        let page_slug = slugs
            .get(&contract::id_of(page))
            .cloned()
            .unwrap_or_default();
        let items: Vec<Item<'_>> = descendants(records, &page_id)?
            .into_iter()
            .map(item_of)
            .filter(|item| item.kind != "interaction")
            .collect();
        for item in items
            .iter()
            .filter(|i| !SHOWN_TYPES.contains(&i.kind.as_str()))
        {
            issues.push(json!({ "kind": "unsupported", "atome_id": item.id, "type": item.kind, "page_id": page_id }));
        }
        let media_type = |item: &Item<'_>| MEDIA_TYPES.contains(&item.kind.as_str());
        for item in items
            .iter()
            .filter(|i| media_type(i) && !wanted.media.contains_key(&i.id))
        {
            issues
                .push(json!({ "kind": "media_missing", "atome_id": item.id, "page_id": page_id }));
        }
        let shown: Vec<Item<'_>> = items
            .into_iter()
            .filter(|i| {
                SHOWN_TYPES.contains(&i.kind.as_str())
                    && (!media_type(i) || wanted.media.contains_key(&i.id))
            })
            .map(|mut item| {
                item.left -= frame.left;
                item.top -= frame.top;
                item
            })
            .collect();
        if shown.is_empty() {
            issues.push(json!({ "kind": "page_empty", "page_id": page_id }));
        }
        let ground = [props.get("fill"), props.get("background")]
            .into_iter()
            .find(|value| js::truthy(*value))
            .flatten();
        let context = Context {
            links: &links,
            media: wanted.media,
            site_id: wanted.site_id,
            ink: ink_on(ground),
        };
        let image = shown
            .iter()
            .find(|item| item.kind == "image")
            .map(|item| item.id.clone());
        let body: String = rows_of(shown)
            .into_iter()
            .map(|row| row_html(row, &context))
            .collect();
        let name = contract::page_name(page);
        let path = if page_slug.is_empty() {
            format!("/{}/", wanted.slug)
        } else {
            format!("/{}/{page_slug}/", wanted.slug)
        };
        let page_title = if index == home {
            title.clone()
        } else {
            format!("{name} · {title}")
        };
        let at = escape_html(&format!("{}{path}", wanted.origin));
        let described = escape_html(wanted.description);
        let mut head = format!("<title>{}</title>", escape_html(&page_title));
        if !wanted.description.is_empty() {
            head.push_str(&format!(
                "<meta name=\"description\" content=\"{described}\">"
            ));
        }
        head.push_str(&format!(
            "<link rel=\"canonical\" href=\"{at}\"><meta property=\"og:title\" content=\"{}\">",
            escape_html(&page_title)
        ));
        if !wanted.description.is_empty() {
            head.push_str(&format!(
                "<meta property=\"og:description\" content=\"{described}\">"
            ));
        }
        head.push_str(&format!("<meta property=\"og:url\" content=\"{at}\">"));
        if let Some(image) = image {
            head.push_str(&format!(
                "<meta property=\"og:image\" content=\"{}\">",
                escape_html(&format!(
                    "{}{}",
                    wanted.origin,
                    wanted.media.get(&image).cloned().unwrap_or_default()
                ))
            ));
        }
        let credit = if wanted.credit {
            "<a class=\"credit\" href=\"https://atome.one\" aria-label=\"Créé avec atome\"></a>"
        } else {
            ""
        };
        let html = format!(
            "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">{head}
<style>{}</style></head>
<body style=\"color:{}\"><main class=\"page\">{body}</main>{credit}</body></html>",
            stylesheet(frame.width, frame.height, ground),
            context.ink
        );
        out.push(Page {
            entry: json!({ "page_id": page_id, "slug": page_slug, "name": name, "path": path }),
            slug: page_slug,
            html,
        });
    }
    Ok(Projected {
        pages: out,
        issues,
        error: None,
        home: id_of(pages[home]),
        title,
    })
}
