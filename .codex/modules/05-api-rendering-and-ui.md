# API Rendering And UI

This module is part of the active .codex rule set.

## API AND MCP POLICY

Every new feature MUST be exposed through a properly defined API.

Every API must:

- be explicitly declared;
- be documented;
- be typed;
- be MCP-compatible;
- be accessible to AI systems;
- integrate with Atome history;
- support granular traceability;
- support deterministic replay;
- respect Atome versioning rules.

All effectful operations must pass through:

- the Command Bus;
- policy checks;
- capability validation;
- audit logging;
- idempotency checks.

Tools must return intentions, never direct hidden side effects.

Bypassing the Command Bus is forbidden.

## COMMUNICATION ARCHITECTURE

All application commands, signaling, synchronization, and durable data communications MUST exclusively use WebSockets.

Narrow exception: mediasoup real-time audio and video media streams MAY use WebRTC/RTP where required by the mediasoup protocol. This exception applies only to the media plane. Signaling, authorization, room control, application state, and durable data MUST continue to use the canonical WebSocket architecture.

Narrow native-platform exception: an in-process or host-provided native bridge MAY be
used only for capabilities that the operating system, application host, plugin host, or
realtime media runtime exposes natively and cannot provide through the application
WebSocket boundary without breaking the platform contract. Examples include AUv3 host
tempo/transport callbacks, realtime audio/MIDI exchange, sandboxed native file pickers,
native credential stores, device capabilities, and equivalent Tauri/iOS host calls.
This bridge is a platform capability adapter, not an alternate application transport.
It MUST NOT own or carry canonical Atome business state, durable mutations, account
operations, sharing, application synchronization, or another command path that belongs
to `/ws/api`.

REST fallbacks, HTTP polling, duplicated application transports, and any other hybrid application communication paths remain forbidden.

HTTP polling, REST fallbacks, duplicated application communication systems, and hybrid
application transports outside the explicit mediasoup media-plane and bounded native
platform exceptions are forbidden.

Communication logic must:

- remain centralized;
- use a single shared architecture;
- remain fully DRY.

Scattered communication implementations are forbidden.

## RENDERING PIPELINE

All rendering MUST use WebGPU.

This includes:

- UI;
- text;
- animations;
- media;
- effects;
- compositing;
- interaction layers.

DOM rendering MUST NEVER be the primary rendering engine.

Text rendering must:

- use WebGPU;
- maintain synchronized hidden HTML elements for:
  - accessibility;
  - editing;
  - styling;
  - system interaction.

## UI AND COMPONENT POLICY

UI must exclusively use Squirrel APIs and Squirrel component systems.

Direct DOM manipulation is forbidden unless explicitly authorized. Forbidden patterns include innerHTML, manual query selectors, string-generated DOM trees, and unmanaged UI nodes.

All UI elements MUST have unique ids, exist as canonical Atome objects or properties of existing Atomes, and remain fully traceable in the Atome structure. Anonymous UI elements and standalone unmanaged UI nodes are forbidden.

All system UI controls, including buttons, sliders, inputs, toggles, selects, tool buttons, palette items, ribbon controls, footer controls, projected tool controls, and equivalent primitives, MUST depend on the canonical Atome/Squirrel component code and on the canonical Atome system design definitions. They MUST NOT define or preserve a parallel source of truth in eVe-local factories, feature-local DOM builders, ad-hoc document.createElement code, local presets, or surface-specific styling contracts.

If a required system control does not yet exist in the canonical Atome/Squirrel registry, that control MUST be implemented or completed in Atome first and then consumed everywhere else. Recreating the same control in eVe panels, projections, ribbons, flowers, footers, palettes, dialogs, or tool-specific modules is forbidden.

Button, Slider, Input, Toggle, Select, and equivalent system controls MUST each have one owning implementation surface and one owning visual contract. Local wrappers may compose, configure, or place a canonical control, but they MUST NOT redefine interaction semantics, rendering behavior, geometry rules, state ownership, or styling tokens.

For product tool sliders, the canonical visual and interaction contract is the Intuition slider-tool pattern currently implemented around `eVe/intuition/shared/slider_tool_content.js` and consumed by the main ribbon/projection tool surfaces: a slider is first rendered as the same compact square tool surface as the other tools, expands on pointer down or touch down to reveal the manipulable slider content, and collapses back on pointer up or pointer cancel unless it is explicitly pinned by the interaction model. Any refactor, migration, or Atome/Squirrel promotion of slider controls MUST preserve this exact product-tool behavior instead of replacing it with a plain always-open range input.

Until that exact product-tool slider contract is promoted into the canonical Atome/Squirrel component registry, `eVe/intuition/shared/slider_tool_content.js` is the temporary reference implementation for behavior only. During that transition, all eVe slider-tool surfaces MUST consume that single shared runtime and MUST NOT recreate it locally. The target end state remains a canonical Atome/Squirrel owner for the slider-tool control, with eVe reduced to composition and placement only.

Product styling MUST NOT be maintained as a classic static CSS layer. Atome/eVe product design is JavaScript-driven: design tokens are JavaScript constants or JavaScript-installed CSS variables, presets are structured JavaScript definitions, DOM is created by JavaScript factories, and styles are applied through JavaScript object literals, structured style objects, or controlled style generators. Product HTML and product CSS must not become parallel static source-of-truth layers.

Allowed CSS exceptions are framework shell CSS when product-neutral, vendored library CSS, generated distribution CSS, and JavaScript-generated style tags produced by an approved structured design module and documented in maps/DESIGN_MAP.md.

Strictly forbidden: CSS template literals, HTML template literals, string-based CSS injection, and string-based HTML generation.

All styles MUST use JavaScript object literals or other declarative structured objects. Themes MUST be structured object definitions.
