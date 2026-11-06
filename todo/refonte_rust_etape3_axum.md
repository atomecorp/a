# Rust-first refactor — step 3: one Axum server replaces Fastify (Web), then iOS

Source: user decisions of 2026-11-04 (study session, register R-118): « tout en Axum, un seul serveur »,
embedded Rust server on iOS (AUv3 to validate), strictest behaviour (Fastify's), Axum 0.8 at this step.
Steps 1 (hygiene) and 2 (`atome/engines/atome-store`) are done; this file is step 3's spec. Tick items as they land.

## What is ported (inventory of 2026-11-04, `server/` 211 files / 32 112 lines, `database/` 37 files / 5 557 lines)

| Domain | Lines | Rust owner to build |
|---|---|---|
| Sync, shares, surfaces, teleport, remote control (`wsSyncRuntime.js`, `syncSharingService.js`, `syncShareHierarchy.js`, `wsSurface*`, `wsTeleportOperations.js`, `wsRemoteControlOperations.js`) | 5 141 | `atome-server::sync`, `::shares`, `::presence` |
| Auth, accounts, devices, pairing, recovery, guest adoption (`auth_*.js`, `wsAccountAuth.js`, `wsPhoneLinkAuth.js`) | 4 005 | `atome-server::auth` (JWT HS256 aud `atome-ws`, `cnf.pop` proof, WebAuthn, OVH SMS) |
| AI providers, music, Strava, social (`wsAiProviderOperations.js`, `provider*.js`, `ai_*`, `music/`, `strava/`, `social/`) | 3 675 | `atome-server::providers` |
| Uploads, media, files (`http_upload_routes.js`, `http_media_serving_routes.js`, `wsFileOperations.js`, `userFiles.js`, ffmpeg) | 3 242 | `atome-server::media` (reuse Tauri's media/transcode code) |
| Core, WS infrastructure (`server.js`, `http_server_hooks.js`, `ws_api_connection.js`, `wsApiOperationChain.js`) | 2 657 | `atome-server` router, CORS, compression, static, request id |
| Contacts, communication, news, communities, forums, directory, push (APNs, FCM) | 2 624 | `atome-server::social`, `::push` |
| External resource proxies (YouTube, PeerTube, TV, shows, food facts, books, Tone3000, media library, GPS, DAV import, bug reports) | 2 288 | `atome-server::sources` |
| Events, atomes, state (`wsAtomeOperations.js`, `ws_api_commit_effects.js`, `atomeHistoryCommands.js`) | 1 898 | `atome-store::commit_events` (done) + `atome-server::events` |
| Shop, coaches, public events, objective network, scheduled sends | 1 551 | `atome-server::projections` |
| Visio (mediasoup SFU; `visio_routes.js` is dead) | 865 | `atome-server::visio` (mediasoup Rust crate) |
| Vaults (`userVaultRouter.js`, `userVaultProvider.js`, `userVaultProcess.js`) | 1 113 | `atome-store::vault` + `atome-server::vaults` |
| Site `_site`, billing, mail, admin, dev/shell, iOS OTA | 2 747 | `atome-server::site`, `::billing`, `::mail`, `::admin`, `::dev`, `::ota` |

Surface: 61 HTTP routes (+ site 404 handler and personal-domain hook), `/ws/api` with ~60 message types and their
actions, `/ws/sync` (7 inbound, 12 outbound types), 25 server pushes. Where they are dispatched:
`server/http_server_hooks.js` and the `register*Routes` modules for HTTP, `server/ws_api_connection.js` +
`wsApiOperationChain.js` for `/ws/api`, `server/wsSyncRuntime.js` (`CONTROL_TYPES`) for `/ws/sync`; each lot
re-derives its exact list from that code before porting.

Dead in Fastify (not ported): `server/visio_routes.js`, `wsAtomeDeleteOperation.js`, `registerSharingRoutes` /
`registerSharingWebSocket`, githubSync's WS client manager, cookie/`server.jwt` auth paths (no plugin registered).
`/api/admin/sync-clients` has no auth check (fix, not port).

## Method (same as step 2)

Every lot is proved by fixtures recorded from the real Fastify engine (`tests/fixtures/<domain>/`, generator `.mjs`),
replayed against the Rust server (`tests/<domain>/*_parity.rs`): same replies, same pushes, same refusals.

## Lots

- [x] L3.0 Decisions (user): vault isolation model (decided: one process per user, see below); migration path (decided: Axum in front, vaults first).
- [ ] L3.1 `atome/servers/atome-server` crate (Axum 0.8): the router, CORS, compression, static roots, request id,
      `/ws/api` envelope and dispatch chain, `/ws/sync` runtime; Tauri's `platforms/desktop-tauri/src/server/mod.rs`
      (5 420 lines) is split into it, Tauri keeping only its native glue. Binary `atome-web-server`.
  - [x] HTTP base (2026-11-04/05): Axum 0.8 and tokio-tungstenite 0.26 for the whole workspace; `atome-server::http`
        (`cors.rs` Fastify's CORS policy, `request_id.rs`, `statics.rs` + `static_types.rs` the static roots as
        @fastify/static + @fastify/compress serve them: br/gz siblings, brotli 4 on the fly, weak ETag, ranges, 416 body),
        `settings.rs` (`.env.local` > process > `.env`; `.env.local` may not set PORT, HOST, SQUIRREL_VAULT_ROOT);
        `web.rs` answers the files of an application host itself and passes the rest to Fastify. Parity probe
        `temp/l31_http/static_parity.probe.mjs` 40/40 against Fastify (dotfiles refused: stricter); 64 parallel
        downloads of the 3.4 MB renderer faster than Fastify once the read chunk is 256 KiB. Tauri's local server
        uses the same `StaticRoots`, `CorsPolicy` and request id (its five ServeDir roots and CorsLayer removed;
        lib tests 79/79 after the tungstenite 0.26 bump, clippy clean on first-party code).
  - [x] `/ws/api` envelope and dispatch (2026-11-05): `atome-server/src/ws_api/` accepts `/ws/api` on the application's
        hosts and joins it to one Fastify connection opened with the client's own headers (`front::forward`, a fresh
        handshake key; a personal domain's `/ws/api` stays Fastify's). The vault families are answered in Rust
        (`atome_ops.rs`, `vault_ops.rs`), every other frame passes on unchanged (binary included), a client's `front-`
        frame is dropped. What still lives in Fastify for them is asked on the same connection by internal frames
        carrying a per-start secret (`ATOME_FRONT_SECRET`, generated by `main.rs`, compared with `timingSafeEqual` in
        `server/ws_api_front.js`): `front-principal` runs `validateConnectionDeviceSession` then `requirePrincipal`
        (exported from `wsAtomeOperations.js`), `front-committed` runs `afterCommitted`. One Rust task per message,
        as Fastify answers them; the 200-entry mutation cache per connection. Tests `tests/atome_server/ws_api.rs`
        (fake Fastify answering the front frames), shared setup `tests/atome_server/support/mod.rs`; end to end 8/8
        (a temporary trace proved `front-principal`/`front-committed` crossing, then removed); `temp/comm` probes
        identical (l1 12/16, l2-l3 21/28, l4-l5 16/16, l11 9/11).
  - [x] `/ws/sync` runtime (2026-11-05): see L3.4. The device-session check itself (`auth_session_validation.js`)
        moves with L3.5.
- [x] L3.2 Vaults: `atome-store::vault` opens `database_storage/vaults/<sha256(principal)>/vault.db` (Fastify's files,
      read as they are: 31 real dev vaults read identically); the vault operations (`event:commit`, `state:get`,
      `stream:events`…, 20 ops, parity 63/63); one `atome-vault` process per person under `atome-server::vaults`;
      Fastify a client of the supervisor (2026-11-04). The central DB registries (`vault_principal_registry`,
      `vault_object_registry`, `vault_stream_registry`) moved into the supervisor's vault router on 2026-11-05 (L3.3).
  - [x] Axum in front: `atome-server` proxies every route (HTTP, WebSocket) to Fastify on PORT+100; launchers and
        `scripts/server_update.js` start it (deploy: user).
  - [x] Confinement of the vault processes on Linux (user authorization of `landlock` and `seccompiler`, 2026-11-04):
        own uid per vault, no_new_privs, rlimits, Landlock on its directory, seccomp allow-list
        (`atome/servers/atome-confine`, `atome-server/src/vault_accounts.rs`). Namespaces dropped: `unshare` needs
        unsafe code (denied in the workspace) and adds nothing to Landlock + seccomp. Run on Linux in a local VM (Debian 12
        arm64, kernel 6.1, as root, 2026-11-04): `confinement: ok`, supervisor 4/4 under real per-vault uids, atome-store
        14 (vault parity included), atome-vault 2, `check_vault_confinement.mjs` ok and refusing an uncrossable parent.
        The VM found SQLite's temporary files closed by Landlock (a large `events:list` sort): the vault keeps them in
        memory (`temp_store = MEMORY`, `atome-vault/src/main.rs`). x86_64 not run (its older syscall names are listed).
  - [ ] Fastify's credential/secret/social folders inside a vault directory (`server/providerCredentialVault.js`) move
        behind the vault process with L3.9.
- [ ] L3.3 Events/atomes/state/snapshots/history/conditions/directory on `/ws/api` + commit effects.
  - [x] The vault router (2026-11-05): `server/userVaultRouter.js` (455 lines), the share walk of
        `server/syncShareHierarchy.js` and `server/userVaultShareProjection.js` (deleted) are ported to
        `atome-server/src/vault_router/` (`mod.rs` registries, commit through a share, snapshots routed to the
        object's vault; `shares.rs` share rights, readable/writable sets, owner credentials stripped from media URLs,
        private programmes; `streams.rs`; `central.rs` the central SQLite Fastify shares, 5 s busy wait; `js.rs` the JS
        readings kept so the same request takes the same path). Fastify asks it through SERVICE frames (tag 5,
        `router:<operation>`) on the control socket; `UserVaultRouter` is a thin client, `shop_delivery.js`,
        `news_broadcast.js`, `syncSharingService.js` call its methods. The supervisor opens Fastify's central database
        (`SQLITE_PATH` > `ADOLE_SQLITE_PATH` > `database_storage/adole.db`, a relative path read from `server/`; libSQL
        refused explicitly). Tests: `tests/atome_server/vault_router.rs` 2/2 (on Fastify's `database/schema.sql`), JS
        `user_vault_provider.probe.mjs` 2/2, `ws_sync_stream_heads.test.mjs` 1/1, `user_vault_provider_frames.test.mjs`
        1/1, `guest_profile_adoption.probe.mjs` PASS. End to end (real `atome-server` + Fastify) 8/8; the `temp/comm/` probes give yesterday's verdicts line by line. `sync_sharing_service.probe.mjs` fails at its first assertion
        (a direct share is `pending` without an « always » policy) and, given that policy, later on stale D8
        expectations and a vault type-gate refusal: the HEAD JS router fails at the same points on the same data
        (A/B `temp/l33_router/`), so the port changes nothing there; the probe's expectations need their own fix.
  - [x] `events` (commit, commit-batch, list), `state-current` (get, list), `snapshot` (create, list, get, restore),
        `history` (undo, redo) and `sync` push answered in Rust (2026-11-05), their mutation cache included;
        `afterCommitted` stays Fastify's through `front-committed` until its owners (sync runtime, directory,
        projections) are ported (L3.4, L3.8).
  - [x] Central database shared by two processes (2026-11-05): Fastify's deferred `BEGIN TRANSACTION` failed at once
        (SQLITE_BUSY snapshot) when the router wrote between its read and its write: `l8_stack_race` kept 11–13/20
        messages. `database/driver.js` begins `IMMEDIATE` (waits its turn, better-sqlite3's 5 s): 20/20 three times.
  - [x] `user-data` (export, delete-all) and `atome` history answered in Rust (2026-11-05, `vault_ops.rs`): on the
        vault stack Fastify read them from its central tables, which hold none of a vault's objects — an export
        without the person's atomes, an erasure deleting nothing, a history « Access denied » for one's own atome
        (`temp/l34_ws_sync/leftover_families.probe.mjs` 2/7 before). An erasure goes through the commit pipeline and
        its effects (`front-committed`), and is in the mutation cache.
  - [x] `conditions` (2026-11-05): the condition engine is the JavaScript one shared with the browser
        (`atome/src/squirrel/conditions/`) and stays Fastify's; its candidates now come from the vault router
        (`wsAtomeOperations.js#conditionAuthorityFor`), as `state-current` reads them. Probe 10/10 after.
  - [ ] Kept Fastify's on purpose: `sync` get-pending/ack follow Fastify's central sync tracking (the remote-sync
        chain), which a vault object never enters; `directory` is the public directory service (central tables),
        ported with L3.7/L3.8.
  - [ ] At the cutover (L3.10): delete the JS handlers of the families the front answers (their vault and central
        branches in `wsAtomeOperations.js`, `atomeHistoryCommands.js`) with the JS tests that call them directly
        (`user_vault_provider.probe.mjs` history cases, `granularity_*`, `atome_property_security`,
        `adole_commit_boundary`), their cases kept in `tests/atome_server/ws_api.rs`.
- [ ] L3.4 `/ws/sync` streams, shares, share hierarchy projection.
  - [x] Stream access, authorized heads, stream events projected per share (in the vault router, above).
  - [x] The `/ws/sync` runtime (2026-11-05): `atome-server/src/ws_sync/` (`mod.rs` the runtime, `record.rs` one
        connection) holds the connections, their subscriptions and cursors, replay (pages of 500, an access check
        per event), batch subscription (500 at most, bulk heads, settlement), live delivery projected per share,
        the public directory stream, the 5 s authentication and 45 s idle limits. Each device connection opens one
        Fastify connection with the client's headers and `x-atome-front` (the per-start secret); on it
        `server/ws_sync_front.js` answers `front-sync-request`/`-challenge`/`-message`/`-validate` (device session,
        connection proof: `wsSyncSecurity.js`), `-activate` (provisioning, expiry, version) and `-directory`; Fastify
        refuses a `/ws/sync` without the front's header (4401 `front_required`). Fastify's services reach the runtime
        through SERVICE frames `sync:publish`, `sync:publish-directory`, `sync:replay-principal`, `sync:grant`,
        `sync:revoke`, `sync:snapshot` (`control::Services`); `server/wsSyncRuntime.js` is that thin client.
        Tests `tests/atome_server/ws_sync.rs` 7/7 (the 11 cases of the removed `ws_sync_runtime.test.mjs` and
        `ws_sync_replay_runtime.probe.mjs`, on a real vault router); end to end on the real stack
        `temp/l34_ws_sync/ws_sync_e2e.probe.mjs` 22/22 (bearer and message auth, replay, live, source skipped, ack,
        reconnection, refusals, a share granted, replayed, delivered live and revoked through the sharing service).
  - [ ] `syncSharingService.js` (share creation, policies, invitations, manual publication): it writes Fastify's
        central tables and its notifications; ported with the communication lot (L3.7).
- [ ] L3.5 Auth (coordinate with the D18 session: uncommitted edits in `server/auth_devices.js`,
  - [x] HTTP device-session identity and `POST /api/media-token` (2026-11-05): `atome-server/src/auth/`
        (`Sessions::validate_request` = `validateToken` of `server/http_request_identity.js` with
        `assertDeviceSessionClaims`; `media_token.rs` = `server/media_capability.js` issue + the route, Fastify's body
        parsers and refusals). Fastify registers no cookie parser, so its `access_token` cookie branch never reads one:
        Rust reads the Bearer alone. Test `tests/atome_server/media_token.rs` 1/1; parity probe
        `temp/l35_auth/media_token_parity.probe.mjs` 30/30. Fastify's route stays until L3.10 (the probe compares to it).
  - [x] The server's own routes (2026-11-05): `atome-server/src/status.rs` + `server_identity.rs` answer `/health`,
        `/healthz`, `/__whoami`, `/api/server-info`, `/api/server/identity`, `/api/server/status`, `POST /api/server/verify`
        (+ preflight), the iOS app association, `/auth/v/:attemptId`, `/api/db/status`, `/api/db/stats`,
        `/server_config.json`; shared `http/fastify_reply.rs` (body parsers, refusals, @fastify/compress). Parity probe
        `temp/l35_status/status_parity.probe.mjs` 36/36 (a Rust RSA-PSS signature verified by Node). Fastify's routes
        stay until L3.10.
  - [x] Proof security and device sessions (2026-11-05): `src/auth/proof.rs` (`server/auth_link_security.js`: HKDF
        keys of the master secret, keyed index, sealed phone, audit, send limits, challenges, ECDSA P-256 proof by
        `ring`, a key checked on the curve by an ECDH agreement), `device_sessions.rs` (`server/auth_sessions.js`
        challenge, renew, local bind, logout, logout-all, revoke-device), `accounts.rs#find_by_id`, `handles.rs`
        (NFKD by `icu_normalizer`, in the lock), `Central::transaction` (BEGIN IMMEDIATE). `/ws/api` answers those
        `auth` actions (`src/ws_api/auth_ops.rs`); the issued session is installed on Fastify's half
        (`front-identity` → `server/wsPhoneLinkAuth.js#installSessionIdentity`), ended sessions closed there
        (`front-disconnect` → `disconnectSession`). Fastify's per-read legacy phone-principal migration
        (`ensureOpaquePrincipalIdentity`) is not ported: a one-time data migration, decided at L3.10. Tests
        `tests/atome_server/auth_proof.rs` 4/4 (Fastify's vectors); probe `temp/l35_auth/device_sessions_parity.probe.mjs` 8/8.
  - [x] The other `/ws/api` auth messages (2026-11-05): 52 actions answered by `atome-server`
        (`src/ws_api/auth_ops.rs`, `phone_link_ops.rs`): the connection's proof (`connection-challenge`/`-proof`), the
        account's devices and approve keys with WebAuthn (`account_auth.rs`, `devices.rs`, `approvals.rs`,
        `webauthn.rs`), pairing and shared opening (`pairing/`), recovery (`recovery.rs`), sign-up status and challenge
        (`signup.rs`, `invites.rs`), the account's own actions (`account_actions.rs`: `me`, `get-user`, `list-users`,
        `update-user`, `push-register`, `push-prune`, `session-delete-account`), and the phone link
        (`phone_link/`: start, resend, challenge, consume, resume, confirm, cancel, `phone-change-start`; SMS by OVH or
        the development link, `sms.rs`, `reqwest` already in the lock). Each operation is one `committed` unit
        (Fastify's statements outside a transaction kept), its `withTransaction` blocks `atomic` (savepoints); its
        effects are asked of Fastify's half before the reply, in Fastify's order (`Outcome`, frames `front-notify`,
        `front-disconnect`, `front-pair`, `front-pair-update`, `front-attach`, `front-directory`, `front-link-attempt`,
        `front-link-ready`, `server/ws_api_front.js`); a connection that ended its own session closes once its reply is
        sent. Parity probes `temp/l35_auth/`: device sessions 10/10, approvals 3/3, pairing 6/6, recovery 5/5, account
        actions 4/4, phone link 7/7 (the probes' accounts themselves are made through the Rust phone link). Not
        verified: a real OVH send (it would send an SMS; the signed request is untested against OVH).
  - [x] Password login and change (2026-11-05, argon2 decided by the user): `src/auth/password_crypto.rs` (Argon2id
        19 MiB/2/1 with the `argon2` crate, two derivations at once, a legacy bcrypt verifier proven then upgraded, the
        operator's SHA-256 blocklist `AUTH_PASSWORD_BLOCKLIST_PATH`, the `set-password` request digest),
        `src/auth/passwords.rs` (the central steps: limits, the doubling slowdown per device and source, probation of a
        new device, other sessions ended), `src/ws_api/password_ops.rs` (`password-login-challenge`, `password-login`,
        `session-set-password`; the derivations outside the database). Tests `tests/atome_server/passwords.rs` 4/4
        (Node's own verifiers and digest); probe `temp/l37_share/password_parity.probe.mjs` 12/12.
  - [x] `phone-link-payment` and `account-create` (with billing L3.8, `src/auth/phone_link/finish.rs#pay`,
        `src/auth/signup.rs#create`) and `invite-create` (2026-11-05, `src/auth/invites.rs#create`, its mail by the
        server's own mailer `src/mail/`, L3.9).
  - [ ] Still on Fastify: the admin `account-roles` frame (D18). The connection's identity state itself (device claims)
        stays on Fastify's half until the families still asking it for the principal move.
      `server/auth_pairing.js`, `server/wsAccountAuth.js`, `server/ws_shows.js` must be kept).
      D18 items 11–12 (2026-11-04): the D18 session adds the isolated HTML preview origin as a new module of
      `atome-server` (new file; it announces its `main.rs`/`lib.rs` edits, left alone meanwhile) and an admin role plus
      feature requests in the Fastify account and bug-report modules: L3.5/L3.6 port them, table and column to come.
      Shared files touched by this session on 2026-11-04/05 (keep when merging): `atome-server/src/{lib.rs,main.rs,
      control.rs}` (module `vault_router`, `control.serve(vaults, router)`, central database opened in `main.rs`),
      Tauri `public_relay.rs`, `auth_device.rs`, `local_auth_device.rs` (only `Message::Text(….into())` for Axum 0.8),
      `server/news_broadcast.js` (option `vaultRouter`), `server/server_services.js` (passes it).
      D18's admin role (message of 2026-11-05), to port with L3.5/L3.6: table `auth_account_roles`
      (`database/auth_security_schema.sql`: principal_id, role CHECK 'admin', granted_ms, granted_by, PK principal+role),
      owner `server/auth_account_roles.js` (`createAccountRoles`, `wsSignedInPrincipal`, frame `account-roles`; grants
      only by `scripts/account_roles_admin.mjs`), `server/ws_feature_requests.js` (`feature-request-roadmap` public,
      `feature-request-admin` role-checked); native admin frames wait for the Axum port to carry the account credential.
- [x] L3.6 Uploads, media, files, admin export/import (2026-11-05; the two retirements happen at L3.10).
  - [x] Uploads (2026-11-05): `src/media/uploads.rs` (`server/http_upload_routes.js`: one-shot `POST /api/uploads`,
        `/chunk`, `/complete`; recordings branch, `X-File-Path`, Downloads' `_N` counter), `storage.rs` (homes,
        Downloads, `registerFileUpload`'s rows in the central database, chunk assembly), `wallpaper.rs`
        (`/api/uploads/remote-wallpaper`, inline for an account that cannot own a file), the listing `GET
        /api/uploads` (`listUserDownloads`: the vault's `files:described`, Node's millisecond `mtime`), and the `file`
        family's `upload-chunk`/`upload-complete` on `/ws/api` (`src/ws_api/file_ops.rs`; the requester read on
        Fastify's half, `front-file-requester`). Stricter than Fastify by design: the HTTP chunks kept per uploader, a
        partial assembly removed, a registration failure in `upload-complete` returned, a failed ffmpeg output removed.
        Defect fixed on the way: the recorder sent its WAV as `audio/wav`, which Fastify refuses with 415 before any
        route (`eVe/domains/media/api/audio_core_storage.js`, now `application/octet-stream`).
  - [x] Video playback shared with Tauri (2026-11-05): `src/media/playback.rs` (remux of a late `moov`, transcode of
        HEVC or a non-MP4 container into `.video_cache`, 120 s ffmpeg deadline, one job per output); Tauri's
        `server/mod.rs` and `local_file_transfer.rs` now call it (about 450 duplicated lines removed).
        Tests `tests/atome_server/media_names.rs` (Node's name cases); probes `temp/l36_media/`: uploads 27/27, ws
        uploads 18/18, listing 6/6, recorder content type 200/200.
  - [x] Downloads (2026-11-05, with L3.7): `GET /api/uploads/:file`, `/api/recordings/:file`, `/api/extract-audio/:file`
        and the `file` family's `download-info`/`download-chunk`/`delete` (`src/media/served.rs`, `src/ws_api/file_reads.rs`),
        read rights through news, threads and circles; `@fastify/compress` replicated (streams and ranges encoded, HEAD
        never, `x-no-compression`, Vary only when encoding), Node's 500 on a non-Latin-1 header. Tests
        `tests/atome_server/downloads.rs` 3/3; probe `temp/l37_files/downloads_parity.probe.mjs` 88/88.
  - [ ] Retired at the cutover (L3.10), not ported: `/api/files/*` (no consumer in the repository).
  - [ ] Admin export/import (`POST /api/admin/users/export`, `/import`, `server/http_admin_user_routes.js` +
        `userExportImport.js`): retired at the cutover (L3.10), not ported (user decision, 2026-11-05).
- [x] L3.7 Communication, news, communities, forums, push (2026-11-05). Each family answered on `/ws/api` by the front,
      Fastify's half asked only for who the connection is and to deliver live (`front-connection`, `front-direct`,
      `front-tell`, `server/ws_api_front.js`); the JS handlers stay until L3.10 for the A/B probes.
  - [x] Relations (`src/social/relations.rs`, `request_guard.rs`, `phone.rs`; `contact` family), direct messages
        (`direct_messages.rs`, `message_guard.rs`, `message_store.rs`), the notification stack and push
        (`notification_stack.rs`, `push.rs`), the directory (`directory/`), News, communities and forums (`news/`).
        Probes `temp/l37_social/`, `temp/l37_news/news_parity.probe.mjs`, `temp/l37_directory/directory_parity.probe.mjs`.
  - [x] Sharing (`src/social/sharing/`: `mod.rs` dispatch and delivery, `grants.rs` request/respond/publish,
        `manage.rs` rights, peer, policy, lists, revoke, `lists.rs` the list versions and receipts, `list_view.rs`
        (atome/src/shared/list_share_contract.js), `rights.rs` (share_rights.js); `src/social/conditions.rs` the
        privacy rules' Conditions (permission_adapter.js), `privacy_rules.rs` set/list; `src/ws_api/share_ops.rs`).
        Probes `temp/l37_share/share_parity.probe.mjs` 144/144, D18's `temp/d18_list_share/server_lists.probe.mjs` 25/25.
        The central permission reads (`get-atome`, `accessible`, `check`) have no client caller: they stay on Fastify
        and are retired at L3.10. L3.8 note: `server/scheduled_send_channels.js` calls the share engine in process;
        ported, the scheduled sends call `Sharing::request`.
- [x] L3.8 Projections (shop, coaches, public events, objectives), site, billing (2026-11-05; the scheduled sends,
      the clocks and the live connections followed the same day, batch F).
  - [x] Objectives network (`src/social/objective_network.rs`). Probe `temp/l38_objectives/objective_parity.probe.mjs` 38/38.
  - [x] Public events (`src/social/public_events/`: `contract.rs`, `store.rs`, `mod.rs`); recurrences expanded by the
        calendar engine shared with the browser (`front-calendar`; in Rust since L3.10a, `src/calendar/`), every screen told (`front-broadcast`). Root-cause
        fix on the way: `calendar_event` declared neither `publication`, `publication_status` nor `booking`, so the type
        gate refused every public event and coach session on both servers (core_atome_data_types.js, registry rebuilt).
        Probe `temp/l38_events/public_events_parity.probe.mjs`.
  - [x] Shop (`src/social/shop/`: listings, orders and escrow, a project's copy, conversations). Its 5 min release
        clock runs in Rust (`shop/mod.rs#clock`, started by `WsApi::clocks`); Fastify's `setInterval` is gone; every
        `orders` read still releases what is due. Probe `temp/l38_shop/shop_parity.probe.mjs`.
  - [x] Coaches (`src/social/coaches/`: directory, bookings, `coaches` + `coaches-public`); the coaching's shape, its
        zone arithmetic and the slots are the coach contract shared with the browser (`front-coach`; in Rust since L3.10a, `social/coaches/contract.rs`). Probe
        `temp/l38_coaches/coaches_parity.probe.mjs`.
  - [x] `share-key` (R-115 D25 B, asked by the D18 session): `ws_api/projection_ops.rs#share_key`, the account read as
        its own token names it (`front-connection` `signed`).
  - [x] Clocks and live connections (2026-11-05, batch F). The live registry `src/social/live.rs` holds every
        `/ws/api` connection the front opened (`tell`, `tell_except`, `deliver` = live or the pending console queue,
        `enqueue`, the queue flushed on attach, `broadcast`; `Notifier` = stack + live + push). Fastify still decides
        attach/detach (its token and expiry rules) and tells the front by an internal `front-live` frame on the
        connections marked `x-atome-front` (`ws_api_front.js#markFrontConnection`, `wsApiState.js#tellFront`);
        `front_link.rs#live` reads it, a detach also frees the seats. Every Rust caller of `front-tell`,
        `front-direct` and `front-deliver` now goes through the registry (seats, surfaces, surface grants, teleport,
        shares, messages, news, contacts, shop, coaches, public events); the JS `front-*` handlers stay for the A/B
        probes and are retired at L3.10. Scheduled sends (`src/ws_api/scheduled/`: `store.rs`, `channels.rs`,
        `fire.rs` (a send leaving, the clock), `mod.rs`: save, cancel, send now, read, list, the due clock armed on the next due within
        `SCHEDULED_SENDS_TICK_MS`; News, direct messages with their share asked through `Sharing::request`, social
        publish and update) replace Fastify's, whose clock was removed. The clocks start from `WsApi::clocks`
        (`web::router`, once): scheduled sends, shop, the monthly health reference build (`src/health_reference.rs`,
        `HEALTH_REFERENCE_BUILD=true`; `server/health_reference_schedule.js` removed). Fastify's site clock retired
        (the Rust one runs from `main.rs`). Deliberate differences: Rust deliveries reach only the connections the
        front opened (a personal domain read straight from Fastify gets none until the cutover); a share envelope
        without `params` is `scheduled_message_envelope_invalid`; health logs are JSON lines on stderr. Probe
        `temp/l310_clocks/clocks_parity.probe.mjs` 61/61; rerun after: direct messages 33/33, notification stack 42/42,
        relations 48/48, shop 60/60, live 119/119, share 144/144 (one run in three shows 7 list-order mismatches: two
        requests made in the same millisecond tie under the `ORDER BY created_at DESC` both servers share).
  - [x] Site (2026-11-05, `src/site/`: publishing and its clock, the projection to HTML, `/_site` and personal
        domains, the simulated domains and mail, the hosting summary; DNS proofs read over UDP by an internal
        client). The contact form (`POST /_site/contact`, `src/site/contact.rs`) is Rust since batch F, its notice
        through the `Notifier`; Fastify's own site clock is retired (Fastify's route stays for the A/B probe until
        L3.10). Defects fixed on the way: a DNS record's type was the frame's own `type` (`site`), so every record a
        person set was written as `site` (now `record_type`: contract, panel, both servers); a static file's ETag
        rounded its date as Node does (it truncated). Probe `temp/l38_site/site_parity.probe.mjs` 116/116.
  - [x] Billing (2026-11-05, `src/billing/`: the ledger, `billing` status/offers/store proofs, the Apple and Google
        verifications and their notification routes, the account-creation payment). The debit/authorize of the
        providers moves with them (L3.9). Probes `temp/l38_billing/billing_parity.probe.mjs` 60/60,
        `temp/l35_auth/phone_link_parity.probe.mjs` 7/7.
- [ ] L3.9 Providers (AI, music, Strava, social), external sources, mail, visio, surfaces/teleport/remote control,
      dev/shell, iOS OTA.
  - [x] AI (`src/providers/`: keys, secrets, OpenAI, realtime, speech, audio and video services, shared grant).
        Probe `temp/l39_providers/ai_provider_parity.probe.mjs` 60/60.
  - [x] Music (2026-11-05, `src/providers/music/`: Spotify PKCE session, reads, controls, the durable write ledger
        through the person's own `events`/`state-current` frames, Deezer's public catalog), Strava
        (`src/providers/strava.rs`) and the social networks (`src/providers/social/`: sessions, TikTok, Instagram,
        Facebook, media probe and variants by ffprobe/ffmpeg, sharing jobs under `<vault>/social/jobs` at 0600,
        assisted routes, the consent callback and the photos' pull URL on `/api/social/`, `web.rs`). One consent
        registry for all (`oauth.rs`). Probe `temp/l39_providers/music_strava_social_parity.probe.mjs` 52/52 (no
        provider reached). `facebook.update` (a scheduled post's new text) is back with the scheduled sends
        (`providers/social/facebook.rs#update`, `providers/social/mod.rs#update`, batch F). `Failure` now carries `detail`/`social_code` as
        strings (clippy `result_large_err`).
  - [x] Mail (2026-11-05, `src/mail/`): the server's own sender (`ATOME_MAIL_*`, an unknown security refuses the
        start) and the personal mail gateway `POST /api/eve/mail/{sync,send,mark-read,archive,delete}` (`gateway.rs`:
        the request's credentials only, the SSRF guard, one runtime per person and credentials), on the crate's own
        SMTP/IMAP clients over tokio + rustls (system roots). Probes `temp/l39_mail/system_mailer_invites_parity.probe.mjs`
        44/44 (local SMTP mock, implicit TLS and STARTTLS, throwaway CA; the closed sign-up opened once by an
        invitation), `temp/l39_mail/mail_gateway_parity.probe.mjs` 43/43 (no mail server reached); test
        `tests/atome_server/mail.rs` replays Fastify's recorded IMAP/SMTP transcript (`temp/l39_mail/mail_vectors.mjs`):
        same lines sent, same 18 answers. Fixed at the root on both servers (JS `mail_socket.js`,
        `node_protocol_clients.js`; Rust `socket.rs`, `imap.rs`): IMAP `starttls` negotiates STARTTLS (CAPABILITY,
        STARTTLS, TLS, CAPABILITY) before LOGIN and refuses a server that does not offer it
        (`imap_starttls_not_supported`); `ssl` is implicit TLS like `tls`; bytes left after a STARTTLS go-ahead
        refuse the upgrade (`tls_upgrade_unexpected_data`). Open question to the user: `none` (clear text).
  - [x] External sources (2026-11-05, `src/ws_api/sources/`, `server/wsExternalResourceOperations.js`). Batch A
        (gps, youtube, peertube, video catalog, books, tone3000, food facts): `temp/l39_sources/sources_a_parity.probe.mjs`
        143/143 (local mock for the GPS URLs; no real provider reached). Batch B (personal import with CalDAV/CardDAV
        and ICS, TV catalog, shows, media library, health reference, bug reports, feature requests, account roles):
        `temp/l39_sources/sources_b_parity.probe.mjs` 166/166, `temp/l39_sources/dav_parse_check` 218/218 identical,
        iterator fuzz `temp/l39_sources/recur_check` 4 900 rules 0 different. One recurrence iterator
        (`personal_import/recur_iterator.rs`, a port of `ICAL.RecurIterator`) expands every VTIMEZONE sub-rule; it ends
        where ICAL loops forever (a year out of reach, or a state already seen), same occurrences before.
        `cargo clippy --release -p atome-server --all-targets` 0 warning.
  - [x] Visio (mediasoup SFU): ported at L3.10b (user decision 2026-11-06, the `mediasoup` crate), below.
  - [x] Dev routes, shell, iOS OTA (2026-11-05): `src/dev/` (`/dev/state` with Fastify's live counts through
        `front-dev-state` on `/ws/sync`, `/dev/client-log`, `/client-log`, `/dev/snapshot`; the shell's guards in the
        JS order, only narrower: a one-string list refused, prototype keys ignored), `src/ws_api/shell_ops.rs`,
        `src/ios_ota/` (store lock, HMAC capabilities, manifest, ranges, 410/403/503). Root-cause fix: a body without
        content type is a 415 as on Fastify (`http/fastify_reply.rs#body`). Probe
        `temp/l39_dev/dev_shell_ota_parity.probe.mjs` 138/138. At the cutover: Fastify's own OTA cleanup timer goes
        with its routes.
  - [x] Surfaces, surface grants, teleport, remote control, remote commands (2026-11-05): `src/ws_api/{surface_ops,
        seats,surface_grant_ops,teleport_ops,remote_control_ops,remote_commands}.rs`, `src/social/surfaces/`; the seat
        registry is the front's (`seats.rs`, a `Weak<Connection>` per seat), a whole account still told through
        `front-tell` (`except` added), `front-connection` answers `thrown` and, with `seat`, the program seat. Probe
        `temp/l39_live/live_parity.probe.mjs` 119/119 (offer, accept, persist, return, rollbacks, cross-account, a seat leaving and reclaimed). Root-cause fix on the way: no teleport could commit on either
        server (`teleport_*` declared by no type → `atome_property_unknown`); declared on any atome in
        `atome_type_written_properties.js#ATOME_COMMON_PROPERTY_SCHEMA`, registry rebuilt.
- [ ] L3.10 Cutover on a copy of the production vaults (A/B probe Fastify vs Axum), then deploy (user, atome.one).
  - [x] L3.10a `atome-server` without Fastify (inventory 2026-11-05, done 2026-11-06). Inventory read from the code of that day:
        **`front-*` frames** (Rust asks, `server/ws_api_front.js` / `ws_sync_front.js` answer), all from one
        per-connection identity Fastify holds (`_wsApiUserId`, `_wsApiAuthExpMs`, `_wsApiDeviceClaims`,
        `_wsApiSessionId`, `_wsApiProvenKeyId`, `_authPairRequestId`, `_authLinkAttemptId`; `wsApiState.js`,
        `wsApiIdentity.js`, `auth_session_validation.js`): `front-principal` (device session + `requirePrincipal`,
        atome_ops), `front-connection` (13 callers: contact, news, messages, surfaces, shell, providers, projections,
        shares, notification stack, sources, account roles, bug reports, personal import), `front-file-requester`,
        `front-claims`, `front-proof`, `front-identity` (`installSessionIdentity`), `front-notify`
        (`wsAccountAuth#notify`: live devices of an account, then push), `front-disconnect` (`disconnectSession`),
        `front-pair` / `front-pair-update` (`tellRequester`), `front-attach`, `front-link-attempt` / `front-link-ready`
        (`announceLinkReady`), `front-committed` (`afterFrontCommitted`: `/ws/sync` publish + directory refresh),
        `front-calendar` (`calendarRangeOccurrences`, the browser's calendar engine) and `front-coach`
        (`coach_contract.js`), `front-live` (Fastify → front: attach/detach), on `/ws/sync` `front-sync-request`,
        `-challenge`, `-message`, `-validate`, `-activate` (`wsSyncSecurity.js`, provisioning, expiry, version),
        `front-dev-state` (`/dev/state`'s live counts and recent errors).
        **`/ws/api` still passed to Fastify**: a frame that is not JSON (`{type:'error',message:'Invalid JSON'}`),
        `auth` actions outside the ported lists (`auth_protocol_upgrade_required`), `ping`, `visio`, `guest-adoption`
        (`wsApiGuestAdoption*.js`), `atome` but `history` (get, list, get-particle(s), transfer-owner, the mutating
        refusals, `ws_api_atome_request.js`, `ws_api_atome_list.js`), `sync` `get-pending`/`ack` (central sync
        tracking), `conditions` (`properties-discover`, `once`: the condition engine), `share`
        `get-atome`/`accessible`/`check` (retired), any other type (device-session check, then silence); the
        connection's opening (`validateToken` of the upgrade request attaches a bearer without `cnf.pop`) and closing.
        **HTTP still proxied**: `/offline-manifest.js` (`offline_app_assets.js`, watched digests), `/api/files/*` and
        `/api/admin/users/{export,import}` (retired, user decisions), `/api/admin/sync-clients` (githubSync's dead
        client manager: always empty, no auth), Fastify's 404 for every unclaimed route and the preflights of
        unclaimed routes, a personal domain's WebSockets.
        **Timers/watchers left in Fastify**: the OTA retention (`http_ios_ota_routes.js`, 60 s), the offline manifest
        watch (150 ms settle), the aBox mirror (`aBoxServer.js`, chokidar — removed 2026-11-06, user decision, with its
        watcher and `SQUIRREL_MONITORED_DIR`), GitHub auto-sync (`githubSync.js`, opt-in `GITHUB_AUTO_SYNC=true`), version
        watchers (`server_version.js`); batch F's pushers above are the JS twins of ported families.
        **Startup duties of `server/server.js`**: log directories; `db.initDatabase` (schema.sql,
        auth_security_schema.sql, column preparation, `runAdoleSchemaMigrations` and the schema modules, `PRAGMA
        user_version` fingerprint); `ensureOpaquePrincipalIdentity` and `repairGlobalStateCurrentScopes` (one-time
        legacy repairs, below); the directory rebuild (already Rust). Visio (`visio.js`, mediasoup) excluded: open
        question to the user.
        **Done (2026-11-06)**: `atome-server` starts and serves with no Fastify child and no Node process
        (`src/main.rs`: no spawn, no front secret, no `ATOME_FASTIFY_PORT`; `src/front.rs` and `src/front_link.rs`
        removed). Each connection holds its identity itself: `src/auth/connection.rs` (`Identity`, `Expiry`,
        `validate_connection`, `resolve_principal`, `program_seat`, `provisioned`) and `src/ws_api/identity.rs`
        (attach/detach on the live registry, `principal_of`, `connection_of` for the 15 former `front-connection`
        callers, `file_requester`, `requester`, `claims_of`, `proven`, `install`, the opening bearer `opened`);
        the auth effects (`notify`, `disconnect`, `pair`, `pair-update`, `attach`, `link-ready`) are
        `src/ws_api/auth_effects.rs`, named plainly in `auth/outcome.rs`; `/ws/api`'s dispatch order is Fastify's
        (`ws_api/mod.rs`: invalid JSON, `null`, `auth`, the session check, the families, `ping`, unknown types logged
        once). `front-committed` → `atome_ops.rs#after_committed` (`/ws/sync` publish, directory refresh);
        `front-calendar` → `src/calendar/`, `front-coach` → `src/social/coaches/contract.rs` (vectors
        `calendar_parity`, `coach_contract_parity`); `front-dev-state` → `social::live::counts` +
        `http::request_id::recent_errors`; `/ws/sync`'s `front-sync-*` → `src/ws_sync/security.rs` (bearer from the
        Authorization header only, challenge bound to the connection nonce, `registerClient:false`, checked again
        before each control message and delivery, version read from `atome/src/version.json`). Ported families:
        `atome` reads/list/transfer and the mutating refusals (`ws_api/atome_requests/`, parity 110/110,
        `tests/atome_server/atome_requests.rs`), `sync` get-pending/ack (same), `guest-adoption`
        (`ws_api/guest_adoption/`, `temp/l310_guest/parity.probe.mjs` 128/128), `conditions` (`src/conditions/`,
        `tests/atome_server/conditions.rs`), `visio` → `visio_unavailable` (open question). HTTP: `/offline-manifest.js`
        (`http/offline_manifest/`), Fastify's 404 JSON (`statics::not_found`) and a listed origin's preflight on any
        route; the native media routes' OPTIONS 204; a personal domain gets the whole app once its site did not
        answer. Startup: `central_schema::prepare` (Fastify's `initDatabase` + migrations, `src/central_schema/`)
        before anything opens Central; the OTA retention clock (`ios_ota::start`); `GITHUB_AUTO_SYNC=true` refused
        explicitly (`github_auto_sync_unsupported`). Retired with the proxy (user decisions, or no consumer):
        `/api/files/*`, `/api/admin/users/{export,import}`, `/api/admin/sync-clients` (now Fastify's 404), the share
        family's `get-atome`/`accessible`/`check` (« Unknown action »). D18 fix on the way (root cause): `auth me`
        re-attached a renewed device session without its expiry, so the attachment kept the ending token's and the
        next request past it detached the connection (it then heard no live notice); `me`'s `attach` effect now
        carries the session's `exp` (`temp/d18_auth/live_notice_after_renewal.probe.mjs` 12/12).
        **A/B reference kept**: Fastify's JS is untouched; `ATOME_REFERENCE_CONTROL_DIR` makes atome-server bind the
        control socket (`vaults.sock`) a reference Fastify reaches the vaults through; `temp/comm/comm_harness.mjs`
        starts that Fastify on port+1000 (same base, secret and vaults), `PROBE_NO_REFERENCE=1` starts atome-server
        alone. Launchers: `scripts/run_fastify.sh` (`npm run start:server`) builds and execs atome-server alone,
        `scripts/server_update.js`'s unit and `deploy/atome-one-sync/atome-sync.service` start
        `target/release/atome-server`. Probe `temp/l310_no_fastify/no_fastify.probe.mjs` 15/15 (no `node` in the
        server's process group, nothing on port+1000; sign-up by the mocked SMS, sign-in by the device session,
        commit, live sync, share, upload, a scheduled send fired by its clock, visio). Rust tests rewritten on real
        device sessions (no fake Fastify): `ws_api`, `ws_sync`, `media_token`, `supervisor` (the front test removed),
        support on `central_schema::prepare`. Still to do at the cutover: remove the reference control socket and the
        harness's reference, the `server/server.js` root-marker check in `main.rs`, Fastify's JS; the open questions
        are in R-118 (visio, aBox mirror, GitHub auto-sync, the legacy repairs, the migration chain's non-idempotence on
        an empty stored condition, reproduced by `central_schema`).
  - [x] L3.10b Visio (2026-11-06; user: « la visio est une partie très importante, ne casse rien »). Inventory read
        from the code of that day (`server/visio.js` 331 l., `visio_commands.js`, `visio_helpers.js`,
        `visio_ws_handler.js`; `visio_routes.js` dead, never imported; `wsCommunicationOperations.js`,
        `ws_api_connection.js:146/233`). **Frame**: `{type:'visio', action, input}` on `/ws/api` → `visio-response`
        `{requestId, success:true, ...fields}` or `{success:false, error}`. **Signaling** (`input` + `type: action`;
        the answer loses `requestId`/`request_id`/`type`, gains `signal`): `joinRoom {room_id|roomId}` → `roomJoined`
        `{room_id, rtpCapabilities, existingProducers[{producer_id, kind, peer_user_id, paused}],
        participants[{peer_user_id, username:null}]}`; `leaveRoom` → `leftRoom`; `createTransport {direction}` →
        `transportCreated {direction, transportOptions{id, iceParameters, iceCandidates (with Node's `ip`),
        dtlsParameters}}`; `connectTransport {transport_id, dtlsParameters}` → `transportConnected {transport_id}`;
        `produce {transport_id, kind, rtpParameters, appData}` → `produced {producer_id}`; `consume {transport_id,
        producer_id, rtpCapabilities}` (paused) → `consumerCreated {consumerOptions{id, producerId, kind,
        rtpParameters, type, appData:{}}}`; `pauseProducer`/`resumeProducer`/`closeProducer {producer_id}` →
        `producerUpdated {producer_id, paused}`; `resumeConsumer {consumer_id}` → `consumerResumed {consumer_id}`.
        Refusals: `Missing room_id`, `Access denied`, `Join a room first`, `Room not found`, `Transport not found`,
        `Missing producer_id`, `Missing rtpCapabilities`, `Cannot consume`, `Producer not found`, `Consumer not
        found` (`Authentication required`, `auth`, `ping`: dead through `/ws/api`). **Commands** (`deviceKey` =
        the session's `cnf.kid`): `create {name, mode, messageOnMiss}` (live, or preparing), `schedule {participants
        ≤5, title, start, end}` (`visio_rooms` row, `call-scheduled` notices), `invite {roomId, target}` (by id or
        number, the peer-to-peer verdict, `room_full` past 5; a preparing room's owner rings it:
        CALL_RING_TIMEOUT_MS 10 000, then `recording`; offline or do-not-disturb → `recording` at once;
        `call-invitation` notice), `state`, `accept` (device-bound: `visio_answered_elsewhere`), `decline`
        (`call-declined` notice), `cancel`; a placed call's party leaving cancels it (`peerLeft`). Errors
        `visio_room_denied`, `contact_required`, `visio_target_unavailable`, `visio_call_ended`,
        `visio_accept_denied`, `visio_device_session_required`, `visio_answered_elsewhere`,
        `visio_decline_denied`, `visio_cancel_denied`, `visio_action_unsupported`, `invalid_schedule`,
        `participants_required`, `communication_call_mode_invalid`. **Pushed** `{type:'visio-event', room_id,
        data}`: `participantJoined {peer_user_id, username:null}`, `participantLeft {peer_id, user_id}`,
        `newProducer {producer_id, kind, peer_user_id}`, `producerClosed {producer_id, peer_user_id}` (a peer's own
        close) or `{producer_id, requestId}` (to a consumer, its producer gone), `producerPaused`/`Resumed
        {producer_id, kind, peer_user_id}`, `callState {roomId, mode, status, expiresAt, targetId,
        acceptedPrincipalId, acceptedKeyId}` to the owner and the invited (and, unless ringing/preparing, a VoIP
        push `call-state:<room>:<status>:<key>`). **Rights** (`canJoinRoom`): an ended call never; ringing: the owner
        only; a device other than the accepted one never; the called target only once accepted; the owner; never
        across a block; invited, public, or the owner's contact for `connections`. **SFU**: one worker
        (`MEDIASOUP_RTC_MIN_PORT`/`MAX_PORT` 40000–49999), one router per room (Opus 48 kHz/2, VP8 with
        `x-google-start-bitrate` 1000), WebRTC transports on `MEDIASOUP_LISTEN_IP` (127.0.0.1) and
        `MEDIASOUP_ANNOUNCED_IP`, UDP+TCP, UDP preferred; a DTLS close closes its transport (its producers'
        `producerClosed` to the room); a connection's close leaves its room; the last peer out closes the room; a
        dead worker ends the process. **Port**: `atome/servers/atome-server/src/visio/` (mod 131 l., worker 134,
        state 208, rights 178, calls 305, invites 172, signaling 280, streams 158, events 91, shapes 43) on the
        `mediasoup` crate =0.21.0 (its router capabilities equal Node 3.19.14's, ids 1–12; 0.20 differs), behind the
        default `visio` feature (Tauri and iOS: `default-features = false`, their local servers answer `Unknown
        message type` as before; a server built without it answers `visio_unavailable`); the worker starts once in
        `main.rs` before the server listens (`visio_worker_start_failed:…` is a startup error); `ws_api/
        message_ops.rs` hands it the frame, `ws_api/mod.rs#join` the close. Kept deviations, all root causes: an
        invalid port/IP setting stops the startup (`<NAME>_invalid`) where Node fell back to the default; a
        `visio_rooms` read error is answered, never swallowed; a closed transport leaves the peer's map; a
        connection's seat holds its peer's serial, so a later connection of the same account under the same peer id
        is never closed or driven by the earlier one; a room's consumers close before its producers. Probe
        `temp/visio_r118/visio_parity.probe.mjs` 58/58 in both orders (3 Chromium pages with the fake camera and
        microphone, the app's `visio_call_runtime.js` and its mediasoup-client 3.18, A/B against the reference
        Fastify): 131 normalised frames and answers identical per client and per step, router capabilities,
        consumer options, transport shapes and ICE candidates identical; media really received (inbound-rtp
        packets and decoded frames growing) with 2 and 3 peers, none while muted, again after unmute and after a
        reconnect; join ~100–160 ms on both; server RSS 35–52 MB (atome-server, worker in-process) against
        102–146 MB (node + mediasoup-worker), CPU equal (1.9 % two peers, 2.6–2.9 % three). `temp/l310_no_fastify/
        no_fastify.probe.mjs` 16/16 (a room created by atome-server alone, no `mediasoup-worker` process).
        **Retired at the cutover**: `server/visio.js`, `visio_commands.js`, `visio_helpers.js`,
        `visio_ws_handler.js`, `visio_routes.js` (dead), Node's `mediasoup` dependency (`package.json`), the
        reference harness's visio; kept until then as the A/B reference.
  - [ ] Retired then (user decisions of 2026-11-05): the admin export/import, `/api/files/*`, the share family's
        `get-atome`/`accessible`/`check`, and every JS handler of a family the front answers — with batch F's: the
        `front-*` handlers of `ws_api_front.js`, the `/_site/contact` route of `site_http.js`, the scheduled-send
        handler (`ws_scheduled_sends.js`, `scheduled_sends*.js`, `scheduled_send_channels.js`).
  - [ ] Fastify pushers left to live connections (batch F, 2026-11-05), ported with their families or retired:
        `communication_delivery.js` (notification delivery), `news_service.js`, `remoteCommandRelay.js`
        (`wsSendJsonToSurface`), `server_services.js` (sharing notify/deliver, public events/shop/coaches broadcast
        and tell, scheduled-send notify/tell — the JS twins of ported families), `visio.js` (`visio-event`),
        `ws_api_connection.js` (communication handler), `wsSurfaceOperations.js`, `wsSurfaceGrantOperations.js`,
        `wsTeleportOperations.js`, `wsRemoteControlOperations.js`, `sharing.js`, `ws_sync_front.js`,
        `wsPhoneLinkAuth.js#announceLinkReady`/`disconnectSession`, `wsAccountAuth.js#tellRequester`;
        `http_dev_routes.js` only counts the registry. Once Fastify stops, `wsApiState.js#attach`'s token and expiry
        rules move into the front's connection (the `front-live` frame then goes).
  - [ ] The legacy migrations run once on the production copy before the switch, then removed:
        `ensureOpaquePrincipalIdentity` (phone principals), `reconcilePrincipalFilePath` (file paths). Counted on the
        same copy: the legacy bcrypt `password_hash` particles the password login still reads and upgrades.
- [ ] L3.11 iOS: `atome-server` embedded in the iOS staticlib (`platforms/ios/bevy-renderer`), Swift
      `LocalHTTPServer.swift` + `AiSRuntime*.swift` (5 141 lines) retired; closes S3 (ACL) and S5 (history);
      AUv3 validated on the iPad (user).
  - [x] Inventory (2026-11-05, read from the code of the unmodified tree).
        **The Swift local server** (`Common/LocalHTTPServer.swift`, NWListener on loopback, a preferred or free port,
        rebound on return from the background, announced to the page as `window.__ATOME_LOCAL_HTTP_PORT__`; started
        by `WebViewManager` in the app AND in the AUv3 extension, each process its own listener, both on the one
        app-group `adole.db`). HTTP: `OPTIONS` 204 (wildcard CORS, no credentials: the page's `atome:` origin is
        opaque); GET/HEAD `/text/<n>`, `/audio_meta/<n>`, `/audio_head/<n>`, `/audio/<n>` (ranges, faststart remux,
        m4a re-encode), `/file/<path>` (ranges), `/health`, `/tree`, `/sync_now`, `/api/server-info`, `/api/uploads`
        (list), `/api/uploads/:file`, `/api/recordings/:file`; POST `/api/uploads`, `/api/user-recordings`,
        `/api/eve/ai/provider-completion` (`LocalAiProxy.swift`); else 404/405. `/ws/api`: `register` (welcome,
        capabilities auth/atome/events/state-current/snapshot), `ping`, `auth` (`start-guest`, `leave-guest`, `me`,
        `local-session-describe`/`-challenge`/`-resume`/`-lock`, `local-link-challenge`/`local-link` proved by
        `wss://atome.one/ws/api` and the device key `AuthDeviceKey.swift`; any other action
        `auth_protocol_upgrade_required`), `ai-provider` and the account types (`account-roles`,
        `feature-request-admin`, `share`, with the account's remote credential) and the 20 public types
        (`youtube-search` … `health-reference`) relayed to atome.one by `FastifySyncClient`/`FastifySyncPublicRelay`,
        `atome` (create, list, get, alter, delete/soft-delete, transfer-owner), `events` (commit, commit-batch, list:
        queued to the outbox), `state-current` (get, list), `snapshot`, `sync` (`flush` through the outbox, the rest
        `AiSRuntimeSync`), `user-data`/`sync_request` → `capability_unsupported`; `event`, `atome:*`, `sync:*`,
        `file-event`, `atome-sync` frames broadcast to the other connections; anything else gets no answer at all
        (`history` — S5 —, the `file` family, `gps-native`, `file-selection`). `/ws/sync`: a local token within 5 s →
        `welcome` (capabilities `ping`), `ping` → `pong`, else `capability_unsupported`, the token re-verified on
        every frame (`authentication_expired`). Store (`AiSRuntime*.swift`): `adole.db` in the app group, journal
        DELETE (WAL refused: an idle WAL handle keeps shared locks → 0xDEAD10CC), one handle per process, 2 s busy
        wait, every unit under a background activity assertion, `sqlite3_interrupt` when background time ends; ACL
        owner/creator only (S3), no history (S5); local accounts = guests + grants bound to atome.one accounts;
        tokens HS256, 900 s, key 32 bytes in the keychain (`one.atome.auth.local`/`token-key`).
        **Outside the two files, Swift calls the store directly**: `AppNativeGpsController` (verifyToken, state get,
        events commit), `AppNativeHealthController`, `AppNativeAppleMusicController` (verifyToken, state get),
        `AppNativeCommunication` (`localAuthDescriptor`), `WebViewManagerIPC` (`handleAuthMessage` over the native
        bridge), `AppBackgroundLifecycle` (activity assertion, `coverQueuedWork`, `interruptActiveWork`), and the remote
        sync `FastifySync*.swift` (7 files, 1 067 lines: outbox, cursors, inbound projection, relays) is built on the
        store's sync functions (`pendingRemoteSync`, `outboundSyncEvent`, `finishRemoteSync`,
        `persistRemoteSyncEnvelopes`, `remoteSyncCursors`, `completeRemoteReplay`, …): retiring `AiSRuntime*` retires
        them too.
        **What the client calls on iOS**: `isTauriRuntime()` is true for `atome:`, so the page talks to the iOS local
        server exactly as to Tauri's local Axum host (`platforms/desktop-tauri/src/server/`): same port variables,
        same `/ws/api` families, same HTTP routes. The Swift server is a re-implementation of that host (identical
        relay lists, auth actions and families); Tauri also answers `history`, `user-data`, the `file` family,
        `gps-native`, `file-selection` and the remote projection on `/ws/sync`.
  - [x] Design (2026-11-05): the iOS embedded server is Tauri's in-process one-person host, not the Web front.
        `atome-server`'s `ws_api` is a front joined to Fastify (central database, `front-*` frames, central sessions);
        the iOS server's job is the Tauri host's: one local vault on `atome-store`, local accounts, the relays to
        atome.one and the remote sync worker. One owner: Tauri's host moves into `atome-server` as `local` (the open
        L3.1 item « Tauri's server is split into atome-server, Tauri keeping only its native glue »), its native needs
        as host hooks (the device key's signer: Tauri's keychain `auth_device.rs` / iOS `AuthDeviceKey.swift`; the
        token key; clipboard and audio-engine routes stay Tauri glue); the iOS staticlib exposes a C ABI (start with
        port, data directory, token key; stop; resume after background; verify a token and answer one message for the
        native controllers). `atome-server` already builds for `aarch64-apple-ios-sim` (`cargo check -p atome-server
        --lib`, 2026-11-05). Store requirement found: `atome_store::prepare_schema` switches the database to WAL,
        which the app group forbids (0xDEAD10CC): the iOS host must keep DELETE.
        Move map (read 2026-11-05): to `atome-server::local` the host proper — `local_atome*.rs`, `local_auth*.rs`,
        `ws_api.rs`, `provider_relay.rs`, `public_relay.rs`, `local_file_transfer.rs` (less its clipboard import),
        the uploads/recordings/files/AI-proxy/mail/status handlers and `start_server` of `mod.rs` (4 929 lines, split
        on the way). Its only Tauri couplings: `crate::runtime_logging::xcode_logs_enabled` (`mod.rs`,
        `local_atome.rs`), `crate::auth_device::auth_device_handle` (`local_auth_device.rs`: a host hook),
        `crate::native_clipboard` + `tauri::Url` (`local_file_transfer.rs` clipboard import: Tauri glue),
        `crate::audio_engine` (the six `remote_audio_*` handlers of `mod.rs`: Tauri glue). Tauri glue that stays:
        `gps_native.rs` (macOS), `file_selection.rs`, `remote_control*.rs`, `static_asset_cache.rs`, the desktop update
        routes (`apply-update`, `batch-update`, `sync-from-zip`).
  - [x] Done (2026-11-06; the block was lifted by D18's hand-over). Move: Tauri's host is `atome-server::local`
        (`local/mod.rs` 3 269 lines, down from 4 929; `ws_api.rs`, `local_atome*`, `local_auth*`, relays, file
        transfer), its platform needs behind the `local::Host` trait (device-key verify, session secret, journal mode,
        extra `/ws/api` families, extra routes); `local::prepare` (explicit errors, no stubs) + `local::serve`, and
        `ws_api::answer(frame, &state)` shared by the socket and the native controllers. Tauri keeps its glue in
        `platforms/desktop-tauri/src/server/` (`TauriHost` in `mod.rs` 186 lines; `remote_control.rs`, the page
        preview origin, `updates.rs` + `updates_zip.rs`, mail, clipboard, audio, GPS, file selection). iOS:
        `platforms/ios/bevy-renderer/src/local_server.rs` (274 lines, `IosHost`, journal DELETE) exposes
        `atome_ios_local_server_{start,rebind,answer,verify,quiesce,interrupt}`; Swift glue `Common/LocalServer.swift`
        + `AtomeIosLocalServerBridge.h`; the GPS, Health, Apple Music and Communication controllers and the native
        `auth_local_request` go through `answer`/`verify`; the background lifecycle quiesces the vault under a
        background-time assertion and interrupts it on expiry (0xDEAD10CC). Retired with `rm` (24 files, 6 618
        lines): `LocalHTTPServer.swift`, the 15 `AiSRuntime*.swift`, the 7 `FastifySync*.swift`,
        `LocalAiProxy.swift` (copies in `temp/l311_ios/swift_retired/`; the Xcode project uses synchronized groups, no
        pbxproj edit). Store: WAL moved from `prepare_schema` to `vault::open_database`; `legacy_columns.rs` adds the
        Swift layout's missing columns and drops its `remote_sync_stream_cursors` once (pulled again). CORS: the opaque
        `atome:` origin's preflight answers 204 on the native media routes (`/api/user-recordings` and
        `/api/eve/ai/provider-completion` added). S3 and S5 closed: the store's ACL and history serve iOS.
        Proof: the data proof on a copy of the simulator's Swift vault (`temp/l311_ios/data_proof_result.json`);
        the simulator run (`temp/l311_ios/run_embedded.sh`, `rust_embedded.json` vs `swift_baseline.json`):
        commits, state, events, undo (Swift: no answer), atome history (Swift: unknown action), snapshots,
        user-data export (Swift: unsupported), foreign token refused, uploads POST/GET/file and 401, `/ws/sync`
        welcome and pong; the app-group `adole.db` opened in place (journal delete, integrity ok, its 5 events and
        2 atomes kept). Checks: `cargo test -p atome-server --lib local::` 59 passed, `-p squirrel --lib server::` 4,
        `-p atome-store` 15; clippy clean on the touched crates (iOS sim target included); release build of
        `atome-server` + `atome-vault`; Web probes ai_provider_parity 60/60, live_parity 119/119.
        Left: the iPad and AUv3 run (the user); obsolete repository tests that read the retired Swift files
        (`tests/probes/ios_*`, `ios_runtime_probe_support.mjs`, `*_fixture.swift`, `media_asset_identity_contract`,
        `opaque_principal_identity_contract`, `ios_webcontent_boot_capacity_contract`,
        `tests/server/sync_architecture_contract.test.mjs`, `tests/eve/auth_native_restart_contract.test.mjs`) to
        retire or rewrite; residual 0xDEAD10CC risk: a Rust-started unit (sync worker) beginning after the quiesce
        is not under its own background assertion; old Swift session tokens (raw-key HMAC, 900 s) are not accepted.
        Not ported, no caller: the Swift `/text`, `/audio*`, `/tree`, `/sync_now`, `/health` routes.
  - [x] Follow-ups (2026-11-06). **0xDEAD10CC at the root**: `local/local_vault.rs` (`LocalVault`) owns the one
        connection and the one quiesced state; once quiesced, every unit (request, native frame, sync worker, remote
        projection) starts only under background time the platform grants it, else `local_vault_background_time_
        unavailable`; `quiesce` returns once the units under way are over; the sync worker and the `/ws/sync` client
        wait for `foreground()` (the socket closes on `quiesced()`). ABI `atome_ios_local_server_quiesce(begin, end)`,
        `atome_ios_local_server_resume()`; Swift `AppBackgroundLifecycle#beginUnitTime/endUnitTime`. Tests: 5 in
        `local_vault_tests.rs`, `the_worker_leaves_a_quiesced_vault_alone_until_it_is_resumed`. Simulator
        (`temp/l311_ios/background_cycle.sh`): backgrounded 10:56:14.8, lifecycle assertion released 18.7, no unit
        assertion and `adole.db` unwritten over two worker ticks with the process running, same pid back in the
        foreground, parity probe 22/22 identical (`rust_after_background.json`). **Split**: `local/mod.rs` 3 269 →
        203 lines in 12 files (the largest `local_server_info.rs` 394); the `state_current` list moved out of
        `local_atome.rs` (2 380 → 2 164) into `local_atome_state_current_list.rs`, with the two reductions the Swift
        host had (`exclude_particle_keys`; no `tool_ui.activity.select.*` in a `tool` read). Still over 800, not
        this lot: `local_atome.rs` 2 164, `local_atome_remote_projection.rs` 1 006. **Obsolete tests**: the tests of
        Swift structure removed with the Xcode target `atomeGuestAdoptionTests`; the contracts still held rewritten
        against `atome-server::local` (list in CODEMAP 2026-11-06). `cargo test -p atome-server --lib` 75 passed.

## Vault isolation (decided by the user, 2026-11-04: « un process par user, le plus sécurisé et le plus performant »)

One Axum supervisor (`atome-web-server`) and one Rust vault process per user (`atome-vault`, built on `atome-store`).
Web server only: iOS cannot start processes and Tauri/iOS hold one person's vault, so there the vault runs in-process
through the same `atome-store` API.

- The supervisor authenticates (JWT), routes, fans sync pushes out and holds the central registries; it never opens a
  vault file. A vault process opens only its own `vaults/<sha256(principal)>/` and refuses any other actor
  (`vault_actor_mismatch`, as today).
- IPC: a `socketpair` inherited at spawn (no socket path in the file system, nothing else can connect), peer
  credentials checked, persistent and multiplexed (request id), length-prefixed binary frames of the Rust types.
  Replaces Fastify's socket path + secret + newline JSON + one connection per request.
- Confinement (Linux, the production host runs systemd): a distinct uid per vault process, its own mount namespace
  showing only its vault directory, an empty network namespace, Landlock on the file system, a seccomp allow-list,
  rlimits (memory, CPU, open files), no capabilities. A crash or a hostile input stays inside one user's process; the
  supervisor restarts it.
- Life cycle: started at sign-in (warm before the first commit), one open SQLite connection in WAL, stopped after
  180 s idle as today.
- To measure at L3.2 (no figure assumed): RSS and spawn time per vault process vs a Node vault child, and the round
  trip of one commit through the supervisor.
  Measured 2026-11-04 (`temp/rust_vault_2026-11-04/vault_front_e2e.probe.mjs`, isolated server, same machine):
  RSS 9–15 MB per `atome-vault` vs 64–72 MB per Node vault; commit round trip through `/ws/api` median 1.08 ms
  (p95 1.59) vs 0.91 ms (p95 1.49) — two extra hops (front, supervisor) until the routes are in Axum; cold first
  commit 5.8 ms vs 5.5 ms. IPC as built: the socketpair, persistent, multiplexed, length-prefixed frames; peer uid
  check on Fastify's control socket (the vault's socketpair has no path to check).

## Migration path (decided by the user, 2026-11-04: « Axum in front, vaults first »)

Axum goes in front at once. The Rust vault processes come first and become the only writers of every vault; Fastify
keeps the routes not yet ported and reaches the vaults through the Rust supervisor (its `UserVaultProvider` becomes a
client of the supervisor, no Node vault child left). Then domain by domain, each lot deployable. Never two programs
writing one vault file.
