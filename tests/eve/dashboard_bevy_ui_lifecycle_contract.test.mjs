import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createDashboardBevyUiRuntime } from '../../eVe/domains/dashboard/dashboard_bevy_ui_runtime.js';
import {
    DASHBOARD_WORKSPACE_PROJECT_ID,
    markProjectWorkspaceMode
} from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { createDashboardOperationLifecycle } from '../../eVe/domains/dashboard/dashboard_lifecycle_runtime.js';

const deferred = () => {
    let resolve;
    const promise = new Promise((next) => { resolve = next; });
    return { promise, resolve };
};

test('a superseded open cannot suspend the current Dashboard generation', async () => {
    const suspended = [];
    let stops = 0;
    const state = {
        active: true, opening: true, closing: false, suspended: false,
        sceneProjectId: 'current_project', environmentWatcher: { stop: () => { stops += 1; } }
    };
    const lifecycle = createDashboardOperationLifecycle({
        state, treeId: 'dashboard', readWorkspaceMode: () => ({ mode: 'dashboard' }),
        uiRuntime: {
            state: { trees: new Map([['dashboard', {}]]) },
            setTreeSuspended: async (input) => { suspended.push(input); }
        }
    });
    const oldToken = lifecycle.beginOpen();
    const currentToken = lifecycle.beginOpen();
    const result = await lifecycle.cancelStaleOpen(oldToken);
    assert.equal(result.cancelled, true);
    assert.equal(state.active, true);
    assert.equal(state.opening, true);
    assert.equal(state.suspended, false);
    assert.equal(stops, 0);
    assert.deepEqual(suspended, []);
    assert.equal(await lifecycle.cancelStaleOpen(currentToken), null);
});

test('closing during the first Dashboard reveal returns cancellation instead of success', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.innerWidth = 1280;
    window.innerHeight = 800;
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
    const mountedTrees = new Map();
    let closed = false;
    const runtime = createDashboardBevyUiRuntime({
        constants: { dashboard: { categories: [] } },
        uiRuntime: {
            state: { trees: mountedTrees },
            mountTree: async ({ id, tree }) => { mountedTrees.set(id, tree); return { ok: true }; },
            unmountTree: async (id) => { mountedTrees.delete(id); return { ok: true }; },
            setTreeSuspended: async () => ({ ok: true }),
            setTreeOpacity: async () => {
                if (!closed) { closed = true; await runtime.close(); }
                return { ok: true };
            },
            readDiagnostics: () => ({ mounted_nodes: mountedTrees.size })
        }
    });
    const result = await runtime.open({ sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID });
    assert.equal(closed, true);
    assert.equal(result.cancelled, true);
    assert.equal(runtime.state.active, false);
    await runtime.destroy();
});

test('a project transition cancels an in-flight Dashboard open before it can remount', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.innerWidth = 1280;
    window.innerHeight = 800;

    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
    const canvas = document.createElement('canvas');
    canvas.id = 'eve_surface_project';
    canvas.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800
    });
    view.appendChild(canvas);

    const calendarGate = deferred();
    let calendarLoadStarted = false;
    const mountedTrees = new Map();
    const uiRuntime = {
        state: { trees: mountedTrees },
        mountTree: async ({ id, tree }) => {
            mountedTrees.set(id, tree);
            return { ok: true };
        },
        unmountTree: async (id) => {
            mountedTrees.delete(id);
            return { ok: true };
        },
        setTreeSuspended: async () => ({ ok: true }),
        readDiagnostics: () => ({ mounted_nodes: mountedTrees.size })
    };
    const runtime = createDashboardBevyUiRuntime({
        adapters: { listMany: async () => new Map([['calendar', []]]) },
        constants: {
            dashboard: {
                categories: [
                    { id: 'calendar', label_key: 'Calendar', icon_id: 'calendar', color_family: 'blue', order: 1, data_source: 'calendar' }
                ]
            }
        },
        calendarApiLoader: async () => {
            calendarLoadStarted = true;
            return calendarGate.promise;
        },
        uiRuntime
    });

    const opening = runtime.open({
        sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID,
        dataProjectId: 'project_alpha'
    });
    for (let attempt = 0; attempt < 20 && !calendarLoadStarted; attempt += 1) {
        await Promise.resolve();
    }
    assert.equal(calendarLoadStarted, true, 'the open must be suspended at its asynchronous Calendar boundary');

    markProjectWorkspaceMode('project_alpha');
    await runtime.destroy();
    calendarGate.resolve({ on: () => () => {} });
    const result = await opening;

    assert.equal(result.cancelled, true, 'the stale Dashboard open must report cancellation');
    assert.equal(runtime.state.active, false);
    assert.equal(runtime.state.suspended, false);
    assert.equal(mountedTrees.has('dashboard_bevy_ui'), false, 'the stale open must not remount over the project');
    assert.equal(window.__eveWorkspaceMode.mode, 'project');
    assert.equal(window.__eveWorkspaceMode.projectId, 'project_alpha');
});

test('neutral Dashboard loads personal Calendar data before the next user project exists', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.innerWidth = 1280;
    window.innerHeight = 800;

    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
    const canvas = document.createElement('canvas');
    canvas.id = 'eve_surface_project';
    canvas.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800
    });
    view.appendChild(canvas);

    const requests = [];
    const mountedTrees = new Map();
    const runtime = createDashboardBevyUiRuntime({
        adapters: {
            listMany: async (categoriesToLoad, { projectId } = {}) => {
                const categoryIds = categoriesToLoad.map((category) => category.id);
                requests.push({ categoryIds, projectId });
                if (categoryIds.includes('calendar') && projectId === DASHBOARD_WORKSPACE_PROJECT_ID) {
                    throw new Error('dashboard_category_load_failed:calendar:dashboard_calendar_project_required');
                }
                return new Map(categoryIds.map((categoryId) => [categoryId, []]));
            }
        },
        calendarApiLoader: async () => ({ on: () => () => {} }),
        constants: {
            dashboard: {
                categories: [
                    { id: 'calendar', label_key: 'Calendar', color_family: 'blue', order: 1, data_source: 'calendar' }
                ]
            }
        },
        uiRuntime: {
            state: { trees: mountedTrees },
            mountTree: async ({ id, tree }) => {
                mountedTrees.set(id, tree);
                return { ok: true };
            },
            unmountTree: async (id) => {
                mountedTrees.delete(id);
                return { ok: true };
            },
            setTreeOpacity: async () => ({ ok: true }),
            setTreeSuspended: async () => ({ ok: true }),
            readDiagnostics: () => ({ mounted_nodes: mountedTrees.size })
        }
    });

    const opened = await runtime.open({
        sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID,
        dataProjectId: DASHBOARD_WORKSPACE_PROJECT_ID
    });
    if (runtime.state.postOpenHydrationPromise) await runtime.state.postOpenHydrationPromise;
    assert.equal(opened.ok, true);
    assert.deepEqual(requests, [{ categoryIds: ['calendar'], projectId: null }], 'neutral workspace reads account events without a renderer project id');
    requests.length = 0;

    await runtime.open({
        sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID,
        dataProjectId: 'next_user_project',
        refresh: true,
        preserveMountedTree: true
    });
    if (runtime.state.postOpenHydrationPromise) await runtime.state.postOpenHydrationPromise;
    assert.deepEqual(requests, [{ categoryIds: ['calendar'], projectId: 'next_user_project' }]);
    await runtime.destroy();
});

test('Dashboard keeps one minute-aligned clock timer and releases it across lifecycle boundaries', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window;
    globalThis.document = document;
    window.innerWidth = 900;
    window.innerHeight = 720;
    const view = document.createElement('div');
    view.id = 'view';
    document.body.appendChild(view);
    const canvas = document.createElement('canvas');
    canvas.id = 'eve_surface_project';
    canvas.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 720, width: 900, height: 720
    });
    view.appendChild(canvas);

    const NativeDate = globalThis.Date;
    let currentTime = '2026-09-17T10:00:59.900';
    globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [currentTime])); }
        static now() { return new NativeDate(currentTime).getTime(); }
    };
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const timers = new Map();
    let timerId = 0;
    window.setTimeout = (callback, delay) => {
        timerId += 1;
        timers.set(timerId, { callback, delay });
        return timerId;
    };
    window.clearTimeout = (id) => timers.delete(id);

    const mountedTrees = new Map();
    const findNode = (target, id) => {
        if (target?.id === id) return target;
        for (const child of target?.children || []) {
            const match = findNode(child, id);
            if (match) return match;
        }
        return null;
    };
    const runtime = createDashboardBevyUiRuntime({
        constants: { dashboard: { categories: [
            { id: 'calendar', label_key: 'Calendar', icon_id: 'calendar', color_family: 'blue', order: 1, data_source: 'calendar' }
        ] } },
        adapters: { listMany: async () => new Map([['calendar', []]]) },
        calendarApiLoader: async () => ({ on: () => () => {} }),
        uiRuntime: {
            state: { trees: mountedTrees },
            mountTree: async ({ id, tree }) => { mountedTrees.set(id, { tree }); return { ok: true }; },
            unmountTree: async (id) => { mountedTrees.delete(id); return { ok: true }; },
            setTreeOpacity: async () => ({ ok: true }),
            setTreeSuspended: async () => ({ ok: true }),
            cancelTreeRender: () => {},
            readDiagnostics: () => ({ mounted_nodes: mountedTrees.size })
        }
    });
    try {
        await runtime.open({ sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID, dataProjectId: 'clock_project' });
        assert.equal(timers.size, 1);
        const firstTimer = [...timers.values()][0];
        assert.equal(firstTimer.delay, 125);
        const before = findNode(runtime.state.tree.root, '__eve_dashboard_card_clock_time_calendar_dashboard_module_clock').text;

        timers.clear();
        currentTime = '2026-09-17T10:01:00.010';
        firstTimer.callback();
        for (let attempt = 0; attempt < 10 && timers.size === 0; attempt += 1) await Promise.resolve();
        const after = findNode(runtime.state.tree.root, '__eve_dashboard_card_clock_time_calendar_dashboard_module_clock').text;
        assert.notEqual(after, before);
        assert.equal(timers.size, 1, 'clock refresh must rearm exactly one timer');

        await runtime.close();
        assert.equal(timers.size, 0, 'close must release the clock timer');
        await runtime.open({ sceneProjectId: DASHBOARD_WORKSPACE_PROJECT_ID, dataProjectId: 'clock_project' });
        assert.equal(timers.size, 1, 'reopen must create exactly one clock timer');
        await runtime.destroy();
        assert.equal(timers.size, 0, 'destroy must release the clock timer');
    } finally {
        globalThis.Date = NativeDate;
        window.setTimeout = nativeSetTimeout;
        window.clearTimeout = nativeClearTimeout;
    }
});

test('Dashboard presents interactive structure before data and rejects hydration from a closed opening', async () => {
    const { window, document } = installMockBrowserEnv();
    globalThis.window = window; globalThis.document = document;
    window.innerWidth=1000; window.innerHeight=700;
    const view=document.createElement('div'); view.id='view'; document.body.appendChild(view);
    const mountedTrees=new Map(); let mounts=0;
    const uiRuntime={state:{trees:mountedTrees},
        mountTree:async ({id,tree})=>{mountedTrees.set(id,tree); mounts+=1;},
        unmountTree:async id=>mountedTrees.delete(id),
        setTreeOpacity:async()=>({ok:true}),setTreeSuspended:async()=>({ok:true}),
        readDiagnostics:()=>({mounted_nodes:mountedTrees.size})};
    const old=deferred(); let calls=0;
    const runtime=createDashboardBevyUiRuntime({uiRuntime,
        constants:{dashboard:{categories:[{id:'projects',label_key:'Projects',icon_id:'projects',color_family:'green',order:1,data_source:'projects'}]}},
        adapters:{listMany:async()=>++calls===1?old.promise:new Map([['projects',[{id:'new_project',title:'Current'}]]])}});
    await runtime.open({sceneProjectId:DASHBOARD_WORKSPACE_PROJECT_ID,dataProjectId:'p'});
    const oldTask=runtime.state.postOpenHydrationPromise;
    assert.ok(mountedTrees.has('dashboard_bevy_ui'), 'unresolved data must not block presentation');
    const toggle = mountedTrees.get('dashboard_bevy_ui').root.children.find(node => node.id === '__eve_dashboard_sidebar_toggle');
    assert.equal(typeof toggle?.on?.activate, 'function', 'unresolved data must not block the native sidebar control');
    assert.equal(runtime.state.actionHitsByNodeId.has('__eve_dashboard_header_bg_projects'), false, 'collapsed headers must not intercept input');
    await runtime.close();
    await runtime.open({sceneProjectId:DASHBOARD_WORKSPACE_PROJECT_ID,dataProjectId:'p'});
    await runtime.state.postOpenHydrationPromise;
    assert.equal(runtime.state.itemsByCategory.get('projects')?.[0]?.id,'new_project');
    const before=mounts;
    old.resolve(new Map([['projects',[{id:'old_project',title:'Obsolete'}]]]));
    await oldTask;
    assert.equal(runtime.state.itemsByCategory.get('projects')?.[0]?.id,'new_project');
    assert.equal(mounts,before,'an obsolete request must not repaint');
    await runtime.destroy();
});
