import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import {
    VOICE_V1_PROVIDER_DECISION,
    createVoiceService,
    resolveVoiceProviders
} from './service.js';

const makeResult = (text, { isFinal = false, confidence = 0.9 } = {}) =>
    Object.assign([{ transcript: text, confidence }], { isFinal, length: 1 });

const makeAlternativesResult = (alternatives = [], { isFinal = false } = {}) =>
    Object.assign(
        alternatives.map((entry) => ({
            transcript: entry?.transcript || '',
            confidence: Number.isFinite(entry?.confidence) ? entry.confidence : 0
        })),
        { isFinal, length: alternatives.length }
    );

class FakeSpeechRecognition {
    static latest = null;

    constructor() {
        FakeSpeechRecognition.latest = this;
        this.lang = 'fr-FR';
        this.interimResults = false;
        this.continuous = false;
        this.started = false;
        this.stopped = false;
        this.aborted = false;
    }

    start() {
        this.started = true;
        this.onstart?.();
    }

    stop() {
        this.stopped = true;
        this.onend?.();
    }

    abort() {
        this.aborted = true;
        this.onend?.();
    }

    emitResult(results) {
        this.onresult?.({
            resultIndex: 0,
            results
        });
    }
}

class FakeSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.lang = 'fr-FR';
    }
}

class FakeSpeechSynthesis {
    constructor() {
        this.cancelled = false;
        this.queue = [];
    }

    speak(utterance) {
        this.cancelled = false;
        this.queue.push(utterance);
    }

    cancel() {
        this.cancelled = true;
        this.queue = [];
    }

    finishCurrent() {
        const utterance = this.queue.shift();
        utterance?.onend?.();
    }

    getVoices() {
        return [
            { name: 'Compact', voiceURI: 'compact', lang: 'en-US', default: true, localService: true },
            { name: 'Amelie Enhanced', voiceURI: 'amelie-enhanced', lang: 'fr-FR', localService: true },
            { name: 'system-fr', voiceURI: 'system-fr', lang: 'fr-FR', localService: true }
        ];
    }
}

let tick = 0;
let seq = 0;
const synth = new FakeSpeechSynthesis();
const runtimeTools = [
    { tool_id: 'tool.main.mtrack', tool_key: 'main_mtrack' },
    { tool_id: 'calendar.list_events', tool_key: 'calendar_list_events' }
];
const env = {
    SpeechRecognition: FakeSpeechRecognition,
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    speechSynthesis: synth,
    record_start: async ({ sessionId }) => sessionId,
    record_stop: async (sessionId) => ({ session_id: sessionId, duration_sec: 0.75 }),
    async handleAtomeMCPRequestAsync(request = {}) {
        if (request.method === 'runtime.tools.list') {
            return { jsonrpc: '2.0', id: request.id, result: { tools: runtimeTools } };
        }
        if (request.method === 'runtime.tools.call') {
            return { jsonrpc: '2.0', id: request.id, result: { ok: true, tool_id: request.params.tool_id } };
        }
        if (request.method === 'runtime.tools.batch_call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    results: request.params.events.map((entry) => ({ ok: true, tool_id: entry.tool_id }))
                }
            };
        }
        return { jsonrpc: '2.0', id: request.id, error: { message: `Unhandled ${request.method}` } };
    }
};

const providers = resolveVoiceProviders(env);
assert.equal(providers.stt.selected, 'browser_web_speech', 'browser speech recognition should be selected when host STT plugin is absent');
assert.equal(providers.tts.selected, 'browser_speech_synthesis', 'speechSynthesis should be selected as the v1 TTS backend');
assert.equal(providers.capture.selected, 'iplug_native_recorder', 'native recorder bridge should be selected when record_start/stop are available');
assert.equal(VOICE_V1_PROVIDER_DECISION.stt.primary, 'browser_web_speech', 'the v1 provider decision should now prefer the browser online STT backend');
assert.equal(VOICE_V1_PROVIDER_DECISION.stt.fallback, 'tauri_plugin_stt', 'the v1 provider decision should keep Tauri STT as the local fallback backend');

const runtime = createVoiceSessionRuntime({
    now: () => {
        tick += 1;
        return tick;
    },
    idFactory: (prefix = 'voice') => {
        seq += 1;
        return `${prefix}_${seq}`;
    }
});

const voice = createVoiceService({
    env,
    sessionRuntime: runtime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            const raw = String(utterance || '').trim();
            if (/^lis mes mails$/i.test(raw)) {
                return {
                    intent_id: options.intent_id || 'voice_service_mail_llm',
                    utterance: { raw },
                    locale: options.locale || 'fr-FR',
                    source: options.source,
                    context: options.context,
                    type: 'connector_tool',
                    domain: 'mail',
                    action: 'list',
                    status: 'ready',
                    execution: {
                        target: 'pending_connector',
                        confirmation_required: false,
                        toolchain: []
                    }
                };
            }
            if (/^ouvre mtrack$/i.test(raw)) {
                return {
                    intent_id: options.intent_id || 'voice_service_runtime_llm',
                    utterance: { raw },
                    locale: options.locale || 'fr-FR',
                    source: options.source,
                    context: options.context,
                    type: 'runtime_tool',
                    domain: 'ui_navigation',
                    action: 'open_tool',
                    status: 'ready',
                    execution: {
                        target: 'runtime_v2',
                        confirmation_required: false,
                        toolchain: [{
                            source: 'runtime_v2',
                            tool_id: 'tool.main.mtrack',
                            action: 'pointer.click',
                            input: {}
                        }]
                    }
                };
            }
            return {
                intent_id: options.intent_id || 'voice_service_unknown_llm',
                utterance: { raw },
                locale: options.locale || 'fr-FR',
                source: options.source,
                context: {
                    ...(options.context && typeof options.context === 'object' ? options.context : {}),
                    ai_error: 'test_planner_unmatched'
                },
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'failed',
                assistant_reply: "Le planner IA n'a pas produit d'intent.",
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});
assert.ok(voice.orchestrator, 'voice service should expose the shared voice orchestrator');

const hybridProviders = resolveVoiceProviders({
    ...env,
    __TAURI__: {
        stt: {
            async start() {},
            async stop() {}
        }
    }
});
assert.equal(hybridProviders.stt.selected, 'tauri_plugin_stt', 'native Tauri STT should win by default when both browser and native desktop STT are available inside the desktop runtime');

const forcedBrowserProviders = resolveVoiceProviders({
    ...env,
    SQUIRREL_STT_PROVIDER: 'browser',
    __TAURI__: {
        stt: {
            async start() {},
            async stop() {}
        }
    }
});
assert.equal(forcedBrowserProviders.stt.selected, 'browser_web_speech', 'an explicit browser override should still force browser STT when requested');

const forcedTauriProviders = resolveVoiceProviders({
    ...env,
    SQUIRREL_STT_PROVIDER: 'tauri',
    __TAURI__: {
        stt: {
            async start() {},
            async stop() {}
        }
    }
});
assert.equal(forcedTauriProviders.stt.selected, 'tauri_plugin_stt', 'an explicit native override should still force the desktop STT backend when requested');

const browserCaptureProviders = resolveVoiceProviders({
    SpeechRecognition: FakeSpeechRecognition,
    SpeechSynthesisUtterance: FakeSpeechSynthesisUtterance,
    speechSynthesis: synth,
    navigator: {
        mediaDevices: {
            async getUserMedia() {}
        }
    },
    __SQUIRREL_RECORD_PROVIDER__: 'web_capture_recorder'
});
assert.equal(browserCaptureProviders.capture.selected, 'web_capture_recorder', 'browser capture fallback should be exposed as a dedicated provider when the recorder bridge is web-backed');

const started = await voice.stt.start({
    lang: 'fr',
    partial: true
});
assert.equal(started.provider, 'browser_web_speech', 'voice.stt.start should expose the selected browser STT provider');
assert.equal(FakeSpeechRecognition.latest.started, true, 'speech recognition should start immediately');
assert.equal(FakeSpeechRecognition.latest.lang, 'fr-FR', 'speech recognition should normalize short French locales to fr-FR');
assert.equal(FakeSpeechRecognition.latest.maxAlternatives, 5, 'speech recognition should request more STT alternatives for reranking');
FakeSpeechRecognition.latest.emitResult([makeResult('Lis', { isFinal: false, confidence: 0.75 })]);
let snapshot = runtime.getSession(started.session_id);
assert.equal(snapshot.phase, 'listening', 'interim STT should keep the session in listening');
assert.equal(snapshot.transcript.partial, 'Lis', 'interim STT should stream partials into the session runtime');
FakeSpeechRecognition.latest.emitResult([makeResult('Lis le mail suivant', { isFinal: true, confidence: 0.95 })]);
const finalStt = await voice.stt.stop(started.session_id);
snapshot = runtime.getSession(started.session_id);
assert.equal(finalStt.text, 'Lis le mail suivant', 'voice.stt.stop should resolve with the final transcript');
assert.equal(snapshot.phase, 'processing', 'final STT should move the session into processing');
assert.equal(snapshot.transcript.final, 'Lis le mail suivant', 'the session runtime should preserve the final STT transcript');
let telemetry = voice.telemetry.snapshot(started.session_id);
assert.equal(telemetry.metrics.stt_first_partial_ms > 0, true, 'voice telemetry should measure time to first STT partial');
assert.equal(telemetry.metrics.stt_final_ms > 0, true, 'voice telemetry should measure time to final STT result');

const rerankStarted = await voice.stt.start({
    lang: 'fr',
    partial: true,
    speechHints: ['Mtrack']
});
FakeSpeechRecognition.latest.emitResult([
    makeAlternativesResult([
        { transcript: 'ouvre mes tracks', confidence: 0.93 },
        { transcript: 'ouvre m track', confidence: 0.61 }
    ], { isFinal: true })
]);
const rerankedFinal = await voice.stt.stop(rerankStarted.session_id);
assert.equal(rerankedFinal.text, 'ouvre Mtrack', 'browser STT should rerank alternatives using speech hints and normalize product names');

const speaking = await voice.tts.speak('Je lis le prochain mail.', {
    session_id: started.session_id,
    voiceId: 'system-fr'
});
snapshot = runtime.getSession(started.session_id);
assert.equal(snapshot.phase, 'speaking', 'voice.tts.speak should move the session into speaking');
const stopResult = await voice.tts.stop(started.session_id);
snapshot = runtime.getSession(started.session_id);
assert.equal(stopResult.stopped, true, 'voice.tts.stop should resolve immediately as a stop operation');
assert.equal(synth.cancelled, true, 'voice.tts.stop should cancel the underlying speech synthesis backend');
assert.equal(snapshot.phase, 'interrupted', 'voice.tts.stop should interrupt the current session immediately');
telemetry = voice.telemetry.snapshot(started.session_id);
assert.equal(telemetry.metrics.cancel_roundtrip_ms > 0, true, 'voice telemetry should measure interruption latency');

const completedSession = runtime.createSession({ locale: 'fr-FR' });
const speakingDone = await voice.tts.speak('Bonjour complet.', {
    session_id: completedSession.session_id
});
assert.equal(synth.queue[0]?.voice?.voiceURI, 'amelie-enhanced', 'voice.tts.speak should prefer a higher quality locale-matching system voice when no explicit voice is provided');
synth.finishCurrent();
const finalTts = await speakingDone.promise;
snapshot = runtime.getSession(completedSession.session_id);
assert.equal(finalTts.provider, 'browser_speech_synthesis', 'voice.tts.speak should resolve with the selected TTS provider');
assert.equal(snapshot.phase, 'completed', 'natural TTS completion should move the session to completed');
telemetry = voice.telemetry.snapshot(completedSession.session_id);
assert.equal(telemetry.metrics.tts_playback_ms > 0, true, 'voice telemetry should measure TTS playback duration');

const vadEvents = [];
const vad = voice.vad.create(completedSession.session_id, {
    threshold: 0.02,
    minSpeechFrames: 2,
    releaseFrames: 2,
    onEvent: (event) => vadEvents.push(event)
});
vad.push(Float32Array.from([0.001, 0.001, 0.002]));
vad.push(Float32Array.from([0.06, 0.05, 0.04]));
vad.push(Float32Array.from([0.07, 0.05, 0.06]));
vad.push(Float32Array.from([0.001, 0.001, 0.001]));
vad.push(Float32Array.from([0.001, 0.001, 0.001]));
assert.equal(vadEvents.filter((event) => event.type === 'voice.vad.state').length, 2, 'voice VAD should emit speech start and silence return transitions');
assert.equal(runtime.getHistory(completedSession.session_id).some((event) => event.type === 'voice.vad.state'), true, 'voice VAD should publish state transitions through the shared session runtime');

const listenPromise = voice.listen({
    lang: 'fr-FR',
    partial: true,
    timeoutMs: 20
});
FakeSpeechRecognition.latest.emitResult([makeResult('Ou en est mon compte', { isFinal: true, confidence: 0.92 })]);
FakeSpeechRecognition.latest.stop();
const listened = await listenPromise;
assert.equal(listened.text, 'Ou en est mon compte', 'voice.listen should resolve with the final browser STT transcript');

const flushSpeech = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    synth.finishCurrent();
};

const mailSession = runtime.createSession({ locale: 'fr-FR' });
const mailIntentPromise = voice.executeUtterance('Lis mes mails', {
    session_id: mailSession.session_id
});
await flushSpeech();
const mailIntent = await mailIntentPromise;
assert.equal(mailIntent.transport, 'mail_api', 'voice service should expose utterance execution through the orchestrator');
runtime.handleLocalCommand(mailSession.session_id, 'reponds');
const replyPlan = voice.planFollowup(mailSession.session_id);
assert.equal(replyPlan.action, 'reply_current', 'voice service should resolve contextual reply followups');
const replyExecutionPromise = voice.executeFollowup(mailSession.session_id);
await flushSpeech();
const replyExecution = await replyExecutionPromise;
assert.equal(replyExecution.transport, 'mail_api', 'voice service should execute contextual followups through the orchestrator facade');

const runtimeSession = runtime.createSession({ locale: 'fr-FR' });
const runtimeExecutionPromise = voice.executeUtterance('Ouvre Mtrack', {
    session_id: runtimeSession.session_id
});
await flushSpeech();
const runtimeExecution = await runtimeExecutionPromise;
assert.equal(runtimeExecution.executed, true, 'voice service should execute runtime utterances through MCP/runtime when available');
assert.equal(runtimeExecution.result.tool_id, 'tool.main.mtrack', 'voice service should preserve the runtime tool id in execution results');

console.log('voice_service: ok');
