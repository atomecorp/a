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

## iOS sync cancellation and catalog startup delay — 2026-10-10

Physical iPhone traces and a compiled-production Swift regression confirmed that
the provider socket borrowed the sync URLSession. Sync recovery invalidated that
session and cancelled pending voice requests. Identical configuration reloads
also disconnected provider channels while sync was reconnecting. ProviderChannel
now owns its ephemeral URLSession; sync recovery preserves it, while logout and
configuration changes still close it. The real local-WebSocket regression fails
before the repair and passes afterwards, with one provider connection and no
operation replay: `tests/probes/ios_provider_recovery.probe.mjs`.

A second physical trace stopped at runtime.tools.list: discovery awaited the
complete bootstrap reconciliation, including writes, before voice contacted
OpenAI. ToolRuntimeV2.listTools now reads the same canonical registry and built-in
resolver directly. It still loads stored custom tools and honors disabling.
The pending-bootstrap regression fails before repair and passes afterwards:
`tests/eve/tool_runtime_native_bootstrap_fast_path.test.mjs`. No MCP handler,
contextual instruction, permission or tool execution path is changed.

The existing Realtime owner keeps provider_connection_closed when remote cleanup
also fails, instead of replacing it with a missing-session/provider error.
Regression: `tests/eve/realtime_link_recovery.test.mjs`. Temporary stage traces
are removed from production. Physical spoken-response acceptance and repeat
opening results are recorded separately in FRAMEWORK_STATE; generated provider
audio alone does not establish audible phone playback.

The prolonged physical run additionally reproduced an idle control-socket closure
(NSPOSIXErrorDomain 57, with no intervening configuration change). The existing
NGINX configuration bounds idle WebSockets at 75 seconds; Web application sockets
already send keepalives, while the native provider relay did not. ProviderChannel
now sends WebSocket ping frames every 20 seconds with weak ownership and stops
when disposed. The real-Swift idle regression fails before repair and passes
afterwards. This does not change authentication or replay paid calls.

The same native regression confirmed token renewal also closed pending voice.
The relay now compares verified local/remote principal, server URLs and environment
fingerprint, matching the existing desktop relay identity contract. Requests use
the latest token; server validation is unchanged. Native tests verify the pending
reply survives renewal without reconnect/replay, while logout and an environment
change still dispose voice.

A later full-relaunch acceptance twice stopped after startup with the generic
request error. The existing inspectable runtime reported the same
`JSON Parse error: Unterminated string` in conversation and voice states. A
regression reproduced it at run's JSON.parse of voice function arguments. The
conversation owner now returns `conversation_tool_arguments_invalid` as a tool
result before invoking any MCP, delivers it through the existing voice result
route, and accepts a later valid call. No malformed arguments are executed or
logged, and no tool mutation is replayed. The before-test fails and the repaired
regression passes. This is input validation at the voice conversation boundary,
not a change to MCP handlers, permissions or contextual instructions.

## Prerequisite navigation — 2026-10-11

The capture's provider_principal_unavailable was absent from the assistant settings
classification. Existing consumers rendered manual Home/Server instructions and a
settings CTA instead of opening the available destination. The existing settings
owner now routes typed errors through declared Home/Matrix tools. Home accepts the
authorized focusField and waits for loading, section expansion and real projection
before revealing OpenAI and selecting its canonical masked editor.

One destination per explicit attempt, generation/session checks and listening/TTS
pause prevent repeated and obsolete navigation. Conversation, attachment and
request data remain intact; no automatic resume or paid-operation replay occurs.
Tests: assistant_settings_navigation, assistant_startup, required_panel_consumers,
openai_key_editing. A false revealTreeNode result means no scrolling occurred, not
that the target is absent; validate the projected node independently.

Source and executable navigation evidence pass. Real Web/Tauri/physical-iOS
acceptance remains **To verify**; Web QA admission stayed on Goals. Three
concurrent autosave/beforeClose editing tests fail and are preserved. Legacy aBox
migration and canonical phone-input focus are awaiting bounded authorization.
See the dated FRAMEWORK_STATE record for the platform matrix and exact limitations.
## Message feedback and precise provider failures — 2026-10-11

The pre-repair provider owner reduced a simulated HTTP 404 model_not_found to provider_operation_failed; the isolated pre-task-owner probe confirms that category loss. HTTP, Responses failure and Realtime response.done/error now preserve allowlisted categories while dropping arbitrary/raw provider text. This explains lost diagnostic precision, not the still-unreproduced cause of the user's three requests.

Preparation precedes async startup, with one cancellable local Patientez announcement after 500 ms and packaged beep fallback through the canonical audio owner. Floating errors/progress are removed in favor of the existing Message field and an explicit recovery link; focusing restores the draft. Both dock and procedural scene use published ribbon geometry. Targeted run: 120/123 pass; three existing color/filename assertions remain red. Syntax and component guards pass. Signed iPad build succeeds. Physical acceptance now targets only Ipad atomic per user instruction; WDA installation succeeds but its first launch times out enabling UI automation. Required setting and microphone/spoken acceptance remain pending.
