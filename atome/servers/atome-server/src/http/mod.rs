//! The HTTP behaviour every atome server shares, Web and Tauri alike: the request
//! id, the CORS policy, the static roots, who a request comes from and a route's body and JSON reply, as Fastify defines them
//! (`server/http_server_hooks.js`, `server/cors_policies.js`, `server/server.js`).
pub mod cors;
pub mod fastify_reply;
#[cfg(unix)]
pub mod offline_manifest;
pub mod peer;
pub mod request_id;
mod static_types;
pub mod statics;
pub mod uri;
