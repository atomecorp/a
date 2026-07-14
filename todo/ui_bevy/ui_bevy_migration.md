# Product UI Bevy Migration And DOM Retirement

Status: Active architecture and implementation backlog.

## Objective

Move every visible product UI surface to the shared Bevy/WebGPU UI route, then delete its former HTML/DOM implementation and all now-unused view-layer code. This is a convergence and deletion program, not a parallel rewrite.

The target is one product UI contract shared by Web, Tauri, and iOS:

```text
Canonical Atome state + Command Bus/API/MCP
  -> shared Bevy UI scene and interaction contract
  -> Web canvas / native presentable surface
```

Web may retain only the minimal application shell, one canvas per active rendering zone, and the documented hidden text/accessibility/IME service. These exceptions are non-visible, non-authoritative, and must not host product menus, panels, dashboards, timelines, or map UI.

## Locked rules

- Bevy/WebGPU is the only visible product renderer.
- Do not retain HTML/DOM and Bevy implementations of the same migrated surface.
- Do not introduce a compatibility renderer, embedded web map, or a platform-local alternate UI.
- All commands remain exposed through the canonical API and MCP surface; UI is never the sole owner of an action.
- Atome state, business state, persistence, and location data remain outside the view.
- Reuse the canonical Atome/Squirrel control and token contracts. Promote missing primitives once; do not recreate them per surface.
- Delete unused DOM factories, selectors, CSS/token copies, listeners, resize observers, browser-only view state, tests, and imports after each migration is validated.

## Mandatory foundation gate

The dashboard and the direct main-menu tools already render through BevyUI. This gate completes only their missing shared primitives and interaction parity; it must not recreate either migrated surface. Palette navigation, hold-to-palette behavior, and deletion of the legacy menu bridge remain the dedicated next migration step.

Before migrating a visible surface, verify on the real target canvas:

- pointer press/release/move/drag, touch, wheel, focus, clipping, scroll, z-order, resize, and lifecycle disposal;
- group opacity, shadows, image clipping/radius, font loading/weight/alignment, text alpha, and text measurement required by the surface;
- canonical hidden text/IME/accessibility service for editable text; no visible HTML editor;
- a shared event bridge with typed actions, coordinates, and modifiers rather than DOM-specific handlers;
- one platform contract for Web, Tauri, and iOS. Native presentation may differ only at the host boundary.

Missing primitives must be implemented in the shared Bevy UI owner before a product surface depends on them.

## Migration order and acceptance criteria

### 1. Shared system controls and UI runtime

- Complete canonical Button, Input, Toggle, Select, ToolSlider, focus, text-entry, scroll, gesture, and lifecycle ownership.
- Make `eVe/elements/system_ui_tokens.js` the single shared product visual token source until an existing canonical replacement is formally adopted.
- Remove duplicate control factories and local visual contracts after consumers migrate.
- Prove one canonical control contract is used by Flower, menus, dashboard, panels, calendar, Molecule, and map search.

### 2. Flower, toolbox, and menus

- Migrate MainToolBox, contextual Flower, palettes, toolboxes, grips, tool states, and all pointer/touch/long-press interactions to Bevy.
- Preserve deterministic tool actions, handedness, drag threshold, latch/momentary behavior, and API/MCP parity.
- Delete `eveGoeyMenuApi`, `new_menu`, `new_menu_v2` aliases/bridges, DOM menu factories, and browser-specific menu state only when no canonical consumer remains.
- Validate desktop pointer/trackpad, touch, iOS external pointer, and keyboard-independent operation.

#### Main bottom menu interaction contract

- The canonical tool record must explicitly carry its children and interaction metadata. Existing semantics such as 'isExpandable', 'children', 'latch', 'canLongPress', 'longPressAction', 'longPressDelayMs', and 'openPaletteOnLongPress' must be represented by the Bevy-owned model, not inferred from a visual widget or retained in a legacy runtime.
- A leaf tool invokes its declared one-shot action through the canonical command path. A palette tool is a navigation item: it opens or toggles its child palette without silently invoking a child action.
- A tool may declare a distinct hold action, or declare that a hold opens its palette. The delay and movement cancellation threshold are canonical interaction parameters; a press that becomes a drag, scroll, or pointer cancellation must not trigger a hold action.
- Stateful and latch tools retain their declared state semantics. The visible state is a projection of canonical state and cannot become an independent browser-side source of truth.
- Bevy must support each declared behavior directly. The current flat main-menu projection, inert palette dismissal path, and special legacy-menu item are transitional defects, not accepted product behavior. Remove the legacy item and its bridge once the complete Bevy interaction contract is live.

#### Flower press-and-hold navigation contract

- A qualified long press opens the Flower and keeps the initiating pointer session active. A stationary release opens no tool; it leaves the Flower available as a contextual menu.
- Once the pointer has travelled past the configured radial-selection threshold, the currently targeted item is evaluated continuously while the press is held.
- Hovering a palette item while holding opens that palette immediately. Hovering the visible Back item returns immediately by one level; at the root, Back closes the Flower. Returning through Back therefore restores the originating menu level without activating an unrelated tool.
- Hovering a leaf only previews/selects it. Releasing over that leaf activates its canonical action exactly once. Releasing after navigating through a palette or Back must not also fire a leaf action.
- This gesture must use Bevy hit testing and the canonical command path. It must not depend on synthetic DOM events, DOM menu state, or a legacy Flower fallback. Touch and pointer cancellation must leave no stuck selection or tool state.
- Automated interaction coverage must exercise: stationary hold, hold-to-palette, hold-to-Back, leaf activation on release, drag cancellation, and pointer cancellation.

### Current implementation status

- The Flower hold contract is implemented by `eVe/intuition/ribbon/bevy_ui_flower_runtime.js` and `bevy_ui_flower_model.js` on the shared BevyUI canvas tree. The runtime owns the held pointer session, radial hit testing, palette/Back navigation, leaf preview, single release activation, and cancellation cleanup.
- The visible DOM Flower renderer has been retired. The remaining `new_menu_v2` alias is not a Flower renderer and must remain until its verified menu consumers are migrated.

### 3. Dashboard

- Complete the Bevy UI parity gaps identified in `todo/ui_bevy/dashboard_bevy_ui_parity_matrix.md`.
- Migrate the dashboard as a data-driven Bevy scene with a bounded toolbox reservation, scroll, focus, editing, and explicit resource teardown.
- Delete any dashboard HTML prototype/runtime path after canvas validation.

### 4. Panels, dialogs, and Molecule chrome

- Replace the visible `createEveDialog` panel chrome, panel body, footer, tool bands, resize/drag affordances, and panel-local DOM state with the shared Bevy UI scene.
- Migrate simple panels first, then calendar, Finder, communication, detail, layer, and Molecule.
- Migrate the complete Molecule editor chrome and panel interaction to Bevy; its timeline content and its chrome must not use separate visible renderers.
- Delete panel DOM factories, CSS/layout observers, DOM geometry reads, and legacy panel lifecycle code after each panel family is migrated.

### 5. Calendar

- Perform the dedicated calendar migration and canonical-data audit in `todo/eve_features/calendar_todos.md` before implementing the Bevy calendar panel.
- Preserve calendar data, recurrence, alarms, todos, sharing, Webcal/ICS, timezones, and API/MCP ownership.
- Implement month/week/day/agenda layout, range virtualization, event hit-testing, drag/reschedule, editing through the hidden text service, and timezone-safe rendering in Bevy.
- Remove `calendar_panel_dom.js`, DOM form construction, and DOM layout/state only after equivalent Bevy interactions and native-target validation pass.

### 6. Map and location search

- Complete the dedicated map/location audit and migration in `todo/eve_features/map_localization.md` before implementation.
- Render map content, markers, result list, attribution, and interaction through Bevy. Do not embed Leaflet or a provider DOM widget inside a Bevy panel.
- Keep geocoding, permissions, consent, provider requests, caching, rate limits, and canonical saved locations outside the renderer.
- Delete the Leaflet/DOM map route only after the selected provider and all target runtimes are validated.

### 7. Browser layer retirement and native presentation

- Inventory every remaining visible Intuition/View/DOM surface, owner, import, event listener, CSS rule, and test.
- Delete each obsolete layer when its Bevy replacement is proven; no dormant copy, hidden fallback, or transition flag remains.
- Verify Tauri and iOS use the same scene/diff/interaction contract. A native presenter may be enabled only once it is genuinely presentable; it must not duplicate product UI logic.
- Keep browser shell and hidden text/accessibility services minimal and documented in maps.

## Definition of done

- No visible product menu, Flower, dashboard, panel, calendar, Molecule chrome, or map is rendered by HTML/DOM.
- No parallel DOM/Bevy route, legacy bridge, or browser-only UI authority remains for migrated surfaces.
- All actions preserve API/MCP parity and canonical mutation ownership.
- The shared scene works on Web, Tauri, and iOS with explicit typed errors for unavailable platform capabilities.
- Tests prove DOM teardown cannot remove or alter canonical state, and resource disposal leaves no retained listeners, timers, textures, workers, or hidden visible UI.
- Maps and architecture documentation record the final owners and permitted minimal browser exceptions.
