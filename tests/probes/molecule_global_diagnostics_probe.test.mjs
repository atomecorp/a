import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const PHONE = process.env.ADOLE_TEST_PHONE || '55555555';
const PASSWORD = process.env.ADOLE_TEST_PASSWORD || '55555555';
const OUT_DIR = path.resolve('temp/probe_reports/molecule_global_diagnostics_probe');
const OUT_FILE = path.join(OUT_DIR, 'report.json');
const SCREENSHOT_FILE = path.join(OUT_DIR, 'panel_state.png');

fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeEval = async (page, fn, arg = null) => {
    try {
        return await page.evaluate(fn, arg);
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'eval_failed') };
    }
};

const waitFor = async (page, predicate, timeoutMs = 20000, intervalMs = 250) => {
    const startedAt = Date.now();
    let last = null;
    while ((Date.now() - startedAt) < timeoutMs) {
        last = await safeEval(page, predicate);
        if (last === true || last?.ok === true) return { ok: true, last };
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

const persistReport = (report) => {
    fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
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

const ensureProjectReady = async (page) => safeEval(page, async ({ phone, password }) => {
    const api = window.AdoleAPI || null;
    if (!api?.auth?.login) return { ok: false, error: 'auth_api_unavailable' };
    try {
        await api.auth.login(phone, password, phone);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error?.message || String(error || 'login_failed') };
    }
}, { phone: PHONE, password: PASSWORD });

const resolveExistingTarget = async (page) => safeEval(page, () => {
    const candidates = Array.from(document.querySelectorAll('[data-atome-id]')).filter((node) => {
        const kind = String(node.dataset?.atomeKind || node.dataset?.kind || '').trim().toLowerCase();
        if (!kind || kind === 'tool_shortcut' || kind === 'mtrack') return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.right > 0;
    });
    const target = candidates.find((node) => String(node.dataset?.atomeKind || '').toLowerCase() === 'group') || candidates[0] || null;
    const id = String(target?.dataset?.atomeId || '').trim();
    return id ? { ok: true, atome_id: id } : { ok: false, error: 'target_atome_missing' };
});

const openMoleculeForTarget = async (page, target) => safeEval(page, async (input) => {
    const runtime = window.atome?.tools?.v2Runtime || null;
    if (!runtime?.invokeById) return { ok: false, error: 'runtime_invoke_missing' };
    const id = String(input?.atome_id || '').trim();
    if (!id) return { ok: false, error: 'target_id_missing' };
    return runtime.invokeById({
        tool_id: 'ui.mtrax.open',
        event: 'diagnostic_open',
        action: 'open',
        input: {
            action: 'open',
            toggle: false,
            atome_id: id,
            atomeId: id,
            target_id: id,
            targetId: id,
            selection_ids: [id],
            selectionIds: [id]
        },
        presentation: 'ui',
        source: { type: 'headless_probe', layer: 'molecule_global_diagnostics_probe' }
    });
}, target);

const collectDiagnostics = async (page, label) => safeEval(page, (inputLabel) => {
    const readRect = (node) => {
        if (!node?.getBoundingClientRect) return null;
        const rect = node.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom
        };
    };
    const describeNode = (node) => {
        if (!node) return null;
        const style = window.getComputedStyle(node);
        return {
            tag: String(node.tagName || '').toLowerCase(),
            id: String(node.id || ''),
            role: String(node.getAttribute?.('data-role') || node.getAttribute?.('role') || ''),
            class_name: String(node.className || ''),
            display: style.display,
            visibility: style.visibility,
            pointer_events: style.pointerEvents,
            rect: readRect(node)
        };
    };
    const panel = document.getElementById('eve_mtrack_dialog');
    const body = document.getElementById('eve_mtrack_dialog__body');
    const preview = document.getElementById('eve_mtrack_dialog__preview_section');
    const previewHost = document.getElementById('eve_mtrack_dialog__preview_host');
    const scroll = document.getElementById('eve_mtrack_dialog__scroll');
    const tracks = Array.from(panel?.querySelectorAll?.('.eve-mtrack-track') || []);
    const clips = Array.from(panel?.querySelectorAll?.('.eve-mtrack-clip') || []);
    const debug = window.__DEBUG__ || null;
    const api = window.eveMtrackApi || null;
    const safeCall = (fn) => {
        try {
            return typeof fn === 'function' ? fn() : null;
        } catch (error) {
            return { ok: false, error: error?.message || String(error || 'call_failed') };
        }
    };
    return {
        ok: true,
        label: inputLabel,
        captured_at: new Date().toISOString(),
        debug: {
            available: !!debug,
            app_state: safeCall(debug?.getAppState?.bind(debug)),
            timeline_state: safeCall(debug?.getTimelineState?.bind(debug)),
            gpu_stats: safeCall(debug?.getGPUStats?.bind(debug))
        },
        mtrack: {
            api_available: !!api,
            state: safeCall(api?.getState?.bind(api)),
            exported_timeline: safeCall(api?.exportTimeline?.bind(api)),
            renderer_state: safeCall(api?.getRendererState?.bind(api))
        },
        dom: {
            panel: describeNode(panel),
            body: describeNode(body),
            preview: describeNode(preview),
            preview_host: describeNode(previewHost),
            scroll: describeNode(scroll),
            tracks: tracks.map((node, index) => ({
                index,
                id: String(node.dataset?.trackId || node.id || ''),
                record_source: String(node.dataset?.trackRecordSource || ''),
                rect: readRect(node)
            })),
            clips: clips.map((node, index) => ({
                index,
                clip_id: String(node.dataset?.clipId || node.id || ''),
                persist_id: String(node.dataset?.persistId || ''),
                track_id: String(node.dataset?.trackId || ''),
                kind: String(node.dataset?.clipKind || ''),
                parent_track_id: String(node.closest?.('.eve-mtrack-track')?.dataset?.trackId || ''),
                rect: readRect(node),
                left_handle: readRect(node.querySelector?.('[data-role="clip-handle-left"], .eve-mtrack-clip-handle-left')),
                right_handle: readRect(node.querySelector?.('[data-role="clip-handle-right"], .eve-mtrack-clip-handle-right'))
            }))
        },
        traces: {
            mtrack_trace: typeof window.__dumpEveMtrackTrace === 'function' ? window.__dumpEveMtrackTrace().slice(-160) : [],
            mtrack_critical_trace: typeof window.__dumpEveMtrackCriticalTrace === 'function' ? window.__dumpEveMtrackCriticalTrace().slice(-80) : [],
            event_trace: Array.isArray(window.__EVE_MTRACK_EVENT_TRACE__) ? window.__EVE_MTRACK_EVENT_TRACE__.slice(-160) : [],
            dock_trace: Array.isArray(window.__EVE_MTRACK_DOCK_TRACE__) ? window.__EVE_MTRACK_DOCK_TRACE__.slice(-120) : [],
            interaction_trace: Array.isArray(window.__EVE_MTRAX_INTERACTION_TRACE__) ? window.__EVE_MTRAX_INTERACTION_TRACE__.slice(-120) : []
        }
    };
}, label);

const run = async () => {
    const report = {
        ok: false,
        created_at: new Date().toISOString(),
        app_url: APP_URL,
        console_errors: [],
        steps: []
    };
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 960 } });
    await context.addInitScript(installTraceFlags);
    const page = await context.newPage();
    page.on('console', (message) => {
        if (message.type() === 'error') {
            report.console_errors.push({ text: message.text(), at: Date.now() });
        }
    });
    page.on('pageerror', (error) => {
        report.console_errors.push({ text: error?.message || String(error || 'page_error'), at: Date.now() });
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'networkidle' });
        await sleep(800);
        report.steps.push({ name: 'login', result: await ensureProjectReady(page) });
        const runtimeReady = await waitFor(page, () => !!window.atome?.tools?.v2Runtime, 25000);
        report.steps.push({ name: 'runtime_ready', result: runtimeReady });
        const target = await resolveExistingTarget(page);
        report.steps.push({ name: 'resolve_existing_target', result: target });
        if (target?.ok) {
            report.steps.push({ name: 'open_molecule', result: await openMoleculeForTarget(page, target) });
            await waitFor(page, () => {
                const panel = document.getElementById('eve_mtrack_dialog');
                return !!(panel && window.getComputedStyle(panel).display !== 'none');
            }, 12000);
        }
        report.diagnostics = await collectDiagnostics(page, 'after_open_attempt');
        await page.screenshot({ path: SCREENSHOT_FILE, fullPage: true });
        report.screenshot = SCREENSHOT_FILE;
        report.ok = report.diagnostics?.ok === true;
        persistReport(report);
    } finally {
        await browser.close();
    }

    if (!report.ok) process.exit(1);
};

run().catch((error) => {
    persistReport({
        ok: false,
        created_at: new Date().toISOString(),
        app_url: APP_URL,
        error: error?.stack || error?.message || String(error || 'probe_failed')
    });
    process.exit(1);
});
