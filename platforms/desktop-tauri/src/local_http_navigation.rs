use std::net::{SocketAddr, TcpStream};
use std::thread;
use std::time::{Duration, Instant};

/// Canonical page/runtime identity, including the actual native mobile platform.
pub fn runtime_init_script() -> String {
    let mut script = String::from("window.__SQUIRREL_FORCE_TAURI_RUNTIME__=true;window.__ATOME_LOCAL_HTTP_PORT__=3000;window.__SQUIRREL_TAURI_CANONICAL_URL__='http://127.0.0.1:3000/';");
    let imposed = std::env::var("SQUIRREL_FASTIFY_URL").or_else(|_| std::env::var("FASTIFY_URL"))
        .ok().map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| value.starts_with("https://") || value.starts_with("http://"));
    // A server imposed at launch wins over the one chosen in the app; the
    // built-in default does not (the page reads the user's choice then).
    if imposed.is_some() { script.push_str("window.__SQUIRREL_TAURI_FASTIFY_URL_PINNED__=true;"); }
    let remote = imposed.unwrap_or_else(|| "https://atome.one".to_string());
    script.push_str(&format!("window.__SQUIRREL_TAURI_FASTIFY_URL__={};", serde_json::to_string(&remote).expect("Fastify URL must serialize")));
    if cfg!(target_os = "android") { script.push_str("window.__ATOME_ANDROID_NATIVE__=true;"); }
    script
}

pub fn wait_for_local_http(address: SocketAddr, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(25));
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn detects_a_ready_local_server() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind fixture");
        let address = listener.local_addr().expect("fixture address");
        assert!(wait_for_local_http(address, Duration::from_millis(250)));
    }

    #[test]
    fn times_out_when_no_server_is_listening() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("reserve fixture port");
        let address = listener.local_addr().expect("fixture address");
        drop(listener);
        assert!(!wait_for_local_http(address, Duration::from_millis(75)));
    }
}
