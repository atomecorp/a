//! Loopy Pro → atome, one way. A `.lpproj` bundle is read into a normalized
//! [`LoopyProject`] (model): pages, clips, segments and the audio resources they
//! share, each resource identified by its content hash so it is stored once.

pub mod layout;
pub mod model;
pub mod reader;
pub mod sqlite_store;

#[cfg(not(target_arch = "wasm32"))]
pub mod bundle;

pub use model::LoopyProject;
