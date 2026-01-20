# Report: 403 Error When Playing Media Recorded from Fastify in Tauri

## 🔴 The Problem

### Symptom

Videos (and audio) recorded from the **Fastify browser** returned a **403 Forbidden** error when attempted to be played from **Tauri**.

### Root Cause

File desynchronization between the two environments:

1. **Fastify** (cloud/browser server) stores files under `/data/uploads/`
2. **Tauri** (desktop app) stores files locally under `data/recordings/`

When a file is recorded from Fastify, it does **not exist** in Tauri's local storage. The Tauri API `/api/recordings/:id` cannot find the file → **403 Forbidden**.

---

## 🔍 Playback Flow Architecture

```
record_video_UI.js
       ↓
   ensureMediaApi()
       ↓
   import audio_api.js  ← ⚠️ This is where the playback logic lives
       ↓
   window.record_audio_play(identifier)
       ↓
   Tauri: /api/recordings/:id
       ↓
   If file missing → 403
```

### ⚠️ Important Pitfall

- `record_video_UI.js` **does NOT use** `record_audio.js`
- It imports `../eVe/APIS/audio_api.js`
- The two files implement `play()` differently

---

## ✅ Fix Applied

### 1. Auto-detect recordings

```javascript
function looksLikeRecordingAtomeId(id) {
  return /^(audio_recording_|video_recording_)/.test(id);
}

const isRecording = entry.source === 'recording' || looksLikeRecordingAtomeId(identifier);
```

### 2. Fallback to Fastify when Tauri fails

```javascript
if (!res.ok && (res.status === 403 || res.status === 404)) {
  // Tauri doesn't have the file → try Fastify
  const downloadId = entry.file_name || entry.name || extractFilename(entry.file_path);
  const fastifyRes = await fetch(`http://localhost:3001/api/uploads/${downloadId}`);
  // ...
}
```

---

## 📋 Checklist for Future Media Types

If a **new media type** encounters the same problem:

### Step 1: Identify the playback file

Search which file actually performs the `fetch` to `/api/recordings/`:

```bash
grep -r "api/recordings" src/application/
```

### Step 2: Verify the ID pattern

If the new media has an ID pattern (e.g., `image_recording_*`, `document_*`), add it to the regex:

```javascript
function looksLikeRecordingAtomeId(id) {
  return /^(audio_recording_|video_recording_|NEW_TYPE_)/.test(id);
}
```

### Step 3: Verify Fastify fallback

Ensure fallback code exists and uses the correct endpoints:

- Tauri: `/api/recordings/:id`
- Fastify: `/api/uploads/:filename`

### Step 4: Update all relevant files

Apply changes to **ALL** files that may be used by UI components:

| File | Used by |
|------|---------|
| `src/application/examples/record_audio.js` | Examples, tests, direct usage |
| `src/application/eVe/APIS/audio_api.js` | `record_video_UI.js`, eVe components |
| `src/application/eVe/APIS/media_api_shared.js` | Shared sync utilities |
| `src/application/eVe/tool_utils/tool_genesis.js` | Atome media hydration |

---

## 🚨 Golden Rule

> **Always check imports before modifying a file.**
>
> A UI component may import its API from an unexpected path (for example, `../eVe/APIS/` instead of `../examples/`).

---

## 📁 Files Modified

1. `src/application/eVe/APIS/audio_api.js` ← **main fix**
2. `src/application/examples/record_audio.js` ← secondary fix
3. `src/application/eVe/APIS/media_api_shared.js` ← **sync functions added**
4. `src/application/eVe/tool_utils/tool_genesis.js` ← **hydration uses sync**

---

## ✅ Sync Solution (January 2026)

Added automatic Fastify → Tauri media synchronization:

### New Functions in `media_api_shared.js`

- **`syncMediaFromFastify(fileName)`**: Downloads media from Fastify `/api/uploads/` and saves to Tauri `/api/user-recordings`
- **`ensureMediaLocallyAvailable(identifier)`**: Checks local availability, syncs if needed, returns playable URL

### Flow

1. When media is requested in Tauri and returns 403/404
2. System downloads from Fastify server
3. File is saved locally via `/api/user-recordings`
4. Playback uses local file (works offline)
5. Background sync runs to ensure future offline access

---

## 📅 Resolution Date

January 20, 2026
