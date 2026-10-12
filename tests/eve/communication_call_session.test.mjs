import { test, expect, vi } from 'vitest';
import { createCommunicationCallSession } from '../../eVe/domains/visio/communication_call_session.js';

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
