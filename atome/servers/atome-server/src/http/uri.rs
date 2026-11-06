// `encodeURIComponent` and `decodeURIComponent`, as Fastify's routes and services use them.
use percent_encoding::{AsciiSet, NON_ALPHANUMERIC};

// What `encodeURIComponent` leaves as it is.
pub const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

// `decodeURIComponent`, which refuses a malformed escape.
pub fn decode_uri_component(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let pair = bytes
                .get(index + 1..index + 3)
                .filter(|pair| pair.iter().all(u8::is_ascii_hexdigit));
            let Some(pair) = pair else {
                return Err("URI malformed".into());
            };
            let pair = std::str::from_utf8(pair).map_err(|e| e.to_string())?;
            decoded.push(u8::from_str_radix(pair, 16).map_err(|e| e.to_string())?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| "URI malformed".into())
}

/// `encodeURIComponent`.
pub fn encode_uri_component(text: &str) -> String {
    percent_encoding::utf8_percent_encode(text, URI_COMPONENT).to_string()
}
