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

`platforms/desktop-tauri/src/android_tls_roots.rs`, called first in the Tauri
`setup` on Android: the system authorities are concatenated into
`<app cache>/system_roots.pem` and named by `SSL_CERT_FILE`, read by both
rustls-native-certs versions. No new dependency. A missing CA store is an
explicit setup error.

## Regression check

On the phone (debug APK, CDP): `TauriAdapter.ws.send({ type: 'gps-resource',
action: 'tiles', input: { tiles: [{ x: 16, y: 11, z: 5 }] } })` answers
`ok: true` (≈ 0.3–1 s); `run-as one.atome.app.debug ls cache/` shows
`system_roots.pem` (≈ 700 KB). Plan › Nouveau trajet shows the map.
