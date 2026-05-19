# Strict DRY Menu Refactor Plan

## Goal

Replace the current mixed menu/tool rendering stack with:

- one canonical ribbon renderer
- one canonical tool renderer
- one canonical palette behavior

Only these may vary by context:

- trigger
- host/container
- optional header
- tool scale or size calculation

Everything else must be shared.

This also applies to the essential visual variables used to control the most important graphic elements:

- panel surface
- footer chrome
- tool size
- tool radius
- palette radius
- flower radius
- close button size
- text color
- panel shadow
- backdrop filter

## Non-negotiable Rules

1. No fallback.
2. No wrapper added only for one context.
3. No local patch that preserves old behavior in parallel.
4. No DOM cloning path kept for safety.
5. No legacy path kept "temporarily".
6. If a path is replaced, it is removed in the same step.
7. If a step cannot remove the replaced path, the step fails.
8. If a blocker appears, stop and report it. Do not improvise.
9. One master plan file only. No parallel plan documents for the same refactor.

## Design Preservation Rules

The refactor is invalid if it changes any of the following without explicit approval:

- tool order
- slot placement and slot occupancy
- palette opening direction and behavior
- palette inline push behavior
- bouchon placement and snapping behavior
- scroll stop placement and snapping behavior
- label / close placement
- handedness behavior
- footer height
- tool size
- slider expansion behavior
- panel resize behavior
- chrome structure
- flower visual language
- layer order / z-index behavior

## Shell vs Tools Separation Rules

The refactor is invalid if the canonical tool engine takes control of shell responsibilities.

Shell responsibilities must stay outside the tool renderer:

- grip
- header
- close button
- bouchon / cap / handle
- handedness layout
- panel chrome structure
- main menu shell structure

The canonical renderer may only control:

- tool rendering
- palette behavior
- inline child expansion
- scale and spacing derived from canonical tokens

## Bouchon / Scroll Contract

The bouchon and scroll behavior must be treated as canonical shell behavior.

Mandatory rules:

1. The bouchon is not a tool.
2. The bouchon must use one canonical behavior implementation only.
3. When manually released, the bouchon must snap cleanly between two tools.
4. Scroll/reveal position must also snap cleanly between two tools.
5. No local context may redefine bouchon snapping or scroll snapping.
6. No patch CSS or local offset hack is allowed to recenter the bouchon.

Mandatory validation:

- manual drag release snaps to a valid tool boundary
- scroll release snaps to a valid tool boundary
- no half-overlap state remains after release
- same snapping logic in all contexts using the same shell model

## Handedness Rules

Right-handed and left-handed layout must be handled by one canonical shell implementation only.

Mandatory rules:

1. No local reimplementation of handedness logic in context files.
2. No CSS patch that manually swaps title / close / grip order in one menu only.
3. No context-specific flex/order override for handedness if a canonical shell function already exists.
4. Any context needing right/left adaptation must call the canonical handedness code, not reproduce it.

Mandatory proof:

- identify the canonical handedness implementation
- list every file that currently overrides handedness locally
- remove local overrides as part of the refactor when replaced

## Tool Slots And Ordering Rules

Tool layout must not be treated as a free append-only list.

Mandatory rules:

1. Each context defines allowed slots.
2. Each slot defines accepted tool categories or keys.
3. Tool order is contractual and must be preserved unless explicitly changed.
4. Overflow behavior must be canonical, not reimplemented per context.

## Single UI State Owner Rules

There must be one authority for interactive menu state.

That authority must own:

- open palette key
- active / latched tools
- expanded slider state
- current contextual tool selection
- rerender-safe open state restoration

No secondary state cache may become authoritative.

## Canonical Tool Registry Rules

Each tool must have:

- one canonical key
- one canonical definition
- one canonical runtime entry point

Forbidden:

- duplicate semantic tools with different keys in different contexts
- empty or fake tool ids used to imitate standard tools
- local context-only tool definitions when a canonical tool exists

## Layering Rules

The refactor must preserve canonical layer behavior for:

- main menu
- palettes
- flower
- panels
- drag previews
- overlays

No context may locally fix z-index by ad hoc override if a canonical layer contract exists.

## Palette Interaction Contract

Palette behavior must be identical wherever the same palette model is used.

The canonical contract must define:

- how a palette opens
- whether it opens inline or floating
- how it pushes siblings
- how it behaves near edges
- how child tools behave
- when it closes
- when it must not close
- how sliders behave inside it

This contract must be implemented once only.

## Lifecycle Contract

The canonical engine must define what happens on:

- mount
- rerender
- host change
- selection change
- palette open
- palette close
- destroy

Without this contract, state bugs will reappear.

## Clone Prohibition Rule

DOM clone paths are forbidden for tool rendering in the target architecture.

If a clone path still exists, it must be classified as:

- temporary blocker
- or removal target

But never as an accepted long-term renderer.

## CSS / Token Rules

Critical visual dimensions must not be hardcoded in context files if a canonical token exists.

Critical dimensions include:

- tool size
- compact tool size
- tool radius
- flower tool radius
- panel radius
- close button size
- close button radius
- spacing and gap values

## Test Contract

The refactor must include mandatory validation for:

- DOM structure
- tool order
- slot occupancy
- palette interaction
- slider interaction
- handedness
- bouchon snapping
- scroll snapping
- resize behavior
- layer order
- visual baseline parity

## Removal Completion Rule

A removal step is not complete unless the replaced path is:

1. no longer called
2. no longer imported
3. no longer referenced by active tests as a valid path

## Context Policy Rules

Each context must use the same canonical engines, but not the same permissions.

1. `main`

- locked host
- no arbitrary tool injection
- strict whitelist only
- the main menu grip and Atome header are part of the shell and must not be modified by the canonical tool engine
- no tool refactor is allowed to change main menu shell geometry
- handedness must come from the canonical shell implementation only

1. `floating`

- configurable host
- no custom renderer logic
- tool additions are allowed only through canonical tool lists and host configuration
- handedness must come from the canonical shell implementation only

1. `embedded`

- configurable host
- no custom renderer logic
- tool additions are allowed only through canonical tool lists and host configuration
- handedness must come from the canonical shell implementation only when embedded chrome exists

1. `flower`

- same tool engine
- same palette engine when applicable
- context-specific placement only
- flower may use a different size policy, but size difference must come only from canonical scale/metric inputs
- flower must not fork the rendering engine to obtain its smaller or radial presentation
- flower must not re-declare tool semantics or palette behavior

## Explicit Questions Covered By This Plan

The refactor must explicitly cover these points:

1. How to add tools in floating menus

- via canonical tool lists only
- no local renderer

1. How to add tools in embedded menus

- via canonical tool lists only
- no local renderer

1. How to forbid adding tools in the main menu

- main menu is locked by whitelist
- no arbitrary tool injection API on the main host

1. How to avoid breaking the main menu grip and Atome header

- shell and tool engine are strictly separated
- tool refactor must not edit shell geometry or shell ownership

1. How to manage the flower size difference

- same canonical renderer
- size difference handled only by scale/metrics inputs
- no dedicated duplicate renderer for flower sizing

1. How to preserve right-handed / left-handed alignment

- reuse the canonical handedness code only
- no local rewrite of the alignment logic
- no context-specific order/flex patch as a permanent solution

1. How to preserve bouchon and scroll alignment

- bouchon snapping must remain canonical
- scroll snapping must remain canonical
- both must snap between two tools on manual release
- no local offset correction is allowed

## Proof Required For Every Step

Each step must end with exactly these outputs:

- `Canonique`
- `Supprimé`
- `Preuve grep`
- `Tests`
- `Preuve design`
- `Blocage éventuel`

If one line is missing, the step is not complete.

## Baseline Before Refactor

Before replacing code, freeze the current expected behavior for these contexts:

1. main ribbon
2. flower
3. footer / embedded
4. double-click menu
5. floating panel
6. Mtrack integrated row
7. palette open with child tools
8. slider expanded inside palette

Baseline must include:

- DOM structure probes
- active renderer path
- visual screenshots or equivalent probe artifacts
- interaction checks for open / close / child tool use

## Step 1: Inventory

### Objective

List every active rendering and interaction path for:

- ribbon
- tools
- palettes
- double-click
- embedded
- floating
- flower

### Deliverable

For each path:

- active file
- responsibility
- whether it is canonical, shared, legacy, or exception
- whether it mutates design or behavior

### Step 1 Inventory Result

#### A. Ribbon / Main Menu Rendering

1. Canonical candidate currently in use:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/ribbon/menu.js`
- responsibility:
  - main ribbon rendering
  - bouchon / reveal / scroll snapping
  - palette expansion geometry
  - tool visual layout
  - handedness-sensitive shell placement
- classification:
  - **shared active path**

1. Active consumer:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/menu/index.js`
- classification:
  - **shared active path**

#### B. Flower Rendering

1. Active renderer:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/flower/menu.js`
- responsibility:
  - radial flower layout
  - flower item rendering
  - flower-specific placement
- classification:
  - **separate active renderer**

Observation:

- flower already shares token vocabulary through `RIBBON_TOKENS`
- but it does **not** share the same renderer implementation as ribbon/footer

#### C. Footer / Embedded Tool Rendering

1. Active modern runtime:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/footer/runtime.js`
- responsibility:
  - render inline tools into host
  - render inline palettes
  - reuse `createIntuitionXRibbon(...)` as shell container
- classification:
  - **shared active path**

1. Inline button renderer used by footer runtime:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/footer/inline_button.js`
- classification:
  - **shared active path**

Observation:

- footer runtime is not a totally separate shell, but it still has its own tool/palette assembly path
- this is one of the current duplication points

#### D. Legacy Footer Tool Rendering

1. Legacy still present and still callable:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
- key functions:
  - `renderAtomeEditFooterToolsIntoRow(...)`
  - `ensureAtomeEditFooterPalette(...)`
- classification:
  - **legacy still branchable**

Critical fact:

- `window.eveAtomeEditFooterApi.renderToolsInto(...)` in
  `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
  can still route either:
  - to the modern footer runtime
  - or to the legacy footer renderer

Therefore:

- we currently have **two tool rendering paths still alive**

#### E. Shared Palette Behavior

1. Shared low-level helper:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/tools/core/palette_behavior.js`
- responsibility:
  - low-level palette expansion state / geometry helper
- classification:
  - **shared low-level primitive**

1. Additional parallel palette behaviors:

- footer inline palette logic in `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/footer/runtime.js`
- legacy footer palette behavior in `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
- ribbon-local palette handling in `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/ribbon/menu.js`
- project drop palette handling in `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/tools/project_drop.js`

Therefore:

- we currently have **one shared primitive but multiple active palette implementations**

#### F. Mtrack Specific Integration

1. Active embedded row mount:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/domains/mtrax/ui/ensure_runtime.js`
- responsibility:
  - inject integrated tools row in Mtrack
  - call footer API to render tools into that row
- classification:
  - **context integration layer**

1. Legacy/suspicious Mtrack clone path removed:

- former MTraX header clone runtime path, now deleted
- responsibility:
  - clone tools into Mtrack header via `cloneTool(...)`
- classification:
  - **removed historical exception**

Therefore:

- MTraX no longer contains the clone-based historical path; future audits should use `/Users/jean-ericgodard/RubymineProjects/a/eve/application/domains/mtrax`

#### G. Tool Visual Primitive

1. Shared primitive:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/projection/button.js`
- responsibility:
  - shared button face/base styles
- classification:
  - **shared low-level primitive**

1. Shared slider primitive:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/shared/slider_tool_content.js`
- classification:
  - **shared low-level primitive**

These are good candidates to keep.

#### H. Visual Token Inventory

1. System authority candidate:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/elements/system_ui_tokens.js`
- classification:
  - **global token authority candidate**

1. Derived panel layer:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/panels/visual/panel_visual_tokens.js`
- classification:
  - **derived layer**

1. Ribbon-specific token layer:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/ribbon/tokens.js`
- classification:
  - **mixed layer**

Important observation:

- `ribbon/tokens.js` already derives some values from `system_ui_tokens.js`
- but it also defines many core dimensions and colors locally
- this file is currently both:
  - a legitimate context token file
  - and a likely second authority for important visual metrics

#### I. Inventory Verdict

Current architecture status:

- **not one common renderer**
- **not fully separated clean renderers either**
- **mixture of shared primitives + multiple active renderers + still-branchable legacy + context exceptions**

Specifically:

1. Tool rendering:

- modern footer runtime path exists
- legacy footer path still exists
- MTraX still has context-specific integration, but the historical clone path has been removed

1. Palette behavior:

- shared primitive exists
- multiple active implementations still exist

1. Tokens:

- global token authority exists
- derived layers exist
- some context token files are still potential second authorities

#### J. Immediate Removal Targets Identified By Inventory

- legacy footer renderer path in `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
- removed MTraX header clone path
- duplicate palette implementations after canonical selection

#### K. Immediate Safe Keepers Identified By Inventory

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/projection/button.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/shared/slider_tool_content.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/tools/core/palette_behavior.js`

## Step 2: Choose Canonical Engines

### Objective

Pick one and only one engine for:

- ribbon rendering
- tool rendering
- palette behavior

### Constraint

The choice must minimize code and maximize reuse across:

- double-click
- embedded
- floating
- flower
- Mtrack

### Deliverable

- chosen canonical files
- all competing files marked for removal or debranching

### Step 2 Canonical Choice Result

#### A. Canonical Shell / Ribbon Engine

Chosen canonical basis:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/ribbon/menu.js`

Reason:

- it already owns the most complete shell behavior set:
  - reveal
  - bouchon/cap behavior
  - scroll snapping
  - handedness-sensitive placement
  - palette reveal geometry
- it is the closest thing to a real shell authority today

Decision:

- `ribbon/menu.js` becomes the canonical shell behavior reference for linear menu surfaces
- the flower keeps its radial placement shell, but must not become a second authority for tool or palette behavior

#### B. Canonical Tool Renderer

Chosen canonical basis:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
- specifically the behavior currently embodied by:
  - `renderAtomeEditFooterToolsIntoRow(...)`
  - `createToolButtonV2(...)` usage

Reason:

- this is the path that already renders the real Atome-standard tools
- this is the behavior the user explicitly wants preserved
- the current modern inline footer runtime is still a partial parallel rewrite and is the source of recent divergence

Decision:

- the canonical tool renderer will be extracted from the legacy footer behavior
- the target is **not** to keep `eVeIntuition.js` as a god-file authority forever
- the target is to move this renderer into a dedicated shared module, then remove the legacy branch

#### C. Canonical Palette Behavior

Chosen canonical basis:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
- specifically the behavior currently embodied by:
  - `ensureAtomeEditFooterPalette(...)`
  - the child-guard and keep-open logic in the footer palette flow
- supported by low-level primitive:
  - `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/tools/core/palette_behavior.js`

Reason:

- this is the only currently proven palette behavior matching the standard Atome expectation
- it already handles:
  - child interactions
  - slider interactions
  - guarded close/open logic

Decision:

- the canonical palette engine will be extracted from this path into a shared module
- `palette_behavior.js` remains the low-level geometry/state helper, not the full behavioral authority by itself

#### D. Canonical Visual Token Authority

Chosen canonical basis:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/elements/system_ui_tokens.js`

Reason:

- it is already the clearest global authority candidate
- other token files must become derived-only layers

Decision:

- `system_ui_tokens.js` is the authority for core visual concepts
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/ribbon/tokens.js`
  and
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/panels/visual/panel_visual_tokens.js`
  must remain derived-only after migration

#### E. Files To Keep As Shared Primitives

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/projection/button.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/shared/slider_tool_content.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/tools/core/palette_behavior.js`

These are not authorities by themselves, but they are valid shared building blocks.

#### F. Competing Paths Marked For Replacement / Debranching

1. Replace / debranch:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/footer/runtime.js`

Why:

- it is a parallel modern renderer path for tools/palettes
- it must stop being an independent authority
- after refactor, it may survive only as a host adapter delegating to the canonical extracted renderer

1. Replace / debranch:

- the legacy branch selector inside
  `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
  that keeps both modern and legacy footer rendering alive

Why:

- two active render paths are forbidden by the target architecture

1. Remove:

- removed former MTraX header clone runtime

Why:

- clone-based tool rendering is explicitly forbidden in the target architecture

1. Audit then replace if still active as competing authority:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/tools/project_drop.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/menu/core/toolbox_runtime.js`

Why:

- they contain palette/reveal behavior that may be duplicating canonical logic

#### G. Step 2 Decision Summary

1. Shell authority:

- `ribbon/menu.js`

1. Tool renderer authority basis to extract:

- footer tool rendering behavior currently in `eVeIntuition.js`

1. Palette authority basis to extract:

- footer palette behavior currently in `eVeIntuition.js`

1. Token authority:

- `system_ui_tokens.js`

1. Immediate removal target:

- Mtrack clone path

1. Immediate debranch target:

- dual modern/legacy footer rendering split

## Step 3: Lock Design Baseline

### Objective

Create explicit acceptance references for:

- structure
- spacing
- dimensions
- interaction

### Constraint

No production refactor starts until the baseline is recorded.

### Step 3 Baseline Result

#### A. Valid Baseline Artifacts Already Available

1. Main panel/runtime baseline:

- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/eve_runtime_main_panel_probe.json`

1. Mtrack integrated row baseline:

- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/mtrack_panel_tools_probe.json`
- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/mtrack_panel_tools_probe.png`

1. Panel/palette layering baseline:

- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/panel_palette_zorder_probe.json`

1. Projection / overflow baseline:

- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/projection_toolbox_right_overflow_probe.json`

1. Transport / reveal baseline:

- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/eve_runtime_transport_record_reveal_probe.json`

#### B. Current Mtrack Baseline Snapshot

From `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/mtrack_panel_tools_probe.json`:

- panel shell visible and mounted
- bottom chrome on one line
- close button on the left in right-handed mode
- title on the right in right-handed mode
- integrated tool shell present
- integrated row present
- current row children observed:
  - play palette host
  - split
  - join
  - cells
  - clone
  - follow palette host
  - delete

This artifact is accepted as the current structural baseline for Mtrack panel layout.

#### C. Current Main Menu Baseline Status

From `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/eve_runtime_main_panel_probe.json`:

- runtime probe exists
- some tool handlers fail
- but the artifact is still useful as baseline evidence for active main/panel tool groups and their current routing

This artifact is accepted as a partial routing baseline, not as a final interaction proof.

#### D. Current Flower Baseline Status

Artifacts available:

- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/flower_play_media_probe.json`
- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/mtrack_flower_first_open_diag.json`

Current status:

- flower artifacts exist
- but the currently stored probes are not fully passing
- therefore flower baseline is only partially locked right now

This is a known gap to close before production refactor that touches flower behavior.

#### E. Current Baseline Gaps

The following are not yet fully locked by passing baseline probes:

1. flower complete interaction baseline
2. double-click menu baseline with palette interaction proof
3. embedded menu baseline with palette/slider interaction proof
4. palette child interaction baseline in the canonical target path
5. slider-open-inside-palette baseline in the canonical target path

#### F. Baseline Decision

Production refactor may proceed only under this restriction:

- safe to proceed on architectural extraction work that does not yet replace visible runtime paths
- not safe to replace flower behavior until a clean flower baseline artifact is added
- not safe to replace palette interaction behavior blindly without adding direct child-interaction baseline coverage

#### G. Baseline Priority To Complete Next

1. palette child interaction baseline
2. slider-in-palette baseline
3. flower interaction baseline
4. embedded menu baseline

## Step 3.5: Centralize Essential Visual Tokens

### Objective

Centralize the essential visual variables used by the shared menu and panel system.

### Constraint

There must be one source of truth for the core visual tokens.

### Mandatory Scope

- surface colors
- text colors
- shadows
- blur/backdrop values
- panel radii
- tool radii
- close button metrics
- canonical tool sizes
- canonical spacing values

### Mandatory

- no local redefinition of core values when a system token exists
- no hidden numeric literals for core menu/panel sizing in context-specific files
- local files may derive from canonical tokens, but may not redefine them as new authorities

### Deliverable

- canonical token file list
- duplicate token file list
- migration list of values to move or delete

### Current Baseline Files To Audit First

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/elements/system_ui_tokens.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/panels/visual/panel_visual_tokens.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/ribbon/tokens.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/elements/eVe_look.js`
- Mtrack-specific style files that introduce panel or tool dimensions locally

## Step 4: Replace Tool Rendering

### Objective

Route all tool rendering through one canonical renderer.

### Mandatory

- remove competing tool renderers in the same step
- remove clone-based render paths if replaced
- no bridge that keeps old renderer alive

### Step 4 Progress

#### 4.A Canonical renderer debranch applied for integrated hosts

Applied:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`

Result:

- `window.eveAtomeEditFooterApi.renderToolsInto(...)` now delegates directly to
  `renderAtomeEditFooterToolsIntoRow(...)`
- `window.eveAtomeEditFooterApi.renderManagedToolsInto(...)` now reuses that same path
- `window.eveAtomeEditFooterApi.syncToolState(...)` now delegates directly to
  `syncAtomeEditFooterButtonsForToolStateOnRow(...)`

This removes `footer/runtime.js` as an authority for tool rendering while preserving it only as a host/runtime concern.

#### 4.B Canonical visual style restored for integrated Atome tool rows

Applied:

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/domains/mtrax/ui/styles.js`

Result:

- canonical Atome editor tool styles are injected again before row rendering
- the legacy cleanup no longer destroys the canonical style sheet
- Mtrack no longer styles the removed inline footer DOM as if it were authoritative
- probe now confirms standard `32x32` tool geometry in the integrated Mtrack row

Validation artifact:

- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/mtrack_panel_tools_probe.json`

#### 4.C Clone path removed from Mtrack header integration

Removed:

- former MTraX header clone runtime
- former MTraX header action buttons runtime
- `MTRACK_HEADER_TOOL_CLONES` in
  `/Users/jean-ericgodard/RubymineProjects/a/eve/application/domains/mtrax/shared/constants.js`

Debranched:

- `mountHeaderToolClones`
- `mtrackHeaderToolClones`
- clone-runtime exports/imports in Mtrack bootstrap and bundle files

Proof:

- `rg -n "header_tool_clone_runtime|header_action_buttons_runtime|MTRACK_HEADER_TOOL_CLONES|mountHeaderToolClones|mtrackHeaderToolClones" eve/application/domains/mtrax eve/application/intuition/tools/mtrack.js -S`
  returns no active matches

#### 4.D Header toolbar bridge removed completely

Removed:

- former MTraX header tools visual runtime
- former MTraX header detail bridge runtime
- dead Mtrack header state fields:
  - `headerTools`
  - `headerRecordState`
  - `headerRecordBridgeBound`
  - `visualPrefsBound`
- dead header constants:
  - `GOEY_VISUAL_PREFERENCES_EVENT`
  - `MTRACK_HEADER_RECORD_BUTTON_ID`
  - `MTRACK_HEADER_DETAIL_BUTTON_ID`

Debranched:

- `syncHeaderActionButtonsState`
- header visual preference bridge
- header detail button bridge
- header record bridge
- header transport bridge

Validation:

- `rg -n "GOEY_VISUAL_PREFERENCES_EVENT|MTRACK_HEADER_DETAIL_BUTTON_ID|MTRACK_HEADER_RECORD_BUTTON_ID|syncHeaderActionButtonsState|header_tools_visual_runtime|header_detail_bridge_runtime|headerTools\\b|headerRecordState\\b|visualPrefsBound\\b" eve/application/domains/mtrax eve/application/intuition/tools/mtrack.js eve/application/domains/mtrax/shared/constants.js -S`
  returns no active matches
- `/Users/jean-ericgodard/RubymineProjects/a/temp/probe_reports/mtrack_panel_tools_probe.json`
  still confirms:
  - shell intact
  - title right / close left
  - integrated tools row intact
  - standard `32x32` direct tool geometry

## Step 5: Replace Palette Behavior

### Objective

Route all palettes through one canonical palette behavior.

### Mandatory

- same open/close behavior everywhere
- same inline child behavior everywhere
- same slider behavior everywhere
- remove competing palette logic in the same step

## Step 6: Reconnect All Contexts

### Objective

Reconnect these contexts to the canonical engines only:

- main ribbon
- flower
- footer / embedded
- double-click
- floating panel
- Mtrack integrated tools

### Constraint

Context may only choose:

- host
- trigger
- scale

It must not redefine rendering logic.

## Step 7: Purge Legacy

### Objective

Delete remaining unused or parallel code paths.

### Mandatory Proof

`rg` must prove there is no second active path for:

- tool rendering
- palette expansion
- ribbon rendering

## Step 8: Final Validation

### Objective

Validate both architecture and design.

### Required Checks

1. One renderer per concern.
2. No fallback strings like "legacy", "temporary", "retry path", "compat".
3. No context-specific palette logic unless explicitly approved.
4. All baseline design checks still pass.
5. Interaction tests pass for child palette tools and sliders.

## Known Suspicious Areas To Purge

- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/eVeIntuition.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/footer/runtime.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/ribbon/menu.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/flower/menu.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/domains/mtrax/ui/ensure_runtime.js`
- removed former MTraX header clone runtime
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/elements/system_ui_tokens.js`
- `/Users/jean-ericgodard/RubymineProjects/a/eve/application/intuition/panels/visual/panel_visual_tokens.js`

These are not automatically wrong, but they are the first places to audit for duplication and exceptions.

## Execution Contract

From now on, this refactor must be executed as a replacement refactor, not as an incremental repair.

That means:

- no hidden legacy kept alive
- no silent compatibility path
- no step accepted without deletion proof
- no design regression accepted without explicit approval
