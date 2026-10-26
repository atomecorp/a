use std::{fs, path::Path};

// Android gives native code no root store that rustls-native-certs knows: the system
// authorities are one PEM file each, in the Conscrypt APEX (updated by the system) or
// under /system on older releases. They are gathered into one bundle named by
// SSL_CERT_FILE, which both rustls-native-certs versions read: tokio-tungstenite (the
// public relay to atome.one) and reqwest (device authentication, media sync, providers).
const SYSTEM_CA_DIRS: [&str; 2] = ["/apex/com.android.conscrypt/cacerts", "/system/etc/security/cacerts"];

pub fn install<R: tauri::Runtime>(paths: &tauri::path::PathResolver<R>) -> Result<(), String> {
    let dir = SYSTEM_CA_DIRS.iter().map(Path::new).find(|dir| dir.is_dir()).ok_or("android_ca_store_missing")?;
    let mut bundle = String::new();
    for entry in fs::read_dir(dir).map_err(|error| format!("android_ca_store_unreadable:{error}"))? {
        let path = entry.map_err(|error| format!("android_ca_store_unreadable:{error}"))?.path();
        bundle.push_str(&fs::read_to_string(&path).map_err(|error| format!("android_ca_unreadable:{}:{error}", path.display()))?);
        bundle.push('\n');
    }
    let cache = paths.app_cache_dir().map_err(|error| format!("android_cache_dir_unavailable:{error}"))?;
    fs::create_dir_all(&cache).map_err(|error| format!("android_cache_dir_unavailable:{error}"))?;
    let file = cache.join("system_roots.pem");
    fs::write(&file, bundle).map_err(|error| format!("android_ca_bundle_write_failed:{error}"))?;
    std::env::set_var("SSL_CERT_FILE", &file);
    Ok(())
}
