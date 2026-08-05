# Finder HTML line migration registry

Date: 2026-08-05

This is the exhaustive retirement ledger for the former Finder HTML panel. The
listed ranges partition every historical source line exactly once:
**3,035 / 3,035 lines**. `M` means migrated to the Bevy product package, `R`
means replaced by an existing canonical runtime contract, and `D` means deleted
because the behavior was DOM-authoritative, duplicated, unsafe, or obsolete.
Blank lines and comments are deliberately included in their surrounding range;
no source line is omitted.

Two dispositions in this ledger deserve their headline up front:

- **The hidden search row is deleted, not migrated.** `finder.js:121-165` built a
  row with `display:none`, `height:0` and `overflow:hidden`. Its input was never
  reachable: it only carried `finderState.query`, written from outside by
  `quickSearchFinder` and `setScope`. The Bevy panel composes no search field.
- **The `place` scope and `map.js` are deleted with the route.** The Leaflet /
  OpenStreetMap / Nominatim map stays blocked by its provider, privacy, cost and
  cross-platform contract, and Finder may not keep a parallel HTML route. The map
  returns later as its own feature package.

Two legacy modules are **not deleted** at retirement: `finder_record_model.js`
and `finder_record_projection.js` are already renderer-neutral and are consumed
directly by the Bevy package. Their rows below record that reuse, and only the
single DOM-bound helper inside them is retired.

## `eVe/intuition/tools/finder.js` — 347 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–40 | R | Imports collapse to the Bevy bridge, `bevy_panel_finder_runtime` and the canonical event bus. |
| 41–66 | M | The `createEveDialog` shell becomes `finderSurface` on `bevy_panel_runtime`; close routes through the shared footer and the same `state.off` gateway call. |
| 67–120 | M | The scope toggle-button factory becomes the validated shared scope chips. |
| 121–165 | **D** | The permanently hidden search row, its `search.svg` icon, its `createEveInput` and its unreachable `onInput` handler are removed. The query/name mirroring it contained already exists in `quickSearchFinder` and `setScope`. |
| 166–214 | M | The scope row becomes `scopeChipGroupNode`; `place` is dropped with the map. |
| 215–222 | D | The `place` idle status text is removed with the scope. |
| 223–276 | M | The results section/status/list containers become the Bevy results column and the localized `N results` status. |
| 277–287 | M | The five header labels become the shared sortable header's scope-driven column set. |
| 288–324 | M/R | Header pointer handlers and the 420 ms type long press become closed sortable-header intents routed by `bevy_panel_finder_runtime`. |
| 325–341 | M | Filters construction and toggle move to the Bevy accordion and its `finder.filters.toggle` intent. |
| 342–347 | R | Module-scope side effects are replaced by the surface `onOpen`/`onClose` lifecycle. |

## `eVe/intuition/tools/map.js` — 341 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–341 | **D** | The entire Leaflet map, OpenStreetMap tile layer, Nominatim geocoding, attribution guard, resize observers and `window.__eveMap` bridge are deleted with the `place` scope. Nothing is migrated: the map has no approved provider, privacy, cost or cross-platform contract, and it hijacked the Finder results list and status nodes. It returns only as its own feature package. |

## `eVe/intuition/tools/finder_state.js` — 98 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–15 | R | Module header and long-press constants move to the `sortableHeader` token group and the shared gesture owner. |
| 16–25 | M | `CONDITIONS` becomes the localized `conditionOptions()` in `bevy_panel_finder_runtime`. |
| 26–32 | M/D | `SCOPE_OPTIONS` becomes `scopeOptions()`; the `place` entry is deleted. |
| 33–39 | M | `ORDER_COLUMNS` is superseded by `columnsForScope()` in `bevy_panel_finder_model`. |
| 40–72 | M/D | The mutable `finderState` becomes the runtime's disposable state; DOM timers, in-flight flags and the tools divergence signatures are dropped. |
| 73–93 | **D** | The `finderEls` DOM handle registry has no Bevy equivalent. |
| 94–98 | R | `isPanelVisible` is replaced by the shared panel lifecycle. |

## `eVe/intuition/tools/finder_view.js` — 384 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–26 | R | Imports collapse to the Bevy model and view. |
| 27–70 | M | `applySort` becomes the pure `sortRecords()` with its readers table; the null-sinking and locale-collation behaviour is preserved verbatim. |
| 71–151 | M | `runFilter`/`scheduleFilter` become the pure `filterRecords()`/`projectRecords()`; the tool-type alias, the touched-field rule and silent dropping of incomplete rows are preserved. |
| 152–159 | R | The debounce timer is replaced by the panel refresh cycle. |
| 160–186 | M | `applyHeaderLayout` becomes `columnsForScope()`; per-scope labels and widths are data, not DOM mutation. |
| 187–213 | M | `updateHeaderTint` becomes `columnForSortKey()` plus the header's accent token. |
| 214–242 | M | `applyHeaderSort` becomes `sortKeyForColumn()` plus the shared `nextSortState` toggle rule. |
| 243–257 | M | `openTypeHeaderFilter` becomes the `finder.header.long_press` intent. |
| 258–291 | D | Header/status visibility toggling and DOM re-parenting disappear with the DOM. |
| 292–384 | M | `renderResults` becomes `resultsSection`/`resultRow` in `bevy_panel_finder_view`; the 200-row cap, the people masking and the selection-still-visible reset are preserved. |

## `eVe/intuition/tools/finder_controller.js` — 241 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–33 | R | Imports collapse to the Bevy bridge. |
| 34–58 | M | `setFinderContext` becomes `applyToolContext`/`releaseScopeLock`; the matrix project-scope lock is preserved. |
| 59–78 | M/R | Open/close route through `openBevyPanelSurface`/`closeBevyPanelSurface`; the inline-close call is preserved in the bridge. |
| 79–120 | M/D | `refresh_finder_projection` becomes `applyToolContext`; its `place`/map branches are deleted. |
| 121–166 | M/D | `quickSearchFinder` is preserved in the bridge; its `place`/map branches are deleted. |
| 167–214 | M/R | `resetFinderState` becomes the surface `onClose` reset; map deactivation disappears. |
| 215–229 | R | Event-bus rebinding is owned by the surface `onOpen`. |
| 230–236 | M | `window.open_finder_panel`, `window.close_finder_panel` and `window.__eveFinder` are preserved verbatim by the bridge — the inline finder, the matrix runtime and the tool gateway depend on them. |
| 237–241 | M | The `matrix:context` subscription moves to the bridge. |

## `eVe/intuition/tools/finder_refresh.js` — 262 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–29 | R | Imports move to `bevy_panel_finder_data`, which reuses the same canonical owners. |
| 30–71 | M | The project/tools/local branches become `loadProjectRecords()` and `loadScopeRecords()`; `pickAuthoritativeProjects` and `resolveProjectMeta` stay canonical. |
| 72–79 | M/D | Property-option rebuilding is kept; pushing options into DOM `<select>` nodes is deleted. |
| 80–87 | R | The in-flight guard becomes the runtime's load-revision race guard. |
| 88–142 | M | `applyPeopleVisibilityFilter` becomes `applyPeopleVisibility()` with the same accepted-and-manual private rule and own-record exception. |
| 143–172 | M | `enrichPeopleRecords` keeps its 60-lookup cap and only re-projects when a field actually changed. |
| 173–246 | M | The directory/tauri/fastify merge, the `ensureFastifyToken` retry and the cache concat become `loadPeopleDirectory()`. |
| 247–262 | R | `bindEventBus` becomes the surface `onOpen` subscriptions to `atome:changed` and `snapshot:created`. |

## `eVe/intuition/tools/finder_filters.js` — 264 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–34 | R | Imports collapse to the shared accordion, select, input and action-button builders. |
| 35–92 | M | The Name and Type rows become `filterRow()` on the shared editable text input. |
| 93–124 | M | The `+` control is preserved but **re-anchored below the last custom row** instead of above the stack. |
| 125–188 | M | The custom row becomes `customFilterRow()`; the property placeholder moves from an empty `<option>` to the `FILTER_PROPERTY_NONE` sentinel the shared Select contract accepts, and the hidden `max` input keeps its per-row `between` reveal. |
| 189–198 | M | Row registration becomes the runtime's `state.filters` array; a **per-row delete control** is added at product-owner request. |
| 199–264 | M | The `Filtre` toggle becomes the accordion header plus its `finder.filters.toggle` intent, with its active state on the shared action button. |

## `eVe/intuition/tools/finder_row.js` — 173 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–16 | R | Imports collapse to the shared drag protocol and the canonical selection owner. |
| 17–27 | M | `applyRowSelectionState` becomes the row's `selected` paint in the Bevy view. |
| 28–72 | M | `bindFinderRowDrag` becomes the `finder.row.drag_*` lifecycle. The HTML5 `dataTransfer` handshake is replaced by the shared pointer drag owner, but the payload stays `buildFinderDragPayload` and the shared `FINDER_DROP_MIME` in `shared/tool_drag.js`: no second MIME, no forked protocol. |
| 73–118 | M/R | `selectFinderRecord` routes through `applySelectionIntent`. |
| 119–173 | M | `bindNameLongPressEdit` becomes the `finder.row.rename` intent committing one canonical `commitBatch`; an unchanged name commits nothing. |

## `eVe/intuition/tools/finder_data_sources.js` — 196 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–30 | **Retained** | `getAdoleApi`, `resolveCurrentUserId` and the registry resolver are DOM-free and are consumed directly by `bevy_panel_finder_data`. |
| 31–140 | **Retained** | The tool-registry divergence diagnostics and self-heal keep their canonical owner untouched. |
| 141–196 | **Retained** | `loadToolRecordsFromDatabase` remains the canonical tools-scope loader. |

## `eVe/intuition/tools/finder_record_model.js` — 344 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–344 | **Retained** | The module contains zero DOM references and is consumed as-is by the Bevy model for normalization, timestamps, selection keys, date formatting and user-record merging. Nothing is rewritten. |

## `eVe/intuition/tools/finder_record_projection.js` — 385 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–140 | **Retained** | Tool-record predicates, dedupe and registry normalization are pure and reused. |
| 141–160 | **D** | `setSelectOptions` is the module's single DOM touch (`document.createElement('option')`); the shared Bevy Select replaces it. |
| 161–385 | **Retained** | Comparators, `matchCondition`, property-option building, drag payload and local rename projection are pure and reused. |

## Shell assets that retire with the map

`map.js` is the **only** consumer of Leaflet in the whole eVe tree, verified by
source search. Once it is deleted, the application shell still loads the library
for nothing. Real-canvas confirmation on 2026-08-05: `window.__eveMap` is already
`undefined` on the migrated route, while `window.L` is still an object, so the
library is loaded and unused.

| Asset | Size | Disposition |
|---|---:|---|
| `atome/src/index.html:16` — `<link rel="stylesheet" href="js/leaflet.min.css">` | — | **D** with the map |
| `atome/src/index.html:22` — `<script defer src="js/leaflet.min.js">` | — | **D** with the map |
| `atome/src/js/leaflet.min.js` | 144 KB | **D** with the map |
| `atome/src/js/leaflet.js` | 144 KB | **D** with the map |
| `atome/src/js/leaflet.min.css` | 11 KB | **D** with the map |

That is ~299 KB of shell payload removed from every boot. If the map feature
package is approved later, it must reintroduce its provider through the approved
contract rather than by restoring these tags.

## Coverage

| File | Lines | Migrated/Replaced | Deleted | Retained |
|---|---:|---:|---:|---:|
| `finder.js` | 347 | 302 | 45 | 0 |
| `map.js` | 341 | 0 | 341 | 0 |
| `finder_state.js` | 98 | 77 | 21 | 0 |
| `finder_view.js` | 384 | 350 | 34 | 0 |
| `finder_controller.js` | 241 | 241 | 0 | 0 |
| `finder_refresh.js` | 262 | 262 | 0 | 0 |
| `finder_filters.js` | 264 | 264 | 0 | 0 |
| `finder_row.js` | 173 | 173 | 0 | 0 |
| `finder_data_sources.js` | 196 | 0 | 0 | 196 |
| `finder_record_model.js` | 344 | 0 | 0 | 344 |
| `finder_record_projection.js` | 385 | 0 | 20 | 365 |
| **Total** | **3,035** | **1,669** | **461** | **905** |

Every range above is contiguous and non-overlapping, and the per-file totals sum
to the historical line count of each file. A persistent contract enforces this
partition so no retired line can silently return.

## Deletion gate

No file in this ledger may be deleted until the Finder panel has explicit
product-owner approval on the real canvas. At that point the deletions are
`finder.js`'s legacy body, `map.js`, `finder_state.js`, `finder_view.js`,
`finder_controller.js`, `finder_refresh.js`, `finder_filters.js`,
`finder_row.js`, and `setSelectOptions` inside `finder_record_projection.js`,
plus their imports, styles, listeners and obsolete tests. `finder_data_sources.js`,
`finder_record_model.js` and the remainder of `finder_record_projection.js`
survive as canonical owners of the Bevy package.
