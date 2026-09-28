# A recorded clip loses Play in the contextual rail and the Mystic menu

Symptom confirmed on the real project surface: after recording a video, selecting
the new clip showed no Play in the contextual sidebar rail and no Play entry in
the Mystic menu, while an imported video showed both.

Root cause: a recording persists its provenance in the record type
(`video_recording`, `audio_recording`), and the tool-selection layer decided
playback from that raw string. `context_menus.json` already declares `play` for
both `video` and `video_recording` in its `mystic` and `sidebar` tables, and the
command requires `capabilities: ['playback']`; nothing collapsed the provenance
before the capability test, so a recording resolved `capabilities: []` and Play
was filtered out. `intuition/menu/context_menu_resolver.js#resolveContextMenuContext`
listed only `audio`/`sound`/`video`/`group`, and
`intuition/runtime/eve_intuition/atome_contextual_rail_model_runtime.js` compared
its `MEDIA_KINDS`, `PLAY_REQUIRED_KINDS` and `RECORD_ACTION_EXCLUDED_KINDS`
against the unnormalized kind too.

Rejected hypotheses, to avoid repeating the same work:

- The playback layer: `readSelectedProjectMediaPlaybackState` already returned
  the recording in `playableIds`; only the tool selection dropped the command.
- The tool tables: both recorded-kind entries already carried `play`.
- The Mystic kind mapping: `context_selection.js#MYSTIC_KIND_ALIASES` already
  folded `audio_recording` onto `audio`; the video alias was the missing one.

Correction: reuse the existing canonical owners instead of enumerating
provenance variants. The menu resolver now asks
`domains/media/shared/media_atom_integrity.js#normalizeMediaPlaybackKind` — the
collapse documented there as the media-engine playback boundary — and the
contextual rail resolves its kind through
`intuition/runtime/eve_intuition/atome_contextual_kind.js#normalizeAtomeContextualKind`,
the rail's own vocabulary owner, which delegates to the same normalizer. Both
files keep one family vocabulary (`audio`, `video`, `group`), so a recorded clip
resolves exactly like an imported one, and `audio_waveform` now reaches the
audio rail (play, sound, audio_to_midi).

Regression test: `tests/eve/recorded_media_contextual_play_contract.test.mjs`,
registered in `tests/vitest.manifest.json`. It fails 3/5 before the correction
(Mystic menu, contextual rail for video and for audio) and passes 5/5 after,
including the explicit assertion that a recorded video drops `record_action` the
way an imported video does. The 23 failures of the surrounding rail/menu suites
were reproduced identically with the correction reversed, so none of them
belongs to this repair.

Real acceptance sequence still to run outside the sandbox (no pixel was observed
here): start the app, record a short video, release, then select the recorded
clip on the project surface and read the sidebar rail and the Mystic menu —
both must show Play, and pressing it must transport the clip exactly as for an
imported video; repeat with a recorded audio.
