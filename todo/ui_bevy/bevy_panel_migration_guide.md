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
layer. Home, Calendar, Contact, and Timeline currently route through BevyUI; that
route is not evidence that their product-panel migration is complete. The
Timeline product panel is intentionally the final migration in this programme.
The Finder map is a Finder feature, not an
extra panel surface, and remains blocked until its provider, privacy, cost, and
cross-platform contract are approved. Molecule / MTraX capabilities are also
reviewed only with their owning product migration, never inferred as generic
Panel work.

## Status vocabulary

Use exactly one status per stage: `planned`, `in_review`, `validated`, or
`superseded`.

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
approval before beginning the next. Mobile, Tauri, iOS, and multi-viewport
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

Already validated generic components (not included in the 36): text,
separator, icon action button, single-line input, passive list row, accordion,
select, checkbox/radio/toggle, and table/property grid. The shared PanelRoot,
footer, scroll, clipping, drag, resize, and pointer-capture contracts are also
existing infrastructure, not product component families.

#### Active migration packages — authoritative task grouping

The following six packages replace Family-by-Family delivery as the active
task order. Family records below remain the evidence ledger for their canonical
owner, focused tests, and real-canvas behavior; they are not separate
product-owner approval gates.

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

Status: `in_review`; implementation, focused contracts, and the available
real-canvas empty/error interaction pass. Record-backed canvas review and
explicit product-owner acceptance remain required.

- Authoritative order decision: the product owner selected Infos as the next
  panel on 2026-08-04. Timeline remains final.
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
  current account returns a remote-provisioning error, so record-backed preview
  and property-edit interaction remain the smallest technical acceptance gap.

Infos coverage ledger:

| Family | Decision/evidence |
| --- | --- |
| 1 | `validated` shared panel shell/footer/scroll/drag/resize route. |
| 3 | `validated` hidden single-line input; Infos uses one lifecycle-owned editor session. |
| 4 | `validated` list-row/selectable-list paint and pointer contract. |
| 12 | `implemented` hierarchical depth, vector chevron, expand/collapse, and canonical row selection in the shared selectable-list owner. |
| 17 | `implemented` selection summary reused with fluid panel-owner width. |
| 29 | `implemented` selected-Atome detail preview through the existing unified WebGPU compositor. |
| 30 | `implemented` detail composition: immutable table, typed existing-property text/number/switch editors, passive complex values. |

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
#### Deferred pending Molecule migration and wider panel scope

These families remain part of the 16-panel programme but are outside the active
Calendar/Contact component backlog. They may start only after Phase 4 —
Molecule / MTraX — is validated, or when a future source audit identifies a
measured, non-Molecule Panel occurrence:

9. Media thumbnail/card. The current passive prototype is not evidence of a
   required Panel component; Contact only projects an existing avatar at
   `90 × 90 px` and exposes no photo editor or source field.
7. Color field and canonical RGBA value presentation.
8. Color-swatch grid with selected, hover, focus, and disabled states.
10. Asset grid with selection, virtualized range, and keyboard-independent
    pointer/touch interaction.
11. Import/drop target with explicit capability/error state and no browser-only
    file ownership.
12. Hierarchical tree row with depth, expand/collapse, selection, and disabled
    descendants.
14. Sortable result-column header with direction and accessible label state.
15. History event row with current-position and grouped-section presentation.
16. History cursor / scrubber, separate from the compact product tool slider.
19. Conversation/thread row and message bubble projection.
20. Message composer with multiline editing, attachments, send state, and
    delivery/error projection.
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

Calendar, Contact, Home, Infos, and Timeline are the explicitly ordered migration
surfaces. Every other matrix row remains deferred after Phase 4 — Molecule /
MTraX. Each non-deferred
surface may be composed only after its listed families have a recorded coverage decision
(`validated`, `blocked`, or `not_applicable`) and every effectful function has a
mapped MCP command.

| Surface | Required coverage beyond the validated generic baseline |
| --- | --- |
| Home | 1, 2, 3, 4, 5, 6, 8, 9, 17 |
| Contact | 1, 3, 4, 6, 18 |
| Info | 1, 3, 4, 12, 17, 29, 30 |
| Finder | 3, 4, 6, 13, 14, 17; map presentation remains blocked by its external provider/privacy/cost contract |
| Communicate | 1, 3, 4, 6, 9, 11, 19, 20 |
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
highest-priority product panel, recommend that panel as the next composition
and explain the choice. Build it only from the same canonical builders, tokens,
and intent handlers validated in Panel Lab. For a User panel request, first
confirm its active registry mapping (`home` currently owns `tools/user.js`) and
its complete required-component inventory; do not assume a second unregistered
surface.

Before each panel composition and its approval presentation, report the same
current global-task, component, product-panel, and legacy-HTML-route counters
required by the component loop, together with the panel MCP command-ledger
status. Open the completed composition in the actual browser, verify its visual
hierarchy and every real interaction, exercise every mapped function through
its canonical MCP command with its expected audit evidence, run its focused
contracts, and submit it
for explicit product-owner approval. If it is rejected, repair and revalidate
the same panel. Only after functional parity and explicit approval may the
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

### Authoritative next-panel decision — 2026-08-04

Contact was validated by the product owner on 2026-08-02, Home on 2026-08-03,
and Calendar on 2026-08-04; the programme therefore records **3/16 validated
panels**. Calendar Packages 4 to 6, including canonical Calendar–Dashboard
synchronization and Dashboard-card opening of the existing event editor, are
accepted on the shared BevyUI/WebGPU route.

The product owner selected **Infos** as the next implementation on 2026-08-04.
Package 7 is technically migrated and `in_review`: its focused contracts and
3,033-line retirement ledger pass. Real-canvas opening, empty/error projection,
accordion interaction, close, DOM audit, and console audit also pass; only the
record-backed canvas review and explicit product-owner acceptance remain the
gate for changing the validated panel count. The active inventory is therefore
3/16 validated, one additional panel in review, 5 Bevy routes, and 11
HTML-active routes.

**Timeline is the final panel migration.** Its existing Bevy route is not
completion evidence and does not authorize early Timeline product work. The
remaining panel order after Calendar and before Timeline must be discussed and
recorded before each implementation. Finder retains its separate provider,
privacy, cost, and cross-platform gate and cannot retain a parallel
HTML/Leaflet route after migration.

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
