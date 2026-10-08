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
            | "phone-link-simulate-payment"
            | "phone-link-resend"
            | "phone-link-consume"
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
pub fn auth_device_key(
    action: String,
    scope: String,
    message: Option<String>,
    signature: Option<String>,
) -> Result<Value, String> {
    if scope.len() != 64 || !scope.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("auth_device_scope_invalid".into());
    }
    #[cfg(target_os = "macos")]
    {
        macos::handle(&action, &scope, message.as_deref(), signature.as_deref())
    }
    #[cfg(not(target_os = "macos"))]
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

    fn public_key(scope: &str) -> Result<SecKey, String> {
        let label = key_label(scope);
        let mut search = ItemSearchOptions::new();
        search
            .key_class(KeyClass::public())
            .label(&label)
            .load_refs(true);
        match search.search() {
            Ok(items) => items
                .into_iter()
                .find_map(|item| match item {
                    SearchResult::Ref(Reference::Key(key)) => Some(key),
                    _ => None,
                })
                .ok_or_else(|| "auth_device_public_key_missing".into()),
            Err(error) => Err(format!(
                "auth_device_public_key_search_failed:{}",
                error.code()
            )),
        }
    }

    fn public_key_bytes(private: &SecKey, scope: &str) -> Result<Vec<u8>, String> {
        // A public SecKey reference loaded from the file keychain can expose an
        // internal 96-byte block (or no external representation at all), while
        // kSecReturnData returns the stable ANSI X9.63 public point. Prefer the
        // keychain data and accept the derived representation only if it is
        // already the exact uncompressed P-256 form required by the protocol.
        let label = key_label(scope);
        let mut search = ItemSearchOptions::new();
        search
            .key_class(KeyClass::public())
            .label(&label)
            .load_data(true);
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
            let bytes = public_key_bytes(&key, scope)?;
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
            let public = public_key(scope)?;
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
