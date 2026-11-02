# Native News schema upgrade

## Reproduction and evidence

Install the current signed Android APK with `adb install -r` over an older app
whose local `news_publications` table predates VideoTrain threads. The native
server thread panics while opening ADOLE, and the WebView remains on its launch
cover. Observed on Samsung SM-A236B, Android 14, updating build 11 to 1.46.0 (12),
2026-11-02. Evidence: `temp/android_delivery_2026-11-02/device-logcat.txt` and
`01-launch.png`. No upload or tester notification follows this failed acceptance.

## Confirmed root cause and owner

`platforms/desktop-tauri/src/server/local_atome.rs#init_database` executes the
shared `database/schema.sql`. `CREATE TABLE IF NOT EXISTS` preserves the old News
table, then its canonical thread index references the missing `thread_ref` and
`root_id`. Fastify already prepares these columns in
`database/adole_schema_migrations.js#prepareAdoleSchemaColumns`; native preparation
previously covered only events and device keys.

## Durable correction

The private native `local_atome_schema.rs#prepare_legacy_columns` owns the
existing pre-schema preparation and its column helper. It adds all six canonical
thread fields and the report's `dismissed_at` before the shared schema runs.
Column inspection propagates errors. Existing values, rows, events and keys are
kept; fresh tables are still created by the canonical schema, and repeated
preparation is idempotent. Initialization has no second storage or rendering path.

## Rejected approaches

- Clearing application storage or reinstalling after uninstall would lose local
  data and conceal the missing migration.
- Removing or delaying only the thread index leaves the native table incomplete.
- Successful APK signing and installation do not establish successful boot.

## Regression checks

`tests/tauri/local_atome_schema.rs` runs the real native migration owner against
SQLite: old News rows/reports survive two upgrades, fresh/current schemas retain
thread values, and earlier event/device-key migrations still preserve data. The
old News test fails with the device's exact missing-column error before the fix;
all four tests pass after it. Registered through the native module's test path.

The task's focused runner uses the already-declared cached rusqlite version:

```sh
cargo test --offline --manifest-path temp/android_delivery_2026-11-02/schema-tests/Cargo.toml
```

Physical acceptance passes on the same Samsung with signed build 13: in-place
installation, rendered Home, real Contacts/Objectives navigation and footer Back,
same-process background/resume, then another cold launch of the migrated database.
Local Axum reports atome/eVe 1.46. No native panic, missing-column error, fatal
exception, ANR or terminal WebGPU failure occurs in the captured build-13 window.
Screenshots and logs: `temp/android_delivery_2026-11-02/attempt13/`. WebView
bootstrap/tile-budget diagnostics remain; exhaustive media/account scenarios were
not part of this release smoke check.
