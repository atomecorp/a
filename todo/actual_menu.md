# Menu Rebuild Audit

## 1. Scope and Goal

This document describes the current production menu system used by eVe Intuition.

The goal is not to describe an ideal future design. The goal is to describe what exists now, functionally and technically, with enough precision to rebuild it without losing behavior.

This audit covers the three menu surfaces requested for the rebuild:

1. The main bottom menu, implemented as the IntuitionX main ribbon.
2. The contextual flower menu, opened from the canvas and atome context.
3. The inline or embedded menu surfaces used by Molecule and MTraX, plus the Atome edit footer they reuse.

This audit also documents the shared tool model, routing rules, layering contract, and the legacy branches that still matter.

The active product owner path is `eVe/intuition/`. Historical menu code outside that path must not be treated as the current production owner.

## 2. Executive Summary

The current menu system is not one menu. It is a family of surfaces that share tool definitions and partially share invocation plumbing.

The current production split is:

- Main bottom menu: global product toolbox and palette shell.
- Flower menu: transient contextual radial menu for project, selection, and atome interactions.
- Atome edit footer: context-bound tool strip anchored to the current atome.
- Molecule and MTraX inline strips: embedded consumers of the footer tool-definition system, with a few domain-specific exceptions.

The key rebuild insight is that the system is already separated into four different concerns even when the UI looks related:

1. Tool content and canonical tool identities.
2. Surface-specific presentation and interaction mechanics.
3. Context resolution and payload shaping.
4. Tool invocation and state synchronization.

Any rebuild that treats the current system as one renderer will fail because the behavior lives in multiple runtimes.

## 3. Active Owners

| Concern | Primary owner | Responsibility |
| --- | --- | --- |
| Main ribbon shell | `eVe/intuition/ribbon/menu.js` | Bottom menu layout, reveal, overflow, palette expansion, quick capture, drag-to-delete preview, latched and external-open sync |
| Main ribbon bootstrap | `eVe/intuition/menu/index.js` and `eVe/intuition/eVeIntuition.js` | Creates the ribbon, binds auth gate, registers tool handlers, routes tool activation |
| Flower view | `eVe/intuition/flower/menu.js` | Generic radial menu UI, submenu stack, animations, hover state, draggable tool payloads |
| Flower contextual runtime | `eVe/intuition/flower/context.js` | Long press, contextmenu, hold-hover activation, blocked-target detection, drag-start cancel |
| Flower context resolution | `eVe/intuition/flower/context_target.js`, `eVe/intuition/flower/context_selection.js`, `eVe/intuition/eVeIntuition.js` | Determines target, selection mode, kind, and which items appear |
| Floating Atome footer | `eVe/intuition/footer/runtime.js` | Anchored close-variant ribbon used as the floating footer shell |
| Footer tool-definition and selection runtime | `eVe/intuition/eVeIntuition.js` | Kind defaults, selection-bound payloads, double-click open/close logic, MTraX redirect, public footer API |
| Embedded inline tool row | `eVe/intuition/footer/tool_row_runtime.js` | Generic inline row renderer with palette and slider support |
| Molecule panel contract | `eVe/intuition/tools/molecule/footer_tools_contract.js` | Canonical Molecule panel tool list and section order |
| Molecule panel consumer | `eVe/intuition/tools/molecule/panel/index.js` | Requests definitions from the footer API and delegates invocation back to it |
| MTraX panel consumer | `eVe/domains/mtrax/ui/tool_keys.js` | Composes footer definitions with local record tools and delegates most actions back to footer API |
| Layering contract | `eVe/intuition/runtime/layer_contract.js` | Global visual order and required layer ownership |
| Latched-state sync | `eVe/intuition/runtime/eve_intuition/tool_latched_state_runtime.js` | Shared active or latched visual state for tools across surfaces |

## 4. Main Bottom Menu: Current Behavior

### 4.1 Purpose

The main bottom menu is the product-level toolbox. It is always the global menu surface, even when other contextual surfaces are open.

It is created through `createIntuitionXMenu(...)` in `eVe/intuition/menu/index.js`, which internally creates `createIntuitionXRibbon(...)` from `eVe/intuition/ribbon/menu.js` with `variant: 'main'`.

### 4.2 Root tool structure

The canonical root children currently exposed from `intuition_content.toolbox.children` are:

1. `home`
2. `matrix`
3. `find`
4. `activity`
5. `capture`
6. `time`
7. `undo`
8. `perform`
9. `help`

These keys are the visible top-level menu identity, not just labels. Rebuild code must preserve their canonical IDs even if the rendering changes.

### 4.3 Authentication-dependent content

The main menu is auth-gated in `eVe/intuition/eVeIntuition.js`.

- Authenticated state: the ribbon shows the normal root children from `intuition_content.toolbox.children`.
- Disconnected or anonymous state: the ribbon root children become an empty list.
- In disconnected state, the `home` entry is patched to label `Atome` and uses the Atome icon.

The gate is maintained by:

- `isUserAuthenticatedForMainMenu()`
- `syncMainMenuAuthContent(...)`
- `bindMainMenuAuthGate()`

This is functional behavior, not cosmetic behavior. A rebuild must preserve it.

### 4.4 Handle behavior

The ribbon handle has more than one role.

- Standard reveal or collapse entry point.
- Long press on authenticated state opens or toggles the AI panel.
- Long press on disconnected state opens the Home panel instead.
- During tool-drag delete preview, the handle area also becomes part of the delete affordance.

The main handle long-press delay is `460ms`.

### 4.5 Reveal and overflow behavior

The ribbon is not a binary open or closed bar. It supports partial reveal, snapped reveal, and overflow scroll.

The reveal math lives in `eVe/intuition/ribbon/reveal.js`:

- `computeNaturalTrackWidthPx(...)`
- `computeRevealStopsPx(...)`
- `computeFlickFullOpenLimitPx(...)`
- `computeOverflowScrollStopsPx(...)`
- `resolveOverflowState(...)`

Functional consequences:

- The menu can be partially opened to successive reveal stops.
- The cap at the end of the ribbon can advance reveal or scroll by one tool.
- When the ribbon is fully open but wider than the viewport, overflow becomes horizontal scrolling instead of more reveal.
- Overflow scrolling snaps to tool-aligned positions.
- Handedness changes reveal order and terminal stop behavior.

This is not optional detail. Partial reveal is part of the current product interaction model.

### 4.6 Quick capture sweep

The main ribbon has a dedicated quick capture gesture.

Important constants in `eVe/intuition/ribbon/menu.js`:

- Trigger rise: `28px`
- Bias: `8px`
- Full reveal rise: `56px`
- Overlay offset: `12px`
- Dismiss delay: `180ms`

Current quick capture keys are:

1. `video`
2. `photo`
3. `audio`
4. `record`

The quick capture overlay is not the same as opening the whole ribbon. It is a dedicated gesture-layer interaction attached to the main handle.

### 4.7 Palette behavior inside the ribbon

The ribbon supports top-level palette entries and slider entries.

Current behavior:

- A palette expands inline under the parent tool geometry.
- Expanding a palette changes layout and can force further reveal so the full children stay visible.
- Dismissing palettes returns the parent tool to its compact width.
- External tools or panels can mark a ribbon tool as visually open through `setToolExternalOpen(...)`.
- Latched tools are reflected visually through `setToolLatchedState(...)`.

The main ribbon API returned from `createIntuitionXRibbon(...)` includes:

- `open`
- `close`
- `dismissPalettes`
- `hide`
- `dismiss`
- `reveal`
- `setVisible`
- `hideCompletely`
- `showFully`
- `updateContent`
- `add`
- `remove`
- `setVisualPreferences`
- `setToolLatchedState`
- `getToolLatchedState`
- `setToolExternalOpen`
- `containsTarget`

### 4.8 Tool drag and delete preview

Top-level ribbon tools are draggable. The drag payload is a tool-spawn payload, not a reorder payload.

Current capabilities:

- Start drag from the ribbon tool face.
- Use a shared tool-drag payload format.
- Show live drag preview.
- Surface a delete affordance over the main handle region while a drag-delete session is active.

This is a distinct feature of the main ribbon and must not be lost during rebuild.

### 4.9 Invocation path from the main ribbon

`invokeIntuitionXMainRibbonToolDefinition(...)` is the main ribbon tool dispatcher.

Current routing rules:

- `find` is special-cased to `handleFinderTouch(...)`.
- Slider tools route through `invokeToolFromUiButton(...)` using the `sliderApplyToolId` or `toolId`.
- All other normal tools route through `invokeUnifiedContextTool(...)` with source layer `tool.main`.

The ribbon is therefore a view plus a source-layer identity. It does not own business behavior itself.

## 5. Flower Menu: Current Behavior

### 5.1 Purpose

The flower is a transient contextual radial menu. It is opened from the current pointer location and resolved against project or atome context.

The key architectural split is:

- `eVe/intuition/flower/menu.js`: generic radial menu UI.
- `eVe/intuition/flower/context.js`: runtime that decides when, where, and why the flower opens.

The flower view is reusable. The flower context runtime is the production owner.

### 5.2 Opening triggers

The flower contextual runtime is installed by `installIntuitionXFlowerContextRuntime(...)` in `eVe/intuition/eVeIntuition.js` with:

- `longPressMs: 460`
- `moveTolerancePx: 8`

The runtime listens globally on the document for:

- `pointerdown`
- `pointermove`
- `pointerup`
- `pointercancel`
- `contextmenu`
- `click`
- window `blur`

Functional opening paths:

- Long press on a valid project or atome target.
- Native `contextmenu` on a valid target.

### 5.3 Blockers and guard rules

The flower does not open over existing tool or panel surfaces. The runtime explicitly treats the following as blockers:

- Main ribbon
- Existing flower root
- Panel layer surfaces and dialogs
- Footer surfaces
- Tool projection surfaces
- Tool buttons and projection handles
- Embedded tool rows

This guard is important because the flower is a canvas-context menu, not a menu-on-menu overlay.

The runtime also suppresses follow-up clicks for a short period after open, to avoid immediate accidental click-through.

Important guard constants:

- Click suppression: `320ms`
- Pointer release guard: `96ms`

### 5.4 Drag-hover interaction model

The flower is not only click-based. It supports hover-driven and release-driven selection.

Current behavior:

- On long press open, the runtime begins a drag-selection session.
- While dragging across the flower, hover state follows the pointer.
- Palette buttons and the back button can auto-open on hover.
- On release, the hovered item may activate.
- If release does not land directly on a button, the runtime still tries to resolve the last hovered button if it was recent and spatially close.

This is one of the most important behavioral differences between the flower and the main ribbon.

### 5.5 Preview interaction suspension

When the long-press target is a preview-like surface, the flower runtime can temporarily suspend preview interactions and request preview interaction cancel before opening.

This exists specifically to avoid conflicts with MTraX-like interactive surfaces.

### 5.6 Flower item sets by context

The current item sets are resolved in `resolveFlowerContextItems(...)` in `eVe/intuition/eVeIntuition.js`.

If the user is not authenticated, the flower returns no items.

Current item sets:

Project only context:

1. `paste`
2. `audio`
3. `video`
4. `photo`
5. `import`
6. `info`

Default atome context:

1. `copy`
2. `paste`
3. `delete`
4. `info`
5. `detail`
6. `couleur`
7. `size`
8. `font`
9. `mtrack`
10. `communicate`

Media atome context adds:

1. `play`

Text context:

1. `copy`
2. `paste`
3. `info`
4. `delete`
5. `detail`
6. `couleur`
7. `size`
8. `font`
9. `mtrack`
10. `communicate`

Perform mode context:

1. `perform`
2. `copy`

Mixed-kind multi-selection context:

1. `info`

If the target is not a media kind but has project automation, `play` may be appended to the default item list.

### 5.7 Selection semantics

The flower does not always act on the raw pointer target.

It resolves:

- target atome
- current selection IDs
- whether the target is already inside the active selection
- whether the menu should act on the single target or on the full selection
- whether the selection contains mixed kinds

This decision uses:

- `eVe/intuition/flower/context_target.js`
- `eVe/intuition/flower/context_selection.js`
- `resolveFlowerKindForAtomeId(...)` and related helpers in `eVe/intuition/eVeIntuition.js`

This context-resolution policy is part of the menu contract. It cannot be delegated to the visual renderer.

### 5.8 Flower view mechanics

The generic view in `eVe/intuition/flower/menu.js` provides:

- animated open and close
- radial layout for root items
- alternate layout for submenu stacks
- back button support
- hover highlighting
- draggable tool payloads for leaf items with a `toolId`
- `openAt(...)`, `close()`, `isOpen()`, `resolveButtonFromPoint(...)`, `setHoveredButton(...)`, `activateButton(...)`

The view does not own context logic. It only renders normalized items and forwards selection.

### 5.9 Invocation path from the flower

`invokeFlowerContextTool(...)` is the flower dispatcher.

Current special cases:

- `perform` opens perform behavior directly.
- `mtrack` opens `ui.mtrax.open` with selection-aware payload.
- `info` delegates to the main tool interaction path.
- `delete` invokes `ui.delete.selection` with context-aware IDs.
- `import` invokes project media import.

All other normal tools route through `invokeUnifiedContextTool(...)` with source layer `flower_menu` and a payload shaped from:

- selection IDs
- context atome ID
- project ID
- context type

## 6. Atome Edit Footer and Embedded Tool Rows

### 6.1 Purpose

The Atome edit footer is the context-bound tool strip opened from atome interaction. It is not the same surface as the main ribbon.

It follows the currently active atome and exposes tools based on the active kind.

### 6.2 Open and close behavior

The footer runtime is installed by `installAtomeEditFooterRuntime()` in `eVe/intuition/eVeIntuition.js`.

Current open path:

- Global `dblclick` is intercepted.
- The runtime resolves the preferred atome host from the event target and point.
- Tool shortcuts and menu-owned surfaces are ignored.
- If the atome is a text atome and not already editing, the runtime enters text editing.
- If the atome or host is media-like or MTraX-like, the runtime redirects to MTraX open behavior instead of showing the normal footer.
- Otherwise it enters Atome focus fullscreen and shows the floating footer anchored to the target host.

Current close path:

- Double-clicking the same already-open non-MTraX target closes the footer.
- Explicit footer close uses `hideAtomeEditFooter()`.
- Opening MTraX hides the footer first.

### 6.3 MTraX redirect on double-click

The footer double-click runtime deliberately centralizes media-like opening behavior.

Kinds treated as MTraX-like include:

- `mtrack`
- `image`
- `video`
- `audio`
- `sound`
- recording variants
- group-like atomes under certain runtime state conditions

For these targets, double-click does not open the normal footer. It routes to `requestMtrackOpenForAtome(...)` and opens the MTraX flow.

This is a major behavioral branch and must remain explicit in any rebuild.

### 6.4 Floating footer shell

The floating footer shell itself is implemented by `eVe/intuition/footer/runtime.js`.

Important facts:

- It reuses `createIntuitionXRibbon(...)` with `variant: 'close'`.
- It is anchored to a live element, not fixed to the viewport bottom.
- It computes bound width from the anchor width, with a minimum width contract.
- It tracks anchor movement and resize through a `ResizeObserver`.
- It exposes `show(...)`, `hide()`, `syncPlacement(...)`, `ownsTarget(...)`, `renderToolsInto(...)`, and `syncToolState(...)`.

The floating footer is therefore a ribbon variant, not a separate renderer from scratch.

### 6.5 Footer default tool sets by kind

The current kind-based defaults live in `ATOME_EDIT_FOOTER_DEFAULT_TOOLS_BY_KIND` in `eVe/intuition/eVeIntuition.js`.

Current defaults:

| Kind | Default tools |
| --- | --- |
| `text` | `detail`, `record_action`, `couleur`, `font`, `size` |
| `svg` | `detail`, `record_action`, `draw`, `vector`, `layer`, `size`, `couleur`, `communicate` |
| `image` | `detail`, `size`, `communicate`, `couleur` |
| `video` | `detail`, `play`, `mtrack`, `size`, `communicate`, `couleur` |
| `sound` | `detail`, `play`, `mtrack`, `size`, `communicate`, `couleur` |
| `audio` | `detail`, `play`, `mtrack`, `size`, `communicate`, `couleur` |
| `group` | `detail`, `record_action`, `play`, `mtrack`, `size`, `communicate`, `couleur` |
| `mtrack` | `detail`, `record_action`, `play`, `size`, `communicate`, `couleur` |
| fallback | `record_action`, `size`, `communicate`, `couleur` |

These defaults are then filtered and extended by context-aware logic such as project automation and MTraX expansion state.

### 6.6 Footer MTraX expanded tool set

When the footer is in MTraX-expanded mode, the tool set becomes the dedicated MTraX strip.

Current MTraX footer tool keys are:

1. `play`
2. `play_stop`
3. `split`
4. `join`
5. `mtrack_loop_cells`
6. `mtrack_loop`
7. `mtrack_clone`
8. `mtrack_follow`
9. `mtrack_hzoom`
10. `mtrack_vzoom`
11. `mtrack_snap`
12. `mtrack_tempo`
13. `mtrack_delete`

### 6.7 Footer state model

The footer runtime keeps explicit state in `atomeEditFooterState`.

Important state fields include:

- `open`
- `activeAtomeId`
- `activeKind`
- `activeSelectionIds`
- `activePaletteKey`
- `paletteExpansionByAtomeId`
- `pinnedPaletteKey`
- `mtrackExpanded`
- `mtrackExpandedAtomeId`
- `keepOpenUntil`
- `recordActionMode`
- `activeHasProjectAutomation`

This state is inspectable through the debug runtime exposed as `window.__DEBUG__.getFooterState()`.

### 6.8 Selection-bound invocation path from the footer

The footer is not just a visual row. It shapes payloads around the active atome and current selection.

`invokeIntuitionXFooterToolDefinition(...)` and `invokeAtomeEditFooterToolDefinitionWithContext(...)` do the following:

- resolve the canonical tool ID
- build selection-bound payload from active atome plus current selection
- optionally force active-atome-only scope for certain transport tools
- special-case `find`
- special-case `mtrack_*` controls
- special-case slider tools
- otherwise invoke `invokeUnifiedContextTool(...)` with source layer `atome_footer` or the caller-provided footer source layer

This selection shaping is one of the reasons Molecule and MTraX reuse the footer API instead of rolling their own logic.

### 6.9 Embedded inline tool rows

There is also a generic inline renderer in `eVe/intuition/footer/tool_row_runtime.js`.

It provides:

- normalized footer tool definition rendering
- inline palette expansion
- slider event wiring
- latched-state sync by `toolId` or `nameKey`

This renderer is used by the footer runtime API, but the public global footer API still exposes a legacy row renderer path from `eVe/intuition/eVeIntuition.js`.

That duplication matters for rebuild planning.

### 6.10 Public footer API

The global footer facade exposed on `window.eveAtomeEditFooterApi` currently provides:

- `renderToolsInto(host, options)`
- `renderManagedToolsInto(host, options)`
- `syncToolState(host, detail)`
- `publishSelection(atomeId)`
- `resolveDefaultTools(kind)`
- `resolveToolDefinitions(options)`
- `invokeToolDefinition(definition, options)`

This API is a live integration contract. Embedded consumers already depend on it.

## 7. Molecule and MTraX Inline Menus

### 7.1 Molecule panel is a footer consumer

The Molecule panel does not define a fully separate tool model.

`eVe/intuition/tools/molecule/footer_tools_contract.js` defines the current Molecule panel tool keys:

1. `play`
2. `play_stop`
3. `split`
4. `join`
5. `loop_cells`
6. `clone`
7. `follow`
8. `delete`

It also defines the body section order:

1. `content`
2. `controls`
3. `tools`

`eVe/intuition/tools/molecule/panel/index.js` then:

- builds a request with `createMoleculeFooterToolsRequest(...)`
- resolves canonical tool definitions through `footerApi.resolveToolDefinitions(...)`
- delegates activation back through `footerApi.invokeToolDefinition(...)`

This means Molecule is a consumer of the footer tool-definition system, not a second source of truth.

### 7.2 MTraX panel extends the footer model

`eVe/domains/mtrax/ui/tool_keys.js` defines `MTRACK_PANEL_TOOL_KEYS`.

Current MTraX panel tool list:

1. `detail`
2. `record_action`
3. `play`
4. `play_stop`
5. `split`
6. `join`
7. `mtrack_record_audio`
8. `mtrack_record_video`
9. `mtrack_record_camera_front`
10. `mtrack_record_camera_back`
11. `mtrack_track_source_audio`
12. `mtrack_track_source_video`
13. `mtrack_loop_cells`
14. `mtrack_loop`
15. `mtrack_clone`
16. `mtrack_follow`
17. `mtrack_hzoom`
18. `mtrack_vzoom`
19. `mtrack_snap`
20. `mtrack_tempo`
21. `mtrack_delete`

The MTraX panel behavior is hybrid:

- Most definitions come from the footer API.
- Local record and track-source tools are injected by the MTraX panel itself.
- Invocation of local record tools calls `window.eveMtrackApi` directly.
- Invocation of non-local definitions routes back through `window.eveAtomeEditFooterApi.invokeToolDefinition(...)`.

### 7.3 Molecule-panel transport exception

`eVe/intuition/tools/core/tool_interaction.js` contains a dedicated Molecule transport bypass.

If a tool is activated inside `#eve_mtrack_dialog` and matches Molecule transport semantics, the runtime may bypass the normal tool gateway and call `window.eveMtrackApi` directly.

This applies to transport-like actions such as:

- play
- pause
- stop
- media reader
- animation reader

This is an explicit domain exception. A rebuild should either preserve it or replace it with an equally explicit adapter layer.

## 8. Shared Architecture Across Surfaces

### 8.1 Canonical tool content

The canonical menu content tree still comes from `intuition_content` in `eVe/intuition/eVeIntuition.js`.

That tree provides:

- root structure
- labels
- icons
- palette children
- tool IDs
- action mode
- gateway action
- latch metadata
- slider metadata

The main ribbon, flower item builder, and footer definition resolution all consume this content model directly or indirectly.

### 8.2 Tool registration

There are two important registration flows in `eVe/intuition/eVeIntuition.js`:

- `registerMainToolAtomes()` registers canonical base tool definitions as runtime tools.
- `registerUiTools()` registers panel and UI action tools.

The important architectural point is that visible menu entries are not just DOM buttons. They are also registered tool identities.

### 8.3 Shared invocation bridge

The common path for normal UI tools is:

1. Surface-specific dispatcher resolves the key, tool ID, source layer, and payload.
2. Dispatcher calls `invokeUnifiedContextTool(...)`.
3. `invokeUnifiedContextTool(...)` calls `invokeToolFromUiButton(...)`.
4. Runtime or gateway handler executes the tool behavior.

Current surface-specific dispatchers are:

- `invokeIntuitionXMainRibbonToolDefinition(...)`
- `invokeIntuitionXFooterToolDefinition(...)`
- `invokeAtomeEditFooterToolDefinitionWithContext(...)`
- `invokeFlowerContextTool(...)`

Special cases remain outside this shared path for actions that need direct handling.

### 8.4 Legacy main-tool interaction path

`triggerMainToolInteraction(...)` still exists and still matters.

It remains the direct inline-handler path for:

- some special-case menu actions such as `info`
- legacy rows that do not always carry a `toolId`
- registered main-tool handlers that delegate back into the legacy interaction path

A rebuild should not remove this bridge until every consumer has been migrated to a single explicit tool runtime.

### 8.5 Payload shaping differs by surface

Even though the invocation bridge is shared, payload shaping is not.

Surface-specific payload rules:

- Main ribbon: mostly raw UI payload plus slider values.
- Flower: context-derived `selection_ids`, `atome_id`, `project_id`, and `context_type`.
- Footer: active-atome and selection-bound payloads, sometimes forced to active-atome-only for transport tools.
- MTraX panel: footer invocation plus MTraX-specific source layer and local record tool inputs.

This means the rebuild should share dispatch infrastructure, not flatten all surface controllers into one function.

### 8.6 Latched-state sync

Shared active or latched tool state is synchronized through the Intuition runtime state layer.

Important behavior:

- surfaces can mark tools as latched or not latched by tool ID
- visual sync is propagated through shared events and API calls
- the main ribbon and embedded rows both participate in this model

This is especially important for toggle tools, panels, record tools, and active transport states.

### 8.7 Layer contract

The global layer contract in `eVe/intuition/runtime/layer_contract.js` is authoritative.

Current canonical visual order from highest to lowest is:

1. `ACTIVE_DRAG`
2. `MENU`
3. `FLOWER`
4. `PANEL`
5. `COMPONENT`
6. `MOLECULE`
7. `FLOATING_GROUP`
8. `TOOL`

Important current meaning:

- Main ribbon lives in the menu layer.
- Flower lives just under the main menu layer.
- Panels and dialogs are below the flower.
- Footer and inline components belong to the component layer family.

This ordering is a hard contract, not a styling suggestion.

## 9. Public and Compatibility Surfaces

The rebuild must account for the existing global entry points still used across the product.

Current globals include:

- `window.new_menu_v2`
- `window.new_menu`
- `window.eveAtomeEditFooterApi`
- `window.__DEBUG__.getFooterState()`

If the rebuild changes the internal architecture, these compatibility surfaces should remain stable until all consumers are migrated.

## 10. Current Duplication and Legacy Risk

The current system has several live duplicate or parallel paths.

### 10.1 Two footer stories are still alive

The floating footer shown over atomes now uses the modern footer runtime based on `createIntuitionXRibbon(...)`.

However, the public embedded footer API still routes `renderToolsInto(...)` through legacy row-rendering logic in `eVe/intuition/eVeIntuition.js` instead of exposing the modern inline runtime directly.

This means a rebuild must treat floating footer and embedded footer consumers as related but not yet unified.

### 10.2 Flower view and flower context runtime are separate on purpose

The generic radial view is not enough to rebuild current behavior.

The real behavior lives in the contextual runtime that handles:

- long press timing
- move tolerance
- click suppression
- blocked targets
- selection semantics
- preview interaction suspension
- hover-release activation

Replacing only the flower view would miss most of the real behavior.

### 10.3 Molecule and MTraX are adapters, not independent menu systems

Inline Molecule and MTraX menus reuse canonical footer definitions and mostly reuse footer invocation.

The only real exceptions are:

- local MTraX record and track-source tools
- Molecule transport bypass through `window.eveMtrackApi`

That is useful because it defines the right rebuild boundary: keep these as adapters over shared tool infrastructure.

### 10.4 Historical menu code can mislead a rebuild

The following paths are historical or parallel and should not be treated as the production owner:

- `atome/src/squirrel/components/intuition_builder/index.js`
- `atome/documentations/new intuition menu.md`
- `createToolboxIntuitionMenuV2(...)` in `eVe/intuition/menu/index.js`

They are useful reference material, not the active product menu runtime.

## 11. Minimum Rebuild Invariants

Any serious rebuild should preserve the following contracts.

1. Keep one canonical tool-definition source with stable tool keys and tool IDs.
2. Keep the four main runtime concerns separate: main ribbon, flower context surface, floating footer, embedded inline tool strips.
3. Preserve auth-dependent main menu content and handle behavior.
4. Preserve flower context resolution rules for project, target, selection, mixed-kind selection, and perform mode.
5. Preserve selection-bound and atome-bound payload shaping for footer and flower tools.
6. Preserve one-open-palette-per-surface semantics plus slider behavior.
7. Preserve latched-state synchronization across ribbon, footer, and embedded rows.
8. Preserve the layer contract and do not reorder global menu, flower, panel, and component layers casually.
9. Preserve the MTraX redirect branch on double-click for media-like targets.
10. Preserve public compatibility APIs until all consumers have been migrated.

## 12. Recommended Rebuild Boundaries

The cleanest rebuild boundary is not by visual similarity. It is by responsibility.

Recommended modules for a rebuild:

1. `MenuToolModel`
   - canonical tool content
   - key and tool ID normalization
   - definition resolution for ribbon, flower, and footer

2. `MenuInvocationBridge`
   - shared gateway call path
   - per-surface payload shaping hooks
   - explicit special-case adapters

3. `MainRibbonSurface`
   - handle
   - reveal
   - overflow
   - quick capture
   - drag-to-delete preview

4. `FlowerContextSurface`
   - gesture runtime
   - blocker policy
   - context resolution
   - radial view

5. `AtomeFooterSurface`
   - double-click open and close policy
   - anchor placement
   - focus fullscreen coupling
   - MTraX redirect policy

6. `InlineToolStripSurface`
   - shared embedded tool-row renderer for Molecule, MTraX, Detail, and any future host

7. `CompatibilityFacade`
   - `window.new_menu_v2`
   - `window.new_menu`
   - `window.eveAtomeEditFooterApi`

This structure matches the actual behavior split already present in the codebase.

## 13. Suggested Rebuild Sequence

The safest rebuild order is:

1. Extract and freeze the canonical tool-definition and invocation contracts.
2. Rebuild the shared embedded inline tool strip first, because it is the smallest surface and is already adapter-heavy.
3. Rebuild the floating footer on top of the same tool-definition contracts.
4. Rebuild the flower with its full context runtime, not only its visual ring.
5. Rebuild the main ribbon last, because it has the most surface-specific interaction logic.
6. Remove legacy footer row rendering only after all embedded consumers are migrated.

This order minimizes product breakage because the most coupled surface, the main ribbon, is left until the shared contracts are stable.

## 14. Bottom Line

The current menu system is a shared tool platform presented through multiple specialized surfaces.

The correct rebuild target is therefore not "one new menu". The correct rebuild target is:

- one canonical tool model
- one explicit invocation bridge
- four surface runtimes
- one compatibility facade during migration

That matches the behavior users currently experience and the ownership already encoded in `eVe/intuition/`.
