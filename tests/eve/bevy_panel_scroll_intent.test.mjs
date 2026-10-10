import { expect, test, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createBevyUiScrollRuntime, locateBevyUiNode } from '../../eVe/domains/rendering/bevy_ui_scroll_runtime.js';
import { createEveBevyUiRuntime } from '../../eVe/domains/rendering/bevy_ui_runtime.js';
import { createEmbeddedSurfaceRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_embedded_surface.js';
import { node } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree_primitives.js';
import { accordionNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_accordion.js';
import { textInputNode, panelTextFieldHandlers } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_editable_text.js';
import { createPanelTextEditingRuntime, readActivePanelTextField } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_text_editing.js';
import { getActiveTextEditor, getTextServiceState } from '../../eVe/domains/rendering/hidden_text_service_runtime.js';
import { bevyPanelRuntimeState as state, openBevyPanelSurface, closeBevyPanelSurface, registerBevyPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js';
import { setMainMenuRuntime } from '../../eVe/intuition/ribbon/bevy_ui_product_registry.js';
import { BEVY_PANEL_TOKENS as T } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tokens.js';

const scrollTree = (height = 200) => ({ id: 'scroll', disableScaleWatch: true, root: node('band', 'scroll_area', {
    size: [300, height], overflow: 'scroll_y'
}, [node('content', 'panel', { size: [300, 1000] }, [node('field', 'text_input', { position: [0, 700], size: [250, 40] })])]) });
const scrollHit = (tree, treeId, nodeId = 'field') => ({ treeId,
    ...locateBevyUiNode({ node: tree.root, nodeId }),
    nodeId, kind: 'text_input'
});

// These use the real scroll state and the same atomic layout input as the native projector.
test('automatic reveal and restore do not create user scroll; a wheel invalidates stale requests even at the limit', () => {
    const events = [], scroll = createBevyUiScrollRuntime({ refreshTree: () => {}, emitTargetEvent: (...args) => events.push(args), requestFrame: () => 1 });
    try {
        const tree = scrollTree();
        scroll.applyTree({ tree, treeId: tree.id });
        const snapshot = scroll.captureState(tree.id);
        const intent = { userRevision: 0, reveals: [{ nodeId: 'field', align: 'end', marginPx: 8 }] };
        const painted = scroll.prepareTree({ tree, treeId: tree.id, scrollIntent: intent });
        expect(locateBevyUiNode({ node: painted.root, nodeId: 'field' }).box.y).toBe(152);
        expect(events).toEqual([]);
        expect(scroll.userRevision(tree.id)).toBe(0);
        scroll.announcePreparedScroll({ treeId: tree.id, scrollIntent: intent });
        expect(events).toHaveLength(1);
        const restored = scroll.prepareTree({ tree, treeId: tree.id, scrollIntent: { userRevision: 0, restore: snapshot } });
        expect(restored.root.style.scroll).toEqual([0, 0]);
        scroll.wheel(scrollHit(restored, tree.id), { delta_y: -20 });
        expect(scroll.userRevision(tree.id)).toBe(1);
        const stale = scroll.prepareTree({ tree, treeId: tree.id, scrollIntent: intent });
        expect(stale.root.style.scroll).toEqual([0, 0]);
    } finally { scroll.clearTree('scroll'); }
});

test('touch takeover counts once and later travel/inertia do not invalidate their own gesture', () => {
    let time = 0;
    const frames = [];
    const scroll = createBevyUiScrollRuntime({ refreshTree: () => {}, emitTargetEvent: () => {},
        requestFrame: callback => { frames.push(callback); return frames.length; }, cancelFrame: () => {}, now: () => time });
    try {
        const tree = scroll.applyTree({ tree: scrollTree(), treeId: 'touch' });
        scroll.begin(scrollHit(tree, 'touch'), { x: 10, y: 150 });
        time = 16; scroll.drag({ x: 10, y: 145 });
        expect(scroll.userRevision('touch')).toBe(0);
        time = 32; scroll.drag({ x: 10, y: 100 });
        time = 48; scroll.drag({ x: 10, y: 50 });
        expect(scroll.userRevision('touch')).toBe(1);
        scroll.end();
        time = 64; frames.at(-1)?.(time);
        expect(scroll.userRevision('touch')).toBe(1);
    } finally { scroll.clearTree('touch'); }
});

test('the native tree and overlay first receive the final aligned geometry', async () => {
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>');
    const surface = dom.window.document.querySelector('canvas');
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 200 });
    const overlays = [], ops = [];
    const runtime = createEveBevyUiRuntime({ nativeUiEnabled: true, requestFrame: () => 0,
        moduleProvider: async () => ({ apply_atome_bevy_ui_ops: batch => ops.push(...batch), drain_atome_bevy_ui_events: () => [], queue_atome_bevy_ui_events: () => {} }),
        overlayProjector: { project: async ({ tree }) => { overlays.push(tree); return []; } } });
    try {
        const tree = scrollTree();
        await runtime.mountTree({ id: tree.id, tree, surface, scrollIntent: { userRevision: 0,
            reveals: [{ nodeId: 'field', align: 'end', marginPx: 8 }] } });
        expect(overlays).toHaveLength(1);
        expect(locateBevyUiNode({ node: overlays[0].root, nodeId: 'field' }).box.y).toBe(152);
        expect(ops.filter(op => op.type === 'mount_tree')).toHaveLength(1);
        expect(locateBevyUiNode({ node: ops.find(op => op.type === 'mount_tree').tree.root, nodeId: 'field' }).box.y).toBe(152);
    } finally { await runtime.unmountTree('scroll'); dom.window.close(); }
});

const panelFixture = async ({ keyboard = false, direction = 'up', waitForOpen = null, duringOpen = false } = {}) => {
    const dom = new JSDOM('<canvas id="eve_surface_project"></canvas>', { url: 'http://localhost', pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window); vi.stubGlobal('document', dom.window.document); vi.stubGlobal('CustomEvent', dom.window.CustomEvent);
    dom.window.__eveWorkspaceMode = { mode: 'project', projectId: 'scroll_intent_fixture' };
    const surface = dom.window.document.querySelector('canvas');
    let height = keyboard ? 844 : 800;
    surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: keyboard ? 390 : 900, height });
    const viewport = new dom.window.EventTarget();
    Object.defineProperty(dom.window, 'visualViewport', { value: viewport, configurable: true });
    const key = 'scroll_intent_fixture', id = `eve_bevy_panel_${key}`;
    const projected = [], inputs = [];
    const scroll = createBevyUiScrollRuntime({ refreshTree: () => {}, emitTargetEvent: () => {}, requestFrame: () => 1 });
    let source = null;
    const project = async input => {
        const anchor = scroll.captureNodeAnchor({ tree: source, treeId: id, nodeId: input.preserveNodeId });
        source = input.tree;
        const tree = scroll.prepareTree({ tree: source, treeId: id, anchor, scrollIntent: input.scrollIntent });
        projected.push(tree); inputs.push(input);
        scroll.announcePreparedScroll({ treeId: id, scrollIntent: input.scrollIntent });
        return tree;
    };
    dom.window.eveBevyUiRuntime = { mountTree: project, updateTree: project, updateTreeMotion: async () => {},
        captureTreeScroll: treeId => scroll.captureState(treeId), treeScrollRevision: treeId => scroll.userRevision(treeId),
        revealTreeNode: options => scroll.revealNode({ tree: source, treeId: id, ...options }),
        unmountTree: async () => scroll.clearTree(id) };
    setMainMenuRuntime({ showFully: async () => true, getReservedHeight: () => 74 }, dom.window);
    state.runtime = null;
    let expanded = false, bodyHeight = 600;
    const values = { first: 'bonjour', second: 'monde' };
    const editing = createPanelTextEditingRuntime({ name: 'fixture', readField: key => values[key], writeDraft: (key, value) => { values[key] = value; } });
    const field = (key, y, width, emit) => {
        editing.registerField(key, { width, height: 40, nodeId: key });
        const input = textInputNode({ id: key, value: values[key], width, height: 40, ...editing.fieldView(key),
            ...panelTextFieldHandlers('fixture', key, emit) });
        return { ...input, style: { ...input.style, position: [0, y] } };
    };
    registerBevyPanelSurface({ surfaceKey: key, defaultGeometry: { width: 420, height: 620 }, hierarchyRail: false,
        handleEvent: async (intent, { refresh, patchText }) => {
            if (intent.type.startsWith('fixture.field.')) return editing.handle(intent, { refresh, patchText });
            if (duringOpen) { expanded = !expanded; refresh(); }
            if (waitForOpen) await waitForOpen;
            if (!duringOpen) expanded = !expanded;
            return { ok: true };
        },
        buildFixedContent: (_, { bodyWidth }) => [node('actions', 'panel', { size: [bodyWidth, 40] })],
        buildContent: (_, { bodyWidth, emit }) => keyboard ? [
            node('before', 'panel', { size: [bodyWidth, 300] }),
            node('inner', 'scroll_area', { size: [bodyWidth, 350], overflow: 'scroll_y' }, [
                node('fields', 'panel', { size: [bodyWidth, 1000] }, [field('first', 700, bodyWidth, emit), field('second', 850, bodyWidth, emit)])
            ]), node('after', 'panel', { size: [bodyWidth, 300] })
        ] : [node('before', 'panel', { size: [bodyWidth, 600] }),
            accordionNode({ id: 'section', direction, width: bodyWidth, expanded, bodyHeight,
                bodyChildren: [node('content', 'panel', { size: [bodyWidth, bodyHeight] })], onActivate: () => emit({ type: 'toggle' }) }),
            node('after', 'panel', { size: [bodyWidth, 600] })]
    });
    await openBevyPanelSurface(key);
    const mounted = state.mounted.get(key);
    const refresh = async () => { await mounted.refresh(); await vi.waitFor(() => expect(mounted.refreshPromise).toBeNull()); };
    return { dom, id, scroll, inputs, projected, editing, values, mounted, refresh,
        fieldBox: key => locateBevyUiNode({ node: projected.at(-1).root, nodeId: key }),
        activate: nodeId => locateBevyUiNode({ node: projected.at(-1).root, nodeId }).node.on.activate(),
        focus: key => locateBevyUiNode({ node: projected.at(-1).root, nodeId: key }).node.on.focus({ x: 10, y: 10 }),
        wheel: (delta, nodeId = keyboard ? 'first' : 'section_header') => scroll.wheel(scrollHit(projected.at(-1), id, nodeId), { delta_y: delta }),
        changeContent: () => { bodyHeight += 250; },
        resize: async next => { height = next; viewport.dispatchEvent(new dom.window.Event('resize')); await new Promise(resolve => setTimeout(resolve, 130)); await vi.waitFor(() => expect(mounted.refreshPromise).toBeNull()); },
        cleanup: async () => { editing.stop(); await closeBevyPanelSurface(key); state.definitions.delete(key); state.runtime = null;
            setMainMenuRuntime(null, dom.window); dom.window.close(); vi.unstubAllGlobals(); }
    };
};

test.each(['up', 'down'])('a %s opening is aligned once; manual scroll, content growth and closing never pin it again', async direction => {
    const fixture = await panelFixture({ direction });
    try {
        fixture.activate('section_header');
        await vi.waitFor(() => expect(fixture.inputs.at(-1).scrollIntent?.reveals?.at(-1)?.nodeId).toBe('section_header'));
        await fixture.mounted.refreshPromise;
        const requests = fixture.inputs.filter(input => input.scrollIntent?.reveals?.length).length;
        fixture.wheel(direction === 'up' ? -30 : 30); await fixture.refresh();
        const position = fixture.scroll.captureState(fixture.id).offsets;
        fixture.changeContent(); await fixture.refresh();
        expect(fixture.scroll.captureState(fixture.id).offsets).toEqual(position);
        fixture.activate('section_header');
        await vi.waitFor(() => expect(fixture.mounted.openingRequest).toBeNull());
        await fixture.refresh();
        expect(fixture.inputs.filter(input => input.scrollIntent?.reveals?.length)).toHaveLength(requests);
    } finally { await fixture.cleanup(); }
});

test('manual scrolling cancels an opening still waiting for data', async () => {
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    const fixture = await panelFixture({ waitForOpen: gate });
    try {
        fixture.activate('section_header'); fixture.wheel(40); finish();
        await fixture.refresh();
        expect(fixture.inputs.some(input => input.scrollIntent?.reveals?.length)).toBe(false);
    } finally { finish(); await fixture.cleanup(); }
});

test('an opening projected before its async handler finishes remains consumed after the result arrives', async () => {
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    const fixture = await panelFixture({ waitForOpen: gate, duringOpen: true });
    try {
        fixture.activate('section_header');
        await vi.waitFor(() => expect(fixture.inputs.at(-1).scrollIntent?.reveals?.length).toBe(2));
        await fixture.mounted.refreshPromise; finish(); await Promise.resolve(); await fixture.refresh();
        expect(fixture.inputs.filter(input => input.scrollIntent?.reveals?.length)).toHaveLength(1);
    } finally { finish(); await fixture.cleanup(); }
});

test.each([false, true])('keyboard closing restores positions only without manual scroll=%s, while retaining the editor and value', async manual => {
    const fixture = await panelFixture({ keyboard: true });
    try {
        fixture.wheel(90); await fixture.refresh();
        const before = fixture.scroll.captureState(fixture.id);
        fixture.focus('first'); await fixture.refresh();
        const editor = getActiveTextEditor();
        editor.setSelectionRange(1, 4);
        await fixture.resize(463);
        const located = fixture.fieldBox('first');
        expect(located.box.y + located.box.height).toBeCloseTo(located.scrollAncestors[0].box.y + located.scrollAncestors[0].box.height - T.gapPx);
        expect(getActiveTextEditor()).toBe(editor);
        expect([editor.selectionStart, editor.selectionEnd]).toEqual([1, 4]);
        expect(getTextServiceState().activeEditorCount).toBe(1);
        const count = fixture.inputs.length;
        await fixture.refresh();
        expect(fixture.inputs.at(-1).scrollIntent).toBeNull();
        editor.value = 'bonjour !'; editor.dispatchEvent(new fixture.dom.window.Event('input'));
        await new Promise(resolve => setTimeout(resolve, 25));
        expect(fixture.values.first).toBe('bonjour !');
        if (manual) { fixture.wheel(-45); await fixture.refresh(); }
        await fixture.resize(844);
        const restored = fixture.scroll.captureState(fixture.id);
        if (manual) {
            expect(fixture.inputs.slice(count).some(input => input.scrollIntent?.restore)).toBe(false);
            expect(restored.offsets).not.toEqual(before.offsets);
        } else expect(restored.offsets).toEqual(before.offsets);
        expect(getActiveTextEditor()).toBe(editor);
        expect(editor.value).toBe('bonjour !');
    } finally { await fixture.cleanup(); }
});

test('changing focused field while the keyboard is open aligns the new field once; rotation invalidates the old snapshot', async () => {
    const fixture = await panelFixture({ keyboard: true });
    try {
        fixture.focus('first'); await fixture.refresh(); await fixture.resize(463);
        fixture.wheel(-40); await fixture.refresh();
        fixture.focus('second'); await fixture.refresh();
        expect(readActivePanelTextField()).toBe('second');
        expect(fixture.inputs.at(-1).scrollIntent?.reveals?.[0].nodeId).toBe('second');
        await fixture.refresh(); expect(fixture.inputs.at(-1).scrollIntent).toBeNull();
        fixture.dom.window.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 0, top: 0, width: 844, height: 390 });
        await fixture.refresh(); expect(fixture.mounted.keyboard).toBeNull();
        expect(fixture.inputs.at(-1).scrollIntent?.restore).toBeUndefined();
    } finally { await fixture.cleanup(); }
});


test('native focus captures the full viewport before a synchronous keyboard resize burst and aligns only after settling', async () => {
    const fixture = await panelFixture({ keyboard: true });
    try {
        fixture.dom.window.document.addEventListener('focusin', () => {
            const canvas = fixture.dom.window.document.querySelector('canvas');
            canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 463 });
            fixture.dom.window.visualViewport.dispatchEvent(new fixture.dom.window.Event('resize'));
        }, { once: true });
        fixture.focus('first'); await fixture.refresh();
        expect(fixture.mounted.keyboard.base.height).toBe(844);
        expect(fixture.inputs.at(-1).scrollIntent).toBeNull();
        await new Promise(resolve => setTimeout(resolve, 130));
        await vi.waitFor(() => expect(fixture.mounted.refreshPromise).toBeNull());
        expect(fixture.inputs.filter(input => input.scrollIntent?.reveals?.[0]?.nodeId === 'first')).toHaveLength(1);
        expect(fixture.fieldBox('first').box.y + fixture.fieldBox('first').box.height)
            .toBeCloseTo(fixture.fieldBox('first').scrollAncestors[0].box.y + fixture.fieldBox('first').scrollAncestors[0].box.height - T.gapPx);
    } finally { await fixture.cleanup(); }
});


test.each(['before', 'during', 'none'])('embedded async opening respects a manual gesture %s hydration', async manual => {
    let revision = 0, generation = 0, release;
    const waiting = new Promise(resolve => { release = resolve; });
    const inputs = [];
    const host = { intentGeneration: 0, refresh: options => { inputs.push(options); } };
    host.refresh.beginIntent = anchor => {
        const captured = revision, epoch = ++generation;
        host.intentGeneration = epoch;
        const request = { ...anchor, consumed: false, valid: () => !request.consumed && revision === captured && generation === epoch };
        return request;
    };
    const runtimeState = { mounted: new Map([['host', host]]) };
    const embedded = createEmbeddedSurfaceRuntime({ runtimeState, treeIdFor: key => key,
        getPanelRuntime: () => ({ treeScrollRevision: () => revision }), emitSurfaceState: () => {} });
    const definition = { onOpen: () => waiting };
    const pending = embedded.dispatch('host', {}, async () => {
        if (manual === 'before') { await Promise.resolve(); revision++; }
        const parent = embedded.claimHost('child', definition);
        return embedded.embed({ key: 'child', definition, ...parent });
    });
    await Promise.resolve();
    if (manual === 'during') revision++;
    release(); await pending;
    expect(inputs).toHaveLength(1);
    expect(inputs[0].request.valid()).toBe(manual === 'none');
    await embedded.release('child');
});
