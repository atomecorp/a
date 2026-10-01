import { createPorcupineWakeBackend } from './wake_porcupine.js';

import { normalizeAssistantPreferences } from './wake_preferences.js';
export { normalizeAssistantPreferences } from './wake_preferences.js';

// Owns device consent and standby lifecycle; profile synchronization never arms a microphone.
export const createWakeRuntime = ({ env = globalThis, backend = createPorcupineWakeBackend({ env }),
    signalReady = async () => {
        const context = new env.AudioContext();
        try {
            await context.resume();
            const oscillator = context.createOscillator(), gain = context.createGain();
            oscillator.frequency.value = 880; gain.gain.value = 0.08;
            oscillator.connect(gain); gain.connect(context.destination);
            oscillator.start(); oscillator.stop(context.currentTime + 0.12);
            await new Promise(resolve => { oscillator.onended = resolve; });
        } finally { await context.close(); }
    }
} = {}) => {
    const listeners = new Set(), blockers = new Set();
    let engine = null, pending = Promise.resolve(), generation = 0, disposed = false;
    let enabled = false, armed = false, testing = false, testTimer = null, assistant = null, unsubscribe = () => {};
    let readiness = false, captureRetry = null;
    const clearCaptureRetry = () => { if (captureRetry !== null) env.clearTimeout(captureRetry); captureRetry = null; };
    const retryCapture = () => {
        clearCaptureRetry();
        if (!armed || !foreground() || disposed) return;
        captureRetry = env.setTimeout(async () => {
            captureRetry = null;
            try {
                if (await backend.captureAvailable?.()) { blockers.delete('external_capture'); await reconcile(); }
                else retryCapture();
            } catch { await reportError(new Error('wake_capture_failed')); }
        }, 1000);
    };
    const safeError = error => {
        const code = String(error?.message || '');
        const known = ['wake_key_missing', 'wake_model_missing', 'wake_model_origin_invalid', 'wake_vault_locked',
            'wake_principal_unavailable', 'wake_principal_changed', 'wake_capture_busy', 'wake_capture_overrun',
            'wake_capture_failed', 'wake_engine_failed', 'wake_native_capture_unavailable', 'wake_assistant_failed', 'wake_signal_failed'];
        return known.includes(code) ? code : ['NotAllowedError', 'SecurityError', 'PermissionError'].includes(error?.name) || code === 'microphone_permission_denied'
            ? 'microphone_permission_denied' : 'wake_engine_failed';
    };
    const state = { phase: 'off', error: '', detected: false, locale: 'fr-FR', phrase: 'Ève, écoute-moi' };
    const snapshot = () => ({ ...state, enabled, armed, testing });
    const emit = (phase, error = '') => { state.phase = phase; state.error = error; listeners.forEach(fn => fn(snapshot())); return snapshot(); };
    const foreground = () => env.document?.visibilityState !== 'hidden';
    const desired = () => !disposed && armed && (enabled || testing) && foreground() && !blockers.size;
    const release = async () => { const current = engine; engine = null; await current?.close(); };
    const cancelTest = () => { if (testTimer !== null) env.clearTimeout(testTimer); testTimer = null; testing = false; };
    const reportError = error => {
        generation++;
        if (error.message === 'wake_capture_busy') {
            blockers.add('external_capture');
            pending = pending.then(release).then(() => { emit('suspended', 'wake_capture_busy'); retryCapture(); })
                .catch(failure => { armed = false; cancelTest(); return emit('unavailable', safeError(failure)); });
            return pending;
        }
        clearCaptureRetry();
        armed = false; cancelTest();
        void engine?.close().catch(() => {});
        pending = pending.then(release).then(() => emit('unavailable', safeError(error)))
            .catch(failure => emit('unavailable', safeError(failure)));
        return pending;
    };
    const detected = async token => {
        if (token !== generation || !desired() || state.phase !== 'listening') return;
        generation++; state.detected = true;
        const testOnly = testing;
        blockers.add('activation');
        try {
            await release();
            if (testOnly) { cancelTest(); armed = false; emit('off'); return; }
            if (!enabled || !armed || !foreground()) return;
            if (!assistant) {
                const { bootstrapEveAssistant } = await import('../../../../eVe/voice/assistant/assistant_runtime.js');
                api.connectAssistant(bootstrapEveAssistant({ env }));
            }
            readiness = true;
            emit('assistant');
            await assistant.open({ source: 'wake_phrase' });
        } catch (error) { await reportError(error); }
        finally { blockers.delete('activation'); }
    };
    const reconcile = () => {
        const token = ++generation;
        // Cancel the owning acquisition immediately, including a pending native permission prompt.
        if (!desired()) void engine?.close().catch(() => {});
        pending = pending.then(async () => {
            await release();
            if (token !== generation) return snapshot();
            if (!desired()) return emit(!enabled && !testing ? 'off' : blockers.has('assistant') ? 'assistant' : 'suspended');
            emit('starting');
            let candidate;
            try {
                candidate = await backend.create({ onDetection: () => { void detected(token); },
                    onError: error => { if (token === generation) void reportError(error); } });
                if (token !== generation || !desired()) { await candidate.close(); return snapshot(); }
                engine = candidate;
                await candidate.start();
                if (token !== generation || !desired()) { await release(); return snapshot(); }
                return emit('listening');
            } catch (error) {
                if (engine === candidate) await release(); else await candidate?.close();
                if (token === generation) {
                    if (error.message === 'wake_capture_busy') { blockers.add('external_capture'); retryCapture(); return emit('suspended', error.message); }
                    armed = false; cancelTest(); return emit('unavailable', error.message || 'wake_engine_failed');
                }
                return snapshot();
            }
        }).catch(error => { armed = false; cancelTest(); return emit('unavailable', safeError(error)); });
        return pending;
    };
    const onVisibility = () => { clearCaptureRetry(); if (blockers.has('external_capture')) retryCapture(); void reconcile(); };
    const onLogout = () => { enabled = false; void api.stop(); };
    const onProfile = event => { void api.setEnabled(normalizeAssistantPreferences(event.detail?.preferences?.assistant).voiceActivation); };
    const onPageHide = () => { void api.stop(); };
    const onBlur = () => { void api.suspend('window_focus'); };
    const onFocus = () => { void api.resume('window_focus'); };
    env.document?.addEventListener?.('visibilitychange', onVisibility);
    env.addEventListener?.('pagehide', onPageHide);
    env.addEventListener?.('blur', onBlur);
    env.addEventListener?.('focus', onFocus);
    env.addEventListener?.('squirrel:user-logged-out', onLogout);
    env.addEventListener?.('squirrel:user-logged-in', onLogout);
    env.addEventListener?.('eve:profile-preferences-updated', onProfile);
    const api = {
        getState: snapshot,
        subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
        configure: config => backend.configure(config),
        setEnabled(value) { if (enabled === (value === true)) return Promise.resolve(snapshot()); enabled = value === true; if (!enabled) { clearCaptureRetry(); blockers.delete('external_capture'); armed = false; cancelTest(); } return reconcile(); },
        start() { if (!enabled) return Promise.reject(new Error('wake_disabled')); armed = true; state.detected = false; return reconcile(); },
        stop() { clearCaptureRetry(); blockers.delete('external_capture'); armed = false; readiness = false; cancelTest(); return reconcile(); },
        test() { cancelTest(); armed = true; testing = true; state.detected = false; testTimer = env.setTimeout(() => { void api.stop(); }, 30000); return reconcile(); },
        suspend(reason = 'capture') { blockers.add(reason); return reconcile(); },
        resume(reason = 'capture') { blockers.delete(reason); return reconcile(); },
        connectAssistant(value) {
            unsubscribe(); assistant = value;
            unsubscribe = assistant.subscribe(current => {
                const wasActive = blockers.has('assistant');
                if (current.active) blockers.add('assistant'); else blockers.delete('assistant');
                if (readiness && current.active && current.phase === 'listening' && current.microphoneActive) {
                    readiness = false;
                    void signalReady().catch(error => reportError(new Error('wake_signal_failed')));
                }
                if (readiness && current.error) { readiness = false; void reportError(new Error('wake_assistant_failed')); }
                if (wasActive !== current.active) void reconcile();
            });
        },
        async dispose() {
            disposed = true; await api.stop(); unsubscribe();
            env.document?.removeEventListener?.('visibilitychange', onVisibility);
            env.removeEventListener?.('pagehide', onPageHide);
            env.removeEventListener?.('blur', onBlur);
            env.removeEventListener?.('focus', onFocus);
            env.removeEventListener?.('squirrel:user-logged-out', onLogout);
            env.removeEventListener?.('squirrel:user-logged-in', onLogout);
            env.removeEventListener?.('eve:profile-preferences-updated', onProfile); listeners.clear();
        }
    };
    enabled = normalizeAssistantPreferences(env.__eveProfilePreferences?.assistant).voiceActivation;
    state.phase = enabled ? 'suspended' : 'off';
    if (env.eveAssistantApi) api.connectAssistant(env.eveAssistantApi);
    return api;
};
