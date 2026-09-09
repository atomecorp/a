# wgpu Web External Texture Backend

This directory owns the maintained `wgpu` backend fork required by the browser
Bevy renderer until upstream `wgpu` supports direct Web `GPUExternalTexture`
creation and binding from browser media sources.

Scope:

- `wgpu-29.0.4/` is based on the pinned `wgpu` crate used by the Bevy renderer.
- `wgpu-types-29.0.4/` is based on the matching `wgpu-types` crate.
- The 27.0.1 pair was removed on 2026-09-09: `platforms/web/bevy-renderer/Cargo.toml`
  and `atome/renderers/bevy-core/Cargo.toml` both pin 29.0.4, no `Cargo.toml`
  referenced 27.0.1 any more, and the first maintenance rule below requires the
  fork to track the renderer dependency. It was ~25 000 lines of vendored Rust
  (2,4 MB) that nothing built.
- The fork is intentionally limited to WebGPU external-texture support:
  browser media source descriptors, `GPUDevice.importExternalTexture`, Web
  bind-group resource mapping for `BindingResource::ExternalTexture`, and the
  generated WebGPU bindings needed for those calls.
- This is not a fallback renderer, JavaScript compositor, compatibility shim, or
  temporary probe. It is the source-level backend owner for the missing Web
  `wgpu` capability.

Maintenance rules:

- Keep the fork version aligned with the Bevy renderer dependency.
- Keep upstream files unchanged unless the change is part of the documented
  Web external-texture backend support.
- Keep production code free from imports under `temp/`.
- Remove this fork only when the pinned upstream `wgpu` used by Bevy exposes the
  same browser media source descriptor and Web backend binding behavior.
- Oversized upstream files are accepted here only as vendored backend source;
  feature code must not accumulate in this directory outside the narrow backend
  responsibility above.

Validation owner:

- `temp/c1_wgpu_external_texture_backend_probe/` keeps the isolated proof reports
  for the original browser and Bevy RenderDevice validation.
- `platforms/web/bevy-renderer/` owns the production build validation.
- `tests/eve/bevy_project_renderer_guards.test.mjs` guards that the product
  graph uses this maintained fork and still does not expose a video-track facade
  before the product route exists.
