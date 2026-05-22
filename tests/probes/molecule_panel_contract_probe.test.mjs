import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports');
const OUT_FILE = path.join(OUT_DIR, 'molecule_panel_contract_probe.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (promise, timeoutMs, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs))
]);

const safeEval = async (page, fn, arg = null, timeoutMs = 12000) => {
    try {
        return await withTimeout(page.evaluate(fn, arg), timeoutMs, 'page_eval');
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 250, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await safeEval(page, predicate, arg, Math.min(timeoutMs, intervalMs + 3000));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const persistReport = (report) => {
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
};

const summarizeRect = (rect) => {
    if (!rect) return null;
    return {
        left: Math.round(Number(rect.left || 0)),
        top: Math.round(Number(rect.top || 0)),
        right: Math.round(Number(rect.right || 0)),
        bottom: Math.round(Number(rect.bottom || 0)),
        width: Math.round(Number(rect.width || 0)),
        height: Math.round(Number(rect.height || 0))
    };
};

const rectDelta = (left, right) => Math.max(
    Math.abs(Number(left?.left || 0) - Number(right?.left || 0)),
    Math.abs(Number(left?.top || 0) - Number(right?.top || 0)),
    Math.abs(Number(left?.width || 0) - Number(right?.width || 0)),
    Math.abs(Number(left?.height || 0) - Number(right?.height || 0))
);

const ensureProjectReady = async (page) => safeEval(page, async ({ phone, password }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login || !api?.projects?.list) return { ok: false, error: 'project_api_unavailable' };
    const isSuccess = (result) => !!(
        result?.fastify?.success
        || result?.tauri?.success
        || result?.success
        || result?.ok
    );
    let loginResult = await api.auth.login(phone, password, phone);
    if (!isSuccess(loginResult) && typeof api.auth.create === 'function') {
        await api.auth.create(phone, password, phone, 'public');
        loginResult = await api.auth.login(phone, password, phone);
    }
    const pickProject = (result, preferredName) => {
        const list = [
            ...(Array.isArray(result?.projects) ? result.projects : []),
            ...(Array.isArray(result?.tauri?.projects) ? result.tauri.projects : []),
            ...(Array.isArray(result?.fastify?.projects) ? result.fastify.projects : [])
        ];
        if (!list.length) return null;
        const named = list.find((entry) => {
            const props = entry?.properties || entry?.particles || entry?.data || {};
            return String(props?.name || '').trim().toLowerCase() === preferredName.toLowerCase();
        });
        return named || list[0];
    };
    const preferredName = 'molecule_panel_contract_probe';
    let projects = await api.projects.list();
    let project = pickProject(projects, preferredName);
    if (!project && typeof api.projects.create === 'function') {
        await api.projects.create(preferredName);
        projects = await api.projects.list();
        project = pickProject(projects, preferredName);
    }
    if (!project) return { ok: false, error: 'project_missing', loginResult };
    const props = project?.properties || project?.particles || project?.data || {};
    const projectId = String(project?.id || project?.atome_id || '').trim();
    const ownerId = project?.owner_id || project?.ownerId || props?.owner_id || null;
    const projectName = String(props?.name || preferredName).trim() || preferredName;
    if (!projectId) return { ok: false, error: 'project_id_missing', project };
    if (typeof api.projects.setCurrent === 'function') {
        await api.projects.setCurrent(projectId, projectName, ownerId || null, true);
    }
    if (window.eveToolBase?.loadProjectAtomes) {
        await window.eveToolBase.loadProjectAtomes(projectId);
    }
    return { ok: true, project_id: projectId, name: projectName };
}, { phone: PHONE, password: PASSWORD });

const resolveOrCreateOpenTarget = async (page, projectId) => safeEval(page, async (input) => {
    const toolBase = window.eveToolBase || null;
    if (!toolBase?.createAtome) return { ok: false, error: 'group_create_unavailable' };
    const member = await toolBase.createAtome({
        kind: 'shape',
        type: 'shape',
        projectId: input.projectId,
        parentId: input.projectId,
        left: 220,
        top: 180,
        width: 88,
        height: 88,
        name: 'Molecule probe member',
        background: '#00AEEF',
        backgroundColor: '#00AEEF',
        borderRadius: '50%',
        shape_variant: 'circle'
    });
    const memberId = String(
        member?.id
        || member?.atome_id
        || member?.result?.id
        || member?.result?.atome_id
        || ''
    ).trim();
    if (!memberId) return { ok: false, error: 'member_id_missing', member };
    const created = await toolBase.createAtome({
        kind: 'group',
        type: 'group',
        projectId: input.projectId,
        parentId: input.projectId,
        left: 180,
        top: 140,
        width: 360,
        height: 240,
        name: 'Molecule panel contract probe',
        groupSteps: [[memberId]],
        group_steps: [[memberId]]
    });
    const atomeId = String(
        created?.id
        || created?.atome_id
        || created?.result?.id
        || created?.result?.atome_id
        || ''
    ).trim();
    if (atomeId && typeof toolBase.updateAtomeProperties === 'function') {
        await toolBase.updateAtomeProperties(atomeId, {
            groupSteps: [[memberId]],
            group_steps: [[memberId]]
        });
    }
    return atomeId ? { ok: true, atome_id: atomeId, member_id: memberId, is_group: true, source: 'created_group' } : { ok: false, error: 'group_id_missing', created };
}, { projectId });

const openMolecule = async (page, target) => safeEval(page, async (input) => {
    const runtime = window.atome?.tools?.v2Runtime;
    if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
    const id = String(input.atomeId || '').trim();
    const payload = {
        action: 'open',
        toggle: false,
        atome_id: id,
        atomeId: id,
        target_id: id,
        targetId: id,
        selection_ids: [id],
        selectionIds: [id],
        atome_docked_open: true,
        atomeDockedOpen: true,
        dock_to_atome: true,
        dockToAtome: true
    };
    if (input.isGroup === true) {
        payload.group_id = id;
        payload.groupId = id;
    }
    return runtime.invokeById({
        tool_id: 'ui.mtrax.open',
        event: 'dblclick',
        action: 'open',
        input: payload,
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'molecule_panel_contract_probe' }
    });
}, { atomeId: target?.atome_id, isGroup: target?.is_group === true }, 60000);

const mountSyntheticTimeline = async (page) => safeEval(page, async () => {
    const api = window.eveMtrackApi || null;
    if (!api?.debugMountSyntheticTimeline) return { ok: false, error: 'debug_mount_missing' };
    return api.debugMountSyntheticTimeline({ track_count: 8, clips_per_track: 4 });
});

const readPanelState = async (page) => safeEval(page, () => {
    const panel = document.getElementById('eve_mtrack_dialog');
    const header = document.getElementById('eve_mtrack_dialog__header');
    const body = document.getElementById('eve_mtrack_dialog__body');
    const footer = document.getElementById('eve_mtrack_dialog__footer');
    const toolsDock = document.getElementById('eve_mtrack_dialog__tools_dock');
    const closeButton = document.getElementById('eve_mtrack_dialog__close') || panel?.querySelector?.('[data-eve-panel-close="true"]');
    const resizeGrip = panel?.querySelector?.('[data-role="dialog-resize-grip"]') || null;
    const preview = document.getElementById('eve_mtrack_dialog__preview_section');
    const previewHost = document.getElementById('eve_mtrack_dialog__preview_host');
    const previewSplitter = document.getElementById('eve_mtrack_dialog__preview_tracks_splitter');
    const scroll = document.getElementById('eve_mtrack_dialog__scroll');
    const tracks = panel?.querySelector?.('.eve-mtrack-tracks') || null;
    const trackRows = Array.from(panel?.querySelectorAll?.('.eve-mtrack-track') || []);
    const audioTrackRows = Array.from(panel?.querySelectorAll?.('.eve-mtrack-track[data-track-record-source="audio"]') || []);
    const videoTrackRows = Array.from(panel?.querySelectorAll?.('.eve-mtrack-track[data-track-record-source="video"]') || []);
    const audioClips = Array.from(panel?.querySelectorAll?.('.eve-mtrack-clip[data-clip-kind="audio"], .eve-mtrack-clip.is-audio') || []);
    const videoClips = Array.from(panel?.querySelectorAll?.('.eve-mtrack-clip[data-clip-kind="video"], .eve-mtrack-clip.is-video') || []);
    const previewMedia = previewHost?.querySelector?.('canvas, video, img, svg, audio, [data-role="mtrax-gpu-overlay"]') || null;
    const parent = panel?.parentElement || null;
    const parentKind = String(parent?.dataset?.atomeKind || parent?.dataset?.kind || '').trim().toLowerCase();
    const mainToolbar = document.querySelector('[role="eve_intuitionx-main-ribbon"][data-variant="main"], [data-role="eve_intuitionx-main-ribbon"][data-variant="main"]');
    const panelRect = panel?.getBoundingClientRect?.() || null;
    const hostRect = parent?.getBoundingClientRect?.() || null;
    const toolbarRect = mainToolbar?.getBoundingClientRect?.() || null;
    const previewRect = preview?.getBoundingClientRect?.() || null;
    const splitterRect = previewSplitter?.getBoundingClientRect?.() || null;
    const scrollRect = scroll?.getBoundingClientRect?.() || null;
    const rootChildren = Array.from(panel?.children || []);
    const bodyIndex = rootChildren.indexOf(body);
    const toolsDockIndex = rootChildren.indexOf(toolsDock);
    const footerIndex = rootChildren.indexOf(footer);
    const rowsVisible = trackRows.filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).length;
    return {
        ok: true,
        panel: !!panel,
        parent_kind: parentKind,
        parent_atome_id: String(parent?.dataset?.atomeId || ''),
        header: !!header,
        body: !!body,
        footer: !!footer,
        tools_dock: !!toolsDock,
        tools_dock_above_footer: bodyIndex >= 0
            && toolsDockIndex > bodyIndex
            && footerIndex > toolsDockIndex
            && footerIndex === rootChildren.length - 1,
        close_button: !!closeButton,
        resize_grip: !!resizeGrip,
        preview: !!preview,
        preview_host: !!previewHost,
        preview_media: !!previewMedia,
        preview_splitter: !!previewSplitter,
        scroll: !!scroll,
        tracks: !!tracks,
        track_rows: trackRows.length,
        audio_track_rows: audioTrackRows.length,
        video_track_rows: videoTrackRows.length,
        rows_visible: rowsVisible,
        audio_clips: audioClips.length,
        video_clips: videoClips.length,
        panel_rect: panelRect ? {
            left: panelRect.left,
            top: panelRect.top,
            right: panelRect.right,
            bottom: panelRect.bottom,
            width: panelRect.width,
            height: panelRect.height
        } : null,
        host_rect: hostRect ? {
            left: hostRect.left,
            top: hostRect.top,
            right: hostRect.right,
            bottom: hostRect.bottom,
            width: hostRect.width,
            height: hostRect.height
        } : null,
        toolbar_rect: toolbarRect ? {
            left: toolbarRect.left,
            top: toolbarRect.top,
            right: toolbarRect.right,
            bottom: toolbarRect.bottom,
            width: toolbarRect.width,
            height: toolbarRect.height
        } : null,
        preview_rect: previewRect ? {
            left: previewRect.left,
            top: previewRect.top,
            right: previewRect.right,
            bottom: previewRect.bottom,
            width: previewRect.width,
            height: previewRect.height
        } : null,
        splitter_rect: splitterRect ? {
            left: splitterRect.left,
            top: splitterRect.top,
            right: splitterRect.right,
            bottom: splitterRect.bottom,
            width: splitterRect.width,
            height: splitterRect.height
        } : null,
        scroll_rect: scrollRect ? {
            left: scrollRect.left,
            top: scrollRect.top,
            right: scrollRect.right,
            bottom: scrollRect.bottom,
            width: scrollRect.width,
            height: scrollRect.height
        } : null,
        active_group_id: String(window.eveMtrackApi?.getState?.()?.activeGroupId || ''),
        chrome_order: {
            body: bodyIndex,
            tools_dock: toolsDockIndex,
            footer: footerIndex,
            child_count: rootChildren.length
        },
        data: panel ? { ...panel.dataset } : {}
    };
});

const dragElement = async (page, selector, dx, dy) => {
    const locator = page.locator(selector).first();
    const box = await locator.boundingBox({ timeout: 12000 });
    if (!box) return { ok: false, error: 'element_box_missing', selector };
    const startX = Math.round(box.x + (box.width / 2));
    const startY = Math.round(box.y + (box.height / 2));
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + Math.round(dx / 2), startY + Math.round(dy / 2), { steps: 6 });
    await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    return { ok: true };
};

const assertCheck = (report, name, passed, detail = null) => {
    const entry = { name, ok: passed === true, detail };
    report.checks.push(entry);
    if (!entry.ok) report.failures.push(entry);
    persistReport(report);
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        url: APP_URL,
        ok: false,
        checks: [],
        failures: [],
        steps: []
    };
    persistReport(report);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    await context.addInitScript(() => {
        window.__EVE_MTRACK_DEBUG__ = true;
        document.documentElement.dataset.eveDebugTestMode = 'true';
    });
    const page = await context.newPage();

    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle' });
        await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 25000);
        const project = await ensureProjectReady(page);
        report.steps.push({ step: 'project', project });
        assertCheck(report, 'project_ready', project?.ok === true && !!project?.project_id, project);
        if (!project?.ok) throw new Error(project?.error || 'project_not_ready');
        await safeEval(page, () => {
            window.close_mtrack_panel?.();
            window.__eveLastGroupTimelineTargetId = '';
            window.__selectedAtomeIds = [];
            return { ok: true };
        });
        await page.waitForTimeout(500);

        const target = await resolveOrCreateOpenTarget(page, project.project_id);
        report.steps.push({ step: 'target', target });
        assertCheck(report, 'open_target_available', target?.ok === true && !!target?.atome_id, target);
        if (!target?.ok || !target?.atome_id) throw new Error(target?.error || 'open_target_missing');

        const opened = await openMolecule(page, target);
        report.steps.push({ step: 'open', opened });
        assertCheck(report, 'molecule_open_invoked', opened?.ok !== false, opened);

        const panelReady = await waitFor(page, () => {
            const panel = document.getElementById('eve_mtrack_dialog');
            const state = window.eveMtrackApi?.getState?.() || null;
            if (!panel || !state?.activeGroupId) return false;
            const style = window.getComputedStyle(panel);
            const rect = panel.getBoundingClientRect();
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && rect.width > 100
                && rect.height > 100;
        }, 20000);
        assertCheck(report, 'panel_visible_after_open', panelReady.ok, panelReady);

        const mounted = await mountSyntheticTimeline(page);
        report.steps.push({ step: 'synthetic_timeline', mounted });
        assertCheck(report, 'synthetic_audio_video_timeline_mounted', mounted?.ok === true, mounted);
        await waitFor(page, () => document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-track').length >= 4, 12000);

        const initial = await readPanelState(page);
        report.initial = initial;
        const viewport = page.viewportSize();
        const toolbarTop = Number(initial.toolbar_rect?.top || viewport.height);
        const expectedToolbarTop = Math.round(toolbarTop);
        const expectedViewportWidth = Math.round(Number(viewport?.width || 0));
        assertCheck(report, 'canonical_chrome_present', initial.header && initial.body && initial.footer && initial.tools_dock, initial);
        assertCheck(report, 'canonical_tools_dock_above_footer', initial.tools_dock_above_footer === true, initial);
        assertCheck(report, 'canonical_close_and_resize_present', initial.close_button && initial.resize_grip, initial);
        assertCheck(report, 'preview_and_tracks_dom_order_present', initial.preview && initial.preview_host && initial.preview_splitter && initial.scroll && initial.tracks, initial);
        assertCheck(report, 'audio_and_video_tracks_visible', initial.track_rows >= 4 && initial.rows_visible >= 1 && initial.audio_track_rows > 0 && initial.video_track_rows > 0, initial);
        assertCheck(report, 'tracks_below_preview_splitter', (
            Number(initial.preview_rect?.bottom || 0) <= Number(initial.splitter_rect?.top || 0) + 1
            && Number(initial.splitter_rect?.bottom || 0) <= Number(initial.scroll_rect?.top || 0) + 1
        ), initial);
        assertCheck(report, 'panel_not_docked_into_media_atome', !['video', 'audio', 'sound', 'image', 'video_recording', 'audio_recording'].includes(initial.parent_kind), initial);
        assertCheck(report, 'initial_open_uses_exact_fullscreen_edges', (
            Math.round(Number(initial.host_rect?.left || 0)) === 0
            && Math.round(Number(initial.host_rect?.top || 0)) === 0
            && Math.round(Number(initial.host_rect?.right || 0)) === expectedViewportWidth
            && Math.round(Number(initial.host_rect?.bottom || 0)) === expectedToolbarTop
        ), { initial, toolbarTop, viewport });

        const beforeSplitter = await readPanelState(page);
        await dragElement(page, '#eve_mtrack_dialog__preview_tracks_splitter', 0, 72);
        const afterSplitterDown = await readPanelState(page);
        assertCheck(report, 'preview_tracks_splitter_gives_more_preview_without_moving_panel', (
            Number(afterSplitterDown.preview_rect?.height || 0) > Number(beforeSplitter.preview_rect?.height || 0) + 20
            && rectDelta(beforeSplitter.host_rect, afterSplitterDown.host_rect) <= 3
            && afterSplitterDown.rows_visible >= 1
        ), { before: beforeSplitter, after: afterSplitterDown });

        await dragElement(page, '#eve_mtrack_dialog__preview_tracks_splitter', 0, -96);
        const afterSplitterUp = await readPanelState(page);
        assertCheck(report, 'preview_tracks_splitter_gives_more_tracks_without_moving_panel', (
            Number(afterSplitterUp.preview_rect?.height || 0) < Number(afterSplitterDown.preview_rect?.height || 0) - 20
            && rectDelta(afterSplitterDown.host_rect, afterSplitterUp.host_rect) <= 3
            && afterSplitterUp.rows_visible >= 1
        ), { before: afterSplitterDown, after: afterSplitterUp });

        await dragElement(page, '#eve_mtrack_dialog__preview_tracks_splitter', 0, -420);
        const afterSplitterCompact = await readPanelState(page);
        const compactFloorIsUseful = Number(afterSplitterUp.rows_visible || 0) >= 4;
        assertCheck(report, 'preview_tracks_splitter_reaches_compact_preview_floor', (
            (
                compactFloorIsUseful
                    ? (
                        Number(afterSplitterCompact.preview_rect?.height || 0) <= 130
                        && (
                            Number(afterSplitterUp.preview_rect?.height || 0) <= 130
                            || Number(afterSplitterCompact.scroll_rect?.height || 0) > Number(afterSplitterUp.scroll_rect?.height || 0) + 80
                        )
                    )
                    : Number(afterSplitterCompact.scroll_rect?.height || 0) >= Number(afterSplitterUp.scroll_rect?.height || 0) - 3
            )
            && rectDelta(afterSplitterUp.host_rect, afterSplitterCompact.host_rect) <= 3
            && afterSplitterCompact.rows_visible >= 1
        ), { before: afterSplitterUp, after: afterSplitterCompact, compactFloorIsUseful });

        await page.locator('#eve_mtrack_dialog__footer').dblclick();
        await page.waitForTimeout(450);
        const restoredFromInitial = await readPanelState(page);
        assertCheck(report, 'footer_double_click_restores_initial_user_size', (
            Number(restoredFromInitial.host_rect?.width || 0) < Number(initial.host_rect?.width || 0) - 40
            || Number(restoredFromInitial.host_rect?.height || 0) < Number(initial.host_rect?.height || 0) - 40
        ), { initial, restored: restoredFromInitial });
        assertCheck(report, 'reduced_molecule_keeps_track_viewport_visible', (
            Number(restoredFromInitial.preview_rect?.height || 0) < Number(restoredFromInitial.host_rect?.height || 0) - 110
            && Number(restoredFromInitial.scroll_rect?.height || 0) >= 100
            && Number(restoredFromInitial.splitter_rect?.bottom || 0) <= Number(restoredFromInitial.scroll_rect?.top || 0) + 1
            && restoredFromInitial.rows_visible >= 1
        ), { restored: restoredFromInitial });

        const beforeHeaderDrag = await readPanelState(page);
        await dragElement(page, '#eve_mtrack_dialog__header', -110, 36);
        const afterHeaderDrag = await readPanelState(page);
        assertCheck(report, 'header_drag_moves_panel_and_preserves_size', (
            Math.abs(Number(afterHeaderDrag.host_rect?.left || 0) - Number(beforeHeaderDrag.host_rect?.left || 0)) > 20
            && Math.abs(Number(afterHeaderDrag.host_rect?.width || 0) - Number(beforeHeaderDrag.host_rect?.width || 0)) <= 3
            && Math.abs(Number(afterHeaderDrag.host_rect?.height || 0) - Number(beforeHeaderDrag.host_rect?.height || 0)) <= 3
            && Number(afterHeaderDrag.host_rect?.bottom || 0) <= toolbarTop + 1
        ), { before: beforeHeaderDrag, after: afterHeaderDrag, toolbarTop });

        const beforeGrip = await readPanelState(page);
        await dragElement(page, '#eve_mtrack_dialog [data-role="dialog-resize-grip"]', 180, 120);
        const afterGrip = await readPanelState(page);
        assertCheck(report, 'footer_resize_grip_resizes_complete_molecule', (
            Number(afterGrip.host_rect?.width || 0) > Number(beforeGrip.host_rect?.width || 0) + 40
            && Number(afterGrip.host_rect?.height || 0) > Number(beforeGrip.host_rect?.height || 0) + 40
            && Number(afterGrip.host_rect?.bottom || 0) <= toolbarTop + 1
        ), { before: beforeGrip, after: afterGrip, toolbarTop });

        await dragElement(page, '#eve_mtrack_dialog [data-role="dialog-resize-grip"]', -260, 0);
        const afterHorizontalShrink = await readPanelState(page);
        assertCheck(report, 'footer_resize_grip_allows_compact_horizontal_molecule', (
            Number(afterHorizontalShrink.host_rect?.width || 0) <= 340
            && Number(afterHorizontalShrink.host_rect?.width || 0) >= 300
            && Math.abs(Number(afterHorizontalShrink.host_rect?.height || 0) - Number(afterGrip.host_rect?.height || 0)) <= 3
            && Number(afterHorizontalShrink.host_rect?.right || 0) <= viewport.width
            && afterHorizontalShrink.rows_visible >= 1
        ), { before: afterGrip, after: afterHorizontalShrink, viewport });

        await dragElement(page, '#eve_mtrack_dialog__footer', 70, 40);
        const afterFooterDrag = await readPanelState(page);
        assertCheck(report, 'footer_drag_preserves_resized_size', (
            Math.abs(Number(afterFooterDrag.host_rect?.width || 0) - Number(afterHorizontalShrink.host_rect?.width || 0)) <= 3
            && Math.abs(Number(afterFooterDrag.host_rect?.height || 0) - Number(afterHorizontalShrink.host_rect?.height || 0)) <= 3
            && Number(afterFooterDrag.host_rect?.bottom || 0) <= toolbarTop + 1
        ), { resized: afterHorizontalShrink, after: afterFooterDrag, toolbarTop });

        await page.locator('#eve_mtrack_dialog__header').dblclick();
        await page.waitForTimeout(450);
        const afterHeaderDblClick = await readPanelState(page);
        assertCheck(report, 'header_double_click_enters_exact_fullscreen_edges', (
            Math.round(Number(afterHeaderDblClick.host_rect?.left || 0)) === 0
            && Math.round(Number(afterHeaderDblClick.host_rect?.top || 0)) === 0
            && Math.round(Number(afterHeaderDblClick.host_rect?.right || 0)) === expectedViewportWidth
            && Math.round(Number(afterHeaderDblClick.host_rect?.bottom || 0)) === expectedToolbarTop
            && Number(afterHeaderDblClick.host_rect?.height || 0) > Number(afterFooterDrag.host_rect?.height || 0) + 40
        ), { before: afterFooterDrag, after: afterHeaderDblClick, toolbarTop });

        await page.setViewportSize({ width: 1180, height: 760 });
        await page.waitForTimeout(450);
        const afterFullscreenViewportResize = await readPanelState(page);
        const resizedToolbarTop = Math.round(Number(afterFullscreenViewportResize.toolbar_rect?.top || 760));
        assertCheck(report, 'fullscreen_molecule_follows_webview_resize', (
            Math.round(Number(afterFullscreenViewportResize.host_rect?.left || 0)) === 0
            && Math.round(Number(afterFullscreenViewportResize.host_rect?.top || 0)) === 0
            && Math.round(Number(afterFullscreenViewportResize.host_rect?.right || 0)) === 1180
            && Math.round(Number(afterFullscreenViewportResize.host_rect?.bottom || 0)) === resizedToolbarTop
        ), { before: afterHeaderDblClick, after: afterFullscreenViewportResize, resizedToolbarTop });

        await dragElement(page, '#eve_mtrack_dialog__header', 90, 42);
        const afterFullscreenDragRestore = await readPanelState(page);
        assertCheck(report, 'dragging_fullscreen_molecule_restores_user_size_before_move', (
            Math.abs(Number(afterFullscreenDragRestore.host_rect?.width || 0) - Number(afterFooterDrag.host_rect?.width || 0)) <= 4
            && Math.abs(Number(afterFullscreenDragRestore.host_rect?.height || 0) - Number(afterFooterDrag.host_rect?.height || 0)) <= 4
            && Math.abs(Number(afterFullscreenDragRestore.host_rect?.left || 0) - Number(afterFooterDrag.host_rect?.left || 0)) > 20
            && Number(afterFullscreenDragRestore.host_rect?.bottom || 0) <= Number(afterFullscreenDragRestore.toolbar_rect?.top || 0) + 1
        ), { before: afterFullscreenViewportResize, restored: afterFooterDrag, after: afterFullscreenDragRestore });

        await page.locator('#eve_mtrack_dialog__header').dblclick();
        await page.waitForTimeout(450);
        await page.locator('#eve_mtrack_dialog__footer').dblclick();
        await page.waitForTimeout(450);
        const afterFooterDblClick = await readPanelState(page);
        assertCheck(report, 'footer_double_click_restores_user_size', (
            Math.abs(Number(afterFullscreenDragRestore.host_rect?.width || 0) - Number(afterFooterDblClick.host_rect?.width || 0)) <= 4
            && Math.abs(Number(afterFullscreenDragRestore.host_rect?.height || 0) - Number(afterFooterDblClick.host_rect?.height || 0)) <= 4
            && Number(afterFooterDblClick.host_rect?.bottom || 0) <= Number(afterFooterDblClick.toolbar_rect?.top || 0) + 1
        ), {
            expected: afterFullscreenDragRestore,
            after: afterFooterDblClick
        });

        await page.setViewportSize({ width: 1320, height: 840 });
        await page.waitForTimeout(450);
        const afterRestoredViewportResize = await readPanelState(page);
        assertCheck(report, 'restored_molecule_does_not_follow_webview_resize', (
            Math.abs(Number(afterFooterDblClick.host_rect?.width || 0) - Number(afterRestoredViewportResize.host_rect?.width || 0)) <= 4
            && Math.abs(Number(afterFooterDblClick.host_rect?.height || 0) - Number(afterRestoredViewportResize.host_rect?.height || 0)) <= 4
        ), {
            expected: afterFooterDblClick,
            after: afterRestoredViewportResize
        });

        const toolDoubleClickResult = await safeEval(page, () => {
            const tool = document.querySelector(
                '#eve_mtrack_dialog__tools_dock [data-role="eve_intuitionx-tool-host"], '
                + '#eve_mtrack_dialog__tools_dock .tool, '
                + '#eve_mtrack_dialog__tools_dock button, '
                + '#eve_mtrack_dialog__tools_dock [role="button"]'
            );
            if (!(tool instanceof HTMLElement)) return { ok: false, error: 'tool_target_missing' };
            tool.dispatchEvent(new MouseEvent('dblclick', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
            return {
                ok: true,
                tag: tool.tagName,
                role: String(tool.dataset?.role || tool.getAttribute('role') || ''),
                class_name: String(tool.className || '')
            };
        });
        assertCheck(report, 'tool_double_click_target_available', toolDoubleClickResult?.ok === true, toolDoubleClickResult);
        await page.waitForTimeout(250);
        const afterToolDblClick = await readPanelState(page);
        assertCheck(report, 'tool_double_click_does_not_toggle_fullscreen', (
            rectDelta(afterFooterDblClick.host_rect, afterToolDblClick.host_rect) <= 4
            && String(afterToolDblClick.data?.eveDialogFullscreen || '') !== 'true'
        ), { before: afterFooterDblClick, after: afterToolDblClick, target: toolDoubleClickResult });

        await page.locator('#eve_mtrack_dialog__body').dblclick({ position: { x: 24, y: 24 } });
        await page.waitForTimeout(250);
        const afterBodyDblClick = await readPanelState(page);
        assertCheck(report, 'body_double_click_does_not_toggle_fullscreen', (
            rectDelta(afterToolDblClick.host_rect, afterBodyDblClick.host_rect) <= 4
            && String(afterBodyDblClick.data?.eveDialogFullscreen || '') !== 'true'
        ), { before: afterToolDblClick, after: afterBodyDblClick });

        await page.locator('#eve_mtrack_dialog__close, #eve_mtrack_dialog [data-eve-panel-close="true"]').first().click({ timeout: 12000 });
        assertCheck(report, 'close_button_click_invoked', true, { ok: true });
        const closed = await waitFor(page, () => {
            const panel = document.getElementById('eve_mtrack_dialog');
            if (!panel) return true;
            const style = window.getComputedStyle(panel);
            return style.display === 'none' || style.visibility === 'hidden' || !panel.isConnected;
        }, 12000);
        assertCheck(report, 'close_button_closes_panel', closed.ok, closed);

        report.ok = report.failures.length === 0;
        persistReport(report);
        if (!report.ok) process.exit(1);
    } catch (error) {
        report.error = error?.message || String(error || 'probe_failed');
        report.ok = false;
        persistReport(report);
        process.exit(1);
    } finally {
        await browser.close();
    }
};

await run();
