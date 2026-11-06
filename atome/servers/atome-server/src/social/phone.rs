// A number as the address book has it, written E.164 (atome/src/shared/phone_number.js
// `normalizePhoneToE164`, and contact_book_hash.js, ported): a national number takes
// the server's own country, read as Node reads it — its time zone, then its locale,
// else France — and a fingerprint salts the number by the book's owner.
use sha2::{Digest, Sha256};
use std::sync::OnceLock;

// (region, calling code, trunk prefix).
const COUNTRIES: [(&str, &str, &str); 29] = [
    ("AT", "43", "0"),
    ("AU", "61", "0"),
    ("BE", "32", "0"),
    ("BR", "55", "0"),
    ("CA", "1", ""),
    ("CH", "41", "0"),
    ("DE", "49", "0"),
    ("DK", "45", ""),
    ("ES", "34", ""),
    ("FI", "358", "0"),
    ("FR", "33", "0"),
    ("GB", "44", "0"),
    ("GR", "30", ""),
    ("IE", "353", "0"),
    ("IN", "91", "0"),
    ("IT", "39", ""),
    ("JP", "81", "0"),
    ("LU", "352", ""),
    ("MA", "212", "0"),
    ("MC", "377", ""),
    ("MX", "52", ""),
    ("NL", "31", "0"),
    ("NO", "47", ""),
    ("NZ", "64", "0"),
    ("PL", "48", ""),
    ("PT", "351", ""),
    ("SE", "46", "0"),
    ("TN", "216", ""),
    ("US", "1", ""),
];

const TIME_ZONES: [(&str, &str); 8] = [
    ("Europe/Paris", "FR"),
    ("Europe/London", "GB"),
    ("Europe/Brussels", "BE"),
    ("Europe/Zurich", "CH"),
    ("Europe/Berlin", "DE"),
    ("Europe/Madrid", "ES"),
    ("Europe/Rome", "IT"),
    ("Europe/Lisbon", "PT"),
];

// `new Intl.Locale(language).maximize().region` of a locale naming no region.
const LIKELY_REGIONS: [(&str, &str); 20] = [
    ("da", "DK"),
    ("de", "DE"),
    ("el", "GR"),
    ("en", "US"),
    ("es", "ES"),
    ("fi", "FI"),
    ("fr", "FR"),
    ("ga", "IE"),
    ("hi", "IN"),
    ("it", "IT"),
    ("ja", "JP"),
    ("lb", "LU"),
    ("nb", "NO"),
    ("nl", "NL"),
    ("nn", "NO"),
    ("no", "NO"),
    ("pl", "PL"),
    ("pt", "BR"),
    ("sv", "SE"),
    ("mi", "NZ"),
];

fn country(region: &str) -> Option<(&'static str, &'static str, &'static str)> {
    COUNTRIES.iter().copied().find(|(code, ..)| *code == region)
}

// The zone Node's ICU reads: `TZ`, else the system's `/etc/localtime`.
fn time_zone() -> Option<String> {
    if let Ok(zone) = std::env::var("TZ") {
        return Some(zone.trim_start_matches(':').to_string());
    }
    let target = std::fs::read_link("/etc/localtime").ok()?;
    let target = target.to_string_lossy();
    target
        .split_once("zoneinfo/")
        .map(|(_, zone)| zone.to_string())
}

// The locale Node's ICU reads from the POSIX environment (`C` is `en_US_POSIX`).
fn locale_region() -> Option<&'static str> {
    let locale = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|value| !value.is_empty())
        .filter(|value| value != "C" && value != "POSIX")
        .unwrap_or_else(|| "en_US".into());
    let locale = locale.split(['.', '@']).next().unwrap_or_default();
    let mut parts = locale.split(['_', '-']);
    let language = parts.next().unwrap_or_default().to_lowercase();
    match parts.find(|part| part.len() == 2 || part.len() == 3) {
        Some(region) => country(&region.to_uppercase()).map(|(code, ..)| code),
        None => LIKELY_REGIONS
            .iter()
            .find(|(name, _)| *name == language)
            .and_then(|(_, region)| country(region))
            .map(|(code, ..)| code),
    }
}

// `inferPhoneRegion()` on the server.
fn server_region() -> &'static str {
    static REGION: OnceLock<&'static str> = OnceLock::new();
    REGION.get_or_init(|| {
        time_zone()
            .and_then(|zone| {
                TIME_ZONES
                    .iter()
                    .find(|(name, _)| *name == zone)
                    .map(|(_, region)| *region)
            })
            .or_else(locale_region)
            .unwrap_or("FR")
    })
}

// Unicode's format characters (`\p{Cf}`): direction marks and the like.
fn is_format(c: char) -> bool {
    matches!(c as u32,
        0x00AD | 0x0600..=0x0605 | 0x061C | 0x06DD | 0x070F | 0x0890..=0x0891 | 0x08E2 | 0x180E
        | 0x200B..=0x200F | 0x202A..=0x202E | 0x2060..=0x2064 | 0x2066..=0x206F | 0xFEFF
        | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD | 0x13430..=0x1343F | 0x1BCA0..=0x1BCA3
        | 0x1D173..=0x1D17A | 0xE0001 | 0xE0020..=0xE007F)
}

fn all_digits(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_digit())
}

// `cleanPhone`: format characters out, an international "(0)" trunk dropped, separators out.
fn clean(value: &str) -> String {
    let text: String = value.chars().filter(|c| !is_format(*c)).collect();
    let text = crate::vault_router::js::trim(&text);
    let prefix = if text.starts_with('+') {
        1
    } else if text.starts_with("00") {
        2
    } else {
        0
    };
    let mut text = text.to_string();
    if prefix > 0 {
        let digits = text[prefix..]
            .bytes()
            .take_while(u8::is_ascii_digit)
            .count();
        let rest = &text[prefix + digits..];
        let spaced = rest
            .trim_start_matches(|c: char| crate::vault_router::js::trim(&c.to_string()).is_empty());
        if digits > 0 && spaced.starts_with("(0)") {
            text = format!("{}{}", &text[..prefix + digits], &spaced[3..]);
        }
    }
    text.chars()
        .filter(|c| {
            !matches!(c, '(' | ')' | '.' | '-' | '/')
                && !crate::vault_router::js::trim(&c.to_string()).is_empty()
        })
        .collect()
}

/// `normalizePhoneToE164(value)` with the server's region.
pub fn e164(value: &str) -> String {
    let compact = clean(value);
    if let Some(digits) = compact
        .strip_prefix('+')
        .or_else(|| compact.strip_prefix("00"))
    {
        return if all_digits(digits) {
            format!("+{digits}")
        } else {
            String::new()
        };
    }
    if !all_digits(&compact) {
        return String::new();
    }
    let (_, calling, trunk) = country(server_region())
        .or_else(|| country("FR"))
        .expect("France");
    let national = match compact.strip_prefix(trunk).filter(|_| !trunk.is_empty()) {
        Some(national) => national,
        None if compact.starts_with(calling) => return format!("+{compact}"),
        None => &compact,
    };
    if national.is_empty() {
        String::new()
    } else {
        format!("+{calling}{national}")
    }
}

/// `contactBookPhone`: the E.164 form, or empty.
pub fn book_phone(value: &str) -> String {
    let normalized = e164(value);
    if normalized.starts_with('+') {
        normalized
    } else {
        String::new()
    }
}

/// `contactBookHash(owner, phone)`: hex SHA-256 of the tag, the owner and the number.
pub fn book_hash(owner: &str, phone: &str) -> String {
    let owner = crate::vault_router::js::trim(owner);
    let number = book_phone(phone);
    if owner.is_empty() || number.is_empty() {
        return String::new();
    }
    let digest = Sha256::digest(format!("atome.contact-book.v1\0{owner}\0{number}"));
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}
