import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createVoiceAssistantSessionController } from '../../atome/src/squirrel/voice/assistant_session_controller.js';

const deferred = () => {
    let resolve;
    const promise = new Promise((next) => { resolve = next; });
    return { promise, resolve };
};

const waitUntil = async (predicate, attempts = 60) => {
    for (let index = 0; index < attempts; index += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 2));
    }
    throw new Error('assistant_turn_taking_wait_timeout');
};

test('assistant playback ends and drains before the only user-turn microphone capture opens', async () => {
    const openingSpeech = deferred();
    const userCapture = deferred();
    const followingCapture = deferred();
    const utterances = [];
    const listeningOptions = [];
    const stopSpeakingCalls = [];
    const diagnosticLines = [];
    let eventListener = () => { };
    const voiceApi = {
        orchestrator: { bridge: { kind: 'mcp' } },
        ensureReady: async () => ({ orchestrator: { bridge: { kind: 'mcp' } } }),
        createSession: async () => ({ session_id: 'half_duplex_session' }),
        subscribe: (listener) => { eventListener = listener; return () => { eventListener = () => { }; }; },
        speak: async () => ({ promise: openingSpeech.promise }),
        startListening: async (options) => {
            listeningOptions.push(options);
            return { promise: listeningOptions.length === 1 ? userCapture.promise : followingCapture.promise };
        },
        stopListening: async () => ({ ok: true }),
        stopSpeaking: async (_sessionId, options) => { stopSpeakingCalls.push(options); return { ok: true }; },
        cancelListening: async () => ({ ok: true }),
        interrupt: async () => ({ ok: true }),
        executeUtterance: async (text) => {
            utterances.push(text);
            return { ok: true, spoken_reply: '' };
        }
    };
    const env = {
        __EVE_VOICE_ACOUSTIC_DRAIN_MS: 8,
        console: { info: (line) => diagnosticLines.push(line) },
        setTimeout,
        clearTimeout
    };
    const controller = createVoiceAssistantSessionController({
        voiceApi,
        openingGreeting: 'Bonjour.',
        touchResponse: 'Oui ?',
        closingGreeting: 'Au revoir.',
        env
    });

    const opened = controller.open();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(listeningOptions.length, 0);

    eventListener({
        session_id: 'half_duplex_session',
        type: 'voice.stt.partial',
        payload: { text: 'bonjour' }
    });
    assert.equal(stopSpeakingCalls.length, 0);
    assert.equal(utterances.length, 0);

    openingSpeech.resolve({ ok: true });
    await opened;
    assert.equal(listeningOptions.length, 0);
    await waitUntil(() => listeningOptions.length === 1);
    assert.equal(listeningOptions[0].purpose, 'user_turn');

    userCapture.resolve({
        text: 'déplace le texte hello de 300 pixels vers la droite',
        reason: 'stable_silence',
        silence_ms: 1850,
        text_stable_ms: 1220,
        transcript_stable: true
    });
    await waitUntil(() => utterances.length === 1);

    assert.equal(utterances[0], 'déplace le texte hello de 300 pixels vers la droite');
    assert.equal(stopSpeakingCalls.length, 0);
    assert.ok(diagnosticLines.some((line) => line.includes('"state":"tts_only"')));
    assert.ok(diagnosticLines.some((line) => line.includes('"state":"listening_delayed"')));
    assert.ok(diagnosticLines.some((line) => line.includes('"state":"listening_allowed"')));
    assert.ok(diagnosticLines.some((line) => line.includes('"silence_ms":1850')));

    await controller.close({ speakFarewell: false });
    followingCapture.resolve({ text: '' });
});
