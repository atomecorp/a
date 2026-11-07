// The TLS client of every outgoing connection (HTTP clients, WebSockets, mail):
// the system's root authorities, TLS 1.2 and 1.3, verified with ring. Each
// client receives these roots explicitly; nothing reads them from the process
// environment. Android gives native code no root store rustls-native-certs
// knows: its authorities are one PEM file each in the Conscrypt APEX (updated
// by the system) or under /system on older releases, read there directly. iOS
// gives native code no root store to read at all (rustls-native-certs finds none
// there): its roots are Mozilla's, shipped with the app as the browsers carry them.

use std::sync::Arc;
use tokio_rustls::rustls::{self, ClientConfig, RootCertStore};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Response;
use tokio_tungstenite::tungstenite::protocol::WebSocketConfig;
use tokio_tungstenite::{Connector, MaybeTlsStream, WebSocketStream};

pub type WsStream = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

#[cfg(target_os = "android")]
const ANDROID_CA_DIRS: [&str; 2] = [
    "/apex/com.android.conscrypt/cacerts",
    "/system/etc/security/cacerts",
];

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn system_roots() -> rustls_native_certs::CertificateResult {
    rustls_native_certs::load_native_certs()
}

#[cfg(target_os = "ios")]
fn system_roots() -> rustls_native_certs::CertificateResult {
    let mut roots = rustls_native_certs::CertificateResult::default();
    roots
        .certs
        .extend_from_slice(webpki_root_certs::TLS_SERVER_ROOT_CERTS);
    roots
}

#[cfg(target_os = "android")]
fn system_roots() -> rustls_native_certs::CertificateResult {
    let dir = ANDROID_CA_DIRS
        .iter()
        .map(std::path::Path::new)
        .find(|dir| dir.is_dir());
    rustls_native_certs::load_certs_from_paths(None, dir)
}

// `alpn`: the protocols offered, in order (HTTP: h2 then http/1.1; WebSocket: none).
pub fn client_config(alpn: &[&[u8]]) -> Result<Arc<ClientConfig>, String> {
    let mut roots = RootCertStore::empty();
    roots.add_parsable_certificates(system_roots().certs);
    if roots.is_empty() {
        return Err("tls_roots_missing".into());
    }
    let mut config =
        ClientConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .with_safe_default_protocol_versions()
            .map_err(|error| error.to_string())?
            .with_root_certificates(roots)
            .with_no_client_auth();
    config.alpn_protocols = alpn.iter().map(|protocol| protocol.to_vec()).collect();
    Ok(Arc::new(config))
}

/// An HTTP client builder on the system's roots, HTTP/2 offered as reqwest offers it.
pub fn http_client() -> Result<reqwest::ClientBuilder, String> {
    let config = client_config(&[b"h2", b"http/1.1"])?;
    Ok(reqwest::Client::builder().use_preconfigured_tls(ClientConfig::clone(&config)))
}

/// A WebSocket (`ws:` plain, `wss:` on the system's roots).
pub async fn connect_ws<R: IntoClientRequest + Unpin>(
    request: R,
    config: Option<WebSocketConfig>,
) -> Result<(WsStream, Response), String> {
    let tls = client_config(&[])?;
    tokio_tungstenite::connect_async_tls_with_config(
        request,
        config,
        false,
        Some(Connector::Rustls(tls)),
    )
    .await
    .map_err(|error| error.to_string())
}
