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
privacy, cost, and cross-platform contract are approved.

## Status vocabulary

Use exactly one status per stage: `planned`, `in_review`, `validated`, or
`superseded`.

## Mandatory one-component approval loop

Every component follows this closed loop. No step may be skipped, combined with
another component type, or inferred from a previous approval:

1. Before implementation, recommend the next component type and explain why it
   is the most judicious next dependency for shared controls and product-panel
   coverage.
2. Inspect the already approved component, panel, home, menu, and system-control
   tokens. Present the proposed visual integration to the product owner,
   including which styles must be shared, which existing style is reused, the
   intended panel placements, exact geometry, typography, colors, states, and
   component behavior. Ask explicitly whether the component must inherit the
   preceding approved style and the existing panel/system styles.
3. If any visual or behavioral detail is unspecified, update this guide and
   obtain explicit product-owner approval of the complete specimen contract
   before changing implementation code.
4. Mount exactly one visible specimen of exactly one component type in Panel
   Lab. Do not mount duplicates, alternative types, a product composition,
   diagnostic content, or an unrelated control. Multiple variants or states
   cannot be shown together unless the product owner first approves them as the
   single component type's explicit test contract.
5. Run focused automated contracts, then open the actual browser test
   environment and inspect the real shared canvas visually. Exercise every
   declared interaction using real input. An input must accept focus, typed
   text, editing and deletion and must visibly report the resulting value; a
   momentary, latched, radio, checkbox, or toggle control must prove each
   declared state transition; a slider tool must prove open, drag/touch update,
   clamping, and close behavior. Verify the Panel Lab short-open,
   short-close, long-press reload, and post-reload reopen contracts as part of
   every specimen check.
6. Present only that specimen to the product owner, state exactly what was
   tested and what the product owner should inspect, and wait for explicit
   visual and behavioral approval. Automated tests and the agent's visual
   inspection never replace this approval.
7. If rejected, correct the same specimen, rerun every applicable check, and
   resubmit it. If approved, record its canonical builders, tokens, intents,
   test evidence, and reuse decision before recommending the next component.

The next component cannot be specified, implemented, or displayed before the
preceding component has completed this loop. The order below is the current
architectural recommendation; before every new component the agent must confirm
that it remains the most useful order and explain the dependency/reuse reason.

Component-level validation uses the fastest real browser path available in the
Codex integrated browser test environment. It proves that the specimen is
visible on the actual shared canvas and that its declared interactions work.
Mobile, Tauri, iOS, and multi-viewport validation are explicitly excluded from
each individual component loop and must not delay progression between
components. The product owner performs any additional platform review they
choose after the browser evidence is presented.

## Stage 1 — Empty panel foundation

Status: `in_review`

Scope: `PanelRoot` only, rendered by the temporary development-only Panel Lab
surface on the shared project canvas.

Style sources audited:

- `eVe/elements/skin/tokens.js` (`EVE_COMMON_SKIN_TOKENS.bevy.systemSurface`)
- `eVe/elements/skin/panel_skin.js`
- `eVe/elements/system_ui_tokens.js`
- `eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js`

Accepted contract:

- Bevy panel tokens are derived from `EVE_PANEL_SKIN_TOKENS.bevyPanel`.
- The panel shell, its footer, ribbon tools, Flower and contextual Atome edit
  chrome consume the one immutable system material: paint, backdrop and drop
  shadow. Footer controls remain transparent layout children so the panel emits
  one backdrop and one shadow only.
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

Status: `in_review`

The footer reuses the existing Bevy contextual Atome-edit visual contract from
`atome_contextual_edit_model.js` and `BEVY_MENU_TOKENS`: left resize handle,
close, drag/title region, then right resize handle. There is no passive header.

Validate close, drag, each resize handle, and scroll separately. Geometry
remains ephemeral runtime state in the Bevy panel owner and must not be stored
in the DOM or persisted without an identified canonical owner.

The footer visual contract is approved. This stage remains `in_review` until
drag, both resize handles, and scroll have each completed their separate
interaction check.

## Stage 3 — Shared components

Status: `in_review`

Validate exactly one component type at a time in Panel Lab in this order: text,
separator, tool button, input, list/row, slider tool, accordion, select,
checkbox/radio/toggle, and table/property grid. A separator is an optional
product-composition component. Every component must use the shared panel skin
and emit intents only.

### First specimen contract — static body text

The first and only Lab specimen is one static body-text node. Its contract is
fully fixed before implementation:

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
  diagnostic counter, duplicate text, separator, or second component;
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

The separator may now be specified, but must complete its own full approval
loop before implementation.

The Lab body remains empty until the shared PanelRoot and FooterControls have
been reviewed. After that review, each Lab entry contains one specimen of one
component type only: no Timeline content, domain data, diagnostic status,
duplicate controls, or product mutation is allowed. The specimen must expose
only the behavior belonging to its component type: text is static; an input
accepts and reports text; each toggle/radio/momentary-tool behavior is tested
as its own state; and a slider tool expands, tracks drag/touch movement, and
collapses using the canonical tool-slider interaction contract.

The development-only Panel Lab main-ribbon tool has a fixed test contract: a
short activation opens it, the next short activation closes it, and a 520 ms
long press reloads the browser view without also toggling the Lab. Before
presenting any Lab or component change, visibly verify all three actions on the
real shared canvas, then confirm that the Lab still opens and closes after the
reload.

After each component, apply the full mandatory approval loop above. The
approved tool-button tokens are the shared reference for panels, home, menus,
and system controls; panel-local button colors or tool appearances are
forbidden. Tool buttons and slider tools must compose the existing canonical
Bevy menu/tool visual contract rather than redefining a local control.

No new component, panel module, or Panel Lab composition may be presented as
implemented until it has been opened in the browser test environment and its
visible records have been verified on the real shared canvas. Tree/unit tests
are necessary but never substitute for this rendering check.

Only after every required primitive is individually approved may a routed
BevyUI surface be reviewed in Panel Lab as a composition: Timeline, Calendar,
then Contact. A composition review must call the same component builders,
tokens, and intent handlers as its product surface; copied Lab-only styling or
behavior is forbidden.

## Stage 4 — Product panels

Status: `planned`

Maintain a coverage ledger for every active panel with its registry key,
required component types, individually validated component types, missing
types, Bevy composition status, product-owner approval, and HTML-retirement
status. A panel may enter composition only when its required-component column
has no gap.

When the individually approved components are sufficient to cover the
highest-priority product panel, recommend that panel as the next composition
and explain the choice. Build it only from the same canonical builders, tokens,
and intent handlers validated in Panel Lab. For a User panel request, first
confirm its active registry mapping (`home` currently owns `tools/user.js`) and
its complete required-component inventory; do not assume a second unregistered
surface.

Open the completed composition in the actual browser, verify its visual
hierarchy and every real interaction, run its focused contracts, and submit it
for explicit product-owner approval. If it is rejected, repair and revalidate
the same panel. Only after functional parity and explicit approval may the
visible HTML route, builders, styles, listeners, and obsolete tests be deleted.
Then prove that only the Bevy route remains and that no visible DOM or double
rendering survives. A partial Bevy panel and an HTML panel must never be active
in parallel.

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
