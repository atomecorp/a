//! The team's tool for what the people send it (R-210): the reports filed from the apps or by the
//! assistant, the feature requests and the Atome contact's thread, all in the central database's
//! `team_reports` table (atome_server::team_reports). Run on the server from the project root:
//!
//!     target/release/team_reports <command>
//!
//! Commands:
//!   list [--open] [--since YYYY-MM-DD] [--thread atome|report]   one line per message, oldest first
//!   show <id>…                         the whole row
//!   fetch <id> [--to <dir>]            the message's files copied to <dir> (default temp/team_reports/<id>)
//!   classify <id>… --kind bug|request|note
//!   answer <id> --text "<reply>"       the team's reply, in the person's Atome thread
//!   resolve <id>… --note "<cause → fix>" [--fixed-in <version>]
//!                                      the person sees « corrigé » (thread) or « fixed » (Réglages › Avancé)
//!   purge <id>…                        the message's files deleted, their names kept
//!   requests [--pending|--roadmap]     the feature requests, their review and Roadmap state
//!   roadmap <id>… --state planned|in_progress|done
//!   import                             the report files of logs/bug_reports read into the table
//! `--db <file>` reads another copy of the database.
use atome_server::settings::Settings;
use atome_server::team_reports::{self, ATOME_THREAD, KINDS, attachments};
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

struct Args {
    command: String,
    ids: Vec<String>,
    options: Vec<(String, String)>,
    flags: Vec<String>,
}

const VALUED: [&str; 9] = [
    "--since",
    "--thread",
    "--to",
    "--kind",
    "--text",
    "--note",
    "--fixed-in",
    "--state",
    "--db",
];

fn parse() -> Args {
    // The command is the first word that is not an option: `--db <file>` may come before it.
    let mut items = std::env::args().skip(1);
    let (mut ids, mut options, mut flags) = (Vec::new(), Vec::new(), Vec::<String>::new());
    while let Some(item) = items.next() {
        if VALUED.contains(&item.as_str()) {
            options.push((item, items.next().unwrap_or_default()));
        } else if item.starts_with("--") {
            flags.push(item);
        } else {
            ids.push(item);
        }
    }
    let command = if ids.is_empty() {
        String::new()
    } else {
        ids.remove(0)
    };
    Args {
        command,
        ids,
        options,
        flags,
    }
}

impl Args {
    fn option(&self, name: &str) -> Option<&str> {
        self.options
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }
    fn flag(&self, name: &str) -> bool {
        self.flags.iter().any(|flag| flag == name)
    }
    fn ids(&self) -> Result<&[String], String> {
        if self.ids.is_empty() {
            Err("an id is required".into())
        } else {
            Ok(&self.ids)
        }
    }
}

fn now_iso() -> String {
    atome_js_values::iso(atome_js_values::dates::now_ms())
}

fn operator() -> String {
    format!(
        "script:{}",
        std::env::var("USER").unwrap_or_else(|_| "operator".into())
    )
}

fn text(body: &JsonValue, key: &str) -> String {
    body.get(key)
        .and_then(JsonValue::as_str)
        .unwrap_or_default()
        .to_string()
}

fn line(principal: Option<&str>, body: &JsonValue) -> String {
    let words = [text(body, "text"), text(body, "title")]
        .into_iter()
        .find(|t| !t.is_empty())
        .unwrap_or_default();
    let files = body
        .get("attachments")
        .and_then(JsonValue::as_array)
        .map_or(0, Vec::len);
    [
        text(body, "created_iso").chars().take(16).collect(),
        text(body, "id"),
        body.get("thread")
            .and_then(JsonValue::as_str)
            .unwrap_or("report")
            .to_string(),
        body.get("author")
            .and_then(JsonValue::as_str)
            .unwrap_or("person")
            .to_string(),
        body.get("kind")
            .and_then(JsonValue::as_str)
            .unwrap_or("-")
            .to_string(),
        if body.pointer("/resolution/resolved_at").is_some() {
            "fixed".into()
        } else {
            "open".into()
        },
        principal.unwrap_or("-").to_string(),
        if files > 0 {
            format!("📎{files}")
        } else {
            String::new()
        },
        words.replace('\n', " ").chars().take(120).collect(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join("  ")
}

fn row(db: &Connection, id: &str) -> Result<(Option<String>, JsonValue), String> {
    team_reports::get(db, id)?.ok_or_else(|| format!("no message {id}"))
}

fn versions(project: &Path) -> String {
    let read = |file: &str| {
        std::fs::read_to_string(project.join(file))
            .map(|v| v.trim().to_string())
            .unwrap_or_default()
    };
    format!(
        "atome {} · eVe {}",
        read("atome/version.txt"),
        read("eVe/version.txt")
    )
}

fn run(args: &Args, db: &Connection, project: &Path) -> Result<(), String> {
    let root = team_reports::root(project);
    match args.command.as_str() {
        "import" => println!(
            "{} report files read into team_reports",
            team_reports::import_files(db, project)?
        ),
        "list" => {
            for (principal, body) in team_reports::all(
                db,
                args.option("--since").unwrap_or(""),
                args.flag("--open"),
            )? {
                if args.option("--thread").is_some_and(|thread| {
                    body.get("thread")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("report")
                        != thread
                }) {
                    continue;
                }
                println!("{}", line(principal.as_deref(), &body));
            }
        }
        "show" => {
            for id in args.ids()? {
                let (principal, body) = row(db, id)?;
                println!(
                    "{}",
                    serde_json::to_string_pretty(
                        &json!({ "principal_id": principal, "body": body })
                    )
                    .unwrap_or_default()
                );
            }
        }
        "fetch" => {
            let id = &args.ids()?[0];
            let (_, body) = row(db, id)?;
            let to = args.option("--to").map_or_else(
                || project.join("temp").join("team_reports").join(id),
                PathBuf::from,
            );
            std::fs::create_dir_all(&to).map_err(|error| error.to_string())?;
            for file in body
                .get("attachments")
                .and_then(JsonValue::as_array)
                .into_iter()
                .flatten()
            {
                let (file_id, name) = (text(file, "id"), text(file, "name"));
                let Some(source) = attachments::path(&root, id, &file_id) else {
                    println!("{file_id}  {name}  purged");
                    continue;
                };
                let safe: String = name
                    .chars()
                    .map(|c| if c == '/' || c == '\\' { '_' } else { c })
                    .collect();
                let target = to.join(format!("{file_id}_{safe}"));
                std::fs::copy(&source, &target).map_err(|error| error.to_string())?;
                println!("{}", target.display());
            }
        }
        "classify" => {
            let kind = args
                .option("--kind")
                .filter(|kind| KINDS.contains(kind))
                .ok_or("--kind bug|request|note is required")?;
            for id in args.ids()? {
                let (_, mut body) = row(db, id)?;
                body["kind"] = json!(kind);
                team_reports::save(db, &body)?;
                println!("{id} {kind}");
            }
        }
        "answer" => {
            let id = &args.ids()?[0];
            let reply = args
                .option("--text")
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .ok_or("--text is required")?;
            let (principal, body) = row(db, id)?;
            let principal = principal.ok_or("the message has no account to answer")?;
            let at = now_iso();
            let answer_id = format!("team_{}", uuid::Uuid::new_v4().simple());
            team_reports::insert(
                db,
                Some(&principal),
                &json!({ "id": answer_id, "thread": ATOME_THREAD, "author": "team",
                "created_iso": at, "text": reply, "reply_to": body.get("id"), "by": operator(), "attachments": [] }),
            )?;
            println!("{answer_id}");
        }
        "resolve" => {
            let note = args
                .option("--note")
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .ok_or("--note is required")?;
            let fixed_in = args
                .option("--fixed-in")
                .map_or_else(|| versions(project), str::to_string);
            for id in args.ids()? {
                let (_, mut body) = row(db, id)?;
                body["resolution"] = json!({ "resolved_at": now_iso(), "note": note, "fixed_in": fixed_in, "by": operator() });
                team_reports::save(db, &body)?;
                println!("{id} resolved");
            }
        }
        "purge" => {
            for id in args.ids()? {
                let (_, mut body) = row(db, id)?;
                let had = attachments::purge(&root, id)?;
                let at = now_iso();
                if let Some(files) = body
                    .get_mut("attachments")
                    .and_then(JsonValue::as_array_mut)
                {
                    for file in files
                        .iter_mut()
                        .filter(|file| file.get("purged_at").is_none())
                    {
                        file["purged_at"] = json!(at);
                    }
                }
                team_reports::save(db, &body)?;
                println!("{id} {}", if had { "purged" } else { "had no files" });
            }
        }
        "requests" => {
            for body in team_reports::of_kind(db, "request")? {
                let review = body
                    .pointer("/review/state")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("pending");
                let roadmap = body
                    .pointer("/roadmap/state")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("-");
                if (args.flag("--pending") && review != "pending")
                    || (args.flag("--roadmap") && review != "validated")
                {
                    continue;
                }
                println!(
                    "{}  {review}  {roadmap}  {}",
                    line(None, &body),
                    body.pointer("/review/reason")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("")
                );
            }
        }
        "roadmap" => {
            let state = args
                .option("--state")
                .filter(|s| ["planned", "in_progress", "done"].contains(s))
                .ok_or("--state planned|in_progress|done is required")?;
            for id in args.ids()? {
                let (_, mut body) = row(db, id)?;
                if body.pointer("/review/state") != Some(&json!("validated")) {
                    return Err(format!("{id} is not a validated request"));
                }
                let (at, by) = (now_iso(), operator());
                body["roadmap"] = json!({ "state": state, "at": at, "by": by });
                let mut steps = body
                    .get("steps")
                    .and_then(JsonValue::as_array)
                    .cloned()
                    .unwrap_or_default();
                steps.push(json!({ "at": at, "by": by, "roadmap": state }));
                body["steps"] = JsonValue::Array(steps);
                team_reports::save(db, &body)?;
                println!("{id} {state}");
            }
        }
        other => {
            return Err(format!(
                "unknown command {other:?}: list, show, fetch, classify, answer, resolve, purge, requests, roadmap, import"
            ));
        }
    }
    Ok(())
}

fn main() -> ExitCode {
    let args = parse();
    let outcome = (|| -> Result<(), String> {
        let project = std::env::current_dir().map_err(|error| error.to_string())?;
        let path = match args.option("--db") {
            Some(path) => PathBuf::from(path),
            None => Settings::load(&project)?.central_database(&project)?,
        };
        let db = Connection::open(&path).map_err(|error| format!("{}: {error}", path.display()))?;
        db.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| error.to_string())?;
        for statement in team_reports::TABLES {
            db.execute_batch(statement)
                .map_err(|error| error.to_string())?;
        }
        run(&args, &db, &project)
    })();
    match outcome {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("team_reports: {error}");
            ExitCode::FAILURE
        }
    }
}
