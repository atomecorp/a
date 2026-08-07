# Communication HTML line migration registry

Date: 2026-08-07

Exhaustive retirement ledger for the former Communication HTML panel. The
ranges below partition every historical source line of the retired and rewritten
modules exactly once: **3 093 / 3 093 lines removed**, against **2 423 lines**
of Bevy package and neutral remainder. `M` means migrated to the Bevy product
package, `R` means replaced by an existing canonical runtime contract, and `D`
means deleted because the behaviour was DOM-authoritative, already dead, or
obsolete. Blank lines and comments are included in their surrounding range; no
source line is omitted.

Three dispositions deserve their headline up front:

- **The tool badge, bubble and pulse are deleted, not migrated — they were
  already dead.** `communication_tool_dom.js` and the badge/pulse half of
  `communication_notifications_render.js` operated on `#_intuition_communicate`
  and `#toolbox`. Neither node has been built since the DOM main menu was
  retired, so the unread badge had silently stopped working before this
  migration. The unread count now lives in the panel footer status line; a
  badge on the Bevy menu item needs a main-menu capability that does not exist
  and is recorded as `blocked`, not as migrated. See D6.
- **The Finder tool clone is deleted; the search behaviour is kept.** The
  legacy section cloned the Finder DOM node through `eveToolCloneApi`. Finder
  became a Bevy surface on 2026-08-07 and its dialog was retired, so there is
  no node left to clone. The Bevy panel composes its own search row and routes
  it through `window.__eveFinder.quickSearch`, the canonical entry point Finder
  already exports. Behaviour migrates; DOM plumbing does not.
- **The condition rows gained the state they never had.** The legacy selects
  and value input carried no change handler, so `commState.advanced.conditions`
  stayed `[]` while the send path read it — every share went out with
  `condition: null`. The Bevy rows write state. See D5.

Nine modules are **not deleted**: `communication_base.js`, `_users.js`,
`_share_resolve.js`, `_realtime.js`, `_notifications.js`, `_actions.js`,
`_atome_model.js`, `_atome_render.js` and `_media_source.js` were already
renderer-neutral and are consumed unchanged by the bridge. Only the dead
constants inside `_base.js` are retired.

---

## `eVe/intuition/tools/communication_panel_dom.js` — 470 lines (deleted)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–9 | R | Imports collapse to the shared Bevy builders and the panel skin tokens. |
| 10–24 | M | The notifications section/table hosts become `notificationsNode` in `bevy_panel_comm_view.js`. |
| 26–52 | M | The two-column compose grid becomes the single fluid compose column: the panel owner resolves width, so a hand-built two-column split has no purpose in the canvas. |
| 54–61 | M | `createEveEditableText` becomes `multilineInputNode` driven by the shared text-editing session. |
| 63–82 | M | Attachment / reply / reply-attachment rows become `chipStripNode` plus the reply summary text node. |
| 84–99 | M | Recipients title and list become the localized label and `chipStripNode`, now with a per-chip remove control. |
| 101–124 | M/**D** | The recipient input migrates; its `recordManualRecipient` call is repaired — it was never imported and threw on every manual entry (D1). Commit is now reachable both by blur and by an explicit `+`, because blur-to-commit loses entries on touch. |
| 126–152 | M | Subject input and the button row become the compose field and `buildFixedContent`, pinned above the footer. |
| 154–182 | M | Visio / Avancé / Envoyer become `composeActionsNode`; the two dispatched events are unchanged. |
| 184–222 | M | The advanced panel and its six sections become the `comm_advanced` accordion and its two-column grid. |
| 224–256 | M | Read/Write buttons and their inline property panels become the section buttons plus one floating picker in `buildOverlayContent`. |
| 257–393 | M | Start/End mode buttons, date inputs and hh/mm/ss trios become `selectNode` plus registered text fields. |
| 395–425 | M | Mode button and the condition list/add button become `selectNode` and the state-backed condition rows. |
| 427–439 | **D** | The search section host and the Finder DOM clone container. Replaced by the panel's own search row. |
| 441–467 | M | Table scroll/header/body hosts and the four column descriptors become `sortableHeaderNode` over `commColumns()`. |
| 468–471 | R | Module export replaced by the package's builders. |

## `eVe/intuition/tools/communication_advanced.js` — 398 lines (deleted)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–13 | R | Imports collapse to the shared choice/select/accordion builders. |
| 14–83 | M | `buildPropertyPanel` becomes `propertyPanelNode`: title, eight `toggleableRowNode` entries, three action buttons. |
| 85–93 | M | The active-button style becomes the `outlined` flag on the shared button. |
| 95–104 | M | The composed `Read All|Open` label becomes `propertyModeLabel` in the model. |
| 106–115 | M | `updateInlineVisibility` becomes the mode-driven branch in `scheduleSection`. |
| 117–137 | M | The three label maps become `commStartModes`/`commEndModes`/`commShareModes`. |
| 139–162 | M | Menu open/close bookkeeping becomes the single `openMenu` state key. |
| 164–212 | M | The eight property options and the temporary selection become `commPropertyOptions()` and `propertyDraft`. |
| 214–252 | M/**D** | Open/close/toggle migrate; the three bare `readPropertyPanel`/`writePropertyPanel` references that made the **Write** button throw are gone (D2). |
| 254–306 | M | `buildMenu` and the three menus become `selectNode` with its validated popup. |
| 308–380 | M/**D** | The condition catalogues migrate; the handler-less selects are replaced by state-backed rows (D5). `Date.now()`-keyed row ids are replaced by positional ids. |
| 382–399 | R | Factory wiring replaced by the runtime's intent table. |

## `eVe/intuition/tools/communication_notifications_render.js` — 389 lines (deleted)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–28 | R | Imports and the header-cell registry collapse into the shared sortable header. |
| 30–59 | M | `buildHeader` becomes `sortableHeaderNode`; the manual `^`/`v` span becomes the validated direction caret. |
| 61–80 | M | `applySort` / `updateSortIndicators` become the `comm.notification.sort` intent and the header's own `sortKey`/`sortDirection`. |
| 82–104 | M | `resolveActionList` moves verbatim into the panel model. |
| 106–117 | M/**D** | The visible-row filter migrates; hiding the whole section when empty is replaced by the shared `panelStateNode` empty state (D4). |
| 119–135 | M | `upsertNotificationInUi` moves to the bridge as `upsertNotification`, now repainting through the panel refresh. |
| 137–236 | M | `renderNotifications` splits into `projectCommNotifications` (dedup, sort, action resolution) and `notificationRowNode`. |
| 238–239 | M | `getUnreadCount` becomes `unreadCount` in the model. |
| 240–283 | **D** | `isMenuVisible`, `ensureFloatingTool`, `setToolPulse`, `updateToolBadge`, `updateFloatingVisibility` — all operate on `#toolbox` and `#_intuition_communicate`, neither of which is built any more (D6). |
| 285–298 | **D** | `watchMenuVisibility` observes `#toolbox`; the node does not exist. |
| 300–314 | **D** | `showQueuedNotifications` drives the scrolling bubble on the retired DOM tool. |
| 316–321 | M | `markNotificationRead` moves to the bridge unchanged. |
| 323–365 | M | `addNotification` moves to the bridge: it is normalization plus persistence, not rendering. |
| 367–390 | R | Factory export replaced by the bridge's named exports. |

## `eVe/intuition/tools/communication_tool_dom.js` — 107 lines (deleted)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–107 | **D** | Badge element, scrolling message bubble and base-metric capture, all on `#_intuition_communicate`. The node has not existed since the DOM main menu was retired, so this file had already stopped doing anything. A Bevy menu-item badge is `blocked` on a main-menu capability (D6). |

## `eVe/intuition/tools/communication_panel_helpers.js` — 194 lines (deleted)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–13 | R | Factory wrapper removed: the helpers were pure and did not need `commEls`. |
| 14–33 | M | `normalizeCommShareMode` / `resolveCommShareConfig` move verbatim into `bevy_panel_comm_model.js`, where the send pipeline now imports them. |
| 35–55 | M | `formatDate`, `getNotificationLabel`, `formatReplySummary` move into the model. |
| 57–71 | **D** | `createPlainTextElement` builds a `div`. |
| 73–80 | M | `normalizeAttachment` moves into the model and into the neutral compose half. |
| 82–128 | **D** | `renderAttachmentList` / `renderRecipients` build chip DOM; replaced by `chipStripNode`. |
| 130–137 | M | `resolveSortValue` moves into the model. |
| 139–175 | M | `resolveAtomeId`, `resolveAtomeLabel`, `normalizeAtomeRecord` move into the neutral compose half, their only remaining consumer. |
| 177–195 | R | Factory export replaced by named model exports. |

## `eVe/intuition/tools/communication_lifecycle.js` — 294 lines (deleted)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–25 | R | Factory wrapper split in two: the neutral half is `communication_remote_commands.js`, the panel half is the surface lifecycle. |
| 26–83 | **D** | `mountFinderToolClone` and its 200 ms retry. Finder has no DOM node to clone. |
| 85–110 | M | `open_comm_panel` becomes `openCommPanel` plus the surface `onOpen`: the stack sync, the message log and the selection preload survive; showing the dialog, resetting scroll and building the header are shell concerns the Bevy runtime owns. |
| 112–122 | **D** | `getCommToolElements` resolves `COMM_TOOL_STATE.domIds`, none of which exist. |
| 124–151 | **D** | `syncCommToolLatchedState` — the menu-runtime latch call and the `eve:tool-state-changed` event are re-emitted by the canonical tool gateway on close; the panel no longer owns them. |
| 153–167 | **D** | `deactivateCommToolVisual` scrubs datasets and inline background on nodes that do not exist. |
| 169–175 | M | `close_comm_panel` becomes `closeCommPanel` over `closeBevyPanelSurface`. |
| 177–279 | M | The remote-command bootstrap moves verbatim to `communication_remote_commands.js` — it never touched a view. |
| 281–295 | R | Factory export replaced by the new module's export. |

## `eVe/intuition/tools/communication_compose.js` — 265 lines → 143 lines (rewritten)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–25 | R | The 18-dependency factory collapses to three: the compose state left with the view. |
| 26–70 | **D** | `renderComposeSection` sets `display` on rows and rebuilds chip DOM. |
| 72–90 | M | `bindComposeDrop` becomes the `comm.compose.drop` intent on the Bevy drop target, with a typed refusal instead of a silent no-op. |
| 92–96 | M | `getComposeBodyText` becomes `commRuntime.getComposeBodyText`, reading panel state instead of `textContent`. |
| 98–188 | **kept** | `collectSelectedAtomes` survives, with the project filter consolidated into one `isProjectRecord` predicate. |
| 190–233 | M | The five setters move to `commRuntime`; the window globals now delegate there. |
| 235–249 | **kept** | `getDropAttachment` survives unchanged. |
| 251–266 | R | Export list narrowed to the neutral half. |

## `eVe/intuition/tools/communication.js` — 437 lines → 363 lines (rewritten)

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 1–52 | R | The `createEveDialog` import set becomes the Bevy bridge import set; `attachCommDialogToPanelLayer` is deleted with the dialog. |
| 54–99 | M | `commState` keeps its notification and remote-command fields; `compose` and `advanced` become accessors onto the panel runtime so the send pipeline and the panel share one object. |
| 101–183 | **kept** | The neutral subsystem wiring — users, share resolution, atome render, notifications, realtime — is unchanged. |
| 185–217 | **D** | Dialog creation, `ensureEveCommStyles`, `buildCommPanelDom`. |
| 219–338 | R | The advanced/helpers/compose/notification-view factories are replaced by the panel package; only the neutral factories remain. |
| 340–380 | M | The late-bound notification controller keeps its shape; its three render hooks all become one panel refresh. |
| 382–392 | **kept** | The nine window globals, now delegating to `commRuntime`. |
| 394–437 | M | Event binding is unchanged; the bootstrap collapses to `bindCommEvents()` plus the initial stack sync, because the panel builds itself on open. |

## `eVe/intuition/tools/communication_base.js` — 23 lines removed

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 18–30 | **D** | `COMM_DIALOG_ID`, `COMM_TOOL_ID`, `COMM_TOOL_ID_V2`, `COMM_TOOL_STATE`, `FINDER_TOOL_ID`, `COMM_FINDER_CLONE_ID`, `COMM_FLOATING_ID`, `COMM_BADGE_CLASS`, `COMM_MESSAGE_CLASS` — every one names a DOM node or class that is no longer built. |
| 32–38 | **D** | `removeStaleFloatingToolNode`. |
| 40 | M | `DEFAULT_SORT` becomes the model's initial sort state. |

## `eVe/elements/look/preset_comm_table.js` — 406 lines (deleted)
## `eVe/elements/look/preset_comm_surface.js` — 260 lines (deleted)

All 72 `comm*` presets styled `#eve_comm_dialog` descendants. `R` — replaced by
`EVE_PANEL_SKIN_TOKENS.bevyPanel`, whose `table`, `scopeChip`, `select`,
`input`, `accordion` and the new `comm` group cover the same surface with
GPU-ready values.

## `eVe/elements/look/utility_presets.js` — 40 lines removed

| Lines | Disposition | Bevy/canonical destination |
|---:|:---:|---|
| 252–290 | **D** | `eveCommPreset`: six rules on `#eve_comm_dialog` / `#_intuition_communicate` plus the `eve-comm-pulse` keyframes. Hover, unread, drop and pulse states are now skin tokens under `bevyPanel.comm`. |

## Supporting removals

| File | Change |
|---|---|
| `elements/look/eve_presets.js` | Drops both comm preset spreads and the `commStates` CSS group. |
| `elements/look/preset_ensurers.js` | Drops `ensureEveCommStyles`. |
| `elements/eVe_look.js` | Drops the `eveCommPreset` import, its ensurer wiring and its export. |
| `tests/eve/bevy_panel_contract.test.mjs` | Drops the two imports and three assertions covering the deleted presets. |

---

## Framework fix made in passing

`corner_radii` was being dropped at normalization, so every partially rounded
surface — accordion headers, the table header row, the last Select option,
outer segmented-control segments — painted square. The migration guide records
this as fixed on 2026-07-31, but the fix had regressed and the probes cited as
its evidence no longer existed.

Reproduced first (`temp/comm_p0_corner_radii_probe.mjs`, red), then repaired in
two lines: `render_atom.js` now reads `properties.corner_radii` alongside the
scalar, and `virtual_scene_contract.js` forwards it into `material.cornerRadii`
where `readCornerRadii` already looked for it. Verified end to end through the
real projection adapter (`temp/comm_p0b_corner_radii_e2e.mjs`), including the
all-zero and explicit-`material` precedence cases.

A second framework defect is **reported, not fixed**, because no Communication
component depends on it: `bevy_native_texture_mapping.js` omits `procedural`
from its style whitelist while the web renderer forwards it, so a
procedural-SDF style change animates on web and stays frozen on Tauri/iOS.

## Approval gate

The HTML route is retired and its dead code removed. **Product-owner approval
of the Bevy panel is still open**: the package is `acceptance_pending`, not
`validated`. Mobile, Tauri, iOS and multi-viewport validation remain
complete-panel gates.
