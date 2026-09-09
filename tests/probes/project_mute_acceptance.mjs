import { assert, awaitBevyUiNodeTarget, clickCanvasTarget, playwrightPointForClientTarget, wait, waitFor } from './molecule_ui_acceptance_support.mjs';
import { screenshot, switchView } from './molecule_ui_drop_core.mjs';
import { selectListRow, structuredRows } from './molecule_ui_drop_playback_support.mjs';

export const runProjectMuteAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    if (process.env.MOLECULE_UI_MUTE_AUDIO === '1') return runAudioMixAcceptance({ page, report, check, ensureProject, outDir });
    const project = await ensureProject(page, `Mute live ${Date.now()}`);
    const ids = await page.evaluate(async (projectId) => {
        const ids = [];
        for (const [index, text] of ['Muted layer', 'Audible layer'].entries()) {
            const result = await window.eveToolBase.createAtome({ type: 'text', kind: 'text', text, name: text,
                duration: 120, hierarchy_order: index, left: 100 + index * 300, top: 160,
                width: 260, height: 160, color: '#ffffff', projectId, parentId: projectId
            }, { render: false });
            ids.push(result.id);
        }
        await window.Atome.commit({ kind: 'set', atome_id: projectId, project_id: projectId, props: { playback_mode: 'simultaneous' } });
        await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
        return ids;
    }, project.id);
    await switchView(page, project.id, 'list');
    const node = async (nodeId, treeId = 'eve_bevy_ui_project_view') => {
        const target = await awaitBevyUiNodeTarget(page, { nodeId, treeId });
        assert(target, `mute_target_missing:${nodeId}`);
        return target;
    };
    await check('muting a playing simultaneous layer removes it from the viewer immediately', async () => {
        await clickCanvasTarget(page, await node('project_view_footer'));
        await clickCanvasTarget(page, await node('atome_contextual_tool_container_play', 'eve_bevy_panel_atome_contextual_edit'));
        await waitFor(page, async () => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            const state = projectViewTransport.read();
            return { ok: state.playing && state.activeLeafIds.length === 2, state };
        });
        const index = (await structuredRows(page)).find((row) => row.id === ids[0])?.index;
        await clickCanvasTarget(page, await node(`project_view_list_entry_${index}_mute`));
        await wait(800);
        report.muteLive = await page.evaluate(async (id) => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            const runtime = window.eveBevyUiRuntime;
            const source = runtime?.state?.sourceTrees?.get('eve_bevy_ui_project_view')?.tree?.root;
            const texts = [];
            const walk = (node) => { if (!node) return; if (node.kind === 'text' && node.text) texts.push({ id: node.id, text: node.text }); (node.children || []).forEach(walk); };
            walk(source);
            return { record: await window.Atome.getStateCurrent(id), transport: projectViewTransport.read(), texts };
        }, ids[0]);
        await screenshot({ page, report, outDir, name: 'mute_during_simultaneous_play' });
        assert(report.muteLive.texts.some((node) => node.id.startsWith('project_view_visual_preview') && node.text.includes('Audible layer')), 'mute_visible_control_layer_required');
        assert(!report.muteLive.texts.some((node) => node.id.startsWith('project_view_visual_preview') && node.text.includes('Muted layer')),
            `muted_layer_still_projected:${JSON.stringify(report.muteLive.texts)}`);
    });
    await check('unmuting restores the playing layer without restarting the container', async () => {
        const index = (await structuredRows(page)).find((row) => row.id === ids[0])?.index;
        await clickCanvasTarget(page, await node(`project_view_list_entry_${index}_mute`));
        await wait(800);
        report.unmuteLive = await page.evaluate(async (id) => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            return { record: await window.Atome.getStateCurrent(id), transport: projectViewTransport.read() };
        }, ids[0]);
        await screenshot({ page, report, outDir, name: 'unmute_during_simultaneous_play' });
        assert(report.unmuteLive.transport.activeLeafIds.includes(ids[0]), `unmuted_layer_missing:${JSON.stringify(report.unmuteLive)}`);
    });
    const muteTarget = async (id) => {
        const index = (await structuredRows(page)).find((row) => row.id === id)?.index;
        return node(`project_view_list_entry_${index}_mute`);
    };
    const hold = async (target) => {
        const point = await playwrightPointForClientTarget(page, target);
        await page.mouse.move(point.x, point.y); await page.mouse.down(); await wait(750); await page.mouse.up();
    };
    const drag = async (from, to) => {
        const start = await playwrightPointForClientTarget(page, from);
        const end = await playwrightPointForClientTarget(page, to);
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 10 }); await page.mouse.up(); await wait(700);
    };
    const mixState = () => page.evaluate(async (ids) => {
        const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
        return { records: await Promise.all(ids.map((id) => window.Atome.getStateCurrent(id))), transport: projectViewTransport.read() };
    }, ids);
    await check('long press chooses Solo for the column without activating every track', async () => {
        await hold(await muteTarget(ids[0]));
        report.mixPopupProjection = await page.evaluate(() => {
            const state = window.eveBevyUiRuntime.state;
            const nodes = [];
            const walk = (node) => { if (!node) return; if (String(node.id).startsWith('project_view_mix')) nodes.push({ id: node.id, style: node.style, events: Object.keys(node.on || {}) }); (node.children || []).forEach(walk); };
            walk(state.sourceTrees.get('eve_bevy_ui_project_view')?.tree.root);
            return { nodes, pointer: state.pointerTarget ? { id: state.pointerTarget.nodeId, hold: state.pointerTarget.hold } : null };
        });
        await screenshot({ page, report, outDir, name: 'mix_long_press_choices' });
        await clickCanvasTarget(page, await node('project_view_mix_solo'));
        const state = await mixState();
        assert(state.records.every((record) => record.properties.solo !== true), 'solo_mode_activated_tracks');
        await clickCanvasTarget(page, await muteTarget(ids[0])); await wait(500);
        const solo = await mixState();
        report.soloLive = solo;
        assert(solo.transport.activeLeafIds.length === 1 && solo.transport.activeLeafIds[0] === ids[0], `solo_failed:${JSON.stringify(solo)}`);
        await screenshot({ page, report, outDir, name: 'solo_first_track' });
        await clickCanvasTarget(page, await muteTarget(ids[1])); await wait(500);
        const both = await mixState();
        assert(both.transport.activeLeafIds.length === 2, 'multiple_solo_group_failed');
    });
    await check('vertical painting applies one chosen state to all traversed buttons', async () => {
        await drag(await muteTarget(ids[0]), await muteTarget(ids[1]));
        const state = await mixState();
        report.mixPaint = state;
        assert(state.records.every((record) => record.properties.solo === false), `solo_paint_failed:${JSON.stringify(state)}`);
        await hold(await muteTarget(ids[0]));
        await clickCanvasTarget(page, await node('project_view_mix_mute'));
        await drag(await muteTarget(ids[0]), await muteTarget(ids[1]));
        const muted = await mixState();
        assert(muted.records.every((record) => record.properties.mute === true), `mute_paint_failed:${JSON.stringify(muted)}`);
        assert(muted.transport.activeLeafIds.length === 0, 'painted_mutes_still_playing');
        await drag(await muteTarget(ids[0]), await muteTarget(ids[1]));
        const restored = await mixState();
        assert(restored.records.every((record) => record.properties.mute === false), 'mute_paint_restore_failed');
    });

    await check('horizontal Mute gesture opens the shared strength slider without painting neighbours', async () => {
        await clickCanvasTarget(page, await muteTarget(ids[0]));
        const source = await muteTarget(ids[0]);
        const point = await playwrightPointForClientTarget(page, source);
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        await page.mouse.move(point.x - 90, point.y, { steps: 10 });
        await node('project_view_mix_strength');
        await screenshot({ page, report, outDir, name: 'mute_shared_strength_slider', preservePointer: true });
        await page.mouse.up(); await wait(700);
        const state = await mixState();
        report.mixStrength = state;
        assert(state.records[0].properties.mute_strength >= 0.4 && state.records[0].properties.mute_strength <= 0.6,
            `mute_strength_not_half:${JSON.stringify(state)}`);
        assert(state.records[1].properties.mute === false, 'horizontal_gesture_painted_neighbour');
        await screenshot({ page, report, outDir, name: 'mute_half_strength' });
    });

    await check('single selected playback keeps the recursive Mute factor and restores its original level', async () => {
        await selectListRow(page, ids[0]);
        const before = await mixState();
        if (!before.transport.playing) await clickCanvasTarget(page, await node('atome_contextual_tool_play', 'eve_bevy_panel_atome_contextual_edit'));
        const single = await waitFor(page, async (id) => {
            const { projectViewTransport } = await import('/eVe/domains/rendering/project_view_transport_runtime.js');
            const transport = projectViewTransport.read();
            return { ok: transport.playing && transport.selectionIds.length === 1
                && transport.selectionIds[0] === id && transport.activeLeafIds.length === 1, transport };
        }, ids[0]);
        assert(single.transport.durationSeconds === 120, 'single_item_duration_changed');
        await clickCanvasTarget(page, await muteTarget(ids[0])); await wait(500);
        const restored = await mixState();
        assert(restored.records[0].properties.mute === false && restored.transport.playing, 'single_item_unmute_stopped_playback');
        assert(restored.records[0].properties.opacity == null || restored.records[0].properties.opacity === 1, 'mute_overwrote_source_opacity');
        report.singleMix = restored;
        await screenshot({ page, report, outDir, name: 'single_track_unmute_restored' });
    });

    await check('column All and None apply the chosen effect without selecting or deleting tracks', async () => {
        const before = await page.evaluate(async () => (await import('/eVe/intuition/runtime/selection.js')).getCurrentSelectionIds());
        for (const [choice, active] of [['all', true], ['none', false]]) {
            await hold(await muteTarget(ids[0]));
            await clickCanvasTarget(page, await node(`project_view_mix_${choice}`));
            await waitFor(page, async ({ ids, active }) => {
                const records = await Promise.all(ids.map(id => window.Atome.getStateCurrent(id)));
                return { ok: records.every(record => record.properties.mute === active && record.properties.__deleted !== true) };
            }, { ids, active });
        }
        const after = await page.evaluate(async () => (await import('/eVe/intuition/runtime/selection.js')).getCurrentSelectionIds());
        assert(JSON.stringify(before) === JSON.stringify(after), 'mix_all_changed_selection');
        await screenshot({ page, report, outDir, name: 'mix_all_none_current_container' });
    });

};

const runAudioMixAcceptance = async ({ page, report, check, ensureProject, outDir }) => {
    const project = await ensureProject(page, `Audio mix ${Date.now()}`);
    const ids = await page.evaluate(async (projectId) => {
        const ids = [];
        for (const [index, gain] of [0.8, 0.6].entries()) {
            const result = await window.eveToolBase.createAtome({ kind: 'audio', type: 'audio', name: `Audio ${index + 1}`,
                src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 24,
                hierarchy_order: index, gain, opacity: 0.7, width: 260, height: 160, projectId, parentId: projectId }, { render: false });
            if (!result.ok) throw new Error(JSON.stringify(result));
            await window.Atome.commit({ kind: 'set', atome_id: result.id, project_id: projectId,
                props: { media_url: '/atome/src/assets/audios/riff.m4a', media_kind: 'audio', duration: 24, gain, opacity: 0.7 } });
            ids.push(result.id);
        }
        await window.Atome.commit({ kind: 'set', atome_id: projectId, project_id: projectId, props: { playback_mode: 'simultaneous' } });
        await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false }); return ids;
    }, project.id);
    await switchView(page, project.id, 'list');
    const target = (nodeId, treeId = 'eve_bevy_ui_project_view') => awaitBevyUiNodeTarget(page, { nodeId, treeId });
    const expectGains = (expected) => waitFor(page, async ({ ids, expected }) => {
        const { ensureMoleculeEngine } = await import('/eVe/core/media_engine/molecule.js');
        const session = ensureMoleculeEngine().getSession('project_view_recursive_transport');
        const voices = [...session.voiceState.entries()].map(([id, state]) => ({ id, ...state }));
        const gains = ids.map(id => voices.find(voice => voice.id.includes(id))?.gain ?? 0);
        const records = await Promise.all(ids.map(id => window.Atome.getStateCurrent(id)));
        return { ok: gains.every((gain, index) => Math.abs(gain - expected[index]) < 0.02), gains,
            sourceGains: records.map(record => record.properties.gain), sourceOpacity: records.map(record => record.properties.opacity),
            voices, playing: session.transport.playing, duration: session.transport.duration,
            clips: [...session.runtimeClips.values()].map(clip => ({ kind: clip.kind, audioAvailable: clip.audioAvailable, error: clip.audioLoadError })) };
    }, { ids, expected });
    const muteTarget = async (id) => {
        const index = (await structuredRows(page)).find(row => row.id === id)?.index;
        assert(Number.isInteger(index), 'audio_mix_row_missing:' + id);
        return target(`project_view_list_entry_${index}_mute`);
    };
    const reduceStrength = async () => {
        const point = await playwrightPointForClientTarget(page, await muteTarget(ids[0]));
        await page.mouse.move(point.x, point.y); await page.mouse.down();
        await page.mouse.move(point.x - 90, point.y, { steps: 8 }); await page.mouse.up();
    };
    await check('Web audio Mute and Solo compose with original gains and restore them', async () => {
        await clickCanvasTarget(page, await target('project_view_footer'));
        await clickCanvasTarget(page, await target('atome_contextual_tool_container_play', 'eve_bevy_panel_atome_contextual_edit'));
        report.audioMix = { original: await expectGains([0.8, 0.6]) };
        const button = await muteTarget(ids[0]);
        await clickCanvasTarget(page, button);
        report.audioMix.full = await expectGains([0, 0.6]);
        await reduceStrength();
        report.audioMix.half = await expectGains([0.4, 0.6]);
        await reduceStrength();
        report.audioMix.zero = await expectGains([0.8, 0.6]);
        await clickCanvasTarget(page, await muteTarget(ids[0]));
        report.audioMix.restored = await expectGains([0.8, 0.6]);
        const solo = await muteTarget(ids[0]);
        await page.mouse.move(solo.x, solo.y); await page.mouse.down(); await wait(700); await page.mouse.up();
        await clickCanvasTarget(page, await target('project_view_mix_solo'));
        await clickCanvasTarget(page, await muteTarget(ids[0]));
        report.audioMix.solo = await expectGains([0.8, 0]);
        await clickCanvasTarget(page, await muteTarget(ids[1]));
        report.audioMix.group = await expectGains([0.8, 0.6]);
        for (const state of Object.values(report.audioMix)) {
            assert(state.sourceGains.join() === '0.8,0.6' && state.sourceOpacity.join() === '0.7,0.7', 'audio_mix_overwrote_source_levels');
        }
        await screenshot({ page, report, outDir, name: 'audio_mix_group_restored' });
    });
};
