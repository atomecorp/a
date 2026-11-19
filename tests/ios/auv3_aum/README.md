# AUM bench — Atome as an AUv3 in AUM on the iPad

Manual-acceptance companion of `tests/parcours_musique/09_hote_auv3.md`. Each `*.js` probe declares `const probe = async () => { … }`,
evaluated in the AUv3's WebView (through the Web Inspector protocol, `ev.mjs`) after the shared prelude
`lib.js` + `wav_lib.js`; `run.sh` ends the body with `return probe();`, so the probe's JSON result comes back. Run files, builds and screenshots go under `temp/auv3_aum/`.

## Setup (once per session)

1. iPad plugged in by USB, unlocked; `UDID` defaults to the iPad atomic.
2. Appium's `appium-xcuitest-driver` installed in `~/.appium` (it brings `appium-remote-debugger`, used by `ev.mjs`).
3. Build and install: `tests/ios/auv3_aum/build.sh`, then `tests/ios/auv3_aum/reload.sh` (installs and reloads the AUM
   session; its taps assume an iPad in landscape and AUM's session list of 15 Nov. 2026).
4. WebDriverAgent for screenshots and taps: `WDA_XCTESTRUN=<…/WebDriverAgentRunner_iphoneos….xctestrun> tests/ios/auv3_aum/wda.sh`.
5. AUM session: a sequencer on the host clock → a synth → send to « Bus A »; « Bus A » → Atome → output. Open
   Atome's window, open a **QA project** in its Timeline.

Environment: `AUM_DD` (an existing build folder), `AUM_WORK`, `UDID`, `WDA_URL`, `AUM_PROJECT` (the project whose
timeline the probe reads — needed after a probe switched projects: the last activated timeline may be another
project's), `T` (evaluation timeout, ms), `FXLIB=1` (adds `fxlib.js`; not with `sampler_note.js`, which defines the
same helpers), `STANDALONE=1` (the app instead of the extension).

```bash
AUM_PROJECT=<project id> tests/ios/auv3_aum/run.sh tests/ios/auv3_aum/rec_point_take.js
```

## Probes

| Probe | Host | Proves | Last result (16 Nov. 2026) |
| --- | --- | --- | --- |
| `host_reopen_lock.js` | playing | a project reopened while the host plays lands playing, sample-accurate (R-179 defect 4) | playing, `sample_accurate`, +2.0 s in 2 s |
| `multi_project_anchor.js` | any | two projects created and opened, back to the first: its timeline identical; the two deleted | identical |
| `rec_point_take.js` then `rec_point_ratio.js` | playing | take dry under IN, about −20 dB with REC after VOL −20 dB (R-183) | −20.1 dB, every take `sample_accurate` |
| `aux_to_bus.js` | playing | an Aux feeds a new bus; the track muted, the bus still receives (R-179 defect 8, R-183) | track 0.0091 → bus 0.0091; muted 0 → bus 0.0033 |
| `out_mono.js` | playing | OUT on channel 1 alone applied, no engine error | `mono: 0`, no error, rms 0.0063 |
| `take_onsets_grid.js` | playing | the last take's attacks against the host's 16th grid | see note below |
| `record_region_take.js` | playing | a record region's take lands exactly on it | not rerun |
| `host_midi_capture.js` | playing | the host's MIDI reaches Atome (rec. › MIDI) | not rerun |
| `large_sound.js` | any | a 91.7 MB AIFF through the upload's duration read reaches the engine as bytes (base64 → FFI), never as JSON (PE-26, R-188) | 520 s read in 597 ms (AUv3) and 625 ms (`STANDALONE=1`), alive |
| `sampler_note.js` | any | a Sampler instrument made from the last take sounds; deleted after | not rerun |

Note on `take_onsets_grid.js`: it needs a crisp, strictly quantized source (a click or a short percussive note on
every 16th). With the session's slow-attack synth (one note per bar) the attacks spread from −54 to +49 ms inside a
single take while the mean stays at +2 to +4 ms: a placement error would shift every attack alike, so the spread is
the source's, and the result says nothing either way. R-179's −0.6 ms (sd 1 ms) was measured with a crisp pattern.
