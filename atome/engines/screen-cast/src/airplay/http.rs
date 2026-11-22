//! The AirPlay control connection: HTTP/1.1 and RTSP/1.0 messages on one TCP stream, plain while pairing, framed
//! and encrypted once verified (crypto.rs#FrameCipher). The device's event channel uses the same messages the
//! other way round: it asks, this side answers.

use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use super::crypto::FrameCipher;
use crate::ScreenError;

const ANSWER_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_HEAD: usize = 16 * 1024;
const MAX_BODY: usize = 4 * 1024 * 1024;

/// A message read: its first line, its headers, its body.
#[derive(Debug, Default)]
pub struct Message {
    pub first_line: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Message {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    /// The status code of a response line ("RTSP/1.0 200 OK").
    pub fn status(&self) -> u16 {
        self.first_line
            .split(' ')
            .nth(1)
            .and_then(|code| code.parse().ok())
            .unwrap_or(0)
    }
}

pub struct Connection<S> {
    stream: S,
    write: Option<FrameCipher>,
    read: Option<FrameCipher>,
    sealed: Vec<u8>,
    plain: Vec<u8>,
}

impl<S: AsyncRead + AsyncWrite + Unpin> Connection<S> {
    pub fn new(stream: S) -> Self {
        Connection {
            stream,
            write: None,
            read: None,
            sealed: Vec::new(),
            plain: Vec::new(),
        }
    }

    /// From now on, every byte is framed and encrypted (after pair-verify).
    pub fn encrypt(&mut self, write: [u8; 32], read: [u8; 32]) {
        self.write = Some(FrameCipher::new(write));
        self.read = Some(FrameCipher::new(read));
    }

    async fn send_bytes(&mut self, bytes: &[u8]) -> Result<(), ScreenError> {
        let wire = match self.write.as_mut() {
            Some(cipher) => cipher.encrypt(bytes),
            None => bytes.to_vec(),
        };
        self.stream
            .write_all(&wire)
            .await
            .map_err(|error| ScreenError::Io(error.to_string()))
    }

    /// Writes one message: `first_line`, `headers` in order, a Content-Length when `body` is not empty.
    pub async fn write_message(
        &mut self,
        first_line: &str,
        headers: &[(&str, String)],
        body: &[u8],
    ) -> Result<(), ScreenError> {
        let mut head = format!("{first_line}\r\n");
        for (name, value) in headers {
            head.push_str(&format!("{name}: {value}\r\n"));
        }
        if !body.is_empty() {
            head.push_str(&format!("Content-Length: {}\r\n", body.len()));
        }
        head.push_str("\r\n");
        let mut bytes = head.into_bytes();
        bytes.extend_from_slice(body);
        self.send_bytes(&bytes).await
    }

    async fn fill(&mut self) -> Result<(), ScreenError> {
        let mut chunk = [0u8; 4096];
        let read = self
            .stream
            .read(&mut chunk)
            .await
            .map_err(|error| ScreenError::Io(error.to_string()))?;
        if read == 0 {
            return Err(ScreenError::Unreachable("airplay_connection_closed".into()));
        }
        match self.read.as_mut() {
            Some(cipher) => {
                self.sealed.extend_from_slice(&chunk[..read]);
                let plain = cipher.decrypt(&mut self.sealed)?;
                self.plain.extend_from_slice(&plain);
            }
            None => self.plain.extend_from_slice(&chunk[..read]),
        }
        Ok(())
    }

    /// The next whole message.
    pub async fn read_message(&mut self) -> Result<Message, ScreenError> {
        let end = loop {
            if let Some(at) = self
                .plain
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
            {
                break at;
            }
            if self.plain.len() > MAX_HEAD {
                return Err(ScreenError::Protocol("airplay_head_too_long"));
            }
            self.fill().await?;
        };
        let head = String::from_utf8_lossy(&self.plain[..end]).to_string();
        let mut lines = head.split("\r\n");
        let mut message = Message {
            first_line: lines.next().unwrap_or_default().to_string(),
            ..Message::default()
        };
        message.headers = lines
            .filter_map(|line| {
                line.split_once(':')
                    .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
            })
            .collect();
        let length: usize = message
            .header("Content-Length")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        if length > MAX_BODY {
            return Err(ScreenError::Protocol("airplay_body_too_long"));
        }
        while self.plain.len() < end + 4 + length {
            self.fill().await?;
        }
        message.body = self.plain[end + 4..end + 4 + length].to_vec();
        self.plain.drain(..end + 4 + length);
        Ok(message)
    }

    /// A request and its response, within the answer timeout.
    pub async fn exchange(
        &mut self,
        first_line: &str,
        headers: &[(&str, String)],
        body: &[u8],
    ) -> Result<Message, ScreenError> {
        self.write_message(first_line, headers, body).await?;
        tokio::time::timeout(ANSWER_TIMEOUT, self.read_message())
            .await
            .map_err(|_| ScreenError::Unreachable("airplay_device_silent".into()))?
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn an_encrypted_exchange_reads_the_answer_and_its_body() {
        let (client, server) = duplex(1 << 16);
        let (mut left, mut right) = (Connection::new(client), Connection::new(server));
        left.encrypt([1; 32], [2; 32]);
        right.encrypt([2; 32], [1; 32]);
        let device = tokio::spawn(async move {
            let request = right.read_message().await.unwrap();
            right
                .write_message(
                    "RTSP/1.0 200 OK",
                    &[("CSeq", request.header("CSeq").unwrap().to_string())],
                    &[5u8; 3000],
                )
                .await
                .unwrap();
            request
        });
        let answer = left
            .exchange(
                "SETUP rtsp://10.0.0.2/1 RTSP/1.0",
                &[("CSeq", "0".into())],
                b"plist",
            )
            .await
            .unwrap();
        assert_eq!(answer.status(), 200);
        assert_eq!(answer.body, vec![5u8; 3000]);
        let request = device.await.unwrap();
        assert_eq!(request.first_line, "SETUP rtsp://10.0.0.2/1 RTSP/1.0");
        assert_eq!(request.body, b"plist");
    }
}
