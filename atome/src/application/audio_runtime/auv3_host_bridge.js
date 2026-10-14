// AUv3 host bridge — the JavaScript end of `WebViewManager.sendBridgeJSON`.
//
// The native side delivers every host message to `window.AUv3API._receiveFromSwift`
// (host tempo, host time and transport streams, purchase results…); this module
// owns that entry point and dispatches each message by its `action` to the
// subscribers of that action. It is a capability adapter (module 05 native
// exception): it carries host facts, never business state.
//
// Host clock: `subscribeAuv3HostClock` starts the native `startHostTimeStream`
// (50 ms `hostTimeUpdate`) on the first subscriber and stops it after the last.

import { hasSwiftBridge, isAuv3AudioRuntime } from './runtime_audio_backend.js';

const listenersByAction = new Map();
const clockListeners = new Set();
const state = { lastClock: null };

const swiftBridge = (env = globalThis) => env?.webkit?.messageHandlers?.swiftBridge || null;

export const isAuv3HostClockAvailable = (env = globalThis) => isAuv3AudioRuntime(env) && hasSwiftBridge(env);

export const sendAuv3HostAction = (action, body = {}, env = globalThis) => {
    const bridge = swiftBridge(env);
    if (typeof bridge?.postMessage !== 'function') return { ok: false, error: 'auv3_swift_bridge_unavailable' };
    bridge.postMessage({ ...body, action: String(action) });
    return { ok: true };
};

// Native messages arrive as plain objects (or JSON text from older callers).
export const receiveAuv3HostMessage = (message) => {
    let payload = message;
    if (typeof message === 'string') {
        try { payload = JSON.parse(message); } catch (_) { return { ok: false, error: 'auv3_host_message_invalid' }; }
    }
    const action = String(payload?.action || '').trim();
    if (!action) return { ok: false, error: 'auv3_host_message_action_missing' };
    const listeners = listenersByAction.get(action);
    listeners?.forEach((listener) => {
        try { listener(payload); } catch (error) { globalThis.console?.error?.('auv3_host_listener_failed', action, error); }
    });
    return { ok: true, action, delivered: listeners?.size || 0 };
};

export const subscribeAuv3HostMessages = (action, listener) => {
    const key = String(action || '').trim();
    if (!key || typeof listener !== 'function') return () => false;
    if (!listenersByAction.has(key)) listenersByAction.set(key, new Set());
    listenersByAction.get(key).add(listener);
    return () => listenersByAction.get(key)?.delete(listener);
};

// `{ positionSeconds, tempo, playing }` — the host playhead, as the host plays it.
const normalizeClock = (payload = {}) => ({
    positionSeconds: Math.max(0, Number(payload.positionSeconds) || 0),
    tempo: Number(payload.tempo) > 0 ? Number(payload.tempo) : 120,
    playing: payload.playing === true,
    receivedAt: Date.now()
});

let unsubscribeClockStream = null;

export const readAuv3HostClock = () => state.lastClock;

export const subscribeAuv3HostClock = (listener, env = globalThis) => {
    if (typeof listener !== 'function') return () => false;
    if (!isAuv3HostClockAvailable(env)) return () => false;
    clockListeners.add(listener);
    if (!unsubscribeClockStream) {
        const onClock = (payload) => {
            state.lastClock = normalizeClock(payload);
            clockListeners.forEach((entry) => entry(state.lastClock));
        };
        const offTime = subscribeAuv3HostMessages('hostTimeUpdate', onClock);
        const offTransport = subscribeAuv3HostMessages('hostTransport', (payload) => onClock({ ...state.lastClock, ...payload }));
        sendAuv3HostAction('startHostTimeStream', {}, env);
        sendAuv3HostAction('startHostStateStream', {}, env);
        unsubscribeClockStream = () => {
            offTime(); offTransport();
            sendAuv3HostAction('stopHostTimeStream', {}, env);
            sendAuv3HostAction('stopHostStateStream', {}, env);
            unsubscribeClockStream = null;
        };
    }
    if (state.lastClock) listener(state.lastClock);
    return () => {
        clockListeners.delete(listener);
        if (!clockListeners.size) unsubscribeClockStream?.();
        return true;
    };
};

export const installAuv3HostBridge = (env = globalThis) => {
    if (!env || typeof env !== 'object') return false;
    const api = env.AUv3API && typeof env.AUv3API === 'object' ? env.AUv3API : {};
    if (api._receiveFromSwift === receiveAuv3HostMessage) return true;
    api._receiveFromSwift = receiveAuv3HostMessage;
    env.AUv3API = api;
    return true;
};

installAuv3HostBridge(typeof window !== 'undefined' ? window : undefined);
