# Imported Video Audio Does Not Replay

## Symptom

`atome/src/assets/videos/JeezsFire.mp4` plays image and audio the first time.
After natural completion, replaying the same imported Atome without a refresh
plays the image but not the audio. A newly imported instance works once, and a
full view refresh temporarily restores the first playback.

Recorded videos do not show the symptom because their recording path provides
an audio duration that cleans up the derived playback session.

## Canonical reproduction

1. Create or open one project through the product UI.
2. Import `atome/src/assets/videos/JeezsFire.mp4` through the canonical Import
   tool and select the created video Atome.
3. Start playback from the main Play tool and let the video complete.
4. Start playback again without refreshing. The expected result is image and
   audio both restart.
5. Import the same file as a second Atome in the same project. Repeat the two
   complete playbacks for that second instance.
6. Refresh, repeat the sequence, and verify project isolation when testing
   across multiple projects.

Do not reproduce this issue by invoking the media runtime directly. Use real
canvas interactions and the file picker.

## Confirmed cause

The main `ui.play` composition previously invoked the animation reader before
the media reader for a selected video. Both readers routed video transport to
the Bevy decoder. The first invocation restarted the decoder before the media
reader could observe the natural completion of the associated audio session.

For imported videos without a persisted duration, that derived session stayed
marked as playing. The media reader then treated the second press as an
already-active session rather than loading and starting its audio again. A
refresh clears this runtime-only state, which explains the temporary recovery.

## Ownership and correction

- `eVe/intuition/runtime/eve_intuition/media_reader_tool_runtime.js` owns the
  `ui.play` composition. It must route a video first through the media reader;
  the animation reader is only a fallback when no media reader handled the
  selection.
- `eVe/domains/media/selected_project_media_playback_runtime.js` owns the
  derived video-audio playback session. Before a timeline restart, it releases
  a session whose decoder has naturally completed, then starts the canonical
  audio path again.
- Audio voices use one stable voice id per media Atome. Do not create a new
  voice id on every replay: native and WASM Kira keep voice entries, so unique
  replay ids retain completed voices and worsen memory use.

The correction deliberately does not force a global reload, re-decode, cache
clear, DOM media player, or parallel renderer. Those approaches hide the
session-order defect and add latency or allocation pressure.

## Regression coverage

Run:

```sh
npx vitest run tests/eve/selected_project_media_playback_runtime.test.mjs tests/eve/bevy_project_renderer_guards.test.mjs
```

The coverage verifies two imported instances of `JeezsFire.mp4`, two playbacks
per instance, completion cleanup before the decoder restart, stable voice ids,
and exactly one decoder start per user playback.

## Required platform acceptance

Repeat the canonical reproduction on Web, Tauri Debug, and iOS Debug. For each
instance, prove audio start, time progression, natural completion, and audible
second playback. Capture console/native errors and preserve a screenshot or
recording of the two successful UI playbacks. Do not mark the issue resolved on
one platform only.
