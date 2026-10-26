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
// These are refused BEFORE the frame reaches the provider — the relay had no
// credential, the socket to it never carried the request, or the remote's
// session gate refused the relay's expired access token (15 min TTL) — so
// replaying them costs nothing.
const RELAY_PREFLIGHT_FAILURES = new Set([
    'provider_principal_unavailable',
    'provider_connection_failed',
    'provider_connection_timeout',
    'not_authenticated',
    'auth_session_invalid'
]);
// A channel that closed while the request was already pending may well have
// reached the provider. Replaying a completion there would ask — and bill — for
// the same answer twice, so only the credential actions, which are idempotent,
// are retried on it.
const RELAY_CLOSED_FAILURE = 'provider_connection_closed';
const IDEMPOTENT_PROVIDER_ACTIONS = new Set(['models', 'credential.status', 'credential.store', 'credential.remove',
    'secret.list', 'secret.read', 'secret.store', 'secret.remove']);
const isRelinkable = (action, error) => RELAY_PREFLIGHT_FAILURES.has(error)
    || (error === RELAY_CLOSED_FAILURE && IDEMPOTENT_PROVIDER_ACTIONS.has(action));

// A credential probe is a question for OUR OWN server, answered in
// milliseconds. Only a model call deserves minutes. Sharing one three-minute
// timeout is why the AI key row sat silent for three minutes on a host whose
// remote never answers the route at all, and then reported nothing better than
// “check the connection”.
const PROVIDER_ACTION_TIMEOUT_MS = Object.freeze({
    models: 15000,
    'credential.status': 15000,
    'credential.store': 25000,
    'credential.remove': 15000,
    // The account's own secrets: a read or a write in our own server's vault.
    'secret.list': 15000,
    'secret.read': 15000,
    'secret.store': 15000,
    'secret.remove': 15000,
    // Audio generation is an async job: every call is a short question, the
    // minutes are spent between polls, never inside one request.
    'audio.providers': 15000,
    'audio.capabilities': 15000,
    'audio.generate': 60000,
    'audio.job': 30000,
    'audio.output': 120000,
    'video.providers': 15000,
    'video.capabilities': 15000,
    'video.estimate': 15000,
    'video.generate': 60000,
    'video.job': 30000,
    'video.cancel': 30000,
    'video.output': 180000,
    // Social sharing: the official login page waits for the user; a provider
    // may process a long video for minutes inside one publish request.
    'social.accounts': 30000,
    'social.connect.start': 15000,
    'social.connect.await': 660000,
    'social.connect.cancel': 15000,
    'social.disconnect': 30000,
    'social.prepare': 300000,
    'social.publish': 1200000,
    'social.status': 300000,
    'social.cancel': 60000,
    'social.handoff': 15000,
    'social.confirm': 15000,
    'music.get_state': 30000, 'music.connect': 15000, 'music.await_connection': 660000,
    'music.cancel_connection': 15000, 'music.disconnect': 15000
});
const DEFAULT_PROVIDER_TIMEOUT_MS = 180000;

// The transport RESOLVES its own failures (status 0) rather than rejecting, so
// none of them may be read as a refusal by the provider. Only a timeout is
// silence from the far end; the others say the link itself was not there —
// not open yet while the app starts, lost mid-request, or the send failed —
// and blaming a missing server route for those is false (the same route
// answers a moment later).
const isTransportTimeout = (result) => String(result?.error || '').trim().toLowerCase() === 'request timeout';
const isTransportFailure = (result) => result?.status === 0 && !isTransportTimeout(result);
// The frame never left this device (no open link): replaying it is always safe.
const neverSent = (result) => isTransportFailure(result) && String(result?.error || '') === 'Server unreachable';
// A voice connection not yet answered opens no billed turn: a new offer simply
// replaces it, so it is replayed once like the idempotent actions.
const isReplayableOnLinkLoss = (action) => IDEMPOTENT_PROVIDER_ACTIONS.has(action) || action === 'realtime-connect';

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
        const { ensureFastifyToken } = await import('../apis/unified/adole_api/auth_fastify_token.js');
        if (getSessionState()?.mode !== 'authenticated') throw new Error('not_authenticated');
        if (adapter === FastifyAdapter && !adapter.getToken()) {
            const auth = await ensureFastifyToken();
            if (!auth?.ok) throw new Error('provider_principal_unavailable');
        }
        transport = adapter.ws;
        token = adapter.getToken();
        if (adapter === TauriAdapter && !token) throw new Error('not_authenticated');
        // `ensureFastifyToken` returns the host relay configuration it performed (or
        // shares the one in flight, or the one already done for these sessions):
        // configuring it again doubled the work at every launch, behind the boot's
        // writes, and the second configuration timed out.
        if (adapter === TauriAdapter) relinkNative = async () => {
            const auth = await ensureFastifyToken();
            if (!auth?.ok) return { reason: auth?.reason || 'provider_principal_unavailable' };
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
            ...(action === 'credential.store'
                ? { key: payload.key, ...(payload.provider ? { provider: payload.provider } : {}) }
                : { payload })
        }, {
            timeoutMs: PROVIDER_ACTION_TIMEOUT_MS[action] ?? DEFAULT_PROVIDER_TIMEOUT_MS,
            signal,
            onProgress: event => { if (!signal?.aborted) onProgress?.(event); }
        });
    };
    try {
        let result = await attempt();
        signal?.throwIfAborted();
        // The transport reopens its link on the next send; replaying is safe when
        // the frame never left, or for the actions a replay cannot double.
        if (neverSent(result) || (isTransportFailure(result) && isReplayableOnLinkLoss(action))) {
            result = await attempt();
            signal?.throwIfAborted();
        }
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
            const error = new Error(isTransportTimeout(result) ? 'provider_route_unanswered'
                : isTransportFailure(result) ? 'provider_connection_failed'
                    : (result?.error || 'provider_request_failed'));
            error.http_status = result?.http_status;
            if (result?.detail) error.detail = result.detail;
            if (result?.provider_code) error.provider_code = result.provider_code;
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
