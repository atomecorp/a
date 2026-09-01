# Communication Notifications And Publications Debug

## Objective

Repair and validate the canonical Communication flow without changing unrelated panel behavior. A subjectless `Hello` sent to an enabled recipient must create one durable unread notification, project it in the Communication panel, and expose it through the animated Communicate main-menu item.

## Locked Product Contract

- `All` is permanent, disabled by default, gray while disabled, and green while enabled.
- A manually added recipient is enabled by default and can be disabled, re-enabled, or removed.
- Disabled recipients receive no message, attachment share, notification, or publication delivery.
- Sending with no enabled recipient fails explicitly.
- Subject is optional and remains empty end to end.
- The Communicate tool widens through the canonical BevyUI main-menu width owner, shows the newest unread summary and total unread count, cycles queued unread summaries, and collapses when none remain.
- Enabling `All` creates one durable Dashboard News publication visible to the public audience and its author. The author does not receive a self-notification.
- The attachment target accepts canonical Atome, Molecule, and Project drag payloads. Its `+` control is visible and disabled in this scope.
- Advanced content is absent until the footer Advanced action is enabled. Conditions is a direct subsection of Advanced, not a peer section or nested accordion.
- Visio, Send, Search, and all unrelated Communication behavior remain unchanged.

## Canonical Owners

- Communication notification persistence and synchronization remain in `communication_notifications.js` and the existing WebSocket/ADOLE path.
- Communication panel state and projection remain in the existing `bevy_panel_comm_*` modules.
- Main-menu unread presentation extends the existing BevyUI menu runtime and its external-width mechanism; no DOM badge or proxy is allowed.
- News uses the existing Dashboard generic `record` contract with `source_domain: "eve.dashboard"` and `category_id: "news"`; no social-feed store or renderer is introduced.
- All visible business writes use the existing Atome commit pipeline and server permission projection.

## Test-First Execution Order

1. Add focused failing contracts for recipient enablement, optional subject, no-enabled-recipient refusal, Advanced visibility, Conditions nesting, unread projection, News creation, and the three attachment kinds.
2. Reproduce the subjectless two-user send and inspect browser, Fastify, WebSocket, notification-stack, panel, and main-menu evidence.
3. Correct only the evidenced owning layers, then rerun the same narrow tests.
4. Run a real two-account Web-to-Web visual journey with pointer-driven BevyUI interactions and pixel captures.
5. Run syntax, component-reuse, DOM/WebGPU, server, and M0 guardrails relevant to the touched paths.

## Visual Acceptance

- Recipient B receives exactly one unread `Hello` row after sender A sends with no subject.
- The Communicate tool widens visibly, displays `Hello` plus the unread count, cycles additional unread summaries, and collapses after all are read.
- `All` and individual recipient controls visibly switch between gray/off and green/on.
- A public send creates one News card containing the author, date, and message summary for recipients and author without duplicate cards.
- Real drag gestures attach an Atome, a Molecule, and a Project to the compose target.
- Advanced and Conditions have no visible records while Advanced is off and both appear only after the footer action is activated.

## Runtime Boundary

Web-to-Web with two disposable authenticated users is required for completion. Tauri and iOS remain separately reported as unverified unless their real lanes are executed.

## Progress

- Status: Web implementation and targeted acceptance complete.
- Source tests: 80 focused Vitest contracts pass; syntax, M0, whitespace, and the disposable two-user server probe pass.
- Two-user visual evidence: subjectless durable `Hello`, unread tool expansion/count, panel unread/read transition, gray/green `All`, direct Advanced/Conditions, persistent News, disabled `+`, and real Project drag/drop pass with disposable Alice/Bob accounts. Canonical Atome and Molecule routing pass focused executable contracts; their separate visible pointer journeys were not run.
- Execution-order audit: this task is registered; the repository audit still reports 35 unrelated historical missing/unregistered todo references.
- Tauri: not run.
- iOS: not run.
