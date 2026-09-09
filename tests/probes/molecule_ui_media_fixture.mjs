import fs from 'node:fs';
import path from 'node:path';

import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, visibleMenuTool, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";


import { clickCanvasRect } from "./dashboard_workspace_stress/support.mjs";


export const FIXTURES = Object.freeze({
    video: path.resolve(process.env.MOLECULE_UI_VIDEO_FIXTURE || "tests/fixtures/media/Jeezs's fire.m4v"),
    audio: path.resolve('tests/fixtures/media/test.m4a'),
    image: path.resolve('tests/fixtures/media/0000.png'),
    secondAudio: path.resolve('temp/molecule_layered_second_audio.wav')
});

export const writeToneWav = (filePath, { seconds = 2, frequency = 660, sampleRate = 48000 } = {}) => {
    const sampleCount = Math.round(seconds * sampleRate);
    const payloadBytes = sampleCount * 2;
    const wav = Buffer.alloc(44 + payloadBytes);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + payloadBytes, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22); wav.writeUInt32LE(sampleRate, 24);
    wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(payloadBytes, 40);
    for (let index = 0; index < sampleCount; index += 1) {
        const envelope = Math.min(1, index / 480) * Math.min(1, (sampleCount - index) / 480);
        wav.writeInt16LE(Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * envelope * 12000), 44 + index * 2);
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, wav);
    return filePath;
};

export const readRecords = (page, projectId) => page.evaluate((pid) => (
    (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).map((record) => ({
        id: String(record.id || record.atome_id || ''),
        type: String(record.type || record.atome_type || ''),
        kind: String(record.kind || record.properties?.kind || record.properties?.media_kind || ''),
        parent_id: String(record.parent_id || record.properties?.parent_id || record.meta?.parent_id || ''),
        properties: record.properties || record.props || {}
    }))
), projectId);

export const dismissMainPalette = async (page, projectId) => {
    const activeKey = await page.evaluate(async () => {
        const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        return String(registry.getMainMenuRuntime()?.measure?.().activePaletteKey || '');
    });
    if (!activeKey) return;
    await clickCanvasTarget(page, await visibleMenuTool(page, projectId, activeKey));
    await waitFor(page, async () => {
        const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const measure = registry.getMainMenuRuntime()?.measure?.() || {};
        return { ok: !measure.activePaletteKey && measure.paletteMotionActive === false, measure };
    });
};

export const importThroughMenu = async ({ page, projectId, filePath, expectedKind }) => {
    const before = new Set((await readRecords(page, projectId)).map((record) => record.id));
    await dismissMainPalette(page, projectId);
    await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'capture'));
    await waitFor(page, async () => {
        const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const measure = registry.getMainMenuRuntime()?.measure?.() || {};
        return { ok: measure.activePaletteKey === 'capture' && measure.paletteMotionActive === false, measure };
    });
    const importTool = await visibleMenuTool(page, projectId, 'import');
    const chooserPromise = page.waitForEvent('filechooser');
    await clickCanvasTarget(page, importTool);
    const chooser = await chooserPromise;
    await chooser.setFiles(filePath);
    const imported = await waitFor(page, async ({ pid, known, kind }) => {
        const normalize = (value) => String(value || '').toLowerCase();
        const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
        const record = records.find((entry) => {
            const id = String(entry.id || entry.atome_id || '');
            const properties = entry.properties || entry.props || {};
            const value = normalize(properties.kind || properties.media_kind || entry.kind || entry.type);
            return id && !id.startsWith('__eve_') && !known.includes(id)
                && (value.includes(kind) || (kind === 'audio' && value.includes('sound')));
        });
        return { ok: Boolean(record), id: String(record?.id || record?.atome_id || ''), record: record || null };
    }, { pid: projectId, known: [...before], kind: expectedKind }, 45000);
    await waitForStableScene(page, projectId);
    return imported.id;
};

export const createTextThroughMenu = async ({ page, projectId, value, point }) => {
    const before = new Set((await readRecords(page, projectId)).map((record) => record.id));
    await dismissMainPalette(page, projectId);
    await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'create'));
    await waitFor(page, async () => {
        const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const measure = registry.getMainMenuRuntime()?.measure?.() || {};
        return { ok: measure.activePaletteKey === 'create' && measure.paletteMotionActive === false, measure };
    });
    const textToolActive = await page.evaluate(() => window.__eveTextTool?.isActive?.() === true);
    if (!textToolActive) {
        await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'text_create'));
    }
    await waitFor(page, () => ({
        ok: window.__eveTextTool?.isActive?.() === true,
        textTool: window.__eveTextTool?.isActive?.() === true
    }));
    await clickCanvasTarget(page, point);
    const editor = page.locator('#eve_hidden_text_service [data-role="active-text-editor"]');
    await editor.waitFor({ state: 'attached', timeout: 10000 });
    await editor.pressSequentially(value, { delay: 18 });
    await waitFor(page, (expected) => ({
        ok: document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]')?.value === expected,
        value: document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]')?.value || ''
    }), value);
    // Move focus with a real keyboard gesture. Blur is the canonical text-edit
    // commit boundary and removes the single hidden editor without another
    // canvas click (which would create a second text while the latch is active).
    await editor.press('Tab');
    await waitFor(page, () => ({
        ok: !document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]'),
        editor: Boolean(document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]'))
    }));
    // Text is a latch. Toggle the same real BevyUI tool off to commit and close
    // the canonical editor; clicking the canvas again would create a second Atome.
    await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'text_create'));
    await waitFor(page, async () => {
        const textState = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
        const activeEdit = textState.getActiveProjectTextEdit();
        return {
            ok: window.__eveTextTool?.isActive?.() !== true
                && !document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]')
                && !activeEdit,
            active: window.__eveTextTool?.isActive?.() === true,
            editor: Boolean(document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]')),
            activeEdit
        };
    });
    const created = await waitFor(page, async ({ pid, known, text }) => {
        const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
        const record = records.find((entry) => {
            const id = String(entry.id || entry.atome_id || '');
            const props = entry.properties || entry.props || {};
            return !known.includes(id) && String(props.text || entry.text || '').includes(text);
        });
        return { ok: Boolean(record), id: String(record?.id || record?.atome_id || '') };
    }, { pid: projectId, known: [...before], text: value });
    await waitForStableScene(page, projectId);
    return created.id;
};

export const reloadBrowserProject = async (page, project) => {
    await page.reload({ waitUntil: 'commit', timeout: 45000 });
    await waitFor(page, () => ({
        ok: !!window.AdoleAPI
            && window.__authCheckComplete === true
            && typeof window.eveToolBase?.ensureProjectLayer === 'function'
            && !!document.getElementById('eve_surface_project')
            && (!!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition')),
        adole: !!window.AdoleAPI,
        auth: window.__authCheckComplete === true,
        toolBase: typeof window.eveToolBase?.ensureProjectLayer === 'function',
        surface: !!document.getElementById('eve_surface_project'),
        intuition: !!document.getElementById('intuition')
    }), null, 45000);
    const projectIsOpen = (projectId) => (
        window.__currentProject?.id === projectId
        && window.eveDashboardBevyUiRuntime?.state?.active !== true
        && window.__eveWorkspaceMode?.mode === 'project'
    );
    const restoredRoute = await waitFor(page, (projectId) => {
        const opened = window.__currentProject?.id === projectId
            && window.eveDashboardBevyUiRuntime?.state?.active !== true
            && window.__eveWorkspaceMode?.mode === 'project';
        const dashboard = window.eveDashboardBevyUiRuntime?.state || {};
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'dashboard_bevy_ui');
        const headerReady = (tree?.interactiveNodes || []).some((entry) => (
            String(entry?.id || entry) === '__eve_dashboard_header_bg_projects'
        ));
        return {
            ok: opened || (dashboard.active === true && tree?.suspended !== true && headerReady),
            opened, dashboardActive: dashboard.active === true,
            activeCategoryId: dashboard.activeCategoryId || '',
            treeSuspended: tree?.suspended === true, headerReady,
            currentProjectId: window.__currentProject?.id || '',
            workspaceMode: window.__eveWorkspaceMode?.mode || ''
        };
    }, project.id, 60000);
    let opened = restoredRoute.opened === true;
    if (!opened) {
        let projectsFocused = false;
        for (let attempt = 0; attempt < 3 && !projectsFocused; attempt += 1) {
            opened = await page.evaluate(projectIsOpen, project.id);
            if (opened) break;
            const projectsHeader = await awaitBevyUiNodeTarget(page, {
                nodeId: '__eve_dashboard_header_bg_projects',
                treeId: 'dashboard_bevy_ui', step: 2
            }, { timeoutMs: 15000, intervalMs: 200 });
            if (!projectsHeader) {
                opened = await page.evaluate(projectIsOpen, project.id);
                if (opened) break;
                assert(projectsHeader, 'layered_reload_projects_header_not_actionable');
            }
            await clickCanvasTarget(page, projectsHeader);
            projectsFocused = await waitFor(page, () => ({
                ok: window.eveDashboardBevyUiRuntime?.state?.activeCategoryId === 'projects'
                    && !window.eveDashboardBevyUiRuntime?.state?.focusTransition,
                activeCategoryId: window.eveDashboardBevyUiRuntime?.state?.activeCategoryId || '',
                focusTransition: window.eveDashboardBevyUiRuntime?.state?.focusTransition || null
            }), null, 8000).then(() => true).catch(() => false);
            if (!projectsFocused) await wait(300);
        }
        if (!opened) {
            assert(projectsFocused, 'layered_reload_projects_focus_failed');
            const card = await waitFor(page, (projectId) => {
                const dashboard = window.eveDashboardBevyUiRuntime?.state || {};
                const item = (dashboard.layout?.lanes || []).flatMap((lane) => lane.visible_item_rects || [])
                    .find((entry) => String(entry?.item?.id || '') === String(projectId));
                return {
                    ok: dashboard.active === true && !!(item?.card_rect || item?.rect),
                    active: dashboard.active === true,
                    rect: item?.card_rect || item?.rect || null
                };
            }, project.id, 45000);
            for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
                await clickCanvasRect(page, card.rect);
                opened = await waitFor(page, (projectId) => ({
                    ok: window.__currentProject?.id === projectId
                        && window.eveDashboardBevyUiRuntime?.state?.active !== true
                        && window.__eveWorkspaceMode?.mode === 'project',
                    current: window.__currentProject?.id || '',
                    dashboard: window.eveDashboardBevyUiRuntime?.state?.active === true,
                    workspaceMode: window.__eveWorkspaceMode?.mode || '',
                    workspaceProjectId: window.__eveWorkspaceMode?.projectId || ''
                }), project.id, 8000).then(() => true).catch(() => false);
                if (!opened) await wait(300);
            }
        }
    }
    assert(opened, `layered_reload_project_open_failed:${project.id}`);
    await waitForStableScene(page, project.id);
    await waitFor(page, async () => {
        const [{ getMainMenuRuntime }, { getAtomeContextualEditApi }] = await Promise.all([
            import('/eVe/intuition/ribbon/bevy_ui_product_registry.js'),
            import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js')
        ]);
        const menu = getMainMenuRuntime()?.measure?.() || {};
        const contextual = getAtomeContextualEditApi()?.readState?.() || {};
        return {
            ok: menu.active === true && menu.treeMounted === true && contextual.suspended !== true,
            menu, contextual,
            workspace: window.__eveWorkspaceMode || null,
            dashboard: window.eveDashboardBevyUiRuntime?.state || null
        };
    }, null, 15000);
    await waitFor(page, async (projectId) => {
        const [{ getRenderSurfaceState }, projectScenes] = await Promise.all([
            import('/eVe/domains/rendering/surface_runtime.js'),
            import('/eVe/domains/rendering/project_scene_state.js')
        ]);
        const records = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
        const canonicalIds = records.map((record) => String(record.id || record.atome_id || ''))
            .filter((id) => id && !id.startsWith('__eve_'));
        const scene = getRenderSurfaceState(document.getElementById('eve_surface_project'))?.scene || null;
        const projectedIds = new Set([
            ...(Array.isArray(scene?.atoms) ? scene.atoms : []),
            ...(Array.isArray(scene?.nodes) ? scene.nodes : [])
        ].map((entry) => String(entry?.id || '')));
        const projectedCanonicalIds = canonicalIds.filter((id) => scene?.byId?.has?.(id) || projectedIds.has(id));
        const runtime = projectScenes.PROJECT_SCENES.get(String(projectId)) || null;
        return {
            ok: canonicalIds.length > 0 && projectedCanonicalIds.length > 0
                && runtime?.projection?.ok === true
                && projectScenes.sceneState.foregroundProjectId === String(projectId)
                && projectScenes.sceneState.surfaceOwnerProjectId === String(projectId),
            canonicalIds,
            projectedCanonicalIds,
            projectionOk: runtime?.projection?.ok === true,
            projectionError: String(runtime?.projection?.render_result?.error || ''),
            foregroundProjectId: String(projectScenes.sceneState.foregroundProjectId || ''),
            surfaceOwnerProjectId: String(projectScenes.sceneState.surfaceOwnerProjectId || ''),
            sceneId: String(scene?.id || ''),
            surfaceSize: [
                Number(document.getElementById('eve_surface_project')?.width || 0),
                Number(document.getElementById('eve_surface_project')?.height || 0)
            ]
        };
    }, project.id, 30000);
};

