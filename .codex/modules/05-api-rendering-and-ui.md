# API, Communication, and Canonical UI

Applicable to API, MCP, tool-command, rendering, and UI work. The project core and common method have already been read. Repository paths below are relative to the main atome/eVe project root. Detailed rendering/DOM constraints belong to [module 01](01-root-constitution.md); mutations, history, synchronization, and permissions belong to [module 06](06-atome-state-sync-and-runtime-modes.md).

## API and command execution

Every new feature must expose an explicitly declared, documented, typed API that is MCP-compatible, accessible to AI systems, integrated with Atome history, granularly traceable, deterministically replayable, and consistent with Atome versioning. Typed contracts do not imply adopting TypeScript.

Every effectful operation must pass through the canonical Command Bus, policy checks, capability validation, audit logging, and idempotency checks. Tools and executable code return intentions (Command Bus actions), not direct hidden effects. Same inputs and canonical state must produce the same commands. Durable changes then use the canonical commit/event pipeline defined in module 06.

Tool execution is sandboxed: no raw filesystem, network, or process access. Use the canonical capability and system boundaries. Standardize tool input across UI, AI, and Voice. Tool APIs are programmable for batch operations and AI control; their mutations are persisted and fully historized through the same pipeline. Gestures such as drag, resize, and rotate must be recorded with sufficient precision for deterministic movie-like replay, while undo/restore respects module 06's logical-event boundaries.

Inspect the actual tool gateway, registered tool, dispatch path, and mutation owner before changing an API or exposing a tool in a panel. A similarly named function, copied control, external wrapper, or unregistered implementation does not prove that a native tool is available. Apply the core's compatibility and missing-component gate; preserve the tool's existing native options rather than inventing a panel-specific execution path.

## Communication architecture

All application commands, signaling, synchronization, and durable-data communication must use the centralized, shared WebSocket architecture. Account operations, sharing, canonical business state, durable mutations, and application commands belong to `/ws/api`. Authenticated cloud delivery and replay use `/ws/sync`, with the responsibilities defined in module 06.

Two narrowly bounded exceptions exist:

- mediasoup realtime audio/video streams may use WebRTC/RTP only for their media plane. Signaling, authorization, room control, application state, and durable data remain on canonical WebSockets.
- An in-process or host-provided native bridge may adapt capabilities that an operating system, application/plugin host, or realtime-media runtime exposes natively and cannot provide through the WebSocket boundary without breaking its platform contract. Examples are AUv3 tempo/transport callbacks, realtime audio/MIDI, sandboxed file pickers, native credential stores, device capabilities, and equivalent Tauri/iOS host calls. It is a capability adapter, never an alternate application transport or owner of business state, durable mutations, accounts, sharing, or sync.

REST fallbacks, HTTP polling, duplicated or hybrid application transports outside these exceptions, and scattered communication implementations are forbidden. Native exceptions do not override the owning runtime's filesystem, security, or realtime constraints in module 06.

## Canonical UI controls and tools

Use Squirrel APIs and canonical Atome/Squirrel component systems for DOM creation, controls, and events. Direct DOM manipulation is forbidden unless explicitly required within an authorized canonical creation path. `document.createElement`, `innerHTML`, manual listeners/selectors, string-generated DOM trees, and unmanaged nodes must not become competing UI implementations. Approved projection/event-resolution paths remain constrained by module 01. Do not use browser system dialogs such as `confirm()` or `alert()`; product dialogs belong to the canonical webview UI. Platform file pickers and credential adapters remain bounded by the native exception above.

Every UI element must have a unique id, exist as a canonical Atome or a property of an existing Atome, and remain traceable in the Atome structure. Anonymous UI elements and standalone unmanaged nodes are forbidden.

Buttons, sliders, inputs, toggles, selects, tool buttons, palette items, ribbon/footer/projected controls, and equivalent primitives must use canonical component code and system design definitions. Each control has one implementation owner and one visual-contract owner. Local wrappers may compose, configure, and place it; they must not redefine interaction semantics, rendering, geometry, state ownership, or styling tokens through eVe-local factories, feature-local builders, ad-hoc DOM creation, local presets, or surface-specific contracts.

If a required control is absent, incompatible, or unverifiable, stop at the core's missing-component gate. Approval for the requested feature does not authorize implementing or completing a new control. After explicit bounded authorization, create or extend the canonical Atome/Squirrel owner and consume it by composition.

Follow the readiness, component-format, children-array, batching, and system-abstraction conventions in [the Squirrel coding guide](../../atome/documentations/instructions_for_ai.md) when using those APIs.

### Product ToolSlider owner

The canonical owner already exists at `atome/src/squirrel/components/tool_slider_builder.js`; `atome/src/squirrel/spark.js` registers `ToolSlider`. `eVe/intuition/shared/slider_tool_content.js` imports and configures that owner with ribbon tokens; it is a consumer, not a temporary independent implementation.

Preserve the native product-tool behavior: the same compact square surface as the other tools, expansion on pointer/touch down to expose manipulable slider content, collapse on pointer up/cancel unless explicitly pinned, and the owner's native interaction/options. Do not replace it with a plain permanently open range input. Verify the actual owner and consumer in the current revision before extending the contract; this ownership statement does not authorize a migration or establish runtime validation.

## Structured product design

Product design is JavaScript-driven: tokens are JavaScript constants or JavaScript-installed CSS variables, presets/themes are structured objects, DOM creation belongs to canonical JavaScript factories, and styles use object literals, structured style objects, or approved controlled generators. Product HTML and CSS must not become parallel static sources of truth.

Allowed CSS exceptions are product-neutral framework shell CSS, vendored library CSS, generated distribution CSS, and JavaScript-generated style tags produced by an approved structured design module documented in `maps/DESIGN_MAP.md`.

CSS template literals, HTML template literals, string-based CSS injection, and string-based HTML generation are forbidden. Final Atome-host and media/SVG styling must also satisfy module 01's stricter projection limits.
