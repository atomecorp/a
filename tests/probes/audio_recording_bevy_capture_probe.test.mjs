import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ensureProject } from './dashboard_workspace_stress/product_actions.mjs';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://localhost:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports/audio_recording_bevy_capture_probe');
const REPORT_FILE = path.join(OUT_DIR, 'report.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const writeReport = (report) => {
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const resolveWorkspaceRecordingPath = ({ filePath = '', ownerId = '' } = {}) => {
    const raw = String(filePath || '').trim();
    if (!raw) return '';
    if (path.isAbsolute(raw)) return raw;
    if (/^data\/users\//i.test(raw)) return path.resolve(raw);
    if (/^recordings\//i.test(raw) && ownerId) return path.resolve('data', 'users', ownerId, raw);
    return path.resolve(raw);
};

const safeEval = async (page, fn, arg = null, timeout = 20000) => {
    try {
        return await Promise.race([
            page.evaluate(fn, arg),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`eval_timeout_${timeout}`)), timeout))
        ]);
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeout = 30000, interval = 250, arg = null) => {
    const start = Date.now();
    let last = null;
    while (Date.now() - start < timeout) {
        last = await safeEval(page, predicate, arg, Math.min(timeout, interval + 4000));
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(interval);
    }
    return { ok: false, last };
};

const tryLogin = async (page) => {
    const login = await safeEval(page, async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.login) return { ok: false, error: 'auth_login_unavailable' };
        try {
            const result = await api.auth.login(phone, password, phone);
            return { ok: !!(result?.fastify?.success || result?.tauri?.success), result };
        } catch (error) {
            return { ok: false, error: error?.message || String(error || 'login_failed') };
        }
    }, { phone: PHONE, password: PASSWORD });
    if (login?.ok) return login;
    return safeEval(page, async ({ phone, password }) => {
        const api = window.AdoleAPI || null;
        if (!api?.auth?.create) return { ok: false, error: 'auth_create_unavailable' };
        const result = await api.auth.create(phone, password, phone, { autoLogin: true });
        return {
            ok: !!(result?.fastify?.success || result?.tauri?.success || result?.login?.fastify?.success || result?.login?.tauri?.success),
            result
        };
    }, { phone: PHONE, password: PASSWORD }, 30000);
};

const clickBevyMainMenuItem = async (page, nodeId) => {
    const target = await page.evaluate((targetId) => {
        const surface = document.getElementById('eve_surface_project');
        const runtime = window.eveBevyUiRuntime;
        const rect = surface?.getBoundingClientRect?.();
        if (!surface || !runtime?.hitTestAtClientPoint || !rect) {
            return { ok: false, error: 'bevy_surface_or_hit_test_missing' };
        }
        const itemSize = 60;
        for (let y = Math.max(0, rect.height - (itemSize * 1.5)); y < rect.height; y += 2) {
            for (let x = 0; x < rect.width; x += 2) {
                const hit = runtime.hitTestAtClientPoint({
                    surface,
                    clientX: rect.left + x,
                    clientY: rect.top + y
                });
                if (String(hit?.nodeId || hit?.node?.id || '') !== targetId) continue;
                return { ok: true, clientX: rect.left + x, clientY: rect.top + y };
            }
        }
        const tree = runtime.state?.trees?.get?.('eve_bevy_ui_main_menu')?.tree || null;
        const ids = [];
        const visit = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.on) ids.push({ id: node.id, position: node.style?.position, size: node.style?.size });
            (node.children || []).forEach(visit);
        };
        visit(tree?.root);
        return {
            ok: false,
            error: 'bevy_menu_item_not_found',
            nodeId: targetId,
            surface: { width: rect.width, height: rect.height },
            treeIds: Array.from(runtime.state?.trees?.keys?.() || []),
            interactive: ids
        };
    }, nodeId);
    if (!target?.ok) throw new Error(`bevy_menu_click_target_failed:${JSON.stringify(target)}`);
    await page.mouse.click(target.clientX, target.clientY);
    return target;
};

const readAudioScopeSnapshot = (page) => page.evaluate(() => {
    const tree = window.eveBevyUiRuntime?.state?.trees?.get?.('eve_bevy_ui_main_menu')?.tree || null;
    const bars = [];
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (String(node.id || '').includes('capture__audio_recording_scope_bar_')) {
            bars.push(Number(node.style?.size?.[1] || 0));
        }
        (node.children || []).forEach(visit);
    };
    visit(tree?.root);
    return {
        ok: bars.length === 32,
        bars,
        min: bars.length ? Math.min(...bars) : 0,
        max: bars.length ? Math.max(...bars) : 0
    };
});

const run = async () => {
    const report = {
        ok: false,
        app_url: APP_URL,
        bevy_capture: null,
        recording: null,
        file: null,
        state: null,
        scene: null,
        decode: null,
        errors: []
    };
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== '0',
        args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            '--autoplay-policy=no-user-gesture-required'
        ]
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        permissions: ['microphone']
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => report.errors.push(error.message));

    try {
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const ready = await waitFor(page, () => !!window.AdoleAPI && window.__authCheckComplete === true);
        if (!ready.ok) throw new Error('app_not_ready');
        const login = await tryLogin(page);
        if (!login?.ok) throw new Error(`login_failed:${login?.error || 'unknown'}`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        await waitFor(page, () => window.__authCheckComplete === true, 20000);
        const workspaceRuntimeReady = await waitFor(page, () => ({
            ok: typeof window.eveToolBase?.loadProjectAtomes === 'function'
                && typeof window.eveToolBase?.renderProjectScene === 'function'
        }), 30000, 100);
        if (!workspaceRuntimeReady.ok) throw new Error('probe_workspace_runtime_not_ready');
        const project = await ensureProject(page, `Audio recording Bevy probe ${Date.now()}`);
        if (!project?.ok) throw new Error(`probe_project_create_failed:${JSON.stringify(project)}`);
        const activated = await safeEval(page, async (entry) => {
            const module = await import('/eVe/intuition/matrix/core/project_data.js');
            const result = await module.activateProjectWorkspace?.(entry, { force: true, staleFirst: false });
            return { ok: result?.ok !== false, result };
        }, project, 60000);
        if (!activated?.ok) throw new Error(`probe_project_activation_failed:${JSON.stringify(activated)}`);
        await page.waitForFunction(() => (
            !!window.__DEBUG__ || !!document.getElementById('intuition')
        ), null, { timeout: 30000 });
        await page.waitForFunction(async () => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const measure = getMainMenuRuntime()?.measure?.();
            return !!document.getElementById('eve_surface_project')
                && measure?.active === true
                && measure?.treeMounted === true
                && window.eveBevyUiRuntime?.state?.trees?.has?.('eve_bevy_ui_main_menu') === true;
        }, null, { timeout: 30000 });
        report.bevy_capture = await safeEval(page, async () => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const measure = getMainMenuRuntime()?.measure?.() || {};
            return {
                ok: measure.active === true
                    && measure.treeMounted === true
                    && !!document.getElementById('eve_surface_project')
                    && window.eveBevyUiRuntime?.state?.trees?.has?.('eve_bevy_ui_main_menu') === true,
                active: measure.active === true,
                tree_mounted: measure.treeMounted === true,
                canvas_id: document.getElementById('eve_surface_project')?.id || null
            };
        });

        const initialState = await safeEval(page, async () => {
            const mod = await import('/eVe/domains/media/api/audio_api.js');
            return mod.getAudioRecordingState?.() || {};
        });
        if (initialState?.isRecording === true) throw new Error('probe_audio_already_recording');

        await clickBevyMainMenuItem(page, 'eve_bevy_ui_main_menu_tool_capture');
        const paletteReady = await waitFor(page, async () => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            return { ok: getMainMenuRuntime()?.measure?.()?.activePaletteKey === 'capture' };
        }, 15000, 50);
        if (!paletteReady.ok) throw new Error(`capture_palette_not_open:${JSON.stringify(paletteReady.last)}`);

        await clickBevyMainMenuItem(page, 'eve_bevy_ui_main_menu_tool_capture__audio');
        const started = await waitFor(page, async () => {
            const mod = await import('/eVe/domains/media/api/audio_api.js');
            const state = mod.getAudioRecordingState?.() || {};
            return { ok: state.isRecording === true && !!state.projectAtomeId, state };
        }, 20000, 50);
        if (!started.ok) throw new Error(`audio_real_click_start_failed:${JSON.stringify(started.last)}`);

        const scopeSnapshots = [];
        for (let index = 0; index < 8; index += 1) {
            await sleep(120);
            scopeSnapshots.push(await readAudioScopeSnapshot(page));
        }
        const scopeVariable = scopeSnapshots.some((snapshot) => snapshot.ok && snapshot.max - snapshot.min > 0.25);

        const projectAtomeId = started.last.state.projectAtomeId;
        await clickBevyMainMenuItem(page, 'eve_bevy_ui_main_menu_tool_capture__audio');
        const stopped = await waitFor(page, async ({ atomeId }) => {
            const mod = await import('/eVe/domains/media/api/audio_api.js');
            const state = mod.getAudioRecordingState?.() || {};
            const record = await window.Atome?.getStateCurrent?.(atomeId).catch(() => null);
            return { ok: state.isRecording !== true && !!record, state, record };
        }, 60000, 100, { atomeId: projectAtomeId });
        if (!stopped.ok) throw new Error(`audio_real_click_stop_failed:${JSON.stringify(stopped.last)}`);

        report.recording = await safeEval(page, async ({ atomeId, projectId, scopeVariable, scopeSnapshots, initialState }) => {
            const stateRecord = await window.Atome.getStateCurrent(atomeId);
            const props = stateRecord?.properties || stateRecord?.props || {};
            const scene = window.eveToolBase?.getProjectSceneState?.(projectId) || {};
            const occurrences = (scene.records || []).filter((record) => String(record?.id || record?.atome_id || '') === atomeId).length;
            return {
                ok: occurrences === 1 && scopeVariable === true,
                initialState: {
                    isRecording: initialState.isRecording === true,
                    fileName: initialState.fileName || null,
                    pending: initialState.pending === true
                },
                scope_variable: scopeVariable,
                scope_snapshots: scopeSnapshots,
                atom_occurrences: occurrences,
                frame_count: Number(props.frame_count || 0),
                duration_sec: Number(props.duration_sec || 0),
                sample_rate: Number(props.sample_rate || 0),
                project_atome_id: atomeId,
                project_id: projectId,
                owner_id: props.owner_id || props.media_user_id || null,
                file_path: props.file_path || props.path || null,
                media_url: props.media_url || props.src || null
            };
        }, {
            atomeId: projectAtomeId,
            projectId: project.id,
            scopeVariable,
            scopeSnapshots,
            initialState
        }, 60000);

        const audioFilePath = resolveWorkspaceRecordingPath({
            filePath: report.recording?.file_path,
            ownerId: report.recording?.owner_id
        });
        report.file = {
            ok: !!audioFilePath && fs.existsSync(audioFilePath),
            path: audioFilePath || null,
            in_recordings: /\/data\/users\/[^/]+\/recordings\//.test(audioFilePath),
            byte_length: audioFilePath && fs.existsSync(audioFilePath) ? fs.statSync(audioFilePath).size : 0
        };

        report.state = await safeEval(page, async (recording) => {
            const atomeId = String(recording?.project_atome_id || '').trim();
            const projectId = String(recording?.project_id || '').trim();
            if (!atomeId || !projectId) return { ok: false, error: 'recording_project_identity_missing', atomeId, projectId };
            const stateRecord = window.Atome?.getStateCurrent
                ? await window.Atome.getStateCurrent(atomeId).catch((error) => ({ error: error?.message || String(error) }))
                : null;
            const props = stateRecord?.properties || stateRecord?.props || {};
            const api = window.AdoleAPI?.atomes || null;
            const apiGet = api?.get
                ? await api.get(atomeId).catch((error) => ({ error: error?.message || String(error) }))
                : { skipped: true, reason: 'AdoleAPI.atomes.get_unavailable' };
            const apiList = api?.list
                ? await api.list({ projectId, limit: 2000, includeShared: true }).catch((error) => ({ error: error?.message || String(error) }))
                : { skipped: true, reason: 'AdoleAPI.atomes.list_unavailable' };
            const collectAtomeListEntries = (payload = null) => {
                if (Array.isArray(payload)) return payload;
                if (!payload || typeof payload !== 'object') return [];
                const lists = [
                    payload.atomes,
                    payload.records,
                    payload.items,
                    payload.data,
                    payload.fastify?.atomes,
                    payload.tauri?.atomes
                ];
                const merged = new Map();
                lists.filter(Array.isArray).flat().forEach((entry) => {
                    const id = String(entry?.id || entry?.atome_id || entry?.atomeId || '').trim();
                    if (id && !merged.has(id)) merged.set(id, entry);
                });
                return Array.from(merged.values());
            };
            const listed = collectAtomeListEntries(apiList);
            const listedEntry = listed.find((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '') === atomeId) || null;
            const listedProps = listedEntry?.properties || listedEntry?.props || listedEntry?.data?.properties || listedEntry?.data?.props || {};
            const listContains = !!listedEntry;
            return {
                ok: !!stateRecord && !stateRecord.error && String(stateRecord.id || stateRecord.atome_id || stateRecord.atomeId || atomeId) === atomeId,
                atome_id: atomeId,
                project_id: projectId,
                state_kind: props.kind || stateRecord?.kind || null,
                media_url: props.media_url || props.mediaUrl || null,
                storage_root: props.storage_root || null,
                state_peak_count: Array.isArray(props.peaks) ? props.peaks.length : 0,
                state_waveform_peak_count: Array.isArray(props.waveform_peaks) ? props.waveform_peaks.length : 0,
                list_peak_count: Array.isArray(listedProps.peaks) ? listedProps.peaks.length : 0,
                list_waveform_peak_count: Array.isArray(listedProps.waveform_peaks) ? listedProps.waveform_peaks.length : 0,
                api_get_ok: !!apiGet && !apiGet.error && apiGet.skipped !== true,
                api_get_skipped: apiGet?.skipped === true,
                api_list_contains: listContains,
                api_list_skipped: apiList?.skipped === true,
                api_error: apiGet?.error || apiList?.error || null
            };
        }, report.recording, 60000);

        report.scene = await safeEval(page, async (recording) => {
            const atomeId = String(recording?.project_atome_id || '').trim();
            const projectId = String(recording?.project_id || '').trim();
            if (!atomeId || !projectId) return { ok: false, error: 'recording_project_identity_missing', atomeId, projectId };
            const findVirtualNode = (root, targetId, seen = new Set()) => {
                if (!root || typeof root !== 'object' || seen.has(root)) return null;
                seen.add(root);
                if (String(root.id || root.atome_id || root.atomeId || '') === targetId) return root;
                const children = [
                    ...(Array.isArray(root.nodes) ? root.nodes : []),
                    ...(Array.isArray(root.children) ? root.children : []),
                    ...(Array.isArray(root.items) ? root.items : []),
                    ...(root.root && typeof root.root === 'object' ? [root.root] : [])
                ];
                for (const child of children) {
                    const found = findVirtualNode(child, targetId, seen);
                    if (found) return found;
                }
                return null;
            };
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const deadline = Date.now() + 15000;
            let scene = null;
            let record = null;
            let node = null;
            while (Date.now() < deadline) {
                scene = window.eveToolBase?.getProjectSceneState?.(projectId) || null;
                const records = Array.isArray(scene?.records) ? scene.records : [];
                record = records.find((entry) => String(entry?.id || entry?.atome_id || entry?.atomeId || '') === atomeId) || null;
                node = findVirtualNode(scene?.projection?.virtual_scene || null, atomeId);
                if (record && node) break;
                await sleep(250);
            }
            const canvas = document.getElementById('eve_surface_project');
            const rect = canvas?.getBoundingClientRect?.();
            return {
                ok: !!record && !!canvas && Number(canvas.width || 0) > 0 && Number(canvas.height || 0) > 0 && !!node,
                atome_id: atomeId,
                project_id: projectId,
                record_present: !!record,
                canvas_present: !!canvas,
                canvas_id: canvas?.id || null,
                canvas_role: canvas?.getAttribute?.('data-role') || null,
                canvas_width: Number(canvas?.width || 0),
                canvas_height: Number(canvas?.height || 0),
                canvas_css_width: Number(rect?.width || 0),
                canvas_css_height: Number(rect?.height || 0),
                virtual_node_present: !!node,
                virtual_node_type: node?.type || null,
                scene_peak_count: Array.isArray(node?.content?.peaks) ? node.content.peaks.length : 0,
                render_ok: scene?.projection?.ok === true,
                render_error: scene?.projection?.render_result?.error || scene?.projection?.render_result?.reason || null
            };
        }, report.recording, 60000);

        report.decode = await safeEval(page, async (recording) => {
            const projectId = recording?.project_atome_id || null;
            let state = null;
            if (projectId && window.Atome?.getStateCurrent) {
                state = await window.Atome.getStateCurrent(projectId).catch(() => null);
            }
            const props = state?.properties || state?.props || state || {};
            const playInput = {
                source: 'recording',
                file_name: props.file_name || '',
                recording_id: props.recording_id || projectId || '',
                local_recording_id: props.local_recording_id || projectId || '',
                local_recording_backend: props.local_recording_backend || ''
            };
            if (typeof window.record_audio_play !== 'function') return { ok: false, error: 'record_audio_play_unavailable', playInput };
            const playable = await window.record_audio_play(playInput);
            if (playable?.ok !== true || !playable.url) return { ok: false, error: playable?.error || 'playable_failed', playable, playInput };
            const blob = await fetch(playable.url).then((res) => res.blob());
            const buffer = await blob.arrayBuffer();
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtx();
            const decoded = await ctx.decodeAudioData(buffer.slice(0));
            await ctx.close();
            playable.revoke?.();
            return {
                ok: decoded.length > 0 && decoded.duration > 0,
                byte_length: buffer.byteLength,
                decoded_length: decoded.length,
                decoded_duration: decoded.duration,
                decoded_sample_rate: decoded.sampleRate,
                playInput
            };
        }, report.recording, 60000);

        report.ok = report.bevy_capture?.ok === true
            && report.recording?.ok === true
            && report.file?.ok === true
            && report.file?.in_recordings === true
            && report.state?.ok === true
            && report.scene?.ok === true
            && report.recording.frame_count > 0
            && report.recording.duration_sec > 0
            && report.decode?.ok === true;
    } finally {
        writeReport(report);
        await browser.close();
    }
    if (!report.ok) {
        throw new Error(`audio_recording_bevy_capture_probe_failed:${JSON.stringify({
            bevy_capture: report.bevy_capture?.ok,
            recording: report.recording?.ok,
            decode: report.decode?.ok,
            errors: report.errors
        })}`);
    }
    console.log(JSON.stringify({ ok: true, report: REPORT_FILE }, null, 2));
    process.exit(0);
};

run().catch((error) => {
    console.error(error?.message || String(error));
    process.exit(1);
});
