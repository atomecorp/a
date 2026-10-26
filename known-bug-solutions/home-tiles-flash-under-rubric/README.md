# eVe home: tiles flashing behind a rubric, stretched or blank frames on a resize

## Symptom

On the eVe home with a rubric open (e.g. Créer), touching a plate that opens on
the stage (Créer › Texte) showed the whole home grid (Créer, Contact, Agenda,
Moniteur…) for a moment behind the rubric before the edit grew. When the keyboard
rose (or on a rotation or a resized window), a smaller home grid showed behind
the rubric's plates, whose labels and glyphs looked stretched (discs turned into
ovals), then a squashed or blank frame, before everything settled (~470 ms of
wrong frames). Reported on Android (Galaxy A23) on 2026-10-26, reproduced on the Web.

## Root causes (confirmed 2026-10-26)

1. Stage opening (`eVe/domains/dashboard/dashboard_mystic_stage.js`): the stage
   asked the home to hide its tiles (not awaited) and suspended the Mystic list
   at once. The Mystic ground, which covers the tiles, went in ~5 ms; the home's
   paint landed 100–300 ms later. Closing had the reverse order. Same order in
   `eVe/domains/programs/objective_preparation.js`.
2. Relayout: the plates followed the home's cells after a fixed 60 ms timer, the
   stage after a 160 ms debounce (plus a duplicate `window.resize` listener).
3. `eVe/domains/rendering/surface_runtime.js` resized the canvas at the next frame
   but told the layout owners 160 ms later: for 160 ms, trees laid for the old
   size were drawn in the new canvas.
4. Renderer (`atome/renderers/bevy-core/src/render_ops.rs#apply_surface`): the
   window resolution was set without `WindowResized`, so the cameras (and the UI
   viewport) stayed on the former size until winit's own resize event, frames later.
5. Renderer shader (`procedural_sdf.wgsl#intuition_mystic`): the plates sampled
   their captures (workspace, face, background) with the size the JS last sent;
   the captures already covered the new surface → content stretched ×old/new.
6. Renderer (`platforms/web/bevy-renderer/src/lib.rs#apply_browser_window_resize_to_surface`):
   the capped surface (`MAX_RENDER_SURFACE_DEVICE_PIXEL_RATIO` 1.5) was restored
   only on `WindowResized`; a scale factor read by winit (screen density) slipped
   through, wgpu reconfigured the canvas at the screen's density, the page set it
   back after the frame was presented → a blank frame. Steady state ran at the
   screen density too (UI viewport 2× the configured surface on a retina Mac).
7. A JS write of the canvas size outside the renderer's frame clears the canvas
   until the renderer draws again (blank), or shows the old picture in the new box (squashed).

## Fix

- Stage: `takeHome()` (home paint awaited, then the list suspended) /
  `giveHome()` (list back, then the tiles); home `refresh()` and stage `changed()`
  return the paint promise. Objective preparation: home first, back last.
- `createMatrixTemplateRuntime({ onPainted })`; home geometry `painted()` →
  `followHome()`: plates and stage relaid right after the home's paint shows.
- Surface: no immediate unpublished pass. Shrinking, the canvas stays as it is,
  cropped by the page, until the burst settles; growing, the renderer takes the
  room at once (`growSurfaceAtOnce`). Once started, the web renderer owns its
  canvas size (`setRenderSurfaceResizer` ← `bevy_web_renderer_startup.js`,
  `resizeBevyWebRendererSurface`): the size is pushed to the engine, winit/wgpu
  apply it inside the frame drawn at that size; the layout owners are told once
  the canvas shows it. `applyBevyWebRendererSurfaceResize` no longer writes the
  canvas when the engine already has the size.
- `apply_surface` writes `WindowResized`; the web restore runs every update
  (window ≠ configured surface → restored before drawing); the Mystic shader maps
  record points to screen UV from the fragment's own place.

## Regression

Probes (HEADLESS=0; `PROBE_WASM_DIR=<build>` through `temp/text_open_flicker/with_env.mjs`
until `atome/src/wasm` is rebuilt):
- `temp/text_open_flicker/flash.probe.mjs` / `flash_event.probe.mjs`: a frame
  showing the home's orange session glyph is a flash (rubric → stage, keyboard
  over the stage, ✕, again). `blank_frames.sh <dir>`: frames showing the page grey.
- `resize.probe.mjs` (keyboard rise, rubric open), `fall.probe.mjs` (fall),
  `viewport.probe.mjs` (per frame: canvas, UI viewport, engine ticks, canvas mutations).
- Rust: `platforms/web/bevy-renderer/src/tests.rs#surface_patch_tells_the_cameras_in_the_same_update`.

## Still open

- The home shrinks its tiles to fit a short surface when no field is typed in
  (`dashboard_mystic_grid.js#dashboardHomeShape`, 84 px at 602 px high), against
  AGENTS.md rule 12.
- Native renderers (Tauri desktop, iOS): no renderer-owned resize; they keep the
  JS write at the end of the burst (cropped meanwhile, no immediate growth).

## Acceptance

No frame between the rubric and the stage (or back) shows a home tile; on a
keyboard rise or fall nothing is stretched, squashed or blank: the old layout,
cropped or with the revealed room drawn, then the new one.
