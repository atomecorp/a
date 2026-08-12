# Cross-runtime viewport reanchor

## Symptom

After an iOS rotation or a Web/WebView/Tauri resize, the bottom menu can remain
above the lower edge and a panel moved before the resize can retain geometry
projected against the preceding viewport.

## Confirmed cause

The shared project-surface resolver originally preferred any positive host or
`#view` rectangle over the live `visualViewport`. During iOS rotation those
layout boxes can remain positive but stale for a frame. The first correction
then made `visualViewport` absolutely authoritative, but macOS Tauri WebKit can
leave that object at the initial window dimensions while the layout viewport
and fullscreen host have already resized. Project and Dashboard shells also
stored fullscreen geometry through `100vw`/`100vh`, while the iOS bootstrap
wrote document heights again at 0, 150 and 600 ms. These independent or stale
inputs could project the surface, menu and panel in different resize generations.
Tauri fullscreen transitions add one more mismatch: the host window can return
to 800 px while WebKit/Winit still reports the preceding fullscreen surface or
the uncapped native DPR, producing the observed 75% projection.

## Durable correction

- Keep host sizing for initial mounts and observer-only embedded-surface
  changes.
- Make `window.resize`, `visualViewport.resize`, and `orientationchange`
  structural signals in the canonical surface scheduler. Reconcile the visual
  viewport, layout viewport, and fullscreen host against the preceding surface
  size: the changed source or agreeing changed pair wins. This preserves iOS
  keyboard contraction and rejects an unchanged Tauri `visualViewport`.
- In Tauri, publish the native inner size in logical CSS units at startup and
  on every host resize through `eve:native-viewport-resize`. The shared surface
  resolver consumes that measurement; it is not a second renderer or state
  owner. Browser Winit resize messages may only reconcile its window to the
  canonical Atome surface config and must never replace that config.
- Keep surface and main-menu work coalesced to one animation frame; retain the
  panel runtime's one 90 ms settled reflow from stored placement intent, then
  force one canonical surface reconciliation. A single 160 ms trailing surface
  reconciliation covers later WebKit resize consumers without a polling loop.
- Use the shared fixed `inset: 0` project-layer geometry for project, Matrix,
  user workspace and neutral Dashboard hosts; do not restore viewport units.
- Do not inject native document/body height writers or delayed viewport
  corrections.

## Regression evidence

- `tests/eve/render_surface_size_contract.test.mjs` keeps an 800×600 positive
  host rectangle while rotating the visual viewport to 1200×700 and requires
  the surface to adopt the new viewport. It also keeps `visualViewport` at
  800×600 while layout and host become 1200×700, then verifies the inverse
  visual-only iOS keyboard contraction and the explicit native 800×568 Tauri
  measurement.
- `platforms/desktop-tauri/src/viewport_runtime.rs` proves physical native
  pixels are converted to logical viewport units.
- `tests/eve/project_layer_visibility_contract.test.mjs` requires fixed inset
  geometry with no inline viewport-unit width or height.
- `tests/eve/bevy_ui_main_menu_contract.test.mjs` exercises the explicit
  orientation signal and bottom placement.
- `tests/eve/bevy_panel_geometry_contract.test.mjs` exercises settled panel
  reanchoring on orientation.

Packaged Tauri acceptance on 2026-08-11 passed two fullscreen/restore cycles
after dragging Panel Lab: surface, right rail, panel and bottom menu remained
inside the current viewport. Physical-device iOS rotation remains a separate
required acceptance; native compilation alone does not replace it.
