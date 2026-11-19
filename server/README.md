# server/

No code lives here. The server is atome-server (Rust, Axum: `atome/servers/atome-server`), with one
`atome-vault` process per person (`atome/servers/atome-vault`); the Fastify server that this folder
held was removed on 19 Nov. 2026 (R-118 L3.10).

What stays is read by atome-server from this folder:

- `certificates/`: the server's identity key pair (never committed; `server.key` stays private).
- `*.env.example`: the settings a provider needs (`ovh_sms.env.example`, `social.env.example`); the
  real files live outside the repository.
- A relative `SQLITE_PATH` is read from here (`atome/servers/atome-server/src/settings.rs`).

Start it with `./scripts/run_fastify.sh` (the name is historical). Installation:
`atome/documentations/server_installation.md`.
