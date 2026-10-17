// The Molecule session's contract in a real browser (replaces the retired
// molecule_webgpu_visual_probe: the session used to composite video frames into
// its own WebGPU canvas; since the single Bevy project surface draws every
// picture, the session only keeps time and sound). Here: a timeline of real
// media seeks, scrubs and plays on the session's clock, and the session never
// draws into a canvas nor creates a video element; dispose releases it.
//   node tests/probes/molecule_session_audio_only_contract.probe.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const media = (name) => path.join(ROOT, 'tests/fixtures/media', name);
const workRoot = mkdtempSync(path.join(os.tmpdir(), 'eve-molecule-session-contract-'));

const availablePort = () => new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
        const address = listener.address();
        listener.close((error) => (error ? reject(error) : resolve(address.port)));
    });
});

const waitForServer = (child) => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`molecule_contract_server_start_timeout:${output.slice(-600)}`)), 30_000);
    const inspect = (chunk) => {
        output += chunk.toString();
        if (!output.includes('Fastify server')) return;
        clearTimeout(timer);
        resolve();
    };
    child.stdout.on('data', inspect);
    child.stderr.on('data', inspect);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`molecule_contract_server_exit_${code}:${output.slice(-600)}`)); });
});

const port = await availablePort();
const child = spawn(process.execPath, ['server/server.js'], {
    cwd: ROOT,
    env: {
        ...process.env,
        HOST: '127.0.0.1', PORT: String(port), SQLITE_PATH: path.join(workRoot, 'adole.db'),
        JWT_SECRET: 'molecule-session-contract-secret-long-enough', GITHUB_AUTO_SYNC: 'false',
        SYNC_REMOTE_ENABLED: 'false', SERVER_INFO_ENABLED: 'false', SQUIRREL_DISABLE_WATCHER: '1',
        SQUIRREL_VAULT_ROOT: path.join(workRoot, 'vaults')
    },
    stdio: ['ignore', 'pipe', 'pipe']
});

let browser = null;
try {
    await waitForServer(child);
    browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await (await browser.newContext()).newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 'molecule_contract_input';
        input.type = 'file';
        input.multiple = true;
        document.body.appendChild(input);
    });
    await page.setInputFiles('#molecule_contract_input', [media('Vampire.m4v'), media('test.m4a')]);

    const result = await page.evaluate(async () => {
        const { createMoleculeEngine } = await import('/eVe/core/media_engine/molecule.js');
        const files = Object.fromEntries([...document.getElementById('molecule_contract_input').files].map((file) => [file.name, file]));
        const videoUrl = URL.createObjectURL(files['Vampire.m4v']);
        const audioUrl = URL.createObjectURL(files['test.m4a']);
        const engine = createMoleculeEngine();
        const session = engine.createSession({ id: 'molecule_contract' });
        // The sound engine is the subject of other probes; here its calls are recorded.
        const calls = [];
        session.audio = Object.fromEntries(['init', 'loadAsset', 'playVoice', 'stopVoice', 'setVoiceGain', 'setVoiceRate', 'destroyAsset']
            .map((name) => [name, async (input) => { calls.push(name); return { ok: true, input }; }]));
        const videosBefore = document.querySelectorAll('video').length;
        const canvas = document.createElement('canvas');
        document.body.appendChild(canvas);
        const mounted = await session.mount(canvas);
        await session.setTimeline({ id: 'contract_timeline', tracks: [
            { id: 'video', kind: 'video', clips: [{ id: 'clip_video', kind: 'video', start: 0, duration: 7, source: { url: videoUrl } }] },
            { id: 'audio', kind: 'audio', clips: [{ id: 'clip_audio', kind: 'audio', start: 0, duration: 4, source: { url: audioUrl } }] }
        ] }, { commit: false });
        const frame = await session.renderFrame(2);
        const seek = await session.seek(3, { commit: false });
        const preview = await session.scrub(4, { commit: false, previewOnly: true });
        const scrub = await session.scrub(4, { commit: false, previewOnly: false });
        await session.play({ startSeconds: 1, commit: false });
        await new Promise((resolve) => setTimeout(resolve, 650));
        const playing = session.getTransportState();
        await session.pause({ commit: false });
        const context = canvas.getContext('2d');
        const videosDuring = document.querySelectorAll('video').length;
        await session.dispose();
        return {
            mounted, frame, seek: seek.position, preview: preview.position, scrub: scrub.position,
            playing: { position: playing.position, playing: playing.playing },
            canvasUntouched: Boolean(context), videosBefore, videosDuring,
            videosAfter: document.querySelectorAll('video').length, calls, sessionsAfter: engine.sessions.size
        };
    });

    assert.equal(result.mounted.ok, true);
    assert.equal(result.frame.audio_only, true, 'the session composites no picture: the Bevy surface does');
    assert.equal(result.canvasUntouched, true, 'the session never takes a WebGPU/WebGL context on its canvas');
    assert.equal(result.videosDuring, result.videosBefore, 'the session creates no video element');
    assert.equal(result.seek, 3);
    assert.ok(result.preview >= 3.99 && result.scrub >= 3.99, JSON.stringify(result));
    assert.ok(result.playing.position > 1.4, `play advances the transport: ${JSON.stringify(result.playing)}`);
    assert.ok(result.calls.includes('playVoice') || result.calls.includes('loadAsset'), `the sound engine is driven: ${result.calls}`);
    assert.equal(result.videosAfter, result.videosBefore);
    console.log('molecule_session_audio_only_contract: PASS');
} finally {
    if (browser) await browser.close();
    child.kill('SIGTERM');
    rmSync(workRoot, { recursive: true, force: true });
}
