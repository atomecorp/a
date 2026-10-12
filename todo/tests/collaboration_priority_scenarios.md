# Permanent priority scenarios — atome / eVe

Defined: 2026-10-12 during quick documentary triage. This is a scenario contract, not a run report. No scenario was executed in this cleanup. Existing tests and imported Extensive Test variants remain available; these four priority contracts do not replace their complete coverage.

Tasks and advancement belong exclusively to [execution_order.md](../execution_order.md). Future runs record a RUN identifier, date, parent/eVe SHA and dirty-tree/build identity, platform/device/OS, actual PASS/FAIL/BLOCKED/NOT RUN result, evidence and limits under the existing run/evidence location. Never infer delivery, visual acceptance or carrier delivery from a source file, unit test or provider acknowledgement.

Common preconditions: authorized isolated accounts A/B, disposable uniquely identified projects and media, a verified atome.one test boundary, real Web/Tauri/iPad clients and approved device access. Use iPhone only for telephone-specific scenarios or a recorded iPad limitation. Confirm current canonical UI/MCP owners before automation; source prescriptions do not authorize installing WDA/Appium or creating a missing component. Retain a backup before any reset/reinstall; never remove production or unsynchronized data.

## SCN-2001 — First connection and SMS device handoff

Linked task: ATM-2001. Goal: authenticate through the current SMS flow without trusting previews or another device's session.

Actors/data: isolated account A, its authorized test number and two real devices. Start with the application's canonical phone-entry action; request the real SMS. Observe carrier receipt, open the link on the same or second authorized device, and complete the originating device's proof. Repeat the applicable expiry, replay and cancellation cases using isolated attempts. Restart the client and verify authorized session resumption.

Expected: first connection uses SMS; provider acknowledgement alone leaves delivery unproven; link previews do not authenticate; opening on a foreign device approves only the originating attempt, and the requester must finish its own proof. Expired/consumed capabilities fail explicitly. Record receipt and actual client results without publishing phone numbers, SMS capabilities or credentials. SMS/device unavailability is BLOCKED, never simulated as a passed run.

Cleanup: cancel unused test attempts, revoke only the test sessions explicitly authorized for removal, and retain redacted evidence. No provider or account configuration changes are implicit.

## SCN-2002 — Share, collaborate and revoke with bounded rights

Linked tasks: ATM-2002, ATM-2004 and ATM-2005. Goal: share a real object/project/file with B while enforcing A's grants and privacy.

Actors/data: isolated A/B, a project with uniquely identified object and media, recorded initial rights. A invites B; B accepts with a bounded auto-accept policy, then opens the real project through the canonical UI. Exercise linked realtime, linked manual and detached-copy contracts separately. Edit concurrently where authorized, attempt a forbidden operation, reconnect after an offline interval, then revoke the grant and its future auto-accept policy. Check public/search/sync/offline views against consent.

Expected: both clients display the authorized changes; manual publication requires an explicit delta and produces no background propagation; detached copies retain their own identity. Privilege escalation, expired grants and revoked access fail; revocation also applies after reconnect. No private contact fields or password_hash appear in client payloads without the applicable consent/authority. Preserve concurrent event history rather than overwriting it.

Cleanup: revoke only the test grants and remove only disposable fixtures through the canonical authorized mutation route. Preserve evidence of initial and final grants.

## SCN-2003 — Offline durability, conflict replay and reinstall restoration

Linked tasks: ATM-2003, ATM-2005 and ATM-2008. Goal: preserve the same account's complete dataset across disconnection and local replacement.

Actors/data: A on Web/Tauri/iPad, with authorized B for concurrent edits. Record a backup and reference dataset covering hierarchy, text, files/media, metadata and permissions. Disconnect A, make real edits, perform competing authorized edits on another client, restart while offline, reconnect and observe synchronization through atome.one. Verify deterministic conflict handling and history. Only after confirmed server persistence and explicit device/reset authorization, replace the test client's local installation/data and sign in as the same A to restore.

Expected: offline work survives restart, event IDs remain idempotent, equal timestamps have deterministic handling, all concurrent events remain in append-only history, and restoration matches the reference data without relying on the old cache. atome.one remains central; local data removal never deletes the server dataset. Missing devices, backup or safe reset access block the applicable step rather than passing it.

Cleanup: retain the proven backup until comparison is complete; remove only authorized test fixtures. Never purge unsynchronized local work or server history to make the scenario pass.

## SCN-2004 — Optional password after SMS-verified account setup

Linked task: ATM-2001, future evolution only. This scenario is a specification and is not runnable as current acceptance until the feature is implemented through verified existing owners.

Actors/data: isolated A verified by SMS and an otherwise equivalent account with no password. Inside A's authenticated account, set an optional password through the canonical account action. On a later connection enter its phone number, choose password or SMS, and exercise valid/invalid credentials and the existing recovery contract. Repeat on the account without a password.

Expected: the first connection still requires SMS. Password/SMS choice appears only for an already verified account with a defined password; otherwise the SMS flow remains available. Apply the existing credential-hashing, rate-limit, privacy and recovery contracts; never re-enable a removed legacy login route as a substitute.

Cleanup: use only isolated credentials, revoke test sessions when authorized, and retain no password or reusable SMS link in evidence.
