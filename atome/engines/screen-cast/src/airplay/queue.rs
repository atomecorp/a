//! The item a receiver plays, queued as tvOS's own senders queue it (tvOS 18 and later): a remote-control stream
//! (type 130) set up on the control connection, then binary-plist `/command`s on it, each under `params.data`.

use plist::{Dictionary, Value};

use super::play::binary_plist;
use crate::MediaToSend;

/// tvOS's own remote-control client type.
const REMOTE_CONTROL_CLIENT: &str = "A6B27562-B43A-4F2D-B75F-82391E250194";

pub fn upper_uuid() -> String {
    uuid::Uuid::new_v4().to_string().to_uppercase()
}

/// A CMTime of `seconds` (milliseconds, valid).
fn cm_time(seconds: f64) -> Value {
    Value::Dictionary(
        [
            ("value", (seconds * 1000.0).round() as i64),
            ("timescale", 1000),
            ("flags", 1),
            ("epoch", 0),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_string(), Value::Integer(value.into())))
        .collect(),
    )
}

/// The `/command`s that queue `media` and start it, each a binary plist under `params.data`.
pub fn commands(media: &MediaToSend) -> Vec<Vec<u8>> {
    let mut item = vec![
        ("uuid", Value::String(upper_uuid())),
        ("mediaType", Value::String("file".into())),
        ("Content-Location", Value::String(media.url.clone())),
    ];
    // tvOS reads the start as a CMTime under Start-Position (Start-Position-Seconds is ignored).
    if media.start_seconds > 0.0 {
        item.push(("Start-Position", cm_time(media.start_seconds)));
    }
    let item = Value::Dictionary(
        item.into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect(),
    );
    [
        binary_plist(vec![
            ("type", Value::String("insertPlayQueueItem".into())),
            ("item", item),
        ]),
        binary_plist(vec![
            ("type", Value::String("setProperty".into())),
            ("property", Value::String("actionAtItemEnd".into())),
            ("value", Value::Integer(1.into())),
        ]),
        binary_plist(vec![
            ("type", Value::String("setRate".into())),
            ("rate", Value::Real(1.0)),
        ]),
    ]
    .into_iter()
    .map(|command| {
        let params = Value::Dictionary(
            [("data".to_string(), Value::Data(command))]
                .into_iter()
                .collect(),
        );
        binary_plist(vec![("params", params)])
    })
    .collect()
}

/// The SETUP body of the remote-control stream.
pub fn remote_control_setup() -> Vec<u8> {
    let stream = Value::Dictionary(
        [
            ("type", Value::Integer(130.into())),
            ("controlType", Value::Integer(1.into())),
            ("channelID", Value::String(upper_uuid())),
            ("clientUUID", Value::String(upper_uuid())),
            (
                "clientTypeUUID",
                Value::String(REMOTE_CONTROL_CLIENT.into()),
            ),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect(),
    );
    binary_plist(vec![("streams", Value::Array(vec![stream]))])
}

/// The id the device gave the remote-control stream (a number or a string).
pub fn stream_id(answer: &Dictionary) -> Option<String> {
    let first = answer
        .get("streams")?
        .as_array()?
        .first()?
        .as_dictionary()?;
    match first.get("streamID")? {
        Value::Integer(id) => Some(id.to_string()),
        Value::String(id) => Some(id.clone()),
        _ => None,
    }
}
