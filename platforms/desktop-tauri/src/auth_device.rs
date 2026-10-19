use serde_json::{json, Value};

pub(crate) async fn auth_ws_request(
    authority: String,
    mut message: Value,
    unavailable: &'static str,
) -> Result<Value, String> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::{connect_async, tungstenite::Message};
    use uuid::Uuid;

    let request_id = Uuid::new_v4().to_string();
    message["requestId"] = json!(request_id);
    message["type"] = json!("auth");
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        let (mut socket, _) = connect_async(authority).await.map_err(|_| unavailable)?;
        socket
            .send(Message::Text(message.to_string()))
            .await
            .map_err(|_| unavailable)?;
        while let Some(frame) = socket.next().await {
            let frame = frame.map_err(|_| unavailable)?;
            if let Message::Text(text) = frame {
                let response: Value =
                    serde_json::from_str(&text).map_err(|_| "auth_native_response_invalid")?;
                if response["requestId"] != request_id {
                    continue;
                }
                let _ = socket.close(None).await;
                return Ok(response);
            }
        }
        Err(unavailable)
    })
    .await
    .map_err(|_| unavailable.to_string())?
    .map_err(String::from)
}

#[tauri::command]
pub async fn auth_local_request(message: Value) -> Result<Value, String> {
    let action = message["action"].as_str().unwrap_or_default();
    if !matches!(
        action,
        "local-link-challenge"
            | "local-link-complete"
            | "local-session-describe"
            | "local-session-challenge"
            | "local-session-resume"
            | "local-session-lock"
            | "start-guest"
            | "leave-guest"
            | "me"
    ) {
        return Err("auth_local_action_forbidden".into());
    }
    // Authentication must not depend on WebKit's WebSocket implementation:
    // on macOS it can close an otherwise healthy loopback socket during a cold
    // launch, leaving tryAutoLogin unresolved and the whole window blank. The
    // native client reaches the same private Axum handler and keeps the command
    // surface restricted to the local authentication protocol above.
    auth_ws_request(
        "ws://127.0.0.1:3000/ws/api".to_string(),
        message,
        "auth_local_server_unavailable",
    )
    .await
}

#[tauri::command]
pub async fn auth_development_request(message: Value) -> Result<Value, String> {
    if std::env::var("SQUIRREL_AUTH_SMS_MOCK").as_deref() != Ok("1") {
        return Err("auth_development_mode_disabled".into());
    }
    let action = message["action"].as_str().unwrap_or_default();
    if !matches!(
        action,
        "phone-link-start"
            | "phone-link-challenge"
            | "phone-link-payment"
            | "phone-link-resend"
            | "phone-link-consume"
            | "phone-link-confirm"
            | "phone-link-resume"
            | "phone-link-cancel"
            | "session-challenge"
            | "session-renew"
            | "session-logout"
    ) {
        return Err("auth_development_action_forbidden".into());
    }
    let base = std::env::var("SQUIRREL_FASTIFY_URL")
        .or_else(|_| std::env::var("FASTIFY_URL"))
        .map_err(|_| "auth_development_server_missing")?;
    let authority = development_auth_authority(&base)?;
    auth_ws_request(authority, message, "auth_development_server_unavailable").await
}

fn development_auth_authority(base: &str) -> Result<String, String> {
    let mut url =
        reqwest::Url::parse(base.trim()).map_err(|_| "auth_development_server_forbidden")?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("auth_development_server_forbidden".into());
    }
    url.set_scheme("ws")
        .map_err(|_| "auth_development_server_forbidden")?;
    url.set_path("/ws/api");
    Ok(url.into())
}

#[cfg(test)]
#[path = "../../../tests/native/auth_development_request.rs"]
mod tests;

#[tauri::command]
pub async fn auth_device_key(
    _app: tauri::AppHandle,
    action: String,
    scope: String,
    message: Option<String>,
    signature: Option<String>,
) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    let _ = ANDROID_APP.set(_app);
    // Android's plugin resolves on the UI thread. Never wait for it on the
    // synchronous Tauri IPC/main thread; the shared verifier stays callable
    // from the Axum worker as well.
    tauri::async_runtime::spawn_blocking(move || auth_device_handle(action, scope, message, signature))
        .await.map_err(|_| "auth_protected_device_key_unavailable".to_string())?
}

#[cfg(target_os = "android")]
static ANDROID_APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

pub(crate) fn auth_device_handle(action: String, scope: String, message: Option<String>, signature: Option<String>) -> Result<Value, String> {
    if scope.len() != 64 || !scope.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("auth_device_scope_invalid".into());
    }
    #[cfg(target_os = "macos")]
    {
        macos::handle(&action, &scope, message.as_deref(), signature.as_deref())
    }
    #[cfg(target_os = "android")]
    {
        if !matches!(action.as_str(), "public"|"sign"|"verify") { return Err("auth_device_action_invalid".into()); }
        if action != "public" {
            let text = message.as_deref().ok_or("auth_device_message_required")?;
            let context: Vec<Value> = serde_json::from_str(text).map_err(|_| "auth_device_message_invalid")?;
            if context.len()!=8 || context[0]!="atome.phone-link.v1" || context[1]!="https://atome.one" || text.len()>2048 {
                return Err("auth_device_message_invalid".into());
            }
        }
        let app = ANDROID_APP.get().ok_or("auth_protected_device_key_unavailable")?;
        tauri_plugin_mobile_host::call(app,"authDevice",json!({"action":action,"scope":scope,"message":message,"signature":signature}))
    }
    #[cfg(not(any(target_os = "macos",target_os = "android")))]
    {
        let _ = (action, message, signature);
        Err("auth_protected_device_key_unavailable".into())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use security_framework::{
        item::{ItemSearchOptions, KeyClass, Location, Reference, SearchResult},
        key::{Algorithm, GenerateKeyOptions, KeyType, SecKey, Token},
    };
    use std::sync::Mutex;

    static KEY_CREATION: Mutex<()> = Mutex::new(());

    fn key_label(scope: &str) -> String {
        // v1 used deprecated kSecAttrKeyTypeEC. On current macOS releases its
        // public export can be a non-X9.63 96-byte block. Keep the old item
        // untouched and move new sessions to a correctly typed key.
        format!("one.atome.auth.device.v2.{scope}")
    }

    fn key(scope: &str) -> Result<SecKey, String> {
        let _guard = KEY_CREATION
            .lock()
            .map_err(|_| "auth_device_key_unavailable")?;
        let label = key_label(scope);
        let mut search = ItemSearchOptions::new();
        search
            .key_class(KeyClass::private())
            .label(&label)
            .load_refs(true);
        match search.search() {
            Ok(items) => {
                for item in items {
                    if let SearchResult::Ref(Reference::Key(key)) = item {
                        return Ok(key);
                    }
                }
                return Err("auth_device_key_invalid".into());
            }
            Err(error) if error.code() == -25300 => {} // errSecItemNotFound
            Err(_) => return Err("auth_device_key_unavailable".into()),
        }
        // Desktop Tauri has one key authority: an EC key in the user's macOS
        // login keychain. This works for signed and ad-hoc builds, while the
        // private material remains inaccessible through the application API.
        let mut options = GenerateKeyOptions::default();
        options
            .set_key_type(KeyType::ec_sec_prime_random())
            .set_size_in_bits(256)
            .set_label(label)
            .set_location(Location::DefaultFileKeychain)
            .set_token(Token::Software);
        SecKey::new(&options).map_err(|_| "auth_protected_device_key_unavailable".into())
    }

    // Several items can share a label (a key created by another build of the
    // app, an orphan half of an older pair). The public half announced to the
    // server must be the one of the private key that signs, or every proof is
    // refused while the sign-in itself starts: select it by application label
    // (the hash of the public key, set on both halves of a generated pair).
    fn public_search(private: &SecKey, scope: &str) -> ItemSearchOptions {
        let mut search = ItemSearchOptions::new();
        search.key_class(KeyClass::public()).label(&key_label(scope));
        if let Some(application_label) = private.application_label() {
            search.application_label(&application_label);
        }
        search
    }

    // SHA-1 (FIPS 180-4), only to compare a public point with the key's
    // application label, which macOS sets to SHA-1 of that point.
    fn sha1(data: &[u8]) -> [u8; 20] {
        let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
        let mut message = data.to_vec();
        message.push(0x80);
        while message.len() % 64 != 56 { message.push(0); }
        message.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
        for chunk in message.chunks(64) {
            let mut w = [0u32; 80];
            for i in 0..16 { w[i] = u32::from_be_bytes([chunk[4 * i], chunk[4 * i + 1], chunk[4 * i + 2], chunk[4 * i + 3]]); }
            for i in 16..80 { w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1); }
            let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
            for (i, word) in w.iter().enumerate() {
                let (f, k) = match i {
                    0..=19 => ((b & c) | (!b & d), 0x5A827999),
                    20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                    40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                    _ => (b ^ c ^ d, 0xCA62C1D6),
                };
                let t = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(*word);
                e = d; d = c; c = b.rotate_left(30); b = a; a = t;
            }
            for (slot, value) in h.iter_mut().zip([a, b, c, d, e]) { *slot = slot.wrapping_add(value); }
        }
        let mut out = [0u8; 20];
        for (i, word) in h.iter().enumerate() { out[4 * i..4 * i + 4].copy_from_slice(&word.to_be_bytes()); }
        out
    }

    // A rebuilt app (new code signature) may sign with the private key yet be
    // refused the public point's export (CSSMERR_CSP_OPERATION_AUTH_DENIED, no
    // prompt): the stored item is only a 96-byte CSSM header. The point this
    // app announced before is then accepted only if it is this key's own:
    // its SHA-1 equals the private key's application label.
    #[cfg(test)]
    pub(crate) fn sha1_for_tests(data: &[u8]) -> [u8; 20] { sha1(data) }

    fn known_public_point(private: &SecKey, known: Option<&str>) -> Option<Vec<u8>> {
        let known: Value = serde_json::from_str(known?).ok()?;
        let x = URL_SAFE_NO_PAD.decode(known.get("x")?.as_str()?).ok()?;
        let y = URL_SAFE_NO_PAD.decode(known.get("y")?.as_str()?).ok()?;
        if x.len() != 32 || y.len() != 32 { return None; }
        let point = [vec![4u8], x, y].concat();
        (private.application_label()? == sha1(&point)).then_some(point)
    }

    fn public_key_bytes(private: &SecKey, scope: &str) -> Result<Vec<u8>, String> {
        // A public SecKey reference loaded from the file keychain can expose an
        // internal 96-byte block (or no external representation at all), while
        // kSecReturnData returns the stable ANSI X9.63 public point. Prefer the
        // keychain data and accept the derived representation only if it is
        // already the exact uncompressed P-256 form required by the protocol.
        let mut search = public_search(private, scope);
        search.load_data(true);
        if let Ok(items) = search.search() {
            if let Some(bytes) = items.into_iter().find_map(|item| match item {
                SearchResult::Data(bytes) if bytes.len() == 65 && bytes[0] == 4 => Some(bytes),
                _ => None,
            }) {
                return Ok(bytes);
            }
        }
        if let Some(bytes) = private
            .public_key()
            .and_then(|public| public.external_representation())
        {
            let bytes = bytes.bytes();
            if bytes.len() == 65 && bytes[0] == 4 {
                return Ok(bytes.to_vec());
            }
        }
        Err("auth_device_public_key_export_failed".into())
    }

    pub fn handle(
        action: &str,
        scope: &str,
        message: Option<&str>,
        signature: Option<&str>,
    ) -> Result<Value, String> {
        if !matches!(action, "public" | "sign" | "verify") {
            return Err("auth_device_action_invalid".into());
        }
        let key = key(scope)?;
        if action == "public" {
            // `message` may carry the point this app announced before ({x, y}).
            let bytes = public_key_bytes(&key, scope)
                .or_else(|error| known_public_point(&key, message).ok_or(error))?;
            if bytes.len() != 65 || bytes[0] != 4 {
                return Err("auth_device_public_key_invalid".into());
            }
            return Ok(json!({"kty":"EC", "crv":"P-256",
                "x": URL_SAFE_NO_PAD.encode(&bytes[1..33]), "y": URL_SAFE_NO_PAD.encode(&bytes[33..65])}));
        }
        let message = message.ok_or("auth_device_message_required")?;
        let context: Vec<Value> =
            serde_json::from_str(message).map_err(|_| "auth_device_message_invalid")?;
        if context.len() != 8
            || context[0] != "atome.phone-link.v1"
            || context[1] != "https://atome.one"
            || message.len() > 2048
        {
            return Err("auth_device_message_invalid".into());
        }
        if action == "verify" {
            let encoded = signature.ok_or("auth_device_signature_required")?;
            let bytes = URL_SAFE_NO_PAD
                .decode(encoded)
                .map_err(|_| "auth_device_signature_invalid")?;
            // The half derived from the signing key is its exact pair; a keychain
            // public item looked up by label may be absent or belong to another pair.
            let public = key.public_key().ok_or("auth_device_public_key_missing")?;
            return public
                .verify_signature(
                    Algorithm::ECDSASignatureMessageX962SHA256,
                    message.as_bytes(),
                    &bytes,
                )
                .map(|valid| json!(valid))
                .map_err(|_| "auth_device_signature_invalid".into());
        }
        let signature = key
            .create_signature(
                Algorithm::ECDSASignatureMessageX962SHA256,
                message.as_bytes(),
            )
            .map_err(|_| "auth_device_signature_failed")?;
        Ok(json!(URL_SAFE_NO_PAD.encode(signature)))
    }
}

#[cfg(all(test, target_os = "macos"))]
mod device_key_label_tests {
    #[test]
    fn sha1_matches_the_standard_vectors() {
        assert_eq!(hex::encode(super::macos::sha1_for_tests(b"abc")), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(hex::encode(super::macos::sha1_for_tests(b"")), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
    }
}
