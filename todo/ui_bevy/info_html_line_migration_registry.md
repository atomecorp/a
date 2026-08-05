# Infos HTML line migration registry

Date: 2026-08-04

This is the exhaustive retirement ledger for the former Infos HTML panel. The
listed ranges partition every historical source line exactly once: **3,033 / 3,033
lines**. `M` means migrated to the Bevy product package, `R` means replaced by an
existing canonical runtime contract, and `D` means deleted because the behavior
was DOM-authoritative, duplicated, unsafe, or obsolete. Blank lines and comments
are deliberately included in their surrounding range; no source line is omitted.

## `eVe/intuition/tools/infos.js` — 452 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–64 | R | Imports collapse to the Bevy bridge and canonical state/selection/runtime owners. |
| 65–88 | M | HTML dialog becomes `infoSurface` on `bevy_panel_runtime`. |
| 89–174 | M/R | Pick is replaced by live canonical selection; copy becomes a Bevy action using the shared clipboard writer. |
| 175–247 | M | Detail header/panel become Bevy accordion, preview, table, and typed property rows. |
| 248–293 | M/R | Selection/project/all accordions become Bevy hierarchical lists; project rows reuse canonical checkboxes and route handle drags to existing `ui.duplicate`. |
| 294–327 | D | DOM handle registry and eager DOM event binding are removed. |
| 328–335 | M | Open routes through `openBevyPanelSurface('info')`. |
| 336–394 | R | Tool latch state is owned by the common panel/tool runtimes. |
| 395–421 | M/R | Close routes through the Bevy lifecycle, which releases listeners/editor/derived state. |
| 422–428 | M | Public open/close compatibility globals remain in the thin bridge; DOM mutation globals are removed. |
| 429–452 | D/R | DOM-ready bootstrap and polling startup are replaced by the surface `onOpen` lifecycle. |

## `eVe/intuition/tools/infos_state.js` — 170 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–23 | M/D | Only derived panel state remains in `bevy_panel_info_runtime`; timers and DOM binding flags disappear. |
| 24–26 | D/R | HTML multi-value and browser drag MIME constants are retired; disposable selection/drag state is owned by `bevy_panel_info_runtime` and `ui.duplicate`. |
| 27–52 | R | Reserved envelope fields are enforced by the Atome contract; the model retains a read-only filter. |
| 53–69 | R | Immutable envelope presentation moves to `immutableRows`. |
| 70–70 | D | Envelope select editing is removed as unsafe. |
| 71–83 | R | Bundled media resolution stays with the media/rendering runtimes, not Infos. |
| 84–111 | R | Numeric/style parsing stays in canonical Atome mutation/rendering contracts. |
| 112–123 | R | Style aliases stay in rendering normalization, not the panel. |
| 124–124 | D | HTML grid columns are replaced by fluid Bevy layout. |
| 125–129 | R | Tool identity stays in the common panel definition and tool gateway. |
| 130–165 | D | Entire DOM handle registry is removed. |
| 166–170 | D | Legacy state exports are removed with the module. |

## `eVe/intuition/tools/infos_model_a.js` — 422 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–18 | R | Dependencies reduce to shared Atome record helpers and canonical state readers. |
| 19–32 | M | Selection normalization is represented by selected IDs in derived runtime state. |
| 33–39 | R | Current selection comes from `selection.js`. |
| 40–46 | D | Separate list-selection authority is removed. |
| 47–53 | R | Visibility comes from `isBevyPanelSurfaceOpen`. |
| 54–63 | R | Adole access remains at domain boundaries, not the panel model. |
| 64–85 | R | Runtime-mode detection remains in canonical backend/media runtimes. |
| 86–95 | R | Tauri base URL ownership remains in media/backend runtime. |
| 96–103 | R | Fastify base URL ownership remains in backend runtime. |
| 104–107 | R | Static asset normalization remains in asset runtime. |
| 108–111 | R | Bundled asset resolution remains in asset runtime. |
| 112–124 | R | Direct-media classification remains in media contracts. |
| 125–158 | R | Authentication token resolution remains in auth/backend runtime. |
| 159–191 | R | Media URL resolution remains in the shared media renderer path. |
| 192–205 | M | State records normalize in `normalizeInfoRecord`. |
| 206–215 | M | Selected-record misses use canonical `getStateCurrent`. |
| 216–226 | M | All records use canonical `listStateCurrent`. |
| 227–239 | R | Current project ID is read from the existing project runtime state. |
| 240–245 | D | UUID display special-casing is unnecessary. |
| 246–257 | R | Property extraction reuses `atome_record_utils`. |
| 258–281 | R/M | Record normalization reuses the shared helper plus Infos envelope accessors. |
| 282–298 | D | Backend-list arbitration is owned by the canonical state reader. |
| 299–309 | M | Parent resolution becomes `recordParentId`. |
| 310–317 | M | Project resolution becomes `recordProjectId`. |
| 318–337 | M | Project membership becomes ancestry-based `projectRecords`. |
| 338–345 | M | Titles become shared `formatAtomeLabel` plus short ID. |
| 346–351 | M | Short IDs remain presentation-only. |
| 352–366 | M | Safe value formatting becomes `valueText`. |
| 367–373 | M | Key/value presentation becomes the shared Bevy property table. |
| 374–402 | R | Clipboard writes use `system_writer.writeTextToClipboard`; textarea fallback is deleted. |
| 403–419 | M | Copy payload becomes canonical selection JSON in `copyPayload`. |
| 420–422 | D | Legacy exports disappear with the module. |

## `eVe/intuition/tools/infos_model_b.js` — 346 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–29 | R | Dependencies collapse to shared record/state/rendering contracts. |
| 30–42 | M | Copy summaries are covered by `copyPayload`. |
| 43–46 | M | Copy record filtering uses the selected canonical records. |
| 47–50 | M | Summary filtering is folded into the copy payload. |
| 51–91 | M | Multi-selection JSON construction becomes `copyPayload`. |
| 92–104 | M | Selected copy records are the runtime’s derived `selectedRecords`. |
| 105–111 | M | Field labels are canonical property keys in the property grid. |
| 112–135 | M | Typed parsing becomes `parseEditedValue`. |
| 136–143 | R | State response extraction is owned by `atome_commit_response`. |
| 144–161 | D | Panel record cache mutation is removed. |
| 162–168 | M | Numeric classification becomes typed property metadata. |
| 169–176 | R | Style unit formatting remains in the canonical renderer/input contracts. |
| 177–183 | D | CSS escaping is irrelevant to the Bevy tree. |
| 184–195 | D | Atome DOM lookup is removed from Infos. |
| 196–213 | D/R | Authoritative project DOM lookup is removed; drag release reads only disposable shared-canvas geometry before invoking `ui.duplicate`. |
| 214–224 | D/R | Browser drag payload parsing is removed; BevyUI pointer intents carry selected canonical IDs without `DataTransfer`. |
| 225–249 | D/R | Local project assignment mutation is removed; `ui.duplicate` emits typed relationship envelopes through one `Atome.commitBatch`. |
| 250–269 | D/R | `ensureAtomeRendered` is replaced by shared WebGPU scene invalidation/preview. |
| 270–281 | D | Media DOM target lookup is removed. |
| 282–292 | D | Direct child removal is removed. |
| 293–312 | D | Direct text DOM creation is removed. |
| 313–343 | R | Authenticated media fetch remains in the shared media runtime. |
| 344–346 | D | Legacy exports disappear with the module. |

## `eVe/intuition/tools/infos_model_c.js` — 355 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–33 | R | Dependencies collapse to canonical mutation/rendering contracts. |
| 34–74 | D/R | Direct media child creation is replaced by the shared WebGPU compositor. |
| 75–104 | D | Direct DOM type mutation is removed; type is immutable in Infos. |
| 105–117 | D | Parent DOM container lookup is removed. |
| 118–126 | D | Project layer DOM lookup is removed. |
| 127–135 | D | DOM reparenting is removed. |
| 136–263 | D/R | Pre-commit local particle/DOM mutation is removed; edits use `commitBatch` then canonical refresh. |
| 264–290 | D | Projection-notification update wrapper is removed. |
| 291–292 | D | Legacy particle alias is removed. |
| 293–322 | D/R | Browser drop assignment is replaced by existing `ui.duplicate` with explicit project/parent envelopes and selection-only relationship remapping. |
| 323–352 | D/R | Project DOM drop listeners are removed; the BevyUI drag handle owns pointer press/drag/release/cancel and rejects blocked surfaces. |
| 353–355 | D | Legacy exports disappear with the module. |

## `eVe/intuition/tools/infos_render_a.js` — 334 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–33 | R | HTML design imports are replaced by shared Bevy component builders. |
| 34–44 | M | Lists initialize from `readState`/`buildContent`. |
| 45–53 | R/D | Picker mode is replaced by always-live canonical canvas selection. |
| 54–59 | D | Manual DOM clearing is replaced by disposable Bevy tree updates. |
| 60–64 | M | Safe IDs remain local Bevy node IDs. |
| 65–66 | M | Row IDs are generated in the hierarchical list builder. |
| 67–169 | M/R | HTML rows become shared hierarchical selectable-list nodes with the existing checkbox composition and render-contract-gated `drag_handle`. |
| 170–190 | R | Row updates occur through Bevy tree refresh from canonical state. |
| 191–206 | M | List rendering becomes hierarchy composition. |
| 207–235 | M | Selection records derive from canonical selected IDs. |
| 236–244 | R | Selection count/checks update directly from the selection event; only selected records absent from the snapshot are fetched. |
| 245–253 | M | Counts are rendered in accordion titles and selection summary. |
| 254–282 | M | Selection status becomes `selectionSummaryNode`. |
| 283–294 | R | Selected styling comes from the shared list component. |
| 295–304 | R | Editor activity is owned by the hidden Bevy text-input session. |
| 305–331 | R | Option normalization remains in Squirrel component contracts. |
| 332–334 | D | Legacy exports disappear with the module. |

## `eVe/intuition/tools/infos_render_b.js` — 403 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–48 | R | HTML controls are replaced by Bevy property compositions. |
| 49–61 | D/R | Type options are removed because envelope type is read-only. |
| 62–76 | D/R | Parent options are removed because relationships need a canonical command. |
| 77–85 | D/R | Project options are removed for the same reason. |
| 86–103 | R | Media values are existing properties and use the typed property editor. |
| 104–195 | M/D | Property commit becomes canonical `commitBatch`; local cache/DOM mutation and swallowed failures are removed. |
| 196–214 | M | Field values derive from canonical record properties. |
| 215–231 | M | Multi-value detection becomes common typed property metadata. |
| 232–400 | M | HTML editors become Bevy text/number/switch compositions; complex values are passive. |
| 401–403 | D | Legacy exports disappear with the module. |

## `eVe/intuition/tools/infos_render_c.js` — 499 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–57 | R | DOM/event dependencies collapse to canonical event bus, selection, and Bevy builders. |
| 58–76 | M | Immutable summary becomes a Bevy property table. |
| 77–89 | M | Detail rendering becomes pure Bevy composition. |
| 90–94 | D | Panel cache lookup is removed. |
| 95–149 | M/R | Detail refresh reads canonical state and drives derived Bevy state. |
| 150–161 | R | Timer scheduling is replaced by event-driven refresh. |
| 162–216 | M | All/project refresh becomes a shared scroll-driven `listStateCurrent` virtual window of 200, replacing the active window without accumulating rows or exposing page buttons. |
| 217–225 | R | List timer scheduling is removed in favor of lifecycle refresh. |
| 226–234 | D | 400 ms detail polling is removed. |
| 235–240 | D | Polling cleanup disappears with polling. |
| 241–259 | R | Row selection uses `applySelectionIntent`; checkbox rail gestures and held row drag route through the new canonical Bevy intents. |
| 260–268 | R | Project selection synchronization stays in `selection.js`. |
| 269–286 | M/R | Selection application becomes one canonical selection intent. |
| 287–299 | R | Clearing remains owned by the selection runtime. |
| 300–316 | D | DOM target-to-Atome resolution is removed. |
| 317–330 | D/R | Capture-phase HTML picker is replaced by normal canvas selection. |
| 331–341 | D | Picker toggle state is removed. |
| 342–356 | M | Copy feedback becomes Bevy notice state. |
| 357–367 | M | Copy action uses canonical selected records and shared clipboard writer. |
| 368–390 | D/R | Native control listeners are replaced by Bevy intent handlers. |
| 391–426 | M | Selection listener is lifecycle-owned and released on close. |
| 427–496 | M | `atome:changed` listener becomes lifecycle-owned canonical refresh, without polling. |
| 497–499 | D | Legacy exports disappear with the module. |

## `eVe/intuition/runtime/info_panel_sync_runtime.js` — 52 lines

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–10 | D/R | Projection callback discovery is removed; Infos subscribes to canonical events. |
| 11–27 | D/R | Gesture-position DOM notifications are unnecessary; final commits emit `atome:changed`. |
| 28–47 | D/R | Gesture-resize DOM notifications are unnecessary for the same reason. |
| 48–52 | D | Legacy sync exports and module are removed. |

## Ancillary HTML coupling outside the 3,033-line component

- `panel_definitions.js`: `eve_info_dialog` becomes `eve_bevy_panel_info`.
- `main_tool_latched_state_runtime.js`: Info visibility uses
  `isBevyPanelSurfaceOpen('info')`, not DOM computed style.
- `tool_genesis*` and `atome_host_registry_runtime.js`: all
  `notifyInfoPanelPosition` / `notifyInfoPanelResize` parameters are removed.
- The retained `tools/infos.js` file is a new 23-line compatibility bridge and
  is not part of the retired 452-line source counted above.

## Coverage invariant

The persistent migration contract parses every table above and asserts that,
for each historical file, ranges start at line 1, are contiguous and
non-overlapping, end at the declared line count, and sum to 3,033 lines.
