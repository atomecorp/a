
import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, recordCenter, playwrightPointForClientTarget, wait, waitFor, waitForStableScene } from "./molecule_ui_acceptance_support.mjs";
import { drag, screenshot, structuredDropTarget, switchView } from "./molecule_ui_drop_core.mjs";
import { listNode, structuredRows } from "./molecule_ui_drop_playback_support.mjs";



export const readMolecule = async (page, ids) => page.evaluate(async (memberIds) => {
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

export const assertMembership = (snapshot, expectedIds, expectedMoleculeId = '') => {
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

export const absorbMember = async ({
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
        page, source, destination, waypoint, holdMs: 700, compositionChoice: 'front',
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

export const absorbListMember = async ({
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
            layout: 'list', sourceId, targetIndex: targetRow.index, kind: 'combine'
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

export const extractionSnapshot = (page, { projectId, moleculeId, memberId }) => page.evaluate(async (ids) => {
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

export const enterListMolecule = async (page, projectId, moleculeId) => {
    await switchView(page, projectId, 'list');
    const navigation = await page.evaluate(async () => (await import(
        '/eVe/domains/rendering/project_view_navigation.js'
    )).readState());
    if (navigation.current?.entity === 'molecule' && navigation.current?.id === moleculeId) return;
    const rows = await structuredRows(page);
    const row = rows.find((entry) => entry.id === moleculeId && entry.depth === 0);
    assert(row, `layered_list_molecule_row_missing:${JSON.stringify(rows)}`);
    const target = await listNode(page, `project_view_list_entry_${row.index}_preview`);
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

export const enterMatrixMolecule = async (page, projectId, moleculeId, expectedCount = 0) => {
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

export const reorderListMemberToFront = async ({ page, project, moleculeId, memberId, memberIds, report, outDir }) => {
    await enterListMolecule(page, project.id, moleculeId);
    const beforeRows = await structuredRows(page);
    const beforeDepth = await page.evaluate(async (ids) => Promise.all(ids.map(async (id) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || {};
        return { id, z: Number(props.zIndex ?? props.z_index ?? 0), renderLayer: props.renderLayer == null && props.render_layer == null ? null : Number(props.renderLayer ?? props.render_layer) };
    })), memberIds);
    const readPersisted = () => waitFor(page, async ({ projectId, expectedIds, movedId, beforeDepth }) => {
        const rows = (await import('/eVe/domains/rendering/project_view_surface_runtime.js'))
            .readProjectViewSurfaceState().content?.entries || [];
        const rowIds = rows.map((entry) => String(entry.id || ''));
        const states = await Promise.all(expectedIds.map((id) => window.Atome.getStateCurrent(id)));
        const props = (state) => state?.properties || state?.props || state || {};
        const ordered = states.map((state, index) => ({
            id: expectedIds[index], hierarchy: Number(props(state).hierarchy_order),
            z: Number(props(state).zIndex ?? props(state).z_index ?? 0),
            renderLayer: props(state).renderLayer == null && props(state).render_layer == null ? null : Number(props(state).renderLayer ?? props(state).render_layer)
        })).sort((left, right) => left.hierarchy - right.hierarchy);
        const events = await window.Atome.listEvents({ projectId, limit: 500, order: 'desc' });
        const eventProps = (event) => event?.payload?.props || event?.props || {};
        const movedEvent = events.find((event) => String(event?.atome_id || event?.atomeId || '') === movedId
            && Number(eventProps(event).hierarchy_order) === 0);
        const txId = String(movedEvent?.tx_id || movedEvent?.txId || movedEvent?.transaction_id || '');
        const transaction = txId ? events.filter((event) => String(
            event?.tx_id || event?.txId || event?.transaction_id || ''
        ) === txId) : [];
        return {
            ok: rowIds[0] === movedId
                && ordered[0]?.id === movedId
                && ordered.every(item => beforeDepth.some(previous => previous.id === item.id
                    && previous.z === item.z && previous.renderLayer === item.renderLayer))
                && Boolean(txId)
                && transaction.length >= 2,
            rowIds, ordered, txId,
            transaction: transaction.map((event) => ({
                id: String(event?.atome_id || event?.atomeId || ''),
                kind: String(event?.kind || ''), props: eventProps(event)
            }))
        };
    }, { projectId: project.id, expectedIds: memberIds, movedId: memberId, beforeDepth }, 12000);
    const gestureAttempts = [];
    let persisted = null;
    for (let attempt = 1; attempt <= 2 && !persisted; attempt += 1) {
        const currentRows = await structuredRows(page);
        const sourceRow = currentRows.find((entry) => entry.id === memberId);
        assert(sourceRow, `layered_list_reorder_source_missing:${JSON.stringify({ memberId, currentRows })}`);
        if (sourceRow.index > 0) {
            const source = await listNode(page, `project_view_list_entry_${sourceRow.index}_name`);
            const destination = await structuredDropTarget(page, {
                layout: 'list', sourceId: memberId, targetIndex: 0, kind: 'insert', edge: 'before'
            });
            assert(source && destination,
                `layered_list_reorder_targets_missing:${JSON.stringify({ memberId, sourceRow, destination })}`);
            await drag({ page, source, destination, holdMs: 180 });
        }
        try {
            persisted = await readPersisted();
            gestureAttempts.push({ attempt, captured: true });
        } catch (error) {
            gestureAttempts.push({ attempt, captured: false, error: String(error?.message || error) });
            if (attempt >= 2) throw error;
            await enterListMolecule(page, project.id, moleculeId);
        }
    }
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
                id, z: Number(props.zIndex ?? props.z_index ?? 0),
                renderLayer: Number(props.renderLayer ?? props.render_layer ?? 0)
            };
        }).sort((left, right) => right.renderLayer - left.renderLayer);
        return { stack };
    }, { projectId: project.id, expectedIds: memberIds });
    assert(natural.stack.every(item => beforeDepth.some(previous => previous.id === item.id
        && previous.z === item.z && (previous.renderLayer ?? previous.z) === item.renderLayer)),
        `layered_natural_reorder_not_projected:${JSON.stringify({ natural, beforeDepth })}`);
    await screenshot({ page, report, outDir, name: 'layered_natural_reordered_playing' });
    return { beforeRows, beforeDepth, gestureAttempts, persisted, matrixOrder, natural };
};

export const verifyReorderedMemberAfterReload = async ({ page, project, moleculeId, memberId, memberIds, txId, beforeDepth }) => {
    await enterListMolecule(page, project.id, moleculeId);
    const listRows = await structuredRows(page);
    assert(listRows[0]?.id === memberId,
        `layered_list_reorder_not_persisted:${JSON.stringify(listRows)}`);
    const database = await page.evaluate(async ({ projectId, expectedIds, transactionId }) => {
        const states = await Promise.all(expectedIds.map((id) => window.Atome.getStateCurrent(id)));
        const props = (state) => state?.properties || state?.props || state || {};
        const ordered = states.map((state, index) => ({
            id: expectedIds[index], hierarchy: Number(props(state).hierarchy_order),
            z: Number(props(state).zIndex ?? props(state).z_index ?? 0),
            renderLayer: props(state).renderLayer == null && props(state).render_layer == null ? null : Number(props(state).renderLayer ?? props(state).render_layer)
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
        && database.ordered.every(item => beforeDepth.some(previous => previous.id === item.id
            && previous.z === item.z && previous.renderLayer === item.renderLayer)),
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
            z: Number(props.zIndex ?? props.z_index ?? 0),
            renderLayer: Number(props.renderLayer ?? props.render_layer ?? 0)
        };
    }, { projectId: project.id, expectedId: memberId });
    const previousDepth = beforeDepth.find(item => item.id === memberId);
    assert(projected.z === previousDepth.z && projected.renderLayer === (previousDepth.renderLayer ?? previousDepth.z),
        `layered_natural_reorder_not_persisted:${JSON.stringify(projected)}`);
    return { listRows, database, projected };
};

export const extractListMember = async ({ page, project, moleculeId, memberId, report, outDir, shotName }) => {
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
