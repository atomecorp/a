import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import { afterAll, test } from 'vitest';
import {
    MYSTIC_AUTO_OPEN_DWELL_MS,
    MYSTIC_AUTO_OPEN_DWELL_TOLERANCE_PX,
    MYSTIC_POST_REPLACEMENT_MOVE_PX,
    createBevyUiMysticRuntime
} from '../../eVe/intuition/ribbon/bevy_ui_mystic_runtime.js';

const wait = (ms) => delay(ms);
const CENTER = { x: 320, y: 240 };

// The runtime lane: the real Bevy Mystic lifecycle, a stub surface and a stub
// Bevy runtime whose hit test is what each step points at.
const makeHarness = () => {
    let frameTime = 0;
    const surface = {
        clientWidth: 640,
        clientHeight: 480,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 })
    };
    const mounted = new Map();
    const harness = {
        surface,
        mounted,
        hit: null,
        setHit(nodeId) { harness.hit = nodeId ? { treeId: 'eve_bevy_ui_mystic', nodeId } : null; },
        runtime: {
            mountTree: async ({ id, tree }) => { mounted.set(id, tree); return tree; },
            updateTree: async ({ id, tree }) => { mounted.set(id, tree); return tree; },
            unmountTree: async (id) => { mounted.delete(id); },
            hitTestAtClientPoint: () => harness.hit
        },
        animation: {
            assistantOpener: async () => true,
            requestFrame: (callback) => setTimeout(() => callback(frameTime += 300), 0),
            cancelFrame: (id) => clearTimeout(id)
        }
    };
    return harness;
};

const openMenu = async (harness, items, { holding = true } = {}) => {
    const mystic = createBevyUiMysticRuntime({
        surfaceResolver: () => harness.surface,
        runtimeResolver: () => harness.runtime,
        ...harness.animation
    });
    await mystic.openAt({ ...CENTER, items, holding });
    return mystic;
};

const settledPhase = async (mystic, wanted, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const { phase } = mystic.measure();
        if (phase === wanted) return true;
        await wait(1);
    }
    return false;
};

const tileNodeId = (harness, key) => {
    const node = harness.mounted.get('eve_bevy_ui_mystic')?.root?.children
        ?.find((candidate) => candidate.id.includes(`_${key}_`));
    return node?.id || null;
};

const closeMenu = async (mystic) => { await mystic.close(); };

const waitForOpen = async (predicate, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) return true;
        await wait(2);
    }
    return false;
};

test('an automatic destination opens on the stationary dwell, never on a hover', { timeout: 20000 }, async () => {
    const harness = makeHarness();
    let calls = 0;
    const mystic = await openMenu(harness, [{ key: 'find', hoverActivate: true, onSelect: () => { calls += 1; } }]);
    assert.equal(await settledPhase(mystic, 'open'), true);
    harness.setHit(tileNodeId(harness, 'find'));
    mystic.updateHover({ clientX: 384, clientY: 240, allowActivation: true });
    await wait(200);
    assert.equal(calls, 0, 'a held hover must not open a persistent tool any more');
    await wait(MYSTIC_AUTO_OPEN_DWELL_MS - 200 + 200);
    assert.equal(calls, 1, 'the stationary dwell opens the persistent tool exactly once');
    await closeMenu(mystic);
});

test('a crossing, a leaving hover or a moving hover never opens a destination', { timeout: 20000 }, async () => {
    const harness = makeHarness();
    let calls = 0;
    const mystic = await openMenu(harness, [{ key: 'find', hoverActivate: true, onSelect: () => { calls += 1; } }]);
    assert.equal(await settledPhase(mystic, 'open'), true);
    // Crossing the tile on the way to a tool placed after it: nothing opens.
    harness.setHit(tileNodeId(harness, 'find'));
    mystic.updateHover({ clientX: 384, clientY: 240, allowActivation: true });
    await wait(300);
    harness.setHit(null);
    mystic.updateHover({ clientX: 60, clientY: 440, allowActivation: true });
    await wait(MYSTIC_AUTO_OPEN_DWELL_MS);
    assert.equal(calls, 0, 'leaving the tile before the dwell cancels the automatic open');
    // A slow slide inside the same tile re-arms the dwell from the new point.
    harness.setHit(tileNodeId(harness, 'find'));
    mystic.updateHover({ clientX: 384, clientY: 240, allowActivation: true });
    await wait(MYSTIC_AUTO_OPEN_DWELL_MS - 300);
    mystic.updateHover({ clientX: 384 + MYSTIC_AUTO_OPEN_DWELL_TOLERANCE_PX * 4, clientY: 240, allowActivation: true });
    await wait(400);
    assert.equal(calls, 0, 'a move inside the tile restarts the dwell instead of opening');
    await wait(MYSTIC_AUTO_OPEN_DWELL_MS);
    assert.equal(calls, 1, 'the dwell still opens once the hover really stops');
    await closeMenu(mystic);
});

test('a release fires the tool or the palette under the finger, never the centre', { timeout: 20000 }, async () => {
    const harness = makeHarness();
    let toolCalls = 0;
    let childCalls = 0;
    const picture = { key: 'photo', label: 'Photo', onSelect: () => { childCalls += 1; } };
    const items = [
        { key: 'leaf', label: 'Leaf', onSelect: () => { toolCalls += 1; } },
        { key: 'capture', label: 'Capture', type: 'palette', children: [picture] }
    ];
    const mystic = await openMenu(harness, items);
    assert.equal(await settledPhase(mystic, 'open'), true);
    harness.setHit(tileNodeId(harness, 'leaf'));
    assert.equal(mystic.releaseAt({ clientX: 384, clientY: 240 }), true);
    await wait(50);
    assert.equal(toolCalls, 1, 'releasing on a tool launches it exactly once');

    const second = await openMenu(harness, items);
    assert.equal(await settledPhase(second, 'open'), true);
    harness.setHit('eve_bevy_ui_mystic_center');
    assert.equal(second.releaseAt({ ...CENTER }), false);
    await wait(20);
    assert.equal(second.isOpen(), true, 'a mouse-up on the centre leaves the menu open');
    assert.equal(second.measure().stackDepth, 0);
    harness.setHit(tileNodeId(harness, 'capture'));
    assert.equal(second.releaseAt({ clientX: 384, clientY: 240 }), true);
    assert.equal(await settledPhase(second, 'opening'), true);
    assert.equal(second.measure().stackDepth, 1, 'releasing on a palette opens its submenu');
    assert.equal(childCalls, 0, 'the palette release never fires a child on its own');
    // Inside the submenu the centre is the way back, and it still never fires
    // on a mouse-up.
    harness.setHit('eve_bevy_ui_mystic_center');
    assert.equal(second.releaseAt({ ...CENTER }), false);
    await wait(50);
    assert.equal(second.measure().stackDepth, 1, 'the return must not fire on a mouse-up');
    await closeMenu(second);
});

test('a release right after a replacement waits for a fresh movement', { timeout: 20000 }, async () => {
    const harness = makeHarness();
    let childCalls = 0;
    const picture = { key: 'photo', label: 'Photo', onSelect: () => { childCalls += 1; } };
    const items = [{ key: 'capture', label: 'Capture', type: 'palette', children: [picture] }];
    const mystic = await openMenu(harness, items);
    assert.equal(await settledPhase(mystic, 'open'), true);
    harness.setHit(tileNodeId(harness, 'capture'));
    mystic.updateHover({ clientX: 384, clientY: 240, allowActivation: true });
    await wait(MYSTIC_AUTO_OPEN_DWELL_MS + 300);
    assert.equal(mystic.measure().stackDepth, 1, 'the dwell opened the palette');
    assert.equal(mystic.measure().replacementPending, true, 'the replacement under the finger is gated');
    harness.setHit(tileNodeId(harness, 'photo'));
    assert.equal(mystic.releaseAt({ clientX: 384, clientY: 240 }), false);
    await wait(50);
    assert.equal(childCalls, 0, 'the tile that landed under an unmoved finger is not aimed at');
    mystic.updateHover({ clientX: 384 + MYSTIC_POST_REPLACEMENT_MOVE_PX * 2, clientY: 240, allowActivation: false });
    assert.equal(mystic.measure().replacementPending, false);
    assert.equal(mystic.releaseAt({ clientX: 384 + MYSTIC_POST_REPLACEMENT_MOVE_PX * 2, clientY: 240 }), true);
    await wait(50);
    assert.equal(childCalls, 1, 'a moved finger activates the submenu entry it really points at');
    await closeMenu(mystic);
});

test('the release reads the mounted geometry during the opening and ignores the closing', { timeout: 20000 }, async () => {
    const harness = makeHarness();
    let calls = 0;
    const mystic = createBevyUiMysticRuntime({
        surfaceResolver: () => harness.surface,
        runtimeResolver: () => harness.runtime,
        ...harness.animation
    });
    await mystic.openAt({ ...CENTER, items: [{ key: 'leaf', label: 'Leaf', onSelect: () => { calls += 1; } }] });
    assert.equal(mystic.measure().phase, 'opening');
    harness.setHit(tileNodeId(harness, 'leaf'));
    assert.equal(mystic.releaseAt({ clientX: 384, clientY: 240 }), true);
    await wait(50);
    assert.equal(calls, 1, 'a release lands as soon as the new geometry is mounted');

    const closing = await openMenu(harness, [{ key: 'leaf', label: 'Leaf', onSelect: () => { calls += 1; } }]);
    assert.equal(await settledPhase(closing, 'open'), true);
    void closing.close();
    assert.equal(closing.measure().phase, 'closing');
    harness.setHit(tileNodeId(harness, 'leaf'));
    assert.equal(closing.releaseAt({ clientX: 384, clientY: 240 }), false);
    await wait(50);
    assert.equal(calls, 1, 'a dismissal consumes the release');
    await closing.close();
});

test('a root fling names the persistent tool of its cardinal direction', { timeout: 20000 }, async () => {
    const harness = makeHarness();
    const fired = [];
    const items = ['north', 'east', 'south', 'west'].map((slot, index) => ({
        key: `persistent_${slot}`,
        slot,
        onSelect: () => { fired.push(slot); }
    }));
    for (const slot of ['north', 'east', 'south', 'west']) {
        const mystic = await openMenu(harness, items.map((item) => ({ ...item })));
        assert.equal(await settledPhase(mystic, 'open'), true);
        assert.equal(mystic.activateDirectional({ direction: slot }), true);
        await wait(50);
        assert.deepEqual(fired, [slot], `${slot} fling launches its own persistent tool`);
        fired.length = 0;
        await closeMenu(mystic);
    }
    const mystic = await openMenu(harness, items.map((item) => ({ ...item })));
    assert.equal(await settledPhase(mystic, 'open'), true);
    assert.equal(mystic.activateDirectional({ direction: 'sideways' }), false);
    assert.equal(mystic.activateDirectional({ direction: '' }), false);
    await closeMenu(mystic);

    // A submenu has no direction to give: the root is the only place a fling
    // names a persistent tool.
    const submenu = await openMenu(harness, [
        { key: 'persistent_north', slot: 'north', onSelect: () => { fired.push('north'); } },
        { key: 'capture', label: 'Capture', slot: 'east', type: 'palette', children: [{ key: 'photo', label: 'Photo' }] }
    ]);
    assert.equal(await settledPhase(submenu, 'open'), true);
    harness.setHit(tileNodeId(harness, 'capture'));
    submenu.updateHover({ clientX: 384, clientY: 240, allowActivation: true });
    await wait(MYSTIC_AUTO_OPEN_DWELL_MS + 300);
    assert.equal(submenu.measure().stackDepth, 1, 'the dwell opened the palette page');
    assert.equal(submenu.activateDirectional({ direction: 'north' }), false, 'a submenu has no direction to give');
    assert.deepEqual(fired, [], 'no persistent tool may fire from inside a submenu');
    await closeMenu(submenu);
});

// The gesture lane: the real Mystic context runtime on a real DOM, a stub
// Mystic runtime that records what the gesture owner asks of it.
const dom = new JSDOM('<!doctype html><div id="project_view_alpha"><canvas id="eve_surface_project"></canvas></div>');
const { window } = dom;
Object.assign(globalThis, {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLImageElement: window.HTMLImageElement
});
const projectCanvas = window.document.getElementById('eve_surface_project');
window.document.elementsFromPoint = () => [projectCanvas];
window.Atome = { getStateCurrent: async (id) => ({ id, properties: {}, capabilities: { write: true, create: true, delete: true } }) };

const { installIntuitionXMysticContextRuntime, openMysticContextMenu } = await import('../../eVe/intuition/mystic/context.js');
const { getMysticPointerLock, isMysticPointerInteractionActive } = await import('../../eVe/intuition/mystic/context_pointer_lock.js');
const { setMysticRuntime } = await import('../../eVe/intuition/ribbon/bevy_ui_product_registry.js');

const gesture = { open: false, holding: false, hoverOptions: [], releases: [], directions: [] };
setMysticRuntime({
    isOpen: () => gesture.open,
    close: async () => { gesture.open = false; },
    openAt: (options) => { gesture.open = true; gesture.holding = options.holding; },
    updateHover: (options) => { gesture.hoverOptions.push(options); return null; },
    releaseAt: (options) => { gesture.releases.push(options); return false; },
    resolveButtonFromPoint: () => null,
    activateDirectional: ({ direction }) => { gesture.directions.push(direction); return gesture.acceptDirection; }
});
gesture.acceptDirection = true;
const disposeGestureRuntime = installIntuitionXMysticContextRuntime({ longPressMs: 5 });

const pointerEvent = (type, properties = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.entries({
        button: 0, pointerId: 61, pointerType: 'mouse', isPrimary: true,
        clientX: 300, clientY: 300, ...properties
    }).forEach(([key, value]) => Object.defineProperty(event, key, { configurable: true, value }));
    return event;
};

const holdFrom = async (properties = {}) => {
    gesture.open = false;
    gesture.holding = false;
    gesture.hoverOptions.length = 0;
    gesture.releases.length = 0;
    gesture.directions.length = 0;
    projectCanvas.dispatchEvent(pointerEvent('pointerdown', properties));
    assert.equal(await waitForOpen(() => gesture.open === true), true, 'the hold must open the menu');
    assert.equal(gesture.holding, true);
};

// Le media du volet visuel est un noeud BevyUI : l'appui long ouvre le Flower
// sans qu'aucune session canvas n'existe. C'est l'appui retenu, seule identite
// disponible, qui doit retenir le clic pour le menu.
const blockedControl = window.document.createElement('div');
blockedControl.setAttribute('data-eve-panel', 'true');
window.document.getElementById('project_view_alpha').appendChild(blockedControl);

const appendCaptureProbe = (type) => {
    const reached = { value: false };
    const listener = () => { reached.value = true; };
    window.document.addEventListener(type, listener, true);
    return { reached, remove: () => window.document.removeEventListener(type, listener, true) };
};

test('a released pointer still owns the stationary dwell', { timeout: 20000 }, async () => {
    gesture.open = true;
    gesture.hoverOptions.length = 0;
    gesture.releases.length = 0;
    projectCanvas.dispatchEvent(pointerEvent('pointermove', { clientX: 340, clientY: 300 }));
    const hovered = gesture.hoverOptions.at(-1);
    assert.equal(hovered?.allowActivation, false, 'a released pointer never activates on hover');
    assert.equal(hovered?.dwell, true, 'a released pointer still arms the stationary dwell');
    gesture.open = false;
});

test('a fast root fling launches its direction and owns the terminal event', { timeout: 20000 }, async () => {
    await holdFrom();
    projectCanvas.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 40 }));
    assert.deepEqual(gesture.directions, ['north'], '260 px in one move is a north fling');
    projectCanvas.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 40 }));
    const release = gesture.releases.at(-1);
    assert.equal(release?.allowActivation, false, 'the release after a fling must not launch a second tool');
});

test('the fling window opens with the held gesture, not with the press', { timeout: 20000 }, async () => {
    // Production arms the long press 460 ms after the press: measured from the
    // press instant, the 500 ms window would close 40 ms after the menu appears
    // and no flick could ever fire. The clock starts when the hold takes over.
    await holdFrom();
    await wait(600);
    projectCanvas.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 40 }));
    assert.deepEqual(gesture.directions, [], 'a flick that waits longer than the window is not a fling');
    projectCanvas.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 40 }));
    assert.equal(gesture.releases.at(-1)?.allowActivation, true, 'the ordinary release stays available');
});

test('a slow drag, a diagonal drag and a submenu fling launch nothing', { timeout: 20000 }, async () => {
    await holdFrom();
    await wait(600);
    projectCanvas.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 40 }));
    assert.deepEqual(gesture.directions, [], 'past half a second the same travel is no longer a fling');
    projectCanvas.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 40 }));
    assert.equal(gesture.releases.at(-1)?.allowActivation, true, 'a slow drag keeps the ordinary release');

    await holdFrom();
    projectCanvas.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 100 }));
    assert.deepEqual(gesture.directions, [], '45° away from both axes is not a cardinal fling');
    projectCanvas.dispatchEvent(pointerEvent('pointerup', { clientX: 500, clientY: 100 }));
    assert.equal(gesture.releases.at(-1)?.allowActivation, true);

    // Inside a submenu the runtime refuses the direction; the gesture is spent
    // but the ordinary release stays available.
    gesture.acceptDirection = false;
    await holdFrom();
    projectCanvas.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 40 }));
    assert.deepEqual(gesture.directions, ['north']);
    projectCanvas.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 40 }));
    assert.equal(gesture.releases.at(-1)?.allowActivation, true, 'a refused fling leaves the ordinary release');
    gesture.acceptDirection = true;
});

test('a Flower opened from a BevyUI node keeps the held click to itself', { timeout: 20000 }, async () => {
    gesture.open = false;
    gesture.holding = false;
    gesture.hoverOptions.length = 0;
    gesture.releases.length = 0;
    gesture.directions.length = 0;
    // Un controle produit avale l'appui : aucune session canvas ne nait, le menu
    // ne peut compter que sur l'appui retenu par le runtime de contexte.
    blockedControl.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 300 }));
    await openMysticContextMenu({
        clientX: 300, clientY: 300, source: 'project_view_visual',
        context: { type: 'atome', atomeId: 'media_atom', kind: 'video' }
    });
    assert.equal(gesture.open, true, 'the media menu opens from the BevyUI node');
    assert.equal(getMysticPointerLock(61) !== null, true, 'the held pointer is owned by the Flower');
    assert.equal(isMysticPointerInteractionActive(61), true);

    // Le doigt rejoint l'outil record : ce deplacement ne doit atteindre aucun
    // proprietaire sous le menu, et le menu doit continuer de le suivre.
    const moves = appendCaptureProbe('pointermove');
    const move = pointerEvent('pointermove', { clientX: 420, clientY: 300 });
    blockedControl.dispatchEvent(move);
    moves.remove();
    assert.equal(moves.reached.value, false, 'no owner under the menu receives the held move');
    assert.equal(move.defaultPrevented, true, 'the held move is cancelled for every owner below');
    assert.deepEqual(
        gesture.hoverOptions.at(-1),
        { clientX: 420, clientY: 300, allowActivation: false, dwell: true },
        'the menu still follows the finger, without activating on the way'
    );

    const up = pointerEvent('pointerup', { clientX: 420, clientY: 300 });
    blockedControl.dispatchEvent(up);
    await wait(10);
    assert.equal(up.defaultPrevented, true, 'the release never becomes a click under the menu');
    assert.equal(gesture.releases.length, 1, 'the release reaches the menu exactly once');
    assert.equal(gesture.releases.at(-1)?.allowActivation, true, 'a radial travel still opens the tool under the finger');
    assert.equal(getMysticPointerLock(61), null, 'the lock is handed back on the real release');
    assert.equal(isMysticPointerInteractionActive(61), false);

    // Plus rien ne detient le clic : ni un second relachement, ni le clic avale.
    blockedControl.dispatchEvent(pointerEvent('pointerup', { clientX: 420, clientY: 300 }));
    await wait(10);
    assert.equal(gesture.releases.length, 1, 'no phantom session survives the release');
    const click = new window.Event('click', { bubbles: true, cancelable: true });
    blockedControl.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true, 'the click of that press stays suppressed');
    gesture.open = false;
});

// Deux doigts sur un trackpad, c'est un clic droit : le menu contextuel natif
// ouvre le Flower sans qu'aucun bouton primaire n'ait ete presse. L'appui
// secondaire doit etre retenu exactement comme l'appui long, sinon les deux
// doigts qui continuent de bouger entrainent l'atome recouvert par le menu.
const openFlowerFromRightClick = async () => {
    gesture.open = false;
    gesture.holding = null;
    gesture.hoverOptions.length = 0;
    gesture.releases.length = 0;
    projectCanvas.dispatchEvent(pointerEvent('pointerdown', { button: 2, pointerType: 'mouse', clientX: 300, clientY: 300 }));
    const menu = pointerEvent('contextmenu', { button: 2, pointerType: 'mouse', clientX: 300, clientY: 300 });
    projectCanvas.dispatchEvent(menu);
    assert.equal(menu.defaultPrevented, true, 'a right-click never shows the native menu');
    assert.equal(await waitForOpen(() => gesture.open === true), true, 'a right-click opens the Flower');
    assert.equal(gesture.holding, false, 'a right-click opens the Flower without arming the assistant');
};

test('a Flower opened by a right-click keeps the two fingers to itself', { timeout: 20000 }, async () => {
    await openFlowerFromRightClick();
    assert.equal(getMysticPointerLock(61) !== null, true, 'the right-clicked pointer belongs to the Flower');
    assert.equal(isMysticPointerInteractionActive(61), true);

    // Les deux doigts du trackpad glissent vers l'outil : ce deplacement ne doit
    // atteindre aucun proprietaire sous le menu, et le menu doit le suivre.
    const moves = appendCaptureProbe('pointermove');
    const move = pointerEvent('pointermove', { button: -1, buttons: 2, pointerType: 'mouse', clientX: 420, clientY: 300 });
    blockedControl.dispatchEvent(move);
    moves.remove();
    assert.equal(moves.reached.value, false, 'no owner under the menu receives the held secondary move');
    assert.equal(move.defaultPrevented, true, 'the held secondary move is cancelled for every owner below');
    assert.deepEqual(
        gesture.hoverOptions.at(-1),
        { clientX: 420, clientY: 300, allowActivation: false, dwell: true },
        'the menu still follows the two fingers, without activating on the way'
    );

    const up = pointerEvent('pointerup', { button: 2, buttons: 0, pointerType: 'mouse', clientX: 420, clientY: 300 });
    blockedControl.dispatchEvent(up);
    await wait(10);
    assert.equal(up.defaultPrevented, true, 'the secondary release never becomes a click under the menu');
    assert.equal(gesture.releases.length, 1, 'the secondary release reaches the menu exactly once');
    assert.equal(gesture.releases.at(-1)?.allowActivation, true, 'the same 48 px travel opens the tool under the fingers');
    assert.equal(getMysticPointerLock(61), null, 'the lock is handed back on the secondary release');
    assert.equal(gesture.open, true, 'the Flower stays open after the two fingers are lifted');

    // Le geste rendu, un deplacement libre n'appartient plus au menu.
    const freeProbe = appendCaptureProbe('pointermove');
    const free = pointerEvent('pointermove', { button: -1, buttons: 0, pointerType: 'mouse', clientX: 460, clientY: 320 });
    blockedControl.dispatchEvent(free);
    freeProbe.remove();
    assert.equal(freeProbe.reached.value, true, 'once released, a move reaches the owners again');
    assert.equal(free.defaultPrevented, false, 'a move after the release is not cancelled');
    gesture.open = false;
});

test('a second right-click closes the Flower and hands its pointer back', { timeout: 20000 }, async () => {
    await openFlowerFromRightClick();
    assert.equal(getMysticPointerLock(61) !== null, true);
    projectCanvas.dispatchEvent(pointerEvent('pointerdown', { button: 2, pointerType: 'mouse', clientX: 300, clientY: 300 }));
    const second = pointerEvent('contextmenu', { button: 2, pointerType: 'mouse', clientX: 300, clientY: 300 });
    projectCanvas.dispatchEvent(second);
    await wait(10);
    assert.equal(second.defaultPrevented, true, 'the second right-click is still suppressed');
    assert.equal(gesture.open, false, 'a right-click on the open Flower closes it');
    assert.equal(getMysticPointerLock(61), null, 'the closed Flower hands the held pointer back');
    blockedControl.dispatchEvent(pointerEvent('pointerup', { button: 2, buttons: 0, pointerType: 'mouse', clientX: 300, clientY: 300 }));
    await wait(10);
    assert.equal(gesture.releases.length, 0, 'a menu closed by a right-click has nothing left to release');
});

test('a Flower opened without a held press claims no pointer', { timeout: 20000 }, async () => {
    await openFlowerFromRightClick();
    blockedControl.dispatchEvent(pointerEvent('pointerup', { button: 2, buttons: 0, pointerType: 'mouse', clientX: 300, clientY: 300 }));
    await wait(10);
    assert.equal(getMysticPointerLock(61), null, 'the release forgets the secondary press');
    // Un contextmenu arrive sans appui pose (autre pointeur, autre point : la
    // garde du contextmenu derive de la fin de geste ne repond pas ici) : le
    // menu s'ouvre, mais il n'y a aucun appui a retenir.
    gesture.open = false;
    projectCanvas.dispatchEvent(pointerEvent('contextmenu', { button: 2, pointerType: 'mouse', pointerId: 62, clientX: 360, clientY: 340 }));
    await waitForOpen(() => gesture.open === true);
    assert.equal(gesture.open, true, 'the derived contextmenu still opens the Flower');
    assert.equal(getMysticPointerLock(61), null, 'no held press means no lock');
    const probe = appendCaptureProbe('pointermove');
    blockedControl.dispatchEvent(pointerEvent('pointermove', { button: -1, buttons: 0, pointerType: 'mouse', clientX: 340, clientY: 300 }));
    probe.remove();
    assert.equal(probe.reached.value, true, 'a menu opened without a press never swallows a move');
    gesture.open = false;
});

test('a held press never turns into a native drag or a text selection', { timeout: 20000 }, async () => {
    gesture.open = false;
    gesture.releases.length = 0;
    blockedControl.dispatchEvent(pointerEvent('pointerdown', { clientX: 300, clientY: 300 }));
    await openMysticContextMenu({
        clientX: 300, clientY: 300, source: 'project_view_visual',
        context: { type: 'atome', atomeId: 'image_atom', kind: 'image' }
    });
    assert.equal(gesture.open, true);
    const dragstart = new window.Event('dragstart', { bubbles: true, cancelable: true });
    blockedControl.dispatchEvent(dragstart);
    assert.equal(dragstart.defaultPrevented, true, 'the native drag of the media under the menu is cancelled');
    const selectstart = new window.Event('selectstart', { bubbles: true, cancelable: true });
    blockedControl.dispatchEvent(selectstart);
    assert.equal(selectstart.defaultPrevented, true, 'selecting the media under the menu is cancelled too');
    blockedControl.dispatchEvent(pointerEvent('pointerup', { clientX: 300, clientY: 300 }));
    await wait(10);
    assert.equal(gesture.releases.length, 1, 'the release still ends the held gesture');
    assert.equal(gesture.releases.at(-1)?.allowActivation, false, 'an unmoved release launches no tool');
    gesture.open = false;
});

test('a canvas release hands the pointer it held back, and a lost capture never does', { timeout: 20000 }, async () => {
    await holdFrom();
    const held = getMysticPointerLock(61);
    assert.equal(held !== null, true, 'the canvas route locks the pointer it took over');
    // Une capture perdue n'est pas un relachement : le Flower garde le pointeur.
    projectCanvas.dispatchEvent(pointerEvent('lostpointercapture', { clientX: 300, clientY: 300 }));
    await wait(10);
    assert.equal(gesture.open, true, 'losing the capture leaves the Flower open');
    assert.deepEqual(gesture.releases, [], 'losing the capture is not a release');
    projectCanvas.dispatchEvent(pointerEvent('pointermove', { clientX: 360, clientY: 300 }));
    projectCanvas.dispatchEvent(pointerEvent('pointerup', { clientX: 360, clientY: 300 }));
    await wait(10);
    assert.equal(gesture.releases.length, 1, 'the real release ends the gesture once');
    assert.equal(getMysticPointerLock(61), null, 'the held pointer is handed back at the release');
    assert.equal(isMysticPointerInteractionActive(61), false);
    // Sans nettoyage du pointeur detenu, ce second relachement rendait le geste
    // au menu une fois de plus.
    projectCanvas.dispatchEvent(pointerEvent('pointerup', { clientX: 360, clientY: 300 }));
    await wait(10);
    assert.equal(gesture.releases.length, 1, 'a second release finds no held pointer');
    gesture.open = false;
});

afterAll(() => {
    disposeGestureRuntime();
    setMysticRuntime(null);
    window.close();
});
