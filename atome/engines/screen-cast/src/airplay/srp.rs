//! The client side of SRP-6a as HomeKit pairing uses it: the 3072-bit group of RFC 5054 (generator 5), SHA-512,
//! user "Pair-Setup", the PIN shown on the television as password.

use num_bigint::BigUint;
use sha2::{Digest, Sha512};

use crate::ScreenError;

pub(crate) const PRIME_3072: &str = concat!(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD",
    "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED",
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F",
    "83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B",
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510",
    "15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7",
    "ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C",
    "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF"
);
pub(crate) const GENERATOR: u32 = 5;
pub const USERNAME: &[u8] = b"Pair-Setup";
const LENGTH: usize = 384;

pub(crate) fn hash(parts: &[&[u8]]) -> Vec<u8> {
    let mut digest = Sha512::new();
    parts.iter().for_each(|part| digest.update(part));
    digest.finalize().to_vec()
}

pub(crate) fn pad(value: &BigUint) -> Vec<u8> {
    let bytes = value.to_bytes_be();
    let mut padded = vec![0u8; LENGTH.saturating_sub(bytes.len())];
    padded.extend_from_slice(&bytes);
    padded
}

/// What the client sends in M3 and keeps: its public value A, its proof M1 and the session key K.
pub struct ClientProof {
    pub public: Vec<u8>,
    pub proof: Vec<u8>,
    pub session_key: Vec<u8>,
}

/// The client's answer to the device's `salt` and public value `server_public`, for `pin`, from the secret `private`.
pub fn answer(
    pin: &str,
    salt: &[u8],
    server_public: &[u8],
    private: &[u8],
) -> Result<ClientProof, ScreenError> {
    let n = BigUint::parse_bytes(PRIME_3072.as_bytes(), 16)
        .ok_or(ScreenError::Protocol("srp_prime"))?;
    let g = BigUint::from(GENERATOR);
    let b = BigUint::from_bytes_be(server_public);
    if &b % &n == BigUint::ZERO {
        return Err(ScreenError::Protocol("srp_server_public_zero"));
    }
    let a = BigUint::from_bytes_be(private);
    let public = g.modpow(&a, &n);
    let k = BigUint::from_bytes_be(&hash(&[&n.to_bytes_be(), &pad(&g)]));
    let u = BigUint::from_bytes_be(&hash(&[&pad(&public), &pad(&b)]));
    let x = BigUint::from_bytes_be(&hash(&[salt, &hash(&[USERNAME, b":", pin.as_bytes()])]));
    // S = (B - k·g^x) ^ (a + u·x) mod N, kept positive.
    let base = (&b + &n * &k - (&k * g.modpow(&x, &n)) % &n) % &n;
    let secret = base.modpow(&(&a + &u * &x), &n);
    let session_key = hash(&[&secret.to_bytes_be()]);
    let group: Vec<u8> = hash(&[&n.to_bytes_be()])
        .iter()
        .zip(hash(&[&g.to_bytes_be()]))
        .map(|(left, right)| left ^ right)
        .collect();
    let proof = hash(&[
        &group,
        &hash(&[USERNAME]),
        salt,
        &public.to_bytes_be(),
        &b.to_bytes_be(),
        &session_key,
    ]);
    Ok(ClientProof {
        public: public.to_bytes_be(),
        proof,
        session_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A device's side of the same exchange, written from the protocol's equations, must reach the same key.
    #[test]
    fn client_and_device_reach_the_same_key() {
        let n = BigUint::parse_bytes(PRIME_3072.as_bytes(), 16).unwrap();
        let g = BigUint::from(GENERATOR);
        let (salt, pin) = ([3u8; 16], "1234");
        let x = BigUint::from_bytes_be(&hash(&[&salt, &hash(&[USERNAME, b":", pin.as_bytes()])]));
        let verifier = g.modpow(&x, &n);
        let device_secret = BigUint::from_bytes_be(&[0x42; 32]);
        let k = BigUint::from_bytes_be(&hash(&[&n.to_bytes_be(), &pad(&g)]));
        let device_public = (&k * &verifier + g.modpow(&device_secret, &n)) % &n;
        let client = answer(pin, &salt, &device_public.to_bytes_be(), &[0x17; 32]).unwrap();
        let a = BigUint::from_bytes_be(&client.public);
        let u = BigUint::from_bytes_be(&hash(&[&pad(&a), &pad(&device_public)]));
        let device_s = (&a * verifier.modpow(&u, &n)).modpow(&device_secret, &n);
        assert_eq!(hash(&[&device_s.to_bytes_be()]), client.session_key);
    }
}
