# Kira Web engine reset a few seconds after boot

## Symptom

On the Web, the render clock (`audio_render_clock`) becomes `null` about 5–10 s
after boot; a take recorded then is placed without sample accuracy, scheduled
voices and the mixer graph vanish.

## Confirmed cause

`atome/src/application/audio_runtime/backend.kira.js` was evaluated twice: once
through its relative path and once through the `#squirrel/` alias, two different
module URLs. The second evaluation registered a new backend and re-initialized the
WASM audio manager, dropping the running engine.

## Durable correction

`atome/src/utils/module_loader_runtime.js#importOnce` deduplicates by module id
(`globalThis.__ATOME_MODULES_BY_ID__`), retrying only after a failed import.

## Regression checks

- `tests/atome/src/utils/module_loader_runtime.test.mjs`.
- `temp/timeline/timeline_sync_real_app.probe.mjs`: the render clock stays present
  across every take.
