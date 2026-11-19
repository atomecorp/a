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
// - Threads: text, images and videos pulled from a public URL (`threads_content_publish`).
// - YouTube: videos only (`youtube.upload`); a text or an image is skipped and named.
// - LinkedIn: the member's own posts (`w_member_social`), text, image or video.
// - Bluesky, Mastodon, Telegram (a bot in a channel), Discord (a channel's webhook): text, image,
//   video, uploaded by the server.
//
// A destination names an account (`<network>:<account>`, R-190); the bare network (`tiktok`,
// `instagram`) is its first enabled account; Facebook keeps `facebook:page:<id>` and
// `facebook:profile`.
use super::accounts;
use super::network::Network;
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

/// What a destination id names.
#[derive(Debug, PartialEq)]
pub enum Target {
    /// An account of the network, its first enabled one when none is named.
    Account(Network, Option<String>),
    FacebookPage(String),
    FacebookProfile,
}

/// The destination id read, none when it is not one.
pub fn parse(destination: &str) -> Option<Target> {
    if destination == "facebook:profile" {
        return Some(Target::FacebookProfile);
    }
    if let Some(page) = destination.strip_prefix("facebook:page:") {
        let shaped = (1..=40).contains(&page.len()) && page.bytes().all(|c| c.is_ascii_digit());
        return shaped.then(|| Target::FacebookPage(page.into()));
    }
    let (name, account) = match destination.split_once(':') {
        Some((name, account)) => (name, Some(account)),
        None => (destination, None),
    };
    let network = Network::of(name).ok().filter(|n| *n != Network::Facebook)?;
    match account {
        Some(account) if accounts::shaped(account) => {
            Some(Target::Account(network, Some(account.into())))
        }
        Some(_) => None,
        None => Some(Target::Account(network, None)),
    }
}

/// The public view of a network's accounts (`social.accounts`' `networks`).
fn accounts_of<'a>(networks: &'a JsonValue, network: &str) -> &'a [JsonValue] {
    networks
        .as_array()
        .and_then(|all| {
            all.iter()
                .find(|n| n.get("network") == Some(&json!(network)))
        })
        .and_then(|n| n.get("accounts"))
        .and_then(JsonValue::as_array)
        .map_or(&[], Vec::as_slice)
}

fn account_in<'a>(
    networks: &'a JsonValue,
    network: Network,
    wanted: Option<&str>,
) -> Option<&'a JsonValue> {
    let all = accounts_of(networks, network.name());
    match wanted {
        Some(wanted) => all
            .iter()
            .find(|a| a.get("account") == Some(&json!(wanted))),
        None => all
            .iter()
            .find(|a| a.get("state") != Some(&json!("disabled"))),
    }
}

/// The networks that upload what the server sends them, connected and allowed to publish.
fn uploaded(
    account: Option<&JsonValue>,
    kind: &str,
    scope: Option<&str>,
) -> JsonMap<String, JsonValue> {
    if expired(account) {
        return plan(None, None, Some("social_session_expired"), vec![]);
    }
    if !connected(account) {
        return plan(None, None, Some("social_not_connected"), vec![]);
    }
    if scope.is_some_and(|scope| !has(account, scope)) {
        return plan(None, None, Some("social_permission_missing"), vec![]);
    }
    let mut out = plan(Some("direct"), None, None, vec![]);
    out.insert("kind".into(), json!(kind));
    out
}

fn threads(account: Option<&JsonValue>, kind: &str) -> JsonMap<String, JsonValue> {
    let pulled = kind != "text";
    if pulled
        && connected(account)
        && account.and_then(|a| a.get("public_media")) != Some(&json!(true))
    {
        return plan(
            None,
            None,
            Some("social_public_media_url_unavailable"),
            vec![],
        );
    }
    uploaded(account, kind, Some("threads_content_publish"))
}

fn youtube(account: Option<&JsonValue>, kind: &str) -> JsonMap<String, JsonValue> {
    match kind {
        "text" => plan(None, None, Some("social_text_only_unsupported"), vec![]),
        "image" => plan(None, None, Some("social_media_type_unsupported"), vec![]),
        _ => uploaded(
            account,
            kind,
            Some("https://www.googleapis.com/auth/youtube.upload"),
        ),
    }
}

fn planned(
    network: Network,
    account: Option<&JsonValue>,
    kind: &str,
    handoff: &JsonValue,
) -> JsonMap<String, JsonValue> {
    match network {
        Network::TikTok => tiktok(account, kind, handoff),
        Network::Instagram => instagram(account, kind, handoff),
        Network::Threads => threads(account, kind),
        Network::YouTube => youtube(account, kind),
        Network::LinkedIn => uploaded(account, kind, Some("w_member_social")),
        Network::Facebook => plan(None, None, Some("social_destination_invalid"), vec![]),
        _ => uploaded(account, kind, None),
    }
}

/// `planSocialDestination`: `networks` is the public account view (`social.accounts`).
pub fn destination(
    destination: &str,
    networks: &JsonValue,
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
    let planned = match parse(destination) {
        Some(Target::FacebookProfile) if kind == "text" => {
            plan(Some("app_transfer"), Some("copy_open"), None, vec![])
        }
        Some(Target::FacebookProfile) => assisted(kind, handoff, vec![]),
        Some(Target::FacebookPage(page)) => {
            let holder = accounts_of(networks, "facebook").iter().find(|account| {
                account
                    .get("pages")
                    .and_then(JsonValue::as_array)
                    .is_some_and(|pages| pages.iter().any(|p| p.get("id") == Some(&json!(page))))
            });
            let holder = holder.or_else(|| account_in(networks, Network::Facebook, None));
            let mut planned = facebook_page(holder, &page, kind);
            if let Some(account) = holder.and_then(|a| a.get("account")) {
                planned.insert("account".into(), account.clone());
            }
            planned
        }
        Some(Target::Account(network, wanted)) => {
            let account = account_in(networks, network, wanted.as_deref());
            let mut planned = if wanted.is_some() && account.is_none() {
                plan(None, None, Some("social_account_not_found"), vec![])
            } else {
                planned(network, account, kind, handoff)
            };
            if let Some(account) = account.and_then(|a| a.get("account")) {
                planned.insert("account".into(), account.clone());
            }
            planned
        }
        None => plan(None, None, Some("social_destination_invalid"), vec![]),
    };
    out.extend(planned);
    JsonValue::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn networks() -> JsonValue {
        json!([
            { "network": "instagram", "configured": true, "accounts": [
                { "account": "1", "state": "connected", "scopes": ["instagram_business_content_publish"], "public_media": true },
                { "account": "2", "state": "connected", "scopes": [], "public_media": true } ] },
            { "network": "facebook", "configured": true, "accounts": [
                { "account": "9", "state": "connected", "scopes": ["pages_manage_posts"],
                  "pages": [{ "id": "55", "name": "P", "can_post": true }] } ] },
            { "network": "youtube", "configured": true, "accounts": [
                { "account": "c", "state": "connected", "scopes": ["https://www.googleapis.com/auth/youtube.upload"] } ] },
            { "network": "mastodon", "configured": true, "accounts": [
                { "account": "ann@m.social", "state": "disabled" },
                { "account": "bob@m.social", "state": "connected" } ] },
        ])
    }

    #[test]
    fn destination_ids_are_parsed() {
        assert_eq!(
            parse("instagram"),
            Some(Target::Account(Network::Instagram, None))
        );
        assert_eq!(
            parse("mastodon:ann@m.social"),
            Some(Target::Account(
                Network::Mastodon,
                Some("ann@m.social".into())
            ))
        );
        assert_eq!(
            parse("facebook:page:123"),
            Some(Target::FacebookPage("123".into()))
        );
        assert_eq!(parse("facebook:profile"), Some(Target::FacebookProfile));
        assert_eq!(parse("facebook"), None);
        assert_eq!(parse("facebook:page:abc"), None);
        assert_eq!(parse("x"), None);
        assert_eq!(parse("bluesky:a/b"), None);
    }

    #[test]
    fn the_bare_network_is_its_first_account_and_a_named_one_is_its_own() {
        let first = destination("instagram", &networks(), Some("image"), &json!({}));
        assert_eq!(first["route"], "direct");
        assert_eq!(first["account"], "1");
        let second = destination("instagram:2", &networks(), Some("image"), &json!({}));
        assert_eq!(second["route"], "export");
        assert_eq!(second["notes"], json!(["social_permission_missing"]));
        let missing = destination("instagram:7", &networks(), Some("image"), &json!({}));
        assert_eq!(missing["error"], "social_account_not_found");
        let enabled = destination("mastodon", &networks(), Some("text"), &json!({}));
        assert_eq!(enabled["account"], "bob@m.social");
        let disabled = destination(
            "mastodon:ann@m.social",
            &networks(),
            Some("text"),
            &json!({}),
        );
        assert_eq!(disabled["error"], "social_not_connected");
    }

    #[test]
    fn a_content_a_network_cannot_take_is_skipped_and_named() {
        let text = destination("youtube", &networks(), Some("text"), &json!({}));
        assert_eq!(text["error"], "social_text_only_unsupported");
        let image = destination("youtube:c", &networks(), Some("image"), &json!({}));
        assert_eq!(image["error"], "social_media_type_unsupported");
        let video = destination("youtube:c", &networks(), Some("video"), &json!({}));
        assert_eq!(video["route"], "direct");
        let page = destination("facebook:page:55", &networks(), Some("text"), &json!({}));
        assert_eq!(page["route"], "direct");
        assert_eq!(page["account"], "9");
    }
}
