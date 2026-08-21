import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createImplicitGestureCommitRuntime } from '../../eVe/intuition/runtime/implicit_gesture_commit_runtime.js';
import { createProjectAtomeIndexRuntime } from '../../eVe/intuition/runtime/project_atome_index_runtime.js';
import {
    implicitGestureCommitSource,
    toolGenesisCoreServicesSource,
    toolGenesisMutationSource,
    toolGenesisSource
} from './project_render_legacy_audit_fixture.mjs';

test('tool genesis delegates implicit gesture commit ownership outside the legacy runtime', () => {
    assert.ok(toolGenesisSource.includes("from './tool_genesis_core_services_runtime.js'"));
    assert.ok(toolGenesisCoreServicesSource.includes("from './tool_genesis_mutation_runtime.js'"));
    assert.ok(toolGenesisMutationSource.includes("from './implicit_gesture_commit_runtime.js'"));
    assert.ok(implicitGestureCommitSource.includes('createImplicitGestureCommitRuntime'));
    assert.ok(implicitGestureCommitSource.includes('implicitGesturePhaseGuard'));
    assert.ok(implicitGestureCommitSource.includes('resolveImplicitGestureDispatch'));
    assert.ok(implicitGestureCommitSource.includes('dispatchImplicitGestureBatch'));
    assert.equal(toolGenesisSource.includes('const IMPLICIT_GESTURE_KIND_TO_PHASE ='), false);
    assert.equal(toolGenesisSource.includes('const implicitGesturePhaseGuard ='), false);
    assert.equal(toolGenesisSource.includes('const implicitGestureFailureGuard ='), false);
    assert.equal(toolGenesisSource.includes('const resolveImplicitGestureDispatch ='), false);
    assert.equal(toolGenesisSource.includes('const dispatchImplicitGestureBatch ='), false);
});

test('implicit gesture commit runtime routes gestures through the tool gateway and falls back to commitBatch', async () => {
    const gatewayPayloads = [];
    const selfPatches = [];
    const commitBatches = [];
    let timestamp = 1000;
    const runtime = createImplicitGestureCommitRuntime({
        invokeToolGateway: async (payload) => {
            gatewayPayloads.push(payload);
            return { ok: true };
        },
        buildFingerprint: (props) => JSON.stringify(props),
        rememberSelfPatch: (atomeId, fingerprint) => selfPatches.push({ atomeId, fingerprint }),
        getWindow: () => ({
            Atome: {
                commitBatch: async (events, options) => commitBatches.push({ events, options })
            }
        }),
        now: () => timestamp
    });

    const gestureEvents = [{
        kind: 'gesture_end',
        atome_id: 'shape_a',
        tx_id: 'tx_a',
        payload: {
            meta: { action: 'resize', gesture_id: 'gesture_a' },
            props: { width: '120px', height: '80px' }
        }
    }];
    runtime.emitCommitBatch(gestureEvents, { source: 'probe' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(gatewayPayloads.length, 1);
    assert.equal(gatewayPayloads[0].tool_id, 'ui.resize');
    assert.equal(gatewayPayloads[0].action, 'resize.end');
    assert.equal(gatewayPayloads[0].input.atome_id, 'shape_a');
    assert.deepEqual(gatewayPayloads[0].input.items, [{
        atome_id: 'shape_a',
        props: { width: '120px', height: '80px' }
    }]);
    assert.deepEqual(selfPatches, [{
        atomeId: 'shape_a',
        fingerprint: JSON.stringify({ width: '120px', height: '80px' })
    }]);

    runtime.emitCommitBatch(gestureEvents);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(gatewayPayloads.length, 1);

    timestamp += 100;
    runtime.emitCommitBatch([{ kind: 'set', atome_id: 'shape_b', payload: { props: { left: '10px' } } }], {
        refreshState: false
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(commitBatches.length, 1);
    assert.equal(commitBatches[0].events[0].atome_id, 'shape_b');
    assert.deepEqual(commitBatches[0].options, { refreshState: false });
});

test('project atome index runtime remembers caches and clears scoped project state', () => {
    const clearedHosts = [];
    const clearedScenes = [];
    let clearedAllScenes = 0;
    let clearedAllHosts = 0;
    const runtime = createProjectAtomeIndexRuntime({
        normalizeAtomeRecord: (record) => ({
            id: record?.atome_id || record?.id || null
        }),
        clearProjectScene: (projectId) => clearedScenes.push(projectId),
        clearAllProjectScenes: () => { clearedAllScenes += 1; },
        clearRenderedAtomeHost: (atomeId) => clearedHosts.push(atomeId),
        clearAllRenderedAtomeHosts: () => { clearedAllHosts += 1; },
        dedupWindowMs: 500
    });

    const records = [{ atome_id: 'shape_a' }, { id: 'text_b' }];
    runtime.rememberProjectAtomes('project_a', records);
    assert.equal(runtime.isAtomeInProjectIndex('project_a', 'shape_a'), true);
    assert.equal(runtime.isAtomeInProjectIndex('project_a', 'missing'), false);
    assert.notEqual(runtime.getRememberedProjectAtomes('project_a'), records);

    runtime.markProjectLoadCompleted('project_a', 1000);
    assert.deepEqual(runtime.getRecentProjectCache('project_a', 1200), records);
    assert.equal(runtime.getRecentProjectCache('project_a', 1601), null);

    const task = Promise.resolve([]);
    runtime.setProjectLoadInFlight('project_a', task);
    assert.equal(runtime.getProjectLoadInFlight('project_a'), task);
    runtime.clearProjectLoadInFlightIfCurrent('project_a', Promise.resolve([]));
    assert.equal(runtime.getProjectLoadInFlight('project_a'), task);
    runtime.clearProjectLoadInFlightIfCurrent('project_a', task);
    assert.equal(runtime.getProjectLoadInFlight('project_a'), undefined);

    runtime.clearProjectIndex('project_a');
    assert.deepEqual(clearedHosts, ['shape_a', 'text_b']);
    assert.deepEqual(clearedScenes, ['project_a']);

    runtime.rememberProjectAtomes('project_b', [{ id: 'shape_c' }]);
    runtime.clearProjectIndex();
    assert.equal(clearedAllScenes, 1);
    assert.equal(clearedAllHosts, 1);
});
