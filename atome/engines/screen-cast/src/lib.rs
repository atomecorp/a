//! Named screens of the local network (R-248, user 20 Nov. 2026: « envoie la vidéo vers l'Apple TV du salon »).
//!
//! A screen is found by Bonjour (`_googlecast._tcp`, `_airplay._tcp`; on iOS by the system's browser, which hands its
//! records here), known by its own name, and sent a media by that name: the device fetches the media from a URL of
//! the local network and plays it itself.
//! - A Chromecast plays it in Google's Default Media Receiver (`cast`), with no pairing.
//! - An AirPlay receiver (an Apple TV) plays it (`airplay`) once paired: a PIN shown on the television, typed once, gives the
//!   long-term keys kept for that screen.
//!
//! Mirroring the whole view (R-212's second view) is the system's own on Apple devices (Control Center); this crate
//! never starts it.

pub mod airplay;
pub mod cast;
pub mod discovery;
mod tls;

use serde::{Deserialize, Serialize};

/// What kind of device a screen is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScreenKind {
    Chromecast,
    /// An AirPlay video receiver: an Apple TV, or a television that takes AirPlay.
    Airplay,
}

/// A screen of the network: its stable id (the device's own), its name, where it answers, and what Bonjour says.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScreenTarget {
    pub id: String,
    pub name: String,
    pub kind: ScreenKind,
    pub host: String,
    pub port: u16,
    /// AirPlay: a PIN must be typed once before the first media (Bonjour `flags`/`sf`, bit 0x8 or 0x200).
    #[serde(default)]
    pub pairing_required: bool,
    #[serde(default)]
    pub model: String,
}

/// A media the device fetches by itself: its URL on the local network, its type, its title and where to start.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaToSend {
    pub url: String,
    pub mime: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub start_seconds: f64,
}

/// Why a screen did not take a media.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScreenError {
    /// The device did not answer, or its address could not be reached.
    Unreachable(String),
    /// The device answered with a refusal (a failed load, a wrong PIN, an unpaired screen).
    Refused(String),
    /// The device's answer broke the protocol.
    Protocol(&'static str),
    /// Reading or writing the connection failed.
    Io(String),
}

impl ScreenError {
    /// The error's stable code, for the page and the assistant.
    pub fn code(&self) -> String {
        match self {
            ScreenError::Unreachable(reason) => format!("screen_unreachable:{reason}"),
            ScreenError::Refused(reason) => format!("screen_refused:{reason}"),
            ScreenError::Protocol(reason) => format!("screen_protocol:{reason}"),
            ScreenError::Io(reason) => format!("screen_io:{reason}"),
        }
    }
}

impl std::fmt::Display for ScreenError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.code())
    }
}

impl std::error::Error for ScreenError {}

impl ScreenTarget {
    pub fn address(&self) -> Result<std::net::SocketAddr, ScreenError> {
        let ip: std::net::IpAddr = self
            .host
            .parse()
            .map_err(|_| ScreenError::Unreachable(format!("address:{}", self.host)))?;
        Ok(std::net::SocketAddr::new(ip, self.port))
    }
}
