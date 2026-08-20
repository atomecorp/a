# Project View List and Media Regressions

## Symptoms

- A List footer Delete click reports `tool_handler_missing_v2`.
- Sequential playback stops before items outside the currently loaded List or
  Matrix page, including the final item.
- The first audio waveform advances, while subsequent projected waveforms stay
  static.
- A recorded video with a confirmed audio track can show moving video while
  eVe playback has no audio.

## Confirmed ownership and correction

- `atome_edit_footer_definition_invocation_runtime.js` invokes the unified
  Delete action. It must await the canonical lazy Delete module first; the
  module remains the sole registrar of `ui.delete.selection`.
- `project_view_records.js` owns canonical paged reads. Playback uses its own
  private page state and the existing navigation resolver, so it reads the
  complete current container without moving the user-visible List or Matrix.
- `project_scene_invalidation_runtime.js` owns playback mirror indexes. Direct
  prefix reconciliation explicitly invalidates the derived index after it
  replaces projected records in place.
- `selected_project_media_playback_runtime.js` resolves a durable recorded
  video source from final file properties. Browser playback keeps owner identity
  on the extraction URL; native Kira retains the canonical local path. Required
  audio is loaded before the video timeline starts. The active state is only
  published after the video and its Kira voice both start; either failure rolls
  back the paired transport before the List queue can remove its Visualizer or
  advance.
- Preserve the established replay correction in
  [`media-video-audio-replay`](../media-video-audio-replay/README.md): the media
  reader owns paired video/audio playback, runs before the animation reader,
  clears completed sessions, and reuses one stable voice id per media Atome.
- `project_view_playback_runtime.js` defensively awaits the canonical stop for
  every refused media start while its projected playback id is still visible.
  An `AbortError` is silent only when it belongs to that intentional decoder
  cancellation; an active decoder refusal remains reported.

## Regression coverage

Run:

```sh
npx vitest run \
  tests/eve/atome_edit_footer_delete_cold_start.test.mjs \
  tests/eve/project_view_playback_regressions.test.mjs \
  tests/eve/selected_project_media_playback_runtime.test.mjs
```

The tests cover cold Delete registration, a 201-item playback scope, terminal
queue state, A-to-B-to-C mirror replacement, durable video extraction source,
required-audio preload failure, voice-start rollback, queue ordering, and
intentional decoder cancellation.

## Required platform acceptance

Follow `.codex/visual-test-protocol.md` on Web, Tauri Debug, and a physical
iPhone. Record a List Delete click, a multi-page sequential queue, two audio
items with advancing waveforms, and a recorded video with audible replay. Do
not report cross-platform acceptance from unit coverage alone.
