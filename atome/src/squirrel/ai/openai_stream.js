// Shared incremental SSE decoder. Transport chunk boundaries are unrelated to
// UTF-8 characters, SSE lines and provider events.
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
