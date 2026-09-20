# Context and menu system for atome / eVe — audit, target specification, JSON architecture, implementation plan

Date: 2026-09-20
Status: Analysis and plan only. No production code was modified by this document.
Scope: usage modes, activities, mastery levels, Mystic, right sidebar contextual menu, Flower retirement.
Reading contract: every claim below is tagged `[CODE]` (verified in the repository), `[RULE]` (required by the
request), `[RECOMMENDATION]` (proposed, not yet decided), or `[TO VALIDATE]` (cannot be settled from the sources).
File references include line numbers verified on 2026-09-20 at the current HEAD of this checkout.

---

## 1. Understanding summary

### 1.1 The five independent dimensions

| Dimension | Nature | Current canonical owner | Values verified in code |
| --- | --- | --- | --- |
| Usage mode | Session/navigation state of a project | `eVe/domains/rendering/project_work_mode_state.js` | `edit`, `consultation`, `performance` (plus a non-canonical alias `consume`) `[CODE]` |
| Object type (kind) | Nature of the atome or record | `resolveAtomeContextualRecordKind` / `normalizeAtomeContextualKind` in `eVe/intuition/runtime/eve_intuition/atome_contextual_kind.js` | `text`, `svg`, `image`, `video`, `sound`→`audio`, `midi`, `group`→`molecule`, `shape`, `video_recording`, `photo` `[CODE]` |
| Activity | Working context chosen by the user | `eVe/intuition/tools/activities.js` + `activities_model.js` | `dtp`, `video`, `daw`, `text` (+ molecule activities `list`, `mix`, `timeline`) `[CODE]` |
| Mastery level | Quantity/pedagogy of exposed tools | **No owner exists** | none `[CODE]` |
| Contextual menu identity | Which menu is being composed | `mystic` and the right sidebar, both currently derived from Flower-named modules | `mystic`, sidebar rail `[CODE]` |

### 1.2 Non-negotiable rules retained from the request

- Exactly three usage modes. "Performance" and "Exécution" are one mode. `[RULE]`
- An activity is not a fourth mode; it orients contextual tools in Edit only. `[RULE]`
- Exactly three mastery levels; a level is a UI adaptation, never a security permission. `[RULE]`
- Exactly two configurable contextual menus: **Mystic** and the **right sidebar**. They share one reference
  context but have independent compositions and an independent inclusion chain per menu. `[RULE]`
- The main menu stays constant and is not a third contextual configuration target. `[RULE]`
- Flower is abandoned; Mystic replaces it everywhere, with no coexistence, no selector and no fallback. `[RULE]`
- Consultation: no editorial selection, no contextual sidebar, no main menu, placeholders inert. `[RULE]`
- Performance: same restrictions, but placeholders work and may capture/record. `[RULE]`
- Long press in both non-editorial modes opens Mystic in its per-mode override form. `[RULE]`
- **Decided 2026-09-20 (D1)** the base composition of Mystic is five constant, immovable tiles in a cross: one
  tool at the centre, one above, one below, one right, one left. It is declared in the JSON document and stays
  editable there at any time; the order of the arms is not settled and does not need to be. `[DECISION]`
- **Decided 2026-09-20 (D9)** each mode has **its own block** in the JSON and may **override** that base. The
  override wins; a mode that declares no override keeps the five base tiles. Consultation and Exécution each
  declare two entries — the centre (assistant / AI) and the mode exit — and are the only overrides for now.
  Edit declares none. `[DECISION]`
- Hiding a tool is not enough: execution must respect the mode at the point of triggering. `[RULE]`
- Every user-visible string comes from the existing internationalisation system (`eveT`). The JSON document
  carries identifiers and `labelKey` values only, never display text. JSON files themselves are written in
  English. `[RULE]`

### 1.3 The single most important architectural finding

`[CODE]` Mystic is **not** currently a menu. It is a *presentation variant of Flower*, selected by a user
preference:

- `eVe/intuition/tools/user_visual_preferences_model.js:47` — `RENDER_STYLES = ['flat', 'liquid', 'mystic']`
- `eVe/intuition/liquid/intuition_liquid_preference.js:67` — `isIntuitionMysticActive()` is exactly
  `renderStyle === 'mystic'`
- `eVe/intuition/ribbon/bevy_ui_flower_model.js:11-13, 260` — the same menu model imports both
  `flower/menu_layout.js` (petal layout) and `mystic/mystic_layout.js` (tile layout) and branches on the flag
- `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js:489` — the four Mystic fixed entries are
  only prepended when that flag is active

Because the default is `renderStyle: 'flat'` (`user_visual_preferences_model.js:35`), **the default
configuration today renders the old Flower, not Mystic**. The target state therefore requires decoupling
"which menu is this" (Mystic, unconditional) from "which material paints it" (`flat` / `liquid`, a legitimate
visual preference). Conflating them is the root cause of the Flower/Mystic selector that the request forbids.

---

## 2. Audit of the existing state

### 2.1 Usage modes

**Canonical owner** — `eVe/domains/rendering/project_work_mode_state.js`

```
:8   export const getProjectWorkMode = (projectId = ...) => (
       performState.active ? 'performance' : consultationProjects.has(projectId) ? 'consultation' : 'edit'
     )
:21  export const setProjectWorkMode = async (mode, ...) => {
:22      if (!['edit', 'consume', 'consultation'].includes(mode)) throw new Error('project_work_mode_invalid');
:30      return publishProjectWorkMode(windowRef);
```

| # | Rule / expectation | Observed behaviour `[CODE]` | Evidence | Impact | Proposed correction |
| --- | --- | --- | --- | --- | --- |
| M1 | One canonical name per mode | `setProjectWorkMode` accepts `consume` as a third alias that is stored as `consultation`; `getProjectWorkMode` never returns `consume` | `project_work_mode_state.js:8,22`; `main_menu_content_runtime.js:269` maps `consultation → mode_consume` | Two vocabularies for one mode inside the same feature | Keep `consultation` as the mode id; keep `mode_consume` only as the *tool key* and document the pair. Do not rename the tool id (no superfluous migration) |
| M2 | The mode has one explicit scope | Consultation is a module-level `Set` keyed by project id: session-only, never persisted, never synchronized. Performance is a persisted **profile** preference (`PREF_KEY = 'performMode'`, `eVe/intuition/tools/perform_state.js:12`, saved through `perform_preferences.schedulePreferenceSave`) | `project_work_mode_state.js:4`; `perform.js:195,219` | Reloading the app silently leaves Consultation, while Performance survives; the two non-editorial modes have different lifecycles | Resolved 2026-09-20 (D4): all three modes are project-scoped; Exécution must stop being a persisted profile preference |
| M3 | Mode requires a project | `setProjectWorkMode` returns `{ ok:false, error:'project_work_mode_requires_project' }` unless `window.__eveWorkspaceMode.mode === 'project'` | `project_work_mode_state.js:23-25` | Dashboard is already excluded from project modes — the request's "no project" case is structurally satisfied | Keep as-is |
| M4 | Mode changes are published | `publishProjectWorkMode` dispatches `eve:project-work-mode-changed` (`= 'eve:project-work-mode-changed'`) | `project_work_mode_state.js:3,12-18` | A publication seam already exists and can carry the whole reference context | Extend this event into the shared context publication instead of adding a second one |
| M5 | Changing mode neutralizes editorial state | **Nothing** neutralizes selection, handles or the open contextual rail. `atome_contextual_edit_runtime.js:422` only calls `scheduleRender()` on `PROJECT_WORK_MODE_CHANGED_EVENT` | `atome_contextual_edit_runtime.js:108,422` | Edit → Consultation/Performance can leave an active rail, an open slider session and projected edit frames alive on top of a non-editorial mode | Add mode-transition neutralization in the mode owner, not in each consumer (see Lot 7) |

**Performance mode runtime** — `eVe/intuition/tools/perform.js`

- Activation hides the menu (`menuApi.hide()` or `showFully()` under the modern taxonomy), installs a pointer
  handler, isolates the focused selection atome, and sets `window.__evePerformModeActive = true` (`:186-196`).
- Deactivation restores styles, detaches the handler, reveals the menu and clears the flag (`:200-222`).
- Exit from within the menu is an event, not a direct call: the menu dispatches `eve:perform-flower-exit`
  (`eVe/intuition/ribbon/bevy_ui_flower_runtime.js:420-424`) and `perform.js:316` listens for it. The constant
  `PERFORM_FLOWER_EXIT_EVENT` is declared in `perform_state.js:58`. `[CODE]`

**Execution-level protection: absent** `[CODE]`

`isPerformModeActive()` has exactly three production consumers:

```
eVe/intuition/menu/core/toolbox_runtime_model.js:47
eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js:352
eVe/intuition/tools/perform.js:46        (isPerformModeMarkedActive)
```

None of them guards selection, drag, resize, the contextual rail or a placeholder. This confirms the request's
warning: today the non-editorial modes are **hidden**, not **restricted**. `[CODE]`

**Consultation: no consumer at all** `[CODE]` — no production module reads `getProjectWorkMode() === 'consultation'`
to block an operation. Its only consumers are the main-menu palette label
(`main_menu_content_runtime.js:268-269`), the taxonomy context (`navigation_taxonomy.js:25`) and the rail
filter (`atome_contextual_edit_runtime.js:108`).

### 2.2 Mystic (presentation, layout, fixed entries)

`eVe/intuition/mystic/` — 862 lines over 5 modules:

| File | Responsibility `[CODE]` |
| --- | --- |
| `mystic_menu_items.js` (126) | Slot table, fixed entries, page ladder |
| `mystic_layout.js` (351) | Tile geometry, gap, roundness, slot resolution |
| `mystic_tokens.js` (130) | Skin/token resolution, family colours, edge softness |
| `mystic_motion.js` (94) | Motion sampling for the turning plates |
| `intuition_mystic_menu_renderer.js` (161) | Packs layout + tokens into the `procedural_sdf` material record |

Key facts:

- `MYSTIC_FIXED_ITEMS` = `home` (north), `capture` (east), `dashboard` (south), `communicate` (west)
  — `mystic_menu_items.js:33-38`. `[CODE]`
- `MYSTIC_CENTER_FALLBACK` = `{ key: 'ai', label: 'Atom', icon: 'atome' }` at the `center` slot
  — `mystic_menu_items.js:55-59`. `[CODE]`
- The surface is rendered through a dedicated branch of the procedural SDF shader, isolated behind
  `material.flower.x > 2.5` (`intuition_mystic_menu_renderer.js:4-6`), and mounted on the workspace layer named
  `flower` (`renderMysticMenuSurface`, `layer = 'flower'`). `[CODE]`
- The whole feature is self-documented as removable by deleting the folder, the shader block and the Home-panel
  option (`intuition_mystic_menu_renderer.js:13-15`). `[CODE]`

### 2.3 The contextual menu composition (still Flower-named, single resolver)

`eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js` (501 lines) is the **single item resolver**
for the radial/contextual menu; `eVe/intuition/flower/context.js:208,212` registers it as `resolveItems`, and
`eVe/intuition/flower/index.js` exposes open/close/hover to the runtime. `[CODE]`

`resolveFlowerContextItems` (`:487-499`) is the composition entry point:

```
:489   if (!isIntuitionMysticActive() || !isWorkspaceActive()) return contextual;
:491   const fixed = MYSTIC_FIXED_ITEMS.map(...)          // 4 fixed entries with their slots
:494   const reserved = new Set([...fixed.keys, 'ai', 'assistant', 'atome']);
:495   return [...fixed, ...contextual.filter(item => !reserved.has(item.key))];
```

Inside `resolveContextItems` there are **five mutually exclusive branches** (`[CODE]`):

| Branch | Condition | Composition source |
| --- | --- | --- |
| Text field | `type === FLOWER_TEXT_FIELD_CONTEXT_TYPE` | `FLOWER_TEXT_FIELD_TOOL_KEYS` (`['copy','paste']`) |
| Dashboard/List/Matrix surface item | `type === FLOWER_SURFACE_ITEM_CONTEXT_TYPE` | `FLOWER_SURFACE_ITEM_TOOL_KEYS` (`['rename','duplicate','copy','paste','delete','info']`) |
| **Modern taxonomy** | `isModernNavigationTaxonomy()` | `modernFlowerKeys` / `modernMultipleSelectionFlowerKeys` + `modernTaxonomyContent` families |
| **Performance** | `isPerformModeActive()` | `FLOWER_PERFORM_MODE_TOOL_KEYS` (`['perform','copy']`) |
| Mixed kinds | `selectionMode.mixedKinds` | `FLOWER_MIXED_SELECTION_TOOL_KEYS` (`['info','play','copy','paste','delete','communicate']`) |
| Project, no selection | `type === 'project' && !hasSelectionContext` | `FLOWER_PROJECT_ONLY_TOOL_KEYS` |
| Default (by kind) | otherwise | `resolveFlowerToolKeysForKind(kind)` or `FLOWER_MOLECULE_CONTEXT_TOOL_KEYS` |

`eVe/intuition/menu/navigation_taxonomy.js` holds the "modern" alternative:

- `:5` `DEFAULT_NAVIGATION_TAXONOMY = 'legacy'` — **the legacy branch is the default**, so the duplicated
  composition path is the one actually running by default. `[CODE]`
- `:59-67` `FLOWER_BY_KIND` — kind → family groups (`text`, `image`, `svg`, `audio`, `video`, `midi`, `molecule`)
- `:69-81` `modernFlowerKeys` — always returns `['ai','dashboard','capture','find', ...contextual]`
- `:83-90` `modernMainMenuKeys`, `:106-113` `filterModernContextualDefinitions` (the only mode-aware rail filter)

**Conflict found — two different sets of "four fixed entries"** `[CODE]`

| Source | Four fixed entries |
| --- | --- |
| Mystic (`mystic_menu_items.js:33-38`) | `home`, `capture`, `dashboard`, `communicate` |
| Modern taxonomy (`navigation_taxonomy.js:78-80`) | `ai`, `dashboard`, `capture`, `find` |

`[RULE]` The request states the four labels must be *found* in the implementation and approved specifications,
not invented. The two sources disagree, and only the Mystic list is the one consumed by the Mystic path
(`flower_context_items_runtime.js:491` imports `MYSTIC_FIXED_ITEMS` directly). This was decision D1 (§8),
resolved on 2026-09-20: the base cross is data, and its arms stay editable.

**AI placement** `[RULE: "check whether the assistant belongs to the four fixed entries; do not add it as a
sixth"]` — `[CODE]` In Mystic, `ai` is the **center** slot fallback (`mystic_menu_items.js:55-59`) and is
explicitly *reserved* against duplication when the fixed items are prepended
(`flower_context_items_runtime.js:494`). So in Mystic the assistant is not one of the four; in the modern
taxonomy it is the first of the four. Resolved with D1: the assistant is a tile of the base cross, at the
centre, and is never duplicated among the arms.

**No exit entry for Consultation** `[CODE]` — `mode_edit` and `mode_consume` exist only in the main menu
(`main_menu_content_runtime.js:271-272`), which is hidden in both non-editorial modes. Performance has an exit
through the `perform` key (`flower_tool_capability_matrix.js:25`, dispatched as `eve:perform-flower-exit`).
Consultation has **no normal exit path at all** today. `[CODE]`

### 2.4 Right sidebar contextual menu

- Entry/exit API: `eVe/domains/rendering/project_view_contextual_rail.js` (`feedContextualRailWithRow`,
  `releaseContextualRailTarget`) and the registry `atome_contextual_edit_registry.js`
  (`ATOME_CONTEXTUAL_EDIT_CHANGED_EVENT`, `getAtomeContextualEditApi`, `installAtomeContextualEditApi`). `[CODE]`
- Tool tables per kind: `eVe/intuition/runtime/eve_intuition/atome_contextual_rail_model_runtime.js:10-31`
  `DEFAULT_TOOLS_BY_KIND` for `text`, `svg`, `image`, `video`, `sound`, `audio`, `group`. `[CODE]`
- Ordering: `CONTEXT_TOOL_PRIORITY` (`:32-38`). `[CODE]`
- Two contexts levels exist: `selection` and `edition` (`normalizeAtomeContextLevel`,
  `atome_contextual_edit_registry.js:13-15`). `[CODE]`
- Structural additions per call: `resolveAtomeContextualRailToolKeysForAtome` always merges
  `undo`, `redo`, `z_order` (`:224-235`); media placeholders force `record_action` and drop `play`;
  `RECORD_ACTION_EXCLUDED_KINDS` / `PLAY_REQUIRED_KINDS` adjust per kind (`:33-38, 176-215`). `[CODE]`
- Molecule-level rail adds playback mode, import, info and a three-entry activity palette
  (`project_view_contextual_rail.js:60-88`). `[CODE]`
- Mode filtering exists **only** under the modern taxonomy and only as presentation:
  `taxonomyDefinitions` → `filterModernContextualDefinitions` (`atome_contextual_edit_runtime.js:106-108`).
  Under the default `legacy` taxonomy the rail is **not** mode-filtered at all. `[CODE]`

**Three parallel kind→tool tables exist** `[CODE]` — this is the duplication to converge:

1. `FLOWER_TOOL_KEYS_BY_KIND` (`flower_tool_capability_matrix.js`) — 8 kinds, flat key lists
2. `FLOWER_BY_KIND` + `FAMILIES` (`navigation_taxonomy.js:36-67`) — 7 kinds, family groups
3. `DEFAULT_TOOLS_BY_KIND` (`atome_contextual_rail_model_runtime.js:10-31`) — 7 kinds, rail keys

Correction from this audit: the plan `todo/lecture_contextuelle_list_matrix_2026-08-19.md` cites a fourth
table in `atome_edit_footer_model_runtime.js`, but **that file does not exist in this checkout** and
`DEFAULT_TOOLS_BY_KIND` exists in exactly one module. The claim is historical, not current: three live
tables, not four. This is a documentation-versus-code drift to record, not a fourth source to converge.

### 2.5 Activities

- `eVe/intuition/tools/activities_model.js:3-8` — `DEFAULT_ACTIVITIES = [dtp, video, daw, text]` with an
  explicit `order`. `[CODE]`
- Persistence is scoped and already three-level:
  `activities_runtime.js:165-179` writes/reads snapshots for `{ scope:'global' }`,
  `{ scope:'activity', activityId }` and `{ scope:'project', projectId }`, with a local cache prefix
  `eve.goey.desktop.v1` (`activities_model.js:12`). `[CODE]`
- Current activity selection lives in a module singleton: `activityState.currentActivityId`
  (`activities_model.js:20-32`). `[CODE]`
- Activity currently affects only the toolbox children (`resolveMoleculeActivityToolboxChildren`,
  `activities_model.js:66-72`) and the molecule rail activity palette
  (`project_view_contextual_rail.js:69-78`). `[CODE]`
- **The activity does not participate in the contextual menu composition at all.** `[CODE]` The request
  requires the opposite: an explicit activity must become the working context that orients Edit tools.

**DTP / PAO** `[RULE: verify whether they are the same activity]` — `[CODE]` The repository has exactly one
`dtp` activity and **no** `pao` entry anywhere. So DTP and PAO designate the same activity; creating two entries
would be an invention. The audio activity is named `daw`, video is `video`, office/text work is `text`.

### 2.6 Mastery level

`[CODE]` **This dimension does not exist.** `DEFAULT_VISUAL_PREFERENCES`
(`user_visual_preferences_model.js:30-45`) contains `handedness`, `renderStyle`, `navigationTaxonomy`,
`liquidTheme`, `mysticRoundness`, `mysticTileGap`, `mysticOpeningMs`. No level, mastery, proficiency, beginner,
intermediate or expert field exists in the profile preferences, the project state, the activity model or the
tool catalog. The request's inclusion rule
`beginner ⊆ intermediate ⊆ advanced`, applied separately per menu, has **no existing owner and no existing
data**. It must be created, and it must be created once. `[CODE]`

### 2.7 Placeholders

- `eVe/domains/rendering/placeholder_creation_runtime.js:15-19` documents the canonical definition: a
  placeholder is **not** a new type; it is a property on an existing kind. `[CODE]`
- `PLACEHOLDER_KINDS = ['text','video','audio','photo','image','shape']` (`:20`). Media placeholders are
  created with `media_pending: true` plus `media_kind` and `placeholder_kind` properties (`:56-60`). `[CODE]`
- Fill path: `eVe/domains/rendering/project_view_placeholder_fill.js`. `[CODE]`
- The rail already knows this case: a media placeholder forces `record_action` and removes `play`
  (`atome_contextual_rail_model_runtime.js:176-215`). `[CODE]`
- **No mode guard exists on creation or on fill.** `[CODE]` Nothing reads the work mode before activating a
  placeholder or recording through it. Under the request's rules this is the largest functional gap: in
  Consultation a placeholder must be inert, and in Performance it must work without selecting its atome.

### 2.8 Existing tests and quality gates

| Existing check | What it currently locks `[CODE]` |
| --- | --- |
| `tests/eve/create_tools_modes_contract.test.mjs:226-260` | The Mode palette reads its current choice from the canonical owner: `perform` ↔ `performState.active`, `consume` → `mode_consume`, `edit` → `mode_edit` |
| `tests/eve/bevy_ui_main_menu_contract.test.mjs:17,243` | `modernFlowerKeys({ kind:'audio', selected:true })` exact key order |
| `tests/probes/flower_menu_modules.probe.mjs:35,147,674` | `FLOWER_MIXED_SELECTION_TOOL_KEYS` exact list; the perform exit event source |
| `tests/probes/flower_drag_cancel_contract.probe.mjs` | Flower drag cancellation |
| `npm run check:syntax`, `npm run check:m0`, `npm run check:m1`, `npm run test:molecule`, `npm run test:run`, `npm run test:server-verification` | Repository guardrails (`.codex/modules/03-debugging-testing-and-ui-validation.md`). `[CODE]` That module also names `npm run check:m2`, but no such script exists in `package.json` today; the commands listed here are the ones actually exposed |

No existing test asserts mode-based *restriction of execution*, the consultation exit path, the mastery
inclusion chain, or the independence of the two menu compositions. `[CODE]`

### 2.9 Internationalisation of the existing menu labels

The request adds a hard constraint: JSON files stay in English, and everything an end user can read must go
through the internationalisation system already integrated in Atome/eVe. This section audits that system
before the data model is specified, because it decides what the JSON may and may not contain.

**Canonical owner**

- `eVe/i18n/i18n.js` — `eveT(key, fallback = '', params)` (`:34`) reads the current locale first, then the
  fallback locale (`:37-45`); `eveTList`, `setEveLocale`, `getEveLocale`, `registerEveMessages`,
  `onEveLocaleChange`; the same object is published as `window.eveI18n` (`:95-107`). `[CODE]`
- `eVe/i18n/languages.js` — `DEFAULT_EVE_LOCALE = 'fr'` (`:8`), `FALLBACK_EVE_LOCALE = 'en'` (`:9`), each locale
  being the merge of three buckets (`:11-23`). `[CODE]`

| Bucket | Lines fr / en |
| --- | --- |
| `eVe/i18n/languages_*_core.js` | 456 / 457 |
| `eVe/i18n/languages_*_interaction.js` | 447 / 447 |
| `eVe/i18n/languages_*_account.js` | 287 / 287 |

**The label of a menu entry already has one owner**

`eVe/intuition/shared/tool_presentation.js` already answers the question "for this tool key, which label and
which icon?" exactly once. Its header comment (`:1-27`) records that three separate resolutions existed before
and disagreed with each other.

- `:36` — `toolLabelKey(key, definition) = definition.labelKey || 'eve.menu.<key>'`, i.e. the i18n key of a
  command is derived, never invented per consumer. `[CODE]`
- `:53` — `resolveToolPresentation({ key, definition, children, activeToolIds, labelKey, label, icon, translate })`
  returns the final `{ label, icon }`; `labelFor` (`:74-83`) resolves `eveT(keyOfLabel, fallbackLabel)`. `[CODE]`
- Exactly three consumers: `intuition/ribbon/bevy_ui_main_menu_model.js`,
  `intuition/runtime/eve_intuition/flower_context_items_runtime.js`,
  `intuition/runtime/eve_intuition/atome_contextual_edit_model.js`. `[CODE]`

`[RECOMMENDATION]` Any new contextual command must reuse this pair. A fourth resolution would recreate the
divergence the module exists to remove.

**These labels are really user-visible — including to assistive technology**

- `intuition/ribbon/bevy_ui_flower_model.js:111-115` — `labelNode` renders `item.label || item.key` as the text
  of a `bevy-ui-label:` image node. `[CODE]`
- `bevy_ui_flower_model.js:177` — `accessibility: { role: 'button', label: safeKey(item?.label || 'Atom') }`.
  `.codex/modules/02-coding-standards-and-prohibitions.md:250` extends the requirement to
  "accessibility-facing text when it is user-visible or assistive" (`:227-250`). `[CODE]` + `[RULE]`

**Verified current state: FR/EN parity is intact**

`[CODE]` Measured by importing `eVe/i18n/languages.js` and comparing both key sets
(`temp/i18n_parity_exact.mjs`):

- `fr`: 1 171 keys — `en`: 1 171 keys — 0 key present in one locale only.
- `eve.menu.*`: 126 keys per locale, including 28 `eve.menu.taxonomy.*`.
- **Parity is not asserted by any test.** Five test files already import `EVE_DEFAULT_MESSAGES`
  (`bevy_panel_accordion_contract`, `bevy_panel_passive_batch_contract`, `bevy_panel_state_contract`,
  `bevy_panel_table_contract`, `urgent_debug_campaign`) and pin the *value* of the keys they use — for example
  `tests/eve/urgent_debug_campaign.test.mjs:72-82` locks `eve.menu.communicate`, `eve.menu.couleur`,
  `eve.menu.size` and `eve.menu.font` in both locales. None of them compares the two key sets, and none covers
  the mode labels. `[CODE]`

**Verified gaps**

| # | Finding `[CODE]` | Evidence | Impact |
| --- | --- | --- | --- |
| G1 | The three mode labels are internal English tokens in **both** locales: `eve.menu.mode` = `"mode"`, `eve.menu.mode_edit` = `"edit"`, `eve.menu.mode_consume` = `"consume"` | `languages_fr_interaction.js:211-213` and `languages_en_interaction.js:211-213`; rendered by `main_menu_content_runtime.js:256-272` | The Mode palette shows a technical word in every locale — exactly the surface the restricted Mystic reuses |
| G2 | The state-dependent "Play becomes Stop" label bypasses `eveT` in the Flower path: `label: 'Stop'` is passed as an explicit label, and `resolveToolPresentation` gives an explicit label precedence over the key | `flower_context_items_runtime.js:306` against `eve.menu.stop` = `"arrêter"` / `"stop"`; resolution order `tool_presentation.js:89-92` | A French user reads "Stop". The two sibling paths are correct: `main_menu_content_runtime.js:394` and `atome_contextual_rail_model_runtime.js:312` both call `translate('eve.menu.stop', 'Stop')` |
| G3 | The back entry of the menu stack is a hardcoded English object, rendered as text and as the accessible name | `bevy_ui_flower_model.js:192` (`BACK_ITEM`), consumed at `:177` | "Back" is displayed in every locale although `eve.menu.previous` / `eve.menu.next` exist and `mystic_menu_items.js:122` already shows the correct `eveT('eve.menu.' + key, key)` pattern |
| G4 | The center fallback carries a hardcoded label, and the same literal is the accessibility fallback | `mystic_menu_items.js:55` (`MYSTIC_CENTER_FALLBACK`), `bevy_ui_flower_model.js:177` | "Atom" cannot be translated |
| G5 | `eve.menu.dashboard` **does not exist** in either locale | compared against the loaded registry | The first draft of the specification's Example A invented it; the key actually in service is `eve.menu.taxonomy.dashboard` ("Dashboard"/"Dashboard"), through the explicit special case `flower_context_items_runtime.js:90-91`. Example A has been corrected to reuse that key |
| G6 | Four real command keys have no i18n key at all: `line_splitter`, `midi_binding`, `record_action`, `z_order` | keys declared in `navigation_taxonomy.js:33-54` and `atome_contextual_rail_model_runtime.js:11-20` | Their fallback — the English label of the tool definition — is what a French user reads today |

**Two non-findings, stated so they are not "corrected" later**

- `[CODE]` The `label:` values of `tool_runtime_bootstrap_defs_a.js` and `_b.js` (123 declarations) are **not**
  a violation: they are the `fallback` argument of the resolution, and
  `.codex/modules/02-coding-standards-and-prohibitions.md:218-221` allows exactly `eveT(key, fallback)` as the
  single permitted fallback. They become visible only when the key is missing — which is precisely what G5 and
  G6 describe.
- `[CODE]` `intuition_mystic/mystic_menu_items.js` and the mystic surface renderer correctly localise what they
  display (`mystic_menu_items.js:122`); `intuition_mystic_menu_renderer.js:143` (`label: 'Mystic'`) is the label of
  a decorative SDF surface record, published with `visible_to_accessibility: false`
  (`domains/rendering/menu_surface_record_runtime.js:84-93`), so it is not user-visible text.

`[RULE]` `.codex/modules/02-coding-standards-and-prohibitions.md:225-262`: all user-visible text MUST use
`eveT()`; keys stay grouped by domain (`eve.menu.*`, `eve.user.*`); hardcoded user-visible strings are
forbidden in tools, panels, dialogs, object definitions and system UI.

---

## 3. Target specification

### 3.1 Mode matrix (target)

| Behaviour | Consultation | Performance | Edit |
| --- | --- | --- | --- |
| Editorial selection of an atome/tool | Forbidden | Forbidden | Allowed (existing mechanics) |
| Transform handles and editorial operations | Forbidden | Forbidden | Per tool and permission |
| Placeholder activation | **Forbidden (to implement)** | **Allowed (to implement the guard)** | Existing behaviour, to be measured |
| Placeholder capture/recording | Forbidden | Allowed, without selecting the atome | Existing behaviour, to be measured |
| Main menu | Absent | Absent | Present, structurally constant |
| Right sidebar | Absent | Absent | Bound to selection and context |
| Mystic long press | Override: centre (AI) + exit = 2 | Override: centre (AI) + exit = 2 | Base: the five-tile cross |
| Session focus for allowed controls | Preserved | Preserved | N/A |

`[RULE]` The selection prohibition targets *editorial* selection only: focus required by authorised controls,
menus and placeholders must survive.

### 3.2 Compositions

`[RECOMMENDATION]` Both menus resolve from **one reference context** and **two independent composition
declarations**:

```
reference context = (mode, masteryLevel, explicitActivity, selectionKinds[], capabilities[])
mystic(context)  -> group list resolved from menus.mystic
sidebar(context) -> group list resolved from menus.sidebar
```

Independence is structural, not conventional: each menu owns its own `groups` map and its own
`composition[contextKey]` entry, so editing one cannot change the other. Shared command definitions are
referenced by id and never copied.

`[RECOMMENDATION]` Deterministic priority rule for type vs activity:

1. The **mode override** runs first. If `menus.<menu>.modes[<mode>]` declares an override, it is evaluated as a
   whole and replaces everything below: the context composition is not consulted, and the level filter does not
   apply. If the block is absent or empty, the base composition is used unchanged. Today only Consultation and
   Exécution declare an override, so Edit resolves through its context composition as before.
2. Otherwise, if an explicit activity exists, the activity context selects the composition entry.
3. Otherwise, the selection kind selects it.
4. In both cases, *applicability* is applied afterwards and can only remove or disable entries: a command is
   never added because the type could support it. This forbids the "union of type ∪ activity" menu inflation
   the request warns against.

Worked example proving the rule: a video atome selected inside the `dtp` activity resolves through the `dtp`
composition (`pageLayout`), which exposes `size`, `couleur`, `z_order`, `layer`, `copy`, `paste`, `delete`,
`info` and does **not** expose `play`, `line_splitter` or `audio_to_midi`, even though the video kind supports
them. `[RECOMMENDATION]`

### 3.3 Mastery levels

`[RECOMMENDATION]` Canonical ids `beginner`, `intermediate`, `advanced`; canonical FR labels
"Débutant", "Intermédiaire", "Confirmé". For one mode, activity, selection, capability set and permission set,
each menu independently satisfies:

```
tools(menu, beginner) ⊆ tools(menu, intermediate) ⊆ tools(menu, advanced)
```

No inclusion is required between `tools(mystic, ·)` and `tools(sidebar, ·)`. A command shared across all three
levels keeps one id, one action and one meaning; only its presentation may vary (a longer label key, a visible
hint). An override declared for a mode is imposed by the mode and is **not** subject to the level filter — the
level must never remove one of its entries.

`[DECISION 2026-09-20, D4]` The effective level resolves in a hierarchy, the most specific scope winning:

```
effectiveLevel(activity) = activityLevels[activity] ?? profileLevel
```

1. The profile carries the default level (`masteryLevel`).
2. An activity may override it: the same user can be `beginner` overall and `advanced` in video.
3. The activity value wins over the profile value because it is the narrower scope — the profile is the parent.
4. Nothing is merged and no level is "averaged": one scope is selected, then the inclusion chain of §3.3 is
   applied with that single value, per menu.

`[DECISION 2026-09-20, D4]` The three usage modes are **project-scoped**, not profile preferences: Edit,
Consultation and Exécution all belong to the project level. This changes the current behaviour of Exécution,
which today is a persisted profile preference (`perform_state.js:12`, key `performMode`).

### 3.4 Transitions

| Situation | Target behaviour |
| --- | --- |
| Edit → Consultation/Performance with a selection, an open menu or an in-flight edit gesture | The mode owner neutralizes editorial selection, handles and pending actions, closes the rail and cancels in-flight tool gestures; the restored-at-edit state is explicit |
| Long press on background / on an atome / on a placeholder | Opens Mystic; must not simultaneously select or record. Reuse the existing thresholds (400-460 ms, 8 px tolerance) |
| Closing the Mystic menu without activating the exit | Does not change the mode |
| Mode change during a capture/recording | Explicit finalize-or-abort rule with no silent data loss |
| Late/asynchronous events after a mode change | Must not reinstall forbidden editing controls |
| Activity, selection, capability or mastery change | Contextual surfaces update; the main menu is not recomposed |
| Missing config / unknown reference / invalid JSON | Documented fallback inside Mystic; the long-press exit stays usable; Flower is never a fallback |
| Old Flower entry point still present | Replaced by Mystic; no gesture, route or alternate path reactivates Flower |
| No active project (Dashboard) | No artificial selection or activity applied |

---

## 4. Architecture decision: single JSON file vs several

### 4.1 Measured facts that constrain the decision

1. `[CODE]` **No JavaScript module in `eVe/` or `atome/` imports a `.json` file.** There is no import-based JSON
   path in the current build.
2. `[CODE]` There **is** one proven runtime JSON precedent with a canonical loader and validator:
   `eVe/domains/dashboard/dashboard_defaults.js:4-22` fetches `/eVe/default_values/constants.json`, accepts an
   injected `constants` object for tests, injects `fetchImpl`, clones defensively, and validates in
   `readDashboardDefaults` with named errors such as
   `dashboard_category_color_family_unknown:<id>:<key>`.
3. `[CODE]` That precedent deliberately **keeps visual owners in JavaScript**: the JSON names a `color_family`
   key and the loader resolves it against `EVE_SEMANTIC_COLOR_FAMILIES` from `eVe/elements/skin/tokens.js`.
   This is exactly the data/behaviour split the request asks for.
4. `[CODE]` A tool-record contract validator already exists at `eVe/intuition/contracts/validator.js`
   (271 lines) with `validateRequiredFields`, path-based errors and schema versions. It validates tool records,
   not menu compositions, but it is the established error shape to reuse.
5. `[RULE]` No build chain or heavy dependency may be added without demonstrated benefit.
6. `[RULE]` The app must run offline in Browser, Tauri, iOS, AUv3 and FreeBSD. Each extra file is an extra
   failure mode at load.

### 4.2 Comparison

| Criterion | One central file | Several specialised files | Modular JS merged at build |
| --- | --- | --- | --- |
| Readability of a composition | High: the two compositions are adjacent | Medium: requires cross-file reading | High |
| Maintenance of one menu | High: one place to edit | High | High |
| Duplication risk | Low | Medium: shared groups tend to be copied per file | Low |
| Edit conflicts | Moderate: same file for both menus | Low | Low |
| Reference validation | One pass, one atomic snapshot | Needs a cross-file pass and a partial-load state | Build-time only |
| Loading | One fetch (precedent exists) | N fetches, ordering to define | None at runtime |
| Offline failure surface | One | One per file | None |
| Integration with the existing code | Aligned with `constants.json` | New multi-file loading contract | Adds a build step |
| Migration cost | Low | Medium | High |
| Risk of drift between menus | Low: validated together | Higher | Low |

### 4.3 Recommendation

`[RECOMMENDATION]` **One data-only JSON file**, loaded once through a dedicated loader module modelled on
`dashboard_defaults.js`, plus a resolver module. Rationale, in priority order:

1. The two compositions must be *provably* independent yet share one vocabulary and one command catalog. One
   atomic document makes referential integrity a single validation pass with no partial-load state.
2. The existing, proven precedent for runtime JSON in this repository is a single file with an injected-fetch
   loader and a named-error validator. Reusing that pattern is the smallest justified change.
3. Multiple files would add load ordering, cross-file validation and N offline failure modes for a document
   whose realistic size is a few hundred lines. That cost is not justified today.
4. A build-time merge violates the no-new-build-chain rule for no measured benefit.

`[RECOMMENDATION]` The file lives beside the menu owners, e.g. `eVe/intuition/menu/context_menus.json`, and
the loader keeps the `constants`/`fetchImpl` injection points so tests can pass an in-memory object without a
network or filesystem dependency.

`[RECOMMENDATION]` Growth path if the file ever becomes unwieldy: split by *menu* only
(`context_menus.mystic.json` + `context_menus.sidebar.json` + `context_menus.vocabulary.json`), never by
`mode × activity × type × level`. The composition must stay factorised through shared groups.

### 4.4 Data vs behaviour boundary

**Belongs in the JSON**

- Canonical ids: modes, activities, levels, contexts, menus.
- The shared command catalog as *references plus presentation*: `id`, `labelKey`, optional `icon` override,
  `family`.
- The two menu compositions: groups, member order, per-context inclusion, per-level visibility, declarations of
  applicability, presentation variants for the pedagogical level.
- **The base cross of Mystic** — its five tiles, their slot names and their commands (D1). `[DECISION]`
- **One override block per mode, for each menu** (D9). `[DECISION]`
- Defaults, fallback declarations and a version number.

**Stays in the code**

- Gesture handling, long-press thresholds, pointer locks.
- Recording/capture lifecycle and placeholder fill.
- Command execution, tool id resolution, handlers, permission checks.
- Mode control, transition side effects, selection neutralization.
- Visual tokens and final rendering.

`[RECOMMENDATION]` Conditions stay declarative and closed: a small enumerated grammar such as
`{"all": ["kindIs:video", "selectionCountAtLeast:1"]}` or a named applicability preset resolved in code.
No `eval`, no embedded JavaScript string, no general-purpose rule language.

---

## 5. Data model

### 5.1 Proposed tree

```
eVe/intuition/menu/
  context_menus.json          <- the single data document (new)
  context_menus_loader.js     <- fetch/inject + JSON parse + schema validation (new)
  context_menu_resolver.js    <- context resolution + composition assembly (new)
  navigation_taxonomy.js      <- existing; keeps only what survives the migration
```

### 5.2 Schema (informative)

Top level:

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | integer | Document version, validated |
| `vocabulary` | object | Canonical ids: `modes`, `activities`, `levels`, `menus`, `contexts` |
| `commands` | object | Shared catalog: `id → { labelKey, icon, family }` |
| `groups` | object | Reusable ordered lists of command ids |
| `contexts` | object | Context rules: which kinds or activities select it, and its priority |
| `menus` | object | `mystic` and `sidebar`, each with its own `groups`, `composition`; `mystic` also carries `base` (the five-tile cross) |
| `fallback` | object | Named default context and level, used for unknown references |

`menus.<id>.modes` is a map `modeId → override block`. **An empty block `{}` means "no override".** A declared
block is evaluated as a whole and replaces the base and the context composition entirely — there is no partial
merge, so no ambiguity about which arm an override would remove. This is the single mechanism behind every
per-mode difference: remove the block and the mode returns to the base.

`menus.<id>.composition` is a map `contextKey → { groups: [...], exclude?: [...], levelVisibility }`, where
`levelVisibility` is `{ "<groupId>": ["beginner", ...] }`. Because each menu owns its own `groups`, changing
one menu can never change the other.

### 5.3 Examples (all valid JSON)

`[RECOMMENDATION]` In every example below, command ids and context ids come from the audit
(`copy`, `paste`, `delete`, `info`, `couleur`, `font`, `size`, `z_order`, `communicate`, `play`, `record_action`,
`line_splitter`, `draw`, `draw_opacity`, `layer`, `midi_binding`, `audio_to_midi`, `undo`, `redo`, `find`,
`capture`, `home`, `dashboard`, `ai`, `mode_edit`, `mode_consume`, `perform`;
kinds `text`, `image`, `svg`, `video`, `sound`, `audio`, `midi`, `group`;
activities `dtp`, `video`, `daw`, `text`; modes `edit`, `consultation`, `performance`).
The mastery level ids `beginner` / `intermediate` / `advanced` are **new** and therefore proposed, not found.

`[CODE]` Checked against the loaded registry (`temp/i18n_spec_key_gaps.mjs`), four `labelKey` values used by this
catalog have **no message yet** and must be created by Lot 2.5: `eve.menu.line_splitter`, `eve.menu.midi_binding`,
`eve.menu.record_action`, `eve.menu.z_order`. The other 21 resolve to an existing key. `dashboard` deliberately
reuses `eve.menu.taxonomy.dashboard`, the key already in service (§2.9, G5).

**Example A — vocabulary, shared catalog and groups**

```json
{
  "version": 1,
  "vocabulary": {
    "modes": ["edit", "consultation", "performance"],
    "menus": ["mystic", "sidebar"],
    "activities": ["dtp", "video", "daw", "text", "list", "mix", "timeline"],
    "levels": ["beginner", "intermediate", "advanced"]
  },
  "commands": {
    "copy": { "labelKey": "eve.menu.copy", "icon": "copy", "family": "content" },
    "paste": { "labelKey": "eve.menu.paste", "icon": "paste", "family": "content" },
    "delete": { "labelKey": "eve.menu.delete", "icon": "delete", "family": "content" },
    "info": { "labelKey": "eve.menu.info", "icon": "info", "family": "inspect" },
    "size": { "labelKey": "eve.menu.size", "icon": "size", "family": "transform" },
    "couleur": { "labelKey": "eve.menu.couleur", "icon": "couleur", "family": "style" },
    "font": { "labelKey": "eve.menu.font", "icon": "font", "family": "style" },
    "z_order": { "labelKey": "eve.menu.z_order", "icon": "z_order", "family": "transform" },
    "layer": { "labelKey": "eve.menu.layer", "icon": "layer", "family": "vector" },
    "draw": { "labelKey": "eve.menu.draw", "icon": "draw", "family": "vector" },
    "draw_opacity": { "labelKey": "eve.menu.draw_opacity", "icon": "opacity", "family": "vector" },
    "line_splitter": { "labelKey": "eve.menu.line_splitter", "icon": "line_splitter", "family": "text" },
    "play": { "labelKey": "eve.menu.play", "icon": "play", "family": "transport" },
    "audio_to_midi": { "labelKey": "eve.menu.audio_to_midi", "icon": "midi", "family": "audio" },
    "record_action": { "labelKey": "eve.menu.record_action", "icon": "record", "family": "capture" },
    "midi_binding": { "labelKey": "eve.menu.midi_binding", "icon": "midi", "family": "relations" },
    "communicate": { "labelKey": "eve.menu.communicate", "icon": "communicate", "family": "share" },
    "home": { "labelKey": "eve.menu.home", "icon": "home", "family": "project" },
    "dashboard": { "labelKey": "eve.menu.taxonomy.dashboard", "icon": "dashboard", "family": "project" },
    "capture": { "labelKey": "eve.menu.capture", "icon": "capture", "family": "project" },
    "find": { "labelKey": "eve.menu.find", "icon": "search", "family": "project" },
    "ai": { "labelKey": "eve.menu.ai", "icon": "tool", "family": "assistant" },
    "mode_edit": { "labelKey": "eve.menu.mode_edit", "icon": "edit", "family": "mode" },
    "mode_consume": { "labelKey": "eve.menu.mode_consume", "icon": "visible_true", "family": "mode" },
    "perform": { "labelKey": "eve.menu.perform", "icon": "fullscreen", "family": "mode" }
  },
  "groups": {
    "content": ["copy", "paste", "delete"],
    "geometry": ["size", "z_order"],
    "style": ["couleur", "font"],
    "vector": ["draw", "draw_opacity", "layer"],
    "transport": ["play"],
    "audioWork": ["play", "audio_to_midi", "midi_binding"],
    "relations": ["midi_binding"],
    "share": ["communicate"],
    "inspect": ["info"]
  }
}
```

**Example B — a video context determined by the kind**

```json
{
  "contexts": {
    "video": {
      "priority": 20,
      "kinds": ["video", "video_recording"]
    },
    "audio": {
      "priority": 20,
      "kinds": ["sound", "audio"]
    },
    "text": {
      "priority": 20,
      "kinds": ["text"]
    },
    "image": {
      "priority": 20,
      "kinds": ["image", "photo", "shape"]
    },
    "vector": {
      "priority": 20,
      "kinds": ["svg"]
    },
    "molecule": {
      "priority": 20,
      "kinds": ["group", "molecule"]
    },
    "pageLayout": {
      "priority": 60,
      "activities": ["dtp"]
    },
    "soundEngineering": {
      "priority": 60,
      "activities": ["daw"]
    },
    "videoEditing": {
      "priority": 60,
      "activities": ["video"]
    },
    "writing": {
      "priority": 60,
      "activities": ["text"]
    }
  }
}
```

**Example C — the video context at three mastery levels, for the two menus (different choices for one same context)**

Mystic exposes a compact, verb-first set; the sidebar exposes a longer, function-first set with `undo`, `redo`
and the teleport family that the rail already merges
(`resolveAtomeContextualRailToolKeysForAtome`, `atome_contextual_rail_model_runtime.js:224`).

```json
{
  "menus": {
    "mystic": {
      "groups": {
        "videoCore": ["play"],
        "videoEdit": ["copy", "paste", "delete"],
        "videoFinishing": ["size", "couleur", "z_order"],
        "videoPublish": ["communicate"],
        "videoInfo": ["info"]
      },
      "composition": {
        "video": {
          "groups": ["videoCore", "videoEdit", "videoFinishing", "videoPublish", "videoInfo"],
          "levelVisibility": {
            "videoCore": ["beginner", "intermediate", "advanced"],
            "videoEdit": ["beginner", "intermediate", "advanced"],
            "videoFinishing": ["intermediate", "advanced"],
            "videoPublish": ["advanced"],
            "videoInfo": ["beginner", "intermediate", "advanced"]
          },
          "presentation": {
            "beginner": {
              "copy": { "labelKey": "eve.menu.copy.tip" },
              "delete": { "labelKey": "eve.menu.delete.tip" }
            }
          }
        }
      }
    },
    "sidebar": {
      "groups": {
        "videoHistory": ["undo", "redo"],
        "videoTransport": ["play"],
        "videoContent": ["copy", "cut", "paste"],
        "videoTransform": ["size", "z_order"],
        "videoStyle": ["couleur"],
        "videoRelations": ["midi_binding"],
        "videoCapture": ["record_action"],
        "videoShare": ["communicate"],
        "videoDanger": ["delete"],
        "videoInfo": ["info"]
      },
      "composition": {
        "video": {
          "groups": [
            "videoHistory",
            "videoTransport",
            "videoContent",
            "videoTransform",
            "videoStyle",
            "videoRelations",
            "videoCapture",
            "videoShare",
            "videoDanger",
            "videoInfo"
          ],
          "levelVisibility": {
            "videoHistory": ["intermediate", "advanced"],
            "videoTransport": ["beginner", "intermediate", "advanced"],
            "videoContent": ["beginner", "intermediate", "advanced"],
            "videoTransform": ["intermediate", "advanced"],
            "videoStyle": ["intermediate", "advanced"],
            "videoRelations": ["advanced"],
            "videoCapture": ["advanced"],
            "videoShare": ["advanced"],
            "videoDanger": ["beginner", "intermediate", "advanced"],
            "videoInfo": ["beginner", "intermediate", "advanced"]
          }
        }
      }
    }
  }
}
```

Reading of the same `video` context, advanced level:

- Mystic resolves to `play, copy, paste, delete, size, couleur, z_order, communicate, info` (order by group).
- Sidebar resolves to `undo, redo, play, copy, cut, paste, size, z_order, couleur, midi_binding, record_action,
  communicate, delete, info`.

The two lists share `play, copy, paste, delete, size, couleur, z_order, communicate, info` — with identical
identity and semantics because both reference the same `commands` entries — and differ by `cut`, `undo`, `redo`,
`midi_binding` and `record_action`, which Mystic does not expose and the sidebar does. Changing `menus.mystic`
leaves `menus.sidebar` untouched by construction, since the two menus own disjoint `groups` maps.

**Example D — a layout activity applied to a compatible selection**

A video atome selected while the `dtp` activity is explicit: the activity context wins over the kind context,
and only compatible commands survive applicability.

```json
{
  "menus": {
    "mystic": {
      "composition": {
        "pageLayout": {
          "groups": ["pageOrder", "pageTransform", "pageStyle", "pagePublish", "videoInfo"],
          "exclude": ["play", "line_splitter", "audio_to_midi"],
          "levelVisibility": {
            "pageOrder": ["beginner", "intermediate", "advanced"],
            "pageTransform": ["beginner", "intermediate", "advanced"],
            "pageStyle": ["intermediate", "advanced"],
            "pagePublish": ["advanced"],
            "videoInfo": ["beginner", "intermediate", "advanced"]
          }
        }
      },
      "groups": {
        "pageOrder": ["copy", "paste", "delete"],
        "pageTransform": ["size", "z_order"],
        "pageStyle": ["couleur"],
        "pagePublish": ["communicate"]
      }
    }
  }
}
```

`[RECOMMENDATION]` `exclude` is redundant with a correct composition but is kept as an explicit, testable
statement that the video-editing verbs are deliberately absent in a layout activity, which is exactly the case
the request calls out.

**Example E — the base cross of Mystic, and the per-mode overrides**

`[DECISION 2026-09-20, D1]` The cross is data. It is declared once, for Mystic, and stays editable in the
document without touching any code. The order of the arms is not settled and does not have to be: it is a list.

```json
{
  "menus": {
    "mystic": {
      "base": {
        "center": { "command": "ai", "slot": "center" },
        "cross": [
          { "command": "find", "slot": "north" },
          { "command": "capture", "slot": "east" },
          { "command": "dashboard", "slot": "south" },
          { "command": "communicate", "slot": "west" }
        ]
      },
      "modes": {
        "consultation": {
          "center": { "command": "ai", "slot": "center" },
          "cross": [],
          "exit": { "command": "mode_edit", "labelKey": "eve.menu.mode_edit" }
        },
        "performance": {
          "center": { "command": "ai", "slot": "center" },
          "cross": [],
          "exit": { "command": "mode_edit", "labelKey": "eve.menu.mode_edit" }
        }
      }
    }
  }
}
```

`[DECISION 2026-09-20, D1 + D8 + D9]` Each mode owns a block under `modes`, and a declared block **replaces**
the base and the context composition as a whole: there is no partial merge, so no arm is ever removed by
accident. Consultation and Exécution both declare the same two tiles — the centre (assistant / AI) and the exit
— and are the only overrides for now; their `cross` is empty, so the four arms are declared but not shown and
re-enabling one is a one-line data change. Edit declares nothing and therefore shows the five base tiles.
Removing a block restores the base exactly.

`[CODE]` The `slot` names are the existing ones — `center`, `east`, `west`, `north`, `south`
(`mystic_layout.js:23-28`), and the current code already maps `home → north` and `find → southEast`
(`mystic_menu_items.js:12-31`). `find` at `north` in this example reflects the observed current behaviour:
the taxonomy-driven path uses `ai, dashboard, capture, find` and drops `home` entirely
(`navigation_taxonomy.js:75`). The product owner confirmed on 2026-09-20 that Find is the tile currently seen on
the application at the top of the cross; the arm stays a data value, so switching back to `home` is one edit.

**Example F — fallback and defaults**

```json
{
  "fallback": {
    "context": "pageLayout",
    "level": "intermediate",
    "onUnknownContext": "fallback.context",
    "onUnknownLevel": "fallback.level",
    "onMissingMenu": "error"
  }
}
```

**Example G — the mastery hierarchy on one activity**

`[DECISION 2026-09-20, D4]` The profile carries the default, an activity may override it, and the narrower
scope wins. Nothing is declared per menu: both menus read the same effective level.

```json
{
  "menus": {
    "mystic": {
      "levels": {
        "profileDefault": "beginner",
        "byActivity": {
          "video": "advanced",
          "daw": "intermediate"
        }
      }
    }
  }
}
```

With this declaration, a video atome selected by a `beginner` user resolves at `advanced`; a text atome of the
same user resolves at `beginner`; and a `daw` session resolves at `intermediate`. The declared ids stay
`beginner` / `intermediate` / `advanced` and the inclusion chain of §3.3 is applied per menu with the single
effective value.

### 5.4 Resolver

`[RECOMMENDATION]` One central resolver, parameterised by target menu; it shares the context and keeps the
compositions independent.

**Inputs**

```
{
  menu,              // 'mystic' | 'sidebar'
  windowRef,
  mode,              // from the canonical mode owner
  projectId,
  selectionIds,
  kinds,             // resolved by atomeContextualKindFor / normalizeAtomeContextualKind
  explicitActivityId,// from the activity owner
  capabilities,      // type-specific availability (e.g. project automation for `play`)
  permissions,
  level,             // EFFECTIVE mastery: activityLevels[activity] ?? profileDefault (§3.3)
  modeOverride       // menus[menu].modes[mode] when it is declared and non-empty, else null (base applies)
}
```

**Outputs**

```
{
  contextKey,
  groups: [{ groupId, commands: [{ id, labelKey, icon, disabled, reason }] }],
  hidden: [{ id, reason: 'presentation' | 'inapplicable' | 'forbidden_by_mode' }],
  errors: []
}
```

`[RECOMMENDATION]` The three removal reasons stay distinct, as the request demands: *absent by presentation*
(level filter), *disabled because inapplicable* (applicability), *forbidden by mode* (mode branch). Conflating
them is what makes "hiding" look like "forbidding".

**Processing order**

```
1. mode constraints        -> non-editorial: return menus.mystic.modes[mode] (the declared override) and no
                              sidebar; a mode with no declared block keeps the base cross, and the override is
                              taken whole, never merged
2. real permissions        -> remove forbidden entries
3. explicit activity OR selection kind -> select the composition entry (never the union)
4. target menu composition -> menus[menu].composition[contextKey]
5. applicability           -> disable/remove inapplicable, with an explicit reason
6. mastery filter          -> menus[menu]'s levelVisibility only
7. presentation            -> label/icon overrides, ordering, slots
```

`[RECOMMENDATION]` The resolver is pure and synchronous apart from the JSON load; given the same inputs it must
return the same structure, which is what makes steps 1-7 unit-testable without a browser.

### 5.5 i18n contract of the configuration document

`[RULE]` The document carries **identifiers only**. It never carries display text. JSON files are written in
English (identifiers, context ids, group ids, comments in the accompanying prose), and every string an end user
can read is a `labelKey` resolved at render time.

**Five rules the document must satisfy**

| # | Rule | Consequence |
| --- | --- | --- |
| 1 | No field named `label`, `title`, `tooltip`, `message`, `placeholder` or `aria` holds display text | The validator rejects the document; a translated string can never be frozen into a data file |
| 2 | A command's key is `eve.menu.<commandId>` by default, and `toolLabelKey` already derives it | No key is repeated per menu; an explicit `labelKey` is allowed only for a state-dependent or level-dependent label |
| 3 | A level-specific presentation override keeps the same command identity and only changes the key | The inclusion chain (`beginner ⊆ intermediate ⊆ advanced`) stays expressible without duplicating tools |
| 4 | Group and section titles are keys too | A new group means a new key in the same lot, not an inline string |
| 5 | The document never holds a fallback string | The single permitted fallback remains the `fallback` argument of `eveT(key, fallback)`, evaluated in JS, outside the document |

**Resolution path at render time**

```
document.commands[id].labelKey            (or 'eve.menu.' + id through toolLabelKey)
  -> resolveToolPresentation({ key, definition, labelKey })     tool_presentation.js:53
  -> eveT(resolvedLabelKey, fallback)                            i18n.js:34
  -> node.label / accessibility.label                          bevy_ui_flower_model.js:111,177
```

`[RECOMMENDATION]` The JSON feeds the existing resolution; it does not replace it. `resolveToolPresentation` keeps
its current precedence so that a state-dependent label owned by a runtime (Play becoming Stop) still wins — but
that override must itself be produced by `eveT`, which is precisely the defect recorded as G2 in §2.9.

**Keys to create**

`[CODE]` Measured over the JSON examples alone (`temp/i18n_spec_json_key_gaps.mjs`): 27 distinct `labelKey` values, of
which **21 already exist in both locales** and **6 must be created** — 4 command keys (`line_splitter`,
`midi_binding`, `record_action`, `z_order`) and 2 optional level-wording keys.

| Key | Needed by | Locale values to write |
| --- | --- | --- |
| `eve.menu.line_splitter` | the existing command of the same name (`navigation_taxonomy.js:52`) | fr / en |
| `eve.menu.midi_binding` | the existing command of the same name (`navigation_taxonomy.js:34,43-44`) | fr / en |
| `eve.menu.record_action` | the existing command of the same name (`atome_contextual_rail_model_runtime.js:11-20`) | fr / en |
| `eve.menu.z_order` | the existing command of the same name (`navigation_taxonomy.js:33,47,54`) | fr / en |
| `eve.menu.copy.tip` | the beginner-level presentation override of §5.3 Example D | fr / en |
| `eve.menu.delete.tip` | the beginner-level presentation override of §5.3 Example D | fr / en |
| `eve.menu.mastery.beginner` / `.intermediate` / `.advanced` | the mastery field and its selector (D4) | fr / en |

`[DECISION 2026-09-20, D3 + D8]` There is **no exit key to create**: the exit entry reuses
`eve.menu.mode_edit`, because the exit *is* the return to Edit. The two fictional keys
`eve.menu.exit_consultation` / `eve.menu.exit_performance` that an earlier draft of Example E contained have been
removed from the document. What remains to do on those keys is the wording fix of G1, not an addition.

`[RECOMMENDATION]` The two `.tip` keys are the only invented keys left; if no level-specific wording is wanted at
first, the presentation override of Example D is dropped and neither key is created. Every other key in the table
names a command or a value that already exists in the product.

**Existing defects inside the audited scope**

`[RECOMMENDATION]` Four corrections belong to the same work, because the new system renders exactly these
surfaces: `eve.menu.mode`, `eve.menu.mode_edit` and `eve.menu.mode_consume` must receive real labels in both
locales (G1), the Flower's Stop override must call `eveT` (G2), the back entry must use the existing
`previous` / `next` keys instead of a literal (G3), and the center fallback must carry a key rather than the
literal "Atom" (G4). None of the four changes the resolution order of `tool_presentation.js`.

---

## 6. Implementation plan

Each lot has a controlled scope, real target files, dependencies, tests and a done criterion. Lots 0-3 are the
indispensable base; lots 4-6 complete the request; lots 7-9 are required before Flower can be deleted.

### Lot 0 — Characterisation lock (audit evidence)

- **Objective**: lock the current behaviour of the five composition branches and the mode owner *before* changing anything.
- **Files**: new `tests/eve/context_menus_characterisation.test.mjs`; reads
  `flower_context_items_runtime.js`, `navigation_taxonomy.js`, `flower_tool_capability_matrix.js`,
  `atome_contextual_rail_model_runtime.js`, `project_work_mode_state.js`.
- **Dependencies**: none.
- **Changes**: tests only. No production file is touched.
- **Tests**: assert the exact current lists (`FLOWER_MIXED_SELECTION_TOOL_KEYS`,
  `FLOWER_PERFORM_MODE_TOOL_KEYS`, `DEFAULT_TOOLS_BY_KIND` per kind, `modernFlowerKeys` per context) and the
  four accepted mode inputs including the `consume` alias.
- **Done criterion**: the six composition sources and their current values are executable facts, not prose.
- **Risks / rollback**: none; new test file only.

### Lot 1 — Context model normalisation

- **Objective**: one vocabulary and one owner per dimension before any configuration exists.
- **Files**: `eVe/domains/rendering/project_work_mode_state.js` (mode canonicalisation, transition hook),
  `eVe/intuition/tools/user_visual_preferences_model.js` (add the mastery level field),
  `eVe/intuition/menu/navigation_taxonomy.js` (reduce to what survives).
- **Dependencies**: Lot 0.
- **Changes**: make `consultation` the only accepted consultation id while keeping `mode_consume` as the tool
  key; publish the reference context on `eve:project-work-mode-changed`; introduce `masteryLevel` with a
  documented default and scope; state the type/activity priority rule in one module.
- **Tests**: focused Vitest on the mode owner and the preferences model; `npm run check:syntax`.
- **Done criterion**: exactly three mode ids are accepted and returned; one mastery field exists with a
  documented scope and default; the priority rule is a single testable function.
- **Risks / rollback**: adding a preference changes the persisted preference shape — verify the existing
  defaults-merge path (`normalizeVisualPreferences`) tolerates an absent field.

### Lot 2 — Configuration document and validator

- **Objective**: the JSON document, its loader and its validator, without yet consuming either menu.
- **Files**: new `eVe/intuition/menu/context_menus.json`, `context_menus_loader.js`; reuse the error style from
  `eVe/intuition/contracts/validator.js`.
- **Dependencies**: Lot 1.
- **Changes**: `version`, `vocabulary`, `commands`, `groups`, `contexts`, `menus` — each with its
  `base` and its per-mode `modes` overrides — and `fallback`. Loader modelled
  on `dashboard_defaults.js:11-28`: injected `constants`, injected `fetchImpl`, defensive clone, named errors.
- **Tests**: validation of the two real compositions; unknown command reference; unknown context; unknown level;
  missing menu; malformed JSON. All pass an in-memory object so no network is required.
- **Done criterion**: an invalid document fails with a named error, and every command id referenced by both
  menus exists in the canonical JS catalog.
- **Risks / rollback**: an unvalidated JSON becomes runtime truth. The validator is therefore mandatory, and the
  loader keeps an in-code default so a load failure cannot leave the menu empty.

### Lot 2.5 — i18n keys, parity and label ownership

- **Objective**: no user-visible string is introduced by the new system, and the keys it needs exist in both
  locales before any renderer consumes them.
- **Files**: `eVe/i18n/languages_fr_interaction.js`, `eVe/i18n/languages_en_interaction.js` (the
  `eve.menu.*` domain), plus the four corrections in the audited scope:
  `eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js` (G1),
  `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js` (G2),
  `eVe/intuition/ribbon/bevy_ui_flower_model.js` (G3),
  `eVe/intuition/mystic/mystic_menu_items.js` (G4).
- **Dependencies**: Lot 2 (the document and its validator define the key set). Runs in parallel with Lot 3.
- **Changes**: reuse the existing buckets and the existing `eve.menu.*` domain — no new message file, no new
  registry, no per-menu key duplication. Add the keys of §5.5 through the same form the neighbouring entries
  already use (`"eve.menu.<id>": "<texte>"`), and fix the three defects without touching the resolution order of
  `tool_presentation.js`.
- **Tests**: extend the Lot 2 validator so an in-document `label`-like field is a named error; add a parity test
  asserting the two locales expose identical key sets; add a presence test asserting every `labelKey` the
  document references resolves through `eveT` in both locales. Both follow the shape already used by
  `tests/eve/urgent_debug_campaign.test.mjs:72-82`, which reads `EVE_DEFAULT_MESSAGES` directly — no new
  fixture, no new registry.
- **Done criterion**: the document validates, both locales carry the same key set, every referenced key resolves,
  and no user-visible literal remains on the surfaces the new system renders.
- **Risks / rollback**: a parity test can fail on an unrelated pre-existing asymmetry. Measured state today is
  exactly symmetric (1 171 / 1 171), so the test starts green; if it ever fails, the fix is a missing message, not
  a relaxed assertion.

### Lot 3 — Common resolver with distinct compositions

- **Objective**: `resolveContextMenu({ menu, ... })` implementing steps 1-7, used by nothing yet.
- **Files**: new `eVe/intuition/menu/context_menu_resolver.js`.
- **Dependencies**: Lot 2.
- **Changes**: pure resolution; per-menu composition; three distinct removal reasons; `mystic` and `sidebar`
  addresses independent.
- **Tests**: logic tests only — for one fixed context, assert the two menus differ as specified in Example C;
  assert `beginner ⊆ intermediate ⊆ advanced` **per menu**; assert that mutating `menus.mystic` leaves the
  sidebar result unchanged; assert the non-editorial branch yields exactly the block declared under
  `menus.mystic.modes[mode]` — two tiles today, in Consultation and in Exécution — and an empty sidebar.
- **Done criterion**: the resolver returns the target structures with no renderer involved, and the
  independence test fails if either menu's groups leak into the other.
- **Risks / rollback**: none; nothing consumes the resolver yet.

### Lot 4 — Mystic wiring and Flower retirement of the menu identity

- **Objective**: Mystic becomes the only contextual menu, unconditionally.
- **Files**: `eVe/intuition/ribbon/bevy_ui_flower_model.js`,
  `bevy_ui_flower_surface.js`, `bevy_ui_menu_surface.js`, `bevy_ui_flower_runtime.js`,
  `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js`,
  `eVe/intuition/liquid/intuition_liquid_preference.js`,
  `eVe/intuition/tools/user_visual_preferences_model.js`,
  `eVe/intuition/flower/menu_layout.js` (delete the petal layout once nothing imports it).
- **Dependencies**: Lots 1-3.
- **Changes**: decouple the menu identity from `renderStyle` — the tile layout and the base cross become
  unconditional, and `renderStyle` keeps only the material choice (`flat` / `liquid`). Delete the
  `isIntuitionMysticActive()` gate at `flower_context_items_runtime.js:489`. Move the composition source to the
  resolver. Rename the menu owner modules so the file names stop announcing Flower (the reuse guardrail refuses
  new `*_editing.js`-style copies, and a Flower-named owner of a Mystic menu is the same defect in spirit).
- **Tests**: `tests/eve/bevy_ui_flower_contract.probe.mjs`, `tests/eve/bevy_ui_flower_projection.test.mjs`,
  `tests/probes/flower_menu_modules.probe.mjs`, plus the Lot 3 assertions re-run through the real resolver.
- **Done criterion**: with `renderStyle: 'flat'` the contextual menu is Mystic with its base cross — five tiles,
  read from `menus.mystic.base` — and tile layout; no code path selects a petal layout; removing the `mystic` option from the Home panel leaves the
  menu functional (it is no longer an option).
- **Risks / rollback**: a purely visual preference is being turned into a structural behaviour. Rollback is the
  re-introduction of the single gate, which is why this lot is separate from Lot 6.

### Lot 5 — Sidebar wiring

- **Objective**: the right sidebar consumes the same context and its own composition.
- **Files**: `eVe/intuition/runtime/eve_intuition/atome_contextual_rail_runtime.js`,
  `atome_contextual_rail_model_runtime.js`, `atome_contextual_edit_runtime.js`,
  `eVe/domains/rendering/project_view_contextual_rail.js`, `navigation_taxonomy.js`.
- **Dependencies**: Lots 1-3.
- **Changes**: replace `DEFAULT_TOOLS_BY_KIND`, `CONTEXT_TOOL_PRIORITY`, `RECORD_ACTION_EXCLUDED_KINDS`,
  `PLAY_REQUIRED_KINDS` and the structural `undo/redo/z_order` merge with the `menus.sidebar` composition, and
  remove `filterModernContextualDefinitions` plus the `legacy`/`modern` taxonomy switch.
- **Tests**: rail tool-set assertions per kind and context; the placeholder case forcing `record_action`; the
  undo/redo/z_order presence; `npm run test:molecule` since the molecule rail path is touched.
- **Done criterion**: the sidebar tool set is resolved from the JSON for every kind currently covered, with no
  remaining kind→tool literal table in the rail model runtime.
- **Risks / rollback**: `delete` in the rail points at `ui.delete.selection` (`ACTING_TOOL_ID_BY_KEY`), which is
  the *acting* verb, unlike the main-menu `delete`. The migration must preserve that mapping.

### Lot 6 — Execution-level mode protection

- **Objective**: the mode restricts execution, not only presentation.
- **Files**: `eVe/domains/rendering/project_work_mode_state.js` (transition),
  `eVe/intuition/runtime/eve_intuition/atome_contextual_edit_runtime.js`,
  `eVe/domains/rendering/project_view_placeholder_fill.js`,
  `eVe/domains/rendering/placeholder_creation_runtime.js`, plus the selection/transform entry points.
- **Dependencies**: Lots 1, 4, 5.
- **Changes**: one guard consulted at the point of triggering for every editorial operation; Consultation blocks
  placeholder activation and capture; Performance allows placeholder activation and capture **without**
  selecting the atome; a late or deferred event must not reinstate a forbidden control.
- **Tests**: logic tests on the guard; integration tests driving a real pointer in both non-editorial modes.
- **Done criterion**: a directly invoked editorial operation in Consultation or Performance is refused by the
  guard, and the placeholder behaves differently in the two modes.
- **Risks / rollback**: the permitted Performance path (record/play) must not be swallowed by a coarse guard.
  The guard must therefore be per-operation, not per-pointer.

### Lot 7 — Transitions and gestures

- **Objective**: the §3.4 table becomes real behaviour.
- **Files**: the mode owner, `atome_contextual_edit_runtime.js`, `perform.js`, `flower/context.js`,
  `flower/context_pointer_lock.js` (or their Mystic successors).
- **Dependencies**: Lot 6.
- **Changes**: neutralize selection, handles and pending actions on Edit → non-editorial; keep closing the menu
  distinct from leaving the mode; define finalize-or-abort during capture; keep the long-press thresholds.
- **Tests**: integration tests for each transition row, including a mode change during a recording.
- **Done criterion**: no transition leaves an editorial surface alive, and closing the restricted menu preserves
  the active mode.
- **Risks / rollback**: the existing `restoreSelectionStyles` / `restoreFocusedSelectionIsolation` pair in
  `perform.js` is the only precedent; extend it rather than writing a second neutralization path.

### Lot 8 — Flower deletion

- **Objective**: the target state contains no Flower.
- **Files**: `eVe/intuition/flower/context.js`, `context_pointer_lock.js`, `context_target.js`,
  `context_selection.js`, `index.js`, `menu_layout.js`,
  `eVe/intuition/ribbon/bevy_ui_flower_*.js`, `eVe/domains/dashboard/dashboard_item_flower_menu.js`,
  `eVe/intuition/runtime/eve_intuition/flower_context_items_runtime.js`,
  `eVe/intuition/runtime/eve_intuition/flower_tool_capability_matrix.js`, and the shader comment/branch naming
  in `atome/renderers/bevy-core/src/assets/shaders/procedural_sdf.wgsl`.
- **Dependencies**: Lots 4-7 validated.
- **Changes**: delete the legacy surfaces after verifying every reference; keep the `flower` *workspace layer*
  id only if the renderer layer order still requires it, otherwise rename it consistently.
- **Tests**: `rg -i flower` must return no active product path; `npm run check:m0`, `npm run check:m1`,
  `npm run test:run`; renderer build if the shader is touched.
- **Done criterion**: no route, gesture, config, fallback or module name still produces or announces Flower.
- **Risks / rollback**: `flower_tool_capability_matrix.js` also hosts reusable helpers
  (`invokeFlowerMoleculeUngroup`, `resolveFlowerGatewayAction`, `parseFlowerBoolean`). They must be relocated to
  their canonical owners, not deleted with the file.

### Lot 9 — Non-regression across runtimes

- **Objective**: prove the three modes on the real product, not on fixtures.
- **Files**: `tests/eve/*` and `tests/probes/*`, plus a manual acceptance sheet.
- **Dependencies**: all previous lots.
- **Changes**: none besides tests.
- **Tests**: `npm run check:syntax`, `npm run check:m0`, `npm run check:m1`, `npm run test:run`,
  `npm run test:molecule`, `npm run test:server-verification` where the path reaches it.
  (`.codex/modules/03` names `npm run check:m2`; no such script exists in `package.json`, so it is not run.)
- **Done criterion**: the criteria of §7 pass in the runtimes where they were declared, and every unrun lane is
  reported as unrun.
- **Risks / rollback**: a green browser lane says nothing about Tauri, iOS or AUv3. Per the project rules, these
  remain distinct lanes.

---

## 7. Acceptance matrix and risks

### 7.1 Acceptance matrix

Legend for "Test kind": **L** = logic, **UI** = UI integration, **UX** = human verification.

| # | Criterion (from the request) | Test kind | Target check | Current status `[CODE]` |
| --- | --- | --- | --- | --- |
| 1 | Consultation: clicking an object does not select it; placeholders neither activate nor record; editorial menus absent | L + UI | mode guard + the mode's Mystic override | **Not satisfied**: no guard exists; only the menu is hidden |
| 2 | Performance: same editorial restrictions, but a placeholder works and records without selecting | L + UI | per-operation guard + placeholder path | **Partially satisfied**: recording exists; nothing prevents selection |
| 3 | Long press in both modes → Mystic restricted to the declared entries plus the matching exit; no editorial choices, no extra entry; the level removes none | L + UI | mode-override composition of Lot 3 | **Not satisfied**: no exit exists for Consultation. D1, D8 and D9 are decided: the base cross is data, and Consultation and Exécution each override it with centre + exit |
| 4 | Exit path usable with mouse and touch; closing the menu alone keeps the mode | UI + UX | gesture tests + manual | **Not satisfied** for Consultation |
| 5 | Edit: selection and contextual tools work; the main menu keeps its structure and position across context changes | UI | main-menu identity test | To verify; `modernMainMenuVisible` already excludes non-editorial contexts |
| 6 | Without an explicit activity the kind guides tools; with one, the priority rule applies with no incompatible command | L | resolver step 3 | **Not satisfied**: the activity does not enter the radial composition at all |
| 7 | For each menu separately, `beginner ⊆ intermediate ⊆ advanced`, shared tools keeping identity | L | resolver step 6 | **Not satisfied**: the dimension does not exist |
| 8 | Mystic and the sidebar may differ for one context; changing one does not change the other | L | resolver independence test | **Not satisfied**: one shared resolver produces one list |
| 9 | Shortcuts, residual events and indirect commands do not bypass the mode; the pedagogy filter is not a permission | L + UI | cold-path audit + guard | **Not satisfied**: `isPerformModeActive` has three consumers, none on an edit path |
| 10 | Transitions during selection, gesture or recording follow the documented policy with no silent loss | UI + UX | Lot 7 tests | **Not satisfied**: a mode change only triggers `scheduleRender` |
| 11 | Configurations valid; ids, references and declared commands coherent; unknown cases follow the fallback | L | validator tests | **Does not exist** |
| 12 | Future custom interactions are not enabled inadvertently; out-of-scope behaviour does not regress | L | absence tests + `check:m0`/`m1` | To execute |
| 13 | Every former Flower opening leads to Mystic; no active path, option, target config or fallback displays Flower | L + UI | `rg -i flower` audit + gesture tests | **Not satisfied**: default `renderStyle: 'flat'` still renders the petal layout |
| 14 | JSON files are English and carry no display text; every user-visible string of the new system resolves through `eveT` | L | validator test + presence test per `labelKey` | **Partially satisfied**: the examples contain 0 display-text field and 27 `labelKey` values, all measured; 21 keys exist in both locales and 6 must be created (§5.5) |
| 15 | French and English expose the same key set, and no locale shows an internal token | L | parity test + a value check on the mode labels | **Not satisfied**: parity is exact but no test compares the key sets (1 171 / 1 171), and `mode` / `mode_edit` / `mode_consume` read "mode" / "edit" / "consume" in both locales (G1). Five suites pin individual values, none the key sets (`urgent_debug_campaign.test.mjs:72-82`) |

### 7.2 Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Turning a visual preference into structure | `renderStyle` currently controls both material and menu identity; a naive removal changes the appearance of every menu | Separate identity (unconditional) from material (`flat`/`liquid`) in Lot 4, and validate both materials |
| `delete` has two meanings | The rail maps `delete` to `ui.delete.selection` (acting) while the main menu opens a deletion panel | Preserve the `ACTING_TOOL_ID_BY_KEY` mapping during the sidebar migration |
| Coarse mode guard | A single "no writes" rule would break the permitted Performance recording | Guard per operation, not per pointer or per mode |
| Two modes with two lifecycles | Performance is a persisted profile preference, Consultation is session-only per project | Decide D4 explicitly; do not silently unify |
| Hidden vs forbidden confusion | Presentation, applicability and mode currently collapse into "not rendered" | Keep the three reasons distinct in the resolver output |
| Deleting reusable helpers with Flower | `flower_tool_capability_matrix.js` hosts live helpers | Relocate before deletion (Lot 8) |
| Green browser lane read as complete | Project rule: browser, Tauri, iOS, host and pixels are distinct | Report each lane separately; never call an unrun lane fixed |
| JSON becomes runtime truth | A malformed or unvalidated document would silently empty a menu | Mandatory validator, in-code default, named errors |
| A label key that does not exist | `eveT` then returns the English fallback, so the defect is invisible in the default English locale and only appears in French | Presence test per referenced key (Lot 2.5); 4 command keys are already missing today (§2.9, G6) and 6 keys in total are needed by the examples (§5.5) |
| Translating by adding a second resolution | A fourth label resolution would recreate exactly the divergence `tool_presentation.js` was written to remove | Reuse `toolLabelKey` + `resolveToolPresentation`; the JSON supplies keys only |

---

## 8. Decisions and their status

Only decisions that neither this request nor the accessible sources can settle. Each has a proposed default and
its impact.

**Status on 2026-09-20 — D1, D4 and D8 were answered by the product owner and are now decisions. Their previous
formulations are kept below, marked `RESOLVED`, because the audit evidence they rest on stays valid and the
reasoning is what the implementation lots refer to. D9 was answered on 2026-09-20 as well; the nine decisions
below are now all settled, and none of them blocks Lot 0.**

**D1 — The identity of the base tiles, and the place of the assistant. — RESOLVED 2026-09-20**

`[DECISION]` The base of Mystic — `menus.mystic.base` — is **five constant and immovable tiles arranged as a cross**: one tool at
the centre, one above, one below, one on the right, one on the left. It belongs to the JSON document and must
stay editable there at any time. The order of the arms is not settled and does not need to be: a first draft is
enough, the point is to have a clean modifiable structure.

*Consequences for the model*:
- `menus.mystic.base` holds the cross as data, with explicit slot names (Example E).
- The centre is a tile like the others and always rendered; the assistant lives there.
- `ai`, `assistant` and `atome` all already resolve to the `center` slot
  (`mystic_menu_items.js:12-31`), so the existing code agrees with this decision.
- Comparison is preserved as data, never as a code choice: `MYSTIC_FIXED_ITEMS` gives `home` to `north`
  today, while the taxonomy-driven path uses `ai, dashboard, capture, find` and drops `home` entirely
  (`navigation_taxonomy.js:75`). Example E declares `find` at `north` because that is what the product owner
  observes in the current application; switching back to `home` is a one-value edit.

*Audit evidence kept from the original question*: `[CODE]` `MYSTIC_FIXED_ITEMS` = `home`, `capture`,
`dashboard`, `communicate` (`mystic_menu_items.js:33-38`), with `ai` at the center; `modernFlowerKeys` =
`ai`, `dashboard`, `capture`, `find` (`navigation_taxonomy.js:75`).

**D2 — Whether the exit entry returns to Edit.**
`[CODE]` No destination is defined anywhere; no exit command exists for Consultation at all.
*Proposed default*: the exit command switches to Edit; leaving a mode neither closes the project nor ends the
session.
*Impact*: low; it is one target value in the mode override.
*Requires validation*: no, if the request's own hypothesis is accepted.

**D3 — The exit command identity per mode.**
*Proposed default*: reuse the existing `mode_edit` command for both mode overrides, with a mode-specific
label key, rather than creating two new commands.
*Impact*: one label key pair to add; no new command id.
*Requires validation*: no.

**D4 — The scope of the mastery level and the lifecycle of the modes. — RESOLVED 2026-09-20**

`[DECISION]` **Mastery resolves as a hierarchy, and the narrower scope wins.**

1. The default level belongs to the **user profile**.
2. It is then declined **per activity**: one user may be weaker in some activities than in others.
3. The activity value has priority over the profile value, because the profile is the parent scope. Worked
   example given by the product owner: a user who is `beginner` overall but `advanced` in video resolves at
   `advanced` in video.

`[DECISION]` **The three usage modes are project-scoped.** Edit, Consultation and Exécution are modes of the
project, not preferences of the profile.

*Consequences*:
- `effectiveLevel(activity) = activityLevels[activity] ?? profileLevel` — one scope selected, nothing merged
  (§3.3, Example G).
- The mode owner becomes project-scoped for all three modes. Consultation is already session-scoped per project
  (`project_work_mode_state.js`); **Exécution must stop being a persisted profile preference**
  (`perform_state.js:12`, key `performMode`) and join the same project scope.
- This is a behaviour change: Exécution no longer survives a reload as a profile setting. It is the risk
  identified in §7.2 and it is now a decision, not a risk left open.

*Audit evidence kept from the original question*: `[CODE]` the mastery dimension does not exist anywhere
(§2.6); Consultation is a session-only `Set` per `projectId`; Exécution is a persisted profile preference.

**D5 — The DTP/PAO consolidation.**
`[CODE]` Only `dtp` exists; no `pao` entry exists anywhere.
*Proposed default*: one activity, id `dtp`, labelled "PAO / DTP" if both terms must remain visible.
*Impact*: none on composition; one label decision.
*Requires validation*: no, if the single-entity reading is accepted.

**D6 — The status of `consume` as a mode id.**
`[CODE]` `setProjectWorkMode` accepts it; `getProjectWorkMode` never returns it.
*Proposed default*: `consultation` becomes the only accepted mode id, while `mode_consume` remains the tool key
and the i18n key (no superfluous rename of the user-visible tool).
*Impact*: `tests/eve/create_tools_modes_contract.test.mjs:252` calls `setProjectWorkMode('consume')` and must be
updated.
*Requires validation*: no.

**D7 — Whether the main menu keeps its Mode palette in Edit.**
`[CODE]` The Mode palette currently exposes `perform`, `mode_edit`, `mode_consume`
(`main_menu_content_runtime.js:260`).
*Proposed default*: keep it; it is a mode entry, not a contextual composition, and the request only requires the
main menu to stay structurally constant.
*Impact*: none; the palette is not a configuration target.
*Requires validation*: no.

**D8 — The wording of the mode labels. — RESOLVED 2026-09-20**

`[DECISION]` There is already one tool named **Mode**, and it contains **edit**, **exécution** and
**consultation**. Those are the exact French terms, and they are what must be corrected:

| Key | Today (fr / en) | Target fr | Target en |
| --- | --- | --- | --- |
| `eve.menu.mode` | `"mode"` / `"mode"` | `Mode` | `Mode` |
| `eve.menu.mode_edit` | `"edit"` / `"edit"` | `Édition` | `Edit` |
| `eve.menu.mode_consume` | `"consume"` / `"consume"` | `Consultation` | `Consultation` |
| `eve.menu.perform` | `"exécuter"` / `"perform"` | `Exécution` | `Exécution` |

`[DECISION]` No new command and no new exit key: the exit entry reuses `eve.menu.mode_edit` (D3), because the
exit *is* the return to Edit.

*Impact*: the Mode palette of the main menu becomes readable in both locales as a side effect; no key is
duplicated; criterion 15 of §7.1 can pass.
*Audit evidence kept from the original question*: `[CODE]` the three values are internal English tokens in both
locales (§2.9, G1), rendered by `main_menu_content_runtime.js:256-272`.

**D9 — What Exécution shows on long press. — RESOLVED 2026-09-20 (option A)**

`[DECISION]` **The base is five tools, and a mode may override it.** Each mode owns a block in the JSON
document; a declared block wins, and a mode that declares nothing keeps the five base tiles. Consultation and
Exécution are the only overrides for now, and both declare the same two entries: the centre (assistant / AI) and
the exit. Edit declares none. A declared block replaces the base and the context composition wholesale — never a
partial merge — so no tile can disappear by omission, and deleting a block is the exact rollback.

*Why option A*: the product owner confirmed on 2026-09-20 that a mode carrying a declared block shows two
entries, not five. The request's wording ("the same five entries") is satisfied by the *base*, which is what
every mode inherits while it declares no override.

*Consequences for the model*:
- `menus.mystic.modes` is a map `modeId → { center, cross, exit }`; an empty map means "base everywhere".
- `menus.mystic.base` is exactly the five-tile cross of D1 (centre, north, east, south, west).
- The taxonomy is deliberately not frozen: the base is a first draft, editable in the document, and only the
  structure has to be right today. The override layer is the only extension point a new mode needs.

*Audit evidence kept from the original question*: `[CODE]` `isPerformModeActive()` has three consumers and none
of them guards selection, drag or resize (§2.1), so nothing in the current code pre-empts either option; the
choice is a data value, not a code change.
*Impact*: the content of `menus.mystic.modes.performance` only.
*Requires validation*: no.

---

## 9. Final recommendation

**Which JSON organisation to adopt**

One data-only document — `eVe/intuition/menu/context_menus.json` — loaded once through a loader modelled on the
existing `dashboard_defaults.js` precedent (injected `constants`, injected `fetchImpl`, defensive clone, named
errors), validated for every command and context reference against the canonical JavaScript catalogs, and
consumed by one pure, menu-parameterised resolver. `menus.mystic` and `menus.sidebar` each own a disjoint
`groups` map, which is what makes their independence structural rather than conventional.
`menus.<id>.base` carries the five-tile cross and `menus.<id>.modes` the per-mode overrides; a mode with no
declared block inherits the base, so adding or removing a per-mode difference is always one data edit and never
a code change. No build chain is added. The document grows only by splitting per *menu* or per *vocabulary*, never per
`mode × activity × type × level`.

**Which components to keep, which to modify**

*Keep*: the canonical mode owner `project_work_mode_state.js` (extended, not replaced); the Mystic layout, tokens
and renderer modules as the menu's presentation owner; the i18n owner `i18n.js` + `languages.js` and the label
resolver `toolLabelKey` / `resolveToolPresentation`; the existing i18n keys and tool ids; the existing
`eve:project-work-mode-changed` publication; the rail's acting-tool mapping (`ui.delete.selection`) and its
placeholder/media special cases.

*Modify*: `flower_context_items_runtime.js` (composition delegated to the resolver, Mystic gate removed);
`navigation_taxonomy.js` (the `legacy`/`modern` duplicate composition removed); `atome_contextual_rail_model_runtime.js`
(its literal kind→tool table removed); `atome_contextual_edit_runtime.js` (mode filtering and the
transition hook); the preferences model (mastery added; `renderStyle` reduced to a material choice).

*Converge, then delete*: `FLOWER_TOOL_KEYS_BY_KIND`, `FLOWER_BY_KIND` + `FAMILIES` and `DEFAULT_TOOLS_BY_KIND`
— three parallel declarations of the same fact become one catalog plus two compositions.

*Delete*: `eVe/intuition/flower/` and `eVe/intuition/ribbon/bevy_ui_flower_*.js` once the helper functions have
been relocated, plus every Flower option, fallback and selector.

**In what order to complete the Mystic migration**

`0` characterisation lock → `1` context normalisation (mode ids, mastery owner, priority rule) → `2` JSON +
validator → `2.5` i18n keys, parity and label ownership → `3` common resolver with two independent compositions → `4` Mystic wiring and removal of the
Flower/Mystic selector → `5` sidebar wiring → `6` execution-level mode protection → `7` transitions and gestures
→ `8` Flower deletion → `9` multi-runtime non-regression. Lot 2 ships both the base cross and the per-mode
override blocks, so every later mode difference is data; lots 0-3 are the indispensable base; lot 2.5 is what keeps every
new surface translatable from the first day; lots 4-5 deliver the request; lots 6-7 are what turn "hidden" into
"enforced"; lots 8-9 are the proof that the target state is reached. No lot is a rewrite: every one of them extends or reduces an existing canonical owner.

**Which tests prove the three modes stay coherent without depending on Flower**

1. A logic test on the resolver: for one fixed context (`video`, advanced) it asserts the two menus return
   **different** lists, and that mutating `menus.mystic` leaves the sidebar structure unchanged — the
   independence required by criterion 8.
2. A logic test asserting `beginner ⊆ intermediate ⊆ advanced` **per menu** over the same context, with shared
   commands keeping one id and one action — criterion 7.
3. A logic test asserting the non-editorial branch returns exactly the block declared under
   `menus.mystic.modes[mode]` — the centre and the exit today, in both non-editorial modes — and an empty
   sidebar, and that a level filter can never remove one of them — criterion 3.
4. A guard test asserting that a directly invoked editorial operation is refused in Consultation and in
   Performance, while placeholder activation and recording still succeed in Performance only — criteria 1, 2, 9.
5. An absence test asserting no module, gesture, route or configuration can produce Flower, and that the
   contextual menu renders the Mystic layout with `renderStyle: 'flat'` — criterion 13.
6. The existing suites re-run unchanged: `npm run check:m0`, `npm run check:m1`, `npm run test:molecule`,
   `npm run test:run`, plus `tests/eve/create_tools_modes_contract.test.mjs` updated for the single
   `consultation` mode id.
7. An i18n test pair: locale parity (identical key sets in `fr` and `en`) and per-key presence for every
   `labelKey` the document references, plus a check that the document itself carries no display-text field —
   criteria 14 and 15.

Native Tauri, iOS and AUv3 acceptance of criteria 4 and 10 remains a separate lane and must be reported as
such until it is actually run on the corresponding runtime.
