// The RFC content-line mechanics shared by vCard and iCalendar (atome/src/squirrel/shared/content_lines.js,
// ported): unfolding, one line read into its name, group, parameters and raw value, a value split on its
// separator, text decoding, and the components of a file. Each error is the JS one.
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// One content line as `parseContentLine` returns it: `{ name, group, params, value }`. The parameters
/// keep the order a JavaScript object gives its keys.
#[derive(Clone, Debug)]
pub struct Property {
    pub name: String,
    pub group: String,
    pub params: Vec<(String, String)>,
    pub value: String,
}

// A key JavaScript lists before every other key of an object: an array index.
fn array_index(key: &str) -> bool {
    key == "0"
        || (!key.starts_with('0')
            && key.len() <= 10
            && key.bytes().all(|b| b.is_ascii_digit())
            && key.parse::<u64>().is_ok_and(|n| n < 4_294_967_295))
}

impl Property {
    /// `params[key]`.
    pub fn param(&self, key: &str) -> Option<&str> {
        self.params
            .iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value.as_str())
    }

    /// `params[key] = value`: an existing key keeps its place, a new one comes last.
    pub fn set_param(&mut self, key: &str, value: String) {
        match self.params.iter_mut().find(|(name, _)| name == key) {
            Some(entry) => entry.1 = value,
            None => self.params.push((key.to_string(), value)),
        }
    }

    /// The parameters as JSON writes the JavaScript object: array indices first, ascending.
    pub fn params_json(&self) -> JsonValue {
        let mut indices: Vec<&(String, String)> = self
            .params
            .iter()
            .filter(|(key, _)| array_index(key))
            .collect();
        indices.sort_by_key(|(key, _)| key.parse::<u64>().unwrap_or(0));
        let others = self.params.iter().filter(|(key, _)| !array_index(key));
        let mut map = JsonMap::new();
        for (key, value) in indices.into_iter().chain(others) {
            map.insert(key.clone(), json!(value));
        }
        JsonValue::Object(map)
    }

    /// `{ name, group, params, value }`.
    pub fn json(&self) -> JsonValue {
        json!({ "name": self.name, "group": self.group, "params": self.params_json(), "value": self.value })
    }

    /// `{ ...property, value }`.
    pub fn json_with_value(&self, value: &str) -> JsonValue {
        json!({ "name": self.name, "group": self.group, "params": self.params_json(), "value": value })
    }

    /// What `buildContentLine(property)` refuses of a read line: a group outside `[A-Z0-9-]` (any
    /// case) or a value holding a line break (its name and parameter keys are always valid).
    pub fn buildable(&self) -> Result<(), String> {
        if !self.group.is_empty()
            && !self
                .group
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err("content_property_invalid".into());
        }
        if self.value.contains(['\r', '\n']) {
            return Err("content_value_newline".into());
        }
        Ok(())
    }
}

/// `unfoldContentLines(value)`: `\r?\n[ \t]` removed, then split on `\r?\n`.
pub fn unfold(value: &str) -> Vec<String> {
    // The removed sequences are ASCII: the kept runs are whole UTF-8 slices.
    let bytes = value.as_bytes();
    let mut text = String::with_capacity(bytes.len());
    let (mut at, mut kept) = (0, 0);
    while at < bytes.len() {
        let folded = match bytes[at] {
            b'\r'
                if bytes.get(at + 1) == Some(&b'\n')
                    && matches!(bytes.get(at + 2), Some(b' ' | b'\t')) =>
            {
                3
            }
            b'\n' if matches!(bytes.get(at + 1), Some(b' ' | b'\t')) => 2,
            _ => 0,
        };
        if folded > 0 {
            text.push_str(&value[kept..at]);
            at += folded;
            kept = at;
        } else {
            at += 1;
        }
    }
    text.push_str(&value[kept..]);
    let pieces: Vec<&str> = text.split('\n').collect();
    let last = pieces.len() - 1;
    pieces
        .iter()
        .enumerate()
        .map(|(index, piece)| {
            if index < last {
                piece.strip_suffix('\r').unwrap_or(piece).to_string()
            } else {
                piece.to_string()
            }
        })
        .collect()
}

/// `decodeContentText(value)`: `\n`/`\N` a line break, `\,` `\;` `\\` the character.
pub fn decode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        match (c, chars.peek()) {
            ('\\', Some('n' | 'N')) => {
                chars.next();
                out.push('\n');
            }
            ('\\', Some(&next @ (',' | ';' | '\\'))) => {
                chars.next();
                out.push(next);
            }
            _ => out.push(c),
        }
    }
    out
}

/// `splitContentValue(value, separator)`: split outside quotes and escapes.
pub fn split(value: &str, separator: char) -> Vec<String> {
    let mut parts = Vec::new();
    let (mut part, mut escaped, mut quoted) = (String::new(), false, false);
    for c in value.chars() {
        if !escaped && c == '"' {
            quoted = !quoted;
        }
        if !escaped && !quoted && c == separator {
            parts.push(std::mem::take(&mut part));
        } else {
            part.push(c);
        }
        escaped = c == '\\' && !escaped;
    }
    parts.push(part);
    parts
}

/// A property name both converters keep out of what they hand on (`/TOKEN|PASSWORD|SECRET|AUTH|ATOME|
/// CONFLICT/`, on a name that is already upper-case ASCII).
pub fn private_name(name: &str) -> bool {
    ["TOKEN", "PASSWORD", "SECRET", "AUTH", "ATOME", "CONFLICT"]
        .iter()
        .any(|word| name.contains(word))
}

fn token(text: &str) -> bool {
    !text.is_empty()
        && text
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'-')
}

/// `parseContentLine(line)`.
pub fn parse_line(line: &str) -> Result<Property, String> {
    let mut quoted = false;
    let mut colon = None;
    for (at, b) in line.bytes().enumerate() {
        if b == b'"' {
            quoted = !quoted;
        }
        if b == b':' && !quoted {
            colon = Some(at);
            break;
        }
    }
    let colon = match colon {
        Some(at) if at >= 1 => at,
        _ => return Err("content_line_invalid".into()),
    };
    let mut entries = split(&line[..colon], ';').into_iter();
    let key = entries.next().unwrap_or_default();
    let mut name_parts: Vec<&str> = key.split('.').collect();
    let name = name_parts.pop().unwrap_or_default().to_uppercase();
    if !token(&name) {
        return Err("content_property_invalid".into());
    }
    let mut property = Property {
        name,
        group: name_parts.join("."),
        params: Vec::new(),
        value: line[colon + 1..].to_string(),
    };
    for entry in entries {
        let equals = entry.find('=');
        let key = equals.map_or("TYPE", |at| &entry[..at]).to_uppercase();
        if !token(&key) {
            return Err("content_parameter_invalid".into());
        }
        let raw = equals.map_or(entry.as_str(), |at| &entry[at + 1..]);
        let raw = raw.strip_prefix('"').unwrap_or(raw);
        let raw = raw.strip_suffix('"').unwrap_or(raw);
        let mut decoded = String::with_capacity(raw.len());
        let mut chars = raw.chars().peekable();
        while let Some(c) = chars.next() {
            match (c, chars.peek()) {
                ('^', Some('^')) => {
                    chars.next();
                    decoded.push('^');
                }
                ('^', Some('\'')) => {
                    chars.next();
                    decoded.push('"');
                }
                ('^', Some('n' | 'N')) => {
                    chars.next();
                    decoded.push('\n');
                }
                _ => decoded.push(c),
            }
        }
        let value = match property.param(&key) {
            Some(previous) if key == "TYPE" && !previous.is_empty() => {
                format!("{previous},{decoded}")
            }
            _ => decoded,
        };
        property.set_param(&key, value);
    }
    Ok(property)
}

/// `input.length > 32 MiB`, counted in UTF-16 units.
pub fn too_long(input: &str) -> bool {
    const MAX: usize = 32 * 1024 * 1024;
    input.len() > MAX && input.encode_utf16().count() > MAX
}

/// `line.toUpperCase() === expected` for an upper-case ASCII `expected` (no character upper-cases to
/// nothing, so a longer line never matches).
pub fn upper_is(line: &str, expected: &str) -> bool {
    line.chars().nth(expected.len()).is_none() && line.to_uppercase() == expected
}

/// `readContentComponents(input, type)`: the properties of each `BEGIN:<type>` … `END:<type>`.
pub fn components(input: &str, kind: &str) -> Result<Vec<Vec<Property>>, String> {
    if too_long(input) {
        return Err("content_file_size_invalid".into());
    }
    let (begin, end) = (format!("BEGIN:{kind}"), format!("END:{kind}"));
    let mut found = Vec::new();
    let mut current: Option<Vec<Property>> = None;
    for line in unfold(input) {
        if line.is_empty() {
            continue;
        }
        if upper_is(&line, &begin) {
            if current.is_some() {
                return Err("content_component_nested".into());
            }
            current = Some(Vec::new());
        } else if upper_is(&line, &end) {
            found.push(current.take().ok_or("content_component_unmatched")?);
        } else if let Some(properties) = current.as_mut() {
            properties.push(parse_line(&line)?);
        } else {
            return Err("content_component_required".into());
        }
    }
    if current.is_some() || found.is_empty() {
        return Err("content_component_incomplete".into());
    }
    Ok(found)
}
