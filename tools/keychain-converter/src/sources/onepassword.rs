//! The item model both 1Password exports (1PUX, 1PIF) are read into, and its one
//! mapping to a CXF Item. Nothing is dropped: a value with no CXF member becomes
//! a custom field of its section, a value CXF cannot hold at all (strength
//! metrics, input traits…) stays in the sealed fidelity backup and is counted.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Map, Value, json};

use super::onepassword_rules::{Target, category_name, rules, ssh_key_type, wifi_security};
use crate::cxf::{self, CredentialScope, CustomFields, FieldKind, Fielded};
use crate::error::Result;
use crate::ids::{b64url, derive};
use crate::package::PackageWriter;
use crate::report::{LIMIT_PASSWORD_HISTORY, Report};
use crate::totp;

#[derive(Debug, Clone, Default)]
pub struct FileRef {
    pub document_id: String,
    pub name: String,
    pub declared_size: Option<u64>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Address {
    pub street: String,
    pub city: String,
    pub zip: String,
    pub state: String,
    pub country: String,
}

#[derive(Debug, Clone)]
pub enum FieldValue {
    Text(String),
    Concealed(String),
    Email(String),
    Totp(String),
    Date(i64),
    MonthYear(i64),
    Address(Address),
    Reference(String),
    SshKey {
        private_key: String,
        key_type: String,
    },
    File(FileRef),
    Unknown {
        kind: String,
        json: String,
    },
}

#[derive(Debug, Clone)]
pub struct SourceField {
    pub id: String,
    pub title: String,
    pub value: FieldValue,
}

#[derive(Debug, Clone, Default)]
pub struct Section {
    pub title: String,
    pub fields: Vec<SourceField>,
}

#[derive(Debug, Clone, Default)]
pub struct LoginField {
    pub name: String,
    pub designation: String,
    pub kind: String,
    pub value: String,
}

#[derive(Debug, Clone, Default)]
pub struct SourceItem {
    pub uuid: String,
    pub category: String,
    pub title: String,
    pub subtitle: String,
    pub urls: Vec<(String, String)>,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub created: Option<u64>,
    pub updated: Option<u64>,
    pub state: String,
    pub notes: String,
    pub login_fields: Vec<LoginField>,
    pub password: Option<String>,
    pub sections: Vec<Section>,
    pub password_history: Vec<(String, Option<u64>)>,
    pub attachments: Vec<FileRef>,
    pub passkey: bool,
}

/// Where an export keeps the bytes of its attachments.
pub trait Attachments {
    fn fetch(&mut self, file: &FileRef) -> Result<Option<Vec<u8>>>;
}

pub struct Env<'a> {
    pub source: &'static str,
    /// Source id of the enclosing account: an item uuid is unique only within it, and a
    /// reference may target an item of another vault of the same account.
    pub scope: Vec<String>,
    pub report: &'a mut Report,
    pub package: &'a mut PackageWriter,
    pub attachments: &'a mut dyn Attachments,
}

impl Env<'_> {
    pub fn id(&self, kind: &str, uuid: &str) -> String {
        let mut parts = vec![kind, self.source];
        parts.extend(self.scope.iter().map(String::as_str));
        parts.push(uuid);
        derive(&parts)
    }
}

pub fn unix_date(seconds: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(seconds, 0).map(|time| time.format("%Y-%m-%d").to_string())
}

fn year_month(value: i64) -> Option<String> {
    let (year, month) = (value / 100, value % 100);
    ((1..=9999).contains(&year) && (1..=12).contains(&month))
        .then(|| format!("{year:04}-{month:02}"))
}

/// The text and CXF kind of a scalar value.
fn scalar(value: &FieldValue) -> Option<(String, FieldKind)> {
    Some(match value {
        FieldValue::Text(text) => (text.clone(), FieldKind::String),
        FieldValue::Concealed(text) => (text.clone(), FieldKind::Concealed),
        FieldValue::Email(text) => (text.clone(), FieldKind::Email),
        FieldValue::Date(seconds) => unix_date(*seconds)
            .map(|date| (date, FieldKind::Date))
            .unwrap_or((seconds.to_string(), FieldKind::Number)),
        FieldValue::MonthYear(value) => year_month(*value)
            .map(|month| (month, FieldKind::YearMonth))
            .unwrap_or((value.to_string(), FieldKind::Number)),
        _ => return None,
    })
}

/// The DER bytes of a PKCS#8 PEM private key, base64url as CXF §3.3.15 requires.
fn pkcs8_b64url(pem: &str) -> Option<String> {
    let body = pem
        .trim()
        .strip_prefix("-----BEGIN PRIVATE KEY-----")?
        .strip_suffix("-----END PRIVATE KEY-----")?;
    let base64: String = body.chars().filter(|c| !c.is_whitespace()).collect();
    STANDARD.decode(base64).ok().map(|der| b64url(&der))
}

#[derive(Default)]
struct Builder {
    fielded: Vec<Fielded>,
    others: Vec<Value>,
    urls: Vec<String>,
    customs: Vec<CustomFields>,
}

impl Builder {
    fn fielded(&mut self, kind: &'static str) -> &mut Fielded {
        let index = match self
            .fielded
            .iter()
            .position(|credential| credential.kind() == kind)
        {
            Some(index) => index,
            None => {
                self.fielded.push(Fielded::new(kind));
                self.fielded.len() - 1
            }
        };
        &mut self.fielded[index]
    }
}

fn label(field: &SourceField) -> Option<String> {
    Some(if field.title.is_empty() {
        field.id.clone()
    } else {
        field.title.clone()
    })
    .filter(|l| !l.is_empty())
}

fn attach(
    file: &FileRef,
    uuid: &str,
    item_id: &str,
    env: &mut Env<'_>,
    out: &mut Builder,
) -> Result<()> {
    let Some(bytes) = env.attachments.fetch(file)? else {
        env.report.warn(
            "attachment_missing",
            Some(item_id),
            file.document_id.clone(),
        );
        return Ok(());
    };
    if file
        .declared_size
        .is_some_and(|size| size != bytes.len() as u64)
    {
        env.report.warn(
            "attachment_size_differs_from_declared",
            Some(item_id),
            file.document_id.clone(),
        );
    }
    let id = env.id("file", &format!("{uuid}/{}", file.document_id));
    let (size, hash) = env.package.add_document(&id, &bytes)?;
    out.others.push(cxf::file(&id, &file.name, size, &hash));
    Ok(())
}

fn place(
    field: &SourceField,
    custom: &mut CustomFields,
    rules: &[(&str, Target)],
    uuid: &str,
    item_id: &str,
    env: &mut Env<'_>,
    out: &mut Builder,
) -> Result<()> {
    let rule = rules
        .iter()
        .find(|(id, _)| *id == field.id)
        .map(|(_, target)| target);
    match &field.value {
        FieldValue::Totp(uri) if !uri.trim().is_empty() => match totp::parse(uri) {
            Ok(code) => out.others.push(cxf::totp(&code)),
            Err(reason) => {
                custom.push(FieldKind::Concealed, uri.clone(), label(field));
                env.report
                    .warn(reason, Some(item_id), label(field).unwrap_or_default());
            }
        },
        FieldValue::Address(address) => {
            let country = address.country.to_ascii_uppercase();
            let parts = [
                ("streetAddress", &address.street),
                ("city", &address.city),
                ("postalCode", &address.zip),
                ("territory", &address.state),
                ("country", &country),
            ];
            for (member, value) in parts {
                if !out
                    .fielded("address")
                    .put(member, value, label(field).as_deref())
                {
                    custom.push(
                        FieldKind::String,
                        value.clone(),
                        Some(format!("{} {member}", label(field).unwrap_or_default())),
                    );
                }
            }
        }
        FieldValue::Reference(target) if !target.is_empty() => out
            .others
            .push(cxf::item_reference(&env.id("item", target))),
        FieldValue::SshKey {
            private_key,
            key_type,
        } if !private_key.is_empty() => match (pkcs8_b64url(private_key), ssh_key_type(key_type)) {
            (Some(der), Some(kind)) => out.others.push(cxf::ssh_key(kind, &der)),
            _ => {
                custom.push(FieldKind::Concealed, private_key.clone(), label(field));
                env.report.warn(
                    "ssh_key_not_pkcs8_or_type_unknown",
                    Some(item_id),
                    key_type.clone(),
                );
            }
        },
        FieldValue::File(file) => attach(file, uuid, item_id, env, out)?,
        FieldValue::Unknown { kind, json } => {
            // A value of an unknown shape may be a secret: it is kept concealed.
            custom.push(FieldKind::Concealed, json.clone(), label(field));
            env.report
                .warn("source_field_type_unknown", Some(item_id), kind.clone());
        }
        value => {
            let Some((mut text, kind)) = scalar(value) else {
                return Ok(());
            };
            match rule {
                Some(Target::Scope) => out.urls.push(text),
                Some(Target::Member(credential, member)) => {
                    if *member == "networkSecurityType" {
                        text = wifi_security(&text).to_string();
                    }
                    if member.ends_with("ountry") && text.len() == 2 {
                        text = text.to_ascii_uppercase();
                    }
                    if !out
                        .fielded(credential)
                        .put(member, &text, label(field).as_deref())
                    {
                        custom.push(kind, text, label(field));
                    }
                }
                None => custom.push(kind, text, label(field)),
            }
        }
    }
    Ok(())
}

fn login(item: &SourceItem, out: &mut Builder) {
    let mut web_form = CustomFields::labelled(Some("Web Form Details".into()));
    for field in item
        .login_fields
        .iter()
        .filter(|field| !field.value.is_empty())
    {
        let member = match field.designation.as_str() {
            "username" => Some("username"),
            "password" => Some("password"),
            _ => None,
        };
        if member.is_some_and(|member| out.fielded("basic-auth").put(member, &field.value, None)) {
            continue;
        }
        let kind = match field.kind.as_str() {
            "P" => FieldKind::Concealed,
            "E" => FieldKind::Email,
            "N" => FieldKind::Number,
            _ => FieldKind::String,
        };
        web_form.push(kind, field.value.clone(), Some(field.name.clone()));
    }
    if let Some(password) = item.password.as_ref().filter(|p| !p.is_empty())
        && !out.fielded("basic-auth").put("password", password, None)
    {
        web_form.push(
            FieldKind::Concealed,
            password.clone(),
            Some("password".into()),
        );
    }
    out.customs.push(web_form);
}

pub fn map_item(item: &SourceItem, env: &mut Env<'_>) -> Result<cxf::Item> {
    let item_id = env.id("item", &item.uuid);
    let mut out = Builder::default();
    env.report.category(category_name(&item.category));
    login(item, &mut out);
    let item_rules = rules(&item.category);
    for section in &item.sections {
        let mut custom = CustomFields::labelled(Some(section.title.clone()));
        for field in &section.fields {
            place(
                field,
                &mut custom,
                item_rules,
                &item.uuid,
                &item_id,
                env,
                &mut out,
            )?;
        }
        out.customs.push(custom);
    }
    for file in &item.attachments {
        attach(file, &item.uuid, &item_id, env, &mut out)?;
    }
    let mut labelled_urls = CustomFields::labelled(Some("URLs".into()));
    for (url_label, url) in &item.urls {
        if !url_label.is_empty() {
            labelled_urls.push(FieldKind::String, url.clone(), Some(url_label.clone()));
        }
    }
    out.customs.push(labelled_urls);
    if !item.password_history.is_empty() {
        let mut history = CustomFields::labelled(Some("Password History".into()));
        for (password, time) in &item.password_history {
            history.push(
                FieldKind::Concealed,
                password.clone(),
                time.and_then(|t| unix_date(t as i64)),
            );
        }
        out.customs.push(history);
        env.report.limit(LIMIT_PASSWORD_HISTORY);
    }
    if item.passkey {
        env.report.passkeys_found += 1;
        env.report
            .warn("passkey_not_exportable", Some(&item_id), "");
    }
    match item.state.as_str() {
        "archived" => env.report.archived += 1,
        "trashed" => env.report.trashed += 1,
        _ => {}
    }
    let mut note = Fielded::new("note");
    note.put("content", &item.notes, None);
    let mut credentials: Vec<Value> = out
        .fielded
        .into_iter()
        .filter_map(Fielded::into_value)
        .collect();
    credentials.extend(out.others);
    credentials.extend(note.into_value());
    credentials.extend(out.customs.into_iter().filter_map(CustomFields::into_value));
    let mut facts = Map::new();
    facts.insert("provider".into(), json!(env.source));
    facts.insert("originalId".into(), json!(item.uuid));
    facts.insert("category".into(), json!(item.category));
    if !item.state.is_empty() && item.state != "active" {
        facts.insert("state".into(), json!(item.state));
    }
    let urls = item.urls.iter().map(|(_, url)| url.clone()).chain(out.urls);
    Ok(cxf::Item {
        id: item_id,
        creation_at: item.created,
        modified_at: item.updated,
        title: item.title.clone(),
        subtitle: Some(item.subtitle.clone()).filter(|s| !s.is_empty()),
        favorite: item.favorite,
        scope: CredentialScope::of_urls(urls),
        credentials,
        tags: item.tags.clone(),
        extensions: vec![cxf::source_extension(facts)],
    })
}
