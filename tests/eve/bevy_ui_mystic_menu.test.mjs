import { CONTEXT_MENUS } from '../../eVe/intuition/menu/context_menus_loader.js';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { test } from 'vitest';
import { PROJECT_SCENES } from '../../eVe/domains/rendering/project_scene_state.js';

import {
    MYSTIC_FLIP_CENTRAL_DURATION_MS, MYSTIC_FLIP_DURATION_MS,
    MYSTIC_FLIP_EASE_PLATEAU, MYSTIC_FLIP_REDUCED_DURATION_MS, MYSTIC_FLIP_STAGGER_RATIO,
    MYSTIC_MAX_TILES, MYSTIC_SHADOW_PAD_PX,
    MYSTIC_CENTER_SIZE_RATIO, MYSTIC_SHADOW_FADE_MS,
    MYSTIC_OPENING_MS, MYSTIC_SLOTS, MYSTIC_SLOT_NAMES, MYSTIC_TILE_GAP_PX, MYSTIC_TILE_ROUNDNESS,
    computeMysticLayout, planMysticTiles,
    resolveMysticCenterMetrics,
    resolveMysticFlipEase, resolveMysticGrid, resolveMysticLayoutMargin,
    resolveMysticSlot, resolveMysticSlotIndex, resolveMysticSlots, resolveMysticStaggerDelays,
    resolveMysticTileAt, resolveMysticTileFlipProgress, resolveMysticTileRadius,
    resolveMysticTileTimeline, resolveMysticTiles, resolveMysticWaveRanks
} from '../../eVe/intuition/mystic/mystic_layout.js';
import {
    MYSTIC_CENTER_FALLBACK, MYSTIC_CENTER_SLOT, MYSTIC_ITEM_SLOTS,
    isMysticCenterItem, resolveMysticCenterItem, resolveMysticItemSlot, resolveMysticMenuLayout
} from '../../eVe/intuition/mystic/mystic_menu_items.js';
import {
    INTUITION_MYSTIC_MODE, MYSTIC_CENTER_PLATE, MYSTIC_CENTER_TINT,
    MYSTIC_CENTER_SHADOW,
    MYSTIC_EDGE_SOFTNESS_PX, MYSTIC_HOLE_DOSE, MYSTIC_PERSPECTIVE_TILES, 
    MYSTIC_GLASS_TINT, MYSTIC_SKIN, MYSTIC_SURFACE_TINT, resolveMysticEdgeSoftness,
    resolveMysticFamilyColor, resolveMysticSkin
} from '../../eVe/intuition/mystic/mystic_tokens.js';
import { EVE_MYSTIC_SKIN_TOKENS } from '../../eVe/elements/skin/mystic_skin.js';
import { EVE_COMMON_SKIN_TOKENS, EVE_SEMANTIC_COLOR_FAMILIES } from '../../eVe/elements/skin/tokens.js';
import { EVE_SKIN_TOKENS } from '../../eVe/elements/skin/index.js';
import { SYSTEM_UI_METRICS } from '../../eVe/elements/system_ui_tokens.js';
import { MYSTIC_GLYPH_START, mysticInteractionReady, mysticMotionTargets, sampleMysticMotion } from '../../eVe/intuition/mystic/mystic_motion.js';
import { MYSTIC_PHASE, createMysticShadowFade } from '../../eVe/intuition/ribbon/bevy_ui_mystic_motion.js';
import { buildMysticSurfaceUniforms } from '../../eVe/intuition/mystic/intuition_mystic_menu_renderer.js';
import {
    BEVY_MYSTIC_CENTER_ID, buildBevyUiMysticTree, resolveBevyMysticMargin,
    resolveBevyMysticTreeGeometry
} from '../../eVe/intuition/ribbon/bevy_ui_mystic_model.js';
import { mapVirtualSceneStyleToBevyPatch } from '../../eVe/domains/rendering/bevy_projection_adapter.js';

// The one constant list a long press or a right click opens (2026-09-29): the
// test reads it from the taxonomy, so a new entry is a new expectation.
const MYSTIC_FIXED_ITEMS = CONTEXT_MENUS.menus.mystic.fixed.map(({command,slot})=>({key:command,slot}));
const TILE = 60;
const STEP = TILE + MYSTIC_TILE_GAP_PX;
const RECT = { width: 1200, height: 800 };
const SURFACE = { getBoundingClientRect: () => ({ ...RECT }) };
const CENTER = { x: 600, y: 400 };
const DESKTOP_KEYS = MYSTIC_FIXED_ITEMS.map((entry) => entry.key);
const items = (...keys) => keys.map((key) => ({ key, icon: key, label: key, type: 'tool',
    ...(MYSTIC_FIXED_ITEMS.find(entry => entry.key === key)?.slot ? { slot: MYSTIC_FIXED_ITEMS.find(entry => entry.key === key).slot } : {}),
    ...(key === 'copy' ? { slot: 'southEast' } : {}) }));
// Eight entries plus the Atom handle: every rung of the 3×3 ring, so a square.
const RING_KEYS = DESKTOP_KEYS.slice(0, 8);
const RING_ITEMS = items(...RING_KEYS, 'ai');
// One entry more: it takes the first star rung, so the block becomes a star.
const STAR_ITEMS = items(...DESKTOP_KEYS.slice(0, 9), 'ai');

const place = (count, x, y, { surface = RECT } = {}) => computeMysticLayout({
    slots: resolveMysticSlots(count), center: { x, y }, anchor: { x, y }, surface, tileSize: TILE, roundness: 1
});
const tileOf = (layout, slot) => layout.tiles.find((tile) => tile.slot === slot);
const pointOf = (layout, slot) => tileOf(layout, slot)?.point;
// The cell a tile landed on, as a count of cells from the Atom: the table read as
// a table, not as a list of pixels.
const cellOf = (layout, slot) => {
    const point = pointOf(layout, slot);
    return [Math.round((point[0] - layout.center.x) / STEP), Math.round((point[1] - layout.center.y) / STEP)];
};
const cells = (layout) => layout.tiles.map((tile) => cellOf(layout, tile.slot).join(',')).sort();
const insideSurface = (layout, surface = RECT) => layout.tiles.every((tile) => (
    tile.point[0] - (tile.size / 2) >= MYSTIC_SHADOW_PAD_PX && tile.point[0] + (tile.size / 2) <= surface.width - MYSTIC_SHADOW_PAD_PX
    && tile.point[1] - (tile.size / 2) >= MYSTIC_SHADOW_PAD_PX && tile.point[1] + (tile.size / 2) <= surface.height - MYSTIC_SHADOW_PAD_PX
));
const geometryFor = (list, { mystic = true } = {}) => resolveBevyMysticTreeGeometry({
    surface: SURFACE, center: { ...CENTER }, items: list, mystic
});
const targetsFor = (geometry) => mysticMotionTargets({
    tree: buildBevyUiMysticTree({ geometry }), center: geometry.center, placements: geometry.placements
});
const proceduralPatch = (procedural) => mapVirtualSceneStyleToBevyPatch({
    id: 'menu_ground', patch: { material: { procedural } }
}).procedural;
const closeTo = (actual, expected, message) => assert.ok(
    Math.abs(actual - expected) < 0.002, `${message}: ${actual} != ${expected}`
);

test('the ladder is one deterministic ring whose first eight rungs are the cross', () => {
    assert.equal(MYSTIC_SLOT_NAMES.length, MYSTIC_MAX_TILES);
    assert.equal(new Set(MYSTIC_SLOT_NAMES).size, MYSTIC_MAX_TILES);
    assert.deepEqual(MYSTIC_SLOT_NAMES.slice(0, 8), [
        'east', 'west', 'north', 'south', 'northWest', 'northEast', 'southWest', 'southEast'
    ]);
    // The Atom handle owns the middle: no rung is ever the centre cell.
    assert.equal(MYSTIC_SLOTS.some((slot) => slot.dx === 0 && slot.dy === 0), false);
    assert.equal(resolveMysticSlotIndex('northWest'), 4);
    assert.equal(resolveMysticSlotIndex('center'), -1);
    assert.equal(resolveMysticSlot('center'), null);
    assert.equal(resolveMysticSlots(0).length, 0);
    assert.equal(resolveMysticSlots(-4).length, 0);
    assert.equal(resolveMysticSlots(500).length, MYSTIC_MAX_TILES);
    assert.deepEqual(resolveMysticSlots(2.4).map((slot) => slot.name), ['east', 'west']);
    const square = resolveMysticGrid(resolveMysticSlots(8));
    assert.deepEqual([square.columns, square.rows, square.count, square.radius], [3, 3, 8, 1]);
    const star = resolveMysticGrid(resolveMysticSlots(24));
    assert.deepEqual([star.columns, star.rows, star.count, star.radius], [5, 5, 24, 2]);
    assert.deepEqual(resolveMysticGrid([]).columns, 3);
});

test('the shape follows the rungs the entries occupy, never their count', () => {
    const ring = place(8, 600, 400);
    assert.deepEqual([ring.columns, ring.rows, ring.count], [3, 3, 8]);
    const star = place(9, 600, 400);
    assert.deepEqual([star.columns, star.rows, star.count], [5, 5, 9]);
    // The room a caller reserves before opening is the ATOM's own cell, and
    // nothing more: it is the cell under the finger, and the block is built around
    // it, never centred on a margin computed from the block.
    assert.equal(resolveMysticLayoutMargin({ tileSize: TILE }), TILE / 2);
    assert.equal(resolveMysticLayoutMargin({ tileSize: TILE }), ring.margin);
});

test('the canonical desktop set owns one rung each, and only the Atom sits in the middle', () => {
    assert.deepEqual(DESKTOP_KEYS, [
        'capture', 'import', 'communicate', 'create', 'new_project',
        'copy', 'paste', 'delete', 'play', 'utilities', 'info', 'activity'
    ]);
    // The compass anchors the taxonomy declares, word for word: the rest of the
    // list fills the free rungs in the order the list gave them.
    assert.deepEqual(MYSTIC_FIXED_ITEMS.filter(entry => entry.slot).map(entry => `${entry.key}:${entry.slot}`),
        ['capture:east', 'import:north', 'communicate:west', 'create:south', 'new_project:southEast',
            'copy:northWest', 'paste:northEast', 'delete:southWest', 'play:eastOuter',
            'utilities:northOuter', 'info:westOuter', 'activity:southOuter']);
    MYSTIC_FIXED_ITEMS.filter(entry => entry.slot).forEach((entry) => {
        assert.ok(resolveMysticSlotIndex(entry.slot) >= 0, `${entry.key} -> ${entry.slot}`);
    });
    // No command is listed twice, and every key of the desktop set is its own.
    assert.equal(new Set(DESKTOP_KEYS).size, DESKTOP_KEYS.length);
    DESKTOP_KEYS.forEach((key) => {
        assert.equal(MYSTIC_ITEM_SLOTS[key] || '', resolveMysticItemSlot({ key }), key);
    });
    const routed = resolveMysticMenuLayout(RING_ITEMS);
    const slotOf = (key) => routed.tiles.find((tile) => tile.item.key === key)?.slot.name;
    // The ring fills EVERY rung of the 3×3, and each key lands on its own.
    assert.equal(routed.tiles.length, 8);
    assert.equal(routed.overflow.length, 0);
    assert.deepEqual([...routed.tiles.map((tile) => tile.slot.name)].sort(), [...MYSTIC_SLOT_NAMES.slice(0, 8)].sort());
    assert.equal(slotOf('capture'), 'east');
    assert.equal(slotOf('communicate'), 'west');
    assert.equal(slotOf('create'), 'south');
    // The Atom entry is the handle, never a tile.
    assert.equal(routed.center.key, 'ai');
    assert.equal(routed.tiles.some((tile) => tile.item.key === 'ai'), false);
    assert.equal(isMysticCenterItem({ key: 'ai' }), true);
    assert.equal(MYSTIC_CENTER_SLOT, 'center');
    assert.equal(resolveMysticItemSlot({ key: 'unsupported' }), '');
    assert.equal(resolveMysticCenterItem([]), MYSTIC_CENTER_FALLBACK);
    // A context with no Atom entry still gets its handle in the middle.
    assert.equal(resolveMysticMenuLayout(RING_ITEMS.slice(0, 4)).center, null);
});

test('the extras fill the free rungs in the order the context gave them, and the overflow is reported', () => {
    const many = items(...Array.from({ length: 30 }, (_, index) => `extra_${index}`));
    const routed = resolveMysticMenuLayout(many);
    assert.equal(routed.tiles.length, MYSTIC_MAX_TILES);
    assert.equal(routed.overflow.length, 30 - MYSTIC_MAX_TILES);
    assert.deepEqual(
        routed.tiles.map((tile) => tile.item.key),
        many.slice(0, MYSTIC_MAX_TILES).map((entry) => entry.key)
    );
    // A second entry on a rung that is already taken takes the first free one.
    const duplicated = resolveMysticMenuLayout(items('capture', 'capture', 'capture'));
    assert.deepEqual(duplicated.tiles.map((tile) => tile.slot.name), ['east', 'west', 'north']);
    assert.equal(duplicated.overflow.length, 0);
});

test('the table keeps the common tool seam and its eight canonical cells at the centre', () => {
    const layout = place(8, 600, 400);
    assert.equal(MYSTIC_TILE_GAP_PX, EVE_SKIN_TOKENS.tool.bevyMenu.toolGapPx);
    const neighbourGap = (slotA, slotB) => {
        const a = pointOf(layout, slotA);
        const b = pointOf(layout, slotB);
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) - TILE;
    };
    assert.equal(neighbourGap('north', 'northWest'), MYSTIC_TILE_GAP_PX);
    assert.equal(neighbourGap('east', 'southEast'), MYSTIC_TILE_GAP_PX);
    // The 3×3 is full: eight rungs plus the Atom's own cell, no hole in the table.
    assert.deepEqual(cells(layout), [
        '-1,-1', '-1,0', '-1,1', '0,-1', '0,1', '1,-1', '1,0', '1,1'
    ]);
    assert.equal(insideSurface(layout), true);
});

test('edges and corners keep the activation point and reorganise whole rows and columns', () => {
    for (const [x, y] of [[0, 400], [1200, 400], [600, 0], [600, 800], [0, 0], [1200, 0], [0, 800], [1200, 800]]) {
        const layout = place(8, x, y);
        assert.deepEqual(layout.center, { x, y });
        assert.equal(new Set(cells(layout)).size, 8, 'every tool keeps a distinct cell');
        for (const axis of ['dx', 'dy']) {
            const groups = new Map();
            for (const slot of resolveMysticSlots(8)) {
                const landed = tileOf(layout, slot.name)[axis];
                if (groups.has(slot[axis])) assert.equal(landed, groups.get(slot[axis]));
                groups.set(slot[axis], landed);
            }
        }
        assert.equal(insideSurface(layout), true);
        assert.deepEqual(layout, place(8, x, y));
    }
});

test('outer rings retain every tool at its original size in distinct visible cells', () => {
    for (const count of [9, 11, 12, 24]) {
        const center = place(count, 600, 400);
        const edge = place(count, 0, 0);
        assert.deepEqual(edge.center, { x: 0, y: 0 });
        assert.deepEqual(edge.tiles.map(tile => tile.slot), center.tiles.map(tile => tile.slot));
        assert.equal(new Set(cells(edge)).size, count);
        assert.ok(edge.tiles.every(tile => tile.size === TILE && tile.radius === TILE / 2));
        assert.equal(insideSurface(edge), true);
    }
});

test('tools stay on the surface while the centre remains exactly at the opening point', () => {
    for (const count of [1, 8, 9, 11, 16, 24]) {
        for (const [x, y] of [[0, 0], [RECT.width, 0], [0, RECT.height], [RECT.width, RECT.height], [15, 785]]) {
            const layout = place(count, x, y);
            assert.equal(insideSurface(layout), true, `${count} tiles opened at ${x},${y}`);
            assert.deepEqual(layout.center, { x, y });
        }
    }
    // Oversized input must be paginated by the menu owner before placement.
    assert.throws(() => place(8, 20, 20, { surface: { width: 120, height: 120 } }), /mystic_viewport_capacity_exceeded/);
    // ...and a table that fits is never centred, however tight it is.
    const tight = place(8, 20, 20, { surface: { width: 260, height: 260 } });
    assert.deepEqual(tight.centred, { x: false, y: false });
    assert.equal(insideSurface(tight, { width: 260, height: 260 }), true);
});

test('the wave is one law: a quarter of a turn between two plates, 800 ms a turn, 600 ms for the nearest', () => {
    const layout = place(8, 600, 400);
    const plan = planMysticTiles({ tiles: layout.tiles });
    const near = plan.tiles.find((tile) => tile.slot === 'east');
    const far = plan.tiles.find((tile) => tile.slot === 'northEast');
    assert.equal(near.ring, 0);
    assert.equal(near.delayMs, 0);
    assert.equal(near.durationMs, MYSTIC_FLIP_CENTRAL_DURATION_MS);
    assert.equal(far.durationMs, MYSTIC_FLIP_DURATION_MS);
    // The law the user asked for, read off the plan: the second plate leaves when
    // the first is a quarter over, the third when the second is, and so on — a
    // quarter of the PREVIOUS turn, never a shared constant, and never "entirely
    // after". Four turns of 600 ms then four of 800 ms carry the eight plates.
    const byRank = (list) => list.slice().sort((left, right) => left.rank - right.rank);
    const wave = byRank(plan.tiles);
    assert.deepEqual(wave.map((tile) => tile.rank), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(wave.map((tile) => tile.durationMs), [600, 600, 600, 600, 800, 800, 800, 800]);
    assert.deepEqual(wave.map((tile) => tile.delayMs), [0, 150, 300, 450, 600, 800, 1000, 1200]);
    wave.forEach((tile, position) => {
        if (position === 0) return;
        const previous = wave[position - 1];
        closeTo(tile.delayMs - previous.delayMs, previous.durationMs * MYSTIC_FLIP_STAGGER_RATIO, `${tile.slot} waits a quarter of ${previous.slot}`);
        // ...which is exactly the instant the previous plate is a quarter over. The
        // gap IS that quarter of its turn; the ease only softens what the quarter
        // looks like, it never moves the instant.
        closeTo((tile.delayMs - previous.delayMs) / previous.durationMs, MYSTIC_FLIP_STAGGER_RATIO, `${tile.slot} starts a quarter into ${previous.slot}`);
        const atStart = resolveMysticTileFlipProgress({
            elapsedMs: tile.delayMs, delayMs: previous.delayMs, durationMs: previous.durationMs
        });
        assert.ok(atStart > 0.2 && atStart < 0.3, `${previous.slot} is about a quarter over when ${tile.slot} starts (${atStart})`);
    });
    // The menu is over when the LAST turn is: not when a shared constant says so.
    const last = wave[wave.length - 1];
    closeTo(plan.totalMs, last.delayMs + last.durationMs, 'the menu ends with its last tile');
    assert.ok(plan.totalMs < plan.tiles.length * MYSTIC_FLIP_DURATION_MS, 'the cascade overlaps, it does not queue');
    // Opening walks outwards, closing walks back: the tile that landed last leaves
    // first, and the wave ends on the tile nearest the centre.
    const closing = planMysticTiles({ tiles: layout.tiles, closing: true });
    const nearClosing = closing.tiles.find((tile) => tile.slot === 'east');
    const farClosing = closing.tiles.find((tile) => tile.slot === 'northEast');
    const closingWave = byRank(closing.tiles);
    assert.equal(closingWave[0].slot, 'southEast', 'the plate that landed last is the one that leaves first');
    assert.equal(closingWave[0].delayMs, 0);
    assert.ok(nearClosing.delayMs > farClosing.delayMs);
    // Closing is the same law read backwards: every gap is still a quarter of the
    // turn that precedes it in ITS order.
    closingWave.forEach((tile, position) => {
        if (position === 0) return;
        const previous = closingWave[position - 1];
        closeTo(tile.delayMs - previous.delayMs, previous.durationMs * MYSTIC_FLIP_STAGGER_RATIO, `closing ${tile.slot}`);
    });
    // Reduced motion keeps the law with no propagation at all.
    const reduced = planMysticTiles({ tiles: layout.tiles, reducedMotion: true });
    assert.deepEqual(reduced.tiles.map((tile) => tile.delayMs), layout.tiles.map(() => 0));
});

test('the requested opening length rescales the wave by one factor and never rewrites its law', () => {
    const layout = place(8, 600, 400);
    const waveOf = (plan) => plan.tiles.slice().sort((left, right) => left.rank - right.rank);
    const natural = planMysticTiles({ tiles: layout.tiles });
    const naturalWave = waveOf(natural);
    assert.equal(natural.totalMs, 2000);
    // Le reglage du panneau Home est une SEULE longueur : la forme de la loi —
    // quelles plaques tournent 600 ms, lesquelles 800, et le quart de tour qui les
    // fait se chevaucher — doit survivre a n'importe quelle duree demandee.
    const asked = planMysticTiles({ tiles: layout.tiles, openingMs: 3000 });
    assert.equal(asked.totalMs, 3000);
    const askedWave = waveOf(asked);
    assert.deepEqual(askedWave.map((tile) => tile.durationMs), [900, 900, 900, 900, 1200, 1200, 1200, 1200]);
    assert.deepEqual(askedWave.map((tile) => tile.delayMs), [0, 225, 450, 675, 900, 1200, 1500, 1800]);
    askedWave.forEach((tile, position) => {
        if (position === 0) return;
        const previous = askedWave[position - 1];
        closeTo(tile.delayMs - previous.delayMs, previous.durationMs * MYSTIC_FLIP_STAGGER_RATIO, `scaled ${tile.slot}`);
        closeTo(tile.durationMs / naturalWave[position].durationMs, asked.totalMs / natural.totalMs, `scaled ${tile.slot} keeps its share`);
        closeTo(tile.delayMs / naturalWave[position].delayMs, asked.totalMs / natural.totalMs, `scaled ${tile.slot} keeps its wait`);
    });
    // Les deux bornes du reglage, et les demandes qui n'en sont pas une : une
    // duree absente, nulle, negative ou non numerique garde la longueur de la loi.
    assert.equal(planMysticTiles({ tiles: layout.tiles, openingMs: 300 }).totalMs, 300);
    assert.equal(planMysticTiles({ tiles: layout.tiles, openingMs: 6000 }).totalMs, 6000);
    assert.equal(planMysticTiles({ tiles: layout.tiles, openingMs: 0 }).totalMs, natural.totalMs);
    assert.equal(planMysticTiles({ tiles: layout.tiles, openingMs: -500 }).totalMs, natural.totalMs);
    assert.equal(planMysticTiles({ tiles: layout.tiles, openingMs: 'x' }).totalMs, natural.totalMs);
    // Le mouvement reduit est une reponse d'accessibilite, pas une duree : la
    // demande ne le rallonge jamais.
    const reduced = planMysticTiles({ tiles: layout.tiles, reducedMotion: true, openingMs: 6000 });
    assert.deepEqual(reduced.tiles.map((tile) => tile.delayMs), layout.tiles.map(() => 0));
    assert.equal(reduced.tiles.every((tile) => tile.durationMs === MYSTIC_FLIP_REDUCED_DURATION_MS), true);
});

test('no two plates ever share a rank, and the ladder is walked before the ring', () => {
    const layout = place(8, 600, 400);
    const ranks = resolveMysticWaveRanks(layout.tiles);
    assert.deepEqual(ranks.slice().sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6, 7]);
    // The cross is the ring the Atom stands on, the diagonals are one cell out:
    // the ladder order is the wave order, so the cascade leaves the Atom outwards
    // and never turns the cross and a diagonal of the same ring together.
    const order = layout.tiles
        .map((tile, index) => ({ name: tile.slot, rank: ranks[index] }))
        .sort((left, right) => left.rank - right.rank)
        .map((entry) => entry.name);
    assert.deepEqual(order, ['east', 'west', 'north', 'south', 'northWest', 'northEast', 'southWest', 'southEast']);
    // A tile the ladder never routed — a submenu's Back, a corolla petal — keeps the
    // ring of its OWN cell and the order the menu asked for: a stray sitting on the
    // centre cell leads the wave, and the routed plates follow on their ladder. The
    // one law that never bends is that no two tiles share a rank.
    const strayRanks = resolveMysticWaveRanks([
        ...layout.tiles,
        { slot: '', dx: 0, dy: 0, distance: 0 },
        { slot: '', dx: 0, dy: 0, distance: 0 }
    ]);
    assert.equal(new Set(strayRanks).size, strayRanks.length);
    assert.deepEqual(strayRanks.slice(8), [0, 1]);
    assert.deepEqual(strayRanks.slice(0, 8).slice().sort((left, right) => left - right), [2, 3, 4, 5, 6, 7, 8, 9]);
});

test('a plate answers the pointer when its OWN turn is over, never with the last one', () => {
    const layout = place(8, 600, 400);
    const plan = planMysticTiles({ tiles: layout.tiles });
    const wave = plan.tiles.slice().sort((left, right) => left.rank - right.rank);
    const first = wave[0];
    const last = wave[wave.length - 1];
    const sampleAt = (elapsedMs) => sampleMysticMotion({
        phase: MYSTIC_PHASE.opening,
        elapsedMs,
        targets: targetsFor(geometryFor(RING_ITEMS))
    });
    const at = sampleAt;
    // The first plate is usable the instant its own glyph appears, while the last
    // one is still waiting for its turn: the gate is per tile, not for the menu.
    const early = at(first.delayMs + first.durationMs + 1);
    const earlyIds = [...early.frames.keys()];
    assert.equal(earlyIds.length > 0, true);
    assert.equal(earlyIds.some((id) => mysticInteractionReady({ sample: early, nodeId: id })), true);
    assert.equal(earlyIds.some((id) => !mysticInteractionReady({ sample: early, nodeId: id })), true);
    // Nothing answers before the wave has even started.
    assert.equal(earlyIds.every((id) => !mysticInteractionReady({ sample: at(0), nodeId: id })), true);
    // And a node the wave never carried follows the menu's own end.
    assert.equal(mysticInteractionReady({ sample: at(0), nodeId: '__nothing__' }), false);
    assert.equal(mysticInteractionReady({ sample: at(last.delayMs + last.durationMs), nodeId: '__nothing__' }), true);
});

test('every tile reads the one clock of the menu, and a tile nobody turned paints nothing', () => {
    const layout = place(8, 600, 400);
    const plan = planMysticTiles({ tiles: layout.tiles });
    const at = (elapsedMs, closing = false) => resolveMysticTiles({
        plan: planMysticTiles({ tiles: layout.tiles, closing }), elapsedMs, closing
    });
    assert.deepEqual(at(0).map((tile) => tile.progress), layout.tiles.map(() => 0));
    assert.deepEqual(at(plan.totalMs).map((tile) => tile.progress), layout.tiles.map(() => 1));
    assert.deepEqual(at(plan.totalMs + 500).map((tile) => tile.progress), layout.tiles.map(() => 1));
    const mid = at(plan.totalMs / 2);
    const near = mid.find((tile) => tile.slot === 'east');
    const far = mid.find((tile) => tile.slot === 'northEast');
    assert.ok(near.progress > far.progress && far.progress > 0, 'the wave is monotone');
    assert.equal(at(0, true).every((tile) => tile.progress === 1), true);
    assert.equal(at(plan.totalMs, true).every((tile) => tile.progress === 0), true);
    // 0 = the workspace behind, 1 = the menu plate.
    assert.equal(resolveMysticTileFlipProgress({ elapsedMs: 0, delayMs: 0, durationMs: 100 }), 0);
    assert.equal(resolveMysticTileFlipProgress({ elapsedMs: 100, delayMs: 0, durationMs: 100 }), 1);
    assert.equal(resolveMysticTileFlipProgress({ elapsedMs: 0, delayMs: 0, durationMs: 100, closing: true }), 1);
    assert.equal(resolveMysticTileFlipProgress({ elapsedMs: 100, delayMs: 0, durationMs: 100, closing: true }), 0);
    // The ease is the demo's: slow at both ends, and symmetric.
    assert.equal(resolveMysticFlipEase(0), 0);
    assert.equal(resolveMysticFlipEase(1), 1);
    closeTo(resolveMysticFlipEase(0.5), 0.5, 'the ease is symmetric');
    closeTo(resolveMysticFlipEase(MYSTIC_FLIP_EASE_PLATEAU), MYSTIC_FLIP_EASE_PLATEAU / (2 * (1 - MYSTIC_FLIP_EASE_PLATEAU)), 'the shoulder');
    for (const u of [0.1, 0.25, 0.4, 0.6, 0.9]) {
        closeTo(resolveMysticFlipEase(u) + resolveMysticFlipEase(1 - u), 1, `ease(${u})`);
    }
    assert.ok(resolveMysticFlipEase(0.5) > resolveMysticFlipEase(0.4));
    // A tile waiting for its turn is not part of the menu yet: the tree keeps its
    // glyph hidden and the material paints nothing there. The one-tile law says how
    // long THIS plate turns and where the wave puts it — the delay is a fact of the
    // wave, handed out by the plan, and cannot be read off one tile alone.
    const timeline = resolveMysticTileTimeline({ distance: 2, minDistance: 1, maxDistance: 2, rank: 1 });
    assert.equal(timeline.rank, 1);
    assert.equal(timeline.durationMs, MYSTIC_FLIP_DURATION_MS);
    assert.equal('delayMs' in timeline, false);
    // The plate the Atom stands on is the quicker one, and closing reads the very
    // same rank backwards.
    assert.equal(resolveMysticTileTimeline({ distance: 1, minDistance: 1, maxDistance: 2, rank: 3 }).durationMs, MYSTIC_FLIP_CENTRAL_DURATION_MS);
    assert.equal(resolveMysticTileTimeline({ distance: 1, minDistance: 1, maxDistance: 2, rank: 1, lastRank: 5, closing: true }).rank, 4);
    // The stagger helper is the law itself, on a list of turns: each start is the
    // running sum of a quarter of every turn before it.
    assert.deepEqual(resolveMysticStaggerDelays([600, 600, 600, 600, 800]), [0, 150, 300, 450, 600]);
    assert.deepEqual(resolveMysticStaggerDelays([]), []);
});

test('a tile turns about the axis that separates it from the centre, toward the centre', () => {
    const at = (point, name) => resolveMysticTileAt({
        name, slot: name, point, center: [600, 400], size: TILE, step: TILE
    });
    const east = at([660, 400], 'east');
    assert.deepEqual([east.dx, east.dy, east.axis, east.axisId, east.direction], [1, 0, 'y', 1, -1]);
    const west = at([540, 400], 'west');
    assert.deepEqual([west.dx, west.direction, west.axis], [-1, 1, 'y']);
    const north = at([600, 340], 'north');
    assert.deepEqual([north.dy, north.axis, north.axisId, north.direction], [-1, 'x', 0, -1]);
    const south = at([600, 460], 'south');
    assert.deepEqual([south.dy, south.direction, south.axis], [1, 1, 'x']);
    assert.equal(resolveMysticTileRadius({ roundness: 1, tileSize: TILE }), TILE / 2);
    assert.equal(resolveMysticTileRadius({ roundness: 0, tileSize: TILE }), 0);
});

test('the mystic tree carries one tile per entry and the Atom handle alone in the middle', () => {
    const geometry = geometryFor(STAR_ITEMS);
    assert.equal(geometry.mystic, true);
    assert.equal(geometry.placements.length, 9);
    assert.deepEqual(geometry.placements.map((placement) => placement.mystic.slot), MYSTIC_SLOT_NAMES.slice(0, 9));
    assert.equal(MYSTIC_TILE_ROUNDNESS, 0.5);
    assert.equal(geometry.radius, TILE * MYSTIC_TILE_ROUNDNESS / 2, 'the product tiles are half-rounded');
    assert.equal(geometry.contentScale, 1);
    assert.equal(geometry.centerItem.key, 'ai');
    const tree = buildBevyUiMysticTree({ geometry });
    const centre = tree.root.children.find((child) => child.id === BEVY_MYSTIC_CENTER_ID);
    assert.ok(centre, 'the Atom handle is mounted');
    // The handle is a disc, smaller than a tile, and its shadow is mounted
    // invisible: the runtime is the only writer of that alpha.
    assert.equal(geometry.centerSize, Math.round(TILE * MYSTIC_CENTER_SIZE_RATIO));
    assert.equal(geometry.centerRadius, geometry.centerSize / 2);
    assert.ok(geometry.centerSize < TILE, 'the handle keeps its distance from the tiles');
    assert.deepEqual(centre.style.size, [geometry.centerSize, geometry.centerSize]);
    assert.equal(centre.style.radius, geometry.centerRadius, 'the handle is a disc, not a rounded tile');
    assert.deepEqual(centre.style.shadow.color, [0, 0, 0, 0]);
    assert.equal(centre.style.shadow.blur, EVE_MYSTIC_SKIN_TOKENS.center.shadow.blur);
    assert.equal(centre.style.shadow.spread, EVE_MYSTIC_SKIN_TOKENS.center.shadow.spread);
    assert.deepEqual(centre.style.shadow.offset, [...EVE_MYSTIC_SKIN_TOKENS.center.shadow.offset]);
    assert.deepEqual(centre.style.background, [...MYSTIC_CENTER_PLATE]);
    assert.deepEqual(centre.children[0].image.tint, [...MYSTIC_CENTER_TINT]);
    assert.equal(centre.children[0].image.source.endsWith('atome.svg'), true);
    assert.deepEqual(centre.children[0].style.size, [SYSTEM_UI_METRICS.scalePx(26), SYSTEM_UI_METRICS.scalePx(26)]);
});

test('the Atom handle is a disc at any tile size, and never a rounded tile', () => {
    const metrics = resolveMysticCenterMetrics({ tileSize: TILE });
    assert.equal(MYSTIC_CENTER_SIZE_RATIO, 0.9);
    assert.equal(metrics.size, 54);
    assert.equal(metrics.radius, 27);
    // The rule is the ratio, not a pixel: a bigger menu carries the same disc.
    assert.deepEqual(resolveMysticCenterMetrics({ tileSize: 80 }), { size: 72, radius: 36 });
    assert.ok(metrics.size < TILE, 'the handle leaves the tiles their air');
    assert.ok(resolveMysticCenterMetrics({ tileSize: 80 }).size < 80);
    // The tile roundness never reaches the handle: asking for a square still
    // yields a disc, which is the whole point of the centre.
    assert.equal(resolveMysticTileRadius({ roundness: 0, tileSize: TILE }), 0);
    assert.equal(metrics.radius, metrics.size / 2);
});

test('the centre shadow lands after the cascade, and leaves in one op', () => {
    const clock = { now: 0, nextId: 0, frames: new Map() };
    const applied = [];
    const fade = createMysticShadowFade({
        requestFrame: (callback) => {
            clock.nextId += 1;
            clock.frames.set(clock.nextId, callback);
            return clock.nextId;
        },
        cancelFrame: (id) => { clock.frames.delete(id); },
        apply: (alpha) => applied.push(alpha),
        reducedMotionResolver: () => false,
        durationMs: MYSTIC_SHADOW_FADE_MS,
        now: () => clock.now
    });
    const runFrame = () => {
        const pending = clock.frames.entries().next();
        if (pending.done) return false;
        const [id, callback] = pending.value;
        clock.frames.delete(id);
        callback(clock.now);
        return true;
    };
    assert.equal(MYSTIC_SHADOW_FADE_MS, 330);
    assert.equal(fade.alpha(), 0);
    assert.deepEqual(applied, [], 'nothing is painted while the menu turns');
    fade.start();
    assert.deepEqual(applied, [], 'the first frame is the one that paints');
    clock.now = MYSTIC_SHADOW_FADE_MS / 2;
    assert.equal(runFrame(), true);
    closeTo(fade.alpha(), 0.875, 'half-way through an ease-out fade');
    assert.ok(fade.alpha() < 1, 'the shadow does not pop in');
    clock.now = MYSTIC_SHADOW_FADE_MS;
    assert.equal(runFrame(), true);
    assert.equal(fade.alpha(), 1);
    assert.equal(clock.frames.size, 0, 'the fade stops itself once it has landed');
    // A re-render remounts the handle at rest: the live alpha is put back.
    fade.reapply();
    assert.equal(applied.at(-1), 1);
    // Closing, or turning the menu, drops it immediately, in one op.
    fade.clear();
    assert.equal(fade.alpha(), 0);
    assert.equal(applied.at(-1), 0);
    assert.equal(clock.frames.size, 0);
    // A fade cut in the middle is cancelled, not resumed.
    fade.start();
    clock.now += 100;
    assert.equal(runFrame(), true);
    assert.ok(fade.alpha() > 0 && fade.alpha() < 1);
    fade.clear();
    assert.equal(applied.at(-1), 0);
    clock.now += 1000;
    assert.equal(runFrame(), false, 'the cancelled fade never ticks again');
    assert.equal(fade.alpha(), 0);
    // Reduced motion takes the shadow in one op, and schedules nothing.
    const reducedApplied = [];
    const reduced = createMysticShadowFade({
        requestFrame: () => { throw new Error('reduced motion must not schedule a frame'); },
        cancelFrame: () => {},
        apply: (alpha) => reducedApplied.push(alpha),
        reducedMotionResolver: () => true,
        durationMs: MYSTIC_SHADOW_FADE_MS,
        now: () => 0
    });
    reduced.start();
    assert.equal(reduced.alpha(), 1);
    assert.deepEqual(reducedApplied, [1]);
});

test('the wave turns the plates where they stand, and a glyph arrives with its own tile', () => {
    const geometry = geometryFor(STAR_ITEMS);
    const targets = targetsFor(geometry);
    assert.equal(targets.length, 9);
    assert.equal(targets.every((target) => target.tile), true);
    const at = (elapsedMs, phase = 'opening') => sampleMysticMotion({ phase, elapsedMs, targets });
    const start = at(0);
    const end = at(9999);
    assert.equal(start.done, false);
    assert.equal(end.done, true);
    assert.equal(start.tiles.length, 9);
    assert.equal(start.frames.size, 9);
    for (const target of targets) {
        const frame = end.frames.get(target.nodeId);
        // No travel at all: the plate is already where it belongs.
        assert.deepEqual(frame.position, target.finalPosition.slice(0, 2));
        assert.equal(frame.opacity, 1);
        assert.equal(frame.flip, 1);
    }
    // The menu is really over when its own plan says so, and not before.
    const plan = planMysticTiles({ tiles: start.tiles });
    assert.equal(at(plan.totalMs).done, true);
    assert.equal(at(plan.totalMs - 1).done, false);
    // Le meme plan, demande plus long : l'echantillonneur suit la duree demandee,
    // et le dernier instant avant la fin n'est jamais deja fini.
    const slowedPlan = planMysticTiles({ tiles: start.tiles, openingMs: 6000 });
    assert.ok(slowedPlan.totalMs > plan.totalMs, 'une ouverture demandee plus longue dure plus longtemps');
    const slowedAt = (elapsedMs) => sampleMysticMotion({ phase: 'opening', elapsedMs, targets, openingMs: 6000 });
    assert.equal(slowedAt(slowedPlan.totalMs).done, true);
    assert.equal(slowedAt(slowedPlan.totalMs - 1).done, false);
    const far = targets.find((target) => target.tile.slot === 'eastOuter');
    const near = targets.find((target) => target.tile.slot === 'north');
    // The delay belongs to the TILE the wave planned, not to the target the tree
    // mounted: the sample is the only thing that carries the timeline.
    const farTile = start.tiles.find((tile) => tile.slot === 'eastOuter');
    const waiting = at(farTile.delayMs - 5);
    assert.equal(waiting.frames.get(far.nodeId).flip, 0);
    assert.equal(waiting.frames.get(far.nodeId).opacity, 1);
    const turning = at(farTile.delayMs + (MYSTIC_FLIP_DURATION_MS / 2));
    assert.ok(turning.frames.get(far.nodeId).flip > 0);
    assert.ok(turning.frames.get(near.nodeId).flip > turning.frames.get(far.nodeId).flip);
    assert.equal(MYSTIC_GLYPH_START, 1);
    // Closing starts from the plate that landed last and ends on the bare workspace.
    const closingPlan = planMysticTiles({ tiles: start.tiles, closing: true });
    assert.equal(at(0, 'closing').done, false);
    assert.equal(at(closingPlan.totalMs, 'closing').done, true);
    assert.equal(at(0, 'closing').frames.get(near.nodeId).flip, 1);
    assert.equal(at(closingPlan.totalMs, 'closing').frames.get(near.nodeId).flip, 0);
});

test('the material packs the tiles once, in one order, and flips y for the bottom origin', () => {
    const layout = place(8, 600, 400);
    const uniforms = buildMysticSurfaceUniforms({ tiles: layout.tiles, width: RECT.width, height: RECT.height });
    assert.equal(uniforms.mode, INTUITION_MYSTIC_MODE);
    assert.deepEqual(uniforms.surface_size, [RECT.width, RECT.height]);
    // `mystic_count.y` is the HOLE: the menu plate laid flat in the cell a turning
    // plate leaves behind.
    assert.deepEqual(uniforms.mystic_count.slice(0, 2), [8, MYSTIC_HOLE_DOSE]);
    // The edge softness is capped on the seam this frame really has, so a plate's
    // anti-aliasing can never reach the middle of the gap between two cells.
    assert.deepEqual(uniforms.mystic_style, [
        MYSTIC_PERSPECTIVE_TILES, 1, 0,
        resolveMysticEdgeSoftness(MYSTIC_TILE_GAP_PX)
    ]);
    for (const key of ['mystic_tiles', 'mystic_tile_motion', 'mystic_tile_colors']) {
        assert.equal(uniforms[key].length, MYSTIC_MAX_TILES, key);
    }
    const index = layout.tiles.findIndex((tile) => tile.slot === 'east');
    const tile = layout.tiles[index];
    assert.deepEqual(uniforms.mystic_tiles[index], [
        tile.point[0], RECT.height - tile.point[1], TILE / 2, tile.radius
    ]);
    assert.deepEqual(uniforms.mystic_tile_motion[index], [0, 1, -1, 0]);
    // The colour belongs to the TOOL's family (shared/tool_family.js), never to
    // the rung it landed on; a tile that names no family is a system tile.
    assert.deepEqual(uniforms.mystic_tile_colors[index], [...resolveMysticFamilyColor('system')]);
    const familied = buildMysticSurfaceUniforms({
        tiles: layout.tiles.map((entry, i) => (i === index ? { ...entry, family: 'creation' } : entry)),
        width: RECT.width, height: RECT.height
    });
    assert.deepEqual(familied.mystic_tile_colors[index], [...resolveMysticFamilyColor('creation')]);
    assert.notDeepEqual(resolveMysticFamilyColor('creation'), resolveMysticFamilyColor('modification'));
    // The padding is never painted: the shader only walks `mystic_count.x` tiles.
    assert.deepEqual(uniforms.mystic_tiles[MYSTIC_MAX_TILES - 1], [0, 0, 0, 0]);
    // A frame pushed by the wave is the same shape as the one pushed at rest.
    const plan = planMysticTiles({ tiles: layout.tiles });
    const turning = buildMysticSurfaceUniforms({
        tiles: resolveMysticTiles({ plan, elapsedMs: plan.totalMs / 2 }),
        width: RECT.width, height: RECT.height
    });
    assert.deepEqual(turning.mystic_tiles, uniforms.mystic_tiles);
    assert.equal(turning.mystic_tile_motion[index][0] > 0, true);
    // The four plates of the cross do NOT turn together: the cascade leaves them
    // one after the other, so at one instant their progresses are four different
    // values, in the ladder order — that IS the pattern the user asked to see. Read
    // at 500 ms, where the four plates of the cross are all mid-turn.
    const cascade = buildMysticSurfaceUniforms({
        tiles: resolveMysticTiles({ plan, elapsedMs: 500 }),
        width: RECT.width, height: RECT.height
    });
    const cross = layout.tiles.map((entry, at) => [entry.slot, cascade.mystic_tile_motion[at][0]])
        .filter(([slot]) => ['east', 'west', 'north', 'south'].includes(slot));
    assert.equal(new Set(cross.map(([, progress]) => progress)).size, cross.length);
    assert.deepEqual(cross.map(([, progress]) => progress > 0), [true, true, true, true]);
    assert.equal(cross[0][1] > cross[1][1] && cross[1][1] > cross[2][1] && cross[2][1] > cross[3][1], true);
    assert.deepEqual(turning.mystic_tile_colors, uniforms.mystic_tile_colors);
});

test('Mystic plates carry common glass with no second family tint', () => {
    const layout=place(8,600,400);
    const uniforms=buildMysticSurfaceUniforms({tiles:layout.tiles,width:RECT.width,height:RECT.height});
    assert.deepEqual(uniforms.assistant_background_tint,[...MYSTIC_GLASS_TINT]);
    assert.equal(uniforms.assistant_background_tint[3],.69);
    assert.equal(uniforms.background_blur_px,16);
    for(const family of ['cross','orange','blue']) assert.deepEqual(resolveMysticFamilyColor(family),[0,0,0,0]);
});

test('the projection carries the mystic material and names the array it rejects', () => {
    const layout = place(9, 600, 400);
    const uniforms = buildMysticSurfaceUniforms({ tiles: layout.tiles, width: RECT.width, height: RECT.height });
    // The round trip the renderer really takes: material -> projection -> material.
    const normalized = proceduralPatch({ morph: [1, 1, 0, 0], ...uniforms });
    assert.deepEqual(normalized.mystic_tiles, uniforms.mystic_tiles);
    assert.deepEqual(normalized.mystic_tile_motion, uniforms.mystic_tile_motion);
    assert.deepEqual(normalized.mystic_tile_colors, uniforms.mystic_tile_colors);
    assert.deepEqual(normalized.mystic_count, uniforms.mystic_count);
    assert.deepEqual(normalized.mystic_style, uniforms.mystic_style);
    // A flat or liquid surface carries the fields at rest, and nothing else changed.
    const minimal = proceduralPatch({ morph: [1, 1, 0, 0] });
    assert.deepEqual(minimal.mystic_count, [0, 0, 0, 0]);
    assert.equal(minimal.mystic_tiles.length, MYSTIC_MAX_TILES);
    assert.equal(minimal.mystic_tiles.every((row) => row.every((component) => component === 0)), true);
    assert.equal(minimal.surface_parameters.length, MYSTIC_MAX_TILES);
    // One faulty entry names its own array: the diagnostic cannot be ambiguous.
    assert.throws(
        () => proceduralPatch({ morph: [1, 1, 0, 0], mystic_tiles: [[1, 2, 3]] }),
        /bevy_projection_procedural_sdf_mystic_tiles_invalid:menu_ground/
    );
    assert.throws(
        () => proceduralPatch({ morph: [1, 1, 0, 0], mystic_tile_motion: [[1, 2, 3, 4, 5]] }),
        /bevy_projection_procedural_sdf_mystic_tile_motion_invalid:menu_ground/
    );
    assert.throws(
        () => proceduralPatch({ morph: [1, 1, 0, 0], mystic_tile_colors: [[1, 2, 3, 'x']] }),
        /bevy_projection_procedural_sdf_mystic_tile_colors_invalid:menu_ground:0:3/
    );
    assert.throws(
        () => proceduralPatch({ morph: [1, 1, 0, 0], mystic_count: [1, 2] }),
        /bevy_projection_procedural_sdf_mystic_count_invalid:menu_ground/
    );
});

test('the product opening of the Mystic menu lasts half a second', () => {
    const layout = computeMysticLayout({ slots: resolveMysticSlots(8), center: CENTER, anchor: CENTER, surface: RECT, tileSize: TILE });
    assert.equal(MYSTIC_OPENING_MS, 500);
    assert.equal(planMysticTiles({ tiles: layout.tiles, openingMs: MYSTIC_OPENING_MS }).totalMs, 500);
});

test('all appearance preferences retain the same Mystic geometry', () => {
 const geometry=geometryFor(STAR_ITEMS,{mystic:false});
 assert.equal(geometry.mystic,true);
 assert.ok(geometry.placements.every(placement=>placement.mystic));
 assert.ok(geometry.centerItem);
 assert.deepEqual(geometry,geometryFor(STAR_ITEMS,{mystic:true}));
});

// The canonical set is content, so it is read through the ONE owner that resolves
// menu items, with the same stubs the menu modules probe already uses.
const CONTENT = {
    ...Object.fromEntries(Object.entries(CONTEXT_MENUS.commands).map(([key,entry])=>[key,{...entry,type:'tool',icon:'tool'}])),
    home: { labelKey: 'eve.menu.home', label: 'home', type: 'tool', icon: 'home' },
    capture: { labelKey: 'eve.menu.capture', label: 'capture', type: 'tool', icon: 'capture' },
    communicate: { labelKey: 'eve.menu.communicate', label: 'communicate', type: 'tool', icon: 'communicate' },
    create: { labelKey: 'eve.menu.create', label: 'create', type: 'tool', icon: 'create' },
    calendar: { labelKey: 'eve.menu.calendar', label: 'calendar', type: 'tool', icon: 'time' },
    info: { labelKey: 'eve.menu.info', label: 'info', type: 'tool', icon: 'info' },
    find: { labelKey: 'eve.menu.find', label: 'find', type: 'tool', icon: 'search' }
};

const withMenuWindow = async (run, overrides = {}) => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    // `runtime/tool.js` (reached by every lazy tool module) reschedules a catalog
    // sync at import time: without an adole list API the timer rejects outside
    // the test and vitest reports an unhandled error for an unrelated reason.
    dom.window.AdoleAPI = { atomes: { list: async () => ({ ok: true, atomes: [] }) } };
    const previous = { window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.CustomEvent = dom.window.CustomEvent;
    try {
        const { createMysticContextItemsRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/mystic_context_items_runtime.js');
        const runtime = createMysticContextItemsRuntime({
            applyDeleteSelection: async () => ({ ok: true }),
            cloneToolExtraInput: (value) => value,
            getAtomeElement: () => null,
            getAtomeKindFromElement: () => '',
            getDefaultContent: () => ({ ...CONTENT }),
            hasProjectAutomationForAtomeSync: () => false,
            invokeProjectMediaImport: async () => ({ ok: true }),
            invokeUnifiedContextTool: async () => ({ ok: true }),
            isWorkspaceActive: () => true,
            normalizeMainToolKey: (key) => String(key || '').trim(),
            readSelectionSnapshot: () => ({ selectedIds: [] }),
            resolveCanonicalMainToolId: (_toolId, key) => `ui.${key}`,
            resolveMainToolKeyFromToolId: (toolId) => String(toolId || '').replace(/^ui\./, ''),
            translate: (_key, fallback) => fallback,
            triggerMainToolInteraction: async () => ({ ok: true }),
            ...overrides
        });
        await run({ runtime });
    } finally {
        globalThis.window = previous.window;
        globalThis.document = previous.document;
        globalThis.CustomEvent = previous.CustomEvent;
    }
};

test('Mystic opens the one constant list, whatever the surface it targets', async () => {
    await withMenuWindow(async ({ runtime }) => {
        const of = context => runtime.resolveMysticContextItems(context);
        // In edit, capabilities alter disabled state, never composition.
        const CONSTANT = ['ai', ...DESKTOP_KEYS];
        const PROJECT = CONSTANT;
        for (const context of [{ type: 'atome', atomeId: 'a1', kind: 'shape' },
            { type: 'dashboard_surface' }, { type: 'lasso', selectionIds: ['a1'] },
            { type: 'tool', tool: 'shape' }]) {
            const list = of(context);
            assert.deepEqual(list.map(item => item.key), CONSTANT);
            assert.equal(new Set(list.map(item => item.key)).size, list.length);
            assert.ok(list.every(item => typeof item.onSelect === 'function'));
        }
        const project = of({ type: 'project', projectId: 'p' });
        assert.deepEqual(project.map(item => item.key), PROJECT);
        assert.equal(new Set(project.map(item => item.key)).size, project.length);
        assert.ok(project.every(item => typeof item.onSelect === 'function'));
        assert.ok(of({ type: 'project' }).some(item => item.key === 'paste'));
        // A text field and a surface item get the same list as an object: only
        // the target of a press changes, never the tiles.
        const fieldItems = of({ type: 'text_field', hasValue: true });
        assert.deepEqual(fieldItems.map(item => item.key), ['copy', 'paste']);
        assert.ok(fieldItems.every(item => !item.onLongPress));
        assert.deepEqual(of({ type: 'surface_item', atomeId: 'surface_a' }).map(item => item.key), CONSTANT);
    });
});

test('the Copy long press is Copy then Paste on the resolved target, never the copy verb itself', async () => {
    // Le contenu REEL porte la donnee (`long_press_tool_id`), donc le contrat se
    // lit sur la definition canonique, pas sur une copie de test.
    const { createMainMenuEditContent } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_edit_content.js');
    const editContent = createMainMenuEditContent({
        t: (_key, fallback) => fallback,
        mainToolIdByKey: { copy: 'tool.main.copy', cut: 'tool.main.cut', undo: 'tool.main.undo', delete: 'tool.main.delete' },
        invokeSimpleTool: () => ({ ok: true }),
        ensureCopyModule: async () => {},
        applyDeleteSelection: async () => ({ ok: true }),
        openDeletePanel: () => {},
        openUndoPanel: () => {}
    });
    assert.equal(editContent.copy.long_press_tool_id, 'ui.copy.duplicate');
    const calls = [];
    await withMenuWindow(async ({ runtime }) => {
        const copy = runtime.resolveMysticContextItems({
            type: 'atome', atomeId: 'a1', kind: 'shape', projectId: 'p', selectionIds: ['a1', 'a2'],
            selectionKindsById: { a1: 'shape', a2: 'shape' }
        }).find(item => item.key === 'copy');
        assert.equal(typeof copy.onLongPress, 'function', 'the long press belongs to the Copy tile');
        await copy.onLongPress({ source: 'bevy_mystic_long_press' });
        const call = calls.at(-1);
        assert.equal(call.key, 'copy_long_press');
        assert.equal(call.toolId, 'ui.copy.duplicate', 'the long press duplicates instead of copying');
        assert.deepEqual(call.extraInput.selection_ids, ['a1', 'a2'], 'the active selection is the target when the menu was opened on one of its atoms');
    }, {
        getDefaultContent: () => ({ ...CONTENT, ...editContent }),
        invokeUnifiedContextTool: async (call) => { calls.push(call); return { ok: true }; }
    });
});

test('the Copy long press is one route on every surface, including one with its own duplicate verb', async () => {
    const { createMainMenuEditContent } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_edit_content.js');
    const editContent = createMainMenuEditContent({
        t: (_key, fallback) => fallback,
        mainToolIdByKey: { copy: 'tool.main.copy', cut: 'tool.main.cut', undo: 'tool.main.undo', delete: 'tool.main.delete' },
        invokeSimpleTool: () => ({ ok: true }),
        ensureCopyModule: async () => {},
        applyDeleteSelection: async () => ({ ok: true }),
        openDeletePanel: () => {},
        openUndoPanel: () => {}
    });
    const calls = [];
    const borrowed = [];
    await withMenuWindow(async ({ runtime }) => {
        const copy = runtime.resolveMysticContextItems({
            type: 'surface_item', atomeId: 'surface_a', selectionIds: ['surface_a'],
            // Le verbe propre de la surface appartient a la tuile Dupliquer ; le
            // doublon de Copier ne doit jamais le lui emprunter.
            onDuplicate: async () => { borrowed.push('duplicate'); return { ok: true, owner: 'surface' }; }
        }).find(item => item.key === 'copy');
        await copy.onLongPress({ source: 'bevy_mystic_long_press' });
        assert.deepEqual(borrowed, [], 'the surface duplicate verb is not the Copy long press');
        assert.equal(calls.at(-1).key, 'copy_long_press');
        assert.equal(calls.at(-1).toolId, 'ui.copy.duplicate');
        assert.deepEqual(calls.at(-1).extraInput.selection_ids, ['surface_a']);
    }, {
        getDefaultContent: () => ({ ...CONTENT, ...editContent }),
        invokeUnifiedContextTool: async (call) => { calls.push(call); return { ok: true }; }
    });
});

test('the project background drives its Play through the whole-project transport', async () => {
    const calls = [];
    await withMenuWindow(async ({ runtime }) => {
        const project = runtime.resolveMysticContextItems({ type: 'project', projectId: 'p' });
        const play = project.find(item => item.key === 'play');
        assert.ok(play, 'the project reads like the rest: its Play tile is there, without a selection');
        // Le fond de projet n'a pas de media selectionne : sa tuile Play parle au
        // transport du projet entier, la meme commande que le rail `container_play`.
        assert.equal(play.toolId, 'ui.project.transport');
        await play.onSelect({ source: 'pointer.click' });
        const call = calls.at(-1);
        assert.equal(call.toolId, 'ui.project.transport');
        assert.equal(call.extraInput.operation, 'play');
        assert.equal(call.extraInput.project_id, 'p');
        // An unplayable atome keeps the tile in the exact same slot, disabled.
        const shapePlay = runtime.resolveMysticContextItems({ type: 'atome', atomeId: 'a1', kind: 'shape' })
            .find(item => item.key === 'play');
        assert.ok(shapePlay);
        assert.equal(shapePlay.disabled, true);
    }, {
        invokeUnifiedContextTool: async (call) => { calls.push(call); return { ok: true }; }
    });
});

test('the masked-video Flower enables Play and routes it only to the hidden video child', async () => {
    const calls = [];
    const records = [
        { id:'mask', type:'group', parent_id:'mask_project', properties:{ kind:'group', mask:{ sourceId:'star', mode:'alpha' } } },
        { id:'video', type:'video', parent_id:'mask', properties:{ kind:'video', media_url:'/clip.mp4' } },
        { id:'star', type:'shape', parent_id:'mask', properties:{ kind:'shape', shape_variant:'star' } }
    ];
    PROJECT_SCENES.set('mask_project',{ project_id:'mask_project', records:new Map(records.map(record => [record.id,record])) });
    try {
        await withMenuWindow(async ({ runtime }) => {
            const items = runtime.resolveMysticContextItems({
                type:'atome', atomeId:'mask', kind:'group', projectId:'mask_project', selectionIds:['mask']
            });
            const play = items.find(item => item.key === 'play');
            assert.ok(play);
            assert.equal(play.disabled,false);
            await play.onSelect({ source:'pointer.click' });
            assert.deepEqual(calls.at(-1).extraInput.selection_ids,['video']);
            assert.deepEqual(calls.at(-1).extraInput.atome_ids,['video']);
            assert.equal(calls.at(-1).extraInput.atome_id,'video');
        }, { invokeUnifiedContextTool:async call => { calls.push(call); return { ok:true }; } });
    } finally {
        PROJECT_SCENES.delete('mask_project');
    }
});

test('the Utilities palette gathers Mode, Validation, the projects Matrix and the expertise level', async () => {
    const { createMainMenuContentRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js');
    const inertDependencies = [
        'applyDeleteSelection', 'closeBackgroundPanel', 'closeCalendarPanel', 'closeCanonicalHomePanel',
        'closeCommunicatePanel', 'closeCouleurPanel', 'closeDeletePanel', 'closeFinderPanel',
        'closeFontPanel', 'closeInfoPanel', 'closeLayerPanel', 'closeMatrixView', 'closePastePanel',
        'closeTimelinePanel', 'closeUndoPanel', 'defaultOrientation', 'directionValueToLabel',
        'ensureActivitiesModule', 'ensureCopyModule', 'ensurePastePanelModule', 'handleAiTouch',
        'handleFinderTouch', 'invokeTool', 'openBackgroundPanel', 'openCalendarPanel',
        'openCanonicalHomePanel', 'openCommunicatePanel', 'openCouleurPanel', 'openDeletePanel',
        'openFinderPanel', 'openFontPanel', 'openInfoPanel', 'openLayerPanel', 'openMatrixView',
        'openMediaPanel', 'closeMediaPanel',
        'openPastePanel', 'openTimelinePanel', 'openUndoPanel', 'orientationChanged'
    ];
    // Le contenu REEL du menu principal : la palette du Mystic n'est pas une
    // seconde table, elle rend les memes enfants que la barre, plus le niveau
    // d'expertise ajoute le 2026-10-06.
    const content = createMainMenuContentRuntime({
        ...Object.fromEntries(inertDependencies.map((name) => [name, () => null])),
        directionValues: [],
        mainToolIdByKey: {
            mode: 'tool.main.mode', matrix: 'tool.main.matrix', perform: 'tool.main.perform',
            create: 'tool.main.create', draw: 'tool.main.draw', capture: 'tool.main.capture', view: 'tool.main.view'
        },
        translate: (_key, fallback) => fallback
    });
    await withMenuWindow(async ({ runtime }) => {
        const utilities = runtime.resolveMysticContextItems({ type: 'project', projectId: 'p' })
            .find(item => item.key === 'utilities');
        assert.equal(utilities.type, 'palette');
        assert.deepEqual(utilities.children.map(child => child.key), ['mode', 'validation', 'matrix', 'level']);
        const mode = utilities.children.find(child => child.key === 'mode');
        assert.equal(mode.type, 'palette');
        assert.deepEqual(mode.children.map(child => child.key), ['perform', 'mode_edit', 'mode_consume']);
        // « Niveau d'expertise » : une palette d'un niveau de plus, trois choix
        // qui ecrivent la MEME preference que le panneau Home.
        const level = utilities.children.find(child => child.key === 'level');
        assert.equal(level.type, 'palette');
        assert.deepEqual(level.children.map(child => child.key), ['level_beginner', 'level_intermediate', 'level_advanced']);
        assert.deepEqual(
            level.children.map(child => child.extraInput.mastery_level),
            ['beginner', 'intermediate', 'advanced']
        );
    }, { getDefaultContent: () => content });
});

test('the in-force expertise level is the only choice that carries the check icon', async () => {
    const { createMainMenuContentRuntime } = await import('../../eVe/intuition/runtime/eve_intuition/main_menu_content_runtime.js');
    const inertDependencies = [
        'applyDeleteSelection', 'closeBackgroundPanel', 'closeCalendarPanel', 'closeCanonicalHomePanel',
        'closeCommunicatePanel', 'closeCouleurPanel', 'closeDeletePanel', 'closeFinderPanel',
        'closeFontPanel', 'closeInfoPanel', 'closeLayerPanel', 'closeMatrixView', 'closePastePanel',
        'closeTimelinePanel', 'closeUndoPanel', 'defaultOrientation', 'directionValueToLabel',
        'ensureActivitiesModule', 'ensureCopyModule', 'ensurePastePanelModule', 'handleAiTouch',
        'handleFinderTouch', 'invokeTool', 'openBackgroundPanel', 'openCalendarPanel',
        'openCanonicalHomePanel', 'openCommunicatePanel', 'openCouleurPanel', 'openDeletePanel',
        'openFinderPanel', 'openFontPanel', 'openInfoPanel', 'openLayerPanel', 'openMatrixView',
        'openMediaPanel', 'closeMediaPanel',
        'openPastePanel', 'openTimelinePanel', 'openUndoPanel', 'orientationChanged'
    ];
    const content = createMainMenuContentRuntime({
        ...Object.fromEntries(inertDependencies.map((name) => [name, () => null])),
        directionValues: [],
        mainToolIdByKey: {
            mode: 'tool.main.mode', matrix: 'tool.main.matrix', perform: 'tool.main.perform',
            create: 'tool.main.create', draw: 'tool.main.draw', capture: 'tool.main.capture', view: 'tool.main.view'
        },
        translate: (_key, fallback) => fallback
    });
    await withMenuWindow(async ({ runtime }) => {
        // The published preferences are the same source the context menus read.
        globalThis.window.__eveProfilePreferences = { visual: { masteryLevel: 'intermediate' } };
        const level = runtime.resolveMysticContextItems({ type: 'project', projectId: 'p' })
            .find(item => item.key === 'utilities').children.find(child => child.key === 'level');
        const iconOf = (key) => level.children.find(child => child.key === key).icon;
        assert.equal(iconOf('level_intermediate').endsWith('check.svg'), true);
        assert.equal(iconOf('level_beginner').endsWith('check.svg'), false);
        assert.equal(iconOf('level_advanced').endsWith('check.svg'), false);
        assert.equal(iconOf('level_beginner').endsWith('user.svg'), true);
    }, { getDefaultContent: () => content });
});

test('the Dashboard claims its own glass for the Mystic table', async () => {
    await withMenuWindow(async () => {
        const { createDashboardItemMysticMenu } = await import('../../eVe/domains/dashboard/dashboard_item_mystic_menu.js');
        const { isBlockedTarget } = await import('../../eVe/intuition/mystic/context_target.js');
        const { MYSTIC_DASHBOARD_SURFACE_CONTEXT_TYPE } = await import('../../eVe/intuition/mystic/context_selection.js');
        assert.equal(MYSTIC_DASHBOARD_SURFACE_CONTEXT_TYPE, 'dashboard_surface');
        const menu = createDashboardItemMysticMenu({
            state: {
                active: true,
                layout: {
                    dashboard_rect: { x: 0, y: 0, width: 1280, height: 720 },
                    // The toolbox keeps its sliver at the bottom of the surface: the
                    // ONE place on the Dashboard the menu must never claim.
                    toolbox_reserved_rect: { x: 0, y: 720, width: 1280, height: 0 },
                    lanes: []
                },
                tokens: {}
            },
            layoutPointFromClient: ({ clientX, clientY }) => ({ x: clientX, y: clientY }),
            label: { begin: () => {} },
            invalidateCategories: async () => {}
        });
        const glass = { clientX: 640, clientY: 360 };
        assert.deepEqual(menu.readTargetAtPoint(glass), { kind: 'surface' });
        assert.equal(menu.isBlockedPoint(glass), false);
        // The table opens ON the Dashboard, at the point the user pressed, and not
        // only over one of its tiles.
        assert.deepEqual(menu.readTargetAtPoint({ ...glass, eventType: 'contextmenu' }), { kind: 'surface' });
        assert.equal(menu.isBlockedPoint(glass), false);
        // Une TUILE du Dashboard, elle aussi, ouvre la table : elle repond
        // `surface` des que Mystic est actif, et garde seulement son geste de
        // renommage sous le doigt — la table canonique n'a pas d'entree `rename`.
        // Sans ce verdict la tuile repondait `item`, le style mystique n'a pas
        // d'entree pour ce contexte, et le menu ne s'ouvrait nulle part.
        const tile = { x: 100, y: 100, width: 200, height: 200 };
        const lane = {
            category: { id: 'projects' },
            header_visible_rect: { x: 0, y: 0, width: 0, height: 0 },
            visible_item_rects: [{
                item: { atome_id: 'p1', title: 'Projet 2', metadata: { project_preview_source: 'preview.png' } },
                category: { id: 'projects' },
                visible_rect: { ...tile },
                card_rect: { ...tile }
            }]
        };
        const tiled = createDashboardItemMysticMenu({
            state: {
                active: true,
                layout: {
                    dashboard_rect: { x: 0, y: 0, width: 1280, height: 720 },
                    toolbox_reserved_rect: { x: 0, y: 720, width: 1280, height: 0 },
                    lanes: [lane]
                },
                tokens: {}
            },
            layoutPointFromClient: ({ clientX, clientY }) => ({ x: clientX, y: clientY }),
            label: { begin: () => {} },
            invalidateCategories: async () => {}
        });
        // Le libelle tient le bas de la carte (`project_preview_source` present) ;
        // le reste de la tuile appartient au menu.
        const label = { clientX: 200, clientY: 285 };
        const preview = { clientX: 200, clientY: 160 };
        assert.equal(tiled.readTargetAtPoint({ ...preview, eventType: 'contextmenu' }).kind, 'item');
        assert.equal(tiled.readTargetAtPoint({ ...preview, eventType: 'pointerdown' }).kind, 'item');
        assert.deepEqual(tiled.readTargetAtPoint({ ...label, eventType: 'pointerdown' }), { kind: 'block' });
        assert.equal(tiled.readTargetAtPoint({ ...label, eventType: 'contextmenu' }).kind, 'item');
        const tileTarget = tiled.readTargetAtPoint({ ...preview, eventType: 'contextmenu' });
        assert.equal(tileTarget.kind, 'item');
        assert.equal(tileTarget.atomeId, 'p1');
        // Outside its own rect the Dashboard abstains rather than blocking.
        assert.equal(menu.readTargetAtPoint({ clientX: -10, clientY: 360 }), null);
        // An inactive Dashboard owns nothing at all.
        const idle = createDashboardItemMysticMenu({
            state: { active: false, layout: null, tokens: {} },
            layoutPointFromClient: ({ clientX, clientY }) => ({ x: clientX, clientY }),
            label: { begin: () => {} },
            invalidateCategories: async () => {}
        });
        assert.equal(idle.readTargetAtPoint(glass), null);

        // ...and the shared Mystic gate reads that answer before anything else. A
        // BevyUI node sits under the point — the Dashboard's own glass — and would
        // block the menu on its own; the Dashboard's verdict is what settles it.
        // `context_target.js` tests its targets with the real DOM constructors.
        const previousElement = globalThis.Element;
        globalThis.Element = globalThis.window.Element;
        const surface = globalThis.document.createElement('canvas');
        const event = { clientX: 640, clientY: 360, type: 'pointerdown' };
        globalThis.window.eveBevyUiRuntime = { hitTestAtClientPoint: () => ({ nodeId: 'dashboard_node_1' }) };
        globalThis.window.eveDashboardBevyUiRuntime = { readMysticTargetAtPoint: () => ({ kind: 'block' }) };
        assert.equal(isBlockedTarget(surface, event), true);
        globalThis.window.eveDashboardBevyUiRuntime = { readMysticTargetAtPoint: () => menu.readTargetAtPoint(glass) };
        assert.equal(isBlockedTarget(surface, event), false, 'the surface claims the gesture for the Mystic table');
        globalThis.window.eveDashboardBevyUiRuntime = { readMysticTargetAtPoint: () => ({ kind: 'item', atomeId: 'a1' }) };
        assert.equal(isBlockedTarget(surface, event), false, 'a tile keeps its own actions');
        globalThis.window.eveDashboardBevyUiRuntime = undefined;
        assert.equal(isBlockedTarget(surface, event), true, 'without the Dashboard the node blocks, as it always did');
        globalThis.Element = previousElement;
    });
});

// -----------------------------------------------------------------------------
// The seam: two neighbouring plates may never touch
// -----------------------------------------------------------------------------

// The cell a tile landed on, as a count of cells from the Atom, then every pair of
// cells that share a side. The seam between those two has to be the gap the block
// handed out — not less, and not "about".
const neighbourSeams = (layout) => {
    const cells = layout.tiles.map((tile) => ({
        column: Math.round((tile.point[0] - layout.center.x) / layout.cell),
        row: Math.round((tile.point[1] - layout.center.y) / layout.cell),
        tile
    }));
    const seams = [];
    for (let left = 0; left < cells.length; left += 1) {
        for (let right = left + 1; right < cells.length; right += 1) {
            const column = Math.abs(cells[left].column - cells[right].column);
            const row = Math.abs(cells[left].row - cells[right].row);
            if ((column + row) !== 1) continue;
            const distance = Math.hypot(
                cells[left].tile.point[0] - cells[right].tile.point[0],
                cells[left].tile.point[1] - cells[right].tile.point[1]
            );
            seams.push(Number((distance - cells[left].tile.size).toFixed(6)));
        }
    }
    return seams;
};

const layoutWithGap = (count, gap) => computeMysticLayout({
    slots: resolveMysticSlots(count), center: CENTER, anchor: CENTER, surface: RECT,
    tileSize: TILE, roundness: 1, gap
});

test('two neighbouring plates never touch, and the seam is the gap that was asked for', () => {
    // The 3x3 ring and the full star: two shapes, every pair that shares a side.
    for (const count of [8, 24]) {
        for (const gap of [1, 2, 3, 4, 7]) {
            const layout = layoutWithGap(count, gap);
            assert.equal(layout.gap, gap, `layout gap for ${count} tiles at ${gap}px`);
            assert.equal(layout.cell, TILE + gap, 'the stride is the tile plus the seam');
            assert.equal(layout.tiles.every((tile) => tile.gap === gap), true, 'each tile carries its own seam');
            const seams = neighbourSeams(layout);
            assert.ok(seams.length > 0, `the ${count}-tile block has neighbours`);
            // Every neighbour pair is EXACTLY the gap apart — never less. The tiles
            // are placed on one lattice, so rounding the points cannot close it.
            assert.equal(seams.every((seam) => seam === gap), true, `seams ${seams} at ${gap}px`);
        }
    }
});

test('the block the menu really builds carries the product seam end to end', () => {
    // The whole path the product takes: the routed block, the tile stride, and the
    // material the shader receives.
    const geometry = geometryFor(RING_ITEMS);
    assert.equal(geometry.gap, MYSTIC_TILE_GAP_PX);
    assert.equal(geometry.placements.every((placement) => placement.mystic?.gap === MYSTIC_TILE_GAP_PX), true);
    const seams = neighbourSeams(geometry.layout);
    assert.ok(seams.length > 0);
    assert.equal(seams.every((seam) => seam === MYSTIC_TILE_GAP_PX), true, `seams ${seams}`);
    const uniforms = buildMysticSurfaceUniforms({
        tiles: geometry.placements.map((placement) => placement.mystic),
        width: RECT.width,
        height: RECT.height
    });
    // The softness follows the seam the frame really has, and stays under half of it.
    assert.equal(uniforms.mystic_style[3], resolveMysticEdgeSoftness(MYSTIC_TILE_GAP_PX));
    assert.ok(uniforms.mystic_style[3] <= MYSTIC_TILE_GAP_PX / 2);
});

test('a tight seam keeps the anti-aliasing inside the gap', () => {
    // With a one-pixel seam, the soft edge is exactly half of it: the two
    // neighbouring plates reach zero coverage at the middle of the gap, so the
    // tiles read as detached cells instead of one glued rectangle.
    const softness = resolveMysticEdgeSoftness(1);
    assert.equal(softness, 1 / 2);
    assert.ok(softness <= MYSTIC_EDGE_SOFTNESS_PX);
    // An unknown seam (a corolla petal, a hand-built record) gets the skin cap and
    // never more than the cap, whatever it is handed.
    assert.equal(resolveMysticEdgeSoftness(0), MYSTIC_EDGE_SOFTNESS_PX);
    assert.equal(resolveMysticEdgeSoftness(undefined), MYSTIC_EDGE_SOFTNESS_PX);
    // A seam narrower than anything the layout can hand out still wins over the
    // cap: the separation is what matters, the smoothness comes after.
    assert.equal(resolveMysticEdgeSoftness(0.4), 0.2);
    assert.equal(resolveMysticEdgeSoftness(0.4, resolveMysticSkin({ edge: { softnessPx: 0.1 } })), 0.1);
});

// -----------------------------------------------------------------------------
// Skinning: every element of the Mystic menu is a shared token
// -----------------------------------------------------------------------------

test('every Mystic element is skinned from the shared Atome tokens', () => {
    // The plate IS the system surface, its shadow IS that surface's contact
    // shadow, its centre IS the product mark: nothing in the Mystic menu picks a
    // colour of its own.
    const surface = EVE_COMMON_SKIN_TOKENS.bevy.systemSurface;
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.plate.background, surface.background);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.plate.backdropBlurPx, surface.backdrop.blurPx);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.plate.backdropTint, surface.backdrop.tint);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.shadow.color, surface.shadow.color);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.shadow.blur, surface.shadow.blur);
    // The handle's box shadow is that same contact shadow: the menu paints one
    // shadow value wherever it appears, and the centre reads it from the skin.
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.center.shadow.color, surface.shadow.color);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.center.shadow.blur, surface.shadow.blur);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.center.shadow.spread, surface.shadow.spread);
    assert.equal(MYSTIC_CENTER_SHADOW, EVE_MYSTIC_SKIN_TOKENS.center.shadow);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.center.tint[0], 201 / 255);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.center.tint[1], 12 / 255);
    assert.equal(EVE_MYSTIC_SKIN_TOKENS.center.tint[2], 125 / 255);
    // The skin participates in the one global skin set, so a theme can reach it
    // through the same door as the panels, the buttons and the tools.
    assert.equal(EVE_SKIN_TOKENS.mystic, EVE_MYSTIC_SKIN_TOKENS);
    // The design module reads that skin and nothing else.
    assert.equal(MYSTIC_SKIN, EVE_MYSTIC_SKIN_TOKENS);
    assert.equal(MYSTIC_GLASS_TINT[3], EVE_MYSTIC_SKIN_TOKENS.plate.backdropTint[3]);
    assert.equal(MYSTIC_CENTER_PLATE, EVE_MYSTIC_SKIN_TOKENS.center.plate);
    assert.equal(MYSTIC_CENTER_TINT, EVE_MYSTIC_SKIN_TOKENS.center.tint);
    assert.equal(MYSTIC_HOLE_DOSE, EVE_MYSTIC_SKIN_TOKENS.hole.dose);
    assert.equal(MYSTIC_EDGE_SOFTNESS_PX, EVE_MYSTIC_SKIN_TOKENS.edge.softnessPx);
    assert.deepEqual(resolveMysticFamilyColor('blue'),[0,0,0,0]);
});

test('a skin override moves a single element, and the record follows it', () => {
    // The override door is the shared one (`mergeSkinTokens`), so a skin touches
    // the Mystic menu the same way it touches a panel.
    const custom = resolveMysticSkin({
        plate: { backdropTint: [0, 0, 0, .5] },
        rim: { widthPx: 3, dose: 0.9 },
        hole: { dose: 0.4 },
        edge: { softnessPx: 0.9 },
        center: { icon: './assets/images/icons/atom.svg' }
    });
    // Only what the skin named moved; everything else is still the shared token.
    assert.deepEqual(custom.plate.backdropTint, [0,0,0,.5]);
    assert.equal(custom.plate.backdropBlurPx, EVE_MYSTIC_SKIN_TOKENS.plate.backdropBlurPx);
    assert.equal(custom.shadow.blur, EVE_MYSTIC_SKIN_TOKENS.shadow.blur);
    assert.equal(custom.center.icon, './assets/images/icons/atom.svg');
    // The base itself is frozen: a skin cannot be edited in place from outside.
    assert.equal(Object.isFrozen(EVE_MYSTIC_SKIN_TOKENS), true);
    assert.equal(Object.isFrozen(EVE_MYSTIC_SKIN_TOKENS.plate), true);

    const tiles = computeMysticLayout({
        slots: resolveMysticSlots(8), center: CENTER, anchor: CENTER, surface: RECT,
        tileSize: TILE, roundness: 1
    }).tiles;
    const uniforms = buildMysticSurfaceUniforms({
        tiles, width: RECT.width, height: RECT.height, holeDose: custom.hole.dose, skin: custom
    });
    // The record carries the skin, not the default: the plate fond, the contact
    // shadow colour, the hole dose, the rim and the edge softness all moved.
    assert.deepEqual(uniforms.assistant_background_tint, [0,0,0,.5]);
    assert.deepEqual(uniforms.surface_tint, [...EVE_MYSTIC_SKIN_TOKENS.shadow.color]);
    assert.equal(uniforms.mystic_count[1], 0.4);
    assert.deepEqual(uniforms.mystic_style.slice(0, 3), [2.5, 1, 0]);
    // The softness the skin names is honoured while it stays within the seam share:
    // the 3 px seam allows 1.5, so a skin asking for 0.9 gets it.
    assert.equal(uniforms.mystic_style[3], resolveMysticEdgeSoftness(MYSTIC_TILE_GAP_PX, custom));
    assert.equal(uniforms.mystic_style[3], 0.9);
});

test('a skin can never blur two plates into one another', () => {
    // A skin that asks for a softness wider than the seam does not get it: the cap
    // is a share of the gap the layout handed out, so the seam stays a seam.
    const greedy = resolveMysticSkin({ edge: { softnessPx: 8, maxSeamShare: 0.9 } });
    const softness = resolveMysticEdgeSoftness(MYSTIC_TILE_GAP_PX, greedy);
    assert.equal(softness, MYSTIC_TILE_GAP_PX * 0.9);
    assert.ok(softness < MYSTIC_TILE_GAP_PX);
    const uniforms = buildMysticSurfaceUniforms({
        tiles: computeMysticLayout({
            slots: resolveMysticSlots(8), center: CENTER, anchor: CENTER, surface: RECT,
            tileSize: TILE, roundness: 1
        }).tiles,
        width: RECT.width,
        height: RECT.height,
        skin: greedy
    });
    assert.equal(uniforms.mystic_style[3], MYSTIC_TILE_GAP_PX * 0.9);
});

test('a pre-workspace text field retains its own Copy/Paste menu', async () => {
    await withMenuWindow(async ({ runtime }) => {
        const items = runtime.resolveMysticContextItems({ type: 'text_field', hasValue: true, canPaste: true });
        assert.deepEqual(items.map(item => item.key), ['copy', 'paste']);
        assert.ok(items.every(item => !item.disabled && !item.onLongPress));
        assert.deepEqual(runtime.resolveMysticContextItems({ type: 'project' }), []);
    }, { isWorkspaceActive: () => false });
});
