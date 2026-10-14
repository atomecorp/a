import { assert, findBevyUiNodeTarget, playwrightPointForClientTarget, waitFor } from './molecule_ui_acceptance_support.mjs';

export const exerciseMixerLassoBlock = async (page) => {
    const blocker = await findBevyUiNodeTarget(page, {
        nodeId: 'project_view_molecule_mix_lasso', treeId: 'eve_bevy_ui_project_view', step: 2
    });
    // The mixer's own strip lasso owns the drag: the project's atome lasso never starts.
    assert(blocker, 'molecule_mix_lasso_not_actionable');
    const before = await page.evaluate(() => {
        const apiIds = window.SelectionAPI?.selected?.() || [];
        return Array.from(new Set([...(Array.isArray(apiIds) ? apiIds : []), ...(window.__selectedAtomeIds || [])])).map(String).sort();
    });
    const box = blocker.hit?.box || {};
    const end = {
        x: Math.min(blocker.x + 48, Number(box.x || blocker.x) + Number(box.width || 52) - 2),
        y: Math.min(blocker.y + 36, Number(box.y || blocker.y) + Number(box.height || 40) - 2)
    };
    await page.mouse.move(blocker.x, blocker.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 }); await page.mouse.up();
    const after = await page.evaluate(() => {
        const apiIds = window.SelectionAPI?.selected?.() || [];
        const selection = Array.from(new Set([...(Array.isArray(apiIds) ? apiIds : []), ...(window.__selectedAtomeIds || [])])).map(String).sort();
        return { selection, lasso_visible: !!document.querySelector('.eve-atome-lasso') };
    });
    assert(JSON.stringify(after.selection) === JSON.stringify(before),
        `molecule_mix_drag_changed_selection:${JSON.stringify({ before, after })}`);
    assert(after.lasso_visible === false, 'molecule_mix_drag_started_lasso');
    return { blocker: blocker.id, selection: after.selection };
};

// Timeline view tree (todo/timeline v1.6): a real press selects the clip, then
// its end edge, dragged left, crops it without destroying its source.
export const exerciseTimelineEditingGestures = async ({ page, ownerId, clipId } = {}) => {
    const readTimeline = () => page.evaluate(async (owner) => {
        const state = await window.Atome.getStateCurrent(owner);
        return state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
    }, ownerId);
    const clipNode = `project_view_timeline_clip_${String(clipId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const clip = await findBevyUiNodeTarget(page, { nodeId: clipNode, treeId: 'eve_bevy_ui_project_view', step: 3 });
    assert(clip, `timeline_clip_not_actionable:${clipNode}`);
    const clipPoint = await playwrightPointForClientTarget(page, clip);
    await page.mouse.click(clipPoint.x, clipPoint.y);
    const previousDuration = (await readTimeline()).clips.find((entry) => entry.clip_id === clipId).timeline.duration_frames;
    const edge = await findBevyUiNodeTarget(page, { nodeId: `${clipNode}_edge_end`, treeId: 'eve_bevy_ui_project_view', step: 2 });
    assert(edge, `timeline_crop_edge_not_actionable:${clipNode}`);
    const edgePoint = await playwrightPointForClientTarget(page, edge);
    await page.mouse.move(edgePoint.x, edgePoint.y); await page.mouse.down();
    await page.mouse.move(edgePoint.x - 24, edgePoint.y, { steps: 6 }); await page.mouse.up();
    const cropped = await waitFor(page, async ({ owner, id, previous }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
        const entry = timeline?.clips?.find((candidate) => candidate.clip_id === id);
        return { ok: Boolean(entry) && entry.timeline.duration_frames < previous, duration_frames: entry?.timeline.duration_frames, previous };
    }, { owner: ownerId, id: clipId, previous: previousDuration });
    return { cropped };
};
