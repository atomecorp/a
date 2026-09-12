# Desktop (Tauri) Build and Apple Distribution

Status of the macOS desktop bundle as of 2026-09-11. This document covers the
Tauri desktop target only. The iOS application and its AUv3 extension have a
separate, complete release path documented in
[`platforms/ios/atome-auv3/README.md`](../../platforms/ios/atome-auv3/README.md).

## Summary

The repository can build a **production macOS bundle**, but it cannot produce a
**signed, notarized bundle for Apple distribution**. No script, npm task, or
configuration key in this repository performs macOS code signing or
notarization. What the production entry points produce is an ad-hoc signed
`.app` and `.dmg`: usable on the build machine, blocked by Gatekeeper on any
other Mac.

## What exists today

### `./run.sh --tauri-prod`

Implemented in [`scripts/setup/run_unix.sh:518`](../../scripts/setup/run_unix.sh).
It runs:

```bash
npm run build                               # rollup frontend bundle
TAURI_SKIP_BUNDLE_OPEN=1 npm run tauri build
```

then opens the newest `.app` it finds, prints the path of the newest `.dmg`, and
exits. It does not start Fastify.

### `./run.sh --prod`

Implemented in [`scripts/setup/run_unix.sh:608`](../../scripts/setup/run_unix.sh).
Same two build commands, but instead of launching the app it mounts the newest
`.dmg` with `hdiutil attach` and exits. It leaves the DMG mounted until you
eject it manually.

Both flags are listed by `./run.sh --help`
([`scripts/setup/service_commands.sh:3`](../../scripts/setup/service_commands.sh)).

### `npm run build:molecule:tauri`

`tauri build --debug --features bevy_renderer_core --bundles app`. A **debug**
bundle used by the startup acceptance test (`npm run test:molecule:tauri-startup`).
It is not a release artifact.

### Output paths

```
platforms/desktop-tauri/target/release/bundle/macos/   # squirrel.app
platforms/desktop-tauri/target/release/bundle/dmg/     # the generated .dmg
```

Both scripts pick the newest entry in those directories rather than a fixed
file name, which Tauri derives from `productName` and `version`.

`bundle.targets` is `"all"` in
[`platforms/desktop-tauri/tauri.conf.json`](../../platforms/desktop-tauri/tauri.conf.json),
so a macOS build emits both the `.app` and the `.dmg`. That file also declares
the bundled resources (`atome/`, `eVe/`, `version.txt`, the rubberband-wasm
dist) and points `bundle.macOS.infoPlist` at
`platforms/desktop-tauri/Info.plist`, which carries the microphone, speech
recognition, camera, and contacts usage descriptions.

## Known divergences in the production path

These are current facts about the scripts, not recommendations.

- **Renderer feature flag.** `tauri:dev` and `build:molecule:tauri` both pass
  `--features bevy_renderer_core`. The two production entry points call
  `npm run tauri build` with no feature flag, so the release bundle is not built
  with the same renderer features as the development runtime.
- **No version ledger.** `version` in `tauri.conf.json` is `0.1.0` and nothing
  increments it. This is unlike the iOS path, where
  `scripts/XCode_testflight_generator` owns `MARKETING_VERSION` and
  `CURRENT_PROJECT_VERSION` and increments them per upload.

## What is missing for a signed Apple distribution

Nothing below is implemented. It is the gap list, with the exact Tauri v2
property and environment-variable names from the
[Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/) and the
[Tauri configuration reference](https://v2.tauri.app/reference/config/).

### 1. A certificate of the right type

Verify what is installed:

```bash
security find-identity -v -p codesigning
```

Apple requires a different certificate per channel:

- `Developer ID Application` — to ship outside the App Store (direct download,
  DMG). **This is the one required for notarization**, and it was absent from
  the build machine on 2026-09-11.
- `Apple Distribution` — to submit to the Mac App Store. Present on the build
  machine on 2026-09-11, and already used by the iOS TestFlight path.

### 2. Signing configuration

Either set `bundle.macOS.signingIdentity` in `tauri.conf.json`, or export
`APPLE_SIGNING_IDENTITY` before the build. For CI, `APPLE_CERTIFICATE` (a
base64-encoded `.p12`) and `APPLE_CERTIFICATE_PASSWORD` import the certificate
into a temporary keychain.

Relevant `bundle.macOS` properties, none of which are currently set:

| Property | Type | Note |
| --- | --- | --- |
| `signingIdentity` | `string \| null` | Identity to use for code signing. |
| `entitlements` | `string \| null` | Path to the entitlements file. |
| `hardenedRuntime` | `boolean` | Default `true`; required for notarization. |
| `providerShortName` | `string \| null` | Provider short name for notarization. |
| `minimumSystemVersion` | `string \| null` | Default `"10.13"`. |

### 3. An entitlements file

There is no `.entitlements` file under `platforms/desktop-tauri/`. Hardened
runtime is on by default and restricts resource access, so the entitlements
file has to grant whatever the app actually uses. The `Info.plist` usage
descriptions show the resources to cover: microphone, speech recognition,
camera, and contacts. Confirm the required entitlement keys against Apple's
current hardened-runtime documentation before shipping — do not copy a list
from a build that was never verified on another Mac.

### 4. Notarization credentials

Notarization runs as part of `tauri build` when the credentials are present in
the environment. Two supported forms:

- App-specific password: `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.
- App Store Connect API key: `APPLE_API_KEY` (the Key ID), `APPLE_API_ISSUER`
  (the Issuer ID), `APPLE_API_KEY_PATH` (path to the `.p8` file).

The iOS release path already stores an App Store Connect API key outside the
repository at `~/.appstoreconnect/private_keys/AuthKey_<key-id>.p8` with the
Issuer ID in `~/.appstoreconnect/issuer-id`. Reuse that location rather than
introducing a second credential store, and never commit a key or move one into
the repository — `.gitignore` is not a secret-storage mechanism.

## Scope boundaries

| Path | Script | Scope |
| --- | --- | --- |
| macOS desktop, production bundle | `./run.sh --tauri-prod`, `./run.sh --prod` | Unsigned local build. No signing, no notarization. |
| macOS desktop, debug bundle | `npm run build:molecule:tauri` | Startup acceptance test only. |
| iOS app + AUv3, TestFlight | `scripts/XCode_testflight_generator` | Archive, export, upload to App Store Connect. See [the iOS README](../../platforms/ios/atome-auv3/README.md). |
| iOS AUv3, local device | `./auv3.sh` | Debug deploy to a connected iPad. Not a distribution path. See [auv3_deployment.md](auv3_deployment.md). |

## Verifying a signed bundle

Once signing is implemented, these are the checks that actually prove it —
opening the app on the build machine proves nothing, because the build machine
trusts its own ad-hoc signature:

```bash
codesign --verify --deep --strict --verbose=2 path/to/squirrel.app
spctl --assess --type execute --verbose path/to/squirrel.app
xcrun stapler validate path/to/squirrel.dmg
```

The decisive test remains opening the DMG on a Mac that never built the app.
