import assert from 'node:assert/strict';

import {
    calendarRuntimeState,
    calendarSurface
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js';
import { hitTestBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_hit_test_runtime.js';
import { createDashboardActionRuntime } from '../../eVe/domains/dashboard/dashboard_actions.js';

const previousWindow = globalThis.window;
const updates = [];
const creates = [];
const canonicalEvent = {
    id: 'event_drag', title: 'Drag me', source_id: 'calendar_api_primary', source_writable: true,
    start: new Date('2026-08-03T09:00:00.000Z'), end: new Date('2026-08-03T10:00:00.000Z'),
    kind: 'event', status: 'open'
};
const canonicalSources = [
    { source_id: 'calendar_api_primary', writable: true },
    { source_id: 'calendar_shared', writable: false }
];
globalThis.window = {
    AdoleAPI: { projects: { getCurrentId: () => 'project_calendar_canonical' } },
    eveDashboardBevyUiRuntime: {
        state: {
            active: true,
            dataProjectId: '',
            sceneProjectId: '__eve_dashboard_workspace__'
        }
    },
    atome: { calendar: {
        async create(payload, options) {
            creates.push({ payload, options });
            return { ok: true, event: { id: `created_${creates.length}`, ...payload } };
        },
        async update(eventId, changes) {
            updates.push({ eventId, changes });
            return { ok: true, event: { ...canonicalEvent, ...changes } };
        },
        async search() { return { ok: true, items: [canonicalEvent], sources: canonicalSources }; },
        sources() { return { ok: true, items: canonicalSources }; }
    } }
};

const closeOpenedSurface = calendarSurface.onOpen({
    context: { projectId: '__eve_dashboard_workspace__' },
    refresh: () => {}
});
assert.equal(
    calendarRuntimeState.projectId,
    'project_calendar_canonical',
    'Calendar opened over the neutral Dashboard scene must retain the canonical data project scope'
);
closeOpenedSurface();

const openedPanels = [];
let genericEditorCalls = 0;
const dashboardActions = createDashboardActionRuntime({
    destroy: async () => ({ ok: true }),
    openEditor: async () => { genericEditorCalls += 1; },
    openPanel: async (surfaceKey, context) => {
        openedPanels.push({ surfaceKey, context });
        return { ok: true, surface_key: surfaceKey };
    }
});
await dashboardActions.activateItemAction({
    category: { id: 'calendar' },
    item: { id: canonicalEvent.id, payload: { ...canonicalEvent, projectId: 'project_calendar_canonical' } }
});
assert.deepEqual(openedPanels, [{
    surfaceKey: 'calendar',
    context: {
        eventId: canonicalEvent.id,
        projectId: 'project_calendar_canonical',
        source: { type: 'dashboard_calendar_item' }
    }
}], 'a Dashboard Calendar card delegates only its canonical identity to the existing Calendar panel');
assert.equal(genericEditorCalls, 0, 'Calendar cards never enter the duplicated Dashboard summary editor');

const closeDashboardOpenedSurface = calendarSurface.onOpen({
    context: openedPanels[0].context,
    refresh: () => {}
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(calendarRuntimeState.selectedEventId, canonicalEvent.id, 'Calendar selects the canonical event requested by the Dashboard');
assert.equal(calendarRuntimeState.editorMode, 'event', 'the existing Calendar editor opens directly in edit mode');
assert.equal(calendarRuntimeState.draft.title, canonicalEvent.title, 'the editor draft is derived from the canonical Calendar event');
closeDashboardOpenedSurface();
calendarSurface.onClose();
assert.equal(calendarRuntimeState.editorMode, 'none', 'closing the Calendar panel discards the editor projection');
assert.equal(calendarRuntimeState.selectedEventId, '', 'closing the Calendar panel clears its ephemeral selection');
calendarRuntimeState.events = [canonicalEvent];
calendarRuntimeState.view = 'week';
calendarRuntimeState.anchor = new Date(2026, 7, 3, 12);
calendarRuntimeState.bodyWidth = 742;
calendarRuntimeState.viewWidth = 742;
calendarRuntimeState.editorMode = 'none';
calendarRuntimeState.quickDraft = false;

const findNode = (entry, id) => {
    if (!entry) return null;
    if (Array.isArray(entry)) {
        for (const child of entry) {
            const found = findNode(child, id);
            if (found) return found;
        }
        return null;
    }
    if (entry.id === id) return entry;
    return findNode(entry.children || [], id);
};
const findNodeByPrefix = (entry, prefix) => {
    if (!entry) return null;
    if (Array.isArray(entry)) {
        for (const child of entry) {
            const found = findNodeByPrefix(child, prefix);
            if (found) return found;
        }
        return null;
    }
    if (String(entry.id || '').startsWith(prefix)) return entry;
    return findNodeByPrefix(entry.children || [], prefix);
};

await calendarSurface.handleEvent({
    type: 'calendar.event.press', eventId: canonicalEvent.id, nodeId: 'event_node',
    position: [100, 100], height: 48, event: { x: 10, y: 10 }
});
const motions = [];
await calendarSurface.handleEvent({
    type: 'calendar.event.drag', eventId: canonicalEvent.id, event: { x: 110, y: 34 }
}, { patchText: (entries) => motions.push(...entries) });
await calendarSurface.handleEvent({
    type: 'calendar.event.release', eventId: canonicalEvent.id, event: { x: 110, y: 34 }
});

assert.equal(updates.length, 1, 'a real gesture emits one canonical Calendar service update');
assert.equal(updates[0].changes.start.toISOString(), '2026-08-04T09:30:00.000Z', 'drag snaps to one day and thirty minutes');
assert.equal(motions[0].nodeId, 'event_node', 'drag feedback patches the existing Bevy node');
assert.equal(motions[0].opacity, 0.78, 'touch/pointer feedback remains renderer-owned and ephemeral');

calendarRuntimeState.sources = canonicalSources;
calendarRuntimeState.sourceId = '';
await calendarSurface.handleEvent({ type: 'calendar.source.cycle' });
assert.equal(calendarRuntimeState.sourceId, 'calendar_api_primary', 'compact source control cycles canonical filters without adding DOM controls');
await calendarSurface.handleEvent({ type: 'calendar.source.cycle' });
assert.equal(calendarRuntimeState.sourceId, 'calendar_shared');
await calendarSurface.handleEvent({ type: 'calendar.source.cycle' });
assert.equal(calendarRuntimeState.sourceId, '', 'compact source cycling returns to the aggregate view');
const compactContent = calendarSurface.buildContent(calendarSurface.readState(), { bodyWidth: 370, emit: () => {} });
const compactToolbar = compactContent[0];
assert.deepEqual(
    compactToolbar.children.map((child) => child.id),
    ['calendar_add', 'calendar_share', 'calendar_export', 'calendar_source_cycle'],
    'compact toolbar stays inside the canvas width with one reusable source control'
);
const desktopContent = calendarSurface.buildContent(calendarSurface.readState(), { bodyWidth: 760, emit: () => {} });
const desktopToolbar = desktopContent[0];
const desktopWidth = desktopToolbar.children.reduce((sum, child) => sum + child.style.size[0], 0)
    + ((desktopToolbar.children.length - 1) * desktopToolbar.style.gap);
assert.ok(desktopWidth <= 760, 'desktop source controls are bounded by the available panel width');

const emitted = [];
const interactiveContent = calendarSurface.buildContent(calendarSurface.readState(), {
    bodyWidth: 742,
    emit: (intent) => emitted.push(intent)
});
const timeGrid = findNode(interactiveContent, 'calendar_time_grid');
const allDayLane = findNode(interactiveContent, 'calendar_all_day_lane');
const existingEventNode = findNodeByPrefix(interactiveContent, 'calendar_timed_event_event_drag');
assert.equal(
    hitTestBevyUiNode(timeGrid, { x: 700, y: 1100 }, null, { x: 0, y: 0, width: 742, height: 1152 })?.node?.id,
    'calendar_time_grid',
    'the real Bevy hit-test can target empty time-grid geometry'
);
assert.equal(
    hitTestBevyUiNode(allDayLane, { x: 700, y: 20 }, null, { x: 0, y: 0, width: 742, height: 36 })?.node?.id,
    'calendar_all_day_lane',
    'the real Bevy hit-test can target the empty all-day lane'
);
assert.equal(
    hitTestBevyUiNode(timeGrid, {
        x: existingEventNode.style.position[0] + (existingEventNode.style.size[0] / 2),
        y: existingEventNode.style.position[1] + (existingEventNode.style.size[1] / 2)
    }, null, { x: 0, y: 0, width: 742, height: 1152 })?.node?.id,
    existingEventNode.id,
    'an existing event keeps hit-test priority over the quick-create surface'
);
calendarRuntimeState.view = 'month';
const monthContent = calendarSurface.buildContent(calendarSurface.readState(), { bodyWidth: 742, emit: () => {} });
const monthCell = findNode(monthContent, 'calendar_month_day_10');
assert.equal(
    hitTestBevyUiNode(monthCell, { x: 50, y: 50 }, null, { x: 0, y: 0, width: 106, height: 88 })?.node?.id,
    'calendar_month_day_10',
    'the real Bevy hit-test can target an empty month cell'
);
calendarRuntimeState.view = 'week';
timeGrid.on.double_click({ x: 192, y: 456 });
assert.equal(emitted[0].type, 'calendar.quick_create', 'the Bevy time grid owns quick-create without a DOM target');
assert.equal(emitted[0].draft.start.getMinutes(), 30, 'the emitted draft is snapped by the projection owner');

calendarRuntimeState.sourceId = 'calendar_api_primary';
await calendarSurface.handleEvent(emitted[0]);
let snapshot = calendarSurface.readState();
assert.equal(snapshot.editorMode, 'new');
assert.equal(snapshot.draftPreview.draft, true, 'quick-create remains an ephemeral renderer projection');
assert.equal(snapshot.draft.source_id, 'calendar_api_primary', 'a selected writable source receives the quick draft');
assert.equal(creates.length, 0, 'quick-create does not persist before title validation');

const draftId = snapshot.selectedEventId;
await calendarSurface.handleEvent({
    type: 'calendar.event.press', eventId: draftId, nodeId: 'draft_node',
    position: [100, 100], height: 48, event: { x: 10, y: 10 }
});
await calendarSurface.handleEvent({
    type: 'calendar.event.release', eventId: draftId, event: { x: 10, y: 34 }
});
assert.equal(new Date(calendarSurface.readState().draft.start).getMinutes(), 0, 'draft drag updates the editor start by thirty snapped minutes');
await calendarSurface.handleEvent({
    type: 'calendar.event.resize_press', edge: 'end', eventId: draftId, nodeId: 'draft_resize',
    position: [100, 100], height: 48, event: { x: 10, y: 10 }
});
await calendarSurface.handleEvent({
    type: 'calendar.event.resize_release', edge: 'end', eventId: draftId, event: { x: 10, y: 34 }
});
assert.equal(
    new Date(calendarSurface.readState().draft.end) - new Date(calendarSurface.readState().draft.start),
    90 * 60000,
    'dragging the timed draft bottom extends its duration on the fifteen-minute grid'
);
calendarRuntimeState.draft.title = 'Created once';
await calendarSurface.handleEvent({ type: 'calendar.editor.save' });
assert.equal(creates.length, 1, 'title validation emits exactly one canonical create');
assert.equal(calendarSurface.readState().editorOpen, false, 'successful creation restores the full-width calendar');

await calendarSurface.handleEvent({
    type: 'calendar.quick_create',
    draft: { start: new Date(2026, 7, 2), end: new Date(2026, 7, 3), allDay: true }
});
calendarRuntimeState.view = 'month';
snapshot = calendarSurface.readState();
await calendarSurface.handleEvent({
    type: 'calendar.event.press', eventId: snapshot.selectedEventId, nodeId: 'month_draft',
    view: 'month', monthDayIndex: 6, monthColumnWidth: 100, monthCellHeight: 88,
    position: [600, 23], height: 18, event: { x: 10, y: 10 }
});
await calendarSurface.handleEvent({
    type: 'calendar.event.release', eventId: snapshot.selectedEventId, event: { x: 10, y: 98 }
});
assert.equal(new Date(calendarSurface.readState().draft.start).getDate(), 9, 'month drag crosses a week row as seven calendar days');
await calendarSurface.handleEvent({
    type: 'calendar.event.resize_press', edge: 'end', eventId: snapshot.selectedEventId, nodeId: 'month_draft',
    view: 'month', monthDayIndex: 13, monthColumnWidth: 100, monthCellHeight: 88,
    width: 96, position: [600, 111], height: 18, event: { x: 10, y: 10 }
});
await calendarSurface.handleEvent({
    type: 'calendar.event.resize_release', edge: 'end', eventId: snapshot.selectedEventId,
    event: { x: 110, y: 10 }
});
assert.equal(new Date(calendarSurface.readState().draft.end).getDate(), 11, 'month end resize extends the draft by one whole day');
await calendarSurface.handleEvent({ type: 'calendar.editor.new' });
assert.equal(creates.length, 1, 'closing the active New mode discards its draft without persistence');
assert.equal(calendarSurface.readState().editorOpen, false);

await calendarSurface.handleEvent({ type: 'calendar.editor.new' });
assert.equal(calendarSurface.readState().editorMode, 'new');
const activeNewContent = calendarSurface.buildContent(calendarSurface.readState(), { bodyWidth: 760, emit: () => {} });
assert.ok(findNode(activeNewContent, 'calendar_add').style.border, 'the active New command reuses the outlined button state');
await calendarSurface.handleEvent({ type: 'calendar.editor.new' });
assert.equal(calendarSurface.readState().editorMode, 'none', 'a second New click toggles the editor closed');
const restoredContent = calendarSurface.buildContent(calendarSurface.readState(), { bodyWidth: 760, emit: () => {} });
assert.equal(findNode(restoredContent, 'calendar_composition'), null, 'closing the command restores the full-width calendar');
await calendarSurface.handleEvent({ type: 'calendar.share.open' });
assert.equal(calendarSurface.readState().editorMode, 'share');
assert.ok(
    findNode(calendarSurface.buildContent(calendarSurface.readState(), { bodyWidth: 760, emit: () => {} }), 'calendar_share').style.border,
    'the active Share command reuses the outlined button state'
);
await calendarSurface.handleEvent({ type: 'calendar.share.open' });
assert.equal(calendarSurface.readState().editorMode, 'none', 'a second Share click toggles the share panel closed');
await calendarSurface.handleEvent({ type: 'calendar.editor.new' });
await calendarSurface.handleEvent({ type: 'calendar.share.open' });
assert.equal(calendarSurface.readState().editorMode, 'share', 'switching commands replaces the active panel directly');
await calendarSurface.handleEvent({ type: 'calendar.editor.close' });

Object.assign(calendarRuntimeState, {
    editorMode: 'event',
    selectedEventId: canonicalEvent.id,
    draft: {
        id: canonicalEvent.id, title: 'Todo through editor', description: '', location: '',
        start: '2026-08-05T14:00', end: '', timezone: 'Europe/Paris', kind: 'todo', status: 'done',
        allDay: false, alarms: '[]', recurrence: 'null', source_id: 'calendar_api_primary', calendarId: 'default'
    }
});
await calendarSurface.handleEvent({ type: 'calendar.editor.save' });
assert.equal(updates[1].changes.kind, 'todo', 'the Bevy editor writes todo semantics through the canonical service');
assert.equal(updates[1].changes.status, 'done');
assert.equal(updates[1].changes.dueAt.getTime(), updates[1].changes.start.getTime(), 'todo due time mirrors start');
assert.ok(updates[1].changes.completedAt instanceof Date, 'completing a todo records completion time');

if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

console.log('calendar_runtime_contract: ok');
