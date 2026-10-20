import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createProgramActivityConfigurationControl } from '../../eVe/domains/programs/program_activity_configuration_control.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { normalizeCanonicalAtome } from '../../atome/src/shared/atome_contract.js';
import { buildMatrixToolDefinitions } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_matrix_defs.js';
import { assertIdempotentEventReplay } from '../../atome/src/shared/adole_event_contract.js';
// Isolate the platform facade; importing a project reader must not start account bootstrap in this unit fixture.
vi.mock('../../atome/src/squirrel/apis/unified/adole_apis.js', () => ({ AdoleAPI: {}, default: {} }));

const walk = node => [node, ...(node.children || []).flatMap(walk)];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const fixture = () => {
    registerCoreAtomeTypes();
    const dom = new JSDOM('<body></body>', { url: 'http://localhost:3001', pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
    let actor = 'alice', sequence = 0;
    const records = new Map(), events = new Map(), writes = [], onCreated = vi.fn(), refresh = vi.fn();
    const runtime = createProjectProgramRuntime({ actor: () => actor, project: () => '', read: async id => records.get(id),
        syncShopping: async () => ({ ok: true, changed: 0 }),
        list: async () => [...records.values()], commitActivity: async event => {
            expect(event.scope).toBe('global'); expect(event).not.toHaveProperty('project_id');
            if (events.has(event.id)) { assertIdempotentEventReplay(events.get(event.id), event); return { ok: true }; }
            const previous = records.get(event.atome_id);
            const type = event.type || previous?.type, properties = { ...previous?.properties, ...event.props };
            normalizeCanonicalAtome({ id: event.atome_id, type, properties });
            events.set(event.id, structuredClone(event));
            records.set(event.atome_id, { id: event.atome_id, type, owner_id: event.actor, properties });
            writes.push(event); return { ok: true };
        } });
    const gateway = vi.fn(payload => runtime.invoke(payload.input));
    const control = createProgramActivityConfigurationControl({ id: 'configuration', gateway, readActor: () => actor,
        createId: () => 'activity_' + ++sequence, now: () => '2030-01-07T10:00:00Z', onCreated });
    const nodes = () => control.build({ width: 240, refresh }).flatMap(walk);
    const activate = suffix => nodes().find(node => node.id === 'configuration_' + suffix).on.activate();
    const input = (key, value) => {
        nodes().find(node => node.id === 'configuration_' + key).on.focus({ x: 10, y: 10 });
        const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
        editor.value = value; editor.dispatchEvent(new dom.window.Event('input')); // Real native editor input path.
    };
    const configure = () => {
        activate('new'); activate('brick_chip_1'); input('title', 'Fictitious meditation'); input('minutes', '15,5');
        activate('basis_chip_1'); activate('days_chip_1'); activate('days_chip_4'); activate('rhythm_chip_1');
    };
    return { control, nodes, activate, input, configure, records, writes, gateway, runtime, onCreated,
        readActor: () => actor, actor: value => { actor = value; }, close: () => { control.destroy(); dom.window.close(); } };
};

describe('native standalone health activity configuration', () => {
    it('uses the canonical metadata-only project reader without reconciling slots or admitting a foreign owner', async () => {
        const f = fixture();
        try {
            const owned = { id: 'goal', type: 'project', owner_id: 'alice', properties: { name: 'Fictitious objective', matrix_slot: 87 } };
            const list = vi.fn(async () => ({ fastify: { projects: [owned, { ...owned, id: 'foreign', owner_id: 'bob' }] }, meta: { source: 'fastify' } }));
            window.AdoleAPI = { auth: { getCurrentInfo: () => ({ id: 'alice' }) }, projects: { list } };
            window.Atome = { commit: vi.fn(), commitBatch: vi.fn() };
            const { loadProjectListRaw } = await import('../../eVe/intuition/matrix/core/project_data.js');
            const projects = await loadProjectListRaw({ includePreviewSources: false });
            expect(projects.map(record => record.id)).toEqual(['goal']);
            expect(list).toHaveBeenLastCalledWith({ includePreviewSources: false });
            expect(window.Atome.commit).not.toHaveBeenCalled(); expect(window.Atome.commitBatch).not.toHaveBeenCalled();
            expect(owned.properties.matrix_slot).toBe(87);
            await loadProjectListRaw(); expect(list).toHaveBeenLastCalledWith({ includePreviewSources: true });
        } finally { f.close(); }
    });
    it('declares the existing native panel tab option and rejects an unknown Programme tab', async () => {
        expect(buildMatrixToolDefinitions(value => value, 'registered').find(value => value.tool_id === 'ui.panel.open').input_schema.properties.tab).toEqual({ type: 'string' });
        const { createProgramPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
        expect(() => createProgramPanelSurface().onOpen({ context: { tab: 'invented_tab' } })).toThrow('program_tab_invalid');
    });
    it('requires explicit choices and saves one typed global activity without a project, calendar or guessed zero', async () => {
        const f = fixture();
        try {
            f.activate('new'); f.activate('save');
            expect(f.gateway).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0);
            expect(f.nodes().some(node => node.id === 'configuration_error')).toBe(true);
            f.activate('cancel'); f.configure(); f.activate('save');
            await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            expect(f.writes).toHaveLength(1);
            const activity = f.writes[0].props.program_activity;
            expect(activity).toEqual({ version: 1, brick_id: 'meditation', title: 'Fictitious meditation',
                involvement: { minutes: 15.5, basis: 'week', days: [1, 4], rhythm: 2 } });
            expect((await f.runtime.invoke({ operation: 'activity_read' })).activities).toHaveLength(1);
            expect(f.nodes().map(node => node.id)).toEqual(['configuration_new', 'configuration_new_label']);
        } finally { f.close(); }
    });
    it('edits the same native activity, preserves the original event and does not change its brick identity', async () => {
        const f = fixture();
        try {
            f.configure(); f.activate('save'); await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            const id = f.onCreated.mock.calls[0][0];
            f.control.openExisting(f.records.get(id));
            expect(f.nodes().find(node => node.id === 'configuration_brick_chip_2').on?.activate).toBeUndefined();
            f.input('minutes', '7,25'); f.input('title', 'Edited fictitious meditation'); f.activate('save');
            await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(2));
            expect(f.records.size).toBe(1); expect(f.writes).toHaveLength(2);
            expect(f.writes[0].props.program_activity.involvement.minutes).toBe(15.5);
            expect(f.records.get(id).properties.program_activity).toMatchObject({ version: 2, brick_id: 'meditation',
                title: 'Edited fictitious meditation', involvement: { minutes: 7.25, basis: 'week', days: [1, 4], rhythm: 2 } });
            expect(f.writes[1]).toMatchObject({ atome_id: id, scope: 'global', id: 'program_activity_revision:' + id + ':2' });
            expect((await f.runtime.invoke({ operation: 'activity_read' })).results).toHaveLength(0);
        } finally { f.close(); }
    });
    it('retries an unconfirmed native revision with the exact same event intent and no duplicate activity', async () => {
        const f = fixture();
        try {
            f.configure(); f.activate('save'); await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            const id = f.onCreated.mock.calls[0][0]; f.control.openExisting(f.records.get(id)); f.input('minutes', '9');
            f.gateway.mockImplementationOnce(async payload => { expect((await f.runtime.invoke(payload.input)).ok).toBe(true); throw new Error('acknowledgement_lost'); });
            f.activate('save'); await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'configuration_error')).toBe(true));
            const request = structuredClone(f.gateway.mock.calls.at(-1)[0]); f.activate('save');
            await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(2));
            expect(f.gateway.mock.calls.at(-1)[0]).toEqual(request); expect(f.writes).toHaveLength(2); expect(f.records.size).toBe(1);
        } finally { f.close(); }
    });
    it('rejects foreign edit drafts, stale revisions and changing the existing brick', async () => {
        const f = fixture();
        try {
            f.configure(); f.activate('save'); await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            const id = f.onCreated.mock.calls[0][0], original = structuredClone(f.records.get(id).properties.program_activity);
            expect(() => f.control.openExisting({ ...f.records.get(id), owner_id: 'bob' })).toThrow('program_activity_reference_denied');
            const input = { operation: 'activity_revise', activity_id: id, base_activity_version: 1, recorded_at: '2030-01-07T11:00:00Z',
                activity: { ...original, title: 'Another title' } };
            expect((await f.runtime.invoke({ ...input, activity: { ...input.activity, brick_id: 'nutrition' } })).error).toBe('program_activity_brick_immutable');
            expect((await f.runtime.invoke(input)).ok).toBe(true);
            expect((await f.runtime.invoke({ ...input, activity: original })).error).toBe('event_id_conflict');
            f.actor('bob'); expect((await f.runtime.invoke(input)).error).toBe('program_activity_reference_denied');
            expect(f.writes).toHaveLength(2);
        } finally { f.close(); }
    });
    it('lets only one competing revision survive across independent runtimes', async () => {
        const f = fixture();
        try {
            f.configure(); f.activate('save'); await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            const id = f.onCreated.mock.calls[0][0], original = structuredClone(f.records.get(id).properties.program_activity);
            // Both owners read the same version before the existing event-ID contract arbitrates the write.
            let readers = 0, release;
            const gate = new Promise(resolve => { release = resolve; });
            const dependencies = { actor: f.readActor, project: () => '', read: async requested => {
                const record = structuredClone(f.records.get(requested)); if (++readers === 2) release(); await gate; return record;
            }, commitActivity: async event => {
                if (f.writes.some(previous => previous.id === event.id)) {
                    assertIdempotentEventReplay(f.writes.find(previous => previous.id === event.id), event); return { ok: true };
                }
                f.writes.push(structuredClone(event)); f.records.get(id).properties = { ...f.records.get(id).properties, ...event.props }; return { ok: true };
            } };
            const input = { operation: 'activity_revise', activity_id: id, base_activity_version: 1, recorded_at: '2030-01-07T11:00:00Z', activity: original };
            const results = await Promise.all([createProjectProgramRuntime(dependencies).invoke(input),
                createProjectProgramRuntime(dependencies).invoke({ ...input, activity: { ...original, title: 'Competing title' } })]);
            expect(results.filter(result => result.ok)).toHaveLength(1); expect(f.writes).toHaveLength(2);
            expect(f.records.get(id).properties.program_activity.version).toBe(2);
        } finally { f.close(); }
    });
    it('retains the same immutable payload after a lost acknowledgement and blocks double presses', async () => {
        const f = fixture();
        try {
            let release;
            f.gateway.mockImplementationOnce(async payload => {
                const result = await f.runtime.invoke(payload.input);
                await new Promise(resolve => { release = resolve; });
                expect(result.ok).toBe(true); throw new Error('acknowledgement_lost');
            });
            f.configure();
            const save = f.nodes().find(node => node.id === 'configuration_save').on.activate;
            save(); save();
            await vi.waitFor(() => expect(f.writes).toHaveLength(1));
            expect(f.gateway).toHaveBeenCalledTimes(1);
            release();
            await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'configuration_error')).toBe(true));
            const first = structuredClone(f.gateway.mock.calls[0][0]);
            f.activate('save');
            await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            expect(f.gateway.mock.calls[1][0]).toEqual(first);
            expect(f.writes).toHaveLength(1); expect(f.records.size).toBe(1);
        } finally { f.close(); }
    });
    it('removes old-account drafts and ignores a late acknowledgement after close', async () => {
        const f = fixture();
        try {
            f.configure(); f.actor('bob');
            expect(f.nodes().some(node => node.id === 'configuration_title')).toBe(false);
            expect(f.gateway).not.toHaveBeenCalled();
            f.actor('alice'); f.configure();
            let release;
            f.gateway.mockImplementationOnce(async payload => { const result = await f.runtime.invoke(payload.input);
                await new Promise(resolve => { release = resolve; }); return result; });
            f.activate('save');
            await vi.waitFor(() => expect(f.writes).toHaveLength(1));
            f.control.close(); release();
            await vi.waitFor(() => expect(f.nodes().some(node => node.id === 'configuration_new')).toBe(true));
            expect(f.onCreated).not.toHaveBeenCalled();
        } finally { f.close(); }
    });
    it('links one configured activity to two health objectives through the existing native commands without copying it', async () => {
        const f = fixture();
        const { createProgramPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
        const surface = createProgramPanelSurface({ call: f.gateway, readActor: f.readActor, readProjects: async () => [...f.records.values()].filter(record => record.type === 'project') });
        try {
            f.configure(); f.activate('save'); await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            const state = surface.readState();
            state.tab = 'activities'; state.selectedActivityId = f.onCreated.mock.calls[0][0];
            state.library = await f.runtime.invoke({ operation: 'activity_read' });
            for (const [id, family, owner = 'alice'] of [['p', 'health'], ['q', 'health'], ['music', 'creation'], ['foreign', 'health', 'bob']]) {
                const record = { id, type: 'project', owner_id: owner, properties: { name: id, project_intent: { family, goal: 'free' } } };
                f.records.set(id, record); state.projectChoices.push(record);
            }
            const nodes = () => surface.buildContent(state, { bodyWidth: 600, refresh: vi.fn(), emit: intent => { void surface.handleEvent(intent); } }).flatMap(walk);
            expect(nodes().filter(node => node.id.startsWith('program_shared_objective_chip_') && node.on?.activate)).toHaveLength(2);
            for (const objectiveId of ['p', 'q']) {
                // Native choice and button dispatch the same public command intentions.
                nodes().find(node => node.id === 'program_shared_objective_chip_0').on.activate();
                nodes().find(node => node.id === 'program_shared_link').on.activate();
                await vi.waitFor(() => expect(state.library.links.some(record => record.properties.program_activity_link.objective_id === objectiveId)).toBe(true));
                await vi.waitFor(() => expect(state.busy).toBe(false));
            }
            expect(state.library.activities).toHaveLength(1); expect(state.library.links).toHaveLength(2);
            expect(state.library.results).toHaveLength(0); expect(state.library.occurrences).toHaveLength(0);
            expect(f.gateway.mock.calls.filter(([request]) => request.input.operation === 'activity_link').map(([request]) => request.input.objective_id)).toEqual(['p', 'q']);
        } finally { surface.onClose(); f.close(); }
    });
    it('refreshes live objective metadata and reports a read failure without retaining stale linking choices', async () => {
        const f = fixture();
        const { createProgramPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
        const readProjects = vi.fn(async () => [...f.records.values()].filter(record => record.type === 'project'));
        const surface = createProgramPanelSurface({ call: f.gateway, readActor: f.readActor, readProjects });
        try {
            f.configure(); f.activate('save'); await vi.waitFor(() => expect(f.onCreated).toHaveBeenCalledTimes(1));
            const state = surface.readState(); state.tab = 'activities';
            await surface.handleEvent({ type: 'program.shared_reload' }); expect(state.projectChoices).toHaveLength(0);
            f.records.set('new_goal', { id: 'new_goal', type: 'project', owner_id: 'alice', properties: { name: 'New fictitious health objective', project_intent: { family: 'health', goal: 'free' } } });
            await surface.handleEvent({ type: 'program.shared_reload' }); expect(state.projectChoices.map(record => record.id)).toEqual(['new_goal']);
            readProjects.mockRejectedValueOnce(new Error('synthetic_unavailable'));
            await surface.handleEvent({ type: 'program.shared_reload' }); expect(state.projectChoices).toHaveLength(0); expect(state.notice).not.toBe('');
            expect(f.writes).toHaveLength(1); // Project metadata refresh never mutates ordering or activities.
        } finally { surface.onClose(); f.close(); }
    });
    it('opens the same optional Nutrition question from the real standalone activity selection', async () => {
        const f = fixture();
        const { createProgramPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
        const surface = createProgramPanelSurface({ call: f.gateway, readActor: f.readActor,
            readProjects: async () => [...f.records.values()].filter(record => record.type === 'project') }), refresh = vi.fn();
        try {
            const result = await f.runtime.invoke({ operation: 'activity_create', activity_id: 'nutrition', recorded_at: '2030-01-07T10:00:00Z',
                activity: { brick_id: 'nutrition', title: 'Fictitious nutrition', involvement: { minutes: 0, basis: 'day', days: [], rhythm: 1 } } });
            expect(result.ok).toBe(true);
            const state = surface.readState(); state.tab = 'activities'; state.library = await f.runtime.invoke({ operation: 'activity_read' });
            await surface.handleEvent({ type: 'program.shared_select', value: 'nutrition' }, { refresh });
            const nodes = () => surface.buildContent(state, { emit: vi.fn(), bodyWidth: 600, refresh }).flatMap(walk);
            await vi.waitFor(() => expect(nodes().filter(node => node.id === 'program_activity_collection_nutrition_question')).toHaveLength(1));
            expect(nodes().some(node => node.id === 'program_activity_collection_nutrition_preferences')).toBe(true);
            expect(nodes().some(node => node.id === 'program_activity_collection_nutrition_journal')).toBe(false);
            expect(f.gateway).toHaveBeenCalledWith(expect.objectContaining({ tool_id: 'project.program.read', input: {
                project_id: '', activity_id: 'nutrition', operation: 'collection_read' } }));
            expect(f.writes).toHaveLength(1); // Opening the question neither reads a preference nor mutates it.
        } finally { surface.onClose(); f.close(); }
    });
});
