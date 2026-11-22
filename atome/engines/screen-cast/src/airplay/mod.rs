//! An AirPlay receiver (an Apple TV, or a television that takes AirPlay): paired once with the PIN it shows, then
//! sent a media it fetches and plays itself while the session stays open (play.rs).

mod crypto;
mod events;
pub mod hap;
mod http;
mod play;
mod queue;
mod srp;
mod tlv8;

use std::net::SocketAddr;

use tokio::net::TcpStream;

pub use hap::AirplayCredentials;
pub use play::{Playback, play};

use crate::ScreenError;

/// A pairing under way: the connection on which the television shows its PIN, kept until the PIN is given.
pub struct Pairing {
    connection: http::Connection<TcpStream>,
}

/// The television at `address` shows its PIN.
pub async fn show_pin(address: SocketAddr) -> Result<Pairing, ScreenError> {
    let stream = TcpStream::connect(address)
        .await
        .map_err(|error| ScreenError::Unreachable(error.to_string()))?;
    let mut connection = http::Connection::new(stream);
    hap::show_pin(&mut connection).await?;
    Ok(Pairing { connection })
}

/// The pairing finished with the PIN the person read on the television: the credentials to keep for that screen.
pub async fn finish_pairing(
    mut pairing: Pairing,
    pin: &str,
) -> Result<AirplayCredentials, ScreenError> {
    hap::pair(&mut pairing.connection, pin).await
}

#[cfg(test)]
mod tests;
