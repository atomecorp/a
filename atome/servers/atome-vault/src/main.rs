// `atome-vault <principal> <vault directory>`: serves that person's vault on its
// standard input and output (a socket the supervisor holds the other end of).
use atome_store::vault::{Vault, open_database};
use std::os::unix::fs::DirBuilderExt;
use std::path::Path;
use std::process::ExitCode;

fn run(principal: &str, directory: &Path) -> Result<(), String> {
    let files = directory.join("files");
    std::fs::DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&files)
        .map_err(|e| e.to_string())?;
    // Linux: confined to its own directory before it opens anything there.
    #[cfg(target_os = "linux")]
    atome_confine::confine_vault(directory)?;
    let database = directory.join("vault.db");
    let db = open_database(&database)?;
    // SQLite's temporary files (a large sort) would go to /var/tmp or /tmp, which
    // the confinement closes: they stay in memory, as every reply does.
    db.pragma_update(None, "temp_store", "MEMORY")
        .map_err(|e| e.to_string())?;
    let vault = Vault {
        principal_id: principal,
        database_path: &database.to_string_lossy(),
        file_root: &files.to_string_lossy(),
    };
    atome_vault::serve(
        &vault,
        &db,
        directory,
        &mut std::io::stdin().lock(),
        &mut std::io::stdout().lock(),
    )
    .map_err(|e| e.to_string())
}

fn main() -> ExitCode {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let [principal, directory] = arguments.as_slice() else {
        eprintln!("vault_process_configuration_invalid");
        return ExitCode::FAILURE;
    };
    match run(principal, Path::new(directory)) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
