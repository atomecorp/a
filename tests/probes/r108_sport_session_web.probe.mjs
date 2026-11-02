// R-108 / BUG-005, BUG-006, BUG-014 on the real Web app: a Sport session driven by `training.card_action` (the card's
// disc and tools as the watch and MCP do them, the card's own functions behind): launched, its 3-2-1 counted down and the
// session running with its clock advancing, paused, resumed, left for the Dashboard while it runs, listed by the
// « en cours » registry (activity_ongoing.js) that the ▶ tool shows, reopened from that entry on the same session, stopped,
// and no longer listed. Usage: PW_HEADFUL=1 xvfb-run -a node tests/probes/r108_sport_session_web.probe.mjs
import path from 'node:path';
import { waitFor, wait } from './molecule_ui_acceptance_support.mjs';
import { openR108Session } from './r108_web_session.mjs';

const OUT = path.resolve(process.env.R108_OUT || 'temp/probe_reports/r108_sport_session_web');
const EXERCISE = process.env.R108_EXERCISE || 'push_up';
const { page, check, signIn, tool, toDashboard, finish } = await openR108Session({ out: OUT });
const act = async (action, extra = {}) => {
    const result = await tool({ tool_id: 'training.card_action', action: 'pointer.click', input: { action, ...extra } });
    const inner = result?.result?.result || result?.result || result;
    if (inner?.ok === false || result?.ok === false) throw new Error(JSON.stringify(result).slice(0, 800));
    return inner;
};
const ongoing = () => page.evaluate(async () => (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()
    .map((entry) => ({ key: entry.key, paused: entry.paused(), line: String(entry.line?.() || '').slice(0, 80), clock: String(entry.clock?.() || '') })));
const phase = (card) => card?.session?.phase || card?.phase || '';

try {
    await check('sign_in', signIn);
    // The first « Lancer » asks the agreement to record the session's motion (dashboard_sensor_consent.js): answered « Non »
    // by its canonical command, as the card's band does, then launched again.
    await check('first_launch_consent', async () => {
        const asked = await act('start', { exercise_id: EXERCISE });
        if (!asked?.card?.asking) return { asked: false };
        const answers = [];
        for (const family of ['sensors', 'body_data']) {
            const answer = await tool({ tool_id: `${family}.set_consent`, action: 'pointer.click', input: { granted: false } });
            answers.push({ family, ok: (answer?.result?.result || answer?.result || answer)?.ok !== false });
        }
        // The card reads its answers when it opens (consent.reset -> read): it is opened again on the exercise.
        await tool({ tool_id: 'training.open_exercise', action: 'pointer.click', input: { exercise_id: EXERCISE } });
        await wait(1500);
        return { asked: true, answers };
    });
    const launched = await check('launch', () => act('start', { exercise_id: EXERCISE }));
    console.log('  card after start:', JSON.stringify(launched?.card || launched).slice(0, 1200));
    await check('countdown_then_running', async () => {
        const seen = new Set();
        const started = Date.now();
        while (Date.now() - started < 15000) {
            const card = (await act('open')).card;
            seen.add(phase(card));
            if (phase(card) && !/count/i.test(phase(card)) && seen.size > 0 && card?.session) {
                return { phases: [...seen], after_ms: Date.now() - started, session: JSON.stringify(card.session).slice(0, 400) };
            }
            await wait(250);
        }
        throw new Error(`still_counting:${[...seen].join(',')}`);
    });
    // BUG-014: the count runs (the « en cours » entry registered, its figure moving on).
    await check('count_advances', async () => {
        const first = (await waitFor(page, async () => {
            const entry = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()[0];
            return { ok: !!entry, clock: String(entry?.clock?.() || '') };
        }, null, 10000)).clock;
        const second = (await waitFor(page, async (before) => {
            const entry = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()[0];
            const clock = String(entry?.clock?.() || '');
            return { ok: !!clock && clock !== before, clock };
        }, first, 10000)).clock;
        return { first, second };
    });
    await check('pause', async () => { await act('pause'); return waitFor(page, async () => {
        const list = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities();
        return { ok: list[0]?.paused?.() === true, count: list.length };
    }, null, 8000); });
    await check('resume', async () => { await act('pause'); return waitFor(page, async () => {
        const list = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities();
        return { ok: list[0]?.paused?.() === false, count: list.length };
    }, null, 8000); });
    await check('back_to_dashboard_session_goes_on', async () => {
        await toDashboard();
        await wait(1500);
        const list = await ongoing();
        if (list.length !== 1 || list[0].paused) throw new Error(JSON.stringify(list));
        return list;
    });
    await page.screenshot({ path: path.join(OUT, 'dashboard_ongoing.png') });
    const sessionBefore = await page.evaluate(async () => JSON.stringify((await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()[0]?.key || ''));
    await check('ongoing_entry_reopens_same_session', async () => {
        await page.evaluate(async () => (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities()[0].open());
        await wait(1500);
        const card = (await act('open')).card;
        if (!card?.session) throw new Error(`no_session_on_card:${JSON.stringify(card).slice(0, 400)}`);
        return { phase: phase(card), key: sessionBefore };
    });
    await page.screenshot({ path: path.join(OUT, 'card_reopened.png') });
    await check('stop', async () => {
        await act('stop');
        return waitFor(page, async () => {
            const list = (await import('/eVe/domains/programs/activity_ongoing.js')).ongoingActivities();
            return { ok: list.length === 0, count: list.length };
        }, null, 10000);
    });
    await page.screenshot({ path: path.join(OUT, 'stopped.png') });
} finally {
    await finish();
}
