// What each destination allows (atome/src/squirrel/social/capabilities.js, ported): the route
// planning the server decides by, from the public account view only, never a token; the media's
// real type read from its first bytes.
//
// - TikTok: video by file upload, Direct Post (`video.publish`) or the inbox upload finished in
//   the app (`video.upload`); photos only pulled from a domain verified at TikTok; no text post.
// - Instagram: publishing for professional accounts with `instagram_business_content_publish`;
//   images JPEG from a public URL; no text post. A personal account gets the system share.
// - Facebook: a Page the person administers (`pages_manage_posts` + CREATE_CONTENT) takes text,
//   photo and video; a personal profile has no publishing API: share sheet or copied text.
use crate::vault_router::js;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// `sniffMediaMime`: none for anything that is not a supported image or video.
pub fn sniff(head: &[u8]) -> Option<&'static str> {
    if head.len() < 12 {
        return None;
    }
    let ascii = |start: usize, end: usize| &head[start..end];
    if head.starts_with(&[0x89, 0x50, 0x4e, 0x47]) {
        return Some("image/png");
    }
    if head.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if head.starts_with(b"GIF") {
        return Some("image/gif");
    }
    if ascii(0, 4) == b"RIFF" && ascii(8, 12) == b"WEBP" {
        return Some("image/webp");
    }
    if head.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
        return Some("video/webm");
    }
    if ascii(4, 8) == b"ftyp" && ascii(8, 10) == b"qt" {
        return Some("video/quicktime");
    }
    (ascii(4, 8) == b"ftyp").then_some("video/mp4")
}

fn has(account: Option<&JsonValue>, scope: &str) -> bool {
    account
        .and_then(|account| account.get("scopes"))
        .and_then(JsonValue::as_array)
        .is_some_and(|scopes| scopes.iter().any(|s| s == scope))
}

fn connected(account: Option<&JsonValue>) -> bool {
    account.and_then(|account| account.get("state")) == Some(&json!("connected"))
}

fn expired(account: Option<&JsonValue>) -> bool {
    account.and_then(|account| account.get("state")) == Some(&json!("expired"))
}

fn plan(
    route: Option<&str>,
    transfer: Option<&str>,
    error: Option<&str>,
    notes: Vec<&str>,
) -> JsonMap<String, JsonValue> {
    let mut out = JsonMap::new();
    out.insert(
        "route".into(),
        route.map_or(JsonValue::Null, |route| json!(route)),
    );
    if let Some(transfer) = transfer {
        out.insert("transfer".into(), json!(transfer));
    }
    if let Some(error) = error {
        out.insert("error".into(), json!(error));
    }
    out.insert("notes".into(), json!(notes));
    out
}

fn assisted(kind: &str, handoff: &JsonValue, notes: Vec<&str>) -> JsonMap<String, JsonValue> {
    if kind == "text" {
        return plan(None, None, Some("social_text_only_unsupported"), notes);
    }
    if handoff.get("system_share") == Some(&json!(true)) {
        return plan(Some("app_transfer"), Some("system_share"), None, notes);
    }
    plan(Some("export"), None, None, notes)
}

fn tiktok(
    account: Option<&JsonValue>,
    kind: &str,
    handoff: &JsonValue,
) -> JsonMap<String, JsonValue> {
    if kind == "text" {
        return plan(None, None, Some("social_text_only_unsupported"), vec![]);
    }
    let mut notes = vec![];
    if expired(account) {
        notes.push("social_session_expired");
    }
    if connected(account) {
        let pullable =
            kind == "video" || account.and_then(|a| a.get("photo_pull")) == Some(&json!(true));
        if !pullable {
            notes.push("social_public_media_url_unavailable");
        } else if has(account, "video.publish") {
            return plan(Some("direct"), None, None, notes);
        } else if has(account, "video.upload") {
            return plan(Some("app_transfer"), Some("provider_inbox"), None, notes);
        } else {
            notes.push("social_permission_missing");
        }
    }
    assisted(kind, handoff, notes)
}

fn instagram(
    account: Option<&JsonValue>,
    kind: &str,
    handoff: &JsonValue,
) -> JsonMap<String, JsonValue> {
    if kind == "text" {
        return plan(None, None, Some("social_text_only_unsupported"), vec![]);
    }
    let mut notes = vec![];
    if expired(account) {
        notes.push("social_session_expired");
    }
    if connected(account) {
        if !has(account, "instagram_business_content_publish") {
            notes.push("social_permission_missing");
        } else if kind == "image"
            && account.and_then(|a| a.get("public_media")) != Some(&json!(true))
        {
            notes.push("social_public_media_url_unavailable");
        } else {
            return plan(Some("direct"), None, None, notes);
        }
    }
    assisted(kind, handoff, notes)
}

fn facebook_page(
    account: Option<&JsonValue>,
    page_id: &str,
    kind: &str,
) -> JsonMap<String, JsonValue> {
    if expired(account) {
        return plan(None, None, Some("social_session_expired"), vec![]);
    }
    if !connected(account) {
        return plan(None, None, Some("social_not_connected"), vec![]);
    }
    let pages = account
        .and_then(|a| a.get("pages"))
        .and_then(JsonValue::as_array);
    let Some(page) = pages.and_then(|pages| {
        pages
            .iter()
            .find(|page| page.get("id") == Some(&json!(page_id)))
    }) else {
        return plan(None, None, Some("social_destination_invalid"), vec![]);
    };
    if !js::truthy(page.get("can_post")) || !has(account, "pages_manage_posts") {
        return plan(None, None, Some("social_permission_missing"), vec![]);
    }
    let mut out = plan(Some("direct"), None, None, vec![]);
    out.insert("kind".into(), json!(kind));
    out
}

/// `planSocialDestination`.
pub fn destination(
    destination: &str,
    accounts: &JsonValue,
    kind: Option<&str>,
    handoff: &JsonValue,
) -> JsonValue {
    let mut out = JsonMap::new();
    out.insert("destination".into(), json!(destination));
    out.insert(
        "network".into(),
        json!(destination.split(':').next().unwrap_or("")),
    );
    let Some(kind) = kind else {
        out.extend(plan(None, None, Some("social_content_empty"), vec![]));
        return JsonValue::Object(out);
    };
    let page = destination
        .strip_prefix("facebook:page:")
        .filter(|id| (1..=40).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_digit()));
    let planned = match destination {
        "tiktok" => tiktok(accounts.get("tiktok"), kind, handoff),
        "instagram" => instagram(accounts.get("instagram"), kind, handoff),
        "facebook:profile" if kind == "text" => {
            plan(Some("app_transfer"), Some("copy_open"), None, vec![])
        }
        "facebook:profile" => assisted(kind, handoff, vec![]),
        _ => match page {
            Some(page) => facebook_page(accounts.get("facebook"), page, kind),
            None => plan(None, None, Some("social_destination_invalid"), vec![]),
        },
    };
    out.extend(planned);
    JsonValue::Object(out)
}
