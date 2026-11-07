# Assistant says « Le serveur atome n'a pas pu mener la demande IA à bien » and never connects

## Symptom
After the Rust refactor (atome.one on atome-server 1.53, iOS 1.54), touching the assistant is answered aloud by
« Le serveur atome n'a pas pu mener la demande IA à bien. Réessaie. » (`provider_operation_failed`), every time; the
voice session never opens (user report, 7 Nov. 2026).

## What the code is
`providers/mod.rs#failed` (atome-server) sends a failure's own text only when it is a known code; every other text
became `provider_operation_failed`, and nothing wrote it anywhere. That one code therefore stood for very different
causes: OpenAI unreachable from the server (`fetch failed`), an answer cut (`terminated`) or unreadable
(`SyntaxError`), and any internal error of the account's vault or of the central database. On iOS the local server
relays `ai-provider` unchanged to atome.one (`local/provider_relay.rs`), so the code is atome.one's.

## Ruled out (7 Nov. 2026)
- The voice path itself: an isolated atome-server (`temp/assistant_rust_2026-11-07/connect.probe.mjs`, real account,
  real key, real WebRTC offer from Chromium) answers `credential.status`, `models`, `realtime-connect` (an SDP answer
  from OpenAI) and `realtime-close` (15 billed seconds). The same with the key in the account's vault (`--own`).
- An expired, forged or unreadable token: refused as `auth_session_invalid`, never `provider_operation_failed`
  (`token.probe.mjs`).
- Sealed key format, vault directory naming, vault root default, shared-seat SQL: identical between Fastify and
  atome-server.
- The iOS local server's TLS roots: fixed the same day (`tls.rs#system_roots`, 2754d9d0d) and shared by every client.

## Fix
- A transport failure travels as its own cause, each with its recorded French sentence: `fetch failed` →
  `provider_unreachable` (« Le service IA est injoignable »), `terminated` → `provider_stream_incomplete`,
  `SyntaxError` → `provider_invalid_response` (`TRANSPORT_FAILURES`).
- Every cause that does not travel as itself is written to the server's journal:
  `[ai-provider] <action> failed: <text>` (`dispatch.rs#answer`), and an unreachable provider's transport cause
  without its address: `[ai-provider] request failed: …` (`http.rs#send`).

## Still open
The cause on atome.one is not known: its journal was not readable from the development machine. Once the server is
updated, one touch of the assistant tells it: either the new sentence spoken, or the line in
`journalctl -u squirrel | grep ai-provider`.

## Regression checks
`cargo test -p atome-server --lib providers::tests` (tests/server/provider_failure_codes.rs);
`OPENAI_API_KEY=… PROBE_NO_REFERENCE=1 node temp/assistant_rust_2026-11-07/connect.probe.mjs [--own]`.
