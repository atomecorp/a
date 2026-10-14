import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { placeMatrixGrid, configureMatrixGrid, commitMatrixControlValue } from '../../eVe/domains/matrix/matrix_grid_runtime.js';
import { authorizeProjectTool, restoreProjectWorkModeValue } from '../../eVe/domains/rendering/project_work_mode_state.js';
import { recordsWithMoleculeGeometry } from '../../eVe/domains/rendering/project_scene_record_projection.js';
import { buildPropertiesFromSpec } from '../../eVe/intuition/runtime/tool_genesis_properties_runtime.js';
import { normalizeCreatedAtomeSize } from '../../eVe/intuition/runtime/tool_genesis_spec_runtime.js';
import { JSDOM } from 'jsdom';
import { createProjectViewMatrixContent } from '../../eVe/domains/rendering/project_view_matrix_content.js';
import { createProjectViewListContent } from '../../eVe/domains/rendering/project_view_list_content.js';
import { createMatrixTemplateRuntime } from '../../eVe/domains/matrix/matrix_template_runtime.js';
import { getRenderSurfaceState } from '../../eVe/domains/rendering/surface_runtime.js';
import { invokeProjectViewNavigation, resetProjectViewNavigation, enterProjectViewLevel, rememberProjectViewLevel,
    readProjectViewLevelView, readProjectViewNavigationContext, readState as readNavigationState } from '../../eVe/domains/rendering/project_view_navigation.js';
import { registerCoreAtomeTypes } from '../../atome/src/shared/core_atome_types.js';
import { normalizeCanonicalAtome } from '../../atome/src/shared/atome_contract.js';
import * as toolGateway from '../../eVe/intuition/runtime/tool_gateway.js';

describe('Matrix canonical relayout', () => {
    let records, commitBatch;
    beforeEach(() => {
        records = [];
        commitBatch = vi.fn(async events => {
            for (const event of events) Object.assign(records.find(record => record.atome_id === event.atome_id).properties, event.props);
            return { ok: true };
        });
        const createAtome = async spec => {
            const id = `a${records.length}`;
            const normalized = normalizeCreatedAtomeSize({ ...spec });
            records.push({ atome_id: id, type: spec.kind, project_id: 'p', parent_id: spec.parentId,
                properties: buildPropertiesFromSpec(normalized, 'p') });
            return { ok: true, id };
        };
        vi.stubGlobal('window', { Atome: { getStateCurrent: async id => records.find(record => record.atome_id === id),
            listStateCurrent: async () => records, commitBatch }, eveToolBase: { createAtome, loadProjectAtomes: vi.fn() } });
    });
    afterEach(() => vi.unstubAllGlobals());
    it('places nested objects in project coordinates and does not reuse prototype IDs', async () => {
        await placeMatrixGrid({ project_id: 'p', rows: 1, columns: 2, left: 40, top: 80, width: 210, height: 100, gap: 10,
            cell: { kind: 'shape', id: 'source', color: '#2468ac' } });
        expect(records.map(record => record.atome_id)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
        expect(records[2].properties).toMatchObject({ left: 40, top: 80, width: 100, height: 100, color: '#2468ac' });
        expect(records[4].properties).toMatchObject({ left: 150, top: 80, width: 100 });
    });
    it('retains cell identity, contents and material after shrinking and growing', async () => {
        const result = await placeMatrixGrid({ project_id: 'p', rows: 2, columns: 2, headers: true });
        const root = result.atome_id;
        const cell = records.find(record => record.properties.matrix_cell?.row === 1);
        const child = records.find(record => record.parent_id === cell.atome_id);
        child.properties.material = { backdrop: { blur: 12, alpha: .4 } };
        child.properties.color = '#abcdef';
        const count = records.length;
        expect((await configureMatrixGrid({ matrix_atome_id: root, rows: 1, headers: false })).ok).toBe(true);
        const reduced = recordsWithMoleculeGeometry(records);
        expect(reduced.some(record => record.atome_id === child.atome_id)).toBe(false);
        expect(records).toHaveLength(count);
        expect((await configureMatrixGrid({ matrix_atome_id: root, rows: 2, headers: true })).ok).toBe(true);
        expect(recordsWithMoleculeGeometry(records).some(record => record.atome_id === child.atome_id)).toBe(true);
        expect(child.properties).toMatchObject({ color: '#abcdef', material: { backdrop: { blur: 12, alpha: .4 } } });
        expect(records).toHaveLength(count);
        expect(commitBatch).toHaveBeenCalledTimes(3);
    });
    it('resizes and translates descendants through the shared geometry planner', async () => {
        const result = await placeMatrixGrid({ project_id: 'p', rows: 1, columns: 2, width: 210, height: 100, gap: 10 });
        const result2 = await configureMatrixGrid({ matrix_atome_id: result.atome_id, columns: 3, gap: 0 });
        expect(result2.ok).toBe(true);
        const firstContent = records[2].properties;
        expect(firstContent.left).toBe(40);
        expect(firstContent.width).toBe(70);
        expect(firstContent.height).toBe(100);
        expect(records[4].properties.left).toBe(110);
        expect(records[0].properties.matrix_grid.columns).toBe(3);
    });
});

describe('Matrix declared control use in non-edit modes', () => {
    const projectId = 'matrix_control_authorization';
    let records, win, commitBatch;
    const authorize = (input = { atome_id: 'authorized_cell' }, toolId = 'ui.matrix.value') => authorizeProjectTool({
        tool: { id: toolId }, context: { input }, windowRef: win
    });
    beforeEach(() => {
        records = new Map([
            ['authorized_matrix', { id: 'authorized_matrix', project_id: projectId, parent_id: projectId, properties: {
                module: 'matrix', matrix_template: 'control_contract', matrix_grid: { columns: 3, rows: 1, gap: 8 }
            } }],
            ['authorized_cell', { id: 'authorized_cell', project_id: projectId, parent_id: 'authorized_matrix', properties: {
                template_control: { kind: 'slider', value_key: 'minutes', min: 0, max: 60, step: 5 }, template_value: 10
            } }]
        ]);
        commitBatch = vi.fn(async () => ({ ok: true }));
        win = { __eveWorkspaceMode: { mode: 'project', projectId }, Atome: {
            getStateCurrent: vi.fn(async id => records.get(id)), commitBatch
        } };
        vi.stubGlobal('window', win);
        restoreProjectWorkModeValue(projectId, 'consultation', { windowRef: win });
    });
    afterEach(() => {
        restoreProjectWorkModeValue(projectId, 'edit', { windowRef: win });
        vi.unstubAllGlobals();
    });
    it.each(['consultation', 'performance'])('allows declared values in %s through the existing commit owner', async mode => {
        restoreProjectWorkModeValue(projectId, mode, { windowRef: win });
        expect(await authorize()).toEqual({ ok: true });
        expect(await commitMatrixControlValue({ atome_id: 'authorized_cell', value: 30 })).toMatchObject({ ok: true });
        expect(commitBatch).toHaveBeenCalledWith([{ kind: 'set', atome_id: 'authorized_cell', project_id: projectId,
            props: { template_value: 30 }, tx_id: undefined }], expect.objectContaining({ refreshState: true }));
        expect(records.get('authorized_cell').properties.template_value).toBe(10);
        expect(await authorize({ atome_id: 'authorized_cell' }, 'ui.resize')).toMatchObject({ ok: false });
        expect(await authorize({ matrix_atome_id: 'authorized_matrix' }, 'ui.matrix.configure')).toMatchObject({ ok: false });
    });
    it.each(['missing_target', 'missing_record', 'missing_control', 'missing_key', 'button', 'foreign_cell', 'foreign_parent',
        'missing_parent', 'cycle', 'missing_module', 'missing_template', 'deleted', 'deleted_parent', 'workspace', 'claimed_project'])
    ('rejects %s without widening scene-edit authorization', async reason => {
        const cell = records.get('authorized_cell'), parent = records.get('authorized_matrix');
        let input = { atome_id: 'authorized_cell' };
        if (reason === 'missing_target') input = {};
        if (reason === 'missing_record') records.delete(cell.id);
        if (reason === 'missing_control') delete cell.properties.template_control;
        if (reason === 'missing_key') delete cell.properties.template_control.value_key;
        if (reason === 'button') cell.properties.template_control.kind = 'button';
        if (reason === 'foreign_cell') cell.project_id = 'other';
        if (reason === 'foreign_parent') parent.project_id = 'other';
        if (reason === 'missing_parent') records.delete(parent.id);
        if (reason === 'cycle') cell.parent_id = cell.id;
        if (reason === 'missing_module') delete parent.properties.module;
        if (reason === 'missing_template') delete parent.properties.matrix_template;
        if (reason === 'deleted') cell.deleted_at = '2026-10-13T00:00:00Z';
        if (reason === 'deleted_parent') parent.deleted = true;
        if (reason === 'workspace') win.__eveWorkspaceMode.mode = 'dashboard';
        if (reason === 'claimed_project') input.project_id = 'other';
        expect(await authorize(input)).toMatchObject({ ok: false, error: 'project_work_mode_editing_blocked' });
        expect(commitBatch).not.toHaveBeenCalled();
    });
    it.each(['project', 'mode', 'workspace'])('rejects a %s change during canonical reads', async change => {
        let resolve;
        win.Atome.getStateCurrent.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const pending = authorize();
        if (change === 'project') win.__eveWorkspaceMode.projectId = 'other';
        if (change === 'mode') restoreProjectWorkModeValue(projectId, 'performance', { windowRef: win });
        if (change === 'workspace') win.__eveWorkspaceMode.mode = 'dashboard';
        resolve(records.get('authorized_cell'));
        expect(await pending).toMatchObject({ ok: false, error: 'project_work_mode_editing_blocked' });
    });
    it.each(['self_lock', 'parent_lock', 'self_hidden'])('preserves canonical %s rejection', async condition => {
        const record = records.get(condition === 'parent_lock' ? 'authorized_matrix' : 'authorized_cell');
        record.properties[condition === 'self_hidden' ? 'visible' : 'locked'] = condition !== 'self_hidden';
        expect(await authorize()).toEqual({ ok: true });
        expect(await commitMatrixControlValue({ atome_id: 'authorized_cell', value: 30 })).toMatchObject({
            ok: false, error: condition === 'self_hidden' ? 'target_hidden' : 'target_locked'
        });
        expect(commitBatch).not.toHaveBeenCalled();
    });
    it('retains backend rejection and never mutates the canonical read projection locally', async () => {
        commitBatch.mockResolvedValue({ ok: false, error: 'permission_denied' });
        expect(await authorize()).toEqual({ ok: true });
        expect(await commitMatrixControlValue({ atome_id: 'authorized_cell', value: 30 }))
            .toMatchObject({ ok: false, result: { error: 'permission_denied' } });
        expect(records.get('authorized_cell').properties.template_value).toBe(10);
    });
});

describe('Matrix canonical navigation resume', () => {
    const projectId = 'navigation_project', principal = 'navigation_principal';
    const navigationId = 'project_navigation:' + principal + ':' + projectId;
    let records, win, actorId, deps, commit;
    beforeEach(() => {
        registerCoreAtomeTypes(); actorId = principal;
        records = [
            { id: projectId, type: 'project', owner_id: principal, project_id: projectId, properties: { name: 'Project' } },
            { id: 'parent', type: 'group', project_id: projectId, parent_id: projectId, properties: { name: 'Parent' } },
            { id: 'child', type: 'group', project_id: projectId, parent_id: 'parent', properties: { name: 'Child' } },
            { id: 'leaf', type: 'text', project_id: projectId, parent_id: 'child', properties: { name: 'Leaf', text: 'Original content' } }
        ];
        win = { __eveWorkspaceMode: { mode: 'project', projectId } };
        vi.stubGlobal('window', win);
        commit = vi.fn(async event => {
            const normalized = normalizeCanonicalAtome({ id: event.atome_id, type: event.type, properties: event.props }).atome;
            const previous = records.find(record => record.id === event.atome_id);
            if (previous) previous.properties = normalized.properties;
            else records.push({ ...normalized, owner_id: actorId });
            return { ok: true };
        });
        deps = { windowRef: win, actor: () => actorId, read: async id => records.find(record => record.id === id),
            list: async () => records.filter(record => record.project_id === projectId), commit };
        resetProjectViewNavigation(projectId, 'Project');
    });
    afterEach(() => { resetProjectViewNavigation(''); vi.unstubAllGlobals(); });
    it('restores canonical levels, per-level selections and scroll after disposal without duplicating objects', async () => {
        rememberProjectViewLevel({ selectedIds: ['parent'], scrollOffsetY: 120 });
        expect(await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'parent' }, deps)).toMatchObject({ ok: true });
        rememberProjectViewLevel({ selectedIds: ['child'], scrollOffsetY: 240 });
        expect(await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'child' }, deps)).toMatchObject({ ok: true });
        rememberProjectViewLevel({ selectedIds: ['leaf'], scrollOffsetY: 360 });
        expect(await invokeProjectViewNavigation({ operation: 'save' }, deps)).toMatchObject({ ok: true });
        const count = records.length;
        resetProjectViewNavigation('');
        const restored = await invokeProjectViewNavigation({ operation: 'restore' }, deps);
        expect(restored).toMatchObject({ ok: true, context: { path: [projectId, 'parent', 'child'] } });
        expect(readProjectViewLevelView()).toEqual({ selectedIds: ['leaf'], scrollOffsetY: 360 });
        expect(await invokeProjectViewNavigation({ operation: 'back' }, deps)).toMatchObject({ ok: true });
        expect(readProjectViewLevelView()).toEqual({ selectedIds: ['child'], scrollOffsetY: 240 });
        expect(await invokeProjectViewNavigation({ operation: 'back' }, deps)).toMatchObject({ ok: true });
        expect(readProjectViewLevelView()).toEqual({ selectedIds: ['parent'], scrollOffsetY: 120 });
        expect(records).toHaveLength(count);
        expect(records.find(record => record.id === 'leaf').properties.text).toBe('Original content');
        expect(commit.mock.calls.every(([event]) => event.scope === 'global' && event.atome_id === navigationId)).toBe(true);
    });
    it('prunes a removed child during resume and derives current names from canonical records', async () => {
        enterProjectViewLevel(records[1]); enterProjectViewLevel(records[2]);
        expect((await invokeProjectViewNavigation({ operation: 'save' }, deps)).ok).toBe(true);
        records[1].properties.name = 'Renamed parent'; records[2].deleted = true;
        resetProjectViewNavigation('');
        expect((await invokeProjectViewNavigation({ operation: 'restore' }, deps)).ok).toBe(true);
        expect(readNavigationState()).toMatchObject({ depth: 1, current: { id: 'parent', name: 'Renamed parent' } });
    });
    it.each(['foreign_path', 'cycle', 'foreign_saved_owner', 'invalid_scroll', 'read_action'])('rejects %s without a durable write', async reason => {
        const context = readProjectViewNavigationContext();
        if (reason === 'foreign_path') context.path.push('leaf');
        if (reason === 'cycle') context.path.push(projectId);
        if (reason === 'foreign_saved_owner') records.push({ id: navigationId, type: 'record', owner_id: 'other', properties: { source_domain: 'project_view_navigation' } });
        if (reason === 'invalid_scroll') context.views.push({ level_id: projectId, selected_ids: [], scroll_y: -1 });
        const result = await invokeProjectViewNavigation({ operation: 'save', context }, { ...deps, action: reason === 'read_action' ? 'read' : 'commit' });
        expect(result.ok).toBe(false); expect(commit).not.toHaveBeenCalled();
        expect(readNavigationState().depth).toBe(0);
    });
    it.each(['actor', 'project'])('rejects a replaced %s during reads', async changed => {
        let resolve;
        const work = invokeProjectViewNavigation({ operation: 'save' }, { ...deps, read: () => new Promise(done => { resolve = done; }) });
        await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
        if (changed === 'actor') actorId = 'other'; else win.__eveWorkspaceMode.projectId = 'other';
        resolve(null);
        expect(await work).toMatchObject({ ok: false, error: 'project_view_navigation_context_changed' });
        expect(commit).not.toHaveBeenCalled();
    });
    it('restores during canonical project arrival without permitting a write during that transition', async () => {
        expect((await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'parent' }, deps)).ok).toBe(true);
        resetProjectViewNavigation(''); commit.mockClear();
        win.__eveWorkspaceMode = { mode: 'transition', targetMode: 'project', projectId };
        expect((await invokeProjectViewNavigation({ operation: 'restore' }, deps)).ok).toBe(true);
        expect(readNavigationState().current.id).toBe('parent');
        expect((await invokeProjectViewNavigation({ operation: 'save' }, deps)).ok).toBe(false);
        win.__eveWorkspaceMode.targetMode = 'dashboard';
        expect((await invokeProjectViewNavigation({ operation: 'restore' }, deps)).ok).toBe(false);
        expect(commit).not.toHaveBeenCalled();
    });
    it.each([null, { ok: false, error: 'read_denied' }, { records: [], totalCount: 4 }])('refuses an unavailable or incomplete hierarchy read (%j)', async listed => {
        const result = await invokeProjectViewNavigation({ operation: 'save' }, { ...deps, list: async () => listed });
        expect(result.ok).toBe(false); expect(commit).not.toHaveBeenCalled();
    });
    it('prunes canonical deletion properties and refuses deleted navigation records', async () => {
        await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'parent' }, deps);
        await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'child' }, deps);
        records[2].properties.__deleted = true; resetProjectViewNavigation('');
        expect((await invokeProjectViewNavigation({ operation: 'restore' }, deps)).ok).toBe(true);
        expect(readNavigationState().current.id).toBe('parent');
        records.find(record => record.id === navigationId).meta = { deleted_at: '2026-10-13' };
        expect((await invokeProjectViewNavigation({ operation: 'restore' }, deps)).ok).toBe(false);
    });
    it('retains newer view memory while a canonical save is awaiting acknowledgement', async () => {
        let acknowledge;
        commit.mockImplementationOnce(() => new Promise(done => { acknowledge = done; }));
        rememberProjectViewLevel({ selectedIds: ['parent'], scrollOffsetY: 10 });
        const saving = invokeProjectViewNavigation({ operation: 'save' }, deps);
        await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'));
        rememberProjectViewLevel({ selectedIds: [], scrollOffsetY: 25 });
        acknowledge({ ok: true }); expect((await saving).ok).toBe(true);
        expect(readProjectViewLevelView()).toEqual({ selectedIds: [], scrollOffsetY: 25 });
        expect((await invokeProjectViewNavigation({ operation: 'save' }, deps)).ok).toBe(true);
        expect(records.find(record => record.id === navigationId).properties.matrix_navigation.views[0].scroll_y).toBe(25);
    });
    it('serializes commands and refuses a queued request after the account changes', async () => {
        let acknowledge;
        commit.mockImplementationOnce(() => new Promise(done => { acknowledge = done; }));
        const first = invokeProjectViewNavigation({ operation: 'save' }, deps);
        await vi.waitFor(() => expect(acknowledge).toBeTypeOf('function'));
        const queued = invokeProjectViewNavigation({ operation: 'enter', atome_id: 'parent' }, deps);
        actorId = 'other'; acknowledge({ ok: true });
        expect((await first).ok).toBe(false);
        expect(await queued).toMatchObject({ ok: false, error: 'project_view_navigation_context_changed' });
        expect(commit).toHaveBeenCalledTimes(1);
    });
    it('rebuilds a detail projection from the live Atome without saving its business content', async () => {
        await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'parent' }, deps);
        await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'child' }, deps);
        await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'leaf' }, deps);
        resetProjectViewNavigation(''); records[3].properties.text = 'Updated canonical content';
        expect((await invokeProjectViewNavigation({ operation: 'restore' }, deps)).ok).toBe(true);
        expect(readNavigationState().current).toMatchObject({ entity: 'detail', record: { properties: { text: 'Updated canonical content' } } });
        expect(JSON.stringify(records.find(record => record.id === navigationId).properties.matrix_navigation)).not.toContain('canonical content');
    });
    it('restores a saved level in List and persists Back through the same registered navigation path', async () => {
        await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'parent' }, deps);
        resetProjectViewNavigation(projectId, 'Project');
        Object.assign(win, { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
            CustomEvent: class {}, __currentProject: { id: projectId } });
        const gateway = vi.spyOn(toolGateway, 'invokeToolGateway').mockImplementation(payload => {
            expect(payload.tool_id).toBe('ui.matrix.navigation');
            return invokeProjectViewNavigation(payload.input, deps);
        });
        const content = createProjectViewListContent({ requestRefresh: vi.fn() });
        try {
            expect((await content.load({ projectId, sourceRecords: records.filter(record => record.project_id === projectId) })).ok).toBe(true);
            expect(readNavigationState().current.id).toBe('parent');
            expect((await content.leaveLevel()).ok).toBe(true);
            expect(records.find(record => record.id === navigationId).properties.matrix_navigation.path).toEqual([projectId]);
            resetProjectViewNavigation(projectId, 'Project');
            expect((await content.load({ projectId, sourceRecords: records.filter(record => record.project_id === projectId) })).ok).toBe(true);
            expect(readNavigationState().depth).toBe(0);
        } finally { content.reset(); gateway.mockRestore(); }
    });
    it('does not publish a new level when the backend refuses its resume-state commit', async () => {
        commit.mockResolvedValue({ ok: false, error: 'permission_denied' });
        expect(await invokeProjectViewNavigation({ operation: 'enter', atome_id: 'parent' }, deps))
            .toMatchObject({ ok: false, error: 'permission_denied' });
        expect(readNavigationState().depth).toBe(0);
    });
});

describe('Matrix reload shares current native selection', () => {
    afterEach(() => { resetProjectViewNavigation(''); vi.unstubAllGlobals(); });
    it('exposes a navigation save refusal and clears it after a successful retry', async () => {
        const projectId = 'matrix_save_diagnostics';
        vi.stubGlobal('window', { __currentProject: { id: projectId }, dispatchEvent: vi.fn(), CustomEvent: class {},
            SelectionAPI: { selected: () => [], clear: vi.fn() } });
        resetProjectViewNavigation(projectId);
        const gateway = vi.spyOn(toolGateway, 'invokeToolGateway').mockResolvedValue({ ok: false, error: 'save_refused' });
        const content = createProjectViewMatrixContent({ requestRefresh: vi.fn() });
        try {
            await content.load({ projectId, sourceRecords: [], preserveSelection: true });
            expect(await content.clearSelection()).toMatchObject({ ok: false, error: 'save_refused' });
            expect(content.readState().navigationError).toBe('save_refused');
            gateway.mockResolvedValue({ ok: true }); await content.clearSelection();
            expect(content.readState().navigationError).toBeNull();
        } finally { content.reset(); gateway.mockRestore(); }
    });
    it('resetting a disposable List projection preserves the common navigation level', () => {
        vi.stubGlobal('window', { __currentProject: { id: 'shared_level' }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
        resetProjectViewNavigation('shared_level');
        enterProjectViewLevel({ id: 'parent_level', type: 'group', properties: { name: 'Parent' } });
        const before = readNavigationState();
        createProjectViewListContent({ requestRefresh: vi.fn() }).reset();
        expect(readNavigationState()).toEqual(before);
    });
    it('keeps a newer List/native selection when reprojecting instead of applying an old Matrix memory', async () => {
        const projectId = 'matrix_selection_reprojection';
        let selected = ['newer'];
        const selection = { selected: () => selected, clear: vi.fn(() => { selected = []; }), select: vi.fn(id => { selected = [id]; return id; }) };
        vi.stubGlobal('window', { __currentProject: { id: projectId }, __eveWorkspaceMode: { mode: 'project', projectId },
            dispatchEvent: vi.fn(), CustomEvent: class {}, SelectionAPI: selection });
        resetProjectViewNavigation(projectId);
        rememberProjectViewLevel({ selectedIds: ['older'], scrollOffsetY: 12 });
        const content = createProjectViewMatrixContent({ requestRefresh: vi.fn() });
        const records = ['older', 'newer'].map(id => ({ id, type: 'text', project_id: projectId,
            parent_id: projectId, properties: { text: id, name: id } }));
        expect((await content.load({ projectId, sourceRecords: records, preserveSelection: true })).ok).toBe(true);
        expect(content.readState().selectedIds).toEqual(['newer']);
        expect(selection.clear).not.toHaveBeenCalled();
        expect(selection.select).not.toHaveBeenCalled();
        expect(content.readState().scrollOffsetY).toBe(12);
        expect(readProjectViewLevelView().selectedIds).toEqual(['newer']);
        content.reset();
    });

    it('keyboard Home/End materializes the destination beyond the native virtual window without mutating records', async () => {
        const projectId = 'matrix_keyboard_window';
        const records = Array.from({ length: 48 }, (_, index) => ({ id: 'entry_' + index, type: 'text',
            project_id: projectId, parent_id: projectId, properties: { name: 'Entry ' + index, text: 'Entry ' + index } }));
        const original = structuredClone(records), emit = vi.fn();
        const walk = node => [node, ...(node.children || []).flatMap(walk)];
        let rendered = [], content;
        const focusTreeNode = vi.fn(({ nodeId }) => rendered.some(node => node.id === nodeId));
        const requestRefresh = vi.fn(async () => {
            rendered = content.build({ width: 390, height: 240, emit }).flatMap(walk);
        });
        vi.stubGlobal('window', { __currentProject: { id: projectId }, __eveWorkspaceMode: { mode: 'project', projectId },
            dispatchEvent: vi.fn(), CustomEvent: class {}, SelectionAPI: { selected: () => [] }, eveBevyUiRuntime: { focusTreeNode } });
        resetProjectViewNavigation(projectId);
        content = createProjectViewMatrixContent({ requestRefresh });
        await content.load({ projectId, sourceRecords: records, preserveSelection: true }); await requestRefresh();
        expect(rendered.some(node => node.id === 'project_view_matrix_tile_47')).toBe(false);
        rendered.find(node => node.id === 'project_view_matrix_tile_0').on.key_down({ key: 'End' });
        await content.handleEvent(emit.mock.calls.at(-1)[0]);
        expect(rendered.some(node => node.id === 'project_view_matrix_tile_47')).toBe(true);
        expect(focusTreeNode.mock.calls.at(-1)[0].nodeId).toBe('project_view_matrix_tile_47');
        rendered.find(node => node.id === 'project_view_matrix_tile_47').on.key_down({ key: 'Home' });
        await content.handleEvent(emit.mock.calls.at(-1)[0]);
        expect(rendered.some(node => node.id === 'project_view_matrix_tile_0')).toBe(true);
        expect(focusTreeNode.mock.calls.at(-1)[0].nodeId).toBe('project_view_matrix_tile_0');
        expect(records).toEqual(original); content.reset();
    });

    it('does not transfer pending keyboard focus into a newly selected project', async () => {
        const projectId = 'pending_matrix_focus', focusTreeNode = vi.fn(() => false);
        vi.stubGlobal('window', { __currentProject: { id: projectId }, dispatchEvent: vi.fn(), CustomEvent: class {},
            SelectionAPI: { selected: () => [] }, eveBevyUiRuntime: { focusTreeNode } });
        resetProjectViewNavigation(projectId);
        let release;
        const content = createProjectViewMatrixContent({ requestRefresh: () => new Promise(resolve => { release = resolve; }) });
        await content.load({ projectId, preserveSelection: true, sourceRecords: [{ id: 'entry', type: 'text',
            parent_id: projectId, project_id: projectId, properties: { name: 'Entry' } }] });
        const pending = content.handleEvent({ type: 'project_view.matrix.focus', index: 0, columns: 3, stride: 128, event: { key: 'End' } });
        resetProjectViewNavigation('another_project'); release();
        expect(await pending).toMatchObject({ ok: false, error: 'project_view_matrix_focus_context_changed' });
        expect(focusTreeNode).toHaveBeenCalledTimes(1); content.reset();
    });
});

describe('Matrix temporary native slider expansion', () => {
    const walk = node => [node, ...(node.children || []).flatMap(walk)];
    const fixture = async (columns = 3, width = 390, lengthPx = null) => {
        const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { pretendToBeVisual: true });
        vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document);
        const records = [{ id: 'matrix', properties: { matrix_template: 'contract', width: columns * 60 + (columns - 1) * 8,
            height: 128, matrix_grid: { columns, rows: 2, gap: 8, headers: false } } },
        ...Array.from({ length: columns * 2 }, (_, index) => ({ id: 'cell' + index, parent_id: 'matrix', properties: {
            matrix_cell: { row: Math.floor(index / columns), column: index % columns, role: 'cell' },
            template_control: index === columns - 1
                ? { kind: 'slider', compact: true, label_key: 'eve.program.time', icon: 'calendar', value_key: 'minutes',
                    min: 0, max: 100, step: 5, unit: 'min', sliderOptions: { lengthPx } }
                : { kind: 'button', label_key: 'eve.first_launch.calendar', icon: 'calendar', operation: 'test' }
        } }))];
        const original = structuredClone(records), values = { minutes: 10 }, commits = [];
        let tree;
        const runtime = createMatrixTemplateRuntime({ records, treeId: 'compact_matrix',
            readBounds: () => ({ x: 0, y: 0, width, height: 650 }), readValues: () => values,
            writeDraft: (key, value) => { values[key] = value; }, commitValue: async (key, value) => { commits.push([key, value]); return { ok: true }; },
            activate: async () => ({ ok: true }), uiRuntime: { mountTree: async input => { tree = input.tree; },
                unmountTree: async () => {}, updateTreeMotion: async () => ({ ok: true }) } });
        await runtime.open();
        return { records, original, values, commits, runtime, slider: () => walk(tree.root).find(node => node.id === 'cell' + (columns - 1)),
            nodes: () => walk(tree.root),
            slots: () => walk(tree.root).filter(node => /^cell\d+_slot$/.test(node.id)).map(node => ({ id: node.id,
                x: node.style.position[0], y: node.style.position[1], width: node.style.size[0], height: node.style.size[1] })),
            close: async () => { await runtime.destroy(); dom.window.close(); vi.unstubAllGlobals(); } };
    };
    const expectNoOverlap = slots => {
        for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
            const a = slots[i], b = slots[j];
            expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
        }
    };
    it.each([[3, 1024, null, 196], [3, 390, null, 196], [3, 390, 120, 128], [2, 320, null, 128]])(
        'opens at the right edge and restores neighbours without rewriting cells (%i columns, %i viewport)', async (columns, width, lengthPx, expectedWidth) => {
            const f = await fixture(columns, width, lengthPx);
            try {
                const before = f.slots(); expect(f.slider().style.size).toEqual([60, 60]);
                f.slider().on.press({ x: 30, y: 30 }); await f.runtime.render();
                expect(f.slider().style.size).toEqual([expectedWidth, 60]); expectNoOverlap(f.slots());
                expect(f.slots().some(slot => slot.y > 128)).toBe(true); expect(f.records).toEqual(f.original);
                f.slider().on.release(); await f.runtime.render(); expect(f.runtime.state.sliders.minutes.pinned).toBe(true);
                f.slider().on.press({ x: 10, y: 30 }); f.slider().on.release(); await f.runtime.render();
                expect(f.slider().style.size).toEqual([60, 60]); expect(f.slots()).toEqual(before); expect(f.commits).toEqual([]);
            } finally { await f.close(); }
        });
    it('cancels a transient edit, commits the quantized final drag once, and closes on focus departure', async () => {
        const f = await fixture();
        try {
            const before = f.slots();
            f.slider().on.press({}); f.slider().on.drag({ delta_x: 98 }); await f.runtime.render();
            expect(f.values.minutes).toBe(60); expect(f.commits).toEqual([]);
            f.slider().on.cancel(); await f.runtime.render();
            expect(f.values.minutes).toBe(10); expect(f.slots()).toEqual(before); expect(f.commits).toEqual([]);
            f.slider().on.press({}); f.slider().on.release(); await f.runtime.render();
            f.slider().on.press({ x: 100 }); f.slider().on.drag({ delta_x: 98 }); f.slider().on.release(); await f.runtime.render();
            expect(f.commits).toEqual([['minutes', 60]]); expect(f.runtime.state.sliders.minutes.pinned).toBe(true);
            f.slider().on.blur(); await f.runtime.render(); expect(f.slots()).toEqual(before); expect(f.values.minutes).toBe(60);
        } finally { await f.close(); }
    });
    it('disposal cancels an unfinished gesture without committing or changing canonical layout', async () => {
        const f = await fixture();
        try {
            f.slider().on.press({}); f.slider().on.drag({ delta_x: 98 }); await f.runtime.render();
            await f.runtime.destroy(); expect(f.values.minutes).toBe(10); expect(f.commits).toEqual([]);
            expect(f.records).toEqual(f.original); expect(f.runtime.state.sliders).toEqual({});
        } finally { await f.close(); }
    });
    it('grows a nested Matrix group and displaces its sibling until the control closes', async () => {
        const f = await fixture();
        try {
            Object.assign(f.records[0].properties, { height: 264, matrix_grid: { columns: 3, rows: 4, gap: 8, headers: false } });
            for (const record of f.records.slice(1)) record.parent_id = 'nested';
            f.records.push({ id: 'nested', parent_id: 'matrix', properties: {
                matrix_grid: { columns: 3, rows: 2, gap: 8, headers: false },
                matrix_cell: { row: 0, column: 0, row_span: 2, column_span: 3, role: 'cell' }, template_control: { kind: 'group' }
            } }, { id: 'footer', parent_id: 'matrix', properties: { matrix_cell: { row: 2, column: 0, column_span: 3, role: 'cell' },
                template_control: { kind: 'message', label_key: 'eve.first_launch.calendar' } } });
            const canonical = structuredClone(f.records); await f.runtime.updateRecords(f.records);
            const footer = () => f.nodes().find(node => node.id === 'footer_slot');
            const before = footer().style.position[1];
            f.slider().on.press({}); f.slider().on.release(); await f.runtime.render();
            const group = f.nodes().find(node => node.id === 'nested_slot');
            expect(group.style.size[1]).toBe(196); expect(footer().style.position[1]).toBeGreaterThan(before);
            expect(footer().style.position[1]).toBeGreaterThanOrEqual(group.style.position[1] + group.style.size[1] + 8);
            f.slider().on.blur(); await f.runtime.render(); expect(footer().style.position[1]).toBe(before);
            expect(f.records).toEqual(canonical); expect(f.commits).toEqual([]);
        } finally { await f.close(); }
    });
    it('resize cancels the draft and a late pointer release cannot save or reopen it', async () => {
        const f = await fixture();
        try {
            const before = f.slots(), handlers = f.slider().on;
            handlers.press({}); handlers.drag({ delta_x: 98 }); await f.runtime.render();
            for (const listener of getRenderSurfaceState(document.getElementById('eve_surface_project')).sizeListeners) listener();
            await f.runtime.render(); handlers.release(); await f.runtime.render();
            expect(f.values.minutes).toBe(10); expect(f.commits).toEqual([]); expect(f.slots()).toEqual(before);
            expect(f.runtime.state.sliders.minutes.expanded).toBe(false);
        } finally { await f.close(); }
    });
});
