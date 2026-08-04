import assert from 'node:assert/strict';

import {
    calendarRuntimeState,
    calendarSurface
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_calendar_runtime.js';
import { createDashboardDataAdapters } from '../../eVe/domains/dashboard/dashboard_data_adapters.js';
import { getActiveTextEditor } from '../../eVe/domains/rendering/hidden_text_service_runtime.js';
import { sanitizeAtomeProperties } from '../../atome/src/shared/atome_contract.js';
import { installDom } from './unified_rendering_test_helpers.mjs';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
const projectId = 'calendar_persistence_project';
const records = new Map();
const dom = installDom('<!doctype html><html><body></body></html>');
Object.assign(dom.window, {
    eveDashboardBevyUiRuntime: {
        state: { active: true, dataProjectId: projectId, sceneProjectId: '__eve_dashboard_workspace__' }
    },
    Atome: {
        async commit(payload) {
            if (payload.kind === 'delete') records.delete(payload.atome_id);
            else records.set(payload.atome_id, {
                atome_id: payload.atome_id,
                type: payload.type || 'generic',
                project_id: payload.project_id || projectId,
                properties: sanitizeAtomeProperties(payload.props || {})
            });
            return { ok: true };
        },
        async getStateCurrent(atomeId) {
            return records.get(atomeId) || null;
        },
        async listStateCurrent(requestedProjectId) {
            return Array.from(records.values()).filter((record) => (
                !requestedProjectId || record.project_id === requestedProjectId
            ));
        }
    }
});

Object.assign(calendarRuntimeState, {
    view: 'day', anchor: new Date(2026, 7, 3, 12), events: [], sources: [], sourceId: '',
    editorMode: 'none', quickDraft: false, selectedEventId: '', draft: {}, saving: false
});
const cleanup = calendarSurface.onOpen({ context: {}, refresh: () => {} });
for (let attempt = 0; attempt < 10 && calendarRuntimeState.loading; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.equal(calendarRuntimeState.projectId, projectId, 'Calendar persists into the active Dashboard data project');
let refreshCount = 0;
const opened = await calendarSurface.handleEvent({
    type: 'calendar.quick_create',
    draft: {
        start: new Date(2026, 7, 3, 9),
        end: new Date(2026, 7, 3, 10),
        allDay: false
    }
}, { refresh: () => { refreshCount += 1; } });
assert.equal(opened.revealNodeId, 'calendar_editor_title', 'quick-create requests the focused title field to be revealed');
const editor = getActiveTextEditor();
assert.ok(editor?.isConnected, 'quick-create mounts the existing hidden text service editor');
editor.value = 'Persisted Calendar event';
editor.setSelectionRange(editor.value.length, editor.value.length);
editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
assert.equal(calendarRuntimeState.draft.title, 'Persisted Calendar event', 'native text input updates the projected draft title');
const findProjectedDraftLabel = (entry) => {
    if (!entry) return null;
    if (Array.isArray(entry)) {
        for (const child of entry) {
            const found = findProjectedDraftLabel(child);
            if (found) return found;
        }
        return null;
    }
    if (String(entry.id || '').includes('calendar_timed_event___calendar_quick_draft__')
        && String(entry.id || '').endsWith('_label')) return entry;
    return findProjectedDraftLabel(entry.children || []);
};
const projectedDraftLabel = findProjectedDraftLabel(calendarSurface.buildContent(
    calendarSurface.readState(),
    { bodyWidth: 948, emit: () => {} }
));
assert.equal(projectedDraftLabel?.text, 'Persisted Calendar event', 'typed text is projected immediately on the draft event');
editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
for (let attempt = 0; attempt < 20 && calendarSurface.readState().editorMode !== 'none'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
assert.equal(calendarSurface.readState().editorMode, 'none', `Enter validates and closes the draft: ${calendarSurface.readState().editorError || ''}`);
assert.ok(refreshCount > 0, 'title editing and validation request renderer refreshes');

const eventRecords = Array.from(records.values()).filter((record) => (
    record.type === 'calendar_event'
));
assert.equal(eventRecords.length, 1, 'validation commits exactly one durable calendar_event Atome');
assert.equal(
    calendarSurface.readState().events.some((event) => event.title === 'Persisted Calendar event'),
    true,
    'the saved event survives the Calendar reload performed after creation'
);

const adapters = createDashboardDataAdapters();
const dashboardItems = await adapters.list(
    { id: 'calendar', data_source: 'calendar' },
    { projectId }
);
assert.equal(dashboardItems.length, 1, 'the Dashboard Calendar lane reads the persisted event');
assert.equal(dashboardItems[0].title, 'Persisted Calendar event');

cleanup();
globalThis.window = previousWindow;
globalThis.document = previousDocument;
console.log('calendar_persistence_contract: ok');
