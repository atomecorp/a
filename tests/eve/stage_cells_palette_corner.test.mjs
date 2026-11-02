import { test, expect } from 'vitest';
import { dashboardStagePlateNode } from '../../eVe/domains/dashboard/dashboard_stage_cells.js';

// A stage-cells plate that opens a level of several contents (Sport's groups and movements, Mes courses' aisles)
// wears the palette's folded corner at its top right, as the Mystic grid's palette plates do (lost when R-104 moved
// those levels to the stage cells); its label keeps clear of the fold; a plain plate and a list row have none.
const walk = (node, out = []) => { if (node) { out.push(node); (node.children || []).forEach(child => walk(child, out)); } return out; };
const corner = node => walk(node).find(child => /_corner$/.test(child.id));
const box = { x: 0, y: 0, width: 120, height: 120 };
const laid = plate => dashboardStagePlateNode({ key: 'k', label: 'Pectoraux', icon: 'training_push_up', onActivate() {}, ...plate }, box,
    { treeId: 't', rubric: 'activity' });

test('a level plate wears the folded corner, over its card', () => {
    const fold = corner(laid({ palette: true }));
    expect(fold?.kind).toBe('image');
    expect(fold.style.size).toEqual([120, 120]);
    expect(fold.style.z_index > 0).toBe(true);
});

test('a plain plate and a list row wear none', () => {
    expect(corner(laid({}))).toBe(undefined);
    expect(corner(laid({ palette: true, row: { detail: '' } }))).toBe(undefined);
});
