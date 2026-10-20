# A media preview plays in silence (Médiathèque Lecture, contact takes)

## Symptom

On the Web, Lecture of a sound or video preview (Médiathèque, contact
conversation takes) shows Pause and the engine renders its buffers, but nothing
is heard. The same file played by `PlayRecordCore.playVoice` directly is heard.
Project media whose duration is unknown went through the same path.

## Cause

`eVe/domains/media/shared/media_playback_command.js#createMediaPlaybackCommand`
read `durationSeconds = null` (the default, meaning "no duration") with
`Number(null)`, which is `0`, so the command said "a duration of 0 s". The executor
(`media_playback_audio_executor.js#startPrepared`) passed `max(0, 0 - start) = 0`.
The engine payload (`kira_audio_commands.js#normalizeKiraPlayInstancePayload`,
`optionalPositiveNumber`) bounds a duration to at least 0.001 s, so it played a
1 ms voice: silence.

## Fix (2026-10-20)

`createMediaPlaybackCommand` treats `null`, `undefined` and `''` as no duration
(`durationSeconds: null`). An explicit `0` is still a 0 s duration.

## Regression check

- `node tests/probes/media_playback_command.probe.mjs` (PASS).
- Real app on the Web, measuring the PCM Web Kira hands to the speakers:
  `BOOKS_INSTRUMENT=1 node temp/media_library/sound_heard.probe.mjs`.
  - Before the fix: Lecture RMS 0, executor RMS 0, `PlayRecordCore` RMS 0.156.
  - After the fix: 0.156 for every path.

## Acceptance

A preview sound is heard. The executor and `PlayRecordCore` render the same
level on the same file.
