//! The HomeKit primitives of an AirPlay session: HKDF-SHA512 keys, ChaCha20-Poly1305 with the 8-byte nonces of the
//! pairing messages ("PS-Msg05", "PV-Msg02"…), and the framed encryption of a verified connection: plaintext cut
//! into blocks of at most 1024 bytes, each sent as its 2-byte little-endian length (the AAD), the ciphertext and its
//! 16-byte tag, under a per-direction counter nonce.

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
use hkdf::Hkdf;
use sha2::Sha512;

use crate::ScreenError;

pub const FRAME_LENGTH: usize = 1024;
pub const TAG_LENGTH: usize = 16;

/// 32 bytes of HKDF-SHA512 from `secret`.
pub fn derive(salt: &str, info: &str, secret: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    Hkdf::<Sha512>::new(Some(salt.as_bytes()), secret)
        .expand(info.as_bytes(), &mut key)
        .expect("32 bytes is a valid HKDF-SHA512 length");
    key
}

fn nonce(eight: [u8; 8]) -> [u8; 12] {
    let mut full = [0u8; 12];
    full[4..].copy_from_slice(&eight);
    full
}

fn label(text: &str) -> [u8; 8] {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&text.as_bytes()[..8]);
    bytes
}

pub fn seal(key: &[u8; 32], eight: [u8; 8], aad: &[u8], plain: &[u8]) -> Vec<u8> {
    ChaCha20Poly1305::new(Key::from_slice(key))
        .encrypt(
            Nonce::from_slice(&nonce(eight)),
            Payload { msg: plain, aad },
        )
        .expect("ChaCha20-Poly1305 encryption of a bounded message")
}

pub fn open(
    key: &[u8; 32],
    eight: [u8; 8],
    aad: &[u8],
    sealed: &[u8],
) -> Result<Vec<u8>, ScreenError> {
    ChaCha20Poly1305::new(Key::from_slice(key))
        .decrypt(
            Nonce::from_slice(&nonce(eight)),
            Payload { msg: sealed, aad },
        )
        .map_err(|_| ScreenError::Refused("airplay_decrypt_failed".into()))
}

/// A pairing message's own nonce ("PS-Msg05" and its kin).
pub fn seal_message(key: &[u8; 32], name: &str, plain: &[u8]) -> Vec<u8> {
    seal(key, label(name), &[], plain)
}

pub fn open_message(key: &[u8; 32], name: &str, sealed: &[u8]) -> Result<Vec<u8>, ScreenError> {
    open(key, label(name), &[], sealed)
}

/// One direction of a verified connection.
pub struct FrameCipher {
    key: [u8; 32],
    counter: u64,
}

impl FrameCipher {
    pub fn new(key: [u8; 32]) -> Self {
        FrameCipher { key, counter: 0 }
    }

    fn next(&mut self) -> [u8; 8] {
        let nonce = self.counter.to_le_bytes();
        self.counter += 1;
        nonce
    }

    /// `plain` as frames.
    pub fn encrypt(&mut self, plain: &[u8]) -> Vec<u8> {
        let mut out =
            Vec::with_capacity(plain.len() + plain.len().div_ceil(FRAME_LENGTH) * (2 + TAG_LENGTH));
        for block in plain.chunks(FRAME_LENGTH) {
            let length = (block.len() as u16).to_le_bytes();
            let nonce = self.next();
            out.extend_from_slice(&length);
            out.extend_from_slice(&seal(&self.key, nonce, &length, block));
        }
        out
    }

    /// The plaintext of every whole frame at the start of `buffer`, the frames taken out of it.
    pub fn decrypt(&mut self, buffer: &mut Vec<u8>) -> Result<Vec<u8>, ScreenError> {
        let mut plain = Vec::new();
        loop {
            if buffer.len() < 2 {
                return Ok(plain);
            }
            let length = u16::from_le_bytes([buffer[0], buffer[1]]) as usize;
            if length > FRAME_LENGTH {
                return Err(ScreenError::Protocol("airplay_frame_too_long"));
            }
            if buffer.len() < 2 + length + TAG_LENGTH {
                return Ok(plain);
            }
            let frame: Vec<u8> = buffer.drain(..2 + length + TAG_LENGTH).collect();
            let nonce = self.next();
            plain.extend_from_slice(&open(&self.key, nonce, &frame[..2], &frame[2..])?);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_round_trip_across_blocks_and_partial_reads() {
        let key = derive("Control-Salt", "Control-Write-Encryption-Key", b"shared");
        let (mut writer, mut reader) = (FrameCipher::new(key), FrameCipher::new(key));
        let text: Vec<u8> = (0..2500u32).map(|value| value as u8).collect();
        let sealed = writer.encrypt(&text);
        assert_eq!(sealed.len(), text.len() + 3 * (2 + TAG_LENGTH));
        let mut buffer = sealed[..1100].to_vec();
        let mut plain = reader.decrypt(&mut buffer).unwrap();
        buffer.extend_from_slice(&sealed[1100..]);
        plain.extend(reader.decrypt(&mut buffer).unwrap());
        assert_eq!(plain, text);
        assert!(buffer.is_empty());
    }

    #[test]
    fn a_message_nonce_is_its_name() {
        let key = [9u8; 32];
        let sealed = seal_message(&key, "PS-Msg05", b"inner");
        assert_eq!(open_message(&key, "PS-Msg05", &sealed).unwrap(), b"inner");
        assert!(open_message(&key, "PS-Msg06", &sealed).is_err());
    }
}
