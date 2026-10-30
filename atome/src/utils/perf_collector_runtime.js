// Opt-in, bounded performance capture. This owner keeps the captured buffer
// while stopped, but releases every listener, heartbeat and animation frame.

const PERF_EVENT_NAME = 'squirrel:perf';
// Gaps below 200 ms are ordinary interaction timing, not diagnostic stalls.
const PERF_GAP_THRESHOLD_MS = 200;
// The heartbeat must be finer than the gap threshold to detect blocking.
const PERF_HEARTBEAT_MS = 100;
// Scheduling noise below this margin is not a blocked main thread.
const PERF_HEARTBEAT_SLACK_MS = 150;
const STORAGE_KEY = 'squirrel_perf';
const RING_CAPACITY = 4000;

const readOptIn = (win) => {
    if (!win) return null;
    if (win.__EVE_PERF_LOGS__ === true || win.__SQUIRREL_PERF_LOGS__ === true) return 'events';
    if (win.__EVE_PERF_EVENTS__ === true || win.__SQUIRREL_PERF_EVENTS__ === true) return 'events';

    let search = '';
    try { search = String(win.location?.search || ''); } catch { search = ''; }
    const match = /[?&]perf=([a-z0-9]+)/i.exec(search);
    if (match) return 'events';

    try {
        const stored = win.localStorage?.getItem(STORAGE_KEY);
        if (stored === 'logs') return 'events';
        if (stored === '1' || stored === 'events' || stored === 'true') return 'events';
    } catch { /* localStorage may be unavailable */ }

    return null;
};

const applyFlags = (win) => {
    win.__SQUIRREL_PERF_EVENTS__ = true;
    win.__EVE_PERF_EVENTS__ = true;
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

// Native hosts have no address bar, so explicit controls remain available even
// when capture is disabled. The storage key enables capture on the next launch.
const installPerfOptInControls = (win, start) => {
    if (typeof win.__squirrelPerfEnable === 'function') return;
    win.__squirrelPerfEnable = () => {
        const normalized = 'events';
        try {
            win.localStorage?.setItem(STORAGE_KEY, normalized);
        } catch (_) {
            return { ok: false, error: 'perf_optin_storage_unavailable' };
        }
        if (win.__squirrelPerf?.setMode) {
            applyFlags(win);
            win.__squirrelPerf.setMode(normalized);
            return { ok: true, mode: normalized, started: true, bootMarksRequireReload: true };
        }
        // Capture starts immediately; only earlier boot marks require a reload.
        const started = start(win);
        return {
            ok: true,
            mode: normalized,
            started: !!started,
            bootMarksRequireReload: true
        };
    };
    win.__squirrelPerfDisable = () => {
        try {
            win.localStorage?.removeItem(STORAGE_KEY);
        } catch (_) {
            return { ok: false, error: 'perf_optin_storage_unavailable' };
        }
        // Keep the buffer readable while releasing the capture's live work.
        win.__squirrelPerf?.setMode?.(null);
        return { ok: true, stopped: true, bufferKeptUntilReload: !!win.__squirrelPerf };
    };
};

export const startPerfCollector = (win = globalThis?.window) => {
    if (!win || typeof win.addEventListener !== 'function') return null;
    installPerfOptInControls(win, startPerfCollector);
    if (win.__squirrelPerf) return win.__squirrelPerf;

    const mode = readOptIn(win);
    if (!mode) return null;

    applyFlags(win);
    const api = buildApi(win);
    let activeMode = null;
    // Correlate event gaps with heartbeat lateness and observed animation frames.
    let clockNow = () => (typeof win.performance?.now === 'function'
        ? win.performance.now()
        : Date.now());
    api.__testSetClock = (fn) => { clockNow = typeof fn === 'function' ? fn : clockNow; };

    let lastMarkAtMs = null;
    let lastMarkName = '';
    let lastBeatAtMs = clockNow();
    let worstBeatLateMs = 0;

    const beat = () => {
        const now = clockNow();
        const late = now - lastBeatAtMs - PERF_HEARTBEAT_MS;
        if (late > worstBeatLateMs) worstBeatLateMs = late;
        lastBeatAtMs = now;
    };
    let heartbeatId = null;
    let frameId = null;
    let framesSinceLastMark = 0;
    const onFrame = () => {
        frameId = null;
        if (activeMode === null) return;
        framesSinceLastMark += 1;
        frameId = win.requestAnimationFrame(onFrame);
    };

    const reportGap = (name, atMs) => {
        if (!Number.isFinite(atMs)) return;
        if (lastMarkAtMs === null) { lastMarkAtMs = atMs; lastMarkName = name; return; }
        const gapMs = atMs - lastMarkAtMs;
        const previousName = lastMarkName;
        lastMarkAtMs = atMs;
        lastMarkName = name;
        const blockedMs = worstBeatLateMs;
        worstBeatLateMs = 0;
        const frames = framesSinceLastMark;
        framesSinceLastMark = 0;
        if (gapMs < PERF_GAP_THRESHOLD_MS) return;

        const blocked = blockedMs > PERF_HEARTBEAT_SLACK_MS;
        const frozen = frames === 0;
        recordAndReport({
            name: 'perf.gap',
            atMs,
            totalMs: gapMs,
            afterMark: previousName,
            beforeMark: name,
            blockedMs: blocked ? Math.round(blockedMs) : 0,
            frames,
            frozen
        });
    };

    // Capture the press before application handlers to separate user waiting
    // from the work that follows their gesture.
    const describeTarget = (target) => {
        if (!target || typeof target !== 'object') return '';
        const id = String(target.id || '').trim();
        if (id) return id;
        let attr = '';
        try { attr = String(target.getAttribute?.('data-tool-id') || '').trim(); } catch { attr = ''; }
        return attr || String(target.tagName || '').toLowerCase();
    };
    const onPress = (event) => {
        if (activeMode === null) return;
        api.record({ name: 'input.press', atMs: clockNow(), nodeId: describeTarget(event?.target) });
    };

    const recordAndReport = api.record;
    api.record = (detail) => {
        if (activeMode === null) return;
        const name = String(detail?.name || '');
        if (name !== 'perf.gap') reportGap(name, Number(detail?.atMs));
        recordAndReport(detail);
    };
    const onPerfEvent = (event) => api.record(event?.detail);

    api.setMode = (nextMode) => {
        const next = nextMode ? 'events' : null;
        if (next === activeMode) return activeMode;
        activeMode = next;
        if (next === null) {
            if (heartbeatId !== null) win.clearInterval?.(heartbeatId);
            if (frameId !== null) win.cancelAnimationFrame?.(frameId);
            heartbeatId = frameId = null;
            win.removeEventListener?.('pointerdown', onPress, { capture: true });
            win.removeEventListener?.(PERF_EVENT_NAME, onPerfEvent);
        } else {
            // A disabled stretch is neither a stall nor a delayed heartbeat.
            lastMarkAtMs = null;
            lastMarkName = '';
            lastBeatAtMs = clockNow();
            worstBeatLateMs = framesSinceLastMark = 0;
            win.addEventListener('pointerdown', onPress, { capture: true, passive: true });
            win.addEventListener(PERF_EVENT_NAME, onPerfEvent, { passive: true });
            if (typeof win.setInterval === 'function') heartbeatId = win.setInterval(beat, PERF_HEARTBEAT_MS);
            if (typeof win.requestAnimationFrame === 'function') frameId = win.requestAnimationFrame(onFrame);
        }
        return activeMode;
    };
    api.stop = () => { api.setMode(null); };

    win.__squirrelPerf = api;
    api.setMode(mode);
    return api;
};
