# Prompt: Fix No Sound in Tauri Playback

You are working on the Atome/eVe multimedia timeline. Follow all rules defined in `./.codex/AGENTS.md` before analyzing, modifying, or reviewing code. These rules have priority over this prompt.

## Context

In Tauri native playback, audio scrubbing and video scrubbing work, but normal playback may fail to start or may start without audible sound.

Recent logs showed that the original audio inventory issue was related to missing native local paths for timeline audio clips. The scrub path can work while the play path still fails, because playback depends on a complete native audio session/manifest.

## Problem

The timeline may contain two related clips:

- a video clip;
- an audio companion clip generated from the same media.

The audio companion clip can lose the original file path and keep only a runtime preview URL. Native Tauri/Kira playback needs a real local file path, not only an HTTP preview source.

When the native audio session is built without a usable local path, the engine can fail with errors such as:

```text
native_audio_local_path_required
```

or it can prepare an incomplete native audio manifest.

## Important Observations

Do not assume that working scrub means playback is fixed.

Scrub can succeed because it may use a different preparation path, a cached buffer, or a one-shot seek path. Playback is stricter: it must build a full native audio session and start transport from that session.

A good diagnostic sign is:

```text
session_built native_audio_clips[].local_path
```

If this field contains a valid native path, the audio inventory problem is probably fixed. If playback still does not start after the audio engine returns `ok:true`, the remaining issue is likely a playback state transition problem, not the audio inventory problem.

## Required Fix Strategy

Respect `./.codex/AGENTS.md`:

- identify the root cause;
- fix the source of truth;
- do not add temporary workarounds;
- do not hide failures with defensive guards;
- do not add compatibility shims or fallback architectures;
- keep the solution deterministic and architecture-consistent;
- write all comments, logs, errors, and documentation in English.

The proper fix for the no-sound Tauri issue is to preserve and propagate the native local media path into the audio inventory:

1. When a video media clip is imported or restored, preserve its native local path.
2. When an audio companion clip is created from that video, copy the same native local path into the audio companion metadata.
3. During native audio inventory/session building, resolve the path from known local-path aliases such as `local_path`, `localPath`, `native_audio_path`, and `nativeAudioPath`.
4. Never replace the native local path with the runtime preview URL.
5. Before native playback, ensure every eligible native audio clip has a non-empty local path in the session.

## What Not To Do

Do not solve this by forcing visual-only playback.

Do not silence `native_audio_local_path_required`.

Do not make the audio engine accept HTTP preview URLs as if they were native local files.

Do not add logging-only code as a permanent fix.

Do not create a separate Tauri-only fallback path unless the architecture documentation explicitly requires it.

## Verification

After the root fix, verify:

- video scrub works;
- audio scrub works;
- Tauri native playback starts;
- web playback still starts;
- iOS playback still starts;
- the native audio session contains at least one audio clip when the timeline media has audio;
- `native_audio_clips[].local_path` is populated;
- no `native_audio_local_path_required` error appears during playback start.

If scrub works and `play_engine_result` is `ok:true`, but the UI remains in `playbackStartPending:true` and `isPlaying:false`, investigate the playback state transition separately. That is no longer the native audio inventory bug.
