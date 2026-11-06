// The health reference bundle (server/ws_health_reference.js, ported; `health-reference` on
// /ws/api, no account): the medicines of the BDPM, the ANSM interaction thesaurus, the SmPC sections
// 4.2-4.6, the supplement ingredients and the food rules, built monthly by atome-health-ref. A device
// downloads it and searches and checks everything on its own; nothing it looks up leaves it.
//   manifest {}                        → { manifest }
//   part {version, name, offset}       → { version, name, offset, total, next, base64 }
// `base64` holds at most CHUNK_BYTES bytes of the part's gzipped file from `offset`; `next` is the
// offset to ask next, null after the last chunk. A version replaced since the manifest was read
// answers VERSION_GONE. The manifest is checked against the contract its builder owns
// (atome_health_ref::contract, rendered to atome/src/shared/health_reference_contract.js).
use super::common::{environment, ok_with, or_empty, plain, reply, setting};
use atome_health_ref::contract::{CHUNK_BYTES, FRAME, choices, records};
use atome_health_ref::model::SCHEMA_VERSION;
use base64::Engine;
use serde_json::{Value as JsonValue, json};
use std::io::{ErrorKind, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub(super) const KIND: &str = FRAME;

// A known failure (`{ code, message }`) or anything else, which answers nothing.
enum Failed {
    Known(&'static str, String),
    Thrown(String),
}

fn known(code: &'static str, message: impl Into<String>) -> Failed {
    Failed::Known(code, message.into())
}

// The bundles' folder: data/health_reference/bundles, or HEALTH_REFERENCE_BUNDLES_DIR (a probe's
// fixture bundle) resolved as Fastify resolves it, from its own folder (`server/`).
fn bundles_dir() -> Result<PathBuf, String> {
    let (_, root) = environment()?;
    Ok(
        match setting("HEALTH_REFERENCE_BUNDLES_DIR")?.filter(|dir| !dir.is_empty()) {
            Some(dir) => root.join("server").join(dir),
            None => root.join("data").join("health_reference").join("bundles"),
        },
    )
}

fn version_shape(version: &str) -> bool {
    version.len() == 16
        && version
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

// `check(type, value, path)` of the generated contract: the first mismatch, as its error.
fn check(kind: &str, value: &JsonValue, path: &str) -> Result<(), String> {
    let fail = |code: &str, path: &str| Err(format!("{code}: {path}"));
    if let Some(inner) = kind.strip_prefix('?') {
        return if value.is_null() {
            Ok(())
        } else {
            check(inner, value, path)
        };
    }
    if let Some(item) = kind.strip_suffix("[]") {
        let Some(items) = value.as_array() else {
            return fail("health_reference_array_expected", path);
        };
        return items
            .iter()
            .enumerate()
            .try_for_each(|(index, entry)| check(item, entry, &format!("{path}[{index}]")));
    }
    let scalar = match kind {
        "string" => Some(value.is_string()),
        "boolean" => Some(value.is_boolean()),
        "number" => Some(value.as_f64().is_some_and(f64::is_finite)),
        "integer" => Some(
            value
                .as_f64()
                .is_some_and(|n| n.is_finite() && n.fract() == 0.0 && n >= 0.0),
        ),
        _ => None,
    };
    if let Some(holds) = scalar {
        return if holds {
            Ok(())
        } else {
            fail(&format!("health_reference_{kind}_expected"), path)
        };
    }
    if let Some((_, values)) = choices().into_iter().find(|(name, _)| *name == kind) {
        return if value.as_str().is_some_and(|value| values.contains(&value)) {
            Ok(())
        } else {
            fail("health_reference_choice_unknown", path)
        };
    }
    let Some((_, fields)) = records().into_iter().find(|(name, _)| *name == kind) else {
        return fail("health_reference_type_unknown", path);
    };
    let Some(object) = value.as_object() else {
        return fail("health_reference_record_expected", path);
    };
    if let Some(key) = object
        .keys()
        .find(|key| !fields.iter().any(|(field, _)| field == key))
    {
        return fail("health_reference_field_unknown", &format!("{path}.{key}"));
    }
    for (field, field_type) in &fields {
        let Some(entry) = object.get(*field) else {
            return fail("health_reference_field_missing", &format!("{path}.{field}"));
        };
        check(field_type, entry, &format!("{path}.{field}"))?;
    }
    Ok(())
}

fn read_text(file: &Path, gone: impl FnOnce() -> Failed) -> Result<String, Failed> {
    match std::fs::read(file) {
        Ok(bytes) => Ok(String::from_utf8_lossy(&bytes).into_owned()),
        Err(error) if error.kind() == ErrorKind::NotFound => Err(gone()),
        Err(error) => Err(Failed::Thrown(format!("{}: {error}", file.display()))),
    }
}

fn gone(version: &str) -> Failed {
    known(
        "VERSION_GONE",
        format!("bundle {version} is no longer stored"),
    )
}

// `validateHealthReferenceManifest(JSON.parse(text))`.
fn read_manifest(dir: &Path, version: &str) -> Result<JsonValue, Failed> {
    let text = read_text(&dir.join(version).join("manifest.json"), || gone(version))?;
    let manifest: JsonValue = serde_json::from_str(&text)
        .map_err(|error| Failed::Thrown(format!("SyntaxError: {error}")))?;
    let manifest = plain(&manifest);
    check("manifest", &manifest, "manifest").map_err(Failed::Thrown)?;
    if manifest["schema"].as_f64() != Some(f64::from(SCHEMA_VERSION)) {
        return Err(Failed::Thrown(
            "health_reference_schema_unsupported: manifest.schema".into(),
        ));
    }
    Ok(manifest)
}

fn current_manifest(dir: &Path) -> Result<JsonValue, Failed> {
    let version = read_text(&dir.join("current"), || {
        known("NOT_BUILT", "no health reference bundle has been built yet")
    })?;
    if !version_shape(&version) {
        return Err(known(
            "NOT_BUILT",
            format!("bundles/current holds '{version}'"),
        ));
    }
    read_manifest(dir, &version)
}

const MAX_SAFE: f64 = 9_007_199_254_740_991.0;

fn read_chunk(dir: &Path, data: &JsonValue) -> Result<JsonValue, Failed> {
    let version = or_empty(data.get("version"));
    if !version_shape(&version) {
        return Err(known("INVALID_ARGUMENT", "version"));
    }
    let offset = data
        .get("offset")
        .and_then(JsonValue::as_f64)
        .filter(|n| n.fract() == 0.0 && n.abs() <= MAX_SAFE && *n >= 0.0);
    let Some(offset) = offset else {
        return Err(known("INVALID_ARGUMENT", "offset"));
    };
    let manifest = read_manifest(dir, &version)?;
    let name = data.get("name");
    let entry = manifest["parts"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|part| name.is_some_and(|name| part.get("name") == Some(name)));
    let Some(entry) = entry else {
        return Err(known("INVALID_ARGUMENT", "name"));
    };
    let bytes = entry["bytes"].as_f64().unwrap_or(0.0);
    if offset >= bytes {
        return Err(known("INVALID_ARGUMENT", "offset"));
    }
    let length = (CHUNK_BYTES as f64).min(bytes - offset) as usize;
    let file_name = crate::vault_router::js::string(&entry["file"]);
    let mut file = match std::fs::File::open(dir.join(&version).join(&file_name)) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Err(gone(&version)),
        Err(error) => return Err(Failed::Thrown(error.to_string())),
    };
    let mut buffer = vec![0_u8; length];
    file.seek(SeekFrom::Start(offset as u64))
        .map_err(|error| Failed::Thrown(error.to_string()))?;
    // `handle.read(buffer, 0, length, offset)`: one read as far as the file goes.
    let mut read = 0;
    while read < length {
        match file.read(&mut buffer[read..]) {
            Ok(0) => break,
            Ok(count) => read += count,
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(error) => return Err(Failed::Thrown(error.to_string())),
        }
    }
    if read != length {
        return Err(known(
            "CORRUPT_BUNDLE",
            format!("{file_name}: {read} of {length} bytes read at {offset}"),
        ));
    }
    let end = offset + length as f64;
    let next = if end < bytes {
        json!(end as u64)
    } else {
        JsonValue::Null
    };
    Ok(
        json!({ "version": version, "name": name.cloned().unwrap_or(JsonValue::Null), "offset": offset as u64,
        "total": entry["bytes"], "next": next, "base64": base64::engine::general_purpose::STANDARD.encode(&buffer) }),
    )
}

pub(super) async fn answer(message: &JsonValue) -> Result<JsonValue, String> {
    let dir = bundles_dir()?;
    let data = message.clone();
    let action = data
        .get("action")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .to_string();
    let read = tokio::task::spawn_blocking(move || match action.as_str() {
        "manifest" => {
            current_manifest(&dir).map(|manifest| json!({ "ok": true, "manifest": manifest }))
        }
        "part" => read_chunk(&dir, &data).map(ok_with),
        _ => Err(known("INVALID_ARGUMENT", "action")),
    })
    .await
    .map_err(|error| error.to_string())?;
    let fields = match read {
        Ok(fields) => fields,
        Err(Failed::Known(code, cause)) => json!({ "ok": false, "error": code, "message": cause }),
        Err(Failed::Thrown(error)) => return Err(error),
    };
    Ok(reply(FRAME, message, fields))
}
