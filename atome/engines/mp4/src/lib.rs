//! The one MP4 (ISO BMFF) writer of atome/eVe, written by hand with no dependency: the box writer and the boxes
//! every MP4 of the project lays (`boxes`), the live fragmented H.264 of a television stream built on them in
//! `atome-screen-cast` (`hls/mp4.rs`), and a progressive file of several tracks (`file`), a shared project's
//! MP4 proxy (R-349): its H.264 picture and its Opus sound.

pub mod boxes;
pub mod file;

pub use file::{Codec, Edit, SampleInfo, Track, write_mp4};

#[cfg(test)]
mod tests;
