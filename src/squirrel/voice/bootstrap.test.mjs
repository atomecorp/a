import assert from 'node:assert/strict';

import { createGlobalVoiceApi, ensureVoiceBridgeModules } from './bootstrap.js';

const imported = [];
const env = {
    location: {
        protocol: 'tauri:',
        hostname: 'tauri.localhost'
    },
    __TAURI_INTERNALS__: {
        invoke() {}
    },
    console: {
        warn() {}
    }
};

const importModule = async (path) => {
    imported.push(path);
    if (path.endsWith('tauri_audio_bridge.js')) {
        env.__toDSP = () => {};
    }
    if (path.endsWith('record_audio_api.js')) {
        env.record_start = async ({ sessionId }) => sessionId;
        env.record_stop = async (sessionId) => ({ session_id: sessionId, ok: true });
    }
    if (path.endsWith('stt_api.js')) {
        env.__TAURI__ = env.__TAURI__ || {};
        env.__TAURI__.stt = {
            async start() {},
            async stop() {}
        };
    }
    return {};
};

const loaded = await ensureVoiceBridgeModules({
    env,
    importModule
});
assert.deepEqual(loaded, ['tauri_audio_bridge', 'record_audio_api', 'stt_api'], 'voice bootstrap should load the missing Tauri bridge modules in order');
assert.equal(typeof env.__toDSP, 'function', 'voice bootstrap should expose __toDSP after loading the Tauri bridge');
assert.equal(typeof env.record_start, 'function', 'voice bootstrap should expose record_start after loading the recorder API');
assert.equal(typeof env.record_stop, 'function', 'voice bootstrap should expose record_stop after loading the recorder API');
assert.equal(typeof env.__TAURI__.stt.start, 'function', 'voice bootstrap should expose the Tauri STT bridge when missing');

const api = createGlobalVoiceApi({
    env,
    importModule
});
assert.equal(env.Squirrel.voice, api, 'voice bootstrap should expose a global Squirrel voice API');
assert.equal(env.atome.voice, api, 'voice bootstrap should expose a global atome voice API');
assert.equal(env.atome.tools.voice, api, 'voice bootstrap should expose the voice API under atome.tools');

const service = await api.ensureReady();
assert.equal(api.service, service, 'voice bootstrap should memoize the initialized voice service');
assert.equal(api.providers.capture.selected, 'iplug_native_recorder', 'voice bootstrap should resolve the Tauri recorder backend after bridge loading');
assert.equal(api.providers.stt.selected, 'tauri_plugin_stt', 'voice bootstrap should resolve the native Tauri STT backend after bridge loading');

console.log('voice_bootstrap: ok');
