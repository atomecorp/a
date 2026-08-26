import {
    assert, awaitBevyUiNodeTarget, clickCanvasTarget,
    diffPngRegion, visibleMenuTool, wait, waitFor, waitForStableScene
} from './molecule_ui_acceptance_support.mjs';
import { createDropFixture, screenshot, switchView } from './molecule_ui_drop_core.mjs';
import { validateListMoleculeDrop } from './molecule_ui_drop_list.mjs';
import {
    contextualTool, disarmMemberPlayback, memberPlayTool, selectListRow, structuredRows
} from './molecule_ui_drop_playback_support.mjs';
import {
    absorbListMember, enterListMolecule, extractListMember, reloadBrowserProject, reorderListMemberToFront
} from './molecule_ui_layered_media.mjs';

const textRecords = (page, projectId) => page.evaluate((pid) => (
    (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).filter((record) => {
        const props = record?.properties || record?.props || {};
        const id = String(record?.id || record?.atome_id || '');
        return id && !id.startsWith('__eve_')
            && String(record?.type || record?.kind || props.kind || props.type || '').toLowerCase().includes('text');
    }).map((record) => ({
        id: String(record?.id || record?.atome_id || ''),
        parentId: String(record?.parent_id || record?.parentId || record?.properties?.parent_id || ''),
        text: String(record?.properties?.text || record?.text || ''),
        width: Number(record?.properties?.width || 0),
        height: Number(record?.properties?.height || 0)
    }))
), projectId);

const createListMolecule = async ({ page, ensureProject, report, outDir, label }) => {
    const project = await ensureProject(page, `${label} ${Date.now()}`);
    assert(project?.ok && project.id, `focused_project_create_failed:${JSON.stringify(project)}`);
    const fixture = await createDropFixture(page, project.id, `focused_${Date.now()}`);
    const created = await validateListMoleculeDrop({ page, project, fixture, report, outDir });
    const moleculeId = String(created?.molecule?.sourceParent || '');
    assert(moleculeId, `focused_molecule_missing:${JSON.stringify(created)}`);
    return { project, fixture, moleculeId };
};

const playAndStopMember = async ({ page, memberId }) => {
    await selectListRow(page, memberId);
    const play = await memberPlayTool(page);
    assert(play, `focused_member_play_missing:${memberId}`);
    await clickCanvasTarget(page, play);
    const started = await waitFor(page, async (id) => {
        const { projectViewPlayback } = await import('/eVe/domains/rendering/project_view_playback_runtime.js');
        const state = projectViewPlayback.readState();
        return { ok: state.playing === true && state.playingIds.includes(id), state };
    }, memberId);
    await disarmMemberPlayback(page);
    return started.state;
};

const deleteMemberThroughRail = async ({ page, projectId, moleculeId, memberId, remainingIds }) => {
    await enterListMolecule(page, projectId, moleculeId);
    await selectListRow(page, memberId);
    const deleteTool = await contextualTool(page, ['atome_contextual_tool_delete']);
    assert(deleteTool, `focused_member_delete_tool_missing:${memberId}`);
    await clickCanvasTarget(page, deleteTool);
    return waitFor(page, async ({ pid, owner, removed, expected }) => {
        const [ownerState, removedState] = await Promise.all([
            window.Atome.getStateCurrent(owner).catch(() => null),
            window.Atome.getStateCurrent(removed).catch(() => null)
        ]);
        const props = ownerState?.properties || ownerState?.props || {};
        const timeline = props.molecule_timeline || ownerState?.molecule_timeline || null;
        const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
        const ids = records.map((record) => String(record?.id || record?.atome_id || ''));
        const [{ readProjectViewSurfaceState }, selection] = await Promise.all([
            import('/eVe/domains/rendering/project_view_surface_runtime.js'),
            import('/eVe/intuition/runtime/selection.js')
        ]);
        const rows = (readProjectViewSurfaceState().content?.entries || []).map((entry) => String(entry?.id || ''));
        const projectedRemaining = expected.filter((id) => rows.includes(id) || ids.includes(id));
        const ownerProjected = ids.includes(owner);
        const events = await window.Atome.listEvents({ projectId: pid, limit: 30, order: 'desc' });
        const eventAtomeId = (event) => String(event?.atome_id || event?.atomeId || '');
        const eventKind = (event) => String(event?.kind || '');
        const eventTxId = (event) => String(event?.tx_id || event?.txId || '');
        const memberDeleteEvents = events.filter((event) => eventAtomeId(event) === removed
            && eventKind(event) === 'delete' && eventTxId(event));
        const ownerDeleteEvents = events.filter((event) => eventAtomeId(event) === owner
            && eventKind(event) === 'delete' && eventTxId(event));
        const removedProps = removedState?.properties || removedState?.props || {};
        const removedDeleted = removedState?.__deleted === true
            || Boolean(removedState?.deleted_at || removedState?.deletedAt)
            || removedProps.__deleted === true
            || Boolean(removedProps.deleted_at || removedProps.deletedAt);
        return {
            ok: expected.length
                ? ownerProjected
                    && !ids.includes(removed)
                    && removedDeleted
                    && memberDeleteEvents.length === 1
                    && projectedRemaining.length === expected.length
                    && Array.isArray(timeline?.clips)
                    && timeline.clips.map((clip) => String(clip?.source?.atome_id || '')).every((id) => expected.includes(id))
                    && !timeline.clips.some((clip) => String(clip?.source?.atome_id || '') === removed)
                : !ownerProjected && !ids.includes(removed)
                    && removedDeleted && memberDeleteEvents.length === 1 && ownerDeleteEvents.length === 1,
            ownerProjected, projectedRemaining, ownerReadable: Boolean(ownerState),
            removedReadable: Boolean(removedState), clipIds: timeline?.clips?.map((clip) => clip?.source?.atome_id) || [],
            removedDeleted, memberDeleteTxIds: memberDeleteEvents.map(eventTxId),
            ownerDeleteTxIds: ownerDeleteEvents.map(eventTxId),
            rows, selectedIds: selection.getCurrentSelectionIds(),
            ownerState: ownerState ? {
                id: ownerState.id || ownerState.atome_id || '', type: ownerState.type || ownerState.atome_type || '',
                parentId: ownerState.parent_id || ownerState.parentId || '', props
            } : null,
            removedState: removedState ? {
                id: removedState.id || removedState.atome_id || '', type: removedState.type || removedState.atome_type || '',
                parentId: removedState.parent_id || removedState.parentId || '', properties: removedState.properties || removedState.props || {}
            } : null,
            recentEvents: events.slice(0, 12).map((event) => ({
                id: event.atome_id || event.atomeId || '', kind: event.kind || '', txId: event.tx_id || event.txId || '',
                props: event.payload?.props || event.props || {}
            }))
        };
    }, { pid: projectId, owner: moleculeId, removed: memberId, expected: remainingIds });
};

const runOrderExtractionDelete = async ({ page, ensureProject, report, outDir }) => {
    const { project, fixture, moleculeId } = await createListMolecule({
        page, ensureProject, report, outDir, label: 'Molecule order delete'
    });
    const memberIds = [fixture.audioId, fixture.imageId];
    const firstOrder = await reorderListMemberToFront({
        page, project, moleculeId, memberId: fixture.imageId, memberIds, report, outDir
    });
    const extracted = await extractListMember({
        page, project, moleculeId, memberId: fixture.imageId, report, outDir,
        shotName: 'focused_member_extracted'
    });
    await switchView(page, project.id, 'list');
    const extractedPlayback = await playAndStopMember({ page, memberId: fixture.imageId });
    await absorbListMember({
        page, project, sourceId: fixture.imageId, targetId: moleculeId, report, outDir,
        shotName: 'focused_member_reabsorbed', expectedParentId: moleculeId
    });
    const reabsorbedTimeline = await waitFor(page, async ({ owner, members }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const props = state?.properties || state?.props || {};
        const clipIds = (props.molecule_timeline?.clips || state?.molecule_timeline?.clips || [])
            .map((clip) => String(clip?.source?.atome_id || '')).filter(Boolean);
        return { ok: members.every((id) => clipIds.includes(id)), clipIds };
    }, { owner: moleculeId, members: memberIds });
    const secondOrder = await reorderListMemberToFront({
        page, project, moleculeId, memberId: fixture.audioId, memberIds, report, outDir
    });
    const firstDelete = await deleteMemberThroughRail({
        page, projectId: project.id, moleculeId, memberId: fixture.imageId, remainingIds: [fixture.audioId]
    });
    const finalDelete = await deleteMemberThroughRail({
        page, projectId: project.id, moleculeId, memberId: fixture.audioId, remainingIds: []
    });
    await screenshot({ page, report, outDir, name: 'focused_molecule_deleted_after_last_member' });
    return {
        project, moleculeId, firstOrder, extracted, extractedPlayback,
        reabsorbedTimeline, secondOrder, firstDelete, finalDelete
    };
};

const assertCodeEditorClosed = async ({ page, report, outDir, stage }) => {
    const state = await page.evaluate(() => ({
        apiOpen: window.eveCodeToolApi?.isOpen?.() === true,
        editorCount: document.querySelectorAll('.sq-editor').length
    }));
    if (state.apiOpen || state.editorCount > 0) {
        await screenshot({ page, report, outDir, name: `focused_unexpected_code_editor_${stage}` });
        throw new Error(`focused_unexpected_code_editor:${stage}:${JSON.stringify(state)}`);
    }
    return state;
};

const activateCreateText = async ({ page, projectId, report, outDir }) => {
    await assertCodeEditorClosed({ page, report, outDir, stage: 'before_create' });
    let opened = false;
    for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
        await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'create'));
        opened = await waitFor(page, async () => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const measure = getMainMenuRuntime()?.measure?.() || {};
            return { ok: measure.activePaletteKey === 'create' && measure.paletteMotionActive === false, measure };
        }, null, 3000).then(() => true).catch(() => false);
        if (!opened) await wait(250);
    }
    assert(opened, 'focused_create_palette_not_opened');
    await assertCodeEditorClosed({ page, report, outDir, stage: 'palette_open' });
    const textToolTarget = await visibleMenuTool(page, projectId, 'text_create');
    await clickCanvasTarget(page, textToolTarget);
    const editor = page.locator('#eve_hidden_text_service [data-role="active-text-editor"]');
    await editor.waitFor({ state: 'attached', timeout: 10000 });
    await assertCodeEditorClosed({ page, report, outDir, stage: 'text_active' });
    return editor;
};

const closeCreateText = async ({ page, projectId, editor }) => {
    await editor.press('Tab');
    await waitFor(page, () => ({
        ok: !document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]')
    }));
    await clickCanvasTarget(page, await visibleMenuTool(page, projectId, 'text_create'));
    await waitFor(page, () => ({ ok: window.__eveTextTool?.isActive?.() !== true }));
};

const runMultilineCreation = async ({ page, ensureProject, report, outDir }) => {
    const { project, moleculeId } = await createListMolecule({
        page, ensureProject, report, outDir, label: 'Molecule multiline text'
    });
    await enterListMolecule(page, project.id, moleculeId);
    const before = await textRecords(page, project.id);
    const editor = await activateCreateText({ page, projectId: project.id, report, outDir });
    await editor.type('Alpha');
    await editor.press('Enter');
    await editor.type('Beta');
    await editor.press('Enter');
    await editor.press('Enter');
    await editor.type('Gamma');
    const expected = 'Alpha\nBeta\n\nGamma';
    const live = await waitFor(page, async ({ pid, known, value, parent }) => {
        const activeEditor = document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]');
        const records = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).filter((record) => {
            const props = record?.properties || record?.props || {};
            const id = String(record?.id || record?.atome_id || '');
            return String(record?.type || record?.kind || props.kind || '').toLowerCase().includes('text')
                && id && !id.startsWith('__eve_') && !known.includes(id);
        });
        const record = records[0] || null;
        return {
            ok: activeEditor?.value === value && records.length === 1
                && String(record?.parent_id || record?.properties?.parent_id || '') === parent,
            editorValue: activeEditor?.value || '', count: records.length,
            id: String(record?.id || record?.atome_id || ''), height: Number(record?.properties?.height || 0)
        };
    }, { pid: project.id, known: before.map((entry) => entry.id), value: expected, parent: moleculeId });
    await closeCreateText({ page, projectId: project.id, editor });
    const committed = await waitFor(page, async ({ id, value, parent }) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || {};
        return {
            ok: String(props.text || '') === value
                && String(state?.parent_id || state?.parentId || state?.meta?.parent_id
                    || state?.meta?.parentId || props.parent_id || props.parentId || '') === parent
                && Number(props.height || 0) > 24,
            text: props.text || '', height: Number(props.height || 0),
            parentId: state?.parent_id || state?.parentId || state?.meta?.parent_id
                || state?.meta?.parentId || props.parent_id || props.parentId || ''
        };
    }, { id: live.id, value: expected, parent: moleculeId });
    const secondEditor = await activateCreateText({ page, projectId: project.id, report, outDir });
    const second = await waitFor(page, async ({ pid, first }) => {
        const records = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).filter((record) => {
            const props = record?.properties || record?.props || {};
            const id = String(record?.id || record?.atome_id || '');
            return String(record?.type || record?.kind || props.kind || '').toLowerCase().includes('text')
                && id && !id.startsWith('__eve_') && id !== first;
        });
        return { ok: records.length === 1, id: String(records[0]?.id || records[0]?.atome_id || ''), count: records.length };
    }, { pid: project.id, first: live.id });
    await secondEditor.type('Second text');
    await closeCreateText({ page, projectId: project.id, editor: secondEditor });
    await screenshot({ page, report, outDir, name: 'focused_multiline_text_list' });
    return { project, moleculeId, textId: live.id, secondTextId: second.id, expected, live, committed };
};

const runVisualInlineEditing = async ({ page, creation, report, outDir }) => {
    const { project, moleculeId, textId, expected } = creation;
    await enterListMolecule(page, project.id, moleculeId);
    await selectListRow(page, textId);
    await waitFor(page, async (id) => {
        const { projectViewVisualPanel } = await import('/eVe/domains/rendering/project_view_visual_panel.js');
        return { ok: projectViewVisualPanel.subjectId() === id, subjectId: projectViewVisualPanel.subjectId() };
    }, textId);
    const visualTarget = async () => {
        const diagnostics = await page.evaluate(() => {
            const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                .find((entry) => entry.id === 'eve_bevy_ui_project_view');
            const interactiveIds = (tree?.interactiveNodes || []).map((entry) => String(entry?.id || entry));
            return {
                interactiveIds,
                visualIds: interactiveIds.filter((id) => id.startsWith('project_view_visual'))
            };
        });
        if (!diagnostics.visualIds.includes('project_view_visual_preview')) {
            return { target: null, diagnostics };
        }
        const target = await awaitBevyUiNodeTarget(page, {
            nodeId: 'project_view_visual_preview', treeId: 'eve_bevy_ui_project_view', step: 1
        }, { timeoutMs: 10000, intervalMs: 150 });
        return { target, diagnostics };
    };
    const located = await visualTarget();
    const preview = located.target;
    assert(preview, `focused_visual_text_preview_missing:${JSON.stringify(located.diagnostics)}`);
    const beforeShot = await screenshot({ page, report, outDir, name: 'focused_visual_multiline_before_edit' });
    await clickCanvasTarget(page, preview, { double: true });
    const editor = page.locator('#eve_hidden_text_service [data-role="active-text-editor"]');
    await waitFor(page, async ({ point, id }) => {
        const { projectViewVisualPanel } = await import('/eVe/domains/rendering/project_view_visual_panel.js');
        const record = projectViewVisualPanel.subjectRecord() || {};
        const hit = window.eveBevyUiRuntime?.hitTestAtClientPoint?.({
            surface: document.getElementById('eve_surface_project'), clientX: point.x, clientY: point.y
        });
        const active = document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]');
        return {
            ok: Boolean(active), atomeId: id,
            point,
            record: {
                id: record.atome_id || record.id || '', type: record.type || '', kind: record.kind || '',
                propsType: record?.properties?.type || record?.props?.type || '',
                propsKind: record?.properties?.kind || record?.props?.kind || ''
            },
            hit: hit ? { nodeId: hit.nodeId, treeId: hit.treeId, actions: hit.actions || [] } : null
        };
    }, { point: preview, id: textId }, 10000);
    const railOnly = await page.evaluate(async (id) => {
        const { getAtomeContextualEditApi } = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
        const api = getAtomeContextualEditApi();
        const state = api?.readState?.() || {};
        const ids = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .flatMap((tree) => (tree.interactiveNodes || []).map((node) => String(node?.id || node)));
        return {
            activeAtomeId: state.activeAtomeId || '', railOnly: state.railOnly === true,
            naturalChromeIds: ids.filter((idValue) => /resize|footer_handle|edit_frame/i.test(idValue))
        };
    }, textId);
    assert(railOnly.activeAtomeId === textId && railOnly.railOnly && railOnly.naturalChromeIds.length === 0,
        `focused_visual_natural_chrome:${JSON.stringify(railOnly)}`);
    await editor.type(' cancelled');
    await editor.press('Escape');
    await waitFor(page, async (phase) => {
        const active = document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]');
        const edit = (await import('/eVe/domains/rendering/project_scene_text_edit_state.js')).getActiveProjectTextEdit();
        return { ok: !active && !edit, phase, activeEditor: Boolean(active), activeEdit: edit || null };
    }, 'cancel', 10000);
    const cancelled = await page.evaluate(async ({ id, value }) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || {};
        return { ok: String(props.text || '') === value, text: String(props.text || '') };
    }, { id: textId, value: expected });
    assert(cancelled.ok, `focused_visual_cancel_persisted:${JSON.stringify(cancelled)}`);

    const previewAgain = (await visualTarget()).target;
    assert(previewAgain, 'focused_visual_text_preview_reopen_missing');
    await clickCanvasTarget(page, previewAgain, { double: true });
    await editor.waitFor({ state: 'attached', timeout: 10000 });
    await editor.press('Meta+A');
    await editor.type('Edited');
    await editor.press('Enter');
    await editor.type('Again');
    await editor.press('Meta+A');
    const flowerPreview = (await visualTarget()).target;
    assert(flowerPreview, 'focused_visual_text_preview_flower_missing');
    await page.mouse.move(flowerPreview.x, flowerPreview.y);
    await page.mouse.down();
    await wait(750);
    await page.mouse.up();
    const flowerColorNode = await waitFor(page, () => {
        const tree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
            .find((entry) => entry.id === 'eve_bevy_ui_flower');
        const ids = (tree?.interactiveNodes || []).map((entry) => String(entry?.id || entry));
        const nodeId = ids.find((id) => id.startsWith('eve_bevy_ui_flower_item_couleur_')) || '';
        return { ok: Boolean(nodeId), nodeId, ids };
    }, null, 10000);
    await editor.press('Meta+A');
    const flowerColor = await awaitBevyUiNodeTarget(page, {
        nodeId: flowerColorNode.nodeId, treeId: 'eve_bevy_ui_flower', step: 2
    }, { timeoutMs: 10000, intervalMs: 150 });
    assert(flowerColor, `focused_visual_flower_color_target_missing:${JSON.stringify(flowerColorNode)}`);
    await clickCanvasTarget(page, flowerColor);
    const colorDialog = page.locator('#eve_couleur_dialog');
    await colorDialog.waitFor({ state: 'visible', timeout: 10000 });
    await colorDialog.locator('.eve-style-tool-swatch[data-color="#f44336"]').click();
    const styledDraft = await waitFor(page, async ({ id, projectId }) => {
        const state = window.eveToolBase?.getProjectSceneState?.(projectId) || null;
        const record = (state?.records || []).find((entry) => String(entry?.id || entry?.atome_id || '') === id) || null;
        const richText = record?.properties?.rich_text || record?.props?.rich_text || null;
        return {
            ok: JSON.stringify(richText || {}).includes('244') && JSON.stringify(richText || {}).includes('67'),
            richText
        };
    }, { id: textId, projectId: project.id }, 10000);
    await colorDialog.locator('[data-eve-panel-close="true"]').click();
    await colorDialog.waitFor({ state: 'hidden', timeout: 10000 });
    await waitFor(page, () => ({
        ok: Boolean(document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]'))
    }));
    const footer = await awaitBevyUiNodeTarget(page, {
        nodeId: 'project_view_footer', treeId: 'eve_bevy_ui_project_view', step: 2
    }, { timeoutMs: 10000, intervalMs: 150 });
    assert(footer, 'focused_visual_outside_target_missing');
    await clickCanvasTarget(page, footer);
    await waitFor(page, async (phase) => {
        const active = document.querySelector('#eve_hidden_text_service [data-role="active-text-editor"]');
        const edit = (await import('/eVe/domains/rendering/project_scene_text_edit_state.js')).getActiveProjectTextEdit();
        return { ok: !active && !edit, phase, activeEditor: Boolean(active), activeEdit: edit || null };
    }, 'outside_commit', 10000);
    const committedState = await waitFor(page, async (id) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || {};
        return { ok: String(props.text || '') === 'Edited\nAgain', text: String(props.text || '') };
    }, textId);
    const committed = await waitFor(page, async ({ id, projectId }) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || {};
        let events = [];
        try {
            events = await window.Atome.listEvents({ projectId, atomeId: id, limit: 100, order: 'desc' });
        } catch (error) {
            return { ok: false, text: String(props.text || ''), transportError: String(error?.message || error) };
        }
        const matching = events.filter((event) => String(event?.atome_id || '') === id
            && String(event?.payload?.props?.text || event?.props?.text || '') === 'Edited\nAgain');
        return {
            ok: String(props.text || '') === 'Edited\nAgain' && matching.length === 1
                && Boolean(matching[0]?.tx_id || matching[0]?.txId),
            text: String(props.text || ''), txIds: matching.map((event) => event.tx_id || event.txId || '')
        };
    }, { id: textId, projectId: project.id });
    const afterShot = await screenshot({ page, report, outDir, name: 'focused_visual_multiline_after_edit' });
    const previewBox = preview.hit?.box || {};
    const visualDiff = diffPngRegion(beforeShot.file, afterShot.file, {
        x: previewBox.x, y: previewBox.y, width: previewBox.width, height: previewBox.height
    });
    assert(visualDiff.differing_pixel_ratio > 0.001 && visualDiff.max_channel_delta > 10,
        `focused_visual_text_pixels_unchanged:${JSON.stringify(visualDiff)}`);
    await reloadBrowserProject(page, project);
    const persisted = await page.evaluate(async (id) => {
        const state = await window.Atome.getStateCurrent(id);
        const props = state?.properties || state?.props || {};
        return { text: String(props.text || ''), richText: props.rich_text || null };
    }, textId);
    assert(persisted.text === 'Edited\nAgain' && JSON.stringify(persisted.richText || {}).includes('244'),
        `focused_visual_reload_text:${JSON.stringify(persisted)}`);
    await waitForStableScene(page, project.id);
    return { railOnly, cancelled, styledDraft, committedState, committed, persisted, visualDiff };
};

export const runMoleculeOrderTextRegressions = async ({ page, report, check, ensureProject, outDir }) => {
    const focusedScenario = String(process.env.MOLECULE_UI_ORDER_TEXT_SCENARIO || '').trim().toLowerCase();
    const order = focusedScenario === 'text' ? null : await check(
        'order, extraction, reabsorption and Delete remove the empty Molecule',
        () => runOrderExtractionDelete({ page, ensureProject, report, outDir })
    );
    const creation = focusedScenario === 'order' ? null : await check(
        'Create Text keeps Return inside one multiline Atome',
        () => runMultilineCreation({ page, ensureProject, report, outDir })
    );
    const visual = creation ? await check('Visual edits multiline Text inline without Natural chrome', () => (
        runVisualInlineEditing({ page, creation, report, outDir })
    )) : null;
    return { order, creation, visual };
};
