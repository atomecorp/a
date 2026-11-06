# The assistant never says she is ready

## Symptom (user, 5 Nov. 2026)

At the eVe Pro home arrival she says « Attends, je prépare tes documents », then « Salut »,
and never « C'est bon, je suis prête ». The person has to ask « tu es là ? » to know she listens.

## Cause

Two paths produced exactly that, and the sentence's failure would have been silent anyway.

1. **Cloud session: her own sentence was taken for the person's words.** The early microphone
   (`atome/src/squirrel/voice/realtime_early_input.js`) opens in the provider lookup's
   `warmUp`, after the dock, the wake suspension and the optional integrations have loaded:
   at a launch that is later than the 1.2 s after which the arrival's startup sentence starts.
   The announcer mutes the microphone through `onSpeaking(true)`, but at that moment
   `state.earlyInput` was still `null`, so the microphone that opened a moment later heard
   the rest of « Attends, je prépare tes documents » from the speaker. `heard()` became true
   (300 ms of voiced frames, counted cumulatively, so scattered noise reached it too),
   `realtime_session.js#announceReadiness` skipped the ready sentence, the delay line replayed
   her words to the model, and the model answered them: « Salut ».
2. **Local session (offline at the moment of the arrival): another greeting, another voice.**
   `createVoiceAssistantSessionController` said its own `eve.voice.assistant.opening_greeting`
   « Salut, que veux-tu ? » through the local ONNX voice; the announcer's ready sentence was
   never asked for.
3. A ready line that could not be played (`voice_line_missing`, unavailable audio) was
   written only to the voice diagnostics, which are off by default: silent and invisible.
4. A call-back (an opening with a context) asked the model to speak first and never said a
   ready sentence.

## Fix

- `eVe/voice/assistant/assistant_runtime.js`: the early input, once opened, takes the
  announcer's current state (`input.mute(announcer.speaking())`); the announcer exposes
  `speaking()` (`assistant_voice_announcer.js`).
- `realtime_early_input.js`: `heard` needs one stretch of speech of 300 ms (inner pauses under
  150 ms kept), never scattered frames added up.
- `realtime_session.js#announceReadiness`: every opening says the ready sentence unless the
  person spoke first; a session that speaks first asks the model (`response.create`) only
  after it.
- `assistant_session_controller.js`: the local session takes `announceReady` (the announcer's
  ready sentence) instead of its own greeting; `opening_greeting` removed from i18n.
- `assistant_voice_announcer.js#ready`: a failure of the ready sentence is the session's
  failure (its error shows and is said), never only a diagnostic.

## Regression

`PROBE_PREBUILT_SERVER=1 node temp/d18_assistant_ready/ready_sentence.probe.mjs` (real
Chromium `--use-angle=metal`, isolated server, real voice lines and Web Audio; the microphone
hears her voice from the speaker). After: 9/9, run twice (`after_1.log`, `after_2.log`); `--before`
(HEAD modules): 4/9, the user's report reproduced: arrival and noisy room `heard: true` on her own
sentence, no ready sentence; local session « Salut, que veux-tu ? » by ONNX; call-back with no
ready sentence; missing line silent (`before.log`). Unit tests:
`tests/eve/assistant_session_controller.test.mjs`, `tests/eve/assistant_turn_taking.test.mjs`.

## To verify on a device

iOS: the voice lines play through the native engine while the WebView microphone opens; the
audio session route (speaker vs receiver, ducking when the microphone starts) is not covered
by the Web probe. Check on the USB iPad that « C'est bon, je suis prête » is heard at the
arrival, at a normal volume, after « Attends, je prépare tes documents ».
