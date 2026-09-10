import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createEveAssistantRuntime } from '../../eVe/voice/assistant/assistant_runtime.js';
import { createBevyMainMenuHoldRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_hold_runtime.js';

const withMcpBridge = (api) => ({
    orchestrator: { bridge: { kind: 'mcp' } },
    stopListening: async () => ({ stopped: true }),
    subscribeInputFrames: () => () => { },
    ...api
});

const translateVoiceKey = (key) => {
    if (key.endsWith('opening_greeting')) return voiceTexts.openingGreeting;
    if (key.endsWith('touch_response')) return voiceTexts.touchResponse;
    if (key.endsWith('closing_greeting')) return voiceTexts.closingGreeting;
    return 'Assistant vocal eVe';
};

const voiceTexts = {
    openingGreeting: 'Salut, que veux-tu ?',
    touchResponse: 'Oui, je suis toujours là. Comment puis-je t’aider ?',
    closingGreeting: 'Salut, à plus tard.'
};

const deferred = () => {
    let resolve;
    const promise = new Promise((next) => { resolve = next; });
    return { promise, resolve };
};

test('a real BevyUI long hold reopens after visual close even while the farewell is finishing', async () => {
    let clock = 0;
    let frameCallback = null;
    let sessionSequence = 0;
    const farewell = deferred();
    const spoken = [];
    const scheduled = [];
    const voiceApi = withMcpBridge({
        ensureReady: async () => true,
        createSession: async () => ({ session_id: `hold-session-${++sessionSequence}` }),
        subscribe: () => () => { },
        subscribeTtsFrames: () => () => { },
        speak: async (text) => {
            spoken.push(text);
            return { promise: text === voiceTexts.closingGreeting ? farewell.promise : Promise.resolve({}) };
        },
        startListening: async () => ({ promise: new Promise(() => { }) }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async () => ({ ok: true }),
        stopSpeaking: async () => ({ ok: true }),
        interrupt: async () => ({ ok: true })
    });
    const runtime = createEveAssistantRuntime({
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        env: { addEventListener: () => { }, performance: { now: () => clock } },
        voiceApiResolver: () => voiceApi,
        now: () => clock,
        requestFrame: (callback) => { frameCallback = callback; return 1; },
        cancelFrame: () => { },
        renderScene: async () => ({ ok: true }),
        clearScene: async () => ({ ok: true }),
        setInteractionLayer: () => { },
        commandBus: { append: () => { } },
        translate: translateVoiceKey
    });
    const hold = createBevyMainMenuHoldRuntime({
        onHold: (payload) => runtime.toggle(payload),
        schedule: (callback, delay) => {
            const timer = { callback, delay, cancelled: false };
            scheduled.push(timer);
            return timer;
        },
        cancelSchedule: (timer) => { timer.cancelled = true; }
    });
    const flush = async () => {
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const advance = async (milliseconds) => {
        clock += milliseconds;
        const callback = frameCallback;
        frameCallback = null;
        callback?.();
        await flush();
    };
    const longHold = async () => {
        hold.press('main_menu_atome', { x: 10, y: 10 });
        const timer = scheduled.findLast((candidate) => candidate.delay === 520 && !candidate.cancelled);
        assert.ok(timer);
        timer.callback();
        hold.release('main_menu_atome');
        await flush();
    };

    await longHold();
    await advance(420);
    assert.equal(runtime.getState().active, true);
    assert.equal(runtime.getState().sessionId, 'hold-session-1');

    await longHold();
    await advance(320);
    assert.equal(runtime.getState().active, false);
    assert.equal(runtime.getState().transition, 'hidden');
    await longHold();
    await flush();
    assert.equal(runtime.getState().active, true);
    assert.equal(runtime.getState().transition, 'appearing');
    await advance(420);
    assert.equal(runtime.getState().sessionId, 'hold-session-2');
    assert.deepEqual(spoken, [
        voiceTexts.openingGreeting,
        voiceTexts.closingGreeting,
        voiceTexts.openingGreeting
    ]);
    farewell.resolve({ ok: true });
    await flush();
});

test('assistant public API preserves project interaction, trace command, render teardown and clean reopen', async () => {
    const listeners = {};
    const renders = [];
    const interactions = [];
    const commands = [];
    let sessionSequence = 0;
    let clock = 0;
    let frameCallback = null;
    const advance = async (milliseconds) => {
        clock += milliseconds;
        const callback = frameCallback;
        frameCallback = null;
        callback?.();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const pendingListen = () => new Promise(() => { });
    const voiceApi = withMcpBridge({
        ensureReady: async () => true,
        createSession: async () => ({ session_id: `session-${++sessionSequence}` }),
        subscribe: () => () => { },
        subscribeTtsFrames: () => () => { },
        speak: async () => ({ promise: Promise.resolve({}) }),
        startListening: async () => ({ promise: pendingListen() }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async () => ({ ok: true }),
        stopSpeaking: async () => ({ ok: true }),
        interrupt: async () => ({ ok: true })
    });
    const runtime = createEveAssistantRuntime({
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        env: {
            addEventListener: (type, listener) => { listeners[type] = listener; },
            requestAnimationFrame: (callback) => { frameCallback = callback; return 1; },
            cancelAnimationFrame: () => { },
            performance: { now: () => clock },
            eveBevyUiRuntime: {
                hitTestAtClientPoint: ({ clientY }) => Number(clientY) >= 700
                    ? { treeId: 'eve_bevy_ui_main_menu', nodeId: 'main_menu_atome' }
                    : { treeId: 'eve_dashboard_tree', nodeId: 'dashboard_card' }
            }
        },
        voiceApiResolver: () => voiceApi,
        now: () => clock,
        requestFrame: (callback) => { frameCallback = callback; return 1; },
        cancelFrame: () => { },
        renderScene: async (payload) => renders.push(payload),
        clearScene: async () => renders.push({ clear: true }),
        setInteractionLayer: (...args) => interactions.push(args),
        commandBus: { append: (command) => commands.push(command) },
        translate: (key) => key.endsWith('greeting') ? 'Salut, que veux-tu ?' : 'Assistant vocal eVe'
    });
    await runtime.toggle({ source: 'bevy_ui_main_menu_atome' });
    assert.equal(runtime.getState().active, true);
    assert.equal(runtime.getState().transition, 'appearing');
    await advance(419);
    assert.equal(runtime.getState().sessionId, null);
    await advance(1);
    assert.equal(runtime.getState().sessionId, 'session-1');
    assert.equal(commands[0].command, 'voice.assistant.toggle');
    assert.equal(commands[0].source, 'bevy_ui_main_menu_atome');
    assert.equal(interactions.length, 0);
    assert.equal(renders[0].phase, 'opening');
    const firstClose = runtime.toggle({ source: 'bevy_ui_main_menu_atome' });
    const duplicateClose = runtime.close({ source: 'bevy_ui_main_menu_atome' });
    await advance(320);
    await Promise.all([firstClose, duplicateClose]);
    assert.equal(runtime.getState().phase, 'closed');
    assert.deepEqual(renders.at(-1), { clear: true });
    await runtime.open();
    await advance(420);
    assert.equal(runtime.getState().sessionId, 'session-2');
    listeners.keydown({ key: 'Escape' });
    await advance(320);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(runtime.getState().phase, 'closed');
});

test('closing during appearance speaks only the farewell and remains reopenable', async () => {
    let clock = 0;
    let frameCallback = null;
    const spokenTexts = [];
    const voiceApi = withMcpBridge({
        subscribeTtsFrames: () => () => { },
        subscribe: () => () => { },
        ensureReady: async () => true,
        createSession: async () => ({ session_id: 'cancelled-opening' }),
        speak: async (text) => { spokenTexts.push(text); return { promise: Promise.resolve({}) }; },
        startListening: async () => ({ promise: new Promise(() => { }) }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async () => ({ ok: true }),
        stopSpeaking: async () => ({ ok: true }),
        interrupt: async () => ({ ok: true })
    });
    const runtime = createEveAssistantRuntime({
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        env: { addEventListener: () => { } },
        voiceApiResolver: () => voiceApi,
        requestFrame: (callback) => { frameCallback = callback; return 1; },
        cancelFrame: () => { },
        now: () => clock,
        renderScene: async () => ({ ok: true }),
        clearScene: async () => ({ ok: true }),
        setInteractionLayer: () => { },
        commandBus: { append: () => { } },
        translate: translateVoiceKey
    });
    await runtime.open();
    clock = 200;
    frameCallback?.();
    const close = runtime.close();
    clock = 520;
    frameCallback?.();
    await close;
    assert.deepEqual(spokenTexts, [voiceTexts.closingGreeting]);
    const { conversation, inputMode, image, ...closedState } = runtime.getState();
    assert.equal(image.phase, 'idle');
    assert.equal(inputMode, 'voice');
    assert.equal(conversation.saved, false);
    assert.deepEqual(closedState, {
        active: false,
        error: '',
        phase: 'closed',
        sessionId: null,
        transition: 'hidden'
    });
    await runtime.open();
    clock = 940;
    frameCallback?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(runtime.getState().active, true);
    assert.deepEqual(spokenTexts, [voiceTexts.closingGreeting, voiceTexts.openingGreeting]);
});

test('assistant releases visual interaction after animation without waiting for native voice cleanup', async () => {
    let clock = 0;
    let frameCallback = null;
    let sessionSequence = 0;
    const nativeStop = deferred();
    const voiceApi = withMcpBridge({
        subscribeTtsFrames: () => () => { },
        subscribe: () => () => { },
        ensureReady: async () => true,
        createSession: async () => ({ session_id: `native-session-${++sessionSequence}` }),
        speak: async () => ({ promise: Promise.resolve({}) }),
        startListening: async () => ({ promise: new Promise(() => { }) }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async () => ({ ok: true }),
        stopSpeaking: async () => nativeStop.promise,
        interrupt: async () => ({ ok: true })
    });
    const runtime = createEveAssistantRuntime({
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        env: { addEventListener: () => { } },
        voiceApiResolver: () => voiceApi,
        requestFrame: (callback) => { frameCallback = callback; return 1; },
        cancelFrame: () => { },
        now: () => clock,
        renderScene: async () => ({ ok: true }),
        clearScene: async () => ({ ok: true }),
        setInteractionLayer: () => { },
        commandBus: { append: () => { } },
        translate: () => 'Salut, que veux-tu ?'
    });
    await runtime.open();
    clock = 420;
    frameCallback?.();
    await Promise.resolve();
    const firstClose = runtime.close();
    clock = 740;
    frameCallback?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(runtime.getState().active, false);
    assert.equal(runtime.getState().transition, 'hidden');
    await firstClose;
    await runtime.open();
    clock = 1160;
    frameCallback?.();
    await Promise.resolve();
    assert.equal(runtime.getState().active, true);
    assert.equal(sessionSequence, 2);
    nativeStop.resolve({ ok: true });
});

test('renderer warmup time is excluded from the 420 ms reveal clock', async () => {
    let clock = 0;
    let frameCallback = null;
    let renderCount = 0;
    let sessionCount = 0;
    const warmup = deferred();
    const voiceApi = withMcpBridge({
        subscribeTtsFrames: () => () => { },
        subscribe: () => () => { },
        ensureReady: async () => true,
        createSession: async () => { sessionCount += 1; return { session_id: 'warm-session' }; },
        speak: async () => ({ promise: Promise.resolve({}) }),
        startListening: async () => ({ promise: new Promise(() => { }) }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async () => ({ ok: true }),
        stopSpeaking: async () => ({ ok: true }),
        interrupt: async () => ({ ok: true })
    });
    const runtime = createEveAssistantRuntime({
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        env: { addEventListener: () => { } },
        voiceApiResolver: () => voiceApi,
        requestFrame: (callback) => { frameCallback = callback; return 1; },
        cancelFrame: () => { },
        now: () => clock,
        renderScene: async () => {
            renderCount += 1;
            if (renderCount === 2) await warmup.promise;
            return { ok: true };
        },
        clearScene: async () => ({ ok: true }),
        setInteractionLayer: () => { },
        commandBus: { append: () => { } },
        translate: () => 'Salut, que veux-tu ?'
    });
    const opening = runtime.open();
    clock = 500;
    warmup.resolve();
    await opening;
    clock = 919;
    frameCallback?.();
    await Promise.resolve();
    assert.equal(sessionCount, 0);
    clock = 920;
    frameCallback?.();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(sessionCount, 1);
});

test('assistant runtime survives ten complete voiced open and close cycles with exact phrases', async () => {
    let sessionSequence = 0;
    const spokenTexts = [];
    let clearCount = 0;
    let clock = 0;
    let frameCallback = null;
    const advance = async (milliseconds) => {
        clock += milliseconds;
        const callback = frameCallback;
        frameCallback = null;
        callback?.();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const voiceApi = withMcpBridge({
        ensureReady: async () => true,
        createSession: async () => ({ session_id: `stress-session-${++sessionSequence}` }),
        subscribe: () => () => { },
        subscribeTtsFrames: () => () => { },
        speak: async (text) => {
            spokenTexts.push(text);
            return { promise: Promise.resolve({}) };
        },
        startListening: async () => ({ promise: new Promise(() => { }) }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async () => ({ ok: true }),
        stopSpeaking: async () => ({ ok: true }),
        interrupt: async () => ({ ok: true })
    });
    const runtime = createEveAssistantRuntime({
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        env: { addEventListener: () => { }, console: { error: () => { } }, performance: { now: () => clock } },
        voiceApiResolver: () => voiceApi,
        now: () => clock,
        requestFrame: (callback) => { frameCallback = callback; return 1; },
        cancelFrame: () => { },
        renderScene: async () => ({ ok: true }),
        clearScene: async () => { clearCount += 1; },
        setInteractionLayer: () => { },
        commandBus: { append: () => { } },
        translate: translateVoiceKey
    });
    for (let index = 0; index < 10; index += 1) {
        await runtime.open({ source: 'stress' });
        assert.equal(runtime.getState().active, true);
        await advance(420);
        const close = runtime.close({ source: 'stress' });
        await advance(320);
        await close;
        assert.equal(runtime.getState().phase, 'closed');
    }
    assert.equal(sessionSequence, 10);
    assert.deepEqual(spokenTexts, Array.from({ length: 10 }, () => [
        voiceTexts.openingGreeting,
        voiceTexts.closingGreeting
    ]).flat());
    assert.equal(clearCount, 10);
});

test('a native farewell failure cannot strand the assistant or block reopening', async () => {
    let clock = 0;
    let frameCallback = null;
    let sessionSequence = 0;
    let voiceUnsubscribeCount = 0;
    const closeErrors = [];
    const advance = async (milliseconds) => {
        clock += milliseconds;
        const callback = frameCallback;
        frameCallback = null;
        callback?.();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const voiceApi = withMcpBridge({
        ensureReady: async () => true,
        createSession: async () => ({ session_id: `failure-session-${++sessionSequence}` }),
        subscribe: () => () => { voiceUnsubscribeCount += 1; },
        subscribeTtsFrames: () => () => { },
        speak: async (text) => {
            if (text === voiceTexts.closingGreeting) throw new Error('native_farewell_failed');
            return { promise: Promise.resolve({}) };
        },
        startListening: async () => ({ promise: new Promise(() => { }) }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async () => ({ ok: true }),
        stopSpeaking: async () => ({ ok: true }),
        interrupt: async () => ({ ok: true })
    });
    const runtime = createEveAssistantRuntime({
        providerResolver: async () => ({ ok: true, providerId: 'local' }),
        env: {
            addEventListener: () => { },
            __EVE_VOICE_DIAGNOSTICS__: true,
            console: { info: (line) => {
                if (line.includes('voice.session.close.error')) closeErrors.push(line);
            } },
            performance: { now: () => clock }
        },
        voiceApiResolver: () => voiceApi,
        now: () => clock,
        requestFrame: (callback) => { frameCallback = callback; return 1; },
        cancelFrame: () => { },
        renderScene: async () => ({ ok: true }),
        clearScene: async () => ({ ok: true }),
        setInteractionLayer: () => { },
        commandBus: { append: () => { } },
        translate: translateVoiceKey
    });
    await runtime.open();
    await advance(420);
    const closing = runtime.close({ source: 'test' });
    await advance(320);
    await closing;
    assert.equal(runtime.getState().active, false);
    assert.equal(runtime.getState().transition, 'hidden');
    assert.equal(closeErrors.length, 1);
    assert.match(closeErrors[0], /voice\.session\.close\.error/);
    assert.match(closeErrors[0], /native_farewell_failed/);
    assert.equal(voiceUnsubscribeCount, 1);
    await runtime.open();
    await advance(420);
    assert.equal(runtime.getState().active, true);
    assert.equal(runtime.getState().sessionId, 'failure-session-2');
});

 test('provider resolution failure never starts the legacy voice controller', async () => {
    const { bindVoiceAssistantSession } = await import('../../atome/src/squirrel/voice/assistant_session_controller.js');
    for (const error of ['no_active_ai_provider', 'profile_loader_unavailable', 'ai_active_provider_ambiguous']) {
        await assert.rejects(bindVoiceAssistantSession({ provider: { ok: false, error }, voiceApi: null }), new RegExp(error));
    }
});
