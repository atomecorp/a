# Known Bug Solutions

- [Private-vault history routing](vault-history-routing/README.md): empty history and unavailable undo despite persisted edits.

This directory records confirmed root causes and durable fixes for recurring
regressions. Each issue owns one folder so an agent can reproduce and validate
the established solution before attempting a new implementation.

## Index

| Symptom | Folder |
| --- | --- |
| Assistant appears before connection, loses voice on token refresh, or its input covers ribbon tools | [assistant-connection-ribbon](assistant-connection-ribbon/README.md) |
| Nested media cannot crop, images stretch, or trimmed waveforms deform | [source-space-media-crop](source-space-media-crop/README.md) |
| SVG double-click has no WebGPU handles or Color targets an old layer | [svg-vector-edit-webgpu](svg-vector-edit-webgpu/README.md) |
| Matrix cumulative selection toggles the wrong cell after a store reload | [structured-selection-reload-order](structured-selection-reload-order/README.md) |
| Draw stretches its initial SVG segment into a blue block | [svg-draw-stale-projection](svg-draw-stale-projection/README.md) |
| Text selection shrinks its frame or silently formats an invisible range | [text-selection-frame-and-target](text-selection-frame-and-target/README.md) |
| Native Cmd-Z is inactive or history repeats an already undone transaction | [canonical-history-shortcuts](canonical-history-shortcuts/README.md) |
| Tauri Home or Dashboard first-open times out under permission-heavy accounts | [tauri-panel-permission-scans](tauri-panel-permission-scans/README.md) |
| An imported video plays audio once, then later playbacks are silent | [media-video-audio-replay](media-video-audio-replay/README.md) |
| List Delete has no handler, playback skips paged items, or projected audio progress freezes | [project-view-list-media-regressions](project-view-list-media-regressions/README.md) |
| Projects disappear, project views look empty, or legacy media returns 404 after identity migration | [project-state-media-identity-reconciliation](project-state-media-identity-reconciliation/README.md) |
| Bottom menu or moved panels float after rotation or WebView resize | [cross-runtime-viewport-reanchor](cross-runtime-viewport-reanchor/README.md) |
| Flower or tool glass keeps stale white/image pixels after resize or content movement | [dynamic-backdrop-refresh](dynamic-backdrop-refresh/README.md) |
| Browser login with a Tauri-created account terminates Fastify during sync | [sync-subscription-burst-fastify-crash](sync-subscription-burst-fastify-crash/README.md) |
| iOS shows purple then black because WebContent is terminated during boot | [ios-webcontent-boot](ios-webcontent-boot/README.md) |
| iOS launch shows "Le démarrage continue…" for 10-20 s when the server does not answer | [ios-boot-server-await](ios-boot-server-await/README.md) |
| iOS launch keeps "Le démarrage continue…" over a Dashboard entry or a late Main Toolbar mount | [ios-boot-presentation-contract](ios-boot-presentation-contract/README.md) |
| A long press in a panel input box closes the field, the keyboard and the layout on finger lift | [ios-panel-input-fast-tap-blur](ios-panel-input-fast-tap-blur/README.md) |
| iOS freezes after a rotation: the old frame is stretched, the bottom band stops answering and every tool raises the keyboard | [ios-rotation-freeze](ios-rotation-freeze/README.md) |
| An AI-generated image or speech keeps displaying an older generation | [ai-generated-media-identity](ai-generated-media-identity/README.md) |

## Maintenance rules

- Add an entry only after the failing path, owning layer, and correction have
  been evidenced.
- Record rejected hypotheses when they prevent the same unproductive work.
- Keep reproduction steps on the canonical UI path; do not document direct
  runtime invocation as a product test method.
- Include the persistent regression test and the real-platform acceptance
  sequence required before declaring the issue resolved.

- [Structured drop dwell and dragged-card layering](structured-drop-dwell/README.md) — confirmed short-overlap combination and WebGPU ghost fixes.

- [Performance recording loses Stop](performance-record-stop-rail/README.md) — forced context refresh during recording.

- [Multiple-selection playback scope](selection-playback-scope/README.md) — full selection transport and active-leaf preview.

- [Live Mute canonical event](live-mute-canonical-event/README.md)

- [End-anchored List loses visible rows after scrub](project-list-virtual-window/README.md): retain the shared virtualizer window when consuming the end anchor.
