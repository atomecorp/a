import assert from 'node:assert/strict';
import {
    isStrictNativeKiraPlaybackRuntime,
    resolveAudioRuntime,
    resolveNativeMediaLocalPathFromObject
} from './runtime_audio_backend.js';

const iosEnv = {
    __HOST_ENV: 'app',
    __ATOME_IOS_NATIVE_INVOKE: async () => ({ success: true }),
    location: { protocol: 'https:', hostname: 'localhost' }
};
const iosRuntime = resolveAudioRuntime(iosEnv);
assert.equal(iosRuntime.runtime, 'ios_app');
assert.equal(iosRuntime.playback, 'ios_native_kira');
assert.equal(iosRuntime.native_kira_required, true);
assert.equal(isStrictNativeKiraPlaybackRuntime(iosEnv), true);

const tauriEnv = {
    __TAURI__: { core: { invoke: async () => ({ success: true }) } },
    location: { protocol: 'tauri:', hostname: 'tauri.localhost' }
};
const tauriRuntime = resolveAudioRuntime(tauriEnv);
assert.equal(tauriRuntime.runtime, 'tauri_native');
assert.equal(tauriRuntime.playback, 'tauri_native_kira');
assert.equal(tauriRuntime.native_kira_required, true);
assert.equal(isStrictNativeKiraPlaybackRuntime(tauriEnv), true);

const webEnv = {
    WebAssembly,
    navigator: { mediaDevices: {} },
    location: { protocol: 'https:', hostname: 'example.test' }
};
const webRuntime = resolveAudioRuntime(webEnv);
assert.equal(webRuntime.runtime, 'web');
assert.equal(webRuntime.playback, 'web_wasm_kira');
assert.equal(isStrictNativeKiraPlaybackRuntime(webEnv), false);

assert.equal(
    resolveNativeMediaLocalPathFromObject({
        meta: {
            nativeAudioPath: 'data/users/u1/recordings/movie.mov'
        }
    }),
    'data/users/u1/recordings/movie.mov'
);
assert.equal(
    resolveNativeMediaLocalPathFromObject({
        extras: {
            meta: {
                filePath: 'http://127.0.0.1:3000/api/recordings/take.mov?token=x'
            }
        }
    }),
    ''
);
assert.equal(
    resolveNativeMediaLocalPathFromObject({
        file_path: '/Users/test/Library/Application Support/squirrel/Uploads/imported.mov'
    }),
    '/Users/test/Library/Application Support/squirrel/Uploads/imported.mov'
);
assert.equal(
    resolveNativeMediaLocalPathFromObject({
        native_audio_path: 'atome:///api/uploads/imported.mov'
    }),
    ''
);

console.log('runtime_audio_backend.strict_native.test: PASS');
