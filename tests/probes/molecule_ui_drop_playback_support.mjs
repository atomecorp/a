import {
    assert,
    clickCanvasTarget,
    findBevyUiNodeTarget,
    playwrightPointForClientTarget,
    wait,
    waitFor
} from './molecule_ui_acceptance_support.mjs';

// The List grows away from its project row: with the accordion opening upward
// (the default) a level's first item in playback order is its LAST row.
export const listFrontRow = async (page, rows) => {
    const up = await page.evaluate(async () => (await import(
        '/eVe/intuition/runtime/bevy_panel/bevy_panel_accordion_direction.js')).getAccordionDirection() !== 'down');
    return { up, index: up ? rows.length - 1 : 0, edge: up ? 'after' : 'before' };
};

export const structuredRows = (page) => page.evaluate(async () => {
    const [{ readProjectViewSurfaceState }, navigation] = await Promise.all([
        import('/eVe/domains/rendering/project_view_surface_runtime.js'),
        import('/eVe/domains/rendering/project_view_navigation.js')
    ]);
    const state = readProjectViewSurfaceState();
    if (Array.isArray(state.content?.entries)) {
        return state.content.entries.map((entry, index) => ({
            index, id: String(entry.id || ''), depth: Number(entry.depth || 0),
            entity: String(entry.visualRecord?.properties?.molecule_entity || ''), label: String(entry.label || '')
        }));
    }
    const { loadProjectViewRecordsForPlayback } = await import('/eVe/domains/rendering/project_view_records.js');
    const loaded = await loadProjectViewRecordsForPlayback({ projectId: state.projectId });
    if (loaded.ok !== true) throw new Error(loaded.error || 'structured_rows_read_failed');
    const records = loaded.records;
    const { comparePlaybackRecords } = await import('/eVe/domains/rendering/project_view_molecule_list_model.js');
    return navigation.containerChildren(records).sort(comparePlaybackRecords).map((record, index) => ({
        index,
        id: String(record?.id || record?.atome_id || ''),
        depth: 0,
        entity: String(record?.properties?.molecule_entity || ''),
        label: String(record?.properties?.name || record?.name || '')
    }));
});

export const listNode = (page, nodeId) => findBevyUiNodeTarget(page, {
    nodeId, treeId: 'eve_bevy_ui_project_view', step: 2
});

export const listIndex = async (page, id) => (
    (await structuredRows(page)).find((row) => row.id === id)?.index ?? -1
);

export const expandCanonicalListMolecule = async (page, memberIds) => {
    const clickChevronFor = async (predicate) => {
        let lastRows = [];
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const rows = await structuredRows(page);
            lastRows = rows;
            const row = rows.find(predicate);
            assert(row, `list_expand_row_missing:${JSON.stringify(rows)}`);
            const alreadyExpanded = rows.some((candidate, index) => (
                index < row.index && candidate.depth === row.depth + 1 && memberIds.includes(candidate.id)
            ));
            if (alreadyExpanded) return row;
            const target = await listNode(page, `project_view_list_entry_${row.index}_hierarchy_chevron`);
            assert(target, `list_expand_chevron_missing:${row.index}`);
            await clickCanvasTarget(page, target);
            for (let sample = 0; sample < 20; sample += 1) {
                await wait(100);
                const projected = await structuredRows(page);
                lastRows = projected;
                if (projected.some((candidate, index) => (
                    index < projected.findIndex(entry => entry.id === row.id) && candidate.depth === row.depth + 1 && memberIds.includes(candidate.id)
                ))) return row;
            }
        }
        throw new Error(`list_expand_direct_members_missing:${JSON.stringify(lastRows)}`);
    };
    await clickChevronFor((row) => row.entity === 'molecule');
    const rows = await structuredRows(page);
    assert(memberIds.every((id) => rows.some((row) => row.id === id && row.depth === 1)),
        `list_members_not_expanded:${JSON.stringify(rows)}`);
    assert(memberIds.every((id) => !rows.some((row) => row.id === id && row.depth === 0)),
        `list_member_floating_at_root:${JSON.stringify(rows)}`);
    assert(!rows.some((row) => row.entity === 'section' || row.entity === 'track'),
        `list_internal_timeline_leaked:${JSON.stringify(rows)}`);
    return rows;
};

// Why a node is not actionable: its laid-out boxes, whether its tree is
// suspended, and what the hit test answers at each box centre.
export const explainBevyUiNodeTarget = (page, { nodeId = '', treeId = '' } = {}) => page.evaluate(async ({ expectedId, expectedTree }) => {
    const surface = document.getElementById('eve_surface_project');
    const runtime = window.eveBevyUiRuntime;
    const rect = surface?.getBoundingClientRect?.();
    if (!surface || !runtime || !rect) return { ok: false, error: 'surface_or_runtime_missing' };
    const { nodeBox, layoutForNodeCached } = await import('/eVe/domains/rendering/bevy_ui_layout_runtime.js');
    const found = [];
    const visit = (node, parentBox = null, forcedBox = null) => {
        if (!node) return;
        const box = forcedBox || nodeBox(node, parentBox);
        if (node.id === expectedId) found.push(box);
        const boxes = layoutForNodeCached(node, box).childBoxes;
        (node.children || []).forEach((child, index) => visit(child, box, boxes[index]));
    };
    const entry = runtime.state.trees.get(expectedTree);
    if (entry) visit(entry.tree.root);
    return {
        tree_mounted: Boolean(entry), same_surface: entry?.surface === surface,
        suspended: runtime.state.suspendedTrees.has(expectedTree),
        surface: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        boxes: found.map((box) => {
            const x = rect.left + box.x + box.width / 2;
            const y = rect.top + box.y + box.height / 2;
            const hit = runtime.hitTestAtClientPoint?.({ surface, clientX: x, clientY: y });
            return { box, center: { x, y }, hit: hit ? { nodeId: hit.nodeId, treeId: hit.treeId } : null };
        })
    };
}, { expectedId: String(nodeId || ''), expectedTree: String(treeId || '') });

const findContextualTool = async (page, ids) => {
    for (const nodeId of ids) {
        const target = await findBevyUiNodeTarget(page, {
            nodeId, treeId: 'eve_bevy_panel_atome_contextual_edit', step: 2
        });
        if (target) return target;
    }
    return null;
};

// A tool laid out beyond the rail's viewport is reached the way a user reaches
// it: the wheel over the rail scrolls it (atome_contextual_edit_handlers.js).
export const contextualTool = async (page, ids) => {
    let target = await findContextualTool(page, ids);
    for (let attempt = 0; !target && attempt < 8; attempt += 1) {
        const plan = await page.evaluate(async (expectedIds) => {
            const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
            const rail = registry.getAtomeContextualEditApi()?.readState?.()?.railLayout || null;
            const { nodeBox, layoutForNodeCached } = await import('/eVe/domains/rendering/bevy_ui_layout_runtime.js');
            const entry = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_panel_atome_contextual_edit');
            let box = null;
            const visit = (node, parentBox = null, forcedBox = null) => {
                if (!node || box) return;
                const own = forcedBox || nodeBox(node, parentBox);
                if (expectedIds.includes(node.id)) { box = own; return; }
                const boxes = layoutForNodeCached(node, own).childBoxes;
                (node.children || []).forEach((child, index) => visit(child, own, boxes[index]));
            };
            if (entry) visit(entry.tree.root);
            if (!rail || !box) return null;
            const surface = document.getElementById('eve_surface_project')?.getBoundingClientRect?.();
            const center = { x: (surface?.left || 0) + rail.x + rail.itemSize / 2, y: (surface?.top || 0) + rail.y + (rail.railHeight || rail.itemSize) / 2 };
            return { center, deltaY: box.y > rail.y ? 120 : -120 };
        }, ids);
        if (!plan) break;
        await page.mouse.move(plan.center.x, plan.center.y);
        await page.mouse.wheel(0, plan.deltaY);
        await wait(220);
        target = await findContextualTool(page, ids);
    }
    // A scrolled rail settles (snap) after the wheel: return the case once its
    // position holds, so the click lands where it is found.
    for (let settle = 0; target && settle < 10; settle += 1) {
        await wait(120);
        const again = await findContextualTool(page, ids);
        if (again && Math.abs(again.x - target.x) < 1 && Math.abs(again.y - target.y) < 1) return again;
        target = again;
    }
    return target;
};

export const moleculePlayTool = async (page) => {
    const ids = [
        'atome_contextual_tool_container_play', 'atome_contextual_tool_play',
        'atome_contextual_tool_molecule_play'
    ];
    await waitFor(page, (expectedIds) => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
        const interactive = (tree?.interactiveNodes || []).map((entry) => String(entry.id || entry));
        return { ok: expectedIds.some((id) => interactive.includes(id)), interactive };
    }, ids);
    return contextualTool(page, ids);
};

export const memberPlayTool = async (page) => {
    await waitFor(page, async () => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
        const ids = (tree?.interactiveNodes || []).map((entry) => String(entry.id || entry));
        const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
        const rail = registry.getAtomeContextualEditApi()?.readState?.() || {};
        const { getCurrentSelectionIds } = await import('/eVe/intuition/runtime/selection.js');
        return { ok: ids.includes('atome_contextual_tool_play'), ids: ids.filter((id) => !id.endsWith('_background')),
            rail: { activeAtomeId: rail.activeAtomeId, activeKind: rail.activeKind, contextLevel: rail.contextLevel, railOnly: rail.railOnly },
            selection: getCurrentSelectionIds() };
    });
    return contextualTool(page, ['atome_contextual_tool_play']);
};

export const selectListRow = async (page, id) => {
    const located = await waitFor(page, async (expectedId) => {
        const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
        const state = readProjectViewSurfaceState();
        const rows = (state.content?.entries || []).map((entry, index) => ({
            index, id: String(entry.id || ''), depth: Number(entry.depth || 0), label: String(entry.label || '')
        }));
        const index = rows.find((row) => row.id === expectedId)?.index ?? -1;
        return {
            ok: index >= 0,
            index,
            mode: state.mode,
            projectId: state.projectId,
            contentProjectId: state.content?.projectId || '',
            recordCount: Number(state.content?.recordCount || 0),
            rows
        };
    }, id);
    const index = located.index;
    const target = await listNode(page, `project_view_list_entry_${index}_name`);
    assert(target, `list_select_target_missing:${id}`);
    const before = await page.evaluate(async (expected) => {
        const [{ getAtomeContextualEditApi }, selection] = await Promise.all([
            import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js'),
            import('/eVe/intuition/runtime/selection.js')
        ]);
        return {
            active: getAtomeContextualEditApi()?.readState?.()?.activeAtomeId === expected,
            selected: selection.getCurrentSelectionIds().includes(expected)
        };
    }, id);
    if (before.active) return target;
    if (before.selected) {
        await clickCanvasTarget(page, target);
        await wait(180);
    }
    await clickCanvasTarget(page, target);
    await waitForContextualTarget(page, id);
    await wait(350);
    return target;
};

export const playbackSnapshot = (page, ids = []) => page.evaluate(async (memberIds) => {
    const [{ projectViewTransport }, progress] = await Promise.all([
        import('/eVe/domains/rendering/project_view_transport_runtime.js'),
        import('/eVe/domains/media/project_audio_playback_progress_runtime.js')
    ]);
    const state = projectViewTransport.read();
    return { ...state, playingIds: state.activeLeafIds,
        progress: Object.fromEntries(memberIds.map((id) => [id, progress.readProjectAudioPlaybackProgressForId(id)])) };
}, ids);

const readMoleculePlaybackRule = (page, moleculeId) => page.evaluate(async (id) => {
    const { resolvePlaybackRule } = await import('/eVe/domains/rendering/project_view_playback_rules.js');
    return resolvePlaybackRule({ level: { entity: 'molecule', id, ownerId: id }, stack: [] });
}, moleculeId);

// The play-mode palette lives on the List/Matrix rail; a Molecule already under
// the requested rule needs no change (a canvas group rail has no such palette).
export const chooseMoleculePlaybackMode = async (page, moleculeId, mode) => {
    mode = mode === 'layer' ? 'simultaneous' : mode;
    const current = await readMoleculePlaybackRule(page, moleculeId);
    if (current.mode === mode) return current;
    const palette = await contextualTool(page, ['atome_contextual_tool_container_play_mode']);
    assert(palette, `molecule_play_mode_palette_missing:${mode}`);
    await clickCanvasTarget(page, palette);
    const option = await waitFor(page, async (expected) => {
        const diagnostics = window.eveBevyUiRuntime?.readOverlayDiagnostics?.() || {};
        const tree = (diagnostics.trees || []).find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
        const id = (tree?.interactiveNodes || []).map((entry) => String(entry.id || entry))
            .find((candidate) => candidate.startsWith('atome_contextual_tool_')
                && candidate.includes('_play_') && candidate.endsWith(`_${expected}`));
        return { ok: Boolean(id), id, interactive: tree?.interactiveNodes || [] };
    }, mode);
    const target = await contextualTool(page, [option.id]);
    assert(target, `molecule_play_option_not_actionable:${mode}:${option.id}`);
    await clickCanvasTarget(page, target);
    const rule = await waitFor(page, async ({ id, expected }) => {
        const { resolvePlaybackRule } = await import('/eVe/domains/rendering/project_view_playback_rules.js');
        const value = await resolvePlaybackRule({ level: { entity: 'molecule', id, ownerId: id }, stack: [] });
        return { ok: value.mode === expected, value };
    }, { id: moleculeId, expected: mode });
    return rule.value;
};

// A Molecule plays on one of two owners: the project view's transport (List,
// Matrix, a structured rail) or, opened on the canvas in `simultaneous`, its own
// native transport (project_view_molecule_info.js#playMoleculeContextualOwner).
export const moleculePlaybackState = (page, moleculeId) => page.evaluate(async (id) => {
    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
    const { ensureMoleculeEngine } = await import('/eVe/core/media_engine/molecule.js');
    const view = projectViewTransport.read();
    if (view.playing && view.selectionIds.includes(id)) {
        return { owner: 'project_view', playing: true, status: view.status, activeIds: view.activeLeafIds };
    }
    const session = ensureMoleculeEngine().getSession(`molecule_transport_${id}`);
    const native = session?.getTransportState?.() || null;
    if (native?.playing) {
        return { owner: 'molecule', playing: true, status: 'playing', activeIds: (session.getState().active_clips || []).map((clip) => clip.id) };
    }
    return { owner: '', playing: false, status: view.status, native };
}, moleculeId);

export const startMoleculePlayback = async (page, moleculeId, memberIds) => {
    const play = await moleculePlayTool(page);
    if (!play) {
        const explained = await Promise.all(['atome_contextual_tool_container_play', 'atome_contextual_tool_play', 'atome_contextual_tool_molecule_play']
            .map(async (nodeId) => ({ nodeId, ...(await explainBevyUiNodeTarget(page, { nodeId, treeId: 'eve_bevy_panel_atome_contextual_edit' })) })));
        assert(false, `molecule_play_tool_not_actionable:${JSON.stringify(explained.filter((entry) => entry.boxes?.length))}`);
    }
    const transportBefore = await page.evaluate(async () => {
        const t = (await import('/eVe/domains/rendering/project_view_transport_runtime.js')).projectViewTransport.read();
        return { status: t.status, rootId: t.rootId, selectionIds: t.selectionIds, position: t.positionSeconds };
    });
    const hitBefore = await page.evaluate(({ x, y }) => {
        const hit = window.eveBevyUiRuntime?.hitTestAtClientPoint?.({ surface: document.getElementById('eve_surface_project'), clientX: x, clientY: y });
        return hit ? { nodeId: hit.nodeId, treeId: hit.treeId } : null;
    }, play);
    await clickCanvasTarget(page, play);
    const started = await waitFor(page, async ({ id, members }) => {
        const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
        const { ensureMoleculeEngine } = await import('/eVe/core/media_engine/molecule.js');
        const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
        const rail = registry.getAtomeContextualEditApi()?.readState?.() || {};
        const state = projectViewTransport.read();
        const native = ensureMoleculeEngine().getSession(`molecule_transport_${id}`);
        const nativePlaying = native?.getTransportState?.().playing === true && (native.getState().active_clips || []).length > 0;
        return { ok: (state.playing && state.selectionIds.includes(id)
            && state.activeLeafIds.some((item) => members.includes(item))) || nativePlaying, state, nativePlaying,
            rail: { activeAtomeId: rail.activeAtomeId, activeKind: rail.activeKind, palette: rail.activePaletteKey, scroll: rail.railScrollOffset },
            failures: (window.__eveToolFailures || []).slice(-3),
            routing: (window.atome?.tools?.gatewayRoutingLog || []).slice(-4).map((entry) => JSON.stringify(entry).slice(0, 400)) };
    }, { id: moleculeId, members: memberIds }).catch(async (error) => {
        const handlerKeys = await page.evaluate(() => {
            const handlers = window.eveBevyUiRuntime?.state?.handlers;
            const prefix = 'eve_bevy_panel_atome_contextual_edit:atome_contextual_tool_play:';
            window.__probePlayCalls = [];
            const keys = [...(handlers?.keys?.() || [])].filter((key) => key.startsWith(prefix));
            keys.forEach((key) => {
                const handler = handlers.get(key);
                handlers.set(key, (...args) => { window.__probePlayCalls.push(key.slice(prefix.length)); return handler(...args); });
            });
            return keys.map((key) => key.slice(prefix.length));
        });
        await clickCanvasTarget(page, play);
        await wait(1500);
        const context = await page.evaluate(async () => {
            const selection = await import('/eVe/intuition/runtime/selection.js');
            const navigation = await import('/eVe/domains/rendering/project_view_navigation.js');
            const surface = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
            const nav = navigation.readState();
            return { selection: selection.getCurrentSelectionIds(), current: nav.current, container: navigation.currentContainerId(),
                mode: surface.readProjectViewSurfaceState().mode, project: window.__eveWorkspaceMode?.projectId };
        });
        const second = await page.evaluate(() => ({ calls: window.__probePlayCalls,
            routing: (window.atome?.tools?.gatewayRoutingLog || []).slice(-2).map((entry) => `${entry.route}:${entry.tool_id}`) }));
        throw new Error(`${error.message}:clicked:${JSON.stringify({ moleculeId, transportBefore, play, hitBefore, handlerKeys, second, context })}`);
    });
    return started.state;
};

export const waitForPlaybackEnd = (page, timeoutMs) => waitFor(page, async () => {
    const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
    const state = projectViewTransport.read();
    return { ok: !state.playing && ['ended', 'stopped'].includes(state.status), state };
}, null, timeoutMs);

export const disarmMemberPlayback = async (page) => {
    const state = await playbackSnapshot(page);
    if (!state.playing) return state;
    const stop = await memberPlayTool(page);
    assert(stop, 'member_stop_tool_missing');
    await clickCanvasTarget(page, stop);
    return waitForPlaybackEnd(page, 5000);
};

export const waitForContextualTarget = (page, id) => waitFor(page, async (expected) => {
    const { getAtomeContextualEditApi } = await import(
        '/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js'
    );
    const state = getAtomeContextualEditApi()?.readState?.() || {};
    return { ok: state.activeAtomeId === expected, state };
}, id);

export const assertNoParasites = (page, projectId, memberIds) => page.evaluate(async ({ pid, ids }) => {
    const scene = window.eveToolBase?.getProjectSceneState?.(pid) || {};
    const records = scene.records || [];
    const rootMembers = records.filter((record) => ids.includes(String(record.id || record.atome_id || ''))
        && !String(record.parent_id || record.properties?.parent_id || record.meta?.parent_id || ''))
        .map((record) => record.id || record.atome_id);
    const overlayIds = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
        .flatMap((tree) => tree.overlayRecordIds || []).map(String);
    return {
        ok: document.querySelectorAll('canvas#eve_surface_project').length === 1
            && document.querySelectorAll('[id^="eve-atome_"]').length === 0
            && rootMembers.length === 0
            && !overlayIds.some((id) => id.includes('drag_preview')),
        canvasCount: document.querySelectorAll('canvas#eve_surface_project').length,
        authoritativeDomCount: document.querySelectorAll('[id^="eve-atome_"]').length,
        rootMembers, dragPreviews: overlayIds.filter((id) => id.includes('drag_preview'))
    };
}, { pid: projectId, ids: memberIds });
