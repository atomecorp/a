import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBevyPanelTree, resolvePanelBodyHeight } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_tree.js';
import { createPanelGeometryGestureRuntime } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_geometry_gesture_runtime.js';
import { createFinderPanelSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js';
import { buildBootstrapDefsA } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js';
import { createBootstrapDefinitionBuilders } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_definition.js';
import { validateToolContract } from '../../eVe/intuition/contracts/index.js';
const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
test('fullscreen omits the real footer, its controls and its reserved height', () => {
    const args = { id: 'tv', title: 'France 2', geometry: { x: 0, y: 0, width: 800, height: 600 },
        surfaceSize: { width: 800, height: 600 }, bodyPadding: 0, onClose() {} };
    const panel = flatten(buildBevyPanelTree(args).root);
    assert.ok(panel.some(node => node.id === 'tv_footer_close'));
    assert.ok(panel.some(node => node.id === 'tv_footer_status'));
    const fullscreen = flatten(buildBevyPanelTree({ ...args, footerVisible: false }).root);
    assert.ok(!fullscreen.some(node => node.id.includes('footer')));
    assert.equal(fullscreen.find(node => node.id === 'tv_body').style.size[1], 600);
    assert.equal(resolvePanelBodyHeight(args.geometry, [], false), 600);
});
test('fullscreen transition restores geometry and does not touch media', async () => {
    const key = 'tv', initial = { x: 30, y: 40, width: 400, height: 300 };
    const state = { mounted: new Map([[key, {}]]), geometryBySurfaceKey: new Map([[key, initial]]),
        fullscreenGeometryBySurfaceKey: new Map(), detachedSurfaceKeys: new Set(),
        lastFooterActivationBySurfaceKey: new Map(), suppressFooterActivationUntilBySurfaceKey: new Map() };
    let refreshes = 0;
    const owner = createPanelGeometryGestureRuntime({ definition: { surfaceKey: key, allowFooterFullscreen: true, hideFooterInFullscreen: true, defaultGeometry: initial },
        runtimeState: state, provisionalGeometry: initial, surface: { clientWidth: 800, clientHeight: 600 },
        surfaceSize: () => ({ width: 800, height: 600 }), refresh: () => { refreshes++; } });
    assert.equal((await owner.setFullscreen(true)).fullscreen, true);
    assert.equal(state.geometryBySurfaceKey.get(key).height, 600);
    assert.deepEqual(state.fullscreenGeometryBySurfaceKey.get(key), initial);
    await owner.setFullscreen(false);
    assert.equal(state.fullscreenGeometryBySurfaceKey.size, 0);
    assert.equal(state.geometryBySurfaceKey.get(key).width, initial.width);
    assert.equal(refreshes, 2);
});
test('temporary Finder source restores query and scope when another tool takes over', async () => {
    const finder = createFinderPanelSurface({ loadRecords: async () => [], createPlaceRuntime: () => ({ reset() {} }),
        events: { on: () => () => {} } });
    await finder.applyToolContext({ scope: 'images', query: 'previous' });
    await finder.applyToolContext({ owner: 'tv', scope: 'tv', query: 'fr2', source: {
        scopes: [{ value: 'tv', label: 'TV' }], load: async () => [{ id: 'france2', name: 'France 2', type: 'tv_channel', textIndex: 'france 2 fr2' }]
    } });
    assert.equal(finder.state.scope, 'tv'); assert.equal(finder.readState().records.length, 1);
    await finder.releaseToolContext('tv');
    assert.equal(finder.state.scope, 'images'); assert.equal(finder.state.query, 'previous');
    await finder.applyToolContext({ owner: 'tv', scope: 'tv', source: { load: async () => [] } });
    await finder.applyToolContext({ query: 'other tool' });
    assert.equal(finder.state.scope, 'images'); assert.equal(finder.state.query, 'other tool');
});
test('TV commands are canonical discoverable runtime definitions', () => {
    const builders = createBootstrapDefinitionBuilders({ buildLabelKey: key => 'eve.tool.' + key, V2_REGISTERED_HANDLER_EXECUTION_MODE: 'v2_registered_handler' });
    const definitions = buildBootstrapDefsA(builders.buildDefaultToolDef, builders.buildRegisteredToggleToolDef, 'calendar', 'v2_registered_handler');
    const tv = definitions.filter(def => def.id.startsWith('tv.') || def.id === 'ui.tv');
    assert.equal(tv.length, 11);
    for (const def of tv) assert.equal(validateToolContract(def).ok, true, JSON.stringify(validateToolContract(def)));
});
test('shared double activation ignores single taps and toggles only on a pair', async () => {
    const { createPanelDoubleActivation } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_geometry_gesture_runtime.js');
    let time = 1000, count = 0; const activate = createPanelDoubleActivation(() => ++count, () => time);
    activate(); assert.equal(count, 0); time += 200; activate(); assert.equal(count, 1);
    time += 100; activate(); time += 500; activate(); assert.equal(count, 1);
});
test('failed fullscreen projection preserves the previously observed geometry', async () => {
    const initial = { x: 30, y: 40, width: 400, height: 300 }, key = 'tv';
    const state = { mounted: new Map([[key, {}]]), geometryBySurfaceKey: new Map([[key, initial]]),
        fullscreenGeometryBySurfaceKey: new Map(), detachedSurfaceKeys: new Set() };
    let announced = false;
    const runtime = createPanelGeometryGestureRuntime({ definition: { surfaceKey: key, allowFooterFullscreen: true, hideFooterInFullscreen: true,
        onFullscreenChanged: () => announced = true }, runtimeState: state, provisionalGeometry: initial,
        surfaceSize: () => ({ width: 800, height: 600 }), refresh: async () => ({ ok: false }) });
    assert.equal((await runtime.setFullscreen(true)).error, 'FULLSCREEN_UNSUPPORTED');
    assert.equal(state.fullscreenGeometryBySurfaceKey.size, 0); assert.deepEqual(state.geometryBySurfaceKey.get(key), initial); assert.equal(announced, false);
});
test('closing contextual Finder restores the previous search without persisting TV', async () => {
    const finder = createFinderPanelSurface({ loadRecords: async () => [], createPlaceRuntime: () => ({ reset() {} }), events: { on: () => () => {} } });
    await finder.applyToolContext({ scope: 'images', query: 'kept' });
    await finder.applyToolContext({ owner: 'tv', scope: 'tv', lockScope: true, source: { load: async () => [] } });
    finder.surface.onClose();
    assert.equal(finder.state.scope, 'images'); assert.equal(finder.state.query, 'kept'); assert.equal(finder.hasToolContext('tv'), false);
});
test('fullscreen projection gives the video the entire body without hidden padding', async () => {
    const { buildPanelTreeForDefinition } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_projection.js');
    const state = { fullscreenGeometryBySurfaceKey: new Map([['tv', {}]]), geometryBySurfaceKey: new Map(),
        desktopGeometryBySurfaceKey: new Map(), requestedHeightBySurfaceKey: new Map(), detachedSurfaceKeys: new Set(), chromeStateBySurfaceKey: new Map() };
    const sizes = [];
    const tree = buildPanelTreeForDefinition({ definition: { surfaceKey: 'tv', hideFooterInFullscreen: true, bodyPaddingPx: 0,
        buildContent: (_, context) => { sizes.push(context); return []; } },
        surface: { clientWidth: 800, clientHeight: 600 }, surfaceSize: () => ({ width: 800, height: 600 }), runtimeState: state,
        treeIdFor: key => key, warnDuplicateNodeIds: (_, value) => value, decoratePanelSweepTree: ({ tree }) => tree });
    assert.ok(sizes.every(context => context.bodyWidth === 800 && context.bodyHeight === 600 && context.fullscreen));
    assert.ok(!flatten(tree.root).some(node => node.id.includes('footer')));
});
test('other panel fullscreen keeps its existing footer and geometry policy by default', async () => {
    const { buildPanelTreeForDefinition } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_projection.js');
    const state = { fullscreenGeometryBySurfaceKey: new Map([['info', {}]]), geometryBySurfaceKey: new Map(),
        desktopGeometryBySurfaceKey: new Map(), requestedHeightBySurfaceKey: new Map(), detachedSurfaceKeys: new Set(), chromeStateBySurfaceKey: new Map() };
    const tree = buildPanelTreeForDefinition({ definition: { surfaceKey: 'info', defaultGeometry: { width: 400, height: 300 }, buildContent: () => [] },
        surface: { clientWidth: 800, clientHeight: 600 }, surfaceSize: () => ({ width: 800, height: 600 }), runtimeState: state,
        treeIdFor: key => key, applyHeaderPinShift: ({ geometry }) => geometry,
        warnDuplicateNodeIds: (_, value) => value, decoratePanelSweepTree: ({ tree }) => tree });
    assert.ok(flatten(tree.root).some(node => node.id === 'info_footer_close'));
    assert.notEqual(state.geometryBySurfaceKey.get('info').height, 600);
});

test('shared panel projection preserves YouTube close control and state-driven fullscreen', async () => {
    const { buildPanelTreeForDefinition } = await import('../../eVe/intuition/runtime/bevy_panel/bevy_panel_projection.js');
    const runtimeState = { fullscreenGeometryBySurfaceKey: new Map(), geometryBySurfaceKey: new Map(),
        desktopGeometryBySurfaceKey: new Map(), requestedHeightBySurfaceKey: new Map(), detachedSurfaceKeys: new Set(), chromeStateBySurfaceKey: new Map() };
    let hideFooter = false, closes = 0;
    const definition = { surfaceKey: 'youtube', defaultGeometry: { width: 560, height: 360 },
        fullscreenBody: true, minimalFooter: true, closeLabel: 'Close', requestClose: () => ++closes,
        readState: () => ({ title: 'Saved video', hideFooter }), buildContent: () => [] };
    const project = () => buildPanelTreeForDefinition({ definition, runtimeState,
        surface: { clientWidth: 800, clientHeight: 600 }, surfaceSize: () => ({ width: 800, height: 600 }),
        treeIdFor: key => key, applyHeaderPinShift: ({ geometry }) => geometry,
        warnDuplicateNodeIds: (_, value) => value, decoratePanelSweepTree: ({ tree }) => tree });
    const standard = flatten(project().root);
    assert.equal(standard.find(node => node.id === 'youtube_footer_close_label').text, 'Close');
    assert.equal(standard.find(node => node.id === 'youtube_footer_status').text, 'Saved video');
    standard.find(node => node.id === 'youtube_footer_close').on.activate({ stopPropagation() {} });
    assert.equal(closes, 1);
    hideFooter = true;
    const fullscreen = flatten(project().root);
    assert.ok(!fullscreen.some(node => node.id === 'youtube_footer'));
    assert.equal(fullscreen.find(node => node.id === 'youtube_body').style.size[1], 600);
    assert.deepEqual(fullscreen.find(node => node.id === 'youtube_body').style.padding, [0, 0, 0, 0]);
});
