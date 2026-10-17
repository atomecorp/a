# Web import does nothing on a first visit, or imports silent sound

## Symptoms

1. On a fresh browser, the first file chosen through Media > « Ajouter des
   fichiers externes » creates nothing: no request, no log, the panel stays open.
2. An imported sound appears but never plays inside a Molecule: its clip has a
   duration of 0 in the transport plan.

## Confirmed causes

1. `asset_box_file_upload.js` threw `offline_app_not_ready` as soon as
   `navigator.serviceWorker.controller` was missing. On a first visit the offline
   app's worker is still verifying its manifest; it claims the page only once
   activated (`sw.js`).
2. With `createAtome: false` (the drop/import path,
   `project_drop_external_runtime.js`), the Web branch returned without the
   media it had measured (`autoMediaSizeParticles`: duration, size). The
   creator built the Atome with no duration.

## Durable correction

1. `awaitOfflineAppControl()`: the upload waits for `controllerchange`, fails on
   the worker's own `squirrel:offline-app-error`, or after 120 s.
2. The Web return carries `width/height/duration*` from the measured particles,
   like the server branch.

## Regression checks

- `temp/audio_finalize/transient_duration.probe.mjs`: the Web engine reports the
  duration of `test.m4a`.
- Acceptance (cold image+audio scenario): the audio record holds
  `duration_seconds` and its voice sounds.
