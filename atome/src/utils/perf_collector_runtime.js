// Opt-in performance baseline collector.
//
// The runtime already emits discrete `squirrel:perf` CustomEvents (boot stages,
// project load/render, panel opens) through perf_runtime.js, but nothing records
// them and emission is gated behind a flag. This module makes those events
// collectable for cold/warm baselines without adding any default overhead:
// it activates only when the operator opts in via `?perf=1`, the
// `squirrel_perf` localStorage key, or a
// pre-set window flag. When active it enables emission and buffers events into a
// capped ring exposed on `window.__squirrelPerf`.

const PERF_EVENT_NAME = 'squirrel:perf';
// Un silence de plus d'un cinquième de seconde entre deux marques mérite d'être
// nommé : en dessous, c'est le fonctionnement normal d'une interface.
const PERF_GAP_THRESHOLD_MS = 200;
// Le battement doit être plus fin que le seuil, sinon un trou juste au-dessus du
// seuil ne contiendrait aucun battement et serait qualifié à tort de blocage.
const PERF_HEARTBEAT_MS = 100;
// Marge de tolérance : un battement en retard de moins de ça est du bruit
// d'ordonnancement, pas un blocage.
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

const applyFlags = (win, mode) => {
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

// L'opt-in doit être atteignable sans URL.
//
// `?perf=1` suppose qu'on puisse éditer l'adresse. C'est vrai en navigateur, et
// faux partout ailleurs : sous Tauri comme sous iOS, l'application ne se charge
// pas depuis une barre d'adresse. La clé localStorage lue par `readOptIn`
// existait déjà et marche partout — elle était simplement inatteignable, rien ne
// l'exposait. Résultat : `window.__squirrelPerf` restait indéfini et la mesure
// était inapplicable sur les deux plateformes natives.
//
// Ces deux fonctions sont installées QUOI QU'IL ARRIVE, y compris quand la
// mesure est éteinte : c'est justement dans cet état qu'on a besoin de
// l'allumer.
const installPerfOptInControls = (win, start) => {
    if (typeof win.__squirrelPerfEnable === 'function') return;
    win.__squirrelPerfEnable = () => {
        const normalized = 'events';
        try {
            win.localStorage?.setItem(STORAGE_KEY, normalized);
        } catch (_) {
            return { ok: false, error: 'perf_optin_storage_unavailable' };
        }
        // La clé survit aux rechargements : au chargement suivant, le collecteur
        // démarre donc TOUT SEUL, en `events`.
        if (win.__squirrelPerf?.setMode) {
            applyFlags(win, normalized);
            win.__squirrelPerf.setMode(normalized);
            return { ok: true, mode: normalized, started: true, bootMarksRequireReload: true };
        }
        // Le collecteur démarre TOUT DE SUITE. Exiger un rechargement était une
        // friction inutile : ce qu'on mesure presque toujours — une bascule de
        // vue, l'ouverture d'un panneau — se produit après le démarrage, donc
        // la mesure est utilisable immédiatement.
        //
        // Seules les marques de DÉMARRAGE manquent, puisqu'elles sont émises
        // avant que la console existe. `bootMarksRequireReload` le dit sans
        // transformer un manque partiel en obligation.
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
        // Couper la collecte immédiatement. Le buffer reste lisible jusqu'au
        // prochain chargement.
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

    applyFlags(win, mode);
    const api = buildApi(win);
    let activeMode = 'events';
    api.setMode = (nextMode) => {
        activeMode = nextMode ? 'events' : null;
        return activeMode;
    };
    // --- Le chien de garde des silences -------------------------------------
    //
    // Toutes les marques posées jusqu'ici mesurent du TRAVAIL. Aucune ne mesure
    // une ATTENTE. Quand un ralentissement n'apparaît dans aucune marque, c'est
    // qu'il s'écoule ENTRE deux marques — et l'instrumentation est alors
    // structurellement aveugle à ce qu'on cherche.
    //
    // Deux questions, et la seconde est la plus utile :
    //   - combien de temps s'est écoulé sans rien, et entre quelles marques ;
    //   - pendant ce temps, le fil principal était-il BLOQUÉ ou LIBRE ?
    //
    // Un battement de cœur tranche la seconde sans ambiguïté. Bloqué, il ne peut
    // pas se produire : le battement suivant arrive en retard de toute la durée
    // du blocage. Libre, il continue à l'heure — l'attente est alors ailleurs
    // (réseau, disque, GPU, une promesse qui tarde).
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
    if (typeof win.setInterval === 'function') win.setInterval(beat, PERF_HEARTBEAT_MS);

    // --- Le compteur de frames ----------------------------------------------
    //
    // « Fil libre » restait ambigu, et c'est la minuterie qui le rendait tel :
    // `setInterval` continue de battre même quand l'affichage ne repeint plus.
    // Un fil qui tourne sans rien afficher était donc décrit exactement comme un
    // fil qui attend le réseau — deux causes opposées sous un seul mot.
    //
    // Compter les frames les sépare. Un silence sans la moindre frame veut dire
    // que l'affichage est gelé : la cause est dans la présentation, pas dans le
    // code applicatif — et aucune optimisation de ce dernier n'y changera rien.
    let framesSinceLastMark = 0;
    if (typeof win.requestAnimationFrame === 'function') {
        const onFrame = () => {
            framesSinceLastMark += 1;
            win.requestAnimationFrame(onFrame);
        };
        win.requestAnimationFrame(onFrame);
    }

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

    // --- La marque du GESTE ---------------------------------------------
    //
    // Le chien de garde mesure des silences mais ne sait pas dire lequel est
    // « l'utilisateur réfléchit » et lequel est « le système est bloqué ». Un
    // trou de 11 s avant `view_mode.module_import` a donc deux lectures
    // opposées, et rien dans le journal ne permettait de choisir.
    //
    // Posée en phase de CAPTURE, cette marque précède tout gestionnaire
    // applicatif : ce qui s'écoule entre elle et la marque suivante est du
    // temps SYSTÈME, sans ambiguïté possible.
    let lastPressAtMs = null;
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
        lastPressAtMs = clockNow();
        api.record({ name: 'input.press', atMs: lastPressAtMs, nodeId: describeTarget(event?.target) });
    };
    if (typeof win.addEventListener === 'function') {
        win.addEventListener('pointerdown', onPress, { capture: true, passive: true });
    }

    const recordAndReport = api.record;
    api.record = (detail) => {
        if (activeMode === null) return;
        const name = String(detail?.name || '');
        if (name !== 'perf.gap') reportGap(name, Number(detail?.atMs));
        recordAndReport(detail);
    };
    win.addEventListener(PERF_EVENT_NAME, (event) => api.record(event?.detail), { passive: true });
    win.__squirrelPerf = api;
    return api;
};
