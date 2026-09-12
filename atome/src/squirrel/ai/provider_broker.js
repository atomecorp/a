import { getSessionState } from '../apis/unified/adole_api/session.js';
import { aiQuotaTracker } from './quota_tracker.js';
import { reportRuntimeError } from '../runtime_errors.js';

// A refusal that comes from the LINK, not from the provider.
//
// On the native lane (iOS and desktop Tauri) provider traffic is relayed by the
// host, which authenticates with the remote sync credential that
// `configureTauriRemoteSync()` writes — and it only ever wrote it while
// handling a login. A rotated remote token, a relaunch that restored the
// session without logging in again, or a local principal that changed therefore
// left the relay with nothing to authenticate with, and it answers one of these
// instead of a provider error. The web lane already repairs that by minting the
// token on demand; the native lane had no recovery at all, so the assistant and
// the AI key status stayed dead until the next manual login — which is exactly
// the “key status unavailable — check the connection” the iOS app reports.
// These four are refused BEFORE the frame reaches the provider — the relay had
// no credential, or the socket to it never carried the request — so replaying
// them costs nothing.
const RELAY_PREFLIGHT_FAILURES = new Set([
    'provider_principal_unavailable',
    'provider_connection_failed',
    'provider_connection_timeout',
    'not_authenticated'
]);
// A channel that closed while the request was already pending may well have
// reached the provider. Replaying a completion there would ask — and bill — for
// the same answer twice, so only the credential actions, which are idempotent,
// are retried on it.
const RELAY_CLOSED_FAILURE = 'provider_connection_closed';
const IDEMPOTENT_PROVIDER_ACTIONS = new Set(['credential.status', 'credential.store', 'credential.remove']);
const isRelinkable = (action, error) => RELAY_PREFLIGHT_FAILURES.has(error)
    || (error === RELAY_CLOSED_FAILURE && IDEMPOTENT_PROVIDER_ACTIONS.has(action));

// A credential probe is a question for OUR OWN server, answered in
// milliseconds. Only a model call deserves minutes. Sharing one three-minute
// timeout is why the AI key row sat silent for three minutes on a host whose
// remote never answers the route at all, and then reported nothing better than
// “check the connection”.
const PROVIDER_ACTION_TIMEOUT_MS = Object.freeze({
    'credential.status': 15000,
    'credential.store': 25000,
    'credential.remove': 15000
});
const DEFAULT_PROVIDER_TIMEOUT_MS = 180000;

// The transport's own shape for “nobody answered”: it RESOLVES with this rather
// than rejecting, so it must not be read as a refusal by the provider.
const isTransportSilence = (result) => result?.status === 0
    || String(result?.error || '').trim().toLowerCase() === 'request timeout';

// Online provider traffic uses the platform’s authenticated application socket. The application never retrieves a stored OpenAI credential.
export const requestProviderService = async (action, payload = {}, {
    expectedPrincipal = null, signal = null, onProgress = null, transport = null, usageTracker = aiQuotaTracker, principal = () => getSessionState()?.user?.id
} = {}) => {
    signal?.throwIfAborted();
    const requestPrincipal = principal();
    if (expectedPrincipal !== null && requestPrincipal !== expectedPrincipal) throw new Error('provider_principal_changed');
    let token;
    // Returns the token to retry with once the host relay owns a usable remote
    // link again, or a typed reason when the link itself cannot be rebuilt.
    let relinkNative = null;
    if (!transport) {
        const { FastifyAdapter, TauriAdapter } = await import('../apis/unified/adole.js');
        const { isTauriRuntime } = await import('../apis/unified/adole_api/runtime.js');
        const adapter = isTauriRuntime() ? TauriAdapter : FastifyAdapter;
        const { configureTauriRemoteSync, ensureFastifyToken } = await import('../apis/unified/adole_api/auth_fastify_token.js');
        if (getSessionState()?.mode !== 'authenticated') throw new Error('not_authenticated');
        if (adapter === FastifyAdapter && !adapter.getToken()) {
            const auth = await ensureFastifyToken();
            if (!auth?.ok) throw new Error('provider_principal_unavailable');
        }
        transport = adapter.ws;
        token = adapter.getToken();
        if (adapter === TauriAdapter && !token) throw new Error('not_authenticated');
        if (adapter === TauriAdapter) relinkNative = async () => {
            const auth = await ensureFastifyToken();
            if (!auth?.ok) return { reason: auth?.reason || 'provider_principal_unavailable' };
            // `ensureFastifyToken` reports the sync result it already performed;
            // the `unverified` path performs none, and that path is the common
            // one when the socket was briefly unreachable.
            const sync = auth.sync || await configureTauriRemoteSync();
            if (sync?.ok !== true) return { reason: sync?.reason || 'sync_identity_configuration_failed' };
            return { token: adapter.getToken() };
        };
    }
    signal?.throwIfAborted();
    const requestId = globalThis.crypto.randomUUID();
    const cancel = () => {
        void transport.send({ type: 'ai-provider', action: 'cancel', operation_id: requestId, token }).catch(error => reportRuntimeError(error, 'ai:provider:cancel'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    const attempt = () => {
        if (principal() !== requestPrincipal) throw new Error('provider_principal_changed');
        return transport.send({
            type: 'ai-provider', action, requestId, token,
            ...(action === 'credential.store' ? { key: payload.key } : { payload })
        }, {
            timeoutMs: PROVIDER_ACTION_TIMEOUT_MS[action] ?? DEFAULT_PROVIDER_TIMEOUT_MS,
            signal,
            onProgress: event => { if (!signal?.aborted) onProgress?.(event); }
        });
    };
    try {
        let result = await attempt();
        signal?.throwIfAborted();
        let linkReason = null;
        if (result?.ok !== true && result?.success !== true
            && relinkNative && isRelinkable(action, String(result?.error || ''))) {
            const relinked = await relinkNative();
            signal?.throwIfAborted();
            if (relinked?.token) {
                token = relinked.token;
                result = await attempt();
                signal?.throwIfAborted();
            } else linkReason = relinked?.reason || null;
        }
        if (result?.ok !== true && result?.success !== true) {
            // Silence is not a refusal, and saying “the AI provider did not
            // answer” about it is wrong twice over: the request never left our
            // own backend, and the socket carrying it is demonstrably alive —
            // it answers `ping`, `auth` and `atome` on the same connection. A
            // remote that answers everything EXCEPT this route is a remote that
            // does not implement it yet.
            const error = new Error(isTransportSilence(result)
                ? 'provider_route_unanswered'
                : (result?.error || 'provider_request_failed'));
            error.http_status = result?.http_status;
            // The relay's own word for it is “no principal”; the reason the link
            // could not be rebuilt is the only actionable half.
            if (linkReason) error.link_reason = linkReason;
            throw error;
        }
        if (principal() !== requestPrincipal) throw new Error('provider_principal_changed');
        const data = result.data ?? result;
        usageTracker.recordProviderUsage(data, action, payload);
        return data;
    } finally {
        signal?.removeEventListener('abort', cancel);
    }
};

export const encodeProviderFile = async (file, env = globalThis) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!bytes.length || bytes.length > 20_000_000) throw new Error('provider_file_size_invalid');
    let text = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return env.btoa(text);
};

export const decodeProviderBytes = (base64, env = globalThis) => {
    const text = env.atob(String(base64 || ''));
    return Uint8Array.from(text, character => character.charCodeAt(0));
};
