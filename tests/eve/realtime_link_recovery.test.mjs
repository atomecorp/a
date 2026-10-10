import { test, expect, vi } from 'vitest';


test('Realtime retains the link failure when remote cleanup also fails', async () => {
    const { createRealtimeSession } = await import('../../atome/src/squirrel/voice/realtime_session.js');
    let control, stopped = 0, peerClosed = 0;
    const track = { kind: 'audio', readyState: 'live', enabled: true, stop() { stopped++; } };
    const session = createRealtimeSession({
        env: { crypto,
            addEventListener(type, listener) { if (type === 'squirrel:ai-realtime-event') control = listener; },
            removeEventListener() {},
            navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } },
            RTCPeerConnection: class {
                getSenders() { return []; } addTrack() {} close() { peerClosed++; }
                createDataChannel() { return { close() {} }; }
                async createOffer() { return { sdp: 'v=0' }; }
                async setLocalDescription() {} async setRemoteDescription() {}
            } },
        playback: { stopStream() {} },
        request: async (action, payload) => {
            if (action === 'realtime-connect') return { session_id: payload.session_id, sdp: 'v=0' };
            if (action === 'realtime-close') throw new Error('provider_realtime_session_missing');
            return {};
        }
    });
    await session.open();
    control({ detail: { session_id: session.getState().sessionId, event: { type: 'error', code: 'provider_connection_closed' } } });
    await vi.waitFor(() => expect(session.getState()).toMatchObject({
        phase: 'error', error: 'provider_connection_closed', connected: false, microphoneActive: false
    }));
    expect(stopped).toBe(1); expect(peerClosed).toBe(1);
});

test('Malformed voice tool arguments return a refusal without execution and permit the next call', async () => {
    const { createConversationSession } = await import('../../atome/src/squirrel/ai/conversation_session.js');
    const deliveries = [], calls = [];
    const session = createConversationSession({ actor: () => ({ id: 'fixture' }),
        quota: { getSummary: () => ({}), recordIncident() {} },
        mcp: async ({ method, params }) => {
            if (method === 'ai.tools.list') return { result: { tools: [] } };
            if (method === 'runtime.tools.list') return { result: { tools: [{ name: 'ui.draw.edit', parameters: { type: 'object' } }] } };
            calls.push({ method, params }); return { result: { ok: true } };
        } });
    const voice = await session.createVoiceTools({ signal: new AbortController().signal,
        deliver: async outputs => deliveries.push(outputs) });
    const draw = voice.tools.find(tool => tool.name !== 'atome_tool_search');
    for (const name of ['atome_tool_search', draw.name]) {
        await voice.execute({ name, call_id: `bad-${name}`, arguments: '{"input":"unfinished' });
        expect(session.snapshot()).toMatchObject({ phase: 'idle', error: '' });
        expect(JSON.parse(deliveries.at(-1)[0].output)).toEqual({ ok: false, error: 'conversation_tool_arguments_invalid' });
    }
    expect(calls).toHaveLength(0);
    await voice.execute({ name: draw.name, call_id: 'valid', arguments: '{"input":{},"action":"pointer.click"}' });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('runtime.tools.call');
});
