// Assistant device commands (eVe/voice/assistant/assistant_surface_tools.js): what the
// assistant is given to SAY for each outcome of a relayed order. The relay is replaced;
// the target answer below is the real gateway envelope shape observed in the app
// (`{ tool_id, result: { bridged, result: <tool result> } }`).
import { beforeAll, expect, test, vi } from 'vitest';

const devices = [{ surface_id: 's-mac', label: 'Mac du bureau', platform: 'tauri' }];
let answer = null;
const runs = [];
vi.mock('../../atome/src/squirrel/teleport/remote_command.js', async (importOriginal) => {
    const { resolveSurfaceByName } = await importOriginal();
    return {
        resolveSurfaceByName,
        listRemoteSurfaces: async () => ({ ok: true, surfaces: devices }),
        runRemoteCommand: async (request) => { runs.push(request); return answer; }
    };
});
let handoffMedia = null;
let handoffOutcome = null;
const handoffs = [];
vi.mock('../../eVe/intuition/tools/media_handoff.js', () => ({
    resolveHandoffMedia: async () => handoffMedia,
    sendMediaToSurface: async (order) => { handoffs.push(order); return handoffOutcome; }
}));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/surfaces.js', () => ({
    renameLocalSurface: async (label) => ({ ok: true, name: String(label).trim(), announced: true })
}));

const envelope = (toolResult) => ({ ok: true, commandId: 'c', result: {
    ok: toolResult.ok !== false, tool_id: 'tv.open_channel',
    result: { ok: toolResult.ok !== false, bridged: 'registered_handler', result: toolResult } } });

let run;
beforeAll(async () => {
    ({ executeAssistantSurfaceCommand: run } = await import('../../eVe/voice/assistant/assistant_surface_tools.js'));
});

test('success returns the tool own result and a sentence naming the device', async () => {
    answer = envelope({ ok: true, operation: 'opened', playback: 'playing' });
    const outcome = await run('surface.run', { surface: 'sur le Mac', tool: 'tv.open_channel', arguments: { channel: 'Arte' } });
    expect(runs.at(-1)).toMatchObject({ surfaceId: 's-mac', toolId: 'tv.open_channel', input: { channel: 'Arte' }, confirmed: false });
    expect(outcome).toMatchObject({ ok: true, device: { name: 'Mac du bureau' }, result: { operation: 'opened' } });
    expect(outcome.message).toContain('Mac du bureau');
});

test('the tool own failure reason wins over the envelope, with its candidates', async () => {
    answer = envelope({ ok: false, error: 'AMBIGUOUS_CHANNEL', candidates: [{ name: 'France 24' }] });
    const outcome = await run('surface.run', { surface: 'Mac du bureau', tool: 'tv.open_channel', arguments: { channel: 'France' } });
    expect(outcome).toMatchObject({ ok: false, error: 'AMBIGUOUS_CHANNEL', result: { candidates: [{ name: 'France 24' }] } });
    expect(outcome.message).toContain('Mac du bureau');
});

test('deletion asks a spoken question; policy refusals and offline devices are said plainly', async () => {
    answer = envelope({ ok: false, status: 'SPOKEN_CONFIRMATION_REQUIRED', needs_confirmation: true });
    expect(await run('surface.run', { surface: 'Mac du bureau', tool: 'ui.delete.selection' }))
        .toMatchObject({ ok: false, status: 'SPOKEN_CONFIRMATION_REQUIRED', question: expect.stringContaining('Mac du bureau') });
    answer = { ok: true, result: { ok: false, error: 'mcp_capability_denied' } };
    const refused = await run('surface.run', { surface: 'Mac du bureau', tool: 'ui.capture.photo' });
    expect(refused).toMatchObject({ ok: false, error: 'mcp_capability_denied' });
    answer = { ok: false, error: 'remote_command_target_offline' };
    const offline = await run('surface.run', { surface: 'Mac du bureau', tool: 'tv.close' });
    expect(offline).toMatchObject({ ok: false, error: 'remote_command_target_offline' });
    expect(new Set([refused.message, offline.message]).size).toBe(2);
});

test('an unknown device is never guessed: nothing is sent and the connected ones are named', async () => {
    const before = runs.length;
    const outcome = await run('surface.run', { surface: 'la télé de la cuisine', tool: 'tv.open_channel' });
    expect(outcome).toMatchObject({ ok: false, error: 'remote_command_surface_not_found' });
    expect(outcome.message).toContain('Mac du bureau');
    expect(runs.length).toBe(before);
    expect(await run('surface.rename', { label: 'Télé du salon' })).toMatchObject({ ok: true, name: 'Télé du salon' });
});

test('send_media: the playing media goes to the named device, and every outcome has its own sentence', async () => {
    handoffMedia = null;
    const nothing = await run('surface.send_media', { surface: 'Mac du bureau' });
    expect(nothing).toMatchObject({ ok: false, error: 'media_handoff_nothing' });
    expect(handoffs).toHaveLength(0);

    handoffMedia = { atomeId: 'tv-1', kind: 'tv', name: 'France 24', playing: true };
    handoffOutcome = { ok: true, resumed: envelope({ ok: true, kind: 'tv', playback: 'playing', fullscreen: true }).result };
    const sent = await run('surface.send_media', { surface: 'sur le Mac du bureau' });
    expect(handoffs.at(-1)).toMatchObject({ media: { atomeId: 'tv-1' }, surface: { surface_id: 's-mac' }, fullscreen: true });
    expect(sent).toMatchObject({ ok: true, device: { name: 'Mac du bureau' }, media: { name: 'France 24' }, result: { playback: 'playing' } });

    handoffOutcome = { ok: false, error: 'teleport_declined' };
    const declined = await run('surface.send_media', { surface: 'Mac du bureau', fullscreen: false });
    expect(handoffs.at(-1).fullscreen).toBe(false);
    handoffOutcome = { ok: true, resumed: envelope({ ok: false, error: 'MEDIA_NOT_HERE' }).result };
    const silent = await run('surface.send_media', { surface: 'Mac du bureau' });
    expect(silent).toMatchObject({ ok: false, error: 'MEDIA_NOT_HERE' });
    handoffOutcome = { ok: false, error: 'teleport_target_offline' };
    const offline = await run('surface.send_media', { surface: 'Mac du bureau' });
    const messages = [nothing, sent, declined, silent, offline].map((outcome) => outcome.message);
    messages.slice(1).forEach((message) => expect(message).toContain('Mac du bureau'));
    expect(new Set(messages).size).toBe(messages.length);

    const unknown = await run('surface.send_media', { surface: 'la télé de la cuisine' });
    expect(unknown).toMatchObject({ ok: false, error: 'remote_command_surface_not_found' });
});
