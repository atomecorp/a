//! The operator's tools on the server (src/admin), the port of the retired Node scripts that read
//! the Fastify modules. Run from the project root with the service environment loaded:
//!
//!     set -a; . /etc/squirrel/squirrel.env; set +a; target/release/atome_admin <group> <command>
//!
//! Groups and commands:
//!   roles list [--role admin] | show <account> | grant <role> <account> | revoke <role> <account>
//!         <account>: --handle <h> | --phone <+33…> | <principal>
//!   public-events reported | restore <event_id> | withdraw <event_id>
//!   ai-seats list | find --phone <n> | grant|revoke|unblock <principal>|--phone <n> | close | open
//!   server-identity ensure --env-file <file> --identity-dir <dir>
//!                 | backup --env-file <file> --backup-dir <dir>
//!                 | generate [--output <dir>]
//! `--db <file>` (after the command) reads another copy of the central database.
use std::process::ExitCode;

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let items: Vec<String> = std::env::args().skip(1).collect();
    let outcome = match std::env::current_dir() {
        Ok(project) => atome_server::admin::run(&items, &project).await,
        Err(error) => Err(error.to_string()),
    };
    match outcome {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
