// A user's public card, projected from their profile (server/directoryPublicService.js
// `projectProfile`, ported): the display name and the photo, then each field the owner shares
// (atome/src/shared/profile_sharing.js) that holds something, and an adult's Rencontre
// declarations, kept for matching only.
use super::meeting::{self, Meeting};
use crate::social::news::db::text;
use serde_json::{Map as JsonMap, Value as JsonValue, json};

/// The card's key holding the Rencontre declarations: never published.
pub const MEETING_KEY: &str = "_meeting";

// `normalizeSharedProfileFields`: a card never configured shares the name, the first name, the
// nickname and the photo; an empty list is a choice and shares nothing.
const DEFAULT_SHARED: [&str; 4] = ["name", "first_name", "nickname", "user_face"];
const SHAREABLE: [&str; 11] = [
    "name",
    "first_name",
    "nickname",
    "user_face",
    "phone",
    "email",
    "custom_fields",
    "bio",
    "competences",
    "passions",
    "experiences",
];

/// What a profile projects to (`projectProfile`).
pub struct Profile {
    pub principal_id: String,
    pub display_name: String,
    pub user_face: String,
    pub card: JsonMap<String, JsonValue>,
    pub meeting: Meeting,
    pub adult: bool,
    pub public: bool,
}

impl Profile {
    /// As Fastify's directory service handed it to its callers.
    pub fn json(&self) -> JsonValue {
        json!({
            "principal_id": self.principal_id,
            "display_name": self.display_name,
            "user_face": self.user_face,
            "card": self.card,
            "meeting": self.meeting.json(),
            "adult": self.adult,
            "public": self.public,
        })
    }
}

/// `parse(value)`: a stored JSON text read back, any other value as it is.
pub fn parse(value: Option<&JsonValue>) -> JsonValue {
    match value {
        None | Some(JsonValue::Null) => JsonValue::Null,
        Some(JsonValue::String(raw)) => {
            serde_json::from_str(raw).unwrap_or_else(|_| JsonValue::String(raw.clone()))
        }
        Some(value) => value.clone(),
    }
}

// `profileValue(profile, ...keys)`: the first key holding a text.
fn profile_value(profile: &JsonValue, keys: &[&str]) -> String {
    keys.iter()
        .map(|key| text(profile.get(*key)))
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

// `rowValue(row, profile, key, ...aliases)`: the profile's first, then the row's.
fn row_value(row: &JsonValue, profile: &JsonValue, keys: &[&str]) -> String {
    let value = profile_value(profile, keys);
    if !value.is_empty() {
        return value;
    }
    keys.iter()
        .map(|key| text(Some(&parse(row.get(*key)))))
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

// `normalizePhone` (server/auth_crypto.js): its digits, one leading `+` kept.
fn normalize_phone(value: &str) -> String {
    let cleaned: String = value
        .trim()
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '+')
        .collect();
    match cleaned.strip_prefix('+') {
        Some(rest) => format!("+{}", rest.replace('+', "")),
        None => cleaned,
    }
}

// An account still named by its sign-up phone number has no name to publish.
fn bootstrap_phone_identity(row: &JsonValue, profile: &JsonValue) -> bool {
    if !profile_value(profile, &["name", "first_name", "firstname", "nickname"]).is_empty() {
        return false;
    }
    let read = |key: &str| text(Some(&parse(row.get(key))));
    let phone = normalize_phone(&read("phone"));
    !phone.is_empty()
        && normalize_phone(&read("name")) == phone
        && normalize_phone(&read("username")) == phone
}

fn public_profile(row: &JsonValue, profile: &JsonValue) -> bool {
    [
        profile.get("access"),
        profile.get("visibility"),
        row.get("access"),
        row.get("visibility"),
    ]
    .into_iter()
    .flatten()
    .filter(|value| !value.is_null())
    .map(|value| text(Some(&parse(Some(value)))))
    .find(|value| !value.is_empty())
    .is_some_and(|value| value.to_lowercase() == "public")
}

// The published name, built from the name fields the owner shares: a name kept private never
// reaches the directory through the display name either.
fn display_name(row: &JsonValue, profile: &JsonValue, shared: &[&str]) -> String {
    let value = |field: &str, keys: &[&str]| {
        if shared.contains(&field) {
            row_value(row, profile, keys)
        } else {
            String::new()
        }
    };
    let name = value("name", &["name", "last_name", "lastname"]);
    let firstname = value("first_name", &["first_name", "firstname", "firstName"]);
    let nickname = value("nickname", &["nickname", "pseudonym", "pseudo"]);
    let source = text(profile.get("display_name_source"));
    let order = match source.as_str() {
        "firstname" => [&firstname, &name, &nickname],
        "nickname" => [&nickname, &name, &firstname],
        _ => [&name, &firstname, &nickname],
    };
    order
        .into_iter()
        .find(|value| !value.is_empty())
        .cloned()
        .unwrap_or_default()
}

fn labelled_items(items: Option<&JsonValue>) -> Vec<JsonValue> {
    items
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|item| (text(item.get("label")), text(item.get("value"))))
        .filter(|(label, value)| !label.is_empty() || !value.is_empty())
        .map(|(label, value)| json!({ "label": label, "value": value }))
        .collect()
}

fn shared_bio(bio: Option<&JsonValue>) -> JsonValue {
    let bio = bio.filter(|bio| bio.is_object() || bio.is_array());
    let field = |key: &str| text(bio.and_then(|bio| bio.get(key)));
    let card = json!({
        "birth": field("birth"),
        "weight": field("weight"),
        "height": field("height"),
        "biometrics": labelled_items(bio.and_then(|bio| bio.get("biometrics"))),
    });
    let held = ["birth", "weight", "height"]
        .iter()
        .any(|key| card[*key] != json!(""))
        || card["biometrics"] != json!([]);
    if held { card } else { JsonValue::Null }
}

// The card fields beyond the display name and the photo, each one only when the owner shares it
// and it holds something.
fn shared_card(
    row: &JsonValue,
    profile: &JsonValue,
    shared: &[&str],
) -> JsonMap<String, JsonValue> {
    let about = profile.get("profile");
    let values = [
        (
            "name",
            json!(row_value(row, profile, &["name", "last_name", "lastname"])),
        ),
        (
            "first_name",
            json!(row_value(
                row,
                profile,
                &["first_name", "firstname", "firstName"]
            )),
        ),
        (
            "nickname",
            json!(row_value(
                row,
                profile,
                &["nickname", "pseudonym", "pseudo"]
            )),
        ),
        ("phone", json!(row_value(row, profile, &["phone"]))),
        ("email", json!(text(profile.get("email")))),
        (
            "custom_fields",
            json!(labelled_items(profile.get("custom_fields"))),
        ),
        ("bio", shared_bio(profile.get("bio"))),
        (
            "competences",
            json!(labelled_items(
                about.and_then(|about| about.get("competences"))
            )),
        ),
        (
            "passions",
            json!(labelled_items(
                about.and_then(|about| about.get("passions"))
            )),
        ),
        (
            "experiences",
            json!(labelled_items(
                about.and_then(|about| about.get("experiences"))
            )),
        ),
    ];
    values
        .into_iter()
        .filter(|(field, value)| {
            shared.contains(field)
                && match value {
                    JsonValue::Array(items) => !items.is_empty(),
                    JsonValue::String(value) => !value.is_empty(),
                    value => !value.is_null(),
                }
        })
        .map(|(field, value)| (field.to_string(), value))
        .collect()
}

/// `projectProfile(row)`: `row` holds the user's central particles and their vault's
/// properties, `eve_profile` the stored profile.
pub fn project(row: &JsonValue, principal_id: &str) -> Profile {
    let profile = match parse(row.get("eve_profile")) {
        profile @ JsonValue::Object(_) => profile,
        _ => json!({}),
    };
    let sharing = profile
        .get("sharing")
        .and_then(|sharing| sharing.get("fields"));
    let shared: Vec<&str> = match sharing.and_then(JsonValue::as_array) {
        Some(fields) => {
            let requested: Vec<String> = fields
                .iter()
                .map(|field| {
                    if crate::vault_router::js::truthy(Some(field)) {
                        crate::vault_router::js::trim(&crate::vault_router::js::string(field))
                            .to_string()
                    } else {
                        String::new()
                    }
                })
                .collect();
            SHAREABLE
                .into_iter()
                .filter(|field| requested.iter().any(|requested| requested == field))
                .collect()
        }
        None => DEFAULT_SHARED.to_vec(),
    };
    let declarations = profile.get("meeting");
    let adult = meeting::allowed(profile.get("bio").and_then(|bio| bio.get("birth")));
    let mut card = shared_card(row, &profile, &shared);
    // Only an adult's declarations are published: a minor never appears in Rencontre.
    let declared = Meeting::normalize(declarations);
    if adult && declared.declared() {
        card.insert(MEETING_KEY.into(), declared.declarations());
    }
    // The Rencontre photos live in their own property (`meeting_photos`), beside the profile's.
    let mut source = declarations
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default();
    source.insert("photos".into(), parse(row.get("meeting_photos")));
    Profile {
        principal_id: principal_id.to_string(),
        display_name: if bootstrap_phone_identity(row, &profile) {
            String::new()
        } else {
            display_name(row, &profile, &shared)
        },
        user_face: if shared.contains(&"user_face") {
            row_value(row, &profile, &["user_face"])
        } else {
            String::new()
        },
        card,
        meeting: Meeting::normalize(Some(&JsonValue::Object(source))),
        adult,
        public: public_profile(row, &profile),
    }
}
