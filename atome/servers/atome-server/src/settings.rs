// The server's settings as Fastify reads them (server/server_boot_config.js): the
// process environment, `.env` under it, `.env.local` over it, at the project root.
use std::collections::HashMap;
use std::path::Path;

pub struct Settings {
    below: HashMap<String, String>,
    above: HashMap<String, String>,
}

// Fastify's line rule: `KEY=value`, `#` comments, one pair of quotes dropped, `\n` read as a newline.
fn read(file: &Path) -> Result<HashMap<String, String>, String> {
    let text = match std::fs::read_to_string(file) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => return Err(format!("settings_unreadable:{}:{error}", file.display())),
    };
    let mut values = HashMap::new();
    for line in text.lines() {
        if line.trim().starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        let value = value.trim();
        let value = [('"', '"'), ('\'', '\'')]
            .iter()
            .find_map(|(open, close)| {
                (value.len() >= 2 && value.starts_with(*open) && value.ends_with(*close))
                    .then(|| &value[1..value.len() - 1])
            })
            .unwrap_or(value);
        values.insert(key.to_string(), value.replace("\\n", "\n"));
    }
    Ok(values)
}

impl Settings {
    pub fn load(project_root: &Path) -> Result<Self, String> {
        Ok(Self {
            below: read(&project_root.join(".env"))?,
            above: read(&project_root.join(".env.local"))?,
        })
    }

    /// A non-blank value.
    pub fn get(&self, name: &str) -> Option<String> {
        self.value(name).filter(|value| !value.trim().is_empty())
    }

    /// The value as Fastify's `process.env` holds it, blank or not.
    pub fn value(&self, name: &str) -> Option<String> {
        self.above
            .get(name)
            .cloned()
            .or_else(|| std::env::var(name).ok())
            .or_else(|| self.below.get(name).cloned())
    }

    /// A key `.env.local` must not set: Fastify would read it over the value this
    /// server hands it, and the two would part.
    pub fn overridden_locally(&self, name: &str) -> bool {
        self.above.contains_key(name)
    }

    #[cfg(unix)]
    /// A development secret file (`loadLocalSecretFile`): `<root>/Private/<name>`, or the file
    /// `variable` names; owner-only, only `keys`, `KEY=value` lines, `#` comments, one pair of
    /// quotes dropped. A production server reads its environment only.
    pub fn secret_file(
        &self,
        project_root: &Path,
        variable: &str,
        name: &str,
        keys: &[&str],
        error: &str,
    ) -> Result<HashMap<String, String>, String> {
        if self.get("NODE_ENV").as_deref() == Some("production") {
            return Ok(HashMap::new());
        }
        let file = self.value(variable).map_or_else(
            || project_root.join("Private").join(name),
            std::path::PathBuf::from,
        );
        let metadata = match std::fs::metadata(&file) {
            Ok(metadata) => metadata,
            Err(failure) if failure.kind() == std::io::ErrorKind::NotFound => {
                return Ok(HashMap::new());
            }
            Err(failure) => return Err(failure.to_string()),
        };
        if !metadata.is_file()
            || std::os::unix::fs::PermissionsExt::mode(&metadata.permissions()) & 0o077 != 0
        {
            return Err(format!("{error}_permissions"));
        }
        let text = std::fs::read_to_string(&file).map_err(|failure| failure.to_string())?;
        let mut values = HashMap::new();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let Some((key, raw)) = line.split_once('=').filter(|(key, _)| !key.is_empty()) else {
                return Err(format!("{error}_invalid"));
            };
            let key = key.trim();
            if !keys.contains(&key) {
                return Err(format!("{error}_invalid"));
            }
            let raw = raw.trim();
            let quoted = raw.len() >= 2
                && (raw.starts_with('"') || raw.starts_with('\''))
                && raw.ends_with(&raw[..1]);
            let value = if quoted { &raw[1..raw.len() - 1] } else { raw };
            values
                .entry(key.to_string())
                .or_insert_with(|| value.to_string());
        }
        Ok(values)
    }
}
