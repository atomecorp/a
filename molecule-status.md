# Molecule Media Engine - Current Debug Status

**Date**: 28 avril 2026  
**Current Goal**: keep both runtimes green after the Fastify and Axum protected-media fixes

---

## ✅ Verified Progress

- **Fastify 3001**: browser acceptance is green, desktop 5/5 and MTrack 5/5
- **MTrack regression fixed**: the browser Kira/WASM playback failure caused by `bridge is not defined` is fixed in `src/application/eVe/domains/mtrax/audio/hmtracks_native_playback_runtime.js`
- **Axum 3000 bootstrap fixed**: the local browser session no longer fails at project bootstrap with `project_id:null`
- **Axum 3000 MTrack**: now green, 5/5 on the latest probe

---

## ✅ Final Validation

Latest verified probe results:

```text
http://localhost:3001
desktop: 5/5 passing
mtrack: 5/5 passing

http://localhost:3000
desktop: 5/5 passing
mtrack: 5/5 passing
```

Validated with:

- `ADOLE_TEST_URL=http://localhost:3001 npm run -s probe:browser-media-acceptance`
- `ADOLE_TEST_URL=http://localhost:3000 npm run -s probe:browser-media-acceptance`

---

## 🎯 Root Causes Fixed

1. **Axum bootstrap routing**

- local Axum pages served on port 3000 must be treated as local Tauri-backed runtime for unified project/media APIs
- fixed in `src/squirrel/apis/unified/adole_api/runtime.js` and the Tauri-served `_up_` mirror

1. **Axum desktop protected-media hydration**

- local Axum pages must use the local authenticated media path, not the Fastify branch
- fixed in `src/application/eVe/domains/media/api/media_api_shared.js` and its `_up_` mirror

1. **Desktop video auth query mismatch**

- remaining Axum desktop video failures came from protected media helpers still appending `access_token`
- the working Axum media paths use `token`
- fixed in:
  - `src/application/eVe/intuition/runtime/tool_genesis.js`
  - `src/application/eVe/core/media_engine/molecule.js`
  - `src/application/eVe/core/media_engine/molecule.api.js`
  - mirrored Tauri-served `_up_` copies

---

## 🧪 Current Validation State

- **Port 3001**: green end-to-end
- **Port 3000**: green end-to-end
- **Desktop**: 5/5 on both runtimes
- **MTrack**: 5/5 on both runtimes

---

## ✅ Cleanup Phase

- Generated headless artifacts under `tools/headless_output` were removed, and active outputs now write under `temp/probe_reports` and `temp/script_reports`.
- Former headless probe sources were reclassified under `tests/probes/*.test.mjs`, including `tests/probes/browser_media_acceptance_probe.test.mjs` for `probe:browser-media-acceptance`.
- The browser acceptance probe was rerun after the output-path migration and remained green while writing `report.json` under `temp/probe_reports/browser_media_acceptance_probe`.
- No additional temporary MTrack source scaffolding specific to this fix remained in the touched runtime files beyond the functional fixes that are still required.

---

## 📋 Notes

- The transient terminal failures seen during validation were caused by using `status=$?` in `zsh`; `status` is read-only there. Validation results above were confirmed with safe exit-code capture.
- Syntax diagnostics are clean on the touched source files.
- Everything listed in this status file is now accomplished.

---

**Last Updated**: 2026-04-28 cleanup completed after final green validation on ports 3000 and 3001, with artifact outputs migrated to `temp/*_reports`
