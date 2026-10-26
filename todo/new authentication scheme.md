# New authentication scheme — V1 implementation prompt

Status: specification ready for implementation. Nothing below is implemented by this document.
Date: 2026-10-17. Supersedes, for its scope, the authentication parts of
`~/Desktop/atome_eVe_authentification_specification_V1.md` (user draft of 2026-10-16)
where they conflict: no Keycloak, no email/SMS requirement, device keys extended
instead of a new identity stack.

Read first, as required by [AGENTS.md](../AGENTS.md): the core, module 07, and
modules 01, 02, 03, 04, 05 and 06 (this task touches architecture, code, tests,
API/UI and state/sync). UI validation follows
[how_debug_UI.md](../atome/documentations/how_debug_UI.md). Git stays read-only.

---

## 1. Goal of V1 (minimum, nothing more)

A person can:

1. **Create an account** with no phone number, no email, no password and no SMS.
2. **Open the same account on several machines** (phone, tablet, computer, browser).
3. **Switch between machines**: work on one, continue on another, with the same
   projects (the existing sync engine already carries data; V1 only provides the
   identity and sessions it needs).
4. **Have several accounts on one machine** and switch between them.
5. **Recover the account** after losing every device, with a recovery code.
6. Drive every step **visually, by text or by voice (eVe)**. Voice drives the
   flow; it is never the proof.

Everything else in the user draft (remote control rules D08, inactivity lock D04,
trusted contacts, assisted recovery, sealed projects, D09 reminder styling,
Dashboard routing V01 beyond the two choices) is **out of V1** and listed in §12.

## 2. Validated product decisions (from the 2026-10-17 conversation)

| ID | Decision |
| --- | --- |
| A1 | No phone, no email, no password needed for daily use. SMS is never a daily login. |
| A2 | Identity = opaque principal + one key pair **per account per device**. No private key ever leaves a device; the server stores public keys only. |
| A3 | No Keycloak and no new external identity service. Extend the existing owners (§3). Server stays Node/Fastify + current database, deployable on FreeBSD. |
| A4 | Two keys per account per device: `session` key (silent) and `approve` key (requires the OS user verification: Face ID / fingerprint / device passcode / Windows Hello / security key PIN). |
| A5 | Adding a device never depends on Bluetooth, camera or QR. Universal path = network + screen or speaker. Proximity transports are optional accelerators (not in V1). |
| A6 | Device class: phone/tablet = `personal` automatically; computer/browser = one question at enrollment ("Is this device yours alone?"). `shared` devices cannot approve anything and require a fresh approval at every reopening. Changeable later with the approve key. This is unrelated to project sharing, which is unchanged. |
| A7 | Recovery always exists. V1 ships level 1 (another enrolled device, or recovery code). Level 2 (OS-keychain recovery passkey), trusted contacts and level 3 (assisted recovery) follow in V2. Existing verified phones become a recovery channel only (§7.4). |
| A8 | No end-to-end encryption of projects in V1 ("sealed projects" are a later, optional feature). V1 keeps server-side storage readable by the server, as today. |

Items marked **Assumed** in this document are my recommendation applied by default
and remain open to the user's challenge; do not treat them as user-validated.

## 3. Existing baseline (inspected 2026-10-17, code-inspection evidence level)

Reuse these owners. Statuses follow module 07.

| Brick | Owner | Status | Notes |
| --- | --- | --- | --- |
| Opaque principal ids | `server/auth_crypto.js` `generateOpaquePrincipalId`, `server/auth_identity.js` | Available and compatible | Account lookup is currently **by phone** (`findPrincipalByPhone`); V1 must add creation and lookup without phone. |
| Device public keys | `auth_device_keys` table (`database/schema.sql`), `server/auth_link_security.js` `publicDeviceKey` (P-256 JWK, keyId = SHA-256 of canonical JWK) | Available, to extend | Missing columns: key role, assurance, device class, label/platform, enrolled_by. |
| Signed one-time challenges | `server/auth_link_security.js` `challenge`/`consumeProof`, `atome/src/shared/auth_link_contract.js` `authSigningMessage` | Available and compatible | Purpose + reference binding, 60 s expiry, single use. Reuse for every new purpose. |
| Rate limits, audit | same file: `limit`, `audit`, tables `auth_send_limits`, `auth_security_events` | Available and compatible | |
| Device sessions | `server/auth_sessions.js` `createDeviceSessions` (create/renew with generation rotation and reuse detection, logout, logout-all, revoke-device, 24 h `restricted_until_ms` cooling-off) | Available, to extend | Session max/idle constants in `auth_link_contract.js`. |
| Access token check | `server/auth_session_validation.js` (HS256 JWT, `cnf.kid`, DB check each connection) | Available, to extend | Bearer only: no proof of possession on the WebSocket (§6.6). |
| WebSocket auth actions | `server/wsPhoneLinkAuth.js` (`ACTIONS` set, `auth-response`, push of `phone-link-ready` to the requester socket) | Available and compatible | New actions are added here, not in a new transport. |
| SMS phone-link flow | `server/auth_phone_link.js`, `server/auth_sms_ovh.js`, client `atome/src/squirrel/security/auth_phone_link_client.js` | Existing but unsuitable for daily login | Account creation currently requires SMS + simulated payment (`verified_payment` state). Re-scoped to recovery in §7.4. |
| Existing cross-device approval | `auth_phone_link.js` `approve` (trusted device signs `approve`, 8-digit pairing code) | Existing but unsuitable | Tied to an SMS attempt. Its patterns (pairing code limits, `phone-link-ready` push) are reused by the new pairing owner. |
| Optional password | `server/auth_password.js` (Argon2id) | Available, unchanged | Not part of V1 flows; must keep working for accounts that set one. |
| Browser device key | `atome/src/squirrel/security/auth_device.js` (non-extractable WebCrypto P-256 in IndexedDB, keyed by phone scope) | Existing but unsuitable for approval | No user verification. Scope keyed by phone: must become keyed by principal. Single `local-grant` record: one account per browser. |
| iOS device key | `platforms/ios/atome-auv3/Common/AuthDeviceKey.swift` (Secure Enclave, `.privateKeyUsage`) + `AiSRuntimeAuth*.swift` | Available as session key | No user-presence flag: cannot serve as approve key. |
| macOS Tauri key | `platforms/desktop-tauri/src/auth_device.rs` (login keychain, `Token::Software`) | Available as session key | Not Secure Enclave, no user verification. |
| Android key | `auth_device.rs` → `tauri_plugin_mobile_host` `authDevice` | Not verifiable because access is missing (no Android acceptance recorded) | |
| Windows/Linux native | `auth_device.rs` returns `auth_protected_device_key_unavailable` | Unavailable | V1 covers them through the Web client. |
| Native local grants | `platforms/desktop-tauri/src/server/local_auth_device.rs` (`auth_local_grants`, unique per remote principal + key: multi-account capable), iOS `AiSRuntimeAuthAccounts.swift` | Available, to extend | |
| Guest workspace + adoption | `adole_api/browser_workspace.js`, `guest_workspace_store.js`, guest adoption on login | Available and compatible | "Commencer" offline keeps using it. |
| Notifications / push | `server/communication_push.js`, `auth_push_installations`, Communication inbox (eVe) | Available and compatible | Used to reach the approver's devices. |
| First launch UI | `eVe/domains/user/first_launch_runtime.js` (+ `_model`, `_presentation`), `eVe/domains/templates/first_launch_template_catalog.js` | Available, to extend | `first_launch_runtime.js` is 364 lines: split before adding scope if it would pass 500. |
| Home / security UI | `eVe/intuition/runtime/bevy_panel/bevy_panel_home_*` | Available, to extend | Device list and recovery code live here. |
| Previous status log | [auth_phone_link_implementation.md](auth_phone_link_implementation.md), FRAMEWORK_STATE | Reference | Read before editing; preserve its open gates. |

Before editing, re-verify every row (module 07 §2) and record divergences.

## 4. Target model

### 4.1 Identity

- `principal_id`: existing opaque UUID. Never shown, never a proof.
- `handle`: new **public, non-secret routing name**, unique, e.g. `jean-4821`.
  Generated at creation from the display name (or a neutral word) plus digits,
  editable later. Used only to route an approval request (§6.3). Knowing a handle
  gives nothing.
- `display_name`: optional, unchanged ownership (profile owner). Never a proof.
- Phone: optional attribute of existing accounts. No longer an index required for
  creation. A **verified, unrevoked** phone (E.164) may route a pairing request
  like a handle (2026-10-20): it names whose devices are asked, never a proof.

### 4.2 Keys (per account × per device)

| Key | Role | Protection | Used for |
| --- | --- | --- | --- |
| `session` | Silent | Non-exportable, hardware when the platform provides it | session renew, WebSocket proof (§6.6), local bind, logout |
| `approve` | User-verified on every use | Non-exportable + OS user verification | approve a new device, approve a shared-device opening, revoke another device, change device class, create/rotate recovery code, account deletion, phone change |

Server column `assurance` per key: `hardware_uv`, `hardware`, `software`.
Only `approve` keys with `hardware_uv` may perform approve-class purposes.
A device without such a key works normally but **cannot approve** (explicit error
`auth_approve_key_required`, never a silent downgrade).

### 4.3 Platform matrix for the approve key (V1)

| Platform | Implementation | V1 |
| --- | --- | --- |
| iOS / iPadOS | Second Secure Enclave key, access control `.privateKeyUsage` + `.userPresence` (biometry or passcode), in `AuthDeviceKey.swift` | Yes |
| macOS (Tauri) | Secure Enclave key with `.userPresence` through `security_framework` (requires a signed build with the keychain entitlement). If the build cannot create it: `assurance` absent → Mac cannot approve, reported explicitly | Yes, with that limit |
| Web (all browsers, also Windows/Linux/FreeBSD/ChromeOS desktops) | WebAuthn platform or roaming credential, `userVerification: "required"`, verified by an **internal** verifier (§6.7) | Yes |
| Android | Keystore key with `setUserAuthenticationRequired(true)` through the existing mobile-host `authDevice` plugin | Implement; acceptance blocked until an Android device is available |
| Windows / Linux / FreeBSD native Tauri | Out of V1 (Web client covers them) | No |

The `session` key stays as today on each platform; only its scope changes (keyed by
principal instead of phone, §8).

### 4.4 Device record

Extend `auth_device_keys` (migration, no table rename):

| Column | Meaning |
| --- | --- |
| `key_role` | `session` or `approve` |
| `device_id` | random handle grouping the two keys of one account on one device |
| `assurance` | `hardware_uv` / `hardware` / `software` |
| `device_class` | `personal` / `shared` |
| `platform`, `label` | e.g. `ios`, "iPhone"; label editable by the owner; not trusted for security |
| `enrolled_by` | approving device id, `creation`, `recovery_code` or `phone_recovery` |
| existing | `enrolled_ms`, `restricted_until_ms` (probation), `revoked_ms` |

Probation (`restricted_until_ms`): **72 h** for a device added by pairing or
recovery (existing 24 h constant raised for these paths — **Assumed**). During
probation the device works normally but cannot approve, revoke, change class or
rotate the recovery code. Existing `auth_device_cooling_off` error is reused.

## 5. User flows (V1)

All visible text through `eveT()` (new keys under `eve.auth.*`). Zen interface
contract (module 05): only the elements listed here, no extra labels or buttons.
Reuse the existing input box, tiles, Bevy panels and Communication inbox; no DOM
form, no modal, no `alert/confirm`.

### F1 — First launch: "Commencer"

1. Two choices under the existing logo: **Commencer** / **Me reconnecter**
   (existing first-launch owner). eVe can read them and accept them by voice.
2. Commencer: the device generates `session` + `approve` keys (one OS prompt for
   the approve key creation where the platform requires it), asks the device class
   question only on computers/browsers, then calls `account-create` (§6.2).
3. Server creates principal + handle, enrolls both keys (`enrolled_by: creation`,
   no probation), creates a session. The space opens.
4. Offline at first launch: existing guest workspace; `account-create` runs at the
   first connection and adopts the guest workspace through the existing adoption
   owner.
5. Billing: account creation today goes through a simulated payment inside the SMS
   attempt. Payment is not an authentication concern: call the existing billing
   owner at the same product moment from the new creation path. **Open point O1**:
   confirm with the user where billing belongs; do not drop it silently.

### F2 — New device: "Me reconnecter"

1. The new device generates its keys and calls `pair-start` (§6.3) with an
   optional handle typed or dictated ("eVe, c'est jean-4821").
2. It shows / speaks:
   - a **6-digit request code**, digits read one by one, repeatable;
   - a **2-digit match number**.
3. If a handle was given, the account's personal devices receive a Communication
   notification + native push "New device requests your space". Otherwise the user
   opens **Ouvrir mon espace ailleurs** on an enrolled personal device and types or
   dictates the request code (`pair-claim`).
4. The approving device shows / speaks: device type and label, request time, and
   **three numbers**; the user picks the one shown on the new device, then the OS
   verification runs (`pair-approve`). Wrong number = request rejected, audited,
   all devices notified.
5. The new device receives `pair-ready`, completes with its session key
   (`pair-complete`), and shows / speaks **"Opened on the space of <display name>"**
   with confirm / "not my account". "Not my account" revokes that new device key
   immediately.
6. Every other device of the account gets a notification "New device added:
   <label>" with a **Revoke** action (existing `revoke-device` purpose).
7. Device class question (computer/browser) happens on the new device before
   `pair-start`.

### F3 — Several accounts on one device, switching

- Each account has its own keys on the device (no cross-account linking).
- Local account list = existing local grants (native) and a new per-principal
  grant map in the browser (§8). The list shows display names/avatars only.
- **Personal device**: switching = choose the account (tile, text or voice) +
  OS verification with that account's approve key on a **local** challenge
  (works offline, D07 spirit). The previous account's projections, subscriptions,
  badges and pending actions are cleared before the next account loads (reuse the
  existing logout/lock projection clearing).
- **Shared device**: "eVe, c'est Bob" or choosing Bob → `shared-open-start`
  signed by Bob's shared-device session key → push to Bob's personal devices with
  number matching → Bob approves with his approve key → session opens. Closing the
  space revokes that session and **purges Bob's local data on that device**
  (V1 rule: shared devices keep no persistent account data; data comes back by
  sync at the next approved opening).
- The name or avatar is only routing, never proof. A shared machine never shows a
  private project before the approval completes.

### F4 — Working across machines

- Each device holds its own session; any number can be open at once (existing).
- No new mechanism: verify that sync, Communication and project listing behave
  per principal across two simultaneously open devices (acceptance test T13).

### F5 — Device management (Home)

- List of devices: label, platform, class, enrolled date, last seen, probation
  state. Actions: rename, revoke (approve key), change class (approve key).
- Reuse `bevy_panel_home_*`; no new panel family.

### F6 — Recovery code (level 1)

- From Home ("Protect my account"), the user creates a **recovery code**:
  128 random bits, encoded as 26 base32 characters (Crockford, no ambiguous
  letters) in groups of 4, plus a checksum group. Offered as: display + speak,
  printable page, downloadable file. Shown once.
- Server stores only `verifier = SHA-256("atome.recovery.v1\0" || principal_id || code)`
  and creation date. Rotating or creating a new code invalidates the previous one.
- The first launch "Me reconnecter" screen offers **"I lost all my devices"**:
  handle + recovery code (typed, dictated, or file) → `recovery-start` →
  **1 hour safety delay** (**Assumed**) during which every still-enrolled device is
  notified and can cancel with its approve key → `recovery-complete` enrolls the
  new device as `personal`, `enrolled_by: recovery_code`, probation 72 h, revokes
  all other keys and sessions, consumes the code, and immediately asks the user to
  create a new code.
- Communication shows an unobtrusive reminder while no recovery code exists and the
  account has a single personal device (reuse the existing notification stack with a
  stable id; styling details belong to D09 in V2).

## 6. Protocol

All actions are new entries of `ACTIONS` in `server/wsPhoneLinkAuth.js` (or of a
sibling owner it delegates to if that file would exceed its size budget), reply
`auth-response`, use `/ws/api`, and go through existing `limit`/`audit`.
Signatures always use `authSigningMessage` with a fresh challenge from
`challenge(purpose, reference, keyId)`.

### 6.1 Tables (migration in `database/schema.sql` and the native SQLite schemas)

- `auth_device_keys`: new columns of §4.4.
- `auth_handles(handle PRIMARY KEY, principal_id UNIQUE, created_ms)`.
- `auth_pair_requests(request_id PK, kind, requester_device_id, requester_session_key, requester_approve_key, device_meta, device_class, code_hash UNIQUE-while-pending, match_number, target_principal, state, approved_by, created_ms, expires_ms, failed_attempts)`.
  `kind` = `enroll` (F2) or `shared_open` (F3). States:
  `pending → approved → completed`, terminal `rejected | expired | cancelled`.
  TTL 10 minutes (voice-compatible).
- `auth_recovery_codes(principal_id PK, verifier, created_ms)`.
- `auth_recovery_requests(request_id PK, principal_id, requester_session_key, requester_approve_key, device_meta, state, not_before_ms, expires_ms)`.

### 6.2 Account creation

`account-create { sessionKey, approveKey|webauthnRegistration, deviceMeta, deviceClass, clientNonce }`
→ challenge `create-account` signed by the session key (proves possession) →
creates principal, handle, both keys, session. Rate limits per network and per key
(reuse buckets style of `phone-link-start`). Returns session + user (including
handle).

### 6.3 Pairing (`kind = enroll`)

| Action | Caller | Effect |
| --- | --- | --- |
| `pair-start { sessionKey, approveKey|registration, deviceMeta, deviceClass, handle? | phone? }` | new device | Creates request, returns `requestId`, `code` (6 digits, unique among pending), `matchNumber` (2 digits). If `handle` or the verified E.164 `phone` resolves, notifies that principal's **personal, non-probation** devices. Response identical whether or not the handle/phone exists. Both at once → `auth_request_invalid`. One pending request per account; limits per network, per key, per handle, per phone (3 per 10 min). |
| `pair-claim { code }` (authenticated session) | approver | Binds `target_principal` to the caller's principal **only if** still unbound; returns request metadata + 3 numbers (one is `matchNumber`). 5 failed codes per session per 10 min. |
| `pair-view { requestId }` (authenticated) | approver from notification | Same metadata + numbers; only for the targeted principal. |
| `pair-approve { requestId, choice }` | approver | Challenge `pair-approve`, reference `requestId:requesterSessionKeyId:requesterApproveKeyId:choice`, signed by the approver's **approve** key (`hardware_uv`, personal, not in probation). Wrong `choice` → `rejected`, audit, notify all devices. Otherwise `approved`, `approved_by` set, push `pair-ready` to the requester socket (reuse the `phone-link-ready` mechanism). |
| `pair-complete { requestId }` | new device | Challenge `pair-complete` signed by the requester session key → enroll both keys (probation 72 h), create session, mark `completed`, notify other devices. Returns session + user display name for the F2 step 5 confirmation. |
| `pair-cancel { requestId }` | either side | Signed by the requester session key, or by any device of the targeted principal. |

### 6.4 Shared-device opening (`kind = shared_open`)

`shared-open-start` signed by an existing **shared** session key of that principal
on that device → same notification + number matching → `pair-approve` →
`pair-complete` creates a short session (idle 2 h, max 12 h — **Assumed**) bound to
that key. `logout` on close revokes it; the client purges the account's local data.

### 6.5 Local account switching (personal device)

Native: extend the existing local-grant challenge purposes with `local-unlock`
signed by the account's approve key. Browser: a WebAuthn assertion on a local
random challenge, verified client-side against the stored public key, then the
stored session descriptor is used (renew still needs the server when online).
No server roundtrip required offline.

### 6.6 Proof of possession on the WebSocket

At `/ws/api` authentication, the server sends a `connection-challenge`; the client
signs it with the session key; `validateConnectionDeviceSession` accepts the JWT
only with a valid signature from `cnf.kid`. A stolen access token alone becomes
useless. Keep the 15-minute access token and existing renewal.

### 6.7 Internal WebAuthn verifier (server)

New owner `server/auth_webauthn.js` (no external dependency, `node:crypto` only):
minimal CBOR decoder for attestation object and COSE EC2/ES256 keys, `none` and
`packed` self attestation accepted (no attestation trust chains in V1),
checks `rpIdHash`, `type`, `origin` (allow-list from server config), `challenge`,
UV flag required, `signCount` monotonic when non-zero. The WebAuthn challenge
bytes are SHA-256 of `authSigningMessage(...)` so that the existing challenge
table and purpose binding are reused unchanged. Persistent tests with recorded
vectors and a CDP virtual authenticator.

### 6.8 Recovery

| Action | Effect |
| --- | --- |
| `recovery-code-set` | approve-key purpose; stores verifier; returns nothing secret (code generated client-side and shown locally). |
| `recovery-start { handle, code, sessionKey, approveKey|registration, deviceMeta }` | Verifies (10 attempts per handle per day, 20 per network per day); creates request with `not_before_ms = now + 1 h`; notifies all enrolled devices. Same response time and shape for wrong handle / wrong code. |
| `recovery-cancel { requestId }` | Any enrolled device's approve key. |
| `recovery-complete { requestId }` | After `not_before_ms`, signed by the requester session key: enroll, revoke all other keys and sessions, consume code, audit. |

## 7. Migration and coexistence

1. Existing accounts keep their principal, phone, keys and sessions. Their session
   keys get `key_role = session`, `assurance` per platform (`hardware` for iOS
   Secure Enclave, `software` for Web and macOS login keychain), `device_class =
   personal`.
2. At the next authenticated launch, each device creates its approve key (one OS
   prompt) and registers it with a `session`-signed challenge `approve-key-add`.
   Until then, that device cannot approve.
3. Every existing account receives a generated handle.
4. **SMS phone-link re-scope**: the SMS flow is removed from first launch and from
   ordinary new-device enrollment. For accounts with a verified phone it stays
   reachable only from "I lost all my devices" as a recovery channel: consumption
   of the SMS link creates a recovery request with `not_before_ms = now + 72 h`
   (**Assumed**) and the same cancellation rights, instead of enrolling directly.
   The `approve` path of `auth_phone_link.js` is superseded by §6.3 and removed
   after its consumers are migrated (module 04 removal checklist).
5. Optional password login keeps working unchanged for accounts that set one.
6. Browser key scope: migrate the IndexedDB `key:<phone scope>` record to
   `key:<principal>` on first authenticated launch (existing `aliasPhone`
   pattern); new accounts never use a phone scope.
7. Coordinated deployment: server first with both protocols accepted, then clients.
   No legacy route is re-enabled.

## 8. Client owners to change

| Owner | Change |
| --- | --- |
| `atome/src/squirrel/security/auth_device.js` | Principal-scoped keys; second (approve) key provider abstraction: native approve key or WebAuthn; per-principal local grants (replace single `local-grant`). |
| `atome/src/squirrel/security/auth_phone_link_client.js` | Keep SMS client for recovery only; extract shared WebSocket request helpers if needed by the new client. |
| new `atome/src/squirrel/security/auth_pairing_client.js` | Client of §6.2–6.5 and §6.8 (create, pair, claim, approve, complete, cancel, shared open, recovery). |
| `atome/src/squirrel/apis/unified/adole_api/auth_methods_login.js` (426 lines) | Expose the new methods through `AdoleAPI.auth`; move logic into the new client to stay under 500 lines. |
| `platforms/ios/atome-auv3/Common/AuthDeviceKey.swift`, `AiSRuntimeAuth*.swift`, `AppNativeCommunication.swift` | Approve key with `.userPresence`, sign action `approve-sign`, multi-account grants. |
| `platforms/desktop-tauri/src/auth_device.rs`, `src/server/local_auth_*.rs` | macOS Secure Enclave approve key, `local-unlock`, multi-account grants, Android `authDevice` approve action. |
| `server/auth_sessions.js`, `server/auth_session_validation.js`, `server/wsPhoneLinkAuth.js` | New purposes, approve-key requirement, connection challenge. |
| new `server/auth_pairing.js`, `server/auth_recovery.js`, `server/auth_webauthn.js` | §6.3–6.8. Each under 300 lines target. |
| `server/auth_identity.js` / `server/auth_users.js` | Account creation without phone; handles. |
| `eVe/domains/user/first_launch_*` | F1, F2 and recovery entry. |
| `eVe/intuition/runtime/bevy_panel/bevy_panel_home_*` | F5, F6, account switcher entry. |
| Communication (`eVe/intuition/tools/communication*.js`, inbox view) | Typed notifications `auth-pair-request`, `auth-device-added`, `auth-recovery-started` with internal actions only (no URL in payload); only server-originated system notifications may use these types. |
| eVe voice tools | Intents: start, reconnect, read code, repeat, dictate code, choose number, "not my account", "I lost my devices". Voice never triggers the OS verification by itself. |
| Maps + FRAMEWORK_STATE | Update CODEMAP, API_MAP, ARCHITECTURE_MAP and FRAMEWORK_STATE with verified facts only. |

## 9. Security rules (non-negotiable)

1. No proof by name, handle, avatar, voice, code alone, SMS alone or device label.
2. Every state change is a fresh, purpose-bound, single-use, signed challenge.
3. Approve-class purposes require an approve key with `hardware_uv`, a `personal`
   device and no probation. Server-side check, never client-side only.
4. Number matching is mandatory for every remote approval.
5. The requester always confirms which account was opened.
6. One pending pairing request per handle; strict limits; uniform responses (no
   handle enumeration, no timing oracle on recovery).
7. Every enrollment, revocation, recovery start and failure is audited and notified
   to the account's other devices.
8. Switching account clears all projections, subscriptions, caches and pending
   actions of the previous account before the next one renders.
9. Shared devices keep no persistent account data after closing.
10. No private key, recovery code or approve secret is ever logged, sent in a URL,
    stored server-side in clear, or placed in a notification payload.

## 10. Delivery lots and acceptance

| Lot | Content | Exit criteria |
| --- | --- | --- |
| L0 | Gate report (module 07 §3): re-verify §3, map divergences, final file plan | Report written in this file's §13 log |
| L1 | Schema migration, handles, account creation without phone, key roles/assurance, approve-key add, WebSocket proof of possession | T1–T4, T16 pass |
| L2 | WebAuthn verifier + browser approve key; iOS and macOS approve keys | T5–T7 pass; iOS on a physical device |
| L3 | Pairing (§6.3) + notifications + probation + "not my account" | T8–T12 pass with two real browser profiles and Web↔iOS |
| L4 | Multi-account and switching (§6.4–6.5), shared-device purge | T13–T15 pass |
| L5 | Recovery code + SMS re-scope + Home device management | T17–T20 pass |
| L6 | First-launch and voice flows, i18n, zen check, maps, FRAMEWORK_STATE | T21–T23 pass; screenshots after renderer readiness |

Permanent tests under `tests/server/` and `tests/squirrel/`; probes under `temp/`.
Use the isolated probe mode (Fastify on a disposable port, simulated SMS) and the
Chrome DevTools Protocol virtual authenticator for WebAuthn.

| ID | Test |
| --- | --- |
| T1 | Create account with no phone/email/password; handle assigned; no private key on server (DB scan). |
| T2 | Session renew and reuse detection still pass (existing suites green). |
| T3 | WebSocket rejects a valid JWT without a valid connection signature. |
| T4 | Existing phone account keeps working; approve key added at next launch. |
| T5 | WebAuthn registration/assertion: UV missing, wrong origin, wrong rpId, replayed challenge, signCount regression all refused. |
| T6 | iOS approve key requires Face ID/passcode; session key does not prompt. |
| T7 | Device without `hardware_uv` approve key gets `auth_approve_key_required`. |
| T8 | Pair Web → iOS approver via code; Web → Web via handle push. |
| T9 | Wrong match number rejects the request and notifies devices. |
| T10 | Expired, reused, cancelled, concurrent requests; second claim of a bound request refused; code brute force locked. |
| T11 | Probation: new device cannot approve/revoke/change class/rotate code for 72 h. |
| T12 | "Not my account" on the requester revokes the new key; other devices notified with working Revoke. |
| T13 | Two devices open simultaneously, same account: edits sync both ways; Communication consistent. |
| T14 | Two accounts on one personal device: switch with OS verification, offline too; no data, badge or pending action of A visible in B. |
| T15 | Shared device: Bob opens via approval from his phone; close purges Bob's local data; reopening needs a new approval; Alice never selectable without proof. |
| T16 | Handle enumeration: identical responses/timing for unknown handle. |
| T17 | Recovery code: wrong code limits; 1 h delay; cancel from a surviving device; completion revokes others and consumes the code. |
| T18 | SMS link on a phone account now creates a 72 h recovery request, never a direct session. |
| T19 | Device list: rename, revoke (approve key), class change. |
| T20 | Recovery code never present in logs, URLs, notifications or server DB in clear. |
| T21 | Full F1/F2 by voice and text without touching the screen, on Web and iOS (OS prompt limits recorded). |
| T22 | i18n: every new visible/assistive text uses `eveT()`; zen contract respected. |
| T23 | Real-app acceptance: Web ↔ iOS ↔ macOS Tauri pairing and switching against the dev server, then against a staging deployment. |

## 11. Open points

| ID | Point | Default until decided |
| --- | --- | --- |
| O1 | Where the (simulated) payment belongs now that creation leaves the SMS attempt | Keep it at the same product moment through the existing billing owner |
| O2 | Probation length (72 h), recovery delay (1 h code, 72 h SMS), shared session lengths | Values above, **Assumed** |
| O3 | Handle format and editability | `<name>-<4 digits>`, editable once per 30 days, **Assumed** |
| O4 | Android acceptance hardware | Implementation allowed, acceptance blocked |
| O5 | macOS builds that cannot create a Secure Enclave key | Mac works but cannot approve; reported |

## 12. Out of V1 (next versions, keep the design compatible)

- Level 2 recovery passkey in the OS keychain; trusted contacts (2 of 3); level 3
  assisted recovery with long delay and veto.
- Proximity accelerators (Bluetooth, local network, QR) that skip number matching.
- Remote control / teleport / MCP rules against lock and account switch (user
  draft D08), inactivity lock and screen dimming (D04), D09 reminder styling,
  Dashboard basic routing (V01) beyond the two choices.
- Local at-rest encryption per account (layer B) for personal devices; sealed
  (end-to-end) projects with per-project keys wrapped for member devices and the
  recovery key (layer C).
- Native Windows/Linux/FreeBSD clients and their key providers.

## 13. Execution log

### 2026-10-26 — Recovery code: immediate and additive (user decision) (Claude)

User decision, overriding the « Assumed » values of §5 F6 / §6.8: the recovery code opens the space **at once**
(no 1 h delay, no wait screen, no « Ouvert sur l'espace » confirmation) and **adds** this device to the account's
others — nothing is revoked; revoking stays an explicit action from Home › Devices. A complete code (pasted or typed
to its end, checked by its check group) or Enter starts the recovery by itself; the screen keeps the code field,
« Par SMS (72 h) » and Back. A refused code says « Récupération impossible… », leaves no pending attempt and an empty
field. Completion notifies the other devices `auth-device-added` (as a pairing does); the code is consumed and the
recovered device may set a new one at once. The SMS channel keeps its 72 h delay (now also additive).
Evidence: `tests/server/auth_accounts_v1.test.mjs` (auth suite green), `temp/auth_v1/recovery_code_ui.probe.mjs`
18/18 three runs out of four (one earlier run 17/18, failing check not captured), Dashboard shown after recovery.

### 2026-10-26 — The recovery code alone names its account; refusals say their reason (Claude)

User report: « J'ai perdu tous mes appareils », code pasted, identifier left empty, countdown 59:58, « Récupérer mon
espace » → « Opération incomplète ». Causes: (1) the handle is shown nowhere in the app, and an empty identifier made
`recovery-start` resolve no account — by design the answer (countdown included) is identical, so the request was a
decoy that could never complete; (2) pressing « Récupérer » inside the 1 h delay is refused (`auth_recovery_not_ready`,
or `auth_recovery_unavailable` for a decoy) but the first-launch runtime only looked up `eve.first_launch.error.*`.

- `auth_recovery_codes.lookup` = SHA-256(`atome.recovery.lookup.v1\0` + code core), unique index, column added by
  `prepareAdoleSchemaColumns` on existing bases (checked on a copy of the local base). The client sends it with the
  verifier (`recovery-code-set` subject is now `verifier:lookup`; a client without lookup is refused). `recovery-start`
  without handle or number finds the account by the lookup; the per-network limit (20/day) applies, the per-address
  limit only when an address is given. Responses stay uniform. Codes created before have no lookup: create a new one.
- The recovery screen's identifier field is optional (`eve.auth.handle`, `recovery_handle` key removed).
- First launch shows `eve.auth.error.<code>` when no first-launch message exists (« Récupération pas encore disponible »).
- Evidence: `tests/server/auth_accounts_v1.test.mjs` 17/17 (new: code alone, wrong code identical shape, no notice);
  `temp/auth_v1/recovery_code_ui.probe.mjs` 19/19 (code pasted without identifier → request; too early → reason said;
  delay shortened in the isolated base → « Ouvert sur l'espace de … » → same account, the other device revoked).
- Needs a server deployment (schema + server) and an iOS build before it works on atome.one / the iPhone.

### 2026-10-25 — Recovery code « Option 1 »: shown once, touch to copy, paste anywhere (Claude)

User decision (2026-10-25): Home › Security keeps one « Créer un code de récupération » tool; each new code
replaces the previous one (already so: `auth_recovery_codes` keyed by principal); the code is **never stored on
the device** and never shown again — losing the note means creating a new code, not re-reading the old one.

- Touching the shown code copies it through the shared clipboard facade (`writeSystemClipboardText`; native
  bridge on Tauri/iOS, `navigator.clipboard` on the Web) and says « Code copié »; leaving the step (Back, panel
  close) runs `clearSecrets`, so the code leaves memory and every tree. Owners: `bevy_panel_home_devices_view.js`,
  `bevy_panel_home_security.js` (`home.security.recovery.copy`), i18n `eve.auth.recovery_code_*`.
- The recovery code moved from the Dashboard's « Compte » brick to « Sécu. » (user: « dans réglage › sécurité »):
  `buildRecoverySecurityNodes` (create, shown code, recovery alert, « Autoriser cet appareil à approuver ») renders in
  the `security` part of `securityBody`; devices / open elsewhere / switch account stay in `account`.
- Pasting into « J'ai perdu tous mes appareils » needed nothing new: every template field answers a long press with
  the Mystic menu (Copier / Coller over the host clipboard, `bevy_panel_text_editing.js`).
- §6.8 vs §4.4 divergence resolved: a device enrolled by a recovery (`enrolled_by` `recovery_code` or
  `phone_recovery`, the account's only device since every other one was revoked) may run `recovery-code-set` during
  its 72 h probation; every other approve purpose stays refused (`auth_devices.js#requireApprover(sessionKey, purpose)`).
  A paired device in probation still cannot replace the code (it would void the owner's code).
- Evidence: `tests/server/auth_accounts_v1.test.mjs` 16/16 (recovered device renews the code at once, `device-class`
  still `auth_device_cooling_off`); `temp/auth_v1/recovery_code_ui.probe.mjs` 15/15 (real clicks, headed pixels:
  create → copy → Back forgets → second browser long-press « Coller » → recovery request opened in the database).
- Not done: a physical security key / passkey as an account-level recovery credential (§12, next lot); no
  automatic prompt to create a new code right after a recovery.

### 2026-10-20 — One verified phone per account; number change onto a taken number (Claude)

Audit: the active unique index `idx_principal_phone_active_unique` compares
strings, and `assignVerifiedPhone` accepted any `normalizePhone` spelling. The
local dev vault held 4 active national spellings, one of them the same number as
another account's E.164 credential (two accounts, one number). Fixes:
`assignVerifiedPhone` (`server/auth_identity.js`) now throws
`auth_phone_e164_required` for anything but E.164; the boot migration
`revokeNonE164PhoneCredentials` (new `database/adole_principal_identity_schema.js`,
moved out of `adole_schema_migrations.js`, now part of the DDL fingerprint in
`adole_db_core.js`) retires active non-E.164 rows (`revoked_reason = 'not_e164'`,
never rewritten: their region is unknown). Tauri/iOS copy the remote phone and
carry the same unique index.
Number change (`phone-change-start`) onto a number held by another account: the
answer before the SMS is the same as for a free number; after the SMS proof the
consume answers `{ ok, phoneTaken: true }`, nothing moves, audit
`phone_change_taken`. Home › Security shows the notice and « Ouvrir ce compte »
(the existing add-account path → Connect screen: trusted device by number, or
« J'ai perdu tous mes appareils » with the recovery code). `recovery-start`
accepts `phone` like `pair-start`.
Probes: `temp/auth_v1/phone_uniqueness.probe.mjs` 17/17,
`phone_taken_client.probe.mjs` 4/4, `pair_by_phone.probe.mjs` 15/15,
`pair_address_client.probe.mjs` 5/5; `tests/server/auth_phone_link.test.mjs` +
`auth_accounts_v1.test.mjs` 36/36. Not run: Home panel click-through (the Home
modules do not import standalone in Node: TDZ in the media playback modules,
untouched here); production vault not inspected.

### 2026-10-20 — Pairing addressed by a verified phone number (Claude)

User decision: a new device may route its pairing request by the account's
verified phone number instead of the handle; an SMS code alone never opens a
device (rule §9.1 unchanged). Server: `createHandles().resolvePhone` (E.164,
`principal_phone_credentials` unrevoked, live user) in `server/auth_handles.js`;
`pair-start` accepts `phone` with its own `pair-phone:` limit (3 per 10 min),
uniform answer, notice without the number. Client: `startPairing({ phone })`;
the reconnect field (`first_launch_auth_flow.js#pairAddress`) sends a handle when
the value has letters, else the E.164 number (`auth_phone_e164_required`
otherwise); label `eve.auth.handle` now names both. Probes:
`temp/auth_v1/pair_by_phone.probe.mjs` 15/15 (isolated Fastify, real sockets,
WebAuthn approval, unknown/revoked/national numbers, limits),
`temp/auth_v1/pair_address_client.probe.mjs` 5/5 (real flow module).
Not run: browser UI click-through. `pair-start` exists only on the Fastify
server (no Axum/Swift implementation), so no other backend needed the change.

Codex appends dated gate reports, progress, evidence and blockers here, newest first.

### 2026-10-17 — Progress (Claude): L1, L2 Web, L3, L4 personal, L5, L6 Web

| Lot | Status | Evidence |
| --- | --- | --- |
| L0 | Done | gate report below |
| L1 | Done (server + Web): schema/migration, handles, `account-create`, roles/assurance, `approve-key-add`, connection proof (`cnf.pop`, opt-in per key) | `tests/server/auth_accounts_v1.test.mjs`, `temp/auth_v1/ws_protocol.probe.mjs` 18/18 (T1, T3, T16) |
| L2 | Web done (internal WebAuthn verifier + browser approve key); iOS/macOS/Android approve keys **not implemented** (no device access) | T5, T7 unit tests; CDP virtual authenticator |
| L3 | Done: pairing, notices to personal devices, probation 72 h, not-my-account | T8–T12 unit tests; `browser_pairing.probe.mjs` 20/20 (Web↔Web) |
| L4 | Done on Web: personal-device switching (local WebAuthn verification, offline, reload) and shared-device opening (short session, re-approval, purge on close) | `browser_switch.probe.mjs` 9/9, `browser_shared.probe.mjs` 8/8 (T14, T15 Web part) |
| L5 | Done: recovery code, 1 h delay, cancel, completion revokes others; SMS link → 72 h recovery; Home device management | T17–T20 unit tests (T18 rewritten phone-link tests) |
| L6 | First-launch and Home flows, i18n `eve.auth.*`, zen screens checked on screenshots; voice limited to speaking the pairing code | screenshots `temp/auth_v1/out/` |

Divergences recorded: §6.8 « immediately asks the user to create a new code » contradicts §4.4 probation (no rotation for 72 h) — not prompted; arbitration needed. `revoke-device` by session key kept for native clients that cannot approve yet (approve-class `device-revoke` added). Notices reach live sockets only (no Communication inbox entry, no native push). `/ws/api` and `/ws/sync` are bound to the connection proof for clients that declare it (the Web client); native shells do not declare it until their Swift/Rust clients can prove; HTTP bearer routes are not bound. RS256 (Windows Hello) accepted. Not deployed to atome.one.

### 2026-10-17 — L0 gate report (Claude)

Classification: feature + migration across server (Fastify), Web client and first-launch UI; modules 01–07 read.
Owning runtimes: server and Web Browser. Tauri and iOS are not available for this pass (no person to answer the
keychain / Face ID prompts): their native approve keys (§4.3 iOS, macOS) are **Not verifiable because access is
missing** and are not implemented in this pass; those devices keep their session key and get the explicit
`auth_approve_key_required` refusal.

Re-verification of §3 (code inspection, 2026-10-17):
- `auth_link_security.js` `challenge`/`consumeProof`/`limit`/`audit`: Available and compatible (60 s, single use, purpose+reference+keyId bound).
- `auth_sessions.js`: Available, to extend. Divergence: `revoke-device` is refused during probation, so "not my account" needs its own purpose.
- `auth_session_validation.js`: bearer per message (`message.token`), not per connection; proof of possession attaches to the connection that carries the token.
- `auth_device_keys` inserts are positional (`VALUES (?, ?, ?, ?, ?, NULL)`) in `auth_phone_link.js` and `auth_password.js`: they must become named before columns are added.
- `auth_users.createUserAtome` requires a phone (`assignVerifiedPhone` throws on an empty value): creation without phone needs that call to become conditional on a given phone.
- Browser `auth_device.js`: keys per phone scope (`forPhone`); `auth_methods_login.installRemote` derives the device from `result.user.phone` — a phone-less account needs the session record to carry its key scope.
- WebAuthn: browsers refuse an IP address as RP ID; the dev/probe origin must be `http://localhost:<port>` and the RP ID/origins come from server configuration.
- First launch: `first_launch_access` (guest / phone) + `first_launch_runtime.js` (364 lines) — new stages go to a separate auth-flow owner to keep the runtime under 500 lines.

File plan: new `server/auth_devices.js` (key registry, named inserts, approver check), `server/auth_webauthn.js`,
`server/auth_pairing.js`, `server/auth_recovery.js`, `server/auth_accounts.js` (creation without phone, handles);
extend `schema.sql`, `adole_db_core.js` (columns), `auth_sessions.js`, `auth_session_validation.js`,
`wsPhoneLinkAuth.js`, `auth_phone_link.js` (SMS re-scope); client `auth_webauthn_client.js`, `auth_pairing_client.js`,
`auth_device.js`, `auth_methods_login.js`, first-launch templates/runtime, Home security section, i18n `eve.auth.*`.
Tests: `tests/server/auth_*.test.mjs` (fixture extended), CDP virtual authenticator probes under `temp/`.
