# Recurrent native compilation disk exhaustion

## Confirmed evidence (2026-10-07)

The desktop target occupied 104 GiB and project `temp/` 67 GiB, with only
3.6 GiB free. `target/debug/deps` contained roughly 66,000 standalone Rust
code-generation objects; obsolete desktop resource staging also copied whole
Rust targets (about 28 GiB Debug and 10 GiB Release). Repeated TestFlight jobs
created separate DerivedData trees; old diagnostic iOS builds did likewise.
Logs were about 9 MiB, so log rotation was not the material cause.

The first authorized typed cleanup removed 66,006 entries and raised free
space to about 90 GiB. Desktop target fell to 31 GiB and temp to 34 GiB.
These are observed measurements, not a guarantee about future cache sizes.

## Canonical correction

[`scripts/build_cache_retention.mjs`](../../scripts/build_cache_retention.mjs)
owns preview and deletion; [policy](../../scripts/build_cache_retention.md)
defines the precise retained artifacts and deletion boundaries.
`run.sh` composes startup and exit maintenance with the existing Unix runner.
The TestFlight generator drops its per-run `-derivedDataPath`; the iOS Rust
builder shares its existing device cache across configurations and Xcode targets.

Do not run blanket `cargo clean`, remove every DerivedData or delete installed
SDKs/simulators to reproduce this correction: that discards useful dependencies,
affects other projects and does not correct per-run cache creation. Never alter
the contents of the retained signed `.app`.

## Checks

- `npm run test:run -- tests/governance/build_cache_retention.test.mjs`
- `npm run clean:build-cache:preview`: check retained artifacts and deferral.
- `npm run clean:build-cache`: only when no active owner; repeat to check
  idempotence.
- `npm run build:molecule:ios:device`: signed Debug build succeeded after the
  cache-path change; Rust cache reuse took 0.69 s and 0.46 s.
- Tauri build and native workflow evidence belong to the dated framework state.

App UI acceptance is separate: this maintenance does not modify authentication,
project state, rendering or the product's command pipeline.
