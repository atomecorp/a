# eVe Bevy Dashboard Specification

Status: planning document  
Reference prototype: `eVe/R&D/dashboard_design.html`  
Initial prompt source: `todo/prompt_dashboard_bevy_design.md`  
Target implementation: Bevy/Rust visual surface integrated into the existing eVe UI architecture

## Purpose

The Atom tool must open a full dashboard rendered inside the Bevy canvas surface. The dashboard replaces the current project visual area while it is active, but it must not hide the existing eVe toolbox. The current toolbox stays visible and open below the dashboard, and the dashboard must reserve an empty bottom band matching the toolbox height so no dashboard content is drawn or hit-tested behind it.

The dashboard is not a static mockup. It is a data-driven UI surface where each header represents a tool/category backed by database records. Rows display real records for each category. The `+` action creates a new record for the active category, opens it fullscreen for inspection/editing/completion, then reintegrates the record into the dashboard grid when the user closes it through the category header.

This work is also an opportunity to define reusable Bevy UI components for eVe, with a structure that can later support migration of existing HTML/DOM UI surfaces toward Bevy without duplicating state ownership or rendering paths.

## Product Context

Dashboard categories are tool-like sections displayed differently from the current toolbox.

Planned categories:

- News: a tool/category for news records.
- Calendar: connected to the existing Calendar tool and must display user-created calendar data already stored by the application.
- Projects: displays the project list and acts as the dashboard equivalent of the Matrix/project selection surface.
- Contacts: displays stored contacts.
- Store: future category for preconfigured tools and documents. It must be represented by the model contract but should not be implemented functionally in the first dashboard milestone.
- Monitor: tracks personal health, progress, and high-level status across personal, financial, artistic, sport, health, or similar dimensions.
- Goals: stores personal goals, such as losing weight, gaining skills, earning more money, improving at sport, gaining muscle mass, or any other user-defined target.

All headers/categories must ultimately be loaded from database-backed records. Base default categories must come from a JSON defaults file expected at `eve/default_values/constants.json` or the canonical path that replaces it if the repository uses a different case or location. This file was not found during the initial local check and must be verified or created during implementation planning.

## Core User Flow

1. The existing toolbox is visible and remains open.
2. The user clicks the Atom tool.
3. The dashboard appears above the project area and replaces the current project view.
4. The dashboard reserves the bottom toolbox band and does not draw behind it.
5. The user clicks the Atom tool again.
6. If no dashboard choice is in progress, the dashboard closes and the current project view returns.
7. If the user clicks a dashboard item, the item opens in the dashboard context. Later milestones will define whether it replaces the project, complements it, or opens a dedicated editor.
8. If the user clicks the `+` area for a category, a new database record is created for that category.
9. The newly created record opens fullscreen inside the dashboard available area, without covering headers or the reserved toolbox band.
10. The user edits, inspects, or completes that record.
11. Clicking the category header beside the `+` item closes the fullscreen record.
12. The record animates back into the dashboard grid and remains stored in the database.

## Visual Requirements

The visual reference is `eVe/R&D/dashboard_design.html`.

Global visual constraints:

- Entire dashboard rendered by Bevy, not DOM or HTML.
- 2D rendering.
- Dark base background, matching the prototype unless later token values override it.
- Horizontal lanes stacked vertically.
- One lateral header per lane.
- Header side depends on user mode:
  - right-handed mode: headers on the right;
  - left-handed mode: headers on the left.
- Dashboard content must never draw behind the toolbox band.
- Dashboard content must never draw under headers or under the active `+` strip.
- Header and cell corners use a configurable corner radius, default `3px`.
- All visual variables must live in a separate design-token/config file, not inline in rendering logic.

Tokenized visual values must include at least:

- background color;
- lane colors;
- active and dimmed header colors;
- header width ratio;
- active header expansion ratio;
- `+` strip width ratio;
- cell margin;
- cell gap;
- cell corner radius, default `3px`;
- header corner radius, default `3px`;
- card shadow color, blur, offset, and opacity;
- header shadow color, size, direction, and opacity;
- focus dim amount;
- scroll ease;
- scroll settle threshold;
- focus animation ease;
- expansion animation duration, default `0.3s`;
- text font family, size, weight, and padding;
- icon sizes;
- toolbox reserved height or runtime toolbox-height reader;
- z/layer ordering values.

## Layout Model

The layout engine must be deterministic and data-driven. It must produce rectangles and derived display data, not perform rendering side effects.

Required layout outputs:

- `dashboard_rect`;
- `table_rect`;
- `toolbox_reserved_rect`;
- `lane_rect`;
- `header_rect`;
- `header_title_rect`;
- `plus_rect`;
- `plus_strip_rect`;
- `scroll_clip_rect`;
- `visible_item_rects`;
- `expanded_cell_rect`;
- `creation_fullscreen_rect`.

Layout rules:

- The dashboard table height is the available canvas height minus the toolbox reserved height.
- Each visible category maps to one lane.
- Lane height is derived from available table height and visible category count.
- Standard cell width equals lane height unless the design-token configuration overrides it.
- Headers are normally one standard cell wide.
- Active header uses 150 percent total width: 100 percent title/header area plus 50 percent `+` area.
- The active `+` area becomes a blank vertical strip across the full table height.
- Scrollable content width excludes the header width and the active `+` strip.
- Every row keeps its own independent horizontal scroll state.
- Variable category counts and item counts must not break the layout.
- Resizing the window/canvas recalculates the full layout.

## Header Behavior

Each category header is a visible tool/category selector.

Normal state:

- Header is visible above scrollable content.
- Header uses the category color.
- Header contains the category icon and label from the external model.
- Header casts a directional shadow toward the cells.

Click behavior:

- Clicking an inactive header activates focus mode for that category.
- Active header expands to 150 percent.
- Other headers become greyed and lower contrast with animation.
- All lanes switch to the active category color.
- All lanes display the active category items, while preserving independent scroll per lane.
- Clicking the active header again exits focus mode if no fullscreen/creation state is active.
- Clicking another header moves focus to that category.
- Clicking a header while a cell is expanded closes the expanded cell with reverse animation.
- Clicking the active header beside a newly created fullscreen item closes and reintegrates the new record.

Shadow rules:

- Headers on the right cast shadow to the left.
- Headers on the left cast shadow to the right.
- The active expanded header temporarily has no projected shadow.
- Header shadow is restored when the header returns to normal.

## Focus Mode

Normal mode:

- Each lane displays records from its own category.
- Each lane uses its own category color.

Focus mode:

- All lanes display records from the selected category.
- All lane backgrounds take the selected category color.
- Selected header remains active and expanded.
- Non-selected headers are dimmed.
- Scroll remains independent per visible lane.
- The `+` strip exists only for the active focused category.

## Plus Zone And Record Creation

The `+` zone is part of the active header expansion.

Visual rules:

- It displays only the `+` symbol.
- It must not display "new" or any equivalent text.
- It occupies the 50 percent added width of the active header.
- It extends visually as a blank full-height vertical strip across the dashboard table.
- It uses the active category color.
- It contains no item.
- Cells cannot overlap it.
- It is hit-tested separately from the header title area.

Functional rules:

- Clicking `+` creates a new database record in the active category.
- The created record immediately opens fullscreen in the dashboard available area.
- The fullscreen item must not cover headers or the toolbox reserved band.
- The fullscreen item must be editable/completable according to the category's editor contract.
- Closing through the header animates the record back into its grid position.
- The record must remain stored in the database.
- If database creation fails, the dashboard must surface an explicit error through the canonical error/reporting path. It must not silently create a local-only fallback item.

## Cells

Cells display records supplied by the external data model.

Visual rules:

- Rectangular cards with configurable `3px` default corner radius.
- Uniform margins and gaps.
- Cells leave the lane color visible behind them.
- Cells have a light configurable shadow.
- Cells can be single-width or double-width according to record metadata/layout.
- Cells must not be cut after scroll snapping settles.
- Cells pass visually behind headers during scroll and never cover them.
- Cells pass visually behind the active `+` strip and never cover it.

Content rules:

- Content comes from the record model.
- No mockup data is embedded in the renderer.
- Icon, label, preview media, metadata, and item span must come from model fields or a category-specific projection adapter.
- The renderer must support missing optional preview media explicitly, without hidden fallback records.

## Scroll Behavior

Each row has independent horizontal overflow.

Required behavior:

- Smooth/inertial drag scroll.
- Mouse wheel support where applicable.
- Touch/pointer drag support.
- Snap at rest to the exact start of an item.
- Snap must support single-width and double-width cells.
- No item may remain partially cut after snap.
- During drag, click activation must be suppressed if movement exceeds the drag threshold.
- The scrollable area is clipped strictly to `scroll_clip_rect`.
- Scroll state is UI runtime state, not canonical business data.
- Scroll values are reset or preserved according to explicit focus and category-switch rules, not incidental render state.

## Cell Expansion

Clicking a non-header, non-plus cell opens it.

Required behavior:

- Expansion duration: configurable, default `0.3s`.
- Animation starts from the cell's real current position.
- The same content projection scales with the cell. No flash, replacement, or alternate renderer path.
- Expanded cell occupies the available dashboard area.
- Expanded cell never covers headers or the active `+` strip.
- Expanded cell never covers the toolbox reserved band.
- Other cells are hidden or covered during expansion.
- Clicking a header closes the expanded cell.
- Closing uses the reverse animation.
- At the end of close, layout/grid is recalculated from live data so no stale empty slot remains.

## Required UI States

The dashboard state machine must model at least:

- `Hidden`;
- `Normal`;
- `FocusCategory`;
- `CellExpanded`;
- `CreationItemFullscreen`;
- `ReturnCreationToGrid`;
- `LeftHanded`;
- `RightHanded`;
- `CategoriesHidden`;
- `Animating`;
- `DatabasePending`;
- `DatabaseError`.

State ownership:

- Durable records and categories belong to the canonical database/Atome data path.
- UI state such as focus, scroll, animation, and current expanded cell belongs to a runtime registry or dashboard UI state owner.
- Bevy ECS state is a projection/runtime acceleration layer only.
- DOM state must not become a source of truth.

## Data And Persistence

The dashboard must be backed by database records.

Category model:

- Categories are loaded from the database.
- Default categories are seeded from a JSON defaults file expected at `eve/default_values/constants.json`, pending path verification.
- Categories include id, label key, icon id, color tokens, ordering, visibility, tool binding, data source binding, and creation policy.
- User changes to category visibility/order must persist through the canonical storage path when the feature supports it.

Item model:

- Items are records owned by their category.
- Items include id, category id, title/label, preview data, metadata, layout span, timestamps, completion/editing state, and category-specific payload.
- Creation must pass through the canonical mutation/database path.
- The dashboard must never create durable records through local-only state.

Category data bindings:

- News: records from the News tool/domain.
- Calendar: records from the existing Calendar tool/domain.
- Projects: project records, equivalent to Matrix/project list data.
- Contacts: contact records from the contact domain.
- Store: model placeholder for future tool/document catalog; no first-milestone implementation.
- Monitor: personal progress and health/status monitoring records.
- Goals: personal objective records.

## Bevy And Architecture Constraints

The dashboard must respect the existing Atome/eVe rules:

- Bevy/WebGPU is the visible rendering route.
- No DOM dashboard UI.
- No HTML rendering for dashboard content.
- No separate visible canvas per category or per item.
- No visible DOM subtree per item.
- The current project surface may be replaced or covered by the dashboard state, but rendering ownership must remain explicit.
- The dashboard renderer must not become canonical business state.
- All durable mutations must pass through the existing command/mutation/database path.
- The dashboard must be integrated through existing tool/menu/runtime ownership instead of adding an isolated click handler that bypasses the Atom tool system.

Expected integration areas to inspect during implementation:

- `eVe/intuition/eVeIntuition.js`;
- `eVe/intuition/runtime/eve_intuition/main_menu_runtime.js`;
- `eVe/intuition/runtime/eve_intuition/main_tool_interaction_runtime.js`;
- `eVe/intuition/tools/core/tool_runtime_bootstrap_defs_b.js`;
- `eVe/domains/rendering/project_scene_runtime.js`;
- `eVe/domains/rendering/bevy_web_renderer_runtime.js`;
- `atome/renderers/bevy-core/`;
- `platforms/web/bevy-renderer/`;
- Calendar, contacts, project/matrix, and database owners documented in `maps/API_MAP.md` and `maps/ARCHITECTURE_MAP.md`.

## Reusable Bevy UI Component Direction

This dashboard should introduce reusable Bevy UI primitives instead of a one-off renderer.

Candidate reusable components:

- `BevyPanelSurface`: bounded interactive surface with reserved safe areas.
- `BevyLaneList`: vertical list of horizontal lanes.
- `BevyLane`: background band, clipping, scroll state, and child item projection.
- `BevyHeaderRail`: left/right fixed headers with directional shadows and focus state.
- `BevyCardGrid`: snap-scrolling card row with single/double spans.
- `BevyCard`: configurable rounded rectangle, shadow, preview, label, icon.
- `BevyPlusStrip`: full-height blank creation strip with category color and plus glyph.
- `BevyFullscreenCardTransition`: shared open/close animation from grid rect to fullscreen rect.
- `BevyUiPicking`: rectangle-based hit testing with drag/click disambiguation.
- `BevyUiTokens`: shared structured tokens for colors, shadows, radii, text metrics, animation, z-order, and spacing.

These components should be placed where they can later support migration of other eVe UI surfaces from DOM/HTML to Bevy. The exact file structure must be chosen after inspecting current Bevy renderer ownership and maps, but a likely direction is a shared Bevy UI layer under the rendering domain or Bevy core, with product-specific dashboard composition kept in eVe.

Separation target:

- generic Bevy UI primitives: product-neutral or reusable;
- eVe dashboard composition: product-specific category bindings, tool behavior, and design tokens;
- data adapters: category/domain-specific record readers and creators;
- action bridge: command/mutation integration.

## Design Token File Requirement

All dashboard visual variables must be placed in a separate structured token/config file.

The token file must not contain business data or mock records. It may contain:

- colors;
- radii;
- shadows;
- dimensions;
- spacing;
- typography;
- animation durations/easing;
- z/layer values;
- default category visual token references.

The record/category defaults file must be separate from design tokens.

## First Milestone Scope

The first implementation milestone should target:

- Atom tool toggles dashboard open/closed.
- Existing toolbox remains visible and open.
- Dashboard reserves toolbox height.
- Categories are loaded dynamically from seeded/default data, not hardcoded renderer mockups.
- Lanes, headers, focus, plus strip, scroll, snap, clipping, and expansion work with real model data.
- `+` creates a category record through the canonical data path or a clearly defined pending integration hook if the category backend is not yet available.
- Creation fullscreen state exists.
- Closing reintegrates the new record into the grid.
- Store category remains present only as a future placeholder unless its backend is defined.
- Visual output matches `eVe/R&D/dashboard_design.html` except for the confirmed changes:
  - no internal bottom toolbar;
  - dashboard reserves space for the existing external toolbox;
  - corner radius defaults to configurable `3px`;
  - all data comes from external models.

## Validation Requirements

Validation must cover:

- dashboard opens and closes from Atom tool;
- toolbox remains visible;
- dashboard does not draw or hit-test behind toolbox reserved band;
- left-handed and right-handed header placement;
- header focus toggle;
- header focus transfer;
- dimming animation;
- plus strip full-height reservation;
- independent row scroll;
- snap for single and double cells;
- clipping prevents cells under headers and plus strip;
- click versus drag disambiguation;
- cell expansion from real position;
- reverse close animation;
- new item creation fullscreen;
- new item reintegration into grid;
- data-driven category count and item count;
- no DOM dashboard item tree;
- no extra visible canvas per item/category;
- no durable mutation outside the canonical path.

## Open Implementation Questions

These must be answered before coding:

- What is the canonical location and schema for `eve/default_values/constants.json`?
- Should category defaults be stored in lowercase `eve/` or existing uppercase `eVe/`?
- Which database type/schema owns News, Monitor, Goals, and Store records?
- Which existing Calendar API should the dashboard consume for user-created events?
- Which Contacts API should the dashboard consume for contact records?
- Which Matrix/project API is the canonical source for project cards?
- What editor surface is shown inside fullscreen creation for each category?
- Does clicking an existing item open the same fullscreen editor as creation, or a read-only detail first?
- How should dashboard state be restored after app reload?
- Should dashboard open state be transient runtime state or user preference?
- What exact toolbox height source should the dashboard use at runtime?
- Which Bevy layer owns generic reusable UI primitives versus eVe-specific dashboard composition?
