import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window } = installMockBrowserEnv();
globalThis.CustomEvent = window.CustomEvent;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
globalThis.$ = window.$ = (tag, options = {}) => {
    const node = window.document.createElement(tag);
    if (options.id) node.id = options.id;
    if (options.text != null) node.textContent = String(options.text);
    if (options.css) Object.assign(node.style, options.css);
    if (options.attrs) Object.entries(options.attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    const parent = typeof options.parent === 'string'
        ? window.document.querySelector(options.parent)
        : options.parent;
    parent?.appendChild(node);
    return node;
};

const { createUserHomePanelRuntime } = await import('../../eVe/intuition/tools/user_home_panel_runtime.js');

let failure = null;
window.addEventListener('eve:workspace-open-failed', (event) => { failure = event.detail; });

const runtime = createUserHomePanelRuntime({
    getAdoleApi: () => ({
        security: {
            isAnonymous: () => false,
            startGuest: async () => ({ ok: true, user: { id: 'qa_guest' } })
        }
    }),
    openWorkspace: async () => ({ ok: false, phase: 'project_bootstrap', error: 'qa_dashboard_failed' }),
    ensureCurrentProject: async () => null,
    cleanupWorkspace() {}
});

const result = await runtime.enterAnonymousWorkspace();
assert.deepEqual(result, { ok: false, error: 'qa_dashboard_failed' });
assert.deepEqual(failure, { source: 'anonymous', cause: 'qa_dashboard_failed' });
assert.equal(runtime.isHomePanelOpen(), true, 'login choices must be restored instead of leaving a blank canvas');

let timeoutFailure = null;
let cleanupCalls = 0;
window.addEventListener('eve:workspace-open-failed', (event) => { timeoutFailure = event.detail; });
const pendingWorkspace = new Promise(() => {});
const timeoutRuntime = createUserHomePanelRuntime({
    getAdoleApi: () => ({
        security: {
            isAnonymous: () => false,
            startGuest: async () => ({ ok: true, user: { id: 'qa_guest_timeout' } })
        }
    }),
    openWorkspace: () => pendingWorkspace,
    ensureCurrentProject: async () => null,
    cleanupWorkspace: async () => { cleanupCalls += 1; },
    anonymousWorkspaceOpenTimeoutMs: 1
});

const timeoutResult = await timeoutRuntime.enterAnonymousWorkspace();
assert.deepEqual(timeoutResult, { ok: false, error: 'anonymous_workspace_presentation_timeout' });
assert.deepEqual(timeoutFailure, { source: 'anonymous', cause: 'anonymous_workspace_presentation_timeout' });
assert.equal(cleanupCalls, 1, 'failed guest presentation must clear its partial workspace');
assert.equal(timeoutRuntime.isHomePanelOpen(), true, 'a stalled guest presentation must restore login choices');

let startCleanupCalls = 0;
const startTimeoutRuntime = createUserHomePanelRuntime({
    getAdoleApi: () => ({
        security: {
            isAnonymous: () => false,
            startGuest: () => new Promise(() => {})
        }
    }),
    openWorkspace: async () => ({ ok: true }),
    ensureCurrentProject: async () => null,
    cleanupWorkspace: async () => { startCleanupCalls += 1; },
    anonymousWorkspaceOpenTimeoutMs: 1
});

const startTimeoutResult = await startTimeoutRuntime.enterAnonymousWorkspace();
assert.deepEqual(startTimeoutResult, { ok: false, error: 'anonymous_session_start_timeout' });
assert.equal(startCleanupCalls, 1, 'stalled guest creation must clear any partial workspace');
assert.equal(startTimeoutRuntime.isHomePanelOpen(), true, 'a stalled guest creation must restore login choices');

console.log('guest_workspace_failure_recovers_login: PASS');
