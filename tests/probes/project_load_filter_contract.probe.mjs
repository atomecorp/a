import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';

const { window, document } = installMockBrowserEnv();
globalThis.window = window;
globalThis.document = document;
const { createToolGenesisProjectLoadRuntime } = await import(
    '../../eVe/intuition/runtime/tool_genesis_project_load_runtime.js'
);

const projectId = 'project_filter_valid';
const userId = 'user_filter_valid';
const view = document.createElement('div');
view.id = 'view';
document.body.appendChild(view);

window.Atome = {
    listStateCurrent: async () => [
        {
            id: userId,
            atome_id: userId,
            type: 'generic',
            project_id: projectId,
            owner_id: userId,
            properties: {
                username: 'anonymous',
                phone: '999',
                current_project_id: projectId,
                currentProjectId: projectId
            }
        },
        {
            id: 'visible_atom',
            atome_id: 'visible_atom',
            type: 'shape',
            project_id: projectId,
            owner_id: userId,
            properties: { kind: 'shape', width: 20, height: 20 }
        }
    ]
};

const rendered = [];
let restoreCount = 0;
let prefetchCount = 0;
let remoteListCount = 0;
const perfEvents = [];
const runtime = createToolGenesisProjectLoadRuntime({
    clearProjectLoadInFlightIfCurrent: () => {},
    dispatchProjectRenderDone: () => {},
    emitPerfEvent: (name, detail) => { perfEvents.push({ name, detail }); },
    ensureProjectLayer: (id) => {
        let layer = document.getElementById(`project_view_${id}`);
        if (!layer) {
            layer = document.createElement('div');
            layer.id = `project_view_${id}`;
            layer.getBoundingClientRect = () => ({ x: 0, y: 0, width: 800, height: 600 });
            view.appendChild(layer);
        }
        return layer;
    },
    fetchSharedOverrideAtomes: async () => [],
    filterAtomesByOwner: (records) => records,
    getAdoleApi: () => ({ atomes: { list: async () => {
        remoteListCount += 1;
        return { atomes: [{
            id: 'remote_atom',
            atome_id: 'remote_atom',
            type: 'shape',
            project_id: projectId,
            owner_id: userId,
            properties: { kind: 'shape', width: 10, height: 10 }
        }] };
    } } }),
    getProjectLoadInFlight: () => null,
    getRecentProjectCache: () => null,
    getSharedProjectOverride: () => null,
    isAnonymousWorkspace: () => true,
    isRecordDeleted: () => false,
    isRenderableAtome: () => true,
    markProjectLoadCompleted: () => {},
    perfElapsedMs: () => 1,
    perfNowMs: () => 0,
    pickAuthoritativeAtomes: (result) => result?.atomes || [],
    rememberProjectAtomes: () => {},
    renderProjectScene: async ({ records }) => { rendered.push(records); return { ok: true }; },
    resolveAtomeProperties: (record) => record?.properties || {},
    resolveCurrentUserId: () => userId,
    resolveToolShortcutRole: () => false,
    setProjectLoadInFlight: () => {},
    prefetchViewMode: () => { prefetchCount += 1; return Promise.resolve('list'); },
    restoreViewModeAfterLoad: () => { restoreCount += 1; }
});

const nonBlockingStart = Date.now();
const loaded = await runtime.loadProjectAtomes(projectId, { force: true, staleFirst: false });
assert.ok(Date.now() - nonBlockingStart < 120, 'project load must not await view projection restoration');

assert.deepEqual(loaded.map((record) => record.id || record.atome_id), ['remote_atom', 'visible_atom']);
assert.deepEqual(rendered.at(-1).map((record) => record.id || record.atome_id), ['remote_atom', 'visible_atom']);
assert.equal(rendered.length, 2, 'local quick paint and authoritative merged paint are both exercised');
assert.equal(restoreCount, 1, 'local and final project paints must restore the project view exactly once');

const remoteCountBeforeStaleFirst = remoteListCount;
const restoreCountBeforeStaleFirst = restoreCount;
const prefetchCountBeforeStaleFirst = prefetchCount;
rendered.length = 0;
window.__eveBootPresentationReady = true;
const locallyPresented = await runtime.loadProjectAtomes(projectId, { force: true, staleFirst: true });
assert.deepEqual(locallyPresented.map((record) => record.id || record.atome_id), ['visible_atom']);
assert.equal(rendered.length, 1, 'stale-first boot must project the canonical local scene only once before presentation');
assert.equal(remoteListCount, remoteCountBeforeStaleFirst, 'stale-first boot must not start remote synchronization before presentation');
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(remoteListCount, remoteCountBeforeStaleFirst + 1, 'presentation must schedule one authoritative refresh');
assert.equal(restoreCount, restoreCountBeforeStaleFirst + 1, 'the authoritative refresh must not restore the view mode a second time');
assert.equal(prefetchCount, prefetchCountBeforeStaleFirst + 1, 'the authoritative refresh must reuse the prepared view mode');
assert.equal(
    perfEvents.some(({ name, detail }) => name === 'atomes.load_project' && detail?.mode === 'stale_first_local'),
    true,
    'stale-first local completion must be separately observable'
);

const raceRenders = [];
const racePerfEvents = [];
window.Atome = {
    listStateCurrent: () => new Promise((resolve) => setTimeout(() => resolve([{
        id: 'late_local_atom',
        atome_id: 'late_local_atom',
        type: 'shape',
        project_id: projectId,
        owner_id: userId,
        properties: { kind: 'shape', width: 20, height: 20 }
    }]), 105))
};
const raceRuntime = createToolGenesisProjectLoadRuntime({
    clearProjectLoadInFlightIfCurrent: () => {},
    dispatchProjectRenderDone: () => {},
    emitPerfEvent: (name, detail) => { racePerfEvents.push({ name, detail }); },
    ensureProjectLayer: () => view,
    fetchSharedOverrideAtomes: async () => [],
    filterAtomesByOwner: (records) => records,
    getAdoleApi: () => ({ atomes: { list: async () => ({ atomes: [{
        id: 'authoritative_atom',
        atome_id: 'authoritative_atom',
        type: 'shape',
        project_id: projectId,
        owner_id: userId,
        properties: { kind: 'shape', width: 10, height: 10 }
    }] }) } }),
    getProjectLoadInFlight: () => null,
    getRecentProjectCache: () => null,
    getSharedProjectOverride: () => null,
    isAnonymousWorkspace: () => true,
    isRecordDeleted: () => false,
    isRenderableAtome: () => true,
    markProjectLoadCompleted: () => {},
    perfElapsedMs: () => 1,
    perfNowMs: () => 0,
    pickAuthoritativeAtomes: (result) => result?.atomes || [],
    rememberProjectAtomes: () => {},
    renderProjectScene: async ({ records }) => {
        raceRenders.push(records.map((record) => record.id || record.atome_id));
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: true };
    },
    resolveAtomeProperties: (record) => record?.properties || {},
    resolveCurrentUserId: () => userId,
    resolveToolShortcutRole: () => false,
    setProjectLoadInFlight: () => {},
    prefetchViewMode: () => Promise.resolve('list'),
    restoreViewModeAfterLoad: () => {}
});

await raceRuntime.loadProjectAtomes(projectId, { force: true, staleFirst: false });
assert.deepEqual(raceRenders, [['authoritative_atom']], 'late local state must not start a redundant render after the authoritative render begins');
assert.equal(
    racePerfEvents.some(({ name, detail }) => name === 'atomes.load_project' && detail?.skippedLateLocalRender === true),
    true,
    'the skipped late-local render must remain observable'
);

console.log('project_load_filter_contract.test: PASS');
