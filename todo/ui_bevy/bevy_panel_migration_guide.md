# BevyUI Panel Migration Guide

## Purpose

This guide is the execution ledger for migrating active eVe HTML panels to the
shared BevyUI/WebGPU panel route. A stage may advance only after its acceptance
criteria have been validated. On programme completion, move this file to
`done/ui_bevy/bevy_panel_migration_guide.md` and remove every Panel Lab
implementation artifact.

This file is Priority 1 in `todo/execution_order.md`. No later todo may displace
its current gate unless the product owner explicitly changes that order and
both documents are updated first.

## Active surface scope

The canonical panel registry has 16 entries, and all 16 are in scope for final
product-panel migration: home, contact, info, finder, communicate, delete,
undo, paste, timeline, calendar, background, couleur, size, font, detail, and
layer. Five are `validated` as of 2026-08-08 — contact, home, calendar, info,
and finder. Communication, Size, and Font are technically migrated and
`acceptance_pending`, leaving **8 panels requiring implementation**. Timeline also routes through BevyUI
already; that route is not evidence that its product-panel migration is
complete, and the Timeline product panel is intentionally the final migration
in this programme.
The Finder map is a Finder feature, not an
extra panel surface: it ships **with** the Finder panel, drawn natively in the
canvas, and its provider stays swappable behind one constant — see
`finder_place_map_package.md`. It was briefly recorded here as blocked, and that
turned a hard-to-port piece into a removed feature; the ordering rule that
mistake produced is in that package document and is binding on every panel.
Molecule / MTraX capabilities are also
reviewed only with their owning product migration, never inferred as generic
Panel work.

## Status vocabulary

Use exactly one status per stage: `planned`, `in_review`, `validated`, or
`superseded`.

Product-panel workstreams use a separate, additional state vocabulary —
`active`, `acceptance_pending`, `validated` — defined in *Parallel
product-panel workstreams*. It describes slot occupancy only and never replaces
a stage or package status. A package that is `acceptance_pending` as a
workstream remains `in_review` as a package until it is approved.

## Migration packages and reusable style system

The programme has two non-overlapping delivery layers:

1. **Shared visual-component migration** creates reusable WebGPU presentation:
   canonical builders, measured layout, localized labels, skin tokens, and
   idle/hover/pressed/focused/selected/disabled visual states. It may use
   ephemeral specimen state solely to demonstrate those states, but it must not
   fetch product data, implement a product workflow, call a domain API, map an
   MCP command, mutate canonical state, or compose a named product panel.
2. **Product-panel migration** composes those approved visual components in one
   routed panel and connects their generic user intents to the existing
   canonical data owners, command paths, mutation pipeline, and effect ledger.
   It must reuse the shared builders and named skin tokens; it must not redraw
   a local copy of a component or introduce a panel-local style palette.

A package may cover several components when they serve one visual language or
one product panel. This replaces the former one-component approval gate.

Every shared component still requires its own canonical presentation owner,
native-widget decision, focused visual contract, and real-canvas interaction
evidence. Its interface emits generic user intent only. MCP mapping is required
only in the product-panel package that assigns a domain meaning to that intent.
A package receives one product-owner review only after the checks applicable to
its delivery layer pass. A rejection returns only the failing component, token,
or panel binding to repair; it does not block unrelated work in the same
package.

Before implementing a package, apply the relevant layer rules:

1. Verify the legacy panel occurrences, measured geometry, canonical owners,
   native BevyUI vocabulary, and existing Atome/Squirrel contracts. An eVe
   tool, Molecule, or MTraX surface is not panel evidence.
2. Create or extend one named shared token group in
   `EVE_PANEL_SKIN_TOKENS.bevyPanel` for styles genuinely missing from the
   existing system. The group must state its consumers and reuse existing
   tokens wherever possible; a panel-local palette, duplicate builder, or
   temporary style shim is forbidden.
3. Record the package's components, reused builders, new token groups,
   interaction states, target panel, and acceptance criteria. A shared visual
   package records no MCP or product-data ledger impact. A product-panel package
   additionally records its canonical data owners, MCP-command ledger impact,
   and mutation path. Report current execution-order, component, panel, and
   legacy-route counters before implementation.
4. A shared visual package implements only reusable presentation through the
   canonical BevyUI builders and named tokens; Panel Lab may show a compact
   representative matrix. A product-panel package composes those existing
   builders in its routed target panel and binds its domain intents through the
   canonical Atome/Squirrel owners. It need not wait for a separate
   product-owner approval after each consumed component.
5. Run focused contracts for every changed component, then the package
   integration tests and real browser interactions on the shared canvas. Verify
   the relevant Panel Lab open/close/reload contract whenever Lab changes.
6. Present a shared visual package in Panel Lab or its approved specimen route;
   present a product-panel package in its routed target panel. Preserve its
   evidence, canonical builders, tokens, generic intents, and reuse decision in
   this guide. Preserve product data, mutation, and MCP evidence only for the
   product-panel layer.

The package order is a delivery plan, not a requirement to finish one component
approval before beginning the next. Up to two product-panel packages may also
progress at the same time under the two-slot rule in *Parallel product-panel
workstreams*. Mobile, Tauri, iOS, and multi-viewport
validation remain complete-panel gates and do not delay component work.

## Stage 1 — Empty panel foundation

Status: `in_review` — visual approval captured; the repository-wide
execution-order gate remains blocked outside this component's scope.

Scope: `PanelRoot` only, rendered by the temporary development-only Panel Lab
surface on the shared project canvas.

Style sources audited:

- `eVe/elements/skin/tokens.js` (`EVE_COMMON_SKIN_TOKENS.bevy.systemSurface`)
- `eVe/elements/skin/panel_skin.js`
- `eVe/elements/system_ui_tokens.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js`

Accepted contract:

- Bevy panel tokens are derived from `EVE_PANEL_SKIN_TOKENS.bevyPanel`.
- The panel shell, ribbon tools, Flower and contextual Atome edit chrome consume
  the immutable system material. The panel alone owns its backdrop and external
  shadow. Its footer covers scrolled content with the same system-surface
  background and backdrop blur, but deliberately omits the external shadow.
- The visible panel uses the shared canvas and no visible panel DOM.
- The lab is opened and closed through the normal panel route only.
- The empty body intentionally contains no product component.

Validation required before status becomes `validated`:

- focused automated tree and skin-token tests;
- real canvas open/close inspection in development/test mode;
- no browser console errors;
- visual approval in the integrated browser of the shared translucent backdrop
  surface, radius, and centered external GPU drop shadow with transparent
  interior.

Validation record: the empty Panel Lab shell and its shared footer were reviewed
on the desktop canvas. The user explicitly requested that component integration
resume after the footer Close control was corrected and visually approved.
No mobile check is required before component integration.

## Stage 2 — Panel system behavior

Status: `validated`

The footer reuses the existing Bevy contextual Atome-edit visual contract from
`atome_contextual_edit_model.js` and `BEVY_MENU_TOKENS`: left resize handle,
close, drag/title region, then right resize handle. There is no passive header.

Validate close, drag, each resize handle, and scroll separately. Geometry
remains ephemeral runtime state in the Bevy panel owner and must not be stored
in the DOM or persisted without an identified canonical owner.

The corrected footer and inertial-scroll visual contract is validated. Drag,
both resize handles, clipping, scroll release and reset retain separate
interaction checks as permanent regression coverage.

Overflow implementation record — 2026-07-24:

- `BodyViewport`, translated `BodyContent`, and `FooterControls` remain one
  shared BevyUI tree; the footer is a fixed sibling at the panel bottom.
- Shared layout code computes natural content height, bounded vertical offset,
  and inherited viewport clips for both projection and hit-testing.
- Wheel/trackpad input targets the nearest scroll ancestor. A vertical pointer
  drag beyond `8 px` cancels its child control and becomes the scroll gesture.
  Releasing that drag continues with bounded, friction-based inertia. Scroll
  offset, sampled velocity and animation-frame state are ephemeral per
  tree/area and are cancelled/reset on unmount.
- The Virtual Scene carries one axis-aligned `clip_rect` on spawn and transform
  updates. The shared Bevy renderer crops sprite geometry, UVs and associated
  shape-shadow textures; fully out-of-viewport records are omitted from
  projection and hit-testing.
- The footer background/backdrop pair, inertial velocity/friction values and the
  `3 px` auto-hidden scroll thumb are panel-skin tokens. The footer pair aliases
  the common panel/tool system material and does not create a second shadow.
  Desktop size stays at least `240 × 120 px` when the surface permits.
- The visible product route remains the existing WebGPU overlay. Native WASM
  BevyUI stays opt-in and inactive, with no DOM mask or fallback renderer.

The product owner explicitly approved this overflow/footer treatment on
2026-07-24 after the integrated-browser blur and release-inertia evidence.

Technical evidence — 2026-07-24:

- focused Panel/layout/runtime/projection contracts pass `54/54`; Bevy core
  library tests pass `67/67`; Web and Tauri renderer crates compile;
  `check:syntax`, `check:m0`, and `check:execution-order` pass;
- a fresh WebGPU bundle was exercised in the integrated browser with real
  pointer input: short resize to overflow, wheel scroll to the bottom, drag
  takeover from a button, activation after scrolling, footer drag, second
  resize, fullscreen/restoration, close/reopen reset, reload/reopen, and an
  empty browser warning/error console;
- real release-time and settling captures show that content continues after the
  pointer is released and decelerates to the bounded bottom offset; a
  contrasting Dashboard colour boundary behind the fixed footer is visibly
  diffused by the shared backdrop while the footer controls remain legible.
  Close/reopen restores the top offset. The thin thumb appears only while the
  overflowing body is active.

## Stage 3 — Shared components

Status: `in_review` — every reviewed component position is now `validated`
(text, separator, icon action button, input, list/row, accordion, select,
checkbox/radio/toggle, table/property grid: 9 of 10, approved 2026-07-27). The
tenth position, the tool slider, remains `deferred` by product-owner decision
because no panel needs it. The stage therefore has no component work left; it
stays `in_review` only until the non-deferred composition reviews below
(Calendar, then Contact) confirm that the approved builders cover a routed
surface.

Validate the reusable style system and each component's focused contract within
its migration package. Panel Lab may show a representative matrix in this order: text,
separator, icon action button, input, list/row, slider tool when a product panel
actually needs one, accordion, select,
checkbox/radio/toggle, and table/property grid. A separator is an optional
product-composition component. Every component must choose the strongest
available BevyUI widget route as its rendering primitive, use the shared panel
skin, and emit generic intents only. Direct native/WASM widget use is preferred
when it is available; an unavailable native route must be recorded with evidence
rather than silently emulated. This stage owns no product data, workflow,
mutation, MCP command, or named-panel composition. Panel Lab and product
surfaces must configure or compose the canonical BevyUI/Atome/Squirrel
component; they must never recreate a widget with local drawing, interaction,
state, or styling code. Each approval record must include the component's
BevyUI integration decision and state whether the native/WASM widget route was
available, used, or unavailable with evidence.

### Shared tool-control interaction prerequisite

Status: `planned`

This prerequisite does not add an eleventh component and does not authorize
multiple specimens in Panel Lab. It makes the required interaction contract
explicit across the existing `tool button` and `checkbox/radio/toggle`
positions in the ten-component sequence. Before an interactive product control
is migrated, its component record must select exactly one of these semantics:

- `momentary`: the control is visibly pressed only between real `press` and
  `release`/`cancel`; it emits its activation only when released on its target
  and does not retain selection;
- `hold`: the control starts its declared action on `press`, retains the pressed
  appearance while the pointer is held, and stops on `release` or `cancel`;
- `toggle`: activation changes one selected value between off and on; the
  selected value belongs to the feature's identified canonical state owner,
  never to the DOM or a generic button singleton;
- `radio`: two or more controls in an identified group share one selected
  value; activating a choice selects it and deselects the other choices, while
  activating the current choice does not clear the group selection;
- `checkbox`: independent multiple-selection controls use the same explicit
  canonical-state rule and are not substituted for a radio group.

Every interactive tool contract must also specify and verify the complete
visual-state matrix: idle, hover, focus, pressed, selected where applicable,
and disabled. Pressed and selected are distinct states. The shared Bevy tool
surface must provide the visual treatment; panel code must not redraw a local
button. The pressed treatment must visibly read as depression by adjusting the
shared exterior shadow and surface treatment. The selected treatment may use a
small semantic accent tint and rim. A green accent is opt-in for a feature with
that semantic meaning; it is not the global default for an on state. Exact
paint, shadow, icon, label, and focus tokens remain subject to the
component-specific product-owner approval gate.

The current in-review `tool button` is the latching `toggle` member of this
matrix. Its correction must reuse the shared menu top and bottom content
padding so its label aligns with the main ribbon; it must visibly depress while
pressed, switch on and off only after activation, and reset its ephemeral Lab
state when the surface closes. The later
`checkbox/radio/toggle` component position validates the selected and group
transitions. Each contract must prove its declared transitions with real canvas
press, release, cancel, and activation input, focused contracts, and the
canonical overlay hit-test when that runtime diagnostic is available.

### First specimen contract — static body text

The first Lab specimen is one static body-text node. Its contract is fully
fixed before implementation:

- builder: the shared `textNode` from `bevy_panel_tree.js`; no Lab-local text
  factory;
- localized content: `Texte de démonstration` in French, with the equivalent
  string provided through the normal eVe localization source for every
  supported locale;
- geometry: `200 × 24 px`, placed by the existing body flow at the body
  top-left after the canonical `10 px` panel padding;
- typography: `16 px`, weight `500`, line height `19 px`, left aligned and
  vertically centered;
- paint: `BEVY_PANEL_TOKENS.colors.text`, transparent background, no border,
  radius, shadow, icon, diagnostic label, or state decoration;
- behavior: static and non-interactive, with no event handler, mutation,
  diagnostic counter, duplicate text, separator, or second component at its
  initial approval gate;
- content must fit on one line in the specimen box; wrapping, truncation, and
  editable-text behavior are outside this specimen and cannot be introduced
  implicitly.

`bodyTextSizePx`, body-text weight, and body-text line height must be canonical
panel skin tokens before the specimen is mounted. The active overlay projection
currently forces text records to weight `700` and centered alignment; the text
integration must repair that shared projection so it consumes the node's
canonical `font_weight`, `line_height`, and `text_align` values. A Lab-local
visual offset or a special text rasterizer is forbidden.

Acceptance requires exactly one visible text record, exact token reuse, no
visible DOM text, focused tree/projection tests, real-canvas inspection at
normal scale, and explicit user approval of the typography and placement.

Validation record — 2026-07-23:

- Approved by the product owner after integrated-browser inspection.
- Canonical builder: `textNode` in `bevy_panel_tree.js`; tokens:
  `bodyTextSizePx`, `bodyTextWeight`, and `bodyTextLineHeightPx` from the
  shared panel skin; intent: none.
- Evidence: `npm run test:run -- tests/eve/bevy_panel_contract.test.mjs`
  passed (6/6); `npm run test:run --
  tests/eve/bevy_ui_main_menu_contract.test.mjs` passed (32/32); syntax,
  M0 guardrails, and execution-order audit passed. The real shared canvas
  showed one static text record with no visible DOM text; short open/close and
  post-reload reopen passed with no browser warnings or errors.
- Reuse decision: all panel body text uses this shared builder and its panel
  skin tokens. Lab-local text factories, offsets, and rasterizers remain
  forbidden.

### Second specimen contract — horizontal divider

The separator is approved as the second shared specimen:

- builder: shared `dividerNode` in `bevy_panel_tree.js`; no Lab-local factory;
- geometry: native `1 px` horizontal height and automatic body-width stretch
  after the canonical `21 px` left and right margins;
- paint: `BEVY_PANEL_TOKENS.colors.divider`, system white at 25% opacity;
- behavior: passive and structural only, with no text, interaction, state,
  mutation, border, radius, shadow, or local size override.

Validation record — 2026-07-23:

- Approved by the product owner after integrated-browser inspection.
- Canonical builder and tokens: `dividerNode`, `colors.divider`, and
  `dividerMarginHorizontalPx` from the shared panel skin; intent: none.
- Evidence: focused Panel Lab and projection tests passed; the projection
  contract resolves a `420 px` body with `10 px` padding to `358 × 1 px` at
  `x = 31 px`. Syntax, M0, main-menu contract, and whitespace checks passed.
  The real shared canvas showed the divider, short open/close and
  post-reload reopen, with no console warnings or errors.
- Reuse decision: approved Lab specimens now remain mounted cumulatively in
  chronological body flow. The text specimen remains visible above this divider
  for every later component review.

### Third specimen contract — icon action button

Status: `validated`

- Decision: the former `60 × 60 px` icon-plus-label specimen is a ribbon tool,
  not a panel action button. It is superseded before approval and is not a
  reference for this component. Tool active-state design remains out of scope.
- builder: one shared BevyUI icon-button builder and one shared button skin;
  Panel Lab only composes its declared variants and must not draw local button
  paint, shadow, icon, or label treatments.
- native contract: BevyUI `icon_button` is the available normalized widget
  kind. The product Web route remains the existing shared WebGPU overlay route;
  native WASM UI operations remain opt-in and inactive, so no second UI path is
  introduced.
- geometry: the interactive square is `30 × 30 px`; it is exactly half the
  former tool width and height. Its icon is centered and it has no visible
  in-square label. A localized text label is a separate sibling placed on the
  right, with `labelGapPx: 8`. Panel Lab sets its body flow gap to `0`; every
  specimen divider carries `specimenDividerMarginPx: 8` above and below, so
  the vertical rhythm is explicit and never written locally as a literal.
- paint: both rest and active surfaces are opaque. The shared button palette
  defines neutral/blue, success/green, warning/orange, and danger/red semantic
  roles. Rest mixes each declared semantic role into the shared opaque system
  surface through `restToneMix: 0.72`, without inheriting the translucent
  surface backdrop. Pressed scales the RGB channels of that role-tinted rest
  background through `pressedLuminanceLift: 0.16`, preserving its hue instead
  of adding gray, then applies its own diffuse shadow and `1 px` downward
  translation. Active selection mixes the declared semantic surface toward its
  accent through `activeAccentMix: 0.34`, remains opaque, and uses its own
  diffuse shadow. Every semantic tone exposes its own rest/pressed/active
  shadow, icon-color, and label-color variables; their current values all
  reference the shared system-content and state-shadow tokens, so this added
  skinning granularity does not alter the approved rendering. The label uses the
  normalized `text_vertical_align` plus `text_offset_y` (`+1 px`). Bevy 0.19
  has no native inner-shadow field, so this contract does not emulate one with
  geometric bands or embossing.
- variants approved together as the one button-component test contract:
  `momentary` activates only on release and never remains selected; `hold`
  begins on press and ends on release/cancel; `toggle` alternates one ephemeral
  selected value; `radio` shows two choices in one exclusive ephemeral group.
  All Lab state resets on close and emits only `panel_lab.icon_button.*`
  ephemeral intents. No product mutation, persistent setting, counter, or
  diagnostic content is allowed.

Validation required before status becomes `validated`:

- focused contracts for exact 30 px geometry, sibling labels, shared palette,
  token-owned separator/label spacing, text vertical alignment, i18n, no
  visible DOM, real canvas press/release/cancel/activate transitions, exclusive
  radio selection, and panel-close reset;
- regression proof that the existing main-menu tool builder is unchanged;
- real-canvas open, close, long-press reload, reopen, and real interaction for
  every declared variant; and
- explicit product-owner visual and behavioral approval.

Technical evidence on 2026-07-24: a fresh Tauri current-resource run showed
the four distinct opaque rest tones; real native pointer input captured the
brighter momentary and hold states during pressure, two-click toggle
activation/deactivation, exclusive Radio A/B replacement, close/reopen reset,
and post-reload reopen. The product owner explicitly approved the visual,
behavioral, spacing, and tokenized skinning contract on 2026-07-24. This third
shared component is therefore `validated`; its builders, tokens, intents, and
evidence remain the canonical reference for later panel compositions.

### Fourth specimen contract — text input

Status: `validated`

- Contract: one localized, single-line `358 × 32 px` `text_input` follows the
  approved text, divider, and icon-action specimens. Its draft is runtime-only,
  begins empty, and resets on close/reopen or reload; blur/Return preserve the
  displayed runtime value but never emit an Atome mutation or MCP command.
- Ownership: `atome/src/squirrel/components/input_contract.js` owns the
  renderer-neutral Input presentation contract; `text_editing_session.js` and
  `text_editing_layout.js` own the one active keyboard/selection/caret session
  and glyph-coordinate layout; `bevy_panel_tree.js` owns the shared visible
  builder; Panel Lab only composes these owners.
- Interaction: while the empty field is not focused, it displays its localized
  placeholder. Focus hides that presentation text immediately, leaves the
  runtime value empty, and places a visible caret at index `0`. A user-entered
  value is never cleared by a later focus, which places the caret at the
  clicked glyph; pointer drag selects in either direction and double-click
  selects the complete value. Return outside IME validates exactly once and
  ends focus like blur without inserting a line break. An empty blur restores
  the placeholder. Disabled fields mount no editor.
- Paint: selection is system white at 45% alpha. A collapsed selection projects
  a one-logical-pixel white caret with a 530 ms visible/hidden cadence, reset to
  visible after input or pointer movement. Layout uses browser glyph metrics
  when available and the same font/style inputs as text texture rendering.
- DOM boundary: there is at most one hidden active textarea, used only for
  keyboard, IME, clipboard, and native selection services. Text, selection,
  caret, focus, and disabled feedback remain visible only through WebGPU.
- Panel isolation: every panel tree contains one exact-bounds
  `pointer_capture` boundary behind its controls. Pointer, click, double-click,
  wheel, and touch-equivalent input inside that boundary is consumed before
  project hit-testing, including empty panel regions; the full-canvas root is
  not blocking.
- Desktop reuse: project text editing uses the same session and layout. Existing
  text enters standard contextual editing with its caret at the end; a later
  double-click on that active text emits only `text.selection.all`, keeps the
  same editor/footer/session, and selects the complete value. Plain/Shift
  Return insert one newline; Ctrl/Meta+Return retain the existing commit
  behavior. New background text starts at one 24 px line, transfers provisional
  mobile typing, and grows by the shared `lineHeight` with a 132 px minimum
  width so both grips, Close, and the footer title fit.

Validation required before status becomes `validated`:

- focused session/layout, Panel Lab, project-text, creation-handoff, surface
  isolation, manifest, and historical Input builder contracts;
- real integrated-browser immediate placeholder hiding, Return validation, caret
  placement, partial drag, active-text second-double-click selection, deletion,
  close/reopen, reload/reopen, and multiline desktop text creation/re-entry;
- fixed-viewport captures proving white 45% selection, one-pixel caret,
  clipping, 132 px desktop minimum, and zero project intents behind the panel;
- empty warning/error console and explicit product-owner visual/behavioral
  approval.

Validation evidence recorded on 2026-07-24:

- the focused Vitest contracts pass for the shared session/layout, Panel Lab
  Input, project text, creation handoff, interaction isolation, unified
  rendering, and manifest;
- at a fixed `1280 × 720` viewport, real browser gestures verify Return
  validation, immediate placeholder hiding with empty value and caret `0/0`,
  later user-value preservation/click-to-caret, and hidden-editor teardown;
- a moved Panel Lab was superposed on an Atome and its Input double-click kept
  the single hidden editor owned by the field without opening project editing;
- existing project text opens at selection `length/length`; each later real
  double-click keeps the same session and selects `0..length`. Plain Return
  preserves consecutive/trailing newlines, resolves unitless `1.2` line-height
  values as a font multiplier, spaces every visible line by `19.2 px` at the
  tested 16 px font, and repositions the contextual footer below the measured
  multiline block;
- the final browser warning/error console is empty;
- the product owner explicitly approved the visual and behavioral contract on
  2026-07-24 after the immediate placeholder-hiding correction and confirmed
  that the component may advance to the next specimen. The canonical
  `text_input` is therefore `validated`.

The Lab body remains empty until the shared PanelRoot and FooterControls have
been reviewed. After that review, it grows cumulatively with each approved
specimen in approval order. No approved specimen may be removed before Panel
Lab retirement. There is no product-tool content, domain data, diagnostic status,
duplicate control, or product mutation. The newly reviewed specimen must expose
only the behavior belonging to its component type: text is static; an input
accepts and reports text; each toggle/radio/momentary-tool behavior is tested
as its own state; and a slider tool expands, tracks drag/touch movement, and
collapses using the canonical tool-slider interaction contract.

### Fifth specimen contract — passive list row

Status: `validated`

- Integration decision: the existing native BevyUI `row` primitive is available
  through the shared panel-tree projection and is the selected route. The legacy
  DOM `List_builder.js` is rejected because it creates a DOM-owned list surface.
  No custom renderer, local list factory, DOM node, state owner, or interaction
  contract is introduced.
- Builder: shared `listRowNode` in `bevy_panel_tree.js`; Panel Lab only
  configures its localized label.
- Geometry and paint: `358 × 32 px`, `10 px` horizontal padding, `3 px` radius,
  the existing opaque panel control background, no shadow, and no new token.
  The label is left aligned, vertically centered, `13 px`, and uses the existing
  input line-height token.
- Content and behavior: the Lab presents three localized passive instances:
  `Élément de liste`, `Deuxième élément de liste`, and `Troisième élément de
  liste` in French; `List item`, `Second list item`, and `Third list item` in
  English. Each row has no handler, hover, press, selection, action, state,
  intent, mutation, accessibility action, or DOM projection.
  Future product panels own any selection or action semantics themselves.
- Composition: one shared divider separates the approved Input from one
  transparent native BevyUI group. That group owns the three sibling rows with
  a `4 px` gap and no internal divider, so the divider marks a new component
  while the gaps mark lines of the same list. Every earlier approved specimen
  remains visible in chronological body flow.
- Visibility: the cumulative flow is `429 px` high, so Panel Lab opens at
  `420 × 520 px`; every approved specimen, including all three rows, is visible
  without initial scrolling.

Validation required before status becomes `validated`:

- focused contracts for builder geometry, existing-token reuse, localization,
  native WebGPU record projection, and absence of handlers, accessibility
  actions, mutation, and visible DOM;
- syntax, M0 guardrails, and execution-order validation; and
- real integrated-browser canvas inspection of the cumulative Panel Lab:
  short open/close, long-press reload, post-reload reopen, visible passive row,
  and empty warning/error console.

Approval record: the product owner approved the passive-row contract and the
real-canvas cumulative composition on 2026-07-26, then reconfirmed its approval
after the execution-order registry correction. The approved composition has one
shared separator before a transparent three-row group with `4 px` gaps and no
internal divider. Implementation evidence: `listRowNode`, localization, the
cumulative Lab composition, and focused builder/projection contracts pass.
`check:execution-order` now passes, so this fifth shared component is
`validated` and its evidence remains reusable through the current
migration-package protocol.

### Deferred slider-tool investigation — not a Panel Lab specimen

Status: `deferred`

- Product-owner decision: the proposed compact vertical tool-slider does not
  belong in Panel Lab. It is an existing tool-context pattern, not evidence of
  a panel component need. The Panel Lab specimen, its reserved height, intent
  adapter, locale keys, and Panel Lab-specific test were removed.
- Retained investigation: `bevy_ui_tool_slider.js` and the contextual-slider
  route remain available for a future dedicated tool-slider review. They are
  not design-approved and must not be reused for a panel slider by implication.
- Exclusion: the seek/progress control is product-tool work. It is not panel
  evidence and is not covered by this Panel Lab guide.

### Sixth specimen proposal — accordion

Status: `validated`; focused contracts, shared-canvas review, and explicit
product-owner approval are complete.

- Scope: Panel Lab only. Finder, Profile, their legacy HTML accordions,
  keyboard activation, exclusive groups, and the deferred slider remain out of
  scope.
- Shared builder: `bevy_panel_accordion.js` composes the normalized native
  `accordion` header with the shared panel skin. It has a `358 × 32 px` compact
  header, localized left label, and a `12 px` two-stroke chevron that points
  right when closed and down when open. It is stateless: callers provide their
  own `expanded` boolean, body children, and activation handler, so sibling
  sections remain independent by construction.
- Paint: the header uses the tokenized, slightly darker accordion background so
  it remains legible as the activation zone; the body keeps the existing opaque
  panel-control material. Closed, the header owns a short, light drop shadow.
  Open, its transparent root owns the larger tokenized shadow around the whole
  `358 × 88 px` perimeter. The shadow changes with the rebuilt tree; it is not
  animated.
- Open body: the tree contains no hidden body while closed. When open, it adds
  one `358 × 56 px` opaque body with continuous `3 px` outer corners; the Lab
  composes only one localized passive text child. No DOM, CSS control, local
  paint, animation, durable mutation, or product state is introduced.
- Lab state: `bevy_panel_lab_accordion_runtime.js` owns only the ephemeral
  `expanded` flag, emits `panel_lab.accordion.toggle`, and resets on both Lab
  open and close. The Lab opens at `420 × 560 px` so every previous specimen
  and the new closed header are visible without initial scrolling.
- Reveal: after an opening rebuild, the canonical scroll runtime reveals the
  accordion root inside the existing Panel BodyScroll with a tokenized `10 px`
  margin. It cancels scroll inertia, clamps to the existing scroll bounds, and
  never resizes the panel.

Validation evidence: focused accordion, Panel Lab, scroll, manifest, syntax,
M0, execution-order, and diff checks pass. The product owner explicitly
approved the closed/open geometry, header/body distinction, chevron direction,
bounded reveal, reset behavior, and the final shadow treatment on 2026-07-26.

### Seventh specimen proposal — select

Status: `validated`; focused contracts, real-canvas interaction evidence, and
explicit product-owner approval are complete.

- Scope: one localized language Select in Panel Lab only. It deliberately does
  not migrate Finder/Profile dropdowns, the deferred slider, keyboard/listbox
  semantics, or any durable preference.
- Integration decision: the inspected native/WASM vocabulary exposes generic
  interactive `select` and `button` primitives but no dedicated popup/listbox
  widget. `atome/src/squirrel/components/select_contract.js` is therefore the
  canonical renderer-neutral option/value contract; the shared
  `bevy_panel_select.js` configures those available primitives rather than
  redrawing a local widget. The DOM legacy `dropDown_builder.js` is rejected for
  this route. Its non-Panel-Lab example consumers require their own migration
  task; this specimen keeps no compatibility or visible DOM route.
- Geometry and paint: the closed field is `358 × 32 px`, with `10 px`
  horizontal padding, a dedicated `32 px` indicator zone, and a `10 px` two-
  stroke chevron pointing down when closed and up when open. Opening keeps that
  field at `32 px`; three localized `32 px` option rows float `4 px` below it
  instead of extending the body flow as an accordion would. The popup owns its
  own elevated shadow, each row has hover/focus/pressed feedback, and the
  selected row carries a vector check mark plus a selection tint. Shared Select
  tokens own this distinct field/menu treatment; accordion shadows and its
  continuous-corner silhouette are not reused.
- Interaction and state: header activation toggles the list; an enabled option
  selects its value and closes the list. The Lab runtime owns only ephemeral
  expanded, header/option hover, header/option focus, pressed, and selected-
  value state, emits closed
  `panel_lab.select.*` intents, resets to `Français` on close/reopen, and never
  calls an Atome mutation. Opening requests the existing canonical BodyScroll
  reveal of the floating options with its `10 px` margin. The shared BevyUI
  hit-test and BodyScroll owners retain overflow-visible popup descendants for
  pointer routing and bounded reveal while still respecting the scroll clip.
- Evidence: the focused Select contract passes 6/6, including floating-menu
  hit testing and scroll reveal. The surrounding Panel and BevyUI runtime suites
  pass 39/39. The real shared canvas showed the field, floating option list,
  check mark, selection, and an empty warning/error console. The Panel Lab
  geometry is `420 × 620 px` so the closed specimen remains in chronological
  body flow. The product owner explicitly approved the field/menu distinction,
  down/up chevron, selected mark, floating-list behavior, and reset contract on
  2026-07-27.

### Eighth specimen proposal — checkbox / radio / toggle

Status: `in_review`; control semantics retain their 2026-07-27 approval, but
the visual surface was reopened on 2026-08-02 after size and style drift was
found between choices and the canonical icon actions. This position
was reviewed after the table because
the product owner deferred it, then asked for it explicitly; the table specimen
below therefore keeps its own record and stays after this one in body flow so
the declared component order is readable in the Lab.

- Scope: the four choice controls in Panel Lab only. The former legacy DOM
  `createEveCheckbox` / `createEveRadio` user/profile consumers were removed
  with the Home migration; Home now composes these canonical Bevy choices.
  Keyboard activation is outside this specimen.
- Integration decision: `checkbox`, `radio`, and `toggle` are real native BevyUI
  kinds — present in `SUPPORTED_KINDS`, in `INTERACTIVE_KINDS`, and in the Rust
  `is_button_kind` list — so each control uses its own native interactive node
  directly. This is the strongest available route and needed no new primitive.
  The DOM `preset_controls.js` visual contract is rejected: it is CSS-owned and
  makes a green accent glow the default on state, which the shared tool-control
  prerequisite forbids as a global default.
- Ownership and reuse: a radio group carries exactly the option/value semantics
  of a Select, so `radioGroupNode` reuses the canonical
  `select_contract.js` normalization rather than declaring a second option
  contract; duplicate or unknown values still throw there. Only the independent
  two-state controls needed a new canonical contract,
  `atome/src/squirrel/components/toggleable_contract.js`. The validated Select
  check mark was promoted once into `bevy_panel_tree.js` as `checkMarkNode` and
  is now consumed by both Select and the checkbox, so the glyph is not redrawn
  locally; the Select record's geometry is unchanged and its contract still
  passes.
- Declared semantics, one per control, per the shared tool-control
  prerequisite: `checkbox` is an independent boolean; `radio` is an exclusive
  group where activating the current choice keeps the selection; `toggle` is one
  on/off value. Each is proven in both directions by the focused contract.
- Geometry and paint: every control consumes the same canonical 30 px opaque
  surface, 8 px label gap, 210 px label slot, radius, shadow, pressed
  translation, and disabled opacity as the icon actions. Checkbox uses neutral
  blue, radio danger red, switch warning orange, and the unavailable option is
  neutral and attenuated. Choice retains only the centered glyph geometry: a
  16 px checkbox/radio area and a 20 × 10 px switch track. The former local row
  hover paint, surface colors, dimensions, and indicator state palette are
  removed.
- Test contract to approve together, matching the icon-button precedent: one
  checkbox, one two-option radio group, one switch, and one disabled checkbox,
  in a single transparent group with `4 px` gaps.
- Lab state: `bevy_panel_lab_choice_runtime.js` owns only ephemeral checked,
  selected-value, focus, and pressed state, emits closed
  `panel_lab.choice.*` intents, resets on Lab open and close, and performs no
  Atome mutation and no DOM projection.

Validation evidence — 2026-07-27:

- focused choice contract passes 6/6: canonical contract guards, the three
  native kinds, label alignment across shapes, selected-mark/dot/knob
  transitions, the full state matrix with pressed distinct from selected, the
  disabled no-handler rule, the Lab composition and both radio transitions
  (including reactivating the current choice), the WebGPU projection, and the
  canonical `press → focus → release → activate` pointer route;
- the cumulative Lab body count moved from 21 to 23 in every ledger test, and
  the panel/BevyUI suites pass 36/36 including the untouched Select geometry
  after the check-mark promotion;
- `check:syntax`, `check:m0`, and `check:execution-order` pass;
- the agent could not reach the project workspace that hosts the main ribbon in
  its own browser session, so the real-canvas review of the four rows, their
  pressed/hover feedback, and the ribbon short-open / short-close /
  long-press-reload contract were performed by the product owner in their own
  Lab session. They confirmed the result correct and approved the specimen on
  2026-07-27. That approval is historical evidence for semantics only; the
  unified 30 px visual surface requires a new real-canvas review, so this
  component remains `in_review`.

### Ninth specimen proposal — table / property grid

Status: `validated`; focused contracts and runtime projection evidence are
complete, and the product owner explicitly approved the specimen on the real
canvas on 2026-07-27.

The product owner first deferred the `checkbox/radio/toggle` position and the
already-`deferred` slider, so the table was implemented first; the choice
controls were then requested and recorded above. The slider remains `deferred`.

- Scope: one passive Panel Lab table. Sorting, row selection, hover, cell
  editing, virtualization, internal scrolling, and the Info/Detail product
  property grids are explicitly outside this specimen.
- Integration decision: `table` and `property_grid` already exist in the shared
  `SUPPORTED_KINDS` vocabulary and are absent from `INTERACTIVE_KINDS`, so the
  native `table` kind is passive by construction and is the selected root. The
  rows reuse the `row` primitive validated by the list specimen, the cells are
  `text`, and the rules are `divider`. The Rust owner treats `table` as a generic
  column container, so no renderer change was required. The DOM
  `table_builder.js` + `table_visual_contract.js` pair is rejected for this
  route: it creates DOM nodes, DOM listeners, and a light CSS palette. Its
  example consumers (`atome/src/application/examples/tables.js`, `spark.js`,
  `scripts/bundle.js`) need their own migration task; no bridge is introduced.
- Ownership: `atome/src/squirrel/components/table_contract.js` owns the
  renderer-neutral column/row normalization **and the fluid column-width
  resolution**, so any renderer lays the same table out identically.
  `bevy_panel_table.js` only composes that contract with panel tokens.
- Fluid width, decided with the product owner: unlike every earlier `358 px`
  specimen, the table fills the usable body width. A field or accordion is a
  control, where wider is not better; a table is a data surface that would read
  as broken when frozen at `358 px` inside a resized Info/Detail panel. The panel
  runtime stays the single geometry authority and passes
  `bodyWidth = geometry.width - 2 × paddingPx` into `buildContent`; the tree is
  already rebuilt on every resize gesture, so no component measures anything and
  no DOM geometry is read. The floor is the minimum body width (`220 px`).
- Columns are declared by weight, not absolute pixels: a column carries either a
  fixed `widthPx` or a `flex` (default `1`). Fixed widths are subtracted first,
  the remainder is split proportionally, and the last fluid column absorbs the
  rounding remainder so the columns always sum exactly to the table width and no
  rule drifts off the edge. The specimen uses `1.6 / 1 / 1`, left alignment by
  default, and a right-aligned value column.
- Paint: one opaque card of the body width `× 128 px` with `3 px` outer corners
  only, and **no shadow** — in the approved language a shadow means elevation or
  interaction, and this component is passive and flat like the list rows. The
  header band reuses the tokenized accordion header background; its labels keep
  the body font weight (only Roboto Thin is embedded, so an unguaranteed heavier
  weight is not used) and are distinguished by the band plus a `0.72` opacity.
  Rows use the existing opaque panel-control material. Rules are horizontal
  `1 px` only, on a dedicated `rowDivider` token that is more discreet than the
  global divider; there is no vertical grid, which would read as noise on a
  translucent dark panel. Cells clip their text: the native vocabulary has no
  ellipsis primitive, which is recorded as a limitation rather than emulated.
- Property grid: the same builder configured with two columns and
  `header: false` covers the property-grid position. It is not mounted as a
  second Lab specimen and is exercised only by focused contracts until a product
  panel needs it.
- Lab state: none. The specimen is passive, so no Lab runtime, intent, or reset
  entry was added.

#### Layering correction — floating popup over a later body sibling

The product owner reported that the open Select popup became illegible above the
table. The cause was neither component's design but the shared body layering
contract in `bevy_panel_tree.js`: `panelBodyLayer` resolved every node's
`z_index` against one flat absolute scale, so a floating popup could lift its own
root (`1271`) while its option rows and labels stayed on the shared body band
(`1252`/`1253`) — below the table rules and cell labels (`1253`), which won at
equal depth because the table comes later in body flow. A `z_index` is now
resolved against the layer its parent received, so an elevated subtree keeps its
whole content elevated. Measured after the correction: popup floor `1272`
against table ceiling `1254`. The passive table can never steal the popup's
pointer either, since none of its kinds are interactive.

Validation evidence — 2026-07-27:

- focused table contract passes 8/8, including the fluid distribution summing
  exactly at `220/358/400/683/901`, the fixed-column mix, the `header: false`
  property grid, the passive/no-handler guarantee, the popup-above-table
  layering regression, and the overlapping-popup hit-test;
- the surrounding panel and BevyUI suites pass (`bevy_panel_contract`,
  `select`, `accordion`, `list_row`, `input`, `geometry`, `pointer touch
  surface`, `workspace_scene_layers`); the cumulative Lab body count moved from
  19 to 21 in every ledger test;
- `check:syntax`, `check:m0`, and `check:execution-order` pass;
- in the running browser app the mounted Panel Lab projected the table at
  `400 px` wide inside a `420 px` panel — against `358 px` for the specimens
  above it — with columns resolved to `178 / 111 / 111` summing exactly to
  `400`, and projected table depths `2351…2355`;
- the agent could not exercise the ribbon short-open / short-close /
  long-press-reload contract or the resize drag on the real canvas in this
  session, because the project workspace that hosts the main ribbon could not be
  reached (the dashboard route kept the workspace overlay from repainting).
  The product owner performed that review in their own Lab session, confirmed
  the result correct, and approved the specimen on 2026-07-27.
- pre-existing and unrelated: `tests/eve/bevy_ui_pointer_contract.test.mjs`
  fails 1/6 (touch press on the Lab input no longer mounts the hidden textarea).
  Reproduced with pristine `bevy_panel_tree.js` and `bevy_panel_surfaces.js`
  restored from HEAD, so it is not caused by this specimen.

The development-only Panel Lab main-ribbon tool has a fixed test contract: a
short activation opens it, the next short activation closes it, and a 520 ms
long press reloads the browser view without also toggling the Lab. Before
presenting any Lab or component change, visibly verify all three actions on the
real shared canvas, then confirm that the Lab still opens and closes after the
reload.

After each migration package, apply the package protocol above and retain its
reusable component evidence in Panel Lab or the target panel. The approved icon-button skin and builder
are the shared reference for panel action buttons; panel-local button colors or
appearances are forbidden. Ribbon tools and slider tools remain separate
components and continue to compose their existing canonical menu/tool visual
contract rather than redefining a local control.

No new component, panel module, or Panel Lab composition may be presented as
implemented until it has been opened in the browser test environment and its
visible records have been verified on the real shared canvas. Tree/unit tests
are necessary but never substitute for this rendering check.

Once a package provides its target panel's required coverage, that routed,
non-deferred BevyUI surface may be reviewed as a composition. Contact may be
reviewed after Package 2, Home after Package 3, and Calendar after Package 6.
A composition review must call the same component builders,
tokens, and intent handlers as its product surface; copied Lab-only styling or
behavior is forbidden.

## Stage 4 — Product panels

Status: `in_review`

### Mandatory complete component-coverage baseline

Status: `planned`

The ten Panel Lab positions are only the generic control baseline. They do not
by themselves cover the product-specific visual and interaction capabilities
needed to retire every legacy panel. Before any product-panel composition, the
following source-inspected capability inventory is the mandatory coverage
baseline. A capability is counted as remaining until its canonical
Atome/Squirrel/Bevy owner, MCP-command mapping where effectful, focused
contract, real-canvas evidence, and product-owner approval are recorded.

The active baseline contains the **13 families required by the currently scoped
Home, Calendar, and Contact panel migration**: 4, 5, 6, 13, 18, and 21 to 28.
Families 1 through 3 are already implemented or under their final approval
loop. Families 4 and 5 are validated, so **11 active families
remain to implement**; this is not an approval count. Molecule / MTraX-owned
capabilities are deferred until their complete product migration. Families 9
and 17 are also
excluded: source review found a Contact editor photo and tool selection counts,
not the proposed generic Panel cards or measured Panel geometries. This remains
a coverage ledger: the migration-package protocol remains mandatory. A family may reuse an already
validated generic component only when its panel-specific behavior is covered by
the existing contract; otherwise it still requires its own canonical extension
and approval.

Family 17 re-entered the baseline as the Infos-owned selection summary and is no
longer excluded. Packages 8 and 9 — Size, Font, and Layer — add **no new
component family**: their matrix rows are fully covered by the validated
generic baseline plus the Infos-owned Families 12, 17, and 30, all `validated`
since the Infos approval of 2026-08-07. This is why they are the two
workstreams that run now without any shared-component contention.

Already validated generic components (not included in the 36): text,
separator, icon action button, single-line input, passive list row, accordion,
select, checkbox/radio/toggle, and table/property grid. The shared PanelRoot,
footer, scroll, clipping, drag, resize, and pointer-capture contracts are also
existing infrastructure, not product component families.

#### Active migration packages — authoritative task grouping

The following eleven packages replace Family-by-Family delivery as the active
task order. Family records below remain the evidence ledger for their canonical
owner, focused tests, and real-canvas behavior; they are not separate
product-owner approval gates. Since 2026-08-07, Packages 1 to 7 and 10 to 11
are `validated`, and **Packages 8 and 9 are the two concurrent product-panel
workstreams** defined by *Parallel product-panel workstreams*. They are the
only packages left in this list. Beyond Size, Font, and Layer, **eight
registered panels still have no package written**: `background`, `couleur`,
`detail`, `communicate`, `delete`, `undo`, `paste`, and `timeline`.

##### Package 1 — Shared controls

Status: `validated`

- Scope: Families 3, 6, and 13 — selectable list, multiline editor, and
  filter/scope chips.
- Style system: reuse Select and Input states first; add only named
  `selectableList`, `multilineEditor`, or `scopeChip` token groups when the
  existing tokens cannot represent a required measured state.
- Exit criterion: every control has its canonical contract and focused tests;
  the shared-canvas package integration passes; the controls are ready to be
  consumed by Contact and Calendar. This package creates no Contact or Calendar
  data binding, command, mutation, persistence, or workflow logic.
- Current evidence — 2026-07-31: `selectable_list_contract.js`,
  `multiline_input_contract.js`, and `scope_chip_contract.js` cover the three
  renderer-neutral presentations. `bevy_panel_editable_text.js` is the shared
  editable builder; `bevy_panel_multiline_input.js` and
  `bevy_panel_scope_chips.js` reuse existing Input/Select presentation with
  only named geometry tokens. The 15 cumulative Panel suites pass `64/64`;
  syntax, M0, execution-order, and whitespace checks pass. The real shared
  canvas selected an enabled list row, entered and displayed a French two-line
  local draft, toggled `Tâches` inside the multi-select filter, and reset all
  three controls after close/reopen with no warning/error console output.
  The product owner explicitly approved the package on 2026-07-31. Package 1
  is therefore `validated` and Package 2 may consume its shared controls.

##### Package 2 — Contact panel

Status: `validated` — product-owner approval recorded on 2026-08-02 after the
canonical 30 px button-skin convergence and Contact interaction review.

- Scope: Family 18 and the actual routed Contact panel migration, using Package
  1's visual controls, the validated state surface, and the canonical Contact
  commands. This package owns the panel's domain bindings and workflow only;
  it must not recreate a shared component's builder or style contract.
- Style system: a Contact-specific avatar/media and identity-summary group only
  if the existing panel, state, text, and action tokens cannot express it.
- Exit criterion: the usable Contact panel has a complete MCP ledger,
  real-canvas evidence, product-owner approval, and no parallel HTML route.
- Current implementation — 2026-08-02: the routed Contact surface is one list
  of autonomous shared accordions. The authenticated profile is first and
  appears exactly once by stable id; local and read-only identities retain
  their own permission treatment, and personal data never authorizes merging.
  Opening is exclusive and auto-saves the prior draft; a failed save preserves
  it. `Ajouter` inserts an open transient draft immediately after the profile
  and persists only its first meaningful edit. Empty drafts disappear.
- A compact canonical checkbox rail is available only to deletable local
  contacts. Its vertical gesture adds or removes traversed visible rows while
  expansion remains independent. The fixed area above the shared footer owns
  `Importer`, `Ajouter`, and conditional `Supprimer (N)`; grouped confirmation
  reports partial failures without losing their selection. The custom-field
  `+` reuses the canonical 30 px `add.svg` icon button and remains below every
  custom row. Existing avatars only are
  projected; there is no technical photo-source field or manual Save action.
- Import UI is provider-neutral and capability-based through
  `interactive_import`. Apple Contacts uses the native `CNContactStore` bridge,
  requests permission only after an explicit Import action, and persists the
  returned snapshot only through `Squirrel.contacts`. iCloud/CardDAV import and
  push remain headless API/MCP functions and are outside this package's UI and
  acceptance scope. The panel retains desktop docking and mobile footer
  drag/resize. Focused contracts and real-canvas desktop plus `390 x 844`
  mobile inspection pass for the unique profile accordion, selection,
  responsive confirmation, movement, resize, close/reopen, zero visible
  Contact DOM controls, and clean consoles. The custom-field add action and
  local-selection rail now consume the canonical 30 px icon-button surface.
  A long press on the Dashboard Contacts header toggles this panel and cannot
  create a contact; creation remains exclusive to `Ajouter`. The product owner
  approved the complete Contact panel on 2026-08-02, so Package 2 is
  `validated`. Native Apple permission-dialog outcomes remain a non-blocking
  environment verification and do not reopen the panel migration.

##### Package 3 — Home panel

Status: `validated` — the product owner explicitly approved the corrected Home
result on 2026-08-03. Focused contracts, authenticated real-canvas
desktop/mobile evidence, DOM/console audits, and the legacy-owner audit pass.
Contact and Home are the validated panels (**2/16**).

- Scope: one authenticated/guest Home composition on the shared canvas. It
  contains six exclusive accordions: Identity/photo, Bio/Biometrics, Profile,
  Passwords and keys, Preferences, and Account/security. Profile contains only
  Competences, Passions, and Experiences; historical Pro flags remain in data
  but are not projected or mutated. Handedness and accessibility belong to Bio.
  Generic credentials and the five AI provider/model/key entries belong to
  Passwords and keys. Preferences separates Mail, Visual/Wallpaper, Dashboard,
  Language, and Server. Account/security contains no AI settings.
  Login and registration remain the existing application-shell sequence; they
  are not a panel fallback. Guest Home is read-only for profile/security data
  and exposes only the existing leave-guest action.
- Reuse: the panel consumes the shared shell, fixed action area, footer,
  docking, drag, resize, scroll, accordion, input, select, choice, image,
  labeled/icon button, and hidden text/file-entry services. It adds no renderer,
  visible DOM control, CSS, local palette, component clone, or persistence key.
  Families 9 and 17 require no new shared implementation: the shared identity
  media frame composes the existing image node and existing skin tokens, and
  Home has no selection/context summary.
- Canonical action ledger:

| Intent | Canonical owner/path | Existing command/API/MCP status | Security/policy |
| --- | --- | --- | --- |
| Open/close Home | `tool.main.home` → `ui.home.panel` → `user_home_panel_runtime.js` → Bevy surface `home` | `runtime.tools.call` / `runtime.audit.list`, mapped | Existing Runtime V2 tool policy and audit; the window owner resolves session state before composition. |
| Read/save identity, photo, Bio, Profile custom fields, access and preferences | `loadUserProfile` / `upsertUserProfile` → sanitized `Atome.commit`; `auth.setVisibility` for access | Existing closed profile API; MCP `not_applicable` for private self-profile editing under the approved security exception | Authenticated stable user id only; no name/phone/email/DOM inference; Guest cannot write. Historical Pro values are preserved but not projected or mutated. |
| Apply handedness, locale, accessibility and Dashboard visibility | existing handedness/accessibility normalizers, main-menu runtime, locale owner, `eve:profile-preferences-updated`, Dashboard preference normalizer/controller | Same canonical profile-save path; MCP `not_applicable` for private self-preferences | Disposable UI state only until sanitized profile commit succeeds; category changes force active Dashboard refiltering even when geometry is unchanged. |
| Create/update/delete generic credentials | existing Squirrel encrypted token vault through `bevy_panel_home_vault.js` | Existing closed security API; MCP `not_applicable` for private secrets | Name, login, and password are encrypted in one opaque principal-scoped entry; no secret enters profile, DOM projection, logs, events, or MCP. |
| Apply Mail settings | `mail/runtime_preferences.js`, `mail/bootstrap_connector.js`, opaque `auth_ref`, and canonical profile save | Existing closed Mail/profile API; MCP `not_applicable` | Mail password is stored only in the common encrypted vault and resolved asynchronously by the connector; preferences persist `auth_ref`, never the password. |
| Open/generate, use selection, import, or download Background | `ui.background.panel` plus the existing Background selection/import/download owners | Existing closed tool/API routes; open remains mapped through `runtime.tools.call` / `runtime.audit.list` | Home delegates all four actions and owns no Background mutation, media storage, or renderer. |
| Select AI provider/model and manage its key | Passwords and keys → existing Squirrel provider registry/model cache plus `configureVaultSecret`, `storeToken`, `readToken`, and `removeToken` | Existing closed AI/security APIs; MCP `not_applicable` for private secrets | OpenAI, Anthropic, Mistral, Google, and DeepSeek use catalog models only. Provider/model metadata may enter the profile; each key is encrypted under stable user id + provider and never projected, logged, or stored in profile. Guest cannot access it. |
| Select/add Server | existing URL normalization in `loadServerConfig.js`, current preference save, SyncEngine and RemoteCommands reconnect operations | Existing closed configuration/runtime APIs; MCP `not_applicable` | Valid normalized HTTP(S) URL only; invalid loopback ports are rejected. No new endpoint, persistence, or authorization rule. |
| Change password | `AdoleAPI.auth.changePassword` | Existing authenticated API; MCP `not_applicable` | Current/new secrets remain transient in the one hidden secure input and never enter DOM attributes, profile payloads, logs, or MCP. |
| Logout / leave Guest | `AdoleAPI.auth.logout` / `AdoleAPI.security.leaveGuest` | Existing session/security API; MCP `not_applicable` | The session owner decides authorization; logout returns to the existing application shell and Guest data remains local unless explicitly adopted. |
| Delete account | `AdoleAPI.auth.deleteAccount` | Existing authenticated API; MCP `not_applicable` | Explicit destructive confirmation plus current password; no inferred authority and no MCP secret transport. |
| Login/register | existing `user_login_*` application-shell owners and `AdoleAPI.auth.bootstrap` | Outside Home panel composition | The shell remains authorized pre-auth UI; it is not rendered as Home HTML or used after an active session is present. |
| Voice actions | no Home control | `not_applicable` | Voice remains owned only by the existing application shell/runtime; Home creates no duplicate action. |

- HTML retirement: `eve_user_dialog`, its `createEveDialog` composition, and 22
  `user_*` panel-only runtimes were deleted after functional parity and the
  product owner's explicit instruction to remove the legacy panel. Auth/login,
  workspace, model-only accessibility/visual preference, and canonical profile
  owners remain. No HTML Home fallback or parallel visible route survives.
- Evidence — 2026-08-02: focused Home, Dashboard, encrypted-vault, AI
  catalog/provider, Background, profile/Mail/route, syntax, and architecture
  guardrails pass. An isolated authenticated Fastify account exercised real
  canvas clicks at desktop `1280 × 720` and mobile `390 × 844`: display Select;
  Biometrics, Competences, Passions, and Experiences draft creation; generic
  credential creation; vault unlock; five provider entries; OpenAI catalog/model
  selection and encrypted key storage; Mail/Wallpaper/Dashboard/Language/Server
  projection; bottom-right and bottom-left reopen after real handedness changes;
  full-width mobile layout; and immediate Dashboard category hide/restore.
  Background Download applied a random image immediately. Import opened the
  canonical hidden file chooser; binary file injection and persisted application
  remain covered by the Background owner contracts because the integrated
  browser connector exposes no file-injection action. DOM audits report one
  canvas, zero `#eve_user_dialog`, zero visible native controls, and an empty
  warning/error console. The widened suite retains 11 known renderer/text/scene
  failures outside Home.
- Performance/lifecycle evidence — 2026-08-03: Home, Contact, and Panel Lab no
  longer load through the common eager registry. Home builds only an opened
  accordion/subsection and initializes vault, Mail, Background, Dashboard, or
  Server only at its owning section boundary. Closed panels release source and
  hit-test trees, overlay records, handlers, scroll/inertia/caret/timers,
  editors, render queues, resize/drop listeners, and section subscriptions.
  Scroll, drag, resize preview, and text use the shared targeted/latest-wins
  paths; resize performs one structural reflow on release. Real-canvas checks
  verify responsive bottom/menu anchoring, full-width mobile projection with
  desktop restoration, footer-close then one-click Home reopen, smooth real
  drag/resize/scroll, one canvas, zero visible DOM controls, and an empty
  warning/error console. The display Select now has the translated `Afficher`
  heading. Home and editable Contact reuse the same empty/photo media frame,
  click picker, and Bevy hit-tested image drop contract; Guests/read-only
  contacts cannot mutate it. The product owner approved the corrected result on
  2026-08-03; Home is `validated`, bringing the programme to **2/16**.
- **To verify**: destructive account deletion, a real Mail connection, a custom
  Server reconnection, and native file selection remain contract-verified rather
  than executed against a user account or external service.

##### Package 4 — Calendar structure

Status: `validated`; focused/Web/Tauri/iOS compile contracts pass and
product-owner approval was recorded on 2026-08-04.

- Scope: Families 21 to 24 — range navigation, month grid, week/day grid, and
  agenda virtualization.
- Style system: one shared Calendar group for date/time typography, grid lines,
  cell states, separators, range navigation, and list density.
- Exit criterion: all three Calendar views render canonical Calendar records
  through the shared canvas with bounded visible-range behavior.

##### Package 5 — Calendar events

Status: `validated`; focused/Web/Tauri/iOS compile contracts pass and
product-owner approval was recorded on 2026-08-04.

- Scope: Families 25 to 27 — event rectangles, all-day/overlap layout, and
  hit-testing, drag, resize, and touch feedback.
- Style system: one shared event group for semantic event states, all-day lane,
  overlap indicators, gesture zones, and interaction feedback.
- Exit criterion: all event presentation and gesture paths use canonical
  commands and remain correctly layered in every Calendar view.

##### Package 6 — Calendar editor and completion

Status: `validated`; focused/Web/Tauri/iOS compile contracts pass and
product-owner approval was recorded on 2026-08-04.

- Scope: Family 28, Calendar composition, complete MCP ledger, panel approval,
  and HTML-route retirement.
- Style system: reuse shared editor, state, and Calendar tokens; add a named
  Calendar-editor group only for a proven product-specific distinction.
- Exit criterion: Calendar is usable through Bevy only, covers event/todo
  editing and timezone-safe validation, and has full product-owner approval.

##### Package 7 — Infos inspection and editing

Status: `validated` — explicit product-owner approval recorded on 2026-08-07,
after the 2026-08-05 panel improvements. Implementation, focused contracts,
real-canvas evidence, the 3,033-line retirement ledger, and the MCP command
ledger are complete. Workstream state: `validated` — Infos leaves the slot
model, and Families 12, 17, 29, and 30 are unfrozen for their consumers.

- Approval consequence: Families 12, 17, and 30 stop being frozen, so the
  cross-dependency that prevented Size, Font, and Layer from reaching
  `validated` is lifted. The HTML retirement needs no further action — the
  eight legacy modules and `info_panel_sync_runtime.js` were already removed
  when the panel landed, and `tools/infos.js` is now a 23-line bridge. Verified
  on 2026-08-07: none of `infos_state.js`, `infos_model_a/b/c.js`,
  `infos_render_a/b/c.js`, or `info_panel_sync_runtime.js` exists on disk.
- Authoritative order decision: the product owner selected Infos on 2026-08-04.
  Since the two-slot rule of 2026-08-04, Infos no longer holds a slot and does
  not block the next panels. Timeline remains final.
- Global counters at composition: 9 validated generic shared components;
  Families 12, 17, 29, and 30 have concrete Infos owners and focused technical
  coverage; 3/16 product panels remain validated; Infos is the fourth panel in
  review; 11 HTML-active routes and 5 registered Bevy routes remain.
- Scope: Families 1, 3, 4, 12, 17, 29, and 30. Infos reuses the shared panel,
  accordion, selection-summary, table, input, choice, action, scroll, footer,
  lifecycle, and selectable-list owners. The selectable-list owner absorbs
  hierarchical depth/chevron rows; the selection summary accepts owner-provided
  fluid width. No Info-local skin, CSS, component clone, or renderer exists.
- Canonical state: `listStateCurrent` / `getStateCurrent` and `selection.js`.
  The panel keeps only disposable expansion, draft, notice, preview, and load
  state. It subscribes to `adole-atome-selected` and `atome:changed`; it has no
  polling, DOM cache, project-drop state, or second source of truth.
- Mutation: only scalar properties already common to the selected records are
  editable. They commit once through `Atome.commitBatch` and refresh from the
  canonical event path. Type, kind, parent, project, owner, timestamps, complex
  properties, and unknown-property creation stay read-only.
- Rendering: selected-Atome preview calls the existing
  `project_preview_runtime` / unified WebGPU compositor with a derived rebased
  copy and projects the returned image in the same Bevy panel tree. It creates
  no new renderer, canvas, persistence, public API, or HTML fallback.
- Retirement evidence: the historical eight HTML modules and legacy
  `info_panel_sync_runtime` total 3,033 lines. Every line has an explicit
  disposition and target in
  `todo/ui_bevy/info_html_line_migration_registry.md`; a persistent contract
  proves full, gap-free coverage and prevents their return.
- Real-canvas evidence: the integrated browser opens Infos through the actual
  project-context flower, expands the project hierarchy accordion, and closes
  it through the shared footer. The audit records one canvas, zero native
  controls, zero legacy Infos roots, and no warning/error console entry. The
  test account returned a remote-provisioning error, so record-backed preview
  and property-edit interaction were never exercised in the integrated browser.
  The product owner reviewed the panel on a real account and approved it on
  2026-08-07; that acceptance closes this gap by direct product inspection, not
  by an automated capture. The distinction is recorded so no later reader
  mistakes it for browser-captured evidence.

Infos coverage ledger:

| Family | Decision/evidence |
| --- | --- |
| 1 | `validated` shared panel shell/footer/scroll/drag/resize route. |
| 3 | `validated` hidden single-line input; Infos uses one lifecycle-owned editor session. |
| 4 | `validated` list-row/selectable-list paint and pointer contract. |
| 12 | `validated` 2026-08-07 with the panel: hierarchical depth, vector chevron, expand/collapse, and canonical row selection in the shared selectable-list owner. |
| 17 | `validated` 2026-08-07 with the panel: selection summary reused with fluid panel-owner width. |
| 29 | `validated` 2026-08-07 with the panel: selected-Atome detail preview through the existing unified WebGPU compositor. |
| 30 | `validated` 2026-08-07 with the panel: detail composition — immutable table, typed existing-property text/number/switch editors, passive complex values. |

Infos MCP command ledger:

| Function/intent | Canonical owner/path | MCP method and parameters | Capability/policy | Status/evidence |
| --- | --- | --- | --- | --- |
| Open/close Infos | Runtime V2 `ui.info.panel` → registered panel open/close | `runtime.tools.call`, tool `ui.info.panel`, actions `open` / `close`, optional `target_id` | `ui.read`, LOW | `mapped`; existing panel tool registration and shared route contract. |
| Read selected Atome detail | `getStateCurrent` | `ai.tools.call`, `adole.atomes.get`, `{ id }` | `atome.read` | `mapped`; same canonical state-current record. |
| Read project/all Atomes | `listStateCurrent` | `ai.tools.call`, `adole.atomes.list`, `{ projectId? }` | `atome.read` | `mapped`; same canonical list owner. |
| Select a hierarchy row | `selection.js#applySelectionIntent` → Runtime V2 `ui.select` | `runtime.tools.call`, tool `ui.select`, `{ atome_id, target_id, selection_intent: "replace" }` | existing selection policy | `mapped`; selection runtime applies local projection then audits through the gateway. |
| Edit an existing scalar property | `Atome.commitBatch` canonical mutation boundary | `ai.tools.call`, `adole.atomes.alter`, `{ id, properties }` | `atome.write`, MEDIUM | `mapped`; focused contract proves one batch and no pre-commit record mutation. |
| Copy selection JSON | shared OS clipboard writer | none | local output only; AI can read the same records with `get/list` | `not_applicable`; no durable effect, credential, or remote command. |
| Expand/collapse, preview, immutable/complex display | disposable Bevy projection + shared compositor | none | passive UI/rendering only | `not_applicable`; no canonical mutation or external effect. |

No effectful Infos function is unreviewed or `blocked`.

##### Package 8 — Size then Font (workstream slot A)

Status: `in_review`; the Size and Font workstreams are `acceptance_pending`
since 2026-08-08 and slot A is released. Product approval remains required.

- Scope: the routed `size` panel first, then the routed `font` panel, in one
  workstream. They are sequential inside slot A, never parallel: both consume
  the legacy `selection_style_apply.js` and `style_panels_visual.js` helpers,
  which the legacy non-collision rule forbids splitting across slots.
- Required families: Size needs 1, 4, 5, and 17; Font needs 1, 3, 4, and 17.
  Families 1, 4, and 5 are `validated`; Family 3 is consumed as already shipped
  by Infos; Family 17 is consumed frozen from Infos.
- `owns`: the `size` and `font` Bevy panel compositions, their registry
  routing, and their legacy routes `eVe/intuition/tools/size.js` and
  `eVe/intuition/tools/font.js`.
- `consumes`: the shared panel shell/footer/scroll/lifecycle owners, the
  validated action button, panel state, numeric field, selectable list, and the
  Package 1 scope chips, plus the Infos selection-summary owner. It modifies
  none of them.
- Component decision: Size composes the validated Family 5 numeric field —
  stepper plus scrub drag — with scope chips for the presets. **Family 36, the
  compact tool slider, is rejected for this package**: it remains `deferred`
  and reusing `elastic_slider.js` would reintroduce a non-approved control.
- Legacy retirement boundary: `selection_style_apply.js`,
  `style_panels_visual.js`, `elastic_slider.js`, and their satellites are still
  consumed by `couleur.js`. This package deletes only the `size` and `font`
  dialogs, builders, styles, listeners, tests, and imports; the shared helpers
  are retired by the workstream that migrates their last consumer.
- MCP command ledger: required before composition. The canonical owners to map
  are the registered panel tools `ui.size.panel` and `ui.font.panel` for
  open/close, and the existing selection-style mutation path
  (`invokeToolGateway` plus `updateAtomeProperties` /
  `applySelectionStyleMutation` in `selection_style_atome.js`) for the apply
  intents. No panel-local handler or second command path may be introduced.
- Cross-dependency: **none since 2026-08-07.** Family 17 was frozen under Infos;
  the Infos approval unfroze it, so Size and Font can reach `validated` on their
  own evidence.
- Scope freeze before composition: write down the complete surface of each panel
  first — every unit, preset, and mode of `size.js`, every family, weight, and
  style control of `font.js` — and plan anything hard to port rather than
  dropping it. This is the binding rule from `finder_place_map_package.md`.
- Exit criterion: each panel opens on the shared canvas through its real tool,
  applies to the current selection through its canonical command, has focused
  contracts and a gap-free retirement ledger, has an explicit product-owner
  approval, and retains no parallel DOM route.

Implementation evidence, 2026-08-08:

- The complete pre-composition inventory is frozen in
  `size_font_surface_freeze.md`; the effect ledger is complete in
  `size_font_mcp_command_ledger.md`; and the gap-free retirement ledger covers
  **177/177 Size lines** and **133/133 Font lines** in
  `size_font_html_line_migration_registry.md`.
- `bevy_panel_size_runtime.js` composes the shared numeric-field interaction
  owner, `scopeChipGroupNode`, and `selectionSummaryNode`. It preserves step
  `1`, bounds `6..2000`, the eight `18..220 px` presets, and scrub phases
  `start/frame/end`.
- `bevy_panel_font_runtime.js` composes the standard selectable-list group and
  selection summary for exactly the eight frozen families. It creates no
  weight/style behavior and no local typography treatment for its rows.
- `tools/size.js` and `tools/font.js` are thin Bevy bridges. Public ids
  `ui.size.panel`, `ui.font.panel`, `ui.size.apply`, and `ui.font.apply` remain
  unchanged; applies still traverse `applySizeToSelection` or
  `applyFontToSelection` and the canonical gateway/mutation owners.
- The old dialogs, selectors, listeners, Size/Font CSS, and
  `elastic_slider.js` dependencies are absent from both routes. Helpers still
  owned by Couleur remain until its migration.
- Focused Vitest contracts pass **22/22** across four suites, and both route
  probes pass, including direct entry,
  step, preset, scrub phases, all frozen families, lifecycle reset, standard
  component consumption, and bridge/DOM-retirement assertions. Syntax, M0,
  Web build, Tauri release application build, Bevy Cargo check, and iOS
  Simulator build evidence are recorded in `FRAMEWORK_STATE.md`.
- Tauri succeeds with `--no-bundle` and produces the release application. The
  separate DMG packaging step remains red in `bundle_dmg.sh`; this packaging
  failure is recorded and is not presented as a source-compilation failure.
- The widened Vitest run remains red outside Package 8: **672/700** tests pass,
  with 28 failures across stale Panel Lab counts and unrelated geometry, text,
  Virtual Scene, Dashboard, renderer, and accessibility contracts. Package 8
  is not promoted to `validated` while repository-wide evidence is incomplete.
- Integrated-browser evidence confirms one shared WebGPU canvas, real-click
  Bevy panel open/close behavior, reload recovery, zero Size/Font legacy DOM
  nodes, and an empty warning/error console. The available anonymous workspace
  exposed no selectable product Atome and its import affordance did not open a
  file chooser, so text/visual/multi-selection product gestures and explicit
  product approval remain **To verify**. Neither panel is marked `validated`.

Correction evidence, 2026-08-08:

- Size and Font panel intentions now re-enter `ui.size.apply` and
  `ui.font.apply` through `invokeToolGateway`; the public handlers enter
  `applySizeToSelection` / `applyFontToSelection` exactly once, without the
  previous panel-runtime recursion.
- A non-empty active or recently blurred project text selection mutates the
  canonical `rich_text.spans`. Deterministic split/merge preserves `bold`,
  `color`, and the untargeted style while adding optional `font_family` and
  numeric pixel `font_size`; without a range, whole-text fallback remains.
- WebGPU measurement, wrapping, caret, selection, line height, and texture
  rasterization consume the same per-span family/size contract.
- The text rasterizer restores the canvas font after range measurement and
  reapplies the current run font immediately before paint. A recording-canvas
  contract proves `Hello` with `[1,4)` draws `H`/`o` in the base font and only
  `ell` in the selected family/size, with non-overlapping measured advances.
- The shared Atome/Squirrel slider owner now distinguishes a pinned click from
  a direct relative drag at 4 px. A compact click pins open, a second compact
  icon/label click closes, direct drag closes on release, and pinned rail drag
  stays open. Bevy and DOM projections delegate to that owner.
- New and updated focused contracts pass **12/12**, plus the real contextual
  Size touch-surface scenario passes. Syntax, M0, Web build, Bevy Cargo check,
  and the iOS Simulator application build pass. The execution-order audit
  remains red only for the two unrelated unregistered todo documents already
  recorded. The real browser retry again reached one shared canvas and an empty
  warning/error console, but `remote_account_not_provisioned` prevented a
  record-backed selection; product acceptance therefore remains pending.

##### Package 9 — Layer (workstream slot B)

Status: `active` since 2026-08-07 — slot B, freed by the Finder approval.
Unstarted; it runs in parallel with Package 8.

- Scope: the routed `layer` panel — SVG layer manifest listing, layer
  selection, and layer detail — on the shared BevyUI route.
- Required families: 1, 3, 4, 12, 17, and 30. It is the most direct consumer of
  what Infos just built: hierarchical depth/chevron rows (12), selection
  summary (17), and the detail table composition (30).
- `owns`: the `layer` Bevy panel composition, its registry routing, and its
  legacy modules `eVe/intuition/tools/layer.js`,
  `eVe/intuition/tools/layer_panel_styles.js`, and the panel-side use of
  `eVe/intuition/tools/core/svg_layer_store.js`.
- `consumes`: the shared panel shell, selectable list with hierarchical depth,
  selection summary, and detail table owners. It modifies none of them.
- Non-collision evidence: this legacy module set is disjoint from Package 8's
  `size`/`font`/style-helper cluster, so both slots may run at the same time.
- Canonical state: `core/svg_layer_store.js` and its existing
  `SVG_LAYER_MANIFEST_*` / `SVG_LAYER_SELECTED_*` event contract remain the sole
  owner. The panel keeps only disposable expansion and notice state; it creates
  no second manifest, cache, or selection owner.
- MCP command ledger: required before composition. The canonical owners to map
  are the registered panel tool `ui.layer.panel` for open/close and the
  existing `invokeToolGateway` layer-selection path
  (`readProjectSelectedLayer` / `writeProjectSelectedLayer`) for the selection
  intent. Passive manifest display needs no command.
- Cross-dependency: **none since 2026-08-07.** Families 12, 17, and 30 were
  frozen under Infos; the Infos approval unfroze all three, so Layer can reach
  `validated` on its own evidence. It remains the most direct consumer of what
  Infos built, so its composition should reuse those owners rather than extend
  them.
- Scope freeze before composition: write down the complete `layer` surface —
  manifest listing, selection, detail, and every state the SVG layer store can
  produce — before composing. Nothing hard to port is dropped mid-migration.
- Exit criterion: the panel opens on the shared canvas through its real tool,
  lists and selects SVG layers through the canonical store, has focused
  contracts and a gap-free retirement ledger, has an explicit product-owner
  approval, and retains no parallel DOM route.

##### Package 10 — Family 14, sortable result-column header (shared component)

Status: `validated` — 2026-08-07, through its first consumer. The product owner
approved the Finder panel, which composes this header for the three record
scopes, so Family 14 is accepted as it ships there. Shared visual component
package: it occupied no workstream slot.

**Scope of that acceptance, stated precisely.** What was approved is the header
as composed in Finder: the column set per scope, the sort toggle, the active
tint and the caret. The Panel Lab specimen matrix — hover, focused, disabled,
non-sortable — was never displayed on a real canvas, because the available
browser instance never mounted Panel Lab. Those states are covered by the
28/28 probe and by the shared `select`/`table` tokens they reuse, not by visual
inspection. Panel Lab is scheduled for deletion anyway (*Panel Lab
retirement*), so the specimen is not a durable gap; a future consumer that
needs the disabled header should confirm it visually then.

- Scope: the only component family the Finder migration is actually missing.
  Source review of
  [bevy_panel_table.js](../../eVe/intuition/runtime/bevy_panel/bevy_panel_table.js)
  confirms the existing table header is **passive** — plain text cells, no sort
  direction, no pointer handler — so an interactive extension is required.
- Legacy behaviour to cover, from `finder_view.js:187-255`: click toggles
  `asc`/`desc` per column through `orderState`; the active column takes the
  accent tint while the others stay at `0.7` opacity (`updateHeaderTint`); a
  420 ms long press on the type header opens the Filters sub-panel
  (`openTypeHeaderFilter`, `LONG_PRESS_HEADER_FILTER_DELAY_MS`); the visible
  column set depends on the scope — `Access` and `Pseudonym` appear only in the
  `people` scope.
- `owns`: the new canonical contract
  `atome/src/squirrel/components/sortable_header_contract.js`, modelled on
  `table_contract.js` and `selectable_list_contract.js`, and the new shared
  builder `bevy_panel_sortable_header.js`.
- `consumes`: `BEVY_PANEL_TOKENS.table`, the native `button` primitive, and the
  shared `registerPressGesture` gesture owner for the long press. No local
  palette, no second renderer, no local timer.
- Interface: it emits generic sort and long-press intents only. The consuming
  product panel owns the sort value and the domain meaning; this package maps
  no MCP command and records no product-data ledger impact.
- Exit criterion: focused contracts, a cumulative state matrix in Panel Lab
  covering idle/hover/pressed/focused/active-ascending/active-descending/
  disabled, real-canvas evidence, and explicit product-owner approval.
- Direction caret: the family definition requires visible direction, which the
  legacy header never showed — it kept direction only in the invisible
  `orderState`. The caret is therefore an addition mandated by the family, not
  legacy parity, and reuses the Select chevron shape and geometry tokens so a
  sorted column and an expanded Select read as one vocabulary.

Current evidence — 2026-08-04, implementation complete, approval pending:

- `atome/src/squirrel/components/sortable_header_contract.js` reuses
  `normalizeTablePresentation` for column geometry, so a sorted header and the
  rows beneath it can never resolve different widths. It adds per-column
  `sortable`, validates the sort key against the column set, rejects any
  direction outside `asc`/`desc`, and exposes `nextSortState` so every consumer
  toggles identically.
- `bevy_panel_sortable_header.js` composes native `button` cells for sortable
  columns and passive `panel` cells otherwise, reuses the `table` header paint
  and `select` focus/disabled tokens, and mounts no handler when disabled.
- One named token group `EVE_PANEL_SKIN_TOKENS.bevyPanel.sortableHeader` was
  added for the three things nothing existing expressed: the active-column
  tint, the two label opacities, and the caret gap. Everything else reuses the
  `table`, `select`, and control-palette tokens.
- Accent single source: the active-column tint was a CSS-only literal
  (`rgba(100,255,150,0.9)` in `eVe/elements/look/tokens.js`) that the canvas
  could not read. It is now defined once as `EVE_COMMON_SKIN_TOKENS.systemAccent`
  from integer channels, with both the GPU tuple and the CSS string derived from
  it; the legacy token consumes that string, so no second value exists.
- Panel Lab specimen: `bevy_panel_lab_sortable_header_runtime.js` composes two
  rows — an interactive header carrying one deliberately non-sortable `Access`
  column, and a `disabled` header — so idle, hover, pressed, focused,
  active-ascending, active-descending, non-sortable, and disabled are all
  visible in one matrix. It emits only closed `panel_lab.sortable_header.*`
  intents, records the long press without opening anything, and resets to
  `date`/`desc` on close or reload. It is wired into `bevy_panel_lab_surface.js`
  through `readState`, `buildContent`, `handleEvent`, and the Lab reset.
  Localized keys were added to both `languages_en_core.js` and
  `languages_fr_core.js`.
- Probe `temp/sortable_header_probe.mjs` passes 28/28 and was verified to fail
  red when the accent single source is broken. It covers contract rejections,
  exactly one active column, exact column-width totals and offsets, the toggle
  rule, button-versus-passive cells, caret presence/orientation/non-overlap,
  handler suppression when disabled, long-press routing, absence of any GPU
  colour literal, accent GPU/CSS equivalence, specimen reset, refusal of both
  unknown and non-sortable intents, pass-through of foreign intents, and the
  real `panelLabSurface` composing the specimen and routing a sort intent to it.
- `npm run check:syntax` passes; `git diff --check` is clean; the real
  `eve_presets.js`, `base_preset.js`, `skin/index.js`, and `eVe_look.js` entries
  still link under a real ESM import, proving the new look → skin dependency
  introduces no cycle.
- **Real-canvas acceptance — closed on 2026-08-07 through Finder.** It was never
  captured in Panel Lab: the available browser instance mounts only the
  dashboard skeleton — `readDiagnostics()` reports a single `dashboard_bevy_ui`
  tree with 33 overlay records and no text record, and the bottom main menu
  never mounts, so Panel Lab cannot be opened there. The header was instead
  reviewed where it actually ships, in the approved Finder panel. See the scope
  note under the status above for what that acceptance does and does not cover.

##### Package 11 — Finder panel (workstream slot B)

Status: `validated` — explicit product-owner approval recorded on 2026-08-07,
covering the panel **and** the `place` scope with its native in-canvas map.
Slot B is released. The Finder HTML retirement recorded in
`finder_html_line_migration_registry.md` is authorized from this date.

- Scope: the routed `finder` panel — the largest remaining migration at
  **2 694 lines across 10 modules**, plus `map.js` (341 lines).
- Slot decision of 2026-08-04: the product owner selected Finder, so it takes
  slot B and **Layer (Package 9) returns to the queue**. Layer was `planned`
  and unstarted, so nothing is lost. Slot A keeps Size then Font unchanged.
- Required families: 3, 4, 6, 13, and 14. **Family 17 is recorded
  `not_applicable`** — see the coverage ledger below.
- `owns`: the `finder` Bevy panel composition, its registry routing, and the
  legacy modules `finder.js`, `finder_view.js`, `finder_record_projection.js`,
  `finder_record_model.js`, `finder_filters.js`, `finder_refresh.js`,
  `finder_controller.js`, `finder_data_sources.js`, `finder_row.js`,
  `finder_state.js`, and `map.js`.
- `consumes`: the shared panel shell/footer/scroll/lifecycle owners, scope
  chips, selectable list, accordion, select, editable text, panel state, table,
  and Package 10's sortable header. It modifies none of them.
- Cross-dependency: **none.** With Family 17 `not_applicable`, Finder depends on
  no unvalidated Infos component and may reach `validated` independently.

**No search field — deliberate, not an omission.** `finder.js:121-133` builds a
search row with `display: 'none'`, `height: '0'`, and `overflow: hidden`. It is
intentionally invisible; the input it holds (`finder.js:145`) is only a hidden
state carrier written from outside by `quickSearchFinder` and `setScope`
(`finder_controller.js:82`, `:130`) — that is, by the inline finder tool. Its
`onInput` handler can never fire. The Bevy panel therefore **composes no search
field**; `finderState.query` stays a runtime value fed by the inline tool, and
the hidden row, its `search.svg` icon, and the dead handler go to the deletion
ledger rather than the migration ledger.

**Composed surface**, top to bottom: four scope chips; the sortable result
header; the results list plus an `N results` status line — currently a
hard-coded English string at `finder_view.js:321` that **must be localized** in
the Bevy composition; the `Filtre` toggle with its active state; and the
expandable Filters block holding the `Name` and `Type` rows, the `+` control,
and the custom filter rows.

**Multiple filters and `+` placement.** Custom filters are multiple, not
single: `finderState.filters` accumulates rows and `finder_view.js:135` ANDs
them all through `filters.every(matchCondition)`, silently ignoring incomplete
rows. The Bevy composition preserves that semantics exactly. The `+` placement
is corrected: today it sits in a `custom` row inserted **before** the filter
container (`finder_filters.js:93-124`), so it stays stuck above the stack. In
the Bevy composition the `+` is **re-anchored below the last added filter row**
after every add, so the "add another" affordance is permanently at the bottom
of the Filters block; with zero rows it sits under `Name`/`Type`. The block
grows downward inside the shared scroll and never covers the `Filtre` button or
the panel footer. Each custom row keeps its own hidden `max` input revealed
only when that row's condition becomes `between`.

**Per-row delete — new, product-owner request of 2026-08-04.** The legacy panel
has no way to remove a custom filter row: once added it only disappears on
panel reset. Since rows are meant to be stacked, the Bevy composition adds a
delete control on **every** custom filter row, leading the row so it stays
aligned across the stack. It reuses the validated action button at the same
`22 × 22 px` geometry as `+`, with the `destructive` variant. Removing a row
drops it from `finderState.filters` and re-runs the AND filter immediately; the
`+` re-anchors under whatever row is now last. Removing the only row returns
the block to `Name`/`Type` plus `+`.

**Native select must move in-canvas.** The condition dropdown currently renders
as a native OS popup outside the canvas. It becomes the validated
`bevy_panel_select.js`, rendered inside the shared canvas. This is an accepted
visual change to confirm at review.

Finder coverage ledger:

| Family | Decision/evidence |
| --- | --- |
| 3 | `validated` selectable list, consumed for the result rows. |
| 4 | `validated` panel state for empty/loading/error. |
| 6 | `validated` editable text, consumed for the filter inputs and rename. |
| 13 | `validated` scope chips, consumed for the four scopes. |
| 14 | `validated` 2026-08-07 through its first consumer; see Package 10. |
| 17 | `not_applicable`: source review found a plain `N results` status text, not a selection summary. The validated text and state builders cover it. |
| map presentation | `validated` 2026-08-07: native in-canvas slippy map, owned by `finder_place_map_package.md`. No Leaflet, no DOM map, no embedded web view. |

Finder MCP command ledger:

| Function/intent | Canonical owner/path | Capability | Status |
| --- | --- | --- | --- |
| Open/close Finder | `ui.find.panel` via `invokeToolGateway` | `ui.read` | `mapped` |
| Quick search (query + scope) | the `quickSearchFinder` path behind the same tool | `ui.read` | `mapped` |
| Read atomes / projects | `listStateCurrent`, `AdoleAPI.projects.list` | `atome.read` | `mapped` |
| Read tools | `toolRegistryV2.listTools` | `tool.read` | `mapped` |
| Read contacts | `relationship_store` + `classifyRecipients` | existing recipient policy | `mapped` |
| Rename a record | canonical `commitBatch` | `atome.write` | `mapped` |
| Select a row | `applySelectionIntent` (`runtime/selection.js`) | existing selection policy | `mapped` |
| Sort, filters, accordion, `N results` status | disposable projection | passive | `not_applicable` |
| `place` scope — geocode a place name | Nominatim `fetch` behind `bevy_panel_finder_place_runtime.js`, same tool | `ui.read` | `mapped` through the Finder tool; the query carries no account, atome, or personal data |
| `place` scope — pan/zoom, tile paint, marker | shared media texture resolver + bounded LRU cache | passive | `not_applicable`; no mutation, no persistence, no credential |

**Two cross-cutting integrations that must not break.**

1. *Row drag is a shared protocol, not Finder code.* `FINDER_DROP_MIME` lives in
   `eVe/intuition/shared/tool_drag.js` and is consumed by `project_drop*.js`
   (five modules), `menu/core/toolbox_runtime_model.js`, and `finder_row.js`.
   Bevy rows are no longer DOM `draggable` elements, so the HTML5 `dataTransfer`
   handshake disappears: the Bevy drag must emit the **same payload** through
   `buildFinderDragPayload` and the shared drag owner. No fork, no second MIME,
   no deletion of `tool_drag.js`. This is the package's first regression risk.
2. *The inline finder stays out of scope but must keep working.*
   `runtime/eve_intuition/finder_inline_runtime.js` (407 lines) is a tool
   surface, not a panel, and the guide excludes it. It opens the panel through
   `openPanelWithToolContext` + `invokeTool`, so the Bevy surface must honour the
   same tool context and scope lock (`scopeLocked`, `scopeBeforeLock`).

**Map decision — superseded on 2026-08-05, do not reapply.** The original
decision recorded here dropped the `place` scope: `finder.js:22` imports
`./map.js`, which mounts Leaflet, OpenStreetMap tiles, and Nominatim geocoding
directly into the Finder dialog DOM, and since Finder may keep no parallel
HTML/Leaflet route, the scope was to leave the Bevy composition and the map was
to return later as its own feature package.

**That decision is reversed.** It was taken by the migrator during the
migration, not by the product owner, and it removed a working feature —
locating a physical place. The judgement on Leaflet was correct; the *ordering*
was not. The `place` scope stays, and the map is **rewritten natively in the
canvas**, not ported: tiles as Bevy image nodes through the existing media
texture resolver and its bounded LRU cache, Nominatim geocoding reused
unchanged as pure `fetch`, and only the Leaflet plumbing — which cannot exist
without a DOM — deleted. The owning package is
[finder_place_map_package.md](finder_place_map_package.md), which also carries
the binding ordering rule this mistake produced: **freeze a panel's complete
scope before migrating it; a piece that cannot yet be ported is planned, never
silently dropped.** Removing a feature is a product decision requiring explicit
approval, exactly like deleting a file.

The Bevy Finder therefore composes **four** scope chips — `local`, `tools`,
`people`, `place`. The `place` scope replaces the record table with the map
section (`bevy_panel_finder_view.js:130`), its own status line, and its result
list; the sortable header is deliberately suppressed for that scope only.

- Exit criterion: the panel opens on the shared canvas through its real tool,
  the three record scopes list and sort their records, the `place` scope
  geocodes and draws its map in-canvas, filters and rename work through the
  canonical owners, row drag reaches a project drop zone, the retirement ledger
  covers all 3,035 lines without a gap, the MCP ledger has no unreviewed
  effectful function, product-owner approval is explicit, and no parallel DOM
  route remains.

Evidence at first composition — 2026-08-05. The `place` scope and its native
map landed after this capture; see *Place scope and native map — 2026-08-05/06*
below, then the approval record:

- Layers delivered: `bevy_panel_finder_model.js` (columns per scope, the single
  column/sort-key table, pure sorting and filtering), `bevy_panel_finder_data.js`
  (per-scope loaders reusing `listStateCurrent`, `AdoleAPI`, `project_security`,
  `loadToolRecordsFromDatabase`, the relationship store and
  `classifyRecipients`), `bevy_panel_finder_view.js`, and
  `bevy_panel_finder_runtime.js`. `tools/finder.js` is now a 68-line bridge.
- Reuse over rewrite: `finder_record_model.js` has zero DOM references and
  `finder_record_projection.js` has exactly one, so both are consumed as-is.
  Only `setSelectOptions` is retired from them.
- Public contract preserved verbatim: `open_finder_panel`, `close_finder_panel`
  and `__eveFinder.{setContext, quickSearch, refreshProjection}`, on which the
  inline finder tool, the matrix runtime and the tool gateway depend.
- `custom: true` stays on the Finder registry entry. It excludes Finder from the
  generic panel ops because the inline finder runtime owns its open/close;
  removing it would create a parallel open path.
- Shared Select widening: `selectNode` hard-coded its width, which made the
  three-across `property | condition | value` row impossible. It now accepts an
  optional width whose default is unchanged, so existing consumers are untouched.
- Placeholder sentinel: the legacy property dropdown used an empty-value
  `<option>`, which the shared Select contract rejects. `FILTER_PROPERTY_NONE`
  replaces it and is treated as unset by the filter engine.
- Line-by-line retirement ledger:
  `todo/ui_bevy/finder_html_line_migration_registry.md` partitions all
  **3,035 historical lines** across the eleven modules — 1,669 migrated or
  replaced, 461 deleted, 905 retained as canonical owners. A persistent contract
  proves the partition has no gap or overlap and was verified to fail red on a
  single-line gap.
- Probe `temp/finder_migration_probe.mjs` passes 106/106 across Package 10 and
  Package 11: contract rejections, the header and its caret, the Panel Lab
  specimen and the real Lab surface, the model's scope/sort/filter behaviour,
  the composed tree (no search field, the 200-row cap, the re-anchored `+`, the
  per-row delete control, the `between` reveal, in-canvas selects), the
  runtime's intents, the scope-gated tool-drag lifecycle, the race guard, and
  the ledger partition. Its `no place scope` assertion belongs to this
  superseded capture and was replaced when the scope returned.
- `npm run check:syntax` passes on 1,046 files; `git diff --check` is clean.
- Real-canvas evidence — 2026-08-05, anonymous session on the running server:
  the login `Essayer` route opens the project surface, the canonical
  `open_finder_panel()` mounts `eve_bevy_panel_finder` as a second tree on the
  **same single canvas**, and `__eveFinder` exposes `setContext`, `quickSearch`
  and `refreshProjection`. Activating the `local` scope, sorting the `name`
  column (mapped to `alphanumeric`/`asc`), opening Filters and adding two rows
  produced a 79-node tree containing **no search node**, the scope chips of that
  day's composition, the `+` control ordered last after both filter rows, and
  one delete control per row. DOM audit: one canvas, zero visible native controls,
  and none of `#eve_finder_dialog`, `#_intuition_v2_find`,
  `.leaflet-container`, the legacy results list or the legacy search input.
  `window.__eveMap` is `undefined`. The browser error console is empty.
- Record-backed listing remains blocked by the environment, not by the panel:
  the anonymous account returns `remote_account_not_provisioned`, the same
  limitation already recorded for Infos. The panel projected the canonical
  `error` state rather than a silent empty list, which is the intended
  behaviour.
- Shell debt recorded: `map.js` is Leaflet's only consumer in eVe, so the two
  `index.html` tags and the three library assets (~299 KB) retire with it. The
  native map replaces the feature, so this deletion removes payload without
  removing behaviour.

**Place scope and native map — 2026-08-05/06.** The `place` scope was restored
and rewritten on Bevy primitives:
`atome/src/squirrel/components/slippy_map_contract.js` owns the pure Web
Mercator projection, tile grid, pan and zoom with no DOM and no network;
`bevy_panel_map.js` composes tiles as image nodes with marker, attribution and
intents; `bevy_panel_finder_place_runtime.js` owns the debounced geocoding, map
state and navigation. `bevy_panel_finder_view.js:130` swaps the record table for
the map section under that scope and suppresses the sortable header there only.
Probe `temp/finder_place_map_probe.mjs` passes: nine categories including
`Lieux`, the map composed with the header hidden, restoration of the record
table on leaving the scope, re-centring on an activated result, refusal of an
unknown result, and a pending search dropped on reset so a closed panel cannot
fire one. `temp/finder_migration_probe.mjs` passes end to end and additionally
asserts that this ledger records the reversal and no longer claims the scope was
deleted — a guard against silently reapplying the superseded decision.

**Approval and retirement — 2026-08-07.** The product owner approved the
complete Finder panel, including the `place` scope and its native map. Package
11 is `validated` and slot B is released. The HTML retirement was executed the
same day: 1 818 lines and 298 KB of Leaflet shell payload removed, verified by
`temp/finder_retirement_probe.mjs` (9/9, red-tested) and by a clean real boot
with zero Leaflet requests. See the deletion-gate section of
`finder_html_line_migration_registry.md`. Record-backed listing,
rename, and tool drag against a provisioned account were reviewed by the
product owner directly; they were never captured in the integrated browser,
whose anonymous account returns `remote_account_not_provisioned`. That
distinction is recorded so it is not later read as automated evidence.

##### Package 12 — Interactive matrix (shared component) + project view modes

Status: `in_review` — implementation complete 2026-08-07, product approval
pending. Shared visual component plus its first consumer; it occupies **no
workstream slot** (slot A remains Size then Font, slot B remains Layer) and
touches none of their panels, legacy modules, or token groups.

**Why a new builder rather than an extension of `tableNode`.** The validated
table/property-grid position is *passive by contract*:
[table_contract.js](../../atome/src/squirrel/components/table_contract.js)
requires at least one row, `bevy_panel_table.js` mounts no handler and no scroll
area, and Infos composes it for immutable property grids
(`bevy_panel_info_view.js:65`). Making it interactive would break that contract
and its tests. The matrix is therefore a sibling builder that **delegates its
column geometry to `normalizeTablePresentation`**, so a passive table, a sortable
header and a matrix of the same width can never resolve different column
boundaries. No second width resolver exists.

- `owns`: `atome/src/squirrel/components/matrix_contract.js` (row identity,
  cell completeness, selection, the virtualization window) and the shared
  builder `eVe/intuition/runtime/bevy_panel/bevy_panel_matrix.js`.
- `consumes`: `normalizeTablePresentation` for columns, the validated Family 14
  `sortableHeaderNode` when a sort key is supplied, `BEVY_PANEL_TOKENS.table`
  and `.select` for paint, the native `button` primitive for rows, and the
  `scroll_area` virtualization shape already used by the selectable list. No
  local palette, no local renderer, no second selection owner.
- Interaction semantics: rows are `momentary`; a row becomes a `button` **only
  once it carries a handler**, so a selectable-but-unwired row is never a dead
  click target painting hover and press states. Sorting reuses `nextSortState`,
  so a second click means the same thing here as in Finder.
- Empty result: the matrix renders zero rows without throwing, using the same
  probe-row trick the sortable header uses to resolve columns. A project with no
  element is a legitimate state, not a composition mistake.
- Panel Lab specimen: `bevy_panel_lab_matrix_runtime.js` — 120 synthetic rows
  over a 20-row page window, multi-selection, sortable header, one fixed and two
  flexible columns — wired into `bevy_panel_lab_surface.js` through `readState`,
  `buildContent`, `handleEvent` and the Lab reset. Localized keys added to both
  `languages_en_core.js` and `languages_fr_core.js`.

**First consumer — the project view modes.** The View palette
(`tool.main.view` → `ui.view.mode.list` / `.table` / `.natural`) existed and was
declared end to end but was **inert**: `kind: 'view'` fell through to the generic
`return { ok: true, handled: true }` at the end of
`executeBootstrapMomentaryHandler`, and — the decisive one — the menu tool
registration publishes a handler for every menu entry *before* the bootstrap
dispatch table gets its turn (`publishRuntimeRegisteredHandler(..., { overwrite:
false })`), so an entry without a `touch` is inert whatever its `tool_id` maps
to. Both layers are now wired: the `kind: 'view'` branch for the tool-runtime
route, and a `touch` on the three menu entries for the UI route.

- `natural` stays the default and is unchanged: it is the absence of the view
  tree, not a mode of it.
- `list` composes the **existing** selectable list
  (`virtualizedHierarchicalSelectableListNode`) and the Infos-owned record model
  (`hierarchyEntries`, `projectRecords`, `isProjectInfoRecord`) — no second list
  builder. `table` composes the new matrix over the same records.
- The view mounts one full-canvas BevyUI tree `eve_bevy_ui_project_view` on a new
  `projectView` workspace layer (order 500). Being opaque and above every project
  Atome, it hides the natural canvas **without touching a single Atome record**:
  returning to `natural` is an unmount, not a reload. `WORKSPACE_PROJECT_LAYER_MAX`
  moved from `dashboard - 1` to `projectView - 1` so an Atome carrying an
  oversized historical z cannot climb above the view.
- Selection stays with `eVe/intuition/runtime/selection.js`; the view holds none.
- The mode is owned by `project_view_mode_state.js`, defaults to `natural`, and
  persists per project through `commitBatch`. A failed mount never updates the
  stored mode, so it cannot drift ahead of what is displayed.

Current evidence — 2026-08-07:

- `temp/matrix_node_probe.mjs` — column-width totals and offsets at five widths,
  fixed-column stability, height as an exact multiple of the row rhythm, empty
  matrix, selection paint, virtualization (200 rows built out of 5 000, spacers
  summing to the total), page mapping from scroll offset, sortable-header
  consumption and caret placement, and five contract rejections. Verified to run
  **red first** — a `--red` flag inverts the geometric expectations and all of
  them fail against the real builder, so the probe reads the builder rather than
  itself. It caught one real defect: rows without handlers were being emitted as
  `button`.
- `temp/project_view_content_probe.mjs` — drives the **real** load → filter →
  build → intent route for both modes with the canonical reader injected the way
  Finder injects its readers. Covers intruder rejection (the project record, a
  tool, a foreign-project Atome), a child attached by `parent_id`, expand and
  collapse, page changes at the right offsets, real row reordering on sort (not
  just the sort state), refusal of a non-sortable column, numeric date ordering,
  the error state and the empty state.
- `temp/view_tool_handler_probe.mjs` — exercises the real
  `createToolRuntimeBootstrapPanelHandlers` factory: the three operations reach
  the mode owner, `extra_input.view_mode` is honoured, owner refusals and import
  failures propagate, and `arrange`/unknown `kind`s keep their previous
  behaviour.
- `temp/project_view_link_probe.mjs` — ESM link of 13 **entries** (not `node
  --check`, which is per file), the dynamic loader resolving, and 19 i18n keys
  present in both FR and EN. It caught one wrong export expectation.
- **Real-app evidence, browser, anonymous session.** Before the fix, invoking
  `ui.view.mode.list` through the real published handler returned
  `{ ok: false, error: 'tool_interaction_unhandled', name_key: 'view_list' }`.
  After it, the full `list → table → natural → list → natural` cycle returns
  `ok: true` at every step; `eve_bevy_ui_project_view` mounts with its overlay
  records and unmounts to zero; and a sweep of every scene runtime finds **no
  orphan record** carrying the tree prefix. The mode owner ends in `natural`.
- **Not captured: rendered pixels.** Same limitation this guide already records
  for Package 10 — the available browser instance reports
  `nativeUiEnabled: false` with no WASM module, so no widget text or panel
  paints; the dashboard itself renders as flat bands with no text record. The
  overlay-record projection the view is built on is verified; the pixels are not.
  Real-canvas acceptance is what the pending product approval must cover.
- The anonymous session cannot provision Atome commits
  (`remote_account_not_provisioned`), so the real-app run exercised an empty
  project. The view rendered its error state instead of throwing, which is the
  behaviour that path is supposed to have; rows over real records are covered by
  the content probe, not by the browser run.

##### Package 13 — Communication panel

Status: `in_review` — implementation complete 2026-08-07, product approval
pending. The HTML route is retired and its dead code removed; the package is
`acceptance_pending` as a workstream, which releases its slot.

**Slot exception, recorded explicitly.** Both slots were occupied (A: Size then
Font, B: Layer) when this package started, so it ran as a third concurrent
workstream. That is a deviation from the two-slot rule, taken on an explicit
product request to migrate Communication, and it is written here rather than
taken silently. Non-collision held in fact: Communication owns no module, token
group or shared builder that slot A or slot B touches — its legacy cluster
(`communication_*`, `preset_comm_*`) is disjoint from
`selection_style_apply.js`, `style_panels_visual.js`, `layer.js`,
`layer_panel_styles.js` and `core/svg_layer_store.js`.

**Families 19 and 20 leave the deferred list.** The clause allows it when a
source audit finds a measured, non-Molecule Panel occurrence — the same
precedent that promoted Family 14 with Finder. The notification table *is* that
occurrence for Family 19, and the compose area for Family 20. Neither was a
blank-page build: Family 19 composes `sortableHeaderNode` (validated, Family 14)
over `normalizeTablePresentation`; Family 20 composes the validated
`multilineInputNode` and `editableTextInputNode`.

- Required families: 1, 3, 4, 6, 9, 11, 19, 20.

| Family | Coverage decision |
|---:|---|
| 1 | `validated`, consumed — `buttonNode` for the three compose actions, the row actions and the condition controls. |
| 3 | `validated`, consumed. |
| 4 | `validated`, consumed — every text field routes through `textInputNode`. |
| 6 | `validated`, consumed — the advanced panel is one `accordionNode`, not a local show/hide. |
| 9 | **`not_applicable`** — source review found the legacy attachments render a plain text chip through `renderAttachmentList`; there is no thumbnail, no photo editor and no source field. `mediaCardNode` exists and stays unconsumed. |
| 11 | `validated` with the panel — the compose drop target reports a typed refusal (`comm_drop_payload_unsupported`) and a visible notice instead of silently ignoring an unknown payload; file ownership stays with the canonical `getDropAttachment`. |
| 19 | `validated` with the panel — notification row over the shared sortable header, with the unread marker as the only new token. |
| 20 | `validated` with the panel — multiline body, attachment chips with removal, send busy state. |

- `owns`: the `communicate` panel composition, its legacy cluster, the
  `EVE_PANEL_SKIN_TOKENS.bevyPanel.comm` token group, and
  `bevy_panel_comm_{model,data,editing,view,advanced_view,runtime}.js`.
- `consumes`, frozen: `sortableHeaderNode`, `accordionNode`, `selectNode`,
  `toggleableRowNode`, `multilineInputNode`, `editableTextInputNode`,
  `textInputNode`, `panelStateNode`, `buttonNode`/`node`/`textNode`,
  `normalizeTablePresentation`, `buildBevyPanelTree`.
- Cross-dependency: **none.**

**New token group.** `bevyPanel.comm` declares only what nothing existing
expressed: the unread marker and row tints, the advanced two-column rhythm, and
the chip removal geometry. Chips reuse `scopeChip`, the table reuses `table`,
paint reuses `select` and `input`.

**Scope freeze:** `communication_surface_freeze.md`, written before any code.
**Retirement ledger:** `communication_html_line_migration_registry.md` —
3 093 lines removed against 2 423 lines of package and neutral remainder,
partitioned `M`/`R`/`D` with no line omitted.
**MCP ledger:** `communication_mcp_command_ledger.md` — 11 functions complete,
7 gaps recorded. Six of the seven predate this migration (three missing
notification verbs, the start schedule and the property scopes the panel
collects but never sends, the untyped condition format); the seventh is the
Visio product decision. The ledger is required to be *complete*, not gap-free.

**Six defects were frozen into scope and repaired rather than carried over.**
D1 `recordManualRecipient` called without being imported, throwing on every
manually typed recipient; D2 three bare `readPropertyPanel`/`writePropertyPanel`
references making the **Write** button throw; D4 a dead empty state, now the
shared `panelStateNode`; D5 condition rows that never wrote state while the send
path read it, so every share went out with `condition: null`. D3, the **Visio**
button dispatching an event nothing listens for, is preserved unchanged pending
a product decision — a migration does not silently remove a control.

**D6 is `blocked`, not migrated.** The unread badge, the message bubble and the
pulse target `#_intuition_communicate` and `#toolbox`; neither node has been
built since the DOM main menu was retired, so the badge had already stopped
counting and nothing reported it. Projecting a badge onto the Bevy menu item
needs a main-menu capability that does not exist —
`bevy_ui_product_registry.js` exposes `setToolLatchedState` and nothing else —
and building one from a panel workstream would violate shared-ownership
non-collision. The unread count moves to the panel footer status line, which the
panel owns.

Current evidence — 2026-08-07:

- `temp/comm_migration_probe.mjs` — 40 checks over the surface identity, the
  model projection, and every element of the scope freeze: four sortable
  columns, row cells and per-kind action sets, the unread marker, sort toggling
  and flipping, the compose fields, the recipient default and its `all`
  fallback, attachment add/remove, drop acceptance and typed refusal, the six
  advanced sections, Start/End independence, the eight-property picker with
  Cancel/OK/All semantics, state-backed condition rows, and the search route.
  **Verified red first**: stubbing `buildContent` to return `[]` fails 17 of
  them, so the probe reads the panel rather than itself.
- `temp/comm_contract_probe.mjs` — the nine window globals, the two conditional
  installs, setter dedup, and the aliasing invariant that `commState.compose`
  and `commState.advanced` *are* the panel's objects, including the logout
  reassignment path. It caught a real gap: the recipient entry could only be
  committed by blurring the field, which loses entries on touch, so an explicit
  add control now shares the same commit path.
- `temp/comm_route_probe.mjs` — exercises the actual HTML/Bevy branch predicate
  in `panel_surface_runtime.js`: unregistered before the lazy tool module loads,
  registered after, `surface_id` carrying the `eve_bevy_panel_` prefix that the
  atomic overlay reconciliation and the `panel` layer band key off, and no
  `createEveDialog` left in the module graph. It also re-checks that info,
  finder, contact and calendar did not regress.
- `temp/comm_latched_state_probe.mjs` — covers the defect the call audit caught,
  verified red first (see below).
- Full call audit after deletion: every symbol from the six removed modules,
  plus the eleven dead constants in `communication_base.js` and the 72 `comm*`
  presets, has zero remaining references across `eVe/`, `atome/src/` and
  `tests/`. One repo test importing the deleted presets was repaired.

**The call audit caught a defect class, and it is binding on every future
panel.** `main_tool_latched_state_runtime.js` resolved a menu tool's latched
state by looking up an HTML dialog id. A migrated panel has no DOM node, so the
lookup returns `null` and the tool reports "not open" forever. **Finder and
Calendar had already regressed this way at their own migrations** — the map
still listed `eve_finder_dialog` and `eve_calendar_dialog` long after both
routes were retired, and nothing reported it. The branch now keys off
`isBevyPanelSurfaceRegistered`, the same predicate `panel_surface_runtime.js`
uses to route the open, so the latch cannot disagree with what opened and a
forgotten map entry cannot reintroduce the bug.

Rule this produces: **a panel retirement is not complete until every map keyed
by that panel's DOM id is re-keyed or removed.** Grepping for the removed
module names is not enough — the id outlives the module.

Applying that rule immediately surfaces **twelve further `eve_finder_dialog`
references left by the Finder retirement**, all failing silently:
`finder_inline_runtime.js:102,118,189`,
`tool_runtime_finder_execution.js:14,75`,
`panel_layout_geometry.js:178`, three CSS rules in `base_preset.js`, and three
in `tests/probes/map_tool_attribution_contract.test.mjs`. `eve_calendar_dialog`
and `eve_timeline_dialog` are also still the declared `surface_id`s in
`panel_definitions.js:166,178` while both surfaces route through Bevy.

**Repaired 2026-08-08** (guard: `temp/finder_dialog_id_retirement_probe.mjs`,
red on 12 checks first). Disposition of each survivor:

| Reference | Disposition |
| --- | --- |
| `finder_inline_runtime.js:102` `panelId: 'eve_finder_dialog'` | dropped — `openPanelWithToolContext` resolves `eve_bevy_panel_finder` from the definition, like every other panel |
| `finder_inline_runtime.js:118` focus of `#…__search__input` | carried to the surface — the Bevy Finder owns no text field (`state.query` is fed only by `applyToolContext`), so `focus` targets the inline contenteditable, and reports `focused` honestly instead of always `true` |
| `finder_inline_runtime.js:189` DOM search fallback | deleted — `window.__eveFinder.quickSearch` is installed beside the surface registration and is the only search route |
| `tool_runtime_finder_execution.js:14` `resolveFinderPanelVisible` | re-keyed on the surface — `isPanelSurfaceOpen('finder')`. It answered "closed" forever, so the fallback `touch` could only re-open an open panel |
| `tool_runtime_finder_execution.js:75` `panelFocus` fallback | dead focus removed; the fallback opens and returns `focused: false` |
| `panel_layout_geometry.js:178` bottom clearance | deleted with `resolvePanelBottomClearancePx` and its three call sites — Finder was the map's only entry, so it returned 0 for every remaining HTML panel |
| `base_preset.js:99,107,113` result-row CSS | deleted — the rows are Bevy nodes styled from `BEVY_PANEL_TOKENS` |
| `tests/probes/map_tool_attribution_contract.test.mjs` | file deleted — its subject, `eVe/intuition/tools/map.js`, went with Leaflet, so the probe could not even import |

`surface_id` was re-pointed for `timeline`, `calendar` **and `contact`** (the
same defect, not previously listed) to their `eve_bevy_panel_*` ids. Re-pointing
alone does not fix the behaviour, because the Bevy id is not a DOM node either:
`isPanelSurfaceVisible` in `panel_tool_registration_runtime.js` now consults
`isBevyPanelSurfaceRegistered` / `isBevyPanelSurfaceOpen` first. That predicate
gates `toggle_on_pointer`, so **a pointer click on an open contact, timeline or
calendar panel re-opened it instead of closing it** — the user-visible half of
this defect class.

`tool_runtime.js` reaches the predicate through the late-bound
`runtime/panel_api.js` (`isPanelSurfaceOpen`, registered by `eVeIntuition.js`),
not by importing `bevy_panel_runtime.js`: a direct import closes a cycle back
through `tool_gateway.js`. Verified with a module-graph scan — the four cycles
that remain are the pre-existing `selection ↔ tool_gateway` ones.
- **Not captured: rendered pixels.** Same limitation recorded for Packages 10
  and 12. Real-canvas acceptance is what the pending product approval must
  cover, together with mobile, Tauri and iOS.

##### Package 14 — Project view: List enriched, Matrix tiles, project-name footer

Status: `in_review` — implementation complete 2026-08-07, product approval
pending. Shared visual component plus the two project-view modes; it occupies
**no workstream slot** and touches none of slot A's or slot B's panels, legacy
modules or token groups.

**What the modes became.** `list` and `table` had converged into two flat views
of the same records. They now differ by purpose: `list` keeps the collapsible
hierarchy and gains the columns the table used to own — leading preview, name,
type, modified — while `table` (key unchanged, so persisted `view_mode`
preferences keep resolving) draws the Dashboard's card language: a square tile
of the element's own pixels with its name on a band underneath. Its menu label
became **Matrix**.

**The preview is a re-projection, not a capture.** There is no thumbnail capture
for an atome — only projects have one, through
`project_preview_runtime.js`. The tile therefore re-projects the record into its
own box via `overlayRecord` + `overlayRecordLayout: 'node_box'`, the mechanism
the selectable list's thumbnail already proved.

- `owns`: `project_view_{matrix_content,footer,record_fields}.js`, the
  `bevyPanel.mediaCard.tile` token group, and `tileMediaCardNode`.
- `consumes`, frozen: `virtualizedHierarchicalSelectableListNode`,
  `panelStateNode`, `textInputNode`, `createBevyUiTextInputSession`,
  `createTextEditingLayout`, `BEVY_PANEL_TOKENS`.
- Cross-dependency: **none.**

**Two additive parameters on a shared component.** `hierarchicalSelectableListNode`
gained `metaColumns` and `thumbnailPlacement`, both defaulting to the previous
behaviour. The Infos panel, its other consumer, is untouched — asserted, not
assumed, by a dedicated probe.

**The header is gone, and with it a literal `"null"` on screen.** The count read
`Number.isFinite(Number(total)) ? String(total) : …`; `Number(null)` is `0`, so
the guard never fired and `String(null)` rendered. The canonical
`virtualizedListCountLabel` already handled it correctly and was simply not
being used. The surface now carries one footer holding the project name and
nothing else.

**Renaming reuses the canonical writer.** A double click or a 520 ms long press
— the Dashboard's own values for the same gesture on the same object — opens an
inline editor whose commit calls `updateProjectName`
(`intuition/matrix/core/project_data.js`), the single owner the Dashboard and
the Matrix view already use. It returns a bare boolean, so a `false` restores
the previous name rather than leaving the screen claiming something the store
does not hold.

Current evidence — 2026-08-07:

- `temp/project_view_list_probe.mjs` — additivity guard (no meta nodes, unchanged
  label width and thumbnail anchor without the new options), then the opt-in
  layout: both columns, leading preview, no overlap, hierarchy intact, and the
  narrow-row fallback that drops columns rather than the name.
- `temp/project_view_matrix_probe.mjs` — column count from width, virtualization
  (500 records build under 100 tiles), full-height content, window follows
  scroll, sub-row scroll does not repaint, the three states, tile activation.
- `temp/project_view_footer_probe.mjs` — the footer holds one node, no header
  survives, both gestures reach the same write path, a drag cancels the long
  press, an unchanged or blank name writes nothing, and both a `false` and a
  non-boolean return restore the previous name.
- `temp/project_view_count_probe.mjs` — `totalCount: null` never renders
  `"null"`, and the faulty pattern survives in no file.
- `temp/project_view_content_probe.mjs` and `project_view_link_probe.mjs` —
  Package 12's own probes, ported to the new surface rather than deleted.
- All four new probes verified **red first** by sabotage: ignoring the writer's
  refusal, building every tile, and reintroducing the header each fail them.
- **Not captured: rendered pixels.** Same limitation as Packages 10, 12 and 13.

#### Deferred pending Molecule migration and wider panel scope

These families remain part of the 16-panel programme but are outside the active
Calendar/Contact component backlog. They may start only after Phase 4 —
Molecule / MTraX — is validated, or when a future source audit identifies a
measured, non-Molecule Panel occurrence. **Family 14 left this list on
2026-08-04**: the Finder migration is exactly the measured, non-Molecule Panel
occurrence this clause anticipates, so it is now Package 10. **Families 11, 19
and 20 left it on 2026-08-07** for the same reason, with the Communication panel
as their measured occurrence; **Family 9 was resolved `not_applicable`** by the
same source audit. See Package 13.

7. Color field and canonical RGBA value presentation.
8. Color-swatch grid with selected, hover, focus, and disabled states.
10. Asset grid with selection, virtualized range, and keyboard-independent
    pointer/touch interaction.
12. Hierarchical tree row with depth, expand/collapse, selection, and disabled
    descendants.
15. History event row with current-position and grouped-section presentation.
16. History cursor / scrubber, separate from the compact product tool slider.
36. **Tool slider:** the compact Intuition product-tool slider, only if Size
    selects that interaction.

#### Family 1 — Labeled action button

Status: `validated`

- Canonical contract: `atome/src/squirrel/components/action_button_contract.js`
  normalizes the localized label, the `neutral` or `destructive` variant, and
  the `disabled`/`busy` presentation flags. Busy and disabled states mount no
  interaction handler.
- Bevy composition: the existing shared `buttonNode` consumes that contract and
  the shared Panel skin. Existing non-Panel tool surfaces retain their neutral
  default without changing their tool intents.
- Panel Lab contract: one cumulative state matrix contains a neutral interactive
  `358 × 32 px` button plus busy, disabled, and destructive rows. Its only
  events are closed `panel_lab.action_button.*` intents; it has no MCP call,
  Atome mutation, DOM control, or durable state.
- Required approval evidence: focused contract and pointer tests, real-canvas
  press/release/activation, no interaction for busy/disabled rows, close/reopen
  and reload reset, empty console, and explicit product-owner visual and
  behavioral approval.

Validation evidence — 2026-07-28:

- focused action-button and Panel Lab contracts pass, including presentation
  validation, handler suppression, interactive pointer routing, and reset;
- the canonical 520 ms Panel Lab long-press reload contract passes;
- `npm run check:syntax`, `npm run check:m0`, and
  `npm run check:execution-order` pass;
- the integrated browser opened Panel Lab through its shared-canvas tool,
  displayed the neutral, busy, disabled, and destructive rows, exercised the
  neutral/destructive actions, confirmed no response from busy/disabled rows,
  verified close/reopen reset, and recorded no warning or error console output;
- the product owner explicitly approved the visual and behavioral matrix on
  2026-07-28. Family 1 is therefore `validated`.

#### Family 2 — Segmented control

Status: `validated`

- Integration decision: the normalized BevyUI tree supports the native
  `segmented_control` kind and native `button` primitives, but the active
  WASM runtime has no specialized segmented-widget renderer. The chosen shared
  composition therefore uses that native root with native button segments; a
  panel-local renderer, DOM control, tab-content system, or alternate widget
  contract is rejected.
- Canonical contract: `atome/src/squirrel/components/segmented_control_contract.js`
  reuses Select option normalization and requires at least two unique options
  plus exactly one known selected value. The consuming product surface must own
  that value; the Panel Lab has only reset-on-close ephemeral presentation state.
- Accepted specimen contract: one localized `358 × 32 px` horizontal control
  with equal `List` / `Table` / `Natural` segments. It reuses the approved
  Panel/Select material, selected tint, focus ring, disabled opacity, and
  divider paint. Idle, hover, focus, pressed, selected, and disabled remain
  visually distinct. Activating the selected segment preserves its selection.
- Lab behavior: every segment emits only a closed `panel_lab.segmented.*`
  intent. It creates no MCP call, Atome mutation, DOM control, or durable state,
  and resets to `List` after close or reload.
- Required approval evidence: focused contract and pointer tests, real-canvas
  press/release/cancel/selection evidence, close/reopen and reload reset,
  empty browser console, and explicit product-owner visual and behavioral
  approval.
- Current evidence — 2026-07-30: the focused segmented-control and shared
  pointer contracts pass `11/11`; `check:syntax`, `check:m0`, and
  `check:execution-order` pass. The shared pointer contract mounts the canonical
  Panel Lab route, reveals the control, resolves
  `panel_lab_segmented_control_segment_{0,1,2}` from the active foreground
  scene, verifies each record's hit-test, and routes real
  `pointerdown → pointerup` cycles through `Tableau`, `Naturel`, and the active
  `Naturel` segment without changing it. In the integrated browser, the actual
  BevyUI tool opened Panel Lab; the visible selected tint moved exclusively
  through `Liste`, `Tableau`, and `Naturel`, then reset to `Liste` after both
  close/reopen and reload/reopen. The browser warning/error log is empty. The
  product owner explicitly approved the visual and behavioral specimen on
  2026-07-28. Family 2 is therefore `validated`.

#### Family 3 — Interactive selectable list row

Status: `in_review`

- Integration decision: native `row` is a layout primitive, not an interactive
  kind. The shared builder therefore uses native `button` rows, retains the
  approved passive-row geometry, and reuses Select paint and check-mark
  primitives. A DOM list, local renderer, mutation, tab system, or alternate
  selection owner is rejected.
- Canonical contract: `selectable_list_contract.js` reuses Select option/value
  normalization, requires at least two unique options and one known enabled
  selected value, and rejects a disabled selected option. The consuming product
  surface owns the value.
- Accepted Lab specimen: a `358 × 104 px` transparent group with three
  `358 × 32 px` rows and `4 px` gaps: selected `List item`, available `Second
  list item`, and disabled `Unavailable item`. Selection uses the existing blue
  tint plus right-side Select check mark; hover, pressed, focus, and disabled
  use existing Select state tokens. Activating the selected row preserves it.
- Lab behavior: it emits only closed `panel_lab.selectable_list.*` intents;
  its value and presentation state reset on close/reload and create no MCP
  call, Atome mutation, DOM control, or durable state.
- Required approval evidence: focused contract/pointer/projection tests,
  real-canvas interaction of both enabled rows and the disabled row, close/reopen
  and reload reset, empty console, and explicit product-owner approval.
- Current evidence: 40 focused/cumulative Panel tests, the Vitest manifest
  guard, `check:syntax`, `check:m0`, and `check:execution-order` pass. In the
  integrated browser, the shared canvas moved selection from the first to the
  second French row, kept the disabled row unchanged, reset to the first row
  after reload, and reported no warning/error console entries. The active
  runtime exposes no canonical overlay record to this browser diagnostic path,
  so coordinate interactions remain diagnostic evidence only. Explicit
  product-owner approval and record-backed pointer validation remain required
  before this family may become `validated`.

#### Family 4 — Localized panel state

Status: `validated`

- Canonical contract: `panel_state_contract.js` accepts only `empty`,
  `loading`, `error`, and `permission_denied`, with a non-empty localized title
  and message. It has no action, handler, or business-state ownership.
- Integration decision: the active native vocabulary already supports the
  passive `empty_state` kind, so `bevy_panel_state.js` composes that kind
  directly rather than creating a DOM view, local renderer, or interactive
  pseudo-control. The panel skin aliases existing neutral, danger, and warning
  semantic values; it creates no parallel state theme.
- Accepted Lab specimen: four static `358 × 72 px` entries, each with centered
  title/message and `4 px` spacing: empty, loading, error, and permission
  denied. The surrounding BodyScroll remains the sole overflow owner.
- Lab behavior: this matrix has no runtime, handler, intent, MCP call, Atome
  mutation, DOM control, durable state, or reset requirement. A future product
  surface owns the actual status and composes any retry or permission command.
- Required approval evidence: focused contract/projection tests, real-canvas
  visual inspection of all four entries, inert pointer checks, close/reopen and
  reload stability, empty console, and explicit product-owner approval.
- Current evidence: focused and cumulative Panel contracts pass. The integrated
  browser rendered every French entry on the shared canvas, left all four inert
  under pointer diagnostics, preserved the static matrix through close/reopen
  and reload, and reported no warning/error console entries. The active runtime
  exposes no canonical overlay record to this diagnostic path. The product owner
  explicitly validated Family 4 on 2026-07-29; record-backed pointer evidence
  remains a technical follow-up for the runtime diagnostic route.

#### Family 5 — Numeric field with stepper and drag adjustment

Status: `validated`

- Canonical contract: `numeric_input_contract.js` normalizes finite caller-owned
  `value`, `min`, `max`, positive `step`, localized non-empty `unit`, and
  `disabled` presentation. It rejects inverted ranges and values outside the
  range; it owns neither a business value nor a mutation.
- Integration decision: `bevy_panel_numeric_field.js` is one shared composite
  builder. It composes existing native `button` controls for `−` and `+`, the
  native `number_input` kind for direct value editing, and a passive unit label.
  It reuses panel input and action-button tokens; no DOM input, spinner skin, or
  alternate theme is introduced. Disabled presentation mounts no handlers.
- Accepted Lab specimen: `Interval [−] [1] [+] months` on the standard
  `358 × 32 px` row. Buttons are `30 × 30 px`, the value field is `56 × 32 px`,
  and the unit remains passive. A scrub drag begun on the value field has a 4 px
  threshold and changes the value by one configured step per 8 px: right or up
  increases, while left or down decreases. A
  cancelled gesture restores its start value; the surrounding scroll area keeps
  vertical-scroll ownership.
- Lab behavior: it emits only closed `panel_lab.numeric_field.*` intents. Its
  value, focus, editor projection, button press state, and drag snapshot reset
  on close/reload and create no MCP call, Atome mutation, DOM control, or
  durable state. A future product caller owns business validation and maps any
  effectful result through its canonical command bus.
- Required approval evidence: contract validation, native-kind/geometry/disabled
  handler tests, direct edit, decrement/increment, drag/cancel, reset,
  real-canvas pointer interaction, empty console, and explicit product-owner
  approval.
- Current evidence: 55 focused/cumulative Panel tests, the Vitest manifest
  guard, `check:syntax`, `check:m0`, and `check:execution-order` pass. In the
  integrated browser, the French specimen incremented from 1 to 2, accepted
  direct entry of 7, changed to 10 after a real scrub drag, and reset to 1
  after close/reopen; the warning/error console was empty. The active runtime
  exposes no canonical overlay record to this diagnostic path, so the canvas
  interactions are diagnostic evidence. The product owner explicitly validated
  Family 5 on 2026-07-29; record-backed pointer evidence remains a technical
  follow-up for the runtime diagnostic route.

#### Superseded passive batch A — Families 9 and 17

Status: `superseded` for the active Panel migration

The batch implementation remains a technical prototype, but it is not a
current Panel component and must not be counted, presented for approval, or
used as a reuse precedent. Source review found no corresponding generic card
in an active legacy Panel: Contact only projects an existing `90 × 90 px`
avatar, while selection counts are Tool-context information. The proposed
`358 × 128 px` and `358 × 64 px` geometries are Lab choices, not measured
legacy Panel geometry.

- **Family 9, media thumbnail/card:** `media_card_contract.js` accepts a
  caller-owned `ready`, `loading`, or `error` presentation plus localized title,
  message, accessibility label, and a source only for `ready`. The builder uses
  a passive native `panel` card with the existing native `image` route for the
  clipped thumbnail; it delegates hydration to the shared renderer. Loading and
  error compose the validated passive state builder. It has no handler, loading
  runtime, DOM control, MCP call, or mutation.
- **Family 17, selection/context summary:** `selection_summary_contract.js`
  accepts localized title/summary and a nonnegative caller-owned count. The
  builder uses a passive native `panel` and text nodes only. It neither reads
  global selection nor creates a second selection owner.
- **No active acceptance path:** a future owner must first identify its
  concrete product surface, measured geometry, interaction model, and canonical
  state owner. The current contracts and Lab specimens do not grant that
  evidence.

#### Surface coverage matrix

Calendar, Contact, Home, Infos, Size, Font, Finder, Layer, and Timeline are the
explicitly ordered migration surfaces; Size, Font, Finder, and Layer entered
scope on 2026-08-04 with the two parallel workstream slots, and **Communicate
entered on 2026-08-07 on an explicit product request** — see the slot exception
recorded in Package 13. Every other matrix
row remains deferred after Phase 4 — Molecule /
MTraX. Each non-deferred
surface may be composed only after its listed families have a recorded coverage decision
(`validated`, `blocked`, or `not_applicable`) and every effectful function has a
mapped MCP command.

| Surface | Required coverage beyond the validated generic baseline |
| --- | --- |
| Home | 1, 2, 3, 4, 5, 6, 8, 9, 17 |
| Contact | 1, 3, 4, 6, 18 |
| Info | 1, 3, 4, 12, 17, 29, 30 |
| Finder | 3, 4, 6, 13, 14. Family 17 is `not_applicable` — source review found a plain `N results` status text, not a selection summary. The `place` scope and its map presentation stay `blocked` by the external provider/privacy/cost contract and leave the Bevy composition; see Package 11 |
| Communicate | 1, 3, 4, 6, 11, 19, 20. Family 9 is `not_applicable` — source review found plain text attachment chips, no thumbnail and no photo source field. See Package 13 |
| Delete | 1, 3, 4, 11, 17 |
| Undo | 1, 4, 15, 16, 17 |
| Paste | 1, 3, 4, 9, 10, 11, 17 |
| Calendar | 1, 3, 4, 5, 6, 13, 21–28 |
| Background | 1, 3, 4, 9, 10, 11 |
| Couleur | 1, 4, 5, 7, 8, 17 |
| Size | 1, 4, 5, 17; family 36 only if the compact tool-slider interaction is selected |
| Font | 1, 3, 4, 17 |
| Detail | 1, 3, 4, 5, 6, 7, 8, 12, 17, 29, 30 |
| Layer | 1, 3, 4, 12, 17, 30 |

No legacy HTML route may be deleted until its entire matrix row is validated,
the real panel has explicit product-owner approval, and the legacy builders,
styles, listeners, tests, and imports have been removed with targeted evidence.

### Parallel product-panel workstreams

Status: `validated` — product-owner decision of 2026-08-04.

Product-panel migration is no longer serialized behind a single next panel.
Two panels may be migrated at the same time, because waiting for one panel's
explicit acceptance before starting the next one is the programme's dominant
delay, not its quality gate.

**Two slots.** At most **two** product-panel workstreams may be `active` at the
same time. A third concurrent panel workstream is forbidden. Shared visual
component packages are not workstreams and do not occupy a slot.

**Workstream states and slot release.** A workstream has exactly one state:

- `active` — implementation, contracts, or evidence still in progress. It holds
  its slot.
- `acceptance_pending` — implementation, focused contracts, real-canvas
  evidence, retirement ledger, and MCP command ledger are complete; only the
  product owner's explicit review remains. **It releases its slot**, so the
  next panel starts immediately.
- `validated` — explicit product-owner approval recorded. The panel leaves the
  slot model.

A product-owner rejection returns that panel to `active`. It reclaims a slot
with priority over starting any new panel; if both slots are then occupied, no
new panel starts until one frees.

**Shared-ownership non-collision.** Two concurrent workstreams must never
modify the same shared builder, canonical contract, or token group. Each
package record must declare two explicit lists:

- `owns` — shared builders, contracts, and token groups this workstream may
  modify;
- `consumes` — shared components it only reads and composes without change.

At most one workstream may own a given unvalidated shared component; the other
consumes it frozen. A workstream that discovers it needs to modify a component
owned by the other workstream must record the need and wait, never fork a
second copy, a panel-local builder, or a temporary style shim.

**Legacy non-collision.** Two concurrent workstreams must never own the same
legacy module. A legacy helper shared by several panels — for example
`selection_style_apply.js` or `style_panels_visual.js` — is deleted only by the
workstream that retires its **last** consumer; every earlier workstream removes
only its own dialog, builders, styles, listeners, tests, and imports. Panels
whose legacy modules overlap therefore belong to the same slot, in sequence,
not to two parallel slots.

**Cross-dependency.** A workstream B may consume a family still `implemented`
or `in_review` under workstream A. B may implement, run its focused contracts,
and gather real-canvas evidence, but B cannot become `validated` before A is
validated. The dependency, and the families it covers, must be written in B's
package record.

**Independent approvals.** Each panel keeps its own coverage ledger, MCP
command ledger, focused contracts, real-canvas evidence, and explicit
product-owner approval. Approving or rejecting one panel never blocks,
invalidates, or delays the other slot.

**Unchanged gates.** A partial Bevy panel and its HTML route must never be
active in parallel **for the same panel**. HTML retirement stays strictly
per-panel and happens only after that panel's own approval. Timeline remains
the final migration, and mobile, Tauri, iOS, and multi-viewport validation
remain complete-panel gates. Finder's former external provider/privacy/cost
gate is closed: the map is drawn natively in the canvas and the only external
call left is the Nominatim geocoding request the legacy panel already made.

**Reporting.** Every counter report required before a composition or an
approval presentation must list **both slots**: panel key, workstream state,
owned shared components, consumed shared components, and cross-dependencies,
in addition to the existing global component, panel, and legacy-route counters.

### Mandatory MCP command mapping at panel creation

Before creating or composing a product panel, create and maintain a panel-level
functional command ledger. For every function the panel exposes, the ledger
must name the canonical runtime tool or domain command, its MCP entrypoint,
required capability/policy checks, and its audit result. A panel function is
complete only when the same canonical command can be invoked from the visible
panel and by an AI through MCP; MCP must prefer `runtime.tools.call` or
`runtime.tools.batch_call` whenever the runtime V2 tool exists.

This is a panel-creation gate, not a requirement to expose graphical elements
as commands. Passive layout, text, separators, and other non-effectful
components need no MCP command. Every component that invokes an effectful
function must instead reuse the function's already-declared canonical command;
it must never introduce a panel-local handler, legacy helper, or second command
path. If no canonical command exists, creating the panel is blocked unless an
explicit security review records `not_applicable` because exposing the function
would transport credentials/secrets or weaken authorization. Such an exception
must reuse the existing authenticated API, remain UI-session scoped, and
document why no MCP/public command is introduced.

The ledger must be reviewed before the panel enters composition and again at
complete-panel acceptance. It must record, at minimum: panel registry key,
function/intent, canonical tool or domain command id, MCP method and parameter
contract, supported actions, capability/policy requirement, audit surface, and
validation evidence. Every declared function must have one explicit status:
`mapped`, `blocked`, or `not_applicable` with its evidence. A panel cannot be
approved, retire its HTML route, or count toward program finalization while any
effectful function remains unreviewed or `blocked`; every `not_applicable`
entry requires explicit security evidence.

Maintain a coverage ledger for every active panel with its registry key,
required component types, individually validated component types, missing
types, Bevy composition status, product-owner approval, and HTML-retirement
status, plus the mandatory MCP command ledger status. A panel may enter
composition only when its required-component column has no gap and the MCP
command ledger contains no unreviewed effectful function.

When a migration package's component contracts are sufficient to cover the
highest-priority product panels, recommend the next one or two panel
compositions, assign them to the free workstream slots, and explain both the
choice and their non-collision evidence. Build each only from the same
canonical builders, tokens, and intent handlers validated in Panel Lab. For a User panel request, first
confirm its active registry mapping (`home` currently owns `tools/user.js`) and
its complete required-component inventory; do not assume a second unregistered
surface.

Before each panel composition and its approval presentation, report the same
current global-task, component, product-panel, and legacy-HTML-route counters
required by the component loop, the state of both workstream slots, and the
panel MCP command-ledger status. Open the completed composition in the actual
browser, verify its visual
hierarchy and every real interaction, exercise every mapped function through
its canonical MCP command with its expected audit evidence, run its focused
contracts, and submit it
for explicit product-owner approval. If it is rejected, repair and revalidate
the same panel without pausing the other active workstream. Only after
functional parity and explicit approval may the
visible HTML route, builders, styles, listeners, and obsolete tests be deleted.
Then prove that only the Bevy route remains and that no visible DOM or double
rendering survives. A partial Bevy panel and an HTML panel must never be active
in parallel.

Program finalization lock: only once all 16 registered product panels have functional
parity, focused evidence, and explicit approval, delete every remaining legacy
panel HTML route, builder, style, listener, fixture, and obsolete test. Verify
that active source and tests contain no executable legacy panel HTML rendering
path and that the shared BevyUI route is the only product-panel renderer. This
HTML retirement is a required final migration task, not deferred cleanup.

Cross-platform and responsive validation occurs only at the complete-panel
gate, after all of that panel's components and its integrated browser
composition have passed. At that point, validate mobile or other target
platforms once for the complete panel when the product owner requests or when
final platform acceptance requires it. This check is never repeated for each
primitive component.

### Authoritative workstream-slot decision — 2026-08-07

Contact was validated by the product owner on 2026-08-02, Home on 2026-08-03,
Calendar on 2026-08-04, and **Infos and Finder on 2026-08-07**. The programme
therefore records **5/16 validated panels**. Calendar Packages 4 to 6,
including canonical Calendar–Dashboard synchronization and Dashboard-card
opening of the existing event editor, are accepted on the shared BevyUI/WebGPU
route. The Finder approval covers the `place` scope and its native in-canvas
map; Package 10's sortable header is validated through that same approval.

Infos and Finder left the slot model together, so the next two panels started.
Families 12, 17, 29, and 30 are unfrozen: the
cross-dependency that prevented Size, Font, and Layer from reaching `validated`
no longer exists. **Both HTML retirements are executed**: Infos when that panel
landed, and Finder on 2026-08-07 — 1 818 lines removed (the seven-module legacy
cluster plus one unrelated orphan found by the same audit) along with the two
Leaflet `index.html` tags and three assets, 298 KB off every boot. The details,
including the `finder_state.js` dependency trap the ledger contained, are in
`finder_html_line_migration_registry.md`. Package 11 has no outstanding task.

**11 panels remain**, which is where the bulk of the programme still is:
`size`, `font`, `layer`, `background`, `couleur`, `detail`, `communicate`,
`delete`, `undo`, `paste`, and `timeline` — every one of them a registered
surface in `eVe/intuition/panel_definitions.js` with its own `ui.*.panel` tool
id and its own live DOM route. A small dialog is still a panel; the registry,
not the visual size, decides.

**Amended 2026-08-07, later the same day.** Communicate left that list: its
Bevy panel is implemented and its HTML route retired (Package 13). It is
`acceptance_pending`, not `validated`, so the counter stays at **5/16 validated
panels** and **10 panels remain** with a live DOM route: `size`, `font`,
`layer`, `background`, `couleur`, `detail`, `delete`, `undo`, `paste`, and
`timeline`.

**Amended 2026-08-08.** Size and Font are implemented on their routed Bevy
surfaces and both legacy routes are retired. They are `acceptance_pending`, so
the validated counter remains **5/16**. **Eight panels still require product
implementation** — `layer`, `background`, `couleur`, `detail`, `delete`,
`undo`, `paste`, and `timeline` — and those eight retain active legacy panel
routes. Slot A is released.

Current slot occupancy:

| Slot | Panel | State | Owns | Consumes | Cross-dependency |
| --- | --- | --- | --- | --- | --- |
| — | Size, then Font (Package 8) | `acceptance_pending` 2026-08-08 | `size`/`font` Bevy composition; legacy routes retired | Families 1, 3, 4, 5, 17; Package 1 scope chips | none |
| B | Layer (Package 9) | `active` | `layer` panel composition and its legacy route | Families 1, 3, 4, 12, 17, 30 | none — Families 12, 17, 30 unfrozen on 2026-08-07 |
| — | Communicate (Package 13) | `acceptance_pending` 2026-08-07 | `communicate` composition, its legacy cluster, the `bevyPanel.comm` token group | Families 1, 3, 4, 6, 11, 19, 20 | none |
| — | Infos (Package 7) | `validated` 2026-08-07 | — | — | — |
| — | Finder (Package 11) | `validated` 2026-08-07 | — | — | — |

**Communicate ran outside the two slots**, on an explicit product request, while
A and B were both occupied. The deviation and the fact that non-collision still
held are recorded in Package 13 rather than left implicit. It is
`acceptance_pending`, so it holds no slot now.

Slot A held Size and Font in sequence, not in parallel: they share the legacy
`selection_style_apply.js` and `style_panels_visual.js` helpers, so the legacy
non-collision rule forbids splitting them across slots. Slot B holds Layer,
whose legacy module set (`layer.js`, `layer_panel_styles.js`,
`core/svg_layer_store.js`) is disjoint from both. Both packages were written
before Infos was approved and add **no new component family**, so they consumed
the existing baseline without a shared-component gate. Package 8 released slot
A on 2026-08-08 when both panels reached `acceptance_pending`.

Scope-freeze reminder, binding since `finder_place_map_package.md`: before
either package starts composing, its complete surface — every mode, every view,
including anything that looks hard to port — is frozen in writing. Nothing is
dropped mid-migration.

**Timeline is the final panel migration.** Its existing Bevy route is not
completion evidence and does not authorize early Timeline product work. The
remaining panel order after Calendar and before Timeline is recorded per freed
slot rather than per single implementation: when a slot frees, its next panel
is discussed and written into the slot table before implementation starts.
Finder no longer carries a separate provider, privacy, or cost gate — it was
approved with its native in-canvas map on 2026-08-07 — and no parallel
HTML/Leaflet route may survive its retirement.

## Skinnability audit — 2026-07-31

Scope: every migrated panel component (9 validated shared components, Families
1–5, superseded Batch A) plus the render chain from builder to GPU record.
Verdict: token centralisation is sound — no GPU colour literal exists in any
builder, all 16 builders consume `BEVY_PANEL_TOKENS`, and Panel Lab holds no
local styling. One real rendering defect was found and fixed (per-corner radii
never reached the GPU); the remaining items are scope clarifications.

### Fixed — `radius_corners` was dropped by the active web route

`bevy_ui_overlay_record_projection.js` projected only the scalar `style.radius`
into `corner_radius` and derived `shape` from it; `style.radius_corners` was
never read. On the active WebGPU overlay route the accordion header/body, the
table header and outer rows, the last Select option and the outer
segmented-control segments therefore painted **fully square**, contradicting
their approved "3 px outer corners" contracts.

Proven, not inferred: `temp/f1_radius_corners_probe.mjs` asserts against the
projected records, and was red — the builder tree carried `[3,3,0,0]` while the
record carried `shape: "rect"`, `corner_radius: 0`. The existing accordion and
table contracts assert `radius_corners` on the **builder tree only**, which is
why they stayed green. Any new geometry contract must assert the projected
record, not the tree.

Per-corner radii now travel the whole route in
`[top_left, top_right, bottom_right, bottom_left]` order:

- `bevy_ui_overlay_record_projection.js` emits `corner_radii` and widens `shape`
  to `rounded_rect` when any corner is non-zero; the scalar stays untouched;
- `bevy_projection_adapter.js` normalises it through `readCornerRadii`, which
  returns `null` for an all-zero tuple so the uniform scalar path is unchanged;
- `AtomeRenderNode.corner_radii: Option<[f32; 4]>` carries it into the renderer;
- `texture.rs` selects the radius per quadrant, so the CPU mask rasterises each
  corner independently, and the mask cache keys on all four;
- `spawn.rs` selects the mask on the resolved radii instead of the scalar — the
  actual regression, since a partially rounded node has `corner_radius == 0.0`;
- `AtomeCornerRadius` and the shadow texture/cache now carry four radii, so a
  shadow follows a partially rounded silhouette instead of squaring it.

Evidence: `cargo test --lib` passes 71/71, including two new contracts — one
asserting a `[8,8,0,0]` mask carves only the top corners while the bottom ones
stay opaque, one asserting a node with only `corner_radii` still receives a
mask. `temp/f1_end_to_end_probe.mjs` is green from builder to Bevy payload for
the accordion, the table and both outer segments, and asserts that a uniform
radius still resolves to `corner_radii: null`. The 19-specimen projection
baseline moves on exactly three specimens — `accordion_open`, `segmented`,
`table` — and nowhere else.

**Known limitation, deliberately not extended:** `backdrop_surface` still takes
the uniform scalar. Its `size_radius: Vec4` uniform is fully occupied
(`width, height, radius, blur`), so per-corner backdrop blur needs a shader
uniform-layout change. No panel node currently combines `backdrop` with
`radius_corners` — the panel shell and footer use a uniform radius — so this is
recorded rather than emulated.

#### Regressed, and fixed again — 2026-08-07

**This fix had stopped working, and the probes cited as its evidence no longer
existed.** The projection emitted `properties.corner_radii` correctly, but the
Virtual Scene normalizer between the record and the adapter never copied it:
`normalizeAtomeRenderNode` forwarded only `properties.material`, so
`readCornerRadii` — which looks at `material.cornerRadii`, `material.corner_radii`
then `node.corner_radii` — always found `null`. Every partially rounded surface
was painting square again, including the accordion header and the table header
row the Communication panel depends on.

Found while preparing Package 13, reproduced **red first** with
`temp/comm_p0_corner_radii_probe.mjs`, then repaired at the missing link rather
than by widening the reader:

- `render_atom.js` reads `properties.corner_radii` / `properties.cornerRadii`
  alongside the scalar and normalizes an all-zero tuple to `null`, symmetrically
  with `cornerRadius`;
- `virtual_scene_contract.js` forwards it into `material.cornerRadii`, and only
  when present, so an explicit `properties.material` still wins and the scalar
  fallback is untouched.

`temp/comm_p0b_corner_radii_e2e.mjs` verifies the whole route into
`mapVirtualSceneNodeToBevyPayload` on four cases: a top-rounded header, a
scalar-only node, an all-zero tuple, and explicit-`material` precedence.

**The ordering lesson this produced is binding.** A geometry contract must
assert the *projected record after normalization*, not the builder tree and not
the projector's output in isolation — the earlier probes stopped one stage too
early, which is why a regression in the stage between them went unnoticed. Any
probe kept as evidence must also stay in `temp/`; a deleted probe is not
evidence.

### Superseded correction — Calendar composition

The earlier status below is no longer current: Calendar was formerly a
`simpleTextSurface` placeholder. It now lazy-registers
`bevy_panel_calendar_runtime.js`, composes the shared builders/tokens through the
project canvas, and has no active HTML/vendor route. Native interaction and
product-owner approval remain its open acceptance gates.

### Applied in this pass — render-constant unless stated

Token promotions, each proven render-constant by comparing projected records for
19 specimens before and after (`temp/panel_render_baseline.mjs`):

- panel metrics: `controlGroupGapPx`, `defaultWidthPx`, `defaultHeightPx`,
  `toolboxReservedFallbackPx`;
- `input.placeholderOpacity`, `input.caretWidthPx`;
- `select.selectedMarkShortStrokeLengthPx`, `selectedMarkShortOffset`,
  `selectedMarkLongOffset`, `selectedMarkStrokeRotationDeg`;
- `accordion.chevronUpperOffset`, `chevronLowerOffset`,
  `chevronStrokeRotationDeg`;
- `segmentedControl.dividerInsetPx`;
- `actionButton.defaultWidthPx`, `actionButton.labelHeightPx`;
- footer layers now derive from `PANEL_FOOTER_LAYER` instead of the repeated
  literals `1252`/`1254`.

**Two deliberate visual changes**, both needing a product-owner confirmation on
the real canvas:

1. `buttonNode`'s default height was `28` while the approved token
   `actionButton.heightPx` is `32`. The default now reads the token. Panel Lab
   and the numeric field pass their size explicitly and are unchanged; no
   in-scope product panel uses the default height.
2. The per-corner radii fix above restores the approved rounded corners on the
   accordion, the table and the outer segments. These surfaces were approved
   while rendering square, so their appearance changes to match the contract
   that was originally approved on paper.

### Remaining, not addressed

- **Batch A (Families 9, 17)** is `superseded` yet `mediaCardNode` and
  `selectionSummaryNode` are still mounted as visible Panel Lab specimens and
  their skin groups are still exported. They are **not** dead code, so removing
  them would change the cumulative Lab composition and its node-count contracts.
  Treat their removal as part of Panel Lab retirement, not as cleanup.
- **Family 3** has no `selectableList` token group; it borrows `select` tokens
  wholesale, so a selectable list cannot be restyled independently of Select.
- `border` / `border_color` pass normalisation but are never projected on the
  web route, and `baseline` is pinned to `'middle'` in the projection.

## Panel Lab retirement

Status: `planned`

Transfer reusable tests to permanent component/panel tests. Delete the Panel
Lab surface, tool, registration, configuration gate, fixtures, captures,
styles, and map references. Confirm that active source, tests, and maps contain
no `panel_lab`, `Panel Lab`, or `ui.dev.panel_lab` reference. Then move this
guide to `done/`.
