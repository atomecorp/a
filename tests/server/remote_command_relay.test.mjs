// Remote command relay on the `remote-control` family (server/remoteCommandRelay.js):
// real handler, real in-memory surface registry, fake sockets. Only the database is
// replaced, so provisioning and cross-account grants are controlled by the test.
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

const grants = [];
vi.mock('../../database/adole.js', () => ({
    default: {
        getAtomeById: async (id) => ({ atome_id: id, atome_type: 'user' }),
        query: async (mode) => (mode === 'all' ? grants : null)
    }
}));

let handle, surfaceLoss, attachWsApiSurface, detachWsApiSurface, pendingCount;
beforeAll(async () => {
    process.env.REMOTE_COMMAND_TIMEOUT_MS = '150';
    ({ handleWsRemoteControlOperation: handle, handleRemoteControlSurfaceLoss: surfaceLoss } = await import('../../server/wsRemoteControlOperations.js'));
    ({ attachWsApiSurface, detachWsApiSurface } = await import('../../server/wsApiState.js'));
    ({ __pendingRemoteCommandCount: pendingCount } = await import('../../server/remoteCommandRelay.js'));
});

const seats = [];
const seat = (userId, surfaceId, label) => {
    const connection = { _wsApiUserId: userId, _wsApiAuthExpMs: Date.now() + 60000, sent: [],
        send(raw) { this.sent.push(JSON.parse(raw)); } };
    attachWsApiSurface(connection, userId, { surfaceId, label, platform: 'browser' });
    seats.push(connection);
    return connection;
};
const command = (fields) => ({ type: 'remote-control', action: 'command', requestId: 'r1', tool_id: 'tv.open_channel', input: { channel: 'France 2' }, ...fields });
const received = (connection) => connection.sent.find((frame) => frame.type === 'remote-control-command');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
    seats.splice(0).forEach((connection) => detachWsApiSurface(connection));
    grants.length = 0;
});

test('same account: the target receives the intention and its own result returns to the caller', async () => {
    const phone = seat('u1', 'phone', 'iPhone');
    const tv = seat('u1', 'tv', 'Télé du salon');
    const reply = handle(command({ target_surface_id: 'tv' }), phone);
    await tick();
    const order = received(tv);
    expect(order).toMatchObject({ tool_id: 'tv.open_channel', input: { channel: 'France 2' }, from_surface_id: 'phone',
        from_label: 'iPhone', confirmed: false });
    const ack = await handle({ type: 'remote-control', action: 'command-result', command_id: order.command_id,
        result: { ok: true, status: 'playing' } }, tv);
    expect(ack).toMatchObject({ success: true, settled: true });
    expect(await reply).toMatchObject({ type: 'remote-control-response', requestId: 'r1', success: true,
        target_surface_id: 'tv', target_label: 'Télé du salon', result: { ok: true, status: 'playing' } });
    expect(pendingCount()).toBe(0);
});

test('only the addressed target surface may answer a command', async () => {
    const phone = seat('u1', 'phone', 'iPhone');
    const tv = seat('u1', 'tv', 'TV');
    const mac = seat('u1', 'mac', 'Mac');
    const reply = handle(command({ target_surface_id: 'tv' }), phone);
    await tick();
    const { command_id } = received(tv);
    for (const intruder of [mac, phone]) {
        expect(await handle({ type: 'remote-control', action: 'command-result', command_id, result: { ok: true } }, intruder))
            .toMatchObject({ success: false, error: 'remote_command_not_target' });
    }
    await handle({ type: 'remote-control', action: 'command-result', command_id, result: { ok: false, error: 'CHANNEL_NOT_FOUND' } }, tv);
    expect((await reply).result).toEqual({ ok: false, error: 'CHANNEL_NOT_FOUND' });
});

test('offline target, self target and malformed orders are refused before anything is sent', async () => {
    const phone = seat('u1', 'phone', 'iPhone');
    expect(await handle(command({ target_surface_id: 'mac' }), phone)).toMatchObject({ success: false, error: 'remote_command_target_offline' });
    expect(await handle(command({ target_surface_id: 'phone' }), phone)).toMatchObject({ error: 'remote_command_target_is_caller' });
    seat('u1', 'tv', 'TV');
    expect(await handle(command({ target_surface_id: 'tv', tool_id: 'rm -rf' }), phone)).toMatchObject({ error: 'remote_command_tool_invalid' });
    expect(await handle(command({ target_surface_id: 'tv', input: ['x'] }), phone)).toMatchObject({ error: 'remote_command_input_invalid' });
    expect(await handle(command({ target_surface_id: 'tv', input: { blob: 'x'.repeat(70 * 1024) } }), phone))
        .toMatchObject({ error: 'remote_command_input_too_large' });
});

test('another account needs an explicit remote_command grant; a pointer grant is not enough', async () => {
    const phone = seat('u1', 'phone', 'iPhone');
    const tv = seat('u2', 'tv', 'TV de Paul');
    const live = (capabilities) => ({ grant_id: 'g', owner_id: 'u2', surface_id: 'tv', grantee_id: 'u1', status: 'granted',
        capabilities: JSON.stringify(capabilities) });
    grants.push(live(['remote_pointer']));
    expect(await handle(command({ target_surface_id: 'tv', target_user_id: 'u2' }), phone))
        .toMatchObject({ success: false, error: 'remote_command_cross_user_not_authorized' });
    expect(received(tv)).toBeUndefined();

    grants.push(live(['remote_command']));
    const reply = handle(command({ target_surface_id: 'tv', target_user_id: 'u2' }), phone);
    await vi.waitFor(() => expect(received(tv)).toBeTruthy());
    await handle({ type: 'remote-control', action: 'command-result', command_id: received(tv).command_id, result: { ok: true } }, tv);
    expect(await reply).toMatchObject({ success: true, result: { ok: true } });
});

test('a target that disappears or never answers ends the command explicitly', async () => {
    const phone = seat('u1', 'phone', 'iPhone');
    seat('u1', 'tv', 'TV');
    const lost = handle(command({ target_surface_id: 'tv' }), phone);
    await tick();
    surfaceLoss({ userId: 'u1', surfaceId: 'tv' });
    expect(await lost).toMatchObject({ success: false, error: 'remote_command_target_offline', target_surface_id: 'tv' });

    seat('u1', 'mac', 'Mac');
    expect(await handle(command({ target_surface_id: 'mac' }), phone)).toMatchObject({ success: false, error: 'remote_command_timeout' });
    expect(pendingCount()).toBe(0);
});
