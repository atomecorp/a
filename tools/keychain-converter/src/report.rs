use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::Value;

use crate::cxf::Header;

/// The conversion report: counts, limitations and warnings. It names items by
/// their CXF id and fields by their label or source key — never a value, a title
/// or anything a secret could be read from.
#[derive(Debug, Default, Serialize)]
pub struct Report {
    pub tool: &'static str,
    pub tool_version: &'static str,
    pub source_format: String,
    pub cxf_version: &'static str,
    pub accounts: usize,
    pub collections: usize,
    pub items: usize,
    pub items_by_source_category: BTreeMap<String, usize>,
    pub credentials_by_type: BTreeMap<String, usize>,
    pub custom_fields: usize,
    pub attachments: usize,
    pub attachment_bytes: u64,
    pub favorites: usize,
    pub archived: usize,
    pub trashed: usize,
    pub passkeys_found: usize,
    /// Source keys with no CXF member, kept verbatim in the sealed fidelity backup.
    pub source_keys_only_in_fidelity: BTreeMap<String, usize>,
    pub limitations: Vec<&'static str>,
    pub warnings: Vec<Warning>,
    pub sealed: bool,
    pub fidelity_backup: bool,
}

#[derive(Debug, Serialize)]
pub struct Warning {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item: Option<String>,
    pub detail: String,
}

/// Passkeys are never in 1PUX, 1PIF or CSV exports (their private key does not
/// leave the provider): only a Credential Exchange transfer or a new passkey works.
pub const LIMIT_PASSKEYS: &str = "passkeys_not_in_file_exports";
pub const LIMIT_PASSWORD_HISTORY: &str = "password_history_as_custom_fields";
pub const LIMIT_CSV: &str = "csv_has_no_attachments_ids_or_vaults";
pub const LIMIT_1PIF_FILES: &str = "1pif_has_no_attachments";

impl Report {
    pub fn new(source_format: impl Into<String>) -> Self {
        Self {
            tool: env!("CARGO_PKG_NAME"),
            tool_version: env!("CARGO_PKG_VERSION"),
            source_format: source_format.into(),
            cxf_version: "1.0",
            limitations: vec![LIMIT_PASSKEYS],
            ..Self::default()
        }
    }

    pub fn warn(&mut self, code: &'static str, item: Option<&str>, detail: impl Into<String>) {
        self.warnings.push(Warning {
            code,
            item: item.map(str::to_string),
            detail: detail.into(),
        });
    }

    pub fn limit(&mut self, code: &'static str) {
        if !self.limitations.contains(&code) {
            self.limitations.push(code);
        }
    }

    pub fn category(&mut self, category: &str) {
        *self
            .items_by_source_category
            .entry(category.to_string())
            .or_default() += 1;
    }

    pub fn unmapped_key(&mut self, key: String) {
        *self.source_keys_only_in_fidelity.entry(key).or_default() += 1;
    }

    /// Counts what the finished CXF document holds.
    pub fn tally(&mut self, header: &Header) {
        self.accounts = header.accounts.len();
        for account in &header.accounts {
            self.collections += account.collections.len();
            self.items += account.items.len();
            for item in &account.items {
                self.favorites += usize::from(item.favorite);
                for credential in &item.credentials {
                    let kind = credential["type"].as_str().unwrap_or_default().to_string();
                    if kind == "custom-fields" {
                        self.custom_fields += credential["fields"].as_array().map_or(0, Vec::len);
                    }
                    if kind == "file" {
                        self.attachments += 1;
                        self.attachment_bytes += credential["decryptedSize"].as_u64().unwrap_or(0);
                    }
                    *self.credentials_by_type.entry(kind).or_default() += 1;
                }
            }
        }
    }

    pub fn to_json(&self) -> Value {
        serde_json::to_value(self).unwrap_or_default()
    }
}
