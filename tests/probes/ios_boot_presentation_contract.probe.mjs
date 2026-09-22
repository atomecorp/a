// The native iOS launch surface is released by `bootPresentationReady` and by
// nothing else, so the boot contract must publish it for every entry route and
// must never drop it because a route was not presented yet when it was first
// checked. The Dashboard entry deliberately suspends the main menu, and a cold
// workspace can mount its Main Toolbar later than the old bounded wait.
import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();

globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

window.Element.prototype.animate = function animate() {
    return {
        cancel() {},
        finished: Promise.resolve()
    };
};

const DASHBOARD_PROJECT_ID = 'dashboard';
window.__authCheckComplete = true;
window.__authCheckResult = { complete: true, authenticated: true, userId: 'ios_boot_user' };

const { installEveIntuitionBootRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/boot_runtime.js');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readinessMessages = (messages) => messages.filter((message) => (
    message?.action === 'bootPresentationReady' && message?.version === 1
));

// One install owns one boot, exactly like the page: the awaited contract, the
// menu state and the native messages all belong to that single launch.
const bootOnce = async ({ route, scenario, menuMountedAfterMs = 0, dashboardReadyAfterMs = 0 }) => {
    const messages = [];
    window.webkit = {
        messageHandlers: {
            swiftBridge: {
                postMessage(message) {
                    messages.push(message);
                }
            }
        }
    };
    const menuState = { active: route === 'project' && menuMountedAfterMs === 0, treeMounted: route === 'project' && menuMountedAfterMs === 0 };
    let mountedNodes = dashboardReadyAfterMs === 0 ? 2 : 0;
    const bindings = {
        applyBackgroundPanelClose() {}, applyBackgroundPanelOpen() {},
        applyCalendarPanelClose() {}, applyCalendarPanelOpen() {},
        applyCommunicatePanelClose() {}, applyCommunicatePanelOpen() {},
        applyContactPanelClose() {}, applyContactPanelOpen() {},
        applyCouleurPanelClose() {}, applyCouleurPanelOpen() {},
        applyDeletePanelClose() {}, applyDeletePanelOpen() {},
        applyFinderPanelClose() {}, applyFinderPanelOpen() {},
        applyFontPanelClose() {}, applyFontPanelOpen() {},
        applyInfoPanelClose() {}, applyInfoPanelOpen() {},
        applyLayerPanelClose() {}, applyLayerPanelOpen() {},
        applyMatrixInactive() {}, applyMatrixOpen() {}, applyOrientation() {},
        applyPastePanelClose() {}, applyPastePanelOpen() {},
        applySizePanelClose() {}, applySizePanelOpen() {},
        applyTimelinePanelClose() {}, applyTimelinePanelOpen() {},
        applyUndoAction() {}, applyUndoPanelClose() {}, applyUndoPanelOpen() {},
        atomeContextualEditRuntime: { hasContext: () => false, isEditing: () => false },
        atomeContextualRailState: {},
        bindMainMenuAuthGate() {},
        closeCanonicalHomePanel() {},
        createEditableTextAtome() {},
        destroyLayerInvariantObserver() {},
        ensureActivitiesModule() {},
        ensureBackgroundPanelModule() {},
        ensureCalendarPanelModule() {},
        ensureCaptureModule() {},
        ensureCommunicatePanelModule() {},
        ensureContactPanelModule() {},
        ensureCouleurPanelModule() {},
        ensureDeletePanelModule() {},
        ensureDeferredIntuitionRuntime() {},
        ensureDetailPanelModule() {},
        ensureEveDeferredRuntime() {},
        ensureFinderPanelModule() {},
        ensureFontPanelModule() {},
        ensureHomePanelModule() {},
        ensureInfoPanelModule() {},
        ensureLayerPanelModule() {},
        ensureMatrixModule() {},
        ensureMoleculeMediaRuntime() {},
        ensureMysticContextItemsRuntime() {},
        ensureProjectBootstrapReady: async () => 'ios_boot_project',
        ensureSizePanelModule() {},
        ensureTextToolRuntime() {},
        ensureTimelinePanelModule() {},
        ensureToolModule() {},
        ensureUndoPanelModule() {},
        focusFinderPanel() {},
        getAtomeElement() {},
        getAtomeRuntimeState() {},
        installAtomeContextualRailRuntime() {},
        installEveDebugRuntime() {},
        installIntuitionXMysticContextRuntime() {},
        installSvgDrawRuntime() {},
        installSvgVectorEditRuntime() {},
        installTextStyleToolSelectionGuard() {},
        invokeAtomeContextualRailToolDefinitionWithContext() {},
        isWorkspaceActiveForMainMenu: () => true,
        newMenu: {
            measure: () => ({
                active: menuState.active,
                treeMounted: menuState.treeMounted,
                reservedHeight: menuState.treeMounted ? 60 : 0
            })
        },
        normalizeAtomeContextualRailKind: (value) => value,
        normalizeAtomeContextualRailToolKey: (value) => value,
        openCanonicalHomePanel() {},
        openInitialLoginSequence() {},
        openWorkspaceDashboardWithProjectBootstrap: async () => (
            route === 'project'
                ? { ok: true, route: 'project', projectId: 'ios_boot_project' }
                : { ok: true, route: 'dashboard' }
        ),
        panelSurfaceDefinitions: {},
        publishAtomeContextualRailSelection() {},
        readAtomeContextualRailRecordActionBridgeState() {},
        readExplicitLatched() {},
        readProjectBootstrapPresentation: () => ({ route }),
        readSelectionSnapshot() {},
        // The Dashboard proves its presentation through the projected
        // Dashboard tree it already published as `dashboard.presentation_ready`.
        readWorkspacePresentationEvidence: () => ({
            ok: route === 'dashboard' && mountedNodes > 0,
            sceneProjectId: DASHBOARD_PROJECT_ID,
            mountedNodes
        }),
        refreshFinderPanelProjection() {},
        registerAtomeTool() {},
        registerBasicUiToolsRuntime() {},
        registerMainToolAtomes() {},
        registerMediaReaderToolRuntime() {},
        registerPanelSurfaceDefinition() {},
        registerPanelUiToolsRuntime() {},
        registerUiAction() {},
        renderAtomeContextualRailToolsIntoRow() {},
        resolveAtomeContextualRailDefaultTools() { return []; },
        resolveAtomeContextualRailKindFromHost() {},
        resolveAtomeContextualRailToolDefinitionsForOptions() { return []; },
        resolveCurrentProjectId() { return 'ios_boot_project'; },
        resolveMysticContextItems() { return []; },
        setIntuitionItemEnabled() {},
        showAtomeContextualRail() {},
        syncAtomeContextualRailButtonsForToolStateOnRow() {},
        syncMainMenuAuthContent() {},
        syncToolLatchedState() {},
        warmupToolGatewayRuntime() {}
    };
    installEveIntuitionBootRuntime(bindings);
    return { messages, menuState, readMountedNodes: () => mountedNodes, setMountedNodes: (value) => { mountedNodes = value; } };
};

// 1. A Dashboard boot also presents the native surface: it is released by the
//    Dashboard projection evidence even though no Main Toolbar exists on it.
const dashboardBoot = await bootOnce({ route: 'dashboard', dashboardReadyAfterMs: 60 });
await wait(400);
assert.equal(
    readinessMessages(dashboardBoot.messages).length,
    0,
    'an unpresented Dashboard tree must not release the native launch surface'
);
dashboardBoot.setMountedNodes(2);
await wait(400);

const dashboardReady = readinessMessages(dashboardBoot.messages);
assert.equal(dashboardReady.length, 1, 'the Dashboard entry must publish exactly one native presentation contract');
assert.equal(dashboardReady[0]?.route, 'dashboard', 'the Dashboard contract must carry its own route');
assert.equal(dashboardReady[0]?.main_menu, undefined, 'the Dashboard entry must not claim a Main Toolbar it deliberately suspends');
assert.equal(dashboardReady[0]?.workspace?.route_surface, 'dashboard', 'the contract must describe the presented Dashboard surface');
assert.equal(dashboardReady[0]?.workspace?.mounted_nodes, 2, 'the contract must report the projected Dashboard nodes');

// 2. A project whose Main Toolbar is already mounted keeps releasing the surface
//    through the canonical project contract.
const projectBoot = await bootOnce({ route: 'project' });
await wait(200);
const projectReady = readinessMessages(projectBoot.messages);
assert.equal(projectReady.length, 1, 'a presented project must publish exactly one native presentation contract');
assert.equal(projectReady[0]?.route, 'project', 'the project contract must stay bound to its route');
assert.equal(projectReady[0]?.project_id, 'ios_boot_project', 'the project contract must name the presented project');
assert.equal(projectReady[0]?.main_menu?.active, true, 'the project contract must prove the mounted Main Toolbar');
assert.equal(projectReady[0]?.main_menu?.tree_mounted, true, 'the project contract must prove the mounted Main Toolbar tree');

// 3. A cold project whose Main Toolbar mounts after the historical bounded wait
//    must still release the surface instead of leaving the launch cover behind.
const lateMenuBoot = await bootOnce({ route: 'project', menuMountedAfterMs: 3600 });
await wait(3400);
assert.equal(
    readinessMessages(lateMenuBoot.messages).length,
    0,
    'a project whose Main Toolbar is not mounted yet must not release the surface'
);
lateMenuBoot.menuState.active = true;
lateMenuBoot.menuState.treeMounted = true;
await wait(1600);
const lateReady = readinessMessages(lateMenuBoot.messages);
assert.equal(lateReady.length, 1, 'a late Main Toolbar mount must still publish the native presentation contract');
assert.equal(lateReady[0]?.route, 'project', 'the late contract must stay bound to the presented project route');
assert.equal(lateReady[0]?.main_menu?.tree_mounted, true, 'the late contract must prove the mounted Main Toolbar tree');

// 4. A Dashboard entry the user leaves for a project before the Dashboard tree
//    was projected must still release the surface: the contract reads the
//    surface that is presented now, not the route the boot reported. Without
//    that, opening a project could never clear a launch cover the Dashboard
//    entry had not satisfied yet.
const switchedBoot = await bootOnce({ route: 'dashboard', dashboardReadyAfterMs: 60000 });
await wait(300);
assert.equal(
    readinessMessages(switchedBoot.messages).length,
    0,
    'an unpresented Dashboard entry must not release the native launch surface'
);
switchedBoot.menuState.active = true;
switchedBoot.menuState.treeMounted = true;
await wait(1600);
const switchedReady = readinessMessages(switchedBoot.messages);
assert.equal(switchedReady.length, 1, 'the project opened from a Dashboard entry must publish exactly one contract');
assert.equal(switchedReady[0]?.route, 'project', 'the switched contract must describe the project now presented');
assert.equal(switchedReady[0]?.main_menu?.tree_mounted, true, 'the switched contract must prove the mounted Main Toolbar tree');

console.log('iOS boot presentation contract probes passed');
