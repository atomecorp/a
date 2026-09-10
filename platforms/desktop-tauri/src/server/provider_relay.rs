use super::local_atome::{LocalAtomeState, RemoteSyncCredential};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::{sync::mpsc, task::JoinHandle, time::{timeout, Duration}};
use tokio_tungstenite::{connect_async, tungstenite::Message};

// Provider traffic enters through Axum and uses the already authenticated
// remote sync identity. Secrets remain in the remote credential vault.
#[derive(Default)]
pub(super) struct ProviderRelay {
    owner: String,
    token: String,
    endpoint: String,
    sender: Option<mpsc::Sender<Value>>,
    receiver: Option<mpsc::Receiver<Value>>,
    task: Option<JoinHandle<()>>,
}

impl Drop for ProviderRelay {
    fn drop(&mut self) { if let Some(task) = self.task.take() { task.abort(); } }
}

impl ProviderRelay {
    pub(super) async fn receive(&mut self) -> Option<Value> {
        let Some(receiver) = self.receiver.as_mut() else { return std::future::pending().await; };
        let result = receiver.recv().await;
        if result.is_none() { self.receiver = None; self.sender = None; }
        result
    }

    pub(super) async fn send(&mut self, mut message: Value, user_id: &str, state: &LocalAtomeState) -> Result<(), String> {
        let credential = state.remote_sync_credentials.lock()
            .map_err(|_| "provider_principal_unavailable")?.get(user_id).cloned()
            .ok_or("provider_principal_unavailable")?;
        if self.owner != user_id || self.token != credential.token || self.endpoint != credential.remote_url {
            if let Some(task) = self.task.take() { task.abort(); }
            self.sender = None; self.receiver = None;
        }
        if self.sender.as_ref().map(|sender| sender.is_closed()).unwrap_or(true) {
            let endpoint = remote_endpoint(&credential)?;
            let (socket, _) = timeout(Duration::from_secs(10), connect_async(endpoint)).await
                .map_err(|_| "provider_connection_timeout")?
                .map_err(|_| "provider_connection_failed")?;
            let (outgoing, mut requests) = mpsc::channel::<Value>(16);
            let (replies, incoming) = mpsc::channel::<Value>(32);
            let (mut write, mut read) = socket.split();
            let identity_state = state.clone();
            let owner = user_id.to_string();
            let token = credential.token.clone();
            let remote_url = credential.remote_url.clone();
            self.task = Some(tokio::spawn(async move {
                let mut pending = std::collections::HashSet::<String>::new();
                let mut voice_sessions = std::collections::HashSet::<String>::new();
                loop {
                    tokio::select! {
                        request = requests.recv() => {
                            let Some(request) = request else { break; };
                            if let Some(id) = request["requestId"].as_str() { pending.insert(id.to_string()); }
                            if request["action"] == "realtime-connect" {
                                if let Some(id) = request["payload"]["session_id"].as_str() { voice_sessions.insert(id.to_string()); }
                            }
                            if request["action"] == "realtime-close" {
                                if let Some(id) = request["payload"]["session_id"].as_str() { voice_sessions.remove(id); }
                            }
                            if write.send(Message::Text(request.to_string())).await.is_err() { break; }
                        }
                        response = read.next() => {
                            let Some(Ok(response)) = response else { break; };
                            let same_owner = identity_state.remote_sync_credentials.lock().ok()
                                .and_then(|items| items.get(&owner).map(|item| item.token == token && item.remote_url == remote_url)).unwrap_or(false);
                            if !same_owner { break; }
                            match response {
                                Message::Text(text) => {
                                    let Ok(value) = serde_json::from_str::<Value>(&text) else { break; };
                                    if !matches!(value["type"].as_str(), Some("ai-provider-response" | "ai-provider-progress" | "ai-realtime-event")) { continue; }
                                    if value["type"] == "ai-provider-response" {
                                        if let Some(id) = value["requestId"].as_str() { pending.remove(id); }
                                    }
                                    if replies.send(value).await.is_err() { break; }
                                }
                                Message::Ping(data) => { if write.send(Message::Pong(data)).await.is_err() { break; } }
                                Message::Close(_) => break,
                                _ => {}
                            }
                        }
                    }
                }
                for id in pending {
                    if replies.send(json!({"type":"ai-provider-response","requestId":id,"ok":false,
                        "success":false,"error":"provider_connection_closed"})).await.is_err() { break; }
                }
                for id in voice_sessions {
                    if replies.send(json!({"type":"ai-realtime-event","session_id":id,
                        "event":{"type":"error","code":"provider_connection_closed"}})).await.is_err() { break; }
                }
            }));
            self.sender = Some(outgoing); self.receiver = Some(incoming);
            self.owner = user_id.to_string(); self.token = credential.token; self.endpoint = credential.remote_url;
        }
        let object = message.as_object_mut().ok_or("provider_request_invalid")?;
        object.insert("token".to_string(), Value::String(self.token.clone()));
        self.sender.as_ref().ok_or("provider_connection_closed")?.send(message).await.map_err(|_| "provider_connection_closed".to_string())
    }
}

fn remote_endpoint(credential: &RemoteSyncCredential) -> Result<String, String> {
    let mut url = reqwest::Url::parse(&credential.remote_url).map_err(|_| "provider_remote_url_invalid")?;
    let scheme = match url.scheme() {
        "https" => "wss",
        "http" if matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1")) => "ws",
        _ => return Err("provider_remote_url_invalid".to_string()),
    };
    url.set_scheme(scheme).map_err(|_| "provider_remote_url_invalid")?;
    url.set_path("/ws/api"); url.set_query(None); url.set_fragment(None);
    Ok(url.to_string())
}

#[cfg(test)]
#[path = "../../../../tests/server/provider_relay_contract.rs"]
mod tests;
