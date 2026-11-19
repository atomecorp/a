//! The animation JSON of a stored Lottie file. A bodymovin file is the JSON itself; a dotLottie is a zip
//! whose `manifest.json` names its animations, the first one being the file's (dotLottie v1 keeps them
//! under `animations/`, v2 under `a/`).
use std::io::{Cursor, Read};

use crate::MAX_LOTTIE_BYTES;

/// How the animation was stored, kept in the report.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub enum LottieContainer {
    #[serde(rename = "json")]
    Json,
    #[serde(rename = "dotlottie")]
    DotLottie,
}

const ZIP_MAGIC: &[u8] = b"PK\x03\x04";

pub fn animation_json(bytes: &[u8]) -> Result<(LottieContainer, Vec<u8>), String> {
    if bytes.is_empty() {
        return Err("lottie_file_empty".into());
    }
    if bytes.len() > MAX_LOTTIE_BYTES {
        return Err("lottie_file_limit".into());
    }
    if bytes.starts_with(ZIP_MAGIC) {
        return dotlottie_animation(bytes).map(|json| (LottieContainer::DotLottie, json));
    }
    Ok((LottieContainer::Json, bytes.to_vec()))
}

fn dotlottie_animation(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("lottie_dotlottie_invalid:{error}"))?;
    let manifest = read_entry(&mut archive, "manifest.json")?;
    let manifest: serde_json::Value = serde_json::from_slice(&manifest)
        .map_err(|error| format!("lottie_dotlottie_manifest_invalid:{error}"))?;
    let id = manifest
        .get("animations")
        .and_then(|animations| animations.as_array())
        .and_then(|animations| animations.first())
        .and_then(|first| first.get("id"))
        .and_then(|id| id.as_str())
        .ok_or("lottie_dotlottie_animation_missing")?;
    let folder = match manifest.get("version").and_then(|version| version.as_str()) {
        Some("2") => "a",
        _ => "animations",
    };
    read_entry(&mut archive, &format!("{folder}/{id}.json"))
}

fn read_entry(archive: &mut zip::ZipArchive<Cursor<&[u8]>>, name: &str) -> Result<Vec<u8>, String> {
    let entry = archive
        .by_name(name)
        .map_err(|_| format!("lottie_dotlottie_entry_missing:{name}"))?;
    if entry.size() > MAX_LOTTIE_BYTES as u64 {
        return Err("lottie_file_limit".into());
    }
    let mut out = Vec::with_capacity(entry.size() as usize);
    // The declared size bounds the allocation; `take` bounds what a lying header could inflate.
    entry
        .take(MAX_LOTTIE_BYTES as u64 + 1)
        .read_to_end(&mut out)
        .map_err(|error| format!("lottie_dotlottie_entry_unreadable:{name}:{error}"))?;
    if out.len() > MAX_LOTTIE_BYTES {
        return Err("lottie_file_limit".into());
    }
    Ok(out)
}
