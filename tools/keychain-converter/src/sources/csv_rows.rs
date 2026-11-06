//! CSV exports of password managers (Apple Passwords, Chromium browsers, Firefox,
//! Bitwarden, LastPass, KeePassXC, Dashlane, Proton Pass, 1Password, or any CSV
//! with recognisable headers). Each header takes a role by its name; a column
//! with no role becomes a custom field labelled by its header, so no cell is lost.

use std::path::Path;

use serde_json::{Map, Value, json};

use super::csv;
use crate::cxf::{
    self, Account, Collection, CredentialScope, CustomFields, FieldKind, Fielded, Item, LinkedItem,
};
use crate::error::{Result, err};
use crate::ids::derive;
use crate::package::PackageWriter;
use crate::report::{LIMIT_CSV, Report};
use crate::totp;

const MAX_BYTES: u64 = 256 << 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Role {
    Title,
    Url,
    Username,
    Email,
    Password,
    Notes,
    Totp,
    Folder,
    Favorite,
    Tags,
    Created,
    Modified,
    Archived,
    RecordType,
    OriginalId,
    Other,
}

const SYNONYMS: &[(Role, &[&str])] = &[
    (Role::Title, &["title", "name", "item name", "titre", "nom"]),
    (
        Role::Url,
        &[
            "url",
            "login_uri",
            "website",
            "web site",
            "uri",
            "login url",
            "adresse",
            "site",
        ],
    ),
    (
        Role::Username,
        &[
            "username",
            "login_username",
            "user name",
            "login",
            "user",
            "identifiant",
            "utilisateur",
        ],
    ),
    (Role::Email, &["email", "e-mail", "email address"]),
    (
        Role::Password,
        &["password", "login_password", "mot de passe"],
    ),
    (
        Role::Notes,
        &[
            "notes",
            "note",
            "extra",
            "comments",
            "comment",
            "commentaire",
            "remarques",
        ],
    ),
    (
        Role::Totp,
        &[
            "otpauth",
            "totp",
            "login_totp",
            "otpsecret",
            "otp",
            "otpurl",
            "one-time password",
        ],
    ),
    (
        Role::Folder,
        &["folder", "grouping", "group", "vault", "category"],
    ),
    (Role::Favorite, &["favorite", "favourite", "fav"]),
    (Role::Tags, &["tags"]),
    (
        Role::Created,
        &[
            "created",
            "createtime",
            "timecreated",
            "created at",
            "creation date",
        ],
    ),
    (
        Role::Modified,
        &[
            "last modified",
            "modifytime",
            "modified",
            "updated",
            "updated at",
        ],
    ),
    (Role::Archived, &["archived"]),
    (Role::RecordType, &["type"]),
    (Role::OriginalId, &["guid", "uuid", "id"]),
];

fn role_of(header: &str) -> Role {
    let header = header.trim().to_lowercase();
    SYNONYMS
        .iter()
        .find(|(_, names)| names.contains(&header.as_str()))
        .map_or(Role::Other, |(role, _)| *role)
}

/// The exporter a header row identifies, for the report.
fn format_of(headers: &[String]) -> &'static str {
    let has = |name: &str| headers.iter().any(|h| h.trim().eq_ignore_ascii_case(name));
    match () {
        _ if has("otpauth") && has("favorite") && has("archived") => "1password",
        _ if has("otpauth") && has("title") && has("notes") => "apple-passwords",
        _ if has("login_uri") => "bitwarden",
        _ if has("httprealm") || has("formactionorigin") => "firefox",
        _ if has("grouping") && has("extra") => "lastpass",
        _ if has("group") && has("last modified") => "keepassxc",
        _ if has("username2") || has("otpsecret") => "dashlane",
        _ if has("vault") && has("createtime") => "proton-pass",
        _ if has("name") && has("url") && has("username") && has("password") => "chromium",
        _ => "generic",
    }
}

fn truthy(value: &str) -> bool {
    ["1", "true", "yes", "y", "x", "on", "✓"].contains(&value.trim().to_lowercase().as_str())
}

/// Unix seconds of a cell: seconds or milliseconds, RFC 3339, or a plain date-time.
fn time_of(value: &str) -> Option<u64> {
    let value = value.trim();
    if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) {
        let number: u64 = value.parse().ok()?;
        return Some(if number > 100_000_000_000 {
            number / 1000
        } else {
            number
        });
    }
    if let Ok(time) = chrono::DateTime::parse_from_rfc3339(value) {
        return u64::try_from(time.timestamp()).ok();
    }
    ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"]
        .iter()
        .find_map(|format| chrono::NaiveDateTime::parse_from_str(value, format).ok())
        .or_else(|| {
            chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.and_hms_opt(0, 0, 0))
        })
        .and_then(|time| u64::try_from(time.and_utc().timestamp()).ok())
}

fn custom_kind(header: &str) -> FieldKind {
    let header = header.to_lowercase();
    if ["password", "secret", "pin", "cvv", "key", "otp", "token"]
        .iter()
        .any(|w| header.contains(w))
    {
        FieldKind::Concealed
    } else if header.contains("mail") {
        FieldKind::Email
    } else {
        FieldKind::String
    }
}

pub fn convert(
    path: &Path,
    package: &mut PackageWriter,
    report: &mut Report,
) -> Result<(String, Vec<Account>)> {
    if std::fs::metadata(path)?.len() > MAX_BYTES {
        return Err(err("source_too_large", MAX_BYTES.to_string()));
    }
    let bytes = std::fs::read(path)?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|e| err("source_not_utf8", format!("byte {}", e.valid_up_to())))?;
    let mut rows = csv::parse(text.strip_prefix('\u{feff}').unwrap_or(text))?.into_iter();
    let (_, headers) = rows.next().ok_or_else(|| err("csv_empty", ""))?;
    let format = format_of(&headers);
    let provider = format!("csv:{format}");
    let mut roles: Vec<Role> = Vec::new();
    for header in &headers {
        let role = role_of(header);
        roles.push(if role != Role::Other && roles.contains(&role) {
            Role::Other
        } else {
            role
        });
    }
    if !roles.contains(&Role::Username)
        && let Some(email) = roles.iter_mut().find(|r| **r == Role::Email)
    {
        *email = Role::Username;
    }
    // A file with none of these columns is not a password export (a wrong file chosen).
    if !roles
        .iter()
        .any(|r| matches!(r, Role::Title | Role::Url | Role::Username | Role::Password))
    {
        return Err(err("csv_not_a_password_export", ""));
    }
    package.add_fidelity("source.csv", &bytes)?;
    report.limit(LIMIT_CSV);
    let mut items: Vec<Item> = Vec::new();
    let mut folders: Vec<(String, Vec<LinkedItem>)> = Vec::new();
    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (line, cells) in rows {
        if cells.len() != headers.len() {
            return Err(err(
                "csv_row_width",
                format!("line {line}: {} of {} columns", cells.len(), headers.len()),
            ));
        }
        let cell = |role: Role| {
            roles
                .iter()
                .position(|r| *r == role)
                .map_or("", |i| cells[i].as_str())
        };
        let mut login = Fielded::new("basic-auth");
        login.put("username", cell(Role::Username), None);
        login.put("password", cell(Role::Password), None);
        let mut note = Fielded::new("note");
        note.put("content", cell(Role::Notes), None);
        let mut custom = CustomFields::default();
        let mut others: Vec<Value> = Vec::new();
        let mut times = [None, None];
        for ((header, value), role) in headers.iter().zip(&cells).zip(&roles) {
            match role {
                Role::Totp if !value.trim().is_empty() => match totp::parse(value) {
                    Ok(code) => others.push(cxf::totp(&code)),
                    Err(reason) => {
                        custom.push(FieldKind::Concealed, value.clone(), Some(header.clone()));
                        report.warn(reason, None, format!("line {line}"));
                    }
                },
                Role::Created | Role::Modified if !value.is_empty() => match time_of(value) {
                    Some(time) => times[usize::from(*role == Role::Modified)] = Some(time),
                    None => custom.push(FieldKind::String, value.clone(), Some(header.clone())),
                },
                Role::Email | Role::Other => {
                    custom.push(custom_kind(header), value.clone(), Some(header.clone()))
                }
                _ => {}
            }
        }
        let original = cell(Role::OriginalId).to_string();
        let (title, url, username) = (cell(Role::Title), cell(Role::Url), cell(Role::Username));
        let key = if original.is_empty() {
            format!("{title}\0{url}\0{username}")
        } else {
            original.clone()
        };
        let count = seen.entry(key.clone()).or_default();
        let id = derive(&["item", "csv", format, &key, &count.to_string()]);
        *count += 1;
        let mut facts = Map::from_iter([
            ("provider".to_string(), json!(provider)),
            ("sourceLine".to_string(), json!(line)),
        ]);
        if !original.is_empty() {
            facts.insert("originalId".into(), json!(original));
        }
        let record_type = cell(Role::RecordType);
        report.category(if record_type.is_empty() {
            "login"
        } else {
            record_type
        });
        if !record_type.is_empty() {
            facts.insert("recordType".into(), json!(record_type));
        }
        if truthy(cell(Role::Archived)) {
            facts.insert("state".into(), json!("archived"));
            report.archived += 1;
        }
        let folder = cell(Role::Folder);
        if !folder.is_empty() {
            let linked = LinkedItem {
                item: id.clone(),
                account: None,
            };
            match folders.iter_mut().find(|(name, _)| name == folder) {
                Some((_, members)) => members.push(linked),
                None => folders.push((folder.to_string(), vec![linked])),
            }
        }
        let mut credentials: Vec<Value> = login.into_value().into_iter().collect();
        credentials.extend(others);
        credentials.extend(note.into_value());
        credentials.extend(custom.into_value());
        items.push(Item {
            id,
            creation_at: times[0],
            modified_at: times[1],
            title: title.to_string(),
            subtitle: None,
            favorite: truthy(cell(Role::Favorite)),
            scope: CredentialScope::of_urls([url.to_string()]),
            credentials,
            tags: Some(cell(Role::Tags).trim().to_string())
                .filter(|t| !t.is_empty())
                .into_iter()
                .collect(),
            extensions: vec![cxf::source_extension(facts)],
        });
    }
    let collections = folders
        .into_iter()
        .map(|(name, members)| Collection {
            id: derive(&["collection", "csv", format, &name]),
            creation_at: None,
            modified_at: None,
            title: name,
            subtitle: None,
            items: members,
            sub_collections: Vec::new(),
            extensions: Vec::new(),
        })
        .collect();
    let account = Account {
        id: derive(&["account", "csv", format]),
        username: String::new(),
        email: String::new(),
        full_name: None,
        collections,
        items,
        extensions: Vec::new(),
    };
    Ok((provider, vec![account]))
}
