# Imported video shows wrong colors or never starts

## Symptom

Two MOV imports reproduced the defect on the same project surface:

- `eVeProblem.mov` (HEVC Main 10, `yuv420p10le`, `moov` at the end) renders
  with washed/incorrect colors and never advances;
- `eVe.mov` (H.264 High, `yuv420p`, `moov` at the end) keeps correct colors but
  never advances either.

Both files carry no audio track.

## Confirmed causes

1. **Wrong colors on HEVC Main 10.** The Bevy video route imports the decoded
   surface with `importExternalTexture` as 8-bit `RGBA` and the shader applies
   `srgb_to_linear` before the sRGB target. A 10-bit HEVC/HEVC-Main10 source
   decoded and clamped on the way to that 8-bit external texture loses its
   transfer/range mapping, so the image is visibly wrong. H.264 8-bit sources
   are already correct through the same path.
2. **Playback never starts on a silent video.** `mediaPlaybackVideoRequiresAudio`
   treats a missing `has_audio`/`audio_track_count` as *audio required*. Both
   files have no audio, so the mandatory Kira extraction fails and the paired
   start is rolled back. This is the deliberate contract recorded in
   [media-video-audio-replay](../media-video-audio-replay/README.md): only an
   explicit `false`/`0` may select visual-only playback. The import probe did
   not persist that metadata.
3. **Non-faststart is a secondary risk.** Both MOV files keep `moov` after
   `mdat`. A progressive `<video>` then has to buffer the whole file before it
   can start. Normalizing to faststart removes that latency and any
   range-request fragility.

## Correction

- **Serving boundary normalization** (`server/server_media.js` and
  `platforms/desktop-tauri/src/server/mod.rs`): a playback target that is not a
  faststart H.264 MP4 is normalized once into a sibling `.video_cache/<stem>.mp4`.
  - HEVC (`hvc1`/`hev1`), non-MP4 containers and non-decodable codecs are
    transcoded to H.264 `yuv420p` `+faststart` (no pinned profile/level).
  - A readable H.264/MP4 with `moov` at the end is remuxed with `-c copy`,
    losslessly.
  - Concurrent requests share one in-flight job so two ffmpeg runs never write
    the same output.
- **Deterministic audio inspection** (`atome/src/squirrel/shared/media_container.js`
  and `eVe/domains/media/shared/media_audio_track_probe.js`): the import probe
  reads the `moov`, and persists `has_audio`/`audio_track_count` from the real
  `soun` track count. A truncated/unreadable `moov` stays **unknown**.
- **Standalone playback fallback**
  (`eVe/domains/media/selected_project_media_playback_runtime.js`): when an
  already-imported Atome has no audio metadata, a bounded Range inspection of
  the container can prove the absence of a `soun` track and select visual-only
  playback. An uninspectable source keeps mandatory audio.

## Rejected hypotheses

- Treating a decode or audio-extraction failure as "silent" was rejected: it
  hides real extraction defects and contradicts the canonical no-fallback
  contract.
- Transcoding every bundled asset preventively was rejected: it penalizes
  already-valid media and changes static serving for unrelated files.

## Regression coverage

```sh
npx vitest run \
  tests/eve/media_container_boxes.test.mjs \
  tests/eve/media_audio_track_probe.test.mjs \
  tests/server/server_media_normalization.test.mjs \
  tests/eve/selected_project_media_playback_runtime.test.mjs
```

The suites build synthetic ISO-BMFF fixtures (faststart and `moov`-at-end,
silent and with audio, H.264 and HEVC), verify the normalization plan and the
pure probe, and prove that only a container-proven silence skips the mandatory
audio preparation.

Platform acceptance still requires a Web/Tauri run that imports a silent
HEVC/HEVC-Main10 MOV and a silent H.264 MOV: both must start, advance, and show
the same colors as the H.264 reference.
