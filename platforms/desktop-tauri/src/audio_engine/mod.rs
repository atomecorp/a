// Audio engine module — CPAL + Kira unified audio for all platforms
// Provides playback (Kira), recording (CPAL), and metering.

mod aux_outputs;
pub mod bridge;
mod live_input;
pub mod metering;
pub mod mix;
mod metering_scope;
pub mod playback;
mod playback_region;
mod playback_schedule;
pub mod recorder;
mod scheduled_backend;
mod recorder_wav;
pub mod transcode;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod scheduled_backend_tests;

pub mod wake_capture;
