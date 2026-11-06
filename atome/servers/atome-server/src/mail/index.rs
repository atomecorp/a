// A mail runtime's local index and sync cursor (atome/src/squirrel/mail/local_index.js,
// sync_state.js and the parts of service.js the gateway calls): the messages a sync read, by id,
// each normalized again as the index keeps it (its subject's encoded words decoded, its search
// text), listed newest first and counted. Two messages of one instant are ordered by their ids as
// `localeCompare` orders them (ICU's root collation: punctuation, then digits, then letters, case
// and accents deciding last); the sync state keeps the cursor, the only part anything reads.
use super::mime::{self, text_of};
use crate::vault_router::js;
use icu_normalizer::DecomposingNormalizerBorrowed;
use indexmap::IndexMap;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::cmp::Ordering;

// The printable ASCII characters in ICU root order; a letter's two cases share a place.
const ROOT_ORDER: &str = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz";

// A character's collation weights: primary (its place), secondary (an accent), tertiary (upper case).
fn weights(c: char) -> Option<(u32, u8, u8)> {
    if c.is_control() {
        return None;
    }
    let lower = c.to_ascii_lowercase();
    if let Some(place) = ROOT_ORDER.find(lower) {
        return Some((place as u32, 0, u8::from(c.is_ascii_uppercase())));
    }
    let decomposed: String = DecomposingNormalizerBorrowed::new_nfd()
        .normalize(&c.to_string())
        .into_owned();
    let mut letters = decomposed.chars();
    match (letters.next(), letters.next()) {
        (Some(base), Some(_)) if base.is_ascii_alphabetic() => {
            let place = ROOT_ORDER
                .find(base.to_ascii_lowercase())
                .unwrap_or_default();
            Some((place as u32, 1, u8::from(base.is_ascii_uppercase())))
        }
        _ => Some((
            ROOT_ORDER.len() as u32 + c as u32,
            0,
            u8::from(c.is_uppercase()),
        )),
    }
}

/// `left.localeCompare(right)`.
pub(crate) fn collate(left: &str, right: &str) -> Ordering {
    let keys = |text: &str| text.chars().filter_map(weights).collect::<Vec<_>>();
    let (left, right) = (keys(left), keys(right));
    let level = |pick: fn(&(u32, u8, u8)) -> u32| {
        let a: Vec<u32> = left.iter().map(pick).collect();
        let b: Vec<u32> = right.iter().map(pick).collect();
        a.cmp(&b)
    };
    level(|w| w.0)
        .then_with(|| level(|w| u32::from(w.1)))
        .then_with(|| level(|w| u32::from(w.2)))
}

// `normalizeSearchText`: trimmed, decomposed, its combining accents dropped, lower case.
fn search_text(value: &str) -> String {
    DecomposingNormalizerBorrowed::new_nfd()
        .normalize(js::trim(value))
        .chars()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect::<String>()
        .to_lowercase()
}

// `parseDateMs`.
fn date_ms(value: Option<&JsonValue>) -> f64 {
    let number = js::number(value);
    if number.is_finite() {
        return number;
    }
    let text = if js::truthy(value) {
        js::text(value)
    } else {
        String::new()
    };
    super::dates::parse(&text).map_or(0.0, |ms| ms as f64)
}

fn address(value: Option<&JsonValue>) -> JsonValue {
    match value {
        Some(JsonValue::String(text)) if !js::trim(text).is_empty() => {
            json!({ "name": null, "address": js::trim(text) })
        }
        Some(value) if js::truthy(Some(value)) && !value.is_string() => {
            let address = text_of(js::first(value, &["address", "email"]));
            let name = Some(text_of(value.get("name"))).filter(|name| !name.is_empty());
            if address.is_empty() {
                JsonValue::Null
            } else {
                json!({ "name": name, "address": address })
            }
        }
        _ => JsonValue::Null,
    }
}

fn addresses(value: Option<&JsonValue>) -> JsonValue {
    let list = match value {
        Some(JsonValue::Array(list)) => list.clone(),
        Some(value) if js::truthy(Some(value)) => vec![value.clone()],
        _ => Vec::new(),
    };
    JsonValue::Array(
        list.iter()
            .map(|entry| address(Some(entry)))
            .filter(|entry| !entry.is_null())
            .collect(),
    )
}

/// `normalizeMailRecord(record)`: a message as the index keeps it.
fn record(record: &JsonValue) -> Result<JsonValue, String> {
    let message_id = text_of(js::first(record, &["message_id", "messageId", "id"]));
    if message_id.is_empty() {
        return Err("mail message_id is required".into());
    }
    let thread_id =
        text_of(js::first(record, &["thread_id", "threadId"]).or(Some(&json!(message_id))));
    let mailbox = text_of(Some(
        js::first(record, &["mailbox", "folder"]).unwrap_or(&json!("inbox")),
    ));
    let copy = |key: &str, empty: JsonValue| match record.get(key) {
        Some(JsonValue::Object(object)) => JsonValue::Object(object.clone()),
        Some(JsonValue::Array(list)) => JsonValue::Object(
            list.iter()
                .enumerate()
                .map(|(index, entry)| (index.to_string(), entry.clone()))
                .collect(),
        ),
        _ => empty,
    };
    let from = address(record.get("from"));
    let to = addresses(record.get("to"));
    let mut normalized = JsonMap::new();
    let subject = js::trim(&mime::index_subject(&text_of(record.get("subject")))).to_string();
    let preview = text_of(js::first(record, &["preview", "snippet"]));
    let body_text = text_of(js::first(record, &["body_text", "bodyText", "body"]));
    let received = date_ms(js::first(record, &["received_at", "receivedAt", "date"]));
    let mut searched = vec![subject.clone(), preview.clone(), body_text.clone()];
    for key in ["name", "address"] {
        searched.push(
            from.get(key)
                .filter(|v| !v.is_null())
                .map(|v| js::text(Some(v)))
                .unwrap_or_default(),
        );
    }
    for key in ["name", "address"] {
        for entry in to.as_array().into_iter().flatten() {
            searched.push(
                entry
                    .get(key)
                    .filter(|v| js::truthy(Some(v)))
                    .map(|v| js::text(Some(v)))
                    .unwrap_or_default(),
            );
        }
    }
    let flags = match record.get("flags") {
        Some(JsonValue::Array(flags)) => flags
            .iter()
            .map(|flag| json!(js::text(Some(flag))))
            .collect(),
        _ => Vec::new(),
    };
    for (key, value) in [
        ("message_id", json!(message_id)),
        ("thread_id", json!(thread_id)),
        (
            "mailbox",
            json!(if mailbox.is_empty() {
                "inbox".into()
            } else {
                mailbox
            }),
        ),
        ("subject", json!(subject)),
        ("preview", json!(preview)),
        ("body_text", json!(body_text)),
        ("received_at", js::number_json(received)),
        ("unread", json!(record.get("unread") != Some(&json!(false)))),
        ("flags", JsonValue::Array(flags)),
        ("from", from),
        ("to", to),
        ("cc", addresses(record.get("cc"))),
        ("bcc", addresses(record.get("bcc"))),
        ("source", copy("source", json!({ "provider": "unknown" }))),
        ("meta", copy("meta", json!({}))),
        ("search_text", json!(search_text(&searched.join(" ")))),
    ] {
        normalized.insert(key.into(), value);
    }
    Ok(JsonValue::Object(normalized))
}

/// The service of one mail runtime: its index and its sync cursor.
#[derive(Default)]
pub struct Service {
    records: IndexMap<String, JsonValue>,
    cursor: Option<String>,
}

impl Service {
    pub fn cursor(&self) -> Option<&str> {
        self.cursor.as_deref()
    }

    /// `applySyncBatch`: the messages read kept (a known id replaced in its place), the cursor moved.
    pub fn apply(&mut self, messages: &[JsonValue], cursor: Option<String>) -> Result<(), String> {
        let records = messages.iter().map(record).collect::<Result<Vec<_>, _>>()?;
        for entry in records {
            let id = entry["message_id"].as_str().unwrap_or_default().to_string();
            self.records.insert(id, entry);
        }
        if cursor.is_some() {
            self.cursor = cursor;
        }
        Ok(())
    }

    fn ordered(&self) -> Vec<&JsonValue> {
        let mut ordered: Vec<&JsonValue> = self.records.values().collect();
        let received = |entry: &JsonValue| entry["received_at"].as_f64().unwrap_or(0.0);
        let id = |entry: &JsonValue| entry["message_id"].as_str().unwrap_or_default().to_string();
        ordered.sort_by(|left, right| {
            received(right)
                .partial_cmp(&received(left))
                .unwrap_or(Ordering::Equal)
                .then_with(|| collate(&id(right), &id(left)))
        });
        ordered
    }

    /// `mailList({ mailbox, unread_only, limit })`: newest first.
    pub fn list(&self, mailbox: Option<&str>, unread_only: bool, limit: f64) -> Vec<JsonValue> {
        let limit = if limit == 0.0 || limit.is_nan() {
            50.0
        } else {
            limit.max(1.0)
        };
        self.ordered()
            .into_iter()
            .filter(|entry| {
                mailbox.is_none_or(|mailbox| entry["mailbox"].as_str() == Some(mailbox))
            })
            .filter(|entry| !unread_only || entry["unread"] == json!(true))
            .take(if limit >= usize::MAX as f64 {
                usize::MAX
            } else {
                limit.ceil() as usize
            })
            .cloned()
            .collect()
    }

    /// `index.stats()`: how many, how many unread, which mailboxes.
    pub fn stats(&self) -> JsonValue {
        let all = self.ordered();
        let mut mailboxes: Vec<String> = Vec::new();
        for entry in &all {
            let mailbox = js::text(entry.get("mailbox"));
            if !mailboxes.contains(&mailbox) {
                mailboxes.push(mailbox);
            }
        }
        mailboxes.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
        json!({ "total": all.len(), "unread": all.iter().filter(|entry| entry["unread"] == json!(true)).count(),
            "mailboxes": mailboxes })
    }
}
