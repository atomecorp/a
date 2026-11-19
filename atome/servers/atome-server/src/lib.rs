//! The one atome server: it supervises the vaults (one `atome-vault` process per
//! person, the only writer of that person's vault), brings the central database to its
//! schema (central_schema), answers the application's files, `/ws/api` (ws_api), the
//! `/ws/sync` runtime (ws_sync), the media capability (`POST /api/media-token`, auth),
//! the uploads (media), the server's own routes (status: versions, health, identity,
//! database status) and the websites (site), alone: no Node process. Its `http` module
//! is shared with Tauri's local server.

// The operator's tools (src/bin/atome_admin.rs): roles, public events, AI seats, server identity.
#[cfg(unix)]
pub mod admin;
#[cfg(unix)]
pub mod auth;
pub mod billing;
#[cfg(unix)]
pub mod central_schema;
#[cfg(unix)]
pub mod conditions;
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
// The one signed OVHcloud API client (SMS, domain registrar).
#[cfg(unix)]
pub mod ovh;
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
// What the people send the team: reports, requests, the Atome contact's thread (R-210).
#[cfg(unix)]
pub mod team_reports;
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

// The server's date readers and writers against chrono's own outputs (jiff replaced it).
#[cfg(all(test, unix))]
#[path = "../../../../tests/atome_server/date_golden.rs"]
mod date_golden;
