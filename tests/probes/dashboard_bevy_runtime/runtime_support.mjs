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
    ok: !!window.__DEBUG__ || !!window.new_menu_v2 || !!document.getElementById('intuition'),
    hasDebug: !!window.__DEBUG__,
    hasMenu: !!window.new_menu_v2,
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
    const sequence = document.getElementById('eve_login_sequence');
    const sequenceHidden = !sequence || getComputedStyle(sequence).display === 'none';
    const isAnonymous = api?.security?.isAnonymous ? api.security.isAnonymous() : null;
    return {
        ok: current?.logged === true && isAnonymous === true && !!projectId && !!canvas,
        current,
        isAnonymous,
        projectId,
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

export const resolveAtomHandle = async (page) => {
    await waitForRuntimeReady(page);
    const handle = page.locator('button[data-role="eve_intuitionx-handle"]').first();
    const visible = await handle.isVisible().catch(() => false);
    if (!visible) await page.evaluate(() => window.new_menu_v2?.reveal?.());
    await handle.waitFor({ state: 'visible', timeout: 15000 });
    const hit = await handle.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
            ok: rect.width > 0 && rect.height > 0,
            topMatches: button === top || button.contains(top),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            topTag: top?.tagName || null,
            topId: top?.id || null,
            topRole: top?.getAttribute?.('data-role') || null,
            topToolId: top?.getAttribute?.('data-tool-id') || null
        };
    });
    if (!hit.ok) throw new Error(`dashboard_probe_atom_handle_not_visible:${JSON.stringify(hit)}`);
    return handle;
};

export const waitForPresentationFrames = async (page, count = 2) => page.evaluate(async (frames) => {
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let index = 0; index < frames; index += 1) await waitFrame();
}, count);

export const clickCanvasRectCenter = async (page, rect) => {
    const canvas = page.locator('#eve_surface_project').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    await canvas.click({
        position: {
            x: Math.max(1, rect.x + rect.width / 2),
            y: Math.max(1, rect.y + rect.height / 2)
        },
        timeout: 10000
    });
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
