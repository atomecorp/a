import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createVoiceAssistantSessionController } from '../../atome/src/squirrel/voice/assistant_session_controller.js';
import { createLocalTtsRuntime } from '../../atome/src/squirrel/voice/local_tts_runtime.js';
import { encodeFrenchPhonemes, normalizeFrenchTtsText } from '../../atome/src/squirrel/voice/french_phoneme_encoder.js';
import { analyzePcmWindow, pcm16WavBytes, vowelFamilyForPhoneme } from '../../atome/src/squirrel/voice/tts_pcm_analysis.js';
import {
    assistantMorphForVowel,
    assistantRevealAt,
    assistantSizeForSurface,
    assistantTransitionAt,
    assistantUniforms,
    buildAssistantVisualRecord
} from '../../eVe/voice/assistant/assistant_visual_contract.js';
import { createEveAssistantRuntime } from '../../eVe/voice/assistant/assistant_runtime.js';
import { createBevyMainMenuHoldRuntime } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_hold_runtime.js';
import { isEphemeralProjectSceneRecord } from '../../eVe/domains/rendering/project_scene_record_projection.js';
import { normalizeWorkspaceSceneRecord } from '../../eVe/domains/rendering/workspace_scene_layers.js';
import voiceConfig from '../../atome/src/assets/voice/fr_FR-siwis-medium/fr_FR-siwis-medium.onnx.json' with { type: 'json' };
import { PlayRecordCore } from '../../atome/src/application/audio_runtime/play_record_core.js';

const deferred = () => {
    let resolve;
    const promise = new Promise((next) => { resolve = next; });
    return { promise, resolve };
};
const voiceTexts = {
    openingGreeting: 'Salut, que veux-tu ?',
    touchResponse: 'Oui, je suis toujours là. Comment puis-je t’aider ?',
    closingGreeting: 'Salut, à plus tard.'
};
const translateVoiceKey = (key) => {
    if (key.endsWith('opening_greeting')) return voiceTexts.openingGreeting;
    if (key.endsWith('touch_response')) return voiceTexts.touchResponse;
    if (key.endsWith('closing_greeting')) return voiceTexts.closingGreeting;
    return 'Assistant vocal eVe';
};

test('voice assistant speaks distinct opening, touch and closing phrases in order', async () => {
    const listening = deferred();
    const nextListening = deferred();
    const finalListening = deferred();
    let listenCount = 0;
    const calls = [];
    const api = {
        ensureReady: async () => calls.push('ready'),
        createSession: async () => ({ session_id: 'voice-1' }),
        subscribe: () => () => { },
        speak: async (text) => {
            calls.push(['speak', text]);
            return { promise: Promise.resolve({}) };
        },
        startListening: async () => {
            calls.push('listen');
            listenCount += 1;
            return {
                promise: listenCount === 1
                    ? listening.promise
                    : listenCount === 2
                        ? nextListening.promise
                        : finalListening.promise
            };
        },
        executeUtterance: async (text) => {
            calls.push(['execute', text]);
            return { ok: true };
        },
        cancelListening: async () => { },
        stopSpeaking: async () => { },
        interrupt: async () => { }
    };
    const controller = createVoiceAssistantSessionController({
        voiceApi: api,
        ...voiceTexts
    });
    await controller.open();
    assert.deepEqual(calls.slice(0, 3), [
        'ready',
        ['speak', voiceTexts.openingGreeting],
        'listen'
    ]);
    await controller.respond();
    assert.deepEqual(calls.findLast((entry) => Array.isArray(entry) && entry[0] === 'speak'), ['speak', voiceTexts.touchResponse]);
    nextListening.resolve({ text: 'Dessine un cercle' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(calls.find((entry) => Array.isArray(entry) && entry[0] === 'execute'), ['execute', 'Dessine un cercle']);
    await controller.close();
    assert.deepEqual(calls.findLast((entry) => Array.isArray(entry) && entry[0] === 'speak'), ['speak', voiceTexts.closingGreeting]);
    assert.equal(controller.getState().phase, 'closed');
});

test('closing the voice assistant cancels listening, speech and processing ownership', async () => {
    const listening = deferred();
    const stopped = [];
    const api = {
        ensureReady: async () => true,
        createSession: async () => ({ session_id: 'voice-2' }),
        subscribe: () => () => { },
        speak: async () => ({ promise: Promise.resolve({}) }),
        startListening: async () => ({ promise: listening.promise }),
        executeUtterance: async () => ({ ok: true }),
        cancelListening: async (id) => stopped.push(['listen', id]),
        stopSpeaking: async (id) => stopped.push(['speak', id]),
        interrupt: async (id) => stopped.push(['interrupt', id])
    };
    const controller = createVoiceAssistantSessionController({ voiceApi: api, ...voiceTexts });
    await controller.open();
    await controller.close({ reason: 'test' });
    assert.deepEqual(stopped, [
        ['listen', 'voice-2'],
        ['speak', 'voice-2'],
        ['interrupt', 'voice-2']
    ]);
    listening.resolve({ text: 'ignored' });
});

test('French local TTS encoder is deterministic for greeting, numbers and elisions', () => {
    const first = encodeFrenchPhonemes("Salut, que veux-tu ? J'ai 21 idées.", voiceConfig.phoneme_id_map);
    const second = encodeFrenchPhonemes("Salut, que veux-tu ? J'ai 21 idées.", voiceConfig.phoneme_id_map);
    assert.deepEqual(first, second);
    assert.match(normalizeFrenchTtsText('21 idées'), /vingt et un idées/);
    assert.ok(first.ids.length > first.phonemes.length);
    assert.equal(first.phonemes[0], '^');
    assert.equal(first.phonemes.at(-1), '$');
});

test('PCM analysis and WAV encoding expose the real playback envelope', () => {
    const pcm = Float32Array.from({ length: 441 }, (_, index) => Math.sin(index / 5) * 0.5);
    const analysis = analyzePcmWindow(pcm);
    const wav = pcm16WavBytes(pcm, 22050);
    assert.ok(analysis.rms > 0.3);
    assert.ok(analysis.peak >= 0.49);
    assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
    assert.equal(wav.byteLength, 44 + pcm.length * 2);
    assert.deepEqual(['a', 'ɛ', 'i', 'ɔ', 'u'].map(vowelFamilyForPhoneme), ['A', 'E', 'I', 'O', 'U']);
});

test('assistant visual contract clamps size and defines all deterministic vowel morphs', () => {
    assert.equal(assistantSizeForSurface({ width: 320, height: 640 }), 240);
    assert.equal(assistantSizeForSurface({ width: 2000, height: 1400 }), 420);
    const morphs = ['A', 'E', 'I', 'O', 'U'].map(assistantMorphForVowel);
    assert.equal(new Set(morphs.map((morph) => morph.join(','))).size, 5);
    const speaking = assistantUniforms({ phase: 'speaking', vowel: 'A', rms: 1, elapsedMs: 800 });
    assert.equal(speaking.phase, 4);
    assert.equal(speaking.intensity, 1);
    assert.ok(speaking.pulse <= 0.055);
    const idleStart = assistantUniforms({ morph: [1, 1, 0, 0], elapsedMs: 0 });
    const idleLater = assistantUniforms({ morph: [1, 1, 0, 0], elapsedMs: 800 });
    assert.notStrictEqual(idleStart.morph, idleLater.morph);
    assert.notDeepEqual(idleStart.morph, idleLater.morph);
});

test('assistant visibility transitions are continuous at every timing boundary', () => {
    assert.equal(assistantTransitionAt({ transition: 'appearing', elapsedMs: 0 }), 0);
    assert.ok(assistantTransitionAt({ transition: 'appearing', elapsedMs: 419 }) < 1);
    assert.equal(assistantTransitionAt({ transition: 'appearing', elapsedMs: 420 }), 1);
    assert.ok(assistantTransitionAt({ transition: 'settling', elapsedMs: 90 }) <= 1.015);
    assert.equal(assistantTransitionAt({ transition: 'settling', elapsedMs: 180 }), 1);
    assert.ok(assistantTransitionAt({ transition: 'disappearing', elapsedMs: 319 }) > 0);
    assert.equal(assistantTransitionAt({ transition: 'disappearing', elapsedMs: 320 }), 0);
});

test('assistant reveal choreography orders glow, core and shell at exact boundaries', () => {
    assert.deepEqual(assistantRevealAt({ transition: 'appearing', elapsedMs: 0 }), { glow: 0, core: 0, shell: 0 });
    assert.ok(assistantRevealAt({ transition: 'appearing', elapsedMs: 70 }).glow > 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 70 }).core, 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 140 }).glow, 1);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 140 }).shell, 0);
    assert.ok(assistantRevealAt({ transition: 'appearing', elapsedMs: 150 }).core > 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 150 }).shell, 0);
    assert.equal(assistantRevealAt({ transition: 'appearing', elapsedMs: 330 }).core, 1);
    assert.ok(assistantRevealAt({ transition: 'appearing', elapsedMs: 419 }).shell < 1);
    assert.deepEqual(assistantRevealAt({ transition: 'appearing', elapsedMs: 420 }), { glow: 1, core: 1, shell: 1 });
});

test('assistant global transition boundaries map 0, 419, 420, 599, 600 and 920 ms deterministically', () => {
    const at = (elapsedMs) => {
        if (elapsedMs < 420) return assistantTransitionAt({ transition: 'appearing', elapsedMs });
        if (elapsedMs < 600) return assistantTransitionAt({ transition: 'settling', elapsedMs: elapsedMs - 420 });
        if (elapsedMs < 920) return assistantTransitionAt({ transition: 'disappearing', elapsedMs: elapsedMs - 600 });
        return 0;
    };
    assert.equal(at(0), 0);
    assert.ok(at(419) < 1);
    assert.equal(at(420), 1);
    assert.ok(at(599) > 1);
    assert.equal(at(600), 1);
    assert.equal(at(920), 0);
});

test('assistant uses one undimmed full-surface visual above Dashboard', () => {
    const record = buildAssistantVisualRecord({ surfaceSize: { width: 1280, height: 720 }, phase: 'listening' });
    const normalized = normalizeWorkspaceSceneRecord(record);
    assert.equal(normalized.properties.layer, 'panel');
    assert.ok(normalized.properties.renderLayer > 1420);
    assert.ok(normalized.properties.renderLayer < 2350);
    assert.equal(isEphemeralProjectSceneRecord(record), true);
    assert.equal(record.properties.left, 0);
    assert.equal(record.properties.top, 0);
    assert.equal(record.properties.width, 1280);
    assert.equal(record.properties.height, 720);
    assert.deepEqual(record.properties.material.procedural.surface_size, [1280, 720]);
    assert.equal(record.properties.material.procedural.assistant_size, 273.6);
});

test('a real BevyUI long hold reopens after visual close even while the farewell is finishing', async () => {
    let clock = 0;
    let frameCallback = null;
    let sessionSequence = 0;
    const farewell = deferred();
    const spoken = [];
    const scheduled = [];
    const voiceApi = {
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
    };
    const runtime = createEveAssistantRuntime({
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

test('assistant public API owns modal lifecycle, trace command, render teardown and clean reopen', async () => {
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
    const voiceApi = {
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
    };
    const runtime = createEveAssistantRuntime({
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
    assert.equal(interactions[0][0], 'project');
    assert.equal(interactions[0][3].priority, 1100);
    assert.equal(renders[0].phase, 'opening');
    const assistantInterceptor = interactions[0][2];
    const pointerPayload = (phase, clientX, clientY, pointerId = 9) => ({
        canvas: {},
        event: { clientX, clientY, pointerId },
        phase,
        point: { x: clientX, y: clientY },
        surface_size: { width: 1000, height: 800 }
    });
    assert.equal(assistantInterceptor(pointerPayload('pointerdown', 940, 760)).handled, false);
    assert.equal(assistantInterceptor(pointerPayload('pointermove', 500, 300)).handled, false);
    assert.equal(assistantInterceptor(pointerPayload('pointerup', 500, 300)).handled, false);
    assert.equal(assistantInterceptor(pointerPayload('pointerup', 940, 760, 10)).handled, false);
    assert.equal(assistantInterceptor(pointerPayload('pointerdown', 200, 200, 11)).handled, true);
    assert.equal(assistantInterceptor(pointerPayload('pointercancel', 200, 200, 11)).handled, true);
    const firstClose = runtime.toggle({ source: 'bevy_ui_main_menu_atome' });
    const duplicateClose = runtime.close({ source: 'bevy_ui_main_menu_atome' });
    assert.equal(assistantInterceptor(pointerPayload('pointerdown', 940, 760, 12)).handled, false);
    assert.equal(assistantInterceptor(pointerPayload('pointerup', 940, 760, 12)).handled, false);
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
    const voiceApi = {
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
    };
    const runtime = createEveAssistantRuntime({
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
    assert.deepEqual(runtime.getState(), {
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
    const voiceApi = {
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
    };
    const runtime = createEveAssistantRuntime({
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
    const voiceApi = {
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
    };
    const runtime = createEveAssistantRuntime({
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
    const voiceApi = {
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
    };
    const runtime = createEveAssistantRuntime({
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
    const voiceApi = {
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
    };
    const runtime = createEveAssistantRuntime({
        env: {
            addEventListener: () => { },
            console: { error: (...args) => closeErrors.push(args) },
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
    assert.equal(closeErrors[0][0], 'eve_voice_assistant_close_voice_failed');
    assert.equal(voiceUnsubscribeCount, 1);
    await runtime.open();
    await advance(420);
    assert.equal(runtime.getState().active, true);
    assert.equal(runtime.getState().sessionId, 'failure-session-2');
});

test('transient PCM assets stay ephemeral while using the existing Kira facade authority', async () => {
    const envelopes = [];
    const backendCalls = [];
    const core = new PlayRecordCore({
        Squirrel: {
            commandBus: { dispatch: (envelope) => { envelopes.push(envelope); return { ok: true }; } },
            av: { audio: { __call_backend_method: async (...args) => { backendCalls.push(args); return true; } } }
        }
    });
    core.init = async () => ({ ok: true });
    core.runtime = () => ({ playback: 'web_wasm_kira' });
    await core.loadTransientAsset({ assetId: 'tts-test', bytes: new Uint8Array([1, 2, 3]) });
    await core.releaseTransientAsset('tts-test');
    assert.equal(envelopes[0].meta.history_mode, 'ephemeral');
    assert.equal(envelopes[1].meta.history_mode, 'ephemeral');
    assert.equal(backendCalls[0][0], 'create_clip');
    assert.equal(backendCalls[1][0], 'destroy_clip');
});

test('local TTS publishes monotone 20 ms frames from the PCM handed to Kira', async () => {
    let currentTime = 0;
    let intervalCallback;
    let endCallback;
    const audioCalls = [];
    const worker = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
            queueMicrotask(() => this.onmessage({ data: message.type === 'preload'
                ? { id: message.id, type: 'ready' }
                : {
                    id: message.id,
                    type: 'result',
                    pcm: Float32Array.from({ length: 2205 }, (_, index) => Math.sin(index / 4) * 0.3),
                    phonemes: ['^', 'a', 'i', 'u', '$'],
                    sampleRate: 22050
                } }));
        }
    };
    const runtime = createLocalTtsRuntime({
        env: {},
        audio: {
            loadTransientAsset: async (payload) => audioCalls.push(['load', payload]),
            startVoice: async (payload) => audioCalls.push(['play', payload]),
            stopVoice: async (payload) => audioCalls.push(['stop', payload]),
            releaseTransientAsset: async (payload) => audioCalls.push(['release', payload])
        },
        workerFactory: () => worker,
        now: () => currentTime,
        setTimer: (callback) => { intervalCallback = callback; return 1; },
        clearTimer: () => { },
        setDelay: (callback) => { endCallback = callback; return 2; },
        clearDelay: () => { }
    });
    const frames = [];
    runtime.subscribeFrames((frame) => frames.push(frame));
    const started = await runtime.speak('tts-session', 'Salut');
    currentTime = 20;
    intervalCallback();
    currentTime = 80;
    intervalCallback();
    endCallback();
    await started.promise;
    assert.deepEqual(audioCalls.slice(0, 2).map(([kind]) => kind), ['load', 'play']);
    assert.ok(audioCalls[0][1].bytes.byteLength > 44);
    assert.deepEqual(frames.map((frame) => frame.playback_sample), [...frames.map((frame) => frame.playback_sample)].sort((a, b) => a - b));
    assert.ok(frames.some((frame) => frame.rms > 0));
});

test('local TTS fully tears down and replays five sequential utterances', async () => {
    const audioCalls = [];
    const endCallbacks = [];
    const worker = {
        onmessage: null,
        onerror: null,
        postMessage(message) {
            queueMicrotask(() => this.onmessage({ data: {
                id: message.id,
                type: 'result',
                pcm: Float32Array.from({ length: 441 }, (_, index) => Math.sin(index / 3) * 0.2),
                phonemes: ['^', 'a', '$'],
                sampleRate: 22050
            } }));
        }
    };
    const runtime = createLocalTtsRuntime({
        env: {},
        audio: {
            loadTransientAsset: async ({ assetId }) => audioCalls.push(['load', assetId]),
            startVoice: async ({ voiceId }) => audioCalls.push(['play', voiceId]),
            stopVoice: async ({ voiceId }) => audioCalls.push(['stop', voiceId]),
            releaseTransientAsset: async (assetId) => audioCalls.push(['release', assetId])
        },
        workerFactory: () => worker,
        now: () => 0,
        setTimer: () => 1,
        clearTimer: () => { },
        setDelay: (callback) => { endCallbacks.push(callback); return endCallbacks.length; },
        clearDelay: () => { }
    });
    for (let index = 0; index < 5; index += 1) {
        const started = await runtime.speak(`session-${index}`, `lecture ${index}`);
        endCallbacks.shift()();
        await started.promise;
    }
    assert.equal(audioCalls.filter(([kind]) => kind === 'load').length, 5);
    assert.equal(audioCalls.filter(([kind]) => kind === 'play').length, 5);
    assert.equal(audioCalls.filter(([kind]) => kind === 'stop').length, 5);
    assert.equal(audioCalls.filter(([kind]) => kind === 'release').length, 5);
});
