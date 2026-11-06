// The mail protocols' connection (atome/src/squirrel/mail/mail_socket.js): TCP, TLS from the first
// byte when the transport says `tls` or `ssl`, plain until the protocol clients' own STARTTLS step for
// `starttls`, and refused for any other security (clear text, `mail_security_cleartext_refused`: user
// decision, 2026-11-06), read by lines and by byte counts. Every wait is bounded by the 15 s idle
// timeout; a certificate is always verified, against the system's roots, for the host's name (none
// for an address, verified against the address). As in Node, a read that finds the connection ended,
// broken or idle answers `socket_closed` once what arrived before is read; only the connection itself
// times out as `socket_timeout`.
use crate::vault_router::js;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_rustls::rustls::ClientConfig;
use tokio_rustls::rustls::pki_types::ServerName;
use tokio_rustls::{TlsConnector, client::TlsStream};

const IDLE: Duration = Duration::from_millis(15_000);

/// A mail never travels in clear text: the refusal of a `none` (or unknown) security.
pub const CLEARTEXT_REFUSED: &str = "mail_security_cleartext_refused";

/// Where a protocol client connects: `security` `tls` or `ssl` (implicit TLS) or `starttls`.
#[derive(Clone, Debug)]
pub struct Transport {
    pub host: String,
    pub port: f64,
    pub security: String,
}

/// The TLS client of every mail connection: the system's roots, TLS 1.2 and 1.3 (Node's defaults).
pub fn tls_config() -> Result<Arc<ClientConfig>, String> {
    crate::tls::client_config(&[]).map_err(|error| format!("mail_{error}"))
}

// `isIpLikeHost`: a dotted quad of 1 to 3 digits, or anything with a colon.
fn ip_like(host: &str) -> bool {
    let quad = host.split('.').collect::<Vec<_>>();
    host.contains(':')
        || (quad.len() == 4
            && quad.iter().all(|part| {
                (1..=3).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_digit())
            }))
}

// The name a certificate must carry: the host, or its address when it is one. A STARTTLS upgrade
// names no host to Node's TLS, which then checks the certificate against `localhost`.
fn server_name(host: &str, upgrade: bool) -> Result<ServerName<'static>, String> {
    if ip_like(host) {
        if upgrade {
            return ServerName::try_from("localhost").map_err(|e| e.to_string());
        }
        let address: IpAddr = host
            .trim_matches(['[', ']'])
            .parse()
            .map_err(|_| format!("getaddrinfo ENOTFOUND {host}"))?;
        return Ok(ServerName::IpAddress(address.into()));
    }
    ServerName::try_from(host.to_string()).map_err(|error| error.to_string())
}

enum Stream {
    Plain(TcpStream),
    Tls(Box<TlsStream<TcpStream>>),
    Gone,
}

/// `BufferedSocket`: what arrived and was not read yet, and whether the connection ended.
pub struct Socket {
    stream: Stream,
    buffer: Vec<u8>,
    ended: bool,
    tls: Arc<ClientConfig>,
}

async fn handshake(
    tls: &Arc<ClientConfig>,
    name: ServerName<'static>,
    tcp: TcpStream,
) -> Result<TlsStream<TcpStream>, String> {
    TlsConnector::from(tls.clone())
        .connect(name, tcp)
        .await
        .map_err(|error| error.to_string())
}

/// `connectSocket(transport)`.
pub async fn connect(transport: &Transport, tls: &Arc<ClientConfig>) -> Result<Socket, String> {
    let security = js::trim(&transport.security).to_lowercase();
    if !["tls", "ssl", "starttls"].contains(&security.as_str()) {
        return Err(CLEARTEXT_REFUSED.into());
    }
    let port = transport.port;
    if !(port.fract() == 0.0 && (0.0..65536.0).contains(&port)) {
        return Err(format!(
            "Port should be >= 0 and < 65536. Received type number ({}).",
            js::string(&js::number_json(port))
        ));
    }
    let host = transport.host.clone();
    let port = port as u16;
    let opened = timeout(IDLE, async {
        let addresses = tokio::net::lookup_host((host.as_str(), port))
            .await
            .map_err(|_| format!("getaddrinfo ENOTFOUND {host}"))?;
        let mut failure = format!("getaddrinfo ENOTFOUND {host}");
        for address in addresses {
            match TcpStream::connect(address).await {
                Ok(tcp) => return Ok(tcp),
                Err(error) if error.kind() == std::io::ErrorKind::ConnectionRefused => {
                    failure = format!("connect ECONNREFUSED {address}");
                }
                Err(error) => failure = format!("connect {error}"),
            }
        }
        Err(failure)
    });
    let tcp = opened.await.map_err(|_| "socket_timeout".to_string())??;
    let stream = if security == "tls" || security == "ssl" {
        let name = server_name(&transport.host, false)?;
        let secured = timeout(IDLE, handshake(tls, name, tcp))
            .await
            .map_err(|_| "socket_timeout".to_string())??;
        Stream::Tls(Box::new(secured))
    } else {
        Stream::Plain(tcp)
    };
    Ok(Socket {
        stream,
        buffer: Vec::new(),
        ended: false,
        tls: tls.clone(),
    })
}

impl Socket {
    // One more chunk into the buffer; the connection's end, its failure or its idleness ends it.
    async fn fill(&mut self) {
        let mut chunk = vec![0; 16 * 1024];
        let read = match &mut self.stream {
            Stream::Plain(tcp) => timeout(IDLE, tcp.read(&mut chunk)).await,
            Stream::Tls(tls) => timeout(IDLE, tls.read(&mut chunk)).await,
            Stream::Gone => Ok(Ok(0)),
        };
        match read {
            Ok(Ok(count)) if count > 0 => self.buffer.extend_from_slice(&chunk[..count]),
            _ => self.ended = true,
        }
    }

    /// `readLine()`: the next line without its `\r\n`, as UTF-8; at the end, what is left.
    pub async fn read_line(&mut self) -> Result<String, String> {
        while !self.buffer.contains(&b'\n') && !self.ended {
            self.fill().await;
        }
        let line = match self.buffer.iter().position(|byte| *byte == b'\n') {
            Some(end) => {
                let line = self.buffer[..end].to_vec();
                self.buffer.drain(..=end);
                line
            }
            None if self.buffer.is_empty() => return Err("socket_closed".into()),
            None => std::mem::take(&mut self.buffer),
        };
        let text = String::from_utf8_lossy(&line).into_owned();
        Ok(text.strip_suffix('\r').map(str::to_string).unwrap_or(text))
    }

    /// `readBytes(length)`.
    pub async fn read_bytes(&mut self, length: usize) -> Result<Vec<u8>, String> {
        while self.buffer.len() < length && !self.ended {
            self.fill().await;
        }
        if self.buffer.len() < length {
            return Err(format!("socket_closed_before_{length}_bytes"));
        }
        Ok(self.buffer.drain(..length).collect())
    }

    pub async fn write(&mut self, data: &[u8]) -> Result<(), String> {
        let written = match &mut self.stream {
            Stream::Plain(tcp) => timeout(IDLE, tcp.write_all(data)).await,
            Stream::Tls(tls) => {
                timeout(IDLE, async {
                    tls.write_all(data).await?;
                    tls.flush().await
                })
                .await
            }
            Stream::Gone => return Err("This socket has been ended by the other party".into()),
        };
        written
            .map_err(|_| "socket_timeout".to_string())?
            .map_err(|error| error.to_string())
    }

    /// `upgradeToTls`: the same connection, now TLS (STARTTLS). Bytes the server sent after its
    /// go-ahead would be read as if they came through TLS (a command injection): refused.
    pub async fn upgrade(&mut self, host: &str) -> Result<(), String> {
        if !self.buffer.is_empty() {
            return Err("tls_upgrade_unexpected_data".into());
        }
        let Stream::Plain(tcp) = std::mem::replace(&mut self.stream, Stream::Gone) else {
            return Err("socket_closed".into());
        };
        let name = server_name(host, true)?;
        let secured = timeout(IDLE, handshake(&self.tls, name, tcp))
            .await
            .map_err(|_| {
                "Client network socket disconnected before secure TLS connection was established"
                    .to_string()
            })??;
        self.stream = Stream::Tls(Box::new(secured));
        self.ended = false;
        Ok(())
    }

    /// `end()`: the connection closed on this side (TLS's close_notify first).
    pub async fn end(&mut self) {
        let _ = match &mut self.stream {
            Stream::Plain(tcp) => timeout(IDLE, tcp.shutdown()).await,
            Stream::Tls(tls) => timeout(IDLE, tls.shutdown()).await,
            Stream::Gone => Ok(Ok(())),
        };
        self.stream = Stream::Gone;
    }
}
