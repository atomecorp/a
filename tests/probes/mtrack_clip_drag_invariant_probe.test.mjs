import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports/mtrack_clip_drag_invariant_probe');
const OUT_FILE = path.join(OUT_DIR, 'report.json');
fs.mkdirSync(OUT_DIR, { recursive: true });
let lastReport = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const persistReport = (report) => {
    lastReport = report;
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
};

const safeEval = async (page, fn, arg = null) => {
    try {
        return await page.evaluate(fn, arg);
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const installTraceFlags = () => {
    window.__EVE_MTRACK_DIAG__ = true;
    window.__EVE_MTRACK_DEBUG__ = true;
    window.__EVE_MTRACK_TRACE__ = true;
    window.__EVE_MTRACK_INTERACTION_DIAG__ = true;
    window.__EVE_MTRACK_PREVIEW_TRACE__ = true;
    window.__EVE_MTRACK_EVENT_TRACE__ = Array.isArray(window.__EVE_MTRACK_EVENT_TRACE__) ? window.__EVE_MTRACK_EVENT_TRACE__ : [];
    window.__EVE_MTRACK_DOCK_TRACE__ = Array.isArray(window.__EVE_MTRACK_DOCK_TRACE__) ? window.__EVE_MTRACK_DOCK_TRACE__ : [];
    window.__EVE_MTRAX_INTERACTION_TRACE__ = Array.isArray(window.__EVE_MTRAX_INTERACTION_TRACE__) ? window.__EVE_MTRAX_INTERACTION_TRACE__ : [];
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

const waitForStableMtrackState = async (page, label, stableMs = 700, timeoutMs = 5000) => {
    const startedAt = Date.now();
    let stableSince = 0;
    let previousSignature = '';
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await safeEval(page, (inputLabel) => {
            const state = window.eveMtrackApi?.getState?.() || null;
            return {
                ok: !!state,
                label: inputLabel,
                signature: [
                    String(state?.activeGroupId || ''),
                    String(state?.trackCount ?? ''),
                    String(state?.clipCount ?? ''),
                    String(state?.activeTimelineRev ?? ''),
                    String(state?.activeTimelineHash ?? '')
                ].join('|'),
                track_count: Number(state?.trackCount || 0),
                clip_count: Number(state?.clipCount || 0)
            };
        }, label);
        if (last?.ok === true && last.signature === previousSignature) {
            if (!stableSince) stableSince = Date.now();
            if ((Date.now() - stableSince) >= stableMs) return { ok: true, last };
        } else {
            previousSignature = String(last?.signature || '');
            stableSince = 0;
        }
        await sleep(120);
    }
    return { ok: false, last };
};

const ensureProjectReady = async (page) => safeEval(page, async ({ phone, password }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login || !api?.projects?.list) return { ok: false, error: 'project_api_unavailable' };
    const isSuccess = (result) => !!(result?.fastify?.success || result?.tauri?.success || result?.success || result?.ok);
    let loginResult = await api.auth.login(phone, password, phone);
    if (!isSuccess(loginResult) && typeof api.auth.create === 'function') {
        await api.auth.create(phone, password, phone, 'public');
        loginResult = await api.auth.login(phone, password, phone);
    }
    const pickProject = (result) => {
        const list = [
            ...(Array.isArray(result?.projects) ? result.projects : []),
            ...(Array.isArray(result?.tauri?.projects) ? result.tauri.projects : []),
            ...(Array.isArray(result?.fastify?.projects) ? result.fastify.projects : [])
        ];
        return list[0] || null;
    };
    let projects = await api.projects.list();
    let project = pickProject(projects);
    if (!project && typeof api.projects.create === 'function') {
        await api.projects.create('mtrack_clip_drag_invariant_probe');
        projects = await api.projects.list();
        project = pickProject(projects);
    }
    const props = project?.properties || project?.particles || project?.data || {};
    const projectId = String(project?.id || project?.atome_id || '').trim();
    if (!projectId) return { ok: false, error: 'project_id_missing', loginResult, projects };
    if (typeof api.projects.setCurrent === 'function') {
        await api.projects.setCurrent(projectId, String(props?.name || 'probe'), project?.owner_id || project?.ownerId || props?.owner_id || null, true);
    }
    if (window.eveToolBase?.loadProjectAtomes) await window.eveToolBase.loadProjectAtomes(projectId);
    return { ok: true, project_id: projectId };
}, { phone: PHONE, password: PASSWORD });

const openMtrack = async (page) => {
    const target = await safeEval(page, async () => {
        const nodes = Array.from(document.querySelectorAll('[data-atome-id]')).filter((node) => {
            const kind = String(node.dataset?.atomeKind || node.dataset?.kind || '').trim().toLowerCase();
            if (!kind || kind === 'tool_shortcut' || kind === 'mtrack') return false;
            const rect = node.getBoundingClientRect();
            return rect.width > 24 && rect.height > 24 && rect.bottom > 0 && rect.right > 0;
        });
        const group = nodes.find((node) => String(node.dataset?.atomeKind || '').trim().toLowerCase() === 'group') || nodes[0] || null;
        const atomeId = String(group?.dataset?.atomeId || '').trim();
        if (atomeId) return { ok: true, atome_id: atomeId };
        const toolBase = window.eveToolBase || null;
        const state = window.__DEBUG__?.getAppState?.() || null;
        const projectId = String(state?.currentProjectId || state?.projectId || '').trim();
        if (!toolBase?.createAtome || !projectId) return { ok: false, error: 'target_missing' };
        const created = await toolBase.createAtome({
            kind: 'shape',
            type: 'shape',
            projectId,
            parentId: projectId,
            left: 220,
            top: 180,
            width: 88,
            height: 88,
            name: 'Mtrack clip drag invariant target',
            background: '#00AEEF',
            backgroundColor: '#00AEEF',
            borderRadius: '50%',
            shape_variant: 'circle'
        });
        const createdId = String(created?.id || created?.atome_id || created?.result?.id || created?.result?.atome_id || '').trim();
        return createdId ? { ok: true, atome_id: createdId } : { ok: false, error: 'target_missing', created };
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
        scroll: (() => {
            const scroll = document.querySelector('#eve_mtrack_dialog .eve-mtrack-scroll');
            return {
                top: Number(scroll?.scrollTop || 0),
                height: Number(scroll?.scrollHeight || 0),
                client_height: Number(scroll?.clientHeight || 0)
            };
        })(),
        exported_clip_count: Array.isArray(exported?.clips) ? exported.clips.length : null,
        exported_track_count: Array.isArray(exported?.tracks) ? exported.tracks.length : null,
        clips,
        tracks,
        clip_mutation_trace: Array.isArray(window.__MTRACK_CLIP_MUTATION_TRACE__)
            ? window.__MTRACK_CLIP_MUTATION_TRACE__.slice(-12)
            : [],
        traces: {
            mtrack_trace: typeof window.__dumpEveMtrackTrace === 'function' ? window.__dumpEveMtrackTrace().slice(-80) : [],
            mtrack_critical_trace: typeof window.__dumpEveMtrackCriticalTrace === 'function' ? window.__dumpEveMtrackCriticalTrace().slice(-40) : [],
            event_trace: Array.isArray(window.__EVE_MTRACK_EVENT_TRACE__) ? window.__EVE_MTRACK_EVENT_TRACE__.slice(-80) : [],
            dock_trace: Array.isArray(window.__EVE_MTRACK_DOCK_TRACE__) ? window.__EVE_MTRACK_DOCK_TRACE__.slice(-60) : [],
            interaction_trace: Array.isArray(window.__EVE_MTRAX_INTERACTION_TRACE__) ? window.__EVE_MTRAX_INTERACTION_TRACE__.slice(-60) : [],
            anomalies: Array.isArray(window.__EVE_MTRACK_ANOMALIES__) ? window.__EVE_MTRACK_ANOMALIES__.slice(-40) : []
        }
    };
}, label);

const summarizeSample = (sample, clipId) => {
    const clip = sample?.clips?.find?.((entry) => entry.clip_id === clipId) || null;
    const readableTrace = Array.isArray(sample?.traces?.mtrack_trace)
        ? sample.traces.mtrack_trace.filter((entry) => String(entry?.tag || '') !== 'renderer').slice(-24)
        : [];
    return {
        label: sample?.label || '',
        counts: sample?.state || null,
        exported_clip_count: sample?.exported_clip_count ?? null,
        exported_track_count: sample?.exported_track_count ?? null,
        clip: clip ? {
            clip_id: clip.clip_id,
            track_id: clip.track_id,
            parent_track_id: clip.parent_track_id,
            rect: clip.rect
        } : null,
        visible_clip_count: Array.isArray(sample?.clips) ? sample.clips.length : null,
        visible_track_count: Array.isArray(sample?.tracks) ? sample.tracks.length : null,
        visible_clip_ids: Array.isArray(sample?.clips) ? sample.clips.map((entry) => entry.clip_id) : [],
        visible_track_ids: Array.isArray(sample?.tracks) ? sample.tracks.map((entry) => entry.track_id) : [],
        clip_mutation_trace: Array.isArray(sample?.clip_mutation_trace) ? sample.clip_mutation_trace.slice(-12) : [],
        trace_tail: readableTrace,
        event_tail: Array.isArray(sample?.traces?.event_trace) ? sample.traces.event_trace.slice(-16) : [],
        interaction_tail: Array.isArray(sample?.traces?.interaction_trace) ? sample.traces.interaction_trace.slice(-16) : [],
        anomalies_tail: Array.isArray(sample?.traces?.anomalies) ? sample.traces.anomalies.slice(-10) : []
    };
};

const selectClipForDirection = async (page, direction) => safeEval(page, (inputDirection) => {
    const rows = Array.from(document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-track'));
    const clipReceivesPointer = (clipNode, rect) => {
        const points = [
            [0.5, 0.5],
            [0.25, 0.5],
            [0.75, 0.5],
            [0.5, 0.35],
            [0.5, 0.65]
        ];
        return points.some(([xRatio, yRatio]) => {
            const x = Math.round(rect.left + (rect.width * xRatio));
            const y = Math.round(rect.top + (rect.height * yRatio));
            const hit = document.elementFromPoint(x, y);
            return !!hit && (hit === clipNode || clipNode.contains(hit));
        });
    };
    const candidates = rows.flatMap((row, rowIndex) => Array.from(row.querySelectorAll('.eve-mtrack-clip')).map((clipNode) => ({
        row,
        rowIndex,
        clipNode,
        rect: clipNode.getBoundingClientRect()
    }))).filter((entry) => {
        if (entry.rect.width <= 8 || entry.rect.height <= 8) return false;
        return clipReceivesPointer(entry.clipNode, entry.rect);
    });
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

const dragWithSamples = async (page, geometry, label, options = {}) => {
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
    const holdSteps = Math.max(0, Math.floor(Number(options.holdMs || 0) / 120));
    for (let index = 1; index <= holdSteps; index += 1) {
        await page.waitForTimeout(120);
        samples.push(await collectState(page, `${label}:hold:${index}`));
    }
    await page.mouse.up();
    await page.waitForTimeout(160);
    samples.push(await collectState(page, `${label}:up`));
    return samples;
};

const resolveClipDragGeometry = async (page, { clipId = '', target = 'same', horizontalPx = 80 } = {}) => safeEval(page, (input) => {
    const rows = Array.from(document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-track'));
    const clipReceivesPointer = (clipNode, rect) => {
        const points = [
            [0.5, 0.5],
            [0.25, 0.5],
            [0.75, 0.5],
            [0.5, 0.35],
            [0.5, 0.65]
        ];
        return points.some(([xRatio, yRatio]) => {
            const x = Math.round(rect.left + (rect.width * xRatio));
            const y = Math.round(rect.top + (rect.height * yRatio));
            const hit = document.elementFromPoint(x, y);
            return !!hit && (hit === clipNode || clipNode.contains(hit));
        });
    };
    const clipNodes = rows.flatMap((row, rowIndex) => Array.from(row.querySelectorAll('.eve-mtrack-clip')).map((clipNode) => ({
        row,
        rowIndex,
        clipNode,
        rect: clipNode.getBoundingClientRect()
    }))).filter((entry) => {
        if (entry.rect.width <= 8 || entry.rect.height <= 8) return false;
        return clipReceivesPointer(entry.clipNode, entry.rect);
    });
    const requestedClipId = String(input?.clipId || '').trim();
    const picked = (
        requestedClipId
            ? clipNodes.find((entry) => String(entry.clipNode.dataset?.clipId || '').trim() === requestedClipId)
            : null
    ) || clipNodes[0] || null;
    if (!picked) return { ok: false, error: 'clip_missing' };
    const clipRect = picked.clipNode.querySelector('.eve-mtrack-clip-body')?.getBoundingClientRect?.()
        || picked.clipNode.getBoundingClientRect();
    const tracksRoot = document.querySelector('#eve_mtrack_dialog .eve-mtrack-tracks');
    const tracksRect = tracksRoot?.getBoundingClientRect?.() || null;
    const scrollRect = document.querySelector('#eve_mtrack_dialog .eve-mtrack-scroll')?.getBoundingClientRect?.() || null;
    let targetRow = picked.row;
    const target = String(input?.target || '').trim();
    if (target === 'previous') {
        targetRow = rows[Math.max(0, picked.rowIndex - 1)] || picked.row;
    } else if (target === 'next') {
        targetRow = rows[Math.min(rows.length - 1, picked.rowIndex + 1)] || picked.row;
    } else if (target === 'scrollBottomEdge') {
        targetRow = rows[Math.min(rows.length - 1, picked.rowIndex + 1)] || picked.row;
    } else if (target === 'scrollTopEdge') {
        targetRow = rows[Math.max(0, picked.rowIndex - 1)] || picked.row;
    } else if (target === 'lastVisible') {
        const rootTop = Number(tracksRect?.top ?? Number.NEGATIVE_INFINITY);
        const rootBottom = Number(tracksRect?.bottom ?? Number.POSITIVE_INFINITY);
        targetRow = rows.slice().reverse().find((row) => {
            const rect = row.getBoundingClientRect();
            const center = rect.top + (rect.height * 0.5);
            const hit = document.elementFromPoint(
                Math.round(rect.left + Math.min(Math.max(rect.width * 0.5, 24), Math.max(24, rect.width - 24))),
                Math.round(center)
            );
            return center >= rootTop
                && center <= rootBottom
                && !!hit
                && (hit === row || row.contains(hit));
        }) || rows[rows.length - 1] || picked.row;
    } else if (target === 'firstVisible') {
        targetRow = rows[0] || picked.row;
    }
    const targetRect = targetRow.getBoundingClientRect();
    const startX = Math.round(clipRect.left + (clipRect.width * 0.5));
    const startY = Math.round(clipRect.top + (clipRect.height * 0.5));
    const endX = Math.round(startX + (Number(input?.horizontalPx || 0) || 0));
    const endY = target === 'aboveTop'
        ? Math.round(Number(tracksRect?.top || targetRect.top) + 2)
        : target === 'scrollBottomEdge'
            ? Math.round(Number(scrollRect?.bottom || tracksRect?.bottom || targetRect.bottom) - 3)
            : target === 'scrollTopEdge'
                ? Math.round(Number(scrollRect?.top || tracksRect?.top || targetRect.top) + 3)
                : Math.round(targetRect.top + (targetRect.height * 0.5));
    return {
        ok: true,
        clip_id: String(picked.clipNode.dataset?.clipId || '').trim(),
        source_row_index: picked.rowIndex,
        source_track_id: String(picked.row.dataset?.trackId || '').trim(),
        target,
        target_row_index: target === 'aboveTop' ? -1 : rows.indexOf(targetRow),
        target_track_id: target === 'aboveTop' ? null : String(targetRow.dataset?.trackId || '').trim(),
        geometry: { startX, startY, endX, endY },
        visible_row_count: rows.length
    };
}, { clipId, target, horizontalPx });

const runDirectionalStressScenario = async (page) => {
    const scenario = {
        direction: 'stress_repeated_track_creation_and_return',
        steps: [],
        invariant: { ok: false }
    };
    let activeClipId = '';
    const runStep = async (label, target, expected = {}) => {
        activeClipId = '';
        let selection = await resolveClipDragGeometry(page, {
            clipId: activeClipId,
            target,
            horizontalPx: Number.isFinite(Number(expected.horizontalPx)) ? Number(expected.horizontalPx) : 72
        });
        if (selection?.ok !== true && activeClipId) {
            activeClipId = '';
            selection = await resolveClipDragGeometry(page, {
                clipId: '',
                target,
                horizontalPx: Number.isFinite(Number(expected.horizontalPx)) ? Number(expected.horizontalPx) : 72
            });
        }
        const before = await collectState(page, `${label}:before`);
        const samples = selection?.ok ? await dragWithSamples(page, selection.geometry, label) : [];
        const after = samples[samples.length - 1] || await collectState(page, `${label}:after`);
        const clipId = String(selection?.clip_id || activeClipId || '').trim();
        if (clipId) activeClipId = clipId;
        const beforeClip = before?.clips?.find?.((clip) => clip.clip_id === clipId) || null;
        const afterClip = after?.clips?.find?.((clip) => clip.clip_id === clipId) || null;
        const beforeTrackOrder = (before?.tracks || []).map((track) => String(track.track_id || ''));
        const afterTrackOrder = (after?.tracks || []).map((track) => String(track.track_id || ''));
        const beforeIndex = beforeTrackOrder.indexOf(String(beforeClip?.parent_track_id || ''));
        const afterIndex = afterTrackOrder.indexOf(String(afterClip?.parent_track_id || ''));
        const missingSamples = samples.filter((sample) => !sample.clips.some((clip) => clip.clip_id === clipId));
        const staleParentSamples = samples.filter((sample) => sample.clips.some((clip) => (
            clip.clip_id === clipId
            && clip.track_id
            && clip.parent_track_id
            && clip.track_id !== clip.parent_track_id
        )));
        const movedUp = beforeIndex >= 0 && afterIndex >= 0 && afterIndex < beforeIndex;
        const movedDown = beforeIndex >= 0 && afterIndex >= 0 && afterIndex > beforeIndex;
        const insertedTop = Number(after?.state?.track_count || 0) === Number(before?.state?.track_count || 0) + 1
            && afterIndex === 0;
        const step = {
            label,
            target,
            selection,
            before_counts: before?.state || null,
            after_counts: after?.state || null,
            clip_id: clipId,
            before_clip: beforeClip,
            after_clip: afterClip,
            before_row_index: beforeIndex,
            after_row_index: afterIndex,
            moved_up: movedUp,
            moved_down: movedDown,
            inserted_top: insertedTop,
            missing_sample_labels: missingSamples.map((sample) => sample.label),
            stale_parent_sample_labels: staleParentSamples.map((sample) => sample.label),
            ok: !!(
                selection?.ok
                && beforeClip
                && afterClip
                && missingSamples.length === 0
                && staleParentSamples.length === 0
                && Number(after?.state?.clip_count || 0) === Number(before?.state?.clip_count || 0)
            )
        };
        if (step.ok !== true) {
            const beforeClipIds = new Set((before?.clips || []).map((entry) => entry.clip_id));
            const beforeTrackIds = new Set((before?.tracks || []).map((entry) => entry.track_id));
            step.added_clip_ids = (after?.clips || [])
                .map((entry) => entry.clip_id)
                .filter((id) => id && !beforeClipIds.has(id));
            step.added_track_ids = (after?.tracks || [])
                .map((entry) => entry.track_id)
                .filter((id) => id && !beforeTrackIds.has(id));
            step.sample_summaries = samples.map((sample) => summarizeSample(sample, clipId));
            step.before_trace_tail = summarizeSample(before, clipId);
            step.after_trace_tail = summarizeSample(after, clipId);
        }
        scenario.steps.push(step);
        return step;
    };

    for (let index = 0; index < 25; index += 1) {
        if (index % 5 === 0) {
            await runStep(`stress_top_insert_${index + 1}`, 'aboveTop', { insertTop: true, horizontalPx: 16 });
            await waitForStableMtrackState(page, `stress_after_top_insert_${index + 1}`, 180, 1800);
        }
        await runStep(`stress_down_${index + 1}`, 'next', { down: true, horizontalPx: 24 });
        await waitForStableMtrackState(page, `stress_after_down_${index + 1}`, 180, 1800);
        await runStep(`stress_up_${index + 1}`, 'previous', { up: true, horizontalPx: 24 });
        await waitForStableMtrackState(page, `stress_after_up_${index + 1}`, 180, 1800);
        await runStep(`stress_right_${index + 1}`, 'same', { horizontalPx: 32 });
        await waitForStableMtrackState(page, `stress_after_right_${index + 1}`, 180, 1800);
        await runStep(`stress_left_${index + 1}`, 'same', { horizontalPx: -32 });
        await waitForStableMtrackState(page, `stress_after_left_${index + 1}`, 180, 1800);
    }
    const movedUpCount = scenario.steps.filter((step) => step.moved_up === true).length;
    const movedDownCount = scenario.steps.filter((step) => step.moved_down === true).length;
    const insertedTopCount = scenario.steps.filter((step) => step.inserted_top === true).length;
    scenario.invariant = {
        ok: scenario.steps.every((step) => step.ok === true)
            && movedUpCount >= 3
            && movedDownCount >= 3
            && insertedTopCount >= 1,
        moved_up_count: movedUpCount,
        moved_down_count: movedDownCount,
        inserted_top_count: insertedTopCount,
        failed_steps: scenario.steps.filter((step) => step.ok !== true).map((step) => ({
            label: step.label,
            target: step.target,
            before_row_index: step.before_row_index,
            after_row_index: step.after_row_index,
            before_counts: step.before_counts,
            after_counts: step.after_counts,
            missing_sample_labels: step.missing_sample_labels,
            stale_parent_sample_labels: step.stale_parent_sample_labels
        }))
    };
    return scenario;
};

const runAutoScrollScenario = async (page) => {
    const scenario = {
        direction: 'clip_drag_autoscroll_edges',
        steps: [],
        invariant: { ok: false }
    };
    await safeEval(page, async () => {
        const api = window.eveMtrackApi || null;
        if (!api?.debugMountSyntheticTimeline) return { ok: false, error: 'debug_mount_missing' };
        return api.debugMountSyntheticTimeline({ track_count: 18, clips_per_track: 2 });
    });
    await waitForStableMtrackState(page, 'autoscroll_after_mount', 180, 2200);
    await safeEval(page, () => {
        const scroll = document.querySelector('#eve_mtrack_dialog .eve-mtrack-scroll');
        if (scroll) scroll.scrollTop = 0;
        return { ok: true };
    });
    await waitForStableMtrackState(page, 'autoscroll_before_down', 180, 1800);
    const downSelection = await resolveClipDragGeometry(page, { target: 'scrollBottomEdge', horizontalPx: 20 });
    const downBefore = await collectState(page, 'autoscroll_down:before');
    const downSamples = downSelection?.ok ? await dragWithSamples(page, downSelection.geometry, 'autoscroll_down', { holdMs: 2600 }) : [];
    const downAfter = downSamples[downSamples.length - 1] || await collectState(page, 'autoscroll_down:after');
    const downStep = {
        label: 'autoscroll_down',
        selection: downSelection,
        before_scroll_top: downBefore?.scroll?.top ?? null,
        after_scroll_top: downAfter?.scroll?.top ?? null,
        before_track_count: downBefore?.state?.track_count ?? null,
        after_track_count: downAfter?.state?.track_count ?? null,
        ok: !!(
            downSelection?.ok
            && Number(downAfter?.scroll?.top || 0) > Number(downBefore?.scroll?.top || 0)
            && Number(downAfter?.state?.track_count || 0) === Number(downBefore?.state?.track_count || 0) + 1
            && Number(downAfter?.state?.clip_count || 0) === Number(downBefore?.state?.clip_count || 0)
        )
    };
    if (downStep.ok !== true) downStep.sample_summaries = downSamples.map((sample) => summarizeSample(sample, downSelection?.clip_id || ''));
    scenario.steps.push(downStep);

    await waitForStableMtrackState(page, 'autoscroll_before_up', 180, 1800);
    const upSelection = await resolveClipDragGeometry(page, { target: 'scrollTopEdge', horizontalPx: 20 });
    const upBefore = await collectState(page, 'autoscroll_up:before');
    const upSamples = upSelection?.ok ? await dragWithSamples(page, upSelection.geometry, 'autoscroll_up', { holdMs: 1600 }) : [];
    const upAfter = upSamples[upSamples.length - 1] || await collectState(page, 'autoscroll_up:after');
    const upStep = {
        label: 'autoscroll_up',
        selection: upSelection,
        before_scroll_top: upBefore?.scroll?.top ?? null,
        after_scroll_top: upAfter?.scroll?.top ?? null,
        ok: !!(
            upSelection?.ok
            && Number(upAfter?.scroll?.top || 0) < Number(upBefore?.scroll?.top || 0)
            && Number(upAfter?.state?.clip_count || 0) === Number(upBefore?.state?.clip_count || 0)
        )
    };
    scenario.steps.push(upStep);
    scenario.invariant = {
        ok: scenario.steps.every((step) => step.ok === true),
        failed_steps: scenario.steps.filter((step) => step.ok !== true)
    };
    return scenario;
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
    await context.addInitScript(installTraceFlags);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => {
        consoleErrors.push(error?.message || String(error || 'page_error'));
    });
    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle' });
        await sleep(1000);
        report.project_ready = await ensureProjectReady(page);
        await page.reload({ waitUntil: 'networkidle' });
        await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 25000);
        report.open = await openMtrack(page);
        await waitFor(page, () => {
            const panel = document.getElementById('eve_mtrack_dialog');
            const visible = !!panel && window.getComputedStyle(panel).display !== 'none';
            return visible && !!window.eveMtrackApi?.getState?.()?.activeGroupId;
        }, 15000);
        report.open_state_stable = await waitForStableMtrackState(page, 'after_open');
        persistReport(report);
        report.mount = await mountSyntheticTimeline(page);
        report.synthetic_state_stable = await waitForStableMtrackState(page, 'after_synthetic_mount');
        await safeEval(page, () => {
            const panel = document.getElementById('eve_mtrack_dialog');
            if (!panel) return { ok: false, error: 'panel_missing' };
            Object.assign(panel.style, {
                display: 'flex',
                visibility: 'visible',
                opacity: '1',
                position: 'fixed',
                left: '160px',
                top: '90px',
                width: '1280px',
                height: '720px',
                zIndex: '10000'
            });
            return { ok: true };
        });
        persistReport(report);
        report.mutation_trace = await installClipMutationTrace(page);
        const visibleClipsReady = await waitFor(page, () => (
            Array.from(document.querySelectorAll('#eve_mtrack_dialog .eve-mtrack-clip'))
                .filter((node) => {
                    const rect = node.getBoundingClientRect();
                    return rect.width > 8 && rect.height > 8;
                }).length >= 10
        ), 12000);
        report.visible_clips_ready = visibleClipsReady;
        report.visible_clip_wait_state = await collectState(page, 'visible_clip_wait');
        report.debug_state = await safeEval(page, () => ({
            app_state: window.__DEBUG__?.getAppState?.() || null,
            timeline_state: window.__DEBUG__?.getTimelineState?.() || null,
            gpu_stats: window.__DEBUG__?.getGPUStats?.() || null
        }));
        report.visible_clip_wait_screenshot = path.join(OUT_DIR, 'visible_clip_wait.png');
        await page.screenshot({ path: report.visible_clip_wait_screenshot, fullPage: true });
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
        report.scenarios.push(await runDirectionalStressScenario(page));
        persistReport(report);
        report.scenarios.push(await runAutoScrollScenario(page));
        persistReport(report);
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
        if (report.ok !== true) {
            process.exitCode = 1;
        }
    } finally {
        await browser.close();
    }
};

run().catch((error) => {
    const report = lastReport && typeof lastReport === 'object' ? lastReport : {
        created_at: new Date().toISOString(),
        url: APP_URL,
    };
    report.ok = false;
    report.error = error?.message || String(error || 'probe_failed');
    report.stack = error?.stack || null;
    persistReport(report);
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
});
