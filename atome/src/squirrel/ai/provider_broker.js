import { getSessionState } from '../apis/unified/adole_api/session.js';
import { aiQuotaTracker } from './quota_tracker.js';
import { reportRuntimeError } from '../runtime_errors.js';
// Online provider traffic uses the platform’s authenticated application socket. The application never retrieves a stored OpenAI credential.
export const requestProviderService = async (action, payload = {}, {
    signal = null, onProgress = null, transport = null, usageTracker = aiQuotaTracker, principal = () => getSessionState()?.user?.id
} = {}) => {
    signal?.throwIfAborted();
    const requestPrincipal = principal();
    let token;
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
    }
    signal?.throwIfAborted();
    const requestId = globalThis.crypto.randomUUID();
    const cancel = () => {
        void transport.send({ type: 'ai-provider', action: 'cancel', operation_id: requestId, token }).catch(error => reportRuntimeError(error, 'ai:provider:cancel'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        const result = await transport.send({
            type: 'ai-provider', action, requestId, token,
            ...(action === 'credential.store' ? { key: payload.key } : { payload })
        }, { timeoutMs: 180000, signal, onProgress: event => { if (!signal?.aborted) onProgress?.(event); } });
        signal?.throwIfAborted();
        if (result?.ok !== true && result?.success !== true) {
            const error = new Error(result?.error || 'provider_request_failed');
            error.http_status = result?.http_status;
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
