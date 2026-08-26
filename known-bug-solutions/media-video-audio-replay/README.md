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

Two additional guards are required for historical WhatsApp imports and List
playback:

- missing `has_audio`/`audio_track_count` metadata is not proof of a silent
  video. Only an explicit false/zero value may select visual-only playback;
  otherwise extracted audio is mandatory and a Kira failure rolls the paired
  start back;
- the Web Kira URL loader must return the positive duration reported by
  `audio_load_clip_from_bytes`. Dropping that value leaves durationless audio
  active in the project queue, so List never advances to the following
  Molecule or video even though the waveform and Kira voice started.

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

For the recurring WhatsApp AAC case, run the visible browser guard with the
exact source file instead of substituting another MP4:

```sh
MOLECULE_UI_DROP_ONLY=1 \
MOLECULE_UI_LAYERED_MEDIA_ONLY=1 \
MOLECULE_UI_SKIP_COLD=1 \
MOLECULE_UI_LAYERED_STANDALONE_ONLY=1 \
MOLECULE_UI_LAYERED_NATURAL_REPLAY=1 \
MOLECULE_UI_VIDEO_FIXTURE="./atome/src/assets/videos/WhatsApp Video 2026-04-28 at 21.27.38.mp4" \
MOLECULE_UI_REPORT_TAG=whatsapp_natural_replay \
npm run test:molecule:ui
```

This path must import through the real file chooser, reach the natural end at
`23.953144 s`, restart Kira and the muted visual decoder on the second Play,
and remain active for at least five seconds after replay. Inspect the imported
video and extracted `.m4a` with `ffprobe`/`volumedetect`; an active playback id
without a decoded non-silent source is not sufficient audio evidence. If this
exact guard is green, do not recreate the historical fix on hypothesis: next
reproduce the user's persisted Atome and inspect its protected media owner,
extraction response and actual output route.

For the historical account regression, the visible project-3 List must also be
run from its container `Lecture` action. The expected natural sequence is the
first audio (`4.765333333 s` decoded by Kira), the video-plus-text Molecule
(`3.626 s` transport, one extracted-video voice), then the WhatsApp video
(`23.936 s` decoded audio). Each transition must move the visible row selection;
the WhatsApp frame must still progress after five seconds.

## Required platform acceptance

Repeat the canonical reproduction on Web, Tauri Debug, and iOS Debug. For each
instance, prove audio start, time progression, natural completion, and audible
second playback. Capture console/native errors and preserve a screenshot or
recording of the two successful UI playbacks. Do not mark the issue resolved on
one platform only.
