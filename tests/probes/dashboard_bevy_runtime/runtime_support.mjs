export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (page, predicate, timeoutMs = 30000, intervalMs = 250, arg = null) => {
    const startedAt = Date.now();
    let last = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            last = await page.evaluate(predicate, arg);
            if (last === true || last?.ok === true) return { ok: true, last };
        } catch (error) {
            last = { ok: false, error: error?.message || String(error) };
        }
        await sleep(intervalMs);
    }
    return { ok: false, last };
};

export const waitForRuntimeReady = async (page) => waitFor(page, () => ({
    ok: !!window.__DEBUG__ || !!document.getElementById('intuition'),
    hasDebug: !!window.__DEBUG__,
    hasIntuition: !!document.getElementById('intuition')
}), 45000);

const waitForLoginSequenceInactive = async (page) => waitFor(page, () => {
    const sequence = document.getElementById('eve_login_sequence');
    if (!sequence) return { ok: true, state: 'missing' };
    const style = getComputedStyle(sequence);
    const rect = sequence.getBoundingClientRect();
    const hidden = style.display === 'none'
        || style.visibility === 'hidden'
        || style.pointerEvents === 'none'
        || rect.width <= 0
        || rect.height <= 0;
    return {
        ok: hidden,
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        opacity: style.opacity,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
}, 45000, 250);

const waitForGuestProject = async (page) => waitFor(page, async () => {
    const api = window.AdoleAPI || null;
    let current = null;
    try {
        current = api?.auth?.current ? await api.auth.current() : null;
    } catch (error) {
        current = { error: error?.message || String(error) };
    }
    const projectId = window.__currentProject?.id || null;
    const canvas = document.getElementById('eve_surface_project');
    const dashboardActive = window.eveDashboardBevyUiRuntime?.state?.active === true;
    const sequence = document.getElementById('eve_login_sequence');
    const sequenceHidden = !sequence || getComputedStyle(sequence).display === 'none';
    const isAnonymous = api?.security?.isAnonymous ? api.security.isAnonymous() : null;
    return {
        ok: current?.logged === true && isAnonymous === true && !!canvas && (!!projectId || dashboardActive),
        current,
        isAnonymous,
        projectId,
        dashboardActive,
        hasCanvas: !!canvas,
        sequenceHidden
    };
}, 60000, 300);

export const enterGuestWorkspace = async (page) => {
    await waitForRuntimeReady(page);
    const choice = page.locator('#eve_login_sequence__choice_without_account').first();
    await choice.waitFor({ state: 'visible', timeout: 30000 });
    await choice.click({ timeout: 10000 });
    const ready = await waitForGuestProject(page);
    if (!ready.ok) throw new Error('dashboard_probe_guest_project_missing');
    const loginInactive = await waitForLoginSequenceInactive(page);
    if (!loginInactive.ok) throw new Error(`dashboard_probe_login_sequence_still_interactive:${JSON.stringify(loginInactive.last)}`);
    return ready.last;
};

const BEVY_MAIN_MENU_ATOME_RECORD_ID = '__eve_bevy_ui_eve_bevy_ui_main_menu_eve_bevy_ui_main_menu_tool_atome';

export const clickAtomeMenuItem = async (page) => {
    await waitForRuntimeReady(page);
    const rect = await waitFor(page, async (recordId) => {
const { getMainMenuRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const menu = getMainMenuRuntime();
        if (typeof menu?.showFully === 'function') await Promise.resolve(menu.showFully());
        else if (typeof menu?.reveal === 'function') await Promise.resolve(menu.reveal());
        const dashboardProjectId = window.eveDashboardBevyUiRuntime?.state?.active === true
            ? window.eveDashboardBevyUiRuntime?.state?.projectId
            : '';
        const projectId = dashboardProjectId
            || window.__currentProject?.id
            || window.eveDashboardBevyUiRuntime?.state?.projectId
            || '__eve_dashboard_workspace__';
        const records = window.eveToolBase?.getProjectSceneState?.(projectId)?.records || [];
        const record = records.find((entry) => String(entry?.id || '') === recordId);
        const props = record?.properties || null;
        const visible = props?.visible !== false;
        const width = Number(props?.width || 0);
        const height = Number(props?.height || 0);
        return {
            ok: !!record && visible && width > 1 && height > 1,
            rect: props ? {
                x: Number(props.left || 0),
                y: Number(props.top || 0),
                width,
                height
            } : null,
            projectId,
            recordId: record?.id || null
        };
    }, 15000, 250, BEVY_MAIN_MENU_ATOME_RECORD_ID);
    if (!rect.ok || !rect.last?.rect) {
        throw new Error(`dashboard_probe_atome_record_missing:${JSON.stringify(rect.last || null)}`);
    }
    await clickCanvasRectCenter(page, rect.last.rect);
};

export const waitForPresentationFrames = async (page, count = 2) => page.evaluate(async (frames) => {
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let index = 0; index < frames; index += 1) await waitFrame();
}, count);

export const clickCanvasRectCenter = async (page, rect) => {
    const canvas = page.locator('#eve_surface_project').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error('dashboard_canvas_box_missing');
    const x = box.x + Math.max(1, Math.min(box.width - 1, rect.x + rect.width / 2));
    const y = box.y + Math.max(1, Math.min(box.height - 1, rect.y + rect.height / 2));
    const hit = await page.evaluate((point) => {
        const canvasElement = document.getElementById('eve_surface_project');
        const top = document.elementFromPoint(point.x, point.y);
        return {
            ok: !!canvasElement && (top === canvasElement || canvasElement.contains(top)),
            topId: top?.id || null,
            topTag: top?.tagName || null,
            topRole: top?.getAttribute?.('data-role') || null
        };
    }, { x, y });
    if (!hit.ok) throw new Error(`dashboard_canvas_click_target_blocked:${JSON.stringify(hit)}`);
    await page.mouse.click(x, y);
};

export const longPressCanvasRectCenter = async (page, rect, holdMs = 650) => {
    const canvas = page.locator('#eve_surface_project').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const box = await canvas.boundingBox();
    if (!box) throw new Error('dashboard_canvas_box_missing');
    const x = box.x + Math.max(1, rect.x + rect.width / 2);
    const y = box.y + Math.max(1, rect.y + rect.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await sleep(holdMs);
    await page.mouse.up();
};
