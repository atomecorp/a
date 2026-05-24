# Failed Video Poster Attempt

## Context

The goal was to guarantee that project-surface video atomes always show a real visual image instead of a grey or black square.

The intended behavior was:

- after a video recording, the project atome must show a stable image;
- after importing a video, the project atome must show a stable image;
- after opening a molecule, moving the playhead to another frame, and closing it, the project atome should show that selected frame;
- the visual must be an image/poster layer, not a live thumbnail placeholder;
- the project surface must never fall back to a grey or black square.

## What Was Changed

### Capture Video Poster

I added a shared runtime intended to capture a poster from the active video recording preview before the preview overlay is destroyed.

Files involved:

- `eVe/intuition/shared/capture_video_poster_runtime.js`
- `eVe/intuition/tools/capture.js`

The idea was:

1. On video stop, capture the current preview frame from the live overlay.
2. Persist it into the atome properties as `media_poster_data_url`, `poster_data_url`, and related aliases.
3. Mount an image layer on the project atome using `img[data-role="eve-media-video-poster"]`.

### Project Video Poster

I added a reusable poster capture runtime for video media already present on the project surface.

Files involved:

- `eVe/intuition/shared/media_video_poster_runtime.js`
- `eVe/intuition/runtime/tool_genesis.js`

The idea was:

1. If a video atome has a persisted poster, mount it immediately.
2. If it does not, capture a frame from the video source and persist it.
3. Keep the poster image mounted as a stable overlay on the project atome.

### Molecule Video Poster

I added a group/molecule poster runtime to capture project-visible video molecule previews.

Files involved:

- `eVe/intuition/shared/group_video_poster_runtime.js`
- `eVe/domains/mtrax/preview/preview_poster_capture_runtime.js`
- `eVe/domains/mtrax/preview/preview_poster_canvas_runtime.js`
- `eVe/domains/mtrax/ui/panel_lifecycle_runtime.js`

The intent was:

1. Preserve the current molecule playhead frame when closing the molecule.
2. Capture the preview canvas as an image.
3. Reject blank or flat preview surfaces before persisting them.
4. Display that persisted image on the project group atome.

### Duplicate Recording Atomes

I changed the recording stop workflow so the persisted `video_recording_*` atome created by recording persistence was reused as the project atome.

File involved:

- `eVe/domains/media/api/video_api.js`

The intent was to avoid creating both:

- one `video_recording_*` persistence atome;
- one additional `video_*` project atome.

The new workflow reused the `video_recording_*` atome directly and rendered it on the project surface.

### Server Upload Timing

I changed the Fastify upload completion path to stop doing synchronous WebM-to-MP4 cache generation during upload completion.

File involved:

- `server/server.js`

The intent was to avoid request timeouts when recording `.webm` video with audio.

The assumption was that playback routes already know how to generate and serve the MP4 cache lazily.

### Timeline Video Metadata Fallback

After the server upload change, recorded video clips could become empty in the molecule timeline because metadata loading did not finish quickly enough.

I then changed the molecule media element runtime.

File involved:

- `eVe/domains/mtrax/media/element_runtime.js`

The intent was:

1. If a recorded video has a valid source and known duration but `loadedmetadata` is slow, keep the video element instead of destroying it.
2. Prevent `createMediaElementFromDescriptor` from returning an empty source and creating an empty clip.

## What Failed

The work became too broad and touched too many coupled paths:

- project atome rendering;
- video recording persistence;
- capture tool stop flow;
- molecule/timeline clip creation;
- server recording upload and playback cache generation;
- WebM/MP4 conversion timing;
- poster persistence;
- poster DOM mounting;
- molecule close/playhead preview persistence.

The most serious regression reported after these changes:

- video recording could create an atome on the project;
- but when the recording was appended into the molecule/timeline, the video track could be empty;
- this means the workflow still had a hidden dependency between upload completion, metadata loading, and timeline media creation.

## Suspected Root Problems

### 1. Poster Work Was Mixed With Recording Workflow

The poster feature should not have changed the core recording workflow.

Future work should avoid changing:

- how recordings are persisted;
- which atome is the canonical recording atome;
- how recordings are appended to molecule tracks;
- server upload completion behavior.

The poster should be an additional visual property layered on top of an already correct recording/media workflow.

### 2. Project Atome Visuals And Timeline Media Are Coupled

The same atome state is used by:

- project surface rendering;
- molecule/timeline descriptor resolution;
- media authorization;
- clip creation;
- playback source resolution.

Adding or updating poster fields must never alter or obscure:

- `media_url`;
- `src`;
- `file_path`;
- `file_name`;
- `media_type`;
- `mime_type`;
- `duration_sec`;
- `recording_id`;
- `owner_id`;
- `media_user_id`.

Any future solution must explicitly assert these fields remain present before and after poster persistence.

### 3. `updateAtomeProperties` Must Be Treated As High Risk

Poster persistence uses `updateAtomeProperties`.

Even if the current implementation appears to merge properties, this path must be considered risky because a partial update can affect the exact state later read by molecule/timeline descriptor resolution.

Future work should:

- test before and after state immediately around poster persistence;
- verify `media_url/file_path/duration_sec` survive the update;
- avoid writing broad or redundant aliases unless required.

### 4. WebM With Audio Is The Critical Scenario

The standard browser probe using MP4 was not enough.

The failing scenario is closer to:

- WebM recording;
- audio enabled;
- server-side MP4 cache/transcode involved;
- immediate append into molecule/timeline after stop.

Future validation must include a forced `.webm + audio` path.

### 5. Upload Completion And Playback Cache Timing Are Sensitive

Removing synchronous cache generation from upload completion fixed a timeout but exposed a timing dependency in molecule metadata loading.

Future work should not move cache generation without a complete design for:

- upload completion latency;
- playback route cache generation;
- metadata availability;
- molecule clip creation while the cache is still being generated.

### 6. Timeline Clip Creation Must Never Return Empty Media For Valid Recording Sources

The timeline code can create empty tracks/clips if media resolution returns no usable source.

Future work should assert that recorded video append produces:

- a clip with `kind: "video"`;
- a non-empty `src`;
- a non-empty `runtimePlaybackSource`;
- a positive duration;
- a retained media/video element or a deterministic pending media state.

## Validation That Was Added During The Attempt

Temporary probes were used under `temp/`, especially:

- `temp/video_recording_project_poster_probe.mjs`
- `temp/recording_poster_timeline_diag.mjs`

The important validation scenario added to the probe was:

- force WebM recording;
- enable audio;
- stop the recording;
- verify one project atome;
- verify poster pixels are not black;
- append the recorded atome into the molecule/timeline;
- verify the append does not create an empty video clip.

These probes helped identify timing issues, but they were not enough to guarantee the full app behavior the user saw manually.

## What To Avoid In The Next Attempt

Do not start by refactoring recording persistence.

Do not change server upload/cache behavior unless the task is specifically about upload/cache.

Do not change molecule/timeline clip creation as part of a project-poster feature unless a failing test proves the timeline layer is the owner.

Do not introduce poster capture in a way that can race with `appendCaptureAtomes`.

Do not persist poster fields before the recording/timeline append path has consumed the canonical media fields, unless tests prove the state remains complete.

Do not rely only on MP4/Chromium behavior. Safari/WebView/WebM paths must be tested.

Do not accept a project-surface poster success as proof that timeline recording still works.

## Safer Future Strategy

A safer future implementation should be staged:

1. Restore the previous known-good recording and timeline append behavior.
2. Add a read-only diagnostic probe that records video and captures:
   - recording result;
   - atome state before poster persistence;
   - atome state after poster persistence;
   - timeline append result;
   - clip source/duration/media status.
3. Add poster capture only after recording stop has fully completed and after any required timeline append has consumed the recording atome.
4. Persist only the minimum poster fields.
5. Mount the poster only as a project-surface visual layer.
6. Prove that `media_url`, `file_path`, and timeline append are unchanged.

## Files I Touched During The Failed Attempt

Main code paths touched:

- `server/server.js`
- `eVe/domains/media/api/video_api.js`
- `eVe/domains/mtrax/media/element_runtime.js`
- `eVe/domains/mtrax/preview/preview_poster_capture_runtime.js`
- `eVe/domains/mtrax/preview/preview_poster_canvas_runtime.js`
- `eVe/domains/mtrax/ui/panel_lifecycle_runtime.js`
- `eVe/intuition/runtime/tool_genesis.js`
- `eVe/intuition/tools/capture.js`
- `eVe/intuition/shared/capture_video_poster_runtime.js`
- `eVe/intuition/shared/media_video_poster_runtime.js`
- `eVe/intuition/shared/group_video_poster_runtime.js`

Tests/probes/docs touched or added:

- `tests/molecule/*`
- `temp/video_recording_project_poster_probe.mjs`
- `temp/recording_poster_timeline_diag.mjs`
- `maps/CODEMAP.md`
- `maps/DESIGN_MAP.md`
- `.gitignore`

Unrelated dirty files were already present and should not be attributed to this poster solution:

- `atome/src/assets/images/icons/close.svg`
- `platforms/ios/atome-auv3/atome.xcodeproj/project.xcworkspace/xcuserdata/jean-ericgodard.xcuserdatad/UserInterfaceState.xcuserstate`

## Final Note

This attempt should be treated as failed.

The next implementation should be smaller and must preserve the existing recording and molecule/timeline workflows first. The poster feature should be isolated to project-surface visual rendering and must not alter recording persistence, server upload completion, or timeline clip creation unless a focused failing test proves that specific layer is the owner.
