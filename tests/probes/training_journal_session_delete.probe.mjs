// A Sport session's row held in the Journal (user, 18 Nov. 2026: « ajoute un Supprimer pour supprimer une séance du
// journal »), on the real Web app: a session written (started, then stopped « Ne pas compter »), the Journal opened, its
// row held like a finger (pointer down, kept, up). Checked: the held row is lifted with « Supprimer » under it, the
// standard hold of a practice's or an imported activity's row (holdStageRow, dashboardDeleteAction); a first touch on
// « Supprimer » asks « Toucher encore pour supprimer », the second removes the session (row and log). Each state is shot.
// Usage (an isolated server, never the developer's 3001): PROBE_ISOLATED=1 PROBE_PREBUILT_SERVER=1 node tests/probes/training_journal_session_delete.probe.mjs
import { createReport, openHome } from '../helpers/probe_home.mjs';

const EXERCISE = process.env.PROBE_EXERCISE || 'leg_extension';
const { check, shot, state, report, write, note } = createReport('training_journal_session_delete');
const { page, close } = await openHome({ report, write, check, view: process.env.PROBE_VIEW || 'desktop' });
const sleep = ms => page.waitForTimeout(ms);
const tool = (tool_id, input = {}) => page.evaluate(async ({ tool_id, input }) => {
    const { invokeToolGateway } = await import('/eVe/intuition/runtime/tool_gateway.js');
    const result = await invokeToolGateway({ tool_id, action: 'pointer.click', input, source: { type: 'ui', layer: 'probe' } });
    const inner = result?.result?.bridged === 'registered_handler' ? result.result.result : result?.result || result;
    return JSON.parse(JSON.stringify(inner ?? null));
}, { tool_id, input });
// Every node under the surface, by the hit test at a grid of points: its id and one point inside it (client px).
const scan = () => page.evaluate(() => {
    const surface = document.getElementById('eve_surface_project'), rect = surface.getBoundingClientRect(), seen = {};
    for (let y = rect.top + 4; y < rect.bottom; y += 8) for (let x = rect.left + 4; x < rect.right; x += 8) {
        const hit = window.eveBevyUiRuntime.hitTestAtClientPoint({ surface, clientX: x, clientY: y });
        const id = hit && String(hit.id || hit.nodeId || hit.node?.id || '');
        if (id && !seen[id]) seen[id] = [Math.round(x), Math.round(y)];
    }
    return seen;
});
const press = async ([x, y], ms) => { await page.mouse.move(x, y); await page.mouse.down(); await sleep(ms); await page.mouse.up(); };

try {
    // A session in the log: started, then stopped without counting (« Ne pas compter » lists it as stopped).
    const opened = await tool('training.open_exercise', { exercise_id: EXERCISE });
    check('exercise_opened', opened?.ok === true, opened);
    await sleep(2500);
    let started = await tool('training.card_action', { action: 'start', exercise_id: EXERCISE });
    // A new account's first « Lancer » asks the motion agreement (#dashboard_sensor_consent.js): answered « Non », then again.
    if (started?.card?.asking) {
        for (const family of ['sensors', 'body_data']) await tool(`${family}.set_consent`, { granted: false });
        await tool('training.open_exercise', { exercise_id: EXERCISE });
        await sleep(1500);
        started = await tool('training.card_action', { action: 'start', exercise_id: EXERCISE });
    }
    check('session_started', started?.ok === true, started);
    // Stopped once under way (its 3-2-1 and its start written take their time on a loaded machine).
    // Never during its 3-2-1: a stop there cancels it, nothing written.
    await sleep(12000);
    let stopped = null;
    for (let i = 0; i < 45 && stopped?.ok !== true; i += 1) {
        await sleep(2000);
        stopped = await tool('training.card_action', { action: 'stop', counts: false });
    }
    note('card_after_stop', (await tool('training.card_action', { action: 'open' }))?.card?.session ?? null);
    check('session_stopped', stopped?.ok === true, stopped);
    // The stop written, the log lists it (read again until it does).
    let log = null;
    for (let i = 0; i < 15 && !(log?.sessions?.length); i += 1) { await sleep(1500); log = await tool('training.read_log', {}); }
    note('log_after_stop', { sessions: (log?.sessions || []).map(x => [x.status, x.sets_done, x.end]), error: log?.error ?? null,
        exercise: ((await tool('training.get_exercise', { exercise_id: EXERCISE }))?.sessions || []).map(x => [x.status, x.sets_done, x.start, x.end]) });
    await sleep(2500);
    const journal = await tool('training.open_journal', {});
    check('journal_opened', journal?.ok === true, journal);
    await sleep(3000);
    await shot(page, '1_journal');
    const before = await scan();
    const row = Object.keys(before).find(id => id.startsWith('training_journal_session_'));
    check('session_row_holdable', !!row, { ids: Object.keys(before).filter(id => /training_journal/.test(id)).slice(0, 20) });
    if (row) {
        await press(before[row], 900);
        await sleep(1500);
        await shot(page, '2_held');
        const held = await scan();
        const remove = Object.keys(held).find(id => /delete/i.test(id));
        note('held_ids', Object.keys(held).filter(id => !/^__mystic_empty/.test(id)).slice(0, 40));
        check('supprimer_under_the_held_row', !!remove, { ids: Object.keys(held).slice(0, 40) });
        if (remove) {
            await press(held[remove], 90);
            await sleep(1200);
            await shot(page, '3_confirm');
            // The second touch removes it: its row gone from the Journal, the session gone from the log.
            const confirm = Object.keys(await scan()).find(id => /delete/i.test(id));
            check('confirm_still_offered', !!confirm);
            if (confirm) {
                await press((await scan())[confirm], 90);
                let gone = false;
                for (let i = 0; i < 10 && !gone; i += 1) {
                    await sleep(1500);
                    const sessions = (await tool('training.read_log', {}))?.sessions || [];
                    if (!sessions.some(x => `training_journal_session_${x.session_id}` === row)) gone = true;
                }
                check('session_gone_from_log', gone);
                await sleep(1500);
                await shot(page, '4_removed');
                check('row_gone_from_journal', !(row in await scan()));
            }
        }
    }
} catch (error) {
    check('probe_ran', false, { error: String(error?.stack || error).slice(0, 900) });
} finally {
    write();
    await Promise.race([close(), new Promise(resolve => setTimeout(resolve, 20000))]);
    console.log(state.failed ? `FAILED ${state.failed}` : 'ALL OK');
    process.exit(state.failed ? 1 : 0);
}
