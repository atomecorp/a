# Communication panel — surface freeze

Date: 2026-08-07
Status: `frozen`

This is the binding scope freeze for the Communication product-panel migration
(Package 13). The rule it obeys comes from `finder_place_map_package.md`: the
complete surface — every mode, every view, **including anything that looks hard
to port** — is written down before composition starts. Finder's `place` scope
was nearly deleted mid-migration for exactly the lack of this document.

Nothing listed below may be dropped during the migration. A row can only change
disposition through an explicit product decision recorded *in this file*.

## Scale

The legacy surface is **5 324 lines across 18 modules** (`communication*.js`),
the largest panel remaining in the programme.

| Module | Lines | Nature |
|---|---:|---|
| `communication.js` | 437 | composition root + `createEveDialog` |
| `communication_panel_dom.js` | 470 | **DOM tree builder** — view |
| `communication_events.js` | 431 | window listeners + send pipeline — mostly neutral |
| `communication_share_resolve.js` | 401 | share resolution — **neutral** |
| `communication_atome_render.js` | 401 | visual atome rendering — **neutral** |
| `communication_advanced.js` | 398 | advanced panel — view |
| `communication_notifications_render.js` | 389 | table/badge — view |
| `communication_notifications.js` | 372 | notification stack sync — **neutral** |
| `communication_users.js` | 347 | user directory — **neutral** |
| `communication_lifecycle.js` | 294 | open/close, tool latch, finder clone — mixed |
| `communication_actions.js` | 271 | accept/refuse/archive — **neutral** |
| `communication_compose.js` | 265 | compose render + setters + drop — mixed |
| `communication_realtime.js` | 221 | realtime sync — **neutral** |
| `communication_panel_helpers.js` | 194 | format + chip render — mixed |
| `communication_atome_model.js` | 145 | record normalizers — **neutral** |
| `communication_tool_dom.js` | 107 | tool badge + message bubble — view |
| `communication_base.js` | 96 | constants + resolvers — **neutral** |
| `communication_media_source.js` | 85 | protected media — **neutral** |

---

## 1. Panel chrome

`communication.js:185-212`

| Property | Value |
|---|---|
| id | `eve_comm_dialog` → becomes `eve_bevy_panel_communicate` |
| title | `eve.comm.panel.title` = "Communication" |
| geometry | `left 160`, `top 110`, `width 520`, `height 620`, `minHeight 620` |
| resize | `both` |
| close | `showClose: true`, `onClose → window.close_comm_panel()` |
| body | `overflowY: auto` — the single scrollable region |
| attach | `attachEveDialogToPanelLayer(root, { defer: true, maxWaitMs: 12000 })` |
| initial | `root.style.display = 'none'` |

The Bevy shell (`buildBevyPanelTree`) already provides header, scrolling body,
fixed action row, footer with title/close/resize/drag. No chrome is rebuilt.

---

## 2. Section A — Notifications

Container `comm_notifications_section` → `comm_notifications_table` →
`comm_table_scroll` → `comm_table_header` + `comm_table_body`.
`communication_panel_dom.js:12-24, 441-460`

### Header — 4 sortable columns

`communication_panel_dom.js:462-467`, built in
`communication_notifications_render.js:30-59`

| Key | Label key | FR | EN |
|---|---|---|---|
| `date` | `eve.comm.table.date` | Date | Date |
| `name` | `eve.comm.table.name` | Nom | Name |
| `message` | `eve.comm.table.message` | Message | Message |
| `actions` | `eve.comm.table.actions` | Actions | Actions |

- Each cell carries a `comm_sort_indicator` span showing `^` (asc) or `v`
  (desc), blank on non-active columns (`:71-80`).
- `pointerdown` toggles direction on the active key, otherwise switches key and
  resets to `asc` (`applySort`, `:61-69`).
- Sort values per key (`communication_panel_helpers.js:130-137`): `date` →
  epoch ms; `name` → `fromName || from` lowercased; `message` →
  `subject || message` lowercased; `actions` → action count.
- Default sort: `DEFAULT_SORT` from `communication_base.js`.

→ Bevy: `sortableHeaderNode` (Family 14, validated with Finder).

### Rows

`communication_notifications_render.js:169-234`

- `comm_table_row`, `data-unread="true|false"`.
- `pointerdown` anywhere except an action button marks the item read
  (`markNotificationRead`).
- Cells: date (`formatDate` → `toLocaleString`), name (`fromName || from`),
  message (`subject || message`), actions.
- Deduplication by `id` keeping the most recent `date` (`:146-160`).
- Archived items are filtered out of the visible list (`getVisibleNotifications`).

### Row actions

`resolveActionList` (`:82-104`):

- explicit `item.actions` array wins;
- otherwise `accept` + `refuse` when `kind` is `connection-request` or
  `share-request`;
- `archive` is always appended.

| Action | Label key | FR | EN |
|---|---|---|---|
| `accept` | `eve.comm.action.accept` | Accepter | Accept |
| `refuse` | `eve.comm.action.refuse` | Refuser | Decline |
| `archive` | `eve.comm.action.archive` | Archiver | Archive |

Handlers live in `communication_actions.js` (`handleAction`) — **neutral, reused
unchanged**.

### Empty state

`eve.comm.table.empty` ("Aucune notification" / "No notifications") and the
`commTableEmpty` / `commTableEmptyLabel` presets exist but are **dead**:
`updateNotificationsSectionVisibility` (`:108-117`) hides the whole section
instead. **Product decision: the Bevy panel renders the empty state** through
the shared `panelStateNode` rather than hiding the section. See defect D4.

### Tool decorations (outside the panel body)

`communication_tool_dom.js` — on `#_intuition_communicate` / `COMM_TOOL_ID`:

- `.eve-comm-badge` unread counter, hidden at zero (`:28-39`, updated
  `_notifications_render.js:266-278`);
- `.eve-comm-message` scrolling message bubble on new notification (`:15-26,
  67-102`, driven by `showQueuedNotifications`);
- `eve-comm-pulse` class while unread > 0 (`setToolPulse`).

The tool button itself is already a Bevy main-menu item. These decorations must
be reprojected onto that Bevy tool, not onto a DOM node. `watchMenuVisibility`
observes `#toolbox` style/class/aria-hidden mutations; with the menu on Bevy the
observer target no longer exists as an authoritative source — the visibility
must come from the menu runtime.

---

## 3. Section B — Compose

`comm_compose_section` → `comm_compose_columns` → `comm_compose_left` +
`comm_compose_right`. `communication_panel_dom.js:26-52`

### Left column

| Element | Source | Notes |
|---|---|---|
| Message body | `:54-61` | `createEveEditableText`, placeholder `eve.comm.compose.body.placeholder` ("Ecrire un message..." / "Write a message..."). Read through `getComposeBodyText` which returns `''` when the placeholder flag is set. |
| Attachments row | `:63-68` | `comm_compose_attachments`, hidden when empty; chips `comm_attachment_chip` carrying `data-comm-attachment-id` (`_panel_helpers.js:82-101`) |
| Reply row | `:70-75` | `comm_compose_reply`, hidden when no reply; renders a `comm_reply_block` with `formatReplySummary` = `date • sender • subject • body` (`_panel_helpers.js:48-55`) |
| Reply attachments row | `:77-82` | same chip rendering |
| Drop target | `_compose.js:72-90` | `dragover`/`dragleave`/`drop` on the left column, `.eve-comm-drop` class while hovering. Payload read from `application/x-eve-atome` (JSON) then `text/plain` (`getDropAttachment`, `:235-249`). → **Family 11**. |

### Right column

| Element | Source | Notes |
|---|---|---|
| Title | `:84-92` | `eve.comm.recipients.title` — "Destinataires" / "Recipients" |
| Recipients list | `:94-99` | `comm_recipient_chip` per entry (`_panel_helpers.js:103-128`); defaults to a single `all` chip localized through `eve.comm.recipients.all` |
| New recipient input | `:101-124` | placeholder `eve.comm.recipients.new.placeholder`; on change, dedupes into `commState.compose.recipients`, re-renders, and calls `recordManualRecipient` — **currently throws, see D1** |

**Gap to close:** chips have no remove affordance today. The Bevy list gets a
per-chip remove control (same reasoning as the Finder filter rows, which gained
a per-row delete during their migration).

### Controls row

`comm_compose_controls` (`:126-182`)

| Element | Source | Behaviour |
|---|---|---|
| Subject input | `:133-145` | placeholder `eve.comm.subject.placeholder`; writes `commState.compose.subject` on every input |
| **Visio** button | `:154-162` | dispatches `eve-comm-visio` — **no listener exists, see D3** |
| **Avancé** button | `:164-172` | toggles the advanced panel; carries an active style while open (`updateAdvancedButtonState`) |
| **Envoyer** button | `:174-182` | dispatches `eve-comm-send`; primary variant |

→ Bevy: this row becomes `buildFixedContent`, pinned above the footer so it
never scrolls away.

### Compose state and its public setters

`commState.compose = { attachments, reply, replyAttachments, recipients:
['all'], subject }` (`communication.js:70-76`).

Setters exposed on `window` (`communication.js:382-392`) and reused verbatim:
`eveCommSetAttachments`, `eveCommAddAttachments`, `eveCommSetReply`,
`eveCommSetReplyAttachments`, `eveCommSetRecipients`. All dedupe by id and drop
the current project id (`_compose.js:190-233`).

`collectSelectedAtomes` (`_compose.js:98-188`) runs on panel open: it reads the
canonical selection, filters out the current project and any `project`-typed
record, and preloads them as attachments. **Neutral, reused unchanged.**

---

## 4. Section C — Advanced panel

`comm_advanced_panel` → `comm_advanced_grid`, `display:none` by default.
`communication_panel_dom.js:184-425`, behaviour in `communication_advanced.js`.

Six sections: Read, Write, Start, End, Mode, Condition (`:217-222`).

### Read / Write

- Button label is composed: `Read`/`Write` + current mode label, where the mode
  is `All` (`eve.comm.property.mode.all`) or `Open`
  (`eve.comm.property.mode.open`) — `_advanced.js:95-104`.
- Clicking toggles an inline `comm_property_panel` (`_advanced.js:242-252`);
  opening one closes the other.
- The property panel (`_advanced.js:14-83`) holds:
  - title `eve.comm.property.title` ("Propriétés" / "Properties");
  - `comm_property_list` with **8 toggleable properties**:

| Key | Label key | Label |
|---|---|---|
| `top` | `eve.comm.property.top` | Top |
| `left` | `eve.comm.property.left` | Left |
| `width` | `eve.comm.property.width` | Width |
| `height` | `eve.comm.property.height` | Height |
| `color` | `eve.comm.property.color` | Color |
| `opacity` | `eve.comm.property.opacity` | Opacity |
| `rotate` | `eve.comm.property.rotate` | Rotate |
| `scale` | `eve.comm.property.scale` | Scale |

  - three actions: **All** (clears the selection and forces mode `all`),
    **Cancel** (closes without applying), **OK** (commits
    `readProps`/`writeProps` and sets the mode to `open` when non-empty,
    `all` otherwise).
- Selection is held in a temporary array until OK, so Cancel truly discards.

→ Bevy: `toggleableRowNode` for the 8 properties, `buttonNode` for the actions,
`buildOverlayContent` for the floating panel.

### Start

- Button label = current mode (`_advanced.js:117-137`).
- Menu options (`:278-286`): `Immediate` (`eve.comm.advanced.start.immediate`),
  `Date` (`.start.date`), `Duration` (`.start.duration`).
- Inline row visibility (`updateInlineVisibility`, `:106-115`): hidden on
  `immediate`; date input shown on `date`; the hh/mm/ss trio shown on
  `duration`.
- Date input placeholder `eve.comm.advanced.date.placeholder` ("Date/Heure").
- Duration inputs `hh` / `mm` / `ss`
  (`eve.comm.advanced.duration.{h,m,s}`) writing
  `commState.advanced.startDuration.{h,m,s}`.

### End

Identical structure. Menu options (`:288-296`): `Undefined`
(`eve.comm.advanced.end.undefined`), `Date`, `Duration`. Writes
`endMode`, `endDate`, `endDuration`.

`endDuration` is the only advanced field that actually reaches the wire today —
`_events.js:223` sends it as `duration`.

### Mode

Button + menu (`:298-306`): `Realtime` (`eve.comm.advanced.mode.realtime`),
`One shot` (`.mode.oneshot`), `Send a copy` (`.mode.copy`). Writes
`commState.advanced.shareMode`.

Mapping to the wire (`_panel_helpers.js:24-33`):

| UI mode | server mode | share type |
|---|---|---|
| `realtime` | `real-time` | `linked` |
| `oneshot` | `manual` | `copy` |
| `copy` | `manual` | `copy` |

`normalizeCommShareMode` accepts a broad set of aliases and falls back to
`realtime`. **Neutral, reused unchanged.**

### Condition

- `comm_conditions_list` + a **`+`** add button (`_panel_dom.js:404-417`).
- Each row (`_advanced.js:321-380`): `IF` label
  (`eve.comm.advanced.condition.if`), a field `<select>`, an operator
  `<select>`, a `Value` input (`eve.comm.advanced.condition.value`), and a
  **`-`** remove button.

| Field | Label key |
|---|---|
| `location` | `eve.comm.advanced.condition.field.location` |
| `date` | `eve.comm.advanced.condition.field.date` |
| `user` | `eve.comm.advanced.condition.field.user` |

| Operator | Label key | Label |
|---|---|---|
| `is` | `.op.is` | IS |
| `is_not` | `.op.is_not` | IS NOT |
| `gt` | `.op.gt` | GREATER THAN |
| `lt` | `.op.lt` | LESS THAN |

**Product decision: the Bevy rows are state-backed.** Today the selects and the
input carry no change handler, so `commState.advanced.conditions` stays `[]`
forever while the send path already reads it (`_events.js:224`). See defect D5.

### Menu behaviour

`toggleMenu` (`_advanced.js:145-151`) closes every other menu before opening
one. Closing the advanced panel closes all menus and both property panels
(`toggleAdvancedPanel`, `:153-162`).

### Advanced state

`commState.advanced = { open, readMode, readProps, writeMode, writeProps,
startMode, startDate, startDuration{h,m,s}, endMode, endDate,
endDuration{h,m,s}, shareMode, conditions }` (`communication.js:77-91`).

---

## 5. Section D — Search

`comm_search_section` → `comm_search_container` (`_panel_dom.js:427-439`),
populated by `mountFinderToolClone` (`_lifecycle.js:26-83`).

The legacy implementation clones the Finder **DOM tool node** through
`window.eveToolCloneApi.cloneTool({ mode: 'dom', domId: FINDER_TOOL_ID, cloneId:
'eve_comm_finder_tool_clone', stripIds: true, cloneBehavior: 'independent',
bindAction: true })`, retrying every 200 ms until the API and the node exist. It
also defensively removes a stray `eve_finder_dialog` node from its container.

**This cannot be ported as-is:** Finder became a Bevy surface on 2026-08-07 and
its HTML dialog was retired, so there is no DOM node left to clone and
`eve_finder_dialog` no longer exists.

**Product decision — the search stays, the clone goes.** The Bevy panel composes
its own search affordance and routes it through the canonical Finder entry
points already exported by `tools/finder.js`:
`window.__eveFinder.quickSearch({ query, scope, openPanel })` and
`refreshProjection`. This is the `finder_place_map_package.md` rule applied:
the *behaviour* migrates, the *DOM plumbing* is deleted.

The `commSearchTitle` preset and the `eve.comm.search.title` key ("Recherche")
exist but no title element is built today; the Bevy section renders it.

---

## 6. Lifecycle

### Open — `_lifecycle.js:85-110`

1. attach to panel layer; show the dialog;
2. `commState.panelOpen = true`;
3. `await syncNotificationStack('panel_open')`;
4. `await logMessageAtomes('panel_open')`;
5. reset body scroll to top;
6. build the header if empty;
7. `collectSelectedAtomes()` → `setComposeAttachments(...)`, swallowing errors;
8. `renderNotifications()`, `renderComposeSection()`, `mountFinderToolClone()`.

Steps 3, 4, 7 are canonical work and move into `onOpen`. Steps 1, 5, 6, 8 are
shell concerns the Bevy runtime already owns.

### Close — `_lifecycle.js:169-175`

`deactivateCommToolVisual()` then hide. The visual deactivation
(`:112-167`) clears `simpleActive`/`activeTag`/`expanded`/`latched` datasets and
the inline background on every comm tool DOM node, calls
`getMainMenuRuntime().setToolLatchedState({ tool_id, nameKey, latched: false })`
and dispatches `eve:tool-state-changed` with
`route: 'communication.close_comm_panel'`.

The menu runtime call and the event are canonical and stay. The dataset/style
scrubbing targets DOM tool nodes that no longer exist once the menu is Bevy —
it is deleted, not ported.

### Remote commands — `_lifecycle.js:177-279`

`ensureRemoteCommandsReady` registers the `eve-comm-share` handler on
`RemoteCommands`, retries registration every 1 s and start every 3 s, and
back-offs 30 s on a protocol error. **Neutral, reused unchanged.**

---

## 7. Window events

`communication_events.js:34-426` — all bound at bootstrap.

| Event | Effect |
|---|---|
| `squirrel:user-logged-out` | full state reset, realtime cleanup, hide panel, stop remote commands, clear allowed senders, refresh badge |
| `squirrel:auth-checked` | ensure remote commands, `syncNotificationStack('auth_checked')` |
| `squirrel:user-logged-in` | same with the event's `userId` |
| `eve-comm-send` | the send pipeline (below) |
| `adole-new-message` | `addNotification` with kind `message` or `connection-request` |
| `adole-share-request` | `addNotification` with kind `share-request`, actions `['accept','refuse']` |
| `eve-comm-visio` | **nothing listens — see D3** |

Dispatched by the panel: `eve-comm-visio`, `eve-comm-send`,
`eve-comm-broadcast` (payload), `eve-comm-error` (unshareable atomes).

### Send pipeline — `_events.js:77-390`

Subject defaults to `eve.comm.send.default_subject` ("Partage" / "Share"),
message to `eve.comm.send.default_message`. Recipients default to `['all']`,
which resolves to every public user. Recipients are classified through
`classifyRecipients` with `loadAcceptedRelationships()`; private users that were
never accepted are rejected. Attachment ids are filtered against the current
project and `project`-typed records, then through `resolveShareableAtomeIds`.
Sharing goes through `ShareAPI.share_with`, else `api.sharing.request`, else
`api.sharing.share`, per target, collecting a request reference. Notifications
are then pushed with `RC.sendCommand(targetId, 'eve-comm-share', …)`.
Attachments are cleared after a successful share.

**Entirely renderer-neutral except two lines** — `commDialog.root.style.display`
at logout (`:59-61`) and the `renderComposeSection()` repaint (`:388`). Both
become a panel refresh call. The module is otherwise reused unchanged.

---

## 8. Contracts that must survive unchanged

Globals (`communication.js:152-155, 382-392`):

`open_comm_panel`, `close_comm_panel`, `eveCommNotify`, `eveCommMarkRead`,
`eveCommSetAttachments`, `eveCommAddAttachments`, `eveCommSetReply`,
`eveCommSetReplyAttachments`, `eveCommSetRecipients`, plus the conditional
`createVisualAtome` and `loadProjectAtomes` installs.

Registry: `tool_id: 'ui.comm.panel'`, `surface_key: 'communicate'`,
`ttl_ms: PANEL_TTL_MS.HEAVY`, `open_fn: 'open_comm_panel'`,
`close_fn: 'close_comm_panel'`.

Entry points that reach this panel: main menu
(`main_menu_content_runtime.js:123, 336`), flower context menus
(`flower_context_items_runtime.js:4,5,7`), the atome edit footer for svg /
image / video / sound / audio / group (`atome_edit_footer_model_runtime.js:3-8,
188`), tool routing (`tool_runtime.js:134`), project drop targets
(`project_drop_constants.js:39`).

---

## 9. Known defects frozen into scope

These are repaired by the migration, not carried over.

| # | Defect | Source |
|---|---|---|
| D1 | `recordManualRecipient` is called without being imported → `ReferenceError` on every manually typed recipient. It throws *after* the state update, so the chip appears, the relationship is never recorded, and the line clearing the input is unreachable. | `_panel_dom.js:120` vs `relationship_store.js:66` |
| D2 | `writePropertyPanel` / `readPropertyPanel` used bare instead of `commEls.*` → the **Write** advanced button throws. | `_advanced.js:219, 243, 244` |
| D3 | The **Visio** button dispatches `eve-comm-visio` and nothing in the repository listens. | `_panel_dom.js:161` |
| D4 | The empty state is dead: presets and the `eve.comm.table.empty` key exist, but the section is hidden instead. Same for `commSearchTitle` / `eve.comm.search.title`. | `_notifications_render.js:108-117` |
| D5 | Condition rows are decorative: no change handler writes `commState.advanced.conditions`, yet the send path reads it. Conditions are always sent as `null`. | `_advanced.js:321-380` vs `_events.js:224` |
| D6 | **The unread badge, the message bubble and the pulse have been dead since the DOM main menu was retired.** They target `#_intuition_communicate` and `#toolbox`; a repo-wide search finds no code that builds either node. The badge silently stopped counting and nothing reported it. | `_tool_dom.js`, `_notifications_render.js:240-314` |

D3 needs a product decision at composition time: implement a visio entry point
or delete the button. Until that decision is recorded here, **the button stays
and keeps dispatching its event** — a migration does not silently remove a
control.

D6 cannot be repaired inside this package. Projecting an unread badge onto the
Bevy main-menu item needs a menu-side capability that does not exist —
`bevy_ui_product_registry.js` exposes `setToolLatchedState` and nothing else —
and building one would mean owning a shared main-menu module from a panel
workstream, which the non-collision rule forbids. **Disposition: the unread
count moves to the panel footer status line, which the panel does own; the
menu badge is recorded `blocked` on a main-menu badge capability.**

---

## 10. Reuse boundary

**Reused unchanged** (renderer-neutral): `communication_base.js`,
`communication_users.js`, `communication_share_resolve.js`,
`communication_realtime.js`, `communication_notifications.js`,
`communication_actions.js`, `communication_atome_model.js`,
`communication_atome_render.js`, `communication_media_source.js`.

**Reused after removing their DOM lines**: `communication_events.js`,
`communication_lifecycle.js` (remote-command half), the pure helpers in
`communication_panel_helpers.js` (`normalizeCommShareMode`,
`resolveCommShareConfig`, `formatDate`, `getNotificationLabel`,
`formatReplySummary`, `normalizeAttachment`, `resolveSortValue`,
`resolveAtomeId`, `resolveAtomeLabel`, `normalizeAtomeRecord`), and the state
half of `communication_compose.js`.

**Retired**: `communication_panel_dom.js`, `communication_advanced.js`,
`communication_notifications_render.js` (view half),
`communication_tool_dom.js`, `createPlainTextElement` /
`renderAttachmentList` / `renderRecipients`, `mountFinderToolClone`,
`deactivateCommToolVisual`'s DOM scrubbing, the 72 `comm*` presets, and
`ensureEveCommStyles`.

Retirement happens only after product-owner approval of the Bevy panel, per the
programme's per-panel rule.
