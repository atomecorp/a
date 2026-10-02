// Sealed native channel for health data.
//
// The native invoke function is captured when this module is evaluated, at
// boot, before any project code is loaded. `open()` asks the host for a
// channel token; the host issues ONE token per page load and refuses every
// later `open`, so code loaded afterwards cannot obtain its own channel. The
// token never leaves this closure. Values only travel in invoke replies, never
// on a window event.
//
// Identity is NOT taken from JavaScript: every call carries the local session
// token and the host verifies it (iOS `AiSRuntime.verifyToken`, Android the
// local Axum `me` action) before touching the health store.

const HOST_UNSUPPORTED = Object.freeze({ ok: false, error: 'health_host_unsupported' });

const isAndroidUserAgent = (env) => /Android/i.test(String(env?.navigator?.userAgent || ''));

// Resolves the platform invoke once. iOS app/AUv3: the WKWebView bridge (AUv3
// answers `health_host_unsupported` natively). Tauri: the single gated app
// command `health_invoke` (desktop answers unsupported, Android forwards to
// Health Connect). Anything else: no native health.
export function resolveNativeHealthInvoke(env = globalThis) {
    const ios = env?.__ATOME_IOS_NATIVE_INVOKE;
    if (typeof ios === 'function') {
        const bound = ios.bind(env);
        return { host: env.__HOST_ENV === 'auv3' ? 'ios_auv3' : 'ios', invoke: (command, payload) => bound(command, payload) };
    }
    const tauriInvoke = env?.__TAURI_INTERNALS__?.invoke;
    if (typeof tauriInvoke === 'function') {
        const bound = tauriInvoke.bind(env.__TAURI_INTERNALS__);
        return {
            host: isAndroidUserAgent(env) ? 'android' : 'tauri_desktop',
            invoke: (command, payload) => bound('health_invoke', { command, payload })
        };
    }
    return { host: 'web', invoke: null };
}

const unwrap = (reply) => {
    if (reply && typeof reply === 'object' && (reply.ok === false || reply.success === false)) {
        const error = new Error(reply.error || 'health_native_error');
        error.code = reply.error || 'health_native_error';
        throw error;
    }
    return reply?.result ?? reply;
};

export function createHealthChannel({ invoke = null, host = 'web', getAuthToken = () => null } = {}) {
    let token = null;
    let opening = null;
    let refused = null;

    const open = async () => {
        if (token) return true;
        if (refused) return false;
        if (typeof invoke !== 'function') {
            refused = 'health_host_unsupported';
            return false;
        }
        if (!opening) {
            opening = Promise.resolve()
                .then(() => invoke('health_channel_open', {}))
                .then(unwrap)
                .then((reply) => {
                    if (typeof reply?.channel !== 'string' || reply.channel.length < 16) throw new Error('health_channel_invalid');
                    token = reply.channel;
                    return true;
                })
                .catch((error) => {
                    refused = error?.code || error?.message || 'health_channel_refused';
                    return false;
                });
        }
        return opening;
    };

    const call = async (command, payload = {}) => {
        if (!(await open())) return { ...HOST_UNSUPPORTED, error: refused || HOST_UNSUPPORTED.error };
        const auth = await getAuthToken();
        try {
            const reply = await invoke(command, { ...payload, channel: token, auth: typeof auth === 'string' ? auth : null });
            return { ok: true, result: unwrap(reply) };
        } catch (error) {
            return { ok: false, error: error?.code || error?.message || 'health_native_error' };
        }
    };

    return Object.freeze({
        host,
        open,
        call,
        refusal: () => refused,
        isOpen: () => Boolean(token)
    });
}
