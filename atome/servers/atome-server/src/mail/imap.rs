// The IMAP client (atome/src/squirrel/mail/node_protocol_clients.js `NodeImapClient`): STARTTLS
// when the transport asks it (offered by CAPABILITY, else refused before any credential), LOGIN, the
// mailbox examined (read-only) or selected (to write), UID SEARCH and UID FETCH of whole messages
// (their literals read by count), a flag stored, a message moved (UID MOVE, else COPY, the source
// flagged deleted and expunged; an `INBOX.` or server-hinted prefix tried after the name asked), and
// LOGOUT. Tags count from A0001; a completion other than `OK` refuses with its line.
use super::mime::{self, Parsed, is_space, quote_imap, regex};
use super::smtp::Auth;
use super::socket::{self, Socket, Transport};
use crate::vault_router::js;
use regex::Regex;
use serde_json::json;
use std::sync::{Arc, LazyLock};
use tokio_rustls::rustls::ClientConfig;

static UID: LazyLock<Regex> = LazyLock::new(|| regex(r"(?i)(?-u:\b)UID ([0-9]+)"));
static INTERNAL_DATE: LazyLock<Regex> =
    LazyLock::new(|| regex(r#"(?i)(?-u:\b)INTERNALDATE "([^"]+)""#));
static FLAGS: LazyLock<Regex> = LazyLock::new(|| regex(r"(?i)(?-u:\b)FLAGS \(([^)]*)\)"));
static HINTED_PREFIX: LazyLock<Regex> =
    LazyLock::new(|| regex(r"(?i)prefixed with:\s*([A-Z0-9._-]+)"));

/// A message as `parseFetchBlock` reads it.
pub struct Message {
    pub uid: f64,
    pub message_id: String,
    pub parsed: Parsed,
    pub flags: Vec<String>,
    pub unread: bool,
    pub internal_date: Option<String>,
}

/// What a fetch found: the messages and the mailbox's new cursor.
pub struct Fetched {
    pub cursor: Option<String>,
    pub messages: Vec<Message>,
}

struct Tagged {
    lines: Vec<String>,
    blocks: Vec<(Vec<String>, Vec<Vec<u8>>)>,
}

pub struct Imap {
    transport: Transport,
    tls: Arc<ClientConfig>,
    auth: Auth,
    // The client's own mailbox (`config.mailbox`), examined at connection.
    mailbox: String,
    socket: Option<Socket>,
    tag: u32,
    selected: Option<String>,
    read_only: bool,
}

fn number_text(number: f64) -> String {
    js::string(&js::number_json(number))
}

// `^\* \d+ FETCH \(` (case aside).
fn opens_fetch(line: &str) -> bool {
    let Some(rest) = line.strip_prefix("* ") else {
        return false;
    };
    let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
    digits > 0
        && rest[digits..]
            .get(..8)
            .is_some_and(|word| word.eq_ignore_ascii_case(" FETCH ("))
}

// `\{(\d+)\}$`: the byte count of the literal this line announces.
fn literal(line: &str) -> Option<usize> {
    let inner = line.strip_suffix('}')?;
    let open = inner.rfind('{')?;
    let digits = &inner[open + 1..];
    (!digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()))
        .then(|| digits.parse().unwrap_or(usize::MAX))
}

/// `buildDestinationMailboxCandidates`: the mailbox asked, then its INBOX-prefixed or hinted name.
pub fn destination_candidates(source: &str, destination: &str, error: Option<&str>) -> Vec<String> {
    let requested = js::trim(destination).to_string();
    if requested.is_empty() {
        return Vec::new();
    }
    let mut candidates = vec![requested.clone()];
    let source = js::trim(source).to_uppercase();
    let hinted = error
        .and_then(|message| HINTED_PREFIX.captures(message))
        .map(|found| found[1].to_string())
        .unwrap_or_default();
    if !requested.contains('.') {
        if !hinted.is_empty() {
            candidates.push(format!("{}.{requested}", hinted.trim_end_matches('.')));
        } else if source == "INBOX" || source.starts_with("INBOX.") {
            candidates.push(format!("INBOX.{requested}"));
        }
    }
    let mut unique: Vec<String> = Vec::new();
    for candidate in candidates.iter().map(|entry| js::trim(entry).to_string()) {
        if !candidate.is_empty() && !unique.contains(&candidate) {
            unique.push(candidate);
        }
    }
    unique
}

// `Number(request.uid || 0)`: a positive message number, else `imap_uid_required`.
fn uid_of(uid: &str) -> Result<f64, String> {
    let number = if uid.is_empty() {
        0.0
    } else {
        js::number(Some(&json!(uid)))
    };
    if number.is_finite() && number > 0.0 {
        Ok(number)
    } else {
        Err("imap_uid_required".into())
    }
}

impl Imap {
    pub fn new(transport: Transport, tls: Arc<ClientConfig>, auth: Auth, mailbox: String) -> Self {
        Self {
            transport,
            tls,
            auth,
            mailbox,
            socket: None,
            tag: 0,
            selected: None,
            read_only: true,
        }
    }

    fn socket(&mut self) -> Result<&mut Socket, String> {
        self.socket
            .as_mut()
            .ok_or_else(|| "socket_closed".to_string())
    }

    async fn command(&mut self, command: &str) -> Result<Tagged, String> {
        self.tag += 1;
        let tag = format!("A{:04}", self.tag);
        let socket = self.socket()?;
        socket
            .write(format!("{tag} {command}\r\n").as_bytes())
            .await?;
        let (mut lines, mut blocks) = (Vec::new(), Vec::new());
        let completion = loop {
            let line = socket.read_line().await?;
            if line.starts_with(&format!("{tag} ")) {
                break line;
            }
            if !opens_fetch(&line) {
                lines.push(line);
                continue;
            }
            let (mut block, mut literals) = (vec![line.clone()], Vec::new());
            let mut current = line;
            loop {
                if let Some(count) = literal(&current) {
                    literals.push(socket.read_bytes(count).await?);
                } else if js::trim(&current).ends_with(')') {
                    break;
                }
                current = socket.read_line().await?;
                block.push(current.clone());
            }
            blocks.push((block, literals));
        };
        let ok = format!("{tag} OK");
        if !completion
            .get(..ok.len())
            .is_some_and(|head| head.eq_ignore_ascii_case(&ok))
        {
            return Err(format!("imap_command_failed:{completion}"));
        }
        Ok(Tagged { lines, blocks })
    }

    async fn select(&mut self, mailbox: &str, read_only: bool) -> Result<(), String> {
        let mailbox = js::trim(if mailbox.is_empty() {
            &self.mailbox
        } else {
            mailbox
        })
        .to_string();
        let mailbox = if mailbox.is_empty() {
            "INBOX".to_string()
        } else {
            mailbox
        };
        if self.selected.as_deref() == Some(mailbox.as_str()) && self.read_only == read_only {
            return Ok(());
        }
        let verb = if read_only { "EXAMINE" } else { "SELECT" };
        self.command(&format!("{verb} {}", quote_imap(&mailbox)))
            .await?;
        self.selected = Some(mailbox);
        self.read_only = read_only;
        Ok(())
    }

    // `CAPABILITY`: the server's capabilities, upper-cased.
    async fn capabilities(&mut self) -> Result<Vec<String>, String> {
        let answered = self.command("CAPABILITY").await?;
        let line = answered.lines.iter().find(|line| {
            line.get(..13)
                .is_some_and(|head| head.eq_ignore_ascii_case("* CAPABILITY "))
        });
        Ok(line.map_or_else(Vec::new, |line| {
            line[13..]
                .split(is_space)
                .filter(|name| !name.is_empty())
                .map(str::to_uppercase)
                .collect()
        }))
    }

    /// `connect()`: the greeting, STARTTLS when asked, LOGIN, the client's mailbox examined.
    pub async fn connect(&mut self) -> Result<(), String> {
        self.socket = Some(socket::connect(&self.transport, &self.tls).await?);
        let greeting = self.socket()?.read_line().await?;
        if !greeting
            .get(..4)
            .is_some_and(|head| head.eq_ignore_ascii_case("* OK"))
        {
            return Err(format!("imap_bad_greeting:{greeting}"));
        }
        if js::trim(&self.transport.security).to_lowercase() == "starttls" {
            if !self
                .capabilities()
                .await?
                .iter()
                .any(|name| name == "STARTTLS")
            {
                return Err("imap_starttls_not_supported".into());
            }
            self.command("STARTTLS").await?;
            let host = self.transport.host.clone();
            self.socket()?.upgrade(&host).await?;
            self.capabilities().await?;
        }
        let username = quote_imap(self.auth.username.as_deref().unwrap_or_default());
        let password = quote_imap(self.auth.password.as_deref().unwrap_or_default());
        self.command(&format!("LOGIN {username} {password}"))
            .await?;
        let mailbox = self.mailbox.clone();
        self.select(&mailbox, true).await
    }

    /// `close()`: LOGOUT, its failure ignored, then the connection ended.
    pub async fn close(&mut self) {
        if self.socket.is_none() {
            return;
        }
        let _ = self.command("LOGOUT").await;
        if let Some(mut socket) = self.socket.take() {
            socket.end().await;
        }
    }

    fn message((lines, literals): &(Vec<String>, Vec<Vec<u8>>)) -> Message {
        let merged = lines.join("\n");
        let raw = literals
            .first()
            .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
            .unwrap_or_default();
        let parsed = mime::parse_raw_email(&raw);
        let uid = UID
            .captures(&merged)
            .map_or(0.0, |found| js::number(Some(&json!(&found[1]))));
        let internal_date = INTERNAL_DATE
            .captures(&merged)
            .map(|found| found[1].to_string())
            .or_else(|| parsed.date.clone());
        let flags: Vec<String> = FLAGS
            .captures(&merged)
            .map(|found| {
                found[1]
                    .split(is_space)
                    .filter(|f| !f.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        Message {
            uid,
            message_id: parsed
                .message_id
                .clone()
                .unwrap_or_else(|| format!("imap:{}", number_text(uid))),
            unread: !flags.iter().any(|flag| flag.to_lowercase() == "\\seen"),
            flags,
            internal_date,
            parsed,
        }
    }

    /// `fetchInitialMailbox` (`cursor` None) or `fetchDelta`: the last `limit` messages (after the
    /// cursor's UID for a delta) and the highest UID read.
    pub async fn fetch(
        &mut self,
        delta: bool,
        limit: f64,
        cursor: Option<&str>,
    ) -> Result<Fetched, String> {
        let mailbox = self.mailbox.clone();
        self.select(&mailbox, true).await?;
        let limit = limit.max(1.0);
        let number = cursor
            .map(|cursor| js::number(Some(&json!(cursor))))
            .filter(|number| number.is_finite());
        let search = match number.filter(|number| delta && *number >= 0.0) {
            Some(number) => format!("UID SEARCH UID {}:*", number_text(number + 1.0)),
            None => "UID SEARCH ALL".into(),
        };
        let found = self.command(&search).await?;
        let uids: Vec<f64> = found
            .lines
            .iter()
            .find(|line| {
                line.get(..8)
                    .is_some_and(|head| head.eq_ignore_ascii_case("* SEARCH"))
            })
            .map(|line| {
                line[8..]
                    .split(is_space)
                    .filter(|entry| !entry.is_empty())
                    .map(|entry| js::number(Some(&json!(entry))))
                    .filter(|entry| entry.is_finite())
                    .collect()
            })
            .unwrap_or_default();
        let skip = uids.len().saturating_sub(if limit >= uids.len() as f64 {
            uids.len()
        } else {
            limit as usize
        });
        let selected = &uids[skip..];
        let mut messages = Vec::new();
        if !selected.is_empty() {
            let set = selected
                .iter()
                .map(|uid| number_text(*uid))
                .collect::<Vec<_>>()
                .join(",");
            let fetched = self
                .command(&format!(
                    "UID FETCH {set} (UID FLAGS INTERNALDATE BODY.PEEK[])"
                ))
                .await?;
            messages = fetched.blocks.iter().map(Self::message).collect();
        }
        let highest = selected.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let cursor = if !selected.is_empty() {
            Some(number_text(highest))
        } else if delta {
            number.map(number_text)
        } else {
            cursor
                .map(|cursor| js::trim(cursor).to_string())
                .filter(|cursor| !cursor.is_empty())
        };
        Ok(Fetched { cursor, messages })
    }

    /// `markRead`: the message's `\Seen` flag stored or removed.
    pub async fn mark_read(&mut self, uid: &str, read: bool) -> Result<(), String> {
        let uid = uid_of(uid)?;
        let mailbox = self.mailbox.clone();
        self.select(&mailbox, false).await?;
        let change = if read {
            "+FLAGS.SILENT"
        } else {
            "-FLAGS.SILENT"
        };
        self.command(&format!("UID STORE {} {change} (\\Seen)", number_text(uid)))
            .await
            .map(drop)
    }

    async fn attempt_move(&mut self, uid: &str, target: &str) -> Result<(), String> {
        let target = quote_imap(target);
        match self.command(&format!("UID MOVE {uid} {target}")).await {
            Ok(_) => Ok(()),
            Err(error) if !error.starts_with("imap_command_failed:") => Err(error),
            Err(_) => {
                self.command(&format!("UID COPY {uid} {target}")).await?;
                self.command(&format!("UID STORE {uid} +FLAGS.SILENT (\\Deleted \\Seen)"))
                    .await?;
                self.command("EXPUNGE").await.map(drop)
            }
        }
    }

    /// `moveMessage`: the message moved to `destination`, or to the first candidate name that takes it.
    pub async fn move_message(&mut self, uid: &str, destination: &str) -> Result<(), String> {
        let uid = number_text(uid_of(uid)?);
        let source = js::trim(&self.mailbox).to_string();
        let source = if source.is_empty() {
            "INBOX".to_string()
        } else {
            source
        };
        let destination = js::trim(destination).to_string();
        if destination.is_empty() {
            return Err("imap_destination_mailbox_required".into());
        }
        self.select(&source, false).await?;
        let mut queue = destination_candidates(&source, &destination, None);
        let mut tried: Vec<String> = Vec::new();
        let mut last = None;
        while !queue.is_empty() {
            let candidate = queue.remove(0);
            if candidate.is_empty() || tried.contains(&candidate) {
                continue;
            }
            tried.push(candidate.clone());
            match self.attempt_move(&uid, &candidate).await {
                Ok(()) => {
                    last = None;
                    break;
                }
                Err(error) => {
                    for retry in destination_candidates(&source, &destination, Some(&error)) {
                        if !tried.contains(&retry) && !queue.contains(&retry) {
                            queue.push(retry);
                        }
                    }
                    last = Some(error);
                }
            }
        }
        last.map_or(Ok(()), Err)
    }
}
