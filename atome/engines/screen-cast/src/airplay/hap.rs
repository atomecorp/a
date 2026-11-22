//! HomeKit pairing of an AirPlay receiver. Pair-setup, once: the television shows a PIN (`/pair-pin-start`), the
//! person says or types it, and both sides exchange long-term Ed25519 keys (M1–M6), which are the screen's
//! credentials. Pair-verify, at every connection: an X25519 exchange signed with those keys gives the secret the
//! connection is then encrypted with.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use rand::RngCore;
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncWrite};

use super::crypto::{derive, open_message, seal_message};
use super::http::Connection;
use super::{srp, tlv8};
use crate::ScreenError;

/// What pair-setup leaves for later connections: this side's id and Ed25519 seed, the device's id and public key.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AirplayCredentials {
    pub client_id: String,
    pub client_secret: String,
    pub device_id: String,
    pub device_public: String,
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn unhex(text: &str) -> Result<Vec<u8>, ScreenError> {
    if !text.len().is_multiple_of(2) {
        return Err(ScreenError::Protocol("credentials_hex"));
    }
    (0..text.len())
        .step_by(2)
        .map(|at| {
            u8::from_str_radix(&text[at..at + 2], 16)
                .map_err(|_| ScreenError::Protocol("credentials_hex"))
        })
        .collect()
}

fn key32(bytes: &[u8]) -> Result<[u8; 32], ScreenError> {
    bytes
        .try_into()
        .map_err(|_| ScreenError::Protocol("airplay_key_length"))
}

fn headers() -> Vec<(&'static str, String)> {
    vec![
        ("User-Agent", "AirPlay/320.20".into()),
        ("Connection", "keep-alive".into()),
        ("X-Apple-HKP", "3".into()),
        ("Content-Type", "application/octet-stream".into()),
    ]
}

async fn post<S: AsyncRead + AsyncWrite + Unpin>(
    connection: &mut Connection<S>,
    path: &str,
    body: &[u8],
) -> Result<Vec<(u8, Vec<u8>)>, ScreenError> {
    let answer = connection
        .exchange(&format!("POST {path} HTTP/1.1"), &headers(), body)
        .await?;
    if answer.status() == 470 || answer.status() == 403 {
        return Err(ScreenError::Refused("airplay_not_paired".into()));
    }
    if !(200..300).contains(&answer.status()) {
        return Err(ScreenError::Refused(
            format!("airplay_{path}_{}", answer.status()).replace('/', ""),
        ));
    }
    if answer.body.is_empty() {
        Ok(Vec::new())
    } else {
        tlv8::decode(&answer.body)
    }
}

/// The television shows its PIN.
pub async fn show_pin<S: AsyncRead + AsyncWrite + Unpin>(
    connection: &mut Connection<S>,
) -> Result<(), ScreenError> {
    post(connection, "/pair-pin-start", &[]).await.map(|_| ())
}

/// Pair-setup with the PIN the television shows; the credentials to keep.
pub async fn pair<S: AsyncRead + AsyncWrite + Unpin>(
    connection: &mut Connection<S>,
    pin: &str,
) -> Result<AirplayCredentials, ScreenError> {
    let pin = format!("{:0>4}", pin.trim());
    let m2 = post(
        connection,
        "/pair-setup",
        &tlv8::encode(&[(tlv8::METHOD, &[0]), (tlv8::SEQ_NO, &[1])]),
    )
    .await?;
    let (salt, server_public) = (
        tlv8::take(&m2, tlv8::SALT)?,
        tlv8::take(&m2, tlv8::PUBLIC_KEY)?,
    );
    let mut private = [0u8; 32];
    OsRng.fill_bytes(&mut private);
    let proof = srp::answer(&pin, &salt, &server_public, &private)?;
    let m4 = post(
        connection,
        "/pair-setup",
        &tlv8::encode(&[
            (tlv8::SEQ_NO, &[3]),
            (tlv8::PUBLIC_KEY, &proof.public),
            (tlv8::PROOF, &proof.proof),
        ]),
    )
    .await?;
    tlv8::take(&m4, tlv8::PROOF)?;

    let signing = SigningKey::generate(&mut OsRng);
    let client_id = uuid::Uuid::new_v4().to_string();
    let public = signing.verifying_key().to_bytes();
    let device_x = derive(
        "Pair-Setup-Controller-Sign-Salt",
        "Pair-Setup-Controller-Sign-Info",
        &proof.session_key,
    );
    let signature = signing
        .sign(&[device_x.as_slice(), client_id.as_bytes(), &public].concat())
        .to_bytes();
    let inner = tlv8::encode(&[
        (tlv8::IDENTIFIER, client_id.as_bytes()),
        (tlv8::PUBLIC_KEY, &public),
        (tlv8::SIGNATURE, &signature),
    ]);
    let key = derive(
        "Pair-Setup-Encrypt-Salt",
        "Pair-Setup-Encrypt-Info",
        &proof.session_key,
    );
    let m6 = post(
        connection,
        "/pair-setup",
        &tlv8::encode(&[
            (tlv8::SEQ_NO, &[5]),
            (
                tlv8::ENCRYPTED_DATA,
                &seal_message(&key, "PS-Msg05", &inner),
            ),
        ]),
    )
    .await?;
    let device = tlv8::decode(&open_message(
        &key,
        "PS-Msg06",
        &tlv8::take(&m6, tlv8::ENCRYPTED_DATA)?,
    )?)?;
    Ok(AirplayCredentials {
        client_id,
        client_secret: hex(&signing.to_bytes()),
        device_id: hex(&tlv8::take(&device, tlv8::IDENTIFIER)?),
        device_public: hex(&key32(&tlv8::take(&device, tlv8::PUBLIC_KEY)?)?),
    })
}

/// Pair-verify with kept credentials; the shared secret the connection is then encrypted with.
pub async fn verify<S: AsyncRead + AsyncWrite + Unpin>(
    connection: &mut Connection<S>,
    credentials: &AirplayCredentials,
) -> Result<[u8; 32], ScreenError> {
    let signing = SigningKey::from_bytes(&key32(&unhex(&credentials.client_secret)?)?);
    let device_key = VerifyingKey::from_bytes(&key32(&unhex(&credentials.device_public)?)?)
        .map_err(|_| ScreenError::Protocol("airplay_device_key"))?;
    let secret = x25519_dalek::EphemeralSecret::random_from_rng(OsRng);
    let public = x25519_dalek::PublicKey::from(&secret).to_bytes();
    let m2 = post(
        connection,
        "/pair-verify",
        &tlv8::encode(&[(tlv8::SEQ_NO, &[1]), (tlv8::PUBLIC_KEY, &public)]),
    )
    .await?;
    let device_public = key32(&tlv8::take(&m2, tlv8::PUBLIC_KEY)?)?;
    let shared = *secret
        .diffie_hellman(&x25519_dalek::PublicKey::from(device_public))
        .as_bytes();
    let key = derive(
        "Pair-Verify-Encrypt-Salt",
        "Pair-Verify-Encrypt-Info",
        &shared,
    );
    let inner = tlv8::decode(&open_message(
        &key,
        "PV-Msg02",
        &tlv8::take(&m2, tlv8::ENCRYPTED_DATA)?,
    )?)?;
    let identifier = tlv8::take(&inner, tlv8::IDENTIFIER)?;
    if hex(&identifier) != credentials.device_id {
        return Err(ScreenError::Refused("airplay_other_device".into()));
    }
    let signature = Signature::from_slice(&tlv8::take(&inner, tlv8::SIGNATURE)?)
        .map_err(|_| ScreenError::Protocol("airplay_signature"))?;
    device_key
        .verify(
            &[device_public.as_slice(), &identifier, &public].concat(),
            &signature,
        )
        .map_err(|_| ScreenError::Refused("airplay_device_signature".into()))?;
    let own = signing
        .sign(
            &[
                public.as_slice(),
                credentials.client_id.as_bytes(),
                &device_public,
            ]
            .concat(),
        )
        .to_bytes();
    let sealed = seal_message(
        &key,
        "PV-Msg03",
        &tlv8::encode(&[
            (tlv8::IDENTIFIER, credentials.client_id.as_bytes()),
            (tlv8::SIGNATURE, &own),
        ]),
    );
    post(
        connection,
        "/pair-verify",
        &tlv8::encode(&[(tlv8::SEQ_NO, &[3]), (tlv8::ENCRYPTED_DATA, &sealed)]),
    )
    .await?;
    Ok(shared)
}
