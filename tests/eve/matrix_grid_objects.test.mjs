import { describe, expect, it, vi } from 'vitest';
import { matrixGridCells, normalizeMatrixGrid } from '../../eVe/domains/matrix/matrix_grid_model.js';
import { placeMatrixGrid } from '../../eVe/domains/matrix/matrix_grid_runtime.js';
import { buildPropertiesFromSpec } from '../../eVe/intuition/runtime/tool_genesis_properties_runtime.js';

describe('Matrix of editable Atomes', () => {
    it('creates header and cell object hierarchies through the standard creator', async () => {
        const created = [];
        const create = vi.fn(async (spec) => {
            const id = `object_${created.length}`;
            created.push({ id, parent: spec.parentId, props: buildPropertiesFromSpec(spec, 'project'), kind: spec.kind });
            return { ok: true, id };
        });
        const result = await placeMatrixGrid({ project_id: 'project', rows: 2, columns: 2, headers: true,
            cell: { kind: 'text', type: 'text', text: 'Editable', color: '#123456' } }, { create, commit: async () => ({ ok: true }) });
        expect(result.ok).toBe(true);
        expect(created).toHaveLength(13);
        const root = created[0];
        expect(root.props.matrix_grid).toEqual({ rows: 2, columns: 2, gap: 8, headers: true });
        const wrappers = created.filter(item => item.props.matrix_cell);
        expect(wrappers).toHaveLength(6);
        expect(wrappers.every(item => item.parent === root.id)).toBe(true);
        expect(wrappers.filter(item => item.props.matrix_cell.role === 'header')).toHaveLength(2);
        const text = created.filter(item => item.kind === 'text');
        expect(text).toHaveLength(4);
        expect(text.every(item => item.props.text === 'Editable' && item.props.color === '#123456')).toBe(true);
        expect(text.every(item => wrappers.some(parent => parent.id === item.parent))).toBe(true);
    });
    it('rejects invalid and oversized layouts before creating anything', async () => {
        const create = vi.fn();
        for (const input of [{ rows: 0 }, { rows: 1.5 }, { rows: 20, columns: 20 }, { rows: 128, columns: 2, headers: true }, { gap: -1 }, { width: 1, columns: 10 }]) {
            expect((await placeMatrixGrid({ project_id: 'p', ...input }, { create })).ok).toBe(false);
        }
        expect(create).not.toHaveBeenCalled();
    });
    it('honours geometry, spacing and deterministic ordering', () => {
        const cells = matrixGridCells(normalizeMatrixGrid({ rows: 2, columns: 2, gap: 10 }), { width: 210, height: 110 });
        expect(cells.map(({ left, top, width, height }) => [left, top, width, height])).toEqual([
            [0, 0, 100, 50], [110, 0, 100, 50], [0, 60, 100, 50], [110, 60, 100, 50]
        ]);
    });
    it('returns the committed prefix on creation failure instead of claiming success', async () => {
        let count = 0;
        const create = async () => ++count === 3 ? { ok: false, error: 'write_denied' } : { ok: true, id: `a${count}` };
        const result = await placeMatrixGrid({ project_id: 'p' }, { create, commit: async () => ({ ok: true }) });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('write_denied');
        expect(result.ids).toEqual(['a1', 'a2']);
    });
});
