//! Password-manager exports to the FIDO Credential Exchange Format (CXF 1.0,
//! Proposed Standard of 2025-08-14 with the errata of 2026-03-09), entirely local.
//!
//! The chain is one way: a source reader (`sources`) maps the official export the
//! person chose into CXF entities (`cxf`), the package (`package`) lays them out as
//! `index.json` + `documents/`, and the seal (`seal`) encrypts that package unless
//! a plaintext CXF was explicitly asked for. Formats and envelope: `FORMATS.md`.

pub mod atome_entries;
pub mod convert;
pub mod cxf;
pub mod error;
pub mod ids;
pub mod package;
pub mod report;
pub mod safe_zip;
pub mod seal;
pub mod sources;
pub mod totp;
pub mod validate;

pub use error::{Error, Result};
