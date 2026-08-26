import fs from 'node:fs';
import path from 'node:path';

import {
    assert, awaitBevyUiNodeTarget, clickCanvasTarget, diffPng, diffPngRegion, recordCenter,
    playwrightPointForClientTarget, visibleMenuTool, wait, waitFor, waitForStableScene
} from './molecule_ui_acceptance_support.mjs';
import {
    drag, screenshot, structuredDropTarget, switchView
} from './molecule_ui_drop_core.mjs';
import {
    chooseMoleculePlaybackMode, contextualTool, disarmMemberPlayback, expandCanonicalListMolecule,
    listNode, memberPlayTool, moleculePlayTool, playbackSnapshot, selectListRow, startMoleculePlayback,
    structuredRows, waitForContextualTarget, waitForPlaybackEnd
} from './molecule_ui_drop_playback_support.mjs';
import { clickCanvasRect } from './dashboard_workspace_stress/support.mjs';

const FIXTURES = Object.freeze({
    video: path.resolve("tests/fixtures/media/Jeezs's fire.m4v"),
    audio: path.resolve('tests/fixtures/media/test.m4a'),
    image: path.resolve('tests/fixtures/media/0000.png'),
    secondAudio: path.resolve('temp/molecule_layered_second_audio.wav')
});

const writeToneWav = (filePath, { seconds = 2, frequency = 660, sampleRate = 48000 } = {}) => {
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

const readRecords = (page, projectId) => page.evaluate((pid) => (
    (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).map((record) => ({
        id: String(record.id || record.atome_id || ''),
        type: String(record.type || record.atome_type || ''),
        kind: String(record.kind || record.properties?.kind || record.properties?.media_kind || ''),
        parent_id: String(record.parent_id || record.properties?.parent_id || record.meta?.parent_id || ''),
        properties: record.properties || record.props || {}
    }))
), projectId);

const dismissMainPalette = async (page, projectId) => {
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

const importThroughMenu = async ({ page, projectId, filePath, expectedKind }) => {
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

const createTextThroughMenu = async ({ page, projectId, value, point }) => {
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

const reloadBrowserProject = async (page, project) => {
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

const readMolecule = async (page, ids) => page.evaluate(async (memberIds) => {
    const states = await Promise.all(memberIds.map((id) => window.Atome.getStateCurrent(id)));
    const parent = (state) => String(state?.parent_id || state?.parentId || state?.properties?.parent_id
        || state?.props?.parent_id || state?.meta?.parent_id || '');
    const parents = states.map(parent);
    const moleculeId = parents.find(Boolean) || '';
    const molecule = moleculeId ? await window.Atome.getStateCurrent(moleculeId) : null;
    const timeline = molecule?.molecule_timeline || molecule?.properties?.molecule_timeline
        || molecule?.props?.molecule_timeline || null;
    return {
        moleculeId, parents, states, timeline,
        canvasCount: document.querySelectorAll('canvas#eve_surface_project').length,
        authoritativeDomCount: document.querySelectorAll('[id^="eve-atome_"]').length
    };
}, ids);

const assertMembership = (snapshot, expectedIds, expectedMoleculeId = '') => {
    assert(snapshot.moleculeId, 'layered_molecule_owner_missing');
    if (expectedMoleculeId) assert(snapshot.moleculeId === expectedMoleculeId,
        `layered_molecule_owner_changed:${snapshot.moleculeId}:${expectedMoleculeId}`);
    assert(snapshot.parents.every((id) => id === snapshot.moleculeId),
        `layered_member_parent_mismatch:${JSON.stringify(snapshot.parents)}`);
    assert(snapshot.timeline?.schema_version === 2, `layered_schema:${snapshot.timeline?.schema_version}`);
    assert(snapshot.timeline?.clips?.length === expectedIds.length,
        `layered_clip_count:${snapshot.timeline?.clips?.length}:${expectedIds.length}`);
    assert(new Set(snapshot.timeline.clips.map((clip) => String(clip.track_id || ''))).size === expectedIds.length,
        `layered_member_track_count:${JSON.stringify(snapshot.timeline.tracks)}`);
    assert(snapshot.timeline.clips.every((clip) => Number(clip.timeline?.start_frame || 0) === 0),
        'layered_clip_not_at_zero');
    assert(snapshot.canvasCount === 1 && snapshot.authoritativeDomCount === 0,
        `layered_architecture:${snapshot.canvasCount}:${snapshot.authoritativeDomCount}`);
};

const absorbMember = async ({
    page, project, sourceId, targetId, report, outDir, shotName, destinationOffset = null
}) => {
    const beforeParents = await page.evaluate(async ({ source, target }) => {
        const parent = (state) => String(state?.parent_id || state?.parentId
            || state?.properties?.parent_id || state?.props?.parent_id || state?.meta?.parent_id || '');
        const [sourceState, targetState] = await Promise.all([
            window.Atome.getStateCurrent(source), window.Atome.getStateCurrent(target)
        ]);
        return { source: parent(sourceState), target: parent(targetState) };
    }, { source: sourceId, target: targetId });
    const source = await recordCenter(page, project.id, (record) => record.id === sourceId, { sceneCoordinates: true });
    const target = await recordCenter(page, project.id, (record) => record.id === targetId, { sceneCoordinates: true });
    const destination = destinationOffset && typeof destinationOffset === 'object'
        ? {
            ...target,
            x: target.x + Number(destinationOffset.x || 0),
            y: target.y + Number(destinationOffset.y || 0)
        }
        : target;
    // Imports intentionally land on the same insertion point. A real drag must
    // therefore travel through a clear waypoint before returning over the target;
    // a zero-distance press/hold is not a drag and must never be accepted as one.
    const waypoint = { x: destination.x < 600 ? 900 : 220, y: 180 };
    let armed = null;
    await drag({
        page, source, destination, waypoint, holdMs: 700,
        armedShot: async () => {
            armed = await page.evaluate(async ({ sourceId: draggedId, destination }) => {
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const { hitTestRenderScene } = await import('/eVe/domains/rendering/scene_graph.js');
                const textState = await import('/eVe/domains/rendering/project_scene_text_edit_state.js');
                const session = getRenderSurfaceState(document.getElementById('eve_surface_project'))?.pointerSession;
                return session ? {
                    mode: String(session.mode || ''),
                    atomeId: String(session.atome_id || ''),
                    moved: session.moved === true,
                    targetId: String(session.overlap_target_id || ''),
                    stationaryMs: session.overlap_target_id
                        ? Date.now() - Number(session.overlap_started_at || Date.now()) : 0,
                    start: session.start || null,
                    last: session.last || null,
                    destination,
                    rawHitAtLast: String(hitTestRenderScene(
                        getRenderSurfaceState(document.getElementById('eve_surface_project'))?.scene || null,
                        session.last || destination,
                        { excludeId: draggedId }
                    )?.id || ''),
                    activeTextEdit: textState.getActiveProjectTextEdit()
                } : null;
            }, { sourceId, destination });
            await screenshot({ page, report, outDir, name: shotName, preservePointer: true });
        }
    });
    assert(armed?.moved && armed?.targetId && armed.stationaryMs >= 500,
        `layered_absorb_not_armed:${JSON.stringify({ sourceId, targetId, armed })}`);
    await waitFor(page, async ({ id, before, expected }) => {
        const state = await window.Atome.getStateCurrent(id);
        const parent = String(state?.parent_id || state?.parentId || state?.properties?.parent_id
            || state?.props?.parent_id || state?.meta?.parent_id || '');
        return {
            ok: expected ? parent === expected : Boolean(parent) && parent !== before,
            parent, before, expected
        };
    }, {
        id: sourceId,
        before: beforeParents.source,
        expected: beforeParents.target && beforeParents.target !== beforeParents.source ? beforeParents.target : ''
    });
    await waitForStableScene(page, project.id);
};

const absorbListMember = async ({
    page, project, sourceId, targetId, report, outDir, shotName, expectedParentId = ''
}) => {
    await switchView(page, project.id, 'list');
    const rows = await structuredRows(page);
    const sourceRow = rows.find((row) => row.id === sourceId && row.depth === 0);
    const targetRow = rows.find((row) => row.id === targetId && row.depth === 0);
    assert(sourceRow && targetRow, `layered_list_absorb_rows_missing:${JSON.stringify({ sourceId, targetId, rows })}`);
    const source = await awaitBevyUiNodeTarget(page, {
            nodeId: `project_view_list_entry_${sourceRow.index}_name`,
            treeId: 'eve_bevy_ui_project_view', step: 2
    }, { timeoutMs: 15000, intervalMs: 150 });
    assert(source, `layered_list_absorb_source_missing:${JSON.stringify({ sourceId, targetId, sourceRow })}`);
    const from = await playwrightPointForClientTarget(page, source);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await wait(120);
    let destination = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        destination = await structuredDropTarget(page, {
            layout: 'list', sourceId, targetIndex: targetRow.index, kind: 'overlap'
        });
        assert(destination, `layered_list_absorb_destination_missing:${JSON.stringify({
            sourceId, targetId, targetRow, attempt
        })}`);
        const point = await playwrightPointForClientTarget(page, destination);
        await page.mouse.move(point.x, point.y, { steps: attempt === 0 ? 16 : 4 });
        await wait(140);
    }
    await wait(700);
    await screenshot({ page, report, outDir, name: shotName, preservePointer: true });
    await page.mouse.up();
    await waitFor(page, async ({ sourceId: dragged, targetId: target, projectId, expectedParent }) => {
        const parent = (state) => String(state?.parent_id || state?.parentId
            || state?.properties?.parent_id || state?.props?.parent_id || state?.meta?.parent_id || '');
        const [sourceState, targetState] = await Promise.all([
            window.Atome.getStateCurrent(dragged), window.Atome.getStateCurrent(target)
        ]);
        const sourceParent = parent(sourceState);
        const targetParent = parent(targetState);
        return {
            ok: expectedParent
                ? sourceParent === expectedParent
                : Boolean(sourceParent) && sourceParent === targetParent && sourceParent !== projectId,
            sourceParent, targetParent, projectId, expectedParent
        };
    }, { sourceId, targetId, projectId: project.id, expectedParent: expectedParentId });
    await waitForStableScene(page, project.id);
};

const openMolecule = async (page, projectId, memberId, moleculeId) => {
    void memberId;
    await switchView(page, projectId, 'list');
    const navigation = await page.evaluate(async () => (await import(
        '/eVe/domains/rendering/project_view_navigation.js'
    )).readState());
    if (navigation.current?.entity === 'molecule') {
        const back = await awaitBevyUiNodeTarget(page, {
            nodeId: 'project_view_footer_back', treeId: 'eve_bevy_ui_project_view', step: 2
        }, { timeoutMs: 15000, intervalMs: 150 });
        assert(back, `layered_open_molecule_back_missing:${JSON.stringify(navigation)}`);
        await clickCanvasTarget(page, back);
        await waitFor(page, async () => {
            const current = (await import('/eVe/domains/rendering/project_view_navigation.js')).readState().current;
            return { ok: current?.entity === 'project', current };
        });
    }
    await selectListRow(page, moleculeId);
    await switchView(page, projectId, 'natural');
    await waitForContextualTarget(page, moleculeId);
    await chooseMoleculePlaybackMode(page, moleculeId, 'layer');
};

const transportProof = (page, moleculeId, projectId = '') => page.evaluate(async ({ id, pid }) => {
    const [{ ensureMoleculeEngine }, { projectViewPlayback }, decode] = await Promise.all([
        import('/eVe/core/media_engine/molecule.js'),
        import('/eVe/domains/rendering/project_view_playback_runtime.js'),
        import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js')
    ]);
    const session = ensureMoleculeEngine().getSession(`molecule_transport_${id}`);
    const runtime = session ? [...session.runtimeClips.entries()].map(([clipId, clip]) => ({
        clipId, kind: clip.kind, playing: clip.playing === true,
        audioAvailable: clip.audioAvailable === true,
        audioSource: clip.audioSource && typeof clip.audioSource === 'object' ? { ...clip.audioSource } : clip.audioSource,
        audioLoadError: String(clip.audioLoadError || ''),
        voiceId: String(clip.voiceId || ''), gain: Number(clip.lastGain || 0),
        videoMuted: clip.video ? clip.video.muted === true : null
    })) : [];
    const playback = projectViewPlayback.readState();
    const videoAtomeIds = (playback.playingRecords || []).filter((record) => {
        const properties = record?.properties || record?.props || {};
        return String(properties.kind || properties.media_kind || record?.type || '').toLowerCase().includes('video');
    }).map((record) => String(record.id || record.atome_id || ''));
    const scene = window.eveToolBase?.getProjectSceneState?.(pid) || {};
    const sceneAtoms = Array.isArray(scene?.scene?.atoms) ? scene.scene.atoms : [];
    const sceneNodes = Array.isArray(scene?.scene?.nodes) ? scene.scene.nodes : [];
    const sceneRecords = Array.isArray(scene?.records) ? scene.records : [];
    const projectionNodes = Array.isArray(scene?.projection?.virtual_scene?.nodes)
        ? scene.projection.virtual_scene.nodes : [];
    const videoSceneEntries = [...sceneAtoms, ...sceneNodes].filter((entry) => {
        const sourceId = String(entry?.content?.playbackSourceAtomeId || entry?.content?.playback_source_atome_id || '');
        return videoAtomeIds.includes(String(entry?.id || '')) || videoAtomeIds.includes(sourceId);
    });
    const decodeIds = [...new Set(videoSceneEntries.flatMap((entry) => [
        String(entry?.id || ''), String(entry?.content?.playbackSourceAtomeId || entry?.content?.playback_source_atome_id || '')
    ]).filter(Boolean))];
    return {
        transport: session?.getTransportState?.() || null,
        activeClips: session?.getState?.().active_clips || [],
        voices: session ? [...session.voiceState.entries()].map(([clipId, voice]) => ({ clipId, ...voice })) : [],
        runtime,
        playback,
        visual: {
            sceneKeys: Object.keys(scene?.scene || {}),
            projectionKeys: Object.keys(scene?.projection || {}),
            recordIds: sceneRecords.map((record) => String(record?.id || record?.atome_id || '')),
            sceneAtomIds: sceneAtoms.map((entry) => String(entry?.id || '')),
            projectionNodeIds: projectionNodes.map((entry) => String(entry?.id || '')),
            videoAtomeIds,
            videoSceneEntries,
            decode: Object.fromEntries(decodeIds.map((decodeId) => [decodeId, decode.getBevyVideoDecodeStatus(decodeId)])),
            domVideos: [...document.querySelectorAll('video')].map((video) => ({
                src: String(video.currentSrc || video.src || ''), currentTime: Number(video.currentTime || 0),
                paused: video.paused === true, ended: video.ended === true, readyState: Number(video.readyState || 0),
                width: Number(video.videoWidth || 0), height: Number(video.videoHeight || 0), muted: video.muted === true
            }))
        },
        videoVersions: Object.fromEntries(runtime.filter((clip) => clip.kind === 'video').map((clip) => [
            clip.clipId, Number(window.__EVE_BEVY_VIDEO_FRAME_VERSION_FOR_ID__?.(
                String(session?.timeline?.tracks?.flatMap((track) => track.clips)
                    .find((entry) => entry.id === clip.clipId)?.source?.atome_id || '')
            ) || 0)
        ])),
        videoPlaybackEvents: (window.__EVE_BEVY_PERF__?.events || [])
            .filter((entry) => entry?.name === 'project_view.video.playback').slice(-12),
        naturalReconcileEvents: (window.__EVE_BEVY_PERF__?.events || [])
            .filter((entry) => entry?.name === 'project_view.natural.reconcile').slice(-12)
    };
}, { id: moleculeId, pid: projectId });

const stopMolecule = async (page) => {
    const stop = await moleculePlayTool(page);
    if (!stop) {
        const evidence = await page.evaluate(async () => {
            const [{ projectViewPlayback }, navigation, { getAtomeContextualEditApi }] = await Promise.all([
                import('/eVe/domains/rendering/project_view_playback_runtime.js'),
                import('/eVe/domains/rendering/project_view_navigation.js'),
                import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js')
            ]);
            const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
            return {
                playback: projectViewPlayback.readState(),
                navigation: navigation.readState(),
                rail: getAtomeContextualEditApi()?.readState?.() || null,
                interactiveNodeIds: (tree?.interactiveNodes || []).map((entry) => String(entry?.id || entry))
            };
        });
        throw new Error(`layered_stop_tool_missing:${JSON.stringify(evidence)}`);
    }
    await clickCanvasTarget(page, stop);
    await waitForPlaybackEnd(page, 8000);
};

const playStandaloneVideo = async ({ page, projectId, videoId, report, outDir }) => {
    await page.evaluate(() => {
        if (window.__EVE_BEVY_PERF__) {
            window.__EVE_BEVY_PERF__.reset({ enabled: true, externalRenderEvents: true });
        }
    });
    await switchView(page, projectId, 'list');
    await selectListRow(page, videoId);
    await switchView(page, projectId, 'natural');
    await waitForContextualTarget(page, videoId);
    let started = null;
    let attempts = 0;
    for (let attempt = 0; attempt < 2 && !started; attempt += 1) {
        attempts = attempt + 1;
        const play = await memberPlayTool(page);
        assert(play, 'layered_standalone_video_play_missing');
        await clickCanvasTarget(page, play);
        started = await waitFor(page, async (id) => {
            const selected = await import('/eVe/domains/media/selected_project_media_playback_runtime.js');
            const selectedState = selected.readSelectedProjectMediaPlaybackState([id]);
            const audio = window.Squirrel?.av?.audio;
            const videos = [...document.querySelectorAll('video')].map((video) => ({
                currentTime: Number(video.currentTime || 0), paused: video.paused === true,
                ended: video.ended === true, muted: video.muted === true,
                width: Number(video.videoWidth || 0), height: Number(video.videoHeight || 0)
            }));
            return {
                ok: selectedState.activeIds.includes(id)
                    && audio?.get_runtime?.()?.playback === 'web_wasm_kira'
                    && audio?.get_backend?.() === 'kira'
                    && videos.some((video) => !video.paused && video.muted && video.width > 0 && video.height > 0),
                selectedState, audioRuntime: audio?.get_runtime?.() || null,
                audioBackend: audio?.get_backend?.() || null, videos
            };
        }, videoId, 7000).catch(() => null);
    }
    if (!started) {
        const diagnostics = await page.evaluate(async (id) => {
            const [context, selection, selected, decode] = await Promise.all([
                import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js'),
                import('/eVe/intuition/runtime/selection.js'),
                import('/eVe/domains/media/selected_project_media_playback_runtime.js'),
                import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js')
            ]);
            return {
                context: context.getAtomeContextualEditApi()?.readState?.() || null,
                selection: selection.getCurrentSelectionIds?.() || [],
                selectedPlayback: selected.readSelectedProjectMediaPlaybackState([id]),
                decode: decode.getBevyVideoDecodeStatus(id),
                performance: window.__EVE_BEVY_PERF__?.compact?.() || null,
                videoDecodeEvents: (window.__EVE_BEVY_PERF__?.events || [])
                    .filter((entry) => {
                        const name = String(entry?.name || '');
                        return name.startsWith('video.decode.source.') || name === 'project_view.natural.reconcile';
                    }),
                projectedVideoNodes: Array.from(
                    (window.eveToolBase?.getProjectSceneState?.(window.__currentProject?.id)?.projection?.virtual_scene?.nodes || [])
                ).filter((node) => String(node?.kind || '').toLowerCase() === 'video').map((node) => ({
                    id: String(node.id || ''), source: String(node?.content?.source || node?.source || '')
                })),
                videoRecords: (window.eveToolBase?.getProjectSceneState?.(window.__currentProject?.id)?.records || [])
                    .filter((record) => {
                        const props = record?.properties || {};
                        return [record?.kind, record?.type, props.kind, props.media_kind]
                            .some((value) => String(value || '').toLowerCase().includes('video'));
                    }).map((record) => ({
                        id: String(record.id || record.atome_id || ''),
                        playbackSourceAtomeId: String(record?.properties?.playback_source_atome_id || ''),
                        source: String(record?.properties?.media_url || record?.properties?.src || '')
                    })),
                routing: (window.atome?.tools?.gatewayRoutingLog || [])
                    .filter((entry) => entry.tool_id === 'ui.play').slice(-8),
                failures: (window.__eveToolFailures || []).filter((entry) => entry.tool_id === 'ui.play').slice(-4),
                videos: [...document.querySelectorAll('video')].map((video) => ({
                    currentTime: Number(video.currentTime || 0), duration: Number(video.duration || 0),
                    paused: video.paused === true, ended: video.ended === true, readyState: Number(video.readyState || 0)
                }))
            };
        }, videoId);
        throw new Error(`layered_standalone_video_did_not_start_after_two_real_clicks:${JSON.stringify(diagnostics)}`);
    }
    started.attempts = attempts;
    await screenshot({ page, report, outDir, name: 'layered_video_alone_a' });
    await wait(700);
    await screenshot({ page, report, outDir, name: 'layered_video_alone_b' });
    const frameDiff = diffPng(
        path.join(outDir, 'layered_video_alone_a.png'),
        path.join(outDir, 'layered_video_alone_b.png')
    );
    assert(frameDiff.differing_pixel_ratio > 0.001,
        `layered_standalone_video_static:${JSON.stringify({ frameDiff, started })}`);
    const stopped = await disarmMemberPlayback(page);
    const afterStop = await playbackSnapshot(page, [videoId]);
    assert(afterStop.playing !== true && afterStop.playingIds.length === 0,
        `layered_standalone_video_stop_leak:${JSON.stringify({ stopped, afterStop })}`);
    const naturalReconcile = await page.evaluate(() => (window.__EVE_BEVY_PERF__?.events || [])
        .filter((entry) => entry?.name === 'project_view.natural.reconcile'));
    return { started, frameDiff, stopped, afterStop, naturalReconcile };
};

const assertDepthTransportContinuity = (before, samples) => {
    const sessionId = String(before?.transport?.session_id || '');
    assert(sessionId, `layered_depth_session_missing:${JSON.stringify(before)}`);
    let position = Number(before.transport.position || 0);
    let ended = before.transport.playing !== true;
    samples.forEach((sample, index) => {
        const transport = sample?.transport || {};
        const nextPosition = Number(transport.position || 0);
        const duration = Number(transport.duration || 0);
        assert(String(transport.session_id || '') === sessionId,
            `layered_depth_restarted_transport:${index}:${JSON.stringify({ before: before.transport, transport })}`);
        assert(nextPosition + 0.05 >= position,
            `layered_depth_transport_rewound:${index}:${position}:${nextPosition}`);
        if (transport.playing === true) {
            assert(!ended && sample.voices.length === 3,
                `layered_depth_voice_change:${index}:${JSON.stringify(sample)}`);
        } else {
            assert(duration > 0 && Math.abs(duration - nextPosition) <= 0.25 && sample.voices.length === 0,
                `layered_depth_early_stop:${index}:${JSON.stringify(sample)}`);
            ended = true;
        }
        position = nextPosition;
    });
};

const summarizeTransportProof = (proof = {}) => ({
    transport: proof.transport || null,
    activeClips: (proof.activeClips || []).map((clip) => ({
        id: clip.id, kind: clip.kind, source_seconds: clip.source_seconds, envelope: clip.envelope
    })),
    voices: (proof.voices || []).map((voice) => ({
        clipId: voice.clipId, voiceId: voice.voiceId, gain: voice.gain, active: voice.active
    })),
    runtime: (proof.runtime || []).map((clip) => ({
        clipId: clip.clipId, kind: clip.kind, playing: clip.playing,
        audioAvailable: clip.audioAvailable, audioSource: clip.audioSource,
        audioLoadError: clip.audioLoadError, videoMuted: clip.videoMuted
    })),
    playback: {
        playing: proof.playback?.playing === true,
        scope: String(proof.playback?.scope || ''),
        playingIds: (proof.playback?.playingIds || []).map(String),
        armed: proof.playback?.armed === true
    },
    visual: {
        videoAtomeIds: proof.visual?.videoAtomeIds || [],
        decode: proof.visual?.decode || {},
        domVideos: proof.visual?.domVideos || []
    }
});

const applyDepth = async ({ page, projectId, memberId, action }) => {
    await switchView(page, projectId, 'list');
    await dismissMainPalette(page, projectId);
    const navigation = await page.evaluate(async () => (await import(
        '/eVe/domains/rendering/project_view_navigation.js'
    )).readState());
    if (navigation.current?.entity !== 'molecule') {
        await expandCanonicalListMolecule(page, [memberId]);
    }
    await selectListRow(page, memberId);
    await switchView(page, projectId, 'natural');
    await waitForContextualTarget(page, memberId);
    const zOrder = await contextualTool(page, ['atome_contextual_tool_z_order']);
    assert(zOrder, 'layered_z_order_tool_missing');
    await clickCanvasTarget(page, zOrder);
    const actionNodeIds = [
        `atome_contextual_tool_z_order_z_order_${action}`,
        `atome_contextual_tool_z_order_${action}`
    ];
    await waitFor(page, (expectedIds) => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
        const ids = (tree?.interactiveNodes || []).map((entry) => String(entry.id || entry));
        return { ok: expectedIds.some((id) => ids.includes(id)), ids };
    }, actionNodeIds);
    const actionTool = await contextualTool(page, actionNodeIds);
    assert(actionTool, `layered_z_order_action_missing:${action}`);
    const beforeStack = await page.evaluate(async (id) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || state || {};
        const value = Number(props.zIndex ?? props.z_index);
        return Number.isFinite(value) ? value : null;
    }, memberId);
    await clickCanvasTarget(page, actionTool);
    await waitFor(page, async ({ project, member, before }) => {
        const state = await window.Atome.getStateCurrent(member);
        const props = state?.properties || state?.props || state || {};
        const canonical = Number(props.zIndex ?? props.z_index);
        const record = (window.eveToolBase?.getProjectSceneState?.(project)?.records || [])
            .find((entry) => String(entry.id || entry.atome_id || '') === member);
        const projectedProps = record?.properties || record?.props || {};
        const projected = Number(projectedProps.zIndex ?? projectedProps.z_index);
        return {
            ok: Number.isFinite(canonical) && canonical !== before
                && Number.isFinite(projected) && projected === canonical,
            canonical: Number.isFinite(canonical) ? canonical : null,
            projected: Number.isFinite(projected) ? projected : null,
            before
        };
    }, { project: projectId, member: memberId, before: beforeStack });
    await waitForStableScene(page, projectId);
};

const extractionSnapshot = (page, { projectId, moleculeId, memberId }) => page.evaluate(async (ids) => {
    const [owner, member, selection] = await Promise.all([
        window.Atome.getStateCurrent(ids.moleculeId),
        window.Atome.getStateCurrent(ids.memberId),
        import('/eVe/intuition/runtime/selection.js')
    ]);
    const properties = (state) => state?.properties || state?.props || state || {};
    const parent = (state) => String(state?.parent_id || state?.parentId
        || properties(state).parent_id || state?.meta?.parent_id || '');
    const ownerProps = properties(owner);
    const timeline = owner?.molecule_timeline || ownerProps.molecule_timeline || null;
    const records = window.eveToolBase?.getProjectSceneState?.(ids.projectId)?.records || [];
    const projectedMemberCount = records.filter((record) => String(record.id || record.atome_id || '') === ids.memberId).length;
    const projectedOwnerCount = records.filter((record) => String(record.id || record.atome_id || '') === ids.moleculeId).length;
    let timelineSessionOpen = false;
    try {
        timelineSessionOpen = window.eveMoleculeTimelineApi?.readGroupTimeline?.({ group_id: ids.moleculeId })?.ok === true;
    } catch {
        timelineSessionOpen = false;
    }
    return {
        ownerAlive: projectedOwnerCount > 0,
        ownerStateReadable: Boolean(owner),
        ownerParent: parent(owner),
        memberParent: parent(member),
        timeline,
        timelineSessionOpen,
        selectedIds: selection.getCurrentSelectionIds(),
        projectedMemberCount,
        projectedOwnerCount
    };
}, { projectId, moleculeId, memberId });

const enterListMolecule = async (page, projectId, moleculeId) => {
    await switchView(page, projectId, 'list');
    const navigation = await page.evaluate(async () => (await import(
        '/eVe/domains/rendering/project_view_navigation.js'
    )).readState());
    if (navigation.current?.entity === 'molecule' && navigation.current?.id === moleculeId) return;
    const rows = await structuredRows(page);
    const row = rows.find((entry) => entry.id === moleculeId && entry.depth === 0);
    assert(row, `layered_list_molecule_row_missing:${JSON.stringify(rows)}`);
    const target = await listNode(page, `project_view_list_entry_${row.index}_name`);
    assert(target, `layered_list_molecule_target_missing:${moleculeId}`);
    await clickCanvasTarget(page, target, { double: true });
    await waitFor(page, async (id) => {
        const [{ readState }, { readProjectViewSurfaceState }] = await Promise.all([
            import('/eVe/domains/rendering/project_view_navigation.js'),
            import('/eVe/domains/rendering/project_view_surface_runtime.js')
        ]);
        const current = readState().current;
        const surface = readProjectViewSurfaceState();
        const entries = surface.content?.entries || [];
        return {
            ok: current?.entity === 'molecule' && current?.id === id
                && entries.length > 0
                && !entries.some((entry) => ['section', 'track'].includes(String(
                    entry.visualRecord?.properties?.molecule_entity || ''
                ))),
            current, recordCount: entries.length
        };
    }, moleculeId);
};

const enterMatrixMolecule = async (page, projectId, moleculeId, expectedCount = 0) => {
    await switchView(page, projectId, 'table');
    const navigation = await page.evaluate(async () => (await import(
        '/eVe/domains/rendering/project_view_navigation.js'
    )).readState());
    if (navigation.current?.entity === 'molecule' && navigation.current?.id === moleculeId) return;
    const rootIndex = await page.evaluate(async ({ project, molecule }) => {
        const navigationRuntime = await import('/eVe/domains/rendering/project_view_navigation.js');
        const records = window.eveToolBase?.getProjectSceneState?.(project)?.records || [];
        return navigationRuntime.containerChildren(records).findIndex((record) => String(
            record?.id || record?.atome_id || ''
        ) === molecule);
    }, { project: projectId, molecule: moleculeId });
    assert(rootIndex >= 0, `layered_matrix_molecule_root_missing:${moleculeId}`);
    const target = await awaitBevyUiNodeTarget(page, {
        nodeId: `project_view_matrix_tile_${rootIndex}`,
        treeId: 'eve_bevy_ui_project_view', step: 2
    });
    assert(target, `layered_matrix_molecule_target_missing:${moleculeId}`);
    await clickCanvasTarget(page, target, { double: true });
    await waitFor(page, async ({ id, expectedCount }) => {
        const [{ readState }, { readProjectViewSurfaceState }] = await Promise.all([
            import('/eVe/domains/rendering/project_view_navigation.js'),
            import('/eVe/domains/rendering/project_view_surface_runtime.js')
        ]);
        const current = readState().current;
        const surface = readProjectViewSurfaceState();
        return {
            ok: current?.entity === 'molecule' && current?.id === id
                && (expectedCount > 0
                    ? Number(surface.content?.recordCount || 0) === expectedCount
                    : Number(surface.content?.recordCount || 0) > 0),
            current, recordCount: Number(surface.content?.recordCount || 0)
        };
    }, { id: moleculeId, expectedCount });
};

const reorderListMemberToFront = async ({ page, project, moleculeId, memberId, memberIds, report, outDir }) => {
    await enterListMolecule(page, project.id, moleculeId);
    const beforeRows = await structuredRows(page);
    const sourceRow = beforeRows.find((entry) => entry.id === memberId);
    assert(sourceRow && sourceRow.index > 0,
        `layered_list_reorder_source_not_movable:${JSON.stringify({ memberId, beforeRows })}`);
    const source = await listNode(page, `project_view_list_entry_${sourceRow.index}_name`);
    const destination = await structuredDropTarget(page, {
        layout: 'list', sourceId: memberId, targetIndex: 0, kind: 'insert', edge: 'before'
    });
    assert(source && destination,
        `layered_list_reorder_targets_missing:${JSON.stringify({ memberId, sourceRow, destination })}`);
    await drag({ page, source, destination, holdMs: 180 });
    const persisted = await waitFor(page, async ({ projectId, expectedIds, movedId }) => {
        const rows = (await import('/eVe/domains/rendering/project_view_surface_runtime.js'))
            .readProjectViewSurfaceState().content?.entries || [];
        const rowIds = rows.map((entry) => String(entry.id || ''));
        const states = await Promise.all(expectedIds.map((id) => window.Atome.getStateCurrent(id)));
        const props = (state) => state?.properties || state?.props || state || {};
        const ordered = states.map((state, index) => ({
            id: expectedIds[index], hierarchy: Number(props(state).hierarchy_order),
            z: Number(props(state).zIndex ?? props(state).z_index),
            renderLayer: Number(props(state).renderLayer ?? props(state).render_layer)
        })).sort((left, right) => left.hierarchy - right.hierarchy);
        const events = await window.Atome.listEvents({ projectId, limit: 500, order: 'desc' });
        const eventProps = (event) => event?.payload?.props || event?.props || {};
        const movedEvent = events.find((event) => String(event?.atome_id || event?.atomeId || '') === movedId
            && Number(eventProps(event).hierarchy_order) === 0
            && Number(eventProps(event).renderLayer ?? eventProps(event).render_layer) === expectedIds.length);
        const txId = String(movedEvent?.tx_id || movedEvent?.txId || movedEvent?.transaction_id || '');
        const transaction = txId ? events.filter((event) => String(
            event?.tx_id || event?.txId || event?.transaction_id || ''
        ) === txId) : [];
        return {
            ok: rowIds[0] === movedId
                && ordered[0]?.id === movedId
                && ordered[0]?.z === expectedIds.length
                && ordered[0]?.renderLayer === expectedIds.length
                && Boolean(txId)
                && transaction.length >= 2,
            rowIds, ordered, txId,
            transaction: transaction.map((event) => ({
                id: String(event?.atome_id || event?.atomeId || ''),
                kind: String(event?.kind || ''), props: eventProps(event)
            }))
        };
    }, { projectId: project.id, expectedIds: memberIds, movedId: memberId });
    await screenshot({ page, report, outDir, name: 'layered_list_reordered_front' });

    await enterMatrixMolecule(page, project.id, moleculeId, memberIds.length);
    // Ensemble deliberately keeps the Molecule selected. Read the identities
    // actually mounted on Matrix tiles instead of violating that selection
    // contract merely to discover their order.
    const expectedMatrixLabels = persisted.ordered.slice(0, 2).map((entry) => {
        const row = beforeRows.find((candidate) => candidate.id === entry.id);
        return { id: entry.id, label: row?.label || '' };
    });
    const matrixOrder = await waitFor(page, (expected) => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_ui_project_view');
        const tiles = expected.map((item, index) => {
            const node = (tree?.interactiveNodes || []).find((entry) => entry.id === `project_view_matrix_tile_${index}`);
            return { index, expectedId: item.id, expectedLabel: item.label, label: String(node?.accessibility?.label || '') };
        });
        return { ok: tiles.every((tile) => tile.label === tile.expectedLabel), tiles };
    }, expectedMatrixLabels);
    await waitForStableScene(page, project.id);
    await wait(400);
    await screenshot({ page, report, outDir, name: 'layered_matrix_reordered_front' });

    await switchView(page, project.id, 'natural');
    const natural = await page.evaluate(({ projectId, expectedIds }) => {
        const records = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
        const stack = expectedIds.map((id) => {
            const record = records.find((entry) => String(entry.id || entry.atome_id || '') === id);
            const props = record?.properties || record?.props || {};
            return {
                id, z: Number(props.zIndex ?? props.z_index),
                renderLayer: Number(props.renderLayer ?? props.render_layer)
            };
        }).sort((left, right) => right.renderLayer - left.renderLayer);
        return { stack };
    }, { projectId: project.id, expectedIds: memberIds });
    assert(natural.stack[0]?.id === memberId && natural.stack[0]?.renderLayer === memberIds.length,
        `layered_natural_reorder_not_projected:${JSON.stringify(natural)}`);
    await screenshot({ page, report, outDir, name: 'layered_natural_reordered_playing' });
    return { beforeRows, persisted, matrixOrder, natural };
};

const verifyReorderedMemberAfterReload = async ({ page, project, moleculeId, memberId, memberIds, txId }) => {
    await enterListMolecule(page, project.id, moleculeId);
    const listRows = await structuredRows(page);
    assert(listRows[0]?.id === memberId,
        `layered_list_reorder_not_persisted:${JSON.stringify(listRows)}`);
    const database = await page.evaluate(async ({ projectId, expectedIds, transactionId }) => {
        const states = await Promise.all(expectedIds.map((id) => window.Atome.getStateCurrent(id)));
        const props = (state) => state?.properties || state?.props || state || {};
        const ordered = states.map((state, index) => ({
            id: expectedIds[index], hierarchy: Number(props(state).hierarchy_order),
            z: Number(props(state).zIndex ?? props(state).z_index),
            renderLayer: Number(props(state).renderLayer ?? props(state).render_layer)
        })).sort((left, right) => left.hierarchy - right.hierarchy);
        const events = await window.Atome.listEvents({ projectId, txId: transactionId, limit: 100, order: 'asc' });
        return {
            ordered,
            events: events.map((event) => ({
                id: String(event?.atome_id || event?.atomeId || ''),
                txId: String(event?.tx_id || event?.txId || event?.transaction_id || ''),
                props: event?.payload?.props || event?.props || {}
            }))
        };
    }, { projectId: project.id, expectedIds: memberIds, transactionId: txId });
    assert(database.ordered[0]?.id === memberId
        && database.ordered[0]?.hierarchy === 0
        && database.ordered[0]?.z === memberIds.length
        && database.ordered[0]?.renderLayer === memberIds.length,
    `layered_database_reorder_not_persisted:${JSON.stringify(database)}`);
    assert(database.events.length >= 2 && database.events.every((event) => event.txId === txId),
        `layered_reorder_history_missing_after_reload:${JSON.stringify({ txId, database })}`);

    await enterMatrixMolecule(page, project.id, moleculeId, memberIds.length);
    const firstTile = await awaitBevyUiNodeTarget(page, {
        nodeId: 'project_view_matrix_tile_0', treeId: 'eve_bevy_ui_project_view', step: 2
    });
    assert(firstTile, 'layered_matrix_reorder_first_tile_missing_after_reload');
    await clickCanvasTarget(page, firstTile);
    await waitFor(page, async (id) => {
        const selection = await import('/eVe/intuition/runtime/selection.js');
        const selectedIds = selection.getCurrentSelectionIds().map(String);
        return { ok: selectedIds.length === 1 && selectedIds[0] === id, selectedIds };
    }, memberId);
    await switchView(page, project.id, 'natural');
    const projected = await page.evaluate(({ projectId, expectedId }) => {
        const record = (window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [])
            .find((entry) => String(entry.id || entry.atome_id || '') === expectedId);
        const props = record?.properties || record?.props || {};
        return {
            z: Number(props.zIndex ?? props.z_index),
            renderLayer: Number(props.renderLayer ?? props.render_layer)
        };
    }, { projectId: project.id, expectedId: memberId });
    assert(projected.z === memberIds.length && projected.renderLayer === memberIds.length,
        `layered_natural_reorder_not_persisted:${JSON.stringify(projected)}`);
    return { listRows, database, projected };
};

const extractListMember = async ({ page, project, moleculeId, memberId, report, outDir, shotName }) => {
    await enterListMolecule(page, project.id, moleculeId);
    const rows = await structuredRows(page);
    const row = rows.find((entry) => entry.id === memberId);
    assert(row && row.depth === 0, `layered_extract_member_row_missing:${memberId}:${JSON.stringify(rows)}`);
    const [source, back] = await Promise.all([
        awaitBevyUiNodeTarget(page, {
            nodeId: `project_view_list_entry_${row.index}_name`,
            treeId: 'eve_bevy_ui_project_view', step: 2
        }),
        awaitBevyUiNodeTarget(page, {
            nodePrefix: 'project_view_footer_back', treeId: 'eve_bevy_ui_project_view', step: 2
        })
    ]);
    assert(source && back, `layered_extract_targets_missing:${memberId}:${JSON.stringify({
        source: source?.id || null, back: back?.id || null, row
    })}`);
    await drag({
        page, source, destination: back, holdMs: 180,
        armedShot: shotName
            ? () => screenshot({ page, report, outDir, name: shotName, preservePointer: true })
            : null
    });
    const extracted = await waitFor(page, async ({ molecule, member }) => {
        const [owner, state, navigation, selection] = await Promise.all([
            window.Atome.getStateCurrent(molecule), window.Atome.getStateCurrent(member),
            import('/eVe/domains/rendering/project_view_navigation.js'),
            import('/eVe/intuition/runtime/selection.js')
        ]);
        const props = state?.properties || state?.props || state || {};
        const parent = String(state?.parent_id || state?.parentId || props.parent_id || state?.meta?.parent_id || '');
        const ownerProps = owner?.properties || owner?.props || owner || {};
        const ownerParent = String(owner?.parent_id || owner?.parentId || ownerProps.parent_id || owner?.meta?.parent_id || '');
        return {
            ok: parent !== molecule
                && navigation.readState().current?.entity !== 'molecule'
                && selection.getCurrentSelectionIds().includes(member),
            parent, ownerParent, navigation: navigation.readState(), selectedIds: selection.getCurrentSelectionIds()
        };
    }, { molecule: moleculeId, member: memberId });
    await waitForStableScene(page, project.id);
    return extracted;
};

const expectedTimelineDuration = (timeline) => {
    const sampleRate = Math.max(1, Number(timeline?.timebase?.sample_rate || 48000));
    return Math.max(0, ...(timeline?.clips || []).map((clip) => (
        (Number(clip?.timeline?.start_frame || 0) + Number(clip?.timeline?.duration_frames || 0)) / sampleRate
    )));
};

const assertNaturalClipTiming = (snapshot, memberIds) => {
    const timeline = snapshot.timeline || {};
    const sampleRate = Math.max(1, Number(timeline.timebase?.sample_rate || 48000));
    assert(Number(timeline.transport?.rate ?? 1) === 1, `molecule_transport_rate_changed:${timeline.transport?.rate}`);
    assert(timeline.transport?.loop?.enabled !== true, 'molecule_transport_loop_enabled_implicitly');
    const statesById = new Map(memberIds.map((id, index) => [id, snapshot.states[index]]));
    const mediaTiming = [];
    for (const clip of timeline.clips || []) {
        assert(clip.stretch == null || clip.stretch.enabled !== true,
            `molecule_clip_stretched_implicitly:${clip.clip_id}`);
        assert(clip.block_loop?.enabled !== true, `molecule_clip_looped_implicitly:${clip.clip_id}`);
        const sourceId = String(clip.source?.atome_id || '');
        const state = statesById.get(sourceId);
        const props = state?.properties || state?.props || state || {};
        const kind = String(props.kind || props.media_kind || state?.type || '').toLowerCase();
        const sourceDuration = Number(props.duration_seconds ?? props.duration_sec
            ?? props.media_duration ?? props.duration);
        const clipDuration = Number(clip.timeline?.duration_frames || 0) / sampleRate;
        const sourceIn = Number(clip.timeline?.source_in_frames ?? clip.timeline?.source_in_frame ?? 0) / sampleRate;
        const sourceOut = Number(clip.timeline?.source_out_frames ?? clip.timeline?.source_out_frame ?? 0) / sampleRate;
        if ((kind.includes('audio') || kind.includes('sound') || kind.includes('video'))
            && Number.isFinite(sourceDuration) && sourceDuration > 0) {
            assert(Math.abs(clipDuration - sourceDuration) <= (1 / sampleRate) + 0.00001,
                `molecule_media_duration_changed:${sourceId}:${sourceDuration}:${clipDuration}`);
            assert(Math.abs(sourceIn) <= 1 / sampleRate,
                `molecule_media_cropped_at_start:${sourceId}:${sourceIn}`);
            assert(Math.abs(sourceOut - sourceDuration) <= (1 / sampleRate) + 0.00001,
                `molecule_media_cropped_at_end:${sourceId}:${sourceDuration}:${sourceOut}`);
        }
        mediaTiming.push({ sourceId, kind, sourceDuration, clipDuration, sourceIn, sourceOut });
    }
    return mediaTiming;
};

const runColdImageAudioAcceptance = async ({ page, report, ensureProject, outDir }) => {
    // This is deliberately the first playback in the focused acceptance run.
    // Each repeat launches a new Chromium context, so Kira has no prior unlock.
    const coldPage = page;
        const project = await ensureProject(coldPage, `Molecule Cold PNG Audio ${Date.now()}`);
        assert(project?.ok && project.id, `cold_project_create_failed:${JSON.stringify(project)}`);
        await coldPage.evaluate(async (projectId) => {
            await window.eveDashboardBevyUiRuntime?.destroy?.();
            const workspace = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
            workspace.markProjectWorkspaceMode?.(projectId);
        }, project.id);
        await waitFor(coldPage, (projectId) => {
            const surface = document.getElementById('eve_surface_project');
            const rect = surface?.getBoundingClientRect?.();
            return {
                ok: window.__currentProject?.id === projectId
                    && window.__eveWorkspaceMode?.mode === 'project'
                    && window.__eveWorkspaceMode?.projectId === projectId
                    && window.eveDashboardBevyUiRuntime?.state?.active !== true
                    && Number(rect?.width || 0) > 0 && Number(rect?.height || 0) > 0,
                currentProjectId: window.__currentProject?.id || '',
                workspaceMode: window.__eveWorkspaceMode || null,
                dashboardActive: window.eveDashboardBevyUiRuntime?.state?.active === true,
                rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null
            };
        }, project.id, 45000);
        await switchView(coldPage, project.id, 'natural');
        const imageId = await importThroughMenu({
            page: coldPage, projectId: project.id, filePath: FIXTURES.image, expectedKind: 'image'
        });
        const audioId = await importThroughMenu({
            page: coldPage, projectId: project.id, filePath: FIXTURES.audio, expectedKind: 'audio'
        });
        await absorbListMember({
            page: coldPage, project, sourceId: audioId, targetId: imageId,
            report, outDir, shotName: 'cold_png_audio_armed'
        });
        const members = [imageId, audioId];
        let snapshot = await readMolecule(coldPage, members);
        assertMembership(snapshot, members);
        const moleculeId = snapshot.moleculeId;
        await reloadBrowserProject(coldPage, project);
        snapshot = await readMolecule(coldPage, members);
        assertMembership(snapshot, members, moleculeId);
        const naturalTiming = assertNaturalClipTiming(snapshot, members);
        await switchView(coldPage, project.id, 'list');
        const directRows = await expandCanonicalListMolecule(coldPage, members);
        assert(directRows.filter((row) => row.depth === 1 && members.includes(row.id)).length === 2,
            `cold_direct_member_count:${JSON.stringify(directRows)}`);
        await switchView(coldPage, project.id, 'natural');
        await openMolecule(coldPage, project.id, imageId, moleculeId);
        await startMoleculePlayback(coldPage, moleculeId, members);
        await wait(900);
        const started = await transportProof(coldPage, moleculeId, project.id);
        assert(started.voices.length === 1 && started.voices[0].active === true && Number(started.voices[0].gain) > 0,
            `cold_png_audio_voice_missing:${JSON.stringify(started)}`);
        assert(started.runtime.filter((clip) => clip.kind === 'audio').every((clip) => !clip.audioLoadError && clip.voiceId),
            `cold_png_audio_load_failed:${JSON.stringify(started.runtime)}`);
        const expectedDuration = expectedTimelineDuration(snapshot.timeline);
        assert(Math.abs(Number(started.transport?.duration || 0) - expectedDuration) <= 0.05,
            `cold_png_audio_duration:${JSON.stringify({ expectedDuration, transport: started.transport })}`);
        await screenshot({ page: coldPage, report, outDir, name: 'cold_png_audio_playing' });
        await stopMolecule(coldPage);
        const stopped = await transportProof(coldPage, moleculeId, project.id);
        assert(stopped.voices.length === 0 && stopped.transport?.playing !== true,
            `cold_png_audio_stop_leak:${JSON.stringify(stopped)}`);

        await startMoleculePlayback(coldPage, moleculeId, members);
        const naturalEnd = await waitForPlaybackEnd(coldPage, 35000);
        const ended = await transportProof(coldPage, moleculeId, project.id);
        assert(ended.voices.length === 0 && ended.transport?.playing !== true,
            `cold_png_audio_end_leak:${JSON.stringify({ naturalEnd, ended })}`);

        const firstExtraction = await extractListMember({
            page: coldPage, project, moleculeId, memberId: imageId,
            report, outDir, shotName: 'cold_extract_first_member'
        });
        let extraction = await extractionSnapshot(coldPage, { projectId: project.id, moleculeId, memberId: imageId });
        assert(extraction.ownerAlive && extraction.timeline?.clips?.length === 1
            && !extraction.timeline.clips.some((clip) => String(clip.source?.atome_id || '') === imageId)
            && extraction.projectedMemberCount === 1,
        `cold_first_extraction_invalid:${JSON.stringify(extraction)}`);
        await reloadBrowserProject(coldPage, project);
        extraction = await extractionSnapshot(coldPage, { projectId: project.id, moleculeId, memberId: imageId });
        assert(extraction.ownerAlive && extraction.timeline?.clips?.length === 1 && extraction.projectedMemberCount === 1,
            `cold_first_extraction_reload_invalid:${JSON.stringify(extraction)}`);

        const lastExtraction = await extractListMember({
            page: coldPage, project, moleculeId, memberId: audioId,
            report, outDir, shotName: ''
        });
        await reloadBrowserProject(coldPage, project);
        const empty = await extractionSnapshot(coldPage, { projectId: project.id, moleculeId, memberId: audioId });
        assert(!empty.ownerAlive && empty.projectedOwnerCount === 0 && empty.projectedMemberCount === 1
            && empty.timelineSessionOpen === false,
            `cold_last_extraction_owner_not_removed:${JSON.stringify(empty)}`);
        return {
            project, moleculeId, members,
            started: summarizeTransportProof(started), stopped: summarizeTransportProof(stopped),
            ended: summarizeTransportProof(ended), expectedDuration,
            directRows, naturalTiming, firstExtraction, lastExtraction, empty
        };
};

export const runLayeredMediaMoleculeAcceptance = async ({ page, report, ensureProject, outDir }) => {
    writeToneWav(FIXTURES.secondAudio);
    const coldImageAudio = process.env.MOLECULE_UI_SKIP_COLD === '1'
        ? null
        : await runColdImageAudioAcceptance({ page, report, ensureProject, outDir });
    if (process.env.MOLECULE_UI_COLD_ONLY === '1') return { coldImageAudio, coldOnly: true };
    const project = await ensureProject(page, `Molecule Layered Media ${Date.now()}`);
    assert(project?.ok && project.id, `layered_project_create_failed:${JSON.stringify(project)}`);
    await switchView(page, project.id, 'natural');

    const videoId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.video, expectedKind: 'video' });
    const standaloneVideo = process.env.MOLECULE_UI_LAYERED_SKIP_STANDALONE === '1'
        ? null
        : await playStandaloneVideo({ page, projectId: project.id, videoId, report, outDir });
    if (!standaloneVideo) {
        await switchView(page, project.id, 'list');
        await selectListRow(page, videoId);
        await switchView(page, project.id, 'natural');
        await waitForContextualTarget(page, videoId);
    }
    if (process.env.MOLECULE_UI_LAYERED_STANDALONE_ONLY === '1') {
        return { project, videoId, standaloneVideo, standaloneOnly: true };
    }
    const audioId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.audio, expectedKind: 'audio' });
    await absorbMember({ page, project, sourceId: audioId, targetId: videoId, report, outDir, shotName: 'layered_initial_armed' });
    let members = [videoId, audioId];
    let snapshot = await readMolecule(page, members);
    const moleculeId = snapshot.moleculeId;
    assertMembership(snapshot, members);
    await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    const videoReady = await waitFor(page, async (id) => {
        const decode = await import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js');
        const status = decode.getBevyVideoDecodeStatus(id);
        return {
            ok: status.exists === true && status.active === true && status.paused === false
                && status.readyState >= 2 && status.frameVersion > 0
                && Number(status.playbackRate) === 1,
            status
        };
    }, videoId, 15000);
    const initialMix = await transportProof(page, moleculeId, project.id);
    assert(initialMix.voices.length === 2, `layered_initial_voice_count:${JSON.stringify(initialMix)}`);
    assert(initialMix.voices.every((voice) => voice.active === true && Number(voice.gain) > 0),
        `layered_initial_voice_inactive:${JSON.stringify(initialMix.voices)}`);
    assert(initialMix.runtime.filter((clip) => clip.kind === 'video').every((clip) => clip.videoMuted === true),
        `layered_video_decoder_not_muted:${JSON.stringify(initialMix.runtime)}`);
    await screenshot({ page, report, outDir, name: 'layered_initial_mix_a' });
    await waitFor(page, async ({ id, version, time }) => {
        const decode = await import('/eVe/domains/rendering/bevy_video_decode_source_runtime.js');
        const status = decode.getBevyVideoDecodeStatus(id);
        return {
            ok: status.exists === true && status.active === true
                && status.frameVersion > version && status.currentTime > time,
            status, version, time
        };
    }, {
        id: videoId,
        version: Number(videoReady.status.frameVersion || 0),
        time: Number(videoReady.status.currentTime || 0)
    }, 8000);
    await screenshot({ page, report, outDir, name: 'layered_initial_mix_b' });
    const videoDiff = diffPng(path.join(outDir, 'layered_initial_mix_a.png'), path.join(outDir, 'layered_initial_mix_b.png'));
    assert(videoDiff.differing_pixel_ratio > 0.001,
        `layered_video_frames_static:${JSON.stringify({ videoDiff, initialMix })}`);
    if (process.env.MOLECULE_UI_LAYERED_TRANSITION_ONLY === '1') {
        await enterListMolecule(page, project.id, moleculeId);
        await enterMatrixMolecule(page, project.id, moleculeId, members.length);
        await switchView(page, project.id, 'natural');
        const afterModes = await transportProof(page, moleculeId, project.id);
        assertDepthTransportContinuity(initialMix, [afterModes]);
        if (afterModes.transport?.playing === true) await stopMolecule(page);
        const stoppedAfterModes = await transportProof(page, moleculeId, project.id);
        assert(stoppedAfterModes.voices.length === 0 && stoppedAfterModes.transport?.playing !== true,
            `layered_transition_stop_leak:${JSON.stringify(stoppedAfterModes)}`);
        return {
            project, moleculeId, members, standaloneVideo,
            initialMix: summarizeTransportProof(initialMix),
            afterModes: summarizeTransportProof(afterModes),
            stoppedAfterModes: summarizeTransportProof(stoppedAfterModes), videoDiff,
            transitionOnly: true
        };
    }
    await stopMolecule(page);
    const stoppedInitial = await transportProof(page, moleculeId, project.id);
    assert(stoppedInitial.voices.length === 0 && stoppedInitial.transport?.playing !== true,
        `layered_initial_stop_leak:${JSON.stringify(stoppedInitial)}`);
    if (process.env.MOLECULE_UI_LAYERED_INITIAL_ONLY === '1') {
        return {
            project, moleculeId, members, standaloneVideo,
            initialMix: summarizeTransportProof(initialMix),
            stoppedInitial: summarizeTransportProof(stoppedInitial), videoDiff,
            videoPlaybackEvents: initialMix.videoPlaybackEvents
        };
    }

    const textId = await createTextThroughMenu({ page, projectId: project.id, value: 'TEXTE DEVANT', point: { x: 900, y: 180 } });
    await absorbMember({
        page, project, sourceId: textId, targetId: videoId, report, outDir,
        shotName: 'layered_text_armed', destinationOffset: { y: -55 }
    });
    members.push(textId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);
    const firstTextState = await windowState(page, project.id, videoId, textId);
    assert(firstTextState.stack.text.position > firstTextState.stack.video.position,
        `layered_first_text_not_above_video:${JSON.stringify(firstTextState)}`);
    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    await wait(900);
    const firstTextMix = await transportProof(page, moleculeId, project.id);
    assert(firstTextMix.voices.length === 2 && firstTextMix.voices.every((voice) => voice.active === true),
        `layered_first_text_mix:${JSON.stringify(firstTextMix)}`);
    await screenshot({ page, report, outDir, name: 'layered_first_text_mix' });
    await stopMolecule(page);

    const textTwoId = await createTextThroughMenu({ page, projectId: project.id, value: 'CALQUE 2', point: { x: 900, y: 360 } });
    await absorbMember({
        page, project, sourceId: textTwoId, targetId: videoId, report, outDir,
        shotName: 'layered_text_two_armed', destinationOffset: { y: 55 }
    });
    members.push(textTwoId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    const imageId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.image, expectedKind: 'image' });
    await absorbMember({
        page, project, sourceId: imageId, targetId: videoId, report, outDir,
        shotName: 'layered_image_armed', destinationOffset: { y: 70 }
    });
    members.push(imageId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    const audioTwoId = await importThroughMenu({ page, projectId: project.id, filePath: FIXTURES.secondAudio, expectedKind: 'audio' });
    await absorbMember({ page, project, sourceId: audioTwoId, targetId: videoId, report, outDir, shotName: 'layered_audio_two_armed' });
    members.push(audioTwoId); await reloadBrowserProject(page, project);
    snapshot = await readMolecule(page, members); assertMembership(snapshot, members, moleculeId);

    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    await wait(900);
    const finalMix = await transportProof(page, moleculeId, project.id);
    assert(finalMix.voices.length === 3, `layered_final_voice_count:${JSON.stringify(finalMix)}`);
    assert(finalMix.voices.every((voice) => voice.active === true && Number(voice.gain) > 0),
        `layered_final_voice_inactive:${JSON.stringify(finalMix.voices)}`);
    await screenshot({ page, report, outDir, name: 'layered_final_mix' });

    const structuralTransportSamples = [];
    const extracted = await extractListMember({
        page, project, moleculeId, memberId: textTwoId,
        report, outDir, shotName: ''
    });
    const extractedState = await extractionSnapshot(page, {
        projectId: project.id, moleculeId, memberId: textTwoId
    });
    assert(extractedState.ownerAlive && extractedState.memberParent !== moleculeId
        && extractedState.timeline?.clips?.length === members.length - 1
        && !extractedState.timeline.clips.some((clip) => String(clip.source?.atome_id || '') === textTwoId),
    `layered_middle_extraction_invalid:${JSON.stringify(extractedState)}`);
    structuralTransportSamples.push(await transportProof(page, moleculeId, project.id));
    await absorbListMember({
        page, project, sourceId: textTwoId, targetId: moleculeId, report, outDir,
        shotName: 'layered_reabsorb_middle_member', expectedParentId: moleculeId
    });
    const reabsorbed = await readMolecule(page, members);
    assertMembership(reabsorbed, members, moleculeId);
    structuralTransportSamples.push(await transportProof(page, moleculeId, project.id));
    assertDepthTransportContinuity(finalMix, structuralTransportSamples);

    // The visible hierarchy itself is the depth editor: drag a late member to
    // the first List row, then prove the same canonical order in Matrix and in
    // the Natural compositor while the original transport keeps running.
    const hierarchyReorder = await reorderListMemberToFront({
        page, project, moleculeId, memberId: videoId, memberIds: members, report, outDir
    });
    const hierarchyTransportSamples = [await transportProof(page, moleculeId, project.id)];
    assertDepthTransportContinuity(finalMix, hierarchyTransportSamples);
    if (hierarchyTransportSamples.at(-1)?.transport?.playing === true) await stopMolecule(page);
    await reloadBrowserProject(page, project);
    const hierarchyAfterReload = await verifyReorderedMemberAfterReload({
        page, project, moleculeId, memberId: videoId, memberIds: members,
        txId: hierarchyReorder.persisted.txId
    });
    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    await wait(900);
    const depthBaseline = await transportProof(page, moleculeId, project.id);
    assert(depthBaseline.voices.length === 3 && depthBaseline.voices.every((voice) => voice.active === true),
        `layered_depth_restart_mix_invalid:${JSON.stringify(depthBaseline)}`);

    // Later image/audio additions also have a visual projection. Put the text
    // explicitly at the top first so the following two commands isolate the
    // requested video-versus-text depth contract.
    await applyDepth({ page, projectId: project.id, memberId: textId, action: 'front' });
    const depthTransportSamples = [await transportProof(page, moleculeId, project.id)];
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'front' });
    depthTransportSamples.push(await transportProof(page, moleculeId, project.id));
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'back' });
    depthTransportSamples.push(await transportProof(page, moleculeId, project.id));
    assertDepthTransportContinuity(depthBaseline, depthTransportSamples);
    const activeAfterDepth = depthTransportSamples.at(-1)?.transport?.playing === true;
    if (activeAfterDepth) await stopMolecule(page);

    await screenshot({ page, report, outDir, name: 'layered_text_top' });
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'front' });
    await screenshot({ page, report, outDir, name: 'layered_video_front' });
    const frontState = await windowState(page, project.id, videoId, textId);
    const textTarget = await recordCenter(page, project.id, (record) => record.id === textId, { sceneCoordinates: true });
    await applyDepth({ page, projectId: project.id, memberId: videoId, action: 'back' });
    await screenshot({ page, report, outDir, name: 'layered_video_back' });
    const backState = await windowState(page, project.id, videoId, textId);
    assert(frontState.stack.video.position > frontState.stack.text.position,
        `layered_video_front_order:${JSON.stringify(frontState)}`);
    assert(backState.stack.video.position < backState.stack.text.position,
        `layered_video_back_order:${JSON.stringify(backState)}`);
    const depthDiff = diffPng(path.join(outDir, 'layered_video_front.png'), path.join(outDir, 'layered_video_back.png'));
    assert(depthDiff.differing_pixel_ratio > 0.0005, `layered_depth_pixels_unchanged:${JSON.stringify(depthDiff)}`);
    const depthRegion = {
        x: textTarget.x - (textTarget.width / 2) - 6,
        y: textTarget.y - (textTarget.height / 2) - 6,
        width: textTarget.width + 12,
        height: textTarget.height + 12
    };
    const depthRegionDiff = diffPngRegion(
        path.join(outDir, 'layered_video_front.png'),
        path.join(outDir, 'layered_video_back.png'),
        depthRegion
    );
    assert(depthRegionDiff.differing_pixel_ratio > 0.01 && depthRegionDiff.max_channel_delta > 20,
        `layered_depth_text_region_unchanged:${JSON.stringify(depthRegionDiff)}`);
    await reloadBrowserProject(page, project);
    const persistedBack = await windowState(page, project.id, videoId, textId);
    assert(persistedBack.stack.video.position < persistedBack.stack.text.position,
        `layered_back_not_persisted:${JSON.stringify(persistedBack)}`);

    await openMolecule(page, project.id, videoId, moleculeId);
    await startMoleculePlayback(page, moleculeId, members);
    const naturalEnd = await waitForPlaybackEnd(page, 32000);
    const ended = await transportProof(page, moleculeId, project.id);
    assert(ended.voices.length === 0 && ended.transport?.playing !== true && naturalEnd.state?.playing !== true,
        `layered_natural_end_leak:${JSON.stringify({ ended, naturalEnd })}`);
    return {
        project, moleculeId, members, standaloneVideo, coldImageAudio,
        initialMix: summarizeTransportProof(initialMix),
        firstTextMix: summarizeTransportProof(firstTextMix),
        firstTextState: { stack: firstTextState.stack },
        finalMix: summarizeTransportProof(finalMix),
        stoppedInitial: summarizeTransportProof(stoppedInitial),
        ended: summarizeTransportProof(ended),
        videoDiff, depthDiff, depthRegionDiff,
        depthTransportSamples: depthTransportSamples.map(summarizeTransportProof),
        structuralTransportSamples: structuralTransportSamples.map(summarizeTransportProof),
        hierarchyTransportSamples: hierarchyTransportSamples.map(summarizeTransportProof),
        hierarchyReorder,
        hierarchyAfterReload,
        extracted, extractedState,
        frontState: { stack: frontState.stack },
        backState: { stack: backState.stack },
        persistedBack: { stack: persistedBack.stack }
    };
};

const windowState = (page, projectId, videoId, textId) => page.evaluate(async ({ project, video, text }) => {
    const [videoState, textState, zOrder] = await Promise.all([
        window.Atome.getStateCurrent(video), window.Atome.getStateCurrent(text),
        import('/eVe/intuition/tools/z_order_actions.js')
    ]);
    const neighbours = zOrder.stackNeighbours(project);
    const stackEntry = (id) => {
        const position = neighbours.findIndex((entry) => entry.id === id);
        const entry = position >= 0 ? neighbours[position] : null;
        return { position, zIndex: Number(entry?.zIndex || 0), order: Number(entry?.order || 0) };
    };
    return {
        video: videoState?.properties || videoState?.props || videoState || {},
        text: textState?.properties || textState?.props || textState || {},
        stack: { video: stackEntry(video), text: stackEntry(text) }
    };
}, { project: projectId, video: videoId, text: textId });
