// A level's tiles take a touch on their whole face, never the home's empty plates laid under them (iPhone, 17 Nov. 2026:
// in Activité only Sport's centre opened Sport, a touch elsewhere on its tile went back to the home — the home's tiles'
// empty plates, off the level's block against the hand's corner since R-204, lay over it, bevy_ui_mystic_model.js).
// On the real Web app, an iPhone's screen: Activité opened; every tile asked what lies under points near its edges and
// corners; then real touches near Sport's corners each open Sport. Usage: PROBE_PREBUILT_SERVER=1 node tests/probes/mystic_tile_edges_touch.probe.mjs
import { createReport, openHome, openTile, closeRubric, mysticPlates, waitMystic, surface, sleep } from '../helpers/probe_home.mjs';

const { check, shot, state, report, write } = createReport('mystic_tile_edges_touch');
// PROBE_MODEL_FILE: a copy of bevy_ui_mystic_model.js served instead of the product's (the version before the repair, to see it fail).
const stand = process.env.PROBE_MODEL_FILE;
const beforeOpen = stand ? async page => {
    const body = (await import('node:fs')).readFileSync(stand, 'utf8');
    await page.route('**/eVe/intuition/ribbon/bevy_ui_mystic_model.js*', route => route.fulfill({ status: 200, contentType: 'text/javascript', body, headers: { 'cache-control': 'no-store' } }));
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => window.__eveWorkspaceDashboardReady === true, null, { timeout: 180000 });
} : null;
const { page, close } = await openHome({ report, write, check, beforeOpen });
const INSET = Number(process.env.PROBE_EDGE_INSET || 8);
// The points of a box near its corners and edges' middles, `INSET` inside.
const edges = ({ x, y, width, height }) => {
    const [l, r, t, b, cx, cy] = [x + INSET, x + width - INSET, y + INSET, y + height - INSET, x + width / 2, y + height / 2];
    return [[l, t], [r, t], [l, b], [r, b], [cx, t], [cx, b], [l, cy], [r, cy]];
};
let covers = [];
const openActivity = async () => {
    const { opened, plates: all } = await openTile(page, 'activity');
    covers = all.filter(plate => /__mystic_empty_/.test(plate.id));
    return { opened, plates: all.filter(plate => !/__mystic_empty_|_center$/.test(plate.id) && plate.texts.length) };
};
try {
    await page.setViewportSize({ width: 402, height: 874 });
    await sleep(2500);
    const { opened, plates } = await openActivity();
    check('activity_opened', opened === true && plates.length > 0, { plates: plates.map(plate => plate.texts[0]) });
    // The case is real here: empty plates overlap tiles (else the edges prove nothing).
    const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const overlapped = plates.filter(plate => covers.some(cover => overlap(cover, plate))).map(plate => plate.texts[0]);
    check('empty_plates_overlap_tiles', overlapped.length > 0, { overlapped, covers: covers.length });
    await shot(page, 'activity');
    const r = await surface(page);
    const misses = [];
    for (const plate of plates) {
        for (const [x, y] of edges(plate)) {
            const hit = await page.evaluate(({ x, y }) => window.eveBevyUiRuntime.hitTestAtClientPoint({ surface: document.getElementById('eve_surface_project'), clientX: x, clientY: y }), { x: r.x + x, y: r.y + y });
            if (!String(hit?.nodeId || '').startsWith(plate.id)) misses.push({ tile: plate.texts[0], at: [Math.round(x), Math.round(y)], hit: hit?.nodeId || null });
        }
    }
    check('every_tile_edge_hits_its_tile', misses.length === 0, { tiles: plates.length, points: plates.length * 8, misses: misses.slice(0, 20) });
    // Real touches near Sport's corners: each opens Sport (its level shows Musculation).
    for (const corner of [0, 3, 1, 2]) {
        const { plates: again } = corner === 0 ? { plates } : await openActivity();
        const sport = again.find(plate => plate.texts.includes('Sport'));
        const [x, y] = edges(sport)[corner];
        // The level laid and still (its wave over): a touch while the plates still turn is the wave's, not the tile's.
        await waitMystic(page, true);
        await sleep(1500);
        await page.mouse.click(r.x + x, r.y + y);
        await sleep(1500);
        const now = await mysticPlates(page);
        const inSport = now.some(plate => plate.texts.some(text => /^Musculati/.test(text)));
        check(`sport_opened_from_corner_${corner}`, inSport, { at: [Math.round(x), Math.round(y)], texts: now.flatMap(plate => plate.texts).slice(0, 12) });
        if (corner === 0) await shot(page, 'sport_from_corner');
        await closeRubric(page);
        await waitMystic(page, false);
        await sleep(800);
    }
} catch (error) {
    check('probe_ran_through', false, { error: String(error?.stack || error).slice(0, 1200) });
} finally {
    await close();
}
console.log(state.failed ? `FAIL ${state.failed} check(s)` : 'PASS', `(${report.errors.length} page error(s) noted in report.json)`);
process.exit(state.failed ? 1 : 0);
