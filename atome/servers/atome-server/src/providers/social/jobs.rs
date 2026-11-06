// A person's sharing jobs (server/social/social_jobs.js, ported), kept under their own vault
// directory (`<vault>/social/jobs/<id>.json`) so a reload or a restart never forgets what was
// already sent; one independent delivery per destination. A job with a delivery in flight is
// shared in memory, so two requests on it (two destinations, a double click, a status read)
// change and write one object. A destination is sent at most once: only a delivery the provider
// demonstrably did not take (failed, cancelled) is sent again, and a request that may have
// published becomes `unconfirmed`, to verify, never resend.
use super::SOCIAL_ERRORS;
use super::media::PublicFiles;
use super::net::{Sd, Se};
use crate::providers::generation::now_ms;
use futures_util::future::BoxFuture;
use serde_json::{Map as JsonMap, Value as JsonValue, json};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

const OPEN_STATUSES: [&str; 5] = [
    "ready",
    "transferring",
    "remote_processing",
    "unconfirmed",
    "failed",
];
const TERMINAL_STATUSES: [&str; 5] = ["published", "handed_off", "exported", "cancelled", "failed"];
const STALE_MS: i64 = 24 * 60 * 60 * 1000;

pub type Job = Arc<Mutex<JsonValue>>;

struct Run {
    cancel: watch::Sender<bool>,
    done: watch::Receiver<bool>,
}

/// The jobs shared in memory and the deliveries running, every person's.
#[derive(Default)]
pub struct Jobs {
    live: Mutex<HashMap<PathBuf, (Job, usize)>>,
    running: Mutex<HashMap<String, Run>>,
}

/// One job held in memory while a request works on it.
pub struct Held {
    jobs: Arc<Jobs>,
    key: PathBuf,
}

impl Drop for Held {
    fn drop(&mut self) {
        let mut live = self.jobs.live.lock().expect("social jobs");
        if let Some(entry) = live.get_mut(&self.key) {
            entry.1 -= 1;
            if entry.1 == 0 {
                live.remove(&self.key);
            }
        }
    }
}

/// A delivery's exclusive use outside a run (a status refresh that may finish a publication).
pub struct Lock {
    jobs: Arc<Jobs>,
    key: String,
    done: watch::Sender<bool>,
}

impl Drop for Lock {
    fn drop(&mut self) {
        self.jobs
            .running
            .lock()
            .expect("social runs")
            .remove(&self.key);
        self.done.send_replace(true);
    }
}

pub fn new_id() -> String {
    crate::providers::oauth::hex(16)
}

pub fn temp_dir(root: &Path, id: &str) -> PathBuf {
    root.join("tmp").join(id)
}

fn run_key(principal: &str, job: &str, destination: &str) -> String {
    format!("{principal}\u{0}{job}\u{0}{destination}")
}

/// Applies `change` to a delivery of the job.
pub fn delivery<R>(
    job: &Job,
    destination: &str,
    change: impl FnOnce(&mut JsonMap<String, JsonValue>) -> R,
) -> Option<R> {
    let mut job = job.lock().expect("social job");
    job.get_mut("deliveries")?
        .get_mut(destination)?
        .as_object_mut()
        .map(change)
}

/// `normalizeSocialError`.
pub fn normalize(code: &str) -> &str {
    SOCIAL_ERRORS
        .iter()
        .find(|known| **known == code)
        .copied()
        .unwrap_or("social_provider_unavailable")
}

/// One person's jobs.
#[derive(Clone)]
pub struct Store {
    pub jobs: Arc<Jobs>,
    pub public: Arc<PublicFiles>,
    pub root: PathBuf,
}

impl Store {
    fn file(&self, id: &str) -> Sd<PathBuf> {
        let shaped = id.len() == 32
            && id
                .bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c));
        if !shaped {
            return Err(Se::new("social_job_not_found"));
        }
        Ok(self.root.join("jobs").join(format!("{id}.json")))
    }

    pub fn hold(&self, job: &Job) -> Held {
        let id = crate::vault_router::js::text(job.lock().expect("social job").get("id"));
        let key = self.root.join("jobs").join(format!("{id}.json"));
        let mut live = self.jobs.live.lock().expect("social jobs");
        live.entry(key.clone())
            .or_insert_with(|| (job.clone(), 0))
            .1 += 1;
        Held {
            jobs: self.jobs.clone(),
            key,
        }
    }

    /// Read, then held without a window: a copy read from disk while another request already
    /// shares the job gives way to the shared one.
    pub async fn acquire(&self, id: &str) -> Sd<(Job, Held)> {
        let file = self.file(id)?;
        let shared = self
            .jobs
            .live
            .lock()
            .expect("social jobs")
            .get(&file)
            .map(|entry| entry.0.clone());
        let job = match shared {
            Some(job) => job,
            None => {
                let text = match tokio::fs::read(&file).await {
                    Ok(text) => text,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        return Err(Se::new("social_job_not_found"));
                    }
                    Err(error) => return Err(error.to_string().into()),
                };
                let loaded: JsonValue =
                    serde_json::from_slice(&text).map_err(|error| Se::from(error.to_string()))?;
                let again = self
                    .jobs
                    .live
                    .lock()
                    .expect("social jobs")
                    .get(&file)
                    .map(|entry| entry.0.clone());
                again.unwrap_or_else(|| Arc::new(Mutex::new(loaded)))
            }
        };
        let held = self.hold(&job);
        Ok((job, held))
    }

    pub async fn write(&self, job: &Job) -> Sd<()> {
        let dir = self.root.join("jobs");
        super::media::create_private_dir(&dir)
            .await
            .map_err(|error| Se::from(error.to_string()))?;
        let (id, text) = {
            let mut job = job.lock().expect("social job");
            job["updated_at"] = json!(now_ms());
            (
                crate::vault_router::js::text(job.get("id")),
                job.to_string(),
            )
        };
        let target = self.file(&id)?;
        let temporary = dir.join(format!("{id}.json.{}", crate::providers::oauth::hex(6)));
        let written = {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let temporary = temporary.clone();
            tokio::task::spawn_blocking(move || {
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create(true)
                    .truncate(true)
                    .mode(0o600)
                    .open(&temporary)?;
                file.write_all(text.as_bytes())
            })
            .await
            .map_err(|error| Se::from(error.to_string()))?
        };
        written.map_err(|error| Se::from(error.to_string()))?;
        tokio::fs::rename(&temporary, &target)
            .await
            .map_err(|error| Se::from(error.to_string()))
    }

    /// Temporary variants live until every delivery is settled: a failed one may be retried with
    /// the very same prepared file.
    pub async fn release_if_settled(&self, job: &Job, force: bool) -> Sd<bool> {
        let (settled, id) = {
            let job = job.lock().expect("social job");
            let deliveries = job["deliveries"].as_object().cloned().unwrap_or_default();
            let settled = deliveries.values().all(|delivery| {
                !OPEN_STATUSES
                    .iter()
                    .any(|status| delivery.get("status") == Some(&json!(status)))
            });
            (settled, crate::vault_router::js::text(job.get("id")))
        };
        if !settled && !force {
            return Ok(false);
        }
        self.public.revoke(&id);
        match tokio::fs::remove_dir_all(temp_dir(&self.root, &id)).await {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
                return Err(error.to_string().into());
            }
            _ => {}
        }
        job.lock().expect("social job")["variants_released"] = json!(true);
        Ok(true)
    }

    /// The variants of jobs left unsettled for a day are dropped; a retry prepares them again.
    pub async fn prune_stale(&self) -> Sd<()> {
        let mut entries = match tokio::fs::read_dir(self.root.join("tmp")).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error.to_string().into()),
        };
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|error| Se::from(error.to_string()))?
        {
            let dir = entry.path();
            let modified = tokio::fs::metadata(&dir)
                .await
                .ok()
                .and_then(|info| info.modified().ok());
            let age = modified
                .and_then(|time| time.elapsed().ok())
                .map_or(0, |age| age.as_millis() as i64);
            if modified.is_some() && age > STALE_MS {
                let _ = tokio::fs::remove_dir_all(&dir).await;
            }
        }
        Ok(())
    }

    /// `cancelDeliveryRun`: once the aborted run has recorded its final state.
    pub async fn cancel_run(&self, principal: &str, job: &str, destination: &str) -> bool {
        let done = {
            let running = self.jobs.running.lock().expect("social runs");
            let Some(run) = running.get(&run_key(principal, job, destination)) else {
                return false;
            };
            run.cancel.send_replace(true);
            run.done.clone()
        };
        let mut done = done;
        let _ = done.wait_for(|done| *done).await;
        true
    }

    /// `lockDelivery`: none when the delivery is busy.
    pub fn lock(&self, principal: &str, job: &str, destination: &str) -> Option<Lock> {
        let key = run_key(principal, job, destination);
        let mut running = self.jobs.running.lock().expect("social runs");
        if running.contains_key(&key) {
            return None;
        }
        let (done, watched) = watch::channel(false);
        running.insert(
            key.clone(),
            Run {
                cancel: watch::channel(false).0,
                done: watched,
            },
        );
        Some(Lock {
            jobs: self.jobs.clone(),
            key,
            done,
        })
    }

    async fn save(&self, job: &Job, destination: &str, patch: JsonValue) -> Sd<()> {
        delivery(job, destination, |delivery| {
            if let JsonValue::Object(patch) = patch {
                delivery.extend(patch);
            }
            delivery.insert("updated_at".into(), json!(now_ms()));
        });
        self.write(job).await
    }
}

/// What a running delivery tells its job: the provider accepted it (its remote ids), the request
/// that publishes is about to be sent, how far the transfer is.
#[derive(Clone)]
pub struct Hooks {
    store: Store,
    job: Job,
    destination: String,
    reaching: Arc<AtomicBool>,
}

fn merged_remote(delivery: &JsonMap<String, JsonValue>, remote: &JsonValue) -> JsonValue {
    let mut merged = delivery
        .get("remote")
        .and_then(JsonValue::as_object)
        .cloned()
        .unwrap_or_default();
    merged.extend(remote.as_object().cloned().unwrap_or_default());
    JsonValue::Object(merged)
}

impl Hooks {
    pub fn new(store: Store, job: Job, destination: &str) -> Self {
        Self {
            store,
            job,
            destination: destination.into(),
            reaching: Arc::default(),
        }
    }

    fn remote(&self, remote: &JsonValue) -> JsonValue {
        delivery(&self.job, &self.destination, |delivery| {
            merged_remote(delivery, remote)
        })
        .unwrap_or(JsonValue::Null)
    }

    pub async fn accepted(&self, remote: JsonValue) -> Sd<()> {
        let merged = self.remote(&remote);
        self.store
            .save(&self.job, &self.destination, json!({ "remote": merged }))
            .await
    }

    pub async fn publishing(&self, remote: JsonValue) -> Sd<()> {
        let merged = self.remote(&remote);
        self.store
            .save(
                &self.job,
                &self.destination,
                json!({ "stage": "publishing", "remote": merged }),
            )
            .await
    }

    pub fn progress(&self, ratio: f64) {
        let ratio = if ratio.is_nan() {
            0.0
        } else {
            ratio.clamp(0.0, 1.0)
        };
        delivery(&self.job, &self.destination, |delivery| {
            delivery.insert(
                "progress".into(),
                crate::vault_router::js::number_json(ratio),
            );
        });
    }

    /// A request that may publish: cancelled while it is in flight, its outcome is unknown.
    pub async fn reaching<T>(&self, request: impl Future<Output = Sd<T>>) -> Sd<T> {
        self.reaching.store(true, Ordering::Relaxed);
        let answer = request.await;
        self.reaching.store(false, Ordering::Relaxed);
        answer
    }
}

/// `canSendDelivery`.
pub fn can_send(delivery: &JsonValue) -> bool {
    let status = delivery.get("status");
    !delivery.get("route").is_none_or(JsonValue::is_null)
        && ["ready", "failed", "cancelled"]
            .iter()
            .any(|s| status == Some(&json!(s)))
}

/// `runDelivery`: the delivery sent once, its outcome recorded. The run is its own task: a
/// cancelled request (or the delivery's own cancel) ends its provider calls and still records
/// what became of it.
pub async fn run(
    store: &Store,
    job: &Job,
    destination: &str,
    principal: &str,
    execute: impl FnOnce(Hooks) -> BoxFuture<'static, Sd<JsonValue>> + Send + 'static,
) -> Sd<()> {
    let id = crate::vault_router::js::text(job.lock().expect("social job").get("id"));
    let key = run_key(principal, &id, destination);
    let (cancel, mut cancelled) = watch::channel(false);
    let (done, watched) = watch::channel(false);
    {
        let mut running = store.jobs.running.lock().expect("social runs");
        let sendable = job.lock().expect("social job")["deliveries"]
            .get(destination)
            .is_some_and(can_send);
        if running.contains_key(&key) || !sendable {
            return Ok(());
        }
        running.insert(
            key.clone(),
            Run {
                cancel: cancel.clone(),
                done: watched.clone(),
            },
        );
    }
    let held = store.hold(job);
    let hooks = Hooks::new(store.clone(), job.clone(), destination);
    let task = tokio::spawn(async move {
        let _held = held;
        let attempts = crate::vault_router::js::number(
            delivery(&hooks.job, &hooks.destination, |d| {
                d.get("attempts").cloned()
            })
            .flatten()
            .as_ref(),
        );
        let attempts = if attempts.is_nan() || attempts == 0.0 {
            0.0
        } else {
            attempts
        };
        let start = json!({ "status": "transferring", "error": null, "provider_code": null,
            "attempts": crate::vault_router::js::number_json(attempts + 1.0), "stage": "transfer" });
        let outcome = match hooks
            .store
            .save(&hooks.job, &hooks.destination, start)
            .await
        {
            Ok(()) => {
                let work = execute(hooks.clone());
                tokio::select! {
                    outcome = work => outcome.map_err(|failure| (failure, false)),
                    _ = cancelled.wait_for(|cancelled| *cancelled) => {
                        let reached = hooks.reaching.load(Ordering::Relaxed);
                        Err((Se { reached, ..Se::new("social_cancelled") }, true))
                    }
                }
            }
            Err(failure) => Err((failure, false)),
        };
        let patch = match outcome {
            Ok(result) => {
                let status = crate::vault_router::js::text(result.get("status"));
                let stage =
                    delivery(&hooks.job, &hooks.destination, |d| d.get("stage").cloned()).flatten();
                let stage = if status == "remote_processing" {
                    json!("remote")
                } else if TERMINAL_STATUSES.contains(&status.as_str()) {
                    json!("done")
                } else {
                    stage.unwrap_or(JsonValue::Null)
                };
                let (remote, url) = delivery(&hooks.job, &hooks.destination, |d| {
                    let url = result
                        .get("url")
                        .filter(|u| crate::vault_router::js::truthy(Some(u)))
                        .or_else(|| {
                            d.get("url")
                                .filter(|u| crate::vault_router::js::truthy(Some(u)))
                        })
                        .cloned()
                        .unwrap_or(JsonValue::Null);
                    (
                        merged_remote(d, result.get("remote").unwrap_or(&JsonValue::Null)),
                        url,
                    )
                })
                .unwrap_or_default();
                let error = result
                    .get("error")
                    .filter(|e| crate::vault_router::js::truthy(Some(e)))
                    .map_or(JsonValue::Null, |e| {
                        json!(normalize(&crate::vault_router::js::string(e)))
                    });
                let provider_code = result
                    .get("provider_code")
                    .filter(|c| crate::vault_router::js::truthy(Some(c)))
                    .cloned();
                json!({ "status": result.get("status"), "remote": remote, "url": url, "error": error,
                    "provider_code": provider_code, "stage": stage })
            }
            Err((failure, aborted)) => {
                let aborted = aborted || failure.code == "social_cancelled";
                let publishing = delivery(&hooks.job, &hooks.destination, |d| {
                    d.get("stage") == Some(&json!("publishing"))
                })
                .unwrap_or(false);
                if failure.reached || (aborted && publishing) {
                    json!({ "status": "unconfirmed", "error": "social_publish_unconfirmed" })
                } else if aborted {
                    json!({ "status": "cancelled", "error": null })
                } else {
                    json!({ "status": "failed", "error": normalize(&failure.code), "provider_code": failure.provider_code,
                        "detail": failure.detail })
                }
            }
        };
        let saved = hooks
            .store
            .save(&hooks.job, &hooks.destination, patch)
            .await;
        hooks
            .store
            .jobs
            .running
            .lock()
            .expect("social runs")
            .remove(&key);
        done.send_replace(true);
        saved
    });
    // The request's end before the run's cancels it; the run still records its outcome.
    struct Abandon(Option<watch::Sender<bool>>);
    impl Drop for Abandon {
        fn drop(&mut self) {
            if let Some(cancel) = &self.0 {
                cancel.send_replace(true);
            }
        }
    }
    let mut abandon = Abandon(Some(cancel));
    let saved = task.await.map_err(|error| Se::from(error.to_string()));
    abandon.0 = None;
    saved?
}
