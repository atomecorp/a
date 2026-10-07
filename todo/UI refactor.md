# UI refactor — cleanup and shared design ownership

Date: 2026-10-06  
Status: Planned; this document does not start implementation.

## Objective and initial scope

Simplify atome/eVe by composing its existing canonical UI components, centralizing genuinely shared styles and removing demonstrably unused or retired code while preserving the established design and behavior.

Start with the first-launch workflow and its shared components. Use this bounded lot to verify the approach and refine the estimate before expanding to the whole framework.

Source baseline: [UI audit summary](../eVe/documentations/UI_elements/UI_components_audit.md), [component inventory](../eVe/documentations/UI_elements/UI_components_audit.csv) and [shared style contracts](../eVe/documentations/UI_elements/UI_shared_styles_audit.csv). Revalidate this dated working-tree snapshot before implementation.

## Recommended sequence and indicative effort

| Step | Work | Indicative effort |
| --- | --- | --- |
| 1 | Connect Templates to the appropriate existing standard components. Address the first-launch creation-card material and grid-spacing discrepancy through canonical owners. | A few hours |
| 2 | Centralize identical values where shared ownership is confirmed. Preserve separate family contracts and explicit variants. | A few hours to one day |
| 3 | Replace duplicated implementations with calls to the existing canonical components and tools. | One to several days |
| 4 | Remove code made redundant by the preceding changes, after checking dependencies and public consumers. | A few hours after verification |
| 5 | Compare appearance and interactions before/after on Web, Tauri and iOS, using the project's existing UI and visual validation procedures. | One to several days |

For the whole framework, expect several days of work. These are provisional effort ranges, not a delivery commitment or an additive schedule: verification and corrections can take as much time as the edits. A more precise estimate requires a bounded first lot and confirmation of runtime/device availability. The first-launch scope should be shorter than the framework-wide campaign.

## Cleanup safeguards

- Do not bulk-delete components based only on HTML implementation, a name containing "legacy", or absence of a static call.
- Distinguish explicitly retired presentations, unused definitions, exported public APIs, registered components and conditional/platform-specific paths.
- Before removal, verify dynamic invocation, registration, boot loading, public entry points, platform and synchronization dependencies. Preserve current bridges and Bevy replacements when only the former HTML presentation is retired.
- Retain indispensable existing DOM boundaries such as text editing, embedded media, the code editor and emergency UI until their actual owners and usage have been verified.
- Remove small, reviewable lots; run the relevant checks after each lot. Unknown usage is an investigation item, not proof that deletion is safe.

## Factorization safeguards

- Reuse the actual internal implementation; do not copy its code or reproduce its appearance under another name.
- Centralize by established component family: panel controls, Dashboard cells, tools, Mystic and other verified owners. Keep their intentional differences and explicit variants.
- Treat equal literals as duplicated values until shared intent and ownership are established. A shared shadow alone does not establish an identical complete material.
- Preserve backgrounds, tint, blur, shadow layers and inset highlights, borders, radii, geometry, spacing, typography, text colors, selection and interaction states, animation and transitions.
- Use existing declaration, discovery, composition, tool execution and mutation paths. Do not introduce another registry, layout system, renderer or style architecture.
- Stop and request precise authorization if an indispensable internal component or foundation extension is genuinely missing; document the evidence and bounded proposal.

## Completion evidence

- Record the owner, consumers, scope and reason for each replacement or deletion.
- Run applicable functional checks, including state preservation and interruption/restart behavior where affected.
- Validate representative default, selected/on/off, pressed, focused, disabled, loading/error and expanded/collapsed states, plus relevant viewports and native interactions.
- Apply the [canonical UI procedure](../atome/documentations/how_debug_UI.md) and [visual test protocol](../.codex/visual-test-protocol.md). Source inspection and headless tests do not establish visual parity.
- Report unavailable platform checks and remaining uncertainties explicitly; do not claim complete acceptance without the required evidence.
- Update architecture maps when an actual owner or contract changes, and FRAMEWORK_STATE when implementation or verification produces new framework facts. Preserve unrelated local work; Git remains read-only without a separate explicit integration request.
