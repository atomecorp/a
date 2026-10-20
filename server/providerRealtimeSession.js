import WebSocket from 'ws';
import { createHash } from 'node:crypto';
import { openAiFailure } from '../atome/src/squirrel/ai/openai_stream.js';
import { OPENAI_MODALITY_MODELS } from '../atome/src/squirrel/ai/model_catalog_registry.js';

const sessions = new WeakMap();
const principals = new Map();
const ROOT = 'https://api.openai.com/v1/live/sessions';
// The page's data channel only listens: tool calls, their results and the
// hang-up travel through this server's sideband, never through the page.
const DATA_CHANNEL = Object.freeze({ allowed_client_events: [], allowed_server_events: [
    ...['session.started', 'session.input_transcript.delta', 'session.output_transcript.delta', 'session.delegation.created',
        'session.usage.updated', 'session.closed', 'error', 'info'].map(type => ({ type })),
    { type: 'response.event', response_event: 'response.completed' }
] });
const closeDetached = session => {
    void session.close().catch(() => console.warn('[OpenAI] Live voice remote cleanup failed'));
};
const catalog = tools => {
    if (!Array.isArray(tools) || tools.length > 96 || tools.some(tool => tool?.type !== 'function')) throw new Error('provider_tool_not_authorized');
    return tools;
};
const only = (value, fields) => value && typeof value === 'object' && Object.keys(value).every(field => fields.includes(field));
// The configuration the page may choose; the server owns the model pair and the channel rights.
const liveConfiguration = configuration => {
    const backend = configuration.delegation?.responses;
    if (!only(configuration, ['model', 'audio', 'instructions', 'input', 'delegation']) || configuration.model !== OPENAI_MODALITY_MODELS.voice
        || !only(configuration.audio, ['output']) || !only(configuration.audio.output, ['voice']) || typeof configuration.audio.output.voice !== 'string'
        || configuration.delegation.type !== 'responses' || !only(configuration.delegation, ['type', 'responses'])
        || !only(backend, ['model', 'instructions', 'tools', 'reasoning', 'parallel_tool_calls'])
        || backend.model !== OPENAI_MODALITY_MODELS.voice_backend.model || backend.parallel_tool_calls !== false
        || !Array.isArray(configuration.input) || configuration.input.length > 128
        || configuration.input.some(item => item?.type !== 'message' || !['user', 'assistant'].includes(item.role))) throw new Error('provider_realtime_connect_invalid');
    catalog(backend.tools || []);
    return { ...configuration, client: { data_channel: DATA_CHANNEL } };
};

// The control connection has the same lifetime and principal as the existing
// application socket. Runtime V2 remains the owner of Atome tool execution.
export const controlProviderRealtime = async ({ action, payload, connection, principal, key, signal,
    fetchImpl = globalThis.fetch, Socket = WebSocket }) => {
    let active = sessions.get(connection);
    if (!active) {
        active = new Map(); sessions.set(connection, active);
        connection.once('close', () => { for (const session of active.values()) closeDetached(session); });
    }
    for (const session of active.values()) if (session.principal !== principal) await session.close();
    if (action === 'realtime-close-all') {
        await Promise.all([...(principals.get(principal) || [])].map(session => session.close())); return {};
    }
    const id = String(payload.session_id || '');
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('provider_realtime_session_invalid');
    if (action !== 'realtime-connect') {
        const session = active.get(id);
        if (!session || session.principal !== principal) throw new Error('provider_realtime_session_missing');
        if (action === 'realtime-close') return session.close();
        if (action !== 'realtime-send') throw new Error('provider_operation_not_allowed');
        if (!Array.isArray(payload.events) || payload.events.length > 100) throw new Error('provider_realtime_events_invalid');
        const completed = new Set();
        for (const event of payload.events) {
            if (event.type === 'response.item.create') {
                if (event.item?.type !== 'function_call_output' || !session.pending.has(event.item.call_id) || completed.has(event.item.call_id)) throw new Error('provider_realtime_call_not_pending');
                completed.add(event.item.call_id);
            } else if (event.type === 'session.update') {
                if (!only(event.session, ['delegation']) || event.session.delegation.type !== 'responses'
                    || !only(event.session.delegation, ['type', 'responses']) || !only(event.session.delegation.responses, ['tools'])) throw new Error('provider_realtime_event_not_allowed');
                catalog(event.session.delegation.responses.tools);
            } else if (event.type !== 'response.create') throw new Error('provider_realtime_event_not_allowed');
        }
        if (session.socket.readyState !== Socket.OPEN) throw new Error('provider_realtime_disconnected');
        for (const event of payload.events) session.socket.send(JSON.stringify(event));
        completed.forEach(callId => session.pending.delete(callId));
        return {};
    }
    if (active.size || !String(payload.sdp || '').startsWith('v=0') || payload.sdp.length > 100000) throw new Error('provider_realtime_connect_invalid');
    const configuration = liveConfiguration(payload.session || {});
    const response = await fetchImpl(ROOT, { method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
            'OpenAI-Safety-Identifier': createHash('sha256').update(principal).digest('hex') },
        body: JSON.stringify({ session: configuration, transport: { type: 'webrtc', sdp: payload.sdp } }) });
    if (!response.ok) {
        throw openAiFailure(await response.json().catch(() => ({})), 'provider_realtime_connect_failed', response.status);
    }
    const created = await response.json();
    const liveId = created.session?.id, sdp = created.transport?.sdp;
    if (!/^live_[a-zA-Z0-9_-]+$/.test(liveId || '') || !String(sdp || '').startsWith('v=0')) throw new Error('provider_realtime_call_invalid');
    const socket = new Socket(`wss://api.openai.com/v1/live/sessions/${liveId}/attach`, {
        headers: { Authorization: `Bearer ${key}` }, maxPayload: 4_000_000, handshakeTimeout: 15000
    });
    let closing = null, ended = null;
    const closed = new Promise(resolve => { ended = resolve; });
    const session = { principal, socket, pending: new Set(), seen: new Set(), close() {
        if (closing) return closing;
        active.delete(id); clearTimeout(session.timer);
        principals.get(principal)?.delete(session);
        if (!principals.get(principal)?.size) principals.delete(principal);
        // GPT-Live bills connected seconds: the session ends only once OpenAI says so.
        closing = (async () => {
            let timer;
            try {
                if (!session.closedEvent) {
                    if (socket.readyState !== Socket.OPEN) throw new Error('provider_realtime_hangup_failed');
                    socket.send(JSON.stringify({ type: 'session.close' }));
                    await Promise.race([closed, new Promise((_, reject) => {
                        timer = setTimeout(() => reject(new Error('provider_realtime_hangup_failed')), 10000);
                    })]);
                }
                return { usage_seconds: session.closedEvent.usage?.seconds };
            } finally { clearTimeout(timer); socket.close(); }
        })();
        return closing;
    } };
    active.set(id, session);
    if (!principals.has(principal)) principals.set(principal, new Set());
    principals.get(principal).add(session);
    session.timer = setTimeout(() => { closeDetached(session); }, 60 * 60 * 1000);
    socket.on('message', bytes => {
        let event;
        try { event = JSON.parse(bytes.toString()); } catch { closeDetached(session); return; }
        if (event.type === 'session.closed') {
            session.closedEvent = event; ended();
            if (!closing) closeDetached(session);
            return;
        }
        if (active.get(id) !== session) return;
        if (connection._wsApiUserId !== principal) { closeDetached(session); return; }
        const inner = event.type === 'response.event' ? event.event : null;
        const item = inner?.type === 'response.output_item.done' && inner.item?.type === 'function_call' ? inner.item : null;
        if (item) {
            if (session.seen.has(item.call_id)) return;
            if (session.seen.size >= 1024 || session.pending.size >= 16) { closeDetached(session); return; }
            session.seen.add(item.call_id); session.pending.add(item.call_id);
        } else if (event.type !== 'error' && inner?.type !== 'response.failed') return;
        connection.send(JSON.stringify({ type: 'ai-realtime-event', session_id: id,
            event: item ? { type: 'response.output_item.done', item: { type: item.type, call_id: item.call_id, name: item.name, arguments: item.arguments } }
                : { type: 'error', code: openAiFailure(inner || event, 'provider_realtime_error').message } }));
    });
    socket.on('close', () => { if (active.get(id) === session) closeDetached(session); });
    socket.on('error', () => { closeDetached(session); });
    const cancelled = () => { closeDetached(session); };
    signal.addEventListener('abort', cancelled, { once: true });
    try {
        signal.throwIfAborted();
        await new Promise((resolve, reject) => {
            const opened = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error('provider_realtime_disconnected')); };
            const cleanup = () => { socket.off('open', opened); socket.off('close', failed); socket.off('error', failed); signal.removeEventListener('abort', failed); };
            socket.once('open', opened); socket.once('close', failed); socket.once('error', failed); signal.addEventListener('abort', failed, { once: true });
        });
        signal.throwIfAborted();
        return { sdp, session_id: id };
    } catch (error) { closeDetached(session); throw error; }
    finally { signal.removeEventListener('abort', cancelled); }
};
