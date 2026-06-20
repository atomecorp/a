import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceService, resolveVoiceProviders } from './service.js';

const listeners = {
    result: new Set(),
    stateChange: new Set(),
    error: new Set()
};

const emit = (kind, payload) => {
    for (const handler of listeners[kind]) {
        handler(payload);
    }
};

const resetListeners = () => {
    Object.values(listeners).forEach((set) => set.clear());
};

const env = {
    __TAURI__: {
        stt: {
            async checkPermission() {
                return {
                    microphone: 'granted',
                    speechRecognition: 'granted'
                };
            },
            async start(config = {}) {
                emit('stateChange', { state: 'listening', config });
                setTimeout(() => {
                    emit('result', {
                        transcript: 'Releve mes mails',
                        isFinal: true,
                        confidence: 0.91
                    });
                }, 0);
            },
            async stop() {
                setTimeout(() => {
                    emit('stateChange', { state: 'idle' });
                }, 0);
                return true;
            },
            async onResult(handler) {
                listeners.result.add(handler);
                return () => listeners.result.delete(handler);
            },
            async onStateChange(handler) {
                listeners.stateChange.add(handler);
                return () => listeners.stateChange.delete(handler);
            },
            async onError(handler) {
                listeners.error.add(handler);
                return () => listeners.error.delete(handler);
            }
        }
    }
};

const providers = resolveVoiceProviders(env);
assert.equal(providers.stt.selected, 'tauri_plugin_stt', 'native Tauri STT should be selected when the bridge is available');

const runtime = createVoiceSessionRuntime();
const voice = createVoiceService({
    env,
    sessionRuntime: runtime,
    aiPlanner: { async plan() { return null; } }
});

const started = await voice.stt.start({
    lang: 'fr',
    partial: true,
    silenceMs: 5
});

const final = await started.promise;
assert.equal(final.provider, 'tauri_plugin_stt', 'voice.stt.start should expose the native Tauri STT provider');
assert.equal(final.text, 'Releve mes mails', 'voice.stt.start should resolve with the native final transcript');

resetListeners();

let tauriStartConfig = null;
const correctedEnv = {
    __TAURI__: {
        stt: {
            async checkPermission() {
                return {
                    microphone: 'granted',
                    speechRecognition: 'granted'
                };
            },
            async start(config = {}) {
                tauriStartConfig = config;
                emit('stateChange', { state: 'listening', config });
                setTimeout(() => {
                    emit('result', {
                        transcript: 'ouvre atom',
                        isFinal: true,
                        confidence: 0.77
                    });
                }, 0);
            },
            async stop() {
                setTimeout(() => {
                    emit('stateChange', { state: 'idle' });
                }, 0);
                return true;
            },
            async onResult(handler) {
                listeners.result.add(handler);
                return () => listeners.result.delete(handler);
            },
            async onStateChange(handler) {
                listeners.stateChange.add(handler);
                return () => listeners.stateChange.delete(handler);
            },
            async onError(handler) {
                listeners.error.add(handler);
                return () => listeners.error.delete(handler);
            }
        }
    }
};

const correctedRuntime = createVoiceSessionRuntime();
const correctedVoice = createVoiceService({
    env: correctedEnv,
    sessionRuntime: correctedRuntime,
    aiPlanner: { async plan() { return null; } }
});

const correctedStarted = await correctedVoice.stt.start({
    lang: 'fr',
    partial: true,
    speechHints: ['Atome'],
    silenceMs: 5
});
const correctedFinal = await correctedStarted.promise;
assert.equal(tauriStartConfig?.language, 'fr-FR', 'native desktop STT should normalize short French locales to fr-FR');
assert.equal(tauriStartConfig?.maxAlternatives, 5, 'native desktop STT should request more alternatives by default');
assert.equal(correctedFinal.text, 'ouvre Atome', 'native desktop STT should normalize domain-specific product names in the final transcript');

const snapshot = runtime.getSession(started.session_id);
assert.equal(snapshot.transcript.final, 'Releve mes mails', 'native Tauri STT should finalize the runtime transcript');
assert.equal(snapshot.phase, 'processing', 'native Tauri STT should move the session into processing after the final transcript');

resetListeners();

const idleEnv = {
    __TAURI__: {
        stt: {
            async checkPermission() {
                return {
                    microphone: 'granted',
                    speechRecognition: 'granted'
                };
            },
            async start() {
                emit('stateChange', { state: 'listening' });
                setTimeout(() => {
                    emit('result', {
                        transcript: 'Releve mes mails',
                        isFinal: false
                    });
                }, 0);
            },
            async stop() {
                setTimeout(() => {
                    emit('stateChange', { state: 'idle' });
                }, 0);
                return true;
            },
            async onResult(handler) {
                listeners.result.add(handler);
                return () => listeners.result.delete(handler);
            },
            async onStateChange(handler) {
                listeners.stateChange.add(handler);
                return () => listeners.stateChange.delete(handler);
            },
            async onError(handler) {
                listeners.error.add(handler);
                return () => listeners.error.delete(handler);
            }
        }
    }
};

const idleRuntime = createVoiceSessionRuntime();
const idleVoice = createVoiceService({
    env: idleEnv,
    sessionRuntime: idleRuntime,
    aiPlanner: { async plan() { return null; } }
});

const idleStarted = await idleVoice.stt.start({
    lang: 'fr-FR',
    partial: true,
    silenceMs: 5
});

const idleFinal = await idleStarted.promise;
assert.equal(idleFinal.text, 'Releve mes mails', 'native Tauri STT should finalize from the last partial when the bridge returns to idle');
assert.equal(idleRuntime.getSession(idleStarted.session_id).transcript.final, 'Releve mes mails', 'idle finalization should preserve the last partial transcript');

resetListeners();

const manualStopEnv = {
    __TAURI__: {
        stt: {
            async checkPermission() {
                return {
                    microphone: 'granted',
                    speechRecognition: 'granted'
                };
            },
            async start() {
                emit('stateChange', { state: 'listening' });
                setTimeout(() => {
                    emit('result', {
                        transcript: 'Brouillon',
                        isFinal: false
                    });
                }, 0);
            },
            async stop() {
                setTimeout(() => {
                    emit('stateChange', { state: 'idle' });
                }, 0);
                return true;
            },
            async onResult(handler) {
                listeners.result.add(handler);
                return () => listeners.result.delete(handler);
            },
            async onStateChange(handler) {
                listeners.stateChange.add(handler);
                return () => listeners.stateChange.delete(handler);
            },
            async onError(handler) {
                listeners.error.add(handler);
                return () => listeners.error.delete(handler);
            }
        }
    }
};

const manualRuntime = createVoiceSessionRuntime();
const manualVoice = createVoiceService({
    env: manualStopEnv,
    sessionRuntime: manualRuntime,
    aiPlanner: { async plan() { return null; } }
});

const manualStarted = await manualVoice.stt.start({
    lang: 'fr-FR',
    partial: true,
    silenceMs: 5000
});

const manualStoppedPromise = manualVoice.stt.stop(manualStarted.session_id);
const manualStopped = await manualStoppedPromise;
assert.equal(manualStopped.cancelled, true, 'manual stop should resolve as a cancelled voice turn');
assert.equal(manualStopped.text, '', 'manual stop should not promote the partial transcript into a final utterance');

resetListeners();

const commitRuntime = createVoiceSessionRuntime();
const commitVoice = createVoiceService({
    env: manualStopEnv,
    sessionRuntime: commitRuntime,
    aiPlanner: { async plan() { return null; } }
});

const commitStarted = await commitVoice.stt.start({
    lang: 'fr-FR',
    partial: true,
    silenceMs: 5000
});

const commitStopped = await commitVoice.stt.stop(commitStarted.session_id, {
    commitPartial: true
});
assert.equal(commitStopped.cancelled, undefined, 'commit stop should finalize instead of cancelling the voice turn');
assert.equal(commitStopped.text, 'Brouillon', 'commit stop should promote the latest partial transcript into a final utterance');
assert.equal(commitRuntime.getSession(commitStarted.session_id).transcript.final, 'Brouillon', 'commit stop should persist the promoted partial transcript');

resetListeners();

let recoveredStartCalls = 0;
const recoveryEnv = {
    __TAURI__: {
        stt: {
            async checkPermission() {
                return {
                    microphone: 'granted',
                    speechRecognition: 'granted'
                };
            },
            async start() {
                recoveredStartCalls += 1;
                if (recoveredStartCalls === 1) {
                    throw new Error('Recording error: Already listening');
                }
                emit('stateChange', { state: 'listening' });
                setTimeout(() => {
                    emit('result', {
                        transcript: 'Lis mes mails',
                        isFinal: true,
                        confidence: 0.88
                    });
                }, 0);
            },
            async stop() {
                setTimeout(() => {
                    emit('stateChange', { state: 'idle' });
                }, 0);
                return true;
            },
            async onResult(handler) {
                listeners.result.add(handler);
                return () => listeners.result.delete(handler);
            },
            async onStateChange(handler) {
                listeners.stateChange.add(handler);
                return () => listeners.stateChange.delete(handler);
            },
            async onError(handler) {
                listeners.error.add(handler);
                return () => listeners.error.delete(handler);
            }
        }
    }
};

const recoveryRuntime = createVoiceSessionRuntime();
const recoveryVoice = createVoiceService({
    env: recoveryEnv,
    sessionRuntime: recoveryRuntime,
    aiPlanner: { async plan() { return null; } }
});

const recoveryStarted = await recoveryVoice.stt.start({
    lang: 'fr-FR',
    partial: true,
    silenceMs: 5
});

const recoveryFinal = await recoveryStarted.promise;
assert.equal(recoveredStartCalls, 2, 'native Tauri STT should retry once after an already-listening startup failure');
assert.equal(recoveryFinal.text, 'Lis mes mails', 'native Tauri STT recovery should still resolve with the final transcript');
assert.equal(recoveryRuntime.getSession(recoveryStarted.session_id).transcript.final, 'Lis mes mails', 'native Tauri STT recovery should finalize the runtime transcript after retry');

console.log('voice_service_tauri_stt: ok');
