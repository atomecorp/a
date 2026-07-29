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

The active panel registry defines 16 product surfaces: home, contact, info,
finder, communicate, delete, undo, paste, timeline, calendar, background,
couleur, size, font, detail, and layer. This registry is the migration scope.
Timeline, Calendar, and Contact currently route through BevyUI; the other 13
surfaces still use the legacy HTML dialog path. The Finder map is a Finder
feature, not an extra panel surface, and remains blocked until its provider,
privacy, cost, and cross-platform contract are approved. The active shared
component backlog intentionally excludes Timeline and Molecule / MTraX
capabilities: their components are reviewed only with the complete Timeline or
Molecule migration, never inferred as generic Panel work.

## Status vocabulary

Use exactly one status per stage: `planned`, `in_review`, `validated`, or
`superseded`.

## Mandatory component approval loop and passive-batch exception

Every new component follows this closed loop. Interactive, editable, stateful,
effectful, virtualized, gesture-driven, or layout-algorithm components may not
be combined with another new type or inferred from a previous approval.

A bounded passive batch is allowed when every included component has no
handler, intent, writable Lab state, durable mutation, MCP route, asynchronous
loading owner, virtualization, gesture, or layout algorithm. A batch may contain
up to ten independent passive component types, but every type still requires
its own canonical contract, native-widget decision, builder, focused test, map
entry, and visible Lab specimen. The batch receives one shared real-canvas
review and one explicit product-owner approval; rejection returns only the
rejected component to its own correction loop.

1. Before implementation, recommend the next component type and explain why it
   is the most judicious next dependency for shared controls and product-panel
   coverage. Trace it to a concrete visible legacy Panel occurrence and its
   measured geometry first. A similarly named eVe tool, Timeline, Molecule, or
   MTraX surface is not panel evidence and must be deferred to its owning
   product migration.
2. Inspect the native BevyUI widget vocabulary and the canonical Atome/Squirrel
   system-control contract before inspecting approved component, panel, home,
   menu, and system-control tokens. Before selecting an implementation, record
   a BevyUI integration decision for the component: the available widget kinds,
   the actual native/WASM runtime availability, the canonical Atome/Squirrel
   control contract, the chosen route, and the rejected alternatives. Direct
   use of an existing BevyUI widget is preferred whenever it covers the
   required behavior and presentation. A panel-local builder may configure or
   compose that widget, but may not reimplement its rendering, interaction
   semantics, geometry rules, state ownership, or styling contract. A custom
   composition is allowed only when the record proves that the library lacks a
   suitable primitive or extension point; it must compose existing primitives,
   preserve the shared WebGPU route, and introduce no parallel widget contract.
   A reusable missing system control must be completed in the canonical
   Atome/Squirrel component system first, then consumed through BevyUI; an
   eVe-local graphical substitute is forbidden. Present the proposed visual
   integration to the product owner,
   including which styles must be shared, which existing style is reused, the
   intended panel placements, exact geometry, typography, colors, states, and
   component behavior. Ask explicitly whether the component must inherit the
   preceding approved style and the existing panel/system styles.
3. If any visual or behavioral detail is unspecified, update this guide and
   obtain explicit product-owner approval of the complete specimen contract
   before changing implementation code.
4. Before implementation and before presenting the result, report the current
   counters: checked and remaining global execution-order tasks, approved and
   remaining shared components (out of 10), approved and remaining product
   panels (out of 16), and legacy HTML panel routes still pending retirement
   (out of 13). The counts must be derived from this ledger and
   `todo/execution_order.md`; they must never be copied forward without
   checking their current evidence.
5. Mount one specimen of every newly introduced component type in Panel Lab and
   retain every previously approved specimen in chronological body flow. Do not
   remove, replace, duplicate, or restyle an approved specimen merely because
   a new component is being reviewed. Do not mount alternative variants,
   unapproved component types, product composition, diagnostic content, or
   unrelated controls. Multiple variants or states cannot be shown together
   unless the product owner first approves them as that component's explicit
   test contract.
6. Run focused automated contracts, then open the actual browser test
   environment and inspect the real shared canvas visually. Exercise every
   declared interaction using real input. An input must accept focus, typed
   text, editing and deletion and must visibly report the resulting value; a
   momentary, latched, radio, checkbox, or toggle control must prove each
   declared state transition; a slider tool must prove open, drag/touch update,
   clamping, and close behavior. Verify the Panel Lab short-open,
   short-close, long-press reload, and post-reload reopen contracts as part of
   every specimen check.
7. Present the newly introduced specimen, or the declared passive batch, to the
   product owner in the cumulative Lab, state exactly what was tested and what
   the product owner should inspect, and wait for explicit visual and
   behavioral approval. Automated tests and the agent's visual inspection never
   replace this approval.
8. If rejected, correct the same specimen, rerun every applicable check, and
   resubmit it. If approved, record its canonical builders, tokens, intents,
   test evidence, and reuse decision before recommending the next component.

The next interactive or stateful component cannot be specified, implemented, or
displayed before the preceding component has completed this loop. A declared
passive batch is the sole exception and must satisfy the eligibility gate above.
The order below is the current architectural recommendation; before every new
component or batch the agent must confirm that it remains the most useful order
and explain the dependency/reuse reason.

Component-level validation uses the fastest real browser path available in the
Codex integrated browser test environment. It proves that the specimen is
visible on the actual shared canvas and that its declared interactions work.
Mobile, Tauri, iOS, and multi-viewport validation are explicitly excluded from
each individual component loop and must not delay progression between
components. The product owner performs any additional platform review they
choose after the browser evidence is presented.

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

Validate one component type at a time, except for an eligible passive batch, in
Panel Lab in this order: text,
separator, icon action button, input, list/row, slider tool when a product panel
actually needs one, accordion, select,
checkbox/radio/toggle, and table/property grid. A separator is an optional
product-composition component. Every component must choose the strongest
available BevyUI widget route as its rendering primitive, use the shared panel
skin, and emit intents only. Direct native/WASM widget use is preferred when it
is available; an unavailable native route must be recorded with evidence rather
than silently emulated. Panel Lab and product surfaces must configure or compose
the canonical BevyUI/Atome/Squirrel component; they must never recreate a
widget with local drawing, interaction, state, or styling code. Each approval
record must include the component's BevyUI integration decision and state
whether the native/WASM widget route was available, used, or unavailable with
evidence.

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
Lab retirement. There is no Timeline content, domain data, diagnostic status,
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
`validated` and the next component may be proposed through the mandatory
one-component approval loop.

### Deferred slider-tool investigation — not a Panel Lab specimen

Status: `deferred`

- Product-owner decision: the proposed compact vertical tool-slider does not
  belong in Panel Lab. It is an existing tool-context pattern, not evidence of
  a panel component need. The Panel Lab specimen, its reserved height, intent
  adapter, locale keys, and Panel Lab-specific test were removed.
- Retained investigation: `bevy_ui_tool_slider.js` and the contextual-slider
  route remain available for a future dedicated tool-slider review. They are
  not design-approved and must not be reused for a panel slider by implication.
- Existing panel evidence: `timeline_seek_slider` is the only slider-shaped
  node in a current Bevy panel. It is a horizontal Timeline progress/seek
  surface, not the compact tool-slider pattern; a future Timeline interaction
  task must define and validate it separately if it becomes editable.

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

Status: `validated`; focused contracts are complete and the product owner
explicitly approved the specimen on the real canvas on 2026-07-27. This position
was reviewed after the table because
the product owner deferred it, then asked for it explicitly; the table specimen
below therefore keeps its own record and stays after this one in body flow so
the declared component order is readable in the Lab.

- Scope: the four choice controls in Panel Lab only. The legacy DOM
  `createEveCheckbox` / `createEveRadio` consumers in the user/profile runtimes
  (`user_visual_preferences_runtime.js`, `user_identity_fields_runtime.js`,
  `user_accessibility_preferences_runtime.js`, `user_custom_field_list.js`)
  migrate with the Home panel and are out of scope here. Keyboard activation is
  outside this specimen.
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
- Geometry: every control is a `358 × 32 px` row with `3 px` radius. One shared
  `36 px` indicator column keeps the labels of all three shapes aligned, with a
  `10 px` gap before the label. The checkbox box is `18 × 18 px` at the panel
  radius, the radio is an `18 px` circle with a `6 px` dot, and the switch is a
  `36 × 18 px` pill whose `14 px` knob travels between a `2 px` inset on each
  side.
- Paint and the complete state matrix: idle row transparent; hover and pressed
  add a tokenized row tint; focus reuses the existing input focus ring; the
  indicator carries idle / hover / pressed / selected treatments, so **pressed
  and selected stay visually distinct**; disabled drops to `0.55` opacity and
  mounts no handler at all. The selected tint is the approved Select selection
  colour — a green accent stays opt-in for a feature whose semantics call for
  it, never the default on state.
- Test contract to approve together, matching the icon-button precedent: one
  checkbox, one two-option radio group, one switch, and one disabled checkbox,
  in a single transparent group with `4 px` gaps.
- Lab state: `bevy_panel_lab_choice_runtime.js` owns only ephemeral checked,
  selected-value, hover, focus, and pressed state, emits closed
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
  2026-07-27, which closes this component.

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

After each component or approved passive batch, apply the full mandatory
approval loop above and retain
the approved component in Panel Lab. The approved icon-button skin and builder
are the shared reference for panel action buttons; panel-local button colors or
appearances are forbidden. Ribbon tools and slider tools remain separate
components and continue to compose their existing canonical menu/tool visual
contract rather than redefining a local control.

No new component, panel module, or Panel Lab composition may be presented as
implemented until it has been opened in the browser test environment and its
visible records have been verified on the real shared canvas. Tree/unit tests
are necessary but never substitute for this rendering check.

Only after every required primitive is individually approved may a routed,
non-deferred BevyUI surface be reviewed in Panel Lab as a composition:
Calendar, then Contact. Timeline is deferred to its complete product migration.
A composition review must call the same component builders,
tokens, and intent handlers as its product surface; copied Lab-only styling or
behavior is forbidden.

## Stage 4 — Product panels

Status: `planned`

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
Calendar and Contact panel migration**: 4, 5, 6, 13, 18, and 21 to 28.
Families 1 through 3 are already implemented or under their final approval
loop. Families 4 and 5 are validated, so **11 active families
remain to implement**; this is not an approval count. Timeline and every
Molecule / MTraX-owned capability, including Families 31 to 35, are temporarily
excluded until their complete product migration. Families 9 and 17 are also
excluded: source review found a Contact editor photo and tool selection counts,
not the proposed generic Panel cards or measured Panel geometries. This remains
a coverage ledger: the component approval loop remains mandatory, with only the
explicitly declared passive-batch exception above. A family may reuse an already
validated generic component only when its panel-specific behavior is covered by
the existing contract; otherwise it still requires its own canonical extension
and approval.

Already validated generic components (not included in the 36): text,
separator, icon action button, single-line input, passive list row, accordion,
select, checkbox/radio/toggle, and table/property grid. The shared PanelRoot,
footer, scroll, clipping, drag, resize, and pointer-capture contracts are also
existing infrastructure, not product component families.

#### Capability-family execution order

1. **Validated —** labeled action button, including enabled, disabled,
   destructive, and busy presentation without a panel-local command path.
2. **Visually approved; record-backed validation pending —** segmented control
   / tab strip with canonical selected-value ownership.
3. Interactive selectable list row, distinct from the validated passive row.
4. Localized empty, loading, error, and permission-denied state composition.
5. Numeric field with validation, stepper semantics, and unit formatting.
6. Multiline text editor using the canonical hidden text service.
13. Filter chip / scope control with explicit selected and unavailable states.
18. Contact card with avatar/media, identity summary, and canonical action
    intents.
21. Calendar range header with previous/next/today navigation and locale/timezone
    label projection.
22. Calendar month date grid and date-cell state matrix.
23. Calendar week/day time grid with locale-first week rules and daylight-saving
    discontinuities.
24. Calendar agenda list with virtualized date ranges.
25. Calendar event rectangle with selection, all-day, todo, recurrence, and
    overflow presentation.
26. Calendar all-day lane and event-overlap layout.
27. Calendar event hit testing, drag/reschedule, resize, and touch/pointer
    gesture routing.
28. Calendar event/todo editor, including date/time, recurrence, alarm,
    completion, sharing, Webcal/ICS, and timezone-safe validation.
#### Deferred pending Timeline / Molecule migration and wider panel scope

These families remain part of the full 16-surface migration but are outside the
active Calendar/Contact component backlog. They may start only after Phase 4 —
Molecule / MTraX — is validated, or when a future source audit identifies a
measured, non-Timeline, non-Molecule Panel occurrence:

9. Media thumbnail/card. The current passive prototype is not evidence of a
   required Panel component; the existing Contact photo is an editable 90 px
   editor field and belongs to the Contact composition decision.
17. Selection/context summary. Existing occurrences are eVe tool count labels
   and Timeline input scope, not a Panel card.
29. Detail preview surface for the selected Atome, layer, clip, or recording
    take, using the shared renderer rather than DOM projections.
30. Detail-specific editor compositions: karaoke/lyrics lines, recording
    schedule controls, take selection, and SVG-layer context actions.
31. Timeline integration group: transport control group, including play/stop/
    record state and canonical command intents.
32. Timeline ruler with temporal scale, ticks, labels, and viewport conversion.
33. Timeline track lane with clipping, vertical scroll, and deterministic row
    geometry.
34. Timeline clip/region with selection, trim/move hit zones, and canonical
    gesture intents.
35. Timeline playhead, seek interaction, and horizontal zoom/scroll viewport.

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
  the shared Panel skin. Timeline continues to use its neutral default without
  changing its tool intents.
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

Status: `in_review`

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
- Current evidence: 36 focused/cumulative contract tests, the Vitest manifest
  guard, `check:syntax`, `check:m0`, and `check:execution-order` pass. In the
  integrated browser, the shared canvas rendered the three French labels, moved
  the sole selected tint through `Liste`, `Tableau`, and `Naturel`, and reset to
  `Liste` after close/reopen with an empty warning/error console. The active
  runtime exposes no canonical overlay record to the browser diagnostic path,
  so those coordinate clicks remain diagnostic evidence only. The product owner
  explicitly approved the visual and behavioral specimen on 2026-07-28.
  Record-backed pointer validation remains required before this family may
  become `validated`.

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
in an active legacy Panel: the Contact photo is editable and `90 × 90 px`,
while selection counts are Tool and Timeline-context information. The proposed
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

Calendar and Contact are the essential current migration surfaces. Timeline is
deferred as one complete Timeline / Molecule migration; every other matrix row
is deferred after Phase 4 — Molecule / MTraX. Each non-deferred surface may be
composed only after its listed families have a recorded coverage decision
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
| Timeline | Deferred: complete Timeline / Molecule migration owns Families 31–35 and any Timeline-only supporting component |
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
it must never introduce a panel-local handler, UI-only action, legacy helper,
or second command path. If no canonical command exists, creating the panel is
blocked until that command and its MCP contract are defined through the command
bus, capability validation, policy checks, trace fields, and audit path.

The ledger must be reviewed before the panel enters composition and again at
complete-panel acceptance. It must record, at minimum: panel registry key,
function/intent, canonical tool or domain command id, MCP method and parameter
contract, supported actions, capability/policy requirement, audit surface, and
validation evidence. Every declared function must have one explicit status:
`mapped`, `blocked`, or `not_applicable` with its evidence. A panel cannot be
approved, retire its HTML route, or count toward program finalization while any
effectful function is missing a `mapped` MCP command.

Maintain a coverage ledger for every active panel with its registry key,
required component types, individually validated component types, missing
types, Bevy composition status, product-owner approval, and HTML-retirement
status, plus the mandatory MCP command ledger status. A panel may enter
composition only when its required-component column has no gap and the MCP
command ledger contains no unreviewed effectful function.

When the individually approved components are sufficient to cover the
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

Program finalization lock: only once all 16 product panels have functional
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

Priority order after the existing BevyUI-surface validation is: Paste, Font,
Size, Undo, Delete, Info, Layer, Couleur, Background, Home, Contact,
Communicate, Detail, Calendar, then Finder. Finder includes the blocked map
work and cannot retain a parallel HTML/Leaflet path after its migration. This
is the current recommended order based on component reuse and migration risk.
Before each panel, the agent must re-evaluate the remaining coverage ledger,
advise the product owner of the most judicious next panel and its rationale,
and update this documented order before implementation if the recommendation
changes.

## Panel Lab retirement

Status: `planned`

Transfer reusable tests to permanent component/panel tests. Delete the Panel
Lab surface, tool, registration, configuration gate, fixtures, captures,
styles, and map references. Confirm that active source, tests, and maps contain
no `panel_lab`, `Panel Lab`, or `ui.dev.panel_lab` reference. Then move this
guide to `done/`.
