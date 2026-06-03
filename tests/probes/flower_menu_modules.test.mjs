import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLImageElement = window.HTMLImageElement;

const {
    clearAllFlowerPointerLocks,
    scheduleFlowerPointerUnlock,
    setFlowerPointerLock
} = await import('../../eVe/intuition/flower/context_pointer_lock.js');
const {
    isBlockedTarget,
    resolveContextFromTarget
} = await import('../../eVe/intuition/flower/context_target.js');
const {
    resolveFlowerSelectionMode
} = await import('../../eVe/intuition/flower/context_selection.js');
const {
    computeFlowerLayout,
    computeFlowerSubmenuLayout
} = await import('../../eVe/intuition/flower/menu_layout.js');
const {
    normalizeItem,
    withForcedAlpha
} = await import('../../eVe/intuition/flower/menu_items.js');
const { registerAtomeElement } = await import('../../eVe/core/atome_dom_id.js');
const {
    clearAllProjectScenes,
    renderProjectScene
} = await import('../../eVe/domains/rendering/project_scene_runtime.js');

const project = document.createElement('div');
project.id = 'project_view_alpha';
const group = document.createElement('div');
registerAtomeElement(group, {
    atome_id: 'group_alpha',
    kind: 'group'
});
const child = document.createElement('div');
registerAtomeElement(child, {
    atome_id: 'child_alpha',
    kind: 'shape'
});
group.appendChild(child);
project.appendChild(group);
document.body.appendChild(project);

document.elementsFromPoint = () => [group, child, project];

const context = await resolveContextFromTarget(group, {
    clientX: 42,
    clientY: 24,
    source: 'test'
});

assert.equal(context.type, 'atome');
assert.equal(context.atomeId, 'child_alpha');
assert.equal(context.kind, 'shape');
assert.equal(context.projectId, 'alpha');
assert.equal(context.x, 42);
assert.equal(context.y, 24);
assert.equal(context.source, 'test');

const setBox = (element, width, height) => {
    Object.defineProperty(element, 'clientWidth', {
        configurable: true,
        value: width
    });
    Object.defineProperty(element, 'clientHeight', {
        configurable: true,
        value: height
    });
    element.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height
    });
};

clearAllProjectScenes();
const projectSceneHost = document.createElement('div');
projectSceneHost.id = 'project_view_flower_canvas';
setBox(projectSceneHost, 300, 220);
document.body.appendChild(projectSceneHost);
await renderProjectScene({
    projectId: 'flower_canvas',
    host: projectSceneHost,
    compositor: {
        default: async () => {},
        run_atome_bevy_renderer: () => {}
    },
    records: [{
        id: 'canvas_shape_atom',
        type: 'shape',
        properties: {
            left: 20,
            top: 30,
            width: 80,
            height: 60
        }
    }]
});
const projectCanvas = document.getElementById('eve_surface_project');
document.elementsFromPoint = () => [projectCanvas, projectSceneHost];
const canvasContext = await resolveContextFromTarget(projectCanvas, {
    clientX: 30,
    clientY: 40,
    source: 'test'
});
assert.equal(canvasContext.type, 'atome');
assert.equal(canvasContext.atomeId, 'canvas_shape_atom');
assert.equal(canvasContext.kind, 'shape');
assert.equal(canvasContext.projectId, 'flower_canvas');

const mixedSelectionMode = resolveFlowerSelectionMode({
    context: {
        atomeId: 'shape_a',
        kind: 'shape'
    },
    selectedIds: ['shape_a', 'video_b'],
    kindForId: (id) => (id === 'shape_a' ? 'shape' : 'video')
});
assert.equal(mixedSelectionMode.useSelection, true);
assert.equal(mixedSelectionMode.mixedKinds, true);

const pointerOutsideSelectionMode = resolveFlowerSelectionMode({
    context: {
        atomeId: 'text_c',
        kind: 'text'
    },
    selectedIds: ['shape_a', 'video_b'],
    kindForId: (id) => (id === 'text_c' ? 'text' : 'shape')
});
assert.equal(pointerOutsideSelectionMode.useSelection, false);
assert.equal(pointerOutsideSelectionMode.mixedKinds, false);
assert.equal(pointerOutsideSelectionMode.kind, 'text');

const staleProjectSelectionMode = resolveFlowerSelectionMode({
    context: {
        type: 'project',
        projectId: 'flower_canvas'
    },
    selectedIds: ['missing_selection_atom'],
    kindForId: () => ''
});
assert.deepEqual(staleProjectSelectionMode.activeIds, []);
assert.equal(staleProjectSelectionMode.useSelection, false);
assert.equal(staleProjectSelectionMode.mixedKinds, false);
assert.equal(staleProjectSelectionMode.kind, '');

const panel = document.createElement('div');
panel.dataset.evePanel = 'true';
document.body.appendChild(panel);
assert.equal(isBlockedTarget(panel), true);
assert.equal(isBlockedTarget(child), false);

assert.equal(setFlowerPointerLock(7, { phase: 'test' }), true);
assert.equal(window.__EVE_FLOWER_POINTER_LOCK__['7'].phase, 'test');
assert.equal(scheduleFlowerPointerUnlock(7, 0), true);
await delay(1);
assert.equal(window.__EVE_FLOWER_POINTER_LOCK__['7'], undefined);
clearAllFlowerPointerLocks();

const item = normalizeItem({
    key: 'import',
    type: 'palette',
    icon: 'folder',
    children: ['media']
});
assert.equal(item.type, 'palette');
assert.equal(item.icon.endsWith('/folder.svg'), true);
assert.equal(item.children[0].key, 'media');
assert.equal(withForcedAlpha('rgb(10, 20, 30)', 0.5), 'rgba(10, 20, 30, 0.5)');

const layout = computeFlowerLayout({ count: 3, radius: 100 });
assert.equal(layout.positions.length, 3);
assert.deepEqual(
    layout.positions.map((position) => Number.isFinite(position.tx) && Number.isFinite(position.ty)),
    [true, true, true]
);

const submenu = computeFlowerSubmenuLayout({ childCount: 4, radius: 80 });
assert.equal(submenu.childPositions.length, 4);
assert.equal(Number.isFinite(submenu.backPosition.tx), true);

const intuitionSource = await readFile(new URL('../../eVe/intuition/eVeIntuition.js', import.meta.url), 'utf8');
assert.ok(
    intuitionSource.includes("type === 'project' && !hasAtomeTarget")
        && intuitionSource.includes('selectedIds: contextSelectionIds'),
    'project-only flower context must not inherit stale Atome selection ids'
);
