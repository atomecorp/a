// Real-browser regression probe for the Bevy Web frame clock
// (platforms/web/bevy-renderer/src/frame_clock.rs).
//
// The renderer only draws when woken. Unit tests cannot see the real winit
// web event loop, where a wake that is lost or delivered late turns
// interaction into the 500 ms idle heartbeat (2026-10-07: 70-150 wakes/s
// produced 2 frames/s; zoom, rotation and Mystic stuttered on every runtime).
//
// Drives wakes exactly as the JS runtime does — one per animation frame, from
// a requestAnimationFrame callback — and asserts one render per frame, while
// the idle loop stays at the heartbeat.
//   node tests/probes/bevy_web_frame_clock_cadence.probe.mjs
//   [ADOLE_TEST_URL=http://127.0.0.1:3001] [HEADLESS=0] [PROBE_WASM_DIR=dir]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const HEADLESS = process.env.HEADLESS !== '0';
const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
        ...(HEADLESS ? ['--use-angle=swiftshader', '--enable-features=Vulkan'] : ['--window-position=-32000,-32000'])]
});
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block' });
if (process.env.PROBE_WASM_DIR) {
    const dir = path.resolve(process.env.PROBE_WASM_DIR);
    await context.route(/\/wasm\/squirrel_bevy_renderer(_bg\.wasm|\.js)(\?|$)/, (route) => {
        const wasm = route.request().url().includes('_bg.wasm');
        route.fulfill({ status: 200, contentType: wasm ? 'application/wasm' : 'text/javascript',
            body: fs.readFileSync(path.join(dir, wasm ? 'squirrel_bevy_renderer_bg.wasm' : 'squirrel_bevy_renderer.js')) });
    });
}
// A quiet renderer: one empty project scene through the canonical projection
// entry, served on the app origin so its modules and WASM load as in the app.
const PAGE_PATH = '/__probe_bevy_frame_clock.html';
const importMap = (await (await fetch(APP_URL)).text()).match(/<script type="importmap"[\s\S]*?<\/script>/)?.[0];
assert.ok(importMap, 'the app page must declare its import map');
await context.route(`${APP_URL}${PAGE_PATH}`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html>
<html><head><meta charset="utf-8">${importMap}</head><body style="margin:0"><main id="project" style="width:640px;height:480px;position:relative"></main>
<script type="module">
import { renderProjectScene } from '/eVe/domains/rendering/project_scene_runtime.js';
window.__probeScene = await renderProjectScene({ projectId: 'bevy_frame_clock_probe', projectRevision: 1, records: [],
    host: document.getElementById('project'), maxTextureDimension2D: 1024 }).then((r) => ({ ok: r?.ok === true }), (e) => ({ ok: false, error: String(e?.message || e) }));
</script></body></html>` }));
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
try {
    await page.goto(`${APP_URL}${PAGE_PATH}`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => !!window.__probeScene, null, { timeout: 60000 });
    assert.equal((await page.evaluate(() => window.__probeScene)).ok, true, 'empty project scene must render');
    const diagnostics = () => page.evaluate(async () => {
        const { ensureBevyModule } = await import('/eVe/domains/rendering/bevy_web_renderer_module_loader.js');
        const d = (await ensureBevyModule()).read_atome_bevy_web_diagnostics();
        return { ticks: d.update_ticks, apps: d.running_apps };
    });
    const startedAt = Date.now();
    let running = null;
    while (Date.now() - startedAt < 90000) {
        running = await diagnostics().catch(() => null);
        if (running?.apps > 0) break;
        await page.waitForTimeout(500);
    }
    assert.ok(running?.apps > 0, `bevy renderer never started: ${JSON.stringify(running)}`);
    await page.waitForTimeout(4000);

    const idle0 = await diagnostics();
    await page.waitForTimeout(3000);
    const idleTicksPerSecond = ((await diagnostics()).ticks - idle0.ticks) / 3;

    // Two wakes per frame from a rAF callback that runs before the renderer's
    // own callback: the merged wake must not halve the frame rate.
    const burst = await page.evaluate(async () => {
        const { ensureBevyModule } = await import('/eVe/domains/rendering/bevy_web_renderer_module_loader.js');
        const bevy = await ensureBevyModule();
        const t0 = bevy.read_atome_bevy_web_diagnostics().update_ticks;
        let frames = 0;
        await new Promise((resolve) => {
            const started = performance.now();
            const step = (now) => {
                frames += 1;
                bevy.request_atome_bevy_redraw();
                bevy.request_atome_bevy_redraw();
                if (now - started < 2000) requestAnimationFrame(step); else resolve();
            };
            requestAnimationFrame(step);
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { frames, ticks: bevy.read_atome_bevy_web_diagnostics().update_ticks - t0 };
    });
    const ratio = burst.ticks / burst.frames;
    console.log(JSON.stringify({ idleTicksPerSecond, burst, ratio: +ratio.toFixed(2) }));
    assert.ok(idleTicksPerSecond <= 4, `idle loop must stay at the heartbeat, got ${idleTicksPerSecond} ticks/s`);
    assert.ok(ratio >= 0.8, `one render per woken animation frame expected, got ${burst.ticks} ticks for ${burst.frames} frames`);
    console.log('PASS bevy_web_frame_clock_cadence');
} finally {
    await browser.close();
}
