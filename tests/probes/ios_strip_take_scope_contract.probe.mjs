// R-247: on the iPhone a Timeline take is a strip take (R-183, `audio_record_strip_start`), which the engine records on
// its own: no Swift recorder, so no Swift scope monitor. The page reads the take's scope itself (`audio_get_scope`),
// or the Timeline draws no waveform while the take runs. Behavioural: the real record_audio_api.js on a stub iOS app
// window (its native invoke), a strip take started, scope frames reaching the session's subscribers, then stopped.
// node tests/probes/ios_strip_take_scope_contract.probe.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pairs = Array.from({ length: 64 }, (_, index) => [-index / 128, index / 128]);

const stubWindow = () => {
    const calls = [];
    const listeners = new Map();
    let sequence = 0;
    const win = {
        __HOST_ENV: 'app',
        setTimeout, clearTimeout,
        CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
        addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
        removeEventListener: () => { },
        dispatchEvent: (event) => (listeners.get(event.type) || []).forEach((fn) => fn(event)),
        __ATOME_IOS_NATIVE_INVOKE: async (command, payload = {}) => {
            calls.push(command);
            if (command === 'audio_get_scope') {
                sequence += 1;
                return { available: true, sequence, sample_rate: 48000, channels: 2, pairs, rms: 0.2, peak: 0.5 };
            }
            if (command === 'audio_record_strip_start') return { success: true, session_id: payload.sessionId, sample_rate: 48000, channels: 2 };
            if (command === 'audio_record_strip_stop') return { success: true, frame_count: 48000, sample_rate: 48000, channels: 2 };
            return { success: true };
        }
    };
    return { win, calls };
};

test('an iOS app strip take publishes its live scope while it runs, and stops reading it after', async () => {
    const { win, calls } = stubWindow();
    globalThis.window = win;
    await import('../../atome/src/application/audio_runtime/record_audio_api.js');
    const { subscribeRecordingScopeFrame } = await import('../../atome/src/application/audio_runtime/record_audio_scope_transport.js');
    const sessionId = 'ios_strip_take';
    const peaks = [];
    subscribeRecordingScopeFrame({ sessionId, listener: (frame) => peaks.push(frame.peak) });
    await win.record_start({ sessionId, fileName: 'take.wav', userId: 'u1', strip_id: 'track_1:audio', device_id: 'host' });
    assert.ok(calls.includes('audio_record_strip_start'));
    await sleep(250);
    assert.ok(peaks.length >= 3, `scope frames while the take runs: ${peaks.length}`);
    assert.equal(peaks.at(-1), 0.5);
    await win.record_stop(sessionId);
    const readsAtStop = calls.filter((command) => command === 'audio_get_scope').length;
    await sleep(150);
    assert.equal(calls.filter((command) => command === 'audio_get_scope').length, readsAtStop, 'no scope read after the stop');
});
