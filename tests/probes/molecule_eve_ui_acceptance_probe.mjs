import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { createRichMoleculeFixture } from '../fixtures/molecule/canonical_v2_fixtures.mjs';
import {
    analyzePngSignal,
    assert,
    clickCanvasTarget,
    diffPng,
    exerciseMixerLassoBlock, exerciseTimelineEditingGestures,
    findBevyUiNodeTarget,
    playwrightPointForClientTarget,
    readBevyUiHit,
    recordCenter,
    runSetupStep,
    sceneRecords,
    visibleMenuTool,
    wait,
    waitFor,
    waitForStableScene
} from './molecule_ui_acceptance_support.mjs';

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
const OUT_DIR = path.resolve('temp/probe_reports/molecule_eve_ui_acceptance', REPORT_TAG);
const REPORT_FILE = path.join(OUT_DIR, 'report.json');

fs.mkdirSync(OUT_DIR, { recursive: true });

const clickMenuTarget = clickCanvasTarget;

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
    await window.AdoleAPI.projects.setCurrent(projectId, name, null, true);
    window.eveToolBase.ensureProjectLayer(projectId);
    const loaded = await window.eveToolBase.loadProjectAtomes(projectId, { staleFirst: false });
    workspaceMode.markProjectWorkspaceMode?.(projectId);
    return { ok: loaded?.ok !== false, id: projectId, name, loaded };
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
        const dashboard = window.eveDashboardBevyUiRuntime?.state || {};
        return {
            ok: current?.logged === true
                && window.AdoleAPI?.security?.isAnonymous?.() === false
                && !!document.getElementById('eve_surface_project'),
            logged: current?.logged === true,
            anonymous: window.AdoleAPI?.security?.isAnonymous?.() ?? null,
            dashboard_active: dashboard.active === true
        };
    });
};

const projectViewNode = (page, projectId, nodeId) => {
    const visualNodeId = nodeId.endsWith('_name')
        ? `${nodeId.slice(0, -'_name'.length)}_label_text`
        : nodeId.endsWith('_preview')
            ? `${nodeId.slice(0, -'_preview'.length)}_thumbnail`
            : nodeId;
    return recordCenter(
        page,
        projectId,
        (record) => record.id.includes(`eve_bevy_ui_project_view_${visualNodeId}`)
    );
};

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
    await window.Atome.commit({
        kind: 'set', atome_id: ownerId, project_id: pid,
        payload: { props: { molecule_timeline: timeline } }
    });
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
        page_errors: [],
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
    let trackEntryIndex = null;
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
            if (message.type() === 'error') report.console_errors.push(message.text());
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
            return {
                ok: menu?.active === true
                    && menu?.treeMounted === true
                    && Number(menu?.reservedHeight || 0) > 0
                    && records.some((record) => String(record.id || '').includes('main_menu_tool_view_background')),
                menu,
                record_count: records.length
            };
        }, project.id));
        report.measurements.viewport_geometry = await page.evaluate(() => {
            const canvas = document.getElementById('eve_surface_project');
            const view = document.getElementById('view');
            const styleFor = (element) => {
                const style = element ? getComputedStyle(element) : null;
                const rect = element?.getBoundingClientRect?.() || null;
                return {
                    rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
                    width: style?.width || null, height: style?.height || null,
                    minWidth: style?.minWidth || null, minHeight: style?.minHeight || null,
                    transform: style?.transform || null, zoom: style?.zoom || null
                };
            };
            return {
                inner: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
                visual: window.visualViewport ? {
                    width: window.visualViewport.width, height: window.visualViewport.height,
                    scale: window.visualViewport.scale
                } : null,
                html: styleFor(document.documentElement), body: styleFor(document.body),
                view: styleFor(view), canvas: styleFor(canvas),
                canvas_backing: { width: canvas?.width || 0, height: canvas?.height || 0 }
            };
        });

        await check('one shared canvas and a ready Bevy menu', async () => {
            const state = await readAcceptanceState(page, project.id, fixture.ownerId);
            assert(state.canvas_count === 1, `canvas_count:${state.canvas_count}`);
            assert(state.authoritative_dom_count === 0, `authoritative_dom_count:${state.authoritative_dom_count}`);
            assert(state.handedness === EXPECTED_HANDEDNESS, `handedness:${state.handedness}`);
            assert(state.menu?.active === true && state.menu?.treeMounted === true, `menu_not_ready:${JSON.stringify(state.menu)}`);
            assert(!state.overlay_error, `overlay_error:${state.overlay_error}`);
            return state;
        });

        await check('the fixed menu exposes the required tool order', async () => {
            const records = await sceneRecords(page, project.id);
            const expected = ['atome', 'home', 'find', 'capture', 'time', 'communicate', 'mode', 'view', 'create'];
            const projected = expected.map((key) => records.find((record) => record.id.includes(`main_menu_tool_${key}_background`))?.id || null);
            assert(projected.every(Boolean), `missing_menu_tools:${JSON.stringify(projected)}`);
            return { expected, projected };
        });

        await check('a real Creation click exposes only the functional v1 palette', async () => {
            const create = await visibleMenuTool(page, project.id, 'create');
            await clickMenuTarget(page, create);
            const measure = await waitFor(page, async () => {
                const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                const value = getMainMenuRuntime()?.measure?.() || null;
                return { ok: value?.activePaletteKey === 'create' && value?.paletteMotionActive === false, value };
            });
            const children = ['text_create', 'draw', 'code_create', 'page_create'];
            const targets = [];
            for (const child of children) targets.push((await visibleMenuTool(page, project.id, child)).id);
            assert(!targets.some((id) => id.includes('generator')), `unexpected_generator:${JSON.stringify(targets)}`);
            return { palette: measure.value?.activePaletteKey, children, targets };
        });

        await check('a real View then List click opens the Molecule list', async () => {
            const view = await visibleMenuTool(page, project.id, 'view');
            await clickMenuTarget(page, view);
            await waitFor(page, async () => {
                const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                const measure = getMainMenuRuntime()?.measure?.() || null;
                return {
                    ok: measure?.activePaletteKey === 'view' && measure?.paletteMotionActive === false,
                    measure
                };
            });
            const list = await visibleMenuTool(page, project.id, 'view_list');
            const hit = await readBevyUiHit(page, list);
            assert(String(hit.nodeId || '').endsWith('view__view_list'), `view_list_hit_mismatch:${JSON.stringify({ list, hit })}`);
            await clickMenuTarget(page, list);
            return waitFor(page, async ({ pid }) => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const state = readProjectViewSurfaceState();
                const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                return {
                    ok: state.mode === 'list' && records.some((record) => String(record.id || '').includes('project_view_list_entry_0')),
                    mode: state.mode,
                    record_count: state.content?.recordCount || 0
                };
            }, { pid: project.id });
        });
        await waitForStableScene(page, project.id);

        const listShot = path.join(OUT_DIR, 'list_collapsed.png');
        await page.screenshot({ path: listShot, animations: 'disabled' });
        report.screenshots.push(listShot);

        await check('real accordion clicks expose Section and Track rows', async () => {
            const moleculeChevron = await projectViewNode(page, project.id, 'project_view_list_entry_0_hierarchy_chevron');
            const moleculeHit = await readBevyUiHit(page, moleculeChevron);
            assert(String(moleculeHit.nodeId || '').includes('project_view_list_entry_0_hierarchy_chevron'),
                `molecule_chevron_hit_mismatch:${JSON.stringify({ moleculeChevron, moleculeHit })}`);
            await clickCanvasTarget(page, moleculeChevron);
            const expandedMolecule = await waitFor(page, async () => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const entries = readProjectViewSurfaceState().content?.entries || [];
                const sectionIndex = entries.findIndex((entry) => entry.visualRecord?.properties?.molecule_entity === 'section');
                return {
                    ok: sectionIndex >= 0,
                    sectionIndex,
                    entries: entries.map((entry, index) => ({
                        index, label: entry.label,
                        entity: entry.visualRecord?.properties?.molecule_entity || null
                    }))
                };
            });
            const sectionChevron = await projectViewNode(page, project.id, `project_view_list_entry_${expandedMolecule.sectionIndex}_hierarchy_chevron`);
            const sectionHit = await readBevyUiHit(page, sectionChevron);
            assert(String(sectionHit.nodeId || '').includes(`project_view_list_entry_${expandedMolecule.sectionIndex}_hierarchy_chevron`),
                `section_chevron_hit_mismatch:${JSON.stringify({ sectionChevron, sectionHit })}`);
            await clickCanvasTarget(page, sectionChevron);
            const expandedSection = await waitFor(page, async () => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const entries = readProjectViewSurfaceState().content?.entries || [];
                const index = entries.findIndex((entry) => entry.visualRecord?.properties?.molecule_entity === 'track');
                return {
                    ok: index >= 0,
                    trackIndex: index,
                    entries: entries.map((entry, entryIndex) => ({
                        index: entryIndex, label: entry.label,
                        entity: entry.visualRecord?.properties?.molecule_entity || null
                    }))
                };
            });
            trackEntryIndex = expandedSection.trackIndex;
            await waitFor(page, ({ pid, index }) => {
                const ids = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || [])
                    .map((record) => String(record.id || ''));
                return {
                    ok: ids.some((id) => id.includes(`project_view_list_entry_${index}_label_text`)),
                    project_view_record_count: ids.filter((id) => id.includes('project_view_list_entry_')).length,
                    sample: ids.filter((id) => id.includes('project_view_list_entry_')).slice(0, 80)
                };
            }, { pid: project.id, index: trackEntryIndex });
            await wait(500);
            return expandedSection;
        });

        await check('real selection and double click retain a canonical focus', async () => {
            assert(Number.isSafeInteger(trackEntryIndex), 'track_entry_index_missing');
            const nameVisual = await projectViewNode(page, project.id, `project_view_list_entry_${trackEntryIndex}_name`);
            const name = await findBevyUiNodeTarget(page, {
                nodeId: `project_view_list_entry_${trackEntryIndex}_name`,
                treeId: 'eve_bevy_ui_project_view', hint: nameVisual
            });
            assert(name, `track_name_not_actionable:${trackEntryIndex}`);
            const nameHit = {
                ...(await readBevyUiHit(page, name)),
                ...(await page.evaluate(() => {
                const dashboard = window.eveDashboardBevyUiRuntime?.state || {};
                return {
                    dashboard: {
                        active: dashboard.active === true,
                        suspended: dashboard.suspended === true,
                        opening: dashboard.opening === true,
                        closing: dashboard.closing === true,
                        sceneProjectId: dashboard.sceneProjectId || null
                    },
                    workspaceMode: window.__eveWorkspaceMode || null
                };
                }))
            };
            assert(String(nameHit.nodeId || '').endsWith(`project_view_list_entry_${trackEntryIndex}_name`),
                `track_name_hit_mismatch:${JSON.stringify({ name, nameHit })}`);
            await clickCanvasTarget(page, name);
            await waitFor(page, async (pid) => {
                const { readProjectViewSurfaceState } = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                const { readActiveMoleculeTarget } = await import('/eVe/domains/rendering/project_view_molecule_workspace_state.js');
                const target = readActiveMoleculeTarget(pid);
                return {
                    ok: !!readProjectViewSurfaceState().content?.primaryId && target?.entity_type === 'track',
                    primaryId: readProjectViewSurfaceState().content?.primaryId || null,
                    target
                };
            }, project.id);
            await wait(500);
            const previewVisual = await projectViewNode(page, project.id, `project_view_list_entry_${trackEntryIndex}_preview`);
            const preview = await findBevyUiNodeTarget(page, {
                nodeId: `project_view_list_entry_${trackEntryIndex}_preview`,
                treeId: 'eve_bevy_ui_project_view', hint: previewVisual
            });
            assert(preview, `track_preview_not_actionable:${trackEntryIndex}`);
            const previewHit = await readBevyUiHit(page, preview);
            assert(String(previewHit.nodeId || '').endsWith(`project_view_list_entry_${trackEntryIndex}_preview`),
                `track_preview_hit_mismatch:${JSON.stringify({ preview, previewHit })}`);
            await clickCanvasTarget(page, preview, { double: true });
            const focused = await waitFor(page, async ({ pid, owner }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                return {
                    ok: !!timeline?.view?.focus?.track_id,
                    focus: timeline?.view?.focus || null,
                    projectId: pid
                };
            }, { pid: project.id, owner: fixture.ownerId });
            await waitFor(page, async () => {
                const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
                const contextual = registry.getAtomeContextualEditApi()?.readState?.() || null;
                return { ok: contextual?.menuVisible === true, contextual };
            });
            return focused;
        });

        await check('the contextual rail does not cover visible Molecule row content', async () => {
            const readyRail = await waitFor(page, async () => {
                const registry = await import('/eVe/intuition/runtime/eve_intuition/atome_contextual_edit_registry.js');
                const rail = registry.getAtomeContextualEditApi()?.readState?.()?.railLayout || null;
                return { ok: !!rail, rail };
            });
            const geometry = await page.evaluate(({ pid, rail }) => {
                const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                const candidates = records.filter((record) => {
                    const id = String(record?.id || '');
                    return id.includes('eve_bevy_ui_project_view_project_view_list_entry_')
                        && (id.endsWith('_label_text') || id.endsWith('_thumbnail') || id.endsWith('_hierarchy_chevron'));
                }).map((record) => ({
                    id: String(record.id || ''),
                    left: Number(record.properties?.left || 0),
                    top: Number(record.properties?.top || 0),
                    width: Number(record.properties?.width || 0),
                    height: Number(record.properties?.height || 0)
                }));
                return { rail, candidates };
            }, { pid: project.id, rail: readyRail.rail });
            assert(geometry.rail, 'contextual_rail_layout_missing');
            const rail = geometry.rail;
            const overlaps = geometry.candidates.filter((box) => (
                box.left < rail.x + rail.itemSize
                && box.left + box.width > rail.x
                && box.top < rail.y + rail.railHeight
                && box.top + box.height > rail.y
            ));
            assert(overlaps.length === 0, `contextual_rail_overlap:${JSON.stringify({ rail, overlaps })}`);
            return { rail, checked_boxes: geometry.candidates.length };
        });

        await check('a real Info click opens the canonical track property panel', async () => {
            const info = await findBevyUiNodeTarget(page, {
                nodeId: 'atome_contextual_tool_molecule_info',
                treeId: 'eve_bevy_panel_atome_contextual_edit'
            });
            assert(info, 'molecule_info_not_actionable');
            const hit = await readBevyUiHit(page, info);
            assert(String(hit.nodeId || '').endsWith('atome_contextual_tool_molecule_info'),
                `molecule_info_hit_mismatch:${JSON.stringify({ info, hit })}`);
            await clickCanvasTarget(page, info);
            const opened = await waitFor(page, async (pid) => {
                const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                const ids = records.map((record) => String(record.id || ''));
                const infoRecords = ids.filter((id) => id.includes('eve_bevy_panel_info'));
                const { infoRuntime } = await import('/eVe/intuition/runtime/bevy_panel/bevy_panel_info_runtime.js');
                const properties = infoRuntime.surface.readState()?.primary?.properties || {};
                return {
                    ok: infoRecords.some((id) => id.includes('eve_bevy_panel_info_panel'))
                        && properties.track_type
                        && Object.hasOwn(properties, 'quantization')
                        && Object.hasOwn(properties, 'loop_enabled'),
                    properties,
                    info_record_count: infoRecords.length
                };
            }, project.id);
            await waitForStableScene(page, project.id);
            const close = await findBevyUiNodeTarget(page, {
                nodeId: 'eve_bevy_panel_info_footer_close',
                treeId: 'eve_bevy_panel_info'
            });
            assert(close, 'molecule_info_close_not_actionable');
            await clickCanvasTarget(page, close);
            await waitFor(page, (pid) => ({
                ok: !(window.eveToolBase?.getProjectSceneState?.(pid)?.records || [])
                    .some((record) => String(record.id || '').includes('eve_bevy_panel_info_panel'))
            }), project.id);
            return opened;
        });

        await waitForStableScene(page, project.id);
        const expandedA = path.join(OUT_DIR, 'list_expanded_a.png');
        const expandedB = path.join(OUT_DIR, 'list_expanded_b.png');
        await page.screenshot({ path: expandedA, animations: 'disabled' });
        await wait(350);
        await page.screenshot({ path: expandedB, animations: 'disabled' });
        report.screenshots.push(expandedA, expandedB);
        report.visual_diff = diffPng(expandedA, expandedB);
        report.measurements.expanded_capture_signal = analyzePngSignal(expandedA);
        await check('two successive deterministic captures meet strict visual thresholds', async () => {
            const diff = report.visual_diff;
            const signal = report.measurements.expanded_capture_signal;
            assert(signal.non_black_pixel_ratio >= 0.01, `capture_visually_empty:${JSON.stringify(signal)}`);
            assert(signal.luma_range >= 12, `capture_luma_range:${JSON.stringify(signal)}`);
            assert(signal.sampled_color_count >= 12, `capture_color_count:${JSON.stringify(signal)}`);
            assert(diff.same_size === true, 'capture_size_changed');
            assert(diff.max_channel_delta <= 2, `max_channel_delta:${diff.max_channel_delta}`);
            assert(diff.differing_pixel_ratio <= 0.003, `differing_pixel_ratio:${diff.differing_pixel_ratio}`);
            assert(diff.mean_absolute_channel_delta <= 0.01, `mean_absolute_channel_delta:${diff.mean_absolute_channel_delta}`);
            return { diff, signal };
        });
        await check('real Mixage and Mute clicks update the canonical grouped track', async () => {
            const activity = await visibleMenuTool(page, project.id, 'activity');
            await clickMenuTarget(page, activity);
            await wait(500);
            const mix = await visibleMenuTool(page, project.id, 'molecule_activity_mix');
            const mixHit = await readBevyUiHit(page, mix);
            assert(String(mixHit.nodeId || '').endsWith('activity__molecule_activity_mix'),
                `molecule_mix_hit_mismatch:${JSON.stringify({ mix, mixHit })}`);
            await clickMenuTarget(page, mix);
            const projected = await waitFor(page, (pid) => {
                const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                const ids = records.map((record) => String(record.id || ''));
                const routing = (window.atome?.tools?.gatewayRoutingLog || [])
                    .filter((entry) => entry.tool_id === 'ui.timeline.activity.mix').slice(-6);
                return { ok: ids.some((id) => id.includes('molecule_mix_mute_')), routing, ids };
            }, project.id);
            const mute = await findBevyUiNodeTarget(page, {
                nodePrefix: 'molecule_mix_mute_',
                treeId: 'eve_bevy_ui_project_view'
            });
            assert(mute, 'molecule_mix_mute_not_actionable');
            const trackId = mute.id.match(/molecule_mix_mute_(.+)$/)?.[1] || '';
            assert(trackId, `molecule_mix_track_id_missing:${mute.id}`);
            const muteHit = await readBevyUiHit(page, mute);
            assert(String(muteHit.nodeId || '').includes(`molecule_mix_mute_${trackId}`),
                `molecule_mix_mute_hit_mismatch:${JSON.stringify({ mute, muteHit, trackId })}`);
            const before = await readAcceptanceState(page, project.id, fixture.ownerId);
            const previous = before.timeline.tracks.find((track) => track.track_id === trackId)?.mute === true;
            await clickCanvasTarget(page, mute);
            const committed = await waitFor(page, async ({ owner, id, prior }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                const mute = timeline?.tracks?.find((track) => track.track_id === id)?.mute === true;
                return { ok: mute !== prior, mute, track_id: id };
            }, { owner: fixture.ownerId, id: trackId, prior: previous });
            const gainControl = await findBevyUiNodeTarget(page, { nodeId: `molecule_mix_gain_${trackId}`, treeId: 'eve_bevy_ui_project_view' });
            const panControl = await findBevyUiNodeTarget(page, { nodeId: `molecule_mix_pan_${trackId}`, treeId: 'eve_bevy_ui_project_view' });
            assert(gainControl && panControl, `molecule_mix_sliders_not_actionable:${JSON.stringify({ gainControl, panControl, trackId })}`); const gainBefore = Number(before.timeline.tracks.find((track) => track.track_id === trackId)?.gain ?? 1);
            const gainPoint = await playwrightPointForClientTarget(page, gainControl); await page.mouse.move(gainPoint.x, gainPoint.y); await page.mouse.down();
            await page.mouse.move(gainPoint.x, gainPoint.y - 48, { steps: 6 }); await page.mouse.up();
            const gainCommitted = await waitFor(page, async ({ owner, id, prior }) => {
                const state = await window.Atome.getStateCurrent(owner); const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                const gain = Number(timeline?.tracks?.find((track) => track.track_id === id)?.gain ?? 1); return { ok: gain !== prior, gain, track_id: id };
            }, { owner: fixture.ownerId, id: trackId, prior: gainBefore });
            const lassoBlock = await exerciseMixerLassoBlock(page); const mixShot = path.join(OUT_DIR, 'mix_controls.png'); await page.screenshot({ path: mixShot, animations: 'disabled' }); report.screenshots.push(mixShot);
            return { projected_records: projected.ids.length, committed, gainCommitted, pan_control: panControl.id, lassoBlock };
        });

        await check('real Activity and Timeline clicks project sections, lanes, clips, crop and loop handles', async () => {
            const activePaletteKey = await page.evaluate(async () => {
                const module = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                return String(module.getMainMenuRuntime()?.measure?.()?.activePaletteKey || '');
            });
            if (activePaletteKey !== 'activity') {
                const activity = await visibleMenuTool(page, project.id, 'activity');
                await clickMenuTarget(page, activity);
                await wait(650);
            }
            const timelineActivity = await visibleMenuTool(page, project.id, 'molecule_activity_timeline');
            await clickMenuTarget(page, timelineActivity);
            return waitFor(page, async (pid) => {
                const ids = (window.eveToolBase?.getProjectSceneState?.(pid)?.records || []).map((record) => String(record.id || ''));
                const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                const projectView = await import('/eVe/domains/rendering/project_view_surface_runtime.js');
                return {
                    ok: ids.some((id) => id === 'mol:playhead')
                        && ids.some((id) => id.startsWith('mol:lane:'))
                        && ids.some((id) => id.startsWith('mol:clip:'))
                        && ids.some((id) => id.startsWith('mol:crop:'))
                        && ids.some((id) => id.startsWith('mol:clip-loop-handle:')),
                    molecule_records: ids.filter((id) => id.startsWith('mol:')).length,
                    molecule_record_ids: ids.filter((id) => id.startsWith('mol:')),
                    active_palette: registry.getMainMenuRuntime()?.measure?.()?.activePaletteKey || '',
                    project_view_mode: projectView.readProjectViewSurfaceState()?.mode || '',
                    project_view_content: projectView.readProjectViewSurfaceState()?.content || null,
                    activity_routing: (window.atome?.tools?.gatewayRoutingLog || [])
                        .filter((entry) => String(entry?.tool_id || '').includes('timeline.activity')).slice(-8)
                };
            }, project.id);
        });
        await waitForStableScene(page, project.id);

        await check('a real clip drag commits through the canonical timeline interceptor', async () => {
            const clip = await recordCenter(
                page,
                project.id,
                (record) => record.id === `mol:clip:${fixture.clipId}`,
                { sceneCoordinates: true }
            );
            const before = await readAcceptanceState(page, project.id, fixture.ownerId);
            const previousStart = before.timeline.clips.find((entry) => entry.clip_id === fixture.clipId).timeline.start_frame;
            const hit = await page.evaluate(async ({ point, clipId }) => {
                const surface = document.getElementById('eve_surface_project');
                const overlay = window.eveBevyUiRuntime?.hitTestAtClientPoint?.({
                    surface, clientX: point.x, clientY: point.y
                });
                const { getRenderSurfaceState, readRenderSurfaceSize } = await import('/eVe/domains/rendering/surface_runtime.js');
                const { hitTestRenderScene } = await import('/eVe/domains/rendering/scene_graph.js');
                const rect = surface.getBoundingClientRect();
                const size = readRenderSurfaceSize(surface);
                const scenePoint = {
                    x: (point.x - rect.left) * (size.width / Math.max(1, rect.width)),
                    y: (point.y - rect.top) * (size.height / Math.max(1, rect.height))
                };
                const state = getRenderSurfaceState(surface);
                const project = hitTestRenderScene(state?.scene, scenePoint);
                return {
                    expected: `mol:clip:${clipId}`,
                    targetPoint: point,
                    overlay: { nodeId: overlay?.nodeId || null, treeId: overlay?.treeId || null },
                    project: { id: project?.id || null, type: project?.type || null },
                    scenePoint
                };
            }, { point: clip, clipId: fixture.clipId });
            assert(hit.project.id === hit.expected, `clip_hit_mismatch:${JSON.stringify(hit)}`);
            assert(!hit.overlay.nodeId, `clip_obscured_by_ui:${JSON.stringify(hit)}`);
            const pointer = await playwrightPointForClientTarget(page, clip);
            await page.mouse.move(pointer.x, pointer.y);
            await page.mouse.down();
            const pointerTwelve = await playwrightPointForClientTarget(page, {
                x: clip.x + 12, y: clip.y, coordinate_source: clip.coordinate_source
            });
            const pointerNinetySix = await playwrightPointForClientTarget(page, {
                x: clip.x + 96, y: clip.y, coordinate_source: clip.coordinate_source
            });
            await page.mouse.move(pointerTwelve.x, pointerTwelve.y);
            await page.mouse.move(pointerNinetySix.x, pointerNinetySix.y, { steps: 11 });
            const during = await page.evaluate(async () => {
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const state = getRenderSurfaceState(document.getElementById('eve_surface_project')) || {};
                return { pointerSession: state.pointerSession || null, lastIntentError: state.last_intent_error || null };
            });
            await page.mouse.up();
            await wait(1200);
            const after = await page.evaluate(async ({ owner, clipId, previous }) => {
                const state = await window.Atome.getStateCurrent(owner);
                const timeline = state?.molecule_timeline || state?.props?.molecule_timeline || state?.properties?.molecule_timeline;
                const current = timeline?.clips?.find((entry) => entry.clip_id === clipId)?.timeline?.start_frame;
                const { getRenderSurfaceState } = await import('/eVe/domains/rendering/surface_runtime.js');
                const surfaceState = getRenderSurfaceState(document.getElementById('eve_surface_project')) || {};
                return {
                    ok: Number.isSafeInteger(current) && current !== previous,
                    previous, current,
                    lastIntentError: surfaceState.last_intent_error || null,
                    lastPointerCancelReason: surfaceState.last_pointer_cancel_reason || null
                };
            }, { owner: fixture.ownerId, clipId: fixture.clipId, previous: previousStart });
            assert(after.ok, `clip_drag_not_committed:${JSON.stringify({ hit, during, after })}`);
            return { hit, during, after };
        });
        await check('real lasso, crop, trackpad zoom and split gestures preserve timeline semantics', () => exerciseTimelineEditingGestures({ page, projectId: project.id, ownerId: fixture.ownerId, clipId: fixture.clipId }));
        const timelineShot = path.join(OUT_DIR, 'timeline_after_drag.png');
        await page.screenshot({ path: timelineShot, animations: 'disabled' });
        report.screenshots.push(timelineShot);
        if (ENDURANCE_MS > 0) {
            await check('the real Molecule UI remains stable through the configured playback and Record endurance', async () => {
                const openActivity = async () => {
                    const activePalette = await page.evaluate(async () => {
                        const registry = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
                        return String(registry.getMainMenuRuntime()?.measure?.()?.activePaletteKey || '');
                    });
                    if (activePalette === 'activity') return;
                    const activity = await findBevyUiNodeTarget(page, {
                        nodeId: 'atome_contextual_tool_activity',
                        treeId: 'eve_bevy_panel_atome_contextual_edit'
                    });
                    assert(activity, 'molecule_activity_not_actionable');
                    await clickCanvasTarget(page, activity);
                    await wait(500);
                };
                const selectMolecule = async () => {
                    await openActivity();
                    const list = await visibleMenuTool(page, project.id, 'molecule_activity_list');
                    await clickMenuTarget(page, list);
                    await waitFor(page, async (pid) => {
                        const records = window.eveToolBase?.getProjectSceneState?.(pid)?.records || [];
                        return {
                            ok: records.some((record) => String(record.id || '').includes('project_view_list_entry_0')),
                            records: records.length
                        };
                    }, project.id);
                    const moleculeName = await projectViewNode(page, project.id, 'project_view_list_entry_0_name');
                    await clickCanvasTarget(page, moleculeName);
                    await wait(350);
                };
                const togglePlayback = async () => {
                    const play = await findBevyUiNodeTarget(page, {
                        nodeId: 'atome_contextual_tool_molecule_play',
                        treeId: 'eve_bevy_panel_atome_contextual_edit'
                    });
                    assert(play, 'molecule_play_not_actionable');
                    await clickCanvasTarget(page, play);
                };
                const readRuntimeSample = () => page.evaluate(async ({ pid, owner }) => {
                    const ownerState = await window.Atome.getStateCurrent(owner);
                    const timeline = ownerState?.molecule_timeline
                        || ownerState?.props?.molecule_timeline
                        || ownerState?.properties?.molecule_timeline;
                    const overlay = window.eveBevyUiRuntime?.readOverlayDiagnostics?.() || {};
                    return {
                        at: Date.now(),
                        heap_bytes: Number(performance.memory?.usedJSHeapSize || 0),
                        canvas_count: document.querySelectorAll('canvas#eve_surface_project').length,
                        authoritative_dom_count: document.querySelectorAll('[id^="eve-atome_"]').length,
                        scene_record_count: window.eveToolBase?.getProjectSceneState?.(pid)?.records?.length || 0,
                        mounted_tree_count: overlay.trees?.length || 0,
                        overlay_error: overlay.lastOverlayError || null,
                        clip_count: timeline?.clips?.length || 0,
                        armed_record_regions: timeline?.record_regions?.filter((region) => region.armed === true).length || 0,
                        armed_record_sources: timeline?.record_regions?.filter((region) => region.armed === true).map((region) => region.source_kind) || [],
                        playhead_frame: timeline?.transport?.playhead_frame || 0
                    };
                }, { pid: project.id, owner: fixture.ownerId });

                await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage');
                await selectMolecule();
                const beforeRecord = await readRuntimeSample();
                await togglePlayback();
                await wait(13000);
                await togglePlayback();
                await wait(700);
                const afterRecord = await readRuntimeSample();
                assert(
                    afterRecord.armed_record_regions < beforeRecord.armed_record_regions
                        || afterRecord.clip_count > beforeRecord.clip_count,
                    `armed_record_not_consumed:${JSON.stringify({ beforeRecord, afterRecord })}`
                );
                assert(!beforeRecord.armed_record_sources.includes('video') || !afterRecord.armed_record_sources.includes('video'), `armed_video_record_not_consumed:${JSON.stringify({ beforeRecord, afterRecord })}`);

                await cdp.send('HeapProfiler.collectGarbage'); const baseline = await readRuntimeSample();
                const startedAt = Date.now();
                const deadline = startedAt + ENDURANCE_MS;
                const samples = [baseline];
                const activities = ['molecule_activity_list', 'molecule_activity_mix', 'molecule_activity_timeline'];
                let cycles = 0;
                while (Date.now() < deadline || cycles < ENDURANCE_MIN_CYCLES) {
                    await togglePlayback();
                    await wait(1800);
                    await togglePlayback();
                    await openActivity();
                    const child = await visibleMenuTool(page, project.id, activities[cycles % activities.length]);
                    await clickMenuTarget(page, child);
                    await wait(350);
                    cycles += 1;
                    if (cycles % 10 === 0 || Date.now() >= deadline) {
                        const sample = await readRuntimeSample();
                        assert(sample.canvas_count === 1, `endurance_canvas_count:${sample.canvas_count}`);
                        assert(sample.authoritative_dom_count === 0, `endurance_authoritative_dom:${sample.authoritative_dom_count}`);
                        assert(!sample.overlay_error, `endurance_overlay_error:${sample.overlay_error}`);
                        samples.push(sample);
                    }
                    const remaining = deadline - Date.now();
                    if (remaining > 0) await wait(Math.min(5000, remaining));
                }
                await cdp.send('HeapProfiler.collectGarbage');
                const final = await readRuntimeSample();
                const growthRatio = baseline.heap_bytes > 0
                    ? Math.max(0, (final.heap_bytes - baseline.heap_bytes) / baseline.heap_bytes)
                    : 0;
                assert(growthRatio <= 0.05, `endurance_heap_growth:${growthRatio}`);
                assert(report.console_errors.length === 0, report.console_errors.slice(0, 3).join(' | '));
                assert(report.page_errors.length === 0, report.page_errors.slice(0, 3).join(' | '));
                report.endurance = {
                    requested_ms: ENDURANCE_MS,
                    elapsed_ms: Date.now() - startedAt,
                    minimum_cycles: ENDURANCE_MIN_CYCLES,
                    completed_cycles: cycles,
                    record: { before: beforeRecord, after: afterRecord },
                    memory: { baseline_bytes: baseline.heap_bytes, final_bytes: final.heap_bytes, growth_ratio: growthRatio },
                    samples
                };
                return report.endurance;
            });
        }

        await check('canonical v2 invariants and clean diagnostics remain true', async () => {
            const state = await readAcceptanceState(page, project.id, fixture.ownerId);
            assert(state.timeline?.schema_version === 2, `schema_version:${state.timeline?.schema_version}`);
            assert(!JSON.stringify(state.timeline).includes('schema_version":1'), 'v1_payload_present');
            assert(state.canvas_count === 1, `canvas_count:${state.canvas_count}`);
            assert(state.authoritative_dom_count === 0, `authoritative_dom_count:${state.authoritative_dom_count}`);
            assert(!state.overlay_error, `overlay_error:${state.overlay_error}`);
            const finalEmptyBySection = state.timeline.sections.map((section) => (
                state.timeline.tracks.filter((track) => track.section_id === section.section_id && track.empty_slot).length
            ));
            assert(finalEmptyBySection.every((count) => count === 1), `empty_track_invariant:${finalEmptyBySection.join(',')}`);
            return { finalEmptyBySection, mounted_trees: state.mounted_trees };
        });

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
