// Client half of the remote command relay (atome/src/squirrel/teleport/remote_command.js).
// The target side runs through the REAL MCP gateway (atome/src/squirrel/atome/mcp.js):
// only the runtime tool registry behind it is a recorder, so the remote actor's policy
// is the production one.
import { beforeAll, expect, test, vi } from 'vitest';

const sent = [];
const surfaces = [
    { surface_id: 's-tv', label: 'Télé du salon', platform: 'browser' },
    { surface_id: 's-mac', label: 'Desktop', platform: 'tauri' },
    { surface_id: 's-ipad', label: 'iPad de Léa', platform: 'ios' },
    { surface_id: 's-phone', label: 'iPhone', platform: 'ios' }
];
vi.mock('../../atome/src/squirrel/apis/unified/adole.js', () => ({
    FastifyAdapter: { ws: { send: async (message, options) => { sent.push({ message, options });
        return message.action === 'command'
            ? { success: true, commandId: 'c1', targetLabel: 'Télé du salon', result: { ok: true, status: 'playing' } }
            : { success: true }; } } }
}));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/surfaces.js', () => ({
    ensureRemoteSurfacePrincipal: async () => ({ ok: true }),
    ensureSurfaceAnnounced: async () => ({ ok: true }),
    listSurfaces: async () => ({ ok: true, surfaces })
}));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/session.js', () => ({ getSessionState: () => ({ mode: 'authenticated' }) }));

const invoked = [];
let remote;
beforeAll(async () => {
    globalThis.atome = { tools: { v2Runtime: { invokeById: async (payload) => { invoked.push(payload); return { ok: true, status: 'playing' }; } } } };
    await import('../../atome/src/squirrel/atome/mcp.js');
    remote = await import('../../atome/src/squirrel/teleport/remote_command.js');
});

test('a spoken device name resolves by label, then by the platform it names, and says when it is ambiguous', () => {
    const { resolveSurfaceByName } = remote;
    expect(resolveSurfaceByName(surfaces, 'sur la télé du salon').surface.surface_id).toBe('s-tv');
    expect(resolveSurfaceByName(surfaces, 'la tele').surface.surface_id).toBe('s-tv');
    expect(resolveSurfaceByName(surfaces, 'le Mac').surface.surface_id).toBe('s-mac');
    expect(resolveSurfaceByName(surfaces, "l'iPad de Léa").surface.surface_id).toBe('s-ipad');
    expect(resolveSurfaceByName(surfaces, 's-phone').surface.surface_id).toBe('s-phone');
    const ambiguous = resolveSurfaceByName([...surfaces, { surface_id: 's-tv2', label: 'Télé de la chambre', platform: 'browser' }], 'la télé');
    expect(ambiguous.error).toBe('remote_command_surface_ambiguous');
    expect(ambiguous.candidates.map((surface) => surface.surface_id)).toEqual(['s-tv', 's-tv2']);
    expect(resolveSurfaceByName(surfaces, 'le frigo').error).toBe('remote_command_surface_not_found');
});

test('the caller sends one typed command and returns the target answer', async () => {
    const outcome = await remote.runRemoteCommand({ surfaceId: 's-tv', toolId: 'tv.open_channel', input: { channel: 'France 2' } });
    expect(outcome).toEqual({ ok: true, commandId: 'c1', targetLabel: 'Télé du salon', result: { ok: true, status: 'playing' } });
    const { message, options } = sent.at(-1);
    expect(message).toEqual({ type: 'remote-control', action: 'command', target_surface_id: 's-tv', tool_id: 'tv.open_channel',
        input: { channel: 'France 2' }, confirmed: false });
    expect(options.timeoutMs).toBeGreaterThan(30000);
    expect(await remote.runRemoteCommand({ surfaceId: 's-tv', toolId: 'x', input: [] })).toMatchObject({ error: 'remote_command_input_invalid' });
});

test('the target runs the tool through its own gateway as a restricted remote actor', async () => {
    const result = await remote.executeRemoteCommand({ commandId: 'c2', toolId: 'tv.open_channel', input: { channel: 'France 2' },
        fromSurfaceId: 's-phone', fromUserId: 'u1' });
    expect(result).toEqual({ ok: true, status: 'playing' });
    const payload = invoked.at(-1);
    expect(payload).toMatchObject({ tool_id: 'tv.open_channel', input: { channel: 'France 2' }, action: 'pointer.click',
        source: { type: 'remote_command', from_surface_id: 's-phone' }, idempotency_key: 'remote_command:c2' });
    expect(payload.actor).toMatchObject({ role: 'remote_surface', sandbox_profiles: ['remote_surface'] });
    expect(payload.actor.capabilities).not.toContain('runtime.sensitive');
});

test('camera, microphone and screen capture stay with the person holding the device', async () => {
    const before = invoked.length;
    expect(await remote.executeRemoteCommand({ commandId: 'c3', toolId: 'ui.capture.photo', fromSurfaceId: 's-phone' }))
        .toEqual({ ok: false, error: 'mcp_capability_denied' });
    expect(await remote.executeRemoteCommand({ commandId: 'c4', toolId: 'surface.run', fromSurfaceId: 's-phone' }))
        .toEqual({ ok: false, error: 'remote_command_tool_not_relayable' });
    expect(invoked.length).toBe(before);
});

test('deleting on a screen the speaker cannot see needs their spoken yes', async () => {
    const before = invoked.length;
    expect(await remote.executeRemoteCommand({ commandId: 'c5', toolId: 'ui.delete.selection' }))
        .toEqual({ ok: false, status: 'SPOKEN_CONFIRMATION_REQUIRED', needs_confirmation: true, tool_id: 'ui.delete.selection' });
    expect(invoked.length).toBe(before);
    await remote.executeRemoteCommand({ commandId: 'c6', toolId: 'ui.delete.selection', confirmed: true });
    expect(invoked.at(-1).tool_id).toBe('ui.delete.selection');
    await remote.executeRemoteCommand({ commandId: 'c7', toolId: 'ui.delete.panel' });
    expect(invoked.at(-1).tool_id).toBe('ui.delete.panel');
});

test('a received command is executed, announced on the target and answered with its result', async () => {
    const announced = [];
    globalThis.window = new EventTarget();
    globalThis.CustomEvent ??= class extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } };
    window.addEventListener('squirrel:remote-command-received', (event) => announced.push(event.detail));
    vi.resetModules();
    const fresh = await import('../../atome/src/squirrel/teleport/remote_command.js');
    expect(fresh.installRemoteCommandExecutor()).toBe(false);
    window.dispatchEvent(new CustomEvent('squirrel:remote-control-command', { detail: { commandId: 'c8', toolId: 'tv.open_channel',
        input: { channel: 'Arte' }, fromSurfaceId: 's-phone', fromLabel: 'iPhone' } }));
    await vi.waitFor(() => expect(sent.at(-1).message.action).toBe('command-result'));
    expect(sent.at(-1).message).toEqual({ type: 'remote-control', action: 'command-result', command_id: 'c8', result: { ok: true, status: 'playing' } });
    expect(announced).toEqual([{ toolId: 'tv.open_channel', fromLabel: 'iPhone', fromSurfaceId: 's-phone', ok: true }]);
});
