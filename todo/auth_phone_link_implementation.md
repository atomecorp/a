# Phone-link authentication implementation status

Date: 2026-09-27. Status: production cross-device handoff repaired; one real post-deploy SMS acceptance remains to verify.
The approved six-part plan remains the acceptance contract. No Git write or
archive was performed. Production SMS jobs have now been accepted through the
normal Tauri UI; carrier delivery and link consumption are not yet proven.

## Cross-device Tauri → SMS → iOS handoff repair

- The SMS opener is now strictly an approval surface. For a foreign attempt it
  sends `phone-link-confirm` with the fragment capability, installs no session
  and needs no pre-existing iOS account session.
- The server verifies the hashed token, marks only that attempt approved and
  notifies the already-subscribed requester socket. Tauri must then sign a fresh
  `resume` challenge with the exact key recorded when it requested the SMS;
  only that step creates and returns the Tauri-bound session.
- The old same-device path remains valid: when the opener owns the matching
  local attempt, it may still consume it directly with its originating key.
- Production server files were backed up and deployed, `squirrel.service` is
  active and `https://atome.one/` returns HTTP 200. Final Tauri Debug and signed
  iOS builds include the new client action; iOS was installed over the existing
  app without clearing data. Focused cross-device/auth tests pass 25/25.

## Native restart regression repair

- Tauri now injects the production Fastify authority in Debug and Release; an
  environment value remains the single explicit override.
- Active persisted guests resume on Tauri/iOS even when their legacy workspace
  owner already exists as a user-shaped Atome. New guest/account collisions and
  adopted guests remain rejected.
- Native SQLite grants, not IndexedDB, discover the account on restart. The
  exact stored Keychain/Secure Enclave scope is reopened and the existing fresh
  signed challenge is still mandatory. Web storage is only a cache.
- Focused contracts and native compilation pass. A real environment-free Tauri
  run starts and resumes its existing guest after process restart. The signed
  iPhone build passes, but installation/relaunch remains pending because the
  phone became unavailable to CoreDevice immediately after compilation.

## Phone-entry repair after interactive feedback

- Local numbers are now normalized to E.164 from the permission-free runtime
  country signal (known timezone first, browser locale second, France fallback).
  In France, `06 12 34 56 78` is therefore sent to the protocol as
  `+33612345678`; an explicit `+` or `00` international prefix remains valid.
- Keyboard Enter, Numpad Enter and mobile WebView `change` submission all start
  the same idempotent send action. The screen immediately displays “Envoi du
  SMS…”, clears the number after provider acceptance, then explicitly asks the
  user to open the link received in their messages. Provider/link errors return
  to an editable field instead of leaving the screen inert.
- Focused normalization, phone-link client/server/provider suites and rewritten
  mobile/visual probes pass. Production OVH keys, sender, service, database and
  JWT settings are present without exposing their values. A normal Tauri UI send
  reached production provider acceptance, but the user did not observe delivery;
  carrier delivery is not inferred from provider acceptance.

## Implemented code

- `/ws/api` device-bound phone-link attempts, five-minute hashed tokens, fresh
  P-256 proofs, single transactional consumption, persistent rate limits and
  security events. Sessions have fifteen-minute access tokens, thirty-day idle
  expiry, ninety-day absolute expiry, renewal generations and revocation.
- `AdoleAPI.auth` and the existing welcome/login sequence now use phone and SMS
  link. Login password/typed OTP and their legacy modules are removed; unsupported
  authentication actions explicitly require a protocol upgrade. Access tokens
  are in memory; persistent resumption descriptors need the device key.
- Existing opaque remote principals are reused. Tauri and iOS authentication is
  extracted into cohesive account, token and device-proof owners. Protected
  native keys and persistent local grants separate local authorization from the
  remote session. Native binding independently checks the remote proof over TLS
  to `wss://atome.one/ws/api`; no invented production verification key is used.
- iOS Universal Link inbox and native message bridge are connected. HTTP link
  previews never authenticate. The browser strips the SMS fragment before boot.
- Explicit account deletion and phone-number change require dedicated device
  proofs and confirmation. New devices on existing accounts have a 24-hour
  restriction on sensitive operations. Home uses the existing Bevy panel for
  confirmation; independent Mail and credential-vault secrets are retained.
- Browser canonical commits use the existing per-identity IndexedDB event store.
  Outbox entries retain event IDs; remote expiry does not remove local data.
  Explicit logout locks local authorization and clears account projections.
  Application resources use a verified versioned cache separate from projects.
  Local media reads enforce the current identity, support byte ranges and reject
  locked or foreign owners.
- Guest-adoption decisions are retained once per guest workspace. The existing
  server import confirms records and files before local adoption moves records,
  historical events and blobs atomically. Media URLs are rebound to the account;
  original historical actors remain. A local collision aborts the move and
  retains the guest source. iOS pending-sync reads are filtered by local account.
- OVH EU signing, safe errors, twenty-send configurable daily budget and no
  automatic retry after uncertain delivery. User-provided `private/opt.txt` was
  translated to `Private/ovh_sms.env`; both have mode 0600 and are ignored by Git.
  Secrets were not printed or added to application sources.
- The six validated browser/native WebView JavaScript owners are deployed to
  `/opt/a` after a targeted server backup. Local/server hashes and the public
  `loadServerConfig.js` hash match; production health remains HTTP 200.

## Executed evidence

- 14 targeted Vitest suites, 56 tests passed (`temp/auth-validation.log`): protocol,
  client, browser/native key contracts, OVH simulation, HTTP handoff, old-action
  rejection, native-primary resumption, account Home confirmation, IndexedDB
  persistence, media access, identity ownership, notification persistence and
  test-manifest governance. Last local adoption additions also passed separately.
- Tauri: `cargo check --offline --manifest-path platforms/desktop-tauri/Cargo.toml
  --lib` passed (`temp/auth-native-check.log`).
- Tauri follow-up: the final Debug app bundle builds and launches to the login
  surface. A normal UI request reached “SMS envoyé” and production security
  events recorded `authentication_started` then `sms_provider_accepted`.
- iOS: full Debug simulator `xcodebuild`, unsigned, passed after correcting the
  SQLite binding type in the account-scoped queue query (`temp/auth-ios-build.log`).
  This is compilation evidence, not Secure Enclave hardware or Universal Link
  acceptance. No archive was created.
- iOS follow-up: the signed Debug device build succeeds with the repaired runtime.
  A previous installed build reached `authentication_ready` with zero missing
  requests; installation of the final package was unavailable because the phone
  was disconnected from CoreDevice.
- Chromium: a real click on the welcome login choice displayed only the phone
  input. No SMS was sent. A separate real-browser probe installed the application
  cache, reloaded offline, entered guest mode through a real click, created and
  edited a project through `window.Atome.commit`, then reloaded offline again.
  The same ID, owner, version and edited name were recovered. Evidence:
  `temp/auth-browser-offline.mjs`, `.log`, and screenshots. This validates browser
  persistence through the canonical API, not all project interaction gestures.
- The test origin is `auth-test.localhost:3019`. An earlier `localhost:3019` probe
  was classified as native by the existing port-resolution policy; its failed
  native WebSocket attempts do not constitute a browser-offline result.
- Syntax (2236 files), WebSocket-only transport and component-reuse checks passed.
  The map-path guard initially failed at 156 missing references. Authentication
  references and verified test-to-probe renames are corrected; it now passes at
  106/106 with its budget lowered. Root/eVe whitespace diff checks pass. Node emits
  the environment warning about `--localstorage-file`. A wider Home suite found
  a provider-list fixture mismatch (the current list includes Runway); no provider
  implementation was changed for that unrelated assertion. Its obsolete password
  action assertion was updated to the new confirmed deletion contract.

## External validation still unavailable

A real production send was accepted by OVH and recorded without exposing the
recipient or link. A signed read of the recipient's outgoing history returned
HTTP 403 `This call has not been granted`, so the current token can create jobs
but cannot read their delivery receipts. This does not prove carrier delivery;
the user reports that the latest expected SMS was not observed. Grant the
minimum outgoing-history GET permission, then inspect delivery without retrying.

The production domain, association file, proxy logging policy, compatible server
and clients must be deployed together. Actual browser login, macOS login, iPhone
closed/background/open Universal Links, phone-to-computer approval and physical
Secure Enclave operation remain untested. No production-ready claim is made.

## Open implementation and acceptance gates

1. Finish and test device-enrollment notifications and explicit high-risk
   enrollment policy. Audit the distinction between same-device and computer
   approval and expose complete session/device-management controls.
2. Complete cross-tab account locking, browser initial synchronization/projection
   refresh, writes arriving during an in-flight sync, remote media availability,
   history/query parity and shared-data scope. Local native account isolation and
   old HTTP/media authorization paths need a complete runtime audit.
3. Verify old credential removal from all historical persistence and distribution
   outputs, not only rejection by the new protocol. Test migrated real accounts,
   guest import interruption including media and storage quota failures end to
   end. Review final adoption behavior against server replay semantics.
4. Run browser authenticated/offline/account-switch tests and native restart,
   logout, sync and media tests on actual target runtimes. Review screenshots only
   after renderer readiness; current guest screenshots do not prove full UI.
5. Validate actual OVH delivery and native link opening with the user's test
   recipient, then coordinate deployment. Final acceptance remains unmet.

## Completion decision

Final status: blocked for release; implementation remains in progress.
Task outcome: partially completed. The checkout contains an incompatible login
migration and must not be published until the remaining gates pass.
Maps updated: CODEMAP, API_MAP, ARCHITECTURE_MAP, DESIGN_MAP.
Framework state: updated in eVe/documentations/FRAMEWORK_STATE.md.
No new project renderer, per-Atome DOM, text-service owner or matrix-preview
renderer was introduced. Browser writes still enter through canonical commits;
local event persistence and media isolation have focused executable evidence.

## Changed boundaries and retired files

Modified: server/server.js, database/schema.sql, server/auth_identity.js,
server/auth_users.js, server/wsSyncSecurity.js, server/wsSyncRuntime.js;
AdoleAPI auth/session/adapter/WebSocket owners; eVe canonical commit transport,
login credentials/sequence, Home panel and account locales; native auth bridges,
local server token validation and iOS remote sync configuration; four maps and
the framework state file. Unrelated checkout changes are not claimed here.

Created: server auth_phone_link/auth_link_security/auth_sessions/wsPhoneLinkAuth,
OVH and secret-config owners, auth HTTP handoff, browser/native device-key and
local-grant owners, browser_workspace/offline_media/offline_app_assets, and the
focused protocol/storage/UI-action tests named above. The pure shared event
contract moved from database to atome/src/shared.

Removed: server/auth.js, server/auth_otp.js, server/wsApiAuthProvisioning.js;
AdoleAPI auth_remote_provisioning.js and auth_phone_verification.js;
eVe user_login_credentials_auth.js, user_login_credentials_events.js and
user_login_step_config.js; three retired OTP/bootstrap probes. These removals
require coordinated client/server deployment and are not a completed release.
