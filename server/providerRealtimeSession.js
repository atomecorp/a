import WebSocket from 'ws';
import { createHash } from 'node:crypto';

const sessions = new WeakMap();
const principals = new Map();
const ROOT = 'https://api.openai.com/v1/realtime/calls';
const closeDetached = session => {
    void session.close().catch(() => console.warn('[OpenAI] Realtime remote cleanup failed'));
};
const catalog = tools => {
    if (!Array.isArray(tools) || tools.length > 96 || tools.some(tool => tool.type !== 'function')) throw new Error('provider_tool_not_authorized');
    return tools.map(({ strict, ...tool }) => tool);
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
        if (action === 'realtime-close') { await session.close(); return {}; }
        if (action !== 'realtime-send') throw new Error('provider_operation_not_allowed');
        if (!Array.isArray(payload.events) || payload.events.length > 100) throw new Error('provider_realtime_events_invalid');
        const completed = new Set();
        for (const event of payload.events) {
            if (event.type === 'conversation.item.create') {
                if (event.item?.type === 'function_call_output') {
                    if (!session.pending.has(event.item.call_id) || completed.has(event.item.call_id)) throw new Error('provider_realtime_call_not_pending');
                    completed.add(event.item.call_id);
                } else if (event.item?.type !== 'message' || !['user', 'assistant'].includes(event.item.role)) throw new Error('provider_realtime_event_not_allowed');
            } else if (event.type === 'session.update') {
                if (Object.keys(event.session || {}).some(field => !['type', 'tools'].includes(field))) throw new Error('provider_realtime_event_not_allowed');
                catalog(event.session.tools);
            } else if (!['response.create', 'response.cancel', 'output_audio_buffer.clear', 'input_audio_buffer.clear'].includes(event.type)) throw new Error('provider_realtime_event_not_allowed');
        }
        if (session.socket.readyState !== Socket.OPEN) throw new Error('provider_realtime_disconnected');
        for (const event of payload.events) session.socket.send(JSON.stringify(event));
        completed.forEach(callId => session.pending.delete(callId));
        return {};
    }
    if (active.size || !String(payload.sdp || '').startsWith('v=0') || payload.sdp.length > 100000) throw new Error('provider_realtime_connect_invalid');
    const configuration = payload.session || {};
    catalog(configuration.tools || []);
    const form = new FormData(); form.set('sdp', payload.sdp); form.set('session', JSON.stringify(configuration));
    const response = await fetchImpl(ROOT, { method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${key}`, 'OpenAI-Safety-Identifier': createHash('sha256').update(principal).digest('hex') }, body: form });
    if (!response.ok) {
        const error = new Error('provider_realtime_connect_failed'); error.http_status = response.status; throw error;
    }
    const callId = response.headers.get('location')?.split('/').pop();
    if (!/^rtc_[a-zA-Z0-9_-]+$/.test(callId || '')) throw new Error('provider_realtime_call_invalid');
    const sdp = await response.text();
    const socket = new Socket(`wss://api.openai.com/v1/realtime?call_id=${callId}`, {
        headers: { Authorization: `Bearer ${key}` }, maxPayload: 4_000_000, handshakeTimeout: 15000
    });
    let closing = null;
    const session = { principal, socket, pending: new Set(), seen: new Set(), close() {
        if (closing) return closing;
        active.delete(id); clearTimeout(session.timer); socket.close();
        principals.get(principal)?.delete(session);
        if (!principals.get(principal)?.size) principals.delete(principal);
        closing = fetchImpl(`${ROOT}/${callId}/hangup`, { method: 'POST', redirect: 'error',
            headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) })
            .then(result => { if (!result.ok && result.status !== 404) throw new Error('provider_realtime_hangup_failed'); });
        return closing;
    } };
    active.set(id, session);
    if (!principals.has(principal)) principals.set(principal, new Set());
    principals.get(principal).add(session);
    session.timer = setTimeout(() => { closeDetached(session); }, 60 * 60 * 1000);
    socket.on('message', bytes => {
        if (active.get(id) !== session) return;
        if (connection._wsApiUserId !== principal) { closeDetached(session); return; }
        let event;
        try { event = JSON.parse(bytes.toString()); } catch { closeDetached(session); return; }
        if (event.type === 'response.function_call_arguments.done') {
            if (session.seen.has(event.call_id)) return;
            if (session.seen.size >= 1024 || session.pending.size >= 16) { closeDetached(session); return; }
            session.seen.add(event.call_id); session.pending.add(event.call_id);
        } else if (event.type !== 'error') return;
        connection.send(JSON.stringify({ type: 'ai-realtime-event', session_id: id,
            event: event.type === 'error' ? { type: 'error', code: 'provider_realtime_error' } : event }));
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
    } catch (error) { await session.close(); throw error; }
    finally { signal.removeEventListener('abort', cancelled); }
};
