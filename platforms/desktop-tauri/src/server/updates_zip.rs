// The desktop update from a release ZIP (`/api/admin/sync-from-zip`).
use super::*;

#[derive(serde::Deserialize)]
pub struct SyncFromZipRequest {
    #[serde(rename = "zipUrl")]
    pub zip_url: String,
    #[serde(rename = "extractPath")]
    pub extract_path: String,
    #[serde(rename = "protectedPaths", default)]
    pub protected_paths: Vec<String>,
}

/// Handler for downloading ZIP from GitHub, extracting a configured subtree, and syncing
pub(super) async fn sync_from_zip_handler(
    State(state): State<AppState>,
    Json(payload): Json<SyncFromZipRequest>,
) -> impl IntoResponse {
    println!("📦 Sync from ZIP: {}", payload.zip_url);
    println!("📂 Extract path: {}", payload.extract_path);
    println!("🛡️ Protected paths: {:?}", payload.protected_paths);

    // Get the PROJECT ROOT (not the bundle!)
    // static_dir is something like: .../platforms/desktop-tauri/target/debug/_up_/atome/src
    // We need to go up to find the real project root
    let static_dir = state.static_dir.as_ref();

    // Try to find project root by looking for Cargo.toml or package.json
    let mut base_path = static_dir.to_path_buf();

    // Go up until we find the project root (where platforms/desktop-tauri exists)
    for _ in 0..10 {
        if base_path.join("platforms/desktop-tauri").exists()
            || base_path.join("package.json").exists()
        {
            break;
        }
        if let Some(parent) = base_path.parent() {
            base_path = parent.to_path_buf();
        } else {
            break;
        }
    }

    // Canonicalize for absolute path
    base_path = base_path.canonicalize().unwrap_or(base_path);

    println!("📂 Project root: {:?}", base_path);
    println!(
        "📂 Will write to: {:?}",
        base_path.join(&payload.extract_path)
    );

    // Download ZIP from GitHub
    let client = match atome_server::tls::http_client()
        .and_then(|builder| builder.build().map_err(|error| error.to_string()))
    {
        Ok(client) => client,
        Err(error) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(
                    json!({ "success": false, "error": format!("Failed to download ZIP: {error}") }),
                ),
            );
        }
    };
    let response = match client.get(&payload.zip_url).send().await {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to download ZIP: {}", e)
                })),
            );
        }
    };

    if !response.status().is_success() {
        return (
            StatusCode::BAD_GATEWAY,
            Json(json!({
                "success": false,
                "error": format!("GitHub returned status {}", response.status())
            })),
        );
    }

    let zip_bytes = match response.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to read ZIP: {}", e)
                })),
            );
        }
    };

    println!("📥 Downloaded ZIP: {} bytes", zip_bytes.len());

    // Extract ZIP in memory
    let cursor = Cursor::new(zip_bytes.as_ref());
    let mut archive = match ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to read ZIP archive: {}", e)
                })),
            );
        }
    };

    println!("📦 ZIP contains {} files", archive.len());

    let mut updated_files: Vec<String> = Vec::new();
    let mut errors: Vec<serde_json::Value> = Vec::new();

    // The ZIP from GitHub has a root folder like "a-main/"
    // We need to find it and strip it
    let mut root_prefix = String::new();
    if let Ok(first_entry) = archive.by_index(0)
        && let Ok(name) = first_entry.name()
        && let Some(idx) = name.find('/')
    {
        root_prefix = name[..=idx].to_string();
    }
    println!("📁 ZIP root prefix: {}", root_prefix);

    // Re-create archive (it was consumed)
    let cursor = Cursor::new(zip_bytes.as_ref());
    let mut archive = match ZipArchive::new(cursor) {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({
                    "success": false,
                    "error": format!("Failed to re-read ZIP archive: {}", e)
                })),
            );
        }
    };

    // Extract files
    for i in 0..archive.len() {
        let mut file = match archive.by_index(i) {
            Ok(f) => f,
            Err(e) => {
                errors.push(json!({
                    "index": i,
                    "error": format!("Failed to read entry: {}", e)
                }));
                continue;
            }
        };

        let name = match file.name() {
            Ok(name) => name.to_string(),
            Err(e) => {
                errors.push(json!({
                    "index": i,
                    "error": format!("Failed to read entry name: {}", e)
                }));
                continue;
            }
        };
        // An entry escaping the extraction root (absolute path, `..`) is refused.
        if file.enclosed_name().is_none() {
            errors.push(json!({
                "path": name,
                "error": "Entry path leaves the extraction root"
            }));
            continue;
        }

        // Skip directories
        if name.ends_with('/') {
            continue;
        }

        // Strip root prefix and check if it's in the configured subtree.
        let relative_path = if name.starts_with(&root_prefix) {
            &name[root_prefix.len()..]
        } else {
            &name
        };

        // Only process files that are exactly in the configured extract_path folder.
        // For the default "atome/src/" path, this excludes sibling roots such as "platforms/desktop-tauri/".
        let extract_prefix = format!("{}/", payload.extract_path.trim_end_matches('/'));
        if !relative_path.starts_with(&extract_prefix) {
            continue;
        }

        // Check if path is protected
        let is_protected = payload
            .protected_paths
            .iter()
            .any(|p| relative_path.starts_with(p));
        if is_protected {
            println!("🛡️ Skipping protected: {}", relative_path);
            continue;
        }

        // Read file content
        let mut content = Vec::new();
        if let Err(e) = file.read_to_end(&mut content) {
            errors.push(json!({
                "path": relative_path,
                "error": format!("Failed to read content: {}", e)
            }));
            continue;
        }

        // Write file to disk
        let target_path = base_path.join(relative_path);
        println!("📝 Writing: {} → {:?}", relative_path, target_path);

        // Create parent directories
        if let Some(parent) = target_path.parent()
            && let Err(e) = stdfs::create_dir_all(parent)
        {
            errors.push(json!({
                "path": relative_path,
                "error": format!("Failed to create directory: {}", e)
            }));
            continue;
        }

        // Write file
        if let Err(e) = stdfs::write(&target_path, &content) {
            errors.push(json!({
                "path": relative_path,
                "error": format!("Failed to write file: {}", e)
            }));
            continue;
        }

        updated_files.push(relative_path.to_string());
    }

    println!("✅ Updated {} files", updated_files.len());
    if !errors.is_empty() {
        println!("⚠️ {} errors", errors.len());
    }

    let success = errors.is_empty();
    (
        if success {
            StatusCode::OK
        } else {
            StatusCode::PARTIAL_CONTENT
        },
        Json(json!({
            "success": success,
            "filesUpdated": updated_files.len(),
            "updated": updated_files,
            "errors": if errors.is_empty() { None } else { Some(errors) }
        })),
    )
}
