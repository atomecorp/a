import { runMoleculeListAcceptance } from "./molecule_ui_list_acceptance.mjs";
import { runMoleculeTimelineAcceptance } from "./molecule_ui_timeline_acceptance.mjs";
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from "playwright";

import { APP_URL, ensureProject, enterProvisionedWorkspace, importPlaybackFixtureMedia, installCanonicalFixture } from "./molecule_ui_workspace_support.mjs";
import { runMoleculeDropAcceptance } from "./molecule_ui_drop_acceptance_scenarios.mjs";
import { assert, clickCanvasTarget, findBevyUiNodeTarget, runSetupStep, wait, waitFor } from "./molecule_ui_acceptance_support.mjs";

const HEADLESS = process.env.ATOME_PLAYWRIGHT_HEADLESS === '1';
const VIEWPORT = Object.freeze({
    width: Math.max(320, Number.parseInt(process.env.MOLECULE_UI_WIDTH || '1440', 10) || 1440),
    height: Math.max(320, Number.parseInt(process.env.MOLECULE_UI_HEIGHT || '980', 10) || 980)
});
const DEVICE_SCALE_FACTOR = [1, 2, 3].includes(Number(process.env.MOLECULE_UI_DPR))
    ? Number(process.env.MOLECULE_UI_DPR) : 1;
const MOBILE_EMULATION = DEVICE_SCALE_FACTOR === 3;
const EXPECTED_HANDEDNESS = process.env.MOLECULE_UI_HANDEDNESS === 'left' ? 'left' : 'right';
const REQUESTED_MASTERY = process.env.MOLECULE_UI_MASTERY_LEVEL || '';
if (REQUESTED_MASTERY && !['beginner', 'intermediate', 'advanced'].includes(REQUESTED_MASTERY)) throw new Error('invalid_probe_mastery_level');
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


const projectViewNode = (page, _projectId, nodeId) => findBevyUiNodeTarget(page, {
    nodeId,
    treeId: 'eve_bevy_ui_project_view',
    step: 2
});

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
    try {
        const launchArgs = [
            '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-gpu-sandbox',
            '--enable-precise-memory-info', '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required',
            ...(HEADLESS ? ['--use-angle=swiftshader', '--enable-features=Vulkan'] : []),
            ...(DEVICE_SCALE_FACTOR > 1 && !HEADLESS ? ['--force-device-scale-factor=1'] : [])
        ];
        const contextOptions = { viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR, isMobile: MOBILE_EMULATION, hasTouch: MOBILE_EMULATION };
        // PROBE_PROFILE_DIR: a persistent profile already signed in (its device key
        // survives), for a dev server whose SMS links are not mocked.
        const profileDir = String(process.env.PROBE_PROFILE_DIR || '').trim();
        const context = profileDir
            ? await chromium.launchPersistentContext(path.resolve(profileDir), { headless: HEADLESS, args: launchArgs, ...contextOptions })
            : await (browser = await chromium.launch({ headless: HEADLESS, args: launchArgs })).newContext(contextOptions);
        if (profileDir) browser = context;
        // Another Fastify than the dev server (an isolated instance with mocked
        // SMS links): the app is pointed at it alone, never at :3000 / :3001.
        const appPort = Number(new URL(APP_URL).port);
        if (appPort && appPort !== 3001) {
            await context.route('**/server_config.json', (route) => route.fulfill({ contentType: 'application/json',
                body: JSON.stringify({ fastify: { host: '127.0.0.1', port: appPort, serverInfoPath: '/api/server-info', syncWsPath: '/ws/sync', apiWsPath: '/ws/api' } }) }));
            await context.addInitScript(() => { window.__SQUIRREL_FORCE_FASTIFY__ = true; });
        }
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

        await runSetupStep('provisioned_workspace', () => enterProvisionedWorkspace(page), 240000);
        await runSetupStep('profile_handedness', () => page.evaluate(async ({ handedness, masteryLevel }) => {
            const home = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_home_actions.js');
            let loaded = await home.loadHomeProfile();
            if (loaded?.ok !== true && loaded?.error === 'State not found') {
                const current = await window.AdoleAPI?.auth?.current?.();
                const userId = String(current?.user?.id || current?.user_id || current?.id || '');
                if (!userId) throw new Error('profile_user_id_missing');
                const created = await home.persistHomeProfile({
                    userId,
                    profile: { preferences: { visual: { handedness } } },
                    guest: false
                });
                if (created?.ok !== true) throw new Error(`profile_create_failed:${created?.error || 'unknown'}`);
                loaded = await home.loadHomeProfile();
            }
            if (loaded?.ok !== true) throw new Error(`profile_load_failed:${loaded?.error || 'unknown'}`);
            const profile = loaded.profile;
            profile.preferences.visual.handedness = handedness;
            if (masteryLevel) profile.preferences.visual.masteryLevel = masteryLevel;
            const persisted = await home.persistHomeProfile({ profile, userId: loaded.userId, guest: false });
            if (persisted?.ok !== true) throw new Error(`profile_persist_failed:${persisted?.error || 'unknown'}`);
        }, { handedness: EXPECTED_HANDEDNESS, masteryLevel: REQUESTED_MASTERY }));
        await runSetupStep('profile_projection', () => waitFor(page, async ({ handedness, masteryLevel }) => {
            const state = await import('/eVe/intuition/core/state.js');
            const menu = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
            const context = await import('/eVe/intuition/menu/context_menu_resolver.js');
            const level = context.resolveContextMenuContext({}).level;
            return {
                ok: state.readState().handedness === handedness
                    && menu.getMainMenuRuntime()?.handedness === handedness
                    && (!masteryLevel || level === masteryLevel),
                state: state.readState().handedness,
                level,
                menu: menu.getMainMenuRuntime()?.handedness || null
            };
        }, { handedness: EXPECTED_HANDEDNESS, masteryLevel: REQUESTED_MASTERY }));
        await page.evaluate(() => window.__DEBUG__?.setDeterministicTestMode?.(true));
        const project = await runSetupStep('project', () => ensureProject(page, `Molecule UI ${REPORT_TAG}`), 90000);
        assert(project?.ok === true, `project_setup_failed:${JSON.stringify(project)}`);
        report.project = project;
        const mediaAtomeIds = ENDURANCE_MS > 0
            ? await runSetupStep('playback_media', () => importPlaybackFixtureMedia(page, project.id), 180000) : {};
        const fixture = await runSetupStep('canonical_fixture', () => installCanonicalFixture(page, project.id, mediaAtomeIds), 90000);
        report.fixture = fixture;

        await wait(1200);
        await runSetupStep('workspace_projection', () => page.evaluate(async (pid) => {
            const workspaceMode = await import('/eVe/domains/dashboard/dashboard_workspace_mode.js');
            workspaceMode.markProjectWorkspaceMode?.(pid);
        }, project.id));
        await runSetupStep('workspace_ready', () => waitFor(page, (pid) => {
            const trees = window.eveBevyUiRuntime?.readOverlayDiagnostics?.()?.trees || [];
            return {
                ok: !trees.some((tree) => tree.id === 'dashboard_bevy_ui')
                    && window.__eveWorkspaceMode?.mode === 'project'
                    && window.__eveWorkspaceMode?.projectId === pid,
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
        if (process.env.MOLECULE_UI_LIST_ONLY !== '1') await runMoleculeTimelineAcceptance(suite);
        if (process.env.MOLECULE_UI_CORE_ONLY !== '1' && process.env.MOLECULE_UI_LIST_ONLY !== '1') {
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
