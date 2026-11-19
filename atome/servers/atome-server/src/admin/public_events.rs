// `atome_admin public-events` (scripts/public_events_admin.mjs, ported): the public events users
// declared, as the shared base holds them (social/public_events/store.rs).
//   reported            the reported events, most reported first (id, reports, hidden, author, title)
//   restore <event_id>  shows a hidden event again and forgets its reports
//   withdraw <event_id> hides an event (as three reports would)
// The author's own Atome keeps its last status until their next change of the event, which
// projects it again (the vaults are the server's to write, never this tool's).
use super::{Args, cell};
use crate::social::public_events::store::Store;
use crate::vault_router::central::Central;
use serde_json::Value as JsonValue;

const USAGE: &str = "Commands: reported | restore <event_id> | withdraw <event_id>";

// `JSON.parse(row.payload_json).title`, nothing when the payload does not read.
fn title(row: &JsonValue) -> String {
    row["payload_json"]
        .as_str()
        .and_then(|payload| serde_json::from_str::<JsonValue>(payload).ok())
        .map_or_else(String::new, |payload| cell(payload.get("title")))
}

pub(super) async fn run(command: &str, args: &Args, central: Central) -> Result<(), String> {
    let store = Store::new(central);
    match command {
        "reported" => {
            for row in store.reported().await? {
                let hidden = match cell(row.get("hidden_at")) {
                    hidden if hidden.is_empty() => "visible".to_string(),
                    hidden => format!("hidden={hidden}"),
                };
                println!(
                    "{}",
                    [
                        cell(row.get("event_id")),
                        format!("reports={}", cell(row.get("reports"))),
                        hidden,
                        cell(row.get("author_id")),
                        cell(row.get("author_name")),
                        title(&row),
                    ]
                    .join("\t")
                );
            }
        }
        "restore" | "withdraw" => {
            let event = args
                .word(0)
                .ok_or_else(|| format!("Usage: {command} <event_id>"))?;
            if store.series(event).await?.is_none() {
                return Err(format!("No public event {event}."));
            }
            if command == "restore" {
                store.restore(event).await?;
            } else {
                store.hide(event).await?;
            }
            println!("{command}: {event}");
        }
        _ => return Err(USAGE.into()),
    }
    Ok(())
}
