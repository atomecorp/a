// Shared incremental SSE decoder. Transport chunk boundaries are unrelated to
// UTF-8 characters, SSE lines and provider events.
// Decode failure categories at the same boundary as events and bytes. Provider
// messages and arbitrary codes can contain credentials; only known codes travel.
export const openAiFailure = (body, defaultCode = 'provider_request_failed', httpStatus = null) => {
    const failure = body?.response?.status_details?.error || body?.response?.error || body?.error || body;
    // Specific codes before the `invalid_request_error` type they arrive with: a
    // refused model, a spending cap or an inactive billing is told as itself.
    const known = ['invalid_api_key', 'insufficient_quota', 'rate_limit_exceeded', 'model_not_found', 'invalid_model',
        'billing_hard_limit_reached', 'billing_not_active',
        'invalid_request_error', 'permission_denied', 'server_error', 'context_length_exceeded',
        'session_expired', 'provider_connection_closed'];
    const code = [failure?.code, failure?.type].find(value => known.includes(value));
    const error = new Error(code || defaultCode);
    error.provider_code = code || ''; error.http_status = httpStatus;
    return error;
};

// The text of a completed Responses result: its message items' output_text parts.
export const readResponseText = response => (response?.output || []).filter(item => item.type === 'message')
    .flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('');
export async function* readOpenAiEvents(body, { signal, maxEventBytes = 4_000_000 } = {}) {
    if (!body?.getReader) throw new Error('provider_stream_required');
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            signal?.throwIfAborted();
            const { value, done } = await reader.read();
            signal?.throwIfAborted();
            buffer += decoder.decode(value, { stream: !done });
            let match;
            while ((match = /\r?\n\r?\n/.exec(buffer))) {
                const block = buffer.slice(0, match.index);
                buffer = buffer.slice(match.index + match[0].length);
                if (block.length > maxEventBytes) throw new Error('provider_event_too_large');
                const data = block.split(/\r?\n/).filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).replace(/^ /, '')).join('\n');
                if (data === '[DONE]') return;
                if (data) yield JSON.parse(data);
            }
            if (buffer.length > maxEventBytes) throw new Error('provider_event_too_large');
            if (done) {
                if (buffer.trim()) throw new Error('provider_stream_truncated');
                return;
            }
        }
    } finally {
        signal?.removeEventListener('abort', abort);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

// Bound provider binary responses before base64 expansion and WebSocket delivery.
export const readProviderBytes = async (body, { signal, maxBytes = 20_000_000 } = {}) => {
    if (!body?.getReader) throw new Error('provider_stream_required');
    const reader = body.getReader();
    const chunks = []; let size = 0;
    try {
        while (true) {
            signal?.throwIfAborted();
            const { value, done } = await reader.read();
            signal?.throwIfAborted();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new Error('provider_result_too_large');
            chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return bytes;
    } finally { await reader.cancel(); reader.releaseLock(); }
};
