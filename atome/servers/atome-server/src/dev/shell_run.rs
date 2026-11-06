// One shell command run as server/shell.js spawns it: no shell, in `cwd`, killed (SIGKILL) past
// its deadline, each output kept to its first `max_output` UTF-16 units, each chunk read as UTF-8
// on its own as Node's `chunk.toString()` reads it.
use serde_json::{Value as JsonValue, json};
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{AsyncRead, AsyncReadExt};

// Node's largest timer delay; a delay outside 1..=it runs after 1 ms.
const TIMEOUT_MAX: f64 = 2_147_483_647.0;

async fn collected(mut stream: impl AsyncRead + Unpin, max_output: f64) -> String {
    let mut kept = String::new();
    let mut units = 0usize;
    let mut buffer = vec![0u8; 64 * 1024];
    while let Ok(read) = stream.read(&mut buffer).await {
        if read == 0 {
            break;
        }
        // `if (out.length >= max) return; out += chunk; out = out.slice(0, max)`.
        if (units as f64) >= max_output {
            continue;
        }
        let chunk = String::from_utf8_lossy(&buffer[..read]);
        for c in chunk.chars() {
            if (units + c.len_utf16()) as f64 > max_output {
                break;
            }
            units += c.len_utf16();
            kept.push(c);
        }
    }
    kept
}

// `spawn`'s error as Node words it.
fn spawn_error(command: &str, error: &std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => format!("spawn {command} ENOENT"),
        std::io::ErrorKind::PermissionDenied => format!("spawn {command} EACCES"),
        _ => error.to_string(),
    }
}

/// The result of `tokens` run in `cwd`: `success`, `stdout`, `stderr`, `exitCode` (null when a
/// signal ended it), `durationMs`, and `error` when it could not start or ran out of time.
pub async fn run(tokens: &[String], cwd: &Path, timeout_ms: f64, max_output: f64) -> JsonValue {
    let started = Instant::now();
    let elapsed = |started: Instant| started.elapsed().as_millis() as u64;
    let spawned = tokio::process::Command::new(&tokens[0])
        .args(&tokens[1..])
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn();
    let mut child = match spawned {
        Ok(child) => child,
        Err(error) => {
            return json!({ "success": false, "error": spawn_error(&tokens[0], &error), "stdout": "",
                           "stderr": "", "durationMs": elapsed(started) });
        }
    };
    let delay = if (1.0..=TIMEOUT_MAX).contains(&timeout_ms) {
        timeout_ms
    } else {
        1.0
    };
    let (stdout, stderr) = (child.stdout.take(), child.stderr.take());
    let pid = child
        .id()
        .and_then(|id| rustix::process::Pid::from_raw(id as i32));
    let outputs = async {
        tokio::join!(
            async {
                match stdout {
                    Some(stream) => collected(stream, max_output).await,
                    None => String::new(),
                }
            },
            async {
                match stderr {
                    Some(stream) => collected(stream, max_output).await,
                    None => String::new(),
                }
            },
        )
    };
    let deadline = tokio::time::sleep(Duration::from_secs_f64(delay / 1000.0));
    let waited = async { tokio::join!(outputs, child.wait()) };
    tokio::pin!(deadline, waited);
    let mut timed_out = false;
    let ((stdout, stderr), status) = loop {
        tokio::select! {
            finished = &mut waited => break finished,
            () = &mut deadline, if !timed_out => {
                timed_out = true;
                // `waited` holds the child: the kill is sent by its id.
                if let Some(pid) = pid {
                    let _ = rustix::process::kill_process(pid, rustix::process::Signal::KILL);
                }
            }
        }
    };
    let code = status.ok().and_then(|status| status.code());
    let duration = elapsed(started);
    if timed_out {
        return json!({ "success": false, "error": "Command timed out", "stdout": stdout,
                       "stderr": stderr, "exitCode": code, "durationMs": duration });
    }
    json!({ "success": code == Some(0), "stdout": stdout, "stderr": stderr, "exitCode": code,
            "durationMs": duration })
}
