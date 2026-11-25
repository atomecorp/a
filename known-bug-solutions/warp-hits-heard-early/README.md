# Warped audio: quantized hits heard a few milliseconds before the grid

## Symptom

A sound clip quantized through its warp markers (Rythme › Quantif., or a Repère dragged onto a beat) plays its
attacks about 10 ms early (at 48 kHz), always on the same side of the beat, worse where the warp speed changes
sharply. The markers themselves are on the grid; only what is heard is off.

## Cause

`atome/engines/mix-graph/src/warp_voice.rs` (`WarpedSound::render`, stretch branch) chose each block's stretch
factor from the speed at the block's own clock time, and let the source reader drift freely. The stretcher
(VoiceStretch, Signalsmith port) has an input latency (its opening) and an output latency: what is fed now is heard
`latency` frames later, so the speed must be read where the block will be heard, and the reader must be anchored to
the warp map, else rounding and speed changes accumulate.

## Fix

At each block: read `priming_frames(1.0)` → `(opening, latency)`; take the pitch step at the block's middle plus
the latency; compute where the reader must be at the block's landing (`clock + frames·dt + latency·dt`) from the map
(`plan.warp.locate(landing)`, plus the opening in source frames), and choose the factor that brings the reader
exactly there (`VoiceStretch::ratio(frames / wanted)`). Past the clip end, the map's own factor.

## Regression

`cargo test -p atome-mix-graph --test warp_quantize` — hits measured on the grid (0.25, 0.5, 1.0, 1.5, 2.0, 2.25 s)
and `quantized_hits_keep_their_pitch` (1 kHz ± 6 Hz). Real app: `temp/audio_tune_2026-11-25/probes/quantize.probe.mjs`
(R-372, 25 Nov. 2026).

## Acceptance

Every quantized attack starts within one millisecond of its beat; the pitch of a warped note is unchanged.
