import { test, expect, vi } from 'vitest';
import { createCommunicationCallSession } from '../../eVe/domains/visio/communication_call_session.js';
import { createVisioCallRuntime } from '../../eVe/domains/visio/visio_call_runtime.js';

const fixture = status => {
    const listeners = new Set();
    const snapshot = { roomId: 'room', callStatus: status };
    const call = { subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); },
        getState: () => snapshot, startCall: vi.fn(async () => ({ ok: true, roomId: 'room' })),
        leave: vi.fn(async () => ({ ok: true })), cancel: vi.fn(async () => ({ ok: true })) };
    const capture = vi.fn(async (kind, active, options) => ({ ok: true, active,
        ...(active || options.discard ? {} : { project: { atomeId: 'recording' } }) }));
    const send = vi.fn(async () => ({ ok: true }));
    const saved = vi.fn(async () => ({ ok: true }));
    const session = createCommunicationCallSession({ call, capture, send, saveDraft: saved });
    return { session, call, capture, send, saved, emit: state => { Object.assign(snapshot, state); listeners.forEach(fn => fn(snapshot)); } };
};
const input = mode => ({ contact: { id: 'bob' }, mode, presentationSurface: 'contact_conversation' });

test('acceptance stays live and never records', async () => {
    const f = fixture('ringing'); await f.session.start(input('visio'));
    f.emit({ callStatus: 'live' }); f.emit({ callStatus: 'recording' });
    expect(f.session.state.phase).toBe('live'); expect(f.capture).not.toHaveBeenCalled();
    await f.session.close(); expect(f.call.cancel).toHaveBeenCalledOnce();
});
test.each(['audio', 'visio'])('an unanswered %s call records once and sends once when stopped', async mode => {
    const f = fixture('recording'); await f.session.start(input(mode));
    await vi.waitFor(() => expect(f.session.state.phase).toBe('recording'));
    f.emit({ callStatus: 'recording' }); f.emit({ callStatus: 'live' });
    expect(f.capture).toHaveBeenCalledOnce();
    await f.session.finish();
    expect(f.send).toHaveBeenCalledOnce(); expect(f.saved).toHaveBeenCalledWith('recording', 'sent');
    expect(f.session.state.phase).toBe('sent');
});
test('closing a recording saves a draft and cancellation never sends', async () => {
    const f = fixture('recording'); await f.session.start(input('audio'));
    await vi.waitFor(() => expect(f.session.state.phase).toBe('recording'));
    await f.session.close(); expect(f.session.state.phase).toBe('draft'); expect(f.send).not.toHaveBeenCalled();
    const cancelled = fixture('recording'); await cancelled.session.start(input('visio'));
    await vi.waitFor(() => expect(cancelled.session.state.phase).toBe('recording'));
    await cancelled.session.finish({ discard: true }); expect(cancelled.send).not.toHaveBeenCalled();
});
test('a failed send preserves the media and reuses its message identity on retry', async () => {
    const f = fixture('recording'); f.send.mockResolvedValueOnce({ ok: false, error: 'offline' });
    await f.session.start(input('audio')); await vi.waitFor(() => expect(f.session.state.phase).toBe('recording'));
    await f.session.finish(); expect(f.session.state.phase).toBe('draft');
    await f.session.sendMedia(); expect(f.send.mock.calls[0][0].messageId).toBe(f.send.mock.calls[1][0].messageId);
    expect(f.capture).toHaveBeenCalledTimes(2);
});
test('remote terminal call state stops local capture and both canonical media transports', async () => {
    const win = new EventTarget(), stop = vi.fn(), transports = [];
    const transport = () => {
        const value = { on() {}, close: vi.fn(), produce: async () => ({ id: 'producer' }) };
        transports.push(value); return value;
    };
    class Device {
        async load() {}
        createSendTransport() { return transport(); }
        createRecvTransport() { return transport(); }
    }
    const api = { security: { getAuthenticatedUser: () => ({ id: 'bob' }) }, communication: {
        visio: async ({ action }) => action === 'accept' ? { mode: 'audio' }
            : action === 'joinRoom' ? { rtpCapabilities: {}, participants: [], existingProducers: [] } : { transportOptions: {} }
    } };
    const call = createVisioCallRuntime({ win, getApi: () => api, loadClient: async () => ({ Device }),
        getUserMedia: async () => ({ getTracks: () => [{ kind: 'audio', stop }], getVideoTracks: () => [] }) });
    expect((await call.joinCall('room')).ok).toBe(true);
    const event = new Event('squirrel:visio-event');
    event.detail = { roomId: 'room', event: { type: 'callState', status: 'cancelled' } };
    win.dispatchEvent(event);
    expect(call.getState().status).toBe('ended'); expect(stop).toHaveBeenCalledOnce();
    expect(transports).toHaveLength(2);
    for (const media of transports) expect(media.close).toHaveBeenCalledOnce();
});
// R-173 L5: the other's producer announced (newProducer) while the receive transport is being made was dropped, so that
// voice was never heard for the whole call. It is consumed once the transport exists, and no producer is consumed twice.
test('a producer announced before the receive transport is consumed once it exists, each producer once', async () => {
    if (typeof globalThis.MediaStream === 'undefined') {
        vi.stubGlobal('MediaStream', class { constructor(tracks = []) { this.tracks = [...tracks]; }
            addTrack(track) { this.tracks.push(track); } removeTrack(track) { this.tracks = this.tracks.filter((t) => t !== track); }
            getTracks() { return this.tracks; } getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); } });
    }
    const win = new EventTarget(), consumed = [];
    const announce = (producerId) => {
        const event = new Event('squirrel:visio-event');
        event.detail = { roomId: 'room', event: { type: 'newProducer', producer_id: producerId, peer_user_id: 'ana' } };
        win.dispatchEvent(event);
    };
    const transport = () => ({ id: 'recv', on() {}, close: vi.fn(), produce: async () => ({ id: 'mine' }),
        consume: async ({ producerId }) => ({ id: `c-${producerId}`, kind: 'audio', track: { kind: 'audio', stop() {} }, close() {} }) });
    class Device {
        async load() {}
        get rtpCapabilities() { return {}; }
        createSendTransport() { return transport(); }
        createRecvTransport() { return transport(); }
    }
    const api = { security: { getAuthenticatedUser: () => ({ id: 'bunta' }) }, communication: {
        visio: async ({ action, input }) => {
            if (action === 'joinRoom') return { rtpCapabilities: {}, participants: [], existingProducers: [{ producer_id: 'p1', peer_user_id: 'ana' }] };
            if (action === 'createTransport' && input.direction === 'recv') {
                // Ana's voice announced while Bunta's receive transport is not there yet (the run-4 race), and announced twice.
                announce('p2'); announce('p2');
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            if (action === 'consume') { consumed.push(input.producer_id); return { consumerOptions: { producerId: input.producer_id } }; }
            return action === 'createTransport' ? { transportOptions: {} } : {};
        }
    } };
    const call = createVisioCallRuntime({ win, getApi: () => api, loadClient: async () => ({ Device }),
        getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }) });
    expect((await call.listen('room')).ok).toBe(true);
    // p1 announced again after the join: already consumed, never twice. p2 was only announced early.
    announce('p1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consumed.sort()).toEqual(['p1', 'p2']);
    const ana = call.getState().participants.find((p) => p.userId === 'ana');
    expect(ana.stream.getTracks()).toHaveLength(2);
});
