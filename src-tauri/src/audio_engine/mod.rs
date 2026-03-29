// Audio engine module — CPAL + Kira unified audio for all platforms
// Provides playback (Kira), recording (CPAL), and metering.

pub mod playback;
pub mod recorder;
pub mod metering;
pub mod bridge;

#[cfg(test)]
mod tests;
