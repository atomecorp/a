import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Script } from 'node:vm';

// Run the actual backend and runtime resolver; replace only the WASM boundary
// and hardware/browser device APIs. No native device or network is contacted.
const compiled = await build({
    entryPoints: ['atome/src/application/audio_runtime/backend.kira.js'],
    bundle: true, write: false, platform: 'browser', format: 'iife',
    plugins: [{ name: 'audio-device-fixture', setup(builder) {
        builder.onResolve({ filter: /^\/wasm\/squirrel_audio_wasm\.js$/ }, () => ({ path: 'fixture', namespace: 'fixture-wasm' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture-wasm' }, () => ({ contents: `
            export function initSync() { globalThis.probe.modules++; }
            export function audio_init() { globalThis.probe.managers++; }
            export function audio_shared_context() { return { destination: { maxChannelCount: 8 } }; }
        ` }));
    } }]
});
const settle = () => new Promise(resolve => setImmediate(resolve));
const setup = async (runtime) => {
    let backend;
    const probe = { modules: 0, managers: 0, nativeCalls: [], errors: [], enumerations: 0 };
    const audio = { __register_backend: (_key, value) => { backend = value; }, set_backend() {},
        __emit: (_name, event) => probe.errors.push(event) };
    const invoke = async (command) => {
        probe.nativeCalls.push(command);
        if (command === 'audio_mix_devices') return { devices: { outputs: [{ id: 'native', channels: 2 }], inputs: [] } };
        return { success: true };
    };
    const window = { Squirrel: { av: { audio } }, WebAssembly,
        navigator: { mediaDevices: { enumerateDevices: async () => {
            probe.enumerations++; return [{ kind: 'audioinput', deviceId: 'mic', label: 'Test input' }];
        } } },
        ...(runtime === 'tauri' ? { __TAURI_INTERNALS__: { invoke } } : {}),
        ...(runtime === 'ios' ? { __HOST_ENV: 'app', __ATOME_IOS_NATIVE_INVOKE: invoke } : {})
    };
    new Script(compiled.outputFiles[0].text).runInNewContext({ window, probe, console, WebAssembly,
        fetch: async (url) => {
            assert.equal(url, '/wasm/squirrel_audio_wasm_bg.wasm');
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
        } });
    await settle();
    return { backend, probe };
};

const web = await setup('web');
assert.equal(web.probe.modules, 1, 'the existing prewarm compiled the module');
assert.equal(web.probe.managers, 0, 'prewarm does not create an audio manager');
const devices = await web.backend.mix_output_devices();
assert.equal(devices.inputs[0].id, 'mic');
assert.equal(web.probe.enumerations, 1);
assert.equal(web.probe.managers, 0, 'device discovery does not unlock audio');
assert.deepEqual(web.probe.nativeCalls, []);
for (const runtime of ['tauri', 'ios']) {
    const native = await setup(runtime);
    const devices = await native.backend.mix_output_devices();
    assert.equal(devices.outputs[0].id, 'native');
    assert.equal(native.probe.enumerations, 0);
    assert.equal(native.probe.modules, 0);
    assert.equal(native.probe.nativeCalls.filter(name => name === 'audio_mix_devices').length, 1);
}
console.log('Kira device enumeration: cold Web discovery and both native routes pass.');
