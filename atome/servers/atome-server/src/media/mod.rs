// Media and files: a video made playable (playback, shared with Tauri's local
// server), the upload routes into a person's home (uploads, storage, wallpaper) and the
// reads of its files (downloads, served, audio_track), the bytes of a deleted media removed (removal).
#[cfg(unix)]
mod audio_track;
#[cfg(unix)]
pub mod downloads;
#[cfg(unix)]
pub mod files;
pub mod metadata_strip;
pub mod playback;
#[cfg(unix)]
pub mod removal;
#[cfg(unix)]
pub mod served;
#[cfg(unix)]
pub(crate) mod storage;
#[cfg(unix)]
pub mod uploads;
#[cfg(unix)]
mod wallpaper;

#[cfg(unix)]
pub use storage::Storage;
#[cfg(unix)]
pub use wallpaper::Wallpaper;
