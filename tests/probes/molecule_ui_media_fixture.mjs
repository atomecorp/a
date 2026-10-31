import fs from 'node:fs';
import path from 'node:path';

import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, visibleMenuTool, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";
import { awaitMysticItemTarget } from './molecule_ui_mystic_target.mjs';

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

// Mystic items of the open menu, by key (`..._item_<key>_<n>`).
const mysticItemTargets = (page) => page.evaluate(() => {
    const tree = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_ui_mystic')?.tree || null;
    const ids = [];
    const visit = (node) => { if (!node || typeof node !== 'object') return; ids.push(String(node.id || '')); (node.children || []).forEach(visit); };
    visit(tree?.root);
    return ids.filter((id) => /_item_[a-z_]+?_\d+$/.test(id));
});

// Opens the project's Mystic on an empty spot of the Natural surface: the first
// candidate point that neither a BevyUI node nor an Atome claims.
const openBackgroundMystic = async (page, projectId) => {
    const candidates = await page.evaluate(async (pid) => {
        const surface = document.getElementById('eve_surface_project');
        const rect = surface?.getBoundingClientRect?.();
        if (!rect) return [];
        const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
        const fractions = [[0.5, 0.18], [0.18, 0.5], [0.82, 0.5], [0.5, 0.82], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75], [0.5, 0.5]];
        return fractions.map(([fx, fy]) => ({ x: rect.x + rect.width * fx, y: rect.y + rect.height * fy }))
            .filter((point) => !window.eveBevyUiRuntime?.hitTestAtClientPoint?.({ surface, clientX: point.x, clientY: point.y }))
            .filter((point) => !records.some((record) => {
                const id = String(record.id || '');
                const box = record.bounds || record.clientBounds || null;
                return !id.startsWith('__eve_') && box && point.x >= box.x && point.x <= box.x + box.width
                    && point.y >= box.y && point.y <= box.y + box.height;
            }));
    }, projectId);
    const tried = [];
    for (const point of candidates) {
        await page.mouse.click(point.x, point.y, { button: 'right' });
        const opened = await waitFor(page, async () => {
            const mystic = await import('/eVe/intuition/mystic/index.js');
            return { ok: mystic.isMysticMenuOpen?.() === true };
        }, null, 4000).catch(() => ({ ok: false }));
        const ids = opened.ok ? await mysticItemTargets(page) : [];
        const importTarget = opened.ok ? await awaitMysticItemTarget(page, 'import', { timeoutMs: 4000 })
            .catch(() => null) : null;
        if (importTarget) return importTarget.id;
        tried.push({ point, ids });
        await page.evaluate(async () => (await import('/eVe/intuition/mystic/index.js')).closeMysticMenu?.());
    }
    throw new Error(`background_mystic_import_missing:${JSON.stringify(tried)}`);
};

// Import is the project's `import` command (Mystic, project rail), which opens
// the Media panel; files from the disk enter through its single external door
// (`media_import_system`). The Capture palette only records.
export const importThroughMenu = async ({ page, projectId, filePath, expectedKind }) => {
    const before = new Set((await readRecords(page, projectId)).map((record) => record.id));
    await dismissMainPalette(page, projectId);
    // Prepare the project's context, independently of the previously imported
    // Atome's contextual rail; the import itself still uses real menu gestures.
    await page.evaluate(async () => (await import('/eVe/intuition/runtime/selection.js')).clearAllSelection());
    await waitFor(page, async () => {
        const ids = (await import('/eVe/intuition/runtime/selection.js')).getCurrentSelectionIds();
        return { ok: ids.length === 0, ids };
    });
    const importItemId = await openBackgroundMystic(page, projectId);
    const importItem = await awaitBevyUiNodeTarget(page, { nodeId: importItemId, treeId: 'eve_bevy_ui_mystic' });
    assert(importItem, `mystic_import_item_not_actionable:${importItemId}`);
    await clickCanvasTarget(page, importItem);
    const external = await awaitBevyUiNodeTarget(page, { nodeId: 'eve_bevy_panel_media_footer_media_import_system', treeId: 'eve_bevy_panel_media' });
    if (!external) {
        const snapshot = await page.evaluate(async () => {
            const trees = window.eveBevyUiRuntime?.state?.trees;
            const ids = [];
            const visit = node => { if (!node) return; if (/media|footer/.test(String(node.id))) ids.push(String(node.id)); (node.children || []).forEach(visit); };
            for (const entry of trees?.values?.() || []) visit(entry.tree?.root);
            const { readMediaPanelHost } = await import('/eVe/intuition/tools/media_panel_host.js');
            const { bevyPanelRuntimeState } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js');
            const { isPanelSurfaceOpen } = await import('/eVe/intuition/runtime/panel_api.js');
            return { trees: [...(trees?.keys?.() || [])], ids, workspace: window.__eveWorkspaceMode,
                dashboardMediaHostRegistered: !!readMediaPanelHost(), mountedPanels: [...bevyPanelRuntimeState.mounted.keys()],
                panelApiOpen: isPanelSurfaceOpen('media'),
                routing: (window.atome?.tools?.gatewayRoutingLog || []).filter(entry => entry.tool_id === 'ui.media.panel').slice(-12),
                media: window.__eveMedia?.readState?.() };
        });
        const directory = path.resolve('temp/probe_reports/media_import_diagnostics');
        fs.mkdirSync(directory, { recursive: true });
        const screenshot = path.join(directory, `missing_external_${Date.now()}.png`);
        await page.screenshot({ path: screenshot });
        throw new Error(`media_panel_external_door_missing:${JSON.stringify({ ...snapshot, screenshot })}`);
    }
    // What the import did, for the failure message: requests and console.
    const trail = [];
    const onResponse = (response) => { if (!/\.(js|mjs|css|png|svg|wasm|json)(\?|$)/.test(response.url())) trail.push(`${response.status()} ${response.request().method()} ${response.url().slice(-90)}`); };
    const onFailed = (request) => trail.push(`FAILED ${request.method()} ${request.url().slice(-90)} ${request.failure()?.errorText || ''}`);
    const onConsole = (message) => trail.push(`console.${message.type()} ${message.text().slice(0, 160)}`);
    page.on('response', onResponse); page.on('requestfailed', onFailed); page.on('console', onConsole);
    const chooserPromise = page.waitForEvent('filechooser');
    await clickCanvasTarget(page, external);
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
        const fresh = records.filter((entry) => !known.includes(String(entry.id || entry.atome_id || ''))
            && !String(entry.id || '').startsWith('__eve_'))
            .map((entry) => ({ id: entry.id, type: entry.type, kind: (entry.properties || entry.props || {}).kind }));
        return { ok: Boolean(record), id: String(record?.id || record?.atome_id || ''), record: record || null,
            fresh: fresh.slice(0, 8), media_open: Boolean(window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_panel_media')),
            sw_controlled: Boolean(navigator.serviceWorker?.controller), offline_events: window.__probeOfflineEvents || [],
            sw_registration: await navigator.serviceWorker?.getRegistration?.().then((registration) => registration ? {
                installing: registration.installing?.state || null, waiting: registration.waiting?.state || null, active: registration.active?.state || null
            } : 'none').catch((error) => String(error)) };
    }, { pid: projectId, known: [...before], kind: expectedKind }, 45000).catch(async (error) => {
        const mediaState = await page.evaluate(() => window.__eveMedia?.readState?.());
        const directory = path.resolve('temp/probe_reports/media_import_diagnostics');
        fs.mkdirSync(directory, { recursive: true });
        const screenshot = path.join(directory, `import_timeout_${Date.now()}.png`);
        await page.screenshot({ path: screenshot });
        throw new Error(`${error.message}:media:${JSON.stringify(mediaState)}:screenshot:${screenshot}:trail:${JSON.stringify(trail.slice(-40))}`);
    }).finally(() => {
        page.off('response', onResponse); page.off('requestfailed', onFailed); page.off('console', onConsole);
    });
    await waitFor(page, async () => ({
        ok: !(await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_runtime.js')).bevyPanelRuntimeState.mounted.has('media')
    }));
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
    // Text is a latch. Toggle it off to commit and close the canonical editor;
    // clicking the canvas again would create a second Atome. Once chosen, the
    // latched Text is shown by its palette slot, Create, which turns it off (R4).
    if (await page.evaluate(() => window.__eveTextTool?.isActive?.() === true)) {
        await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'create'));
    }
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
    // A start presents the eVe home whatever the last surface (durable home startup, 2026-10-16):
    // the project is reopened through the canonical `ui.project.open`, as workspace_scene_restoration.js does.
    await waitFor(page, () => ({ ok: ['dashboard', 'project'].includes(window.__eveWorkspaceMode?.mode) }), null, 60000);
    const reopen = await page.evaluate(async (projectId) => {
        if (window.__eveWorkspaceMode?.mode === 'project' && window.__currentProject?.id === projectId) return { ok: true, already: true };
        const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
        return invokeToolGateway({ tool_id: 'ui.project.open', action: 'pointer.click', input: { project_id: projectId }, source: { type: 'ui', layer: 'probe_reload' } });
    }, project.id);
    assert(reopen?.ok === true, `layered_reload_project_open_refused:${project.id}:${reopen?.error || ''}`);
    const opened = await waitFor(page, (projectId) => ({
        ok: window.__currentProject?.id === projectId && window.__eveWorkspaceMode?.mode === 'project',
        currentProjectId: window.__currentProject?.id || '',
        workspaceMode: window.__eveWorkspaceMode?.mode || ''
    }), project.id, 60000).then(() => true).catch(() => false);
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
            workspace: window.__eveWorkspaceMode || null
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
