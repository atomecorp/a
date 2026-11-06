// A fetched message's text as the IMAP client reads it (atome/src/squirrel/mail/mail_mime.js): its
// headers (RFC 2047 words, loose quoted-printable, addresses) and its plain text part (multipart,
// quoted-printable, base64, the part's charset as the browser's TextDecoder knows it); the message
// an SMTP client writes is smtp.rs's. JavaScript strings are UTF-16: a
// length, a slice and a quoted-printable byte are counted in UTF-16 units, as Node counts them.
use crate::vault_router::js;
use regex::Regex;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;
use std::sync::LazyLock;

// JavaScript's `\s`: its white space and line terminators (U+FEFF in, U+0085 out).
pub(crate) const SPACE: &str = r"\t\n\x0B\x0C\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}";

pub(crate) fn is_space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

pub(crate) fn regex(pattern: &str) -> Regex {
    Regex::new(&pattern.replace("\\s", &format!("[{SPACE}]"))).expect("mail pattern")
}

static ENCODED_WORD: LazyLock<Regex> = LazyLock::new(|| regex(r"=\?([^?]+)\?([bBqQ])\?([^?]*)\?="));
static LOOSE_QP: LazyLock<Regex> = LazyLock::new(|| regex(r"=[0-9A-Fa-f]{2}"));
static SPACES: LazyLock<Regex> = LazyLock::new(|| regex(r"\s{2,}"));
static SPACE_RUN: LazyLock<Regex> = LazyLock::new(|| regex(r"\s+"));
static SOFT_BREAK: LazyLock<Regex> = LazyLock::new(|| regex(r"=\r?\n"));
static BLANK_LINE: LazyLock<Regex> = LazyLock::new(|| regex(r"\r?\n\r?\n"));
pub(crate) static LINE_BREAK: LazyLock<Regex> = LazyLock::new(|| regex(r"\r?\n"));
static BOUNDARY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        "(?i)boundary[{SPACE}]*=[{SPACE}]*\"?([^\";{SPACE}]+)\"?"
    ))
    .expect("boundary pattern")
});
static ANGLE: LazyLock<Regex> = LazyLock::new(|| regex(r"^([^\n\r\x{2028}\x{2029}]*)<([^>]+)>$"));

/// `normalizeText(value)`: `String(value || '').trim()`.
pub fn text_of(value: Option<&JsonValue>) -> String {
    if js::truthy(value) {
        js::trim(&js::text(value)).to_string()
    } else {
        String::new()
    }
}

/// `quoteImapString(value)` of `String(value || '')`.
pub fn quote_imap(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// `decodeBytesToText(bytes, charset)`: the TextDecoder of that label, else Node's Buffer (Latin-1
/// for a Latin-1 label, UTF-8 otherwise) when TextDecoder knows no such encoding.
pub fn decode_text(bytes: &[u8], charset: &str) -> String {
    let charset = if charset.is_empty() { "utf-8" } else { charset };
    let label = js::trim(charset).to_lowercase();
    let label = if label == "utf8" {
        "utf-8".to_string()
    } else {
        label
    };
    match encoding_rs::Encoding::for_label(label.as_bytes()) {
        Some(encoding) if encoding != encoding_rs::REPLACEMENT => {
            encoding.decode_with_bom_removal(bytes).0.into_owned()
        }
        _ if label.contains("iso-8859-1") || label.contains("latin1") => {
            bytes.iter().map(|byte| char::from(*byte)).collect()
        }
        _ => String::from_utf8_lossy(bytes).into_owned(),
    }
}

/// `Buffer.from(text, 'base64')`: both alphabets, other characters skipped, ended by `=`.
pub fn base64_bytes(value: &str) -> Vec<u8> {
    let (mut bytes, mut bits, mut count) = (Vec::new(), 0u32, 0u32);
    for c in js::trim(value).chars() {
        let digit = match c {
            'A'..='Z' => c as u32 - 'A' as u32,
            'a'..='z' => c as u32 - 'a' as u32 + 26,
            '0'..='9' => c as u32 - '0' as u32 + 52,
            '+' | '-' => 62,
            '/' | '_' => 63,
            '=' => break,
            _ => continue,
        };
        bits = (bits << 6) | digit;
        count += 6;
        if count >= 8 {
            count -= 8;
            bytes.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    bytes
}

/// `decodeQuotedPrintableBytes`: `_` a space, `=XX` a byte, any other UTF-16 unit its low byte;
/// `soft` (mail_mime.js) first drops the soft line breaks and a trailing `=`.
pub fn qp_bytes(value: &str, soft: bool) -> Vec<u8> {
    let mut text = value.to_string();
    if soft {
        text = SOFT_BREAK.replace_all(&text, "").into_owned();
        if text.ends_with('=') {
            text.pop();
        }
    }
    let units: Vec<u16> = text.replace('_', " ").encode_utf16().collect();
    let hex = |unit: u16| char::from_u32(u32::from(unit)).and_then(|c| c.to_digit(16));
    let mut bytes = Vec::with_capacity(units.len());
    let mut index = 0;
    while index < units.len() {
        if units[index] == u16::from(b'=')
            && index + 2 < units.len()
            && let (Some(high), Some(low)) = (hex(units[index + 1]), hex(units[index + 2]))
        {
            bytes.push((high * 16 + low) as u8);
            index += 3;
            continue;
        }
        bytes.push(units[index] as u8);
        index += 1;
    }
    bytes
}

/// `decodeMimeEncodedWords`: every `=?charset?B|Q?text?=` decoded (`soft`: mail_mime.js's
/// quoted-printable; local_index.js's keeps soft breaks).
pub fn encoded_words(value: &str, soft: bool) -> String {
    ENCODED_WORD
        .replace_all(value, |found: &regex::Captures<'_>| {
            let bytes = if found[2].eq_ignore_ascii_case("b") {
                base64_bytes(&found[3])
            } else {
                qp_bytes(&found[3], soft)
            };
            decode_text(&bytes, &found[1])
        })
        .into_owned()
}

/// local_index.js's subject: its encoded words decoded, its spaces collapsed.
pub fn index_subject(value: &str) -> String {
    let decoded = encoded_words(value, false);
    js::trim(&SPACES.replace_all(&decoded, " ")).to_string()
}

pub(crate) fn collapse(value: &str) -> String {
    SPACE_RUN.replace_all(value, " ").into_owned()
}

fn header_text(value: &str, charset: &str) -> String {
    let decoded = encoded_words(value, true);
    let text = js::trim(&decoded);
    let loose = if LOOSE_QP.is_match(text) {
        decode_text(&qp_bytes(text, true), charset)
    } else {
        text.to_string()
    };
    js::trim(&SPACES.replace_all(&loose, " ")).to_string()
}

// `/charset\s*=\s*("?)([^";\s]+)\1/i`: the first `charset` whose value is whole.
fn charset_of(content_type: &str) -> String {
    let lower = content_type.to_ascii_lowercase();
    let mut from = 0;
    while let Some(found) = lower.get(from..).and_then(|rest| rest.find("charset")) {
        let start = from + found + "charset".len();
        from = from + found + 1;
        let rest = content_type.get(start..).unwrap_or_default();
        let rest = rest.trim_start_matches(is_space);
        let Some(rest) = rest.strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim_start_matches(is_space);
        let (quoted, rest) = match rest.strip_prefix('"') {
            Some(rest) => (true, rest),
            None => (false, rest),
        };
        let end = rest
            .find(|c: char| c == '"' || c == ';' || is_space(c))
            .unwrap_or(rest.len());
        if end == 0 || (quoted && !rest[end..].starts_with('"')) {
            continue;
        }
        let value = js::trim(&rest[..end]);
        return if value.is_empty() {
            "utf-8".into()
        } else {
            value.to_string()
        };
    }
    "utf-8".into()
}

fn address_token(token: &str) -> Option<JsonValue> {
    let raw = js::trim(token);
    if raw.is_empty() {
        return None;
    }
    if let Some(found) = ANGLE.captures(raw) {
        // `replace(/^"|"$/g, '')` before the trim: a quote before a space stays.
        let name = found[1].strip_prefix('"').unwrap_or(&found[1]);
        let name = js::trim(name.strip_suffix('"').unwrap_or(name));
        let name = (!name.is_empty()).then(|| name.to_string());
        return Some(json!({ "name": name, "address": js::trim(&found[2]) }));
    }
    let address = raw.strip_prefix('<').unwrap_or(raw);
    let address = address.strip_suffix('>').unwrap_or(address);
    Some(json!({ "name": null, "address": js::trim(address) }))
}

/// `splitAddressTokens`: the addresses of a header, commas inside quotes or angles kept.
fn addresses(value: &str) -> Vec<JsonValue> {
    let (mut tokens, mut current, mut quote, mut angle) = (Vec::new(), String::new(), false, false);
    for c in value.chars() {
        match c {
            '"' => quote = !quote,
            '<' => angle = true,
            '>' => angle = false,
            _ => {}
        }
        if c == ',' && !quote && !angle {
            tokens.push(std::mem::take(&mut current));
            continue;
        }
        current.push(c);
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
        .iter()
        .filter_map(|token| address_token(token))
        .collect()
}

fn headers(text: &str) -> HashMap<String, String> {
    let mut headers: HashMap<String, String> = HashMap::new();
    let mut current: Option<String> = None;
    for line in LINE_BREAK.split(text) {
        if line.is_empty() {
            continue;
        }
        if line.starts_with(is_space)
            && let Some(key) = &current
        {
            let joined = format!("{} {}", headers[key], js::trim(line));
            headers.insert(key.clone(), js::trim(&joined).to_string());
            continue;
        }
        let Some(colon) = line.find(':').filter(|colon| *colon > 0) else {
            continue;
        };
        let key = js::trim(&line[..colon]).to_lowercase();
        headers.insert(key.clone(), js::trim(&line[colon + 1..]).to_string());
        current = Some(key);
    }
    headers
}

fn decoded_body(body: &str, encoding: &str, charset: &str) -> Option<String> {
    match encoding {
        "quoted-printable" => Some(decode_text(&qp_bytes(body, true), charset)),
        "base64" => Some(decode_text(
            &base64_bytes(&SPACE_RUN.replace_all(body, "")),
            charset,
        )),
        _ => None,
    }
}

fn header(headers: &HashMap<String, String>, key: &str) -> String {
    headers.get(key).cloned().unwrap_or_default()
}

/// `extractTextFromMultipart`: the first plain-text part, nested multiparts searched in order.
fn multipart_text(body: &str, boundary: &str) -> Option<String> {
    for part in body.split(&format!("--{boundary}")) {
        let trimmed = js::trim(part);
        if trimmed == "--" || trimmed.is_empty() {
            continue;
        }
        let Some(blank) = BLANK_LINE.find(part) else {
            continue;
        };
        let part_headers = headers(&part[..blank.start()]);
        let part_body = &part[blank.end()..];
        let content_type = header(&part_headers, "content-type").to_lowercase();
        let nested = BOUNDARY.captures(&content_type);
        if content_type.contains("multipart/")
            && let Some(nested) = nested
        {
            if let Some(text) = multipart_text(part_body, &nested[1]) {
                return Some(text);
            }
            continue;
        }
        if content_type.contains("text/plain")
            || (content_type.is_empty() && !js::trim(part_body).is_empty())
        {
            let charset = charset_of(&header(&part_headers, "content-type"));
            let encoding =
                js::trim(&header(&part_headers, "content-transfer-encoding")).to_lowercase();
            return Some(
                decoded_body(part_body, &encoding, &charset).unwrap_or_else(|| part_body.into()),
            );
        }
    }
    None
}

/// `parseRawEmail(raw)`: what the IMAP client reads of a fetched message.
pub struct Parsed {
    pub message_id: Option<String>,
    pub subject: String,
    pub from: Option<JsonValue>,
    pub to: Vec<JsonValue>,
    pub cc: Vec<JsonValue>,
    pub bcc: Vec<JsonValue>,
    pub in_reply_to: Option<String>,
    pub references: Vec<String>,
    pub date: Option<String>,
    pub preview: String,
    pub body_text: String,
}

pub fn parse_raw_email(message: &str) -> Parsed {
    let (header_part, raw_body) = match BLANK_LINE.find(message) {
        Some(blank) => (&message[..blank.start()], &message[blank.end()..]),
        None => (message, ""),
    };
    let headers = headers(header_part);
    let content_type = header(&headers, "content-type");
    let charset = charset_of(&content_type);
    let encoding = js::trim(&header(&headers, "content-transfer-encoding")).to_lowercase();
    let body = match BOUNDARY.captures(&content_type) {
        Some(boundary) => multipart_text(raw_body, &boundary[1]).unwrap_or_default(),
        None => decoded_body(raw_body, &encoding, &charset).unwrap_or_else(|| raw_body.into()),
    };
    let field = |key: &str| header_text(&header(&headers, key), &charset);
    let optional = |key: &str| Some(field(key)).filter(|value| !value.is_empty());
    Parsed {
        message_id: optional("message-id"),
        subject: field("subject"),
        from: addresses(&field("from")).into_iter().next(),
        to: addresses(&field("to")),
        cc: addresses(&field("cc")),
        bcc: addresses(&field("bcc")),
        in_reply_to: optional("in-reply-to"),
        references: field("references")
            .split(is_space)
            .filter(|reference| !reference.is_empty())
            .map(str::to_string)
            .collect(),
        date: optional("date"),
        preview: js::slice(js::trim(&collapse(&body)), 240),
        body_text: js::trim(&body).to_string(),
    }
}
