import fs from 'node:fs';
import path from 'node:path';

export const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
export const OUT_DIR = path.resolve('temp/probe_reports/dashboard_workspace_stress');

fs.mkdirSync(OUT_DIR, { recursive: true });

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const isOk = (value) => value === true || value?.ok === true;
export const nowId = () => Date.now().toString(36);

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
        bevyUiMenuIds: records
            .map((record) => String(record?.id || ''))
            .filter((id) => id.startsWith('__eve_bevy_ui_eve_bevy_ui_main_menu_')),
        virtualIds: nodes.map((node) => String(node.id || '')),
        nodeKinds: nodes.map((node) => ({ id: String(node.id || ''), kind: String(node.kind || '') })),
        bevySkipped: (bevy?.skipped_nodes || []).map((node) => ({ id: String(node.id || ''), error: node.error || '' })),
        bevyDeferred: (bevy?.deferred_nodes || []).map((node) => ({ id: String(node.id || ''), kind: String(node.kind || '') })),
        bevyResolved: bevy?.resolved_deferred_nodes || [],
        canvasCount: document.querySelectorAll('canvas#eve_surface_project').length,
        atomeDomCount: document.querySelectorAll('[id^="eve-atome_"]').length
    };
}, projectId);
