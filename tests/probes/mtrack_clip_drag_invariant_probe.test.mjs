import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:1430';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports/mtrack_clip_drag_invariant_probe');
const OUT_FILE = path.join(OUT_DIR, 'report.json');
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const persistReport = (report) => {
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
};

const safeEval = async (page, fn, arg = null) => {
    try {
        return await page.evaluate(fn, arg);
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 200) => {
    const startedAt = Date.now();
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await safeEval(page, predicate);
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const openMtrack = async (page) => {
    const target = await safeEval(page, () => {
        const nodes = Array.from(document.querySelectorAll('[data-atome-id]')).filter((node) => {
            const kind = String(node.dataset?.atomeKind || node.dataset?.kind || '').trim().toLowerCase();
            if (!kind || kind === 'tool_shortcut' || kind === 'mtrack') return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0;
        });
        const group = nodes.find((node) => String(node.dataset?.atomeKind || '').trim().toLowerCase() === 'group') || nodes[0] || null;
        const atomeId = String(group?.dataset?.atomeId || '').trim();
        return atomeId ? { ok: true, atome_id: atomeId } : { ok: false, error: 'target_missing' };
    });
    if (target?.ok !== true) return target;
    return safeEval(page, async (input) => {
        const runtime = window.atome?.tools?.v2Runtime || null;
        if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
        const id = String(input?.atome_id || '').trim();
        return runtime.invokeById({
            tool_id: 'ui.mtrax.open',
            event: 'diagnostic_open',
            action: 'open',
            input: {
                action: 'open',
                toggle: false,
                atome_id: id,
                target_id: id,
                selection_ids: [id]
            },
            presentation: 'ui',
            source: { type: 'headless_probe', layer: 'mtrack_clip_drag_invariant_probe' }
        });
    }, target);
};

const mountSyntheticTimeline = async (page) => safeEval(page, async () => {
    const api = window.eveMtrackApi || null;
    if (!api?.debugMountSyntheticTimeline) return { ok: false, error: 'debug_mount_missing' };
    return api.debugMountSyntheticTimeline({ track_count: 8, clips_per_track: 4 });
});

const installClipMutationTrace = async (page) => safeEval(page, () => {
    const state = window.eveMtrackApi?.getState?.() || null;
    if (!state || state.__clipMutationTraceInstalled === true) return { ok: !!state, installed: false };
    const trace = [];
    let clipsValue = state.clips;
    const record = (kind, detail = {}) => {
        trace.push({
            kind,
            detail,
            length: Array.isArray(clipsValue) ? clipsValue.length : null,
            stack: String(new Error().stack || '').split('\n').slice(2, 9)
        });
        if (trace.length > 80) trace.splice(0, trace.length - 80);
    };
    const patchArray = (array) => {
        if (!Array.isArray(array) || array.__mtrackClipMutationPatched === true) return array;
        Object.defineProperty(array, '__mtrackClipMutationPatched', {
            configurable: true,
            value: true
        });
        ['splice', 'pop', 'shift', 'push', 'unshift'].forEach((method) => {
            const original = array[method];
            Object.defineProperty(array, method, {
                configurable: true,
                value: function patchedClipMutationMethod(...args) {
                    const beforeLength = this.length;
                    const result = original.apply(this, args);
                    record(`array.${method}`, { beforeLength, afterLength: this.length, args: args.slice(0, 4) });
                    return result;
                }
            });
        });
        return array;
    };
    clipsValue = patchArray(clipsValue);
    Object.defineProperty(state, 'clips', {
        configurable: true,
        get: () => clipsValue,
        set: (next) => {
            const beforeLength = Array.isArray(clipsValue) ? clipsValue.length : null;
            clipsValue = patchArray(next);
            record('state.clips=set', {
                beforeLength,
                afterLength: Array.isArray(clipsValue) ? clipsValue.length : null
            });
        }
    });
    state.__clipMutationTraceInstalled = true;
    window.__MTRACK_CLIP_MUTATION_TRACE__ = trace;
    return { ok: true, installed: true };
});

const collectState = async (page, label) => safeEval(page, (inputLabel) => {
    const readRect = (node) => {
        if (!node?.getBoundingClientRect) return null;
        const rect = node.getBoundingClientRect();
        return {
            left: Math.round(rect.left * 100) / 100,
            top: Math.round(rect.top * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            bottom: Math.round(rect.bottom * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            height: Math.round(rect.height * 100) / 100
        };
    };
    const api = window.eveMtrackApi || null;
    const state = api?.getState?.() || null;
    const exported = api?.exportTimeline?.() || null;
    const clips = Array.from(document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-clip')).map((node) => {
        const clip = node.__eveMtrackRefs?.clip || null;
        const parentLane = node.closest?.('.eve-mtrack-lane') || null;
        return {
            clip_id: String(node.dataset?.clipId || clip?.id || '').trim(),
            persist_id: String(clip?.persistId || clip?.persist_id || clip?.persistKey || clip?.id || '').trim(),
            track_id: String(clip?.trackId || parentLane?.dataset?.trackId || '').trim(),
            parent_track_id: String(parentLane?.dataset?.trackId || '').trim(),
            source: String(clip?.source || clip?.src || clip?.url || '').trim(),
            rect: readRect(node),
            connected: node.isConnected
        };
    });
    const tracks = Array.from(document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-track')).map((node, index) => ({
        index,
        track_id: String(node.dataset?.trackId || '').trim(),
        rect: readRect(node),
        lane_rect: readRect(node.querySelector?.('.eve-mtrack-lane'))
    }));
    return {
        ok: true,
        label: inputLabel,
        state: {
            active_group_id: String(state?.activeGroupId || '').trim(),
            track_count: Number(state?.trackCount || state?.tracks?.length || 0),
            clip_count: Number(state?.clipCount || state?.clips?.length || 0)
        },
        exported_clip_count: Array.isArray(exported?.clips) ? exported.clips.length : null,
        exported_track_count: Array.isArray(exported?.tracks) ? exported.tracks.length : null,
        clips,
        tracks,
        clip_mutation_trace: Array.isArray(window.__MTRACK_CLIP_MUTATION_TRACE__)
            ? window.__MTRACK_CLIP_MUTATION_TRACE__.slice(-12)
            : []
    };
}, label);

const selectClipForDirection = async (page, direction) => safeEval(page, (inputDirection) => {
    const rows = Array.from(document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-track'));
    const candidates = rows.flatMap((row, rowIndex) => Array.from(row.querySelectorAll('.eve-mtrack-clip')).map((clipNode) => ({
        row,
        rowIndex,
        clipNode,
        rect: clipNode.getBoundingClientRect()
    }))).filter((entry) => entry.rect.width > 8 && entry.rect.height > 8);
    const picked = candidates.find((entry) => {
        if (inputDirection === 'up') return entry.rowIndex > 0;
        if (inputDirection === 'down') return entry.rowIndex < rows.length - 1;
        return true;
    }) || candidates[0] || null;
    if (!picked) return { ok: false, error: 'clip_missing' };
    const clipRect = picked.clipNode.querySelector('.eve-mtrack-clip-body')?.getBoundingClientRect?.()
        || picked.clipNode.getBoundingClientRect();
    const sourceTrackRect = picked.row.getBoundingClientRect();
    const targetRow = inputDirection === 'up'
        ? rows[Math.max(0, picked.rowIndex - 1)]
        : inputDirection === 'down'
            ? rows[Math.min(rows.length - 1, picked.rowIndex + 1)]
            : picked.row;
    const targetRect = targetRow.getBoundingClientRect();
    const endX = inputDirection === 'horizontal'
        ? clipRect.left + (clipRect.width * 0.5) + 180
        : clipRect.left + (clipRect.width * 0.5) + 80;
    const endY = inputDirection === 'horizontal'
        ? clipRect.top + (clipRect.height * 0.5)
        : targetRect.top + (targetRect.height * 0.5);
    const clip = picked.clipNode.__eveMtrackRefs?.clip || null;
    return {
        ok: true,
        direction: inputDirection,
        clip_id: String(picked.clipNode.dataset?.clipId || clip?.id || '').trim(),
        source_track_id: String(picked.row.dataset?.trackId || clip?.trackId || '').trim(),
        target_track_id: String(targetRow.dataset?.trackId || '').trim(),
        source_track_rect: {
            top: sourceTrackRect.top,
            bottom: sourceTrackRect.bottom
        },
        geometry: {
            startX: Math.round(clipRect.left + (clipRect.width * 0.5)),
            startY: Math.round(clipRect.top + (clipRect.height * 0.5)),
            endX: Math.round(endX),
            endY: Math.round(endY)
        }
    };
}, direction);

const dragWithSamples = async (page, geometry, label) => {
    const samples = [];
    await page.mouse.move(geometry.startX, geometry.startY);
    await page.mouse.down();
    for (let index = 1; index <= 10; index += 1) {
        const progress = index / 10;
        const x = Math.round(geometry.startX + ((geometry.endX - geometry.startX) * progress));
        const y = Math.round(geometry.startY + ((geometry.endY - geometry.startY) * progress));
        await page.mouse.move(x, y);
        await page.waitForTimeout(35);
        samples.push(await collectState(page, `${label}:move:${index}`));
    }
    await page.mouse.up();
    await page.waitForTimeout(160);
    samples.push(await collectState(page, `${label}:up`));
    return samples;
};

const assertScenario = (scenario) => {
    const before = scenario.before;
    const after = scenario.samples[scenario.samples.length - 1];
    const clipId = String(scenario.selection?.clip_id || '').trim();
    if (scenario.selection?.ok !== true || before?.ok !== true || after?.ok !== true) {
        return {
            clip_id: clipId,
            ok: false,
            error: 'scenario_state_unavailable',
            selection: scenario.selection,
            before_error: before?.error || null,
            after_error: after?.error || null
        };
    }
    const beforeClip = before.clips.find((clip) => clip.clip_id === clipId);
    const afterClip = after.clips.find((clip) => clip.clip_id === clipId);
    const missingSamples = scenario.samples.filter((sample) => !sample.clips.some((clip) => clip.clip_id === clipId));
    const staleParentSamples = scenario.samples.filter((sample) => sample.clips.some((clip) => (
        clip.clip_id === clipId
        && clip.track_id
        && clip.parent_track_id
        && clip.track_id !== clip.parent_track_id
    )));
    return {
        clip_id: clipId,
        ok: !!(
            beforeClip
            && afterClip
            && missingSamples.length === 0
            && staleParentSamples.length === 0
            && Number(after.state.clip_count) === Number(before.state.clip_count)
            && Number(after.state.track_count) === Number(before.state.track_count)
            && Number(beforeClip.rect?.width || 0) > 8
            && Number(beforeClip.rect?.height || 0) > 8
            && Number(afterClip.rect?.width || 0) > 8
            && Number(afterClip.rect?.height || 0) > 8
        ),
        before_clip: beforeClip || null,
        after_clip: afterClip || null,
        missing_sample_labels: missingSamples.map((sample) => sample.label),
        stale_parent_sample_labels: staleParentSamples.map((sample) => sample.label),
        before_counts: before.state,
        after_counts: after.state
    };
};

const run = async () => {
    const report = {
        created_at: new Date().toISOString(),
        url: APP_URL,
        ok: false,
        scenarios: []
    };
    persistReport(report);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1720, height: 1040 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle' });
        await sleep(1000);
        await safeEval(page, async ({ phone, password }) => {
            const api = window.AdoleAPI || null;
            if (!api?.auth?.login) return { ok: false, error: 'auth_api_missing' };
            await api.auth.login(phone, password, phone);
            return { ok: true };
        }, { phone: PHONE, password: PASSWORD });
        await page.reload({ waitUntil: 'networkidle' });
        await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 25000);
        report.open = await openMtrack(page);
        await waitFor(page, () => {
            const panel = document.getElementById('eve_mtrack_dialog');
            const visible = !!panel && window.getComputedStyle(panel).display !== 'none';
            return visible && !!window.eveMtrackApi?.getState?.()?.activeGroupId;
        }, 15000);
        report.mount = await mountSyntheticTimeline(page);
        report.mutation_trace = await installClipMutationTrace(page);
        const visibleClipsReady = await waitFor(page, () => (
            Array.from(document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-clip'))
                .filter((node) => {
                    const rect = node.getBoundingClientRect();
                    return rect.width > 8 && rect.height > 8;
                }).length >= 16
        ), 12000);
        report.visible_clips_ready = visibleClipsReady;
        persistReport(report);
        if (visibleClipsReady.ok !== true) throw new Error('visible_clip_wait_failed');

        for (const direction of ['horizontal', 'up', 'down']) {
            const selection = await selectClipForDirection(page, direction);
            const before = await collectState(page, `${direction}:before`);
            const samples = selection?.ok
                ? await dragWithSamples(page, selection.geometry, direction)
                : [];
            const scenario = {
                direction,
                selection,
                before,
                samples
            };
            scenario.invariant = assertScenario(scenario);
            report.scenarios.push(scenario);
            persistReport(report);
        }
        report.console_errors = consoleErrors;
        report.ok = report.scenarios.every((scenario) => scenario.invariant?.ok === true) && consoleErrors.length === 0;
        persistReport(report);
        process.stdout.write(`${JSON.stringify({
            ok: report.ok,
            out_file: OUT_FILE,
            invariants: report.scenarios.map((scenario) => ({
                direction: scenario.direction,
                ...scenario.invariant
            })),
            console_error_count: consoleErrors.length
        }, null, 2)}\n`);
    } finally {
        await browser.close();
    }
};

run().catch((error) => {
    const report = {
        created_at: new Date().toISOString(),
        url: APP_URL,
        ok: false,
        error: error?.message || String(error || 'probe_failed'),
        stack: error?.stack || null
    };
    persistReport(report);
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
});
