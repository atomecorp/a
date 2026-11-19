//! The asset resolver of one USD file held in memory: the renderer has no file system (WASM), so the file's
//! bytes are its only asset, a `.usdz` package's entries included. Anything else the file names (a texture or
//! a layer beside it on the author's disk) does not resolve and is reported by the loader.

use std::io::{self, Cursor, Read};
use std::sync::Arc;

use openusd::ar::{self, Asset, ResolvedPath, Resolver};

/// The identifier of the root layer: an absolute name so relative arcs anchor against it.
pub fn root_identifier(format: &str) -> String {
    format!("/atome_scene3d/scene.{format}")
}

#[derive(Clone)]
pub struct MemoryResolver {
    root: String,
    bytes: Arc<Vec<u8>>,
}

impl MemoryResolver {
    pub fn new(root: String, bytes: Arc<Vec<u8>>) -> Self {
        Self { root, bytes }
    }

    fn is_package(&self) -> bool {
        self.root.ends_with(".usdz")
    }

    /// An entry of the package, by its name inside the archive.
    pub fn package_entry(&self, inner: &str) -> io::Result<Vec<u8>> {
        if !self.is_package() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "scene3d_not_a_package",
            ));
        }
        let mut archive =
            zip::ZipArchive::new(Cursor::new(self.bytes.as_slice())).map_err(io::Error::other)?;
        let mut entry = archive.by_name(inner).map_err(io::Error::other)?;
        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer)?;
        Ok(buffer)
    }

    fn package_contains(&self, inner: &str) -> bool {
        zip::ZipArchive::new(Cursor::new(self.bytes.as_slice()))
            .map(|mut archive| archive.by_name(inner).is_ok())
            .unwrap_or(false)
    }
}

/// `a/./b//c` → `a/b/c`; `..` collapses against its parent (the package has no symbolic links).
pub fn normalize_relative(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

fn directory_of(path: &str) -> &str {
    path.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("")
}

fn join(dir: &str, relative: &str) -> String {
    if dir.is_empty() {
        normalize_relative(relative)
    } else {
        normalize_relative(&format!("{dir}/{relative}"))
    }
}

impl Resolver for MemoryResolver {
    fn create_identifier(&self, asset_path: &str, anchor: Option<&ResolvedPath>) -> String {
        if asset_path.is_empty()
            || ar::is_package_relative_path(asset_path)
            || asset_path.starts_with('/')
        {
            return asset_path.to_string();
        }
        let Some(anchor) = anchor else {
            return format!("/{}", normalize_relative(asset_path));
        };
        let anchor = anchor.to_string_lossy().into_owned();
        if ar::is_package_relative_path(&anchor)
            && let Some((package, inner)) = ar::split_package_relative_path_inner(&anchor)
        {
            return ar::join_package_relative_path(
                &package,
                &join(directory_of(&inner), asset_path),
            );
        }
        if anchor.to_ascii_lowercase().ends_with(".usdz") {
            return ar::join_package_relative_path(&anchor, &normalize_relative(asset_path));
        }
        format!(
            "/{}",
            join(directory_of(anchor.trim_start_matches('/')), asset_path)
        )
    }

    fn resolve(&self, asset_path: &str) -> Option<ResolvedPath> {
        if asset_path == self.root {
            return Some(ResolvedPath::new(asset_path));
        }
        let (package, inner) = ar::split_package_relative_path_outer(asset_path)?;
        (package == self.root && self.package_contains(&inner))
            .then(|| ResolvedPath::new(asset_path))
    }

    fn resolve_for_new_asset(&self, _asset_path: &str) -> Option<ResolvedPath> {
        None
    }

    fn open_asset(&self, resolved_path: &ResolvedPath) -> io::Result<Box<dyn Asset>> {
        let path = resolved_path.to_string_lossy().into_owned();
        if path == self.root {
            return Ok(Box::new(Cursor::new(self.bytes.as_ref().clone())));
        }
        match ar::split_package_relative_path_outer(&path) {
            Some((package, inner)) if package == self.root => {
                Ok(Box::new(Cursor::new(self.package_entry(&inner)?)))
            }
            _ => Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("scene3d_asset_outside_file:{path}"),
            )),
        }
    }

    fn get_modification_timestamp(
        &self,
        _asset_path: &str,
        _resolved_path: &ResolvedPath,
    ) -> Option<std::time::SystemTime> {
        None
    }

    fn identity(&self) -> String {
        format!("atome_scene3d_memory:{}", self.root)
    }
}
