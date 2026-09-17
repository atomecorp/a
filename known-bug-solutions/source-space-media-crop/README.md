# Source-space media crop

## Symptoms

- A media descendant cannot enter crop inside nested edited Molecules.
- Image edge crop stretches the image.
- Audio trim is correct but the retained waveform is redistributed across the frame.
- A video or audio double-click is followed by resize/zoom instead of crop when the first gesture arrives before contextual edition has finished entering.

## Confirmed causes

- Interaction resolution stopped at one opened structural boundary and replaced an active media leaf with its parent.
- Cropped image UVs used natural-source coordinates against a frame-sized stretched texture.
- Waveform peaks were sliced and rerasterized to the full frame width.
- Resource UV updates changed `Sprite.rect`, but generic clip recomputation restored the stale `AtomeSpriteSourceRect`.
- Double-click dispatched asynchronous selection and edition without ordering the next surface gesture; nested selection could also reactivate the edited Molecule ancestor over the exact media leaf.
- Persisted recordings use `video_recording` and `audio_recording`; contextual crop recognized only `video` and `audio`, so the pinch fell through to generic resize. The same filter rejected inline SVG vector edition.

## Durable correction

- Preserve a raw hit whenever any ancestor is in contextual edition; otherwise resolve the closed outer owner.
- Cache cropped images in bounded natural-source aspect and project canonical `source_rect` through UVs.
- Keep full waveform peaks and project the temporal crop as a horizontal UV window.
- Update `Sprite.rect` and `AtomeSpriteSourceRect` together on resource patches.
- Serialize `select` plus `atome.edit.enter` before accepting the next pointer/wheel/native gesture, and preserve an exact descendant already in edition during Molecule selection synchronization.
- Reuse canonical media playback-kind normalization at the contextual boundary and route inline SVG to the existing vector editor.

## Regression checks

- `tests/eve/molecule_visual_geometry.test.mjs`
- `tests/eve/bevy_projection_adapter_contract.test.mjs`
- `tests/eve/bevy_project_renderer_guards.test.mjs`
- `tests/eve/project_view_list_preview_model.test.mjs`
- `tests/eve/project_scene_unified_rendering_contract.test.mjs`
- `tests/eve/bevy_ui_touch_surface_contract.test.mjs`
- `cargo test --manifest-path atome/renderers/bevy-core/Cargo.toml`

Browser acceptance must use a mounted interactive WebGPU project, real double-click/drag/pinch gestures, one project canvas and zero Atome DOM proxies.
