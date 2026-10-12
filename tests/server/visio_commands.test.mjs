import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { createVisioCommands } from '../../server/visio_commands.js';
import { CALL_RING_TIMEOUT_MS } from '../../atome/src/shared/communication_contract.js';
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
const fixture = (options = {}) => {
    const rooms = new Map(); const publish = vi.fn();
    const commands = createVisioCommands({
        ensureRoomMeta: (id, owner, name) => { const meta = { room_id: id, owner_user_id: owner, name, invites: new Set() }; rooms.set(id, meta); return meta; },
        resolveRoomMeta: async id => rooms.get(id), resolveUserInfo: async id => ({ id }),
        relations: { canCommunicate: async () => ({ ok: true }) }, notify: vi.fn(async () => {}),
        publish, closeRoom: vi.fn(), ...options
    });
    const begin = async () => {
        const room = await commands.execute('alice', 'create', { mode: 'audio', messageOnMiss: true });
        await commands.execute('alice', 'invite', { roomId: room.roomId, target: { id: 'bob' } });
        return room.roomId;
    };
    return { commands, publish, begin };
};
test('the common adjustable delay is 10 seconds and expiration is terminal', async () => {
    expect(CALL_RING_TIMEOUT_MS).toBe(10000);
    const f = fixture(), roomId = await f.begin();
    await vi.advanceTimersByTimeAsync(9999);
    expect((await f.commands.execute('alice', 'state', { roomId })).status).toBe('ringing');
    await vi.advanceTimersByTimeAsync(1);
    expect((await f.commands.execute('alice', 'state', { roomId })).status).toBe('recording');
    await expect(f.commands.execute('bob', 'accept', { roomId })).rejects.toThrow('visio_call_ended');
    f.commands.dispose();
});
test('acceptance wins before expiration; a refusal wins immediately', async () => {
    const f = fixture(), roomId = await f.begin();
    expect((await f.commands.execute('bob', 'accept', { roomId })).status).toBe('live');
    await vi.advanceTimersByTimeAsync(15000);
    expect((await f.commands.execute('alice', 'state', { roomId })).status).toBe('live');
    const second = await f.begin();
    expect((await f.commands.execute('bob', 'decline', { roomId: second })).status).toBe('recording');
    f.commands.dispose();
});
test('offline contacts switch immediately and unrelated principals cannot accept', async () => {
    const f = fixture({ online: () => false }), roomId = await f.begin();
    expect((await f.commands.execute('alice', 'state', { roomId })).status).toBe('recording');
    await expect(f.commands.execute('eve', 'accept', { roomId })).rejects.toThrow('visio_room_denied');
    f.commands.dispose();
});
