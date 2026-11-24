//! A fake AirPlay receiver on the loopback, written from the device's side of the protocol: it pairs with a PIN,
//! verifies, then takes SETUP, its event channel, RECORD, the remote-control stream and the queue's commands,
//! and pushes the item's states until it stopped.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use num_bigint::BigUint;
use plist::Value;
use tokio::net::{TcpListener, TcpStream};

use super::crypto::{derive, open_message, seal_message};
use super::hap::{AirplayCredentials, hex};
use super::http::{Connection, Message};
use super::play::binary_plist;
use super::srp::{GENERATOR, PRIME_3072, USERNAME, hash, pad};
use super::tlv8::{self, ENCRYPTED_DATA, IDENTIFIER, PROOF, PUBLIC_KEY, SALT, SEQ_NO, SIGNATURE};
use crate::MediaToSend;

const DEVICE_ID: &[u8] = b"AA:BB:CC:DD:EE:FF";
const LOOPBACK: IpAddr = IpAddr::V4(Ipv4Addr::LOCALHOST);

fn device_key() -> SigningKey {
    SigningKey::from_bytes(&[0x33; 32])
}

async fn answer(connection: &mut Connection<TcpStream>, request: &Message, body: &[u8]) {
    let mut headers = Vec::new();
    if let Some(sequence) = request.header("CSeq") {
        headers.push(("CSeq", sequence.to_string()));
    }
    let protocol = request.first_line.rsplit(' ').next().unwrap().to_string();
    connection
        .write_message(&format!("{protocol} 200 OK"), &headers, body)
        .await
        .unwrap();
}

async fn listen() -> (TcpListener, SocketAddr) {
    let listener = TcpListener::bind(SocketAddr::new(LOOPBACK, 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();
    (listener, address)
}

#[tokio::test]
async fn pairing_with_the_pin_gives_the_device_keys() {
    let (listener, address) = listen().await;
    let device = tokio::spawn(async move {
        let mut connection = Connection::new(listener.accept().await.unwrap().0);
        let start = connection.read_message().await.unwrap();
        assert_eq!(start.first_line, "POST /pair-pin-start HTTP/1.1");
        answer(&mut connection, &start, &[]).await;
        let (n, g, salt) = (
            BigUint::parse_bytes(PRIME_3072.as_bytes(), 16).unwrap(),
            BigUint::from(GENERATOR),
            [5u8; 16],
        );
        let x = BigUint::from_bytes_be(&hash(&[&salt, &hash(&[USERNAME, b":", b"0815"])]));
        let verifier = g.modpow(&x, &n);
        let secret = BigUint::from_bytes_be(&[0x21; 32]);
        let k = BigUint::from_bytes_be(&hash(&[&n.to_bytes_be(), &pad(&g)]));
        let b = (&k * &verifier + g.modpow(&secret, &n)) % &n;
        let m1 = connection.read_message().await.unwrap();
        answer(
            &mut connection,
            &m1,
            &tlv8::encode(&[
                (SEQ_NO, &[2]),
                (SALT, &salt),
                (PUBLIC_KEY, &b.to_bytes_be()),
            ]),
        )
        .await;
        let m3 = tlv8::decode(
            &connection
                .read_message()
                .await
                .map(|message| message.body)
                .unwrap(),
        )
        .unwrap();
        let a = BigUint::from_bytes_be(&tlv8::take(&m3, PUBLIC_KEY).unwrap());
        let u = BigUint::from_bytes_be(&hash(&[&pad(&a), &pad(&b)]));
        let session = hash(&[&(&a * verifier.modpow(&u, &n))
            .modpow(&secret, &n)
            .to_bytes_be()]);
        let fake = Message {
            first_line: "POST /pair-setup HTTP/1.1".into(),
            ..Message::default()
        };
        answer(
            &mut connection,
            &fake,
            &tlv8::encode(&[(SEQ_NO, &[4]), (PROOF, &[0; 64])]),
        )
        .await;
        let m5 = tlv8::decode(&connection.read_message().await.unwrap().body).unwrap();
        let key = derive(
            "Pair-Setup-Encrypt-Salt",
            "Pair-Setup-Encrypt-Info",
            &session,
        );
        let inner = tlv8::decode(
            &open_message(&key, "PS-Msg05", &tlv8::take(&m5, ENCRYPTED_DATA).unwrap()).unwrap(),
        )
        .unwrap();
        let (client_id, client_public) = (
            tlv8::take(&inner, IDENTIFIER).unwrap(),
            tlv8::take(&inner, PUBLIC_KEY).unwrap(),
        );
        let device_x = derive(
            "Pair-Setup-Controller-Sign-Salt",
            "Pair-Setup-Controller-Sign-Info",
            &session,
        );
        VerifyingKey::from_bytes(&client_public.clone().try_into().unwrap())
            .unwrap()
            .verify(
                &[device_x.as_slice(), &client_id, &client_public].concat(),
                &Signature::from_slice(&tlv8::take(&inner, SIGNATURE).unwrap()).unwrap(),
            )
            .unwrap();
        let public = device_key().verifying_key().to_bytes();
        let sealed = seal_message(
            &key,
            "PS-Msg06",
            &tlv8::encode(&[
                (IDENTIFIER, DEVICE_ID),
                (PUBLIC_KEY, &public),
                (SIGNATURE, &[0; 64]),
            ]),
        );
        answer(
            &mut connection,
            &fake,
            &tlv8::encode(&[(SEQ_NO, &[6]), (ENCRYPTED_DATA, &sealed)]),
        )
        .await;
        String::from_utf8(client_id).unwrap()
    });
    let pairing = super::show_pin(address).await.unwrap();
    let credentials = super::finish_pairing(pairing, "815").await.unwrap();
    assert_eq!(credentials.client_id, device.await.unwrap());
    assert_eq!(credentials.device_id, hex(DEVICE_ID));
    assert_eq!(
        credentials.device_public,
        hex(&device_key().verifying_key().to_bytes())
    );
}

/// The device's side of pair-verify; the shared secret.
async fn device_verify(connection: &mut Connection<TcpStream>, client: &VerifyingKey) -> [u8; 32] {
    let m1 = connection.read_message().await.unwrap();
    let client_x: [u8; 32] = tlv8::take(&tlv8::decode(&m1.body).unwrap(), PUBLIC_KEY)
        .unwrap()
        .try_into()
        .unwrap();
    let secret = x25519_dalek::StaticSecret::from([0x44; 32]);
    let public = x25519_dalek::PublicKey::from(&secret).to_bytes();
    let shared = *secret
        .diffie_hellman(&x25519_dalek::PublicKey::from(client_x))
        .as_bytes();
    let key = derive(
        "Pair-Verify-Encrypt-Salt",
        "Pair-Verify-Encrypt-Info",
        &shared,
    );
    let signature = device_key()
        .sign(&[public.as_slice(), DEVICE_ID, &client_x].concat())
        .to_bytes();
    let sealed = seal_message(
        &key,
        "PV-Msg02",
        &tlv8::encode(&[(IDENTIFIER, DEVICE_ID), (SIGNATURE, &signature)]),
    );
    answer(
        connection,
        &m1,
        &tlv8::encode(&[
            (SEQ_NO, &[2]),
            (PUBLIC_KEY, &public),
            (ENCRYPTED_DATA, &sealed),
        ]),
    )
    .await;
    let m3 = connection.read_message().await.unwrap();
    let inner = tlv8::decode(
        &open_message(
            &key,
            "PV-Msg03",
            &tlv8::take(&tlv8::decode(&m3.body).unwrap(), ENCRYPTED_DATA).unwrap(),
        )
        .unwrap(),
    )
    .unwrap();
    let id = tlv8::take(&inner, IDENTIFIER).unwrap();
    client
        .verify(
            &[client_x.as_slice(), &id, &public].concat(),
            &Signature::from_slice(&tlv8::take(&inner, SIGNATURE).unwrap()).unwrap(),
        )
        .unwrap();
    answer(connection, &m3, &tlv8::encode(&[(SEQ_NO, &[4])])).await;
    shared
}

#[tokio::test]
async fn a_media_is_played_until_it_ends() {
    let client = SigningKey::from_bytes(&[0x55; 32]);
    let credentials = AirplayCredentials {
        client_id: "atome-test".into(),
        client_secret: hex(&client.to_bytes()),
        device_id: hex(DEVICE_ID),
        device_public: hex(&device_key().verifying_key().to_bytes()),
    };
    let (listener, address) = listen().await;
    let (events_listener, events_address) = listen().await;
    let client_public = client.verifying_key();
    let device = tokio::spawn(async move {
        let mut control = Connection::new(listener.accept().await.unwrap().0);
        let shared = device_verify(&mut control, &client_public).await;
        control.encrypt(
            derive("Control-Salt", "Control-Read-Encryption-Key", &shared),
            derive("Control-Salt", "Control-Write-Encryption-Key", &shared),
        );
        let mut seen = Vec::new();
        let setup = control.read_message().await.unwrap();
        let body: Value = plist::from_bytes(&setup.body).unwrap();
        assert_eq!(
            body.as_dictionary()
                .unwrap()
                .get("timingProtocol")
                .unwrap()
                .as_string(),
            Some("NTP")
        );
        answer(
            &mut control,
            &setup,
            &binary_plist(vec![(
                "eventPort",
                Value::Integer(u64::from(events_address.port()).into()),
            )]),
        )
        .await;
        let mut events = Connection::new(events_listener.accept().await.unwrap().0);
        events.encrypt(
            derive("Events-Salt", "Events-Write-Encryption-Key", &shared),
            derive("Events-Salt", "Events-Read-Encryption-Key", &shared),
        );
        let event = events
            .exchange("POST /command RTSP/1.0", &[("CSeq", "9".into())], &[])
            .await
            .unwrap();
        seen.push(format!(
            "event {} {}",
            event.status(),
            event.header("CSeq").unwrap()
        ));
        let mut commands = 0;
        loop {
            let Ok(request) = control.read_message().await else {
                break;
            };
            seen.push(request.first_line.clone());
            let body = if request.first_line.starts_with("SETUP ") {
                let streams = Value::Array(vec![Value::Dictionary(
                    [
                        ("type".to_string(), Value::Integer(130.into())),
                        ("streamID".to_string(), Value::Integer(1.into())),
                    ]
                    .into_iter()
                    .collect(),
                )]);
                binary_plist(vec![("streams", streams)])
            } else {
                Vec::new()
            };
            if request.first_line.starts_with("POST /command ") {
                assert_eq!(request.header("X-Apple-StreamID"), Some("1"));
                let outer: Value = plist::from_bytes(&request.body).unwrap();
                let data = outer.as_dictionary().unwrap()["params"]
                    .as_dictionary()
                    .unwrap()["data"]
                    .as_data()
                    .unwrap();
                let command: Value = plist::from_bytes(data).unwrap();
                let command = command.as_dictionary().unwrap();
                seen.push(command["type"].as_string().unwrap().to_string());
                if let Some(item) = command.get("item") {
                    let location = item.as_dictionary().unwrap()["Content-Location"].as_string();
                    seen.push(location.unwrap().to_string());
                }
                commands += 1;
            }
            answer(&mut control, &request, &body).await;
            if commands == 3 {
                commands += 1;
                for state in ["loading", "playing", "stopped"] {
                    let event = binary_plist(vec![
                        ("type", Value::String("playbackState".into())),
                        ("name", Value::String(state.into())),
                    ]);
                    let params = Value::Dictionary(
                        [("data".to_string(), Value::Data(event))]
                            .into_iter()
                            .collect(),
                    );
                    events
                        .exchange(
                            "POST /command RTSP/1.0",
                            &[],
                            &binary_plist(vec![("params", params)]),
                        )
                        .await
                        .unwrap();
                }
            }
        }
        seen
    });
    let media = MediaToSend {
        url: "http://10.0.0.5:4100/screen/t/clip.mp4".into(),
        mime: "video/mp4".into(),
        title: String::new(),
        start_seconds: 0.0,
        live: false,
    };
    let playback = super::play(address, LOOPBACK, &credentials, &media)
        .await
        .unwrap();
    playback.task.await.unwrap().unwrap();
    let seen = device.await.unwrap();
    assert_eq!(seen[0], "event 200 9");
    assert_eq!(seen[1], "POST /feedback RTSP/1.0");
    assert!(seen[2].starts_with("RECORD rtsp://127.0.0.1/"));
    assert!(seen[3].starts_with("SETUP rtsp://127.0.0.1/"));
    assert_eq!(
        &seen[4..10],
        [
            "POST /command HTTP/1.1",
            "insertPlayQueueItem",
            media.url.as_str(),
            "POST /command HTTP/1.1",
            "setProperty",
            "POST /command HTTP/1.1"
        ]
    );
    assert_eq!(seen[10], "setRate");
}

#[test]
fn a_start_is_queued_as_a_cm_time() {
    let media = MediaToSend {
        url: "http://h/clip.mp4".into(),
        mime: "video/mp4".into(),
        title: String::new(),
        start_seconds: 4.25,
        live: false,
    };
    let first = &super::queue::commands(&media)[0];
    let outer: Value = plist::from_bytes(first).unwrap();
    let data = outer.as_dictionary().unwrap()["params"]
        .as_dictionary()
        .unwrap()["data"]
        .as_data()
        .unwrap();
    let command: Value = plist::from_bytes(data).unwrap();
    let start = command.as_dictionary().unwrap()["item"]
        .as_dictionary()
        .unwrap()["Start-Position"]
        .as_dictionary()
        .unwrap()
        .clone();
    assert_eq!(start["value"].as_signed_integer(), Some(4250));
    assert_eq!(start["timescale"].as_signed_integer(), Some(1000));
}

#[test]
fn a_timing_request_is_answered_with_its_send_time_as_reference() {
    let mut request = [0u8; 32];
    request[0] = 0x80;
    request[1] = 0xd2;
    request[24..32].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
    let reply = super::play::timing_reply(&request).unwrap();
    assert_eq!(&reply[..4], &[0x80, 0xd3, 0, 7]);
    assert_eq!(&reply[8..16], &[1, 2, 3, 4, 5, 6, 7, 8]);
    assert_eq!(reply[16..24], reply[24..32]);
}
