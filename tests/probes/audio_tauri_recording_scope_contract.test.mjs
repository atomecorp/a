import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test, vi } from 'vitest';

import {
    clearRecordingScopeSession,
    createTauriRecordingScopePoller,
    publishRecordingScopeFrame,
    readRecordingScopeDiagnostic,
    subscribeRecordingScopeFrame
} from '../../atome/src/application/audio_runtime/record_audio_scope_transport.js';

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

const scopePayload = (sequence) => ({
    available: true,
    sequence,
    sample_rate: 48_000,
    channels: 2,
    pairs: Array.from({ length: 64 }, (_, index) => [-index / 64, index / 64]),
    rms: 0.25,
    peak: 0.75
});

test('Tauri scope polls the recorded CPAL stream at no more than 30 Hz', async () => {
    vi.useFakeTimers();
    const events = [];
    let sequence = 0;
    class ScopeEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    }
    const windowRef = {
        CustomEvent: ScopeEvent,
        setTimeout,
        clearTimeout,
        dispatchEvent: (event) => events.push(event)
    };
    const invoke = vi.fn(async (command) => {
        assert.equal(command, 'audio_get_scope');
        return scopePayload(++sequence);
    });
    const dispose = createTauriRecordingScopePoller({ windowRef, invoke, sessionId: 'tauri_take' });

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'native_audio_scope');
    assert.equal(events[0].detail.session_id, 'tauri_take');
    assert.equal(events[0].detail.pairs.length, 64);
    await vi.advanceTimersByTimeAsync(33);
    assert.equal(invoke.mock.calls.length, 1);
    await vi.advanceTimersByTimeAsync(1);
    assert.equal(invoke.mock.calls.length, 2);
    assert.equal(dispose(), true);
    assert.equal(dispose(), false);
    assert.equal(vi.getTimerCount(), 0);
});

test('native scope registry replays one early frame and rejects stale sequences', () => {
    const received = [];
    assert.equal(publishRecordingScopeFrame(scopePayload(2), 'early_take')?.sequence, 2);
    const unsubscribe = subscribeRecordingScopeFrame({
        sessionId: 'early_take',
        listener: (frame) => received.push(frame.sequence)
    });
    assert.deepEqual(received, [2]);
    assert.equal(publishRecordingScopeFrame(scopePayload(2), 'early_take'), null);
    assert.equal(publishRecordingScopeFrame(scopePayload(1), 'early_take'), null);
    assert.equal(publishRecordingScopeFrame(scopePayload(3), 'early_take')?.sequence, 3);
    assert.deepEqual(received, [2, 3]);
    assert.equal(unsubscribe(), true);
    assert.equal(unsubscribe(), false);
    clearRecordingScopeSession('early_take');
});

test('native scope registry cleanup detaches subscribers across fifty sessions', () => {
    let calls = 0;
    for (let index = 0; index < 50; index += 1) {
        const sessionId = `registry_take_${index}`;
        subscribeRecordingScopeFrame({ sessionId, listener: () => { calls += 1; } });
        publishRecordingScopeFrame(scopePayload(1), sessionId);
        clearRecordingScopeSession(sessionId);
        publishRecordingScopeFrame(scopePayload(2), sessionId);
        clearRecordingScopeSession(sessionId);
    }
    assert.equal(calls, 50);
});

test('fifty Tauri scope sessions leave no timer behind', async () => {
    vi.useFakeTimers();
    class ScopeEvent {
        constructor(type, options = {}) {
            this.type = type;
            this.detail = options.detail;
        }
    }
    const windowRef = {
        CustomEvent: ScopeEvent,
        setTimeout,
        clearTimeout,
        dispatchEvent() { }
    };
    for (let index = 0; index < 50; index += 1) {
        const dispose = createTauriRecordingScopePoller({
            windowRef,
            invoke: async () => scopePayload(index + 1),
            sessionId: `take_${index}`
        });
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(vi.getTimerCount() >= 1, true);
        dispose();
    }
    assert.equal(vi.getTimerCount(), 0);
});

test('Tauri scope remembers only the first IPC error and resumes with real frames', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const received = [];
    const unsubscribe = subscribeRecordingScopeFrame({
        sessionId: 'permission_take',
        listener: (frame) => received.push(frame.sequence)
    });
    const dispose = createTauriRecordingScopePoller({
        windowRef: { setTimeout, clearTimeout },
        sessionId: 'permission_take',
        invoke: vi.fn(async () => {
            attempt += 1;
            if (attempt === 1) throw new Error('command audio_get_scope not allowed');
            if (attempt === 2) throw new Error('second error must not replace first');
            return scopePayload(attempt - 2);
        })
    });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(readRecordingScopeDiagnostic('permission_take'), {
        type: 'audio_scope_poll_error',
        session_id: 'permission_take',
        message: 'command audio_get_scope not allowed'
    });
    await vi.advanceTimersByTimeAsync(68);
    assert.deepEqual(received, [1]);
    assert.match(readRecordingScopeDiagnostic('permission_take').message, /not allowed/);
    dispose();
    unsubscribe();
    assert.equal(readRecordingScopeDiagnostic('permission_take'), null);
    assert.equal(vi.getTimerCount(), 0);
});

test('Tauri capability authorizes the registered audio_get_scope command', async () => {
    const [permissions, mainSource, libSource, capability] = await Promise.all([
        readFile(new URL('../../platforms/desktop-tauri/permissions/audio-engine.toml', import.meta.url), 'utf8'),
        readFile(new URL('../../platforms/desktop-tauri/src/main.rs', import.meta.url), 'utf8'),
        readFile(new URL('../../platforms/desktop-tauri/src/lib.rs', import.meta.url), 'utf8'),
        readFile(new URL('../../platforms/desktop-tauri/capabilities/default.json', import.meta.url), 'utf8')
    ]);
    assert.match(mainSource, /audio_engine::bridge::audio_get_scope/);
    assert.match(libSource, /audio_engine::bridge::audio_get_scope/);
    assert.match(permissions, /"allow-audio-get-scope"/);
    assert.match(permissions, /identifier = "allow-audio-get-scope"[\s\S]*commands\.allow = \["audio_get_scope"\]/);
    assert.equal(JSON.parse(capability).permissions.includes('audio-engine'), true);
});

test('Tauri callback scope publisher is fixed-size and lock-free', async () => {
    const [scopeSource, meteringSource, bridgeSource] = await Promise.all([
        readFile(new URL('../../platforms/desktop-tauri/src/audio_engine/metering_scope.rs', import.meta.url), 'utf8'),
        readFile(new URL('../../platforms/desktop-tauri/src/audio_engine/metering.rs', import.meta.url), 'utf8'),
        readFile(new URL('../../platforms/desktop-tauri/src/audio_engine/bridge.rs', import.meta.url), 'utf8')
    ]);
    const publishBody = scopeSource.slice(scopeSource.indexOf('pub fn publish'), scopeSource.indexOf('pub fn snapshot'));
    assert.match(scopeSource, /static MIN_BITS: \[AtomicU32; PAIR_COUNT\]/);
    assert.match(scopeSource, /static MAX_BITS: \[AtomicU32; PAIR_COUNT\]/);
    assert.doesNotMatch(publishBody, /Mutex|Vec|println|File|write\(/);
    assert.match(meteringSource, /let mut scope_minimums = \[0\.0f32; 64\]/);
    assert.match(bridgeSource, /pub fn audio_get_scope\(\)/);
});

test('Tauri terminal payload keeps a positive file size through the JavaScript recorder bridge', async () => {
    const listeners = new Map();
    const invoke = vi.fn(async (command) => {
        if (command === 'audio_record_start') return { success: true };
        if (command === 'audio_record_stop') {
            return {
                success: true,
                absolute_file_path: '/tmp/tauri_audio_take.wav',
                size_bytes: 96_044,
                frame_count: 48_000,
                sample_rate: 48_000,
                channels: 1
            };
        }
        if (command === 'audio_get_scope') return { available: false };
        throw new Error(`unexpected_command:${command}`);
    });
    const windowRef = {
        __TAURI_INTERNALS__: { invoke },
        __currentUser: { id: 'tauri_scope_user' },
        location: { protocol: 'tauri:' },
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type) => listeners.delete(type),
        dispatchEvent: () => true,
        setTimeout,
        clearTimeout
    };
    vi.stubGlobal('window', windowRef);
    await import('../../atome/src/application/audio_runtime/record_audio_api.js?tauri-size-contract');

    const sessionId = await windowRef.record_start({
        sessionId: 'tauri_size_take',
        fileName: 'tauri_size_take.wav'
    });
    const terminal = await windowRef.record_stop(sessionId);

    assert.equal(terminal.file_path, 'data/users/tauri_scope_user/recordings/tauri_size_take.wav');
    assert.equal(terminal.absolute_file_path, '/tmp/tauri_audio_take.wav');
    assert.equal(terminal.size_bytes, 96_044);
    assert.equal(terminal.frame_count, 48_000);
    assert.equal(terminal.sample_rate, 48_000);
    assert.equal(invoke.mock.calls.filter(([command]) => command === 'audio_get_scope').length >= 0, true);
});

test('Tauri recorder publishes output size and rejects a zero-byte terminal file before acknowledgement', async () => {
    const [recorderSource, bridgeSource] = await Promise.all([
        readFile(new URL('../../platforms/desktop-tauri/src/audio_engine/recorder.rs', import.meta.url), 'utf8'),
        readFile(new URL('../../platforms/desktop-tauri/src/audio_engine/bridge.rs', import.meta.url), 'utf8')
    ]);
    assert.match(recorderSource, /pub size_bytes: u64/);
    assert.match(recorderSource, /fs::metadata\(&session\.file_path\)/);
    assert.match(recorderSource, /audio_recording_empty: no output bytes were written/);
    assert.match(bridgeSource, /"size_bytes": result\.size_bytes/);
});
