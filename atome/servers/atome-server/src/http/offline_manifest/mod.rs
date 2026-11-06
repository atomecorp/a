// `GET /offline-manifest.js` (server/offline_app_assets.js, ported): what the service worker
// (atome/src/sw.js) installs. Only public application assets enter it; account databases, media,
// authentication handoffs and private configuration never belong to this cache. Two parts: the
// shell (code, styles, images under the three roots: installed before a version activates) and
// the local resources (local.rs, 130 MB: stored after activation under their own version, so a
// code change never downloads them again), each address with the SHA-256 of its file, each part's
// version the SHA-256 of its list.
// The manifest is the files served at the time of the request: every request walks the roots
// again. A file is read again only when its device, inode, size, modification or change time
// differ from the last walk's (`Hashed`): hashing the 130 MB of local resources and the shell on
// every request is the measured need for that memory (temp/l310_offline/project.mjs, 2026-11-06,
// this project's 3,700 entries: the first reading 2.9 s, as Fastify's 3.3 to 8.8 s; a walk then
// 65 to 100 ms). Fastify kept its digests with a recursive watch, read again 150 ms after the
// changes settled; this reads the tree it would have settled on.
mod local;
mod order;

use crate::http::cors::CorsPolicy;
use crate::http::fastify_reply::{self, NodeError};
use axum::extract::Request;
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use indexmap::IndexMap;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::Metadata;
use std::io::ErrorKind;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const PATH: &str = "/offline-manifest.js";
const SKIPPED: [&str; 7] = [
    "private",
    "temp",
    "tests",
    "node_modules",
    "documentations",
    "database_storage",
    "user_data",
];
// pfb / bcmap: the PDF engine's standard fonts and character maps (vendor/pdfjs), read offline too.
const ASSET: [&str; 19] = [
    "js", "mjs", "json", "html", "css", "svg", "woff", "woff2", "ttf", "otf", "wasm", "png", "ico",
    "jpg", "jpeg", "webp", "gif", "pfb", "bcmap",
];
const NEVER_CACHED: [&str; 3] = ["auth-link.html", "auth-link.js", "sw.js"];

// A name starting with a dot, or one of SKIPPED in any case, anywhere on the way.
fn skipped(relative: &str) -> bool {
    relative.split('/').any(|part| {
        part.starts_with('.') || SKIPPED.iter().any(|name| part.eq_ignore_ascii_case(name))
    })
}

fn asset(relative: &str) -> bool {
    relative.rsplit_once('.').is_some_and(|(_, extension)| {
        ASSET
            .iter()
            .any(|kind| extension.eq_ignore_ascii_case(kind))
    })
}

// What says a file is the one hashed before.
#[derive(Clone, Copy, PartialEq)]
struct Stamp([i64; 7]);

impl Stamp {
    fn of(meta: &Metadata) -> Self {
        Self([
            meta.dev() as i64,
            meta.ino() as i64,
            meta.size() as i64,
            meta.mtime(),
            meta.mtime_nsec(),
            meta.ctime(),
            meta.ctime_nsec(),
        ])
    }
}

#[derive(Clone)]
struct Hashed {
    stamp: Stamp,
    digest: String,
}

/// The manifest's roots and the digests of the last walk.
pub struct OfflineManifest {
    // Each root with its address prefix; the static root (`/`) first.
    roots: [(PathBuf, &'static str); 3],
    hashed: Mutex<HashMap<PathBuf, Hashed>>,
}

// One walk: the digests it read or kept, by path.
struct Walk<'a> {
    before: &'a HashMap<PathBuf, Hashed>,
    after: HashMap<PathBuf, Hashed>,
}

fn failed(path: &Path, error: &std::io::Error) -> String {
    format!("offline_manifest_unreadable:{}: {error}", path.display())
}

impl Walk<'_> {
    // The file's digest, none when it went away before it was read.
    fn digest(&mut self, path: &Path, meta: &Metadata) -> Result<Option<String>, String> {
        let stamp = Stamp::of(meta);
        let known = self.after.get(path).or_else(|| self.before.get(path));
        if let Some(known) = known.filter(|known| known.stamp == stamp).cloned() {
            let digest = known.digest.clone();
            self.after.insert(path.to_path_buf(), known);
            return Ok(Some(digest));
        }
        let mut file = match std::fs::File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(failed(path, &error)),
        };
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher).map_err(|error| failed(path, &error))?;
        let digest: String = hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        let hashed = Hashed {
            stamp,
            digest: digest.clone(),
        };
        self.after.insert(path.to_path_buf(), hashed);
        Ok(Some(digest))
    }

    // `refresh(root, prefix, relative)` at Fastify's start: a directory walked, an asset hashed; a
    // link inside a root is never followed (never served as an asset).
    fn entry(
        &mut self,
        (root, prefix): (&Path, &str),
        relative: &str,
        meta: Metadata,
        assets: &mut IndexMap<String, String>,
    ) -> Result<(), String> {
        let path = root.join(relative);
        if meta.is_dir() {
            let names = match std::fs::read_dir(&path) {
                Ok(names) => names,
                Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
                Err(error) => return Err(failed(&path, &error)),
            };
            for name in names {
                let name = name.map_err(|error| failed(&path, &error))?.file_name();
                // A name Node cannot read back is never found again by its decoded spelling.
                let Some(name) = name.to_str() else { continue };
                let inner = match relative {
                    "" => name.to_string(),
                    _ => format!("{relative}/{name}"),
                };
                if skipped(&inner) {
                    continue;
                }
                match std::fs::symlink_metadata(path.join(name)) {
                    Ok(meta) => self.entry((root, prefix), &inner, meta, assets)?,
                    Err(error) if error.kind() == ErrorKind::NotFound => {}
                    Err(error) => return Err(failed(&path.join(name), &error)),
                }
            }
        } else if meta.is_file()
            && asset(relative)
            && !NEVER_CACHED.contains(&relative)
            && let Some(digest) = self.digest(&path, &meta)?
        {
            assets.insert(format!("{prefix}{relative}"), digest);
        }
        Ok(())
    }
}

// A part's list, ordered as `localeCompare` orders it (two addresses it holds equal keep the order
// they were found in, as Fastify's Map kept it), and its version.
fn listed(assets: IndexMap<String, String>) -> Result<(String, String), String> {
    let mut keyed = assets
        .into_iter()
        .map(|(url, digest)| Ok((order::key(&url)?, url, digest)))
        .collect::<Result<Vec<_>, String>>()?;
    keyed.sort_by(|a, b| a.0.cmp(&b.0));
    let list = serde_json::Value::Array(
        keyed
            .into_iter()
            .map(|(_, url, digest)| serde_json::json!({ "url": url, "digest": digest }))
            .collect(),
    );
    let text = atome_store::intent::js_stringify(&list);
    let version = Sha256::digest(text.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Ok((text, version))
}

impl OfflineManifest {
    /// The Web server's manifest, read once now as Fastify read it before listening: a broken tree
    /// (a root or a declared local resource missing) refuses the start.
    pub async fn new(project_root: &Path) -> Result<Arc<Self>, String> {
        let manifest = Arc::new(Self {
            roots: [
                (project_root.join("atome").join("src"), "/"),
                (project_root.join("eVe"), "/eVe/"),
                (
                    project_root
                        .join("node_modules")
                        .join("rubberband-wasm")
                        .join("dist"),
                    "/vendor/rubberband-wasm/",
                ),
            ],
            hashed: Mutex::default(),
        });
        let first = manifest.clone();
        tokio::task::spawn_blocking(move || first.source())
            .await
            .map_err(|error| error.to_string())??;
        Ok(manifest)
    }

    /// `self.__ATOME_OFFLINE_ASSETS__={ version, assets, local: { version, assets } };` for the
    /// files as they are now.
    pub fn source(&self) -> Result<String, String> {
        let mut hashed = self.hashed.lock().expect("offline manifest digests");
        let mut walk = Walk {
            before: &hashed,
            after: HashMap::new(),
        };
        let mut shell = IndexMap::new();
        for (root, prefix) in &self.roots {
            // A root is followed; Fastify's watch on a missing root refused its start.
            let meta = std::fs::metadata(root).map_err(|error| failed(root, &error))?;
            walk.entry((root, prefix), "", meta, &mut shell)?;
        }
        let static_root = &self.roots[0].0;
        let mut local = IndexMap::new();
        for relative in local::resolve(static_root)? {
            let path = local::under(static_root, &relative);
            let meta = std::fs::metadata(&path).map_err(|error| failed(&path, &error))?;
            let digest = walk
                .digest(&path, &meta)?
                .ok_or_else(|| format!("offline_local_resource_missing:{relative}"))?;
            local.insert(format!("/{relative}"), digest);
        }
        let after = walk.after;
        let ((assets, version), (local, local_version)) = (listed(shell)?, listed(local)?);
        *hashed = after;
        Ok(format!(
            "self.__ATOME_OFFLINE_ASSETS__={{\"version\":\"{version}\",\"assets\":{assets},\"local\":{{\"version\":\"{local_version}\",\"assets\":{local}}}}};"
        ))
    }

    /// Whether `request` asks for the manifest.
    pub fn claims(request: &Request) -> bool {
        matches!(*request.method(), Method::GET | Method::HEAD) && request.uri().path() == PATH
    }

    /// The answer to a request `claims` took: the script, `no-cache`, encoded as @fastify/compress
    /// encodes it, with Fastify's CORS; a tree it cannot read is Fastify's 500, said by name.
    pub async fn answer(self: Arc<Self>, cors: &CorsPolicy, request: Request) -> Response {
        let headers = request.headers().clone();
        let head = request.method() == Method::HEAD;
        let read = tokio::task::spawn_blocking(move || self.source())
            .await
            .unwrap_or_else(|error| Err(error.to_string()));
        let mut response = match read {
            Ok(source) => {
                let mut response = (StatusCode::OK, source).into_response();
                let fields = response.headers_mut();
                fields.insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("application/javascript"),
                );
                fields.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"));
                fields.insert(
                    header::X_CONTENT_TYPE_OPTIONS,
                    HeaderValue::from_static("nosniff"),
                );
                response
            }
            Err(message) => {
                eprintln!("[offline-manifest] {message}");
                fastify_reply::thrown(&NodeError {
                    code: None,
                    message,
                })
            }
        };
        if !head {
            response = fastify_reply::compressed(&headers, response).await;
        }
        cors.decorate(PATH, &headers, response.headers_mut());
        response
    }
}
