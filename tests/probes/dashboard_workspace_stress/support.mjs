import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
export const OUT_DIR = path.resolve('temp/probe_reports/dashboard_workspace_stress');
export const REPORT_FILE = path.join(OUT_DIR, 'report.json');
export const DASHBOARD_COLORS = ['#9f2f2f', '#245f94', '#357245', '#673071', '#a65f1f', '#2f6f78', '#6f5b24'];

fs.mkdirSync(OUT_DIR, { recursive: true });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const isOk = (value) => value === true || value?.ok === true;
export const nowId = () => Date.now().toString(36);
export const safeName = (value) => String(value || 'shot').replace(/[^a-z0-9._-]+/gi, '_');
export const writeReport = (report) => fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

export const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 100, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            last = await page.evaluate(predicate, arg);
            if (isOk(last)) return { ok: true, last };
        } catch (error) {
            last = { ok: false, error: error?.message || String(error) };
        }
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

export const waitFrames = (page, count = 4) => page.evaluate(async (frames) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let index = 0; index < frames; index += 1) await frame();
}, count);

const hexToRgb = (hex) => {
    const value = String(hex || '').replace('#', '');
    return [
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16)
    ];
};

const pixelAt = (png, x, y) => {
    const px = Math.max(0, Math.min(png.width - 1, Math.round(x)));
    const py = Math.max(0, Math.min(png.height - 1, Math.round(y)));
    const index = (py * png.width + px) * 4;
    return [png.data[index], png.data[index + 1], png.data[index + 2], png.data[index + 3]];
};

const colorDistance = (left, right) => Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2])
);

export const analyzeImage = (file) => {
    const png = PNG.sync.read(fs.readFileSync(file));
    let nonEmpty = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < png.data.length; index += 4) {
        const alpha = png.data[index + 3];
        const luma = png.data[index] + png.data[index + 1] + png.data[index + 2];
        if (alpha > 0 && luma > 0) nonEmpty += 1;
        min = Math.min(min, luma);
        max = Math.max(max, luma);
    }
    return {
        width: png.width,
        height: png.height,
        nonEmptyRatio: Number((nonEmpty / Math.max(1, png.width * png.height)).toFixed(6)),
        lumaRange: max - min
    };
};

export const dashboardResidue = (file, layout) => {
    const png = PNG.sync.read(fs.readFileSync(file));
    const colors = DASHBOARD_COLORS.map(hexToRgb);
    const lanes = Array.isArray(layout?.lanes) ? layout.lanes : [];
    let samples = 0;
    let matches = 0;
    const rects = lanes.flatMap((lane) => [lane.lane_rect, lane.header_rect, lane.plus_rect]).filter(Boolean);
    for (const rect of rects) {
        const left = Math.max(0, Math.floor(Number(rect.x || 0)));
        const top = Math.max(0, Math.floor(Number(rect.y || 0)));
        const right = Math.min(png.width - 1, Math.ceil(left + Number(rect.width || 0)));
        const bottom = Math.min(png.height - 1, Math.ceil(top + Number(rect.height || 0)));
        for (let y = top; y <= bottom; y += 4) {
            for (let x = left; x <= right; x += 4) {
                samples += 1;
                const pixel = pixelAt(png, x, y);
                if (pixel[3] > 220 && colors.some((color) => colorDistance(pixel, color) <= 8)) matches += 1;
            }
        }
    }
    const ratio = Number((matches / Math.max(1, samples)).toFixed(6));
    return { samples, matches, ratio, pass: ratio < 0.004 };
};

export const screenshot = async (page, name, fullPage = true) => {
    const file = path.join(OUT_DIR, `${safeName(name)}.png`);
    await page.screenshot({ path: file, fullPage, animations: 'disabled' });
    return file;
};

export const dashboardSnapshot = (page) => page.evaluate(() => {
    const projectId = window.__currentProject?.id || window.AdoleAPI?.projects?.getCurrentId?.() || null;
    const runtime = window.eveDashboardBevyUiRuntime || null;
    const state = runtime?.state || {};
    const sceneProjectId = state.active === true
        ? (state.projectId || '__eve_dashboard_workspace__')
        : projectId;
    const scene = sceneProjectId ? window.eveToolBase?.getProjectSceneState?.(sceneProjectId) : null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const dashboard = records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'));
    const visible = dashboard.filter((record) => {
        const props = record?.properties || {};
        return props.visible !== false && Number(props.opacity ?? 1) > 0;
    });
    const layout = state.layout ? {
        lanes: (state.layout.lanes || []).map((lane) => ({
            categoryId: lane.category?.id || '',
            active: lane.active === true,
            lane_rect: lane.lane_rect,
            header_rect: lane.header_rect,
            plus_rect: lane.plus_rect,
            items: (lane.visible_item_rects || []).map((entry) => ({
                id: entry.item?.id || '',
                title: entry.item?.title || '',
                rect: entry.rect
            }))
        })),
        dashboard_rect: state.layout.dashboard_rect,
        toolbox_reserved_rect: state.layout.toolbox_reserved_rect
    } : null;
    return {
        ok: true,
        active: state.active === true,
        closing: state.closing === true,
        opening: state.opening === true,
        activeCategoryId: state.activeCategoryId || '',
        projectId,
        sceneProjectId,
        runtimeProjectId: state.projectId || '',
        fadeOpacity: Number(state.fadeOpacity ?? 1),
        dashboardIds: dashboard.map((record) => record.id),
        visibleDashboardIds: visible.map((record) => record.id),
        canvasCount: document.querySelectorAll('canvas#eve_surface_project').length,
        currentProjectHostIds: Array.from(document.querySelectorAll('[id^="project_view_"]'))
            .map((node) => String(node.id || ''))
            .filter((id) => id !== 'project_view___eve_dashboard_workspace__'),
        workspaceMode: window.__eveWorkspaceMode || null,
        layout,
        perf: window.__EVE_BEVY_PERF__?.summary?.() || null
    };
});

export const sceneSnapshot = (page, projectId) => page.evaluate(async (id) => {
    const { readBevyWebRendererState } = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
    const { sceneState } = await import('/eVe/domains/rendering/project_scene_state.js');
    const scene = window.eveToolBase?.getProjectSceneState?.(id) || null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const canvas = document.getElementById('eve_surface_project');
    const rect = canvas?.getBoundingClientRect?.() || null;
    const bevy = canvas ? readBevyWebRendererState(canvas) : null;
    const nodes = Array.isArray(bevy?.virtual_scene?.nodes) ? bevy.virtual_scene.nodes : [];
    return {
        ok: !!scene,
        projectId: id,
        foregroundProjectId: sceneState?.foregroundProjectId || null,
        surfaceOwnerProjectId: sceneState?.surfaceOwnerProjectId || null,
        canvasSize: rect ? {
            cssWidth: Number(rect.width || 0),
            cssHeight: Number(rect.height || 0),
            pixelWidth: Number(canvas?.width || 0),
            pixelHeight: Number(canvas?.height || 0)
        } : null,
        recordIds: records.map((record) => String(record.id || record.atome_id || '')),
        dashboardVisibleIds: records
            .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'))
            .filter((record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0)
            .map((record) => record.id),
        virtualIds: nodes.map((node) => String(node.id || '')),
        nodeKinds: nodes.map((node) => ({ id: String(node.id || ''), kind: String(node.kind || '') })),
        bevySkipped: (bevy?.skipped_nodes || []).map((node) => ({ id: String(node.id || ''), error: node.error || '' })),
        bevyDeferred: (bevy?.deferred_nodes || []).map((node) => ({ id: String(node.id || ''), kind: String(node.kind || '') })),
        bevyResolved: bevy?.resolved_deferred_nodes || [],
        canvasCount: document.querySelectorAll('canvas#eve_surface_project').length,
        atomeDomCount: document.querySelectorAll('[id^="eve-atome_"]').length
    };
}, projectId);

export const clickMainHandle = async (page) => {
    await page.waitForFunction(() => !!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'), null, { timeout: 45000 });
    let handle = page.locator('#eve_intuitionx_main_ribbon button[data-role="eve_intuitionx-handle"]').first();
    if (!(await handle.isVisible().catch(() => false))) {
        await page.evaluate(() => window.new_menu_v2?.reveal?.());
    }
    if (!(await handle.isVisible().catch(() => false))) {
        const handles = page.locator('button[data-role="eve_intuitionx-handle"]');
        const count = await handles.count();
        for (let index = 0; index < count; index += 1) {
            const candidate = handles.nth(index);
            if (await candidate.isVisible().catch(() => false)) {
                handle = candidate;
                break;
            }
        }
    }
    if (!(await handle.isVisible().catch(() => false))) {
        const target = await page.evaluate(async () => {
            const menu = window.new_menu_v2 || null;
            const surface = document.getElementById('eve_surface_project');
            if (!menu?.reveal || !surface) return { ok: false, error: 'bevy_menu_or_surface_missing' };
            await menu.reveal();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const measure = typeof menu.measure === 'function' ? menu.measure() : null;
            const rect = surface.getBoundingClientRect();
            const itemSize = Math.max(1, Number(measure?.reservedHeight || 0));
            const itemCount = Math.max(1, Number(measure?.itemCount || 0));
            if (!measure?.active || !itemSize || !itemCount || rect.width <= 0 || rect.height <= 0) {
                return { ok: false, error: 'bevy_menu_not_clickable', measure, rect: { width: rect.width, height: rect.height } };
            }
            const handedness = String(menu.handedness || 'right') === 'left' ? 'left' : 'right';
            const localX = handedness === 'left'
                ? itemSize / 2
                : rect.width - (itemSize / 2);
            const localY = rect.height - (itemSize / 2);
            return {
                ok: true,
                kind: 'bevy_ui_main_menu_atome',
                clientX: rect.left + localX,
                clientY: rect.top + localY,
                localX,
                localY,
                measure,
                handedness
            };
        });
        if (!target.ok) throw new Error(`main_handle_bevy_target_failed:${JSON.stringify(target)}`);
        await page.mouse.click(target.clientX, target.clientY);
        return target;
    }
    await handle.waitFor({ state: 'visible', timeout: 15000 });
    const hit = await handle.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
            ok: rect.width > 0 && rect.height > 0,
            topMatches: button === top || button.contains(top),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            topId: top?.id || '',
            topRole: top?.getAttribute?.('data-role') || '',
            topToolId: top?.getAttribute?.('data-tool-id') || '',
            topTag: top?.tagName || ''
        };
    });
    if (!hit.ok) throw new Error(`main_handle_hit_test_failed:${JSON.stringify(hit)}`);
    await handle.click({ timeout: 10000 });
    return hit;
};

export const clickCanvasRect = async (page, rect) => {
    if (!rect) throw new Error('canvas_rect_required');
    const canvas = page.locator('#eve_surface_project').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const point = {
        x: Math.max(1, rect.x + rect.width / 2),
        y: Math.max(1, rect.y + rect.height / 2)
    };
    const target = await page.evaluate(({ x, y }) => {
        const surface = document.getElementById('eve_surface_project');
        const surfaceRect = surface?.getBoundingClientRect?.();
        if (!surface || !surfaceRect) return { ok: false, error: 'surface_missing' };
        const clientX = Number(surfaceRect.left || 0) + Number(x || 0);
        const clientY = Number(surfaceRect.top || 0) + Number(y || 0);
        const top = document.elementFromPoint(clientX, clientY);
        const targetRect = top?.getBoundingClientRect?.();
        const id = String(top?.id || '');
        const role = String(top?.getAttribute?.('data-layer-role') || top?.getAttribute?.('data-role') || '');
        const kind = top === surface
            ? 'canvas'
            : id.startsWith('project_view_') && role === 'project_view'
                ? 'project_layer'
                : '';
        return {
            ok: !!kind,
            kind,
            id,
            role,
            clientX,
            clientY,
            x,
            y,
            position: {
                x: targetRect ? clientX - Number(targetRect.left || 0) : x,
                y: targetRect ? clientY - Number(targetRect.top || 0) : y
            },
            topTag: top?.tagName || '',
            topId: id
        };
    }, point);
    if (!target.ok) throw new Error(`canvas_click_target_blocked:${JSON.stringify(target)}`);
    await page.mouse.click(target.clientX, target.clientY);
    return target;
};

export const enterGuestWorkspace = async (page) => {
    await page.goto(APP_URL, { timeout: 45000 });
    await page.waitForFunction(() => !!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'), null, { timeout: 45000 });
    const workspaceReadyPredicate = async () => {
        const current = await window.AdoleAPI?.auth?.current?.().catch(() => null);
        const projectId = window.__currentProject?.id || null;
        const dashboard = window.eveDashboardBevyUiRuntime?.state || {};
        const dashboardActive = dashboard.active === true && String(dashboard.projectId || '') === '__eve_dashboard_workspace__';
        return {
            ok: current?.logged === true && !!document.getElementById('eve_surface_project') && (!!projectId || dashboardActive),
            projectId,
            dashboardActive,
            anonymous: window.AdoleAPI?.security?.isAnonymous?.() ?? null
        };
    };
    const readyBefore = await waitFor(page, workspaceReadyPredicate, 2000, 100);
    if (!readyBefore.ok) {
        const choice = page.locator('#eve_login_sequence__choice_without_account').first();
        await choice.waitFor({ state: 'visible', timeout: 30000 });
        await choice.click({ timeout: 10000 });
    }
    const ready = await waitFor(page, workspaceReadyPredicate, 60000, 150);
    if (!ready.ok) throw new Error(`workspace_not_ready:${JSON.stringify(ready.last)}`);
    return ready.last;
};
