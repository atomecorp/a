//! TLV8, the HomeKit pairing encoding: a type byte, a length byte, at most 255 bytes of value; a longer value is cut
//! into fragments of the same type, put back together when read.

use crate::ScreenError;

pub const METHOD: u8 = 0x00;
pub const IDENTIFIER: u8 = 0x01;
pub const SALT: u8 = 0x02;
pub const PUBLIC_KEY: u8 = 0x03;
pub const PROOF: u8 = 0x04;
pub const ENCRYPTED_DATA: u8 = 0x05;
pub const SEQ_NO: u8 = 0x06;
pub const ERROR: u8 = 0x07;
pub const SIGNATURE: u8 = 0x0a;

/// The entries to write, in order.
pub fn encode(entries: &[(u8, &[u8])]) -> Vec<u8> {
    let mut out = Vec::new();
    for (kind, value) in entries {
        if value.is_empty() {
            out.extend_from_slice(&[*kind, 0]);
        }
        for chunk in value.chunks(255) {
            out.push(*kind);
            out.push(chunk.len() as u8);
            out.extend_from_slice(chunk);
        }
    }
    out
}

/// The entries read, fragments joined.
pub fn decode(bytes: &[u8]) -> Result<Vec<(u8, Vec<u8>)>, ScreenError> {
    let mut entries: Vec<(u8, Vec<u8>)> = Vec::new();
    let mut at = 0;
    let mut last_full = false;
    while at < bytes.len() {
        let header = bytes
            .get(at..at + 2)
            .ok_or(ScreenError::Protocol("tlv8_truncated"))?;
        let (kind, length) = (header[0], header[1] as usize);
        let value = bytes
            .get(at + 2..at + 2 + length)
            .ok_or(ScreenError::Protocol("tlv8_truncated"))?;
        at += 2 + length;
        match entries.last_mut() {
            Some((previous, joined)) if *previous == kind && last_full => {
                joined.extend_from_slice(value)
            }
            _ => entries.push((kind, value.to_vec())),
        }
        last_full = length == 255;
    }
    Ok(entries)
}

/// The value of `kind`, an error naming it when missing; a device's own error entry first.
pub fn take(entries: &[(u8, Vec<u8>)], kind: u8) -> Result<Vec<u8>, ScreenError> {
    if let Some((_, code)) = entries.iter().find(|(entry, _)| *entry == ERROR) {
        return Err(ScreenError::Refused(match code.first() {
            Some(2) => "airplay_wrong_pin".into(),
            Some(3) => "airplay_too_many_tries".into(),
            Some(6) => "airplay_pairing_busy".into(),
            other => format!("airplay_pairing_error_{}", other.copied().unwrap_or(0)),
        }));
    }
    entries
        .iter()
        .find(|(entry, _)| *entry == kind)
        .map(|(_, value)| value.clone())
        .ok_or(ScreenError::Protocol("tlv8_entry_missing"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_long_value_is_fragmented_and_joined() {
        let long = vec![7u8; 600];
        let bytes = encode(&[(SEQ_NO, &[1]), (PUBLIC_KEY, &long), (SALT, &[9; 16])]);
        let entries = decode(&bytes).unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(take(&entries, PUBLIC_KEY).unwrap(), long);
        assert_eq!(take(&entries, SALT).unwrap(), vec![9; 16]);
    }

    #[test]
    fn a_device_error_is_named() {
        let entries = decode(&encode(&[(SEQ_NO, &[4]), (ERROR, &[2])])).unwrap();
        assert_eq!(
            take(&entries, PROOF),
            Err(ScreenError::Refused("airplay_wrong_pin".into()))
        );
    }
}
