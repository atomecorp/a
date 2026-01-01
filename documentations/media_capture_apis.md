# Media Capture APIs (audio, video, camera, playback)

This document describes the JS APIs for audio/video capture, camera preview, media listing, and playback.
The goal is a single, coherent API for Tauri and browser runtimes.

Sources:
- src/application/examples/record_audio.js
- src/application/examples/record_audio_UI.js
- src/application/examples/record_video.js
- src/application/examples/record_video_UI.js

---

## Quick start

### Audio record

```js
const ctrl = await record_audio('mic_take.wav');
// ... later
const result = await ctrl.stop();
console.log(result);
```

### Video record

```js
const ctrl = await record_video('clip', null, { mode: 'video' });
// ... later
const result = await ctrl.stop();
console.log(result);
```

### Camera preview

```js
const preview = await camera({
  parent: '#view',
  id: 'cam1',
  width: 1280,
  height: 720,
  frameRate: 30,
  video: true,
  audio: false
});
// Stop preview
preview.stop();
```

### List + play media

```js
const list = await record_audio_list_media({ types: ['audio', 'video'] });
if (list.ok && list.files.length) {
  const playback = await record_audio_play(list.files[0]);
  // playback.url can be used in <audio> or <video>
}
```

---

## Runtime behavior (Tauri vs Browser)

### Tauri

- Recordings are stored under:
  - data/users/<user_id>/recordings
- ADOLE atomes are created for:
  - audio_recording
  - video_recording
- Playback for recordings uses:
  - GET /api/recordings/:id (requires local_auth_token)

### Browser

- Audio/WebMedia uploads go to Fastify:
  - POST /api/uploads
- ADOLE atomes are created for:
  - audio_recording
  - video_recording
- Playback for uploads uses:
  - GET /api/uploads/<file>

No disk fallback is used. All access is via atomes + server endpoints.

---

## API: record_audio

Signature:

```js
record_audio(filename, path?, options?)
```

Behavior:
- WebAudio path: captures mic, downsamples to 16k mono WAV, creates an atome.
- iPlug2 path: uses native engine (Tauri), creates an atome.

Options (WebAudio + iPlug2):
- backend: 'webaudio' | 'iplug2'
- source: 'mic' | 'plugin' (iplug2 only)

Return:

```js
{
  fileName,
  stop: async () => ({ success, local, duration_sec, sample_rate, channels, ... }),
  getStats: () => ({ inputSampleRate, totalFrames, fileName })
}
```

Notes:
- WebAudio quality is fixed to 16k mono for now.
- iPlug2 quality is managed by the native engine.

---

## API: record_video

Signature:

```js
record_video(filename, path?, options?)
```

Options:
- mode: 'video' | 'audio'
- width, height, frameRate: preferred capture size/FPS
- videoConstraints: full MediaTrackConstraints (overrides width/height)
- audio: boolean (default true in video mode)
- stream: MediaStream to reuse (ex: camera preview)
- keepStream: true keeps the stream running after stop()
- stopExternalStream: true forces stopping an external stream
- bitsPerSecond, videoBitsPerSecond, audioBitsPerSecond: MediaRecorder quality

Return:

```js
{
  stop: async () => ({ ok, atomeId, path, fileName, ... }),
  stream,
  recorder,
  mode,
  fileName
}
```

Errors:
- If video recording is not supported, an error is thrown.
- If the environment only returns audio output, an error is thrown.

---

## API: camera

Signature:

```js
camera(options?)
```

Options:
- parent: DOM element or selector for the preview container
- id: DOM id for the <video> element
- css: style for the preview element
- width, height, frameRate, facingMode
- constraints: full MediaStream constraints
- video: true/false
- audio: true/false
- muted, autoplay, playsInline

Return:

```js
{
  element,  // <video>
  stream,
  stop: () => void
}
```

---

## API: list media

Use either of these (same behavior):

```js
record_audio_list_media({ types: ['audio', 'video', 'image'] })
record_video_list_media({ types: ['audio', 'video'] })
```

Return:

```js
{ ok: true, files: [
  {
    id,
    name,
    file_name,
    file_path,
    owner_id,
    shared,
    kind,        // 'audio' | 'video' | 'image' | 'other'
    size,
    modified,
    created_at,
    mime_type,
    source,      // 'recording' | 'uploads'
    atome_type   // audio_recording | video_recording
  }
] }
```

---

## API: play media

Use either of these (same behavior):

```js
record_audio_play(entryOrId)
record_video_play(entryOrId)
```

Return:

```js
{ ok: true, url, name, mime, kind, revoke }
```

- For recordings on Tauri, playback is via /api/recordings/:id.
- For uploads (Fastify), playback is via /api/uploads/<file>.

Always call revoke() when you no longer need the URL.

---

## UI notes

- record_audio_UI.js and record_video_UI.js are UI-only.
- The video UI uses camera() for preview and reuses the preview stream for recording.
- Preview is draggable and resizable; position and size are stored in localStorage.

---

## Quality and size settings

### Video (MediaRecorder)

Use:
- width, height, frameRate
- videoBitsPerSecond, audioBitsPerSecond, bitsPerSecond
- videoConstraints for full control

Example:

```js
await record_video('clip', null, {
  mode: 'video',
  width: 1920,
  height: 1080,
  frameRate: 30,
  videoBitsPerSecond: 2_500_000
});
```

### Audio (WebAudio)

- WebAudio path is fixed to 16k mono for now.
- iPlug2 quality is configured in the native engine.

---

## Security

- No disk fallback is used.
- Access to recordings is protected by auth tokens:
  - local_auth_token for Tauri endpoints
  - auth_token / cloud_auth_token for Fastify uploads
- Playback only uses server endpoints, never direct disk access.

---

## Troubleshooting

- Video records audio only:
  - Check that mode is 'video'
  - If MediaRecorder does not support video on this platform, you will see an error
- No preview:
  - Check camera permissions
  - Ensure cameraEnabled is On in the UI
- Playback fails on Tauri:
  - Check local_auth_token
  - Ensure the recording atome exists (audio_recording/video_recording)
