// `atome_admin ai-seats` (scripts/ai_shared_key_admin.mjs, ported): the shared OpenAI test seats
// (providers/shared_grant.rs), with the service environment's `OPENAI_SHARED_*` limits.
//   list                                  seats, phone, state and consumption
//   find --phone <+33...>                 resolve a phone number to its principal
//   grant|revoke|unblock <principal> | --phone <+33...>
//   close | open                          stop / resume automatic seat claims
use super::console::{self, Record};
use super::{Args, account_by_phone, minute};
use crate::auth::accounts;
use crate::providers::shared_grant::SharedGrant;
use crate::settings::Settings;
use crate::vault_router::central::Central;
use rusqlite::OptionalExtension;
use serde_json::{Value as JsonValue, json};

const USAGE: &str =
    "Usage: list | find --phone <n> | grant|revoke|unblock <principal>|--phone <n> | close | open";

// `resolvePrincipal()`: the account of `--phone`, else the first word as it is.
async fn principal(central: &Central, args: &Args) -> Result<String, String> {
    let Some(phone) = args.option("--phone").map(str::to_string) else {
        return args
            .word(0)
            .map(str::to_string)
            .ok_or_else(|| "A principal id or --phone is required.".into());
    };
    let account = central
        .transaction({
            let phone = phone.clone();
            move |db| account_by_phone(db, &phone)
        })
        .await?;
    account
        .and_then(|account| account["user_id"].as_str().map(str::to_string))
        .ok_or_else(|| format!("No active account for {phone}."))
}

// `describe(row)`: a seat with its account's verified phone and creation date.
async fn describe(central: &Central, rows: Vec<JsonValue>) -> Result<Vec<Record>, String> {
    central
        .transaction(move |db| {
            rows.iter()
                .map(|row| {
                    let principal = row["principal_id"].as_str().unwrap_or_default();
                    let created = db
                        .query_row(
                            "SELECT created_at FROM atomes WHERE atome_id = ?",
                            [principal],
                            |found| found.get::<_, Option<String>>(0),
                        )
                        .optional()
                        .map_err(|e| e.to_string())?
                        .flatten()
                        .filter(|text| !text.is_empty());
                    Ok(vec![
                        ("principal", row["principal_id"].clone()),
                        ("phone", json!(accounts::phone_of(db, principal)?)),
                        ("state", row["state"].clone()),
                        ("by", row["granted_by"].clone()),
                        ("claimed", json!(minute(&row["claimed_ms"]))),
                        ("account_created", json!(created)),
                        ("operations", row["operations"].clone()),
                        ("tokens", row["tokens"].clone()),
                        ("tokens_today", row["tokens_today"].clone()),
                        ("voice_sessions", row["realtime"].clone()),
                    ])
                })
                .collect()
        })
        .await
}

pub(super) async fn run(
    command: &str,
    args: &Args,
    settings: &Settings,
    central: Central,
) -> Result<(), String> {
    let grant = SharedGrant::load(settings, central.clone());
    let limits = grant.limits()?;
    match command {
        "list" => {
            let rows = grant.list().await?;
            println!(
                "active seats {}/{}, auto enrollment {}",
                grant.active_count().await?,
                limits.seats,
                grant.auto_enrollment().await?
            );
            println!(
                "daily limits per seat: {} operations, {} tokens, {} voice sessions",
                limits.operations, limits.tokens, limits.realtime
            );
            println!("{}", console::table(&describe(&central, rows).await?));
        }
        "find" => {
            let phone = args
                .option("--phone")
                .ok_or("--phone is required.")?
                .to_string();
            let account = central
                .transaction(move |db| account_by_phone(db, &phone))
                .await?;
            println!(
                "{}",
                account.map_or_else(
                    || "No active account.".to_string(),
                    |account| console::object(&[
                        ("principal", account["user_id"].clone()),
                        ("created_at", account["created_at"].clone()),
                    ])
                )
            );
        }
        "grant" | "revoke" | "unblock" => {
            let principal = principal(&central, args).await?;
            let seat = match command {
                "grant" => grant.grant(&principal).await?,
                "revoke" => grant.revoke(&principal).await?,
                _ => {
                    grant.unblock(&principal).await?;
                    None
                }
            };
            let Some(mut seat) = seat else {
                println!("{principal} unblocked.");
                return Ok(());
            };
            for unmetered in ["operations", "tokens", "tokens_today", "realtime"] {
                seat[unmetered] = JsonValue::Null;
            }
            let described = describe(&central, vec![seat]).await?;
            println!("{}", console::object(&described[0]));
        }
        "close" | "open" => {
            grant.set_auto_enrollment(command == "open").await?;
            println!("auto enrollment {}", grant.auto_enrollment().await?);
        }
        _ => return Err(USAGE.into()),
    }
    Ok(())
}
