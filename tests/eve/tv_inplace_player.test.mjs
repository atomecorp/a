import { test, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
const panels = vi.hoisted(() => ({ state: { mounted: new Map(), geometryBySurfaceKey: new Map() } }));
vi.mock('../../eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js', () => ({ bevyPanelRuntimeState: panels.state }));
vi.mock('../../eVe/domains/rendering/project_view_records.js', () => ({ currentProjectId: () => 'project' }));
vi.mock('../../eVe/domains/rendering/surface_runtime.js', () => ({ setRenderSurfaceInteractionInterceptorLayer: () => null }));
vi.mock('../../eVe/domains/rendering/project_scene_runtime.js', () => ({ updateProjectSceneRecordByAtomeId: async () => {}, updateProjectSceneRecords: async () => {}, readProjectSceneAtomClientPlacement: () => null }));
vi.mock('../../eVe/core/atome_commit.js', () => ({ getStateCurrent: async () => null }));
vi.mock('../../eVe/intuition/tools/tv_catalog_client.js', () => ({ readTvChannelsById: async () => [], resolveTvYoutubeLive: async () => '' }));
import { createTvInPlacePlayer, playableTvStreams } from '../../eVe/intuition/tools/tv_inplace_player.js';
import { getSelectedProjectMediaPlayback, stopSelectedProjectMediaPlayback } from '../../eVe/domains/media/selected_project_media_playback_state.js';

const tvAtome = { id: 'tv1', properties: { media_source: 'tv', tv_channel_id: 'TF1.fr', tv_channel_name: 'TF1' } };
const setup = ({ streams, origin = 'https://atome.one', canPlayHls = true } = {}) => {
    const win = new JSDOM('<canvas id="eve_surface_project"></canvas>', { url: origin }).window;
    win.document.querySelector('canvas').getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const frames = new Map(); let seq = 0;
    win.requestAnimationFrame = fn => { frames.set(++seq, fn); return seq; }; win.cancelAnimationFrame = id => frames.delete(id);
    const tick = () => { const current = [...frames]; frames.clear(); for (const [, fn] of current) fn(); };
    // Media elements: jsdom has none, so each attempt is driven by the test.
    const attempts = [];
    win.HTMLMediaElement.prototype.canPlayType = () => (canPlayHls ? 'maybe' : '');
    win.HTMLMediaElement.prototype.play = function play() { attempts.push(this); return Promise.resolve(); };
    win.HTMLMediaElement.prototype.pause = function pause() { this.dispatchEvent(new win.Event('pause')); };
    win.HTMLMediaElement.prototype.load = function load() {};
    const youtubeCalls = [];
    const youtube = { playVideoOnAtome: async (input) => { youtubeCalls.push(input); return { ok: true }; },
        isPlayingOn: () => youtubeCalls.length > 0, transport: async (action) => { youtubeCalls.push({ action }); return { ok: true, handled: true }; },
        isFullscreen: () => false, toggleFullscreen() {} };
    const notices = [];
    const player = createTvInPlacePlayer({ win, readCurrent: async () => tvAtome,
        readChannels: async () => [{ id: 'TF1.fr', name: 'TF1', streams }],
        resolveLive: async () => 'NG7ZX42nZKc', youtube: async () => youtube,
        hls: async () => ({ isSupported: () => false }),
        loadPlacement: async () => () => ({ left: 40, top: 30, width: 320, height: 180, rotation: 0 }),
        notify: message => notices.push(message), startTimeoutMs: 50 });
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    return { win, player, attempts, youtubeCalls, notices, tick, settle };
};

test('only streams the page can open are tried: plain http is skipped on https and iOS pages', () => {
    const streams = [{ kind: 'hls', url: 'http://a/x.m3u8', secure: false }, { kind: 'hls', url: 'https://b/x.m3u8', secure: true },
        { kind: 'dash', url: 'https://c/x.mpd', secure: true }, { kind: 'youtube_live', url: 'https://www.youtube.com/c/x/live', secure: true }];
    expect(playableTvStreams(streams).map(stream => stream.url)).toEqual(['https://b/x.m3u8', 'https://www.youtube.com/c/x/live']);
    expect(playableTvStreams(streams, { acceptHttp: true })).toHaveLength(3);
});

test('a channel falls through failing streams and plays the first working one in place', async () => {
    const { win, player, attempts, tick, settle } = setup({ streams: [
        { kind: 'hls', url: 'https://dead.test/x.m3u8', secure: true },
        { kind: 'hls', url: 'http://relay.test/x.m3u8', secure: false },
        { kind: 'hls', url: 'https://live.test/x.m3u8', secure: true }] });
    const playing = player.play('tv1');
    await settle(); await settle();
    expect(attempts[0].src).toBe('https://dead.test/x.m3u8');
    attempts[0].dispatchEvent(new win.Event('error'));
    await settle(); await settle();
    // The http relay was never tried on an https page.
    expect(attempts[1].src).toBe('https://live.test/x.m3u8');
    expect(win.document.querySelectorAll('video')).toHaveLength(1);
    attempts[1].dispatchEvent(new win.Event('playing'));
    const result = await playing;
    expect(result).toMatchObject({ ok: true, channel_id: 'TF1.fr', playback: 'playing', operation: 'opened' });
    tick();
    const video = win.document.querySelector('video');
    expect([video.style.left, video.style.top, video.style.width, video.style.height]).toEqual(['40px', '30px', '320px', '180px']);
    expect(video.crossOrigin).toBeNull();
    expect(video.style.pointerEvents).toBe('none');
    // The shared playback registry carries it, lit, like any playing video (the rail reads it).
    expect(getSelectedProjectMediaPlayback('tv1')).toMatchObject({ kind: 'video', playing: true });
    video.dispatchEvent(new win.Event('pause'));
    expect(getSelectedProjectMediaPlayback('tv1').playing).toBe(false);
    // A live channel: Play / Stop stops it (the next Play tunes in live again).
    expect((await player.transport('toggle', 'tv1')).action).toBe('stop');
    expect(win.document.querySelector('video')).toBeNull();
    expect(player.snapshot().operation).toBe('closed');
    expect(getSelectedProjectMediaPlayback('tv1')).toBeUndefined();
});

test('the registry or leaving the project stops the channel', async () => {
    for (const leave of [
        (win) => stopSelectedProjectMediaPlayback(win, 'tv1'),
        (win) => win.dispatchEvent(new win.CustomEvent('eve:workspace-mode-changed', { detail: { mode: 'dashboard' } }))
    ]) {
        const { win, player, attempts, settle } = setup({ streams: [{ kind: 'hls', url: 'https://live.test/x.m3u8', secure: true }] });
        const playing = player.play('tv1');
        await settle(); await settle();
        attempts[0].dispatchEvent(new win.Event('playing'));
        await playing;
        await leave(win);
        await settle();
        expect(win.document.querySelector('video')).toBeNull();
        expect(player.snapshot().operation).toBe('closed');
        expect(getSelectedProjectMediaPlayback('tv1')).toBeUndefined();
    }
});

test('YouTube and YouTube live streams play through the YouTube player on the same Atome', async () => {
    const { player, youtubeCalls } = setup({ streams: [{ kind: 'youtube_live', url: 'https://www.youtube.com/c/franceinfo/live', secure: true }] });
    const result = await player.play('tv1');
    expect(result.ok).toBe(true);
    expect(youtubeCalls[0]).toEqual({ atomeId: 'tv1', videoId: 'NG7ZX42nZKc', title: 'TF1' });
    await player.transport('pause', 'tv1');
    expect(youtubeCalls.at(-1)).toEqual({ action: 'pause' });
});

test('a channel with no playable stream reports it and leaves nothing behind', async () => {
    const { win, player, notices } = setup({ streams: [{ kind: 'hls', url: 'http://relay.test/x.m3u8', secure: false }] });
    const result = await player.play('tv1');
    expect(result).toMatchObject({ ok: false, error: 'PLAYBACK_FAILED', playback: 'error' });
    expect(notices).toHaveLength(1);
    expect(win.document.querySelector('video')).toBeNull();
});

test('an idle TV Atome starts from the media reader Play; Pause on it does nothing', async () => {
    const { win, player, attempts, settle } = setup({ streams: [{ kind: 'hls', url: 'https://live.test/x.m3u8', secure: true }] });
    expect(await player.handlesAtomeId('tv1')).toBe(true);
    expect((await player.transport('pause', 'tv1')).handled).toBe(true);
    expect(win.document.querySelector('video')).toBeNull();
    const pending = player.transport('toggle', 'tv1');
    await settle(); await settle();
    attempts[0].dispatchEvent(new win.Event('playing'));
    expect(await pending).toMatchObject({ ok: true, handled: true, action: 'play', latched: true });
});
