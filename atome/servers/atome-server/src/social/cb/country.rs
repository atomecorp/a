// What the CB sociale knows of a place beyond its zones (lot L2b, « lieu »): a country at most, as the device computed it
// offline from the position it already read for the zones (eVe/domains/cb_social/cb_country.js, Natural Earth's
// borders), never from an IP address. The server only ever receives its ISO 3166-1 alpha-2 code ("JP"), never a
// coordinate, a city or a distance; it tells a bottle's sender the country its catcher was in, never the reverse.
// The language of a message's author travels the same way: the primary subtag of their application's language.
use serde_json::Value as JsonValue;

/// A country code as a device sends it: two capital letters, or nothing (no location accepted).
pub fn parse(value: Option<&JsonValue>) -> Result<Option<String>, &'static str> {
    match value {
        None | Some(JsonValue::Null) => Ok(None),
        Some(JsonValue::String(text)) if text.is_empty() => Ok(None),
        Some(JsonValue::String(text))
            if text.len() == 2 && text.bytes().all(|b| b.is_ascii_uppercase()) =>
        {
            Ok(Some(text.clone()))
        }
        _ => Err("cb_country_invalid"),
    }
}

/// The language a message was written in: the primary subtag of its author's application language ("fr" of
/// "fr-FR"), two or three lowercase letters; empty when unknown or malformed (the reader's device then detects it).
pub fn language(value: Option<&JsonValue>) -> String {
    let text = value.and_then(JsonValue::as_str).unwrap_or_default();
    let primary = text
        .split(['-', '_'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if (2..=3).contains(&primary.len()) && primary.bytes().all(|b| b.is_ascii_lowercase()) {
        primary
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_country_is_two_capitals_or_nothing() {
        assert_eq!(parse(Some(&json!("JP"))), Ok(Some("JP".into())));
        assert_eq!(parse(None), Ok(None));
        assert_eq!(parse(Some(&json!(""))), Ok(None));
        for bad in [
            json!("jp"),
            json!("JPN"),
            json!(35.6),
            json!({ "lat": 1 }),
            json!("Japon"),
        ] {
            assert_eq!(parse(Some(&bad)), Err("cb_country_invalid"), "{bad}");
        }
    }

    #[test]
    fn a_language_is_its_primary_subtag() {
        assert_eq!(language(Some(&json!("fr-FR"))), "fr");
        assert_eq!(language(Some(&json!("ja"))), "ja");
        assert_eq!(language(Some(&json!("JA_jp"))), "ja");
        assert_eq!(language(Some(&json!("français"))), "");
        assert_eq!(language(None), "");
    }
}
