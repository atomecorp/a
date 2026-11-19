// Song chaining + MIDI launch, real Web app (Playwright, isolated server, fake Web MIDI keyboard).
// A setlist (sequential list) holds three multitrack songs (simultaneous molecules); playing the
// project runs them one after another on the audio clock: never two songs at once, never a hole.
// Then each song gets a MIDI binding (Program Change or note) launching it from its row.
// node tests/probes/song_chaining_midi_web.probe.mjs (parcours CHN-01, CHN-02)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { waitFor } from './dashboard_workspace_stress/support.mjs';
import { startServer } from '../helpers/probe_server.mjs';
import { openUserPastFirstLaunch } from '../../temp/youtube_search/app_session.mjs';
import { openNewProject } from '../../temp/templates_interactivity/support.mjs';

const OUT = path.resolve('temp/probe_reports/song_chaining');
// The harness's own Rust server: the prebuilt binaries, a long start on a loaded machine, the system's roots
// from their file when the keychain cannot be read (a sandboxed shell: atome-server `tls_roots_missing`).
process.env.PROBE_PREBUILT_SERVER ||= '1';
process.env.PROBE_SERVER_START_MS ||= '400000';
if (!process.env.SSL_CERT_FILE && fs.existsSync('/etc/ssl/cert.pem')) process.env.SSL_CERT_FILE = '/etc/ssl/cert.pem';
fs.mkdirSync(OUT, { recursive: true });
const report = { ok: false, checks: [], errors: [] };
const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const fails = [];
const check = (name, ok, detail = {}) => {
    report.checks.push({ name, ok: !!ok, ...detail }); write();
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(detail).slice(0, 500)}`);
    if (!ok) fails.push(name);
};

const FAKE_WEB_MIDI = () => {
    const listeners = new Map();
    const port = { id: 'keys', name: 'Probe Keys', type: 'input', state: 'connected',
        addEventListener: (type, fn) => { if (type === 'midimessage') listeners.set('keys', fn); },
        removeEventListener: (type) => { if (type === 'midimessage') listeners.delete('keys'); } };
    const access = { inputs: new Map([['keys', port]]), outputs: new Map(), addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: async () => access });
    window.__probeMidiSend = (bytes) => listeners.get('keys')?.({ data: Uint8Array.from(bytes), timeStamp: performance.now() });
};

// Song → its tracks' lengths (seconds). Song length = its longest track.
const SONGS = [['A', [2.0, 1.5]], ['B', [1.0, 2.5]], ['C', [1.5, 1.25]]];
const LENGTHS = SONGS.map(([, t]) => Math.max(...t));
const STARTS = LENGTHS.map((_, i) => LENGTHS.slice(0, i).reduce((a, b) => a + b, 0));
const TOTAL = LENGTHS.reduce((a, b) => a + b, 0);

const server = await startServer({ env: { SQUIRREL_AUTH_SMS_MOCK: '1' } });
const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required', '--window-position=-32000,-32000'] });
const newContext = browser.newContext.bind(browser);
browser.newContext = async (options) => { const context = await newContext(options); await context.addInitScript(FAKE_WEB_MIDI); return context; };
try {
    const page = await openUserPastFirstLaunch({ browser, server, report, write });
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') (report.console ||= []).push(m.text().slice(0, 300)); });
    await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active === true && window.eveDashboardBevyUiRuntime?.state?.opening !== true }), 240000, 300);
    await page.waitForTimeout(3000);
    const opened = await openNewProject(page, `Song chaining ${Date.now()}`);
    const projectId = opened?.ok === true ? opened.id : '';
    check('project_open', !!projectId, { projectId });
    await page.waitForTimeout(2000);

    const ids = await page.evaluate(async ({ pid, songs }) => {
        const create = async (spec) => {
            const result = await window.eveToolBase.createAtome({ ...spec, type: spec.kind, projectId: pid, parentId: pid }, { render: false });
            const id = String(result?.id || result?.atome_id || spec.id || '');
            if (!result?.ok || !id) throw new Error(`create_failed:${JSON.stringify({ spec, result })}`);
            return id;
        };
        const tag = Date.now();
        const setlist = await create({ id: `setlist_${tag}`, kind: 'group', name: 'Setlist', molecule_entity: 'molecule', left: 40, top: 40, width: 200, height: 60 });
        const out = { setlist, songs: {}, tracks: {} };
        const events = [{ kind: 'set', atome_id: setlist, project_id: pid, parent_id: pid, props: { hierarchy_order: 0, playback_mode: 'sequential' } }];
        for (const [s, [name, tracks]] of songs.entries()) {
            const song = await create({ id: `song_${name}_${tag}`, kind: 'group', name: `Song ${name}`, molecule_entity: 'molecule', left: 40, top: 120 + s * 80, width: 200, height: 60 });
            out.songs[name] = song;
            events.push({ kind: 'set', atome_id: song, project_id: pid, parent_id: setlist, props: { hierarchy_order: s, playback_mode: 'simultaneous' } });
            for (const [t, seconds] of tracks.entries()) {
                const track = await create({ id: `track_${name}${t}_${tag}`, kind: 'audio', name: `${name} track ${t}`,
                    src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: seconds,
                    left: 260 + t * 200, top: 120 + s * 80, width: 180, height: 60 });
                (out.tracks[name] ||= []).push(track);
                events.push({ kind: 'set', atome_id: track, project_id: pid, parent_id: song, props: { hierarchy_order: t } });
            }
        }
        const committed = await window.Atome.commitBatch(events, { projectId: pid, tx_id: `song_chaining_${tag}` });
        if (committed?.ok === false) throw new Error(`membership_failed:${JSON.stringify(committed)}`);
        await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
        const views = await import('/eVe/domains/rendering/project_view_mode_state.js');
        await views.setProjectViewMode(views.PROJECT_VIEW_MODES.LIST, { projectId: pid });
        return out;
    }, { pid: projectId, songs: SONGS });
    check('setlist_with_three_multitrack_songs', Object.keys(ids.songs).length === 3, ids);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, '01_list.png') });

    // Sample the transport on the audio clock while the project plays.
    const sampleRun = (stopAt) => page.evaluate(async ({ songIds, stopAt }) => {
        const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
        const samples = [];
        const started = performance.now();
        while (performance.now() - started < (stopAt + 6) * 1000) {
            const t = projectViewTransport.read();
            samples.push({ at: performance.now() - started, status: t.status, position: t.positionSeconds, duration: t.durationSeconds,
                songs: Object.entries(songIds).filter(([, id]) => (t.activePathIds || []).includes(id)).map(([name]) => name) });
            if (t.status === 'ended' || t.status === 'stopped' && samples.length > 20) break;
            await new Promise((r) => setTimeout(r, 20));
        }
        return samples;
    }, { songIds: ids.songs, stopAt });
    const tool = (input) => page.evaluate(async (payload) => {
        const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
        const result = await invokeToolGateway(payload);
        return JSON.parse(JSON.stringify(result ?? null, (k, v) => (typeof v === 'function' ? undefined : v)));
    }, input);

    const played = await tool({ tool_id: 'ui.project.transport', action: 'pointer.click', input: { operation: 'play' }, source: { type: 'ui' } });
    check('project_play', played?.ok !== false, { played: JSON.stringify(played).slice(0, 300) });
    const samples = await sampleRun(TOTAL);
    fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify(samples, null, 1));
    const playing = samples.filter((s) => s.status === 'playing');
    check('transport_duration_is_sum_of_songs', Math.abs((playing[0]?.duration || 0) - TOTAL) < 1e-6, { duration: playing[0]?.duration, TOTAL });
    check('never_two_songs_at_once', playing.every((s) => s.songs.length <= 1), { overlaps: playing.filter((s) => s.songs.length > 1).slice(0, 5) });
    check('never_a_hole_between_songs', playing.filter((s) => s.position < TOTAL - 0.05).every((s) => s.songs.length === 1),
        { holes: playing.filter((s) => s.position < TOTAL - 0.05 && s.songs.length !== 1).slice(0, 5) });
    const order = playing.map((s) => s.songs[0]).filter((v, i, a) => v && v !== a[i - 1]);
    check('songs_follow_in_list_order', order.join('') === 'ABC', { order });
    // Each song enters between the last sample before its start and the first one after it (the page reads a
    // position the audio clock publishes; under load it arrives in bursts, so the bracket is the measure).
    for (const [i, [name]] of SONGS.entries()) {
        const first = playing.find((s) => s.songs[0] === name);
        const before = [...playing].reverse().find((s) => s.position < (first?.position ?? 0));
        check(`song_${name}_enters_at_${STARTS[i]}s`, first && first.position >= STARTS[i] - 1e-6 && (!before || before.position < STARTS[i] + 1e-6),
            { firstPosition: first?.position, previousSample: before?.position });
    }
    // The audio clock never goes back, and over the whole run it keeps wall-clock pace (no stall at a boundary).
    const back = playing.slice(1).filter((s, i) => s.position < playing[i].position - 1e-6);
    const span = playing.at(-1).position - playing[0].position, wall = (playing.at(-1).at - playing[0].at) / 1000;
    check('audio_clock_steady_across_boundaries', back.length === 0 && Math.abs(span - wall) < 0.35, { back: back.slice(0, 3), span, wall });
    check('setlist_ends_after_last_song', samples.at(-1)?.status === 'ended' || samples.at(-1)?.position >= TOTAL - 0.05, { last: samples.at(-1) });

    // MIDI: one binding per song, launching it from its row (Program Change 0/1, note 60).
    const inputs = { A: { message_type: 'program_change', channel: 1, number: 0 }, B: { message_type: 'program_change', channel: 1, number: 1 },
        C: { message_type: 'note_on', channel: 1, number: 60 } };
    for (const [name, input] of Object.entries(inputs)) {
        const created = await tool({ tool_id: 'midi.binding.create', action: 'pointer.click', source: { type: 'ui' }, input: {
            parent_id: ids.songs[name], project_id: projectId, input: { port_id: 'keys', ...input, min: 0, max: 127 },
            actions: [{ tool_id: 'ui.project.transport', action: 'pointer.click', parameters: { operation: 'play', start_atome_id: ids.songs[name] } }] } });
        check(`binding_created_${name}`, created?.ok !== false, { created: JSON.stringify(created).slice(0, 300) });
    }
    // A MIDI message launches its song: measured from the send until the song is heard from its row.
    const launch = async (name, bytes) => {
        const i = SONGS.findIndex(([n]) => n === name);
        const t = await page.evaluate(async ({ songIds, song, bytes, start, end }) => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            const read = () => { const r = projectViewTransport.read();
                return { status: r.status, position: r.positionSeconds, songs: Object.entries(songIds).filter(([, id]) => (r.activePathIds || []).includes(id)).map(([n]) => n) }; };
            const sent = performance.now();
            window.__probeMidiSend(bytes);
            for (;;) {
                const r = read();
                if (r.status === 'playing' && r.songs.join() === song && r.position >= start && r.position < start + 0.6) return { ...r, latencyMs: Math.round(performance.now() - sent) };
                if (performance.now() - sent > 10000) return { ...r, latencyMs: null };
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }, { songIds: ids.songs, song: name, bytes, start: STARTS[i], end: STARTS[i] + LENGTHS[i] });
        check(`midi_${bytes.map((b) => b.toString(16)).join('_')}_launches_song_${name}`, t.latencyMs != null, t);
        (report.latencies ||= []).push({ name, bytes, latencyMs: t.latencyMs });
        await page.waitForTimeout(400);
    };
    // Where a first launch after the end spends its time: the bindings read, then the transport's start from a row.
    report.coldLaunch = await page.evaluate(async (song) => {
        const service = await import('/eVe/intuition/runtime/midi_binding_service.js');
        const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
        const t0 = performance.now();
        const listed = await service.listMidiBindings({});
        const t1 = performance.now();
        const played = await invokeToolGateway({ tool_id: 'ui.project.transport', action: 'pointer.click', input: { operation: 'play', start_atome_id: song }, source: { type: 'ui' } });
        const t2 = performance.now();
        await invokeToolGateway({ tool_id: 'ui.project.transport', action: 'pointer.click', input: { operation: 'stop' }, source: { type: 'ui' } });
        const t3 = performance.now();
        const again = await invokeToolGateway({ tool_id: 'ui.project.transport', action: 'pointer.click', input: { operation: 'play', start_atome_id: song }, source: { type: 'ui' } });
        const t4 = performance.now();
        await invokeToolGateway({ tool_id: 'ui.project.transport', action: 'pointer.click', input: { operation: 'stop' }, source: { type: 'ui' } });
        return { bindings: listed.bindings?.length, listMs: Math.round(t1 - t0), firstPlayMs: Math.round(t2 - t1), playOk: played?.ok, stopMs: Math.round(t3 - t2), secondPlayMs: Math.round(t4 - t3), againOk: again?.ok };
    }, ids.songs.B);
    console.log('COLD_LAUNCH', JSON.stringify(report.coldLaunch));
    write();
    await launch('B', [0xC0, 1]);
    await launch('C', [0x90, 60, 100]);
    await launch('A', [0xC0, 0]);
    await launch('B', [0xC0, 1]);
    // A binding made in the MIDI Binding panel by choosing the tool keeps no parameters: its target is the song.
    const panelStyle = await tool({ tool_id: 'midi.binding.create', action: 'pointer.click', source: { type: 'ui' }, input: {
        parent_id: ids.songs.C, project_id: projectId, input: { port_id: 'keys', message_type: 'program_change', channel: 1, number: 2, min: 0, max: 127 },
        actions: [{ tool_id: 'ui.project.transport', action: 'pointer.click', parameters: {}, target_atome_id: ids.songs.C }] } });
    check('panel_style_binding_created', panelStyle?.ok !== false, { panelStyle: JSON.stringify(panelStyle).slice(0, 300) });
    await launch('C', [0xC0, 2]);
    await tool({ tool_id: 'ui.project.transport', action: 'pointer.click', input: { operation: 'stop' }, source: { type: 'ui' } });
    await page.screenshot({ path: path.join(OUT, '02_after.png') });
    report.ok = fails.length === 0;
} catch (error) {
    report.errors.push(String(error?.stack || error));
    console.log('ERROR', error?.stack || error);
} finally {
    write();
    console.log(report.ok ? `real_app.probe: PASS (${report.checks.length})` : `real_app.probe: FAIL ${fails.join(', ')}`);
    await browser.close().catch(() => {});
    await server.stop?.().catch?.(() => {});
    process.exit(report.ok ? 0 : 1);
}
