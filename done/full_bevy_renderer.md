# Full Bevy Renderer — Historical Completion Tracker

Historical tracker for the single Bevy/WebGPU render path on `#eve_surface_project`.

Active remaining cleanup and gated validation work was moved to [`todo/full_bevy_renderer_remaining.md`](./full_bevy_renderer_remaining.md). Do not track remaining active work in this file.

## Invariants

- One renderer: Bevy compiled to WASM/native using WebGPU.
- One visible project canvas: `#eve_surface_project`.
- No JS WebGPU compositor beside Bevy.
- No fallback renderer.
- Kira remains the sole audio and master-clock owner.
- Git remains read-only.

## Scope Moved Elsewhere

- Molecule editor reintegration is tracked in [`todo/molecule/NewMolecules.md`](../todo/molecule/NewMolecules.md).
- Remaining P0 cleanup and M7.1/M7.2 validation are tracked in [`todo/full_bevy_renderer_remaining.md`](./full_bevy_renderer_remaining.md).

## Completed And Validated

- [x] Color bug fixed in `video_external.wgsl` with sRGB-to-linear handling and guard coverage.
- [x] Dead Rust `video_track` API removed from render ops, types, exports, and tests.
- [x] `molecule.webgpu.js` deleted; per-Atome visual rendering moved to Bevy while Kira audio remains.
- [x] `webgpu_video_preview_renderer.js` and `native_frame_video_preview_renderer.js` deleted.
- [x] M1 per-clip color filters implemented in the Bevy video material and validated end-to-end.
- [x] M2 built-in transitions implemented in the Bevy material/timeline and validated end-to-end.
- [x] Old Molecule web-component renderer deleted.
- [x] eVeIntuition decoupled from static MTrax imports.
- [x] Full MTrax production implementation removed and deletion guarded.
- [x] M6 old MTrax renderer system removed.
- [x] M7.3 guardrails completed: `check:m0` and `test:molecule` green.
- [x] Closure guardrails added for one project render surface, no per-Atome canvas, and no JS WebGPU compositor beside Bevy.

## Active Successor Task

The remaining active task is [`todo/full_bevy_renderer_remaining.md`](./full_bevy_renderer_remaining.md).
