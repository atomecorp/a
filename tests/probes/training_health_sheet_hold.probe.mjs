// A Sport session under its own ask for the heart rate, on the real Web app (user, 17 Nov. 2026 on the iPad: the health
// store's sheet came over a session that had just started; at the answer set 1, the rest and set 2 were said all at once).
// The device's health store is stood in for in the page: the heart rate reads « never asked », and the access asked stays
// unanswered — the sheet up — until the probe answers it. Checked: the session is paused while the sheet is up (its clock
// still, its step the same however long it stays), then goes on from where it stood at the answer and runs again.
// Usage (an isolated server, never the developer's 3001): PROBE_PREBUILT_SERVER=1 node tests/probes/training_health_sheet_hold.probe.mjs
import { createReport, openHome } from '../helpers/probe_home.mjs';

// `predicate` read in the page until it answers `{ ok: true }` (or `timeoutMs`), its last answer returned.
const waitFor = async (page, predicate, arg = null, timeoutMs = 30000, stepMs = 150) => {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
        try { last = await page.evaluate(predicate, arg); if (last?.ok === true) return last; } catch (error) { last = { ok: false, error: String(error?.message || error) }; }
        await page.waitForTimeout(stepMs);
    }
    return { ok: false, timeout: true, last };
};

const EXERCISE = process.env.PROBE_EXERCISE || 'leg_extension';
const SHEET_MS = Number(process.env.PROBE_SHEET_MS || 30000);
const { check, shot, state, report, write } = createReport('training_health_sheet_hold');
// The health module as the probe serves it (never the product): its owner stood in for by `window.__probeHealthOwner` when
// set — the product's owner is frozen, its host the device's (none on the Web). Served so from a reload, before the card loads.
const beforeOpen = async page => {
    await page.route('**/squirrel/health/index.js*', async route => {
        const response = await route.fetch();
        const body = (await response.text()).replace('export const getHealthOwner = () => owner;',
            'export const getHealthOwner = () => globalThis.__probeHealthOwner || owner;');
        await route.fulfill({ response, body, headers: { ...response.headers(), 'cache-control': 'no-store' } });
    });
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.__eveWorkspaceDashboardReady === true, null, { timeout: 180000 });
};
const { page, close } = await openHome({ report, write, check, beforeOpen });
const failed = () => state.failed;
const sleep = ms => page.waitForTimeout(ms);
const tool = (tool_id, input = {}) => page.evaluate(async ({ tool_id, input }) => {
    const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
    const result = await invokeToolGateway({ tool_id, action: 'pointer.click', input, source: { type: 'ui', layer: 'probe' } });
    const inner = result?.result?.bridged === 'registered_handler' ? result.result.result : result?.result || result;
    return JSON.parse(JSON.stringify(inner ?? null));
}, { tool_id, input });
const act = (action, extra = {}) => tool('training.card_action', { action, ...extra });
// The session under way, as the « en cours » registry and the card read it.
const now = () => page.evaluate(async () => {
    const entry = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()[0];
    return entry ? { paused: entry.paused(), clock: String(entry.clock?.() || ''), line: String(entry.line?.() || '').slice(0, 80) } : null;
});
// The figure the card counts (a set's repetitions « 8 / 12 », a timed step's « 1:09 »), as a number that grows as it runs.
const figure = clock => (/\//.test(clock) ? Number(clock.split('/')[0]) : clock.split(':').reduce((sum, part) => sum * 60 + Number(part), 0));
// The step the line names, without the pause's mark (« Série 1 / 2 · En pause »).
const stepOf = line => String(line || '').split(' · ')[0];

try {
    // The health store stood in for: the heart rate never asked, its access answered only when the probe says so.
    const stood = await page.evaluate(async () => {
        const { getHealthOwner } = await import('/squirrel/health/index.js');
        const owner = getHealthOwner();
        window.__probeSheet = { asks: 0, answer: null };
        window.__probeHealthOwner = { ...owner,
            subscribe: (_type, listener) => { setTimeout(() => listener({ state: 'needs_permission' }), 0); return () => {}; },
            refresh: () => {},
            requestAccess: () => { window.__probeSheet.asks += 1; return new Promise(resolve => { window.__probeSheet.answer = resolve; }); } };
        return { owner: getHealthOwner() === window.__probeHealthOwner };
    });
    check('health_store_stood_in', stood.owner === true, stood);
    // The first « Lancer » asks the motion agreement (#dashboard_sensor_consent.js): answered « Non », then the card again.
    await tool('training.open_exercise', { exercise_id: EXERCISE });
    await sleep(1500);
    const asked = await act('start', { exercise_id: EXERCISE });
    if (asked?.card?.asking) {
        for (const family of ['sensors', 'body_data']) await tool(`${family}.set_consent`, { granted: false });
        await tool('training.open_exercise', { exercise_id: EXERCISE });
        await sleep(1500);
        await act('start', { exercise_id: EXERCISE });
    }
    // The 3-2-1, the start written, then the ask: the sheet comes up.
    const up = await waitFor(page, () => ({ ok: window.__probeSheet?.asks === 1 && typeof window.__probeSheet.answer === 'function' }), null, 20000);
    check('sheet_up_after_start', up.ok === true, up);
    const held = await waitFor(page, async () => {
        const entry = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()[0];
        return { ok: entry?.paused?.() === true, clock: String(entry?.clock?.() || '') };
    }, null, 10000);
    check('paused_while_sheet_up', held.ok === true, held);
    const before = await now();
    await shot(page, 'sheet_up');
    // The sheet stays up longer than set 1 (12 repetitions): a session left running would have moved on to its rest.
    await sleep(SHEET_MS);
    const after = await now();
    check('still_where_it_stood', !!after && after.paused === true && after.clock === before.clock && after.line === before.line, { before, after, sheet_ms: SHEET_MS });
    await page.evaluate(() => window.__probeSheet.answer({ ok: true }));
    const resumed = await waitFor(page, async () => {
        const entry = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()[0];
        return { ok: entry?.paused?.() === false, clock: String(entry?.clock?.() || ''), line: String(entry?.line?.() || '').slice(0, 80) };
    }, null, 10000);
    check('goes_on_at_the_answer', resumed.ok === true && stepOf(resumed.line) === stepOf(before.line) && resumed.clock === before.clock, { before, resumed });
    await sleep(4000);
    const running = await now();
    check('runs_from_where_it_stood', !!running && running.paused === false && stepOf(running.line) === stepOf(before.line)
        && figure(running.clock) > figure(before.clock), { before, running });
    await shot(page, 'after_answer');
    await act('stop');
} catch (error) {
    check('probe_ran_through', false, { error: String(error?.stack || error).slice(0, 1200) });
    console.log('ERROR', error);
} finally {
    await close();
}
console.log(failed() ? `FAIL ${failed()} check(s)` : 'PASS', `(${report.errors.length} page error(s) noted in report.json)`);
process.exit(failed() ? 1 : 0);
