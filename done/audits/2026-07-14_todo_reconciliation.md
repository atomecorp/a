# TODO Reconciliation — 2026-07-14

## Result

The `todo/` tree contains 78 Markdown files and 24,101 lines. It is an active mixed backlog: most files combine completed checkpoints, in-progress work, open work, and definition-of-done criteria. No whole active TODO file was moved, because doing so would discard unresolved scope.

The following completed work was extracted into this immutable reconciliation record rather than duplicated as live TODO:

- `todo/communication_social/user_auth.md`: its checked authentication foundation (auth module, bcrypt, cookie JWT sessions, registration/login/logout/me/profile/OTP UI and local/remote configuration) is historical completed work; its SMS provider, production secrets, distributed OTP storage, rate limiting, phone validation, account lockout, audit logging, HTTPS, and tests remain open.
- `todo/sharing_search_monitoring/sharing_to_code.md`: the listed January sharing fixes are historical completed work, but the document remains a bug report with later unresolved sharing/sync checks.
- `todo/molecule/NewMolecules.md`: checked V1/V2 milestones are completed evidence inside an explicitly active V1–V3 backlog; its unchecked advanced tracks, export, DOM retirement, and cross-platform validation remain open.
- `todo/cleanup_architecture/eve_atome_master_cleanup_plan.md`: checked cleanup phases and its “completed for this repository pass” note are historical completion evidence, while the file still carries active governance and cleanup scope.

## Stale completion evidence reopened

`done/full_atome_architecture.md` records T15/T18 (core type registry) as complete and verifies `tests/shared/core_atome_types.test.mjs` as green. The same suite now fails because `record` uses the unsupported `data` universal kind. The work is therefore reopened in `todo/audits/2026-07-14_framework_documentation_conformance.md`; the old done record is retained for traceability rather than rewritten.

`done/atome_urgent_treatment.md` and `done/full_atome_architecture.md` record a passing mutation-ownership guardrail. That command now fails after commit-pipeline modularization, and the repair is likewise reopened in the audit backlog.

## Preservation note

Nine TODO files already have user worktree changes, including the active Molecule, calendar, MIDI, dashboard, map, and execution-order records. They were deliberately left untouched by this reconciliation.
