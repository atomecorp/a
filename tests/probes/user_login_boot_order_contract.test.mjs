import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

globalThis.$ = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.id) node.id = String(options.id);
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.attrs) Object.entries(options.attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (options.css) Object.assign(node.style, options.css);
    Object.entries(options).forEach(([key, value]) => {
        if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    });
    const parent = typeof options.parent === 'string' ? document.querySelector(options.parent) : options.parent;
    if (parent) parent.appendChild(node);
    return node;
};

const mainHandle = document.createElement('button');
mainHandle.setAttribute('data-role', 'eve_intuitionx-handle');
document.body.appendChild(mainHandle);

let homeModuleLoadCount = 0;
const menuUpdates = [];
let menuHiddenCount = 0;
let loginVisibleEventCount = 0;
let loginMountedEventCount = 0;
window.new_menu_v2 = {
    updateContent: (content) => {
        menuUpdates.push(content);
    },
    hideCompletely: () => {
        menuHiddenCount += 1;
    }
};
window.addEventListener('eve:login-choice-visible', () => {
    loginVisibleEventCount += 1;
});
window.addEventListener('eve:login-choice-mounted', () => {
    loginMountedEventCount += 1;
});
window.__authCheckComplete = true;
window.__authCheckResult = {
    complete: true,
    authenticated: false,
    anonymous: false
};

const { createMainMenuAuthRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_auth_runtime.js');
const { installEveIntuitionBootRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/boot_runtime.js');

const kickstartSource = readFileSync(new URL('../../atome/src/squirrel/kickstart.js', import.meta.url), 'utf8');
const intuitionSource = readFileSync(new URL('../../eVe/intuition/eVeIntuition.js', import.meta.url), 'utf8');

assert.match(kickstartSource, /background:\s*'transparent'/, '#view must stay transparent during boot and cannot emit the gray #272727 frame');
assert.doesNotMatch(kickstartSource, /background:\s*'#272727'/, '#view must not restore the boot gray background');
assert.match(intuitionSource, /createIntuitionXMenu\(\{[\s\S]*?open:\s*false/, 'main ribbon must be created closed so no toolbox frame appears before login choice');

const runtime = createMainMenuAuthRuntime({
    intuitionContent: {
        toolbox: { children: ['home', 'find'] }
    },
    translate: (_key, label) => label,
    ensureHomePanelModule: async () => {
        homeModuleLoadCount += 1;
        return {};
    }
});

runtime.syncMainMenuAuthContent({ force: true });
const openResult = await runtime.openInitialLoginSequence();
await new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(openResult?.ok, true, 'initial unauthenticated boot must open the login sequence');
assert.equal(homeModuleLoadCount, 0, 'initial login choice must not wait for the Home panel module');
assert.equal(document.getElementById('eve_login_sequence')?.style?.display, 'block', 'login shell must be present immediately');
assert.equal(document.getElementById('eve_login_sequence__choice')?.style?.display, 'flex', 'login choice must be the first visible auth surface');
assert.equal(loginMountedEventCount, 1, 'login choice must publish a mounted event for early hidden warmups');
assert.equal(loginVisibleEventCount, 1, 'login choice must publish a readiness event for deferred warmups');
assert.deepEqual(menuUpdates.at(-1)?.toolbox?.children, [], 'disconnected boot must keep toolbox content empty before workspace');
assert.equal(menuHiddenCount, 1, 'disconnected boot must hide the main menu before the user enters a workspace');

const visibleProjectLayer = document.createElement('div');
visibleProjectLayer.id = 'project_view_visible_project';
visibleProjectLayer.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1200, height: 800 });
const visibleProjectCanvas = document.createElement('canvas');
visibleProjectCanvas.id = 'eve_surface_project';
visibleProjectCanvas.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1200, height: 800 });
visibleProjectLayer.appendChild(visibleProjectCanvas);
document.body.appendChild(visibleProjectLayer);
window.__currentProject = { id: 'visible_project' };
assert.equal(
    runtime.isWorkspaceActiveForMainMenu(),
    true,
    'a visible current project surface must be treated as an active workspace even before auth state catches up'
);
visibleProjectLayer.remove();

const workspaceOpenCalls = [];
window.__eveWorkspaceWarmupsStarted = false;
delete window.__currentProject;
installEveIntuitionBootRuntime({
    applyBackgroundPanelClose() {},
    applyBackgroundPanelOpen() {},
    applyCalendarPanelClose() {},
    applyCalendarPanelOpen() {},
    applyCommunicatePanelClose() {},
    applyCommunicatePanelOpen() {},
    applyContactPanelClose() {},
    applyContactPanelOpen() {},
    applyCouleurPanelClose() {},
    applyCouleurPanelOpen() {},
    applyDeletePanelClose() {},
    applyDeletePanelOpen() {},
    applyDetailPanelClose() {},
    applyDetailPanelOpen() {},
    applyFinderPanelClose() {},
    applyFinderPanelOpen() {},
    applyFontPanelClose() {},
    applyFontPanelOpen() {},
    applyInfoPanelClose() {},
    applyInfoPanelOpen() {},
    applyLayerPanelClose() {},
    applyLayerPanelOpen() {},
    applyMatrixInactive() {},
    applyMatrixOpen() {},
    applyOrientation() {},
    applyPastePanelClose() {},
    applyPastePanelOpen() {},
    applySizePanelClose() {},
    applySizePanelOpen() {},
    applyTimelinePanelClose() {},
    applyTimelinePanelOpen() {},
    applyUndoAction() {},
    applyUndoPanelClose() {},
    applyUndoPanelOpen() {},
    atomeEditFooterState: {},
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
    ensureDetailPanelModule() {},
    ensureFinderPanelModule() {},
    ensureFontPanelModule() {},
    ensureHomePanelModule() {},
    ensureInfoPanelModule() {},
    ensureLayerPanelModule() {},
    ensureMatrixModule() {},
    ensureMoleculeMediaRuntime() {},
    ensurePastePanelModule() {},
    ensureSizePanelModule() {},
    ensureTimelinePanelModule() {},
    ensureToolModule() {},
    ensureUndoPanelModule() {},
    focusFinderPanel() {},
    getAtomeElement() {},
    getAtomeRuntimeState() {},
    installAtomeEditFooterRuntime() {},
    installEveDebugRuntime() {},
    installIntuitionXFlowerContextRuntime() {},
    installSvgDrawRuntime() {},
    installSvgVectorEditRuntime() {},
    installTextStyleToolSelectionGuard() {},
    invokeAtomeEditFooterToolDefinitionWithContext() {},
    isWorkspaceActiveForMainMenu: () => true,
    newMenu: {},
    normalizeAtomeEditFooterKind: (value) => value,
    normalizeAtomeEditFooterToolKey: (value) => value,
    openCanonicalHomePanel() {},
    openInitialLoginSequence() {},
    openWorkspaceDashboardAndMainMenu: async (payload) => {
        workspaceOpenCalls.push(payload);
        return { ok: true };
    },
    panelSurfaceDefinitions: {},
    publishAtomeEditFooterSelection() {},
    readAtomeEditFooterRecordActionBridgeState() {},
    readExplicitLatched() {},
    readSelectionSnapshot() {},
    refreshFinderPanelProjection() {},
    registerAtomeTool() {},
    registerBasicUiToolsRuntime() {},
    registerMainToolAtomes() {},
    registerPanelSurfaceDefinition() {},
    registerPanelUiToolsRuntime() {},
    registerUiAction() {},
    renderAtomeEditFooterToolsIntoRow() {},
    resolveAtomeEditFooterDefaultTools() { return []; },
    resolveAtomeEditFooterKindFromHost() {},
    resolveAtomeEditFooterToolDefinitionsForOptions() { return []; },
    resolveCurrentProjectId() { return 'boot_project_valid'; },
    resolveFlowerContextItems() { return []; },
    setIntuitionItemEnabled() {},
    showAtomeEditFooter() {},
    syncAtomeEditFooterButtonsForToolStateOnRow() {},
    syncMainMenuAuthContent() {},
    syncToolLatchedState() {},
    warmupToolGatewayRuntime() {}
});
assert.deepEqual(workspaceOpenCalls, [], 'workspace boot must wait for a current project before opening menu/dashboard');
window.__currentProject = { id: 'boot_project_valid' };
await new Promise((resolve) => setTimeout(resolve, 120));
assert.deepEqual(workspaceOpenCalls, [
    { source: 'boot_workspace', projectId: 'boot_project_valid' }
], 'workspace boot must retry after auth when the current project is published after the first boot signal');
window.dispatchEvent(new window.CustomEvent('squirrel:project-changed', {
    detail: { id: 'boot_project_valid' }
}));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(workspaceOpenCalls, [
    { source: 'boot_workspace', projectId: 'boot_project_valid' }
], 'workspace boot must open the canonical dashboard/menu path once after project activation');

console.log('user_login_boot_order_contract.test: PASS');
