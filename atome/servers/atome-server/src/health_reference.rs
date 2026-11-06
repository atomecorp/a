// The monthly health reference build (server/health_reference_schedule.js, ported): the native
// `atome-health-ref run` (atome/engines/atome-health-ref, built with
// `cargo build -p atome-health-ref --release`) fetches the public sources into
// data/health_reference/sources and writes a new bundle under data/health_reference/bundles,
// which `/ws/api`'s `health-reference` family serves. Once a day the server checks the current
// bundle's day; a bundle older than a month, or none, starts a build. One build at a time; a
// failed build is logged and tried again the next day. Enabled by HEALTH_REFERENCE_BUILD=true (a
// deployment's job: a build downloads about 170 MB and then reads up to 2000 SmPC pages, one every
// 1.5 s). A build stopped halfway (the server stopping) leaves the previous bundle current:
// atome-health-ref writes it whole or not at all.
use crate::settings::Settings;
use atome_health_ref::model::{Manifest, SCHEMA_VERSION};
use serde_json::{Value as JsonValue, json};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

const DAY: Duration = Duration::from_secs(24 * 60 * 60);
const FIRST_CHECK: Duration = Duration::from_secs(60);
const MAX_AGE_DAYS: i64 = 30;

fn log(level: &str, message: &str, data: JsonValue) {
    eprintln!(
        "{}",
        json!({ "level": level, "component": "health-reference", "message": message, "data": data })
    );
}

struct Paths {
    binary: PathBuf,
    sources: PathBuf,
    bundles: PathBuf,
}

// The bundles' folder: data/health_reference/bundles, or HEALTH_REFERENCE_BUNDLES_DIR (a probe's
// fixture bundle) resolved as Fastify resolves it, from its own folder (`server/`).
fn paths(root: &Path, settings: &Settings) -> Paths {
    let data = root.join("data").join("health_reference");
    let bundles = match settings
        .value("HEALTH_REFERENCE_BUNDLES_DIR")
        .filter(|dir| !dir.is_empty())
    {
        Some(dir) => root.join("server").join(dir),
        None => data.join("bundles"),
    };
    Paths {
        binary: root.join("target").join("release").join("atome-health-ref"),
        sources: data.join("sources"),
        bundles,
    }
}

// Whether the current bundle is a month old, or none was built.
fn due(bundles: &Path) -> Result<bool, String> {
    let version = match std::fs::read(bundles.join("current")) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(true),
        Err(error) => return Err(format!("bundles/current: {error}")),
    };
    let shaped = version.len() == 16
        && version
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
    if !shaped {
        return Ok(true);
    }
    let file = bundles.join(&version).join("manifest.json");
    let text = std::fs::read_to_string(&file).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => format!("bundle {version} is no longer stored"),
        _ => format!("{}: {error}", file.display()),
    })?;
    let manifest: Manifest = serde_json::from_str(&text).map_err(|error| error.to_string())?;
    if manifest.schema != SCHEMA_VERSION {
        return Err("health_reference_schema_unsupported: manifest.schema".into());
    }
    let Ok(built_on) = chrono::NaiveDate::parse_from_str(&manifest.built_on, "%Y-%m-%d") else {
        return Ok(false);
    };
    let age = chrono::Utc::now().date_naive() - built_on;
    Ok(age.num_days() >= MAX_AGE_DAYS)
}

// `atome-health-ref run`: its JSON report, or why it failed.
async fn build(paths: &Paths) -> Result<JsonValue, String> {
    if !paths.binary.is_file() {
        return Err(format!(
            "{} is missing: cargo build -p atome-health-ref --release",
            paths.binary.display()
        ));
    }
    let output = tokio::process::Command::new(&paths.binary)
        .arg("run")
        .arg("--sources")
        .arg(&paths.sources)
        .arg("--out")
        .arg(&paths.bundles)
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return serde_json::from_slice(&output.stdout).map_err(|error| error.to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        match output.status.code() {
            Some(code) => format!("atome-health-ref exited with {code}"),
            None => "atome-health-ref exited with null".into(),
        }
    } else {
        stderr
    })
}

async fn check(paths: &Paths) {
    match due(&paths.bundles) {
        Ok(false) => {}
        Ok(true) => match build(paths).await {
            Ok(result) => log(
                "info",
                "health reference bundle built",
                json!({ "version": result.pointer("/build/version"), "parts": result.pointer("/build/parts"),
                    "rcp_fetched": result.pointer("/fetch/rcp_fetched"),
                    "rcp_failures": result.pointer("/fetch/rcp_failures").and_then(JsonValue::as_array).map(Vec::len),
                    "report": result.pointer("/build/report") }),
            ),
            Err(error) => log(
                "error",
                "health reference build failed",
                json!({ "error": error }),
            ),
        },
        Err(error) => log(
            "error",
            "health reference check failed",
            json!({ "error": error }),
        ),
    }
}

/// The schedule, from the project's root (the server's directory): a first check a minute after
/// the start, then one a day after each check ends.
pub fn schedule() {
    let root = match std::env::current_dir() {
        Ok(root) => root,
        Err(error) => {
            log(
                "error",
                "health reference check failed",
                json!({ "error": error.to_string() }),
            );
            return;
        }
    };
    let settings = match Settings::load(&root) {
        Ok(settings) => settings,
        Err(error) => {
            log(
                "error",
                "health reference check failed",
                json!({ "error": error }),
            );
            return;
        }
    };
    if settings.value("HEALTH_REFERENCE_BUILD").as_deref() != Some("true") {
        log(
            "info",
            "health reference build disabled (set HEALTH_REFERENCE_BUILD=true to enable)",
            JsonValue::Null,
        );
        return;
    }
    let paths = paths(&root, &settings);
    tokio::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            check(&paths).await;
            tokio::time::sleep(DAY).await;
        }
    });
}
