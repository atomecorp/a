// Shared helpers of the real-app probes that start from the eVe home (Dashboard).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer, sleep } from './probe_server.mjs';
import { openUserPastFirstLaunch } from './probe_app_session.mjs';
export { sleep };

export const createReport = (name) => {
    const OUT = path.resolve(`temp/probe_reports/dashboard_enhancement/${name}`);
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    const report = { checks: [], notes: {}, errors: [] };
    const write = () => fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    const state = { failed: 0 };
    const check = (label, ok, detail = {}) => {
        report.checks.push({ name: label, ok: !!ok, detail }); write();
        console.log(ok ? 'OK  ' : 'FAIL', label, ok ? '' : JSON.stringify(detail).slice(0, 900));
        if (!ok) state.failed += 1;
        return !!ok;
    };
    const note = (label, value) => { report.notes[label] = value; write(); console.log('NOTE', label, JSON.stringify(value).slice(0, 600)); };
    const shot = async (page, label) => {
        const buffer = await page.locator('#eve_surface_project').screenshot().catch(() => null);
        if (buffer) fs.writeFileSync(path.join(OUT, `${label}.png`), buffer);
    };
    return { OUT, report, write, check, note, shot, state };
};

// An isolated server, a new account, the eVe home open as its grid (style, view = phone | desktop).
export const openHome = async ({ report, write, check, style = 'eve', view = 'phone', beforeOpen = null, env = {}, locale = undefined }) => {
    const server = await startServer({ env });
    const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0', args: [
        '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--disable-gpu-sandbox', '--window-position=-32000,-32000',
        '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
    const page = await openUserPastFirstLaunch({ browser, server, report, write, locale, bootPredicate: () => ({ ok: window.AdoleAPI?.security?.isAnonymous?.() === false
        && !!window.eveBevyUiRuntime && typeof window.Atome?.commit === 'function' }) });
    page.on('pageerror', (e) => report.errors.push(`pageerror ${String(e?.message || e).slice(0, 400)}`));
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${m.text().slice(0, 300)} @ ${m.location()?.url || ''}`.slice(0, 500)); });
    page.on('requestfailed', (r) => report.errors.push(`requestfailed ${r.url().slice(0, 200)} ${r.failure()?.errorText || ''}`));
    // The bootstrap lays the home once its style and its domain are settled (user_workspace_bootstrap_runtime.js): the
    // probe's own open comes after it, never before the domain is known (dashboard_domain_unknown).
    await page.waitForFunction(() => window.__eveWorkspaceDashboardReady === true, null, { timeout: Number(process.env.PROBE_HOME_READY_MS) || 180_000 });
    if (view !== 'desktop') await page.setViewportSize({ width: 430, height: 932 });
    if (beforeOpen) await beforeOpen(page);
    await setVisual(page, { dashboardStyle: style });
    const opened = await page.evaluate(async () => (await import('/eVe/intuition/tools/user_workspace_surface_runtime.js')).openWorkspaceDashboardAndMainMenu({ source: 'probe' }));
    check('accueil ouvert', opened.ok === true, opened);
    let H = { ok: false };
    for (let i = 0; i < 60 && !H.ok; i += 1) { await sleep(500); H = await readHome(page); }
    if (H.inspect?.atom?.mode === 'solo') {
        await tapBox(page, H.cells.atom.box);
        check('grille posee', (await waitHome(page, 'i.atom.mode === "grid" && !i.atom.revealing && !i.atom.resizing')).ok);
    }
    await sleep(1500);
    const close = async () => { await browser.close(); await server.stop?.(); };
    return { page, browser, server, close };
};

export const waitOn = async (page, fn, arg = null, timeoutMs = 15000, stepMs = 120) => {
    const started = Date.now(); let last = null;
    while (Date.now() - started < timeoutMs) {
        try { last = await page.evaluate(fn, arg); if (last?.ok) return last; } catch (error) { last = { ok: false, error: String(error?.message || error) }; }
        await sleep(stepMs);
    }
    return { ...(last || {}), ok: false, timeout: true };
};
export const readHome = (page) => page.evaluate(async () => {
    const { dashboardMysticCellRef } = await import('/eVe/domains/dashboard/dashboard_mystic_grid.js');
    const { locateBevyUiNode } = await import('/eVe/domains/rendering/bevy_ui_scroll_runtime.js');
    const { FIRST_LAUNCH_TEMPLATES } = await import('/eVe/domains/templates/first_launch_template_catalog.js');
    const instance = (window.eveMatrixModules?.list?.() || []).find(entry => entry.active && entry.tree_id);
    const tree = instance && window.eveBevyUiRuntime.state.trees.get(instance.tree_id)?.tree;
    if (!tree) return { ok: false };
    const texts = (node, out = []) => {
        const value = node?.text ?? node?.image?.text;
        if (typeof value === 'string' && value) out.push(value);
        for (const child of node?.children || []) texts(child, out);
        return out;
    };
    const cells = {};
    for (const atom of FIRST_LAUNCH_TEMPLATES.dashboard_eve.atoms) {
        if (!atom.props.template_control) continue;
        const found = locateBevyUiNode({ node: tree.root, nodeId: `${instance.atome_id}_${atom.ref}` });
        if (found) cells[dashboardMysticCellRef(atom.props.template_control)] = { box: found.box, drawn: (found.node.children || []).length, texts: texts(found.node) };
    }
    return { ok: Object.keys(cells).length >= 15, cells, inspect: window.eveMatrixModules.read(instance.atome_id)?.inspect?.() || null };
});
export const waitHome = (page, predicate, timeoutMs = 10000) => waitOn(page, new Function('arg', `
    const instance = (window.eveMatrixModules?.list?.() || []).find(entry => entry.active && entry.tree_id);
    const i = instance ? window.eveMatrixModules.read(instance.atome_id)?.inspect?.() : null;
    return { ok: !!i && (${predicate}), inspect: i };`), null, timeoutMs, 80);
export const waitMystic = (page, open) => waitOn(page, async (wanted) => {
    const { getMysticRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
    const m = getMysticRuntime()?.measure?.() || {};
    return { ok: wanted ? m.open === true && m.phase === 'open' : m.open !== true, phase: m.phase };
}, open, 10000, 100);
// The Mystic's plates: id, box and texts (the centre is the anchor / Return).
export const mysticPlates = (page) => page.evaluate(() => {
    const root = window.eveBevyUiRuntime.state.trees.get('eve_bevy_ui_mystic')?.tree?.root;
    const texts = (node, out = []) => {
        const value = node?.text ?? node?.image?.text;
        if (typeof value === 'string' && value) out.push(value);
        for (const child of node?.children || []) texts(child, out);
        return out;
    };
    return (root?.children || []).map(node => ({ id: node.id, x: node.style?.position?.[0], y: node.style?.position?.[1],
        width: node.style?.size?.[0], height: node.style?.size?.[1], texts: texts(node) }));
});
export const surface = (page) => page.locator('#eve_surface_project').boundingBox();
export const centre = async (page, box) => { const r = await surface(page); return { x: r.x + box.x + box.width / 2, y: r.y + box.y + box.height / 2 }; };
export const tapBox = async (page, box) => { const p = await centre(page, box); await page.mouse.click(p.x, p.y); };
export const holdBox = async (page, box, ms = 900) => { const p = await centre(page, box); await page.mouse.move(p.x, p.y); await page.mouse.down(); await sleep(ms); await page.mouse.up(); };
export const plateText = (plates, text) => plates.find(plate => plate.texts.includes(text));
export const sameBox = (plate, box) => !!plate && !!box && Math.abs(plate.x - box.x) < 3 && Math.abs(plate.y - box.y) < 3;
export const setVisual = (page, patch) => page.evaluate(async (next) => {
    const api = await import('/eVe/domains/user/profile_api.js');
    const loaded = await api.loadUserProfile(null, { repair: false });
    const visual = { ...loaded.profile.preferences?.visual, ...next };
    await api.upsertUserProfile({ ...loaded.profile, preferences: { ...loaded.profile.preferences, visual } }, { userId: loaded.userId, allowCreate: false, eventSource: 'probe' });
    window.__eveProfilePreferences = { ...window.__eveProfilePreferences, visual: { ...window.__eveProfilePreferences?.visual, ...next } };
    window.dispatchEvent(new CustomEvent('eve:profile-preferences-updated', { detail: { source: 'probe', preferences: window.__eveProfilePreferences } }));
}, patch);
// The centre goes back one level: tapped until the Mystic is closed.
export const closeRubric = async (page) => {
    for (let level = 0; level < 4; level += 1) {
        const plates = await mysticPlates(page);
        const anchor = plates.find(plate => plate.id === 'eve_bevy_ui_mystic_center');
        if (!anchor) break;
        await tapBox(page, anchor);
        if ((await waitMystic(page, false)).ok) return true;
        await sleep(600);
    }
    return (await waitMystic(page, false)).ok;
};
// Opens a root tile's rubric and returns its plates.
export const openTile = async (page, ref) => {
    const H = await readHome(page);
    await tapBox(page, H.cells[ref].box);
    const opened = await waitMystic(page, true);
    await sleep(900);
    return { opened: opened.ok, plates: await mysticPlates(page), H };
};


// The plates as the Mystic really lays them (its tree keeps the opening's first
// frame): each home tile cell, and each quarter of it (half-size bricks), asked
// what is under its centre. `[{ key, label, box }]`, one per distinct item.
export const platesAt = async (page) => {
    const H = await readHome(page);
    const boxes = Object.entries(H.cells || {}).filter(([ref]) => !['clock', 'weather', 'search'].includes(ref)).flatMap(([, cell]) => {
        const { x, y, width, height } = cell.box, w = width / 2, h = height / 2;
        return [cell.box, { x, y, width: w, height: h }, { x: x + w, y, width: w, height: h }, { x, y: y + h, width: w, height: h }, { x: x + w, y: y + h, width: w, height: h }];
    });
    const found = await page.evaluate(async (list) => {
        const { getMysticRuntime } = await import('/eVe/intuition/ribbon/bevy_ui_product_registry.js');
        const r = document.getElementById('eve_surface_project').getBoundingClientRect();
        return list.map(box => { const item = getMysticRuntime()?.resolveButtonFromPoint({ x: r.left + box.x + box.width / 2, y: r.top + box.y + box.height / 2 });
            return item && item.key ? { key: String(item.key), label: String(item.label || ''), box } : null; });
    }, boxes);
    const seen = new Map();
    for (const entry of found) if (entry && !seen.has(entry.key)) seen.set(entry.key, entry);
    return [...seen.values()];
};
