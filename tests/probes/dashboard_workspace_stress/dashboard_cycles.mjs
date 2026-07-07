import {
    clickMainHandle,
    dashboardResidue,
    dashboardSnapshot,
    screenshot,
    waitFor,
    waitFrames,
    writeReport
} from './support.mjs';

const DASHBOARD_TOGGLE_CYCLES = 10;

export const attachPageDiagnostics = (page, report) => {
    page.on('console', (message) => { if (message.type() === 'error') report.console.push(message.text()); });
    page.on('pageerror', (error) => {
        const message = error?.message || String(error);
        if (!/^unreachable$/i.test(message)) report.pageErrors.push(message);
    });
    page.on('requestfailed', (request) => {
        const url = request.url();
        const failure = request.failure()?.errorText || '';
        if (/favicon|apple-touch-icon/i.test(url)) return;
        if (failure === 'net::ERR_ABORTED' && (/^blob:/i.test(url) || /\/api\/uploads\/recorded_\d+\.webm/i.test(url))) {
            report.ignoredRequestFailures.push({ url, failure, reason: 'media_source_replaced_or_context_closed' });
            return;
        }
        report.requestFailures.push({ url, failure });
    });
};

const readNeutralDashboardState = (page) => page.evaluate(() => {
    const scene = window.eveToolBase?.getProjectSceneState?.('__eve_dashboard_workspace__') || null;
    const records = Array.isArray(scene?.records) ? scene.records : [];
    const visible = records
        .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'))
        .filter((record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0);
    return {
        visibleCount: visible.length,
        headerCount: visible.filter((record) => /^__eve_dashboard_header_(?!bg|icon|side)/.test(String(record?.id || ''))).length,
        recordCount: records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_')).length
    };
});

export const assertStartupDashboardOnly = async (page, report) => {
    await waitFrames(page, 60);
    const afterOneSecond = await dashboardSnapshot(page);
    await waitFrames(page, 60);
    const afterTwoSeconds = await dashboardSnapshot(page);
    const validate = (snapshot, label) => {
        if (snapshot.projectId) throw new Error(`startup_project_must_not_exist:${label}:${snapshot.projectId}`);
        if (snapshot.currentProjectHostIds.length) throw new Error(`startup_project_hosts_present:${label}:${snapshot.currentProjectHostIds.join(',')}`);
        if (snapshot.canvasCount !== 1) throw new Error(`startup_canvas_count_invalid:${label}:${snapshot.canvasCount}`);
        if (snapshot.runtimeProjectId !== '__eve_dashboard_workspace__') throw new Error(`startup_dashboard_runtime_project_invalid:${label}:${snapshot.runtimeProjectId}`);
        if (!snapshot.active || !snapshot.visibleDashboardIds.length) throw new Error(`startup_dashboard_not_visible:${label}:${JSON.stringify(snapshot)}`);
    };
    validate(afterOneSecond, 'after_1s');
    validate(afterTwoSeconds, 'after_2s');
    report.checks.push({ name: 'startup_dashboard_only_no_project', ok: true, afterOneSecond, afterTwoSeconds });
    writeReport(report);
};

const assertClosedNeutralDesktopEmpty = async (page, cycle) => {
    const closed = await dashboardSnapshot(page);
    if (closed.projectId) throw new Error(`neutral_close_current_project_present:${cycle}:${closed.projectId}`);
    if (closed.currentProjectHostIds.length) throw new Error(`neutral_close_project_hosts_present:${cycle}:${closed.currentProjectHostIds.join(',')}`);
    if (closed.visibleDashboardIds.length) throw new Error(`neutral_close_dashboard_visible:${cycle}:${closed.visibleDashboardIds.join(',')}`);
    const neutralRecords = await readNeutralDashboardState(page);
    if (neutralRecords.recordCount > 0) throw new Error(`neutral_close_dashboard_records_present:${cycle}:${JSON.stringify(neutralRecords)}`);
};

export const waitForDashboardFadeStart = async (page, label, direction = 'open') => {
    const before = await page.evaluate(() => performance.now());
    const started = await waitFor(page, (mode) => {
        const state = window.eveDashboardBevyUiRuntime?.state || {};
        const opacity = Number(state.fadeOpacity ?? 1);
        const closing = state.closing === true || state.active !== true;
        return {
            ok: mode === 'close'
                ? (opacity < 1 && closing) || state.active !== true
                : opacity > 0 && (state.opening === true || state.active === true),
            opacity,
            active: state.active === true,
            opening: state.opening === true,
            closing: state.closing === true
        };
    }, 100, 10, direction);
    const after = await page.evaluate(() => performance.now());
    if (!started.ok) throw new Error(`dashboard_fade_not_started_within_100ms:${label}:${JSON.stringify(started.last)}`);
    return { ms: after - before, state: started.last };
};

export const waitForDashboardFadeSettled = async (page, label, active) => {
    const settled = await waitFor(page, (expectedActive) => {
        const state = window.eveDashboardBevyUiRuntime?.state || {};
        const opacity = Number(state.fadeOpacity ?? 1);
        return {
            ok: state.active === expectedActive
                && state.opening !== true
                && state.closing !== true
                && !state.fadeAnimationFrame
                && Math.abs(opacity - 1) < 0.001,
            opacity,
            active: state.active === true,
            opening: state.opening === true,
            closing: state.closing === true,
            frame: Number(state.fadeAnimationFrame || 0)
        };
    }, 6000, 16, active === true);
    if (!settled.ok) throw new Error(`dashboard_fade_not_settled:${label}:${JSON.stringify(settled.last)}`);
    return settled.last;
};

export const exerciseStartupDashboardOpenClose = async (page, report) => {
    const measurements = [];
    for (let index = 0; index < DASHBOARD_TOGGLE_CYCLES; index += 1) {
        await clickMainHandle(page);
        const closeFade = await waitForDashboardFadeStart(page, `startup_close_${index + 1}`, 'close');
        const closed = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active !== true }), 15000, 50);
        if (!closed.ok) throw new Error(`startup_dashboard_close_failed:${index + 1}:${JSON.stringify(closed.last)}`);
        await waitForDashboardFadeSettled(page, `startup_close_${index + 1}`, false);
        await waitFrames(page, 4);
        await assertClosedNeutralDesktopEmpty(page, index + 1);
        await page.waitForTimeout(650);

        await clickMainHandle(page);
        const openFade = await waitForDashboardFadeStart(page, `startup_open_${index + 1}`);
        const opened = await waitFor(page, () => {
            const state = window.eveDashboardBevyUiRuntime?.state || {};
            const scene = window.eveToolBase?.getProjectSceneState?.('__eve_dashboard_workspace__') || null;
            const records = Array.isArray(scene?.records) ? scene.records : [];
            const visibleRecords = records
                .filter((record) => String(record?.id || '').startsWith('__eve_dashboard_'))
                .filter((record) => record?.properties?.visible !== false && Number(record?.properties?.opacity ?? 1) > 0);
            return {
                ok: state.active === true
                    && String(state.projectId || '') === '__eve_dashboard_workspace__'
                    && visibleRecords.length > 0
                    && Number(state.fadeOpacity ?? 0) >= 0.99,
                opacity: Number(state.fadeOpacity ?? 0),
                runtimeProjectId: state.projectId || ''
            };
        }, 15000, 50);
        if (!opened.ok) throw new Error(`startup_dashboard_open_failed:${index + 1}:${JSON.stringify(opened.last)}`);
        await waitForDashboardFadeSettled(page, `startup_open_${index + 1}`, true);
        measurements.push({ cycle: index + 1, closeFadeMs: Math.round(closeFade.ms * 10) / 10, openFadeMs: Math.round(openFade.ms * 10) / 10 });
    }
    report.checks.push({ name: 'startup_dashboard_main_handle_cycles_clean', ok: true, cycles: DASHBOARD_TOGGLE_CYCLES, measurements });
    writeReport(report);
};

export const exerciseDashboardOpenClose = async (page, report) => {
    const initial = await dashboardSnapshot(page);
    if (initial.active) {
        await clickMainHandle(page);
        const initialClosed = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active !== true }), 15000, 50);
        if (!initialClosed.ok) throw new Error(`dashboard_initial_close_failed:${JSON.stringify(initialClosed.last)}`);
        await waitFrames(page, 4);
    }
    const measurements = [];
    for (let index = 0; index < DASHBOARD_TOGGLE_CYCLES; index += 1) {
        const beforeOpen = await page.evaluate(() => performance.now());
        await clickMainHandle(page);
        const openFade = await waitForDashboardFadeStart(page, `project_open_${index + 1}`);
        const opened = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active === true }), 15000, 50);
        if (!opened.ok) throw new Error(`dashboard_open_cycle_failed:${index + 1}:${JSON.stringify(opened.last)}`);
        await waitForDashboardFadeSettled(page, `project_open_${index + 1}`, true);
        const openDone = await page.evaluate(() => performance.now());
        const layout = (await dashboardSnapshot(page)).layout;
        await clickMainHandle(page);
        const closeFade = await waitForDashboardFadeStart(page, `project_close_${index + 1}`, 'close');
        const closedWait = await waitFor(page, () => ({ ok: window.eveDashboardBevyUiRuntime?.state?.active !== true }), 15000, 50);
        if (!closedWait.ok) throw new Error(`dashboard_close_cycle_failed:${index + 1}:${JSON.stringify(closedWait.last)}`);
        await waitForDashboardFadeSettled(page, `project_close_${index + 1}`, false);
        await waitFrames(page, 8);
        const closeDone = await page.evaluate(() => performance.now());
        const file = await screenshot(page, `after_close_${index + 1}`);
        const residue = dashboardResidue(file, layout);
        const closed = await dashboardSnapshot(page);
        if (closed.visibleDashboardIds.length) throw new Error(`dashboard_records_visible_after_close:${closed.visibleDashboardIds.join(',')}`);
        const neutralDashboardRecords = await page.evaluate(() => {
            const scene = window.eveToolBase?.getProjectSceneState?.('__eve_dashboard_workspace__') || null;
            const records = Array.isArray(scene?.records) ? scene.records : [];
            return records.filter((record) => String(record?.id || '').startsWith('__eve_dashboard_')).length;
        });
        if (neutralDashboardRecords > 0) throw new Error(`dashboard_neutral_records_after_close:${neutralDashboardRecords}`);
        measurements.push({ openMs: openDone - beforeOpen, closeMs: closeDone - openDone, openFadeMs: openFade.ms, closeFadeMs: closeFade.ms, residue, file });
    }
    report.checks.push({ name: 'dashboard_open_close_cycles_clean', ok: true, measurements });
};
