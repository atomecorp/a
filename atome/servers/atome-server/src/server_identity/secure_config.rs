// The server's secrets and identity in its environment file (scripts/server_secure_config.js,
// ported; run by scripts/server_update.js through `atome_admin server-identity`): JWT_SECRET and
// COOKIE_SECRET of at least 32 characters, else 32 random bytes in hex; the identity key pair named
// by SERVER_PRIVATE_KEY_PATH / SERVER_PUBLIC_KEY_PATH (read from the project root), else the pair
// of the identity directory, made there when it has none and adopted when it has one; SERVER_ID
// and SERVER_NAME kept, else given. The file is written owner-only (0600), the private key 0600,
// the public key 0644, the identity directory 0700.
use super::{KeyPairPem, create_key_pair, create_server_id, validate_key_pair};
use ring::rand::{SecureRandom, SystemRandom};
use std::fs::{self, DirBuilder, OpenOptions, Permissions};
use std::io::Write;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

/// The identity the environment file names after `ensure`.
pub struct Identity {
    pub private_key_path: PathBuf,
    pub public_key_path: PathBuf,
    pub fingerprint: String,
    pub generated: bool,
}

// `content.split(/\r?\n/)`.
fn lines(content: &str) -> Vec<&str> {
    content
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}

/// `readEnvValue(content, key)`: the value of the first `KEY=` line, trimmed, else empty.
pub fn read_env_value(content: &str, key: &str) -> String {
    let head = format!("{key}=");
    lines(content)
        .into_iter()
        .find_map(|line| line.strip_prefix(&head))
        .map_or_else(String::new, |value| value.trim().to_string())
}

/// `upsertEnvValue(content, key, value)`: every `KEY=` line replaced, else the pair appended
/// after a blank line; the text ends with one newline.
pub fn upsert_env_value(content: &str, key: &str, value: &str) -> String {
    let head = format!("{key}=");
    let mut replaced = false;
    let mut next: Vec<String> = lines(content)
        .into_iter()
        .map(|line| {
            if line.starts_with(&head) {
                replaced = true;
                format!("{key}={value}")
            } else {
                line.to_string()
            }
        })
        .collect();
    if !replaced {
        if next.last().is_some_and(|last| !last.is_empty()) {
            next.push(String::new());
        }
        next.push(format!("{key}={value}"));
    }
    format!("{}\n", next.join("\n").trim_end_matches('\n'))
}

fn chmod(path: &Path, mode: u32) -> Result<(), String> {
    fs::set_permissions(path, Permissions::from_mode(mode))
        .map_err(|e| format!("{}: {e}", path.display()))
}

fn read(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))
}

// The environment file's text, empty when it does not exist yet.
fn read_env(env_file: &Path) -> Result<String, String> {
    if env_file.exists() {
        read(env_file)
    } else {
        Ok(String::new())
    }
}

// `writeSecureEnv`: written (created 0600), then 0600 whatever it was.
fn write_env(env_file: &Path, content: &str) -> Result<(), String> {
    OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(env_file)
        .and_then(|mut file| file.write_all(content.as_bytes()))
        .map_err(|e| format!("{}: {e}", env_file.display()))?;
    chmod(env_file, 0o600)
}

// `ensureEnvSecret`: a secret shorter than 32 characters or left at its example is replaced.
fn ensure_secret(env_file: &Path, key: &str, log: &mut dyn FnMut(String)) -> Result<(), String> {
    let content = read_env(env_file)?;
    let current = read_env_value(&content, key);
    let weak = current.encode_utf16().count() < 32
        || current.contains("change_me")
        || current.contains("change_in_production");
    if !weak {
        log(format!("{key} is configured"));
        return Ok(());
    }
    let mut bytes = [0u8; 32];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| "server_secret_random_failed".to_string())?;
    let secret: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    write_env(env_file, &upsert_env_value(&content, key, &secret))?;
    log(format!("{key} generated in {}", env_file.display()));
    Ok(())
}

// `readAndValidateIdentity`: both files there and belonging together; their fingerprint.
fn validated(private: &Path, public: &Path) -> Result<String, String> {
    if !private.exists() || !public.exists() {
        return Err("server_identity_key_files_missing".into());
    }
    validate_key_pair(&read(private)?, &read(public)?)
}

// A new file holding `text`, refused when the file exists (`flag: 'wx'`).
fn create(path: &Path, text: &str, mode: u32) -> Result<(), String> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(mode)
        .open(path)
        .and_then(|mut file| file.write_all(text.as_bytes()))
        .map_err(|e| format!("{}: {e}", path.display()))
}

// `writeIdentityPair`: the directory 0700, the pair written when it is not there yet.
fn write_pair(identity_dir: &Path, pair: &KeyPairPem) -> Result<(PathBuf, PathBuf), String> {
    DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(identity_dir)
        .map_err(|e| format!("{}: {e}", identity_dir.display()))?;
    chmod(identity_dir, 0o700)?;
    let (private, public) = (
        identity_dir.join("server.key"),
        identity_dir.join("server.pub"),
    );
    if private.exists() != public.exists() {
        return Err("server_identity_key_pair_incomplete".into());
    }
    if !private.exists() {
        create(&private, &pair.private, 0o600)?;
        if let Err(error) = create(&public, &pair.public, 0o644) {
            fs::remove_file(&private).map_err(|e| format!("{}: {e}", private.display()))?;
            return Err(error);
        }
    }
    chmod(&private, 0o600)?;
    chmod(&public, 0o644)?;
    Ok((private, public))
}

// `ensureIdentityMetadata`: SERVER_ID and SERVER_NAME kept, else given; written when that changed.
fn ensure_metadata(env_file: &Path, content: &str) -> Result<String, String> {
    let id = match read_env_value(content, "SERVER_ID") {
        id if id.is_empty() => create_server_id()?,
        id => id,
    };
    let name = match read_env_value(content, "SERVER_NAME") {
        name if name.is_empty() => "Squirrel Server".to_string(),
        name => name,
    };
    let next = upsert_env_value(
        &upsert_env_value(content, "SERVER_ID", &id),
        "SERVER_NAME",
        &name,
    );
    if next != content {
        write_env(env_file, &next)?;
    }
    Ok(next)
}

/// `ensureServerIdentity`: the configured pair checked, else the identity directory's adopted or made.
pub fn ensure_server_identity(
    env_file: &Path,
    identity_dir: &Path,
    project_root: &Path,
    log: &mut dyn FnMut(String),
) -> Result<Identity, String> {
    let content = read_env(env_file)?;
    let configured_private = read_env_value(&content, "SERVER_PRIVATE_KEY_PATH");
    let configured_public = read_env_value(&content, "SERVER_PUBLIC_KEY_PATH");
    if configured_private.is_empty() != configured_public.is_empty() {
        return Err("server_identity_key_paths_incomplete".into());
    }
    if !configured_private.is_empty() {
        let private = project_root.join(&configured_private);
        let public = project_root.join(&configured_public);
        let fingerprint = validated(&private, &public)?;
        chmod(&private, 0o600)?;
        chmod(&public, 0o644)?;
        ensure_metadata(env_file, &content)?;
        log(format!(
            "Server identity configured fingerprint={fingerprint}"
        ));
        return Ok(Identity {
            private_key_path: private,
            public_key_path: public,
            fingerprint,
            generated: false,
        });
    }
    let (private, public) = (
        identity_dir.join("server.key"),
        identity_dir.join("server.pub"),
    );
    if private.exists() != public.exists() {
        return Err("server_identity_key_pair_incomplete".into());
    }
    let generated = !private.exists();
    let pair = if generated {
        create_key_pair()?
    } else {
        KeyPairPem {
            private: read(&private)?,
            public: read(&public)?,
        }
    };
    let (private, public) = write_pair(identity_dir, &pair)?;
    let fingerprint = validated(&private, &public)?;
    let next = ensure_metadata(env_file, &content)?;
    let next = upsert_env_value(
        &next,
        "SERVER_PRIVATE_KEY_PATH",
        &private.display().to_string(),
    );
    let next = upsert_env_value(
        &next,
        "SERVER_PUBLIC_KEY_PATH",
        &public.display().to_string(),
    );
    write_env(env_file, &next)?;
    let how = if generated { "generated" } else { "adopted" };
    log(format!("Server identity {how} fingerprint={fingerprint}"));
    Ok(Identity {
        private_key_path: private,
        public_key_path: public,
        fingerprint,
        generated,
    })
}

/// `ensureProductionSecureConfig`: the two secrets, then the identity.
pub fn ensure_production_secure_config(
    env_file: &Path,
    identity_dir: &Path,
    project_root: &Path,
    log: &mut dyn FnMut(String),
) -> Result<Identity, String> {
    ensure_secret(env_file, "JWT_SECRET", log)?;
    ensure_secret(env_file, "COOKIE_SECRET", log)?;
    ensure_server_identity(env_file, identity_dir, project_root, log)
}

/// `backupServerIdentity`: the checked pair copied into `<backup_dir>/server-identity`.
pub fn backup_server_identity(
    env_file: &Path,
    backup_dir: &Path,
    project_root: &Path,
) -> Result<(), String> {
    let content = read(env_file)?;
    let private = project_root.join(read_env_value(&content, "SERVER_PRIVATE_KEY_PATH"));
    let public = project_root.join(read_env_value(&content, "SERVER_PUBLIC_KEY_PATH"));
    validated(&private, &public)?;
    let target = backup_dir.join("server-identity");
    DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&target)
        .map_err(|e| format!("{}: {e}", target.display()))?;
    for (source, name, mode) in [
        (&private, "server.key", 0o600),
        (&public, "server.pub", 0o644),
    ] {
        let copy = target.join(name);
        fs::copy(source, &copy).map_err(|e| format!("{}: {e}", source.display()))?;
        chmod(&copy, mode)?;
    }
    Ok(())
}
