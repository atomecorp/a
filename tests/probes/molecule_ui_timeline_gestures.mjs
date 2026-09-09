import { assert, findBevyUiNodeTarget, recordCenter, playwrightPointForClientTarget, waitFor, waitForStableScene } from './molecule_ui_acceptance_support.mjs';

export const exerciseMixerLassoBlock = async (page) => {
    const blocker = await findBevyUiNodeTarget(page, {
        nodeId: 'project_view_molecule_mix_lasso_blocker', treeId: 'eve_bevy_ui_project_view', step: 2
    });
    assert(blocker, 'molecule_mix_lasso_blocker_not_actionable');
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

export const exerciseTimelineEditingGestures = async ({ page, projectId, ownerId, clipId } = {}) => {
    const readTimeline = () => page.evaluate(async (owner) => {
        const state = await window.Atome.getStateCurrent(owner);
        return state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
    }, ownerId);
    const beforeCrop = await readTimeline();
    const previousDuration = beforeCrop.clips.find((clip) => clip.clip_id === clipId).timeline.duration_frames;
    const crop = await recordCenter(page, projectId, (record) => record.id === `mol:crop:${clipId}:out`, { sceneCoordinates: true });
    const cropPoint = await playwrightPointForClientTarget(page, crop);
    await page.mouse.move(cropPoint.x, cropPoint.y); await page.mouse.down();
    await page.mouse.move(cropPoint.x - 24, cropPoint.y, { steps: 6 }); await page.mouse.up();
    const cropCommitted = await waitFor(page, async ({ owner, id, prior }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
        const duration = timeline?.clips?.find((clip) => clip.clip_id === id)?.timeline?.duration_frames;
        return { ok: Number.isSafeInteger(duration) && duration !== prior, duration };
    }, { owner: ownerId, id: clipId, prior: previousDuration });
    await waitForStableScene(page, projectId);

    const beforeZoom = await readTimeline();
    const zoomTarget = await recordCenter(page, projectId, (record) => record.id === `mol:clip:${clipId}`, { sceneCoordinates: true });
    const zoomPoint = await playwrightPointForClientTarget(page, zoomTarget);
    await page.mouse.move(zoomPoint.x, zoomPoint.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -120); await page.keyboard.up('Control');
    const zoomCommitted = await waitFor(page, async ({ owner, prior }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
        const zoom = Number(timeline?.view?.x_zoom || 1); return { ok: zoom !== prior, zoom };
    }, { owner: ownerId, prior: Number(beforeZoom.view?.x_zoom || 1) });
    await waitForStableScene(page, projectId);

    const splitTarget = await recordCenter(page, projectId, (record) => record.id === `mol:clip:${clipId}`, { sceneCoordinates: true });
    const splitPoint = await playwrightPointForClientTarget(page, splitTarget);
    await page.mouse.move(splitPoint.x, splitPoint.y); await page.keyboard.down('Alt');
    await page.mouse.dblclick(splitPoint.x, splitPoint.y, { delay: 40 }); await page.keyboard.up('Alt');
    const splitCommitted = await waitFor(page, async ({ owner, id }) => {
        const state = await window.Atome.getStateCurrent(owner);
        const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
        const ids = (timeline?.clips || []).map((clip) => String(clip.clip_id));
        const splitIds = ids.filter((candidate) => candidate.startsWith(`${id}:split:`));
        return { ok: !ids.includes(id) && splitIds.length === 2, split_ids: splitIds };
    }, { owner: ownerId, id: clipId });
    await waitForStableScene(page, projectId);
    const lassoTargetId = splitCommitted.split_ids[0];
    const lassoTarget = await recordCenter(page, projectId, (record) => record.id === `mol:clip:${lassoTargetId}`, { sceneCoordinates: true });
    const start = { x: lassoTarget.x - lassoTarget.width / 2 - 8, y: lassoTarget.y - lassoTarget.height / 2 - 2 };
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(lassoTarget.x + lassoTarget.width / 2 + 8, lassoTarget.y + lassoTarget.height / 2 + 2, { steps: 8 }); await page.mouse.up();
    const lassoSelection = await page.evaluate(() => {
        const apiIds = window.SelectionAPI?.selected?.() || [];
        return Array.from(new Set([...(Array.isArray(apiIds) ? apiIds : []), ...(window.__selectedAtomeIds || [])])).map(String);
    });
    assert(lassoSelection.includes(`mol:clip:${lassoTargetId}`), `timeline_lasso_clip_missing:${JSON.stringify(lassoSelection)}`);
    assert(lassoSelection.every((id) => !id.startsWith('mol:lane:') && !id.startsWith('mol:crop:')),
        `timeline_lasso_selected_technical_record:${JSON.stringify(lassoSelection)}`);
    return { lasso_selection: lassoSelection, crop: cropCommitted, zoom: zoomCommitted, split: splitCommitted };
};
