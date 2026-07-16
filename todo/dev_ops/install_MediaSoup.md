# Mandatory Execution Gate

Before starting any implementation, refactor, verification, cleanup, or review work described in this file, fully read and strictly apply.

Read and strictly apply:

- ./.codex/AGENTS.md

If any instruction in this file conflicts with ./.codex/AGENTS.md, ./.codex/AGENTS.md has absolute precedence.

# Atome + Matrix + mediasoup MVP (JS-only)

Status: Actif

## Validated communication boundary

Application commands, signaling, authorization, synchronization and durable data use the
canonical WebSocket architecture exclusively. The narrow constitutional exception allows
mediasoup real-time audio and video media streams to use WebRTC/RTP only for the media
plane. It does not authorize REST, HTTP polling, alternate signaling, duplicated
application transports or another media exception.

Goal: integrate **Matrix protocol** and **mediasoup** into the Atome core as first-class communication infrastructure, while keeping everything **minimal**:

- **JS-only** (no TypeScript requirement).
- **Multi-room (basic)**
- **Recording (if possible)** via a simple server-side pipeline.
- **Matrix-backed identity and rooms**: Atome account creation must provision or link a Matrix account; exchange rooms are Matrix rooms.
- **Matrix call control, mediasoup media plane**: Matrix owns accounts, rooms, membership, invitations, chat/event history, call signaling, telephony, and video session orchestration. mediasoup owns the lower media transport layers for video/audio RTP/WebRTC routing.
- **Phone remains an Atome onboarding credential and authorized lookup input**: it may be
  used for verification, contact discovery, and connection requests, but canonical user
  identity is an opaque immutable principal and the exchange surface must be
  Matrix-compatible.

Important naming note:

- **Matrix protocol** in this file means the open communication framework used by Element X.
- It is distinct from the existing **Project Matrix** UI feature documented under `todo/communication_social/matrix.md`.

---

## 0) Non-goals (explicitly excluded from MVP)

- No multi-machine scaling, no HA.
- No advanced moderation.
- No complex UI/UX patterns (just enough to prove end-to-end media).
- No full-blown meeting features (waiting rooms, breakout rooms, etc.).
- No production-grade abuse protection beyond minimal rate limiting.

---

## 1) Target architecture (minimal)

### Components

1. **Atome Core (Fastify server)**

- Hosts Atome APIs (auth, contacts, account lifecycle, local policies).
- Provisions or links Matrix accounts during Atome account creation.
- Hosts the Matrix integration boundary used by clients for room/account actions.
- Hosts the mediasoup signaling commands used by clients to negotiate WebRTC once Matrix membership and call state allow it.

1. **mediasoup Media Service (Node.js module inside Atome core)**

- Runs mediasoup Workers and Routers.
- Exposes an internal API to the Atome core (function calls, not a separate microservice in MVP).

1. **Matrix Service / Homeserver Integration**

- Provides the canonical account, room, invitation, membership, and event layer.
- Creates exchange rooms as Matrix rooms.
- Provides the telephony/video call state and invitation surface.
- May be backed by an embedded/dev homeserver for MVP or an external homeserver for production, but the Atome API boundary must stay stable.

1. **Client (Atome UI / Tauri WebView / Browser)**

- Uses `mediasoup-client` + WebRTC APIs.
- Uses Atome communication APIs that bridge to Matrix rather than talking directly to ad-hoc room metadata.
- Renders UI with Atome primitives (your own interface).

### Why “inside core”

- mediasoup is integrated like other core plugins: shipped and initialized by Atome core.
- The plugin registers routes + internal APIs.
- Matrix integration must be treated as the communication control plane, not as a decorative chat add-on.

---

## 1.5) Matrix protocol responsibilities

### Required scope

Matrix must own:

- account provisioning/linking from Atome account creation;
- exchange room creation and membership;
- room invitations and acceptance/rejection flows;
- chat/event history for exchange rooms;
- call session metadata for telephony and video;
- authorization context that decides whether a user may join a mediasoup room.

mediasoup must not duplicate:

- durable room identity;
- user accounts;
- invitations;
- membership history;
- chat/event history.

### Atome account creation refactor

Atome account creation must be refactored so that a successful account creation can deterministically create or link:

- the Atome user record;
- the Matrix user/account identifier;
- the default user communication room(s), if required;
- the local identity/contact metadata needed by Atome.

This refactor is part of the Matrix integration, not a separate optional cleanup.

---

## 2) Identity and phone-alias model

### MVP assumptions

- A user account is uniquely identified by an opaque immutable principal.
- `phone_e164` is a unique verified, mutable credential/lookup alias where phone
  onboarding is enabled; it must never be used to derive or persist the principal.
- Authentication can be mocked for a development MVP, but maintained production
  authentication must follow the active authentication backlog.

### Minimal user table fields (conceptual)

- `user_id`
- `phone_e164` (unique)
- `display_name`
- `created_at`

---

## 3) Connection requests (phone-based)

### Concept

Before a user can call / invite another user, they must be connected (or at least have an accepted request).

### Objects (conceptual)

- `connection_request`:

  - `id`
  - `from_user_id`
  - `to_user_id`
  - `status`: `pending | accepted | rejected | blocked`
  - `created_at`, `updated_at`

### WS commands (MVP)

- `contacts.request`

  - body: `{ to_phone_e164 }`
  - action: create request
- `contacts.respond`

  - body: `{ request_id, decision: "accepted" | "rejected" | "blocked" }`
- `contacts.list`

  - returns accepted connections

### Minimal server rules

- You can only invite a user into a room if:

  - you are connected (`accepted`) OR
  - the room is public (optional MVP toggle)

---

## 4) Multi-room model (basic)

### Definition

- A durable **Room** is a Matrix room.
- Atome may keep a local indexed projection/cache of Matrix room metadata for search, UI, permissions, and offline sync.
- Each active call/video session maps one Matrix room or Matrix call session to a **mediasoup Router**.

### Room fields (conceptual)

- `matrix_room_id`
- `atome_room_projection_id` (optional local cache object)
- `owner_user_id`
- `name`
- `visibility`: `private | connections | public` (optional; default `private`)
- `created_at`

### Minimal WS commands

- `rooms.create`

  - body: `{ name, visibility }`
  - creates a Matrix room and returns: `{ matrix_room_id }`
- `rooms.get`

  - returns Matrix-backed metadata
- `rooms.invite`

  - body: `{ to_phone_e164 }`
  - requires connection accepted (if room private)
- `rooms.join`

  - joins the Matrix room or verifies existing membership
- `rooms.call.join`

  - returns: mediasoup capabilities + join token only after Matrix membership/call authorization passes

### Membership

Membership is durable in Matrix. mediasoup participant state is ephemeral and exists only while a user is actively connected to a call.

---

## 5) Signaling (minimal contract)

Signaling is just JSON messages over **WebSocket**.

### WS channel

- `WS /ws`

### Message types (minimal)

#### Client → Server

- `auth`

  - `{ type: "auth", token, phone_e164 }`
- `joinRoom`

  - `{ type: "joinRoom", room_id }`
- `createTransport`

  - `{ type: "createTransport", direction: "send" | "recv" }`
- `connectTransport`

  - `{ type: "connectTransport", transport_id, dtlsParameters }`
- `produce`

  - `{ type: "produce", transport_id, kind: "audio"|"video", rtpParameters, appData }`
- `consume`

  - `{ type: "consume", transport_id, producer_id }`
- `resumeConsumer`

  - `{ type: "resumeConsumer", consumer_id }`
- `leaveRoom`

  - `{ type: "leaveRoom", room_id }`

#### Server → Client

- `authOk` / `authError`
- `roomJoined`

  - `{ type: "roomJoined", room_id, rtpCapabilities, existingProducers: [...] }`
- `transportCreated`

  - `{ type: "transportCreated", direction, transportOptions }`
- `transportConnected`
- `produced`

  - `{ type: "produced", producer_id }`
- `newProducer`

  - `{ type: "newProducer", producer_id, kind, peer_user_id }`
- `consumerCreated`

  - `{ type: "consumerCreated", consumerOptions }`
- `participantLeft`

### Minimal room behavior

- When a peer produces a track, notify everyone in the room with `newProducer`.
- Consumers are created on-demand (pull model) or automatically (push model). MVP can do push + auto-consume.

---

## 6) mediasoup plugin design inside Atome core

### Plugin responsibilities

- Initialize mediasoup Workers (N=1 for MVP).
- Create/lookup Routers per `room_id`.
- Create WebRtcTransports.
- Handle produce/consume.
- Expose a minimal internal API to Atome core.

### Suggested module layout

- `src/core/plugins/mediasoup/`

  - `index.js` (plugin entry)
  - `ms_worker_pool.js` (create worker(s))
  - `ms_rooms.js` (router per room, peer maps)
  - `ms_transports.js`
  - `ms_recording.js` (optional MVP)
  - `ms_signaling_ws.js` (WS handlers)

### Minimal internal API (pseudo)

- `ensureRoom(room_id) -> { router }`
- `createTransport(room_id, peer_id, direction) -> transportOptions`
- `connectTransport(peer_id, transport_id, dtlsParameters)`
- `produce(peer_id, transport_id, kind, rtpParameters, appData) -> producer_id`
- `consume(peer_id, transport_id, producer_id, rtpCapabilities) -> consumerOptions`

---

## 7) Recording (optional MVP, “if possible”)

### What “recording” means here

Record the room’s audio/video to disk from the server.

### MVP approach (pragmatic)

- Use **PlainTransport** to output RTP to localhost ports.
- Spawn **FFmpeg** to capture those RTP streams and write a file.

### Recording scope (keep minimal)

- Record **one mixed audio** + **composite video** is NOT MVP (mixing/compositing is complex).
- MVP recording can be:

  - **single-speaker** recording (choose one producer)
  - OR record **separate tracks per producer** (still non-trivial but simpler than compositing)

### Minimal WS commands

- `rooms.record.start`

  - body: `{ mode: "singleProducer"|"perProducer", producer_id? }`
  - returns: `{ recording_id }`
- `rooms.record.stop`

  - body: `{ recording_id }`

### Minimal files

- Store recordings under:

  - `data/users/<owner_user_id>/media/video/recordings/<hash>.webm` (example)
  - or `.../audio/recordings/<hash>.wav` if audio-only

### Notes

- The exact codec/container depends on your FFmpeg flags.
- You must store metadata in Atome DB (recording object referencing file path + hash).

---

## 8) Minimal UI requirements (Atome-side)

### UI constraint (very important)

The UI must be **ultra-minimal**:

- A single **video window** (local + remote rendering as needed)
- A few **"home-made" buttons** only:

  - open/close the video window
  - create a room
  - invite/select users to invite
  - mute/unmute (optional)
  - camera on/off (optional)
  - leave room

No complex layouts, no side panels, no chat, no fancy meeting UI.

### Screens (MVP)

1. **Video window**

- shows local preview + remote streams (simple stacking or very basic grid)
- open/close behavior is part of Atome UI (not mediasoup)

1. **Room controls (minimal)**

- create room (name can be auto-generated)
- invite one or more users (selected from connections)
- join/leave

1. **Contacts (minimal)**

- search/add by phone number
- accept/reject requests

All UI is Atome-native (no mediasoup UI).

---

## 9) Security (minimal baseline)

MVP must include:

- TLS for the server and WebSocket transport in non-local deployments.
- Basic auth token per user.
- Basic access control: private rooms require invite/connection.
- Minimal rate limits:

  - connection request spam
  - room join attempts
  - transport creation

---

## 10) Zero-touch server installation (install_full.sh)

### Requirement

Everything required on the server must be installed and configured via **one script**:

- `install_full.sh`
- **No human intervention** (non-interactive / unattended)

### What install_full.sh must do (MVP)

- Install OS packages (Node.js, build tools, FFmpeg if recording enabled, firewall tools as needed)
- Create dedicated service user (e.g. `atome`)
- Create required directories (`/opt/atome`, data paths, logs)
- Install project dependencies (`npm ci` / lockfile-based)
- Provision environment (`.env` from template + required secrets placeholders)
- Configure and enable the service (systemd or rc.d depending on host OS)
- Open required ports (server WebSocket + WebRTC UDP port range)
- Run a health check and print final status

### Script properties

- Idempotent: safe to run multiple times.
- Explicit versions (pin Node major, use lockfiles).
- Logs everything to a known location.

---

## 11) Implementation steps (ordered)

### Step A — Plugin skeleton

- Add `mediasoup` + `mediasoup-client` dependencies.
- Add Matrix homeserver/integration configuration and the minimal Matrix client/server dependency selected for the JS-only runtime.
- Create communication plugin entry that registers:

  - WS signaling handler
  - Matrix-backed room commands
  - contacts commands
  - Atome account creation hooks for Matrix provisioning/linking

### Step B — Atome account creation + Matrix identity

- Refactor Atome account creation so every created user deterministically creates or links a Matrix account.
- Persist the Matrix user identifier in the Atome user profile/projection.
- Verify duplicate phone/account cases are explicit and do not create orphan Matrix accounts.

### Step C — Matrix room creation and membership

- Create exchange rooms through Matrix.
- Invite users through Matrix room membership.
- Keep Atome local room projections synchronized from Matrix events.

### Step D — Single worker, single Matrix call room

- Start 1 mediasoup Worker.
- Create 1 Router for an authorized Matrix room call.
- Implement signaling: createTransport/connect/produce/consume.
- Verify Tauri + browser can call each other.

### Step E — Multi-room basic

- Map `matrix_room_id/call_session_id -> Router`.
- Ensure room cleanup when empty.
- Implement join rules from Matrix membership and call state.

### Step F — Phone-based contact discovery

- Implement connection requests + accept/reject.
- Map accepted connections to Matrix invitations where applicable.
- Gate room invitations by accepted connections or Matrix membership policy.

### Step G — Optional recording

- Implement PlainTransport output.
- Spawn FFmpeg process per recording.
- Store result as an Atome “foreign/media” object with metadata.

---

## 11) MVP acceptance checklist

- [ ] User login accepts `phone_e164` as a verified credential alias where phone
      onboarding is enabled, while persisted identity remains the opaque principal.
- [ ] Atome account creation creates or links a Matrix account.
- [ ] Atome user profile stores the Matrix user identifier.
- [ ] Send + accept connection request.
- [ ] Create a Matrix exchange room through Atome.
- [ ] Invite connection through Matrix membership.
- [ ] Join Matrix room from Tauri and/or browser.
- [ ] Join Matrix-backed call session through Atome mediasoup signaling.
- [ ] Publish mic/cam.
- [ ] Receive remote tracks.
- [ ] Leave room cleans resources.
- [ ] (Optional) Start/stop recording produces a file + DB entry.

---

## 12) What comes immediately after MVP (next priorities)

- TURN integration for NAT reliability.
- Device switching + screen sharing.
- Better reconnect handling (network drop).
- Multi-workers (N>1) + simple room sharding.
- Production monitoring (bitrate/RTT/packet loss) + alerts.
