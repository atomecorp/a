// R-183 Web probe: an audio take on a Timeline track is taken at its strip's REC point — dry when REC lies under
// IN, wet when it lies after an effect (the strip's volume at -6 dB) — through the real path: the kernel timeline,
// the Molecule mix engine (`take`), the generic recording session, startAudioRecording → record_audio →
// audio_core_record_strip.js → the WASM graph's tap (the app's own atome/src/wasm build).
// The microphone is Chromium's fake device playing a 440 Hz sine at 0.5.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../../helpers/probe_server.mjs';
import { openUserPastFirstLaunch } from '../../helpers/probe_app_session.mjs';

const HERE = path.resolve('temp/probe_reports/music/console_strip_take_web');
fs.mkdirSync(HERE, { recursive: true });
const RATE = 48000;

const writeSine = (file) => {
    const frames = RATE * 30;
    const wav = Buffer.alloc(44 + frames * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + frames * 2, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
    for (let i = 0; i < frames; i += 1) wav.writeInt16LE(Math.round(0.5 * Math.sin(2 * Math.PI * 440 * i / RATE) * 32767), 44 + i * 2);
    fs.writeFileSync(file, wav);
    return file;
};

const sine = writeSine(path.join(HERE, 'sine_440_half.wav'));
// Its own isolated server and a real account: the audio facade is a deferred module, loaded once a signed-in
// workspace is presented (boot_runtime.js#publishWorkspacePresentation), never on a bare page.
const server = await startServer();
const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${sine}`,
        '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal']
});
const page = await openUserPastFirstLaunch({ browser, server, bootPredicate: () => ({ ok: window.AdoleAPI?.security?.isAnonymous?.() === false }) });
const logs = [];
page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) logs.push(message.text()); });
await page.context().grantPermissions(['microphone']);
// The audio facade is a deferred boot module (eve_boot_modules.js): late on a loaded machine.
await page.waitForFunction(() => typeof window.Squirrel?.av?.audio?.get_runtime === 'function', null, { timeout: Number(process.env.PROBE_AUDIO_READY_MS) || 180_000 });
// The fake input's level must stay put between the takes: no voice processing (AGC) on it.
await page.evaluate(() => {
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    media.getUserMedia = (constraints) => original({ ...constraints, audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } });
});

await page.waitForTimeout(4000);
await page.mouse.click(4, 4);
const unlocked = await page.evaluate(async () => {
    const { unlockMediaPlaybackAudio } = await import('/eVe/domains/media/shared/media_playback_audio_executor.js');
    try { await unlockMediaPlaybackAudio(window); return { ok: true, runtime: window.Squirrel.av.audio.get_runtime() }; } catch (error) { return { ok: false, error: String(error), runtime: window.Squirrel.av.audio.get_runtime() }; }
});
console.log('unlock', JSON.stringify(unlocked));
if (process.env.DEBUG_TAP) {
    const debug = await page.evaluate(async () => {
        const audio = window.Squirrel.av.audio;
        const { createWebLiveInputs } = await import('/eVe/core/media_engine/molecule_mix_live_web.js');
        const call = (name, arg) => audio.__call_backend_method(name, arg);
        const pushes = [];
        const original = audio.mix_live_push;
        audio.mix_live_push = (arg) => { if (pushes.length < 3) pushes.push({ start: arg.startFrame, n: arg.pcm.length }); return original(arg); };
        await audio.mix_apply({ strips: [{ id: 's', input: { kind: 'live_audio', device_id: 'default' }, chain: [{ id: 'r', type: 'record', params: {} }], output: { kind: 'main' } }], transports: [] });
        await createWebLiveInputs({ readAudio: () => audio }).sync(['default']);
        await new Promise((r) => setTimeout(r, 500));
        const rate = await call('mix_record_start', { stripId: 's', deviceId: 'default' });
        await new Promise((r) => setTimeout(r, 500));
        const drained = await call('mix_record_drain', { stripId: 's' });
        return { rate, first: drained.first_frame, n: drained.left.length, pushes, ctx: call('shared_context').currentTime * call('shared_context').sampleRate };
    });
    console.log('debug', JSON.stringify(debug));
    process.exit(0);
}
const result = await page.evaluate(async () => {
    const K = await import('/eVe/intuition/tools/molecule/kernel/index.js');
    const { createMoleculeMixEngine, mixGraphSupported } = await import('/eVe/core/media_engine/molecule_mix_engine.js');
    const { createGenericMoleculeRecordingSession } = await import('/eVe/intuition/tools/molecule/recording/generic.js');
    const { startAudioRecording, stopAudioRecording } = await import('/eVe/domains/media/api/audio_api.js');
    const audio = window.Squirrel.av.audio;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rms = (pcm) => {
        const steady = pcm.subarray(Math.floor(pcm.length / 4), Math.floor(pcm.length * 3 / 4));
        return Math.sqrt(steady.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, steady.length));
    };
    const engine = createMoleculeMixEngine({ readAudio: () => audio });
    const runOnce = async (recFirst, name) => {
        let tl = K.createTimeline({ timeline_id: `tl_${name}`, project_id: 'p', owner_atome_id: 'g' });
        tl = K.addTrack(tl, { track_id: 'a', section_id: `tl_${name}:section:1`, kind: 'audio', name: 'A', order: 10 });
        const volume = K.readMixStrip(tl, 'a:audio').chain.find((module) => module.type === 'volume');
        tl = K.updateMixModule(tl, { strip_id: 'a:audio', module_id: volume.module_id, params: { gain_db: -6.0206 } });
        if (!recFirst) tl = K.moveMixModule(tl, { strip_id: 'a:audio', module_id: 'a:audio:record', index: 1 });
        const key = `probe_${name}`;
        const applied = await engine.update(key, tl);
        const applies = [];
        const session = { getState: () => tl, apply: async (name, detail) => { applies.push({ name, detail }); return { ...tl, clips: [{ clip_id: detail.clip_id }] }; } };
        const takes = [];
        let measured = null;
        const generic = createGenericMoleculeRecordingSession({
            session,
            readMixTake: () => (mixGraphSupported(audio) ? async (trackId, input) => { takes.push(input); return engine.take(key, trackId, input); } : null),
            startAudio: (input) => startAudioRecording(input),
            // The take is measured, not stored: the probe reads its samples and clock.
            stopAudio: async (options) => { measured = await stopAudioRecording({ ...options, measure: true }); return measured; },
            readRenderClock: async () => null
        });
        const contextFrame = () => Math.round(audio.__call_backend_method('shared_context').currentTime * audio.__call_backend_method('shared_context').sampleRate);
        const started = await generic.start({ track_id: 'a', source_kind: 'audio', timeline_start_frame: 0 });
        const frameAtStart = contextFrame();
        const programDuring = engine.read().strips.find((strip) => strip.id === 'a:audio');
        await sleep(1500);
        const finished = await generic.finish(started.capture_id);
        const stopped = finished;
        const programAfter = engine.read().strips.find((strip) => strip.id === 'a:audio');
        await engine.remove(key);
        const take = measured?.result || {};
        return {
            applied, started, programDuring, programAfter, takes, applies, frameAtStart, finished: stopped,
            take: { rms: rms(take.pcm || new Float32Array()), frames: take.frame_count, sample_rate: take.sample_rate,
                first_frame: take.first_audio_worklet_frame, shared: take.shared_playback_context,
                round_trip: take.capture_round_trip_seconds, overruns: take.overrun_frames, strip_id: take.strip_id }
        };
    };
    const runtime = audio.get_runtime();
    const outcomes = {};
    // dry, wet, dry again: the fake input's level is read twice around the wet take.
    for (const [name, recFirst] of [['dry', true], ['wet', false], ['dry_again', true]]) {
        try {
            outcomes[name] = await runOnce(recFirst, name);
        } catch (error) {
            outcomes[name] = { error: String(error?.stack || error) };
        }
    }
    // The measured samples travel back through the generic session's stopped result (record_replace detail is
    // the clip; the samples are on the audio API's last result): read them from the take's result instead.
    return { runtime, outcomes: JSON.parse(JSON.stringify(outcomes, (k, v) => (v instanceof Float32Array ? { rms: rms(v), length: v.length } : v))) };
});
fs.writeFileSync(path.join(HERE, 'strip_take_web.report.json'), `${JSON.stringify({ result, logs: logs.slice(-40) }, null, 2)}\n`);
const { dry, wet, dry_again: again } = result.outcomes;
const checks = [
    ['the strip hears the take input, then its clips again', [dry, wet, again].every((o) => o.programDuring?.input?.kind === 'live_audio' && o.programAfter?.input?.kind === 'track')],
    ['REC under IN: dry (sine 0.5, rms 0.354)', Math.abs(dry.take.rms - 0.3536) < 0.02 && Math.abs(again.take.rms - 0.3536) < 0.02],
    ['REC after the -6 dB volume: wet (half)', Math.abs(wet.take.rms / dry.take.rms - 0.5) < 0.03],
    ['first frame on the shared context clock', [dry, wet, again].every((o) => o.take.shared === true && Math.abs(o.take.first_frame - o.frameAtStart) < 0.1 * o.take.sample_rate)],
    ['no overrun', [dry, wet, again].every((o) => o.take.overruns === 0)]
];
checks.forEach(([name, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`));
process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
await browser.close();
await server.stop();
