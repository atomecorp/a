import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildEngagementPreview } from '../../eVe/domains/programs/project_program_model.js';
import { createProjectProgramRuntime } from '../../eVe/domains/programs/project_program_runtime.js';
import { commitMatrixControlValue } from '../../eVe/domains/matrix/matrix_grid_runtime.js';
import { createMatrixTemplateRuntime } from '../../eVe/domains/matrix/matrix_template_runtime.js';
import { restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';
import { mergeSlotProps } from '../../eVe/domains/templates/project_template_model.js';
import { eveT, setEveLocale } from '../../eVe/i18n/i18n.js';
import { ensureObjectiveEngagement } from '../../eVe/domains/templates/system_template_runtime.js';
import { objectiveEngagementAtoms, systemTemplateSpec } from '../../eVe/domains/templates/system_template_catalog.js';
import { helpTopicBody, searchHelpTopics } from '../../eVe/intuition/tools/help_tool_model.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { normalizeCanonicalAtome, sanitizeAtomeProperties } from '../../atome/src/shared/atome_contract.js';

const labels = Object.fromEntries(['minimum', 'gentle', 'regular', 'sustained', 'ambitious']
    .map((name, index) => [index + 1, 'eve.program.effort.' + name]));
const control = { kind: 'slider', compact: true, folded_value: true, value_key: 'accepted_engagement', label_key: 'eve.program.effort',
    icon: 'monitor', min: 1, max: 5, step: 1, value_label_keys: labels };
const walk = node => [node, ...(node.children || []).flatMap(walk)];
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); setEveLocale('fr'); });

const canonicalFixture = (declared = control) => {
    const projectId = 'effort_contract';
    const records = new Map([
        [projectId, { id: projectId, type: 'project', properties: {
            project_program: { involvement: { minutes: 10, rhythm: 3 }, sleep_preferences: { effort: 70 } }
        } }],
        ['matrix', { id: 'matrix', project_id: projectId, parent_id: projectId, properties: {
            module: 'matrix', matrix_template: 'effort', matrix_grid: { columns: 3, rows: 1, gap: 8, headers: false }
        } }],
        ['effort', { id: 'effort', project_id: projectId, parent_id: 'matrix', properties: {
            template_control: structuredClone(declared), template_value: 1
        } }]
    ]);
    const history = [];
    const commitBatch = vi.fn(async events => {
        history.push(structuredClone(events));
        for (const event of events) {
            const previous = records.get(event.atome_id);
            records.set(event.atome_id, { ...previous, id: event.atome_id, type: event.type || previous?.type,
                project_id: event.project_id, parent_id: event.parent_id || previous?.parent_id,
                properties: sanitizeAtomeProperties({ ...previous?.properties, ...event.props }) });
        }
        return { ok: true };
    });
    const win = { __eveWorkspaceMode: { mode: 'project', projectId }, Atome: {
        getStateCurrent: async id => records.get(id), listStateCurrent: async projectId => [...records.values()]
            .filter(record => record.project_id === projectId), commitBatch
    } };
    vi.stubGlobal('window', win); restoreProjectWorkModeValue(projectId, 'consultation', { windowRef: win });
    return { records, history, commitBatch, projectId };
};

describe('accepted engagement uses the canonical Matrix value contract', () => {
    it('creates the declared Atomes once and keeps re-entry, template instances and old preferences stable', async () => {
        const f = canonicalFixture(); f.records.delete('effort'); f.records.delete('matrix'); registerCoreAtomeTypes();
        const original = structuredClone(f.records.get(f.projectId));
        const result = await ensureObjectiveEngagement(f.projectId);
        expect(result).toMatchObject({ ok: true, created: true }); expect(f.history).toHaveLength(1);
        expect(f.history[0]).toHaveLength(9);
        for (const record of f.records.values()) if (record.id !== f.projectId) {
            expect(() => normalizeCanonicalAtome({ id: record.id, type: record.type, properties: record.properties })).not.toThrow();
        }
        const cell = f.records.get(result.atome_id);
        expect(cell.properties.template_control).toEqual(control);
        expect(Object.hasOwn(cell.properties, 'template_value')).toBe(false);
        cell.properties.template_value = 5;
        expect(await ensureObjectiveEngagement(f.projectId)).toEqual({ ok: true, created: false, atome_id: result.atome_id });
        expect(f.history).toHaveLength(1); expect(f.records.get(f.projectId)).toEqual(original);
        expect(cell.properties.template_value).toBe(5);
        expect(systemTemplateSpec('sleep').version).toBe(2);
        expect(systemTemplateSpec('music_title').version).toBe(2);
        expect(objectiveEngagementAtoms()).toHaveLength(9);
    });
    it('does not create an assembly when the project is locked or a canonical commit is refused', async () => {
        const f = canonicalFixture(); f.records.delete('effort'); f.records.delete('matrix');
        f.records.get(f.projectId).properties.locked = true;
        expect((await ensureObjectiveEngagement(f.projectId)).ok).toBe(false); expect(f.commitBatch).not.toHaveBeenCalled();
        delete f.records.get(f.projectId).properties.locked;
        f.commitBatch.mockResolvedValueOnce({ ok: false, error: 'permission_denied' });
        expect(await ensureObjectiveEngagement(f.projectId)).toEqual({ ok: false, error: 'permission_denied' });
        expect(f.records.size).toBe(1);
    });
    it('places new controls below existing content and does not reinterpret an incompatible older control', async () => {
        const f = canonicalFixture(); f.records.delete('effort'); f.records.delete('matrix');
        f.records.set('old', { id: 'old', project_id: f.projectId, properties: { top: 40, height: 120 } });
        const result = await ensureObjectiveEngagement(f.projectId);
        const cell = f.records.get(result.atome_id), root = f.records.get(cell.parent_id);
        expect(root.properties.top).toBeGreaterThan(160);
        cell.properties.template_control.max = 100;
        expect(await ensureObjectiveEngagement(f.projectId)).toMatchObject({ ok: false, error: 'objective_engagement_control_incompatible' });
        expect(f.history).toHaveLength(1);
    });
    it.each(['fr', 'en'])('uses the existing on-demand Help catalogue for engagement and capacity (%s)', locale => {
        setEveLocale(locale); const topic = searchHelpTopics('effort', { workspaceMode: 'project' })[0];
        expect(topic.id).toBe('objective_effort');
        expect(helpTopicBody(topic)).toContain('10'); expect(helpTopicBody(topic)).toContain('2–5');
        expect(helpTopicBody(topic)).not.toContain('eve.help.');
    });
    it.each([0, 2.5, 5.1, NaN, Infinity, '3'])('rejects invalid value %s before the durable mutation', async value => {
        const f = canonicalFixture();
        expect(await commitMatrixControlValue({ atome_id: 'effort', value })).toMatchObject({ ok: false, error: 'matrix_control_value_invalid' });
        expect(f.commitBatch).not.toHaveBeenCalled(); expect(f.records.get('effort').properties.template_value).toBe(1);
    });
    it('persists and reconstructs exactly the five levels without changing rhythm or legacy Sleep effort', async () => {
        const f = canonicalFixture(), original = structuredClone(f.records.get(f.projectId));
        for (const value of [1, 2, 3, 4, 5]) {
            expect(await commitMatrixControlValue({ atome_id: 'effort', value })).toMatchObject({ ok: true });
            const hydrated = JSON.parse(JSON.stringify([...f.records.values()]));
            expect(hydrated.find(record => record.id === 'effort').properties.template_value).toBe(value);
            expect(mergeSlotProps({ template_control: control }, hydrated.find(record => record.id === 'effort').properties).template_value).toBe(value);
        }
        expect(f.history).toHaveLength(5); expect(f.records.get(f.projectId)).toEqual(original);
        expect(f.history.every(events => events.length === 1 && events[0].atome_id === 'effort'
            && Object.keys(events[0].props).join() === 'template_value')).toBe(true);
    });
    it('retains valid fractional controls and rejects undeclared named values', async () => {
        const f = canonicalFixture({ kind: 'slider', value_key: 'hours', min: 1, max: 11, step: .5 });
        expect((await commitMatrixControlValue({ atome_id: 'effort', value: 2.5 })).ok).toBe(true);
        expect((await commitMatrixControlValue({ atome_id: 'effort', value: 2.7 })).ok).toBe(false);
        f.records.get('effort').properties.template_control = { ...control, value_label_keys: { 1: labels[1] } };
        expect((await commitMatrixControlValue({ atome_id: 'effort', value: 2 })).ok).toBe(false);
    });
    it('keeps ancestor locks effective for named controls', async () => {
        const f = canonicalFixture(); f.records.get('matrix').properties.locked = true;
        expect((await commitMatrixControlValue({ atome_id: 'effort', value: 5 })).ok).toBe(false);
        expect(f.commitBatch).not.toHaveBeenCalled();
    });
    it.each(['fr', 'en'])('projects translated captions and cancels a draft without persisting it (%s)', async locale => {
        const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { pretendToBeVisual: true });
        vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); setEveLocale(locale);
        const records = [{ id: 'matrix', properties: { module: 'matrix', matrix_template: 'effort', width: 196, height: 60,
            matrix_grid: { columns: 3, rows: 1, gap: 8, headers: false } } }, { id: 'effort', parent_id: 'matrix', properties: {
            matrix_cell: { row: 0, column: 0, role: 'cell' }, template_control: control, template_value: 1
        } }];
        const values = { accepted_engagement: 1 }, commit = vi.fn(async () => ({ ok: true })); let tree;
        const runtime = createMatrixTemplateRuntime({ treeId: 'effort_contract_tree', records,
            readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }), readValues: () => values,
            writeDraft: (key, value) => { values[key] = value; }, commitValue: commit, activate: async () => ({ ok: true }),
            uiRuntime: { mountTree: async input => { tree = input.tree; }, unmountTree: async () => {} } });
        try {
            await runtime.open(); const slider = () => walk(tree.root).find(node => node.id === 'effort');
            slider().on.press(); slider().on.drag({ delta_x: 196 }); await runtime.render();
            expect(values.accepted_engagement).toBe(5);
            expect(walk(tree.root).find(node => node.id === 'effort_value').text).toBe(eveT(labels[5]));
            slider().on.cancel(); await runtime.render();
            expect(values.accepted_engagement).toBe(1); expect(commit).not.toHaveBeenCalled();
            expect(records[1].properties.template_value).toBe(1);
        } finally { await runtime.destroy(); dom.window.close(); }
    });
});

describe('optional capacity and engagement preview', () => {
    const capacityControl = objectiveEngagementAtoms().find(atom => atom.ref === 'current_capacity').props.template_control;
    it('explicit re-entry extends the earlier assembly once, preserving effort and refusing a locked Matrix parent', async () => {
        const f = canonicalFixture(); f.records.delete('effort'); f.records.delete('matrix');
        const [root, effort] = objectiveEngagementAtoms();
        f.records.set('old_matrix', { id: 'old_matrix', type: 'group', project_id: f.projectId, parent_id: f.projectId,
            properties: { ...root.props, height: 60, matrix_grid: { ...root.props.matrix_grid, rows: 1 }, locked: true } });
        f.records.set('old_effort', { id: 'old_effort', type: 'group', project_id: f.projectId, parent_id: 'old_matrix',
            properties: { ...effort.props, template_value: 5 } });
        expect((await ensureObjectiveEngagement(f.projectId)).ok).toBe(false); expect(f.history).toHaveLength(0);
        delete f.records.get('old_matrix').properties.locked;
        expect(await ensureObjectiveEngagement(f.projectId)).toMatchObject({ ok: true, atome_id: 'old_effort', created: true });
        expect(f.history[0]).toHaveLength(8); expect(f.records.get('old_effort').properties.template_value).toBe(5);
        expect(await ensureObjectiveEngagement(f.projectId)).toMatchObject({ ok: true, atome_id: 'old_effort', created: false });
        expect(f.history).toHaveLength(1);
        for (const atom of f.records.values()) if (atom.properties.template_control?.value_key !== 'accepted_engagement')
            expect(Object.hasOwn(atom.properties, 'template_value')).toBe(false);
    });
    it('persists declared choices and clearing through the same canonical pipeline, rejecting unknown and disabled values', async () => {
        const f = canonicalFixture(capacityControl);
        for (const value of ['unrestricted', 'limited', 'advice_needed', 'unknown', null]) {
            expect((await commitMatrixControlValue({ atome_id: 'effort', value })).ok).toBe(true);
            expect(JSON.parse(JSON.stringify(f.records.get('effort'))).properties.template_value).toBe(value);
        }
        const writes = f.history.length;
        for (const value of ['other', 1, undefined, {}, ' limited ']) {
            expect((await commitMatrixControlValue({ atome_id: 'effort', value })).ok).toBe(false);
        }
        expect(f.history).toHaveLength(writes);
        f.records.get('effort').properties.template_control.options[0].disabled = true;
        expect((await commitMatrixControlValue({ atome_id: 'effort', value: 'unrestricted' })).ok).toBe(false);
        f.records.get('matrix').properties.locked = true;
        expect((await commitMatrixControlValue({ atome_id: 'effort', value: 'limited' })).ok).toBe(false);
    });
    it.each([null, 'limited', 'unknown', 'advice_needed'])('keeps high effort light with ten explicit minutes and capacity %s', capacity => {
        const result = buildEngagementPreview({ effort: 5, capacity, available_minutes: 10 });
        expect(result).toMatchObject({ ok: true, effort: 5, capacity, proposed_minutes: 5, remaining_minutes: 5, scheduled: false });
        expect(result.seeds).toHaveLength(1); expect(result.seeds[0].editable).toBe(true);
        expect(result).not.toHaveProperty('actions'); expect(result).not.toHaveProperty('calendar');
    });
    it('bounds every level and preserves explicit zero, sub-minute budgets and optional capacity', () => {
        for (let effort = 1; effort <= 5; effort++) for (const capacity of [null, 'unrestricted', 'limited', 'advice_needed', 'unknown'])
            for (const available_minutes of [0, .1, 2, 5, 10, 15, 60, 10080]) {
                const result = buildEngagementPreview({ effort, capacity, available_minutes });
                expect(result.proposed_minutes).toBeLessThanOrEqual(available_minutes);
                expect(result.seeds.length).toBeLessThanOrEqual(effort);
                expect(result.seeds.every(seed => seed.minutes > 0 && seed.editable)).toBe(true);
                expect(result.scheduled).toBe(false);
            }
        expect(buildEngagementPreview({ effort: 5, available_minutes: 0 })).toMatchObject({ seeds: [], preparation_only: true });
        expect(() => buildEngagementPreview({ effort: 5 })).toThrow('program_explicit_time_required');
        expect(() => buildEngagementPreview({ effort: 5, available_minutes: '' })).toThrow('program_explicit_time_required');
        expect(() => buildEngagementPreview({ effort: 2.5, available_minutes: 10 })).toThrow('program_engagement_required');
    });
    it('reads canonical controls in the private active project without requiring an operational programme or writing', async () => {
        const store = new Map([
            ['p', { id: 'p', type: 'project', owner_id: 'alice', properties: { project_intent: { family: 'health', objective_id: 'OBJ-13' } } }],
            ['effort', { id: 'effort', type: 'group', owner_id: 'alice', project_id: 'p', properties: { template_control: control, template_value: 5 } }],
            ['capacity', { id: 'capacity', type: 'group', owner_id: 'alice', project_id: 'p', properties: { template_control: capacityControl, template_value: 'limited' } }]
        ]);
        let active = 'p', principal = 'alice';
        const commit = vi.fn(), calendar = { createEvent: vi.fn(), updateEvent: vi.fn() };
        const runtime = createProjectProgramRuntime({ read: async id => store.get(id), actor: () => principal, project: () => active, commit, calendar });
        const input = { operation: 'engagement_preview', project_id: 'p', engagement_atome_id: 'effort', capacity_atome_id: 'capacity', available_minutes: 10 };
        expect(await runtime.invoke(input)).toMatchObject({ ok: true, effort: 5, capacity: 'limited', proposed_minutes: 5 });
        store.get('effort').properties.template_value = 1;
        expect(await runtime.invoke(input)).toMatchObject({ ok: true, effort: 1 });
        store.get('capacity').project_id = 'foreign';
        expect(await runtime.invoke(input)).toMatchObject({ ok: false, error: 'program_engagement_control_denied' });
        store.get('capacity').project_id = 'p'; store.get('capacity').deleted = true;
        expect((await runtime.invoke(input)).ok).toBe(false); delete store.get('capacity').deleted;
        active = 'q'; expect((await runtime.invoke(input)).ok).toBe(false); active = 'p';
        principal = 'bob'; expect((await runtime.invoke(input)).ok).toBe(false);
        principal = 'alice';
        const changing = createProjectProgramRuntime({ read: async id => { principal = 'bob'; return store.get(id); }, actor: () => principal, project: () => active });
        expect(await changing.invoke(input)).toMatchObject({ ok: false, error: 'program_context_changed' });
        expect(commit).not.toHaveBeenCalled(); expect(calendar.createEvent).not.toHaveBeenCalled(); expect(calendar.updateEvent).not.toHaveBeenCalled();
    });
    it.each(['fr', 'en'])('uses native radios and waits for successful canonical commits (%s)', async locale => {
        setEveLocale(locale); const dom = new JSDOM('<canvas></canvas>', { pretendToBeVisual: true });
        vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
        const atoms = objectiveEngagementAtoms(), ids = Object.fromEntries(atoms.map(atom => [atom.ref, atom.ref]));
        const records = atoms.map(atom => ({ id: ids[atom.ref], parent_id: ids[atom.parent_ref], properties: atom.props }));
        const values = { current_capacity: '' }, commit = vi.fn(async () => ({ ok: false, error: 'denied' })); let tree;
        const runtime = createMatrixTemplateRuntime({ treeId: 'capacity_tree', records,
            readBounds: () => ({ x: 0, y: 0, width: 390, height: 844 }), readValues: () => values,
            writeDraft: (key, value) => { values[key] = value; }, commitValue: commit, activate: async () => ({ ok: true }),
            uiRuntime: { mountTree: async input => { tree = input.tree; }, unmountTree: async () => {} } });
        try {
            await runtime.open(); const radio = () => walk(tree.root).find(node => node.id === 'current_capacity_limited');
            expect(radio().kind).toBe('radio');
            expect(radio().accessibility.label).toBe(eveT('eve.program.capacity.limited'));
            await radio().on.activate(); expect(values.current_capacity).toBe('');
            commit.mockResolvedValueOnce({ ok: true });
            await radio().on.activate(); expect(values.current_capacity).toBe('limited');
            expect(commit).toHaveBeenLastCalledWith('current_capacity', 'limited');
        } finally { await runtime.destroy(); dom.window.close(); }
    });
});
