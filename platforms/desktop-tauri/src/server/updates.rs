// The desktop application's own update routes (`/api/admin/*`).
use super::*;

/// Request for writing update files
#[derive(serde::Deserialize)]
pub struct WriteUpdateFileRequest {
    pub path: String,
    pub content: String,
}

/// Handler for writing update files (admin only)
pub(super) async fn update_file_handler(
    State(state): State<AppState>,
    Json(payload): Json<WriteUpdateFileRequest>,
) -> impl IntoResponse {
    // Security: Only allow writes within the explicit atome runtime roots.
    // static_dir points to 'src', so parent is project root
    let base_path = state.static_dir.parent().unwrap_or(&state.static_dir);
    let target_path = base_path.join(&payload.path);

    // Validate path is within allowed directories
    let allowed_prefixes = [
        "atome/src/squirrel",
        "atome/src/application/core",
        "atome/security",
    ];
    // Fichiers spécifiques autorisés (en dehors des préfixes)
    let allowed_files = ["atome/src/version.json"];
    let protected_prefixes = [
        "atome/src/application/examples",
        "atome/src/application/config",
    ];

    let path_str = payload.path.as_str();

    // Check if path is protected
    for protected in &protected_prefixes {
        if path_str.starts_with(protected) {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({
                    "success": false,
                    "error": format!("Path {} is protected and cannot be updated", protected)
                })),
            );
        }
    }

    // Check if path is allowed (prefix ou fichier spécifique)
    let is_allowed = allowed_prefixes
        .iter()
        .any(|prefix| path_str.starts_with(prefix))
        || allowed_files.contains(&path_str);
    if !is_allowed {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({
                "success": false,
                "error": "Path is not in allowed update directories"
            })),
        );
    }

    // Create parent directories if needed
    if let Some(parent) = target_path.parent()
        && let Err(err) = fs::create_dir_all(parent).await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "success": false,
                "error": format!("Failed to create directory: {}", err)
            })),
        );
    }

    // Write the file
    match fs::write(&target_path, payload.content.as_bytes()).await {
        Ok(_) => (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "path": payload.path,
                "message": "File updated successfully"
            })),
        ),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "success": false,
                "error": format!("Failed to write file: {}", err)
            })),
        ),
    }
}

// === BATCH UPDATE HANDLER ===

#[derive(serde::Deserialize)]
pub struct BatchUpdateFile {
    pub path: String,
    pub url: String,
}

#[derive(serde::Deserialize)]
pub struct VersionUpdate {
    pub path: String,
    pub content: String,
}

#[derive(serde::Deserialize)]
pub struct BatchUpdateRequest {
    pub files: Vec<BatchUpdateFile>,
    #[serde(default)]
    pub version: Option<VersionUpdate>,
}

/// Handler for batch downloading and updating files from GitHub
pub(super) async fn batch_update_handler(
    State(state): State<AppState>,
    Json(payload): Json<BatchUpdateRequest>,
) -> impl IntoResponse {
    // static_dir points to 'src' bundle directory
    // We need to write to the bundle, not the source
    let static_dir = state.static_dir.as_ref();

    // Canonicalize to get absolute path
    let base_path = match static_dir.parent() {
        Some(parent) => match parent.canonicalize() {
            Ok(abs) => abs,
            Err(_) => parent.to_path_buf(),
        },
        None => static_dir.to_path_buf(),
    };

    println!("📥 Batch update: {} files to download", payload.files.len());
    println!("📂 Static dir: {:?}", static_dir);
    println!("📂 Base path (absolute): {:?}", base_path);

    let allowed_prefixes = [
        "atome/src/squirrel",
        "atome/src/application/core",
        "atome/security",
    ];
    let allowed_files = ["atome/src/version.json"];
    let protected_prefixes = [
        "atome/src/application/examples",
        "atome/src/application/config",
    ];

    let client = match atome_server::tls::http_client()
        .and_then(|builder| builder.build().map_err(|error| error.to_string()))
    {
        Ok(client) => client,
        Err(error) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "success": false, "error": format!("Failed to download: {error}") })),
            );
        }
    };
    let mut updated_files = Vec::new();
    let mut errors = Vec::new();

    for file in &payload.files {
        let path_str = file.path.as_str();

        // Check protected paths
        let is_protected = protected_prefixes.iter().any(|p| path_str.starts_with(p));
        if is_protected {
            errors.push(json!({
                "path": file.path,
                "error": "Path is protected"
            }));
            continue;
        }

        // Check allowed paths
        let is_allowed = allowed_prefixes.iter().any(|p| path_str.starts_with(p))
            || allowed_files.contains(&path_str);
        if !is_allowed {
            errors.push(json!({
                "path": file.path,
                "error": "Path not in allowed directories"
            }));
            continue;
        }

        // Download file from GitHub
        let download_result = client.get(&file.url).send().await;
        match download_result {
            Ok(response) => {
                if !response.status().is_success() {
                    errors.push(json!({
                        "path": file.path,
                        "error": format!("GitHub returned status {}", response.status())
                    }));
                    continue;
                }

                match response.bytes().await {
                    Ok(content) => {
                        let target_path = base_path.join(&file.path);

                        // Create parent directories
                        if let Some(parent) = target_path.parent()
                            && let Err(e) = fs::create_dir_all(parent).await
                        {
                            errors.push(json!({
                                "path": file.path,
                                "error": format!("Failed to create directory: {}", e)
                            }));
                            continue;
                        }

                        // Write file
                        match fs::write(&target_path, &content).await {
                            Ok(_) => {
                                updated_files.push(file.path.clone());
                            }
                            Err(e) => {
                                errors.push(json!({
                                    "path": file.path,
                                    "error": format!("Failed to write file: {}", e)
                                }));
                            }
                        }
                    }
                    Err(e) => {
                        errors.push(json!({
                            "path": file.path,
                            "error": format!("Failed to read response: {}", e)
                        }));
                    }
                }
            }
            Err(e) => {
                errors.push(json!({
                    "path": file.path,
                    "error": format!("Failed to download: {}", e)
                }));
            }
        }
    }

    // Update version file only if provided (not null)
    if let Some(ref version) = payload.version {
        let version_path = base_path.join(&version.path);
        if let Some(parent) = version_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }
        if let Err(e) = fs::write(&version_path, version.content.as_bytes()).await {
            errors.push(json!({
                "path": version.path,
                "error": format!("Failed to update version file: {}", e)
            }));
        }
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
