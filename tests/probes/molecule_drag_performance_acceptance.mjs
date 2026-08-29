import {
    assert, playwrightPointForClientTarget, recordCenter, wait, waitForStableScene
} from './molecule_ui_acceptance_support.mjs';
import { switchView } from './molecule_ui_drop_core.mjs';
import { PNG } from 'pngjs';

const createFixture = (page, projectId) => page.evaluate(async (pid) => {
    const selection = await import('/eVe/intuition/runtime/selection.js');
    selection.clearAllSelection();
    const tag = Date.now();
    const memberships = [];
    const moleculeIds = [];
    const moleculeMemberIds = [];
    const create = async (spec) => {
        const result = await window.eveToolBase.createAtome({
            ...spec, type: spec.kind, projectId: pid, parentId: pid
        }, { render: false });
        const id = String(result?.id || result?.atome_id || spec.id || '');
        if (!result?.ok || !id) throw new Error(`drag_perf_create_failed:${JSON.stringify({ spec, result })}`);
        return id;
    };
    for (let moleculeIndex = 0; moleculeIndex < 10; moleculeIndex += 1) {
        const column = moleculeIndex % 5;
        const row = Math.floor(moleculeIndex / 5);
        const left = 70 + column * 245;
        const top = 90 + row * 145;
        const ownerId = await create({
            id: `drag_perf_molecule_${tag}_${moleculeIndex}`,
            kind: 'group', name: `Drag performance Molecule ${moleculeIndex}`,
            molecule_entity: 'molecule', left: left + 8, top: top + 8,
            width: 188, height: 54, order: moleculeIndex * 10
        });
        moleculeIds.push(ownerId);
        const memberSpecs = [
            {
                id: `drag_perf_text_${tag}_${moleculeIndex}`, kind: 'text',
                name: `Dense text ${moleculeIndex}`, text: `Texte ${moleculeIndex}`,
                left: left + 8, top: top + 8, width: 68, height: 32, color: '#f8fafc'
            },
            {
                id: `drag_perf_image_${tag}_${moleculeIndex}`, kind: 'image',
                name: `Dense image ${moleculeIndex}`,
                src: moleculeIndex % 2 === 0
                    ? '/atome/src/assets/images/ballanim.png'
                    : '/atome/src/assets/images/green_planet.png',
                mime_type: 'image/png', left: left + 78, top: top + 8, width: 54, height: 54
            },
            moleculeIndex % 3 === 0
                ? {
                    id: `drag_perf_audio_${tag}_${moleculeIndex}`, kind: 'audio',
                    name: `Dense audio ${moleculeIndex}`, src: '/atome/src/assets/audios/riff.m4a',
                    mime_type: 'audio/mp4', duration_seconds: 2,
                    left: left + 138, top: top + 8, width: 58, height: 54
                }
                : {
                    id: `drag_perf_static_${tag}_${moleculeIndex}`, kind: 'image',
                    name: `Dense static ${moleculeIndex}`, src: '/atome/src/assets/images/green_planet.png',
                    mime_type: 'image/png', left: left + 138, top: top + 8, width: 58, height: 54
                }
        ];
        const memberIds = [];
        for (const spec of memberSpecs) memberIds.push(await create(spec));
        moleculeMemberIds.push(memberIds);
        memberIds.forEach((id, hierarchyOrder) => memberships.push({ id, ownerId, hierarchyOrder }));
    }
    const atomId = await create({
        id: `drag_perf_atom_${tag}`, kind: 'image', name: 'Dense standalone image',
        src: '/atome/src/assets/images/green_planet.png', mime_type: 'image/png',
        left: 80, top: 410, width: 100, height: 80, order: 500
    });
    await create({
        id: `drag_perf_atom_text_${tag}`, kind: 'text', name: 'Dense standalone text',
        text: 'Atome texte autonome', left: 230, top: 420, width: 180, height: 44, order: 501
    });
    await create({
        id: `drag_perf_atom_audio_${tag}`, kind: 'audio', name: 'Dense standalone audio',
        src: '/atome/src/assets/audios/riff.m4a', mime_type: 'audio/mp4', duration_seconds: 2,
        left: 450, top: 410, width: 180, height: 80, order: 502
    });
    const animationId = await create({
        id: `drag_perf_atom_apng_${tag}`, kind: 'image', name: 'Dense standalone APNG',
        src: '/atome/src/assets/images/ballanim.png', mime_type: 'image/png',
        left: 780, top: 390, width: 200, height: 200, order: 503
    });
    const txId = `drag_perf_membership_${Date.now()}`;
    const committed = await window.Atome.commitBatch([
        ...moleculeIds.map((id) => ({
            kind: 'set', atome_id: id, project_id: pid, tx_id: txId,
            props: { molecule_entity: 'molecule' }
        })),
        ...memberships.map(({ id, ownerId, hierarchyOrder }) => ({
            kind: 'set', atome_id: id, project_id: pid, parent_id: ownerId, tx_id: txId,
            props: { hierarchy_order: hierarchyOrder }
        }))
    ], { projectId: pid, tx_id: txId });
    if (committed?.ok === false) throw new Error(`drag_perf_membership_failed:${JSON.stringify(committed)}`);
    await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
    return {
        atomId,
        ownerId: moleculeIds[0],
        memberIds: moleculeMemberIds[0],
        animationId,
        moleculeCount: moleculeIds.length,
        memberCount: memberships.length,
        standaloneCount: 4
    };
}, projectId);

const percentile = (values, ratio) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
};

const readPositions = (page, ids) => page.evaluate(async (atomeIds) => {
    const states = await Promise.all(atomeIds.map((id) => window.Atome.getStateCurrent(id)));
    return states.map((state, index) => {
        const props = state?.properties || state?.props || {};
        return { id: atomeIds[index], left: Number.parseFloat(props.left ?? props.x), top: Number.parseFloat(props.top ?? props.y) };
    });
}, ids);

const measureDrag = async ({ page, projectId, targetId, trackedIds, dx, dy }) => {
    const target = await recordCenter(page, projectId, (record) => record.id === targetId, { sceneCoordinates: true });
    const from = await playwrightPointForClientTarget(page, target);
    const before = await readPositions(page, trackedIds);
    await page.evaluate(() => window.__EVE_BEVY_PERF__?.reset?.({ enabled: true }));
    const frameSample = page.evaluate(() => new Promise((resolve) => {
        const deltas = [];
        const longTasks = [];
        let previous = 0;
        let active = true;
        const observer = typeof PerformanceObserver === 'function' ? new PerformanceObserver((list) => {
            list.getEntries().forEach((entry) => longTasks.push(entry.duration));
        }) : null;
        try { observer?.observe({ type: 'longtask', buffered: false }); } catch (_) { /* unsupported */ }
        const tick = (timestamp) => {
            if (previous > 0) deltas.push(timestamp - previous);
            previous = timestamp;
            if (active) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(() => {
            active = false;
            observer?.disconnect();
            resolve({ deltas, longTasks });
        }, 1800);
    }));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const inputMoves = 72;
    const dragStartedAt = Date.now();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: inputMoves });
    const dragDurationMs = Date.now() - dragStartedAt;
    const during = await page.evaluate(() => window.__EVE_BEVY_PERF__?.summary?.() || null);
    await page.mouse.up();
    await waitForStableScene(page, projectId);
    const [sample, performance, after] = await Promise.all([
        frameSample,
        page.evaluate(() => window.__EVE_BEVY_PERF__?.summary?.() || null),
        readPositions(page, trackedIds)
    ]);
    const frameDeltas = sample.deltas.slice(1);
    return {
        inputMoves,
        drag_duration_ms: dragDurationMs,
        before,
        after,
        counters_during_drag: during?.counters || {},
        counters_after_release: performance?.counters || {},
        frame_count: frameDeltas.length,
        frame_p95_ms: percentile(frameDeltas, 0.95),
        frame_max_ms: frameDeltas.length ? Math.max(...frameDeltas) : 0,
        long_tasks_ms: sample.longTasks
    };
};

const assertMeasurement = (measurement, dx, dy, label) => {
    const counters = measurement.counters_during_drag;
    const queued = Number(counters['gesture.frame.queued'] || 0);
    const direct = Number(counters['gesture.frame.direct_transform'] || 0);
    const coalesced = Number(counters['gesture.frame.coalesced'] || 0);
    assert(queued > 0 && direct > 0 && direct <= queued,
        `${label}_drag_not_frame_bounded:${JSON.stringify({ queued, direct, coalesced })}`);
    assert(Number(counters['gesture.frame.projection_fallback'] || 0) === 0,
        `${label}_drag_projection_fallback:${JSON.stringify(counters)}`);
    assert(Number(counters['projection.runtime.total'] || 0) === 0,
        `${label}_drag_rebuilt_projection:${JSON.stringify(counters)}`);
    measurement.after.forEach((position, index) => {
        const origin = measurement.before[index];
        assert(Math.abs(position.left - origin.left - dx) < 0.01 && Math.abs(position.top - origin.top - dy) < 0.01,
            `${label}_drag_final_position_wrong:${JSON.stringify({ origin, position, dx, dy })}`);
    });
    assert(measurement.frame_p95_ms <= 40,
        `${label}_drag_frame_p95_too_high:${measurement.frame_p95_ms}`);
};

const measureAnimatedPngDuringDrag = async ({ page, projectId, animationId, dragTargetId }) => {
    const readAnimationDiagnostics = () => page.evaluate(async () => {
        const { readBevyWebRendererState } = await import('/eVe/domains/rendering/bevy_web_renderer_runtime.js');
        const state = readBevyWebRendererState(document.getElementById('eve_surface_project'));
        return state?.wasmModule?.read_atome_bevy_web_diagnostics?.() || null;
    });
    const animation = await recordCenter(page, projectId, (record) => record.id === animationId, { sceneCoordinates: true });
    const clip = {
        x: Math.max(0, animation.x - animation.width / 2),
        y: Math.max(0, animation.y - animation.height / 2),
        width: animation.width,
        height: animation.height
    };
    const dragTarget = await recordCenter(page, projectId, (record) => record.id === dragTargetId, { sceneCoordinates: true });
    const from = await playwrightPointForClientTarget(page, dragTarget);
    const captures = [];
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const diagnosticsBefore = await readAnimationDiagnostics();
    const startedAt = Date.now();
    for (let captureIndex = 0; captureIndex < 12; captureIndex += 1) {
        for (let moveIndex = 1; moveIndex <= 5; moveIndex += 1) {
            const index = captureIndex * 5 + moveIndex;
            await page.mouse.move(from.x + index * 1.5, from.y + index * 0.75);
            await wait(10);
        }
        captures.push({ at_ms: Date.now() - startedAt, png: PNG.sync.read(await page.screenshot({ clip })) });
        await wait(20);
    }
    await page.mouse.up();
    const diagnosticsAfter = await readAnimationDiagnostics();
    await waitForStableScene(page, projectId);
    const changes = captures.slice(1).map(({ png }, index) => {
        const before = captures[index].png;
        let changed = 0;
        for (let byte = 0; byte < png.data.length; byte += 4) {
            const delta = Math.abs(png.data[byte] - before.data[byte])
                + Math.abs(png.data[byte + 1] - before.data[byte + 1])
                + Math.abs(png.data[byte + 2] - before.data[byte + 2])
                + Math.abs(png.data[byte + 3] - before.data[byte + 3]);
            if (delta > 10) changed += 1;
        }
        return changed / (png.width * png.height);
    });
    const intervals = captures.slice(1).map((capture, index) => capture.at_ms - captures[index].at_ms);
    return {
        captures: captures.length,
        changed_frames: changes.filter((ratio) => ratio > 0.0001).length,
        changes,
        intervals_ms: intervals,
        max_interval_ms: Math.max(...intervals),
        active_animations: Number(diagnosticsAfter?.apng_active || 0),
        apng_frame_updates: Number(diagnosticsAfter?.apng_frame_updates || 0)
            - Number(diagnosticsBefore?.apng_frame_updates || 0),
        apng_max_lateness_ms: Number(diagnosticsAfter?.apng_max_lateness_ms || 0)
    };
};

export const runMoleculeDragPerformanceAcceptance = async ({ page, report, check, ensureProject }) => {
    const project = await ensureProject(page, `Molecule Drag Performance ${Date.now()}`);
    if (!project?.ok || !project?.id) throw new Error(`drag_perf_project_create_failed:${JSON.stringify(project)}`);
    const fixture = await createFixture(page, project.id);
    assert(fixture.moleculeCount === 10 && fixture.memberCount === 30,
        `drag_perf_dense_fixture_invalid:${JSON.stringify(fixture)}`);
    await switchView(page, project.id, 'natural');
    await waitForStableScene(page, project.id);

    const atom = await measureDrag({
        page, projectId: project.id, targetId: fixture.atomId, trackedIds: [fixture.atomId], dx: 150, dy: 70
    });
    report.drag_performance = { atom };
    await check('real atom drag stays display-frame paced and keeps its final canonical position', () => {
        assertMeasurement(atom, 150, 70, 'atom');
        return atom;
    });

    const molecule = await measureDrag({
        page, projectId: project.id, targetId: fixture.memberIds[0],
        trackedIds: [fixture.ownerId, ...fixture.memberIds], dx: 130, dy: 65
    });
    report.drag_performance.molecule = molecule;
    await check('real closed Molecule drag stays display-frame paced and moves all members solidly', () => {
        assertMeasurement(molecule, 130, 65, 'molecule');
        return molecule;
    });

    const animationDuringDrag = await measureAnimatedPngDuringDrag({
        page, projectId: project.id, animationId: fixture.animationId, dragTargetId: fixture.memberIds[0]
    });
    report.drag_performance.apng_during_drag = animationDuringDrag;
    await check('APNG keeps changing smoothly while another dense Molecule is dragged', () => {
        assert(animationDuringDrag.changed_frames >= 7,
            `apng_drag_too_few_changed_frames:${JSON.stringify(animationDuringDrag)}`);
        assert(animationDuringDrag.active_animations >= 5 && animationDuringDrag.apng_frame_updates >= 40,
            `apng_drag_clock_stalled:${JSON.stringify(animationDuringDrag)}`);
        assert(animationDuringDrag.max_interval_ms <= 250,
            `apng_drag_capture_stall:${JSON.stringify(animationDuringDrag)}`);
        return animationDuringDrag;
    });
};
