// Opt-in performance baseline collector.
//
// The runtime already emits discrete `squirrel:perf` CustomEvents (boot stages,
// project load/render, panel opens) through perf_runtime.js, but nothing records
// them and emission is gated behind a flag. This module makes those events
// collectable for cold/warm baselines without adding any default overhead:
// it activates only when the operator opts in via `?perf=1` (events) or
// `?perf=logs` (events + logs), the `squirrel_perf` localStorage key, or a
// pre-set window flag. When active it enables emission and buffers events into a
// capped ring exposed on `window.__squirrelPerf`.

const PERF_EVENT_NAME = 'squirrel:perf';
const RING_CAPACITY = 4000;

const readOptIn = (win) => {
    if (!win) return null;
    if (win.__EVE_PERF_LOGS__ === true || win.__SQUIRREL_PERF_LOGS__ === true) return 'logs';
    if (win.__EVE_PERF_EVENTS__ === true || win.__SQUIRREL_PERF_EVENTS__ === true) return 'events';

    let search = '';
    try { search = String(win.location?.search || ''); } catch { search = ''; }
    const match = /[?&]perf=([a-z0-9]+)/i.exec(search);
    if (match) return match[1].toLowerCase() === 'logs' ? 'logs' : 'events';

    try {
        const stored = win.localStorage?.getItem('squirrel_perf');
        if (stored === 'logs') return 'logs';
        if (stored === '1' || stored === 'events' || stored === 'true') return 'events';
    } catch { /* localStorage may be unavailable */ }

    return null;
};

const applyFlags = (win, mode) => {
    win.__SQUIRREL_PERF_EVENTS__ = true;
    win.__EVE_PERF_EVENTS__ = true;
    if (mode === 'logs') {
        win.__SQUIRREL_PERF_LOGS__ = true;
        win.__EVE_PERF_LOGS__ = true;
    }
};

const buildApi = (win) => {
    const events = [];
    const navStartMs = (() => {
        try {
            const nav = win.performance?.getEntriesByType?.('navigation')?.[0];
            return typeof nav?.startTime === 'number' ? nav.startTime : 0;
        } catch { return 0; }
    })();

    const record = (detail) => {
        if (!detail || typeof detail !== 'object') return;
        if (events.length >= RING_CAPACITY) events.shift();
        events.push(detail);
    };

    const summary = () => {
        const byName = new Map();
        for (const event of events) {
            const name = String(event.name || 'unknown');
            const entry = byName.get(name) || { name, count: 0, lastMs: null, lastTotalMs: null };
            entry.count += 1;
            entry.lastMs = typeof event.atMs === 'number' ? Math.round(event.atMs) : entry.lastMs;
            if (typeof event.totalMs === 'number') entry.lastTotalMs = Math.round(event.totalMs * 10) / 10;
            byName.set(name, entry);
        }
        return Array.from(byName.values()).sort((a, b) => (a.lastMs || 0) - (b.lastMs || 0));
    };

    const timeline = () => events
        .map((event) => ({
            name: event.name,
            sinceNavMs: typeof event.atMs === 'number' ? Math.round(event.atMs - navStartMs) : null,
            totalMs: typeof event.totalMs === 'number' ? Math.round(event.totalMs * 10) / 10 : null
        }))
        .sort((a, b) => (a.sinceNavMs || 0) - (b.sinceNavMs || 0));

    const dump = () => {
        const rows = timeline();
        if (typeof win.console?.table === 'function') win.console.table(rows);
        return rows;
    };

    return { record, events, summary, timeline, dump, clear: () => { events.length = 0; } };
};

export const startPerfCollector = (win = globalThis?.window) => {
    if (!win || typeof win.addEventListener !== 'function') return null;
    if (win.__squirrelPerf) return win.__squirrelPerf;

    const mode = readOptIn(win);
    if (!mode) return null;

    applyFlags(win, mode);
    const api = buildApi(win);
    win.addEventListener(PERF_EVENT_NAME, (event) => api.record(event?.detail), { passive: true });
    win.__squirrelPerf = api;
    return api;
};
