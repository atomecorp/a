//! The one atome server: it supervises the vaults (one `atome-vault` process per
//! person, the only writer of that person's vault), brings the central database to its
//! schema (central_schema), answers the application's files, `/ws/api` (ws_api), the
//! `/ws/sync` runtime (ws_sync), the media capability (`POST /api/media-token`, auth),
//! the uploads (media), the server's own routes (status: versions, health, identity,
//! database status) and the websites (site), with no Fastify behind it. A reference
//! Fastify may still run beside it for the A/B probes, reaching the vaults through the
//! supervisor's control socket (control). Its `http` module is shared with Tauri's
//! local server.

#[cfg(unix)]
pub mod auth;
pub mod billing;
#[cfg(unix)]
pub mod central_schema;
#[cfg(unix)]
pub mod conditions;
#[cfg(unix)]
pub mod control;
#[cfg(unix)]
pub mod dev;
pub mod google_access;
#[cfg(unix)]
pub mod health_reference;
pub mod http;
#[cfg(unix)]
pub mod ios_ota;
pub mod local;
#[cfg(unix)]
pub mod mail;
pub mod media;
pub mod page_preview;
#[cfg(unix)]
pub mod providers;
pub mod server_identity;
pub mod settings;
#[cfg(unix)]
pub mod site;
#[cfg(unix)]
pub mod social;
#[cfg(unix)]
pub mod status;
// The one TLS client configuration of every outgoing connection.
pub mod tls;
#[cfg(target_os = "linux")]
mod vault_accounts;
#[cfg(unix)]
pub mod vault_router;
#[cfg(unix)]
pub mod vaults;
// The calls' SFU (the mediasoup worker), the public server's only.
#[cfg(all(unix, feature = "visio"))]
pub mod visio;
#[cfg(unix)]
pub mod web;
#[cfg(unix)]
pub mod ws_api;
#[cfg(unix)]
pub mod ws_sync;
