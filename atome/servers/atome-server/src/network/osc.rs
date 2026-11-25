// An OSC 1.0 message sent over UDP (R-347 L12, a control's reaction « to the network », the
// apps' local server only). The encoding is OSC's own: the address pattern then the type tag
// string, each a NUL-terminated string padded to four bytes, then the arguments big-endian
// (`f` a 32-bit float, `i` a 32-bit integer, `s` a padded string).
use serde_json::Value as JsonValue;

/// One argument of a message.
#[derive(Debug, Clone, PartialEq)]
pub enum OscArg {
    Float(f32),
    Int(i32),
    Str(String),
}

/// Where a message goes: the receiver's host and port, and the message's address pattern.
#[derive(Debug, Clone, PartialEq)]
pub struct OscTarget {
    pub host: String,
    pub port: u16,
    pub path: String,
}

// A string as OSC writes it: its bytes, one NUL at least, padded to a multiple of four.
fn push_string(buffer: &mut Vec<u8>, text: &str) {
    buffer.extend_from_slice(text.as_bytes());
    let padded = (text.len() / 4 + 1) * 4;
    buffer.resize(buffer.len() + padded - text.len(), 0);
}

/// The bytes of the message `path` carrying `args`.
pub fn encode(path: &str, args: &[OscArg]) -> Result<Vec<u8>, String> {
    if !path.starts_with('/') || path.contains('\0') || path.chars().any(char::is_whitespace) {
        return Err("network_osc_path_invalid".into());
    }
    let mut tags = String::from(",");
    for arg in args {
        tags.push(match arg {
            OscArg::Float(_) => 'f',
            OscArg::Int(_) => 'i',
            OscArg::Str(text) if text.contains('\0') => {
                return Err("network_osc_value_invalid".into());
            }
            OscArg::Str(_) => 's',
        });
    }
    let mut buffer = Vec::new();
    push_string(&mut buffer, path);
    push_string(&mut buffer, &tags);
    for arg in args {
        match arg {
            OscArg::Float(value) => buffer.extend_from_slice(&value.to_be_bytes()),
            OscArg::Int(value) => buffer.extend_from_slice(&value.to_be_bytes()),
            OscArg::Str(text) => push_string(&mut buffer, text),
        }
    }
    Ok(buffer)
}

fn arg_of(value: &JsonValue) -> Result<OscArg, String> {
    match value {
        JsonValue::Number(number) => number
            .as_f64()
            .map(|value| OscArg::Float(value as f32))
            .ok_or_else(|| "network_osc_value_invalid".into()),
        JsonValue::Bool(on) => Ok(OscArg::Int(i32::from(*on))),
        JsonValue::String(text) => Ok(OscArg::Str(text.clone())),
        _ => Err("network_osc_value_invalid".into()),
    }
}

/// The arguments a reaction's value gives: none for no value, one for a number (a float), a
/// switch (an integer, 1 or 0) or a text, one each for a list of them.
pub fn args_of(value: &JsonValue) -> Result<Vec<OscArg>, String> {
    match value {
        JsonValue::Null => Ok(Vec::new()),
        JsonValue::Array(items) => items.iter().map(arg_of).collect(),
        value => Ok(vec![arg_of(value)?]),
    }
}

/// The receiver a target's `address` names (`host:port`, `osc://host:port`, `osc.udp://…`,
/// `udp://…`, a path after it) and the address pattern: the reaction's `path` when it names one,
/// else the address's own path.
pub fn target_of(address: &str, path: &str) -> Result<OscTarget, String> {
    let address = address.trim();
    let rest = match address.split_once("://") {
        Some(("osc" | "osc.udp" | "udp", rest)) => rest,
        Some(_) => return Err("network_osc_address_invalid".into()),
        None => address,
    };
    let url = url::Url::parse(&format!("osc://{rest}"))
        .map_err(|_| "network_osc_address_invalid".to_string())?;
    let host = url
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or("network_osc_address_invalid")?;
    let port = url.port().ok_or("network_osc_port_missing")?;
    let path = match path.trim() {
        "" | "/" if !url.path().is_empty() && url.path() != "/" => url.path().to_string(),
        "" => "/".to_string(),
        path => path.to_string(),
    };
    Ok(OscTarget {
        host: host.trim_start_matches('[').trim_end_matches(']').into(),
        port,
        path,
    })
}

/// Sends `args` to `target` in one datagram: the number of bytes sent.
pub async fn send(target: &OscTarget, args: &[OscArg]) -> Result<usize, String> {
    let bytes = encode(&target.path, args)?;
    let receiver = tokio::net::lookup_host((target.host.as_str(), target.port))
        .await
        .map_err(|_| "network_osc_host_unknown".to_string())?
        .next()
        .ok_or("network_osc_host_unknown")?;
    let local = if receiver.is_ipv6() {
        "[::]:0"
    } else {
        "0.0.0.0:0"
    };
    let socket = tokio::net::UdpSocket::bind(local)
        .await
        .map_err(|_| "network_osc_socket_failed".to_string())?;
    socket
        .send_to(&bytes, receiver)
        .await
        .map_err(|_| "network_osc_send_failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_float_message_is_padded_and_big_endian() {
        let bytes = encode("/fader", &[OscArg::Float(0.5)]).unwrap();
        let mut expected = b"/fader\0\0,f\0\0".to_vec();
        expected.extend_from_slice(&0.5f32.to_be_bytes());
        assert_eq!(bytes, expected);
        assert_eq!(bytes.len() % 4, 0);
    }

    #[test]
    fn a_path_of_four_bytes_takes_four_nuls() {
        let bytes = encode("/abc", &[]).unwrap();
        assert_eq!(bytes, b"/abc\0\0\0\0,\0\0\0".to_vec());
    }

    #[test]
    fn ints_and_strings_are_tagged_in_order() {
        let bytes = encode("/a", &[OscArg::Int(-2), OscArg::Str("hi".into())]).unwrap();
        let mut expected = b"/a\0\0,is\0".to_vec();
        expected.extend_from_slice(&(-2i32).to_be_bytes());
        expected.extend_from_slice(b"hi\0\0");
        assert_eq!(bytes, expected);
    }

    #[test]
    fn a_path_without_slash_is_refused() {
        assert_eq!(
            encode("fader", &[]).unwrap_err(),
            "network_osc_path_invalid"
        );
    }

    #[test]
    fn values_become_arguments() {
        assert_eq!(args_of(&json!(null)).unwrap(), vec![]);
        assert_eq!(args_of(&json!(0.25)).unwrap(), vec![OscArg::Float(0.25)]);
        assert_eq!(args_of(&json!(true)).unwrap(), vec![OscArg::Int(1)]);
        assert_eq!(
            args_of(&json!([1, "x"])).unwrap(),
            vec![OscArg::Float(1.0), OscArg::Str("x".into())]
        );
        assert!(args_of(&json!({ "a": 1 })).is_err());
    }

    #[test]
    fn addresses_name_host_port_and_path() {
        let target = target_of("192.168.1.5:9000", "/mix/1").unwrap();
        assert_eq!(
            target,
            OscTarget {
                host: "192.168.1.5".into(),
                port: 9000,
                path: "/mix/1".into()
            }
        );
        let target = target_of("osc://studio.local:8000/vol", "/").unwrap();
        assert_eq!((target.host.as_str(), target.port), ("studio.local", 8000));
        assert_eq!(target.path, "/vol");
        assert_eq!(target_of("osc.udp://[::1]:7000", "").unwrap().host, "::1");
        assert_eq!(
            target_of("studio.local", "/a").unwrap_err(),
            "network_osc_port_missing"
        );
        assert!(target_of("http://studio.local:80", "/a").is_err());
    }

    #[tokio::test]
    async fn a_message_reaches_a_udp_receiver() {
        let receiver = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
        receiver
            .set_read_timeout(Some(std::time::Duration::from_secs(2)))
            .unwrap();
        let port = receiver.local_addr().unwrap().port();
        let target = target_of(&format!("127.0.0.1:{port}"), "/x").unwrap();
        let sent = send(&target, &[OscArg::Float(1.0)]).await.unwrap();
        let mut buffer = [0u8; 64];
        let (read, _) = receiver.recv_from(&mut buffer).unwrap();
        assert_eq!(read, sent);
        assert_eq!(
            &buffer[..read],
            encode("/x", &[OscArg::Float(1.0)]).unwrap()
        );
    }
}
