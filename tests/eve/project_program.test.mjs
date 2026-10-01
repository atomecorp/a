import { beforeAll, describe, it, expect, vi } from 'vitest';
import { initialProgram, displayBudget, buildProgramPreview, validateObservation } from '../../eVe/domains/programs/project_program_model.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { readTemplateLink } from '../../eVe/domains/templates/project_template_model.js';
import { programDiscoveryRecords } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_data.js';
import { normalizeEvent, buildEventParticles } from '../../eVe/intuition/tools/calendar_model.js';
import { isWithinSharedRoot, statesWithinSharedRoot, hasPrivateProgramAncestor } from '../../server/syncShareHierarchy.js';
vi.mock('../../database/adole.js', () => ({ default: { query: async () => { throw new Error('unexpected_database_access'); } } }));
const involvement = { minutes: 10, basis: 'day', days: [1, 2, 3, 4, 5], rhythm: 3 };
const start = '2030-01-07T20:00:00Z';
const action = (key = 'a', at = start, minutes = 6, followupMinutes = 1, reviewMinutes = 1) => ({ key, title: 'Synthetic activity', tool: 'journal',
    start: at, end: new Date(Date.parse(at) + (minutes + followupMinutes + reviewMinutes) * 60000).toISOString(), minutes, followupMinutes, reviewMinutes });
const proposal = () => ({ involvement: { ...involvement, days: [...involvement.days] }, actions: [action()],
    windows: [{ start: '2030-01-07T19:00:00Z', end: '2030-01-07T22:00:00Z' }],
    period: { start: '2030-01-07T00:00:00Z', end: '2030-01-08T00:00:00Z' }, timeZone: 'UTC', reason: 'Synthetic initial plan' });
const preview = input => buildProgramPreview({ program: initialProgram('sleep'), now: '2029-01-01T00:00:00Z', ...proposal(), ...input });
const fixture = () => {
    const store = new Map(['p', 'q', 'music'].map(id => [id, { atome_id: id, owner_id: 'alice', project_id: id, type: 'project',
        properties: { project_program: initialProgram(id === 'music' ? 'music_title' : 'sleep') } }]));
    let principal = 'alice'; let activeProject = 'p'; let serial = 0; let fail = 0; let commits = 0;
    const commit = async events => { commits++; for (const event of events) {
        const old = store.get(event.atome_id) || {};
        store.set(event.atome_id, { ...old, ...event, properties: { ...old.properties, ...event.props } });
    } return { ok: true }; };
    const calendar = {
        createEvent: async input => { if (fail-- > 0) return { ok: false, error: 'synthetic_failure' };
            await commit([{ kind: 'set', atome_id: input.id, type: 'calendar_event', project_id: input.projectId,
                properties: {}, props: { start: input.start, end: input.end, status: 'open', suspended: false, alarms: input.alarms, program_link: input.programLink } }]); return { ok: true }; },
        updateEvent: async (id, props) => { await commit([{ atome_id: id, props }]); return { ok: true }; }
    };
    const dependencies = { read: async id => structuredClone(store.get(id)), list: async id => [...store.values()].filter(r => r.project_id === id),
        commit, calendar, actor: () => principal, project: () => activeProject, createId: () => 'synthetic-' + ++serial,
        now: () => '2029-01-01T00:00:00Z', createText: async ({ projectId, text, observation }) => { const id = 'journal-' + ++serial;
            await commit([{ atome_id: id, type: 'text', project_id: projectId, props: { text, program_observation: observation } }]); return { ok: true, atome_id: id }; } };
    return { store, dependencies, invoke: createProjectProgramRuntime(dependencies).invoke, setActor: value => { principal = value; },
        setProject: value => { activeProject = value; }, failNext: () => { fail = 1; }, commits: () => commits };
};
const accept = async (f, project_id = 'p', request_id = 'initial', baseRevision = 0, overrides = {}) => {
    const input = { ...proposal(), ...overrides };
    const preview = await f.invoke({ operation: 'preview', project_id, ...input });
    return f.invoke({ operation: 'accept', project_id, request_id, baseRevision, ...input, previewSignature: preview.previewSignature });
};
describe('programme exact budget and preview', () => {
    it('10 × 5 = 50 and 10 × 7 = 70 without rounding or conversion writes', () => {
        expect(displayBudget(involvement, 'week')).toBe(50);
        expect(displayBudget({ ...involvement, days: [0, 1, 2, 3, 4, 5, 6] }, 'week')).toBe(70);
        const exact = { ...involvement, basis: 'week', minutes: 50.003 };
        for (let i = 0; i < 100; i++) { displayBudget(exact, 'day'); displayBudget(exact, 'week'); }
        expect(exact.minutes).toBe(50.003);
        expect(displayBudget({ ...involvement, days: [] }, 'week')).toBeNull();
    });
    it('6 + 1 + 1 = 8, then an extra two-minute review totals ten', () => {
        expect(Object.values(preview().daily)).toEqual([8]); expect(Object.values(preview().margin)).toEqual([2]);
        const next = preview({ actions: [action(), action('review', '2030-01-07T20:08:00Z', 2, 0, 0)] });
        expect(next.ok).toBe(true); expect(Object.values(next.daily)).toEqual([10]);
        expect(preview({ actions: [action('a', start, 12)] }).errors).toContain('program_budget_exceeded');
    });
    it('rejects missing dates, days, availability, resources and overlapping commitments', () => {
        expect(preview({ period: null }).errors).toContain('program_period_required');
        expect(preview({ involvement: { ...involvement, days: [] } }).errors).toContain('program_days_required');
        expect(preview({ windows: [] }).errors).toContain('program_outside_availability:a');
        expect(preview({ actions: [{ ...action(), tool: 'relaxation' }] }).errors).toContain('program_resource_required:a');
        expect(preview({ commitments: [action('busy')] }).errors).toContain('program_conflict:a');
    });
    it('rejects dependency cycles and keeps rhythm separate from load', () => {
        const actions = [{ ...action(), dependencies: ['b'] }, { ...action('b', '2030-01-07T21:00:00Z'), dependencies: ['a'] }];
        expect(preview({ actions }).errors).toContain('program_dependency_cycle');
        expect(preview({ involvement: { ...involvement, rhythm: 5 } }).daily).toEqual(preview().daily);
    });
});
describe('canonical programme lifecycle', () => {
    it('preview makes no writes; repeated/concurrent acceptance keeps the same event', async () => {
        const f = fixture(); expect((await f.invoke({ operation: 'preview', project_id: 'p', ...proposal() })).ok).toBe(true); expect(f.commits()).toBe(0);
        expect((await Promise.all([accept(f), accept(f)])).every(result => result.ok)).toBe(true);
        expect([...f.store.values()].filter(record => record.type === 'calendar_event')).toHaveLength(1);
        expect(f.store.get('p').properties.project_program.revision).toBe(1);
        expect(f.store.get('p').properties.project_program.accepted.actions[0].eventId).toBeTruthy();
    });
    it('reconciles a partial write after a fresh runtime without duplicate history', async () => {
        const f = fixture(); f.failNext(); expect((await accept(f)).partial).toBe(true);
        const restarted = createProjectProgramRuntime(f.dependencies);
        expect((await restarted.invoke({ operation: 'reconcile', project_id: 'p' })).ok).toBe(true);
        expect([...f.store.values()].filter(record => record.type === 'calendar_event')).toHaveLength(1);
        expect([...f.store.values()].filter(record => record.properties.source_domain === 'project_program_revision')).toHaveLength(1);
    });
    it('preserves manually moved, locked, completed events', async () => {
        const f = fixture(); await accept(f);
        const id = f.store.get('p').properties.project_program.accepted.actions[0].eventId;
        f.store.get(id).properties = { ...f.store.get(id).properties, start: '2030-01-07T21:00:00Z', end: '2030-01-07T21:08:00Z', locked: true, status: 'done' };
        await accept(f, 'p', 'revision2', 1);
        expect(f.store.get(id).properties.start).toBe('2030-01-07T21:00:00Z'); expect(f.store.get(id).properties.status).toBe('done');
    });
    it('pause survives reload; resume/restore are proposals and observations remain', async () => {
        const f = fixture(); await accept(f);
        await f.invoke({ operation: 'observe', project_id: 'p', observation: { kind: 'declaration', provenance: 'synthetic', date: start, value: null, useInFollowup: false } });
        expect((await f.invoke({ operation: 'pause', project_id: 'p' })).ok).toBe(true);
        const id = f.store.get('p').properties.project_program.accepted.actions[0].eventId;
        expect(f.store.get(id).properties.suspended).toBe(true);
        const restarted = createProjectProgramRuntime(f.dependencies); const before = f.commits();
        expect((await restarted.invoke({ operation: 'resume', project_id: 'p' })).requiresAcceptance).toBe(true); expect(f.commits()).toBe(before);
        const revision = [...f.store.values()].find(record => record.properties.source_domain === 'project_program_revision');
        expect((await f.invoke({ operation: 'restore', project_id: 'p', revision_id: revision.atome_id })).ok).toBe(true);
        expect([...f.store.values()].filter(record => record.type === 'text')).toHaveLength(1);
    });
    it('two sleep instances and a musical instance remain independent', async () => {
        const f = fixture(); await accept(f); f.setProject('q'); await accept(f, 'q'); f.setProject('music'); await accept(f, 'music');
        expect(new Set(['p', 'q', 'music'].map(id => f.store.get(id).properties.project_program.accepted.actions[0].eventId)).size).toBe(3);
        await f.invoke({ operation: 'pause', project_id: 'music' }); expect(f.store.get('p').properties.project_program.status).toBe('active');
    });
    it('rejects changed principal and late async reads before mutation', async () => {
        const f = fixture(); f.setActor('bob'); expect((await accept(f)).error).toBe('program_owner_required'); expect(f.commits()).toBe(0);
        f.setActor('alice'); let resolveRead;
        const runtime = createProjectProgramRuntime({ ...f.dependencies, read: () => new Promise(resolve => { resolveRead = resolve; }) });
        const request = runtime.invoke({ operation: 'accept', project_id: 'p', request_id: 'late', baseRevision: 0, ...proposal() });
        await Promise.resolve(); await Promise.resolve(); f.setProject('q'); resolveRead(f.store.get('p'));
        expect((await request).error).toBe('program_context_changed'); expect(f.commits()).toBe(0);
    });
});
describe('authorized constraints and retries', () => {
    it('checks explicitly authorized project conflicts and global limits without reading unchosen projects', async () => {
        const f = fixture(); await accept(f, 'q');
        expect((await f.invoke({ operation: 'preview', project_id: 'p', ...proposal(), constraintProjectIds: ['q'] })).errors).toContain('program_conflict:a');
        const later = { ...proposal(), actions: [action('b', '2030-01-07T21:00:00Z')] };
        expect((await f.invoke({ operation: 'preview', project_id: 'p', ...later, constraintProjectIds: ['q'], globalBudgetMinutes: 10 })).errors).toContain('program_global_budget_exceeded');
        f.store.get('q').owner_id = 'bob';
        expect((await f.invoke({ operation: 'preview', project_id: 'p', ...proposal(), constraintProjectIds: ['q'] })).error).toBe('program_constraint_project_denied');
    });
    it('requires a real owned relaxation resource', async () => {
        const f = fixture(); const actions = [{ ...action(), tool: 'relaxation', resourceId: 'missing' }];
        expect((await f.invoke({ operation: 'preview', project_id: 'p', ...proposal(), actions })).error).toBe('program_resource_unavailable');
        f.store.set('sound', { atome_id: 'sound', type: 'sound', owner_id: 'alice', properties: {} });
        actions[0].resourceId = 'sound';
        expect((await f.invoke({ operation: 'preview', project_id: 'p', ...proposal(), actions })).ok).toBe(true);
    });
    it('acceptance of a resume reactivates a future event with the original identity', async () => {
        const f = fixture(); await accept(f); const id = f.store.get('p').properties.project_program.accepted.actions[0].eventId;
        await f.invoke({ operation: 'pause', project_id: 'p' }); await accept(f, 'p', 'resume', 1);
        expect(f.store.get(id).properties.suspended).toBe(false);
        expect([...f.store.values()].filter(record => record.type === 'calendar_event')).toHaveLength(1);
    });
    it('preserves history and can retry withdrawal failures', async () => {
        const f = fixture(); await accept(f); const original = f.store.get('p').properties.project_program.accepted.actions[0].eventId;
        await accept(f, 'p', 'replacement', 1, { actions: [action('replacement', '2030-01-07T21:00:00Z')] });
        expect(f.store.get(original).properties.suspended).toBe(true);
        expect([...f.store.values()].filter(record => record.type === 'calendar_event')).toHaveLength(2);
    });
});
describe('native boundaries', () => {
    it('catalogue alias discovery creates no project and pin policy is retained', () => {
        const records = programDiscoveryRecords(); expect(records.filter(record => record.textIndex.includes('sommeil'))).toHaveLength(1);
        expect(readTemplateLink({ properties: { template_link: { source_project_id: 'source', update_policy: 'pinned', source_version: 1, initialized: true } } }).update_policy).toBe('pinned');
    });
    it('calendar projection retains links, locks, suspension and explicit empty alarms', () => {
        const event = normalizeEvent({ start, title: 'Synthetic', alarms: [], suspended: true, locked: true, programLink: { action_key: 'a' } });
        const particles = buildEventParticles(event); expect(particles.program_link).toEqual({ action_key: 'a' }); expect(particles.suspended).toBe(true); expect(particles.locked).toBe(true); expect(particles.alarms).toBeNull();
    });
    it('requires provenance, dates, explicit consent and distinguishes missing values', () => {
        expect(() => validateObservation({ kind: 'benefit', value: 78 })).toThrow();
        expect(validateObservation({ kind: 'measurement', value: null, date: start, provenance: 'synthetic', useInFollowup: false }).value).toBeNull();
    });
    it('native share hierarchy excludes private programmes and their descendants', async () => {
        const states = [{ atome_id: 'folder', properties: {} }, { atome_id: 'p', properties: { project_program: initialProgram('sleep'), parent_id: 'folder' } },
            { atome_id: 'journal', properties: { parent_id: 'p' } }, { atome_id: 'normal', properties: { parent_id: 'folder' } }];
        const provider = { request: async (_owner, op, input) => op === 'state:list' ? states : states.find(record => record.atome_id === input.atome_id) };
        expect(await hasPrivateProgramAncestor({ provider, ownerId: 'alice', atomeId: 'journal' })).toBe(true);
        expect(await isWithinSharedRoot({ provider, ownerId: 'alice', atomeId: 'journal', rootAtomeId: 'folder' })).toBe(false);
        expect(await isWithinSharedRoot({ provider, ownerId: 'alice', atomeId: 'normal', rootAtomeId: 'folder' })).toBe(true);
        expect((await statesWithinSharedRoot({ provider, ownerId: 'alice', rootAtomeId: 'folder' })).map(record => record.atome_id)).toEqual(['folder', 'normal']);
    });
});

beforeAll(async () => { await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js'); }, 20000);

describe('native programme panel composition', () => {
    it('builds exactly two shared sliders and toggles units without changing stored input', async () => {
        const { createProgramPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
        const surface = createProgramPanelSurface({ call: async () => ({ ok: true }) });
        const state = surface.readState();
        state.data = { program: initialProgram('sleep'), observations: [], events: [], revisions: [] };
        state.involvement = structuredClone(involvement);
        const nodes = surface.buildContent(state, { emit: () => {}, refresh: () => {}, bodyWidth: 600 });
        const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children || [])]);
        const all = flatten(nodes);
        expect(all.filter(node => node.id === 'program_time' || node.id === 'program_rhythm')).toHaveLength(2);
        const original = structuredClone(state.involvement);
        await surface.handleEvent({ type: 'program.unit', value: 'week' }, { refresh: () => {} });
        await surface.handleEvent({ type: 'program.unit', value: 'day' }, { refresh: () => {} });
        expect(state.involvement).toEqual(original);
        surface.onClose();
        expect(surface.readState().data).toBeNull(); expect(surface.readState().actions).toEqual([]);
    });
    it('revalidates changed availability before accepting an earlier preview', async () => {
        const f = fixture(); const input = proposal();
        const initial = await f.invoke({ project_id: 'p', operation: 'preview', ...input });
        const changed = await f.invoke({ project_id: 'p', operation: 'accept', ...input, reason: 'Changed reason', request_id: 'stale', baseRevision: 0, previewSignature: initial.previewSignature });
        expect(changed.error).toBe('program_preview_changed'); expect(f.commits()).toBe(0);
    });
});


describe('programme native command contracts', () => {
    it('unwraps the registered handler envelope and omits commit-only operation on preview', async () => {
        const { createProgramPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
        let payload;
        const surface = createProgramPanelSurface({ call: async input => { payload = input; return { ok: true, result: { ok: true, bridged: 'registered_handler', result: { ok: true, previewSignature: 'native', daily: {}, margin: {} } } }; } });
        Object.assign(surface.readState(), { projectId: 'p', involvement: structuredClone(involvement) });
        await surface.handleEvent({ type: 'program.preview' });
        expect(payload.input.operation).toBeUndefined();
        expect(surface.readState().preview.previewSignature).toBe('native');
        surface.onClose();
    });
    it('allows programme use in Consultation while blocking scene editing and unrelated text creation', async () => {
        const { authorizeProjectTool, restoreProjectWorkModeValue } = await import('../../eVe/domains/rendering/project_work_mode_state.js');
        const win = { __eveWorkspaceMode: { mode: 'project', projectId: 'qa-program' }, Atome: { getStateCurrent: async id => ({ properties: id === 'qa-program' ? { project_program: initialProgram('sleep') } : {} }) } };
        restoreProjectWorkModeValue('qa-program', 'consultation', { windowRef: win });
        const invoke = (id, input = {}) => authorizeProjectTool({ tool: { id }, context: { input }, windowRef: win });
        expect((await invoke('project.program.preview')).ok).toBe(true);
        expect((await invoke('ui.resize')).ok).toBe(false);
        expect((await invoke('ui.text.create')).ok).toBe(false);
        expect((await invoke('ui.text.create', { allow_inactive: true, parent_id: 'qa-program' })).ok).toBe(true);
        restoreProjectWorkModeValue('qa-program', 'edit', { windowRef: win });
    });
});

it('closes the native Finder editor and panel without requiring an opening anchor', async () => {
    const { createToolRuntimeFinderExecution } = await import('../../eVe/intuition/tools/core/tool_runtime_finder_execution.js');
    const previous = globalThis.window; const calls = [];
    globalThis.window = { __eveFinderUiRuntime: { touch: async () => ({}), inlineClose: async () => calls.push('editor'), panelClose: async () => calls.push('panel') } };
    try {
        const runtime = createToolRuntimeFinderExecution({ isFinderPanelSurfaceOpen: () => true,
            ensureString: (value, fallback = '') => String(value || fallback), isPlainObject: value => value && typeof value === 'object',
            normalizeAction: (action, event) => action || event });
        expect((await runtime.executeFinderMain(null, { action: 'state.off' })).ok).toBe(true);
        expect(calls).toEqual(['editor', 'panel']);
        expect((await runtime.executeFinderMain(null, { action: 'state.on' })).error).toBe('finder_target_missing');
    } finally { globalThis.window = previous; }
});

it('preserves the native calendar type when updating the event business kind in browser storage', async () => {
    const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
    globalThis.indexedDB = indexedDB; globalThis.IDBKeyRange = IDBKeyRange;
    const store = await import('../../atome/src/squirrel/apis/unified/adole_api/guest_workspace_store.js');
    const owner = 'programme-storage-qa';
    await store.commitWorkspaceEvents(owner, [{ kind: 'set', atome_id: 'event-qa', project_id: 'project-qa', payload: { props: { type: 'calendar_event', kind: 'event' } } }]);
    await store.commitWorkspaceEvents(owner, [{ kind: 'set', atome_id: 'event-qa', project_id: 'project-qa', payload: { props: { kind: 'event', suspended: true } } }]);
    expect((await store.getGuestAtome(owner, 'event-qa')).atome_type).toBe('calendar_event');
    await store.clearGuestWorkspace(owner);
});

it('keeps library template sources out of Finder while retaining the existing instance and activities', async () => {
    const { loadScopeRecords } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_data.js');
    const source = { atome_id: 'library', atome_type: 'project', properties: { system_template_key: 'sleep', project_tags: ['template'], name: 'Mieux dormir' } };
    const records = await loadScopeRecords({ scope: 'all', api: {}, readList: async () => [source,
        { atome_id: 'source-button', project_id: 'library', atome_type: 'shape', properties: {} },
        { atome_id: 'private-instance', atome_type: 'project', properties: { name: 'Mieux dormir', project_program: initialProgram('sleep') } },
        { atome_id: 'ordinary-text', atome_type: 'text', properties: { text: 'activity' } }] });
    expect(records.map(record => record.id)).not.toContain('library');
    expect(records.map(record => record.id)).not.toContain('source-button');
    expect(records.map(record => record.id)).toEqual(expect.arrayContaining(['private-instance', 'ordinary-text', 'program_definition:sleep']));
});


it('blocks programme publication before changing the project or broadcasting private descendants', async () => {
    const { createNewsPublishApi } = await import('../../eVe/domains/news/news_publish_api.js');
    let marked = false;
    const client = createNewsPublishApi({ getApi: () => ({ news: {} }), resolveAuthor: async () => ({ id: 'alice' }),
        loadThreadRuntime: async () => ({ readProjectRecords: async () => [{ atome_id: 'p', properties: { project_program: initialProgram('sleep') } }],
            markProjectAsNews: async () => { marked = true; return { ok: true }; } }) });
    await expect(client.publish({ projectId: 'p' })).rejects.toThrow('program_sharing_not_finalized');
    expect(marked).toBe(false);
    const { createNewsBroadcast } = await import('../../server/news_broadcast.js');
    const states = new Map([['p', { properties: { project_program: initialProgram('sleep') } }], ['journal', { parent_id: 'p', properties: {} }]]);
    const broadcast = createNewsBroadcast({ query: async () => null, vaultProvider: { request: async (_owner, _op, input) => states.get(input.atome_id) },
        relations: {}, deliver: async () => { throw new Error('private_delivery'); }, listUserIds: async () => [] });
    await expect(broadcast.publish('alice', { publication: { id: 'post', properties: { news_source_project_id: 'p' } } })).rejects.toThrow('program_sharing_not_finalized');
    await expect(broadcast.publish('alice', { publication: { id: 'post', properties: { news_payload: { members: [{ id: 'journal' }] } } } })).rejects.toThrow('program_sharing_not_finalized');
    expect((await broadcast.publish('alice', { publication: { id: 'ordinary-post', properties: {} } })).ok).toBe(true);
});

it('retains invocation context for queued commands when the active project changes', async () => {
    const f = fixture(); let release; let reads = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const runtime = createProjectProgramRuntime({ ...f.dependencies, read: async id => {
        if (reads++ === 0) await gate;
        return f.dependencies.read(id);
    } });
    const first = runtime.invoke({ project_id: 'p', operation: 'pause' });
    const queued = runtime.invoke({ project_id: 'p', operation: 'pause' });
    await Promise.resolve(); f.setProject('q'); release();
    expect((await Promise.all([first, queued])).map(result => result.error)).toEqual(['program_context_changed', 'program_context_changed']);
    expect(f.commits()).toBe(0);
});
