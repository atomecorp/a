# Web takes shortened when the input goes silent

## Symptom

A take recorded on the Web ends early or its later material lands too soon: the
clip is shorter than the recording time (seen with the probe's digital loopback:
the capture stopped ~200 frames after the last impulse).

## Confirmed cause

The recorder worklet (`eVe/domains/media/api/audio_browser_recorder_worklet.js`)
returned early when its input had no channels. Chrome reports an input with no
channels once its source becomes inactive (silent graph, disconnected device), so
those render quanta were neither counted nor written: time was lost from the take.

## Durable correction

An input without channels is recorded as silence (one 128-frame quantum of zeros):
the take keeps the elapsed time and everything after keeps its place.

## Regression checks

- `temp/timeline/timeline_sync_real_app.probe.mjs` takes 7 (punch) and 9 (cell take):
  exact clip lengths and impulses within ±1 sample.
