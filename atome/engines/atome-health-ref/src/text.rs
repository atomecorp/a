//! Text helpers shared by every source: the BDPM files' two encodings, the folded keys every index matches
//! on, HTML to plain text, dates and hashes.

use sha2::{Digest, Sha256};

/// Windows-1252 0x80..=0x9F; `None` is a byte the code page leaves undefined.
const CP1252_HIGH: [Option<char>; 32] = [
    Some('€'),
    None,
    Some('‚'),
    Some('ƒ'),
    Some('„'),
    Some('…'),
    Some('†'),
    Some('‡'),
    Some('ˆ'),
    Some('‰'),
    Some('Š'),
    Some('‹'),
    Some('Œ'),
    None,
    Some('Ž'),
    None,
    None,
    Some('‘'),
    Some('’'),
    Some('“'),
    Some('”'),
    Some('•'),
    Some('–'),
    Some('—'),
    Some('˜'),
    Some('™'),
    Some('š'),
    Some('›'),
    Some('œ'),
    None,
    Some('ž'),
    Some('Ÿ'),
];

/// A BDPM file's text. The base publishes some files in UTF-8 (CIS_CIP_bdpm, CIS_InfoImportantes in Nov. 2026)
/// and the others in Windows-1252: a file that is valid UTF-8 is read as such, any other as Windows-1252, and
/// a byte Windows-1252 leaves undefined is a corrupted file.
pub fn decode_source(name: &str, bytes: &[u8]) -> Result<String, String> {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(text.strip_prefix('\u{feff}').unwrap_or(text).to_string());
    }
    let mut out = String::with_capacity(bytes.len());
    for (offset, byte) in bytes.iter().enumerate() {
        match byte {
            0x00..=0x7F | 0xA0..=0xFF => out.push(char::from(*byte)),
            _ => match CP1252_HIGH[usize::from(byte - 0x80)] {
                Some(character) => out.push(character),
                None => {
                    return Err(format!(
                        "{name}: undefined byte 0x{byte:02X} at offset {offset}"
                    ));
                }
            },
        }
    }
    Ok(out)
}

/// The key every index matches on: lower case, accents and ligatures folded, typographic quotes made plain,
/// every other non-alphanumeric run a single space.
pub fn fold(text: &str) -> String {
    fold_with(text, false)
}

/// `fold` for reading a rule's numbers: a decimal comma or point between two digits stays (as « . »), and the
/// signs < > / stay, each a word of its own (« ≤ » and « ≥ » written <= and >=).
pub fn fold_measures(text: &str) -> String {
    fold_with(text, true)
}

fn fold_with(text: &str, measures: bool) -> String {
    let characters: Vec<char> = text.chars().flat_map(char::to_lowercase).collect();
    let mut out = String::with_capacity(text.len());
    let mut space = false;
    for (index, &character) in characters.iter().enumerate() {
        if measures {
            let digit_at = |at: Option<usize>| {
                at.and_then(|at| characters.get(at))
                    .is_some_and(char::is_ascii_digit)
            };
            if matches!(character, ',' | '.')
                && digit_at(index.checked_sub(1))
                && digit_at(Some(index + 1))
            {
                out.push('.');
                space = false;
                continue;
            }
            let sign = match character {
                '<' => Some("<"),
                '>' => Some(">"),
                '≤' => Some("<="),
                '≥' => Some(">="),
                '/' => Some("/"),
                '=' if out.ends_with("< ") || out.ends_with("> ") => Some("="),
                _ => None,
            };
            if let Some(sign) = sign {
                if sign == "=" {
                    out.pop();
                    out.push('=');
                } else {
                    if !space && !out.is_empty() {
                        out.push(' ');
                    }
                    out.push_str(sign);
                }
                out.push(' ');
                space = true;
                continue;
            }
        }
        let folded: &str = match character {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => "a",
            'ç' => "c",
            'è' | 'é' | 'ê' | 'ë' => "e",
            'ì' | 'í' | 'î' | 'ï' => "i",
            'ñ' => "n",
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' => "o",
            'ù' | 'ú' | 'û' | 'ü' => "u",
            'ý' | 'ÿ' => "y",
            'œ' => "oe",
            'æ' => "ae",
            'ß' => "ss",
            '’' | '‘' | '\'' => "'",
            _ => "",
        };
        if !folded.is_empty() {
            out.push_str(folded);
            space = false;
        } else if character.is_alphanumeric() {
            out.push(character);
            space = false;
        } else if !space && !out.is_empty() {
            out.push(' ');
            space = true;
        }
    }
    out.trim_end().to_string()
}

/// Whether `phrase` (folded) occurs in `text` (folded) as whole words.
pub fn has_words(text: &str, phrase: &str) -> bool {
    !phrase.is_empty()
        && text.match_indices(phrase).any(|(start, _)| {
            let end = start + phrase.len();
            let before = text[..start]
                .chars()
                .next_back()
                .is_none_or(|c| !c.is_alphanumeric());
            let after = text[end..]
                .chars()
                .next()
                .is_none_or(|c| !c.is_alphanumeric());
            before && after
        })
}

/// One collapsed line: runs of white space a single space, trimmed.
pub fn squash(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn entity(name: &str) -> Option<char> {
    if let Some(number) = name.strip_prefix("#x").or_else(|| name.strip_prefix("#X")) {
        return u32::from_str_radix(number, 16)
            .ok()
            .and_then(char::from_u32);
    }
    if let Some(number) = name.strip_prefix('#') {
        return number.parse().ok().and_then(char::from_u32);
    }
    Some(match name {
        "amp" => '&',
        "lt" => '<',
        "gt" => '>',
        "quot" => '"',
        "apos" => '\'',
        "nbsp" => ' ',
        "rsquo" => '’',
        "lsquo" => '‘',
        "laquo" => '«',
        "raquo" => '»',
        "eacute" => 'é',
        "egrave" => 'è',
        "ecirc" => 'ê',
        "agrave" => 'à',
        "acirc" => 'â',
        "ccedil" => 'ç',
        "ocirc" => 'ô',
        "ucirc" => 'û',
        "icirc" => 'î',
        "iuml" => 'ï',
        "deg" => '°',
        "micro" => 'µ',
        "ge" => '≥',
        "le" => '≤',
        "times" => '×',
        "hellip" => '…',
        "ndash" => '–',
        "mdash" => '—',
        _ => return None,
    })
}

/// An HTML fragment as plain text: tags removed, a paragraph or a line break ends a line, a table row is one line
/// with its cells parted by « | », entities
/// decoded, each line collapsed, empty lines dropped.
pub fn html_text(html: &str) -> String {
    let mut out = String::with_capacity(html.len() / 2);
    let mut cell = false;
    let mut rest = html;
    while let Some(index) = rest.find(['<', '&']) {
        // The source's own line breaks are white space; only the tags break lines.
        out.extend(rest[..index].chars().map(|character| {
            if character == '\n' || character == '\r' {
                ' '
            } else {
                character
            }
        }));
        rest = &rest[index..];
        // A « < » not followed by a tag name is text (« DFG < 30 mL/min » as some SmPCs write it).
        let tag_start = rest[1..]
            .chars()
            .next()
            .is_some_and(|next| next.is_ascii_alphabetic() || matches!(next, '/' | '!' | '?'));
        if rest.starts_with('<') && !tag_start {
            out.push('<');
            rest = &rest[1..];
            continue;
        }
        if rest.starts_with('<') {
            let Some(end) = rest.find('>') else {
                rest = "";
                break;
            };
            let closing = rest[1..end].starts_with('/');
            let tag = rest[1..end].trim_start_matches('/').to_ascii_lowercase();
            let name: String = tag
                .chars()
                .take_while(char::is_ascii_alphanumeric)
                .collect();
            // A table row is one line, its cells parted by « | »: a SmPC's dose table reads row by row.
            match name.as_str() {
                "td" | "th" if closing => {
                    cell = false;
                    out.push_str(" | ");
                }
                "td" | "th" => cell = true,
                "tr" | "table" => {
                    cell = false;
                    out.push('\n');
                }
                "p" | "br" | "div" | "li" | "h1" | "h2" | "h3" | "h4" if cell => out.push(' '),
                "p" | "br" | "div" | "li" | "h1" | "h2" | "h3" | "h4" => out.push('\n'),
                _ => {}
            }
            rest = &rest[end + 1..];
        } else {
            let decoded = rest[1..]
                .find(';')
                .filter(|end| *end <= 8)
                .and_then(|end| entity(&rest[1..=end]).map(|character| (character, end + 2)));
            match decoded {
                Some((character, length)) => {
                    out.push(character);
                    rest = &rest[length..];
                }
                None => {
                    out.push('&');
                    rest = &rest[1..];
                }
            }
        }
    }
    out.extend(rest.chars().map(|character| {
        if character == '\n' || character == '\r' {
            ' '
        } else {
            character
        }
    }));
    out.lines()
        .map(|line| {
            squash(line)
                .trim_end_matches(" |")
                .trim_start_matches("| ")
                .to_string()
        })
        .filter(|line| !line.is_empty() && line != "|")
        .collect::<Vec<_>>()
        .join("\n")
}

/// `DD/MM/YYYY` (the BDPM's dates) as `YYYY-MM-DD`; an empty field is no date.
pub fn french_date(field: &str) -> Result<Option<String>, String> {
    let field = field.trim();
    if field.is_empty() {
        return Ok(None);
    }
    let parts: Vec<&str> = field.split('/').collect();
    let valid = parts.len() == 3
        && parts[0].len() == 2
        && parts[1].len() == 2
        && parts[2].len() == 4
        && parts
            .iter()
            .all(|part| part.bytes().all(|byte| byte.is_ascii_digit()));
    if !valid {
        return Err(format!("date '{field}' is not DD/MM/YYYY"));
    }
    Ok(Some(format!("{}-{}-{}", parts[2], parts[1], parts[0])))
}

/// `YYYY-MM-DD` checked as such.
pub fn iso_date(field: &str) -> Result<String, String> {
    let bytes = field.as_bytes();
    let valid = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
    if valid {
        Ok(field.to_string())
    } else {
        Err(format!("date '{field}' is not YYYY-MM-DD"))
    }
}

/// Today's UTC date, `YYYY-MM-DD` (civil-from-days, H. Hinnant).
pub fn today() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("the system clock is set before 1970")
        .as_secs();
    civil_date((seconds / 86_400) as i64)
}

pub fn civil_date(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// The GS1 check digit of a GTIN (CIP13 and EAN-13 alike).
pub fn gtin_valid(code: &str) -> bool {
    let digits: Vec<u32> = code.chars().filter_map(|c| c.to_digit(10)).collect();
    if digits.len() != code.len() || digits.len() < 8 {
        return false;
    }
    let (body, check) = digits.split_at(digits.len() - 1);
    let sum: u32 = body
        .iter()
        .rev()
        .enumerate()
        .map(|(index, digit)| if index % 2 == 0 { digit * 3 } else { *digit })
        .sum();
    (10 - sum % 10) % 10 == check[0]
}
