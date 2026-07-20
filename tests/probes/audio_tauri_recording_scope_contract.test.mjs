import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test, vi } from 'vitest';

import { createTauriRecordingScopePoller } from '../../atome/src/application/audio_runtime/record_audio_scope_transport.js';

afterEach(() => {
    vi.useRealTimers();
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
