# Assistant connection and ribbon ownership

The assistant must not be shown as connected merely because its appearance animation completed. Realtime owns connected state (data-channel open) and microphone track state separately. Atom remains the pending-connection presentation until that event.

A detached text field did not participate in ribbon layout and covered neighboring tools. Reuse the existing ribbon inline-search editor, inline-content presentation and external-width owner. The dock owns only the assistant gesture and pending Atom image when the main menu is visible. Field focus pauses voice; opening without focus keeps voice; explicit field closure resumes voice.

The native provider relay formerly compared token bytes before forwarding responses. A refreshed token for the same authenticated identity produced provider_connection_closed (isolated as provider_token_changed with temporary diagnostics). Compare account, server and environment identity instead, send new requests with the current configured token, and still reject responses after logout or identity changes. Do not remove authentication or replay paid operations.

Regression evidence: tests/server/provider_relay_contract.rs uses a real local WebSocket to rotate the token during a pending request and verify that logout blocks subsequent events. tests/eve/assistant_visual_contract.test.mjs verifies ribbon displacement, Atom replacement, input focus and teardown; tests/eve/assistant_session_controller.test.mjs covers stale startup cancellation.

Required native acceptance remains separate: real Atom click, capture permission if requested, connected plus live microphone state, spoken response, real long press, field displacement, focus/pause, close/resume and final release. Current record: eVe/documentations/MYSTIC_ASSISTANT_VALIDATION_2026-09-21.md.
