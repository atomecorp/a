import { afterEach, expect, test, vi } from 'vitest';
import { PROJECT_SCENES, sceneState } from '../../eVe/domains/rendering/project_scene_state.js';
import { normalizeWorkspaceSceneRecord } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import { buildBevyPanelTree, textNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { projectPanelStack } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_projection.js';
import { projectBevyUiTreeRecords } from '../../eVe/domains/rendering/bevy_ui_overlay_record_projection.js';
import { createMenuSurfaceRenderer } from '../../eVe/domains/rendering/menu_surface_record_runtime.js';

vi.mock('../../eVe/domains/rendering/project_scene_runtime.js', async importOriginal => ({
    ...await importOriginal(),
    updateProjectSceneOverlay: vi.fn(async ({ projectId, records }) => {
        const scene = PROJECT_SCENES.get(projectId);
        for (const record of records) scene.records.set(record.id, normalizeWorkspaceSceneRecord(record));
        return { ok: true };
    }),
    updateProjectSceneRecordStyles: vi.fn(async ({ projectId, records }) => {
        for (const patch of records) Object.assign(PROJECT_SCENES.get(projectId).records.get(patch.id).properties, patch.properties);
        return { ok: true };
    }),
    reconcileProjectSceneRecordsByPrefix: vi.fn(async ({ projectId, prefix }) => {
        const records = PROJECT_SCENES.get(projectId).records;
        for (const id of records.keys()) if (id.startsWith(prefix)) records.delete(id);
        return { ok: true };
    })
}));

const surface = { getBoundingClientRect: () => ({ width: 402, height: 874 }) };
const renderer = () => createMenuSurfaceRenderer({ recordPrefix: '__depth_menu_', buildMaterial: () => ({ mystic_count: [2, 0, 0, 0] }) });
const setup = () => {
    vi.stubGlobal('document', { getElementById: () => surface });
    sceneState.foregroundProjectId = 'depth_scene';
    PROJECT_SCENES.set('depth_scene', { records: new Map() });
    return PROJECT_SCENES.get('depth_scene').records;
};
afterEach(() => { PROJECT_SCENES.delete('depth_scene'); sceneState.foregroundProjectId = ''; vi.unstubAllGlobals(); });

const panelRecords = async (records, count) => {
    const mounted = new Map(Array.from({ length: count }, (_, index) => {
        const key = 'depth_panel_' + index;
        const tree = buildBevyPanelTree({ id: 'eve_bevy_panel_' + key, title: key,
            geometry: { x: 20, y: 0, width: 350, height: 650 }, surfaceSize: { width: 402, height: 874 },
            bodyChildren: [textNode(key + '_label', 'API key', { size: [250, 30] })] });
        return [key, { openingOrder: index, relativeTree: tree }];
    }));
    const runtime = { updateTree: async ({ tree }) => {
        for (const record of projectBevyUiTreeRecords({ tree, treeId: tree.id, workspaceLayer: 'panel' })) records.set(record.id, record);
    } };
    await projectPanelStack({ mounted, runtime });
    return Math.max(...[...records.values()].map(record => record.properties.renderLayer));
};

test('Mystic paints above the real panel stack, including after another panel opens', async () => {
    const records = setup();
    let panelTop = await panelRecords(records, 1);
    const menu = renderer();
    await menu.mount({ key: 'mystic' });
    expect(records.get(menu.recordId('mystic')).properties.renderLayer).toBeGreaterThan(panelTop);
    panelTop = await panelRecords(records, 3);
    await menu.mount({ key: 'mystic' });
    const depth = records.get(menu.recordId('mystic')).properties.renderLayer;
    expect(depth).toBeGreaterThan(panelTop);
    for (let frame = 0; frame < 4; frame++) await menu.mount({ key: 'mystic' });
    expect(records.get(menu.recordId('mystic')).properties.renderLayer).toBe(depth);
    await menu.unmount({ key: 'mystic' });
    expect(records.has(menu.recordId('mystic'))).toBe(false);
});

test('Mystic returns to its workspace band when underlying panels disappear', async () => {
    const records = setup();
    await panelRecords(records, 1);
    const menu = renderer();
    await menu.mount({ key: 'mystic' });
    for (const [id, record] of records) if (record.properties.layer === 'panel') records.delete(id);
    await menu.mount({ key: 'mystic' });
    expect(records.get(menu.recordId('mystic')).properties.renderLayer).toBe(1300);
});

test('the main-menu ground retains its existing workspace depth', async () => {
    const records = setup();
    await panelRecords(records, 1);
    const menu = renderer();
    await menu.mount({ key: 'main_menu', layer: 'mainMenu' });
    expect(records.get(menu.recordId('main_menu')).properties.renderLayer).toBe(1200);
});
