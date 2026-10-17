# iOS: audio/video takes time out (wake-word listener holds the microphone)

## Symptom

On a physical iPad/iPhone with voice activation on, an audio take fails with
« Recording start timed out before the input stream became ready » and a video take with
`native_video_audio_not_ready`. Takes work once voice activation is off.

## Root cause

The wake-word listener (`AtomeVoice.wake`, native `audio_wake_start`) owns the
microphone through the app's recording engine; `audio_wake_stop` only arrived after
`audio_record_start` had already waited 8 s for an input stream.

## Fix (2026-10-15)

`eVe/domains/media/api/media_capture_microphone.js` (`holdMicrophoneFromWake`) suspends
the listener through its own API (`wake.suspend('media_capture')`) before a native take
starts and resumes it when the take ends for good (kept, discarded, failed). Holders
are counted; nothing happens (and nothing is loaded) when no voice service runs. Used by
`audio_core_record.js` (native microphone path) and `video_api_record_native.js`.

## Regression check

With voice activation on: subscribe to `AtomeVoice.wake`, make a held audio take in a
contact conversation: the phases go `listening → suspended → starting → listening` and
the take is kept.
