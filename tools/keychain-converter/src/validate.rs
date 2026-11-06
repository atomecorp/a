//! Checks a CXF 1.0 document (any exporter's, not only ours) against the
//! structural rules of the specification: required members and types (§3.1–§3.3),
//! identifiers (§1.3: base64url, at most 64 bytes, unique per account), optional
//! arrays absent when empty (§2.1.2), EditableField syntax (§3.4.3), custom
//! extension names (§3.5) and the File integrity hash against the documents (§5.2).
//! Each violation names a JSON path, never a value.

use std::collections::{BTreeSet, HashSet};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Map, Value};

use crate::cxf::{FieldKind, kind_named, members_of};
use crate::package::DocumentDigests;

struct Check<'a> {
    errors: Vec<String>,
    documents: &'a DocumentDigests,
    used: BTreeSet<String>,
}

type Object = Map<String, Value>;

impl Check<'_> {
    fn fail(&mut self, path: &str, message: &str) {
        self.errors.push(format!("{path}: {message}"));
    }

    fn object<'v>(&mut self, value: Option<&'v Value>, path: &str) -> Option<&'v Object> {
        let object = value.and_then(Value::as_object);
        if object.is_none() {
            self.fail(path, "object required");
        }
        object
    }

    fn string(&mut self, map: &Object, key: &str, path: &str, required: bool) {
        match map.get(key) {
            Some(Value::String(_)) => {}
            None if !required => {}
            _ => self.fail(&format!("{path}.{key}"), "string required"),
        }
    }

    fn uint(&mut self, map: &Object, key: &str, path: &str, required: bool, max: u64) {
        match map.get(key).map(Value::as_u64) {
            Some(Some(n)) if n <= max => {}
            None if !required => {}
            _ => self.fail(&format!("{path}.{key}"), "unsigned integer required"),
        }
    }

    fn id(&mut self, map: &Object, key: &str, path: &str, required: bool) -> Option<String> {
        match map.get(key) {
            None if !required => None,
            Some(Value::String(id))
                if URL_SAFE_NO_PAD
                    .decode(id)
                    .is_ok_and(|b| !b.is_empty() && b.len() <= 64) =>
            {
                Some(id.clone())
            }
            _ => {
                self.fail(
                    &format!("{path}.{key}"),
                    "base64url identifier of 1 to 64 bytes required",
                );
                None
            }
        }
    }

    /// An optional array: absent, or present and non-empty (§2.1.2).
    fn optional_array<'v>(&mut self, map: &'v Object, key: &str, path: &str) -> &'v [Value] {
        match map.get(key) {
            None => &[],
            Some(Value::Array(items)) if !items.is_empty() => items,
            _ => {
                self.fail(
                    &format!("{path}.{key}"),
                    "optional array must be absent when empty",
                );
                &[]
            }
        }
    }

    fn required_array<'v>(&mut self, map: &'v Object, key: &str, path: &str) -> &'v [Value] {
        match map.get(key) {
            Some(Value::Array(items)) => items,
            _ => {
                self.fail(&format!("{path}.{key}"), "array required");
                &[]
            }
        }
    }

    fn extensions(&mut self, map: &Object, path: &str) {
        for (e, extension) in self
            .optional_array(map, "extensions", path)
            .iter()
            .enumerate()
        {
            let epath = format!("{path}.extensions[{e}]");
            match extension.get("name").and_then(Value::as_str) {
                Some("shared") => {}
                Some(name)
                    if name
                        .split_once('/')
                        .is_some_and(|(rp, ext)| !rp.is_empty() && !ext.is_empty()) => {}
                _ => self.fail(
                    &epath,
                    "extension name must be a defined one or EXPORTER_RP_ID/NAME",
                ),
            }
        }
    }

    fn editable(&mut self, value: &Value, path: &str, expected: Option<FieldKind>) {
        let Some(field) = self.object(Some(value), path) else {
            return;
        };
        self.id(field, "id", path, false);
        self.string(field, "label", path, false);
        self.extensions(field, path);
        let (Some(field_type), Some(text)) = (
            field.get("fieldType").and_then(Value::as_str),
            field.get("value").and_then(Value::as_str),
        ) else {
            return self.fail(path, "fieldType and value strings required");
        };
        match kind_named(field_type) {
            Some(kind) if !kind.accepts(text) => {
                self.fail(path, "value does not follow its fieldType syntax")
            }
            Some(kind)
                if expected.is_some_and(|e| e != kind) && !matches!(kind, FieldKind::String) =>
            {
                self.fail(path, "fieldType differs from the member's expected type")
            }
            _ => {}
        }
    }

    fn linked(&mut self, value: &Value, path: &str) {
        if let Some(linked) = self.object(Some(value), path) {
            self.id(linked, "item", path, true);
            self.id(linked, "account", path, false);
        }
    }

    fn credential(&mut self, value: &Value, path: &str) {
        let Some(credential) = self.object(Some(value), path) else {
            return;
        };
        let Some(kind) = credential.get("type").and_then(Value::as_str) else {
            return self.fail(path, "type string required");
        };
        if let Some(members) = members_of(kind) {
            for (key, member) in credential.iter().filter(|(key, _)| *key != "type") {
                match members.iter().find(|(name, _)| name == key) {
                    Some((_, expected)) => {
                        self.editable(member, &format!("{path}.{key}"), Some(*expected))
                    }
                    None => self.fail(
                        &format!("{path}.{key}"),
                        "not a member of this credential type",
                    ),
                }
            }
            if kind == "note" && !credential.contains_key("content") {
                self.fail(path, "note content required");
            }
            return;
        }
        match kind {
            "custom-fields" => {
                self.id(credential, "id", path, false);
                self.string(credential, "label", path, false);
                self.extensions(credential, path);
                for (f, field) in self
                    .required_array(credential, "fields", path)
                    .iter()
                    .enumerate()
                {
                    self.editable(field, &format!("{path}.fields[{f}]"), None);
                }
            }
            "file" => {
                self.string(credential, "name", path, true);
                self.uint(credential, "decryptedSize", path, true, u64::MAX);
                let id = self.id(credential, "id", path, true);
                let hash = credential.get("integrityHash").and_then(Value::as_str);
                let size = credential.get("decryptedSize").and_then(Value::as_u64);
                match id.as_ref().and_then(|id| self.documents.get(id)) {
                    Some((actual_size, actual_hash))
                        if Some(*actual_size) == size && Some(actual_hash.as_str()) == hash => {}
                    Some(_) => self.fail(
                        path,
                        "decryptedSize or integrityHash does not match the document",
                    ),
                    None => self.fail(path, "document absent from the package"),
                }
                self.used.extend(id);
            }
            "totp" => {
                let secret = credential
                    .get("secret")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if secret.is_empty()
                    || !secret
                        .bytes()
                        .all(|b| b.is_ascii_uppercase() || (b'2'..=b'7').contains(&b) || b == b'=')
                {
                    self.fail(&format!("{path}.secret"), "Base32 string required");
                }
                self.uint(credential, "period", path, true, u64::from(u16::MAX));
                self.uint(credential, "digits", path, true, u64::from(u16::MAX));
                self.string(credential, "algorithm", path, true);
                self.string(credential, "username", path, false);
                self.string(credential, "issuer", path, false);
            }
            "item-reference" => self.linked(
                credential.get("reference").unwrap_or(&Value::Null),
                &format!("{path}.reference"),
            ),
            "ssh-key" => {
                self.string(credential, "keyType", path, true);
                self.string(credential, "keyComment", path, false);
                let key = credential
                    .get("privateKey")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if URL_SAFE_NO_PAD
                    .decode(key)
                    .map_or(true, |der| der.is_empty())
                {
                    self.fail(
                        &format!("{path}.privateKey"),
                        "base64url PKCS#8 DER required",
                    );
                }
                for member in ["creationDate", "expiryDate", "keyGenerationSource"] {
                    if let Some(field) = credential.get(member) {
                        let expected = (member != "keyGenerationSource").then_some(FieldKind::Date);
                        self.editable(field, &format!("{path}.{member}"), expected);
                    }
                }
            }
            "generated-password" => self.string(credential, "password", path, true),
            "passkey" => {
                for member in ["rpId", "username", "userDisplayName"] {
                    self.string(credential, member, path, true);
                }
                for member in ["credentialId", "userHandle", "key"] {
                    self.id_like(credential, member, path);
                }
            }
            _ => {}
        }
    }

    fn id_like(&mut self, map: &Object, key: &str, path: &str) {
        if map
            .get(key)
            .and_then(Value::as_str)
            .is_none_or(|v| URL_SAFE_NO_PAD.decode(v).is_err())
        {
            self.fail(&format!("{path}.{key}"), "base64url required");
        }
    }

    fn collection(&mut self, value: &Value, path: &str, ids: &mut HashSet<String>) {
        let Some(collection) = self.object(Some(value), path) else {
            return;
        };
        if let Some(id) = self.id(collection, "id", path, true)
            && !ids.insert(id)
        {
            self.fail(path, "duplicate collection id");
        }
        self.uint(collection, "creationAt", path, false, u64::MAX);
        self.uint(collection, "modifiedAt", path, false, u64::MAX);
        self.string(collection, "title", path, true);
        self.string(collection, "subtitle", path, false);
        for (l, linked) in self
            .required_array(collection, "items", path)
            .iter()
            .enumerate()
        {
            self.linked(linked, &format!("{path}.items[{l}]"));
        }
        for (s, sub) in self
            .optional_array(collection, "subCollections", path)
            .iter()
            .enumerate()
        {
            self.collection(sub, &format!("{path}.subCollections[{s}]"), ids);
        }
        self.extensions(collection, path);
    }

    fn item(&mut self, value: &Value, path: &str, ids: &mut HashSet<String>) {
        let Some(item) = self.object(Some(value), path) else {
            return;
        };
        if let Some(id) = self.id(item, "id", path, true)
            && !ids.insert(id)
        {
            self.fail(path, "duplicate item id");
        }
        self.uint(item, "creationAt", path, false, u64::MAX);
        self.uint(item, "modifiedAt", path, false, u64::MAX);
        self.string(item, "title", path, true);
        self.string(item, "subtitle", path, false);
        if item.get("favorite").is_some_and(|f| !f.is_boolean()) {
            self.fail(&format!("{path}.favorite"), "boolean required");
        }
        if let Some(scope) = item.get("scope") {
            let spath = format!("{path}.scope");
            if let Some(scope) = self.object(Some(scope), &spath) {
                if !self
                    .required_array(scope, "urls", &spath)
                    .iter()
                    .all(Value::is_string)
                {
                    self.fail(&spath, "urls must be strings");
                }
                self.required_array(scope, "androidApps", &spath);
            }
        }
        for (c, credential) in self
            .required_array(item, "credentials", path)
            .iter()
            .enumerate()
        {
            self.credential(credential, &format!("{path}.credentials[{c}]"));
        }
        if !self
            .optional_array(item, "tags", path)
            .iter()
            .all(Value::is_string)
        {
            self.fail(&format!("{path}.tags"), "strings required");
        }
        self.extensions(item, path);
    }
}

pub fn validate(index: &Value, documents: &DocumentDigests) -> Vec<String> {
    let mut check = Check {
        errors: Vec::new(),
        documents,
        used: BTreeSet::new(),
    };
    let Some(header) = check.object(Some(index), "$") else {
        return check.errors;
    };
    match header.get("version") {
        Some(version)
            if version.get("major").and_then(Value::as_u64) == Some(1)
                && version.get("minor").is_some_and(Value::is_u64) => {}
        _ => check.fail("$.version", "version 1.x required"),
    }
    check.string(header, "exporterRpId", "$", true);
    check.string(header, "exporterDisplayName", "$", true);
    check.uint(header, "timestamp", "$", true, u64::MAX);
    for (a, account) in check
        .required_array(header, "accounts", "$")
        .iter()
        .enumerate()
    {
        let path = format!("$.accounts[{a}]");
        let Some(account) = check.object(Some(account), &path) else {
            continue;
        };
        check.id(account, "id", &path, true);
        check.string(account, "username", &path, true);
        check.string(account, "email", &path, true);
        check.string(account, "fullName", &path, false);
        check.extensions(account, &path);
        let (mut collection_ids, mut item_ids) = (HashSet::new(), HashSet::new());
        for (c, collection) in check
            .required_array(account, "collections", &path)
            .iter()
            .enumerate()
        {
            check.collection(
                collection,
                &format!("{path}.collections[{c}]"),
                &mut collection_ids,
            );
        }
        for (i, item) in check
            .required_array(account, "items", &path)
            .iter()
            .enumerate()
        {
            check.item(item, &format!("{path}.items[{i}]"), &mut item_ids);
        }
    }
    for id in documents
        .keys()
        .filter(|id| !check.used.contains(*id))
        .cloned()
        .collect::<Vec<_>>()
    {
        check.fail(
            &format!("documents/{id}"),
            "document referenced by no file credential",
        );
    }
    check.errors
}
