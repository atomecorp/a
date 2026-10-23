# Private iOS Ad Hoc OTA distribution

The canonical entry point remains `scripts/XCode_testflight_generator`.
TestFlight is the default; `--adhoc` selects Apple's registered-device channel.
The same discovery, archive and version owners serve both channels. Xcode 27
calls the Ad Hoc export method `release-testing`.

## Daily use

From the repository root on the signing Mac:

```bash
./scripts/XCode_testflight_generator --adhoc --dry-run
./scripts/XCode_testflight_generator --adhoc
```

The second command builds, checks app/AUv3 signatures and matching device
profiles, uploads through verified SSH, publishes atomically, checks HTTPS and
advances the shared version ledger. It never uploads to App Store Connect.

To separate building from publication:

```bash
./scripts/XCode_testflight_generator --adhoc --prepare
./scripts/XCode_testflight_generator --adhoc --publish temp/ios-adhoc.EXAMPLE/release.json
```

Use the exact report path printed by preparation. A failed preparation restores
the three product version files. A prepared build pins the original version
files and Xcode ledger; editing them requires a new preparation. Pending
releases carry `.retain` so cache maintenance preserves them. Publication
receipts and a reconciliation journal allow retry after interrupted publication
or local ledger updates. A publication followed by a local error is a partial
operation, never proof that nothing reached the server: retry the same report.

Each successful Ad Hoc or TestFlight release advances both the marketing version
and integer build, with app/AUv3 and atome/eVe synchronized. Neither script
stages, commits, fetches or pushes Git. TestFlight is still:

```bash
./scripts/XCode_testflight_generator --dry-run
./scripts/XCode_testflight_generator
```

## Remote Mac and configuration

An AI agent already executing on the authorized Mac can invoke the same command.
From another authorized machine with SSH access to a Mac checkout:

```bash
node scripts/ios/remote.mjs --host SIGNING_MAC_ALIAS --repo /absolute/path/to/a --adhoc
```

The dispatcher accepts only the Ad Hoc, prepare and dry-run flags. SSH must
already authenticate the caller and verify the Mac's host key. It does not
enable Remote Login, create credentials or open a command-execution HTTP route.
Another Mac needs the same source, Xcode, signing identity, Apple session and
profiles; signing material stays on that Mac. No installation or remote-access
setting is changed automatically.

`scripts/ios/ota-target.json` records the verified production target. Override it
with `~/.config/atome/ios-ota.json` containing `sshHost` and HTTPS `origin`, or
`OTA_SSH_HOST` and `OTA_ORIGIN`. The current target uses the pre-existing
administrative SSH access; this work grants no additional SSH access and does
not modify credentials. A deployment-account restriction requires separate
credential/access configuration. Downloads and staging files live only below
the mode-0700 `/var/lib/atome/ios-ota` directory.

## Testers and personal link

The shell is `https://atome.one/ios/install`; a personal URL appends the user's
random token as a fragment: `/ios/install#PERSONAL_TOKEN`. Fragments are not
sent in HTTP requests. Keep the full link private: anyone holding it can use
it until revoked. No email address is required for manual notification.

Enroll or revoke through the administrative SSH connection, never a public API:

```bash
printf '%s\n' '{"label":"tester"}' | ssh ADMIN_HOST 'node /opt/a/scripts/ios/ota-store.mjs enroll'
printf '%s\n' '{"hash":"TOKEN_SHA256"}' | ssh ADMIN_HOST 'node /opt/a/scripts/ios/ota-store.mjs revoke'
```

Enrollment prints the token once; the server stores its SHA-256 fingerprint.
The existing Squirrel shell factory builds one installation link. It exchanges
the bearer token for a two-hour HMAC capability, scoped to that tester and
immutable build. Manifest and IPA requests need no cookies or Authorization
headers. Revocation also denies capabilities already issued to the tester.
Nginx and Fastify omit OTA request URLs from logs. No analytics or external
resources are loaded. Expired download links are renewed by reopening the
personal page. Changing the server signing secret invalidates all temporary
download capabilities, but is not part of ordinary publication.

An email address, phone number or personal URL does not authorize an Apple
device. Register every UDID in the Apple Developer account, then regenerate
both matching Ad Hoc profiles and build a new IPA. The owner's iPhone must be
included in both profiles. Apple currently permits 100 devices per product
family per membership year; disabling an entry does not restore its slot.
Check membership, remaining quota and renewals in the Apple portal:
[Apple device limits](https://developer.apple.com/help/account/devices/devices-overview/).

## Server lifecycle and retention

`node scripts/ios/deploy.mjs --dry-run` lists the OTA files and production
patches. `--apply` is a production change requiring explicit authorization.
It backs up the touched sources and Nginx configuration under
`/var/backups/atome-ios-ota/`, installs only the OTA module, suppresses OTA URL
logging, initializes a server-only capability secret, validates syntax/Nginx,
restarts the existing service and probes health. Failed deployment restores
the backed-up files and restarts the preceding composition. It does not reset
accounts, vaults or application databases.

IPA files enter `.incoming/UUID/`. The Mac verifies Apple's embedded signatures,
certificate membership/expiry, entitlements, device-set equality and versions;
the authenticated administrative SSH path transfers that validation report.
The Linux helper verifies bytes, SHA-256, report identity, profile expiry and
monotonic build number. It generates the private manifest template and atomically
switches `current.json` only after verification. Private signing keys and
certificates are never transferred. The server trusts the authorized build Mac's
signature attestation; it does not independently reproduce Apple's codesign
verification on Linux.

Only the selected build is offered to new installations. Previous immutable
files remain for two hours after replacement, and longer while a server stream
is active. This permits valid issued links and ranged downloads to finish.
A minute-based cleanup removes only retired managed builds; abandoned incoming
directories expire after 24 hours. This grace period deliberately allows an
old file to remain temporarily on disk. It is not a second published channel.

For a failed functional postcheck while the previous build is retained:

```bash
printf '%s\n' '{"id":"FAILED_CURRENT_UUID"}' | ssh ADMIN_HOST 'node /opt/a/scripts/ios/ota-store.mjs rollback'
```

The helper validates the previous IPA digest before switching back. It refuses
rollback if another publication has become current. Never edit `current.json`
by hand. Inspect processes before removing a stale `temp/ios-release.lock` on
the Mac or `.publish-lock` on the server; do not remove an active lock.

## Acceptance and limits

Regression coverage: `npm run test:run -- tests/ios/ota_distribution.test.mjs
tests/governance/build_cache_retention.test.mjs`. It covers manifest parsing,
capability tampering/expiry/revocation, interrupted upload, concurrent publish,
rollback, old-download retention, ranges and local cache ownership.

Check a physical registered iPhone in Safari: installation, replacement without
deleting the old app, persistent data and AUv3 loading in an actual host.
An Xcode or devicectl installation does not prove OTA installation. TestFlight
and Ad Hoc are distinct signatures; exercise both transitions before relying
on them. Do not remove the installed app when testing data preservation.
Profile/certificate expiration or revocation requires renewal and a newly signed
build; the personal URL alone cannot restore an expired app.

Mail is manual by default. The existing per-user mail gateway is not evidence
of a configured release sender. No unsolicited mail is sent and mail failure
never affects a published build. Build summaries report signature validation,
version/build, publication and HTTPS checks separately from physical-device
acceptance. This is private, limited Ad Hoc testing, not public distribution.

## Verified deployment — 2026-10-23

Published version: **1.25 (24)**, IPA 491,246,273 bytes, SHA-256
`87855d2b4ee73e794297f0a851b5a9ec5d678130940626f3b4ab2a2b640ceb74`.
Both Ad Hoc profiles include the same nine devices and expire on 2027-09-01;
the owner's known iPhone is included. Apple Distribution signatures and required
entitlements passed. The server contains no Apple signing private key.

| Check | Evidence |
| --- | --- |
| Xcode archive and Ad Hoc export | Succeeded; no App Store Connect upload |
| Publication and versions | Confirmed; idempotent retry preserves 1.25 (24) |
| HTTPS distribution | Personal authorization and manifest 200; IPA range 206; anonymous IPA 403 |
| Installation shell | Real browser link and pixels; no page errors |
| Regression tests | 27 passed across OTA and cache retention |
| TestFlight | Real dry-run and simulated Xcode default path passed; no live upload |
| Physical iPhone | Runner connected; installation deferred while call UI is foreground |
| Replacement, data persistence, AUv3 host | **To verify** on the physical device; GarageBand is already installed |

Syntax, WebSocket-only transport and forbidden-path checks passed. Global M0
has an existing unrelated Dashboard record-preview ownership violation. The
existing test-manifest guard has unrelated stale entries and ordering errors;
neither condition was changed to bypass a check. Cache cleanup completed and
kept the signed export and shared Xcode/Rust caches. No Git write was performed.
