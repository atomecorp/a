import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildTimeBudgetPreview, activityOccurrenceIds, validateTimeBudget, displayBudget, initialProgram } from '../../eVe/domains/programs/project_program_model.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { commitMatrixControlValue } from '../../eVe/domains/matrix/matrix_grid_runtime.js';
import { createMatrixTemplateRuntime } from '../../eVe/domains/matrix/matrix_template_runtime.js';
import { objectiveEngagementAtoms } from '../../eVe/domains/templates/system_template_catalog.js';
import { authorizeProjectTool, restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';
import { parseExplicitNumericInputValue } from '../../atome/src/squirrel/components/numeric_input_contract.js';
import { eveT, setEveLocale } from '../../eVe/i18n/i18n.js';

const walk = node => [node, ...(node.children || []).flatMap(walk)];
afterEach(() => { vi.unstubAllGlobals(); setEveLocale('fr'); });
describe('one canonical Matrix time budget', () => {
    it('moves the same native controller into and out of a parent tree without accepting time or leaving a private mount', async () => {
        const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { pretendToBeVisual: true });
        vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
        const records = objectiveEngagementAtoms().map(atom => ({ id: atom.ref, parent_id: atom.parent_ref, properties: atom.props }));
        const values = {}, commitValue = vi.fn(), refresh = vi.fn();
        const uiRuntime = { mountTree: vi.fn(async () => {}), unmountTree: vi.fn(async () => {}) };
        const runtime = createMatrixTemplateRuntime({ treeId: 'embedded_budget', records,
            readBounds: () => ({ x: 10, y: 10, width: 390, height: 844 }), readValues: () => values,
            writeDraft: (key, value) => { values[key] = value; }, commitValue, activate: async () => ({ ok: true }), uiRuntime });
        try {
            await runtime.open(); expect(uiRuntime.mountTree).toHaveBeenCalledTimes(1);
            const input = { bounds: { x: 0, y: 60, width: 600, height: 400 }, refresh };
            await runtime.setEmbeddedProjection(input);
            expect(uiRuntime.unmountTree).toHaveBeenCalledTimes(1);
            expect(uiRuntime.mountTree).toHaveBeenCalledTimes(1);
            expect(walk(runtime.readEmbeddedProjection()).find(node => node.id === 'available_time_budget')).toBeTruthy();
            await runtime.setEmbeddedProjection(input); expect(uiRuntime.unmountTree).toHaveBeenCalledTimes(1);
            expect(commitValue).not.toHaveBeenCalled(); expect(values).toEqual({});
            const preservedBudget = { minutes: 20, basis: 'day', days: [1] };
            values.available_time_budget = preservedBudget;
            await runtime.render();
            walk(runtime.readEmbeddedProjection()).find(node => node.id === 'available_time_budget').on.press({ x: 20 });
            await runtime.setEmbeddedProjection(null);
            expect(runtime.readEmbeddedProjection()).toBeNull(); expect(uiRuntime.mountTree).toHaveBeenCalledTimes(2);
            expect(values.available_time_budget).toEqual(preservedBudget);
            expect(refresh).toHaveBeenCalled(); expect(commitValue).not.toHaveBeenCalled();
        } finally { await runtime.destroy(); dom.window.close(); }
    });
    it('distinguishes explicit decimals and zero from an unanswered or malformed numeric field', () => {
        expect(parseExplicitNumericInputValue(' 12,5 ')).toBe(12.5);
        expect(parseExplicitNumericInputValue('.25')).toBe(0.25);
        expect(parseExplicitNumericInputValue('0')).toBe(0);
        for (const value of ['', ' ', null, 0, '0x10', '12 min', '1,2.3', 'Infinity', '1e999'])
            expect(() => parseExplicitNumericInputValue(value)).toThrow();
    });
    it('converts chosen days and preserves the original through repeated view conversions', () => {
        const original = { minutes: 20, basis: 'day', days: [1, 2, 3, 4, 5] };
        expect(displayBudget(original, 'week')).toBe(100);
        const exact = { minutes: 100.003, basis: 'week', days: [1, 3, 5] };
        for (let index = 0; index < 1000; index++) {
            expect(displayBudget(exact, 'week')).toBe(100.003);
            expect(displayBudget(exact, 'day')).toBe(100.003 / 3);
        }
        expect(exact.minutes).toBe(100.003);
        expect(displayBudget({ ...original, days: [] }, 'week')).toBeNull();
        expect(displayBudget({ ...original, minutes: 0 }, 'week')).toBe(0);
        expect(validateTimeBudget({ ...original, minutes: 600 })).toMatchObject({ minutes: 600 });
    });
    it('validates the compound value before one durable write and retains locks and project scope', async () => {
        const projectId = 'budget_project', matrixId = 'budget_matrix';
        const record = { id: 'budget', project_id: projectId, parent_id: matrixId, properties: {
            template_control: { kind: 'time_budget', compact: true, value_key: 'available_time_budget' }
        } };
        const root = { id: matrixId, project_id: projectId, parent_id: projectId, properties: { module: 'matrix',
            matrix_template: 'objective_engagement', matrix_grid: { rows: 1, columns: 3, gap: 8 } } };
        const records = new Map([[projectId, { id: projectId, type: 'project', properties: {} }], [matrixId, root], ['budget', record]]);
        const commitBatch = vi.fn(async events => { for (const event of events) Object.assign(records.get(event.atome_id).properties, structuredClone(event.props)); return { ok: true }; });
        const win = { __eveWorkspaceMode: { mode: 'project', projectId }, Atome: { getStateCurrent: async id => records.get(id), commitBatch } };
        vi.stubGlobal('window', win); restoreProjectWorkModeValue(projectId, 'consultation', { windowRef: win });
        const value = { minutes: 20, basis: 'day', days: [1, 2, 3, 4, 5] };
        expect((await commitMatrixControlValue({ atome_id: 'budget', value })).ok).toBe(true);
        expect(record.properties.template_value).toEqual(value); expect(commitBatch).toHaveBeenCalledTimes(1);
        expect(commitBatch.mock.calls[0][0]).toEqual([{ kind: 'set', atome_id: 'budget', project_id: projectId, props: { template_value: value } }]);
        for (const invalid of [null, 0, '', { ...value, minutes: null }, { ...value, minutes: -1 }, { ...value, basis: 'month' },
            { ...value, days: [1, 1] }, { ...value, days: [7] }, { ...value, rhythm: 3 }, { ...value, minutes: Infinity }])
            expect((await commitMatrixControlValue({ atome_id: 'budget', value: invalid })).ok).toBe(false);
        expect(commitBatch).toHaveBeenCalledTimes(1);
        root.properties.locked = true;
        expect((await commitMatrixControlValue({ atome_id: 'budget', value: { ...value, minutes: 0 } })).ok).toBe(false);
        expect(record.properties.template_value).toEqual(value);
    });
    it('keeps the money budget optional: a typed value or null, never anything else', async () => {
        const projectId = 'money_project', matrixId = 'money_matrix';
        const record = { id: 'money', project_id: projectId, parent_id: matrixId, properties: {
            template_control: objectiveEngagementAtoms().find(atom => atom.ref === 'money_budget').props.template_control } };
        const root = { id: matrixId, project_id: projectId, parent_id: projectId, properties: { module: 'matrix',
            matrix_template: 'objective_engagement', matrix_grid: { rows: 1, columns: 3, gap: 8 } } };
        const records = new Map([[projectId, { id: projectId, type: 'project', properties: {} }], [matrixId, root], ['money', record]]);
        const commitBatch = vi.fn(async events => { for (const event of events) Object.assign(records.get(event.atome_id).properties, structuredClone(event.props)); return { ok: true }; });
        vi.stubGlobal('window', { __eveWorkspaceMode: { mode: 'project', projectId }, Atome: { getStateCurrent: async id => records.get(id), commitBatch } });
        expect(record.properties.template_control).toMatchObject({ kind: 'money_budget', optional: true, currency: 'EUR' });
        const value = { amount: 50, currency: 'EUR', basis: 'month' };
        expect((await commitMatrixControlValue({ atome_id: 'money', value })).ok).toBe(true);
        expect(record.properties.template_value).toEqual(value);
        for (const invalid of ['', 0, { ...value, amount: -1 }, { ...value, currency: 'eur' }, { ...value, basis: 'day' },
            { ...value, note: 'x' }, { amount: 5, currency: 'EUR' }, { ...value, amount: Infinity }])
            expect((await commitMatrixControlValue({ atome_id: 'money', value: invalid })).ok).toBe(false);
        expect((await commitMatrixControlValue({ atome_id: 'money', value: null })).ok).toBe(true);
        expect(record.properties.template_value).toBe(null);
        expect(commitBatch).toHaveBeenCalledTimes(2);
    });
    it.each(['fr', 'en'])('composes a native expandable square, day chips and original-preserving views (%s)', async locale => {
        setEveLocale(locale);
        const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { pretendToBeVisual: true });
        vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
        const atoms = objectiveEngagementAtoms(), records = atoms.map(atom => ({
            id: atom.ref, parent_id: atom.parent_ref, properties: atom.props
        }));
        const values = { available_time_budget: { minutes: 20, basis: 'day', days: [] } }, commits = []; let tree;
        const runtime = createMatrixTemplateRuntime({ treeId: 'budget_tree', records,
            readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }), readValues: () => values,
            writeDraft: (key, value) => { values[key] = value; },
            commitValue: async (key, value) => { validateTimeBudget(value); commits.push(structuredClone(value)); values[key] = value; return { ok: true }; },
            activate: async () => ({ ok: true }), uiRuntime: { mountTree: async input => { tree = input.tree; }, unmountTree: async () => {} } });
        const native = id => walk(tree.root).find(node => node.id === id);
        try {
            await runtime.open();
            expect(native('available_time_budget').kind).toBe('tool_slider');
            expect(native('available_time_budget').style.size[0]).toBe(60);
            native('available_time_budget').on.press({ x: 20 }); native('available_time_budget').on.release();
            await runtime.render();
            expect(native('available_time_budget').style.size[0]).toBeGreaterThan(60);
            for (let index = 0; index < 5; index++) {
                native('available_time_budget_days_chip_' + index).on.activate();
                await vi.waitFor(() => expect(commits).toHaveLength(index + 1)); await runtime.render();
            }
            expect(values.available_time_budget).toEqual({ minutes: 20, basis: 'day', days: [1, 2, 3, 4, 5] });
            native('available_time_budget_unit_chip_1').on.activate(); await runtime.render();
            expect(native('available_time_budget_value').text).toBe('100 min');
            expect(native('available_time_budget_summary').text).toContain('100');
            expect(native('available_time_budget_summary').text).toContain('20');
            expect(commits).toHaveLength(5);
            native('available_time_budget_unit_chip_0').on.activate(); await runtime.render();
            expect(native('available_time_budget_value').text).toBe('20 min');
            expect(values.available_time_budget.minutes).toBe(20);
            expect(native('available_time_budget_unit_chip_0_label').text).toBe(eveT('eve.program.day'));
        } finally { await runtime.destroy(); dom.window.close(); }
    });
});

describe('Programme consumes the Matrix budget without a second writable time control', () => {
    const fixture = value => {
        const store = new Map([
            ['p', { id: 'p', owner_id: 'alice', project_id: 'p', type: 'project', properties: { project_program: initialProgram('sleep') } }],
            ['budget', { id: 'budget', owner_id: 'alice', project_id: 'p', type: 'group', properties: {
                template_control: { kind: 'time_budget', value_key: 'available_time_budget' }, template_value: value } }]
        ]);
        const commit = vi.fn(async () => ({ ok: true }));
        const dependencies = { read: async id => structuredClone(store.get(id)), list: async () => [...store.values()],
            actor: () => 'alice', project: () => 'p', commit, now: () => '2029-01-01T00:00:00Z' };
        const input = { project_id: 'p', involvement: { minutes: 100, basis: 'day', days: [1], rhythm: 3 },
            period: { start: '2030-01-07T00:00:00Z', end: '2030-01-08T00:00:00Z' }, timeZone: 'UTC', reason: 'Synthetic proposal',
            windows: [{ start: '2030-01-07T10:00:00Z', end: '2030-01-07T11:00:00Z' }],
            actions: [{ key: 'a', title: 'Synthetic activity', tool: 'journal', start: '2030-01-07T10:00:00Z',
                end: '2030-01-07T10:08:00Z', minutes: 6, followupMinutes: 1, reviewMinutes: 1 }] };
        return { store, commit, dependencies, input, invoke: createProjectProgramRuntime(dependencies).invoke };
    };
    it('reads the current zero budget and rejects caller-supplied time without rewriting the historical programme', async () => {
        const f = fixture({ minutes: 0, basis: 'day', days: [1] });
        const before = structuredClone(f.store.get('p'));
        expect(await f.invoke({ operation: 'read', project_id: 'p' })).toMatchObject({ budget: { atome_id: 'budget', value: { minutes: 0 } } });
        expect(await f.invoke({ operation: 'preview', ...f.input })).toMatchObject({ ok: false, errors: ['program_budget_exceeded'] });
        expect(f.store.get('p')).toEqual(before); expect(f.commit).not.toHaveBeenCalled();
    });
    it('rejects unknown time, duplicate budget owners and incomplete canonical reads', async () => {
        const f = fixture(undefined);
        expect(await f.invoke({ operation: 'preview', ...f.input })).toMatchObject({ ok: false, error: 'program_explicit_time_required' });
        f.store.set('duplicate', { ...f.store.get('budget'), id: 'duplicate' });
        expect(await f.invoke({ operation: 'read', project_id: 'p' })).toMatchObject({ ok: false, error: 'program_budget_ambiguous' });
        const incomplete = createProjectProgramRuntime({ ...f.dependencies, list: async () => ({ records: [f.store.get('budget')], totalCount: 3 }) });
        expect(await incomplete.invoke({ operation: 'read', project_id: 'p' })).toMatchObject({ ok: false, error: 'program_state_read_incomplete' });
        expect(f.commit).not.toHaveBeenCalled();
    });
    it('refuses an earlier acceptance after the canonical budget changes', async () => {
        const f = fixture({ minutes: 10, basis: 'day', days: [1] });
        const preview = await f.invoke({ operation: 'preview', ...f.input }); expect(preview.ok).toBe(true);
        f.store.get('budget').properties.template_value.minutes = 12;
        expect(await f.invoke({ operation: 'accept', ...f.input, baseRevision: 0, request_id: 'stale', previewSignature: preview.previewSignature }))
            .toMatchObject({ ok: false, error: 'program_preview_changed' });
        expect(f.commit).not.toHaveBeenCalled();
    });
    it('retains the current Matrix budget when the native panel prepares an older plan', async () => {
        const { createProgramPanelSurface } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_program_runtime.js');
        const surface = createProgramPanelSurface({ call: async () => ({ ok: true, proposal: { involvement: {
            minutes: 100, basis: 'week', days: [1, 2, 3], rhythm: 5 } } }) });
        const state = surface.readState();
        Object.assign(state, { projectId: 'p', data: { program: initialProgram('sleep'), budget: {
            atome_id: 'budget', value: { minutes: 20, basis: 'day', days: [1] } }, events: [], observations: [], revisions: [] },
            involvement: { minutes: 20, basis: 'day', days: [1], rhythm: 3 } });
        const nodes = surface.buildContent(state, { emit: () => {}, refresh: () => {}, bodyWidth: 600 }).flatMap(walk);
        expect(nodes.some(node => node.id === 'program_openBudget')).toBe(true);
        expect(nodes.some(node => ['program_time', 'program_unit', 'program_days'].includes(node.id))).toBe(false);
        expect(await surface.handleEvent({ type: 'program.days', value: '2' })).toMatchObject({ ok: false, error: 'program_budget_external_owner' });
        await surface.handleEvent({ type: 'program.resume' });
        expect(state.involvement).toEqual({ minutes: 20, basis: 'day', days: [1], rhythm: 3 });
        surface.onClose();
    });
    it('permits canonical Natural navigation in Consultation while preserving scene-edit refusals', async () => {
        const win = { __eveWorkspaceMode: { mode: 'project', projectId: 'budget_navigation' } };
        restoreProjectWorkModeValue('budget_navigation', 'consultation', { windowRef: win });
        const invoke = id => authorizeProjectTool({ tool: { id }, windowRef: win });
        expect((await invoke('ui.view.mode.natural')).ok).toBe(true);
        expect((await invoke('ui.resize')).ok).toBe(false);
        expect((await invoke('ui.text.create')).ok).toBe(false);
        restoreProjectWorkModeValue('budget_navigation', 'edit', { windowRef: win });
    });
});

describe('planned shared occurrence budget', () => {
    const budget = { minutes: 90, basis: 'week', days: [1, 2, 3, 4, 5] };
    const period = { start: '2030-01-07T00:00:00Z', end: '2030-01-14T00:00:00Z' };
    const occurrence = (id, start, minutes) => ({ occurrence_id: activityOccurrenceIds(id).occurrence_id, calendar_event_id: id,
        start, end: new Date(Date.parse(start) + minutes * 60000).toISOString(),
        time_breakdown: { active: minutes, rest: 0, preparation: 0, travel: 0 }, counted_parts: ['active', 'rest', 'preparation', 'travel'] });
    const first = occurrence('event_a', '2030-01-07T10:00:00Z', 50);
    const second = occurrence('event_b', '2030-01-08T10:00:00Z', 60);
    it('counts one canonical occurrence once and proposes reduce/defer for 110 against 90', () => {
        const result = buildTimeBudgetPreview({ budget, period, timeZone: 'UTC', occurrences: [first, first, second] });
        expect(result).toMatchObject({ ok: true, planned_minutes: 110, over_budget: true, scheduled: false });
        expect(result.occurrences).toHaveLength(2);
        expect(result.adjustments).toEqual([{ unit: '2030-01-07', excess_minutes: 20, reduce: { minutes: 20, requiresAcceptance: true },
            defer: { occurrence_ids: [second.occurrence_id], minutes: 60, requiresAcceptance: true } }]);
        expect(buildTimeBudgetPreview({ budget: { ...budget, minutes: 0 }, period, timeZone: 'UTC', occurrences: [] }))
            .toMatchObject({ ok: true, planned_minutes: 0, preparation_only: true, scheduled: false });
    });
    it('retains unknown components, explicit counting choices, and physical calendar occupancy', () => {
        const item = { ...second, time_breakdown: { active: 40, preparation: 20 }, counted_parts: ['active'] };
        const result = buildTimeBudgetPreview({ budget, period, timeZone: 'UTC', occurrences: [item] });
        expect(result.planned_minutes).toBe(40); expect(result.occurrences[0].occupancy_minutes).toBe(60);
        expect(result.occurrences[0].unknown_parts).toEqual(['rest', 'travel']);
        expect(result.occurrences[0].time_breakdown).not.toHaveProperty('rest');
        expect(() => buildTimeBudgetPreview({ budget, period, timeZone: 'UTC', occurrences: [{ ...item, counted_parts: ['travel'] }] }))
            .toThrow('program_time_breakdown_required');
        const conflicting = { ...first, time_breakdown: { ...first.time_breakdown, active: 40 } };
        expect(buildTimeBudgetPreview({ budget, period, timeZone: 'UTC', occurrences: [first, conflicting] }).errors)
            .toContain('program_shared_duration_conflict');
        expect(buildTimeBudgetPreview({ budget, period, timeZone: 'UTC', occurrences: [{ ...first, time_breakdown: { ...first.time_breakdown, travel: 1 } }] }).errors)
            .toContain('program_time_breakdown_exceeds_placement');
        expect(buildTimeBudgetPreview({ budget, period, timeZone: 'UTC', occurrences: [first],
            commitments: [{ id: 'busy', start: first.start, end: first.end }] }).errors).toContain('program_conflict');
    });
    it('uses real canonical links/read owners, checks context and makes no durable or Calendar writes', async () => {
        const store = new Map([
            ['p', { id: 'p', owner_id: 'alice', type: 'project', properties: {} }],
            ['budget', { id: 'budget', owner_id: 'alice', project_id: 'p', type: 'group', properties: {
                template_control: { kind: 'time_budget', value_key: 'available_time_budget' }, template_value: budget } }],
            ['activity', { id: 'activity', owner_id: 'alice', type: 'record', properties: { program_activity: {} } }]
        ]);
        for (const item of [first, second]) {
            store.set(item.occurrence_id, { id: item.occurrence_id, owner_id: 'alice', type: 'record', properties: {
                program_occurrence: { activity_id: 'activity', calendar_event_id: item.calendar_event_id } } });
            store.set(item.calendar_event_id, { id: item.calendar_event_id, owner_id: 'alice', type: 'calendar_event', properties: {
                start: item.start, end: item.end, calendar_scope: 'personal', status: 'open' } });
        }
        let active = 'p', principal = 'alice';
        const commit = vi.fn(), calendar = { listEvents: vi.fn(async () => ({ ok: true, items: [first, second].map(item => ({
            id: item.calendar_event_id, start: new Date(item.start), end: new Date(item.end) })) })),
            createEvent: vi.fn(), updateEvent: vi.fn() };
        const runtime = createProjectProgramRuntime({ read: async id => store.get(id), actor: () => principal, project: () => active, commit, calendar });
        const input = { project_id: 'p', operation: 'budget_preview', time_budget_atome_id: 'budget', period, timeZone: 'UTC',
            occurrences: [first, first, second].map(({ occurrence_id, time_breakdown, counted_parts }) => ({ occurrence_id, time_breakdown, counted_parts })) };
        expect(await runtime.invoke(input)).toMatchObject({ ok: true, planned_minutes: 110, over_budget: true });
        store.get(first.calendar_event_id).owner_id = 'bob';
        expect((await runtime.invoke(input)).ok).toBe(false); store.get(first.calendar_event_id).owner_id = 'alice';
        active = 'q'; expect((await runtime.invoke(input)).ok).toBe(false); active = 'p';
        principal = 'bob'; expect((await runtime.invoke(input)).ok).toBe(false); principal = 'alice';
        calendar.listEvents.mockResolvedValueOnce({ ok: false, error: 'calendar_session_changed' });
        expect(await runtime.invoke(input)).toMatchObject({ ok: false, error: 'calendar_session_changed' });
        expect(commit).not.toHaveBeenCalled(); expect(calendar.createEvent).not.toHaveBeenCalled(); expect(calendar.updateEvent).not.toHaveBeenCalled();
    });
});
