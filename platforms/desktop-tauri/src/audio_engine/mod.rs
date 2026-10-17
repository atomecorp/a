// Audio engine of the Tauri app: the shared native engine (atome-audio-engine,
// also linked by the iOS app) and its Tauri command wrappers.

pub mod bridge;

pub use atome_audio_engine::{commands, metering, playback, recorder, wake_capture};
