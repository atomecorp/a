// Connected screens (R-212): the device key for the screen's page of an Android app. Its web view lies in a Presentation
// (tauri-plugin-mobile-host ExternalDisplay.kt) and has no Tauri bridge, so it cannot reach the device's Keystore that
// resumes the device's local session (auth_methods_login.js#deviceStore). The device's page, which has the bridge, asks
// it for the screen: the very `auth_device_key` command, its Rust owner checking each request (auth_device.rs). This is
// the session read the user chose for the screen (option A, 19 Nov. 2026, on iOS: ExternalDisplaySceneDelegate.swift).
// Both pages are of one origin (the app's Axum), so one browser channel joins them, from the screen's first request
// (its boot), before the pages' own link opens.
import { isExternalDisplayFollower } from './external_display_role.js';

const CHANNEL = 'eve.external_display.device_key.v1';
const COMMAND = 'auth_device_key';
const TIMEOUT_MS = 30_000;

const tauriInvoke = env => env?.__TAURI_INTERNALS__?.invoke || env?.__TAURI__?.core?.invoke || env?.__TAURI__?.invoke || null;

// The screen's page with no bridge of its own: an invoke that asks the device's page; anywhere else, none.
export const externalDisplayDeviceKeyInvoke = (env = globalThis.window) => {
    if (!isExternalDisplayFollower() || tauriInvoke(env) || typeof env?.BroadcastChannel !== 'function') return null;
    return (command, args) => new Promise((resolve, reject) => {
        if (command !== COMMAND) { reject(new Error(`external_display_device_key_refused:${command}`)); return; }
        const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const channel = new env.BroadcastChannel(CHANNEL);
        const done = (settle, value) => { env.clearTimeout(timer); channel.close(); settle(value); };
        const timer = env.setTimeout(() => done(reject, new Error('external_display_device_silent')), TIMEOUT_MS);
        channel.onmessage = ({ data }) => {
            if (data?.type !== 'device-key-result' || data.id !== id) return;
            if (data.error) done(reject, new Error(String(data.error))); else done(resolve, data.payload);
        };
        channel.postMessage({ type: 'device-key', id, args });
    });
};

// The device's page: it answers the screen's requests through its own bridge.
export const answerExternalDisplayDeviceKey = (env = globalThis.window) => {
    const invoke = tauriInvoke(env);
    if (isExternalDisplayFollower() || !invoke || typeof env?.BroadcastChannel !== 'function') return () => { };
    const channel = new env.BroadcastChannel(CHANNEL);
    channel.onmessage = ({ data }) => {
        if (data?.type !== 'device-key' || typeof data.id !== 'string') return;
        Promise.resolve()
            .then(() => invoke(COMMAND, data.args || {}))
            .then(payload => channel.postMessage({ type: 'device-key-result', id: data.id, payload, error: null }),
                error => channel.postMessage({ type: 'device-key-result', id: data.id, payload: null,
                    error: String(error?.message || error || 'auth_protected_device_key_unavailable') }));
    };
    return () => channel.close();
};
