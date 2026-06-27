import assert from 'node:assert/strict';
import { installMockBrowserEnv } from '../strangler_v2/_env.mjs';
import { createToolGenesisProjectLoadRuntime } from '../../eVe/intuition/runtime/tool_genesis_project_load_runtime.js';

const { window, document } = installMockBrowserEnv();
globalThis.window = window;
globalThis.document = document;

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
const runtime = createToolGenesisProjectLoadRuntime({
    clearProjectLoadInFlightIfCurrent: () => {},
    dispatchProjectRenderDone: () => {},
    emitPerfEvent: () => {},
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
    getAdoleApi: () => ({ atomes: { list: async () => ({ atomes: [] }) } }),
    getProjectLoadInFlight: () => null,
    getRecentProjectCache: () => null,
    getSharedProjectOverride: () => null,
    isAnonymousWorkspace: () => true,
    isRecordDeleted: () => false,
    isRenderableAtome: () => true,
    markProjectLoadCompleted: () => {},
    perfElapsedMs: () => 1,
    perfLog: () => {},
    perfNowMs: () => 0,
    persistenceDiagLog: () => {},
    pickAuthoritativeAtomes: () => [],
    rememberProjectAtomes: () => {},
    renderProjectScene: async ({ records }) => { rendered.push(records); return { ok: true }; },
    resolveAtomeProperties: (record) => record?.properties || {},
    resolveCurrentUserId: () => userId,
    resolveToolShortcutRole: () => false,
    setProjectLoadInFlight: () => {},
    summarizePersistenceRecords: () => []
});

const loaded = await runtime.loadProjectAtomes(projectId, { force: true, staleFirst: false });

assert.deepEqual(loaded.map((record) => record.id || record.atome_id), ['visible_atom']);
assert.deepEqual(rendered.at(-1).map((record) => record.id || record.atome_id), ['visible_atom']);

console.log('project_load_filter_contract.test: PASS');
