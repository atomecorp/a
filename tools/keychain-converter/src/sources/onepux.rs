//! 1Password 8 unencrypted export (`.1pux`): a ZIP holding `export.attributes`,
//! `export.data` (accounts → vaults → items) and `files/<documentId>_…`.
//! Accounts become CXF Accounts, vaults Collections, items Items.

use std::collections::BTreeSet;
use std::fs::File;
use std::path::Path;

use serde_json::{Map, Value, json};

use super::onepassword::{
    Address, Attachments, Env, FieldValue, FileRef, LoginField, Section, SourceField, SourceItem,
    map_item,
};
use super::strict::{self, Object, opt_array, opt_object, opt_str, req_str, str_or_empty};
use crate::cxf::{self, Account, Collection, LinkedItem};
use crate::error::{Result, err};
use crate::ids::derive;
use crate::package::PackageWriter;
use crate::report::Report;
use crate::safe_zip::{Limits, SafeZip};

pub const SOURCE: &str = "1password-1pux";
/// The `export.attributes` version this reader was written against.
const KNOWN_VERSION: i64 = 3;
const FILES: &str = "files/";

struct ZipAttachments {
    zip: SafeZip<File>,
    used: BTreeSet<String>,
}

impl Attachments for ZipAttachments {
    fn fetch(&mut self, file: &FileRef) -> Result<Option<Vec<u8>>> {
        let by_path = file
            .path
            .as_ref()
            .filter(|path| self.zip.contains(path))
            .cloned();
        let name = by_path.or_else(|| {
            let prefix = format!("{FILES}{}_", file.document_id);
            let candidates: Vec<&str> = self
                .zip
                .names()
                .filter(|name| name.starts_with(&prefix))
                .collect();
            candidates
                .iter()
                .find(|name| !file.name.is_empty() && name.ends_with(&file.name))
                .or(candidates.first())
                .map(|name| name.to_string())
        });
        let Some(name) = name.filter(|_| !file.document_id.is_empty() || file.path.is_some())
        else {
            return Ok(None);
        };
        let bytes = self.zip.read(&name)?;
        self.used.insert(name);
        Ok(Some(bytes))
    }
}

fn parse_json(bytes: &[u8], name: &str) -> Result<Value> {
    serde_json::from_slice(bytes).map_err(|e| {
        err(
            "source_json_invalid",
            format!("{name}: line {} column {}", e.line(), e.column()),
        )
    })
}

fn field_value(value: Option<&Value>) -> FieldValue {
    let Some((kind, inner)) = value
        .and_then(Value::as_object)
        .and_then(|map| map.iter().find(|(_, inner)| !inner.is_null()))
    else {
        return FieldValue::Text(String::new());
    };
    let text = || inner.as_str().map(str::to_string);
    let string_of = |map: &Object, key: &str| {
        map.get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let known = match kind.as_str() {
        "concealed" | "creditCardNumber" => text().map(FieldValue::Concealed),
        "string" | "phone" | "url" | "menu" | "gender" | "creditCardType" => {
            text().map(FieldValue::Text)
        }
        "totp" => text().map(FieldValue::Totp),
        "reference" => text().map(FieldValue::Reference),
        "email" => text()
            .or_else(|| {
                inner
                    .get("email_address")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .map(FieldValue::Email),
        "date" => inner.as_i64().map(FieldValue::Date),
        "monthYear" => inner.as_i64().map(FieldValue::MonthYear),
        "address" => inner.as_object().map(|map| {
            FieldValue::Address(Address {
                street: string_of(map, "street"),
                city: string_of(map, "city"),
                zip: string_of(map, "zip"),
                state: string_of(map, "state"),
                country: string_of(map, "country"),
            })
        }),
        "sshKey" => inner.as_object().map(|map| {
            let metadata = map.get("metadata").and_then(Value::as_object);
            let from_metadata = |key: &str| {
                metadata
                    .map(|m| string_of(m, key))
                    .filter(|v| !v.is_empty())
            };
            FieldValue::SshKey {
                private_key: from_metadata("privateKey")
                    .unwrap_or_else(|| string_of(map, "privateKey")),
                key_type: from_metadata("keyType").unwrap_or_default(),
            }
        }),
        "file" => inner.as_object().map(|map| {
            FieldValue::File(FileRef {
                document_id: string_of(map, "documentId"),
                name: string_of(map, "fileName"),
                declared_size: map.get("decryptedSize").and_then(Value::as_u64),
                path: None,
            })
        }),
        _ => None,
    };
    known.unwrap_or_else(|| FieldValue::Unknown {
        kind: kind.clone(),
        json: inner.to_string(),
    })
}

fn sections(details: &Object, path: &str, report: &mut Report) -> Result<Vec<Section>> {
    let mut out = Vec::new();
    for (s, section) in opt_array(details, "sections", path)?.iter().enumerate() {
        let path = format!("{path}.sections[{s}]");
        let section = strict::object(section, &path)?;
        let mut fields = Vec::new();
        for (f, field) in opt_array(section, "fields", &path)?.iter().enumerate() {
            let path = format!("{path}.fields[{f}]");
            let field = strict::object(field, &path)?;
            strict::unknown_keys(field, &["title", "id", "value"], "details.sections.fields")
                .for_each(|k| report.unmapped_key(k));
            fields.push(SourceField {
                id: str_or_empty(field, "id", &path)?,
                title: str_or_empty(field, "title", &path)?,
                value: field_value(field.get("value")),
            });
        }
        out.push(Section {
            title: str_or_empty(section, "title", &path)?,
            fields,
        });
    }
    Ok(out)
}

fn document(map: &Object, path: &str) -> Result<FileRef> {
    Ok(FileRef {
        document_id: str_or_empty(map, "documentId", path)?,
        name: str_or_empty(map, "fileName", path)?,
        declared_size: strict::opt_time(map, "decryptedSize", path)?,
        path: None,
    })
}

fn parse_item(value: &Value, path: &str, report: &mut Report) -> Result<SourceItem> {
    let map = strict::object(value, path)?;
    let known_item = [
        "uuid",
        "favIndex",
        "createdAt",
        "updatedAt",
        "state",
        "categoryUuid",
        "details",
        "overview",
        "file",
    ];
    strict::unknown_keys(map, &known_item, "item").for_each(|k| report.unmapped_key(k));
    let empty = Map::new();
    let overview = opt_object(map, "overview", path)?.unwrap_or(&empty);
    let details = opt_object(map, "details", path)?.unwrap_or(&empty);
    let (opath, dpath) = (format!("{path}.overview"), format!("{path}.details"));
    strict::unknown_keys(
        overview,
        &["subtitle", "title", "url", "urls", "tags"],
        "overview",
    )
    .for_each(|k| report.unmapped_key(k));
    let known_details = [
        "loginFields",
        "notesPlain",
        "sections",
        "passwordHistory",
        "documentAttributes",
        "password",
        "passkey",
    ];
    strict::unknown_keys(details, &known_details, "details").for_each(|k| report.unmapped_key(k));
    let mut item = SourceItem {
        uuid: req_str(map, "uuid", path)?,
        category: req_str(map, "categoryUuid", path)?,
        state: opt_str(map, "state", path)?.unwrap_or_else(|| "active".into()),
        favorite: strict::opt_i64(map, "favIndex", path)?.is_some_and(|index| index > 0),
        created: strict::opt_time(map, "createdAt", path)?,
        updated: strict::opt_time(map, "updatedAt", path)?,
        title: str_or_empty(overview, "title", &opath)?,
        subtitle: str_or_empty(overview, "subtitle", &opath)?,
        tags: strict::strings(overview, "tags", &opath)?,
        notes: str_or_empty(details, "notesPlain", &dpath)?,
        password: opt_str(details, "password", &dpath)?,
        passkey: details
            .get("passkey")
            .is_some_and(|passkey| !passkey.is_null()),
        sections: sections(details, &dpath, report)?,
        ..SourceItem::default()
    };
    if let Some(url) = opt_str(overview, "url", &opath)?.filter(|url| !url.is_empty()) {
        item.urls.push((String::new(), url));
    }
    for (u, url) in opt_array(overview, "urls", &opath)?.iter().enumerate() {
        let upath = format!("{opath}.urls[{u}]");
        let url = strict::object(url, &upath)?;
        item.urls.push((
            str_or_empty(url, "label", &upath)?,
            str_or_empty(url, "url", &upath)?,
        ));
    }
    for (l, field) in opt_array(details, "loginFields", &dpath)?
        .iter()
        .enumerate()
    {
        let lpath = format!("{dpath}.loginFields[{l}]");
        let field = strict::object(field, &lpath)?;
        item.login_fields.push(LoginField {
            name: str_or_empty(field, "name", &lpath)?,
            designation: str_or_empty(field, "designation", &lpath)?,
            kind: opt_str(field, "fieldType", &lpath)?
                .map_or_else(|| str_or_empty(field, "type", &lpath), Ok)?,
            value: str_or_empty(field, "value", &lpath)?,
        });
    }
    for (h, entry) in opt_array(details, "passwordHistory", &dpath)?
        .iter()
        .enumerate()
    {
        let hpath = format!("{dpath}.passwordHistory[{h}]");
        let entry = strict::object(entry, &hpath)?;
        item.password_history.push((
            str_or_empty(entry, "value", &hpath)?,
            strict::opt_time(entry, "time", &hpath)?,
        ));
    }
    if let Some(attributes) = opt_object(details, "documentAttributes", &dpath)? {
        item.attachments.push(document(attributes, &dpath)?);
    }
    if let Some(file) = opt_object(map, "file", path)? {
        let attrs = opt_object(file, "attrs", path)?.unwrap_or(&empty);
        let mut reference = document(attrs, path)?;
        reference.path = opt_str(file, "path", path)?;
        item.attachments.push(reference);
    }
    Ok(item)
}

fn source_facts(pairs: &[(&str, &str)]) -> Vec<Value> {
    let facts: Map<String, Value> = pairs
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .map(|(key, value)| (key.to_string(), json!(value)))
        .chain([("provider".to_string(), json!(SOURCE))])
        .collect();
    vec![cxf::source_extension(facts)]
}

pub fn convert(
    path: &Path,
    package: &mut PackageWriter,
    report: &mut Report,
) -> Result<Vec<Account>> {
    let mut zip = SafeZip::open(File::open(path)?, Limits::DEFAULT)?;
    let attributes_bytes = zip.read("export.attributes")?;
    let data_bytes = zip.read("export.data")?;
    let attributes = parse_json(&attributes_bytes, "export.attributes")?;
    let attrs = strict::object(&attributes, "export.attributes")?;
    if let Some(version) =
        strict::opt_i64(attrs, "version", "export.attributes")?.filter(|v| *v > KNOWN_VERSION)
    {
        report.warn("source_version_newer", None, version.to_string());
    }
    let data = parse_json(&data_bytes, "export.data")?;
    let root = strict::object(&data, "export.data")?;
    strict::unknown_keys(root, &["accounts"], "export.data").for_each(|k| report.unmapped_key(k));
    let Some(Value::Array(accounts)) = root.get("accounts") else {
        return Err(err(
            "source_structure_invalid",
            "export.data.accounts: array expected",
        ));
    };
    package.add_fidelity("export.attributes", &attributes_bytes)?;
    package.add_fidelity("export.data", &data_bytes)?;
    drop((attributes_bytes, data_bytes));
    let mut attachments = ZipAttachments {
        zip,
        used: BTreeSet::new(),
    };
    let mut out = Vec::new();
    for (a, account) in accounts.iter().enumerate() {
        let apath = format!("accounts[{a}]");
        let account = strict::object(account, &apath)?;
        let attrs = opt_object(account, "attrs", &apath)?.ok_or_else(|| {
            err(
                "source_structure_invalid",
                format!("{apath}.attrs: object expected"),
            )
        })?;
        let account_uuid = req_str(attrs, "uuid", &apath)?;
        let (mut items, mut collections) = (Vec::new(), Vec::new());
        for (v, vault) in opt_array(account, "vaults", &apath)?.iter().enumerate() {
            let vpath = format!("{apath}.vaults[{v}]");
            let vault = strict::object(vault, &vpath)?;
            let vattrs = opt_object(vault, "attrs", &vpath)?.ok_or_else(|| {
                err(
                    "source_structure_invalid",
                    format!("{vpath}.attrs: object expected"),
                )
            })?;
            let vault_uuid = req_str(vattrs, "uuid", &vpath)?;
            let mut linked = Vec::new();
            for (i, item) in opt_array(vault, "items", &vpath)?.iter().enumerate() {
                let source = parse_item(item, &format!("{vpath}.items[{i}]"), report)?;
                let mut env = Env {
                    source: SOURCE,
                    scope: vec![account_uuid.clone()],
                    report: &mut *report,
                    package: &mut *package,
                    attachments: &mut attachments,
                };
                let item = map_item(&source, &mut env)?;
                linked.push(LinkedItem {
                    item: item.id.clone(),
                    account: None,
                });
                items.push(item);
            }
            collections.push(Collection {
                id: derive(&["collection", SOURCE, &account_uuid, &vault_uuid]),
                creation_at: None,
                modified_at: None,
                title: str_or_empty(vattrs, "name", &vpath)?,
                subtitle: opt_str(vattrs, "desc", &vpath)?.filter(|desc| !desc.is_empty()),
                items: linked,
                sub_collections: Vec::new(),
                extensions: source_facts(&[
                    ("originalId", &vault_uuid),
                    ("vaultType", &str_or_empty(vattrs, "type", &vpath)?),
                ]),
            });
        }
        let name = str_or_empty(attrs, "name", &apath)?;
        out.push(Account {
            id: derive(&["account", SOURCE, &account_uuid]),
            username: opt_str(attrs, "accountName", &apath)?.unwrap_or_else(|| name.clone()),
            email: str_or_empty(attrs, "email", &apath)?,
            full_name: Some(name).filter(|name| !name.is_empty()),
            collections,
            items,
            extensions: source_facts(&[
                ("originalId", &account_uuid),
                ("domain", &str_or_empty(attrs, "domain", &apath)?),
            ]),
        });
    }
    let ZipAttachments { mut zip, used } = attachments;
    let unreferenced: Vec<String> = zip
        .names()
        .filter(|n| n.starts_with(FILES) && !used.contains(*n))
        .map(str::to_string)
        .collect();
    for name in unreferenced {
        let bytes = zip.read(&name)?;
        package.add_fidelity(&name, &bytes)?;
        let code = if package.keeps_fidelity() {
            "attachment_unreferenced_kept_in_fidelity"
        } else {
            "attachment_unreferenced_not_exported"
        };
        let document_id = name[FILES.len()..]
            .split('_')
            .next()
            .unwrap_or_default()
            .to_string();
        report.warn(code, None, document_id);
    }
    Ok(out)
}
