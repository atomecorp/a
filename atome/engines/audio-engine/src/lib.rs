//! Native Kira audio engine shared by the Tauri desktop app and the iOS app
//! (todo/audio_to_finalize §6.1): sample-accurate scheduled playback on a cpal
//! output (WASAPI exclusive on Windows), the mixer graph host (atome-mix-graph), recording with its capture
//! clock, live inputs, input calibration and metering. `commands` is the single
//! command surface both hosts expose (Tauri commands, iOS C ABI).

mod aux_outputs;
mod calibration;
pub mod commands;
pub mod direct;
mod engine_thread;
pub mod host_output;
mod instrument;
mod live_input;
pub mod metering;
mod metering_scope;
pub mod mix;
mod mix_assets;
mod output_fill;
pub mod output_idle;
pub mod playback;
mod playback_schedule;
pub mod recorder;
mod recorder_capture;
mod recorder_wav;
mod scheduled_backend;
#[cfg(not(target_os = "ios"))]
pub mod transcode;
pub mod wake_capture;
// Windows: WASAPI exclusive output and inputs on one thread (todo/effets_generateurs_audio D23-1).
#[cfg(target_os = "windows")]
mod wasapi_client;
#[cfg(target_os = "windows")]
mod wasapi_duplex;
// Guided-conversation voice engine (Silero + Vosk); hosts enable it once they link libvosk.
#[cfg(feature = "voice")]
pub mod voice;

#[cfg(test)]
mod direct_tests;
#[cfg(test)]
mod scheduled_backend_tests;
#[cfg(test)]
mod tests;

// Native diagnostics go to stderr only when asked (Xcode / terminal runs).
pub(crate) fn xcode_logs_enabled() -> bool {
    std::env::var("SQUIRREL_XCODE_LOGS").map(|value| value == "1" || value.eq_ignore_ascii_case("true")).unwrap_or(false)
}
