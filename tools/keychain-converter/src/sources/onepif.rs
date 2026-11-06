//! 1Password 7 interchange format (`.1pif`): a folder holding `data.1pif`, one
//! JSON object per line, lines separated by `***<uuid>***`. Folders
//! (`system.folder.*`) become Collections; 1PIF carries no attachments.

use std::collections::BTreeMap;
use std::path::Path;

use serde_json::{Map, Value, json};

use super::onepassword::{
    Address, Attachments, Env, FieldValue, FileRef, LoginField, Section, SourceField, SourceItem,
    map_item,
};
use super::onepassword_rules::category_of_type_name;
use super::strict::{self, Object, opt_array, opt_object, opt_str, req_str, str_or_empty};
use crate::cxf::{self, Account, Collection, LinkedItem};
use crate::error::{Result, err};
use crate::ids::derive;
use crate::package::PackageWriter;
use crate::report::{LIMIT_1PIF_FILES, Report};

pub const SOURCE: &str = "1password-1pif";
const MAX_BYTES: u64 = 512 << 20;

struct NoAttachments;

impl Attachments for NoAttachments {
    fn fetch(&mut self, _: &FileRef) -> Result<Option<Vec<u8>>> {
        Ok(None)
    }
}

fn field_value(kind: &str, name: &str, value: Option<&Value>) -> FieldValue {
    let text = || match value {
        Some(Value::String(text)) => Some(text.clone()),
        Some(Value::Number(number)) => Some(number.to_string()),
        None | Some(Value::Null) => Some(String::new()),
        _ => None,
    };
    let string_of = |map: &Object, key: &str| {
        map.get(key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let known = match kind {
        "concealed" if name.starts_with("TOTP_") => text().map(FieldValue::Totp),
        "concealed" => text().map(FieldValue::Concealed),
        "string" | "phone" | "URL" | "menu" | "gender" | "cctype" => text().map(FieldValue::Text),
        "email" => text().map(FieldValue::Email),
        "reference" => text().map(FieldValue::Reference),
        "date" => value.and_then(Value::as_i64).map(FieldValue::Date),
        "monthYear" => value.and_then(Value::as_i64).map(FieldValue::MonthYear),
        "address" => value.and_then(Value::as_object).map(|map| {
            FieldValue::Address(Address {
                street: string_of(map, "street"),
                city: string_of(map, "city"),
                zip: string_of(map, "zip"),
                state: string_of(map, "state"),
                country: string_of(map, "country"),
            })
        }),
        _ => None,
    };
    known.unwrap_or_else(|| FieldValue::Unknown {
        kind: kind.to_string(),
        json: value.map(Value::to_string).unwrap_or_default(),
    })
}

fn scalar_text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        None | Some(Value::Null) => String::new(),
        Some(other) => other.to_string(),
    }
}

fn parse_item(
    map: &Object,
    path: &str,
    report: &mut Report,
) -> Result<(SourceItem, Option<String>)> {
    let known = [
        "uuid",
        "typeName",
        "title",
        "location",
        "createdAt",
        "updatedAt",
        "faveIndex",
        "trashed",
        "folderUuid",
        "openContents",
        "secureContents",
    ];
    strict::unknown_keys(map, &known, "item").for_each(|k| report.unmapped_key(k));
    let empty = Map::new();
    let open = opt_object(map, "openContents", path)?.unwrap_or(&empty);
    let secure = opt_object(map, "secureContents", path)?.unwrap_or(&empty);
    let spath = format!("{path}.secureContents");
    let known_secure = [
        "fields",
        "URLs",
        "notesPlain",
        "password",
        "passwordHistory",
        "sections",
    ];
    strict::unknown_keys(secure, &known_secure, "secureContents")
        .for_each(|k| report.unmapped_key(k));
    let type_name = str_or_empty(map, "typeName", path)?;
    let favorite =
        strict::opt_i64(map, "faveIndex", path)?.or(strict::opt_i64(open, "faveIndex", path)?);
    let mut item = SourceItem {
        uuid: req_str(map, "uuid", path)?,
        category: category_of_type_name(&type_name).map_or(type_name.clone(), str::to_string),
        title: str_or_empty(map, "title", path)?,
        state: if strict::opt_bool_like(map, "trashed") {
            "trashed"
        } else {
            "active"
        }
        .into(),
        favorite: favorite.is_some_and(|index| index > 0),
        created: strict::opt_time(map, "createdAt", path)?,
        updated: strict::opt_time(map, "updatedAt", path)?,
        tags: strict::strings(open, "tags", path)?,
        notes: str_or_empty(secure, "notesPlain", &spath)?,
        password: opt_str(secure, "password", &spath)?,
        ..SourceItem::default()
    };
    if let Some(location) = opt_str(map, "location", path)?.filter(|l| !l.is_empty()) {
        item.urls.push((String::new(), location));
    }
    for (u, url) in opt_array(secure, "URLs", &spath)?.iter().enumerate() {
        let upath = format!("{spath}.URLs[{u}]");
        let url = strict::object(url, &upath)?;
        item.urls.push((
            str_or_empty(url, "label", &upath)?,
            str_or_empty(url, "url", &upath)?,
        ));
    }
    for (f, field) in opt_array(secure, "fields", &spath)?.iter().enumerate() {
        let field = strict::object(field, &format!("{spath}.fields[{f}]"))?;
        item.login_fields.push(LoginField {
            name: scalar_text(field.get("name")),
            designation: scalar_text(field.get("designation")),
            kind: scalar_text(field.get("type")),
            value: scalar_text(field.get("value")),
        });
    }
    for (h, entry) in opt_array(secure, "passwordHistory", &spath)?
        .iter()
        .enumerate()
    {
        let hpath = format!("{spath}.passwordHistory[{h}]");
        let entry = strict::object(entry, &hpath)?;
        item.password_history.push((
            str_or_empty(entry, "value", &hpath)?,
            strict::opt_time(entry, "time", &hpath)?,
        ));
    }
    for (s, section) in opt_array(secure, "sections", &spath)?.iter().enumerate() {
        let sec_path = format!("{spath}.sections[{s}]");
        let section = strict::object(section, &sec_path)?;
        let mut fields = Vec::new();
        for (f, field) in opt_array(section, "fields", &sec_path)?.iter().enumerate() {
            let field = strict::object(field, &format!("{sec_path}.fields[{f}]"))?;
            strict::unknown_keys(
                field,
                &["k", "n", "t", "v"],
                "secureContents.sections.fields",
            )
            .for_each(|k| report.unmapped_key(k));
            let id = scalar_text(field.get("n"));
            fields.push(SourceField {
                value: field_value(&scalar_text(field.get("k")), &id, field.get("v")),
                title: scalar_text(field.get("t")),
                id,
            });
        }
        item.sections.push(Section {
            title: scalar_text(section.get("title")),
            fields,
        });
    }
    Ok((item, opt_str(map, "folderUuid", path)?))
}

fn data_file(path: &Path) -> std::path::PathBuf {
    if path.is_dir() {
        path.join("data.1pif")
    } else {
        path.to_path_buf()
    }
}

pub fn convert(
    path: &Path,
    package: &mut PackageWriter,
    report: &mut Report,
) -> Result<Vec<Account>> {
    let file = data_file(path);
    if std::fs::metadata(&file)?.len() > MAX_BYTES {
        return Err(err("source_too_large", MAX_BYTES.to_string()));
    }
    let bytes = std::fs::read(&file)?;
    let text = std::str::from_utf8(&bytes)
        .map_err(|e| err("source_not_utf8", format!("byte {}", e.valid_up_to())))?;
    let mut records = Vec::new();
    for (number, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("***") {
            continue;
        }
        let record: Value = serde_json::from_str(line).map_err(|e| {
            err(
                "source_json_invalid",
                format!("line {} column {}", number + 1, e.column()),
            )
        })?;
        if !record.is_object() {
            return Err(err(
                "source_structure_invalid",
                format!("line {}: object expected", number + 1),
            ));
        }
        records.push((number + 1, record));
    }
    package.add_fidelity("data.1pif", &bytes)?;
    report.limit(LIMIT_1PIF_FILES);
    let mut folders: BTreeMap<String, Collection> = BTreeMap::new();
    for (number, record) in &records {
        let map = strict::object(record, "record")?;
        if str_or_empty(map, "typeName", "record")?.starts_with("system.folder.") {
            let path = format!("line {number}");
            let uuid = req_str(map, "uuid", &path)?;
            let facts = Map::from_iter([
                ("provider".to_string(), json!(SOURCE)),
                ("originalId".to_string(), json!(uuid)),
            ]);
            folders.insert(
                uuid.clone(),
                Collection {
                    id: derive(&["collection", SOURCE, "export", &uuid]),
                    creation_at: strict::opt_time(map, "createdAt", &path)?,
                    modified_at: strict::opt_time(map, "updatedAt", &path)?,
                    title: str_or_empty(map, "title", &path)?,
                    subtitle: None,
                    items: Vec::new(),
                    sub_collections: Vec::new(),
                    extensions: vec![cxf::source_extension(facts)],
                },
            );
        }
    }
    let mut items = Vec::new();
    for (number, record) in &records {
        let map = strict::object(record, "record")?;
        let type_name = str_or_empty(map, "typeName", "record")?;
        if type_name.starts_with("system.folder.") {
            continue;
        }
        if type_name == "system.Tombstone" {
            report.unmapped_key("record.system.Tombstone".into());
            continue;
        }
        let (source, folder) = parse_item(map, &format!("line {number}"), report)?;
        let mut env = Env {
            source: SOURCE,
            scope: vec!["export".into()],
            report: &mut *report,
            package: &mut *package,
            attachments: &mut NoAttachments,
        };
        let item = map_item(&source, &mut env)?;
        match folder.as_ref().and_then(|uuid| folders.get_mut(uuid)) {
            Some(collection) => collection.items.push(LinkedItem {
                item: item.id.clone(),
                account: None,
            }),
            None if folder.is_some() => report.warn("folder_absent", Some(&item.id), ""),
            None => {}
        }
        items.push(item);
    }
    Ok(vec![Account {
        id: derive(&["account", SOURCE, "export"]),
        username: String::new(),
        email: String::new(),
        full_name: None,
        collections: folders.into_values().collect(),
        items,
        extensions: Vec::new(),
    }])
}
