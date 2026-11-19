// The text a destination sends (R-190, M3): the post's own text, or, for a network with a short
// limit (Bluesky's 300 characters, Threads' 500), the shorter text the person wrote for it
// (`options.<network>.text`). A text over the network's limit is refused explicitly: at prepare a
// network that takes a shorter text is only told it needs one (note `text_too_long`); at the send
// the text it would send is checked again.
use super::limits;
use super::net::{Sd, Se};
use serde_json::Value as JsonValue;

/// Whether the network takes a destination's own shorter text.
pub fn shortened(network: &str) -> bool {
    matches!(network, "bluesky" | "threads")
}

/// How the post's text fits the network at prepare.
#[derive(Debug, PartialEq, Eq)]
pub enum Fit {
    Fits,
    /// Too long, a shorter text for this destination being possible.
    Shorter,
    /// Too long, with the network's detail.
    Over(&'static str),
}

pub fn fit(network: &str, kind: &str, text: &str) -> Fit {
    match limits::text_limit(network, kind) {
        Some(limit) if limit.count(text) > limit.max => {
            if shortened(network) {
                Fit::Shorter
            } else {
                Fit::Over(limit.detail)
            }
        }
        _ => Fit::Fits,
    }
}

/// The text sent: the destination's own (`options.<network>.text`) where the network takes one,
/// else the post's; either checked against the network's limit.
pub fn sent(network: &str, kind: &str, text: &str, options: &JsonValue) -> Sd<String> {
    let own = options.pointer(&format!("/{network}/text"));
    let chosen = match own {
        Some(_) if !shortened(network) => return Err(Se::detail("social_request_invalid", "text")),
        Some(JsonValue::String(own)) if !own.trim().is_empty() => own.as_str(),
        Some(_) => return Err(Se::detail("social_request_invalid", "text")),
        None => text,
    };
    match limits::text_limit(network, kind) {
        Some(limit) if limit.count(chosen) > limit.max => {
            if own.is_none() && shortened(network) {
                Err(Se::detail("social_option_required", "text"))
            } else {
                Err(Se::detail("social_media_constraint", limit.detail))
            }
        }
        _ => Ok(chosen.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_long_text_asks_bluesky_and_threads_for_their_own() {
        let long = "a".repeat(301);
        assert_eq!(fit("bluesky", "text", &long), Fit::Shorter);
        assert_eq!(fit("threads", "text", &long), Fit::Fits);
        assert_eq!(
            fit("mastodon", "text", &"a".repeat(501)),
            Fit::Over("text_too_long")
        );
        let none = sent("bluesky", "text", &long, &json!({})).unwrap_err();
        assert_eq!(
            (none.code.as_str(), none.detail.as_deref()),
            ("social_option_required", Some("text"))
        );
        let own = json!({ "bluesky": { "text": "short" } });
        assert_eq!(sent("bluesky", "text", &long, &own).unwrap(), "short");
        let over = json!({ "threads": { "text": "b".repeat(501) } });
        let refused = sent("threads", "image", "x", &over).unwrap_err();
        assert_eq!(
            (refused.code.as_str(), refused.detail.as_deref()),
            ("social_media_constraint", Some("text_too_long"))
        );
        let elsewhere = json!({ "mastodon": { "text": "short" } });
        assert_eq!(
            sent("mastodon", "text", "x", &elsewhere)
                .unwrap_err()
                .detail
                .as_deref(),
            Some("text")
        );
        assert_eq!(
            sent("discord", "text", "hello", &json!({})).unwrap(),
            "hello"
        );
    }
}
