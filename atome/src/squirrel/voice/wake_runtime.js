import { createWakeDetectorBackend } from './wake_detector.js';
import { runWakeEnrollment } from './wake_enrollment.js';

import { normalizeAssistantPreferences } from './wake_preferences.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
export { normalizeAssistantPreferences } from './wake_preferences.js';

// Owns the standby lifecycle. The enabled profile preference arms this device: listening
// runs in the foreground only, and an error disarms it until the preference is set again.
// Every snapshot carries the cause of its last transition so voice surfaces can answer
// a spoken or explicit request out loud without announcing failures at every launch.
export const createWakeRuntime = ({ env = globalThis, backend = createWakeDetectorBackend({ env }) } = {}) => {
    const listeners = new Set(), blockers = new Set();
    let engine = null, pending = Promise.resolve(), generation = 0, disposed = false;
    let enabled = false, armed = false, assistant = null, unsubscribe = () => {};
    let captureRetry = null;
    // eVe's assistant serves an account only (a guest has no exchange); a surface the phrase
    // is routed to instead (the first launch's guide) serves whoever it guides.
    let routed = false;
    const served = () => routed || getSessionState().mode === 'authenticated';
    let wasServed = served();
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
        const known = ['wake_model_missing', 'wake_capture_busy', 'wake_capture_overrun', 'wake_capture_failed',
            'wake_engine_failed', 'wake_native_capture_unavailable', 'microphone_permission_denied'];
        return known.includes(code) ? code : ['NotAllowedError', 'SecurityError', 'PermissionError'].includes(error?.name) || code === 'microphone_permission_denied'
            ? 'microphone_permission_denied' : 'wake_engine_failed';
    };
    const state = { phase: 'off', error: '', detected: false, cause: 'profile', locale: 'fr-FR', phrase: 'Ève, écoute-moi' };
    const snapshot = () => ({ ...state, enabled, armed });
    const emit = (phase, error = '') => { state.phase = phase; state.error = error; listeners.forEach(fn => fn(snapshot())); return snapshot(); };
    const foreground = () => env.document?.visibilityState !== 'hidden';
    const desired = () => !disposed && armed && enabled && foreground() && !blockers.size && served();
    const release = async () => { const current = engine; engine = null; await current?.close(); };
    const reportError = error => {
        generation++;
        if (error.message === 'wake_capture_busy') {
            blockers.add('external_capture');
            pending = pending.then(release).then(() => { emit('suspended', 'wake_capture_busy'); retryCapture(); })
                .catch(failure => { armed = false; return emit('unavailable', safeError(failure)); });
            return pending;
        }
        clearCaptureRetry();
        armed = false;
        void engine?.close().catch(() => {});
        pending = pending.then(release).then(() => emit('unavailable', safeError(error)))
            .catch(failure => emit('unavailable', safeError(failure)));
        return pending;
    };
    const detected = async token => {
        if (token !== generation || !desired() || state.phase !== 'listening') return;
        generation++; state.detected = true;
        blockers.add('activation');
        try {
            await release();
            if (!enabled || !armed || !foreground()) return;
            if (!assistant) {
                const { bootstrapEveAssistant } = await import('../../../../eVe/voice/assistant/assistant_runtime.js');
                api.connectAssistant(bootstrapEveAssistant({ env }));
            }
            state.cause = 'detection';
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
            if (!desired()) {
                // Switched off or sent to the background: the engine's memory is returned (a
                // suspended app with less memory is reclaimed later). Other suspensions keep it
                // for a fast resume.
                if (!enabled || disposed || !foreground()) backend.release?.();
                return emit(!enabled ? 'off' : blockers.has('assistant') ? 'assistant' : 'suspended');
            }
            emit('starting');
            let candidate;
            try {
                candidate = await backend.create({ onDetection: () => { void detected(token); },
                    onError: error => { if (token === generation) void reportError(error); } });
                if (token !== generation || !desired()) { await candidate.close(); return snapshot(); }
                engine = candidate;
                await candidate.start();
                if (token !== generation || !desired()) { await release(); return snapshot(); }
                // A later failure was not asked for by anyone: it is reported silently.
                state.cause = 'profile';
                return emit('listening');
            } catch (error) {
                if (engine === candidate) await release(); else await candidate?.close();
                if (token === generation) {
                    if (error.message === 'wake_capture_busy') { blockers.add('external_capture'); retryCapture(); return emit('suspended', error.message); }
                    armed = false; return emit('unavailable', safeError(error));
                }
                return snapshot();
            }
        }).catch(error => { armed = false; return emit('unavailable', safeError(error)); });
        return pending;
    };
    const onVisibility = () => { clearCaptureRetry(); if (blockers.has('external_capture')) retryCapture(); void reconcile(); };
    const onLogout = () => { enabled = false; void api.stop(); };
    const onAuthChecked = () => { if (served() !== wasServed) { wasServed = served(); void reconcile(); } };
    const onProfile = event => { void api.setEnabled(normalizeAssistantPreferences(event.detail?.preferences?.assistant).voiceActivation); };
    // A page kept in the back/forward cache comes back armed.
    const onPageHide = () => { void api.suspend('page_hidden'); };
    const onPageShow = () => { void api.resume('page_hidden'); };
    const onBlur = () => { void api.suspend('window_focus'); };
    const onFocus = () => { void api.resume('window_focus'); };
    env.document?.addEventListener?.('visibilitychange', onVisibility);
    env.addEventListener?.('pagehide', onPageHide);
    env.addEventListener?.('pageshow', onPageShow);
    env.addEventListener?.('blur', onBlur);
    env.addEventListener?.('focus', onFocus);
    // `squirrel:user-logged-in` also announces each renewal of the same account's
    // session: only a sign-out or a switch (`squirrel:user-logged-out`) disarms.
    env.addEventListener?.('squirrel:user-logged-out', onLogout);
    env.addEventListener?.('squirrel:auth-checked', onAuthChecked);
    env.addEventListener?.('eve:profile-preferences-updated', onProfile);
    const api = {
        getState: snapshot,
        subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
        // An unchanged value keeps the current arming, so an error is not retried on every profile
        // publication; an explicit switch ('preference') re-arms a device an error disarmed.
        setEnabled(value, { cause = 'profile' } = {}) {
            if (enabled === (value === true) && (cause !== 'preference' || armed || !enabled)) return Promise.resolve(snapshot());
            enabled = armed = value === true; state.detected = false; state.cause = cause;
            if (!enabled) { clearCaptureRetry(); blockers.delete('external_capture'); }
            return reconcile();
        },
        start() { if (!enabled) return Promise.reject(new Error('wake_disabled')); armed = true; state.detected = false; return reconcile(); },
        stop() { clearCaptureRetry(); blockers.delete('external_capture'); armed = false; return reconcile(); },
        suspend(reason = 'capture') { blockers.add(reason); return reconcile(); },
        resume(reason = 'capture') { blockers.delete(reason); return reconcile(); },
        hasPersonalModel: () => backend.hasVerifier(),
        // Standby is suspended while enrollment owns the microphone, then restarts with the new verifier.
        async enroll({ prompt, signal }) {
            state.cause = 'enrollment';
            await api.suspend('enrollment');
            try { return await runWakeEnrollment({ backend, prompt, signal }); }
            finally { await api.resume('enrollment'); }
        },
        // `null`: no assistant yet (a detection bootstraps eVe's); the first launch routes it to its guide.
        connectAssistant(value) {
            unsubscribe(); assistant = value || null;
            const wasRouted = routed;
            routed = !!assistant && assistant !== env.eveAssistantApi;
            wasServed = served();
            if (!assistant) { unsubscribe = () => {}; if (blockers.delete('assistant') || wasRouted) void reconcile(); return; }
            if (wasRouted !== routed) void reconcile();
            unsubscribe = assistant.subscribe(current => {
                const wasActive = blockers.has('assistant');
                // An assistant that failed to start holds no microphone: standby listens again,
                // so the phrase can retry. The assistant shows and speaks its own failure.
                const holding = current.active && !(current.phase === 'error' && !current.connected && !current.microphoneActive);
                if (holding) blockers.add('assistant'); else blockers.delete('assistant');
                if (wasActive !== holding) void reconcile();
            });
        },
        async dispose() {
            disposed = true; await api.stop(); unsubscribe();
            env.document?.removeEventListener?.('visibilitychange', onVisibility);
            env.removeEventListener?.('pagehide', onPageHide);
            env.removeEventListener?.('pageshow', onPageShow);
            env.removeEventListener?.('blur', onBlur);
            env.removeEventListener?.('focus', onFocus);
            env.removeEventListener?.('squirrel:user-logged-out', onLogout);
            env.removeEventListener?.('squirrel:auth-checked', onAuthChecked);
            env.removeEventListener?.('eve:profile-preferences-updated', onProfile); listeners.clear();
        }
    };
    if (env.eveAssistantApi) api.connectAssistant(env.eveAssistantApi);
    // Preferences not yet published leave the device off until the profile announces them.
    if (env.__eveProfilePreferences) void api.setEnabled(normalizeAssistantPreferences(env.__eveProfilePreferences.assistant).voiceActivation);
    return api;
};
