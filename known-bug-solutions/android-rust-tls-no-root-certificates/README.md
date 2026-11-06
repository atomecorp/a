# Android: every outbound HTTPS/WSS call of the Rust runtime fails

## Symptom

On an Android phone (Tauri app), the services relayed by the local Axum server
answer at once (≈ 50 ms) with `PROVIDER_UNAVAILABLE`: Plan shows no map tiles
and « Le service GPS est momentanément indisponible », TV, Médiathèque, Vidéo,
book catalogs and bug reports stay empty. The same frames sent from a Mac to
`wss://atome.one/ws/api` succeed.

## Root cause (confirmed 2026-10-26)

`tokio-tungstenite` (public relay, `server/public_relay.rs`) and `reqwest`
(device authentication, media sync, providers) use rustls with
`rustls-native-certs`. On Android it finds no root store: the system
authorities are one PEM file each under `/apex/com.android.conscrypt/cacerts`
(or `/system/etc/security/cacerts` on older releases), a layout neither 0.6
(`SSL_CERT_FILE` only) nor 0.8 knows. tokio-tungstenite then refuses to
connect (`no native root CA certificates found`).

## Fix

First fix (2026-10-26, replaced): `platforms/desktop-tauri/src/android_tls_roots.rs`
concatenated the authorities into `<app cache>/system_roots.pem` and set
`SSL_CERT_FILE` with `std::env::set_var` in the Tauri `setup`. On Android the
JVM's threads already run at that point, so setting the environment was unsound
(R-118).

Current fix (2026-11-06): one TLS client owner,
`atome/servers/atome-server/src/tls.rs`. `client_config(alpn)` builds a rustls
configuration on the system roots, passed explicitly; `http_client()` gives a
reqwest builder on it and `connect_ws(request, websocket_config)` a WebSocket. On Android the
roots are read directly from `/apex/com.android.conscrypt/cacerts` (else
`/system/etc/security/cacerts`) through
`rustls_native_certs::load_certs_from_paths`: no file, no environment variable.
Every outgoing client of atome-server (providers, relays, sync, device
authentication, mail) and of Tauri (`auth_device.rs`, `server/updates.rs`,
`server/updates_zip.rs`) uses it. No root found is the explicit error
`tls_roots_missing`. No new dependency.

## Regression check

On the phone (debug APK, CDP): `TauriAdapter.ws.send({ type: 'gps-resource',
action: 'tiles', input: { tiles: [{ x: 16, y: 11, z: 5 }] } })` answers
`ok: true` (≈ 0.3–1 s). Plan › Nouveau trajet shows the map. No
`system_roots.pem` is written any more. Not yet run on a phone since the
2026-11-06 change (Android build not checked on that date).
