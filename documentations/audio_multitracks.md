# Atome Audio – Multitrack MVP Usage & Specs

This document shows how to use the audio APIs defined in the **Atome Audio MVP – Unified Plan** to implement a minimal but real **multitrack (multipiste) direct-to-disk** workflow:

* Non-destructive / virtual clips only (no audio file rewrite).
* Place/move audio clips on a timeline.
* Trim / roll edits.
* Split / join clips.
* Basic multitrack transport.

Everything is based on ADOLE objects from the main spec: `AudioFileAtome`, `AudioClipAtome`, `TimelineAtome`, etc.

---

## 1. Core objects recap (from main audio spec)

We reuse the following logical types:

```ts
// Physical audio file (blob on disk) – ADOLE object
interface AudioFileAtome {
  id: string;
  user_id: string;
  project_ids?: string[];
  content_hash: string;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  duration: number; // seconds
  container: 'wav';
  source: 'recording' | 'import' | 'generated';
  local_path: string; // data/users/<user_id>/media/audio/...
  created_at: string;
  updated_at: string;
}

// Clip placed on a timeline – purely virtual view
interface AudioClipAtome {
  id: string;
  project_id: string;
  timeline_id: string;
  audio_file_id: string;

  // Time & placement
  record_position: number; // project time when recorded (optional for imports)
  play_position: number;   // timeline position (seconds or beats)
  start_offset: number;    // inside file (seconds or beats depending on timebase)
  end_offset: number;

  // Group / track association
  group_id: string | null; // track ID / logical group

  // Playback params
  stretch_ratio: number;   // 1.0 = normal
  pitch_shift: number;     // semitones
  stretch_algo: 'bungee' | 'none';
  gain: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

interface TempoSegment {
  start_position: number;
  bpm: number;
  time_signature: string; // e.g. "4/4"
}

interface TimelineFollowAction { /* omitted here, not needed for basic MVP */ }

interface TimelineAtome {
  id: string;
  project_id: string;
  name: string;
  type: 'audio' | 'actions' | 'mixed';
  timebase: 'seconds' | 'beats';
  clips: string[];             // AudioClipAtome IDs (MVP: audio-only)
  tempo_segments: TempoSegment[];
  follow_actions: TimelineFollowAction[];
}
```

Engine interface (from main spec):

```ts
export interface AudioEngine {
  init(context?: AudioContextLike): Promise<void>;

  // Clips and assets
  loadClip(clip: AudioClipAtome, file: AudioFileAtome): Promise<void>;
  updateClip(clip: AudioClipAtome): Promise<void>;
  removeClip(clipId: string): Promise<void>;

  // Timelines / transport
  playTimeline(timelineId: string, options?: any): Promise<void>;
  stopTimeline(timelineId: string): Promise<void>;
  seekTimeline(
    timelineId: string,
    position: number | { type: 'time' | 'marker'; value: any }
  ): Promise<void>;
}
```

For this MVP we only need `loadClip`, `updateClip`, `removeClip`, `playTimeline`, `stopTimeline`, `seekTimeline`.

---

## 2. Multitrack MVP – Functional Scope

Minimal features we support:

1. **Create a project and an audio timeline**.
2. **Import or record audio** → create `AudioFileAtome`.
3. **Create clips from audio files** and place them on a timeline (with `group_id` = track).
4. **Move clips** in time and from one track/group to another.
5. **Trim and roll** clips (non-destructive):

   * Trim-in / Trim-out.
   * Roll edit (move `play_position` and offsets together).
6. **Split and join clips** while keeping non-destructive offsets.
7. **Basic transport**: play, stop, seek.

Everything must be **non-destructive**:

* Never rewrite the WAV.
* Only change `play_position`, `start_offset`, `end_offset`, `group_id`, etc.

Optional (nice to have in MVP, but not mandatory):

* Per-clip `gain` and `pan`.
* Per-track/group `muted` / `solo`.
* Simple snap to grid (tempo-based if `timebase = 'beats'`).

---

## 3. Tracks as groups – simple model

We don’t need a real `TrackAtome` yet; we can model tracks via `group_id`:

* Each **track** is just a logical `group_id` string, e.g.:

  * `"track_1"`, `"track_2"`, etc.
* UI can maintain a dictionary:

```ts
interface TrackInfo {
  id: string;        // group_id
  name: string;      // "Guitar L", "Guitar R", "Vocal", ...
  color?: string;    // for UI only
}

type TrackMap = Record<string, TrackInfo>;
```

* All `AudioClipAtome` with same `group_id` are rendered on the same visual row.

Later, if needed, we can introduce a real `TrackAtome` without breaking clips.

---

## 4. Example: simple usage flow (pseudo-code)

### 4.1 Create project + timeline

```ts
// 1. Create project (ADOLE layer, pseudo-code)
const project = await atome.objects.create({
  kind: 'ProjectAtome',
  props: {
    name: 'My First Multitrack Session',
  },
});

// 2. Create an audio timeline for this project
const timeline = await atome.objects.create({
  kind: 'TimelineAtome',
  props: {
    project_id: project.id,
    name: 'Main Audio Timeline',
    type: 'audio',
    timebase: 'seconds', // simpler for MVP
    clips: [],
    tempo_segments: [
      { start_position: 0, bpm: 120, time_signature: '4/4' },
    ],
    follow_actions: [],
  },
});
```

### 4.2 Import or record an audio file

#### Import (drag & drop WAV)

```ts
// Import a WAV and compute content_hash, duration, etc. (handled by backend service)
const fileMeta = await audioImportService.importLocalWav(
  userId,
  project.id,
  droppedFile,
);

const audioFile = await atome.objects.create<AudioFileAtome>({
  kind: 'AudioFileAtome',
  props: {
    user_id: userId,
    project_ids: [project.id],
    content_hash: fileMeta.contentHash,
    sample_rate: fileMeta.sampleRate,
    bit_depth: fileMeta.bitDepth,
    channels: fileMeta.channels,
    duration: fileMeta.duration,
    container: 'wav',
    source: 'import',
    local_path: fileMeta.localPath, // data/users/<user_id>/media/audio/imports/...
  },
});
```

#### Record (Tauri + iPlug2 or WebAudio fallback)

```ts
// Start record from selected track/bus
const recordSpec = {
  timeline_id: timeline.id,
  source_node_id: 'input_guitar_1',
  channels_mode: 'mono',
  bit_depth: 24,
  sample_rate: 48000, // or session rate
};

const { record_session_id } = await atome.services.audioEngine.startRecord(
  recordSpec,
);

// ... user plays, then stops recording

const recordResult = await atome.services.audioEngine.stopRecord(
  record_session_id,
);

// recordResult example:
// {
//   audio_file_id: 'af_123', // ADOLE object created by backend service
//   duration: 12.345,
//   content_hash: 'sha256:...',
//   path: 'data/users/<user_id>/media/audio/recordings/<hash>.wav',
//   latency_ms: 4.2,
//   latency_compensated_play_position: 8.000
// }

const audioFile = await atome.objects.get<AudioFileAtome>(recordResult.audio_file_id);
```

---

## 5. Create clips on a timeline

### 5.1 Create an initial clip (placing the file on a track)

```ts
const trackId = 'track_1';
const startPos = 0; // seconds on timeline

const clip = await atome.objects.create<AudioClipAtome>({
  kind: 'AudioClipAtome',
  props: {
    project_id: project.id,
    timeline_id: timeline.id,
    audio_file_id: audioFile.id,

    record_position: recordResult?.latency_compensated_play_position ?? 0,
    play_position: startPos,
    start_offset: 0,
    end_offset: audioFile.duration,

    group_id: trackId,

    stretch_ratio: 1.0,
    pitch_shift: 0,
    stretch_algo: 'none',
    gain: 0,
    pan: 0,
    muted: false,
    solo: false,
  },
});

// Update timeline.clips
await atome.objects.update<TimelineAtome>(timeline.id, {
  clips: [...timeline.clips, clip.id],
});

// Load clip into engine
await atome.services.audioEngine.loadClip(clip, audioFile);
```

---

## 6. Timeline operations – non-destructive edits

All operations below modify **only** `AudioClipAtome` properties + timeline `clips` ordering.
The WAV files remain untouched.

### 6.1 Move clip (drag & drop)

**Behavior:**

* Move clip in time: update `play_position`.
* Optional: move clip to another track: update `group_id`.

```ts
async function moveClip(clipId: string, newPosition: number, newGroupId?: string) {
  const clip = await atome.objects.get<AudioClipAtome>(clipId);

  const updated: Partial<AudioClipAtome> = {
    play_position: newPosition,
  };

  if (newGroupId) {
    updated.group_id = newGroupId;
  }

  const newClip = await atome.objects.update<AudioClipAtome>(clipId, updated);

  // Notify engine
  await atome.services.audioEngine.updateClip(newClip);
}
```

### 6.2 Trim-in / Trim-out

**Trim-in (left edge)**: move `start_offset` forward and adjust `play_position` if you want a “slip” vs “roll” behavior.

For the MVP we can define two explicit modes:

* **Trim-in (fixed start)**: only change `start_offset`.
* **Roll-in (clip sticks to content)**: change both `start_offset` and `play_position`.

#### Trim-in (fixed clip position)

```ts
async function trimIn(clipId: string, newStartOffset: number) {
  const clip = await atome.objects.get<AudioClipAtome>(clipId);

  const bounded = Math.max(0, Math.min(newStartOffset, clip.end_offset));

  const newClip = await atome.objects.update<AudioClipAtome>(clipId, {
    start_offset: bounded,
  });

  await atome.services.audioEngine.updateClip(newClip);
}
```

#### Trim-out (right edge)

```ts
async function trimOut(clipId: string, newEndOffset: number) {
  const clip = await atome.objects.get<AudioClipAtome>(clipId);

  const bounded = Math.max(clip.start_offset, newEndOffset);
  const duration = bounded - clip.start_offset;

  // Optionally clamp to audioFile.duration (fetch it if not already known)

  const newClip = await atome.objects.update<AudioClipAtome>(clipId, {
    end_offset: bounded,
  });

  await atome.services.audioEngine.updateClip(newClip);
}
```

### 6.3 Roll edit (slip content under fixed region)

**Roll**: move the content relative to the timeline window.
For a simple roll to the right:

* `play_position` stays fixed.
* `start_offset` and `end_offset` shift together by `delta`.

```ts
async function rollClip(clipId: string, delta: number) {
  const clip = await atome.objects.get<AudioClipAtome>(clipId);

  let newStart = clip.start_offset + delta;
  let newEnd = clip.end_offset + delta;

  // Clamp to file bounds (requires audioFile.duration)
  const audioFile = await atome.objects.get<AudioFileAtome>(clip.audio_file_id);

  const maxShiftRight = audioFile.duration - (clip.end_offset - clip.start_offset);
  const maxShiftLeft = 0;

  if (newStart < maxShiftLeft) {
    const correction = maxShiftLeft - newStart;
    newStart += correction;
    newEnd += correction;
  }

  if (newEnd > audioFile.duration) {
    const correction = audioFile.duration - newEnd;
    newStart += correction;
    newEnd += correction;
  }

  const newClip = await atome.objects.update<AudioClipAtome>(clipId, {
    start_offset: newStart,
    end_offset: newEnd,
  });

  await atome.services.audioEngine.updateClip(newClip);
}
```

---

## 7. Split and Join (non-destructive)

### 7.1 Split clip

**Goal:** at a given timeline position `splitPos`, cut one `AudioClipAtome` into two, without touching the WAV.

Steps:

1. Compute `offsetAtSplit = clip.start_offset + (splitPos - clip.play_position)`.
2. Create **Clip A**:

   * same `play_position` as original,
   * `start_offset = original.start_offset`,
   * `end_offset = offsetAtSplit`.
3. Create **Clip B**:

   * `play_position = splitPos`,
   * `start_offset = offsetAtSplit`,
   * `end_offset = original.end_offset`.
4. Replace original clip ID in `TimelineAtome.clips` by `[A.id, B.id]` in the correct order.

```ts
async function splitClip(clipId: string, splitPos: number) {
  const clip = await atome.objects.get<AudioClipAtome>(clipId);

  // Only split if inside the clip region
  if (splitPos <= clip.play_position || splitPos >= clip.play_position + (clip.end_offset - clip.start_offset)) {
    return; // no-op
  }

  const offsetAtSplit = clip.start_offset + (splitPos - clip.play_position);

  // Create Clip A
  const clipA = await atome.objects.create<AudioClipAtome>({
    kind: 'AudioClipAtome',
    props: {
      ...clip,
      id: undefined, // let ADOLE generate
      start_offset: clip.start_offset,
      end_offset: offsetAtSplit,
      // play_position unchanged
    },
  });

  // Create Clip B
  const clipB = await atome.objects.create<AudioClipAtome>({
    kind: 'AudioClipAtome',
    props: {
      ...clip,
      id: undefined,
      start_offset: offsetAtSplit,
      end_offset: clip.end_offset,
      play_position: splitPos,
    },
  });

  // Update timeline.clips order
  const timeline = await atome.objects.get<TimelineAtome>(clip.timeline_id);

  const newClipIds: string[] = [];
  for (const id of timeline.clips) {
    if (id === clip.id) {
      newClipIds.push(clipA.id, clipB.id);
    } else {
      newClipIds.push(id);
    }
  }

  await atome.objects.update<TimelineAtome>(timeline.id, {
    clips: newClipIds,
  });

  // Remove original clip
  await atome.objects.delete(clip.id);

  // Notify engine
  await atome.services.audioEngine.removeClip(clip.id);
  await atome.services.audioEngine.loadClip(clipA, await atome.objects.get<AudioFileAtome>(clipA.audio_file_id));
  await atome.services.audioEngine.loadClip(clipB, await atome.objects.get<AudioFileAtome>(clipB.audio_file_id));
}
```

> Note: in a real implementation, we may want a batch operation for engine updates instead of multiple calls.

### 7.2 Join clips

**Goal:** merge two adjacent clips that point to the same `AudioFileAtome` into a single, longer clip.

Conditions:

* `clipA.audio_file_id === clipB.audio_file_id`.
* `clipA.group_id === clipB.group_id`.
* `clipB.play_position === clipA.play_position + (clipA.end_offset - clipA.start_offset)`.
* `clipB.start_offset === clipA.end_offset`.

Result clip:

* `play_position = clipA.play_position`.
* `start_offset = clipA.start_offset`.
* `end_offset = clipB.end_offset`.

```ts
async function joinClips(clipIdA: string, clipIdB: string) {
  const clipA = await atome.objects.get<AudioClipAtome>(clipIdA);
  const clipB = await atome.objects.get<AudioClipAtome>(clipIdB);

  if (clipA.audio_file_id !== clipB.audio_file_id) return;
  if (clipA.group_id !== clipB.group_id) return;

  const lenA = clipA.end_offset - clipA.start_offset;
  const contiguousOnTimeline =
    Math.abs(clipB.play_position - (clipA.play_position + lenA)) < 1e-6;
  const contiguousInFile = Math.abs(clipB.start_offset - clipA.end_offset) < 1e-6;

  if (!contiguousOnTimeline || !contiguousInFile) return;

  // Create merged clip
  const merged = await atome.objects.create<AudioClipAtome>({
    kind: 'AudioClipAtome',
    props: {
      ...clipA,
      id: undefined,
      start_offset: clipA.start_offset,
      end_offset: clipB.end_offset,
      play_position: clipA.play_position,
    },
  });

  // Update timeline
  const timeline = await atome.objects.get<TimelineAtome>(clipA.timeline_id);

  const newClipIds: string[] = [];
  for (const id of timeline.clips) {
    if (id === clipA.id) {
      newClipIds.push(merged.id);
    } else if (id === clipB.id) {
      continue; // drop B
    } else {
      newClipIds.push(id);
    }
  }

  await atome.objects.update<TimelineAtome>(timeline.id, {
    clips: newClipIds,
  });

  // Clean up
  await atome.objects.delete(clipA.id);
  await atome.objects.delete(clipB.id);

  await atome.services.audioEngine.removeClip(clipA.id);
  await atome.services.audioEngine.removeClip(clipB.id);
  await atome.services.audioEngine.loadClip(
    merged,
    await atome.objects.get<AudioFileAtome>(merged.audio_file_id),
  );
}
```

---

## 8. Basic transport

For the MVP multitrack, we only need per-timeline transport:

```ts
async function playProject(timelineId: string, from: number = 0) {
  await atome.services.audioEngine.seekTimeline(timelineId, from);
  await atome.services.audioEngine.playTimeline(timelineId);
}

async function stopProject(timelineId: string) {
  await atome.services.audioEngine.stopTimeline(timelineId);
}

async function seekProject(timelineId: string, to: number) {
  await atome.services.audioEngine.seekTimeline(timelineId, to);
}
```

Later we can add:

* loop between markers,
* follow actions,
* multi-timeline play.

---

## 9. What else is useful for a Multitrack MVP?

Beyond place/move/trim/roll/split/join, the bare minimum to feel like a "real" multipiste:

1. **Per-clip gain & pan**

   * Already present in `AudioClipAtome`.
   * Needed for basic balancing without a mixer.

2. **Per-track mute / solo** (even if only virtual at first)

   * Can be done by:

     * either a real `TrackAtome`,
     * or a `TrackState` map in UI + routing graph update.

3. **Snap to grid (seconds or beats)**

   * Optional, but extremely useful in practice.
   * Implemented in UI as quantization before calling `moveClip` / `trim` / `split`.

4. **Visual layering but audio order independent**

   * Engine doesn’t need track ordering; UI does.
   * Track order can live purely in client state or in a separate `TimelineLayoutAtome`.

5. **Undo/redo via ADOLE history**

   * Not specific to audio, but crucial for editing.
   * ADOLE already supports property-level history; just ensure clip operations are tracked as normal edits.

With ces briques, on obtient un **multitrack MVP** qui :

* Enregistre en direct-to-disk (iPlug2 natif ou WebAudio fallback) avec stockage unifié.
* Permet de placer, déplacer, couper, rallonger et recoller les clips.
* Reste 100 % non-destructif (WAV jamais réécrit).
* Utilise uniquement les APIs et objets déjà définis dans le document audio principal.
