// The `network` family of the central `/ws/api` (R-347 L12, network/mod.rs): for the account the
// connection is (identity.rs `principal_of`). OSC is refused here (`network_osc_local_only`: only
// the apps' local server reaches the person's own network); HTTP is sent by the server to a
// public address only — every address the host resolves to is checked (public_source.rs) and the
// request pinned to it, redirects never followed — so the server opens nothing of its own network.
// An account sends at most `LIMIT` requests a minute.
use super::Connection;
use super::sources::public_source::{RateLimit, public_address, resolve};
use crate::network::{self, OSC_LOCAL_ONLY, http::HttpRequest};
use serde_json::Value as JsonValue;
use std::net::SocketAddr;
use std::sync::{Arc, LazyLock};

pub(super) const KIND: &str = network::KIND;
const LIMIT: usize = 600;

static LIMITS: LazyLock<RateLimit> = LazyLock::new(|| RateLimit::new(60_000, LIMIT));

/// The address the request is pinned to: the host's, once every address it resolves to is public.
async fn public_target(request: &HttpRequest) -> Result<Option<SocketAddr>, String> {
    let refused = || "network_address_not_public".to_string();
    let port = request.url.port_or_known_default().ok_or_else(refused)?;
    match request.url.host() {
        Some(url::Host::Domain(host)) => {
            let addresses = resolve(host)
                .await
                .map_err(|_| "network_host_unknown".to_string())?;
            if addresses.is_empty() || !addresses.iter().all(|address| public_address(address)) {
                return Err(refused());
            }
            let ip = addresses[0].parse().map_err(|_| refused())?;
            Ok(Some(SocketAddr::new(ip, port)))
        }
        Some(url::Host::Ipv4(ip)) if public_address(&ip.to_string()) => Ok(None),
        Some(url::Host::Ipv6(ip)) if public_address(&ip.to_string()) => Ok(None),
        _ => Err(refused()),
    }
}

/// What the central server does with a `send`: OSC refused, HTTP to a public address.
pub(crate) async fn send_central(message: &JsonValue) -> Result<Option<u16>, String> {
    match network::protocol_of(message)? {
        "osc" => return Err(OSC_LOCAL_ONLY.into()),
        network::camera::PROTOCOL => return Err(network::camera::REST_LOCAL_ONLY.into()),
        _ => {}
    }
    let request = HttpRequest::from_message(message)?;
    let mut client = crate::tls::http_client()?;
    if let (Some(pinned), Some(host)) = (public_target(&request).await?, request.url.host_str()) {
        client = client.resolve(host, pinned);
    }
    request.send(client).await.map(Some)
}

pub(super) async fn answer(connection: Arc<Connection>, message: JsonValue) {
    let front = match connection.principal_of(&message).await {
        Ok(front) => front,
        Err(error) => return connection.reply(network::reply(&message, Err(error))).await,
    };
    if let Some(refused) = front.get("session_error") {
        return connection.reply(refused.clone()).await;
    }
    let Some(principal) = front.get("principal").and_then(JsonValue::as_str) else {
        let error = front["reply"]["error"]
            .as_str()
            .unwrap_or("Authentication required");
        return connection
            .reply(network::reply(&message, Err(error.into())))
            .await;
    };
    // A camera's packet is only encoded (Web Bluetooth writes it from the page).
    if network::camera::is_encode(&message) {
        return connection
            .reply(network::camera::encode_reply(&message))
            .await;
    }
    let outcome = if LIMITS.limited(principal, atome_js_values::dates::now_ms() as i64) {
        Err("network_rate_limited".into())
    } else {
        send_central(&message).await
    };
    connection.reply(network::reply(&message, outcome)).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn osc_is_refused_on_the_central_server() {
        let message = json!({ "action": "send", "protocol": "osc", "address": "10.0.0.2:9000", "path": "/a", "value": 1 });
        assert_eq!(send_central(&message).await.unwrap_err(), OSC_LOCAL_ONLY);
        let answer = network::reply(&message, send_central(&message).await);
        assert_eq!(answer["ok"], json!(false));
        assert_eq!(answer["error"], json!("network_osc_local_only"));
    }

    #[tokio::test]
    async fn the_server_never_reaches_its_own_network() {
        for address in [
            "http://127.0.0.1:3001/",
            "http://10.1.2.3/",
            "http://192.168.1.10:8080/",
            "http://169.254.169.254/latest",
            "http://[::1]:80/",
            "http://localhost:3001/",
        ] {
            let message = json!({ "action": "send", "protocol": "http", "address": address });
            assert_eq!(
                send_central(&message).await.unwrap_err(),
                "network_address_not_public",
                "{address}"
            );
        }
    }
}
