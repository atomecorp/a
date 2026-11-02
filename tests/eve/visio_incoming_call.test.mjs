import { test, expect, vi } from 'vitest';
import { createIncomingCallController } from '../../eVe/domains/visio/visio_incoming_call.js';
import { CALL_RING_TIMEOUT_MS } from '../../atome/src/shared/communication_contract.js';

// An incoming call rings 30 s; a visible host (the Dashboard band) shows Decline / Accept in place
// of the ribbon, is told when the ring starts and ends, and its answer joins or declines the room.
const NOW = 1_000_000;
const fixture = ({ hostVisible = null } = {}) => {
    const timeouts = [], intervals = [];
    const win = {
        setInterval: (fn, ms) => intervals.push({ fn, ms }), clearInterval: () => {},
        setTimeout: (fn, ms) => timeouts.push({ fn, ms }), clearTimeout: () => {}
    };
    const spies = {
        ringer: { start: vi.fn(), stop: vi.fn(), isRinging: () => true },
        project: vi.fn(), restore: vi.fn(), markStatus: vi.fn(async () => null),
        accept: vi.fn(async roomId => ({ ok: true, roomId })), decline: vi.fn(async () => ({ ok: true }))
    };
    const controller = createIncomingCallController({ win, now: () => NOW, nameFor: async item => item.fromName, ...spies });
    const host = { visible: () => hostVisible?.() ?? false, changed: vi.fn() };
    if (hostVisible) controller.attachHost(host);
    return { controller, host, timeouts, intervals, ...spies };
};
const invitation = (extra = {}) => ({ id: 'n1', kind: 'call-invitation', roomId: 'room', fromName: 'Ada',
    callMode: 'visio', date: new Date(NOW).toISOString(), ...extra });

test('the ring lasts the common 30 s delay, then the call is missed', async () => {
    expect(CALL_RING_TIMEOUT_MS).toBe(30000);
    const f = fixture();
    await f.controller.onNotifications([invitation()]);
    expect(f.project).toHaveBeenCalled();
    expect(f.timeouts[0].ms).toBe(CALL_RING_TIMEOUT_MS);
    f.timeouts[0].fn();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.controller.getState()).toBeNull();
    expect(f.ringer.stop).toHaveBeenCalled();
    expect(f.markStatus).toHaveBeenCalledWith('n1', { status: 'missed', unread: true });
});

test('a visible host is told the ring starts and ends; Accept joins the room', async () => {
    let shown = true;
    const f = fixture({ hostVisible: () => shown });
    await f.controller.onNotifications([invitation({ callMode: 'audio' })]);
    expect(f.ringer.start).toHaveBeenCalledWith('audio');
    expect(f.host.changed).toHaveBeenCalledTimes(1);
    expect(f.controller.getState()).toMatchObject({ roomId: 'room', callMode: 'audio', ringing: true });
    expect(f.project).not.toHaveBeenCalled();
    // The host gone while it rings (the Dashboard left), the next blink hands the ring to the ribbon.
    shown = false;
    f.intervals[0].fn();
    expect(f.project).toHaveBeenCalled();
    shown = true;
    expect(await f.controller.accept()).toEqual({ ok: true, roomId: 'room' });
    expect(f.accept).toHaveBeenCalledWith('room', expect.objectContaining({ id: 'n1', roomId: 'room' }));
    expect(f.markStatus).toHaveBeenCalledWith('n1', { status: 'accepted', unread: false });
    expect(f.host.changed).toHaveBeenCalledTimes(2);
    expect(f.controller.getState()).toBeNull();
    expect(f.ringer.stop).toHaveBeenCalled();
});

test('Decline tells the caller and keeps the call refused', async () => {
    const f = fixture({ hostVisible: () => true });
    await f.controller.onNotifications([invitation()]);
    expect(await f.controller.decline('declined')).toEqual({ ok: true, reason: 'declined' });
    expect(f.decline).toHaveBeenCalledWith('room', 'declined');
    expect(f.markStatus).toHaveBeenCalledWith('n1', { status: 'refused', unread: false });
    expect(f.controller.getState()).toBeNull();
    expect(f.host.changed).toHaveBeenCalledTimes(2);
});

test('the server expiry is kept and an invitation older than the ring is missed without ringing', async () => {
    const f = fixture();
    await f.controller.onNotifications([invitation({ expiresAt: NOW + 12000 })]);
    expect(f.timeouts[0].ms).toBe(12000);
    const g = fixture();
    await g.controller.onNotifications([invitation({ date: new Date(NOW - CALL_RING_TIMEOUT_MS).toISOString() })]);
    expect(g.ringer.start).not.toHaveBeenCalled();
    expect(g.markStatus).toHaveBeenCalledWith('n1', { status: 'missed' });
});
