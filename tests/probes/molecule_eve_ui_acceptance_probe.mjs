import { runMoleculeListAcceptance } from "./molecule_ui_list_acceptance.mjs";
import { runMoleculeTimelineAcceptance } from "./molecule_ui_timeline_acceptance.mjs";
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from "playwright";

import { createRichMoleculeFixture } from "../fixtures/molecule/canonical_v2_fixtures.mjs";
import { runMoleculeDropAcceptance } from "./molecule_ui_drop_acceptance_scenarios.mjs";
import { assert, clickCanvasTarget, findBevyUiNodeTarget, runSetupStep, wait, waitFor } from "./molecule_ui_acceptance_support.mjs";

const APP_URL = process.env.ADOLE_TEST_URL || 'http://127.0.0.1:3001';
const HEADLESS = process.env.ATOME_PLAYWRIGHT_HEADLESS === '1';
const VIEWPORT = Object.freeze({
    width: Math.max(320, Number.parseInt(process.env.MOLECULE_UI_WIDTH || '1440', 10) || 1440),
    height: Math.max(320, Number.parseInt(process.env.MOLECULE_UI_HEIGHT || '980', 10) || 980)
});
const DEVICE_SCALE_FACTOR = [1, 2, 3].includes(Number(process.env.MOLECULE_UI_DPR))
    ? Number(process.env.MOLECULE_UI_DPR) : 1;
const MOBILE_EMULATION = DEVICE_SCALE_FACTOR === 3;
const EXPECTED_HANDEDNESS = process.env.MOLECULE_UI_HANDEDNESS === 'left' ? 'left' : 'right';
const REPORT_TAG = String(process.env.MOLECULE_UI_REPORT_TAG || 'default').replace(/[^a-zA-Z0-9_-]+/g, '_');
const ENDURANCE_MS = Math.max(0, Number.parseInt(process.env.MOLECULE_UI_ENDURANCE_MS || '0', 10) || 0);
const ENDURANCE_MIN_CYCLES = Math.max(
    1,
    Number.parseInt(process.env.MOLECULE_UI_ENDURANCE_MIN_CYCLES || '100', 10) || 100
);
const DROP_ONLY = process.env.MOLECULE_UI_DROP_ONLY === '1';
const OUT_DIR = path.resolve('temp/probe_reports/molecule_eve_ui_acceptance', REPORT_TAG);
const REPORT_FILE = path.join(OUT_DIR, 'report.json');

fs.mkdirSync(OUT_DIR, { recursive: true });


const ensureProject = (page, projectName) => page.evaluate(async (name) => {
    const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    workspaceMode.beginDashboardWorkspaceTransition?.('project');
    if (window.eveDashboardBevyUiRuntime?.state?.active === true) {
        await window.eveDashboardBevyUiRuntime.destroy();
    }
    const created = await window.AdoleAPI.projects.create(name);
    const directId = created?.id || created?.project_id || created?.atome_id
        || created?.fastify?.project?.id || created?.tauri?.project?.id || '';
    let projectId = String(directId || '');
    if (!projectId) {
        const listed = await window.AdoleAPI.projects.list();
        const projects = [
            ...(listed?.fastify?.projects || []),
            ...(listed?.tauri?.projects || []),
            ...(listed?.projects || [])
        ];
        const match = projects.find((project) => String(project?.name || project?.properties?.name || '') === name);
        projectId = String(match?.id || match?.atome_id || match?.project_id || '');
    }
    if (!projectId) return { ok: false, error: 'project_id_missing', created };
    const projectRuntime = await import('/eVe/intuition/matrix/core/project_data.js');
    const activation = await projectRuntime.activateProjectWorkspace({ id: projectId, name }, {
        force: true, staleFirst: false
    });
    workspaceMode.markProjectWorkspaceMode?.(projectId);
    return {
        ok: activation?.ok === true,
        id: projectId,
        name,
        loaded: activation?.loaded || null,
        activation
    };
}, projectName);

const enterProvisionedWorkspace = async (page) => {
    await page.goto(APP_URL, { waitUntil: 'commit', timeout: 45000 });
    await page.waitForFunction(() => !!window.AdoleAPI && window.__authCheckComplete === true, null, { timeout: 45000 });
    const login = await page.evaluate(async () => {
        const api = window.AdoleAPI;
        const current = await api.auth.current().catch(() => null);
        if (current?.logged === true && api.security?.isAnonymous?.() === false) return { ok: true, current };
        const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`.replace(/\D+/g, '').slice(-10);
        const phone = `+1555${suffix}`;
        const password = `molecule_${suffix}_password`;
        const username = `molecule_${suffix}`;
        const requested = await api.auth.requestPhoneVerification(phone, 'enrollment', { exposeForTest: true });
        if (!requested?.ok || !requested?.code) return { ok: false, requested };
        const verified = await api.auth.verifyPhoneVerification(phone, requested.code, 'enrollment');
        if (!verified?.ok) return { ok: false, requested, verified };
        const result = await api.auth.create(phone, password, username, { autoLogin: true });
        return {
            ok: result?.fastify?.success === true || result?.tauri?.success === true,
            phone,
            result,
            verification: { requested: requested.ok, verified: verified.ok }
        };
    });
    if (!login?.ok) throw new Error(`provisioned_login_failed:${JSON.stringify(login)}`);
    await page.reload({ waitUntil: 'commit', timeout: 45000 });
    return waitFor(page, async () => {
        const current = await window.AdoleAPI?.auth?.current?.().catch(() => null);
        const canvas = document.getElementById('eve_surface_project');
        return {
            ok: current?.logged === true
                && window.AdoleAPI?.security?.isAnonymous?.() === false
                && !!canvas && getComputedStyle(canvas).opacity === '1'
                && !!(window.__DEBUG__ || window.new_menu_v2),
            anonymous: window.AdoleAPI?.security?.isAnonymous?.() ?? null,
            surface_opacity: canvas ? getComputedStyle(canvas).opacity : null
        };
    });
};

const projectViewNode = (page, _projectId, nodeId) => findBevyUiNodeTarget(page, {
    nodeId,
    treeId: 'eve_bevy_ui_project_view',
    step: 2
});

const installCanonicalFixture = (page, projectId) => page.evaluate(async ({ pid, fixtureTimeline }) => {
    const timeline = fixtureTimeline;
    const sources = [
        ['audio', 'audio'], ['video', 'video'], ['image', 'image'], ['text', 'text'],
        ['drawing', 'shape'], ['page', 'group'], ['code', 'text']
    ];
    const sourceIds = new Map();
    for (let index = 0; index < sources.length; index += 1) {
        const [key, kind] = sources[index];
        const created = await window.eveToolBase.createAtome({
            kind, type: kind, name: `Fixture ${key}`, projectId: pid,
            text: kind === 'text' ? `Fixture ${key}` : undefined,
            left: `${40 + index * 12}px`, top: `${40 + index * 8}px`, width: '160px', height: '90px'
        }, { render: false });
        const id = String(created?.id || created?.atome_id || created?.ids?.[0] || '');
        if (!created?.ok || !id) throw new Error(`fixture_source_create_failed:${key}:${JSON.stringify(created)}`);
        sourceIds.set(`fixture_atome_${key}`, id);
    }
    const owner = await window.eveToolBase.createAtome({
        kind: 'group', type: 'group', name: 'Molécule 1', projectId: pid
    }, { render: false });
    const ownerId = String(owner?.id || owner?.atome_id || owner?.ids?.[0] || '');
    if (!owner?.ok || !ownerId) throw new Error('fixture_owner_create_failed');
    timeline.project_id = pid;
    timeline.owner_atome_id = ownerId;
    timeline.timeline_id = `tl_${ownerId}`;
    timeline.clips = timeline.clips.map((clip) => ({
        ...clip,
        source: clip.source?.type === 'atome'
            ? { ...clip.source, atome_id: sourceIds.get(clip.source.atome_id) || clip.source.atome_id }
            : clip.source
    }));
    const txId = `molecule_acceptance_fixture_${ownerId}_${Date.now()}`;
    const membershipEvents = [...sourceIds.values()].map((sourceId, hierarchyOrder) => ({
        kind: 'set',
        atome_id: sourceId,
        project_id: pid,
        parent_id: ownerId,
        tx_id: txId,
        props: { hierarchy_order: hierarchyOrder }
    }));
    const committed = await window.Atome.commitBatch([
        {
            kind: 'set',
            atome_id: ownerId,
            project_id: pid,
            tx_id: txId,
            props: { molecule_timeline: timeline }
        },
        ...membershipEvents
    ], { projectId: pid, tx_id: txId });
    if (!committed?.ok) throw new Error(`fixture_molecule_commit_failed:${JSON.stringify(committed)}`);
    await window.eveToolBase.loadProjectAtomes(pid, { staleFirst: false });
    await window.eveDashboardBevyUiRuntime?.destroy?.();
    const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
    workspaceMode.markProjectWorkspaceMode?.(pid);
    return { ok: true, ownerId, timelineId: timeline.timeline_id, clipId: timeline.clips[0].clip_id };
}, { pid: projectId, fixtureTimeline: createRichMoleculeFixture() });

const readAcceptanceState = (page, projectId, ownerId) => page.evaluate(async ({ pid, owner }) => {
    const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
    const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
    const ownerState = await window.Atome.getStateCurrent(owner);
    const timeline = ownerState?.molecule_timeline
        || ownerState?.props?.molecule_timeline
        || ownerState?.properties?.molecule_timeline
        || null;
    const scene = window.eveToolBase?.getProjectSceneState?.(pid) || null;
    const records = scene?.records || [];
    const overlay = window.eveBevyUiRuntime?.readOverlayDiagnostics?.() || null;
    return {
        ok: true,
        mode: readProjectViewSurfaceState().mode,
        content: readProjectViewSurfaceState().content,
        menu: getMainMenuRuntime()?.measure?.() || null,
        handedness: getMainMenuRuntime()?.handedness || null,
        timeline,
        canvas_count: document.querySelectorAll('canvas#eve_surface_project').length,
        authoritative_dom_count: document.querySelectorAll('[id^="eve-atome_"]').length,
        records: records.map((record) => String(record.id || '')),
        overlay_error: overlay?.lastOverlayError || null,
        mounted_trees: overlay?.trees?.map((tree) => tree.id) || []
    };
}, { pid: projectId, owner: ownerId });

const main = async () => {
    const report = {
        created_at: new Date().toISOString(),
        url: APP_URL,
        headless: HEADLESS,
        viewport: VIEWPORT,
        device_scale_factor: DEVICE_SCALE_FACTOR,
        mobile_emulation: MOBILE_EMULATION,
        handedness: EXPECTED_HANDEDNESS,
        ok: false,
        checks: [],
        console_errors: [],
        console_warnings: [],
        molecule_drop_logs: [],
        page_errors: [],
        http_errors: [],
        websocket_events: [],
        screenshots: [],
        visual_diff: null,
        measurements: {},
        endurance: null
    };
    const check = async (name, operation) => {
        const startedAt = performance.now();
        try {
            const details = await operation();
            report.checks.push({ name, ok: true, duration_ms: performance.now() - startedAt, details: details ?? null });
            console.log(`  ok   ${name}`);
            return details;
        } catch (error) {
            report.checks.push({ name, ok: false, duration_ms: performance.now() - startedAt, error: error?.message || String(error) });
            console.log(`  FAIL ${name} -> ${error?.message || error}`);
            return null;
        }
    };

    let browser = null;
    let page = null;
    let memberEntryIndex = null;
    try {
        browser = await chromium.launch({
            headless: HEADLESS,
            args: [
                '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox',
                '--enable-precise-memory-info', '--use-fake-device-for-media-stream',
                '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
                ...(HEADLESS ? ['--use-angle=swiftshader', '--enable-features=Vulkan'] : []),
                ...(DEVICE_SCALE_FACTOR > 1 && !HEADLESS ? ['--force-device-scale-factor=1'] : [])
            ]
        });
        const context = await browser.newContext({
            viewport: VIEWPORT,
            deviceScaleFactor: DEVICE_SCALE_FACTOR,
            isMobile: MOBILE_EMULATION,
            hasTouch: MOBILE_EMULATION
        });
        await context.addInitScript((handedness) => {
            localStorage.setItem('eve_handedness', handedness);
            window.__eveProfilePreferences = {
                ...(window.__eveProfilePreferences || {}),
                visual: { ...(window.__eveProfilePreferences?.visual || {}), handedness }
            };
        }, EXPECTED_HANDEDNESS);
        if (process.env.MOLECULE_UI_SKIP_LAYERED_MEDIA !== '1') {
            // Playwright cannot provide files to Chromium's native
            // showOpenFilePicker window. Exercise the framework's canonical
            // browser input picker instead: the BevyUI Import click still owns
            // creation and the browser still emits a real filechooser event.
            await context.addInitScript(() => {
                try {
                    Object.defineProperty(window, 'showOpenFilePicker', {
                        configurable: true, value: undefined
                    });
                } catch (_) {}
            });
        }
        page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        cdp.on('Network.webSocketCreated', (event) => {
            report.websocket_events.push({
                event: 'created',
                request_id: event.requestId,
                url: event.url,
                stack: event.initiator?.stack?.callFrames?.slice(0, 8).map((frame) => ({
                    function: frame.functionName,
                    url: frame.url,
                    line: frame.lineNumber,
                    column: frame.columnNumber
                })) || []
            });
        });
        cdp.on('Network.webSocketClosed', (event) => {
            report.websocket_events.push({ event: 'closed', request_id: event.requestId });
        });
        page.on('console', (message) => {
            const text = message.text();
            if (message.type() === 'error') report.console_errors.push(text);
            if (message.type() === 'warning') report.console_warnings.push(text);
            if (text.startsWith('[eVe][molecule-drop]')) report.molecule_drop_logs.push(text);
        });
        page.on('response', (response) => {
            if (response.status() >= 400) {
                report.http_errors.push({ status: response.status(), url: response.url() });
            }
        });
        page.on('pageerror', (error) => report.page_errors.push(error?.stack || error?.message || String(error)));

        await runSetupStep('provisioned_workspace', () => enterProvisionedWorkspace(page), 90000);
        await runSetupStep('profile_handedness', () => page.evaluate(async (handedness) => {
            const home = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js');
            const loaded = await home.loadHomeProfile();
            if (loaded?.ok !== true) throw new Error(`profile_load_failed:${loaded?.error || 'unknown'}`);
            const profile = loaded.profile;
            profile.preferences.visual.handedness = handedness;
            const persisted = await home.persistHomeProfile({ profile, userId: loaded.userId, guest: false });
            if (persisted?.ok !== true) throw new Error(`profile_persist_failed:${persisted?.error || 'unknown'}`);
        }, EXPECTED_HANDEDNESS));
        await runSetupStep('profile_projection', () => waitFor(page, async (handedness) => {
            const state = await import('/eVe/intuition/core/state.js');
            const menu = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            return {
                ok: state.readState().handedness === handedness
                    && menu.getMainMenuRuntime()?.handedness === handedness,
                state: state.readState().handedness,
                menu: menu.getMainMenuRuntime()?.handedness || null
            };
        }, EXPECTED_HANDEDNESS));
        await page.evaluate(() => window.__DEBUG__?.setDeterministicTestMode?.(true));
        const project = await runSetupStep('project', () => ensureProject(page, `Molecule UI ${REPORT_TAG}`), 90000);
        assert(project?.ok === true, `project_setup_failed:${JSON.stringify(project)}`);
        report.project = project;
        const fixture = await runSetupStep('canonical_fixture', () => installCanonicalFixture(page, project.id), 90000);
        report.fixture = fixture;

        await wait(1200);
        await runSetupStep('workspace_projection', () => page.evaluate(async (pid) => {
            await window.eveDashboardBevyUiRuntime?.destroy?.();
            const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
            workspaceMode.markProjectWorkspaceMode?.(pid);
        }, project.id));
        await runSetupStep('workspace_ready', () => waitFor(page, (pid) => {
            const dashboard = window.eveDashboardBevyUiRuntime?.state || {};
            const trees = window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [];
            return {
                ok: dashboard.active !== true
                    && !trees.some((tree) => tree.id === 'dashboard_bevy_ui')
                    && window.__eveWorkspaceMode?.mode === 'project'
                    && window.__eveWorkspaceMode?.projectId === pid,
                active: dashboard.active === true,
                treeIds: trees.map((tree) => tree.id),
                workspaceMode: window.__eveWorkspaceMode || null
            };
        }, project.id));

        await runSetupStep('menu_ready', () => waitFor(page, async (pid) => {
            const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const menu = getMainMenuRuntime()?.measure?.() || null;
            const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
            const ids = records.map((record) => String(record.id || ''));
            const mainMenuTree = (window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [])
                .find((tree) => tree.id === 'eve_bevy_ui_main_menu');
            // Un compte de lignes ne dit pas POURQUOI l'attente echoue. Quand ce
            // predicat expire, son dernier retour est le seul indice qui parvient
            // au rapport : il doit donc porter DE QUOI conclure — dans quelle
            // scene le menu s'est projete, et ce que celle-ci contient vraiment.
            const overlay = window.eveBevyUiRuntime?.readOverlayDiagnostics?.() || {};
            return {
                ok: menu?.active === true
                    && menu?.treeMounted === true
                    && Number(menu?.reservedHeight || 0) > 0
                    && Number(mainMenuTree?.overlayRecordCount || 0) > 0,
                menu,
                record_count: ids.length,
                menu_record_count: ids.filter((id) => id.startsWith('__eve_bevy_ui_')).length,
                sample_record_ids: ids.slice(0, 12),
                workspace_mode: window.__eveWorkspaceMode || null,
                foreground_project_id: window.eveToolBase?.getProjectSceneState?.(pid)?.sceneProjectId || null,
                overlay_trees: (overlay.trees || []).map((tree) => ({
                    id: tree.id,
                    surface: tree.surfaceId,
                    records: tree.overlayRecordCount,
                    suspended: tree.suspended
                })),
                overlay_error: overlay.lastOverlayError || null
            };
        }, project.id));
        if (DROP_ONLY) {
            await runMoleculeDropAcceptance({
                page, report, check, ensureProject, outDir: OUT_DIR
            });
        } else {
        const suite = { page, project, fixture, report, check, OUT_DIR, EXPECTED_HANDEDNESS, ENDURANCE_MS, ENDURANCE_MIN_CYCLES, cdp, projectViewNode, readAcceptanceState };
        await runMoleculeListAcceptance(suite);
        await runMoleculeTimelineAcceptance(suite);
        if (process.env.MOLECULE_UI_CORE_ONLY !== '1') {
            await runMoleculeDropAcceptance({
                page, report, check, ensureProject, outDir: OUT_DIR
            });
        }
        }

        await check('the browser console and page error channels are clean', async () => {
            assert(report.console_errors.length === 0, report.console_errors.slice(0, 3).join(' | '));
            assert(report.page_errors.length === 0, report.page_errors.slice(0, 3).join(' | '));
            return { console_errors: 0, page_errors: 0 };
        });

        report.ok = report.checks.every((entry) => entry.ok);
        await context.close();
    } catch (error) {
        report.fatal_error = error?.stack || error?.message || String(error);
        if (page && !page.isClosed()) {
            report.fatal_runtime = await page.evaluate(async () => {
                const websocket = await import('/atome/src/squirrel/apis/unified/adole_websocket.js');
                const backend = await import('/atome/src/squirrel/apis/unified/adole_backend.js');
                const transport = websocket.getFastifyWs();
                return {
                    resolved_url: backend.getFastifyWsApiUrl(),
                    explicit_url: window.__SQUIRREL_FASTIFY_WS_API_URL__ || null,
                    configured_base: window.__SQUIRREL_FASTIFY_URL__ || null,
                    transport_url: transport?.url || null,
                    connected: transport?.isConnected === true,
                    connecting: transport?.isConnecting === true,
                    disposed: transport?.disposed === true,
                    ready_state: transport?.socket?.readyState ?? null,
                    pending_requests: transport?.pendingRequests?.size ?? null
                };
            }).catch((runtimeError) => ({ read_error: runtimeError?.message || String(runtimeError) }));
        }
    } finally {
        if (browser) await browser.close().catch(() => null);
        fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    console.log(`report: ${REPORT_FILE}`);
    console.log(report.ok ? 'all checks passed' : 'acceptance failed');
    process.exit(report.ok ? 0 : 1);
};

await main();
