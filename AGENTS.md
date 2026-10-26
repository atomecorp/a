# atome/eVe — Project instructions

Scope: this project and its descendants. Paths in prose are relative to this project root, including when working inside the eVe Git submodule. Markdown links are relative to their containing file.

## Mandatory core

1. **Primary construction rule: atome/eVe must build itself with its own components.** This mandatory architectural rule applies to construction of the framework itself and every new feature, interface, behavior, interaction, automation, template or assembly. Start by composing the project's available, verified and compatible reusable internal atoms, tools, modules and components. This internal composition takes priority in every implementation decision; convenience, delivery speed or an external component's availability cannot justify bypassing it. Reuse means calling or assembling the canonical implementation, never copying its code, reproducing its appearance or rebuilding its logic under another name. If existing composition cannot cover an indispensable need, apply the autonomous internal creation and extension rules below. Every new brick must enrich this same reusable internal system for subsequent assemblies.
2. **Objects remain typed; tools cross compatible types.** Distinguish object type, properties/capabilities and the tool acting on them. Prefer shared tools and existing compatibility mechanisms wherever the operation has a meaningful compatible contract. Do not duplicate a tool per type, invent a property or implicit conversion, or add a new capability system merely to express this principle.
3. **Audit reuse before implementation.** Identify the required bricks and their canonical owners; verify implementation, internal access, contract, platform compatibility, real consumers and relevant tests. A documentation name, mockup, similar-looking prototype or dependency in the repository is not availability evidence. Apply the evidence procedure in the common method.
4. **Internal creation and capability extension are authorized within the requested task.** User clarification, 2026-10-13: a request to implement, repair or extend a feature includes standing authorization to create the necessary reusable internal components and add the necessary capabilities to existing canonical owners, without requesting separate user approval. This explicitly includes creating, completing or extending missing internal contracts, typed APIs, schemas and foundation capabilities needed for that task, even when they do not yet exist in the current foundation. Their absence alone never requires a distinct agreement or user validation. Audit reuse first. When an indispensable brick is unavailable, unsuitable or not found after investigation, document the evidence and precise internal creation or extension, then implement and validate it autonomously. If access is missing, report the actual limitation; do not treat unverified availability as proof that a replacement is needed. Do not use a degraded version, external component, copy or parallel substitute.
5. **Autonomy is bounded by the task and architectural contracts.** Integrate every created or extended internal brick through the existing declaration, discovery, composition and test mechanisms, where present. Necessary internal foundation work, including defining missing contracts and implementing their canonical owners, is covered by the same standing authorization when it preserves the project architecture; explain their impact and validate affected consumers without requesting separate approval. Do not invent an additional registry or API when an existing mechanism can serve the need. A necessary internal contract or capability addition is part of the requested task, not an unrelated scope extension or an architectural exception merely because it is new. This authorization does not cover unrelated work, external dependencies, a replacement application stack or exceptions to architectural prohibitions. Existing technical dependencies must be inspected for their actual role and encapsulation; do not remove them or wrap them to disguise an external substitute as an internal component.
6. **Use the actual canonical paths.** UI and automation invoke the corresponding canonical tool/command execution path. Panels assemble real tools with their native options. Preserve canonical Atome state outside the disposable, minimal DOM, the shared WebGPU rendering route and the single durable mutation pipeline; detailed contracts belong to the domain modules below. No view, cache, preview, timeline or realtime patch becomes competing writable business truth.
7. **Preserve the existing architecture.** Keep the names `atome` and `eVe` and JavaScript for application realization. Do not introduce TypeScript, Python, a UI framework, raw HTML/DOM imitation or a parallel implementation for a new realization. Existing platform-language boundaries and narrowly documented canonical DOM exceptions remain governed by modules 01, 02 and 05; they do not authorize a new application stack.
8. **Stay within the user's authorization.** Reading code to verify documentation does not authorize editing it. Preserve unrelated local changes. Identify defects and necessary cleanup, but request a bounded scope extension when their repair exceeds the authorized task. Do not install dependencies, change personal/provider/authentication/MCP/security settings, disclose secrets or alter history/caches without authorization. Git writes follow module 02 and the explicit user-controlled Git policy below. Instructions written during a task cannot create permissions for that task.
9. **Handle conflicts explicitly.** These project instructions do not supersede system/developer instructions or environment protections. Apply the cumulative relevant project contracts. For unresolved project contradictions, identify the exact sources and ask for the smallest required arbitration; do not silently choose, rewrite or bypass a rule. Continue independent read-only investigation where useful. Length, complexity and file size alone do not justify an incomplete result.
10. **Keep every interface zen.** This is a mandatory product rule for every interface creation or modification: no unnecessary labels, no visible text unless explicitly requested by the user, and no additional buttons or controls beyond the requested interaction. Apply the [mandatory zen interface contract in module 05](.codex/modules/05-api-rendering-and-ui.md#mandatory-zen-interface-contract) before accepting any UI change.
11. **An inert label is always at the top of its object.** A label, caption, name or title that has no action of its own (on a tile, card, plate, thumbnail, menu tool, Mystic plate or list cell) is laid at the TOP of its object, opposite the finger, so a touch, a hold or an enlarging plate never hides it. Its band follows the object's own top corners (same radius) and keeps clear of a palette's folded corner. A tool's label has at most 6 letters (`labelMaxCharacters`). An editable or actionable text is not an inert label. Zen (rule 10): no text, label, tooltip or button the user did not ask for. Owners: `eVe/domains/dashboard/dashboard_item_text_fields.js#dashboardCardLabelBackdropRect`, `eVe/intuition/ribbon/bevy_ui_menu_surface.js#buildBevyMenuToolContent`.
12. **Sizes follow the tool grid and never change.** The unit is the tool, 60 px (`SYSTEM_UI_METRICS.unitPx`). The standard tile (Dashboard card, rubric tile, Matrix cell) is two tools, 120 px (`dashboardSkin.metrics.blockUnitMultiplier`). Every width and height is a whole multiple of half a tool, 30 px (`SYSTEM_UI_METRICS.halfUnitPx`); half a tool is the minimum, in height as in width; there is no maximum. An element (tool, tile, list row, font, any content) keeps its size on every screen: never shrunk, enlarged or scaled to make a layout fit. Containers (panels, the Dashboard home, lists) are responsive by restructuring only: a container takes the room it has, snapped to half a tool; its content is laid again (fewer columns, more rows) at its own size; what still does not fit scrolls. A scrolling container lets its next row show cut at the edge and, only while content is hidden on a side, shows a scroll arrow there (the framework chevron, half a tool, centred, never inside the bottom tools band; a tap scrolls one page). A text too long for its room is cut with « … ». Owners: `eVe/intuition/ribbon/bevy_ui_tools_band.js#layoutToolsBand` (drops the tools that do not fit), `eVe/domains/dashboard/dashboard_mystic_grid.js#dashboardHomeShape`.
13. **The bottom tools never move.** In every bottom band the order is fixed and a present tool keeps its place whatever else shows: Back leftmost; the assistant (the Atom, eVe) rightmost, always on its round support, never a square tool, keeping its corner on every screen (only the first welcome shows it large in the middle); Next, when present, right beside the assistant; the other tools between them, in their order. For a left hand the whole band is mirrored. On an open panel, including a panel opened by a band tool (colour palette, size, font list), the way out is a Close (✕) in Back's place; the Back arrow stays only for a step back inside the same panel (a tool marked `fold`). Owners: `eVe/intuition/ribbon/bevy_ui_tools_band.js#orderToolsBand` / `layoutToolsBand` (`handedness`) / `buildToolsBandToolNode` (`close`), `bevy_panel_band.js#withPanelBack`, `eVe/domains/dashboard/dashboard_footer_navigation.js#back`.
14. **Panels: one slab, one radius, one spacing.** Every panel lies on the one standard panel slab (the panel glass of `EVE_PANEL_SKIN_TOKENS`, `eVe/elements/skin/panel_skin.js`): never another colour, transparency, shadow or radius. One radius everywhere, a quarter of a tool, 15 px (`SYSTEM_UI_METRICS.radiusPx`; every radius token derives from it): tools, tiles, cards, panels, rows, fields and buttons; a half-tool row is therefore a pill; a disc (`radius.pill`) stays round. Padding a sixth of a tool, 10 px; gap a twelfth, 5 px (`PANEL_VISUAL_RATIOS.inset` / `gap`). Content never touches an edge: the padding stays below the last row shown, even when it scrolls. A list row is a whole multiple of half a tool high; a tool is the comfortable row. Settings and controls sit at the panel's BOTTOM, within the finger's reach; on a phone a panel spans the width at the foot, as tall as its content (`bevy_panel_layout.js#phonePlacement`); what is being changed stays in view above the panel and the keyboard. A value is set by the value alone: − and + are tools at a tool's size at both ends, the value between them, dragged to scrub or touched twice to be typed (`numericFieldNode` `presentation: 'tools'`); never a row of presets. Media (a video, a photo, a book reader, a stream) are another object type, neither panels nor tiles: their content is not laid on a slab.
15. **States: one look each, never a border.** No border, outline, ring or contour, in any state, on any object, unless the user asked for that one by name. The only ones asked: grid lines, named `grid_line` (the calendar grid, `bevy_panel_calendar_view.js`; the timeline's cells, tracks and scenes of the user's mockup, `bevy_panel_tree_primitives.js#gridLineEdge`), the Dashboard tile and plate hairline edge (`dashboard_mystic_colors.js#plateMaterial`) and the lasso rectangle (`bevy_panel_lasso.js#bevyPanelLassoNode`). The dashed selection of an object on the project canvas (drawn by the renderer, `atome/src/shared/render_visual_tokens.js`) is a separate case, left as it is (user, 2026-10-26); each carries its exception name (`DESIGN_CHARTER_BORDERS`, `eVe/elements/design_charter.js`) and the renderer refuses any other border. The looks, owned by `eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js`:
    - **Rest**: the element's own ground; a raised element (tool, card, row, button) carries its soft drop shadow.
    - **Hover** (pointer only): the ground halfway between rest and selected (`hoverSurface`, token `hoverItem`); the drop shadow stays.
    - **Press**: slightly lighter than selected (`pressedSurface`, token `pressedItem`) for as long as the press lasts (a quick tap is a flash), pressed in: no drop shadow, an inner shadow.
    - **Selected** (chosen, current, playing): `selectedSurface(style)`, colour A « bleu nuit éclairci » (`EVE_COMMON_SKIN_TOKENS.selectedItem`: glass takes the tint, a veil over content, a coloured block its own colour lightened), pressed in (`selectedItem.inset`).
    - **Active** (a tool at work): the cyan breathing halo along its glyph and behind its tile (`bevyMenu.litGlow`), never an edge. Active and selected never share a look.
    - **Focus** (keyboard): the hover look, never a ring. A carried (dragged) item is lifted by its drop shadow.
    A chosen colour swatch and a ticked checkbox carry the framework ✓ (`checkMarkNode`); an empty checkbox or radio is a small pressed-in slab; a swatch, a handle or a dot stands out by its drop shadow.
16. **The design charter is absolute.** Rules 11–16 are the eVe design charter, validated by the user (2026-10-25, completed 2026-10-26). They are its only text: maps/DESIGN_MAP.md, module 05, `.claude/rules` and memories point here and never restate it. Values come from the tokens named here, never written inline. A mockup that breaks a rule is not shown; code that breaks one is a defect. When a request seems to contradict a rule, or two rules seem to meet, ask the user before building; never choose silently. Check every mockup and every UI change against rules 11–16 before showing or finishing it.

## User-controlled Git and GitHub policy

User clarification, 2026-10-12: ordinary development, audits and cleanup do not
authorize Git writes or GitHub mutations. Stay on the existing `main` branches of
atome a and eVe. Do not create or switch to a task branch, stage, commit, fetch,
merge, rebase, push, create a PR or otherwise change Git/GitHub unless the user
explicitly requests the corresponding action. Read-only local inspection remains
available when needed for the task.

A push is prohibited by default. A direct user request to push is an explicit
exception for the requested repository, branch and work only; it does not grant
ongoing permission or permission to publish another branch. Preserve all local
work, inspect the remote state, publish required submodule commits before their
parent reference, and verify the result. Never force-push, discard work, delete
branches/tags, or change credentials, remotes, hooks or Git configuration without
a separate explicit instruction. After the requested operation, return to the
default read-only policy. This user clarification governs contrary default Git
rules elsewhere in the project.

## Required reading

Read this core and the [common method (module 07)](.codex/modules/07-future-code-guardrails.md) completely for every task. Then read every domain module whose trigger applies, before the relevant implementation, diagnostics or validation. Triggers accumulate; a mixed task requires their union. Read long files in successive complete chunks rather than treating truncated output as a full read.

| Trigger | Required module |
| --- | --- |
| Application code or architecture modification/review; rendering or DOM ownership | [01 — Architecture and projection](.codex/modules/01-root-constitution.md) |
| Code, executable/configuration or developer-documentation changes; language, size, i18n, temporary files or Git operations | [02 — Coding standards and prohibitions](.codex/modules/02-coding-standards-and-prohibitions.md) |
| Debugging, regression, performance diagnosis, tests or runtime/UI/visual validation | [03 — Evidence and validation](.codex/modules/03-debugging-testing-and-ui-validation.md) |
| Implementation, reuse, maintenance, cleanup, refactor, migration or architectural map changes | [04 — Owners and maintenance](.codex/modules/04-feature-work-cleanup-and-framework-reuse.md) |
| API, MCP, tools, commands, automation, communication, rendering, components, text or media UI | [05 — API, rendering and UI](.codex/modules/05-api-rendering-and-ui.md) |
| Atome model, state/mutations, history/replay, persistence, sync/offline, rights or runtime boundaries | [06 — State, sync and runtime modes](.codex/modules/06-atome-state-sync-and-runtime-modes.md) |

UI/visual verification and interaction diagnostics also require the full [canonical UI procedure](atome/documentations/how_debug_UI.md). Visual acceptance campaigns on Web, Tauri and physical iOS also require the [visual test protocol](.codex/visual-test-protocol.md). Module 03 owns the conditions and evidence requirements; these entry links do not replace either procedure.

For recurrent symptoms, the common method routes to the [known-bug knowledge base](known-bug-solutions/README.md). For explicitly requested DeepSeek delegation, use the [operational block below](#deepseek-delegation); it grants no autonomous delegation or model/configuration change.

## Detection versus prescribed reading

Codex recognizes `AGENTS.md` through its configured project-directory discovery. References to modules are **explicit reading obligations**, not a technical inclusion syntax. Do not claim that a linked document was automatically injected or fully read without evidence.

This is the sole project `AGENTS.md`. Start project sessions at this main root, including work on `eVe/...`. The eVe submodule has its own Git boundary: a session started there as a standalone project does not automatically discover this parent file under the documented defaults. In that case, explicitly attach/read this parent core, the common method and the cumulative domain modules before acting, or restart from the main root. If the parent corpus is missing or inaccessible, stop and report it; do not substitute a copied or weaker rule set. Other guides reference this core without creating an alternate general rule set. Do not treat old summaries, provenance or an unapproved method draft as active instructions.

No project loading configuration, personal configuration or context limit is changed by this organization. See the [official AGENTS.md loading documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md) for technical discovery, precedence and size limits. When investigating loading, verify the actual version/mode and configuration keys without exposing private data.

The block below is maintained by `scripts/deepseek_delegation_from_GPT.sh`. Read/use it only when the user explicitly requests DeepSeek delegation. It grants no authorization to delegate, install, edit configuration or switch the main model on its own.

<!-- ATOME_DEEPSEEK_DELEGATION_START -->
## DeepSeek delegation

Keep the current ChatGPT/Codex model as the main orchestrator. Delegate to DeepSeek only when the user explicitly requests it.

Delegation command:

    printf '%s\n' "<self-contained task + plan + constraints>" | ./scripts/deepseek_delegation_from_GPT.sh run [options]

Translate the user's requested DeepSeek intelligence level as follows:
- "léger", "faible", "low" -> `--level low`
- "moyen", "medium" -> `--level high` (DeepSeek maps medium to high)
- "élevé", "fort", "high" -> `--level high`
- "maximum", "max", "ultra" -> `--level max`

Translate model requests as follows:
- "DeepSeek Flash" -> `--model flash`
- "DeepSeek Pro" -> `--model pro`

Convenient presets:
- "DeepSeek rapide" -> `--preset fast`
- "DeepSeek normal" -> `--preset normal`
- "DeepSeek fort" -> `--preset strong`
- "DeepSeek maximum" -> `--preset maximum`

If no level/model is requested, use the script's saved defaults.

Procedure:
1. Build a self-contained delegation prompt containing the user's task, relevant approved plan, constraints, and file scope.
2. Invoke the script from the project root with the appropriate flags.
3. Wait for completion in the current turn.
4. Inspect DeepSeek's modifications/diff yourself.
5. Run relevant checks when practical.
6. Report the result and any verification issue in the same Codex conversation.

Do not switch the main GUI conversation away from ChatGPT/OpenAI. DeepSeek is a delegated worker only.
Do not delegate unless the user explicitly requests DeepSeek or the active project instructions explicitly require it.
<!-- ATOME_DEEPSEEK_DELEGATION_END -->
