# Native phone-link authentication stalls or reports unavailable delivery

## Symptom

Tauri or iOS accepts a local phone number but either appears to do nothing,
reports that sending is unavailable, hangs before the request, or leaves the
iOS boot cover visible after a failed stored-guest restoration. A production
request may also reach the sent screen while no SMS is observed on the phone.
After a successful iOS login, relaunching may incorrectly request another SMS;
an existing installation may also stop entering « Essayer ».

## Confirmed root causes

- Packaged Tauri did not publish one production Fastify authority to the
  WebView. Local Axum guards could therefore suppress the remote authentication
  lane. The iOS custom scheme needed the same explicit exemption.
- Native WebViews derived the local phone record through a persisted WebCrypto
  HMAC key. WebKit could block in Security.framework while loading its WebCrypto
  master key before the network request existed.
- Embedded WebKit can execute a Web Locks callback while discarding its return
  value, leaving the login UI with an empty result after successful work.
- macOS Tauri tried a Secure Enclave/Data Protection key that ad-hoc builds
  cannot use without the required access-group entitlement. The desktop owner
  now uses one EC key in the macOS login keychain; iOS keeps its separate native
  protected-key owner.
- A failed restoration of a persisted guest left the authentication boot
  contract unsettled, so iOS kept its launch cover over the loaded page.
- Debug Tauri injected no default production authority, so a normal Xcode/Cargo
  launch differed from Release and displayed « Envoi indisponible ».
- Native restart still used IndexedDB to discover a grant already persisted in
  SQLite. A WebView origin/storage change or phone-scope migration therefore
  hid a valid Keychain/Secure Enclave binding and forced another SMS.
- Guest startup rejected any same-ID Atome before consulting the active guest
  registry. Legacy guest owners are user-shaped Atomes, so valid guests could
  no longer be resumed.
- A link opened on a device other than the requester required that opener to
  already own a recognized account session. That made first-time Tauri login
  circular: iOS received the SMS capability but could neither sign with the
  Tauri key nor approve without a pre-existing iOS session.
- After cross-device confirmation, macOS reloaded the private keychain item and
  tried to export/derive its public key. The separately persisted public item is
  intentionally non-exportable after relaunch, so local binding stopped even
  though the server had created the correct Tauri-bound session.
- The first native `wss://atome.one` proof request could also panic inside
  Rustls because the dependency graph enabled both cryptographic providers and
  the application selected neither one.

## Correction

`loadServerConfig.js`, `adole_backend.js` and the Tauri bootstrap publish and
consume one validated production Fastify URL. `auth_device.js` uses a
domain-separated SHA-256 phone scope when a native keystore is present, so no
WebCrypto lookup key is persisted on native runtimes. The phone-link client
captures the Web Locks callback result explicitly. The macOS command owns one
login-keychain EC key path and never exports private material. Failed guest
restoration clears session state and returns a settled logged-out result so the
login surface can appear.

Tauri now publishes `https://atome.one` by default in Debug and Release. Native
SQLite exposes only an unlocked grant descriptor and its exact stored key scope;
the renderer must still reopen that platform key and complete the existing fresh
signed challenge. IndexedDB is a best-effort cache, not the native authority.
Guest resumption consults the active guest registry first, while a new UUID is
still forbidden from claiming an existing account.

Cross-device links now have a distinct confirmation step. The opener sends only
`phone-link-confirm { attemptId, token }`; the server hashes and verifies the
one-use SMS secret, marks that attempt approved and notifies the WebSocket that
previously subscribed with a signed `phone-link-resume`. The opener receives no
account session. Only the originating device can sign the final resume challenge
with the public key stored on that attempt, so the resulting session is bound to
Tauri rather than iOS.

The local Tauri bridge now passes the already-computed key id into the native
binding request. Native code compares it with the server challenge and final
proof response, while macOS verifies signatures directly with its non-exportable
`SecKey`; it no longer exports the public key merely to recompute the id. Tauri
also installs Rustls' `ring` provider before creating any runtime or TLS client.

## Evidence

- Focused device, lock-result and cross-runtime routing tests pass (10 tests),
  plus `tests/probes/guest_auto_login_failure_settles_boot.probe.mjs`.
- The final Tauri Debug bundle compiles, launches from its bundle and reaches
  the login surface. A normal UI send reached the explicit sent state; the
  production security audit recorded `authentication_started` followed by
  `sms_provider_accepted`.
- A physical-iPhone run before the final packaging pass reached
  `outcome=authentication_ready` with no missing request. The final iOS Debug
  build succeeds; installation remains dependent on the device being available.
- A real Tauri Debug run without Fastify environment variables entered the
  existing guest and returned to it after full process termination/relaunch.
  The signed iPhone build compiles; the phone disconnected before installation,
  so physical authenticated restart remains **To verify**.
- The cross-device contract passes at both layers: server tests prove that SMS
  confirmation creates zero sessions until the originating key resumes, and the
  client test proves an opener with no local session emits `phone-link-confirm`
  and never calls its session installer. Production `squirrel.service` was
  deployed with recoverable file backups and returned HTTP 200 after restart;
  the final Tauri and signed iOS builds were rebuilt, and iOS was over-installed
  without clearing application data.
- Production evidence for the failed run showed `sms_link_confirmed`, a new
  session bound to the Tauri key and a consumed attempt, but no local grant.
  The repaired final bundle then returned `ok: true`, `purpose: local-bind` and
  the matching Tauri key id for the same session without sending another SMS;
  the former Rustls panic did not recur. Fourteen focused native/device/link
  tests pass.

Provider acceptance is not carrier delivery. The current production OVH token
can POST jobs but receives HTTP 403 for the outgoing-history API, so delivery
receipt remains **To verify** until that read permission is granted or the user
observes and opens the latest link. Do not retry automatically: an ambiguous
send consumes budget and may still arrive.

## 2026-10-07: local mock payment and native logout

The existing Tauri development command accepted only start/challenge/consume/resume, while Billing invokes signed `phone-link-simulate-payment`. Its allowlist now includes payment, resend, cancel and the renewal/logout lifecycle, still requiring SMS mock mode and an exact loopback HTTP origin. Native logout also differed from restart: it recomputed a phone-derived key instead of reopening the enrolled scope returned by SQLite. It now uses the enrolled scope and keyId contract; the WebView cache remains optional after the native lock.

Three deterministic logout regressions failed before the repair; all 34 focused tests and architecture/syntax guards pass afterwards. The verified local Fastify mock completed payment, automatic signed link consumption, renewal and logout without a real SMS. The persistent Rust transport tests are not yet executed: compilation and native builds were interrupted when disk capacity was exhausted. The subsequent user launch reproduces explicit Rust ENOSPC. Final Tauri and physical-iOS interaction acceptance remains **To verify** after freeing build space and rebuilding.

Follow-up: the signed iOS Debug build subsequently succeeded with recovered free space and was over-installed without deleting the existing app. A physical-iPhone launch without forced termination restored the SQLite grant via a fresh native signature and reached presentation readiness in 3260 ms with zero missing resources and no SMS request. The logout gesture remains **To verify**. Tauri rebuild and Rust transport execution remain blocked by disk capacity.

The two persistent Rust transport tests now pass after the authorized incremental cache cleanup. Debug bundle generation still fails with explicit ENOSPC, including with an invocation-only application debug-info override; no persistent build settings changed. Additional intermediate-object cleanup remains awaiting bounded authorization. This is a capacity blocker, not a passing native-UI result.
