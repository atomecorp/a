// `atome_admin server-identity` (scripts/server_secure_config.js and generate-server-keys.js,
// ported; the owner is server_identity/secure_config.rs):
//   ensure --env-file F --identity-dir D   the secrets and the identity pair of the environment file
//   backup --env-file F --backup-dir D     the pair copied into D/server-identity
//   generate [--output D]                  a new pair in D (default server/certificates), asked for
//                                          its server ID and name, and the lines to configure it
use super::Args;
use crate::server_identity::secure_config::{
    backup_server_identity, ensure_production_secure_config,
};
use crate::server_identity::{create_key_pair, create_server_id, validate_key_pair};
use std::io::{BufRead, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

const USAGE: &str = "Commands: ensure --env-file <file> --identity-dir <dir> | backup --env-file <file> --backup-dir <dir> | generate [--output <dir>]";
const RULE: &str = "────────────────────────────────────────────────────────────────";

fn required<'a>(args: &'a Args, name: &str) -> Result<&'a str, String> {
    args.option(name)
        .ok_or_else(|| format!("{name} is required."))
}

// `readline.question`: the prompt, then the answer's line (empty at the end of the input).
fn prompt(question: &str) -> Result<String, String> {
    print!("{question}");
    std::io::stdout().flush().map_err(|e| e.to_string())?;
    let mut answer = String::new();
    std::io::stdin()
        .lock()
        .read_line(&mut answer)
        .map_err(|e| e.to_string())?;
    Ok(answer.trim_end_matches(['\n', '\r']).to_string())
}

fn write(path: &Path, text: &str, mode: u32) -> Result<(), String> {
    std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(mode)
        .open(path)
        .and_then(|mut file| file.write_all(text.as_bytes()))
        .map_err(|e| format!("{}: {e}", path.display()))
}

// generate-server-keys.js `main()`.
fn generate(args: &Args, project: &Path) -> Result<(), String> {
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║         SQUIRREL SERVER KEY GENERATOR                        ║");
    println!("║                                                              ║");
    println!("║  This tool generates RSA keys for server verification.      ║");
    println!("║  Keys allow clients to verify server authenticity.          ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    let output = args.option("--output").map_or_else(
        || project.join("server").join("certificates"),
        |output| project.join(output),
    );
    let (private_path, public_path) = (output.join("server.key"), output.join("server.pub"));
    if private_path.exists() || public_path.exists() {
        println!("\n⚠️  Warning: Keys already exist in output directory!");
        println!("   Directory: {}", output.display());
        println!();
        if prompt("Do you want to overwrite existing keys? (yes/no): ")?.to_lowercase() != "yes" {
            println!("\n❌ Operation cancelled. Existing keys preserved.");
            return Ok(());
        }
    }
    let default_id = create_server_id()?;
    println!("\n📝 Server Configuration");
    println!("────────────────────────────────────────");
    let server_id = match prompt(&format!("Enter server ID [{default_id}]: "))? {
        id if id.is_empty() => default_id,
        id => id,
    };
    let server_name = match prompt("Enter server name [Squirrel Server]: ")? {
        name if name.is_empty() => "Squirrel Server".to_string(),
        name => name,
    };
    println!("\n🔐 Generating server identity RSA key pair...\n");
    let pair = create_key_pair()?;
    let fingerprint = validate_key_pair(&pair.private, &pair.public)?;
    std::fs::create_dir_all(&output).map_err(|e| format!("{}: {e}", output.display()))?;
    write(
        &output.join(".gitkeep"),
        "# This file keeps the directory in Git\n",
        0o644,
    )?;
    write(&private_path, &pair.private, 0o600)?;
    write(&public_path, &pair.public, 0o644)?;
    for line in [
        "\n✅ Keys generated successfully!".to_string(),
        RULE.to_string(),
        format!("📂 Output directory: {}", output.display()),
        format!("🔑 Private key: {}", private_path.display()),
        format!("🔓 Public key:  {}", public_path.display()),
        String::new(),
        "📋 Server Identity:".to_string(),
        format!("   Server ID:    {server_id}"),
        format!("   Server Name:  {server_name}"),
        format!("   Fingerprint:  {fingerprint}"),
        String::new(),
        RULE.to_string(),
        "📝 Add these lines to your .env file:".to_string(),
        String::new(),
        format!("SERVER_ID={server_id}"),
        format!("SERVER_NAME={server_name}"),
        "SERVER_PRIVATE_KEY_PATH=./server/certificates/server.key".to_string(),
        "SERVER_PUBLIC_KEY_PATH=./server/certificates/server.pub".to_string(),
        String::new(),
        RULE.to_string(),
        "📝 Add this entry to atome/security/trusted_keys.js:".to_string(),
        String::new(),
        format!("    '{server_id}': {{"),
        format!("        name: '{server_name}',"),
        format!("        fingerprint: '{fingerprint}',"),
        format!("        publicKey: `{}`", pair.public.replace('\n', "\\n")),
        "    },".to_string(),
        String::new(),
        RULE.to_string(),
        "⚠️  SECURITY WARNINGS:".to_string(),
        String::new(),
        "   1. NEVER commit server.key to Git".to_string(),
        "   2. Keep server.key secure and backed up".to_string(),
        "   3. server.pub can be shared publicly".to_string(),
        "   4. Add fingerprint to trusted_keys.js for official servers".to_string(),
        "   5. Rotate keys periodically (yearly recommended)".to_string(),
        String::new(),
        RULE.to_string(),
        "✅ Setup complete! Restart your server to load the new keys.".to_string(),
        String::new(),
    ] {
        println!("{line}");
    }
    Ok(())
}

pub(super) fn run(command: &str, args: &Args, project: &Path) -> Result<(), String> {
    match command {
        "ensure" => ensure_production_secure_config(
            &PathBuf::from(required(args, "--env-file")?),
            &PathBuf::from(required(args, "--identity-dir")?),
            project,
            &mut |line| println!("{line}"),
        )
        .map(drop),
        "backup" => backup_server_identity(
            &PathBuf::from(required(args, "--env-file")?),
            &PathBuf::from(required(args, "--backup-dir")?),
            project,
        ),
        "generate" => generate(args, project),
        _ => Err(USAGE.into()),
    }
}
