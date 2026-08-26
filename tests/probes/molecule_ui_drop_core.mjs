import fs from 'node:fs';
import path from 'node:path';

import {
    analyzePngSignal,
    assert,
    clickCanvasTarget,
    playwrightPointForClientTarget,
    visibleMenuTool,
    wait,
    waitFor,
    waitForStableScene
} from './molecule_ui_acceptance_support.mjs';

const MEDIA = Object.freeze({
    image: '/atome/src/assets/images/green_planet.png',
    audio: '/atome/src/assets/audios/riff.m4a'
});

export const stateParentId = (state = {}) => String(
    state.parent_id || state.parentId || state.props?.parent_id
    || state.properties?.parent_id || state.meta?.parent_id || state.meta?.parentId || ''
);

export const createDropFixture = (page, projectId, tag) => page.evaluate(async ({ pid, suffix, media }) => {
    const selection = await import('/eVe/intuition/runtime/selection.js');
    selection.clearAllSelection();
    const specs = [
        {
            id: `${suffix}_audio`, kind: 'audio', type: 'audio', name: `${suffix} Son`,
            src: media.audio, mime_type: 'audio/mp4', left: '120px', top: '110px',
            width: '220px', height: '140px', duration_seconds: 2, order: 10
        },
        {
            id: `${suffix}_image`, kind: 'image', type: 'image', name: `${suffix} Image`,
            src: media.image, mime_type: 'image/png', left: '480px', top: '110px',
            width: '220px', height: '140px', order: 20
        },
        {
            id: `${suffix}_spare`, kind: 'image', type: 'image', name: `${suffix} Libre`,
            src: media.image, mime_type: 'image/png', left: '840px', top: '110px',
            width: '180px', height: '120px', order: 30
        }
    ];
    const created = [];
    for (const spec of specs) {
        const result = await window.eveToolBase.createAtome({
            ...spec, projectId: pid, parentId: pid
        }, { render: false });
        if (result?.ok !== true) throw new Error(`drop_fixture_create_failed:${spec.id}:${JSON.stringify(result)}`);
        created.push(String(result.id || result.atome_id || spec.id));
    }
    await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
    await window.eveDashboardBevyUiRuntime?.destroy?.();
    const workspace = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    workspace.markProjectWorkspaceMode?.(pid);
    return { ok: true, audioId: created[0], imageId: created[1], spareId: created[2] };
}, { pid: projectId, suffix: tag, media: MEDIA });

export const switchView = async (page, projectId, mode) => {
    await waitForStableScene(page, projectId);
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
        const view = await visibleMenuTool(page, projectId, 'view');
        await clickCanvasTarget(page, view);
        opened = await waitFor(page, async () => {
            const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const value = registry.getMainMenuRuntime()?.measure?.() || {};
            return { ok: value.activePaletteKey === 'view' && value.paletteMotionActive === false, value };
        }, null, 3000).then(() => true).catch(() => false);
        if (!opened) await wait(250);
    }
    assert(opened, `view_palette_not_opened:${mode}`);
    const key = mode === 'table' ? 'view_table' : mode === 'list' ? 'view_list' : 'view_natural';
    await clickCanvasTarget(page, await visibleMenuTool(page, projectId, key));
    await waitFor(page, async (expected) => {
        const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
        const state = readProjectViewSurfaceState();
        return { ok: state.mode === expected, mode: state.mode, content: state.content };
    }, mode);
    if (mode === 'list' || mode === 'table') {
        await waitFor(page, async ({ expectedMode, expectedProjectId }) => {
            const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
            const state = readProjectViewSurfaceState();
            return {
                ok: state.mode === expectedMode
                    && state.content?.projectId === expectedProjectId
                    && Number(state.content?.recordCount || 0) > 0,
                mode: state.mode,
                content: state.content
            };
        }, { expectedMode: mode, expectedProjectId: projectId });
    }
    await waitForStableScene(page, projectId);
};

export const screenshot = async ({ page, report, outDir, name, preservePointer = false }) => {
    const file = path.join(outDir, `${name}.png`);
    if (preservePointer) {
        const session = await page.context().newCDPSession(page);
        try {
            const captured = await session.send('Page.captureScreenshot', {
                format: 'png', captureBeyondViewport: false
            });
            fs.writeFileSync(file, Buffer.from(captured.data, 'base64'));
        } finally {
            await session.detach();
        }
    } else {
        await page.screenshot({ path: file, animations: 'disabled' });
    }
    const signal = analyzePngSignal(file);
    assert(signal.non_black_pixel_ratio > 0.2 && signal.sampled_color_count > 32,
        `visual_signal_missing:${name}:${JSON.stringify(signal)}`);
    report.screenshots.push(file);
    return { file, signal };
};

export const drag = async ({
    page, source, destination, holdMs = 0, armedShot = null, steps = 16,
    postArmOffset = null, waypoint = null
}) => {
    const from = await playwrightPointForClientTarget(page, source);
    const to = await playwrightPointForClientTarget(page, destination);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    if (waypoint) {
        const via = await playwrightPointForClientTarget(page, waypoint);
        await page.mouse.move(via.x, via.y, { steps: Math.max(2, Math.round((Number(steps) || 16) / 2)) });
    }
    await page.mouse.move(to.x, to.y, { steps: Math.max(1, Number(steps) || 1) });
    if (holdMs > 0) {
        await wait(holdMs);
    }
    if (typeof armedShot === 'function') await armedShot();
    if (postArmOffset) {
        await page.mouse.move(
            to.x + Number(postArmOffset.x || 0),
            to.y + Number(postArmOffset.y || 0)
        );
    }
    await page.mouse.up();
    return { from, to };
};

export const structuredDropTarget = (page, input) => page.evaluate(async (options) => {
    const surface = document.getElementById('eve_surface_project');
    const runtime = window.eveBevyUiRuntime;
    const rect = surface?.getBoundingClientRect?.();
    if (!surface || !runtime?.hitTestAtClientPoint || !rect) return null;
    const { resolveStructuredDropIntent } = await import('/eVe/domains/rendering/project_view_drop_intent_runtime.js');
    const prefix = options.layout === 'matrix'
        ? `project_view_matrix_tile_${options.targetIndex}`
        : `project_view_list_entry_${options.targetIndex}`;
    let best = null;
    for (let y = rect.top + 1; y < rect.bottom; y += 2) {
        for (let x = rect.left + 1; x < rect.right; x += 2) {
            const hit = runtime.hitTestAtClientPoint({ surface, clientX: x, clientY: y });
            if (!String(hit?.nodeId || '').startsWith(prefix)) continue;
            const point = hit?.point || runtime.surfacePointFromEvent(surface, { clientX: x, clientY: y });
            const intent = resolveStructuredDropIntent({
                layout: options.layout, sourceId: options.sourceId,
                targetId: `target_${options.targetIndex}`, targetIndex: options.targetIndex,
                point, box: hit?.box || null
            });
            if (intent.kind !== options.kind || (options.edge && intent.edge !== options.edge)) continue;
            const box = hit?.box || {};
            const rx = (Number(point?.x) - Number(box.x || 0)) / Math.max(1, Number(box.width || 1));
            const ry = (Number(point?.y) - Number(box.y || 0)) / Math.max(1, Number(box.height || 1));
            const score = options.kind === 'overlap'
                ? Math.abs(rx - 0.5) + Math.abs(ry - 0.5)
                : Math.abs(ry - (options.edge === 'after' ? 0.9 : 0.1));
            const candidate = { x, y, coordinate_source: 'scene', intent, score, hit: {
                nodeId: hit.nodeId, treeId: hit.treeId, box: hit.box || null
            } };
            if (!best || score < best.score) best = candidate;
        }
    }
    return best;
}, input);

export const readMembership = (page, ids) => page.evaluate(async ({ sourceId, targetId, spareId }) => {
    const source = await window.Atome.getStateCurrent(sourceId);
    const target = await window.Atome.getStateCurrent(targetId);
    const spare = spareId ? await window.Atome.getStateCurrent(spareId) : null;
    const parentOf = (state) => String(state?.parent_id || state?.parentId
        || state?.props?.parent_id || state?.properties?.parent_id
        || state?.meta?.parent_id || state?.meta?.parentId || '');
    const sourceParent = parentOf(source);
    const targetParent = parentOf(target);
    const molecule = sourceParent && sourceParent === targetParent
        ? await window.Atome.getStateCurrent(sourceParent) : null;
    return {
        sourceParent, targetParent, spareParent: parentOf(spare),
        moleculeId: sourceParent === targetParent ? sourceParent : '',
        moleculeType: String(molecule?.type || molecule?.atome_type
            || molecule?.props?.kind || molecule?.properties?.kind || ''),
        timeline: molecule?.molecule_timeline || molecule?.props?.molecule_timeline
            || molecule?.properties?.molecule_timeline || null
    };
}, ids);

export const waitForMolecule = async (page, ids) => waitFor(page, async (input) => {
    const source = await window.Atome.getStateCurrent(input.sourceId);
    const target = await window.Atome.getStateCurrent(input.targetId);
    const parentOf = (state) => String(state?.parent_id || state?.parentId
        || state?.props?.parent_id || state?.properties?.parent_id
        || state?.meta?.parent_id || state?.meta?.parentId || '');
    const sourceParent = parentOf(source);
    const targetParent = parentOf(target);
    const owner = sourceParent && sourceParent === targetParent
        ? await window.Atome.getStateCurrent(sourceParent) : null;
    const timeline = owner?.molecule_timeline || owner?.props?.molecule_timeline
        || owner?.properties?.molecule_timeline || null;
    return {
        ok: Boolean(sourceParent) && sourceParent === targetParent
            && ['group', 'molecule'].includes(String(owner?.type || owner?.atome_type
                || owner?.props?.kind || owner?.properties?.kind || '').toLowerCase())
            && Array.isArray(timeline?.clips) && timeline.clips.length === 2,
        sourceParent, targetParent, timelineClips: timeline?.clips?.length || 0
    };
}, ids, 30000);

export const reloadProjection = async (page, projectId) => {
    await page.evaluate(async (pid) => window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false }), projectId);
    await waitForStableScene(page, projectId);
};
