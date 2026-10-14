import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { createProgramCollectionControl } from '../../eVe/domains/programs/program_collection_control.js';
import { programPreferenceId, programDataPermissionId } from '../../atome/src/shared/program_collection_contract.js';
import { normalizeCanonicalAtome } from '../../atome/src/shared/atome_contract.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { runWithoutHealthAccess } from '../../atome/src/squirrel/health/health_actor_gate.js';
import { createMatrixTemplateRuntime } from '../../eVe/domains/matrix/matrix_template_runtime.js';
import { JSDOM } from 'jsdom';
import { normalizeBevyUiTree } from '../../eVe/domains/rendering/bevy_ui_tree_normalization.js';

const date = '2030-01-07T10:00:00Z';
const walk = node => [node, ...(node.children || []).flatMap(walk)];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const fixture = () => {
    registerCoreAtomeTypes();
    let actor = 'alice', active = 'p';
    const records = new Map(['p', 'q'].map(id => [id, { id, type: 'project', owner_id: 'alice', properties: { project_intent: { family: 'health', goal: 'free' } } }]));
    const read = vi.fn(async id => records.get(id));
    const list = vi.fn(async id => [...records.values()].filter(record => record.project_id === id));
    const writes = [];
    const commitActivity = vi.fn(async event => {
        expect(event.scope).toBe('global'); expect(event).not.toHaveProperty('project_id');
        normalizeCanonicalAtome({ id: event.atome_id, type: event.type, properties: event.props });
        const previous = records.get(event.atome_id);
        records.set(event.atome_id, { ...previous, id: event.atome_id, type: event.type, owner_id: event.actor,
            properties: { ...previous?.properties, ...structuredClone(event.props) } });
        writes.push(structuredClone(event)); return { ok: true };
    });
    const commitCollection = vi.fn(async events => {
        for (const event of events) { const result = await commitActivity(event); if (!result.ok) return result; }
        return { ok: true };
    });
    const runtime = createProjectProgramRuntime({ read, list, commitCollection, actor: () => actor, project: () => active, now: () => date });
    const invoke = (operation = 'collection_read', input = {}) => runtime.invoke({ operation, project_id: active, ...input });
    const preference = (key, value, extra = {}) => {
        const id = programPreferenceId('alice', key);
        records.set(id, { id, type: 'record', owner_id: 'alice', properties: { program_preference: {
            version: 1, key, status: 'answered', value, date, provenance: 'manual', uncertain: false, ...extra } } });
        return id;
    };
    const journal = (id, value, extra = {}) => records.set(id, { id, type: 'text', owner_id: 'alice', project_id: 'p', properties: {
        text: value, program_observation: { kind: 'declaration', date, provenance: 'original journal', useInFollowup: true,
            preference_key: 'allergies', ...extra } } });
    return { records, read, list, writes, commitActivity, invoke, preference, journal,
        setActor: value => { actor = value; }, setProject: value => { active = value; } };
};

describe('purposeful Programme collection through canonical Atomes', () => {
    it('asks only the selected decision and reads no preferences/journal before consent', async () => {
        const f = fixture(), id = f.preference('allergies', 'Declared test allergy'); f.journal('note', 'Other test declaration');
        expect(await f.invoke()).toMatchObject({ ok: true, question: { key: 'starting_state', status: 'missing', value: null }, manual_available: true });
        expect(await f.invoke('collection_read', { brick_id: 'nutrition' })).toMatchObject({ question: { key: 'allergies', status: 'missing' }, sources: [] });
        expect(await f.invoke('collection_read', { brick_id: 'meditation' })).toMatchObject({ ok: true, question: null });
        expect(await f.invoke('collection_read', { brick_id: 'invented_sport' })).toMatchObject({ ok: false, error: 'program_collection_brick_unavailable' });
        expect(f.read.mock.calls.some(([value]) => value === id || value === 'note')).toBe(false);
        expect(f.list).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0);
        f.records.get('p').properties.project_intent.family = 'creation';
        expect(await f.invoke()).toMatchObject({ ok: false, error: 'program_objective_required' });
    });
    it('retains unknown/later per purpose without inventing or erasing a shared fact', async () => {
        const f = fixture(), id = f.preference('allergies', 'Preserved declaration');
        const original = structuredClone(f.records.get(id));
        for (const answer_status of ['unknown', 'later']) {
            const result = await f.invoke('collection_answer', { brick_id: 'nutrition', preference_key: 'allergies', answer_status });
            expect(result).toMatchObject({ ok: true, question: { status: answer_status, value: null }, sources: [], manual_available: true });
        }
        expect(f.records.get(id)).toEqual(original); expect(f.read.mock.calls.some(([value]) => value === id)).toBe(false);
        expect(await f.invoke('collection_read', { brick_id: 'nutrition' })).toMatchObject({ question: { status: 'later' } });
    });
    it('saves an explicit manual fact once, preserves provenance/date, and reuses it only after another purpose grants access', async () => {
        const f = fixture();
        const input = { brick_id: 'nutrition', preference_key: 'allergies', answer_status: 'answered', answer_value: 'Fictitious allergy', uncertain: true };
        expect(await f.invoke('collection_answer', { ...input, answer_value: '  ' })).toMatchObject({ ok: false, error: 'program_preference_invalid' });
        expect(f.writes).toHaveLength(0);
        expect(await f.invoke('collection_answer', input)).toMatchObject({ ok: true, question: { status: 'answered', value: 'Fictitious allergy' },
            sources: [{ provenance: 'manual', date, uncertain: true, freshness: 'unspecified' }] });
        expect(f.writes).toHaveLength(2);
        f.setProject('q'); f.read.mockClear();
        expect(await f.invoke('collection_read', { brick_id: 'nutrition' })).toMatchObject({ question: { status: 'missing' }, sources: [] });
        expect(f.read.mock.calls.some(([value]) => value === programPreferenceId('alice', 'allergies'))).toBe(false);
        expect(await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'preferences', allow_read: true }))
            .toMatchObject({ question: { status: 'answered', value: 'Fictitious allergy' } });
        expect([...f.records.values()].filter(record => record.properties.program_preference)).toHaveLength(1);
    });
    it('uses the same owned health brick in a standalone activity without a programme or Dashboard', async () => {
        const f = fixture();
        const input = { activity_id: 'free_nutrition', project_id: '' };
        f.records.set(input.activity_id, { id: input.activity_id, type: 'record', owner_id: 'alice', properties: {
            program_activity: { version: 1, brick_id: 'nutrition', title: 'Fictitious free activity',
                involvement: { minutes: 0, basis: 'day', days: [], rhythm: 1 } } } });
        expect(await f.invoke('collection_read', input)).toMatchObject({ ok: true, purpose_id: 'activity:free_nutrition',
            question: { key: 'allergies', status: 'missing' }, available_sources: ['preferences'], manual_available: true });
        expect(await f.invoke('collection_permission', { ...input, data_source: 'journal', allow_read: true }))
            .toMatchObject({ ok: false, error: 'program_collection_source_unavailable' });
        expect(await f.invoke('collection_answer', { ...input, preference_key: 'allergies', answer_status: 'answered',
            answer_value: 'Fictitious shared declaration', uncertain: true })).toMatchObject({ question: { status: 'answered' } });
        expect(await f.invoke('collection_read', { ...input, brick_id: 'meditation' })).toMatchObject({ ok: false, error: 'program_collection_question_mismatch' });
        expect(await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'preferences', allow_read: true }))
            .toMatchObject({ sources: [{ atome_id: programPreferenceId('alice', 'allergies') }], question: { value: 'Fictitious shared declaration' } });
        f.records.get(input.activity_id).owner_id = 'bob';
        expect(await f.invoke('collection_read', input)).toMatchObject({ ok: false, error: 'program_owner_required' });
        expect(f.list).not.toHaveBeenCalled();
    });
    it('requires both purpose consent and existing follow-up consent, retains original sources, and exposes disagreement', async () => {
        const f = fixture(); f.preference('allergies', 'Manual test value');
        f.journal('note', 'Journal test value'); f.journal('refused', 'Private refused', { useInFollowup: false });
        f.journal('wrong_question', 'Unrelated', { preference_key: 'starting_state' });
        f.journal('foreign', 'Foreign'); f.records.get('foreign').owner_id = 'bob';
        await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'preferences', allow_read: true });
        const result = await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'journal', allow_read: true });
        expect(result.question).toMatchObject({ status: 'conflict', value: null });
        expect(result.sources.map(source => source.atome_id)).toEqual([programPreferenceId('alice', 'allergies'), 'note']);
        expect(result.sources[1]).toMatchObject({ provenance: 'original journal', date, uncertain: true });
        expect(f.records.get('note').properties.text).toBe('Journal test value');
        f.list.mockClear();
        expect(await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'journal', allow_read: false }))
            .toMatchObject({ question: { status: 'answered', value: 'Manual test value' }, permissions: { journal: false } });
        expect(f.list).not.toHaveBeenCalled();
    });
    it('handles absence, explicit expiry and future dates without guessing a clinical freshness threshold', async () => {
        const f = fixture();
        expect(await f.invoke('collection_permission', { data_source: 'preferences', allow_read: true }))
            .toMatchObject({ question: { status: 'missing', value: null } });
        f.preference('starting_state', 'Old declared constraint', { review_after: '2030-01-06T00:00:00Z' });
        expect(await f.invoke()).toMatchObject({ question: { status: 'stale', value: null }, sources: [{ freshness: 'stale' }] });
        f.preference('starting_state', 'Future declaration', { date: '2031-01-01T00:00:00Z' });
        expect(await f.invoke()).toMatchObject({ question: { status: 'stale', value: null }, sources: [{ freshness: 'future' }] });
        f.preference('starting_state', 'Present constraint');
        expect(await f.invoke()).toMatchObject({ question: { status: 'answered' }, sources: [{ freshness: 'unspecified' }] });
    });
    it('drops a source read if permission is revoked during the async boundary', async () => {
        const f = fixture(); f.journal('note', 'Sensitive test');
        await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'journal', allow_read: true });
        f.list.mockImplementationOnce(async () => {
            const id = programDataPermissionId('alice', 'p:nutrition', 'journal');
            f.records.get(id).properties.program_data_permission = { version: 1, purpose_id: 'p:nutrition', source: 'journal', allowed: false, date };
            return [f.records.get('note')];
        });
        expect(await f.invoke('collection_read', { brick_id: 'nutrition' }))
            .toEqual({ ok: false, error: 'program_collection_permission_changed' });
        expect(await f.invoke('collection_read', { brick_id: 'nutrition' })).toMatchObject({ sources: [], question: { value: null } });
    });
    it('fails closed on foreign sources, partial reads, changed actor/project, denied writes and AI/MCP health gates', async () => {
        const f = fixture(), id = f.preference('starting_state', 'Test');
        f.records.get(id).owner_id = 'bob';
        expect(await f.invoke('collection_permission', { data_source: 'preferences', allow_read: true }))
            .toMatchObject({ ok: false, error: 'program_collection_reference_denied' });
        f.setActor('bob'); expect(await f.invoke()).toMatchObject({ ok: false, error: 'program_owner_required' }); f.setActor('alice');
        expect(await f.invoke('collection_read', { project_id: 'q' })).toMatchObject({ ok: false, error: 'program_active_project_required' });
        await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'journal', allow_read: true });
        f.list.mockResolvedValueOnce({ records: [], totalCount: 1 });
        expect(await f.invoke('collection_read', { brick_id: 'nutrition' })).toMatchObject({ ok: false, error: 'program_collection_read_incomplete' });
        f.commitActivity.mockResolvedValueOnce({ ok: false, error: 'permission_denied' });
        expect(await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'journal', allow_read: false }))
            .toMatchObject({ ok: false, error: 'permission_denied' });
        expect(await runWithoutHealthAccess(() => f.invoke())).toMatchObject({ ok: false, error: 'program_collection_actor_denied' });
        f.read.mockImplementationOnce(async () => { f.setProject('q'); return f.records.get('p'); });
        expect(await f.invoke()).toMatchObject({ ok: false, error: 'program_context_changed' });
    });
    it('renders one native question, uses real command intentions, and reconstructs from canonical state after destruction', async () => {
        const f = fixture(); vi.stubGlobal('window', { Atome: {} });
        const gateway = vi.fn(payload => f.invoke(payload.input.operation, payload.input));
        const refresh = vi.fn(), box = { width: 240, height: 60 };
        let control = createProgramCollectionControl({ id: 'collection', projectId: 'p', interactive: () => true, refresh, gateway });
        await control.build({ box }).on.activate();
        await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_question')).toBe(true));
        let nodes = walk(control.build({ box }));
        expect(nodes.filter(item => item.id === 'collection_question')).toHaveLength(1);
        expect(f.list).not.toHaveBeenCalled(); expect(f.writes).toHaveLength(0);
        await nodes.find(item => item.id === 'collection_brick').children.find(item => item.on?.activate
            && item.children?.some(label => label.text === 'Nutrition'))?.on.activate();
        await vi.waitFor(() => expect(gateway.mock.calls.some(([payload]) => payload.input.brick_id === 'nutrition')).toBe(true));
        await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_later')).toBe(true));
        await walk(control.build({ box })).find(item => item.id === 'collection_later').on.activate();
        await vi.waitFor(() => expect(f.writes).toHaveLength(1));
        control.destroy();
        control = createProgramCollectionControl({ id: 'collection', projectId: 'p', interactive: () => true, refresh, gateway });
        await control.build({ box }).on.activate();
        await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_question')).toBe(true));
        control.destroy();
        expect(gateway.mock.calls.every(([payload]) => ['project.program.read', 'project.program.commit'].includes(payload.tool_id))).toBe(true);
    });
    it('ignores unrelated scene changes and refreshes authorized facts from the canonical event bus', async () => {
        const f = fixture(); vi.stubGlobal('window', { Atome: {} });
        let listener;
        const eventBus = { on: vi.fn((_event, callback) => { listener = callback; return () => { listener = null; }; }) };
        const gateway = vi.fn(payload => f.invoke(payload.input.operation, payload.input));
        const box = { width: 240, height: 60 }, refresh = vi.fn();
        const control = createProgramCollectionControl({ id: 'collection', projectId: 'p', interactive: () => true, refresh, gateway, eventBus });
        await control.build({ box }).on.activate();
        await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_question')).toBe(true));
        const count = gateway.mock.calls.length;
        listener({ event: { payload: { props: { left: 50, top: 70 } } } });
        expect(gateway).toHaveBeenCalledTimes(count);
        expect(walk(control.build({ box })).filter(item => item.id === 'collection_question')).toHaveLength(1);
        await walk(control.build({ box })).find(item => item.id === 'collection_preferences').on.activate();
        await vi.waitFor(() => expect(f.writes).toHaveLength(1));
        await vi.waitFor(() => expect(walk(control.build({ box })).find(item => item.id === 'collection_save')?.on?.activate).toBeTypeOf('function'));
        f.preference('starting_state', 'Updated canonical fact');
        listener({ event: { payload: { props: { program_preference: f.records.get(programPreferenceId('alice', 'starting_state')).properties.program_preference } } } });
        await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_sources' && item.text.includes('Updated canonical fact'))).toBe(true));
        control.destroy(); expect(listener).toBeNull();
    });
    it('synchronizes the native editor at Save and gives long source text its measured height', async () => {
        const f = fixture(), dom = new JSDOM('<body></body>', { url: 'http://localhost', pretendToBeVisual: true });
        vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
        const gateway = payload => f.invoke(payload.input.operation, payload.input), box = { width: 196, height: 60 };
        const control = createProgramCollectionControl({ id: 'collection', projectId: 'p', interactive: () => true, refresh: vi.fn(), gateway });
        try {
            control.build({ box }).on.activate();
            await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_save')).toBe(true));
            const nodes = walk(control.build({ box }));
            nodes.find(item => item.id === 'collection_answer').on.focus({ x: 10, y: 10 });
            const editor = dom.window.document.querySelector('#eve_hidden_text_service textarea');
            expect(editor).not.toBeNull();
            expect(editor.style.pointerEvents).toBe('none');
            const value = 'Déclaration fictive longue. '.repeat(35);
            editor.value = value;
            nodes.find(item => item.id === 'collection_save').on.activate();
            await vi.waitFor(() => expect(f.records.get(programPreferenceId('alice', 'starting_state'))?.properties.program_preference.value).toBe(value.trim()));
            await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_sources')).toBe(true));
            const source = walk(control.build({ box })).find(item => item.id === 'collection_sources');
            expect(source.style.size[1]).toBeGreaterThan(500);
        } finally { control.destroy(); dom.window.close(); }
    });
    it('withdraws a deleted journal source and deleted purpose grant from an open question', async () => {
        const f = fixture(); vi.stubGlobal('window', { Atome: {} });
        f.journal('source', 'Fictitious original');
        await f.invoke('collection_permission', { brick_id: 'nutrition', data_source: 'journal', allow_read: true });
        let listener;
        const eventBus = { on: (_event, callback) => { listener = callback; return () => { listener = null; }; } };
        const gateway = vi.fn(payload => f.invoke(payload.input.operation, payload.input)), box = { width: 240, height: 60 };
        const control = createProgramCollectionControl({ id: 'collection', projectId: 'p', interactive: () => true, refresh: vi.fn(), gateway, eventBus });
        try {
            control.build({ box }).on.activate();
            await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_save')).toBe(true));
            walk(control.build({ box })).find(item => item.id === 'collection_brick_chip_1').on.activate();
            await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_sources')).toBe(true));
            f.records.get('source').deleted = true;
            listener({ event: { kind: 'delete', atome_id: 'source' } });
            expect(walk(control.build({ box })).some(item => item.id === 'collection_sources')).toBe(false);
            await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_save')).toBe(true));
            expect(await f.invoke('collection_read', { brick_id: 'nutrition' })).toMatchObject({ sources: [], manual_available: true });
            const permissionId = programDataPermissionId('alice', 'p:nutrition', 'journal');
            f.records.get(permissionId).deleted = true;
            listener({ event: { kind: 'delete', atome_id: permissionId } });
            await vi.waitFor(() => expect(walk(control.build({ box })).some(item => item.id === 'collection_save')).toBe(true));
            expect(await f.invoke('collection_read', { brick_id: 'nutrition' })).toMatchObject({ sources: [], permissions: { journal: false } });
        } finally { control.destroy(); }
    });
    it('projects the asynchronous question through the real native Matrix paint lifecycle', async () => {
        const f = fixture(), dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { pretendToBeVisual: true });
        vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
        const gateway = async payload => ({ ok: true, result: { ok: true, bridged: 'registered_handler', result: await f.invoke(payload.input.operation, payload.input) } });
        let tree, control, runtime; const handlers = new Map();
        runtime = createMatrixTemplateRuntime({ projectId: 'p', treeId: 'collection_matrix',
            records: [{ id: 'root', properties: { module: 'matrix', matrix_template: 'objective_engagement', width: 196, height: 60,
                matrix_grid: { rows: 1, columns: 3, gap: 8, headers: false } } },
            { id: 'collection', parent_id: 'root', properties: { matrix_cell: { row: 0, column: 0, column_span: 3, role: 'cell' },
                template_control: { kind: 'button', operation: 'collection' } } }],
            readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }), activate: async () => ({ ok: true }),
            renderNativeSlot: (_declared, { box }) => {
                control ||= createProgramCollectionControl({ id: 'collection', projectId: 'p', interactive: () => true,
                    refresh: () => { void runtime.render(); }, gateway });
                return control.build({ box });
            }, releaseNativeSlots: () => control?.close(),
            uiRuntime: { mountTree: async input => { handlers.clear(); tree = normalizeBevyUiTree({ id: input.id, tree: input.tree, handlers }); }, unmountTree: async () => {} } });
        try {
            await runtime.open(); await handlers.get('collection_matrix:collection_open:activate')();
            await vi.waitFor(() => expect(walk(tree.root).some(item => item.id === 'collection_save')).toBe(true));
            expect(walk(tree.root).filter(item => item.id === 'collection_question')).toHaveLength(1);
            expect(walk(tree.root).find(item => item.id === 'collection_save')).not.toHaveProperty('on');
            expect(handlers.get('collection_matrix:collection_save:activate')).toBeTypeOf('function');
            await runtime.setEmbeddedProjection({ bounds: { x: 0, y: 0, width: 390, height: 700 }, refresh: vi.fn() });
            expect(walk(runtime.readEmbeddedProjection()).some(item => item.id === 'collection_open')).toBe(true);
        } finally { await runtime.destroy(); dom.window.close(); }
    });
});
