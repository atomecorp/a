//! The iOS C ABI of the app and the AUv3: the native Kira audio engine (`audio.rs`) and the
//! embedded local server (`local_server.rs`). Rendering is the Web renderer WASM in the WebView.
#![allow(
    unsafe_code,
    reason = "C ABI boundary called by the Swift host (audio engine, local server)"
)]

mod audio;
mod local_server;
