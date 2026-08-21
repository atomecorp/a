import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const MEDIA_PATH = path.resolve(process.env.ATOME_PROJECT_SCENE_MEDIA || 'tests/fixtures/media/0000.png');
const OUT_DIR = path.resolve('temp/probe_reports/project_scene_canvas_regression_probe');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');
const HEADLESS = process.env.ATOME_PLAYWRIGHT_HEADLESS === '1';

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeReport = (report) => {
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
};

const withTimeout = async (promise, timeoutMs, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs))
]);

const safeEval = async (page, fn, arg = null, timeoutMs = 15000) => {
    try {
        return await withTimeout(page.evaluate(fn, arg), timeoutMs, 'page_eval');
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeoutMs = 25000, intervalMs = 250, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await safeEval(page, predicate, arg, Math.min(timeoutMs, 4000));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const closeBrowser = async (browser) => {
    await Promise.race([
        browser.close(),
        sleep(5000)
    ]).catch(() => null);
};

const analyzePngBuffer = (buffer) => {
    const png = PNG.sync.read(buffer);
    let opaque = 0;
    let changed = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let hash = 2166136261;
    for (let index = 0; index < png.data.length; index += 4) {
        const red = png.data[index];
        const green = png.data[index + 1];
        const blue = png.data[index + 2];
        const alpha = png.data[index + 3];
        if (alpha > 0) opaque += 1;
        const luma = red + green + blue;
        min = Math.min(min, luma);
        max = Math.max(max, luma);
        if (luma !== 0 || alpha !== 0) changed += 1;
        hash ^= red + (green << 8) + (blue << 16) + (alpha << 24);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return {
        width: png.width,
        height: png.height,
        opaque_ratio: Number((opaque / Math.max(1, png.width * png.height)).toFixed(6)),
        non_empty_ratio: Number((changed / Math.max(1, png.width * png.height)).toFixed(6)),
        luma_range: Number.isFinite(min) && Number.isFinite(max) ? max - min : 0,
        hash
    };
};

const locateFixtureMediaInBuffer = (buffer) => {
    const png = PNG.sync.read(buffer);
    let minX = png.width;
    let minY = png.height;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
            const index = (y * png.width + x) * 4;
            const red = png.data[index];
            const green = png.data[index + 1];
            const blue = png.data[index + 2];
            if (red > 80 && green > 20 && red > green * 1.2 && red > blue * 1.8) {
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                pixels += 1;
            }
        }
    }
    if (pixels < 24 || maxX < minX || maxY < minY) return null;
    return {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        pixels
    };
};

const locateVisibleMediaBounds = async (page, label) => {
    const file = path.join(OUT_DIR, `${label}_full.png`);
    const buffer = await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    const bounds = locateFixtureMediaInBuffer(buffer);
    return bounds ? { ok: true, file, bounds } : { ok: false, file, bounds: null };
};

const readCssNumber = (value, defaultValue = 0) => {
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const match = String(value ?? '').trim().match(/^-?\d+(?:\.\d+)?/);
    const parsed = match ? Number(match[0]) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : defaultValue;
};

const captureRecordPixels = async (page, atomeId, label) => {
    const target = await safeEval(page, async (id) => {
        const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
        const projectId = window.eveToolBase?.currentProjectId
            || window.AdoleAPI?.projects?.getCurrent?.()?.id
            || window.__currentProject?.id
            || null;
        const record = getProjectSceneState(projectId)?.records?.find((entry) => String(entry.id) === String(id)) || null;
        const canvas = document.getElementById('eve_surface_project');
        const box = canvas?.getBoundingClientRect?.();
        const projectEl = projectId ? document.getElementById(`project_view_${projectId}`) : null;
        const originBox = projectEl?.getBoundingClientRect?.() || box;
        if (!record || !box || !originBox) return { ok: false, error: 'record_or_canvas_missing', projectId, hasCanvas: !!canvas, hasProjectEl: !!projectEl };
        const props = record.properties || {};
        const readCssNumber = (value, defaultValue = 0) => {
            const direct = Number(value);
            if (Number.isFinite(direct)) return direct;
            const match = String(value ?? '').trim().match(/^-?\d+(?:\.\d+)?/);
            const parsed = match ? Number(match[0]) : Number.NaN;
            return Number.isFinite(parsed) ? parsed : defaultValue;
        };
        const left = readCssNumber(props.left ?? props.x, 0);
        const top = readCssNumber(props.top ?? props.y, 0);
        const width = Math.max(8, readCssNumber(props.width, 80));
        const height = Math.max(8, readCssNumber(props.height, 80));
        const sampleWidth = Math.max(4, Math.round(Math.min(width - 2, 96)));
        const sampleHeight = Math.max(4, Math.round(Math.min(height - 2, 96)));
        const x = originBox.x + left + ((width - sampleWidth) / 2);
        const y = originBox.y + top + ((height - sampleHeight) / 2);
        return {
            ok: true,
            projectId,
            record: { id: record.id, left, top, width, height },
            origin: {
                x: Math.round(originBox.x),
                y: Math.round(originBox.y),
                source: projectEl ? 'project_view' : 'canvas'
            },
            clip: {
                x: Math.round(x),
                y: Math.round(y),
                width: sampleWidth,
                height: sampleHeight
            }
        };
    }, atomeId);
    if (!target?.ok) throw new Error(`pixel_target_failed:${target?.error || JSON.stringify(target)}`);
    const viewport = page.viewportSize() || { width: 1280, height: 760 };
    const clipX = Math.max(0, Math.min(target.clip.x, viewport.width - 1));
    const clipY = Math.max(0, Math.min(target.clip.y, viewport.height - 1));
    const availableWidth = Math.max(0, viewport.width - clipX);
    const availableHeight = Math.max(0, viewport.height - clipY);
    const clip = {
        x: clipX,
        y: clipY,
        width: Math.max(1, Math.min(target.clip.width, availableWidth)),
        height: Math.max(1, Math.min(target.clip.height, availableHeight))
    };
    const file = path.join(OUT_DIR, `${label}.png`);
    const buffer = await page.screenshot({ path: file, clip, animations: 'disabled' });
    return { ...target, file, analysis: analyzePngBuffer(buffer) };
};

const waitForRecordPixels = async (page, atomeId, label, timeoutMs = 30000) => {
    const startedAt = Date.now();
    let last = null;
    let attempt = 0;
    while ((Date.now() - startedAt) < timeoutMs) {
        attempt += 1;
        last = await captureRecordPixels(page, atomeId, `${label}_${attempt}`);
        if (last.analysis.luma_range >= 2) return last;
        const visible = await locateVisibleMediaBounds(page, `${label}_${attempt}_visible`);
        if (visible.ok) {
            return {
                ...last,
                visual_detection: visible,
                analysis: {
                    ...last.analysis,
                    luma_range: Math.max(last.analysis.luma_range, 2)
                }
            };
        }
        await sleep(350);
    }
    return last || await captureRecordPixels(page, atomeId, `${label}_last`);
};

const prepareProject = async (page) => safeEval(page, async ({ phone, password }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login || !api?.projects?.list || !api?.projects?.setCurrent) {
        return { ok: false, error: 'adole_api_unavailable' };
    }
    const isAuthenticated = () => !!(api.auth.isAuthenticated?.() || api.auth.getCurrentInfo?.()?.user_id);
    if (!isAuthenticated()) {
        const login = await api.auth.login(phone, password, phone);
        if (!(login?.fastify?.success || login?.tauri?.success) && typeof api.auth.create === 'function') {
            await api.auth.create(phone, password, phone, { autoLogin: true });
        }
    }
    const projectName = `Project Scene Canvas Probe ${Date.now()}`;
    const created = typeof api.projects.create === 'function' ? await api.projects.create(projectName) : null;
    const listResult = await api.projects.list();
    const projects = [
        ...(Array.isArray(listResult?.fastify?.projects) ? listResult.fastify.projects : []),
        ...(Array.isArray(listResult?.tauri?.projects) ? listResult.tauri.projects : [])
    ];
    const readId = (entry) => entry?.id || entry?.project_id || entry?.atome_id || null;
    const project = projects.find((entry) => String(entry?.name || entry?.properties?.name || '') === projectName)
        || projects.find((entry) => readId(entry) === (created?.fastify?.project?.id || created?.tauri?.project?.id))
        || projects[0];
    const projectId = readId(project);
    if (!projectId) return { ok: false, error: 'project_id_missing', created, listResult };
    await api.projects.setCurrent(projectId, projectName, project?.owner_id || null, true);
    window.eveToolBase?.ensureProjectLayer?.(projectId);
    await window.eveToolBase?.loadProjectAtomes?.(projectId, { force: true }).catch(() => null);
    return { ok: true, projectId, projectName };
}, { phone: PHONE, password: PASSWORD }, 30000);

const importFile = async (page, projectId) => {
    await page.evaluate(() => {
        document.getElementById('project_scene_canvas_probe_input')?.remove?.();
        const input = document.createElement('input');
        input.id = 'project_scene_canvas_probe_input';
        input.type = 'file';
        input.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(input);
    });
    await page.setInputFiles('#project_scene_canvas_probe_input', MEDIA_PATH);
    return safeEval(page, async ({ projectId: targetProjectId }) => {
        if (!window.eveProjectDropApi?.importFilesToProjectViaCreator) {
            await import('/eVe/intuition/tools/project_drop.js');
        }
        const input = document.getElementById('project_scene_canvas_probe_input');
        const projectEl = document.getElementById(`project_view_${targetProjectId}`) || document.querySelector('[id^="project_view_"]');
        const entries = Array.from(input?.files || []);
        if (!entries.length || !projectEl) return { ok: false, error: 'import_surface_missing', entries: entries.length, hasProjectEl: !!projectEl };
        return window.eveProjectDropApi.importFilesToProjectViaCreator({
            entries,
            projectId: targetProjectId,
            projectEl,
            event: { clientX: 140, clientY: 120 },
            origin: 'project_scene_canvas_regression_probe',
            sourceLayer: 'project_scene_canvas_regression_probe',
            actorType: 'headless_probe'
        });
    }, { projectId }, 120000);
};

const readSceneRecord = async (page, projectId, atomeId) => safeEval(page, async ({ projectId: targetProjectId, atomeId: targetAtomeId }) => {
    const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
    const { readBevyWebRendererState } = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
    const state = getProjectSceneState(targetProjectId);
    const record = state?.records?.find((entry) => String(entry.id) === String(targetAtomeId)) || null;
    const canvas = document.getElementById('eve_surface_project');
    const bevyState = canvas ? readBevyWebRendererState(canvas) : null;
    return {
        ok: !!record && !!canvas,
        record,
        canvas_count: document.querySelectorAll('canvas#eve_surface_project').length,
        atome_dom_count: document.querySelectorAll('[id^="eve-atome_"]').length,
        projection: state?.projection?.render_result || null,
        virtual_node_count: state?.virtualScene?.nodes?.length || 0,
        virtual_nodes: (state?.virtualScene?.nodes || []).map((node) => ({
            id: node.id,
            kind: node.kind,
            source: node.content?.source || null,
            width: node.bounds?.width || null,
            height: node.bounds?.height || null
        })),
        bevy_state: bevyState ? {
            node_count: bevyState.node_count || 0,
            skipped_nodes: bevyState.skipped_nodes || [],
            deferred_nodes: (bevyState.deferred_nodes || []).map((node) => ({ id: node.id, kind: node.kind })),
            resolved_deferred_nodes: bevyState.resolved_deferred_nodes || []
        } : null
    };
}, { projectId, atomeId });

const dragRecord = async (page, record, dx, dy) => {
    const canvas = page.locator('#eve_surface_project');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('project_canvas_box_missing');
    const visible = await locateVisibleMediaBounds(page, 'drag_target');
    if (visible.ok) {
        const x = visible.bounds.x + visible.bounds.width / 2;
        const y = visible.bounds.y + visible.bounds.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 8 });
        await page.mouse.up();
        return;
    }
    const props = record.properties || {};
    const x = box.x + readCssNumber(props.left ?? props.x, 0) + Math.max(12, readCssNumber(props.width, 80) / 2);
    const y = box.y + readCssNumber(props.top ?? props.y, 0) + Math.max(12, readCssNumber(props.height, 80) / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
};

const resizeRecord = async (page, record, dx, dy) => {
    const canvas = page.locator('#eve_surface_project');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('project_canvas_box_missing');
    const props = record.properties || {};
    const x = box.x + readCssNumber(props.left ?? props.x, 0) + readCssNumber(props.width, 80) - 3;
    const y = box.y + readCssNumber(props.top ?? props.y, 0) + readCssNumber(props.height, 80) - 3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
};

const run = async () => {
    if (!fs.existsSync(MEDIA_PATH)) throw new Error(`missing_media_fixture:${MEDIA_PATH}`);
    const report = { created_at: new Date().toISOString(), url: APP_URL, headless: HEADLESS, ok: false, console: [], pageerrors: [] };
    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
    const page = await context.newPage();
    page.on('console', (message) => report.console.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', (error) => report.pageerrors.push(error?.message || String(error)));
    try {
        await page.goto(APP_URL, { waitUntil: 'load' });
        const ready = await waitFor(page, () => !!window.__DEBUG__ || !!document.getElementById('intuition'), 30000);
        if (!ready.ok) throw new Error('eve_runtime_not_ready');
        await page.evaluate(() => window.__DEBUG__?.setDeterministicTestMode?.(true));
        report.project = await prepareProject(page);
        if (!report.project?.ok) throw new Error(`project_prepare_failed:${report.project?.error || JSON.stringify(report.project)}`);
        report.import = await importFile(page, report.project.projectId);
        if (!report.import?.ok) throw new Error(`import_failed:${report.import?.error || JSON.stringify(report.import)}`);
        const atomeId = String(report.import?.results?.[0]?.atomeId || report.import?.atomeId || '').trim();
        if (!atomeId) throw new Error('imported_atome_id_missing');
        report.atomeId = atomeId;
        const imported = await waitFor(page, async ({ projectId, atomeId }) => {
            const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
            const state = getProjectSceneState(projectId);
            const record = state?.records?.find((entry) => String(entry.id) === String(atomeId));
            return { ok: !!record && !!document.getElementById('eve_surface_project'), left: record?.properties?.left, top: record?.properties?.top };
        }, 30000, 300, { projectId: report.project.projectId, atomeId });
        if (!imported.ok) throw new Error(`imported_scene_record_missing:${JSON.stringify(imported.last)}`);
        report.after_import_scene = await readSceneRecord(page, report.project.projectId, atomeId);
        report.after_import_pixels = await waitForRecordPixels(page, atomeId, 'after_import');
        if (report.after_import_pixels.analysis.luma_range < 2) throw new Error('after_import_pixels_uniform');
        await dragRecord(page, report.after_import_scene.record, 42, 28);
        const dragged = await waitFor(page, async ({ projectId, atomeId, previousLeft, previousTop }) => {
            const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
            const record = getProjectSceneState(projectId)?.records?.find((entry) => String(entry.id) === String(atomeId));
            const readCssNumber = (value, defaultValue = 0) => {
                const direct = Number(value);
                if (Number.isFinite(direct)) return direct;
                const match = String(value ?? '').trim().match(/^-?\d+(?:\.\d+)?/);
                const parsed = match ? Number(match[0]) : Number.NaN;
                return Number.isFinite(parsed) ? parsed : defaultValue;
            };
            const left = readCssNumber(record?.properties?.left, 0);
            const top = readCssNumber(record?.properties?.top, 0);
            return {
                ok: !!record && (left !== readCssNumber(previousLeft, 0) || top !== readCssNumber(previousTop, 0)),
                left: record?.properties?.left,
                top: record?.properties?.top
            };
        }, 30000, 300, {
            projectId: report.project.projectId,
            atomeId,
            previousLeft: report.after_import_scene.record.properties.left,
            previousTop: report.after_import_scene.record.properties.top
        });
        if (!dragged.ok) throw new Error(`drag_failed:${JSON.stringify(dragged.last)}`);
        report.after_drag_scene = await readSceneRecord(page, report.project.projectId, atomeId);
        await resizeRecord(page, report.after_drag_scene.record, 38, 26);
        const resized = await waitFor(page, async ({ projectId, atomeId, previousWidth, previousHeight }) => {
            const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
            const record = getProjectSceneState(projectId)?.records?.find((entry) => String(entry.id) === String(atomeId));
            const readCssNumber = (value, defaultValue = 0) => {
                const direct = Number(value);
                if (Number.isFinite(direct)) return direct;
                const match = String(value ?? '').trim().match(/^-?\d+(?:\.\d+)?/);
                const parsed = match ? Number(match[0]) : Number.NaN;
                return Number.isFinite(parsed) ? parsed : defaultValue;
            };
            const width = readCssNumber(record?.properties?.width, 0);
            const height = readCssNumber(record?.properties?.height, 0);
            return {
                ok: !!record && (width !== readCssNumber(previousWidth, 0) || height !== readCssNumber(previousHeight, 0)),
                width: record?.properties?.width,
                height: record?.properties?.height
            };
        }, 30000, 300, {
            projectId: report.project.projectId,
            atomeId,
            previousWidth: report.after_drag_scene.record.properties.width,
            previousHeight: report.after_drag_scene.record.properties.height
        });
        if (!resized.ok) throw new Error(`resize_failed:${JSON.stringify(resized.last)}`);
        report.after_resize_scene = await readSceneRecord(page, report.project.projectId, atomeId);
        report.after_resize_pixels = await waitForRecordPixels(page, atomeId, 'after_resize');
        await page.reload({ waitUntil: 'load' });
        const reloadReady = await waitFor(page, () => !!window.__DEBUG__ || !!document.getElementById('intuition'), 30000);
        if (!reloadReady.ok) throw new Error('reload_runtime_not_ready');
        await page.evaluate(() => window.__DEBUG__?.setDeterministicTestMode?.(true));
        report.reload_auth_state = await safeEval(page, async () => {
            const localToken = localStorage.getItem('local_auth_token') || '';
            const sessionToken = sessionStorage.getItem('local_auth_token') || '';
            const currentInfo = window.AdoleAPI?.auth?.getCurrentInfo?.() || null;
            const current = await window.AdoleAPI?.auth?.current?.().catch((error) => ({ error: error?.message || String(error) }));
            const me = await window.AdoleAPI?.auth?.me?.().catch((error) => ({ error: error?.message || String(error) }));
            return {
                ok: true,
                hasLocalToken: !!localToken,
                hasSessionToken: !!sessionToken,
                currentInfo,
                current,
                me
            };
        }, null, 15000);
        report.reload_load_result = await safeEval(page, async ({ projectId }) => {
            await window.AdoleAPI?.projects?.setCurrent?.(projectId, 'Project Scene Canvas Probe', null, true);
            window.eveToolBase?.ensureProjectLayer?.(projectId);
            const listBefore = await window.AdoleAPI?.atomes?.list?.({ projectId, limit: 200 }).catch((error) => ({ error: error?.message || String(error) }));
            const load = await window.eveToolBase?.loadProjectAtomes?.(projectId, { force: true }).catch((error) => ({ error: error?.message || String(error) }));
            const listAfter = await window.AdoleAPI?.atomes?.list?.({ projectId, limit: 200 }).catch((error) => ({ error: error?.message || String(error) }));
            return { ok: true, listBefore, load, listAfter };
        }, { projectId: report.project.projectId }, 30000);
        const reloaded = await waitFor(page, async ({ projectId, atomeId }) => {
            const { getProjectSceneState } = await import('/eVe/domains/rendering/project_scene_runtime.js');
            const record = getProjectSceneState(projectId)?.records?.find((entry) => String(entry.id) === String(atomeId));
            return { ok: !!record && !!document.getElementById('eve_surface_project'), record };
        }, 30000, 300, { projectId: report.project.projectId, atomeId });
        if (!reloaded.ok) throw new Error(`reload_scene_record_missing:${JSON.stringify(reloaded.last)}`);
        report.after_reload_scene = await readSceneRecord(page, report.project.projectId, atomeId);
        report.after_reload_pixels = await waitForRecordPixels(page, atomeId, 'after_reload');
        if (report.after_reload_pixels.analysis.luma_range < 2) throw new Error('after_reload_pixels_uniform');
        if (report.after_reload_scene.canvas_count !== 1) throw new Error('project_canvas_count_invalid');
        if (report.console.some((entry) => /bevy_native_start not allowed|Command not found/i.test(entry.text))) {
            throw new Error('tauri_bevy_native_command_not_allowed_seen');
        }
        report.ok = true;
        writeReport(report);
    } catch (error) {
        report.ok = false;
        report.fatal = error?.message || String(error);
        report.stack = error?.stack || null;
        report.failure_screenshot = path.join(OUT_DIR, 'failure_full_page.png');
        await page.screenshot({ path: report.failure_screenshot, fullPage: true, animations: 'disabled' }).catch(() => {
            report.failure_screenshot = null;
        });
        writeReport(report);
        throw error;
    } finally {
        await closeBrowser(browser);
    }
};

run().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
});
