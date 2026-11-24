//! A fake Cast device on an in-memory pipe: it pings, answers LAUNCH and LOAD as a Chromecast does, and records what
//! the sender asked.

use super::*;
use tokio::io::{DuplexStream, duplex};

async fn read(device: &mut DuplexStream) -> CastMessage {
    let mut length = [0u8; 4];
    device.read_exact(&mut length).await.unwrap();
    let mut body = vec![0u8; u32::from_be_bytes(length) as usize];
    device.read_exact(&mut body).await.unwrap();
    CastMessage::decode(&body).unwrap()
}

async fn write(device: &mut DuplexStream, source: &str, namespace: &str, payload: Value) {
    let message = CastMessage {
        source: source.into(),
        destination: SENDER.into(),
        namespace: namespace.into(),
        payload: payload.to_string(),
    };
    device.write_all(&message.encode()).await.unwrap();
}

fn media() -> MediaToSend {
    MediaToSend {
        url: "http://192.168.1.20:41234/screen/abc/clip.mp4".into(),
        mime: "video/mp4".into(),
        title: "Clip".into(),
        start_seconds: 12.5,
        live: false,
    }
}

async fn device(mut device: DuplexStream, load_answer: &'static str) -> Vec<Value> {
    let mut seen = Vec::new();
    let connect = read(&mut device).await;
    seen.push(json!({ "to": connect.destination, "payload": serde_json::from_str::<Value>(&connect.payload).unwrap() }));
    let launch = read(&mut device).await;
    let launch_payload: Value = serde_json::from_str(&launch.payload).unwrap();
    write(
        &mut device,
        "receiver-0",
        HEARTBEAT,
        json!({ "type": "PING" }),
    )
    .await;
    let pong = read(&mut device).await;
    seen.push(serde_json::from_str(&pong.payload).unwrap());
    write(&mut device, "receiver-0", RECEIVER, json!({ "type": "RECEIVER_STATUS", "requestId": launch_payload["requestId"],
        "status": { "applications": [{ "appId": DEFAULT_MEDIA_RECEIVER, "transportId": "web-7", "sessionId": "s1" }] } })).await;
    seen.push(launch_payload);
    let connect = read(&mut device).await;
    seen.push(json!({ "to": connect.destination }));
    let load = read(&mut device).await;
    let load_payload: Value = serde_json::from_str(&load.payload).unwrap();
    write(
        &mut device,
        "web-7",
        MEDIA,
        json!({ "type": load_answer, "requestId": load_payload["requestId"] }),
    )
    .await;
    seen.push(
        json!({ "to": load.destination, "namespace": load.namespace, "payload": load_payload }),
    );
    if load_answer == "MEDIA_STATUS" {
        let close = read(&mut device).await;
        seen.push(json!({ "to": close.destination, "payload": serde_json::from_str::<Value>(&close.payload).unwrap() }));
    }
    seen
}

#[tokio::test]
async fn a_media_is_launched_then_loaded_on_the_receiver() {
    let (sender, receiver) = duplex(MAX_MESSAGE);
    let fake = tokio::spawn(device(receiver, "MEDIA_STATUS"));
    play_on(sender, &media()).await.unwrap();
    let seen = fake.await.unwrap();
    assert_eq!(
        seen[0],
        json!({ "to": "receiver-0", "payload": { "type": "CONNECT" } })
    );
    assert_eq!(seen[1], json!({ "type": "PONG" }));
    assert_eq!(seen[2]["type"], "LAUNCH");
    assert_eq!(seen[2]["appId"], DEFAULT_MEDIA_RECEIVER);
    assert_eq!(seen[3], json!({ "to": "web-7" }));
    assert_eq!(seen[4]["to"], "web-7");
    assert_eq!(seen[4]["namespace"], MEDIA);
    assert_eq!(seen[4]["payload"]["media"]["contentId"], media().url);
    assert_eq!(seen[4]["payload"]["media"]["contentType"], "video/mp4");
    assert_eq!(seen[4]["payload"]["currentTime"], 12.5);
    assert_eq!(
        seen[5],
        json!({ "to": "web-7", "payload": { "type": "CLOSE" } })
    );
}

#[tokio::test]
async fn a_refused_load_is_an_error() {
    let (sender, receiver) = duplex(MAX_MESSAGE);
    let fake = tokio::spawn(device(receiver, "LOAD_FAILED"));
    let result = play_on(sender, &media()).await;
    fake.await.unwrap();
    assert!(
        matches!(result, Err(ScreenError::Refused(reason)) if reason == "cast_load_LOAD_FAILED")
    );
}

#[test]
fn a_live_stream_loads_as_live_fmp4() {
    let mut live = media();
    live.mime = "application/x-mpegURL".into();
    live.live = true;
    let load = load_payload(&live);
    assert_eq!(load["media"]["streamType"], "LIVE");
    assert_eq!(load["media"]["hlsSegmentFormat"], "fmp4");
    assert_eq!(load["media"]["hlsVideoSegmentFormat"], "fmp4");
    let file = load_payload(&media());
    assert_eq!(file["media"]["streamType"], "BUFFERED");
    assert!(file["media"].get("hlsSegmentFormat").is_none());
}
