// `atome_admin roles` (scripts/account_roles_admin.mjs, ported): the roles an account holds, given
// and taken back on the server only (ws_api/sources/account_roles.rs). The account is named by its
// handle (`--handle jean-4821`), its verified phone (`--phone +33…`) or its principal id.
//   list [--role admin]           the accounts holding a role, first granted first
//   show <account>                an account's roles
//   grant <role> <account>        gives the role (admin: validates the feature requests)
//   revoke <role> <account>       takes it back
use super::{Args, account_by_phone, cell, minute, operator};
use crate::auth::handles;
use crate::vault_router::central::Central;
use crate::ws_api::sources::account_roles::{ROLES, grant, holders, list, revoke};
use rusqlite::{Connection, OptionalExtension};
use serde_json::json;

const USAGE: &str = "Commands: list [--role admin] | show <account> | grant <role> <account> | revoke <role> <account>; <account>: --handle <h> | --phone <+33…> | <principal>";

// The account the options or the word name (`resolvePrincipal`).
fn account(db: &Connection, args: &Args, principal: Option<&str>) -> Result<String, String> {
    if let Some(handle) = args.option("--handle") {
        return handles::resolve(db, Some(&json!(handle)))?
            .ok_or_else(|| format!("No account with the handle {handle}."));
    }
    if let Some(phone) = args.option("--phone") {
        return account_by_phone(db, phone)?
            .and_then(|account| account["user_id"].as_str().map(str::to_string))
            .ok_or_else(|| format!("No active account for {phone}."));
    }
    let principal = principal
        .ok_or("An account is required: --handle <h>, --phone <+33…> or a principal id.")?;
    let user = db
        .query_row(
            "SELECT atome_type FROM atomes WHERE atome_id = ? AND deleted_at IS NULL",
            [principal],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .flatten();
    if user.as_deref() == Some("user") {
        Ok(principal.to_string())
    } else {
        Err(format!("No account {principal}."))
    }
}

fn handle_of(db: &Connection, principal: &str) -> Result<String, String> {
    Ok(handles::of(db, principal)?
        .filter(|handle| !handle.is_empty())
        .unwrap_or_else(|| "-".into()))
}

// `<principal>  <handle>  roles: a, b` (`-` for none).
fn held(db: &Connection, principal: &str, roles: &[String]) -> Result<String, String> {
    let roles = if roles.is_empty() {
        "-".to_string()
    } else {
        roles.join(", ")
    };
    Ok(format!(
        "{principal}  {}  roles: {roles}",
        handle_of(db, principal)?
    ))
}

fn lines(db: &Connection, command: &str, args: &Args) -> Result<Vec<String>, String> {
    match command {
        "list" => {
            let chosen = args.option("--role").map(|role| vec![role]);
            let mut lines = Vec::new();
            for role in chosen.unwrap_or_else(|| ROLES.to_vec()) {
                for row in holders(db, role)? {
                    let principal = cell(row.get("principal_id"));
                    lines.push(
                        [
                            role.to_string(),
                            principal.clone(),
                            handle_of(db, &principal)?,
                            minute(&row["granted_ms"]),
                            cell(row.get("granted_by")),
                        ]
                        .join("  "),
                    );
                }
            }
            Ok(lines)
        }
        "show" => {
            let principal = account(db, args, args.word(0))?;
            Ok(vec![held(db, &principal, &list(db, &principal)?)?])
        }
        "grant" | "revoke" => {
            let role = args
                .word(0)
                .filter(|role| ROLES.contains(role))
                .ok_or_else(|| format!("A role is required: {}.", ROLES.join(", ")))?;
            let principal = account(db, args, args.word(1))?;
            let roles = if command == "grant" {
                grant(
                    db,
                    &principal,
                    role,
                    &operator(),
                    atome_js_values::dates::now_ms(),
                )?
            } else {
                revoke(db, &principal, role)?
            };
            Ok(vec![held(db, &principal, &roles)?])
        }
        _ => Err(USAGE.into()),
    }
}

pub(super) async fn run(command: &str, args: &Args, central: &Central) -> Result<(), String> {
    let (command, args) = (command.to_string(), args.clone());
    for line in central
        .transaction(move |db| lines(db, &command, &args))
        .await?
    {
        println!("{line}");
    }
    Ok(())
}
