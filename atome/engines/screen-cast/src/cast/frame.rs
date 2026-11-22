//! The Cast v2 wire message (`CastMessage` of Google's `cast_channel.proto`): a 4-byte big-endian length, then the
//! protobuf message. Only the string payload is used (every channel this crate speaks carries JSON), so the seven
//! fields are written and read by hand: no protobuf compiler, no generated code.

use crate::ScreenError;

/// One message of a virtual connection: `namespace` names the channel, `payload` is its JSON text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CastMessage {
    pub source: String,
    pub destination: String,
    pub namespace: String,
    pub payload: String,
}

/// The largest message a receiver may send (the protocol's own limit, 64 KiB).
pub const MAX_MESSAGE: usize = 65_536;

fn varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        out.push((value as u8) | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

fn text_field(out: &mut Vec<u8>, number: u64, text: &str) {
    varint(out, (number << 3) | 2);
    varint(out, text.len() as u64);
    out.extend_from_slice(text.as_bytes());
}

impl CastMessage {
    /// The framed bytes: length prefix, then protocol_version 0 (CASTV2_1_0), the ids, the namespace,
    /// payload_type 0 (STRING) and payload_utf8.
    pub fn encode(&self) -> Vec<u8> {
        let mut body = Vec::with_capacity(64 + self.payload.len());
        varint(&mut body, 1 << 3);
        varint(&mut body, 0);
        text_field(&mut body, 2, &self.source);
        text_field(&mut body, 3, &self.destination);
        text_field(&mut body, 4, &self.namespace);
        varint(&mut body, 5 << 3);
        varint(&mut body, 0);
        text_field(&mut body, 6, &self.payload);
        let mut framed = (body.len() as u32).to_be_bytes().to_vec();
        framed.extend_from_slice(&body);
        framed
    }

    /// One message from its protobuf body (without the length prefix). A binary payload (field 7) is refused.
    pub fn decode(body: &[u8]) -> Result<Self, ScreenError> {
        let mut message = CastMessage {
            source: String::new(),
            destination: String::new(),
            namespace: String::new(),
            payload: String::new(),
        };
        let mut at = 0;
        let read_varint = |at: &mut usize| -> Result<u64, ScreenError> {
            let mut value = 0u64;
            for shift in (0..64).step_by(7) {
                let byte = *body
                    .get(*at)
                    .ok_or(ScreenError::Protocol("cast_message_truncated"))?;
                *at += 1;
                value |= u64::from(byte & 0x7f) << shift;
                if byte & 0x80 == 0 {
                    return Ok(value);
                }
            }
            Err(ScreenError::Protocol("cast_varint_too_long"))
        };
        while at < body.len() {
            let key = read_varint(&mut at)?;
            let (number, wire) = (key >> 3, key & 7);
            match wire {
                0 => {
                    read_varint(&mut at)?;
                }
                2 => {
                    let length = read_varint(&mut at)? as usize;
                    let end = at
                        .checked_add(length)
                        .filter(|end| *end <= body.len())
                        .ok_or(ScreenError::Protocol("cast_field_truncated"))?;
                    let bytes = &body[at..end];
                    at = end;
                    let text = || {
                        String::from_utf8(bytes.to_vec())
                            .map_err(|_| ScreenError::Protocol("cast_field_not_utf8"))
                    };
                    match number {
                        2 => message.source = text()?,
                        3 => message.destination = text()?,
                        4 => message.namespace = text()?,
                        6 => message.payload = text()?,
                        7 => return Err(ScreenError::Protocol("cast_binary_payload")),
                        _ => {}
                    }
                }
                _ => return Err(ScreenError::Protocol("cast_wire_type")),
            }
        }
        Ok(message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_message_round_trips() {
        let message = CastMessage {
            source: "sender-0".into(),
            destination: "receiver-0".into(),
            namespace: "urn:x-cast:com.google.cast.tp.connection".into(),
            payload: "{\"type\":\"CONNECT\"}".repeat(20),
        };
        let framed = message.encode();
        let length = u32::from_be_bytes([framed[0], framed[1], framed[2], framed[3]]) as usize;
        assert_eq!(length, framed.len() - 4);
        assert_eq!(CastMessage::decode(&framed[4..]).unwrap(), message);
    }
}
