//! CXF credentials (§3.3) and the EditableField (§3.4.2). Every member a
//! credential may hold comes from `MEMBERS`, the spec's own tables: a member
//! outside them cannot be written.

use serde::Serialize;
use serde_json::{Map, Value, json};

use crate::totp::Totp;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    String,
    Concealed,
    Email,
    Number,
    Boolean,
    Date,
    YearMonth,
    WifiSecurity,
    CountryCode,
    SubdivisionCode,
}

impl FieldKind {
    pub fn name(self) -> &'static str {
        match self {
            FieldKind::String => "string",
            FieldKind::Concealed => "concealed-string",
            FieldKind::Email => "email",
            FieldKind::Number => "number",
            FieldKind::Boolean => "boolean",
            FieldKind::Date => "date",
            FieldKind::YearMonth => "year-month",
            FieldKind::WifiSecurity => "wifi-network-security-type",
            FieldKind::CountryCode => "country-code",
            FieldKind::SubdivisionCode => "subdivision-code",
        }
    }

    /// Whether `value` has the syntax §3.4.3 gives this kind.
    pub fn accepts(self, value: &str) -> bool {
        let bytes = value.as_bytes();
        let digits = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
        match self {
            FieldKind::Date => {
                value.len() == 10 && chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
            }
            FieldKind::YearMonth => {
                value.len() == 7
                    && bytes[4] == b'-'
                    && digits(0..4)
                    && digits(5..7)
                    && (1..=12).contains(&value[5..7].parse::<u8>().unwrap_or(0))
            }
            FieldKind::Boolean => value == "true" || value == "false",
            FieldKind::Number => {
                value.trim() == value && value.parse::<f64>().is_ok_and(f64::is_finite)
            }
            FieldKind::Email => {
                let mut parts = value.split('@');
                matches!((parts.next(), parts.next(), parts.next()), (Some(local), Some(domain), None)
                    if !local.is_empty() && !domain.is_empty() && !value.contains(char::is_whitespace))
            }
            FieldKind::CountryCode => bytes.len() == 2 && bytes.iter().all(u8::is_ascii_uppercase),
            FieldKind::SubdivisionCode => {
                bytes.len() >= 4
                    && bytes.len() <= 6
                    && bytes[..2].iter().all(u8::is_ascii_uppercase)
                    && bytes[2] == b'-'
                    && bytes[3..]
                        .iter()
                        .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
            }
            FieldKind::WifiSecurity => [
                "unsecured",
                "wpa-personal",
                "wpa2-personal",
                "wpa3-personal",
                "wep",
            ]
            .contains(&value),
            FieldKind::String | FieldKind::Concealed => true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditableField {
    pub field_type: &'static str,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

impl EditableField {
    pub fn new(kind: FieldKind, value: String, label: Option<String>) -> Self {
        Self {
            field_type: kind.name(),
            value,
            label,
        }
    }
}

use FieldKind as K;

/// The members of each fielded credential type and the fieldType each SHOULD carry.
const MEMBERS: &[(&str, &[(&str, FieldKind)])] = &[
    (
        "address",
        &[
            ("streetAddress", K::String),
            ("postalCode", K::String),
            ("city", K::String),
            ("territory", K::SubdivisionCode),
            ("country", K::CountryCode),
            ("tel", K::String),
        ],
    ),
    (
        "api-key",
        &[
            ("key", K::Concealed),
            ("username", K::String),
            ("keyType", K::String),
            ("url", K::String),
            ("validFrom", K::Date),
            ("expiryDate", K::Date),
        ],
    ),
    (
        "basic-auth",
        &[("username", K::String), ("password", K::Concealed)],
    ),
    (
        "credit-card",
        &[
            ("number", K::Concealed),
            ("fullName", K::String),
            ("cardType", K::String),
            ("verificationNumber", K::Concealed),
            ("pin", K::Concealed),
            ("expiryDate", K::YearMonth),
            ("validFrom", K::YearMonth),
        ],
    ),
    (
        "drivers-license",
        &[
            ("fullName", K::String),
            ("birthDate", K::Date),
            ("issueDate", K::Date),
            ("expiryDate", K::Date),
            ("issuingAuthority", K::String),
            ("territory", K::SubdivisionCode),
            ("country", K::CountryCode),
            ("licenseNumber", K::String),
            ("licenseClass", K::String),
        ],
    ),
    (
        "identity-document",
        &[
            ("issuingCountry", K::CountryCode),
            ("documentNumber", K::String),
            ("identificationNumber", K::String),
            ("nationality", K::String),
            ("fullName", K::String),
            ("birthDate", K::Date),
            ("birthPlace", K::String),
            ("sex", K::String),
            ("issueDate", K::Date),
            ("expiryDate", K::Date),
            ("issuingAuthority", K::String),
        ],
    ),
    ("note", &[("content", K::String)]),
    (
        "passport",
        &[
            ("issuingCountry", K::CountryCode),
            ("passportType", K::String),
            ("passportNumber", K::String),
            ("nationalIdentificationNumber", K::String),
            ("nationality", K::String),
            ("fullName", K::String),
            ("birthDate", K::Date),
            ("birthPlace", K::String),
            ("sex", K::String),
            ("issueDate", K::Date),
            ("expiryDate", K::Date),
            ("issuingAuthority", K::String),
        ],
    ),
    (
        "person-name",
        &[
            ("title", K::String),
            ("given", K::String),
            ("givenInformal", K::String),
            ("given2", K::String),
            ("surnamePrefix", K::String),
            ("surname", K::String),
            ("surname2", K::String),
            ("credentials", K::String),
            ("generation", K::String),
        ],
    ),
    (
        "wifi",
        &[
            ("ssid", K::String),
            ("networkSecurityType", K::WifiSecurity),
            ("passphrase", K::Concealed),
            ("hidden", K::Boolean),
        ],
    ),
];

/// The members of a fielded credential type, or `None` for another type.
pub fn members_of(kind: &str) -> Option<&'static [(&'static str, FieldKind)]> {
    MEMBERS
        .iter()
        .find(|(name, _)| *name == kind)
        .map(|(_, members)| *members)
}

pub fn kind_named(name: &str) -> Option<FieldKind> {
    [
        K::String,
        K::Concealed,
        K::Email,
        K::Number,
        K::Boolean,
        K::Date,
        K::YearMonth,
        K::WifiSecurity,
        K::CountryCode,
        K::SubdivisionCode,
    ]
    .into_iter()
    .find(|kind| kind.name() == name)
}

/// A credential made only of EditableField members (address, basic-auth, card…).
pub struct Fielded {
    kind: &'static str,
    members: &'static [(&'static str, FieldKind)],
    values: Map<String, Value>,
}

impl Fielded {
    pub fn new(kind: &'static str) -> Self {
        let members = members_of(kind)
            .unwrap_or_else(|| panic!("CXF credential type without members table: {kind}"));
        Self {
            kind,
            members,
            values: Map::new(),
        }
    }

    /// Places `value` in `member`. A value whose syntax a date, year-month or
    /// boolean member cannot hold, or a member already set, is refused (`false`)
    /// so the caller keeps it as a custom field; a country, territory or Wi-Fi
    /// security value outside its code list is kept as a `string` (§3.3: SHOULD).
    pub fn put(&mut self, member: &'static str, value: &str, label: Option<&str>) -> bool {
        let expected = self
            .members
            .iter()
            .find(|(name, _)| *name == member)
            .map(|(_, kind)| *kind)
            .unwrap_or_else(|| panic!("member {member} is not part of CXF {}", self.kind));
        if value.is_empty() {
            return true;
        }
        if self.values.contains_key(member) {
            return false;
        }
        let kind = match expected {
            _ if expected.accepts(value) => expected,
            K::CountryCode | K::SubdivisionCode | K::WifiSecurity => K::String,
            _ => return false,
        };
        let field = EditableField::new(kind, value.to_string(), label.map(str::to_string));
        self.values.insert(member.into(), json!(field));
        true
    }

    pub fn kind(&self) -> &'static str {
        self.kind
    }

    pub fn into_value(self) -> Option<Value> {
        if self.values.is_empty() {
            return None;
        }
        let mut credential = Map::new();
        credential.insert("type".into(), json!(self.kind));
        credential.extend(self.values);
        Some(Value::Object(credential))
    }
}

/// A `custom-fields` credential (§3.3.5): one section of fields with no CXF member.
#[derive(Default)]
pub struct CustomFields {
    pub label: Option<String>,
    pub fields: Vec<EditableField>,
}

impl CustomFields {
    pub fn labelled(label: Option<String>) -> Self {
        Self {
            label: label.filter(|label| !label.is_empty()),
            fields: Vec::new(),
        }
    }

    /// Adds a field, typed by `kind` only when the value has that kind's syntax.
    pub fn push(&mut self, kind: FieldKind, value: String, label: Option<String>) {
        if value.is_empty() {
            return;
        }
        let kind = match kind {
            K::Concealed => K::Concealed,
            _ if kind.accepts(&value) => kind,
            _ => K::String,
        };
        self.fields.push(EditableField::new(
            kind,
            value,
            label.filter(|l| !l.is_empty()),
        ));
    }

    pub fn into_value(self) -> Option<Value> {
        if self.fields.is_empty() {
            return None;
        }
        let mut credential = Map::new();
        credential.insert("type".into(), json!("custom-fields"));
        if let Some(label) = self.label {
            credential.insert("label".into(), json!(label));
        }
        credential.insert("fields".into(), json!(self.fields));
        Some(Value::Object(credential))
    }
}

pub fn file(id: &str, name: &str, decrypted_size: u64, integrity_hash: &str) -> Value {
    json!({ "type": "file", "id": id, "name": name, "decryptedSize": decrypted_size, "integrityHash": integrity_hash })
}

pub fn item_reference(item: &str) -> Value {
    json!({ "type": "item-reference", "reference": { "item": item } })
}

pub fn ssh_key(key_type: &str, private_key: &str) -> Value {
    json!({ "type": "ssh-key", "keyType": key_type, "privateKey": private_key })
}

pub fn totp(code: &Totp) -> Value {
    let mut credential = json!({
        "type": "totp", "secret": code.secret, "period": code.period, "digits": code.digits,
        "algorithm": code.algorithm,
    });
    if let Some(username) = &code.username {
        credential["username"] = json!(username);
    }
    if let Some(issuer) = &code.issuer {
        credential["issuer"] = json!(issuer);
    }
    credential
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_members_table_builds() {
        for (kind, members) in MEMBERS {
            let mut credential = Fielded::new(kind);
            for (member, _) in *members {
                credential.put(member, "x", None);
            }
            assert!(credential.into_value().is_some(), "{kind}");
        }
    }
}
