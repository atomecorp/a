# mTrack — Pure audio recording produces a few-frames clip in native runtime (Tauri / iOS)

## Symptom

After recording audio only (no video) in a molecule's mtrack timeline in native
mode (Tauri macOS, iOS), the resulting clip is only a few frames long when the
molecule is reopened. The recorded audio exists on disk and is intact; the problem
is the duration stored in the timeline.

- Video recordings (which include both an audio and a video track) work correctly.
- Browser mode works correctly.
- The regression is specific to **pure audio recordings in strict native runtime**.

---

## Affected file

`eVe/domains/mtrax/media/element_runtime.js`
(factory `createMediaElementRuntime`)

---

## Root cause — two broken code paths

### Path A — Recording phase (`createMediaElement`)

When a recording ends, `persistRecorderResultsToTracks` calls
`addClipFromEntry(entry, ...)` which calls `createMediaElement`.

For `mediaKind === 'audio'`, `createMediaElement` calls
`resolveNativeAudioDuration(sourceResult.playbackSource, 8)`.

In strict native runtime that function **throws immediately** with
`'audio_metadata_native_kira_required'` — the WebAudio decode path is
intentionally blocked because Kira handles playback natively.

The catch block returned:

```js
// BROKEN — before the fix
return {
    media: null,
    duration: 0,
    resolvedSource: '',    // ← empty string
    playbackSource: '',
    release: () => {}
};
```

`addClipFromEntry` checks `if (!mediaPayload?.resolvedSource ...)` and returns
`null` when `resolvedSource` is empty. This means **no clip was created at all**
during the native recording session, or was created with duration 0.

### Path B — Molecule open / reload phase (`createMediaElementFromDescriptor`)

When the molecule is reopened, `loadTimelineDescriptors` calls
`createMediaElementFromDescriptor` for each persisted clip.

The `isStrictNativeRuntime()` early-return block computed:

```js
const nativeDuration = Math.max(mtrackMinClipDuration, defaultDuration);
```

For audio clips stored with `sourceDuration = 0` and `auto_duration = true`
(which is the case for all auto-detected recordings), `defaultDuration` is 0 and
`nativeDuration` collapses to `mtrackMinClipDuration` — a few milliseconds (0.06 s).

The existing guard inside that block only covered `video_audio` clips:

```js
// Existing guard — video_audio only, did NOT cover pure audio recordings
if (isVideoAudioDescriptor && nativeDuration <= mtrackMinClipDuration) {
    // probeVideoSourceDuration(...)
}
```

For pure audio recordings `isVideoAudioDescriptor` is `false` (the descriptor
has no `audio_source_role = 'video_audio'`), so the guard was skipped and the
function returned `mtrackMinClipDuration` as the duration → "a few frames" bug.

### Why video recordings work

Video recordings produce a clip with `kind = 'video'` for the video track and a
`kind = 'audio'` clip with `audio_source_role = 'video_audio'` for the audio
track. The `isVideoAudioDescriptor` guard was already in place for that case.

### Why browser mode works

`isStrictNativeRuntime()` returns `false` in browsers, so both paths fall through
to `resolveNativeAudioDuration` which fetches the file and uses `decodeAudioData`
(WebAudio API) to read the real duration.

---

## Detection

Enable mtrack logging in the debug console:

```js
window.__DEBUG__?.setLogCategory?.('playback_video_flow', true);
```

**During recording (Path A regression active):**
Look for `'upload audio duration resolve failed'` immediately followed by the
function returning an empty `resolvedSource`. In the timeline state, no audio
clip will be created:

```js
window.__DEBUG__?.getTimelineState?.();
// Expected after recording: clips array contains new audio clip
// Broken: no new clip, or clip with duration ≈ 0
```

**After reopening the molecule (Path B regression active):**
Look for:

```
stage: 'descriptor:audio_native_payload'
duration: <number close to mtrackMinClipDuration (0.06)>
source_role: null
```

If `duration` is tiny (< 0.1 s) for a clip that should be several seconds, the
regression is active. The correct log stage after the fix is:

```
stage: 'descriptor:audio_native_audio_probed_payload'
probed_from_audio_element: true
duration: <real duration in seconds>
```

---

## Fix

Three changes were made to `element_runtime.js` inside `createMediaElementRuntime`.

### 1 — Add `probeAudioSourceDuration` helper

Added immediately after the existing `probeVideoSourceDuration` function.
Creates a temporary `<audio>` element, sets `crossOrigin` before assigning `src`
(required in Tauri where the page origin `tauri://localhost` differs from the
Axum server at `http://127.0.0.1:PORT`), waits for `loadedmetadata`, then reads
`element.duration`. A 2-second timeout guards against sources that never fire.

```js
const probeAudioSourceDuration = async (playbackSource = '') => {
    const source = String(playbackSource || '').trim();
    if (!source || typeof document === 'undefined') return Number.NaN;
    const probe = document.createElement('audio');
    probe.preload = 'metadata';
    probe.controls = false;
    probe.muted = true;
    probe.autoplay = false;
    if (typeof applyCrossOriginForSource === 'function') {
        applyCrossOriginForSource(probe, source);
    }
    probe.src = source;
    const probedDuration = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => { if (settled) return; settled = true; resolve(value); };
        probe.addEventListener('loadedmetadata', () => {
            const dur = Number(probe.duration);
            finish(Number.isFinite(dur) && dur > 0 ? dur : Number.NaN);
        }, { once: true });
        probe.addEventListener('error', () => finish(Number.NaN), { once: true });
        setTimeout(() => { if (!settled) finish(Number.NaN); }, 2000);
    });
    try { probe.pause(); probe.removeAttribute('src'); probe.load(); probe.remove(); } catch (_) { }
    return probedDuration;
};
```

### 2 — Fix `createMediaElement` audio catch block (Path A — recording phase)

Instead of returning `{ resolvedSource: '' }` when `resolveNativeAudioDuration`
throws in strict native mode, probe the duration via `probeAudioSourceDuration`
so the clip IS created with a valid `resolvedSource`.

`applyRecordedClipDuration` (called by `persistRecorderResultsToTracks` after
`addClipFromEntry`) will overwrite the duration with the accurate wall-clock
recording length, so the probed duration here is only a safe fallback.

```js
// Inside createMediaElement, audio catch block
if (isStrictNativeRuntime()) {
    const probedDuration = await probeAudioSourceDuration(
        String(sourceResult.playbackSource || sourceResult.stableSource || stableUploadedSrc || '').trim()
    );
    duration = (Number.isFinite(probedDuration) && probedDuration > mtrackMinClipDuration)
        ? probedDuration
        : mtrackMinClipDuration;
    // log stage: 'create_media_element:audio_native_probed'
} else {
    // Non-native failure — original behaviour preserved
    if (typeof sourceResult.revoke === 'function') { sourceResult.revoke(); }
    return { media: null, duration: 0, resolvedSource: '', playbackSource: '', release: () => {} };
}
// Falls through to the normal return with a valid resolvedSource
```

### 3 — Add pure-audio guard in `createMediaElementFromDescriptor` (Path B — reload)

Mirrors the existing `isVideoAudioDescriptor` guard but for pure audio clips,
placed immediately after the `video_audio` guard block:

```js
// For pure audio recordings with no stored duration (auto-duration import),
// probe the audio source via a temporary <audio> element to get the real duration.
if (!isVideoAudioDescriptor && nativeDuration <= mtrackMinClipDuration) {
    const probedDuration = await probeAudioSourceDuration(
        String(sourceResult.playbackSource || audioRuntimePlaybackSource || '').trim()
    );
    const resolvedDuration = (Number.isFinite(probedDuration) && probedDuration > mtrackMinClipDuration)
        ? probedDuration
        : mtrackMinClipDuration;
    // log stage: 'descriptor:audio_native_audio_probed_payload'
    return {
        media: null,
        duration: resolvedDuration,
        resolvedSource: String(descriptorCanonicalSource || sourceResult.stableSource || descriptorPlaybackSource),
        playbackSource: audioRuntimePlaybackSource,
        // ...
    };
}
```

---

## Key facts to remember

| Fact | Detail |
|---|---|
| `isStrictNativeKiraPlaybackRuntime` | Defined in `atome/src/application/audio_runtime/runtime_audio_backend.js`. Includes `isTauriAudioRuntime` — this makes Tauri "strict native". |
| `mtrackMinClipDuration` | `0.06` s. Minimum clip length **and** sentinel meaning "duration unknown". |
| `auto_duration = true` | Set by `import_media_timeline.js` when no explicit duration is known at import time. Stored in clip extras. |
| `resolveNativeAudioDuration` | Throws `audio_metadata_native_kira_required` in strict native mode. Cannot be used to probe duration. |
| `isVideoAudioDescriptor` | `true` when `descriptor.audio_source_role === 'video_audio'`. Pure audio recordings have no `audio_source_role` → `false`. |
| `probeVideoSourceDuration` | Pre-existing helper for `video_audio` clips. The new `probeAudioSourceDuration` is its mirror for pure audio. |
| `addClipFromEntry` | Checks `if (!mediaPayload?.resolvedSource ...)` — returns `null` (no clip) when `resolvedSource` is empty. |
| `applyRecordedClipDuration` | Called after `addClipFromEntry` by `persistRecorderResultsToTracks`. Overwrites clip duration with real wall-clock recording length. |

---

## Relation to the previous regression fix

The previous fix (documented in `MTRACK_AUDIO_DURATION_NATIVE_REGRESSION.md`)
addressed `video_audio` clips — audio extracted from a video source. That fix
added `probeVideoSourceDuration` and the `isVideoAudioDescriptor` guard.

The current regression has the same root cause (missing duration probe for native
mode) but affects **pure audio recordings** where `isVideoAudioDescriptor` is
always `false`. The fix follows the exact same pattern but uses an `<audio>`
element instead of `<video>`.

If a similar regression appears for another clip kind, check whether the
`isStrictNativeRuntime()` early-return block in `createMediaElementFromDescriptor`
is returning `mtrackMinClipDuration` for that kind when `defaultDuration` is 0.
The fix pattern is always: add a guard `nativeDuration <= mtrackMinClipDuration`
and probe the real duration via the appropriate HTML5 media element.
