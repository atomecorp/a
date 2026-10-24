// Media handoff (eVe/intuition/tools/media_handoff.js): what plays on one device goes
// on playing on another. Teleport and the remote command relay are replaced; the
// players and the scene are stand-ins with the contracts the module reads
// (isPlayingOn / currentTime / cue, the shared playback registry, scene records).
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

const LOCAL = 'surface-phone';
const TV = 'surface-tv';
const atomes = new Map();
const scene = new Map();
const playbacks = new Map();
const calls = { teleports: [], commands: [], gateway: [], stops: [], cues: [] };
let teleportAnswer = { ok: true };
let commandAnswer = { ok: true, result: { ok: true } };
let currentProject = 'project-1';

const youtube = {
    playing: '', time: 0, fullscreen: false,
    isPlayingOn: (id) => youtube.playing === id,
    currentTime: () => youtube.time,
    isFullscreen: () => youtube.fullscreen,
    toggleFullscreen: () => { youtube.fullscreen = !youtube.fullscreen; },
    transport: async (action, id) => { calls.stops.push({ engine: 'youtube', action, id }); if (action === 'stop') youtube.playing = ''; return { ok: true }; },
    cue: (id, seconds) => calls.cues.push({ engine: 'youtube', id, seconds })
};
const tvPlayer = {
    playing: '', fullscreen: false,
    isPlayingOn: (id) => tvPlayer.playing === id,
    snapshot: () => ({ ok: true, playback: tvPlayer.playing ? 'playing' : 'closed', fullscreen: tvPlayer.fullscreen }),
    stop: async () => { calls.stops.push({ engine: 'tv', id: tvPlayer.playing }); tvPlayer.playing = ''; },
    setFullscreen: (enabled) => { tvPlayer.fullscreen = enabled === true; return { fullscreen: tvPlayer.fullscreen }; }
};

vi.mock('../../eVe/core/atome_commit.js', () => ({ getStateCurrent: async (id) => atomes.get(id) || null }));
vi.mock('../../eVe/domains/media/selected_project_media_playback_state.js', () => ({
    getSelectedProjectMediaPlayback: (id) => playbacks.get(id),
    readSelectedProjectRecord: (id) => (scene.has(id) ? { scene: { projectId: currentProject }, record: scene.get(id) } : null),
    selectedProjectMediaPlaybackEntries: () => [...playbacks.entries()],
    stopSelectedProjectMediaPlayback: async (_win, id) => { calls.stops.push({ engine: 'registry', id }); playbacks.delete(id); }
}));
vi.mock('../../eVe/domains/media/project_audio_playback_progress_runtime.js', () => ({
    readProjectAudioDurationSeconds: (record) => Number(record?.properties?.duration) || null,
    readProjectAudioPlaybackCursorForId: (id) => (playbacks.has(id) ? { positionSeconds: playbacks.get(id).position } : null),
    setProjectAudioPlaybackCursor: ({ atomeId, positionSeconds, durationSeconds }) => {
        calls.cues.push({ engine: 'cursor', id: atomeId, seconds: positionSeconds });
        return durationSeconds > 0;
    }
}));
vi.mock('../../eVe/domains/rendering/bevy_video_decode_source_runtime.js', () => ({
    getBevyVideoDecodeStatus: () => null,
    setBevyVideoDecodePlayback: () => ({ ok: true })
}));
vi.mock('../../eVe/domains/rendering/teleport_residual_projection.js', () => ({ TELEPORT_PROXY_MARKER: 'teleport_residual_proxy' }));
vi.mock('../../eVe/domains/rendering/project_view_records.js', () => ({ currentProjectId: () => currentProject }));
vi.mock('../../eVe/intuition/runtime/selection.js', () => ({ getCurrentSelectionIds: () => [] }));
vi.mock('../../eVe/intuition/tools/tv.js', () => ({ tvPlayer }));
vi.mock('../../eVe/intuition/tools/online_video_runtimes.js', () => ({ loadOnlineVideoRuntime: async () => youtube }));
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({
    invokeToolGateway: async (call) => {
        calls.gateway.push(call);
        if (call.tool_id === 'ui.project.open') { currentProject = call.input.project_id; return { ok: true, tool_id: call.tool_id, result: { ok: true } }; }
        if (call.tool_id === 'ui.play') {
            const id = call.input.atome_ids[0];
            if (atomes.get(id)?.properties.media_source === 'tv') tvPlayer.playing = id;
            if (atomes.get(id)?.properties.media_source === 'youtube') youtube.playing = id;
        }
        return { ok: true, tool_id: call.tool_id, result: { ok: true, bridged: 'registered_handler', result: { ok: true } } };
    }
}));
vi.mock('../../atome/src/squirrel/apis/unified/adole_api/surfaces.js', () => ({ getLocalSurfaceId: () => LOCAL }));
vi.mock('../../atome/src/squirrel/teleport/teleport_manager.js', () => ({
    teleportObject: async (atomeId, surfaceId, userId) => { calls.teleports.push({ atomeId, surfaceId, userId }); return teleportAnswer; }
}));
vi.mock('../../atome/src/squirrel/teleport/remote_command.js', () => ({
    runRemoteCommand: async (request) => { calls.commands.push(request); return commandAnswer; }
}));

let handoff;
beforeAll(async () => {
    // Scene polls run fast; the 45 s order timeout keeps its real length.
    vi.stubGlobal('window', { setTimeout: (fn, ms) => setTimeout(fn, ms <= 100 ? 1 : ms), clearTimeout });
    handoff = await import('../../eVe/intuition/tools/media_handoff.js');
});
beforeEach(() => {
    atomes.clear(); scene.clear(); playbacks.clear();
    Object.values(calls).forEach((list) => list.splice(0));
    Object.assign(youtube, { playing: '', time: 0, fullscreen: false });
    Object.assign(tvPlayer, { playing: '', fullscreen: false });
    teleportAnswer = { ok: true };
    commandAnswer = { ok: true, result: { ok: true } };
    currentProject = 'project-1';
});

const arrive = (atomeId, surfaceId = TV, originSurfaceId = LOCAL) => handoff.handOverTeleportedMedia({ atomeId, surfaceId, originSurfaceId });

test('a playing channel is found, teleported, stopped here and resumed fullscreen there at the live point', async () => {
    atomes.set('tv-1', { id: 'tv-1', type: 'video', properties: { media_source: 'tv', name: 'France 24' } });
    playbacks.set('tv-1', { playing: true, projectId: 'project-1' });
    tvPlayer.playing = 'tv-1';
    const media = await handoff.resolveHandoffMedia();
    expect(media).toMatchObject({ atomeId: 'tv-1', kind: 'tv', name: 'France 24', playing: true, projectId: 'project-1' });
    const sent = handoff.sendMediaToSurface({ media, surface: { surface_id: TV, label: 'Télé du salon' } });
    await vi.waitFor(() => expect(calls.teleports).toHaveLength(1));
    // Nothing stops before the destination confirmed the object (teleport §16).
    expect(calls.stops).toHaveLength(0);
    await arrive('tv-1');
    const outcome = await sent;
    expect(outcome.ok).toBe(true);
    expect(calls.stops).toEqual([{ engine: 'tv', id: 'tv-1' }]);
    expect(calls.commands[0]).toMatchObject({ surfaceId: TV, toolId: 'media.resume',
        input: { atome_id: 'tv-1', project_id: 'project-1', position_seconds: 0, fullscreen: true } });
});

test('an online video carries its position; a refused teleport leaves it playing here', async () => {
    atomes.set('yt-1', { id: 'yt-1', type: 'video', properties: { media_source: 'youtube', name: 'Clip' } });
    playbacks.set('yt-1', { playing: true, projectId: 'project-1' });
    Object.assign(youtube, { playing: 'yt-1', time: 83.5 });
    const media = await handoff.resolveHandoffMedia();
    teleportAnswer = { ok: false, error: 'teleport_target_offline' };
    const refused = await handoff.sendMediaToSurface({ media, surface: { surface_id: TV } });
    expect(refused).toMatchObject({ ok: false, error: 'teleport_target_offline' });
    expect(calls.stops).toHaveLength(0);

    teleportAnswer = { ok: true };
    const sent = handoff.sendMediaToSurface({ media, surface: { surface_id: TV }, fullscreen: false });
    await vi.waitFor(() => expect(calls.teleports).toHaveLength(2));
    youtube.time = 85;
    await arrive('yt-1');
    expect((await sent).ok).toBe(true);
    expect(calls.commands[0].input).toMatchObject({ position_seconds: 85, fullscreen: false });
    expect(calls.stops).toEqual([{ engine: 'youtube', action: 'stop', id: 'yt-1' }]);
});

test('a declined offer answers the order; another surface\'s arrival is not ours', async () => {
    atomes.set('a-1', { id: 'a-1', type: 'audio', properties: { name: 'Song', duration: 200 } });
    const media = await handoff.resolveHandoffMedia({ atomeId: 'a-1' });
    const sent = handoff.sendMediaToSurface({ media, surface: { surface_id: TV } });
    await vi.waitFor(() => expect(calls.teleports).toHaveLength(1));
    await arrive('a-1', TV, 'surface-other');
    expect(calls.commands).toHaveLength(0);
    handoff.settleCancelledHandoff({ atomeId: 'a-1', reason: 'declined' });
    expect(await sent).toMatchObject({ ok: false, error: 'teleport_declined' });
});

test('a gesture teleport of a playing media hands it over too; a silent one is left alone', async () => {
    atomes.set('a-2', { id: 'a-2', type: 'audio', properties: { duration: 200 } });
    atomes.set('a-3', { id: 'a-3', type: 'audio', properties: { duration: 200 } });
    playbacks.set('a-2', { playing: true, projectId: 'project-1', position: 42 });
    await arrive('a-3');
    expect(calls.commands).toHaveLength(0);
    await arrive('a-2');
    expect(calls.stops).toEqual([{ engine: 'registry', id: 'a-2' }]);
    expect(calls.commands[0].input).toMatchObject({ atome_id: 'a-2', position_seconds: 42, fullscreen: false });
});

test('the destination opens the project, cues the position and plays through ui.play', async () => {
    atomes.set('yt-2', { id: 'yt-2', type: 'video', properties: { media_source: 'youtube' } });
    scene.set('yt-2', { id: 'yt-2', type: 'video', properties: { media_source: 'youtube' } });
    currentProject = 'home';
    const result = await handoff.resumeHandedOffMedia({ atome_id: 'yt-2', project_id: 'project-9', position_seconds: 85, fullscreen: true });
    expect(calls.gateway.map((call) => call.tool_id)).toEqual(['ui.project.open', 'ui.play']);
    expect(calls.cues).toEqual([{ engine: 'youtube', id: 'yt-2', seconds: 85 }]);
    expect(result).toMatchObject({ ok: true, kind: 'online', project_id: 'project-9', position_seconds: 85, fullscreen: true });
});

test('the destination refuses an object it still shows as a residual proxy', async () => {
    scene.set('tv-2', { id: 'tv-2', type: 'text', properties: { teleport_residual_proxy: true } });
    const result = await handoff.resumeHandedOffMedia({ atome_id: 'tv-2', project_id: 'project-1' });
    expect(result).toMatchObject({ ok: false, error: 'MEDIA_NOT_HERE' });
    expect(calls.gateway).toHaveLength(0);
});

test('a media already hosted on another device is not here to be sent', async () => {
    atomes.set('tv-3', { id: 'tv-3', type: 'video', properties: { media_source: 'tv', teleport_surface_id: TV } });
    expect(await handoff.resolveHandoffMedia({ atomeId: 'tv-3' })).toBeNull();
    atomes.set('tv-3', { id: 'tv-3', type: 'video', properties: { media_source: 'tv', teleport_surface_id: LOCAL } });
    expect(await handoff.resolveHandoffMedia({ atomeId: 'tv-3' })).toMatchObject({ atomeId: 'tv-3', kind: 'tv', playing: false });
});
