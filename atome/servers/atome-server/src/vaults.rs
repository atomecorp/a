// The vault processes: one `atome-vault` per person, started on that person's
// first request (a sign-in warms it), stopped once idle. The supervisor never
// opens a vault file; it holds one end of each process's socket and multiplexes
// that person's requests over it.
use atome_vault::frame::{self, Frame};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::os::fd::OwnedFd;
use std::os::unix::fs::DirBuilderExt;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::unix::{OwnedReadHalf, OwnedWriteHalf};
use tokio::sync::{oneshot, watch};

// A request a vault does not answer in this time fails (Fastify's vault timeout).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

type Reply = Result<Vec<u8>, String>;

pub struct VaultProcess {
    principal: String,
    writer: tokio::sync::Mutex<OwnedWriteHalf>,
    // The requests waiting for their answer; `None` once the process has ended.
    pending: Mutex<Option<HashMap<u64, oneshot::Sender<Reply>>>>,
    next_id: AtomicU64,
    // Counted under the `running` lock, so an idle stop never takes a vault a request holds.
    in_flight: AtomicUsize,
    last_used: Mutex<Instant>,
    // True once the process has exited.
    exited: watch::Receiver<bool>,
}

pub struct Vaults {
    root: PathBuf,
    binary: PathBuf,
    idle: Duration,
    running: Mutex<HashMap<String, Arc<VaultProcess>>>,
    #[cfg(target_os = "linux")]
    accounts: Mutex<crate::vault_accounts::VaultAccounts>,
}

// A person's vault directory: the hash of the principal id under the root (as Fastify named it).
pub fn vault_directory(root: &std::path::Path, principal: &str) -> PathBuf {
    let digest = Sha256::digest(principal.as_bytes());
    root.join(
        digest
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>(),
    )
}

impl Vaults {
    pub fn new(root: PathBuf, binary: PathBuf, idle: Duration) -> Result<Arc<Self>, String> {
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&root)
            .map_err(|e| e.to_string())?;
        Ok(Arc::new(Self {
            #[cfg(target_os = "linux")]
            accounts: Mutex::new(crate::vault_accounts::VaultAccounts::open(&root)?),
            root,
            binary,
            idle,
            running: Mutex::new(HashMap::new()),
        }))
    }

    pub fn running_count(&self) -> usize {
        self.running.lock().expect("vaults").len()
    }

    // The person's running vault, started if needed, counted as in use.
    fn process(self: &Arc<Self>, principal: &str) -> Result<Arc<VaultProcess>, String> {
        let mut running = self.running.lock().expect("vaults");
        if let Some(process) = running.get(principal) {
            process.in_flight.fetch_add(1, Ordering::SeqCst);
            return Ok(process.clone());
        }
        let directory = vault_directory(&self.root, principal);
        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&directory)
            .map_err(|e| e.to_string())?;
        let (ours, theirs) = std::os::unix::net::UnixStream::pair().map_err(|e| e.to_string())?;
        let output = theirs.try_clone().map_err(|e| e.to_string())?;
        let mut command = tokio::process::Command::new(&self.binary);
        // Linux: the vault runs under its own account, then confines itself (atome-confine).
        #[cfg(target_os = "linux")]
        {
            let name = directory
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or("vault_directory_invalid")?;
            let uid = self
                .accounts
                .lock()
                .expect("vault accounts")
                .account(name)?;
            crate::vault_accounts::hand_over(&directory, uid)?;
            command.uid(uid).gid(uid);
        }
        let mut child = command
            .arg(principal)
            .arg(&directory)
            .env_clear()
            .current_dir(&directory)
            .stdin(Stdio::from(OwnedFd::from(theirs)))
            .stdout(Stdio::from(OwnedFd::from(output)))
            .stderr(Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("vault_spawn_failed:{e}"))?;
        ours.set_nonblocking(true).map_err(|e| e.to_string())?;
        let (reader, writer) = tokio::net::UnixStream::from_std(ours)
            .map_err(|e| e.to_string())?
            .into_split();
        let (exit, exited) = watch::channel(false);
        let process = Arc::new(VaultProcess {
            principal: principal.to_string(),
            writer: tokio::sync::Mutex::new(writer),
            pending: Mutex::new(Some(HashMap::new())),
            next_id: AtomicU64::new(1),
            in_flight: AtomicUsize::new(1),
            last_used: Mutex::new(Instant::now()),
            exited,
        });
        running.insert(principal.to_string(), process.clone());
        let vaults = self.clone();
        let reading = process.clone();
        tokio::spawn(async move {
            // The answers until the process ends; then whatever waits fails and the
            // vault is started again on its next request.
            let ended = read_replies(&reading, reader).await;
            {
                let mut running = vaults.running.lock().expect("vaults");
                if running
                    .get(&reading.principal)
                    .is_some_and(|current| Arc::ptr_eq(current, &reading))
                {
                    running.remove(&reading.principal);
                }
                for (_, waiting) in reading
                    .pending
                    .lock()
                    .expect("pending")
                    .take()
                    .into_iter()
                    .flatten()
                {
                    let _ = waiting.send(Err(ended.clone()));
                }
            }
            let _ = child.wait().await;
            let _ = exit.send(true);
        });
        Ok(process)
    }

    // One operation of `principal`'s vault (a request body of `frame`): its JSON
    // result, or the vault's refusal.
    pub async fn request(self: &Arc<Self>, principal: &str, request: Vec<u8>) -> Reply {
        let principal = principal.trim();
        if principal.is_empty() {
            return Err("vault_principal_required".into());
        }
        let process = self.process(principal)?;
        let answer = process.ask(request).await;
        *process.last_used.lock().expect("last use") = Instant::now();
        process.in_flight.fetch_sub(1, Ordering::SeqCst);
        answer
    }

    // Stops the vaults idle for longer than the idle time; runs until the server stops.
    pub async fn stop_idle(self: Arc<Self>) {
        let mut tick = tokio::time::interval(self.idle.min(Duration::from_secs(15)));
        loop {
            tick.tick().await;
            let idle: Vec<Arc<VaultProcess>> = {
                let mut running = self.running.lock().expect("vaults");
                let ids: Vec<String> = running
                    .iter()
                    .filter(|(_, process)| {
                        process.in_flight.load(Ordering::SeqCst) == 0
                            && process.last_used.lock().expect("last use").elapsed() >= self.idle
                    })
                    .map(|(id, _)| id.clone())
                    .collect();
                ids.iter().filter_map(|id| running.remove(id)).collect()
            };
            for process in idle {
                process.close().await;
            }
        }
    }

    // Every vault closed, each process left to finish what it holds and exit.
    pub async fn stop_all(&self) {
        let all: Vec<Arc<VaultProcess>> = self
            .running
            .lock()
            .expect("vaults")
            .drain()
            .map(|(_, process)| process)
            .collect();
        for process in &all {
            process.close().await;
        }
        for process in all {
            let mut exited = process.exited.clone();
            let _ = exited.wait_for(|exited| *exited).await;
        }
    }
}

impl VaultProcess {
    async fn ask(&self, request: Vec<u8>) -> Reply {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        match self.pending.lock().expect("pending").as_mut() {
            Some(pending) => pending.insert(id, sender),
            None => return Err("vault_process_exited".into()),
        };
        let frame = Frame {
            id,
            tag: frame::REQUEST,
            body: request,
        }
        .encode();
        if let Err(error) = self.writer.lock().await.write_all(&frame).await {
            self.forget(id);
            return Err(format!("vault_process_unreachable:{error}"));
        }
        match tokio::time::timeout(REQUEST_TIMEOUT, receiver).await {
            Ok(Ok(reply)) => reply,
            Ok(Err(_)) => Err("vault_process_exited".into()),
            Err(_) => {
                self.forget(id);
                Err("vault_request_timeout".into())
            }
        }
    }

    fn forget(&self, id: u64) {
        if let Some(pending) = self.pending.lock().expect("pending").as_mut() {
            pending.remove(&id);
        }
    }

    // Its end of the socket closed: the process finishes what it holds and exits.
    async fn close(&self) {
        let _ = self.writer.lock().await.shutdown().await;
    }
}

async fn read_replies(process: &VaultProcess, mut reader: OwnedReadHalf) -> String {
    loop {
        let mut prefix = [0u8; 4];
        if reader.read_exact(&mut prefix).await.is_err() {
            return "vault_process_exited".into();
        }
        let length = match frame::content_length(prefix, frame::MAX_REPLY_BYTES) {
            Ok(length) => length,
            Err(error) => return error,
        };
        let mut content = vec![0u8; length];
        if reader.read_exact(&mut content).await.is_err() {
            return "vault_process_exited".into();
        }
        let reply = match Frame::decode(content) {
            Ok(reply) => reply,
            Err(error) => return error,
        };
        let answer = match reply.tag {
            frame::RESULT => Ok(reply.body),
            frame::FAILURE => Err(String::from_utf8_lossy(&reply.body).into_owned()),
            _ => return "vault_frame_invalid".into(),
        };
        let waiting = process
            .pending
            .lock()
            .expect("pending")
            .as_mut()
            .and_then(|pending| pending.remove(&reply.id));
        if let Some(waiting) = waiting {
            let _ = waiting.send(answer);
        }
    }
}
