# Bug reports — triage and fixed-report lifecycle (2026-10-25)

User request, 2026-10-25: the bug reports filed by the assistant (or by hand) and listed in
Réglages › Avancé › Debug must be (1) read and fixed, and (2) once fixed, noted as fixed in the
server logs and removed from the list of the people who filed them.

Owners: contract `atome/src/shared/bug_report_contract.js`, client `eVe/domains/diagnostics/bug_reports.js`,
rubric `eVe/intuition/runtime/bevy_panel/bevy_panel_advanced_runtime.js`, server `server/ws_bug_reports.js`
(files `logs/bug_reports/<YYYY-MM-DD>/<created_iso>_<id>.json` on atome.one), relays
`platforms/desktop-tauri/src/server/public_relay.rs`, `platforms/ios/atome-auv3/Common/FastifySyncPublicRelay.swift`.

## Task A — fixed-report lifecycle (done 2026-10-25, see FRAMEWORK_STATE §5)

- [x] Contract: `BUG_REPORT_STATUS = 'bug-report-status'` + `normalizeBugReportRefs` (≤ 50 `{ id, created_iso }`).
- [x] Server: the report file is the log; a fixed report carries `resolution { resolved_at, note, fixed_in }`.
      `bug-report-status` answers which of the asked reports are resolved (public, unguessable ids, own rate limit).
- [x] Operator tool `scripts/bug_reports_admin.mjs` (run on atome.one from `/opt/a`):
      `list [--open|--resolved] [--since YYYY-MM-DD]`, `show <id>`, `resolve <id…> --note "…" [--fixed-in <version>]`.
- [x] Client: when Avancé opens, after the unsent reports are sent again, the sent reports are asked; each resolved
      one is deleted through the canonical commit pipeline (`kind: 'delete'`, `scope: 'global'`) and leaves the list.
- [x] Relays: Tauri and iOS forward `bug-report-status` to atome.one.
- [x] Probes: `temp/bug_reports/status.probe.mjs` 9/9, `temp/bug_reports/resolve_ui.probe.mjs` (real Web app), `server.probe.mjs` 13/13.
- [ ] Deploy: the server must run the new `ws_bug_reports.js`; Tauri and iOS need a rebuild for the relay entry.

## Task B — fix the reported bugs

- [ ] Read every report on atome.one: `node scripts/bug_reports_admin.mjs list --open` (needs the production read
      the session could not do: either the user allows SSH read of `/opt/a/logs/bug_reports`, or copies that folder
      into `temp/bug_reports/prod/` locally).
- [ ] Group by symptom, check `known-bug-solutions/README.md`, fix each root cause, validate with a probe.
- [ ] For each fixed report: `node scripts/bug_reports_admin.mjs resolve <id> --note "<cause → fix>"`.

Reports found on this Mac (local stores, 2026-10-25):
- `bfd895c8…` (Web dev vault, 11 Oct) « mets la boule en rouge » — reason `probe: no color tool found`: a probe
  artifact of the 11 Oct assistant work, not a user bug. Never sent (pre-contract record).
- `74c9268c…` (Tauri, 16 Oct) « mets ce morceau » — `apple_music.play` → `HOST_UNSUPPORTED` on desktop Tauri.
  Cause: `atome/src/squirrel/ai/conversation_session.js` preloads `apple_music.play` / `apple_music.search` and always
  adds `APPLE_MUSIC_ASSISTANT_INSTRUCTIONS` (« music listening requests use apple_music.play »), on every host, while
  Apple Music exists only in the iPhone/iPad app (`apple_music_runtime.js#isSupportedHost`). Proposed root fix: drop both
  from the static preload and instructions; the Apple Music owner registers an eager assistant context provider
  (`registerAssistantToolContext`) that gives them only when `isSupportedHost()`; elsewhere the generic `music.*`
  (Spotify/Deezer, `MUSIC_ASSISTANT_INSTRUCTIONS`) answers. Needs an iPhone check that « mets ce morceau » still plays.
