// The sport sessions of this device's health store, imported into the person's records (D18 improvement 6): Apple Health
// on iOS, Health Connect on Android, the activities any app recorded there. Connecting is the person's own act: it
// associates the store with their principal (#health_owner.js `link`) and asks the store for the chosen categories,
// each granted or refused in the store's own sheet and withdrawn in its settings; a category refused is simply never
// read, and nothing else of eVe depends on it. Then the authorized history is read, page after page, and from then on
// only what changed (the store's anchor, kept on this device's source record, #shared/activity_source_contract.js):
// on each opening of the Moniteur's Résultats, or on request (health_sync.sync). Not in real time: a store gives its
// changes when asked.
// Each page is written (#health_imports.js: one entry per session, a re-read never duplicates it, a session another
// source already gave is marked) before its anchor is kept, so an interrupted import resumes where it stopped.
// Disconnecting stops the reads and forgets the anchor; the imported sessions stay (what to do with them is the
// person's decision, todo/REGISTRE_DEMANDES.md). Commands answer states and counts, never a value.
import { getHealthMonitor } from './health_catalog.js';
import { HEALTH_ACTIVITY_STORES } from './health_activity_reader.js';
import { ACTIVITY_SOURCE_CATEGORIES, activitySourceId, validateActivitySource } from '../../shared/activity_source_contract.js';

// The monitors whose read permission each category is (#health_catalog.js); a host has only some of them.
const CATEGORY_MONITORS = Object.freeze({ workouts: ['workout_duration'], heart_rate: ['heart_rate'], active_energy: ['active_energy'],
    distance: ['distance_walking_running', 'distance_cycling', 'distance'], steps: ['steps'] });
// One synchronization reads at most this many pages (50 sessions each); the rest waits for the next one.
const MAX_PAGES = 40;
// A Health Connect changes token expires after 30 days unused: the sessions since the last synchronization are read
// again (with a day's margin), each kept once by its id.
const EXPIRED_MARGIN_MS = 86400000;
const failed = code => Object.assign(new Error(code), { code });

export function createHealthActivitySync({ owner, imports, store, actor, device, now = () => Date.now(),
    createId = () => globalThis.crypto.randomUUID() }) {
    let queue = Promise.resolve();
    const sourceOf = () => HEALTH_ACTIVITY_STORES[owner.describe().host] || null;
    const monitorsOf = categories => categories.flatMap(category => CATEGORY_MONITORS[category]).filter(id => getHealthMonitor(id)?.[owner.describe().host]);
    const where = async () => {
        const person = actor();
        if (!person) throw failed('AUTH_REQUIRED');
        const source = sourceOf(), id = String(await device());
        return { person, source, device: id, recordId: activitySourceId(person, source, id) };
    };
    const readSource = async place => {
        const record = await store.read(place.recordId), props = record?.properties || record?.props;
        return props?.activity_source ? validateActivitySource(props.activity_source) : null;
    };
    const writeSource = async (place, value) => {
        const at = new Date(now()).toISOString(), changeId = `${place.recordId}:${createId()}`;
        const result = await store.commit({ kind: 'set', id: changeId, tx_id: changeId, actor: place.person, atome_id: place.recordId, type: 'record',
            scope: 'global', props: { source_domain: 'activity_source', activity_source: validateActivitySource(value), updated_iso: at } });
        if (result?.ok === false) throw failed('SOURCE_WRITE_FAILED');
        return value;
    };
    const serial = task => { const run = queue.then(task); queue = run.catch(() => null); return run; };
    const unsupported = () => ({ ok: true, supported: false, state: 'unsupported' });
    const view = (source, value) => ({ ok: true, supported: true, source, state: value?.connected ? 'connected' : 'disconnected',
        categories: value?.categories || [], ...(value?.last_sync_at ? { last_sync_at: value.last_sync_at } : {}),
        history_done: value?.history_done === true });

    const state = async () => {
        if (!sourceOf() || !owner.describe().supported) return unsupported();
        const place = await where();
        return view(place.source, await readSource(place));
    };

    // Pages until the store says there is no more (or MAX_PAGES); the anchor kept after each written page.
    const pull = async (place, current) => {
        let value = current, counts = { added: 0, updated: 0, unchanged: 0, rejected: 0, deleted: 0 }, more = true, pages = 0;
        while (more && pages < MAX_PAGES) {
            const page = await owner.activities.read({ categories: value.categories, anchor: value.anchor ?? null,
                ...(value.anchor || !value.last_sync_at ? {} : { from: Date.parse(value.last_sync_at) - EXPIRED_MARGIN_MS }) });
            if (!page.ok && page.error === 'health_anchor_expired' && value.anchor) {
                const { anchor: _expired, ...rest } = value;
                value = await writeSource(place, rest);
                continue;
            }
            if (!page.ok) return { ok: false, error: page.error, ...counts };
            if (actor() !== place.person) return { ok: false, error: 'CONTEXT_CHANGED', ...counts };
            if (page.activities.length) {
                const written = await imports.apply({ source: place.source, activities: page.activities });
                ['added', 'updated', 'unchanged'].forEach(key => { counts[key] += written[key]; });
            }
            counts.rejected += page.rejected; counts.deleted += page.deleted;
            more = page.more; pages += 1;
            value = await writeSource(place, { ...value, anchor: page.anchor, ...(more ? {} : { history_done: true, last_sync_at: new Date(now()).toISOString() }) });
        }
        return { ok: true, ...counts, more, ...(value.last_sync_at ? { last_sync_at: value.last_sync_at } : {}) };
    };

    const sync = () => serial(async () => {
        if (!sourceOf() || !owner.describe().supported) return { ok: false, error: 'health_host_unsupported' };
        const place = await where(), current = await readSource(place);
        if (!current?.connected) return { ok: false, error: 'NOT_CONNECTED' };
        return pull(place, current);
    });

    // `categories`: what the person chose to import, the sessions always among them.
    const connect = ({ categories = ACTIVITY_SOURCE_CATEGORIES } = {}) => serial(async () => {
        if (!sourceOf() || !owner.describe().supported) return { ok: false, error: 'health_host_unsupported' };
        const chosen = ACTIVITY_SOURCE_CATEGORIES.filter(category => category === 'workouts' || categories.includes(category));
        const place = await where();
        const linked = await owner.linkStatus();
        if (!linked.linked) {
            const made = await owner.link();
            if (!made.ok) return { ok: false, error: made.error };
        }
        const access = await owner.requestAccess(monitorsOf(chosen));
        if (!access.ok) return { ok: false, error: access.error };
        const previous = await readSource(place), at = new Date(now()).toISOString();
        // A connection reads the whole authorized history again (the categories may have changed); each session is kept once.
        const { disconnected_at: _gone, anchor: _anchor, history_done: _done, last_sync_at: _last, ...kept } = previous || {};
        const value = await writeSource(place, { ...kept, version: 1, source: place.source, device: place.device, connected: true,
            categories: chosen, connected_at: at });
        // Health Connect says which types stayed refused; HealthKit never does (its reads of them just find nothing).
        const refused = Array.isArray(access.notGranted) ? chosen.filter(category => monitorsOf([category]).some(id => access.notGranted.includes(id))) : [];
        return { ...(await pull(place, value)), state: 'connected', categories: chosen, refused };
    });

    const disconnect = () => serial(async () => {
        if (!sourceOf() || !owner.describe().supported) return { ok: false, error: 'health_host_unsupported' };
        const place = await where(), current = await readSource(place);
        if (!current?.connected) return { ok: true, state: 'disconnected' };
        const { anchor: _anchor, history_done: _done, ...kept } = current;
        await writeSource(place, { ...kept, connected: false, disconnected_at: new Date(now()).toISOString() });
        return { ok: true, state: 'disconnected', kept_imported: true };
    });

    // The store's own place where each category's access is withdrawn (Settings › Health, Health Connect).
    const openSettings = async () => {
        if (!sourceOf() || !owner.describe().supported) return { ok: false, error: 'health_host_unsupported' };
        return owner.openSettings(monitorsOf(ACTIVITY_SOURCE_CATEGORIES));
    };

    const guarded = task => async (...args) => {
        try { return await task(...args); }
        catch (error) { return { ok: false, error: error?.code || error?.message || 'health_sync_failed' }; }
    };
    return Object.freeze({ state: guarded(state), connect: guarded(connect), sync: guarded(sync), disconnect: guarded(disconnect),
        openSettings: guarded(openSettings) });
}
