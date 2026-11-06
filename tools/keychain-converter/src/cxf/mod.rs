//! The CXF 1.0 entities this converter writes (§3.1–§3.2). Required arrays are
//! always serialized, optional ones only when non-empty (§2.1.2).

mod credential;

pub use credential::{
    CustomFields, EditableField, FieldKind, Fielded, file, item_reference, kind_named, members_of,
    ssh_key, totp,
};

use serde::Serialize;
use serde_json::{Map, Value, json};

pub const VERSION_MAJOR: u8 = 1;
pub const VERSION_MINOR: u8 = 0;
/// The exporter's relying-party id; every custom extension is named
/// `atome.one/<name>` as §3.5 requires of an exporter's own extensions.
pub const EXPORTER_RP_ID: &str = "atome.one";
pub const EXPORTER_DISPLAY_NAME: &str = "atome keychain converter";
/// Source provenance of an entity: original identifiers, provider, vault type,
/// archive or trash state — facts CXF 1.0 has no member for.
pub const SOURCE_EXTENSION: &str = "atome.one/source";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Header {
    pub version: Version,
    pub exporter_rp_id: String,
    pub exporter_display_name: String,
    pub timestamp: u64,
    pub accounts: Vec<Account>,
}

#[derive(Debug, Serialize)]
pub struct Version {
    pub major: u8,
    pub minor: u8,
}

impl Header {
    pub fn new(timestamp: u64, accounts: Vec<Account>) -> Self {
        Self {
            version: Version {
                major: VERSION_MAJOR,
                minor: VERSION_MINOR,
            },
            exporter_rp_id: EXPORTER_RP_ID.into(),
            exporter_display_name: EXPORTER_DISPLAY_NAME.into(),
            timestamp,
            accounts,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub username: String,
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_name: Option<String>,
    pub collections: Vec<Collection>,
    pub items: Vec<Item>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub extensions: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creation_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<u64>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    pub items: Vec<LinkedItem>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub sub_collections: Vec<Collection>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub extensions: Vec<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkedItem {
    pub item: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creation_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<u64>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub favorite: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<CredentialScope>,
    pub credentials: Vec<Value>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub extensions: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialScope {
    pub urls: Vec<String>,
    pub android_apps: Vec<Value>,
}

impl CredentialScope {
    /// The scope of these URLs (order kept, duplicates and blanks dropped), or none.
    pub fn of_urls(urls: impl IntoIterator<Item = String>) -> Option<Self> {
        let mut kept: Vec<String> = Vec::new();
        for url in urls {
            let url = url.trim().to_string();
            if !url.is_empty() && !kept.contains(&url) {
                kept.push(url);
            }
        }
        (!kept.is_empty()).then(|| Self {
            urls: kept,
            android_apps: Vec::new(),
        })
    }
}

/// The `atome.one/source` extension holding source facts that have no CXF member.
pub fn source_extension(facts: Map<String, Value>) -> Value {
    let mut extension = Map::new();
    extension.insert("name".into(), json!(SOURCE_EXTENSION));
    extension.extend(facts);
    Value::Object(extension)
}
