# Native build-cache retention

Owner: `build_cache_retention.mjs`; authorized shared development maintenance,
outside application state, history, rendering and account storage.

On macOS, `../run.sh` invokes this owner before launching the existing Unix
runner and on exit after waiting for that runner. Startup removes abandoned
Rust objects and obsolete staging copies; exit performs archive/cache retention.
Help, status, stop and logs remain delegated without maintenance. Linux and
Windows launch paths are unchanged. An active compiler or Atome process defers
cleanup; no process is stopped. Node installation stays with existing bootstrap.

Commands from the project root:

```sh
npm run clean:build-cache:preview
npm run clean:build-cache
```

The default CLI operation previews retention. `--apply` deletes the planned
entries. `--phase=start` limits work to the startup scan; `--phase=end` is the
default full scan. Reports state removed counts, reasons and retained paths.
Filesystem errors are explicit. Symlinks across deletion boundaries are rejected.

Retention keeps:

- The latest Tauri `.app`, intact, and the compiler profile selected by the
  latest executable (or bundle when no executable exists). Cargo libraries,
  fingerprints, build outputs and incremental cache remain reusable.
- One Xcode DerivedData for this exact project, identified by native
  `Info.plist/WorkspacePath`; other projects and shared SDK/module caches remain.
- One iOS Rust target directory, using the existing warm device-cache path.
  Cargo maintains architecture subdirectories inside it. Xcode Debug, Release,
  App and AUv3 use that same directory. Explicit native Rust debugging can still
  select its existing dev profile.
- The latest complete TestFlight export, with its archive, symbols and IPA.
  The generator now uses normal Xcode DerivedData rather than a new cache per run.

Deletion is restricted to standalone `deps/*.rcgu.o`, old copied Rust targets
in desktop staging, the obsolete desktop profile/bundle, Android compiler
targets, old generator-owned TestFlight jobs, duplicate project DerivedData,
duplicate iOS Rust caches and temporary DerivedData whose native descriptor
proves ownership. Temporary discovery is bounded to three directory levels.
Unknown reports, installed Android SDK/AVD, source trees, Cargo registry,
credentials, databases and user data are outside the deletion contract.

Switching incompatible desktop Debug/Release profiles can require rebuilding
the discarded profile. Keeping a single cache does not freeze dependency hashes;
Cargo/Xcode invalidate dependencies normally when source or build options change.
The first simulator build after convergence may rebuild that architecture once.

Regression owner: `../tests/governance/build_cache_retention.test.mjs` covers
read-only preview, idempotence, ownership, active-build deferral, signed-app
integrity, cache selection, nested temporary caches and actual runner lifecycle
including stdin and exit status.
