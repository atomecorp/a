import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const APP_URL = process.env.MOLECULE_PROBE_URL || 'http://127.0.0.1:3000/';
const PROJECT_ROOT = process.cwd();
const OUT_DIR = path.resolve('temp/probe_reports/molecule_webgpu_visual_probe');
const OUT_FILE = path.join(OUT_DIR, 'report.json');
const HEADLESS = process.env.MOLECULE_PROBE_HEADLESS === '1';

fs.mkdirSync(OUT_DIR, { recursive: true });

const mediaPaths = {
    vampire: path.resolve(PROJECT_ROOT, 'tests/fixtures/media', 'Vampire.m4v'),
    fire: path.resolve(PROJECT_ROOT, 'tests/fixtures/media', "Jeezs's fire.m4v"),
    audio: path.resolve(PROJECT_ROOT, 'tests/fixtures/media', 'test.m4a')
};

const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const hashPngPixels = (buffer) => {
    const png = PNG.sync.read(buffer);
    return hash(png.data);
};
const diffPngPixels = (leftBuffer, rightBuffer) => {
    const left = PNG.sync.read(leftBuffer);
    const right = PNG.sync.read(rightBuffer);
    if (left.width !== right.width || left.height !== right.height) {
        return {
            sameSize: false,
            width: left.width,
            height: left.height,
            otherWidth: right.width,
            otherHeight: right.height,
            differingPixels: Number.POSITIVE_INFINITY,
            differingPixelRatio: 1,
            maxChannelDelta: Number.POSITIVE_INFINITY,
            meanAbsoluteChannelDelta: Number.POSITIVE_INFINITY
        };
    }
    let differingPixels = 0;
    let maxChannelDelta = 0;
    let absoluteChannelDeltaTotal = 0;
    for (let index = 0; index < left.data.length; index += 4) {
        let pixelDiffers = false;
        for (let channel = 0; channel < 4; channel += 1) {
            const delta = Math.abs(left.data[index + channel] - right.data[index + channel]);
            absoluteChannelDeltaTotal += delta;
            if (delta > 0) pixelDiffers = true;
            if (delta > maxChannelDelta) maxChannelDelta = delta;
        }
        if (pixelDiffers) differingPixels += 1;
    }
    const totalPixels = left.width * left.height;
    return {
        sameSize: true,
        width: left.width,
        height: left.height,
        differingPixels,
        differingPixelRatio: totalPixels > 0 ? differingPixels / totalPixels : 0,
        maxChannelDelta,
        meanAbsoluteChannelDelta: left.data.length > 0 ? absoluteChannelDeltaTotal / left.data.length : 0
    };
};
const isVisuallyStable = (stats) => stats.sameSize === true
    && stats.maxChannelDelta <= 2
    && stats.differingPixelRatio <= 0.003
    && stats.meanAbsoluteChannelDelta <= 0.01;

const main = async () => {
    const report = {
        created_at: new Date().toISOString(),
        url: APP_URL,
        headless: HEADLESS,
        ok: false,
        checks: [],
        samples: [],
        dispose: null,
        errors: []
    };
    const addCheck = (name, ok, details = null) => report.checks.push({ name, ok: ok === true, details });
    const sampleBuffers = new Map();

    let browser = null;
    try {
        browser = await chromium.launch({
            headless: HEADLESS,
            args: [
                '--autoplay-policy=no-user-gesture-required',
                '--enable-unsafe-webgpu',
                '--ignore-gpu-blocklist',
                '--enable-features=Vulkan,UseSkiaRenderer',
                '--disable-gpu-sandbox'
            ]
        });
        const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
        const page = await context.newPage();
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await page.evaluate(() => {
            const previous = document.getElementById('molecule_probe_input');
            if (previous) previous.remove();
            const input = document.createElement('input');
            input.id = 'molecule_probe_input';
            input.type = 'file';
            input.multiple = true;
            input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
            document.body.appendChild(input);
        });
        await page.setInputFiles('#molecule_probe_input', Object.values(mediaPaths));

        const bootstrap = await page.evaluate(async () => {
            const { ensureMoleculeEngine } = await import('/eve/application/core/media_engine/index.js');
            const input = document.getElementById('molecule_probe_input');
            const files = Array.from(input?.files || []);
            const byName = Object.fromEntries(files.map((file) => [file.name, file]));
            const requireFile = (name) => {
                const file = byName[name];
                if (!file) throw new Error(`Missing input file ${name}`);
                return file;
            };
            const vampireUrl = URL.createObjectURL(requireFile('Vampire.m4v'));
            const fireUrl = URL.createObjectURL(requireFile("Jeezs's fire.m4v"));
            const audioUrl = URL.createObjectURL(requireFile('test.m4a'));

            const engine = ensureMoleculeEngine();
            const session = engine.createSession({ id: 'molecule_visual_probe' });
            session.audio = {
                init: async () => ({ ok: true, mocked: true }),
                loadAsset: async () => ({ ok: true, mocked: true }),
                playVoice: async () => ({ ok: true, mocked: true }),
                stopVoice: async () => ({ ok: true, mocked: true }),
                setVoiceGain: async () => ({ ok: true, mocked: true }),
                setVoiceRate: async () => ({ ok: true, mocked: true }),
                destroyAsset: async () => ({ ok: true, mocked: true })
            };

            const canvas = document.createElement('canvas');
            canvas.id = 'molecule_probe_canvas';
            canvas.style.cssText = 'position:fixed;left:24px;top:24px;width:640px;height:360px;z-index:99999;background:#000;';
            document.body.appendChild(canvas);
            await session.mount(canvas);

            const timeline = {
                id: 'molecule_visual_probe_timeline',
                tracks: [
                    {
                        id: 'video_primary',
                        kind: 'video',
                        zIndex: 1,
                        clips: [{
                            id: 'vampire_main',
                            kind: 'video',
                            start: 0,
                            duration: 7,
                            inPoint: 0,
                            fadeIn: 0.15,
                            fadeOut: 0.2,
                            layout: { x: 0, y: 0, width: 1, height: 1 },
                            source: { url: vampireUrl }
                        }]
                    },
                    {
                        id: 'video_overlay',
                        kind: 'video',
                        zIndex: 2,
                        clips: [{
                            id: 'fire_overlay',
                            kind: 'video',
                            start: 2,
                            duration: 2.5,
                            inPoint: 0.7,
                            fadeIn: 0.3,
                            fadeOut: 0.3,
                            opacity: 0.6,
                            layout: { x: 0.58, y: 0.08, width: 0.3, height: 0.3 },
                            source: { url: fireUrl }
                        }]
                    },
                    {
                        id: 'audio_track',
                        kind: 'audio',
                        zIndex: 0,
                        clips: [{
                            id: 'audio_bed',
                            kind: 'audio',
                            start: 0,
                            duration: 4,
                            inPoint: 0,
                            source: { url: audioUrl }
                        }]
                    }
                ]
            };
            await session.setTimeline(timeline, { commit: false });
            window.__moleculeProbeSession = session;
            window.__moleculeProbeObjectUrls = [vampireUrl, fireUrl, audioUrl];
            return {
                ok: true,
                navigatorGpu: !!navigator.gpu,
                sessionReady: true,
                canvasSelector: '#molecule_probe_canvas',
                objectUrls: [vampireUrl, fireUrl, audioUrl],
                sessionId: session.id
            };
        });

        const canvasLocator = page.locator(bootstrap.canvasSelector);
        const captureSample = async (seconds, label, mode = 'seek') => {
            const sample = await page.evaluate(async ({ seconds: nextSeconds, mode: nextMode, label: nextLabel }) => {
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const session = window.__moleculeProbeSession || window.Molecule?.getSession?.('molecule_visual_probe');
                if (!session) throw new Error('molecule_probe_session_missing');
                if (nextMode === 'scrub-preview') {
                    await session.scrub(nextSeconds, { commit: false, previewOnly: true });
                } else if (nextMode === 'scrub-commit') {
                    await session.scrub(nextSeconds, { commit: false, previewOnly: false });
                } else {
                    await session.seek(nextSeconds, { commit: false });
                }
                await wait(160);
                return {
                    label: nextLabel,
                    mode: nextMode,
                    seconds: nextSeconds,
                    state: session.getState()
                };
            }, { seconds, mode, label });
            const outputPath = path.join(OUT_DIR, `${sample.label}.png`);
            await canvasLocator.screenshot({ path: outputPath });
            const buffer = fs.readFileSync(outputPath);
            sampleBuffers.set(sample.label, buffer);
            report.samples.push({
                label: sample.label,
                mode: sample.mode,
                seconds: sample.seconds,
                image_hash: hashPngPixels(buffer),
                state: sample.state
            });
        };

        await captureSample(0.2, 'seek_0_2');
        await captureSample(1.0, 'seek_1_0');
        await captureSample(3.0, 'seek_3_0');
        await captureSample(2.0, 'seek_2_0');
        await captureSample(2.04, 'seek_2_04');
        await captureSample(2.0, 'seek_2_0_back');
        await captureSample(4.0, 'scrub_preview_4_0', 'scrub-preview');
        await captureSample(4.0, 'scrub_commit_4_0', 'scrub-commit');

        const playingState = await page.evaluate(async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const session = window.__moleculeProbeSession;
            if (!session) throw new Error('molecule_probe_session_missing');
            await session.play({ startSeconds: 1.0, commit: false });
            await wait(650);
            const state = session.getState();
            await session.pause({ commit: false });
            return state;
        });
        await canvasLocator.screenshot({ path: path.join(OUT_DIR, 'play_1_0.png') });

        const disposeState = await page.evaluate(async () => {
            const session = window.__moleculeProbeSession;
            if (!session) throw new Error('molecule_probe_session_missing');
            const hiddenVideoCountBeforeDispose = document.querySelectorAll('video').length;
            await session.dispose();
            const hiddenVideoCountAfterDispose = document.querySelectorAll('video').length;
            for (const objectUrl of window.__moleculeProbeObjectUrls || []) {
                try { URL.revokeObjectURL(objectUrl); } catch (error) {
                    console.warn("[cleanup] operation failed", error);
                }
            }
            document.getElementById('molecule_probe_canvas')?.remove();
            document.getElementById('molecule_probe_input')?.remove();
            delete window.__moleculeProbeSession;
            delete window.__moleculeProbeObjectUrls;
            return {
                hiddenVideoCountBeforeDispose,
                hiddenVideoCountAfterDispose,
                canvasRemoved: !document.getElementById('molecule_probe_canvas')
            };
        });

        const imageHashes = Object.fromEntries(report.samples.map((entry) => [entry.label, entry.image_hash]));
        const sameSeekStats = diffPngPixels(sampleBuffers.get('seek_2_0'), sampleBuffers.get('seek_2_0_back'));
        addCheck('webgpu_available', bootstrap.navigatorGpu === true, { navigatorGpu: bootstrap.navigatorGpu });
        addCheck('seek_changes_frame', imageHashes.seek_0_2 !== imageHashes.seek_1_0 && imageHashes.seek_1_0 !== imageHashes.seek_3_0, imageHashes);
        addCheck('adjacent_frames_differ', imageHashes.seek_2_0 !== imageHashes.seek_2_04, imageHashes);
        addCheck('same_seek_is_stable', isVisuallyStable(sameSeekStats), {
            hashes: imageHashes,
            diff: sameSeekStats
        });
        addCheck('scrub_preview_updates_position', Number(report.samples.find((entry) => entry.label === 'scrub_preview_4_0')?.state?.transport?.position || 0) >= 3.99, report.samples.find((entry) => entry.label === 'scrub_preview_4_0')?.state || null);
        addCheck('scrub_commit_updates_position', Number(report.samples.find((entry) => entry.label === 'scrub_commit_4_0')?.state?.transport?.position || 0) >= 3.99, report.samples.find((entry) => entry.label === 'scrub_commit_4_0')?.state || null);
        addCheck('play_advances_transport', Number(playingState?.transport?.position || 0) > 1.4, playingState);
        addCheck('dispose_cleans_hidden_videos', disposeState.hiddenVideoCountAfterDispose < disposeState.hiddenVideoCountBeforeDispose, {
            before: disposeState.hiddenVideoCountBeforeDispose,
            after: disposeState.hiddenVideoCountAfterDispose
        });
        addCheck('probe_canvas_removed', disposeState.canvasRemoved === true, { canvasRemoved: disposeState.canvasRemoved });

        report.dispose = {
            hidden_videos_before: disposeState.hiddenVideoCountBeforeDispose,
            hidden_videos_after: disposeState.hiddenVideoCountAfterDispose,
            canvas_removed: disposeState.canvasRemoved
        };
        report.ok = report.checks.every((entry) => entry.ok === true);
    } catch (error) {
        report.errors.push(String(error?.message || error || 'probe_failed'));
        report.ok = false;
    } finally {
        fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
        if (browser) await browser.close();
    }

    if (!report.ok) {
        console.error(JSON.stringify(report, null, 2));
        process.exitCode = 1;
        return;
    }
    console.log(JSON.stringify(report, null, 2));
};

await main();
