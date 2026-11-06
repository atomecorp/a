// The binary frames between the supervisor and a vault process, and between
// Fastify and the supervisor: a `u32` big-endian length of what follows, a `u64`
// request id, a one-byte tag, the body. One connection carries many requests at
// once; a reply names the request it answers.
use serde_json::Value as JsonValue;
use std::io::{self, Read, Write};

// An operation for the vault the connection serves: `u16` operation length, the
// operation, its JSON payload.
pub const REQUEST: u8 = 1;
// The operation's JSON result.
pub const RESULT: u8 = 2;
// The operation's refusal, an error code in UTF-8.
pub const FAILURE: u8 = 3;
// An operation for one principal's vault: `u16` principal length, the principal,
// then a request body.
pub const ROUTED: u8 = 4;
// An operation of the supervisor itself (its vault router, `router:<name>`): a
// request body.
pub const SERVICE: u8 = 5;

// Id and tag.
pub const HEAD_BYTES: usize = 9;
// The vault process's request bound (Fastify's vault socket refused more).
pub const MAX_REQUEST_BYTES: usize = 2_000_000;
// A reply is bounded by its operation (a stream batch: 8 MB and one event).
pub const MAX_REPLY_BYTES: usize = 256 * 1024 * 1024;

pub struct Frame {
    pub id: u64,
    pub tag: u8,
    pub body: Vec<u8>,
}

impl Frame {
    pub fn encode(&self) -> Vec<u8> {
        let length = (HEAD_BYTES + self.body.len()) as u32;
        let mut bytes = Vec::with_capacity(4 + length as usize);
        bytes.extend_from_slice(&length.to_be_bytes());
        bytes.extend_from_slice(&self.id.to_be_bytes());
        bytes.push(self.tag);
        bytes.extend_from_slice(&self.body);
        bytes
    }

    // `content` is what follows the length.
    pub fn decode(content: Vec<u8>) -> Result<Frame, String> {
        if content.len() < HEAD_BYTES {
            return Err("vault_frame_invalid".into());
        }
        let id = u64::from_be_bytes(content[..8].try_into().expect("eight bytes"));
        let tag = content[8];
        let body = content[HEAD_BYTES..].to_vec();
        Ok(Frame { id, tag, body })
    }
}

// The length a frame announces, checked against the reader's bound.
pub fn content_length(prefix: [u8; 4], max_body: usize) -> Result<usize, String> {
    let length = u32::from_be_bytes(prefix) as usize;
    if length < HEAD_BYTES {
        return Err("vault_frame_invalid".into());
    }
    if length - HEAD_BYTES > max_body {
        return Err("vault_request_too_large".into());
    }
    Ok(length)
}

fn invalid(error: String) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error)
}

// The next frame, or `None` when the other end closed between frames.
pub fn read(reader: &mut impl Read, max_body: usize) -> io::Result<Option<Frame>> {
    let mut prefix = [0u8; 4];
    match reader.read_exact(&mut prefix) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error),
    }
    let mut content = vec![0u8; content_length(prefix, max_body).map_err(invalid)?];
    reader.read_exact(&mut content)?;
    Frame::decode(content).map(Some).map_err(invalid)
}

pub fn write(writer: &mut impl Write, frame: &Frame) -> io::Result<()> {
    writer.write_all(&frame.encode())?;
    writer.flush()
}

fn prefixed(text: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(2 + text.len());
    bytes.extend_from_slice(&(text.len() as u16).to_be_bytes());
    bytes.extend_from_slice(text.as_bytes());
    bytes
}

// A text and what follows it.
fn split_prefixed(body: &[u8]) -> Result<(&str, &[u8]), String> {
    let invalid = || "vault_frame_invalid".to_string();
    let length = u16::from_be_bytes(
        body.get(..2)
            .ok_or_else(invalid)?
            .try_into()
            .expect("two bytes"),
    ) as usize;
    let text = body.get(2..2 + length).ok_or_else(invalid)?;
    let text = std::str::from_utf8(text).map_err(|_| invalid())?;
    Ok((text, &body[2 + length..]))
}

pub fn request_body(operation: &str, payload: &[u8]) -> Vec<u8> {
    let mut body = prefixed(operation);
    body.extend_from_slice(payload);
    body
}

// The operation and its payload (an empty payload is `{}`).
pub fn parse_request(body: &[u8]) -> Result<(&str, JsonValue), String> {
    let (operation, payload) = split_prefixed(body)?;
    if payload.is_empty() {
        return Ok((operation, JsonValue::Object(Default::default())));
    }
    let payload =
        serde_json::from_slice(payload).map_err(|_| "vault_payload_invalid".to_string())?;
    Ok((operation, payload))
}

pub fn routed_body(principal: &str, request: &[u8]) -> Vec<u8> {
    let mut body = prefixed(principal);
    body.extend_from_slice(request);
    body
}

// The principal and its request body.
pub fn parse_routed(body: &[u8]) -> Result<(&str, &[u8]), String> {
    split_prefixed(body)
}
