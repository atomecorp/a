import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { placeMatrixGrid, configureMatrixGrid } from '../../eVe/domains/matrix/matrix_grid_runtime.js';
import { recordsWithMoleculeGeometry } from '../../eVe/domains/rendering/project_scene_record_projection.js';
import { buildPropertiesFromSpec } from '../../eVe/intuition/runtime/tool_genesis_properties_runtime.js';
import { normalizeCreatedAtomeSize } from '../../eVe/intuition/runtime/tool_genesis_spec_runtime.js';

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
