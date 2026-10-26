# Web/Android: app killed by Android, GPU memory above 1 GB

## Symptom

On an Android phone (Galaxy A23 5G, 4 GB, Adreno 619) the app closes by itself
30 s to 3 min after launch, on the first home with the large Atom. No crash:
`logcat` shows `lmkd … low watermark is breached and thrashing`, then
`Process one.atome.app … has died: fg TOP` (signal 9). `adb shell dumpsys gpu
--gpumem` gives the app process 1.0–2.1 GB of GPU memory, rising from 53 MB to
~1 GB between 15 s and 35 s after launch.

## Root cause (confirmed 2026-10-26)

1. A WebGPU tracer (wrapping `GPUDevice.createBuffer`) showed 22 MB of textures
   but 600–900 live `general mesh slab N (vertex buffer)` buffers of 1 MiB,
   ~28 new ones per second.
2. Bevy 0.19 (`bevy_render/src/mesh/allocator.rs`, `free_meshes`) frees then
   reallocates every *modified* mesh. A mesh alone in its slab empties the slab,
   which is dropped, and the reallocation creates a new 1 MiB slab.
3. wgpu 29 on the web (`backend/webgpu.rs`): `Drop for WebBuffer` is a no-op.
   A dropped buffer is never `destroy()`ed; its GPU memory waits for the
   JavaScript garbage collector, which the small JS heap does not trigger.
4. The modified mesh: `apply_entity_clip` runs on every transform patch and
   called `crop_backdrop_surface`, which rewrote the glass quad through
   `Assets<Mesh>::get_mut` even when nothing changed. The Dashboard Atom's
   spring and breath send a transform patch every frame → one slab per frame.

## Fix

`atome/renderers/bevy-core/src/backdrop_surface.rs`: `AtomeBackdropCropMesh`
(crop + mesh id) guards `crop_backdrop_surface`, like `AtomeVideoClipMesh` for
video quads. `clip_polygon.rs` removes it when a polygon is written in place.

Rule: on the web, never touch `Assets<Mesh>::get_mut` (or swap a `Mesh2d`) on a
per-frame path unless the geometry really changed.

## Regression / acceptance

- `cargo test --lib backdrop_transform_keeps_an_unchanged_crop_out_of_the_mesh`
  (`atome/renderers/bevy-core/src/tests.rs`): fails without the guard.
- On the phone: `dumpsys gpu --gpumem` for the app stays flat after the home
  appears; the app is not killed. Tracer: `temp/android-cdp/gputrace.mjs`.
