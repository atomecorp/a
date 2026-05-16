# Play Record Unification

## Objective

Create one unified play/record architecture shared by MTRACK timeline playback, direct media playback, molecule playback, browser mode, Tauri mode, iOS app mode, and AUv3 mode.

The audio system must be isolated from UI state, tracks, MTRACK internals, molecules, DOM objects, and application-specific media import flows. Tracks and molecules may provide timeline intent, but they must not own media path resolution, native asset loading, recording transport, or playback command dispatch.

## Architectural Rules

- The unified play/record layer is the only authority for runtime detection, media path normalization, native asset loading, voice playback, voice stop, asset destruction, recording start, recording stop, and audio metadata.
- MTRACK must submit clip/timeline intent only.
- Direct media playback must submit media intent only.
- Molecules must submit media intent only.
- The unified layer must return deterministic results with stable `assetId`, `voiceId`, `mediaRef`, `duration_seconds`, `sample_rate`, `frame_count`, and canonical path fields.
- Runtime-specific differences must be contained inside dedicated providers: web, Tauri, iOS app, AUv3.
- Native bridge command contracts must be aligned across runtimes.
- Imported files and recorded files must use the same canonical media reference pipeline.
- No UI operation, track move, molecule open/close, panel close, selection change, or drag operation may mutate audio engine state directly.

## Execution Plan

- [x] Document the unification task and target architecture.
- [x] Create a unified play/record core with runtime-neutral APIs.
- [x] Move shared Kira/native command normalization into the unified core.
- [x] Centralize media path and source resolution for uploads, recordings, `/file`, `/api/uploads`, `/api/recordings`, absolute paths, and project-relative paths.
- [ ] Route direct playback through the unified core.
- [x] Route MTRACK native playback through the unified core.
- [x] Route molecule native playback through the unified core.
- [x] Route recording through the unified core for Tauri, iOS app, AUv3, and browser.
- [x] Align native bridge command support, including `audio_has_clip`, across Tauri and iOS app.
- [ ] Remove duplicated recording/playback paths once the unified core is authoritative.
- [x] Add contract tests for imported-file playback, recorded-file playback, direct playback, MTRACK playback, and molecule playback.
- [ ] Add regression coverage for track movement, molecule close/open, and timeline reload without audio cache loss.
- [ ] Verify no temporary logs, duplicate fallback routes, or UI-coupled audio control remain.

## Acceptance Criteria

- `Squirrel.av.audio` and all MTRACK/molecule playback paths call the same core authority.
- `record_start` and `record_stop` are the single recording API for all runtimes.
- MTRACK no longer owns native asset loading as framework-specific business logic.
- Direct playback and MTRACK playback resolve the same media source to the same canonical asset.
- iOS app and Tauri expose equivalent command contracts for required native audio operations.
- Recording output can be loaded and played through the same media reference path used by imported assets.
- Moving tracks, closing molecules, opening molecules, and changing UI selection do not destroy or invalidate audio assets unless an explicit audio destroy command is issued.
- Tests prove that the same media can be loaded, played, stopped, reloaded, and replayed across the supported routes.
