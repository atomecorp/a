import fs from 'node:fs';
import { PNG } from 'pngjs';

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const runSetupStep = async (name, operation, timeoutMs = 45000) => {
    console.log(`  setup ${name}`);
    let timer = null;
    try {
        const result = await Promise.race([
            Promise.resolve().then(operation),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`setup_timeout:${name}`)), timeoutMs);
            })
        ]);
        console.log(`  ready ${name}`);
        return result;
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const readPng = (filePath) => PNG.sync.read(fs.readFileSync(filePath));

export const analyzePngSignal = (filePath) => {
    const png = readPng(filePath);
    let opaquePixels = 0;
    let nonBlackPixels = 0;
    let minimumLuma = 255;
    let maximumLuma = 0;
    const colors = new Set();
    for (let index = 0; index < png.data.length; index += 4) {
        const red = png.data[index];
        const green = png.data[index + 1];
        const blue = png.data[index + 2];
        const alpha = png.data[index + 3];
        if (alpha > 0) opaquePixels += 1;
        if (Math.max(red, green, blue) > 5 && alpha > 0) nonBlackPixels += 1;
        const luma = Math.round((red * 0.2126) + (green * 0.7152) + (blue * 0.0722));
        minimumLuma = Math.min(minimumLuma, luma);
        maximumLuma = Math.max(maximumLuma, luma);
        if (colors.size < 4096) colors.add(`${red}:${green}:${blue}:${alpha}`);
    }
    const pixelCount = Math.max(1, png.width * png.height);
    return {
        width: png.width,
        height: png.height,
        opaque_pixel_ratio: opaquePixels / pixelCount,
        non_black_pixel_ratio: nonBlackPixels / pixelCount,
        luma_range: maximumLuma - minimumLuma,
        sampled_color_count: colors.size
    };
};

export const diffPng = (leftPath, rightPath) => {
    const left = readPng(leftPath);
    const right = readPng(rightPath);
    if (left.width !== right.width || left.height !== right.height) {
        return { same_size: false, differing_pixel_ratio: 1, max_channel_delta: 255, mean_absolute_channel_delta: 255 };
    }
    let differingPixels = 0;
    let maxChannelDelta = 0;
    let absoluteDelta = 0;
    for (let index = 0; index < left.data.length; index += 4) {
        let differs = false;
        for (let channel = 0; channel < 4; channel += 1) {
            const delta = Math.abs(left.data[index + channel] - right.data[index + channel]);
            absoluteDelta += delta;
            maxChannelDelta = Math.max(maxChannelDelta, delta);
            if (delta > 0) differs = true;
        }
        if (differs) differingPixels += 1;
    }
    const pixelCount = left.width * left.height;
    return {
        same_size: true,
        differing_pixel_ratio: differingPixels / Math.max(1, pixelCount),
        max_channel_delta: maxChannelDelta,
        mean_absolute_channel_delta: absoluteDelta / Math.max(1, left.data.length)
    };
};

export const waitFor = async (page, predicate, argument = null, timeoutMs = 30000) => {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            last = await page.evaluate(predicate, argument);
            if (last === true || last?.ok === true) return last;
        } catch (error) {
            last = { ok: false, error: error?.message || String(error) };
        }
        await wait(100);
    }
    throw new Error(`wait_timeout:${JSON.stringify(last)}`);
};

export const waitForStableScene = async (page, projectId, consecutiveSamples = 4) => {
    let previous = '';
    let stable = 0;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30000) {
        const signature = await page.evaluate(async (pid) => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const { readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
            const menu = getMainMenuRuntime()?.measure?.() || {};
            const surface = document.getElementById('eve_surface_project');
            const surfaceSize = readRenderSurfaceSize(surface);
            const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
            return JSON.stringify({
                paletteMotionActive: menu.paletteMotionActive === true,
                surfaceSize,
                backingSize: [surface?.width || 0, surface?.height || 0],
                recordCount: records.length,
                records: records.map((record) => [
                    String(record.id || ''),
                    Number(record.properties?.left || 0), Number(record.properties?.top || 0),
                    Number(record.properties?.width || 0), Number(record.properties?.height || 0)
                ])
            });
        }, projectId);
        if (signature === previous && !JSON.parse(signature).paletteMotionActive) stable += 1;
        else stable = 0;
        if (stable >= consecutiveSamples) return true;
        previous = signature;
        await wait(120);
    }
    throw new Error('scene_stability_timeout');
};

export const sceneRecords = (page, projectId) => page.evaluate((id) => {
    const scene = window.eveToolBase?.getProjectSceneState?.(id) || null;
    return (scene?.records || []).map((record) => ({
        id: String(record?.id || ''),
        kind: String(record?.kind || ''),
        properties: record?.properties || {}
    }));
}, projectId);

export const recordCenter = async (
    page,
    projectId,
    matcher,
    { sceneCoordinates = false } = {}
) => {
    const records = await sceneRecords(page, projectId);
    const matches = records.filter((record) => matcher(record));
    const record = matches.find((entry) => entry.id.endsWith('_background')) || matches[0];
    if (!record) {
        const relevantIds = records.map((entry) => entry.id)
            .filter((id) => id.includes('molecule') || id.includes('main_menu')).slice(0, 60);
        throw new Error(`record_missing:${relevantIds.join(',')}`);
    }
    const client = sceneCoordinates ? await page.evaluate(async ({ recordId }) => {
        const surface = document.getElementById('eve_surface_project');
        const { getRenderSurfaceState, readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
        const { surfaceTargetClientRect } = await import('/eVe/domains/rendering/surface_hit_target_runtime.js');
        const runtime = getRenderSurfaceState(surface);
        const atom = runtime?.scene?.byId?.get?.(recordId)
            || runtime?.scene?.atoms?.find?.((entry) => entry.id === recordId);
        const rect = surfaceTargetClientRect(surface, atom, readRenderSurfaceSize(surface));
        return rect ? {
            left: rect.left, top: rect.top, width: rect.width, height: rect.height,
            atom_bounds: atom?.bounds || null
        } : { atom_bounds: atom?.bounds || null };
    }, { recordId: record.id }) : null;
    const properties = record.properties || {};
    const left = client?.left ?? Number(properties.left || 0);
    const top = client?.top ?? Number(properties.top || 0);
    const width = client?.width ?? Number(properties.width || 0);
    const height = client?.height ?? Number(properties.height || 0);
    return {
        id: record.id,
        x: left + (width / 2), y: top + (height / 2), width, height,
        atom_bounds: client?.atom_bounds || null,
        coordinate_source: client?.left == null ? 'record' : 'scene'
    };
};

const menuTool = (page, projectId, toolKey) => recordCenter(
    page,
    projectId,
    (record) => record.id.includes('eve_bevy_ui_main_menu_tool_')
        && record.id.endsWith(`_${toolKey}_background`)
);

const waitForSettledMainMenu = async (page, timeoutMs = 3000) => {
    const startedAt = Date.now();
    let stableSamples = 0;
    let previous = '';
    while (Date.now() - startedAt < timeoutMs) {
        const measure = await page.evaluate(async () => {
            const module = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            return module.getMainMenuRuntime()?.measure?.() || {};
        });
        const signature = JSON.stringify({
            paletteMotionActive: measure.paletteMotionActive === true,
            scrollLeftPx: Number(measure.scrollLeftPx || 0),
            scrollMaxPx: Number(measure.scrollMaxPx || 0)
        });
        if (signature === previous && measure.paletteMotionActive !== true) stableSamples += 1;
        else stableSamples = 0;
        // A wheel schedules its snap after 80 ms and the snap itself lasts 90 ms.
        // Five unchanged samples prove both phases have completed before a click;
        // two samples could land entirely inside the pre-snap delay.
        if (stableSamples >= 5) return measure;
        previous = signature;
        await wait(80);
    }
    return null;
};

export const readBevyUiHit = (page, target) => page.evaluate(({ x, y }) => {
    const resolved = window.eveBevyUiRuntime?.hitTestAtClientPoint?.({
        surface: document.getElementById('eve_surface_project'), clientX: x, clientY: y
    });
    return {
        nodeId: resolved?.nodeId || null,
        treeId: resolved?.treeId || null,
        box: resolved?.box || null
    };
}, target);

export const findBevyUiNodeTarget = (page, {
    nodeId = '', nodePrefix = '', treeId = '', step = 3, hint = null
} = {}) => (
    page.evaluate(({ expectedId, expectedPrefix, expectedTree, stride, pointHint }) => {
        const surface = document.getElementById('eve_surface_project');
        const runtime = window.eveBevyUiRuntime;
        const rect = surface?.getBoundingClientRect?.();
        if (!surface || !runtime?.hitTestAtClientPoint || !rect) return null;
        const matches = (hit) => !!hit
            && (!expectedTree || hit.treeId === expectedTree)
            && (!expectedId || hit.nodeId === expectedId)
            && (!expectedPrefix || String(hit.nodeId || '').startsWith(expectedPrefix));
        const increment = Math.max(1, Number(stride) || 3);
        const hitAt = (x, y) => {
            const hit = runtime.hitTestAtClientPoint({ surface, clientX: x, clientY: y });
            if (!matches(hit)) return null;
            return {
                id: hit.nodeId, x, y, width: increment, height: increment,
                coordinate_source: 'scene', hit: {
                    nodeId: hit.nodeId, treeId: hit.treeId, box: hit.box || null
                }
            };
        };
        if (Number.isFinite(pointHint?.x) && Number.isFinite(pointHint?.y)
            && pointHint.x >= rect.left && pointHint.x < rect.right
            && pointHint.y >= rect.top && pointHint.y < rect.bottom) {
            const direct = hitAt(pointHint.x, pointHint.y);
            if (direct) return direct;
            for (let offset = 0; offset <= 18; offset += increment) {
                for (const y of [pointHint.y - offset, pointHint.y + offset]) {
                    if (y < rect.top || y >= rect.bottom) continue;
                    for (let x = rect.left + 1; x < rect.right; x += increment) {
                        const found = hitAt(x, y);
                        if (found) return found;
                    }
                }
            }
        }
        for (let y = rect.top + 1; y < rect.bottom; y += increment) {
            for (let x = rect.left + 1; x < rect.right; x += increment) {
                const found = hitAt(x, y);
                if (found) return found;
            }
        }
        return null;
    }, {
        expectedId: String(nodeId || ''), expectedPrefix: String(nodePrefix || ''),
        expectedTree: String(treeId || ''), stride: step,
        pointHint: hint && typeof hint === 'object' ? { x: Number(hint.x), y: Number(hint.y) } : null
    })
);

export const playwrightPointForSurfaceTarget = ({ target, canvasBounds, surfaceSize } = {}) => {
    if (target?.coordinate_source === 'scene') {
        return { x: Number(target.x || 0), y: Number(target.y || 0) };
    }
    void surfaceSize;
    return {
        x: Number(canvasBounds?.x || 0) + Number(target?.x || 0),
        y: Number(canvasBounds?.y || 0) + Number(target?.y || 0)
    };
};

export const playwrightPointForClientTarget = async (page, target, canvasBounds = null) => {
    const bounds = canvasBounds || await page.locator('#eve_surface_project').boundingBox();
    const surfaceSize = await page.evaluate(async () => {
        const { readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
        return readRenderSurfaceSize(document.getElementById('eve_surface_project'));
    });
    return playwrightPointForSurfaceTarget({ target, canvasBounds: bounds, surfaceSize });
};

export const visibleMenuTool = async (page, projectId, toolKey) => {
    const diagnostics = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
        let target = null;
        try { target = await menuTool(page, projectId, toolKey); }
        catch (_) {
            diagnostics.push({ attempt, target: null });
            await wait(100);
            continue;
        }
        const recordPrefix = '__eve_bevy_ui_eve_bevy_ui_main_menu_';
        const expectedNodeId = target.id.startsWith(recordPrefix)
            ? target.id.slice(recordPrefix.length).replace(/_background$/, '')
            : `eve_bevy_ui_main_menu_tool_${toolKey}`;
        const interactive = await findBevyUiNodeTarget(page, {
            nodeId: expectedNodeId,
            treeId: 'eve_bevy_ui_main_menu', step: 3, hint: target
        });
        if (interactive) {
            await waitForSettledMainMenu(page);
            const settledInteractive = await findBevyUiNodeTarget(page, {
                nodeId: expectedNodeId,
                treeId: 'eve_bevy_ui_main_menu', step: 2, hint: interactive
            });
            if (settledInteractive) return settledInteractive;
        }
        const viewport = await page.evaluate(() => ({
            width: window.innerWidth, height: window.innerHeight,
            handedness: window.__eveIntuitionXState?.handedness === 'left' ? 'left' : 'right'
        }));
        const visibleMenuNode = await findBevyUiNodeTarget(page, {
            nodePrefix: 'eve_bevy_ui_main_menu_tool_', treeId: 'eve_bevy_ui_main_menu', step: 4
        });
        const menuCenterY = visibleMenuNode?.y || (viewport.height - 60);
        const menuX = visibleMenuNode?.x || (viewport.width / 2);
        const wheelX = target.x < 0 ? -75 : 75;
        await page.mouse.move(menuX, menuCenterY);
        await page.mouse.wheel(wheelX, 0);
        diagnostics.push({ attempt, target, viewport, wheelX });
        await wait(220);
    }
    const measure = await page.evaluate(async () => {
        const module = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        return module.getMainMenuRuntime()?.measure?.() || null;
    });
    throw new Error(`menu_tool_not_revealed:${toolKey}:${JSON.stringify({ measure, diagnostics })}`);
};

export const clickCanvasTarget = async (page, target, { double = false } = {}) => {
    const canvas = page.locator('#eve_surface_project');
    const bounds = await canvas.boundingBox();
    assert(bounds, 'canvas_bounds_missing');
    let resolvedTarget = target;
    let point = await playwrightPointForClientTarget(page, resolvedTarget, bounds);
    const expectedNodeId = String(target?.hit?.nodeId || '');
    const expectedTreeId = String(target?.hit?.treeId || '');
    const pointStillTargetsNode = expectedNodeId ? await page.evaluate(({ x, y, nodeId, treeId }) => {
        const hit = window.eveBevyUiRuntime?.hitTestAtClientPoint?.({
            surface: document.getElementById('eve_surface_project'), clientX: x, clientY: y
        });
        return hit?.nodeId === nodeId && (!treeId || hit?.treeId === treeId);
    }, { ...point, nodeId: expectedNodeId, treeId: expectedTreeId }) : true;
    if (!pointStillTargetsNode
        || point.x < bounds.x || point.x > bounds.x + bounds.width
        || point.y < bounds.y || point.y > bounds.y + bounds.height) {
        const refreshed = await findBevyUiNodeTarget(page, {
            nodeId: expectedNodeId, treeId: expectedTreeId, step: 2
        });
        if (!refreshed) {
            const evidence = await page.evaluate(async ({ x, y }) => {
                const surface = document.getElementById('eve_surface_project');
                const hit = window.eveBevyUiRuntime?.hitTestAtClientPoint?.({ surface, clientX: x, clientY: y });
                const module = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                return {
                    hit: hit ? { nodeId: hit.nodeId, treeId: hit.treeId, box: hit.box || null } : null,
                    menu: module.getMainMenuRuntime()?.measure?.() || null,
                    surface: surface?.getBoundingClientRect?.()?.toJSON?.() || null
                };
            }, point);
            throw new Error(`canvas_target_not_actionable:${expectedTreeId}:${expectedNodeId}:${JSON.stringify({ target, point, bounds, evidence })}`);
        }
        resolvedTarget = refreshed;
        point = await playwrightPointForClientTarget(page, resolvedTarget, bounds);
    }
    const position = { x: point.x - bounds.x, y: point.y - bounds.y };
    assert(position.x >= 0 && position.x <= bounds.width, `canvas_click_x_outside:${JSON.stringify({ position, bounds })}`);
    assert(position.y >= 0 && position.y <= bounds.height, `canvas_click_y_outside:${JSON.stringify({ position, bounds })}`);
    const touchCapable = await page.evaluate(() => Number(navigator.maxTouchPoints || 0) > 0);
    if (touchCapable) {
        await page.touchscreen.tap(point.x, point.y);
        if (double) {
            await wait(80);
            await page.touchscreen.tap(point.x, point.y);
        }
        return;
    }
    if (double) {
        await page.mouse.dblclick(point.x, point.y, { delay: 40 });
        return;
    }
    await page.mouse.click(point.x, point.y, { delay: 40 });
};

export const exerciseMixerLassoBlock = async (page) => {
    const blocker = await findBevyUiNodeTarget(page, {
        nodeId: 'project_view_molecule_mix_lasso_blocker', treeId: 'eve_bevy_ui_project_view', step: 2
    });
    assert(blocker, 'molecule_mix_lasso_blocker_not_actionable');
    const before = await page.evaluate(() => {
        const apiIds = window.SelectionAPI?.selected?.() || [];
        return Array.from(new Set([...(Array.isArray(apiIds) ? apiIds : []), ...(window.__selectedAtomeIds || [])])).map(String).sort();
    });
    const box = blocker.hit?.box || {};
    const end = {
        x: Math.min(blocker.x + 48, Number(box.x || blocker.x) + Number(box.width || 52) - 2),
        y: Math.min(blocker.y + 36, Number(box.y || blocker.y) + Number(box.height || 40) - 2)
    };
    await page.mouse.move(blocker.x, blocker.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
    const after = await page.evaluate(() => {
        const apiIds = window.SelectionAPI?.selected?.() || [];
        const selection = Array.from(new Set([...(Array.isArray(apiIds) ? apiIds : []), ...(window.__selectedAtomeIds || [])])).map(String).sort();
        return { selection, lasso_visible: !!document.querySelector('.eve-atome-lasso') };
    });
    assert(JSON.stringify(after.selection) === JSON.stringify(before),
        `molecule_mix_drag_changed_selection:${JSON.stringify({ before, after })}`);
    assert(after.lasso_visible === false, 'molecule_mix_drag_started_lasso');
    return { blocker: blocker.id, selection: after.selection };
};

export const exerciseTimelineEditingGestures = async ({ page, projectId, ownerId, clipId } = {}) => {
    const readTimeline = () => page.evaluate(async (owner) => {
        const state = await window.Atome.getStateCurrent(owner);
        return state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
    }, ownerId);
    const beforeCrop = await readTimeline();
    const previousDuration = beforeCrop.clips.find((clip) => clip.clip_id === clipId).timeline.duration_frames;
    const crop = await recordCenter(page, projectId, (record) => record.id === `mol:crop:${clipId}:out`, { sceneCoordinates: true });
    const cropPoint = await playwrightPointForClientTarget(page, crop);
    await page.mouse.move(cropPoint.x, cropPoint.y); await page.mouse.down();
    await page.mouse.move(cropPoint.x - 24, cropPoint.y, { steps: 6 }); await page.mouse.up();
    const cropCommitted = await waitFor(page, async ({ owner, id, prior }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
        const duration = timeline?.clips?.find((clip) => clip.clip_id === id)?.timeline?.duration_frames;
        return { ok: Number.isSafeInteger(duration) && duration !== prior, duration };
    }, { owner: ownerId, id: clipId, prior: previousDuration });
    await waitForStableScene(page, projectId);

    const beforeZoom = await readTimeline();
    const zoomTarget = await recordCenter(page, projectId, (record) => record.id === `mol:clip:${clipId}`, { sceneCoordinates: true });
    const zoomPoint = await playwrightPointForClientTarget(page, zoomTarget);
    await page.mouse.move(zoomPoint.x, zoomPoint.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control');
    const zoomCommitted = await waitFor(page, async ({ owner, prior }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
        const zoom = Number(timeline?.view?.x_zoom || 1); return { ok: zoom !== prior, zoom };
    }, { owner: ownerId, prior: Number(beforeZoom.view?.x_zoom || 1) });
    await waitForStableScene(page, projectId);

    const splitTarget = await recordCenter(page, projectId, (record) => record.id === `mol:clip:${clipId}`, { sceneCoordinates: true });
    const splitPoint = await playwrightPointForClientTarget(page, splitTarget);
    await page.mouse.move(splitPoint.x, splitPoint.y); await page.keyboard.down('Alt');
    await page.mouse.dblclick(splitPoint.x, splitPoint.y, { delay: 40 }); await page.keyboard.up('Alt');
    const splitCommitted = await waitFor(page, async ({ owner, id }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
        const ids = (timeline?.clips || []).map((clip) => String(clip.clip_id));
        const splitIds = ids.filter((candidate) => candidate.startsWith(`${id}:split:`));
        return { ok: !ids.includes(id) && splitIds.length === 2, split_ids: splitIds };
    }, { owner: ownerId, id: clipId });
    await waitForStableScene(page, projectId);
    const lassoTargetId = splitCommitted.split_ids[0];
    const lassoTarget = await recordCenter(page, projectId, (record) => record.id === `mol:clip:${lassoTargetId}`, { sceneCoordinates: true });
    const start = { x: lassoTarget.x - lassoTarget.width / 2 - 8, y: lassoTarget.y - lassoTarget.height / 2 - 2 };
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(lassoTarget.x + lassoTarget.width / 2 + 8, lassoTarget.y + lassoTarget.height / 2 + 2, { steps: 8 }); await page.mouse.up();
    const lassoSelection = await page.evaluate(() => {
        const apiIds = window.SelectionAPI?.selected?.() || [];
        return Array.from(new Set([...(Array.isArray(apiIds) ? apiIds : []), ...(window.__selectedAtomeIds || [])])).map(String);
    });
    assert(lassoSelection.includes(`mol:clip:${lassoTargetId}`), `timeline_lasso_clip_missing:${JSON.stringify(lassoSelection)}`);
    assert(lassoSelection.every((id) => !id.startsWith('mol:lane:') && !id.startsWith('mol:crop:')),
        `timeline_lasso_selected_technical_record:${JSON.stringify(lassoSelection)}`);
    return { lasso_selection: lassoSelection, crop: cropCommitted, zoom: zoomCommitted, split: splitCommitted };
};
