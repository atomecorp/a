// « Rapatrier » (server/wsTeleportOperations.js `return`): bringing an object home
// pushes the same arrival signal as an accepted offer, naming the surface it left,
// so that surface hands over what it was doing (media_handoff.js). Real handler and
// in-memory surface registry, fake sockets and vault.
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('../../database/adole.js', () => ({
    default: { getAtomeById: async (id) => ({ atome_id: id, atome_type: 'user' }), query: async () => null }
}));

let handle, attachWsApiClientToUser, attachWsApiSurface, detachWsApiClient, detachWsApiSurface;
beforeAll(async () => {
    ({ handleWsTeleportOperation: handle } = await import('../../server/wsTeleportOperations.js'));
    ({ attachWsApiClientToUser, attachWsApiSurface, detachWsApiClient, detachWsApiSurface } = await import('../../server/wsApiState.js'));
});

const atomes = new Map();
const commits = [];
const router = {
    getState: async (_principal, id) => (atomes.has(id) ? { properties: atomes.get(id) } : null),
    commit: async (_principal, entry) => {
        commits.push(entry);
        atomes.set(entry.atome_id, { ...atomes.get(entry.atome_id), ...entry.payload.props });
        return { inserted: false, event: null };
    }
};
const seats = [];
const seat = (userId, surfaceId, label) => {
    const connection = { _wsApiUserId: userId, _wsApiAuthExpMs: Date.now() + 60000, _wsApiVaultRouter: router, sent: [],
        send(raw) { this.sent.push(JSON.parse(raw)); } };
    attachWsApiClientToUser(connection, userId);
    attachWsApiSurface(connection, userId, { surfaceId, label, platform: 'browser' });
    seats.push(connection);
    return connection;
};
const arrivals = (connection) => connection.sent.filter((frame) => frame.type === 'teleport-arrived');

afterEach(() => {
    seats.splice(0).forEach((connection) => { detachWsApiSurface(connection); detachWsApiClient(connection); });
    atomes.clear();
    commits.length = 0;
});

test('bringing an object home tells every seat where it lands and which surface it left', async () => {
    const phone = seat('u1', 'phone', 'iPhone');
    const tv = seat('u1', 'tv', 'Télé du salon');
    atomes.set('tv-1', { media_source: 'tv', teleport_state: 'REMOTE', teleport_surface_id: 'tv',
        teleport_origin_surface_id: 'phone', teleport_session_id: 's1' });
    const reply = await handle({ type: 'teleport', action: 'return', requestId: 'r1', atome_id: 'tv-1' }, phone);
    expect(reply).toMatchObject({ success: true, destination: 'phone' });
    expect(atomes.get('tv-1')).toMatchObject({ teleport_state: 'LOCAL', teleport_surface_id: '' });
    for (const connection of [phone, tv]) {
        expect(arrivals(connection)).toEqual([expect.objectContaining({
            atome_id: 'tv-1', surface_id: 'phone', origin_surface_id: 'tv', returned: true })]);
    }
});

test('a refused return commits nothing and announces nothing', async () => {
    const phone = seat('u1', 'phone', 'iPhone');
    atomes.set('a-1', { teleport_state: 'LOCAL', teleport_surface_id: '' });
    const reply = await handle({ type: 'teleport', action: 'return', requestId: 'r2', atome_id: 'a-1' }, phone);
    expect(reply.success).toBe(false);
    expect(commits).toHaveLength(0);
    expect(arrivals(phone)).toHaveLength(0);
});
