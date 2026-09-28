use serde_json::{json, Value};

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

    fn key(scope: &str) -> Result<SecKey, String> {
        let _guard = KEY_CREATION
            .lock()
            .map_err(|_| "auth_device_key_unavailable")?;
        let label = format!("one.atome.auth.device.{scope}");
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
            .set_key_type(KeyType::ec())
            .set_size_in_bits(256)
            .set_label(label)
            .set_location(Location::DefaultFileKeychain)
            .set_token(Token::Software);
        SecKey::new(&options).map_err(|_| "auth_protected_device_key_unavailable".into())
    }

    fn public_key(scope: &str) -> Result<SecKey, String> {
        let label = format!("one.atome.auth.device.{scope}");
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
            // A software SecKey generated in the login keychain is persisted as
            // two keychain items. After relaunch, asking the reloaded private-key
            // reference for `public_key()` can return None even though the public
            // item is present. Query that item by class and label instead; using
            // the transient derivation made cached device records impossible to
            // bind after an application restart.
            let public = public_key(scope)?;
            let bytes = public
                .external_representation()
                .ok_or("auth_device_public_key_export_failed")?;
            let bytes = bytes.bytes();
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
