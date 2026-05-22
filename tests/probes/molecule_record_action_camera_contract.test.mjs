import assert from 'node:assert/strict';

const state = {};
let bridgeState = {};
let armedState = null;

const { createApiRecordActionRuntime } = await import('../../eVe/domains/mtrax/api/api_record_action_runtime.js');
const { normalizeRecordActionMode, writeRecordActionState } = await import('../../eVe/intuition/tools/core/record_action_state.js');

globalThis.window = {};

const runtime = createApiRecordActionRuntime({
    getState: () => state,
    ensureUi: () => {},
    parseBooleanLike: (value, fallback) => {
        if (value === true || value === 'true' || value === 1 || value === '1') return true;
        if (value === false || value === 'false' || value === 0 || value === '0') return false;
        return fallback;
    },
    readRecordActionBridgeState: () => bridgeState,
    normalizeRecordActionMode,
    writeRecordActionState: (value) => {
        bridgeState = writeRecordActionState(value);
        return bridgeState;
    },
    syncRecordActionArmedState: (active) => {
        armedState = active;
    },
    buildApiRecordActionState: () => bridgeState
});

const result = runtime.apiSetRecordAction({
    active: true,
    mode: 'media',
    source: 'video',
    camera_position: 'back'
});

assert.equal(result.ok, true);
assert.equal(armedState, true);
assert.equal(bridgeState.camera_position, 'back');
assert.equal(state.mediaRecordCameraPosition, 'back');

runtime.apiSetRecordAction({
    active: true,
    mode: 'media',
    source: 'video',
    camera_position: 'front'
});

assert.equal(bridgeState.camera_position, 'front');
assert.equal(state.mediaRecordCameraPosition, 'front');

runtime.apiSetRecordAction({
    active: false,
    mode: 'media',
    source: null
});

assert.equal(bridgeState.camera_position, null);
assert.equal(state.mediaRecordCameraPosition, null);

console.log('molecule_record_action_camera_contract.test: PASS');
