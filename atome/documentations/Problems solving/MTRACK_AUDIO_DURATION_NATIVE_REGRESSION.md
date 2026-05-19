# mTrack — Audio track duration wrong in native runtime (Tauri / iOS)

## Symptom

After importing a video into a molecule's mtrack timeline, the audio track shows
only a few frames of duration in native mode (Tauri macOS, iOS). During playback
the audio loops over those few frames for the entire length of the video instead
of playing the full audio stream.

The web/browser path works correctly: the audio track shows the same duration as
the video track.

## Affected file

`eVe/domains/mtrax/media/element_runtime.js`

---

## Root cause

`createMediaElementFromDescriptor` contains an early-return branch for
`mediaKind === 'audio'` when `isStrictNativeRuntime()` returns `true`.

That branch returns:

```js
duration: Math.max(mtrackMinClipDuration, defaultDuration)
```

For videos imported without an explicit duration (the "auto-duration" import
flow), clips are created with `sourceDuration = 0` and `auto_duration = true`.
At load time `defaultDuration` is therefore `0`, so the audio clip receives
`mtrackMinClipDuration` (a few milliseconds) as its duration instead of the
actual video duration.

### Why the browser works

In browser mode `isStrictNativeRuntime()` returns `false`, so the code calls
`resolveNativeAudioDuration(sourceResult.playbackSource, defaultDuration)` which
fetches the file and uses `decodeAudioData` (WebAudio API) to determine the real
duration.

In strict native mode `resolveNativeAudioDuration` throws
`audio_metadata_native_kira_required` immediately — the WebAudio decode path is
intentionally blocked because Kira handles playback natively.

### Why it became a regression

The early-return block was added when `isTauriAudioRuntime` was included in
`isStrictNativeKiraPlaybackRuntime` (see
`src/application/audio_runtime/runtime_audio_backend.js`). Before that change,
Tauri fell through to `resolveNativeAudioDuration` just like the browser.

The old iOS platform build
(`platforms/ios/atome-auv3/build/.../element_runtime.js`) confirms the previous
behaviour: no `isStrictNativeRuntime()` early-return existed in the audio branch.

---

## Detection

When the regression appears, enable mtrack logging:

```js
// In Tauri / iOS debug console
window.__DEBUG__?.setLogCategory?.('playback_video_flow', true);
```

Then import a video. Look for the log event:

```
stage: 'descriptor:audio_native_payload'
duration: <very small number close to mtrackMinClipDuration>
```

If `duration` is tiny (< 0.1 s) for a clip that should be several seconds, the
regression is active.

---

## Fix

Two changes were made to `element_runtime.js`, both inside the factory
`createMediaElementRuntime`.

### 1 — `probeVideoSourceDuration` helper (added before `readFiniteVideoDuration`)

A new async function that creates a temporary `<video>` element, loads the source
with the correct `crossOrigin` attribute (required in Tauri where the page origin
`tauri://localhost` differs from the Axum server at `http://127.0.0.1:PORT`),
waits for the `loadedmetadata` event, reads the duration via
`resolveFiniteVideoDuration`, then disposes the element.

A 2-second timeout guards against sources that never fire metadata events.

```js
const probeVideoSourceDuration = async (playbackSource = '') => {
    const source = String(playbackSource || '').trim();
    if (!source || typeof document === 'undefined') return Number.NaN;
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.controls = false;
    probe.playsInline = true;
    probe.muted = true;
    probe.autoplay = false;
    // crossOrigin must be set before src in Tauri (cross-origin Axum server)
    if (typeof applyCrossOriginForSource === 'function') {
        applyCrossOriginForSource(probe, source);
    }
    probe.src = source;
    const probedDuration = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => { if (settled) return; settled = true; resolve(value); };
        probe.addEventListener('loadedmetadata', () => {
            void resolveFiniteVideoDuration(probe, 0).then(finish).catch(() => finish(Number.NaN));
        }, { once: true });
        probe.addEventListener('error', () => finish(Number.NaN), { once: true });
        setTimeout(() => { if (!settled) finish(Number.NaN); }, 2000);
    });
    try { probe.pause(); probe.removeAttribute('src'); probe.load(); probe.remove(); } catch (_) { }
    return probedDuration;
};
```

### 2 — Modified early-return for `video_audio` clips with unknown duration

Inside the `if (mediaKind === 'audio') { if (isStrictNativeRuntime()) {` block,
before returning `nativeDuration`, an additional guard was added:

```js
if (isVideoAudioDescriptor && nativeDuration <= mtrackMinClipDuration) {
    const probedDuration = await probeVideoSourceDuration(
        String(sourceResult.playbackSource || audioRuntimePlaybackSource || '').trim()
    );
    const resolvedDuration = (Number.isFinite(probedDuration) && probedDuration > mtrackMinClipDuration)
        ? probedDuration
        : mtrackMinClipDuration;
    // ... log + return resolvedDuration
}
```

`isVideoAudioDescriptor` is true when the clip is the audio track extracted from
a video file (descriptor has `kind === 'video_audio'` or equivalent).
`nativeDuration <= mtrackMinClipDuration` means no stored duration was available
(auto-duration import).

When these two conditions are met, the video element probe is used to retrieve
the real duration before returning. The clip then gets the correct duration and
playback does not loop.

---

## Key facts to remember

| Fact | Detail |
|---|---|
| `isStrictNativeKiraPlaybackRuntime` | Defined in `src/application/audio_runtime/runtime_audio_backend.js`. Includes `isTauriAudioRuntime` — this makes Tauri "strict native". |
| `mtrackMinClipDuration` | A few milliseconds. Used as the minimum clip length. Also the sentinel that means "duration unknown". |
| `auto_duration = true` | Set by `import_media_timeline.js` when no explicit duration is known at import time. |
| `resolveNativeAudioDuration` | Throws `audio_metadata_native_kira_required` in strict native mode — cannot be used to probe duration. |
| `applyCrossOriginForSource` | Must be called on the probe `<video>` before setting `src` in Tauri, otherwise WebKit may block metadata loading across origins. |
| `resolveFiniteVideoDuration` | Async helper that reads `element.duration` and falls back to a seekable range probe. Safe to call after `loadedmetadata`. |

---

## Where to look if the probe times out

If `probeVideoSourceDuration` returns `NaN` (timeout), check:

1. `sourceResult.playbackSource` is a valid authenticated URL (has `?token=`).
2. `applyCrossOriginForSource` correctly sets `crossOrigin = 'anonymous'` for
   the Tauri Axum origin.
3. The Axum server includes `tauri://localhost` in its CORS allowed origins
   (see `shouldUseAnonymousCors` in
   `eVe/domains/mtrax/media/authorized_playback_runtime.js`).
4. The timeout (2000 ms) is sufficient for the local Axum server to respond.
   Increase it if the device is slow.
