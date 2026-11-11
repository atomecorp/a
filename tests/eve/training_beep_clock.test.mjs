import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, test } from 'vitest';
import { createTrainingBeeps } from '../../eVe/domains/training/training_sound.js';
import { loadAudioKernels } from '../../atome/src/application/audio_runtime/audio_kernels.js';
import { getMediaPlaybackAudioExecutor } from '../../eVe/domains/media/shared/media_playback_audio_executor.js';
import { getPlayRecordCore } from '../../atome/src/application/audio_runtime/play_record_core.js';

// BUG-016 (iPhone 1.46 build 44): beeps of a Sport session placed on the native render clock came out bunched or spread,
// because each placement dated `played_frame_now` at the bridge's reply. The real createTrainingBeeps runs here on a
// simulated native engine (virtual time): the device plays frame f at true instant f / RATE, a clock read reaches the
// engine after one leg of the bridge and comes back after the other. "Heard" is the instant of the scheduled frame.
const RATE = 48000, EPOCH = 1_800_000_000_000, PERIOD = 2000;
const realDateNow = Date.now;
// The beeps' tones are the Rust cue kernel's (audio_kernels.js): loaded once from its files, as the page loads it from /wasm/.
beforeAll(() => loadAudioKernels({
    moduleUrl: new URL('../../atome/src/wasm/squirrel_audio_wasm.js', import.meta.url).href,
    binary: readFileSync(new URL('../../atome/src/wasm/squirrel_audio_wasm_bg.wasm', import.meta.url))
}));
afterEach(() => { Date.now = realDateNow; });

const createDevice = ({ legs }) => {
    let now = 1000, seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const win = { performance: { now: () => now }, setTimeout: () => 0, clearTimeout: () => {}, navigator: {} };
    Date.now = () => EPOCH + Math.floor(now);
    const executor = getMediaPlaybackAudioExecutor(win), core = getPlayRecordCore(win);
    core.runtime = () => ({ playback: 'probe' });
    core.hasAsset = async () => true;
    core.loadTransientAsset = async () => true;
    executor.init = async () => true;
    const scheduled = [];
    executor.readRenderClock = async () => {
        const [toEngine, back] = legs(random);
        now += toEngine;
        const played = Math.floor(now * RATE / 1000);
        now += back;
        return { played_frame_now: played, frames_rendered: played + 1024, block_frames: 512, sample_rate: RATE, discontinuities: 0 };
    };
    executor.scheduleVoices = async (voices) => { scheduled.push(...voices); };
    // A session of `count` beeps, each handed over about a second ahead of its instant, as the session runtime does.
    const session = async (count, { ready = true } = {}) => {
        const beeps = createTrainingBeeps(win), start = Math.ceil(now) + 2000, from = scheduled.length, moment = { key: `set-${start}`, zero: EPOCH + start };
        if (ready) await beeps.ready();
        for (let index = 0; index < count; index += 1) {
            const due = start + index * PERIOD;
            now = Math.max(now, due - 1000);
            await beeps.place(moment, [{ key: `rep-${index}`, at: EPOCH + due, kind: 'short' }]);
        }
        return scheduled.slice(from).map((voice, index) => voice.startRenderFrame * 1000 / RATE - (start + index * PERIOD));
    };
    return { win, session, advance: (ms) => { now += ms; }, frames: () => scheduled.map(voice => voice.startRenderFrame) };
};
const symmetric = random => { const trip = 10 + random() * 450; return [trip / 2, trip / 2]; };
const asymmetric = random => { const trip = 10 + random() * 450, toEngine = random() * trip; return [toEngine, trip - toEngine]; };
const worst = errors => Math.max(...errors.map(Math.abs));
const spread = errors => Math.max(...errors) - Math.min(...errors);

test('symmetric bridge legs: every beep within 2 ms of its instant', async () => {
    const errors = await createDevice({ legs: symmetric }).session(24);
    assert.equal(errors.length, 24);
    assert.ok(worst(errors) <= 2, `worst ${worst(errors)} ms`);
});

test("asymmetric legs: the countdown's first beeps already sit on the primed anchor", async () => {
    const errors = await createDevice({ legs: asymmetric }).session(24);
    console.log('asymmetric errors (ms):', errors.map(error => error.toFixed(0)).join(' '));
    assert.ok(worst(errors.slice(0, 3)) <= 60, `first beeps ${errors.slice(0, 3)}`);
    assert.ok(spread(errors) <= 120, `spread ${spread(errors)} ms`);
});

test('a new session on the same window keeps the anchor measured by the previous one', async () => {
    const device = createDevice({ legs: asymmetric });
    const first = await device.session(24);
    device.advance(30000);
    const second = await device.session(8, { ready: false });
    console.log('second session errors (ms):', second.map(error => error.toFixed(0)).join(' '));
    assert.ok(worst(second) <= worst(first.slice(-8)) + 5, `second ${second}`);
});

test('a long session never trades its anchor for a worse read', async () => {
    const errors = await createDevice({ legs: asymmetric }).session(150); // 5 minutes of beeps
    const tail = errors.slice(30);
    assert.ok(spread(tail) <= 40, `spread after the first minute ${spread(tail)} ms`);
});

// The multitrack's rule (user, 11 Nov. 2026): what follows is placed on the sample. Beeps PERIOD ms apart lie exactly
// PERIOD × RATE / 1000 frames apart, though each placement reads the clock again through a bridge of varying delay.
test('beeps of a session lie on the sample grid: every interval exact, across reads of varying delay', async () => {
    const device = createDevice({ legs: symmetric });
    await device.session(40);
    const frames = device.frames(), steps = frames.slice(1).map((frame, index) => frame - frames[index]);
    assert.deepEqual([...new Set(steps)], [PERIOD * RATE / 1000]);
});

test('a moment chained on the previous one keeps its grid (a rest, then its set)', async () => {
    const device = createDevice({ legs: symmetric });
    await device.session(6);
    const before = device.frames().at(-1);
    await device.session(6, { ready: false });
    const after = device.frames().slice(-6);
    // The second session starts 2 s after the first one's last placement was handed over: its instants stay on the same grid.
    for (const frame of after) assert.equal((frame - before) % (RATE / 1000), 0, `${frame - before} frames is not a whole ms`);
});

// iPad, 11 Nov. 2026: through a 90 s rest the native output rested (nothing sounded for 5 s), its frames stopped and the
// grid broke between the sets. While a moment runs, its placer reads the engine's clock at least every 2 s: it stays awake.
test('a running moment keeps the engine awake: its clock is read at least every 2 s, none read without a moment', async () => {
    const device = createDevice({ legs: () => [1, 1] }), executor = getMediaPlaybackAudioExecutor(device.win);
    const beeps = createTrainingBeeps(device.win), reads = [];
    const read = executor.readRenderClock;
    executor.readRenderClock = async () => { reads.push(device.win.performance.now()); return read(); };
    await beeps.ready();
    reads.length = 0;
    const moment = { key: 'rest', zero: Date.now() };
    for (let tick = 0; tick < 90; tick += 1) { await beeps.place(moment, []); device.advance(250); }
    const gaps = reads.slice(1).map((at, index) => at - reads[index]);
    assert.ok(reads.length >= 10 && Math.max(...gaps) <= 2500, `${reads.length} reads, gaps ${gaps}`);
    await beeps.clear();
    reads.length = 0;
    for (let tick = 0; tick < 20; tick += 1) { await beeps.place(null, []); device.advance(250); }
    assert.equal(reads.length, 0);
});
