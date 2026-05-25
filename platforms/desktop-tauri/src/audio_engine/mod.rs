// Audio engine module — CPAL + Kira unified audio for all platforms
// Provides playback (Kira), recording (CPAL), and metering.

pub mod bridge;
pub mod metering;
pub mod playback;
pub mod recorder;
mod recorder_wav;
pub mod transcode;

#[cfg(test)]
mod tests;
