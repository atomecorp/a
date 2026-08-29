import { test, expect } from 'vitest';
import { resolveMoleculeGeometry } from '../../eVe/intuition/tools/core/tool_runtime_molecule_geometry.js';
import { normalizeRenderAtom } from '../../eVe/domains/rendering/render_atom.js';
import { createRenderScene, hitTestRenderScene } from '../../eVe/domains/rendering/scene_graph.js';
import { createVirtualSceneTree } from '../../eVe/domains/rendering/virtual_scene_contract.js';
import { mapVirtualSceneTreeToBevyPayload } from '../../eVe/domains/rendering/bevy_projection_adapter.js';
import { resolveComposedInteractionTarget } from '../../eVe/domains/rendering/surface_interaction_runtime.js';

const members = [
    { id: 'a', type: 'shape', parent_id: 'm', properties: { left: '120px', top: '110px', width: '100px', height: '80px' } },
    { id: 'b', type: 'shape', parent_id: 'm', properties: { left: 320, top: 110, width: 100, height: 80 } }
];
const owner = { id: 'm', type: 'group', properties: { left: 120, top: 110, width: 300, height: 80 } };

test('Molecule union accepts the persisted pixel dimensions before any edit', () => {
    expect(resolveMoleculeGeometry(members)).toEqual({ left: 120, top: 110, width: 300, height: 80 });
    expect(resolveMoleculeGeometry(members.slice(0, 1))).toEqual({ left: 120, top: 110, width: 100, height: 80 });
});

test.each(['group', 'molecule'])('canonical %s stays a transparent structural shape without an edit marker', (type) => {
    const record = { ...owner, type, properties: { ...owner.properties, color: '#1234ff', media_url: '/old.png', text: 'old preview' } };
    const atom = normalizeRenderAtom(record);
    expect(atom.type).toBe('shape');
    expect(atom.style.fill).toEqual([0, 0, 0, 0]);
    expect(atom.visual.opacity).toBe(1);
    const payload = mapVirtualSceneTreeToBevyPayload(createVirtualSceneTree([record, ...members], { selectedIds: ['m'] }));
    expect(payload.find((node) => node.id === 'm')).toMatchObject({ kind: 'shape', color: [0, 0, 0, 0], selected: true, logical_size: [300, 80] });
    expect(payload.find((node) => node.id === 'a').opacity).toBe(1);
});

test('empty envelope passes through; touching a member resolves to its closed owner', () => {
    const scene = createRenderScene([...members, owner].map((record) => normalizeRenderAtom(record)));
    expect(hitTestRenderScene(scene, { x: 270, y: 150 })).toBeNull();
    expect(hitTestRenderScene(scene, { x: 120, y: 150 })).toMatchObject({ id: 'a' });
    const hit = hitTestRenderScene(scene, { x: 170, y: 150 });
    expect(resolveComposedInteractionTarget(scene, hit).id).toBe('m');
    expect(resolveComposedInteractionTarget(scene, hit, 'm').id).toBe('a');
});

test('old and nested structural bounds are derived without changing persisted records', async () => {
    const { recordsWithMoleculeGeometry } = await import('../../eVe/domains/rendering/project_scene_record_projection.js');
    const records = [{ ...owner, parent_id: 'outer', properties: { width: 1, height: 1 } }, ...members,
        { id: 'outer', type: 'group', properties: {} }];
    const before = JSON.stringify(records);
    const projected = recordsWithMoleculeGeometry(records);
    expect(projected.find((r) => r.id === 'm').properties).toEqual(owner.properties);
    expect(projected.find((r) => r.id === 'outer').properties).toEqual(owner.properties);
    expect(JSON.stringify(records)).toBe(before);
    const scene = createRenderScene(projected.map((r) => normalizeRenderAtom(r)));
    const member = hitTestRenderScene(scene, { x: 170, y: 150 });
    expect(resolveComposedInteractionTarget(scene, member).id).toBe('outer');
    expect(resolveComposedInteractionTarget(scene, member, 'outer').id).toBe('m');
});

test('selected Molecule resize handles remain available while its empty body cannot drag', () => {
    const scene = createRenderScene([owner, ...members].map((r) => normalizeRenderAtom(r, { selectedIds: ['m'] })));
    scene.byId.get('m').visual.selected = true;
    const options = { includeSelectedResizeHandles: true };
    expect(hitTestRenderScene(scene, { x: 270, y: 150 }, options)).toBeNull();
    expect(hitTestRenderScene(scene, { x: 270, y: 190 }, options)?.id).toBe('m');
    expect(hitTestRenderScene(scene, { x: 270, y: 190 })).toBeNull();
});
