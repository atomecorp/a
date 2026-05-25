import assert from 'node:assert/strict';
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
    computeFlowerLayout,
    computeFlowerSubmenuLayout
} = await import('../../eVe/intuition/flower/menu_layout.js');
const {
    normalizeItem,
    withForcedAlpha
} = await import('../../eVe/intuition/flower/menu_items.js');

const project = document.createElement('div');
project.id = 'project_view_alpha';
const group = document.createElement('div');
group.dataset.atomeId = 'group_alpha';
group.dataset.atomeKind = 'group';
const child = document.createElement('div');
child.dataset.atomeId = 'child_alpha';
child.dataset.atomeKind = 'shape';
group.appendChild(child);
project.appendChild(group);
document.body.appendChild(project);

document.elementsFromPoint = () => [group, child, project];

const context = resolveContextFromTarget(group, {
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
