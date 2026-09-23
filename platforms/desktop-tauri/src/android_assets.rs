//! Android asset materialization.
//!
//! On Android `PathResolver::resource_dir` returns the URI prefix
//! `asset://localhost/` (tauri-utils `platform.rs`), so the Axum server that
//! serves the application cannot read the frontend from a file system path the
//! way the desktop build does.
//!
//! Tauri still embeds `build.frontendDist` into the shared library, and the
//! staged Android web root carries every tree the server needs at runtime:
//!
//! ```text
//! <web root>/
//!   index.html ...             the atome/src frontend
//!   eVe/                       the eVe runtime served on /eVe
//!   vendor-rubberband-wasm/    served on /vendor/rubberband-wasm; the transport
//!                              name avoids "node_modules", which the Tauri CLI
//!                              rejects inside build.frontendDist
//!   version.txt                the atome version file
//! ```
//!
//! `materialize_project_root` writes that tree into the application data
//! directory and returns the path the rest of the process already expects:
//! `<project>/atome/src`. From there `project_root_from_static_dir` resolves
//! `<project>`, and the desktop server code works unchanged.
//!
//! The path mapping is target independent so it is covered by the desktop test
//! run; only the extraction itself is Android specific.

#![cfg_attr(not(target_os = "android"), allow(dead_code))]

use std::path::PathBuf;

/// Marker written after a successful extraction. It makes the extraction
/// idempotent: an unchanged asset set is never rewritten.
const MANIFEST_FILE: &str = ".asset-manifest";

/// Trees that live outside the frontend root: (transport prefix inside the
/// staged web root, destination under the project root the Axum server reads).
const PROJECT_SUBTREES: [(&str, &str); 2] = [
    ("eVe/", "eVe"),
    (
        "vendor-rubberband-wasm/dist/",
        "node_modules/rubberband-wasm/dist",
    ),
];

/// Root-level files that belong to the project rather than to the frontend.
const PROJECT_FILES: [&str; 1] = ["version.txt"];

/// Maps an embedded asset path to its destination under the project root.
/// Returns `None` for paths that carry no file (a directory entry).
fn project_relative_path(asset_path: &str) -> Result<Option<PathBuf>, String> {
    let relative = asset_path.trim_start_matches('/');
    if relative.is_empty() {
        return Ok(None);
    }
    if relative.split('/').any(|segment| segment == "..") {
        return Err(format!(
            "refusing to extract unsafe asset path: {asset_path}"
        ));
    }

    if PROJECT_FILES.contains(&relative) {
        return Ok(Some(PathBuf::from(relative)));
    }

    for (prefix, destination) in PROJECT_SUBTREES {
        if let Some(rest) = relative.strip_prefix(prefix) {
            if rest.is_empty() {
                return Ok(None);
            }
            return Ok(Some(PathBuf::from(destination).join(rest)));
        }
    }

    Ok(Some(PathBuf::from("atome").join("src").join(relative)))
}

#[cfg(target_os = "android")]
mod extraction {
    use std::fs;
    use std::path::{Component, Path, PathBuf};

    use tauri::Manager;

    use super::{project_relative_path, MANIFEST_FILE};

    fn is_safe_relative_path(path: &Path) -> bool {
        path.components()
            .all(|component| matches!(component, Component::Normal(_)))
    }

    fn manifest_contents(asset_count: usize, asset_bytes: usize) -> String {
        format!(
            "version={}\nassets={}\nbytes={}\n",
            env!("CARGO_PKG_VERSION"),
            asset_count,
            asset_bytes
        )
    }

    /// Extracts every embedded asset into `app_data_dir/squirrel/project` and
    /// returns `<project>/atome/src`.
    pub fn materialize_project_root<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
    ) -> Result<PathBuf, String> {
        let project_root = app
            .path()
            .app_data_dir()
            .map_err(|err| format!("android app_data_dir is unavailable: {err}"))?
            .join("squirrel")
            .join("project");
        let static_dir = project_root.join("atome").join("src");
        let manifest_path = project_root.join(MANIFEST_FILE);

        let resolver = app.asset_resolver();
        let entries: Vec<String> = resolver
            .iter()
            .map(|(key, _stored_bytes)| key.to_string())
            .collect();
        if entries.is_empty() {
            return Err(
                "no embedded asset was found; the Android web root was not staged before the build"
                    .to_string(),
            );
        }

        let asset_bytes: usize = resolver
            .iter()
            .map(|(_key, stored_bytes)| stored_bytes.len())
            .sum();
        let expected_manifest = manifest_contents(entries.len(), asset_bytes);

        if fs::read_to_string(&manifest_path).ok().as_deref() == Some(expected_manifest.as_str()) {
            println!(
                "[tauri] Android assets already materialized at {:?}",
                project_root
            );
            return Ok(static_dir);
        }

        println!(
            "[tauri] Materializing {} Android assets into {:?}",
            entries.len(),
            project_root
        );
        fs::create_dir_all(&static_dir)
            .map_err(|err| format!("cannot create {static_dir:?}: {err}"))?;

        let mut written = 0usize;
        for key in &entries {
            let Some(destination) = project_relative_path(key)? else {
                continue;
            };
            if !is_safe_relative_path(&destination) {
                return Err(format!("refusing to extract unsafe asset path: {key}"));
            }
            let asset = resolver
                .get(key.clone())
                .ok_or_else(|| format!("embedded asset {key} could not be read back"))?;
            let absolute = project_root.join(&destination);
            if let Some(parent) = absolute.parent() {
                fs::create_dir_all(parent)
                    .map_err(|err| format!("cannot create {parent:?}: {err}"))?;
            }
            fs::write(&absolute, asset.bytes())
                .map_err(|err| format!("cannot write {absolute:?}: {err}"))?;
            written += 1;
        }

        if !static_dir.join("index.html").is_file() {
            return Err(format!(
                "Android assets were materialized but {static_dir:?} has no index.html"
            ));
        }

        fs::write(&manifest_path, &expected_manifest)
            .map_err(|err| format!("cannot write {manifest_path:?}: {err}"))?;
        println!("[tauri] Materialized {written} Android assets");
        Ok(static_dir)
    }
}

#[cfg(target_os = "android")]
pub use extraction::materialize_project_root;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_assets_land_under_atome_src() {
        assert_eq!(
            project_relative_path("/index.html").unwrap().unwrap(),
            PathBuf::from("atome/src/index.html")
        );
        assert_eq!(
            project_relative_path("/assets/images/1.png")
                .unwrap()
                .unwrap(),
            PathBuf::from("atome/src/assets/images/1.png")
        );
    }

    #[test]
    fn project_trees_land_beside_the_frontend() {
        assert_eq!(
            project_relative_path("/eVe/version.txt").unwrap().unwrap(),
            PathBuf::from("eVe/version.txt")
        );
        assert_eq!(
            project_relative_path("/vendor-rubberband-wasm/dist/index.esm.js")
                .unwrap()
                .unwrap(),
            PathBuf::from("node_modules/rubberband-wasm/dist/index.esm.js")
        );
        assert_eq!(
            project_relative_path("/version.txt").unwrap().unwrap(),
            PathBuf::from("version.txt")
        );
    }

    #[test]
    fn traversal_and_empty_paths_are_rejected() {
        assert!(project_relative_path("/../secrets").is_err());
        assert!(project_relative_path("/").unwrap().is_none());
    }
}
