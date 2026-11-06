// On Linux every vault process runs under an account of its own, so one person's
// vault cannot open another's files even outside its Landlock rules. The
// supervisor (root) gives each vault directory a numeric uid and gid, kept in
// `<vault root>/.vault_accounts` (`<directory> <uid>` per line, appended, never
// reused), hands the vault's files to it and starts the process under it.
use std::collections::HashMap;
use std::io::Write;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};

// systemd leaves 1879048192–2147352575 to no one (docs/UIDS-GIDS.md): above the
// container range, below the foreign range.
const FIRST_ACCOUNT: u32 = 1_900_000_000;
const LAST_ACCOUNT: u32 = 2_147_352_575;
// What the vault process writes: its database files and its file root.
const VAULT_FILES: [&str; 4] = [
    "vault.db",
    "vault.db-wal",
    "vault.db-shm",
    "vault.db-journal",
];

pub struct VaultAccounts {
    registry: PathBuf,
    accounts: HashMap<String, u32>,
    next: u32,
}

impl VaultAccounts {
    pub fn open(root: &Path) -> Result<Self, String> {
        if !rustix::process::geteuid().is_root() {
            return Err("vault_confinement_requires_root".into());
        }
        // Each vault reaches its own directory by name; none lists the others.
        std::fs::set_permissions(root, std::fs::Permissions::from_mode(0o711))
            .map_err(|e| e.to_string())?;
        // ...through folders every account may cross (their modes are the host's, never changed here).
        for folder in root.ancestors().skip(1) {
            let mode = std::fs::metadata(folder).map_err(|e| e.to_string())?.mode();
            if mode & 0o001 == 0 {
                return Err(format!("vault_root_not_traversable:{}", folder.display()));
            }
        }
        let registry = root.join(".vault_accounts");
        let text = match std::fs::read_to_string(&registry) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(error) => return Err(error.to_string()),
        };
        let mut accounts = HashMap::new();
        for line in text.lines().filter(|line| !line.is_empty()) {
            let (directory, uid) = line.split_once(' ').ok_or("vault_accounts_invalid")?;
            let uid: u32 = uid.parse().map_err(|_| "vault_accounts_invalid")?;
            accounts.insert(directory.to_string(), uid);
        }
        let next = accounts
            .values()
            .max()
            .map_or(FIRST_ACCOUNT, |last| last + 1);
        Ok(Self {
            registry,
            accounts,
            next,
        })
    }

    // The account of the vault directory named `directory`, given on its first start.
    pub fn account(&mut self, directory: &str) -> Result<u32, String> {
        if let Some(uid) = self.accounts.get(directory) {
            return Ok(*uid);
        }
        if self.next > LAST_ACCOUNT {
            return Err("vault_accounts_exhausted".into());
        }
        let uid = self.next;
        let mut registry = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .mode(0o600)
            .open(&self.registry)
            .map_err(|e| e.to_string())?;
        registry
            .write_all(format!("{directory} {uid}\n").as_bytes())
            .map_err(|e| e.to_string())?;
        registry.sync_all().map_err(|e| e.to_string())?;
        self.accounts.insert(directory.to_string(), uid);
        self.next = uid + 1;
        Ok(uid)
    }
}

// The vault directory, its database files and its file root belong to `uid`
// (a vault created before this, by Fastify's Node child, belonged to root).
// Links are changed, never followed; Fastify's own folders there stay root's.
pub fn hand_over(directory: &Path, uid: u32) -> Result<(), String> {
    let error = |e: std::io::Error| format!("vault_hand_over_failed:{e}");
    if std::fs::symlink_metadata(directory).map_err(error)?.uid() == uid {
        return Ok(());
    }
    let mut paths = vec![directory.to_path_buf()];
    paths.extend(VAULT_FILES.iter().map(|name| directory.join(name)));
    let mut pending = vec![directory.join("files")];
    while let Some(path) = pending.pop() {
        let Ok(metadata) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.is_dir() {
            for entry in std::fs::read_dir(&path).map_err(error)? {
                pending.push(entry.map_err(error)?.path());
            }
        }
        paths.push(path);
    }
    for path in paths {
        match std::os::unix::fs::lchown(&path, Some(uid), Some(uid)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(error(e)),
        }
    }
    Ok(())
}
