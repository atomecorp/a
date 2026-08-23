import {
    assert,
    clickCanvasTarget,
    findBevyUiNodeTarget,
    playwrightPointForClientTarget,
    wait,
    waitFor
} from './molecule_ui_acceptance_support.mjs';

export const structuredRows = (page) => page.evaluate(async () => {
    const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
    const state = readProjectViewSurfaceState();
    return (state.content?.entries || []).map((entry, index) => ({
        index, id: String(entry.id || ''), depth: Number(entry.depth || 0),
        entity: String(entry.visualRecord?.properties?.molecule_entity || ''), label: String(entry.label || '')
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
        const rows = await structuredRows(page);
        const row = rows.find(predicate);
        assert(row, `list_expand_row_missing:${JSON.stringify(rows)}`);
        const target = await listNode(page, `project_view_list_entry_${row.index}_hierarchy_chevron`);
        assert(target, `list_expand_chevron_missing:${row.index}`);
        await clickCanvasTarget(page, target);
        await wait(250);
        return row;
    };
    await clickChevronFor((row) => row.entity === 'molecule');
    await clickChevronFor((row) => row.entity === 'section');
    let rows = await structuredRows(page);
    for (const track of rows.filter((row) => row.entity === 'track')) {
        const target = await listNode(page, `project_view_list_entry_${track.index}_hierarchy_chevron`);
        if (target) { await clickCanvasTarget(page, target); await wait(180); }
        rows = await structuredRows(page);
        if (memberIds.every((id) => rows.some((row) => row.id === id))) break;
    }
    rows = await structuredRows(page);
    assert(memberIds.every((id) => rows.some((row) => row.id === id && row.depth >= 3)),
        `list_members_not_expanded:${JSON.stringify(rows)}`);
    assert(memberIds.every((id) => !rows.some((row) => row.id === id && row.depth === 0)),
        `list_member_floating_at_root:${JSON.stringify(rows)}`);
    return rows;
};

export const contextualTool = async (page, ids) => {
    for (const nodeId of ids) {
        const target = await findBevyUiNodeTarget(page, {
            nodeId, treeId: 'eve_bevy_panel_atome_contextual_edit', step: 2
        });
        if (target) return target;
    }
    return null;
};

export const moleculePlayTool = (page) => contextualTool(page, [
    'atome_contextual_tool_container_play', 'atome_contextual_tool_play',
    'atome_contextual_tool_molecule_play'
]);

export const memberPlayTool = async (page) => {
    await waitFor(page, async () => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_panel_atome_contextual_edit');
        const ids = (tree?.interactiveNodes || []).map((entry) => String(entry.id || entry));
        return { ok: ids.includes('atome_contextual_tool_play'), ids };
    });
    return contextualTool(page, ['atome_contextual_tool_play']);
};

export const selectListRow = async (page, id) => {
    const index = await listIndex(page, id);
    assert(index >= 0, `list_select_row_missing:${id}`);
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
    const [{ projectViewPlayback }, progress] = await Promise.all([
        import('/eVe/domains/rendering/project_view_playback_runtime.js'),
        import('/eVe/domains/media/project_audio_playback_progress_runtime.js')
    ]);
    const state = projectViewPlayback.readState();
    return {
        playing: state.playing === true,
        scope: String(state.scope || ''),
        playingIds: state.playingIds.map(String),
        armed: state.armed === true,
        progress: Object.fromEntries(memberIds.map((id) => [id,
            progress.readProjectAudioPlaybackProgressForId(id)]))
    };
}, ids);

export const chooseMoleculePlaybackMode = async (page, moleculeId, mode) => {
    const play = await moleculePlayTool(page);
    assert(play, `molecule_play_tool_missing:${mode}`);
    const point = await playwrightPointForClientTarget(page, play);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await wait(750);
    await page.mouse.up();
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

export const startMoleculePlayback = async (page, moleculeId, memberIds) => {
    const play = await moleculePlayTool(page);
    assert(play, 'molecule_play_tool_not_actionable');
    await clickCanvasTarget(page, play);
    const started = await waitFor(page, async ({ id, members }) => {
        const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
        const state = projectViewPlayback.readState();
        return {
            ok: state.playing === true && state.scope === `molecule:${id}`
                && (state.playingIds.length === 0 || state.playingIds.some((item) => members.includes(item))),
            state
        };
    }, { id: moleculeId, members: memberIds });
    return started.state;
};

export const waitForPlaybackEnd = (page, timeoutMs) => waitFor(page, async () => {
    const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
    const state = projectViewPlayback.readState();
    return { ok: state.playing !== true && state.playingIds.length === 0, state };
}, null, timeoutMs);

export const disarmMemberPlayback = async (page) => {
    const state = await playbackSnapshot(page);
    if (!state.armed) return state;
    const stop = await memberPlayTool(page);
    assert(stop, 'member_stop_tool_missing');
    await clickCanvasTarget(page, stop);
    const stopped = await waitFor(page, async () => {
        const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
        const value = projectViewPlayback.readState();
        return { ok: value.playing !== true && value.armed !== true && value.playingIds.length === 0, value };
    });
    return stopped.value;
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
