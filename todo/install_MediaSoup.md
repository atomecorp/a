# Atome + mediasoup MVP (JS-only)

Goal: integrate **mediasoup** into the Atome core as a first-class plugin (same integration philosophy as CodeMirror / Leaflet / GSAP), while keeping everything **minimal**:

* **JS-only** (no TypeScript requirement).
* **Multi-room (basic)**
* **Recording (if possible)** via a simple server-side pipeline.
* **Phone-number identity**: users are identified by phone number; users send **connection requests** before joining rooms.

---

## 0) Non-goals (explicitly excluded from MVP)

* No multi-machine scaling, no HA.
* No advanced moderation.
* No complex UI/UX patterns (just enough to prove end-to-end media).
* No full-blown meeting features (waiting rooms, breakout rooms, etc.).
* No production-grade abuse protection beyond minimal rate limiting.

---

## 1) Target architecture (minimal)

### Components

1. **Atome Core (Fastify server)**

* Hosts Atome APIs (auth, contacts, connection requests, rooms metadata).
* Hosts **Signaling** endpoints used by clients to negotiate WebRTC.

1. **mediasoup Media Service (Node.js module inside Atome core)**

* Runs mediasoup Workers and Routers.
* Exposes an internal API to the Atome core (function calls, not a separate microservice in MVP).

1. **Client (Atome UI / Tauri WebView / Browser)**

* Uses `mediasoup-client` + WebRTC APIs.
* Renders UI with Atome primitives (your own interface).

### Why “inside core”

* mediasoup is integrated like other core plugins: shipped and initialized by Atome core.
* The plugin registers routes + internal APIs.

---

## 2) Identity model (phone number)

### MVP assumptions

* A user account is uniquely identified by `phone_e164` (e.g. `+33612345678`).
* Authentication can be mocked for MVP (e.g. dev token) but the phone number must be present.

### Minimal user table fields (conceptual)

* `user_id`
* `phone_e164` (unique)
* `display_name`
* `created_at`

---

## 3) Connection requests (phone-based)

### Concept

Before a user can call / invite another user, they must be connected (or at least have an accepted request).

### Objects (conceptual)

* `connection_request`:

  * `id`
  * `from_user_id`
  * `to_user_id`
  * `status`: `pending | accepted | rejected | blocked`
  * `created_at`, `updated_at`

### Endpoints (MVP)

* `POST /contacts/request`

  * body: `{ to_phone_e164 }`
  * action: create request
* `POST /contacts/respond`

  * body: `{ request_id, decision: "accepted" | "rejected" | "blocked" }`
* `GET /contacts`

  * returns accepted connections

### Minimal server rules

* You can only invite a user into a room if:

  * you are connected (`accepted`) OR
  * the room is public (optional MVP toggle)

---

## 4) Multi-room model (basic)

### Definition

* A **Room** is an Atome entity.
* Each room maps to a **mediasoup Router**.

### Room fields (conceptual)

* `room_id`
* `owner_user_id`
* `name`
* `visibility`: `private | connections | public` (optional; default `private`)
* `created_at`

### Minimal endpoints

* `POST /rooms`

  * body: `{ name, visibility }`
  * returns: `{ room_id }`
* `GET /rooms/:room_id`

  * returns metadata
* `POST /rooms/:room_id/invite`

  * body: `{ to_phone_e164 }`
  * requires connection accepted (if room private)
* `POST /rooms/:room_id/join`

  * returns: mediasoup capabilities + join token

### Membership

For MVP, membership can be ephemeral:

* user joins => server keeps an in-memory `roomParticipants` map
* optional: persist memberships later

---

## 5) Signaling (minimal contract)

Signaling is just JSON messages over **WebSocket**.

### WS endpoint

* `WS /ws`

### Message types (minimal)

#### Client → Server

* `auth`

  * `{ type: "auth", token, phone_e164 }`
* `joinRoom`

  * `{ type: "joinRoom", room_id }`
* `createTransport`

  * `{ type: "createTransport", direction: "send" | "recv" }`
* `connectTransport`

  * `{ type: "connectTransport", transport_id, dtlsParameters }`
* `produce`

  * `{ type: "produce", transport_id, kind: "audio"|"video", rtpParameters, appData }`
* `consume`

  * `{ type: "consume", transport_id, producer_id }`
* `resumeConsumer`

  * `{ type: "resumeConsumer", consumer_id }`
* `leaveRoom`

  * `{ type: "leaveRoom", room_id }`

#### Server → Client

* `authOk` / `authError`
* `roomJoined`

  * `{ type: "roomJoined", room_id, rtpCapabilities, existingProducers: [...] }`
* `transportCreated`

  * `{ type: "transportCreated", direction, transportOptions }`
* `transportConnected`
* `produced`

  * `{ type: "produced", producer_id }`
* `newProducer`

  * `{ type: "newProducer", producer_id, kind, peer_user_id }`
* `consumerCreated`

  * `{ type: "consumerCreated", consumerOptions }`
* `participantLeft`

### Minimal room behavior

* When a peer produces a track, notify everyone in the room with `newProducer`.
* Consumers are created on-demand (pull model) or automatically (push model). MVP can do push + auto-consume.

---

## 6) mediasoup plugin design inside Atome core

### Plugin responsibilities

* Initialize mediasoup Workers (N=1 for MVP).
* Create/lookup Routers per `room_id`.
* Create WebRtcTransports.
* Handle produce/consume.
* Expose a minimal internal API to Atome core.

### Suggested module layout

* `src/core/plugins/mediasoup/`

  * `index.js` (plugin entry)
  * `ms_worker_pool.js` (create worker(s))
  * `ms_rooms.js` (router per room, peer maps)
  * `ms_transports.js`
  * `ms_recording.js` (optional MVP)
  * `ms_signaling_ws.js` (WS handlers)

### Minimal internal API (pseudo)

* `ensureRoom(room_id) -> { router }`
* `createTransport(room_id, peer_id, direction) -> transportOptions`
* `connectTransport(peer_id, transport_id, dtlsParameters)`
* `produce(peer_id, transport_id, kind, rtpParameters, appData) -> producer_id`
* `consume(peer_id, transport_id, producer_id, rtpCapabilities) -> consumerOptions`

---

## 7) Recording (optional MVP, “if possible”)

### What “recording” means here

Record the room’s audio/video to disk from the server.

### MVP approach (pragmatic)

* Use **PlainTransport** to output RTP to localhost ports.
* Spawn **FFmpeg** to capture those RTP streams and write a file.

### Recording scope (keep minimal)

* Record **one mixed audio** + **composite video** is NOT MVP (mixing/compositing is complex).
* MVP recording can be:

  * **single-speaker** recording (choose one producer)
  * OR record **separate tracks per producer** (still non-trivial but simpler than compositing)

### Minimal endpoints

* `POST /rooms/:room_id/record/start`

  * body: `{ mode: "singleProducer"|"perProducer", producer_id? }`
  * returns: `{ recording_id }`
* `POST /rooms/:room_id/record/stop`

  * body: `{ recording_id }`

### Minimal files

* Store recordings under:

  * `data/users/<owner_user_id>/media/video/recordings/<hash>.webm` (example)
  * or `.../audio/recordings/<hash>.wav` if audio-only

### Notes

* The exact codec/container depends on your FFmpeg flags.
* You must store metadata in Atome DB (recording object referencing file path + hash).

---

## 8) Minimal UI requirements (Atome-side)

### UI constraint (very important)

The UI must be **ultra-minimal**:

* A single **video window** (local + remote rendering as needed)
* A few **"home-made" buttons** only:

  * open/close the video window
  * create a room
  * invite/select users to invite
  * mute/unmute (optional)
  * camera on/off (optional)
  * leave room

No complex layouts, no side panels, no chat, no fancy meeting UI.

### Screens (MVP)

1. **Video window**

* shows local preview + remote streams (simple stacking or very basic grid)
* open/close behavior is part of Atome UI (not mediasoup)

1. **Room controls (minimal)**

* create room (name can be auto-generated)
* invite one or more users (selected from connections)
* join/leave

1. **Contacts (minimal)**

* search/add by phone number
* accept/reject requests

All UI is Atome-native (no mediasoup UI).

---

## 9) Security (minimal baseline)

MVP must include:

* TLS for HTTP/WS in non-local deployments.
* Basic auth token per user.
* Basic access control: private rooms require invite/connection.
* Minimal rate limits:

  * connection request spam
  * room join attempts
  * transport creation

---

## 10) Zero-touch server installation (install_full.sh)

### Requirement

Everything required on the server must be installed and configured via **one script**:

* `install_full.sh`
* **No human intervention** (non-interactive / unattended)

### What install_full.sh must do (MVP)

* Install OS packages (Node.js, build tools, FFmpeg if recording enabled, firewall tools as needed)
* Create dedicated service user (e.g. `atome`)
* Create required directories (`/opt/atome`, data paths, logs)
* Install project dependencies (`npm ci` / lockfile-based)
* Provision environment (`.env` from template + required secrets placeholders)
* Configure and enable the service (systemd or rc.d depending on host OS)
* Open required ports (HTTP/WS + WebRTC UDP port range)
* Run a health check and print final status

### Script properties

* Idempotent: safe to run multiple times.
* Explicit versions (pin Node major, use lockfiles).
* Logs everything to a known location.

---

## 11) Implementation steps (ordered)

### Step A — Plugin skeleton

* Add `mediasoup` + `mediasoup-client` dependencies.
* Create plugin entry that registers:

  * WS signaling handler
  * room endpoints
  * contacts endpoints

### Step B — Single worker, single room

* Start 1 mediasoup Worker.
* Create 1 Router.
* Implement signaling: createTransport/connect/produce/consume.
* Verify Tauri + browser can call each other.

### Step C — Multi-room basic

* Map `room_id -> Router`.
* Ensure room cleanup when empty.
* Implement invite/join rules.

### Step D — Phone-based connections

* Implement connection requests + accept/reject.
* Gate invitations by accepted connections.

### Step E — Optional recording

* Implement PlainTransport output.
* Spawn FFmpeg process per recording.
* Store result as an Atome “foreign/media” object with metadata.

---

## 11) MVP acceptance checklist

* [ ] User login identity includes `phone_e164`.
* [ ] Send + accept connection request.
* [ ] Create room.
* [ ] Invite connection.
* [ ] Join room from Tauri and/or browser.
* [ ] Publish mic/cam.
* [ ] Receive remote tracks.
* [ ] Leave room cleans resources.
* [ ] (Optional) Start/stop recording produces a file + DB entry.

---

## 12) What comes immediately after MVP (next priorities)

* TURN integration for NAT reliability.
* Device switching + screen sharing.
* Better reconnect handling (network drop).
* Multi-workers (N>1) + simple room sharding.
* Production monitoring (bitrate/RTT/packet loss) + alerts.
