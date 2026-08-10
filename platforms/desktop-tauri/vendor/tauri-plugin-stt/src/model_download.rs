use reqwest::header::{CONTENT_LENGTH, CONTENT_RANGE, RANGE};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Runtime};

fn emit_progress<R: Runtime>(app: &AppHandle<R>, model: &str, status: &str, progress: u8) {
    let _ = app.emit(
        "stt://download-progress",
        serde_json::json!({
            "status": status,
            "model": model,
            "progress": progress
        }),
    );
}

fn resolve_download_url(model_name: &str, default_url: &str) -> String {
    if let Ok(url) = std::env::var("SQUIRREL_STT_MODEL_URL") {
        if !url.trim().is_empty() {
            return url.trim().to_string();
        }
    }
    let model_key = model_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    if let Ok(url) = std::env::var(format!("SQUIRREL_STT_MODEL_URL_{}", model_key)) {
        if !url.trim().is_empty() {
            return url.trim().to_string();
        }
    }
    if let Ok(base_url) = std::env::var("SQUIRREL_STT_MODEL_BASE_URL") {
        let base_url = base_url.trim().trim_end_matches('/');
        if !base_url.is_empty() {
            let file_name = default_url.rsplit('/').next().unwrap_or(default_url);
            return format!("{}/{}", base_url, file_name);
        }
    }
    default_url.to_string()
}

fn response_total_size(response: &reqwest::blocking::Response, existing_size: u64) -> Option<u64> {
    if response.status() == reqwest::StatusCode::PARTIAL_CONTENT && existing_size > 0 {
        response
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.rsplit('/').next())
            .and_then(|value| value.parse::<u64>().ok())
            .or_else(|| {
                response
                    .headers()
                    .get(CONTENT_LENGTH)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
                    .map(|length| existing_size + length)
            })
    } else {
        response.content_length()
    }
}

fn fetch_archive<R: Runtime>(
    app: AppHandle<R>,
    model_name: String,
    url: String,
    zip_path: PathBuf,
    part_path: PathBuf,
) -> Result<PathBuf, String> {
    if zip_path.exists() {
        emit_progress(&app, &model_name, "extracting", 50);
        return Ok(zip_path);
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3000))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {}", error))?;
    let existing_size = fs::metadata(&part_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let mut request = client.get(&url);
    if existing_size > 0 {
        request = request.header(RANGE, format!("bytes={}-", existing_size));
    }
    let mut response = request
        .send()
        .map_err(|error| format!("Failed to download model from {}: {}", url, error))?;
    let status = response.status();
    if !(status.is_success() || status == reqwest::StatusCode::PARTIAL_CONTENT) {
        return Err(format!("Failed to download model: HTTP {}", status));
    }

    let resumed = status == reqwest::StatusCode::PARTIAL_CONTENT && existing_size > 0;
    let mut file = if resumed {
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&part_path)
            .map_err(|error| format!("Failed to open partial download: {}", error))?
    } else {
        File::create(&part_path)
            .map_err(|error| format!("Failed to create partial download: {}", error))?
    };
    let total_size = response_total_size(&response, if resumed { existing_size } else { 0 });
    let mut downloaded = if resumed { existing_size } else { 0 };
    let mut chunk = vec![0_u8; 64 * 1024];
    let mut last_progress = None;
    loop {
        let count = response
            .read(&mut chunk)
            .map_err(|error| format!("Failed to read download chunk: {}", error))?;
        if count == 0 {
            break;
        }
        file.write_all(&chunk[..count])
            .map_err(|error| format!("Failed to write download chunk: {}", error))?;
        downloaded += count as u64;
        if let Some(total_size) = total_size {
            let progress = ((downloaded as f64 / total_size as f64) * 50.0)
                .floor()
                .clamp(0.0, 50.0) as u8;
            if last_progress != Some(progress) {
                last_progress = Some(progress);
                emit_progress(&app, &model_name, "downloading", progress);
            }
        }
    }
    file.sync_all()
        .map_err(|error| format!("Failed to flush model download: {}", error))?;
    fs::rename(&part_path, &zip_path)
        .map_err(|error| format!("Failed to finalize cached model zip: {}", error))?;
    emit_progress(&app, &model_name, "extracting", 50);
    Ok(zip_path)
}

fn extract_archive(archive_path: &Path, models_dir: &Path) -> crate::Result<()> {
    let file = File::open(archive_path).map_err(|error| {
        crate::Error::Recording(format!("Failed to open cached zip: {}", error))
    })?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| crate::Error::Recording(format!("Failed to open zip: {}", error)))?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| {
            crate::Error::Recording(format!("Failed to read zip entry: {}", error))
        })?;
        let Some(relative_path) = entry.enclosed_name() else {
            continue;
        };
        let output_path = models_dir.join(relative_path);
        if entry.is_dir() {
            fs::create_dir_all(&output_path).map_err(|error| {
                crate::Error::Recording(format!("Failed to create model directory: {}", error))
            })?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                crate::Error::Recording(format!("Failed to create model directory: {}", error))
            })?;
        }
        let mut output = File::create(&output_path).map_err(|error| {
            crate::Error::Recording(format!("Failed to create model file: {}", error))
        })?;
        io::copy(&mut entry, &mut output).map_err(|error| {
            crate::Error::Recording(format!("Failed to extract model file: {}", error))
        })?;
    }
    Ok(())
}

pub(crate) fn prepare_model_files<R: Runtime>(
    app: &AppHandle<R>,
    models_dir: PathBuf,
    model_name: &str,
    default_url: &str,
) -> crate::Result<PathBuf> {
    fs::create_dir_all(&models_dir).map_err(|error| {
        crate::Error::Recording(format!("Failed to create models directory: {}", error))
    })?;
    let downloads_dir = models_dir.join(".downloads");
    fs::create_dir_all(&downloads_dir).map_err(|error| {
        crate::Error::Recording(format!(
            "Failed to create download cache directory: {}",
            error
        ))
    })?;
    let model_path = models_dir.join(model_name);
    if model_path.exists() {
        emit_progress(app, model_name, "ready", 100);
        return Ok(model_path);
    }

    emit_progress(app, model_name, "downloading", 0);
    let zip_path = downloads_dir.join(format!("{}.zip", model_name));
    let part_path = downloads_dir.join(format!("{}.zip.part", model_name));
    let worker = std::thread::spawn({
        let app = app.clone();
        let model_name = model_name.to_string();
        let url = resolve_download_url(model_name.as_str(), default_url);
        move || fetch_archive(app, model_name, url, zip_path, part_path)
    });
    let archive_path = worker
        .join()
        .map_err(|_| crate::Error::Recording("Model download thread panicked".to_string()))?
        .map_err(crate::Error::Recording)?;
    extract_archive(&archive_path, &models_dir)?;
    emit_progress(app, model_name, "complete", 100);
    Ok(model_path)
}
