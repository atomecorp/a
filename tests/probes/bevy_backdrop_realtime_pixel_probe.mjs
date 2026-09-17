import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const url = process.env.BEVY_BACKDROP_PROBE_URL || 'http://127.0.0.1:3000/';
const outDir = path.resolve('temp/probe_reports/bevy_backdrop_realtime');
fs.mkdirSync(outDir, { recursive: true });

const magentaCentroid = (buffer, dpr, logicalBounds) => {
    const png = PNG.sync.read(buffer);
    const [x0, y0, x1, y1] = logicalBounds.map((value) => Math.round(value * dpr));
    let weight = 0;
    let weightedX = 0;
    for (let y = y0; y < Math.min(y1, png.height); y += 1) {
        for (let x = x0; x < Math.min(x1, png.width); x += 1) {
            const offset = (y * png.width + x) * 4;
            const r = png.data[offset];
            const g = png.data[offset + 1];
            const b = png.data[offset + 2];
            const score = Math.max(0, Math.min(r, b) - g - 18);
            if (score === 0) continue;
            weight += score;
            weightedX += x * score;
        }
    }
    return weight > 0 ? weightedX / weight : null;
};

const meanRgb = (buffer, dpr, logicalBounds) => {
    const png = PNG.sync.read(buffer);
    const [x0, y0, x1, y1] = logicalBounds.map((value) => Math.round(value * dpr));
    const totals = [0, 0, 0];
    let count = 0;
    for (let y = y0; y < Math.min(y1, png.height); y += 1) {
        for (let x = x0; x < Math.min(x1, png.width); x += 1) {
            const offset = (y * png.width + x) * 4;
            totals[0] += png.data[offset];
            totals[1] += png.data[offset + 1];
            totals[2] += png.data[offset + 2];
            count += 1;
        }
    }
    return totals.map((total) => total / Math.max(1, count));
};

const runDpr = async (browser, dpr) => {
    const context = await browser.newContext({ viewport: { width: 900, height: 620 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route(url, (route) => route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><script type="importmap">${JSON.stringify({ imports: {
            '#squirrel/': '/atome/src/squirrel/',
            '#shared/': '/atome/src/shared/',
            '#utils/': '/atome/src/utils/'
        } })}</script></head><body></body></html>`
    }));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    try {
        await page.evaluate(async ({ dpr: scale }) => {
            document.body.replaceChildren();
            document.body.style.margin = '0';
            document.body.style.width = '800px';
            document.body.style.height = '500px';
            const canvas = document.createElement('canvas');
            canvas.id = 'backdrop_pixel_probe';
            canvas.style.cssText = 'display:block;width:800px;height:500px';
            document.body.appendChild(canvas);
            const runtime = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
            const surfaceRuntime = await import('/eVe/domains/rendering/surface_runtime.js');
            const makeNode = ({ id, x, y, width, height, fill, layer = 0, backdrop = null }) => ({
                id, kind: 'shape', parentId: null, bounds: { x, y, width, height },
                localTransform: { x, y, scaleX: 1, scaleY: 1, rotation: 0, originX: 0, originY: 0 },
                renderLayer: layer, zIndex: layer, opacity: 1, visible: true, selected: false,
                material: { fill, ...(backdrop ? { backdrop } : {}) }, content: {}, children: [], presentation: !!backdrop
            });
            const makeScene = (barX) => {
                const nodes = [
                    makeNode({ id: 'background', x: 0, y: 0, width: 800, height: 500, fill: '#101820' }),
                    makeNode({ id: 'left', x: 0, y: 0, width: 18, height: 500, fill: '#00ffff', layer: 1 }),
                    makeNode({ id: 'right', x: 782, y: 0, width: 18, height: 500, fill: '#ff3300', layer: 1 }),
                    makeNode({ id: 'top', x: 0, y: 0, width: 800, height: 14, fill: '#33ff00', layer: 1 }),
                    makeNode({ id: 'bottom', x: 0, y: 486, width: 800, height: 14, fill: '#ffff00', layer: 1 }),
                    makeNode({ id: 'moving_ref', x: barX, y: 18, width: 28, height: 20, fill: '#ff00ff', layer: 2 }),
                    makeNode({ id: 'moving', x: barX, y: 90, width: 28, height: 250, fill: '#ff00ff', layer: 2 }),
                    makeNode({ id: 'glass18', x: 55, y: 45, width: 690, height: 350, fill: '#00000000', layer: 100, backdrop: { blurPx: 18, tint: [0.02, 0.03, 0.05, 0.08] } }),
                    makeNode({ id: 'glass30', x: 260, y: 405, width: 280, height: 70, fill: '#00000000', layer: 101, backdrop: { blurPx: 30, tint: [0.04, 0.05, 0.08, 0.10] } })
                ];
                return { id: 'backdrop_probe', revision: barX, roots: nodes.map(({ id }) => id), nodes, byId: new Map(nodes.map((item) => [item.id, item])), effects: [] };
            };
            const makeActivationScene = ({ enabled, staleSource = false, revision }) => {
                const nodes = [makeNode({ id: 'background', x: 0, y: 0, width: 800, height: 500, fill: '#101820' })];
                if (staleSource) {
                    nodes.push(
                        makeNode({ id: 'stale_white', x: 620, y: 400, width: 80, height: 80, fill: '#ffffff', layer: 2 }),
                        makeNode({ id: 'stale_green', x: 700, y: 400, width: 80, height: 80, fill: '#55cc44', layer: 2 })
                    );
                }
                if (enabled) {
                    nodes.push(
                        makeNode({ id: 'right_glass_white', x: 620, y: 400, width: 80, height: 80, fill: '#00000000', layer: 100, backdrop: { blurPx: 18, tint: [0, 0, 0, 0.84] } }),
                        makeNode({ id: 'right_glass_green', x: 700, y: 400, width: 80, height: 80, fill: '#00000000', layer: 101, backdrop: { blurPx: 18, tint: [0, 0, 0, 0.84] } })
                    );
                }
                return { id: 'backdrop_activation_probe', revision, roots: nodes.map(({ id }) => id), nodes, byId: new Map(nodes.map((item) => [item.id, item])), effects: [] };
            };
            const initial = makeScene(120);
            await runtime.startBevyWebRenderer({ surface: canvas, width: 800, height: 500, virtualScene: initial });
            window.__backdropProbe = { runtime, surfaceRuntime, canvas, makeScene, makeActivationScene, scene: initial, dpr: scale };
        }, { dpr });
    } catch (error) {
        console.error(JSON.stringify({ dpr, consoleErrors }, null, 2));
        throw error;
    }
    const startupDiagnostics = await page.evaluate(() => {
        const state = window.__backdropProbe.runtime.readBevyWebRendererState(window.__backdropProbe.canvas);
        return typeof state?.wasmModule?.read_atome_bevy_web_diagnostics === 'function'
            ? state.wasmModule.read_atome_bevy_web_diagnostics()
            : null;
    });
    const canvas = page.locator('#backdrop_pixel_probe');
    const capture = async (name) => {
        const file = path.join(outDir, `dpr${dpr}_${name}.png`);
        const buffer = await canvas.screenshot({ path: file, animations: 'disabled' });
        return { file, buffer };
    };
    const initial = await capture('initial');
    try {
        await page.evaluate(async () => {
            const probe = window.__backdropProbe;
            const state = probe.runtime.readBevyWebRendererState(probe.canvas);
            const before = state.wasmModule.read_atome_bevy_web_diagnostics().redraw_applied;
            const result = probe.runtime.applyBevyWebRendererTransformPatch({
                surface: probe.canvas,
                patch: { id: 'moving', logical_position: [360, 90], logical_size: [28, 250] }
            });
            if (!result?.ok) throw new Error(`backdrop_probe_transform_failed:${result?.reason || 'unknown'}`);
            const refResult = probe.runtime.applyBevyWebRendererTransformPatch({
                surface: probe.canvas,
                patch: { id: 'moving_ref', logical_position: [360, 18], logical_size: [28, 20] }
            });
            if (!refResult?.ok) throw new Error(`backdrop_probe_reference_transform_failed:${refResult?.reason || 'unknown'}`);
            const deadline = performance.now() + 2_000;
            while (state.wasmModule.read_atome_bevy_web_diagnostics().redraw_applied <= before) {
                if (performance.now() >= deadline) {
                    throw new Error(`backdrop_probe_redraw_timeout:${JSON.stringify(state.wasmModule.read_atome_bevy_web_diagnostics())}`);
                }
                await new Promise((resolve) => setTimeout(resolve, 8));
            }
            await new Promise((resolve) => requestAnimationFrame(resolve));
        });
    } catch (error) {
        console.error(JSON.stringify({ dpr, consoleErrors }, null, 2));
        throw error;
    }
    const moved = await capture('moved_same_frame');
    await page.evaluate(async () => {
        const probe = window.__backdropProbe;
        const state = probe.runtime.readBevyWebRendererState(probe.canvas);
        document.body.style.width = '720px';
        document.body.style.height = '450px';
        probe.canvas.style.width = '720px';
        probe.canvas.style.height = '450px';
        await new Promise((resolve) => requestAnimationFrame(resolve));
        probe.surfaceRuntime.syncRenderSurfaceSize(probe.canvas, document.body);
        const before = state.wasmModule.read_atome_bevy_web_diagnostics().redraw_applied;
        const result = probe.runtime.applyBevyWebRendererSurfaceResize({ surface: probe.canvas, width: 720, height: 450, force: true });
        if (!result?.ok) throw new Error(`backdrop_probe_resize_failed:${result?.reason || 'unknown'}`);
        const deadline = performance.now() + 2_000;
        while (state.wasmModule.read_atome_bevy_web_diagnostics().redraw_applied <= before) {
            if (performance.now() >= deadline) throw new Error('backdrop_probe_resize_redraw_timeout');
            await new Promise((resolve) => setTimeout(resolve, 8));
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const resized = await capture('resized');
    await page.evaluate(async () => {
        const probe = window.__backdropProbe;
        await probe.runtime.startBevyWebRenderer({
            surface: probe.canvas, width: 720, height: 450,
            virtualScene: probe.makeActivationScene({ enabled: true, staleSource: true, revision: 100 })
        });
    });
    const brightSystemGlass = await capture('bright_system_glass');
    await page.evaluate(async () => {
        const probe = window.__backdropProbe;
        const sync = async (scene) => probe.runtime.startBevyWebRenderer({
            surface: probe.canvas, width: 720, height: 450, virtualScene: scene
        });
        await sync(probe.makeActivationScene({ enabled: false, staleSource: false, revision: 101 }));
        await sync(probe.makeActivationScene({ enabled: true, staleSource: false, revision: 102 }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const reactivated = await capture('reactivated_same_frame');
    const initialX = magentaCentroid(initial.buffer, dpr, [70, 70, 730, 370]);
    const movedX = magentaCentroid(moved.buffer, dpr, [70, 70, 730, 370]);
    const initialReferenceX = magentaCentroid(initial.buffer, dpr, [70, 16, 730, 42]);
    const movedReferenceX = magentaCentroid(moved.buffer, dpr, [70, 16, 730, 42]);
    const resizedX = magentaCentroid(resized.buffer, dpr, [70, 70, 700, 370]);
    const resizedReferenceX = magentaCentroid(resized.buffer, dpr, [70, 16, 700, 42]);
    assert.ok(initialX != null && movedX != null, 'magenta marker must remain visible through blur');
    assert.ok(initialReferenceX != null && movedReferenceX != null, 'sharp alignment reference must remain visible');
    assert.ok(Math.abs(initialX - initialReferenceX) <= 1.0, `initial alignment drift: ${initialX - initialReferenceX}px`);
    assert.ok(Math.abs(movedX - movedReferenceX) <= 1.0, `moved alignment drift: ${movedX - movedReferenceX}px`);
    assert.ok(Math.abs((movedX - initialX) - (movedReferenceX - initialReferenceX)) <= 1.0, 'blur must update in the presented move frame');
    assert.ok(resizedX != null && resizedReferenceX != null, 'resize markers must remain visible');
    assert.ok(Math.abs(resizedX - resizedReferenceX) <= 1.0, `resized alignment drift: ${resizedX - resizedReferenceX}px`);
    const brightWhite = meanRgb(brightSystemGlass.buffer, dpr, [635, 415, 685, 465]);
    const brightGreen = meanRgb(brightSystemGlass.buffer, dpr, [705, 415, 715, 465]);
    assert.ok(Math.max(...brightWhite, ...brightGreen) <= 125,
        `bright backdrop washed out system glass: ${JSON.stringify({ brightWhite, brightGreen })}`);
    const reactivatedWhite = meanRgb(reactivated.buffer, dpr, [625, 405, 695, 475]);
    const reactivatedGreen = meanRgb(reactivated.buffer, dpr, [705, 405, 715, 475]);
    assert.ok(Math.max(...reactivatedWhite, ...reactivatedGreen) < 80,
        `reactivated backdrop retained stale pixels: ${JSON.stringify({ reactivatedWhite, reactivatedGreen })}`);
    const performanceResult = await page.evaluate(async () => {
        const probe = window.__backdropProbe;
        const state = probe.runtime.readBevyWebRendererState(probe.canvas);
        const module = state.wasmModule;
        const start = module.read_atome_bevy_web_diagnostics();
        const samples = [];
        for (let index = 0; index < 60; index += 1) {
            const before = module.read_atome_bevy_web_diagnostics().redraw_applied;
            probe.runtime.applyBevyWebRendererTransformPatch({
                surface: probe.canvas,
                patch: { id: 'moving', logical_position: [120 + (index % 2) * 240, 90], logical_size: [28, 250] }
            });
            const deadline = performance.now() + 2_000;
            while (module.read_atome_bevy_web_diagnostics().redraw_applied <= before) {
                if (performance.now() >= deadline) throw new Error('backdrop_probe_performance_redraw_timeout');
                await new Promise((resolve) => setTimeout(resolve, 4));
            }
            samples.push(module.read_atome_bevy_web_diagnostics().last_frame.main_ms);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        const settled = module.read_atome_bevy_web_diagnostics();
        await new Promise((resolve) => setTimeout(resolve, 200));
        const idle = module.read_atome_bevy_web_diagnostics();
        return { samples, start, settled, idle };
    });
    const sortedFrameTimes = performanceResult.samples.slice().sort((a, b) => a - b);
    const p95MainMs = sortedFrameTimes[Math.ceil(sortedFrameTimes.length * 0.95) - 1];
    assert.ok(p95MainMs < 16.7, `drag main-frame p95 exceeded budget: ${p95MainMs}ms`);
    assert.equal(performanceResult.settled.redraw_applied - performanceResult.start.redraw_applied, 60);
    assert.equal(performanceResult.idle.redraw_applied, performanceResult.settled.redraw_applied);
    assert.ok(performanceResult.idle.update_ticks - performanceResult.settled.update_ticks <= 1);
    assert.deepEqual(consoleErrors, []);
    await context.close();
    return { dpr, initialX, movedX, resizedX, initialReferenceX, movedReferenceX, resizedReferenceX,
        brightWhite, brightGreen, reactivatedWhite, reactivatedGreen, p95MainMs, startupDiagnostics,
        files: [initial.file, moved.file, resized.file, brightSystemGlass.file, reactivated.file] };
};

const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
try {
    const results = [];
    for (const dpr of [1, 1.5]) results.push(await runDpr(browser, dpr));
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ ok: true, url, results }, null, 2));
    console.log(`bevy_backdrop_realtime_pixel_probe: PASS (${outDir})`);
} finally {
    await browser.close();
}
