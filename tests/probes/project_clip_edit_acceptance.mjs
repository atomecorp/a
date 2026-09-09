import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { reloadProjection, screenshot, switchView } from './molecule_ui_drop_core.mjs';
import { structuredRows } from './molecule_ui_drop_playback_support.mjs';

export const runProjectClipEditAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const project = await ensureProject(page, `Clip gestures ${Date.now()}`);
    const ids = await page.evaluate(async projectId => {
        const ids = {};
        for (const [index, kind] of ['video', 'audio', 'text'].entries()) {
            const result = await window.eveToolBase.createAtome({ type: kind, kind, name: `Edit ${kind}`, text: 'Five seconds',
                projectId, parentId: projectId, left: 150, top: 120, width: 300, height: 160, hierarchy_order: index, duration: 5 }, { render: false });
            ids[kind] = result.id;
            if (kind !== 'text') await window.Atome.commit({ kind: 'set', atome_id: result.id, project_id: projectId,
                props: { media_url: kind === 'video' ? '/atome/src/assets/videos/video_missing.mp4' : '/atome/src/assets/audios/riff.m4a',
                    media_kind: kind, has_audio: kind === 'audio', media_duration: kind === 'video' ? 4.891833 : 24.636372,
                    source_in_seconds: 1, source_out_seconds: 3, duration_seconds: 2, duration: 2, loop: false } });
        }
        await window.Atome.commit({ kind: 'set', atome_id: projectId, project_id: projectId, props: { playback_mode: 'simultaneous', loop: false } });
        await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
        return ids;
    }, project.id);
    await switchView(page, project.id, 'list');
    const read = id => page.evaluate(async id => (await window.Atome.getStateCurrent(id)).properties, id);
    const preview = async id => {
        const row = (await structuredRows(page)).find(row => row.id === id);
        return awaitBevyUiNodeTarget(page, { treeId: 'eve_bevy_ui_project_view', nodeId: `project_view_list_entry_${row.index}_preview` });
    };
    const box = async id => (await preview(id)).hit.box;
    const drag = async (id, from, to, cancel = false) => {
        const b = await box(id);
        await page.mouse.move(b.x + b.width * from, b.y + b.height / 2); await page.mouse.down();
        await page.mouse.move(b.x + b.width * to, b.y + b.height / 2, { steps: 12 });
        if (cancel) await page.keyboard.press('Escape');
        await page.mouse.up(); await wait(600);
    };
    await check('video clip crop, source-bounded extension and cancelled gesture', async () => {
        await clickCanvasTarget(page, await preview(ids.video), { double: true });
        await drag(ids.video, 0.398, 0.298);
        await waitFor(page, async id => ({ ok: Math.abs((await window.Atome.getStateCurrent(id)).properties.duration_seconds - 1.5) < 0.04 }), ids.video);
        await screenshot({ page, report, outDir, name: 'video_clip_cropped' });
        await drag(ids.video, 0.298, 0.94);
        const extended = await read(ids.video);
        assert(Math.abs(extended.source_out_seconds - extended.media_duration) < 0.001, `video_source_limit:${JSON.stringify(extended)}`);
        const end = extended.duration_seconds / 5;
        await drag(ids.video, end - 0.002, end - 0.2, true);
        const cancelled = await read(ids.video);
        assert(cancelled.duration_seconds === extended.duration_seconds, 'cancel_committed_clip_crop');
        await screenshot({ page, report, outDir, name: 'video_clip_extended_source_limit' });
        return { extended, cancelled };
    });
    await check('audio clip body moves in time and left crop preserves its end', async () => {
        await clickCanvasTarget(page, await preview(ids.audio), { double: true });
        await drag(ids.audio, 0.2, 0.4);
        await waitFor(page, async id => ({ ok: Math.abs((await window.Atome.getStateCurrent(id)).properties.playback_offset_seconds - 1) < 0.04 }), ids.audio);
        await drag(ids.audio, 0.202, 0.302);
        const cropped = await read(ids.audio);
        assert(Math.abs(cropped.playback_offset_seconds - 1.5) < 0.06 && Math.abs(cropped.duration_seconds - 1.5) < 0.06,
            `audio_left_crop:${JSON.stringify(cropped)}`);
        await screenshot({ page, report, outDir, name: 'audio_clip_moved_cropped' });
        await reloadProjection(page, project.id);
        const restored = await read(ids.audio);
        assert(restored.source_in_seconds === cropped.source_in_seconds && restored.playback_offset_seconds === cropped.playback_offset_seconds,
            'clip_reopen_lost_source_window');
        return { cropped, restored };
    });
    report.clipFixture = { projectId: project.id, ids };
    return report.clipFixture;
};
