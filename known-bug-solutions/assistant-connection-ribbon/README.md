# Assistant connection and ribbon ownership

## Startup and Atom hold repair — 2026-10-09

Controlled reproduction confirmed four startup failures in the existing owner
`eVe/voice/assistant/assistant_runtime.js`: a provider lookup rejection outside
the settings-error allowlist called `abortOpen`, immediately dismantling the
dock; the first Atom hold called `open` then `dock.toggleInput`, immediately
pausing voice; text focus during lookup left the transition at `connecting`;
and a rejected voice startup recorded an error without revealing its surface.

The first hold now opens the existing voice session and returns. A later hold
on the open assistant focuses its canonical shared text editor. Preparation and
voice errors remain visible in the existing dock and permit an explicit retry.
Actual data-channel connection still owns `connected`; a visible text/error
surface does not claim voice connectivity. Late failures cannot alter a newer
generation, and closing clears the projected microphone signal.

Regression: `tests/eve/assistant_startup.test.mjs` (seven cases; the initial four
failed before repair), alongside the existing hold/session/Realtime suites.
No timer workaround, replacement gesture owner, alternate renderer or key
installation was added. Two existing visual-contract color assertions fail
before and after this repair; they do not exercise startup.

**To verify:** replay a real Atom hold/release in an authenticated Web/Tauri/iOS
workspace, confirm live microphone and a spoken reply, then focus text, retry
voice, and close/reopen. The local Web test reached the unauthenticated Access
screen with one canvas, so its mounted-main-menu readiness gate correctly
blocked before any assistant gesture. Direct OpenAI authentication and a
15-token diagnostic response passed using the supplied key without storing or
displaying it; this is not application-vault or spoken-conversation acceptance.

The assistant must not be shown as connected merely because its appearance animation completed. Realtime owns connected state (data-channel open) and microphone track state separately. Atom remains the pending-connection presentation until that event.

A detached text field did not participate in ribbon layout and covered neighboring tools. Reuse the existing ribbon inline-search editor, inline-content presentation and external-width owner. The dock owns only the assistant gesture and pending Atom image when the main menu is visible. Field focus pauses voice; opening without focus keeps voice; explicit field closure resumes voice.

The native provider relay formerly compared token bytes before forwarding responses. A refreshed token for the same authenticated identity produced provider_connection_closed (isolated as provider_token_changed with temporary diagnostics). Compare account, server and environment identity instead, send new requests with the current configured token, and still reject responses after logout or identity changes. Do not remove authentication or replay paid operations.

Regression evidence: tests/server/provider_relay_contract.rs uses a real local WebSocket to rotate the token during a pending request and verify that logout blocks subsequent events. tests/eve/assistant_visual_contract.test.mjs verifies ribbon displacement, Atom replacement, input focus and teardown; tests/eve/assistant_session_controller.test.mjs covers stale startup cancellation.

Required native acceptance remains separate: real Atom click, capture permission if requested, connected plus live microphone state, spoken response, real long press, field displacement, focus/pause, close/resume and final release. Current record: eVe/documentations/MYSTIC_ASSISTANT_VALIDATION_2026-09-21.md.
