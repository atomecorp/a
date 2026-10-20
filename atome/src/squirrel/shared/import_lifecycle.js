import { createCanonicalImport, createImportSnapshot, IMPORT_SOURCE_TYPE, importIdentity, importRecordId, importRecordProps } from './canonical_import.js';
import { getLocalSurfaceId } from '../apis/unified/adole_api/surfaces.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { sameImportValue } from './import_reconciliation.js';

// A native book is read on one device. Contact and calendar identifiers belong
// to the system stores and survive an app reinstall, unlike the WebView surface
// id: both keys are stable and records seen under the device-scoped keys used
// before Oct. 2026 (`macos_contacts/<surface>`, `native_calendar/<surface>`) are
// adopted, never duplicated. The checkpoint (cursor) stays per device.
const FORMERLY_DEVICE_SCOPED = new Set(['macos_contacts', 'native_calendar']);
const sourceKeyFor = (id) => id;

/** One cancellable, serialized collector per configured source and account. */
// This installation's identity for native imports. In Tauri it is kept by the app
// (its data folder survives a rebuilt debug app, its WebView storage does not):
// otherwise every rebuild was a new device, the imports stopped resuming and later
// re-read the whole agenda history. A browser keeps its surface id.
let installationDevice = null;
export const resolveImportDevice = (env = globalThis) => installationDevice || (installationDevice = (async () => {
    const surface = getLocalSurfaceId();
    const invoke = (env.window || env)?.__TAURI_INTERNALS__?.invoke;
    if (typeof invoke !== 'function') return surface;
    const id = String(await invoke('native_import_device_id', { candidate: surface }) || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('import_device_id_invalid');
    return id;
})().catch((error) => { installationDevice = null; throw error; }));

export function createImportLifecycle({ domain, run, restore, env = globalThis, api, session = getSessionState,
    device = null, intervalMs = 300000, recoveryVersion = '' } = {}) {
    let deviceId = '';
    const ensureDevice = async () => (deviceId ||= device ? device() : await resolveImportDevice(env));
    const store = createCanonicalImport({ type: domain, api, session });
    const active = new Map();
    let timer = null, generation = 0, disposed = false, resuming = null, owner = null;
    // Seulement les pages qui ont ecrit quelque chose (et les echecs) : un cycle sans
    // nouveaute (retour au premier plan, minuterie) ne fait relire ni le Dashboard ni
    // le Calendrier. `changed` null = inconnu, donc annonce.
    const notify = (source_id, result, changed = null) => {
        if (result?.ok === true && changed === 0) return;
        if (env.dispatchEvent && env.CustomEvent) env.dispatchEvent(new env.CustomEvent('squirrel:import-updated', { detail: {
            domain, source_id, ok: result?.ok === true, error: result?.ok === false ? result.error : null, changed
        } }));
    };
    const cycle = (id, options = {}) => {
        const entry = active.get(id);
        if (!entry || disposed) return Promise.resolve({ ok: false, error: 'import_source_inactive' });
        entry.pending = true;
        if (entry.running) return entry.running;
        const currentGeneration = generation;
        entry.running = (async () => {
            let result, recovering = null;
            // The pages of this pass share their table reads (canonical_import.js).
            const snapshot = createImportSnapshot();
            while (entry.pending && currentGeneration === generation && !entry.controller.signal.aborted) {
                entry.pending = false;
                const context = store.capture();
                const checkpoints = await store.list(IMPORT_SOURCE_TYPE, context);
                const checkpoint = checkpoints.find(row => importRecordId(row) === entry.checkpointId);
                const props = importRecordProps(checkpoint);
                // Recuperation unique (par version) : relecture complete sans curseur
                // et restauration de ce qu'une reecriture globale avait supprime.
                const startRecovery = recovering === null && Boolean(recoveryVersion) && props.recovery !== recoveryVersion;
                if (recovering === null) recovering = startRecovery;
                const cursor = startRecovery ? null : (props.cursor ?? null);
                result = await run(id, { ...entry.config, ...options, source_key: entry.sourceKey,
                    ...(FORMERLY_DEVICE_SCOPED.has(id) && !entry.config.source_key ? { legacy_source_prefix: `${id}/` } : {}),
                    device_id: entry.deviceId, cursor, incremental: cursor != null,
                    ...(recovering ? { restore_suppressed: true } : {}),
                    signal: entry.controller.signal, checkSession: context.check, snapshot });
                context.check();
                if (currentGeneration === generation) notify(id, result, typeof result?.changed === 'number' ? result.changed : null);
                if (result?.ok === true && result.more === true) entry.pending = true;
                else if (result?.ok === true && recovering) {
                    const rows = await store.list(IMPORT_SOURCE_TYPE, context);
                    const latest = importRecordProps(rows.find(row => importRecordId(row) === entry.checkpointId));
                    await store.write(entry.checkpointId, IMPORT_SOURCE_TYPE, { ...latest, domain_type: domain, source_key: entry.sourceKey,
                        device_id: entry.deviceId, recovery: recoveryVersion }, context);
                    recovering = false;
                }
            }
            // The first complete pass that succeeded (even with nothing to import) is
            // the fact « imported on this device »: written once on the checkpoint,
            // never inferred from a permission asked or a list left empty.
            if (result?.ok === true && result.more !== true && currentGeneration === generation && !entry.controller.signal.aborted) {
                const context = store.capture();
                const rows = await store.list(IMPORT_SOURCE_TYPE, context);
                const latest = importRecordProps(rows.find(row => importRecordId(row) === entry.checkpointId));
                if (!latest.last_completed_at) await store.write(entry.checkpointId, IMPORT_SOURCE_TYPE, { ...latest, domain_type: domain,
                    source_key: entry.sourceKey, source_id: id, device_id: entry.deviceId, last_completed_at: new Date().toISOString() }, context);
            }
            return result;
        })().catch(async error => {
            const result = { ok: false, error: /^[a-z][a-z0-9_]{1,100}$/.test(error.message) ? error.message : 'import_read_failed' };
            if (currentGeneration === generation && active.get(id) === entry && /permission_denied|full_access_required/.test(result.error)) {
                try { await deactivate(id); }
                catch (stopError) { result.error = stopError.message === 'import_session_changed' ? stopError.message : 'import_stop_failed'; }
            }
            if (currentGeneration === generation && !entry.controller.signal.aborted) notify(id, result);
            return result;
        }).finally(() => { entry.running = null; });
        return entry.running;
    };
    const stopRuntime = () => {
        generation += 1;
        for (const entry of active.values()) {
            entry.controller.abort();
            if (entry.debounce) clearTimeout(entry.debounce);
        }
        active.clear();
        owner = null;
        if (timer) clearInterval(timer);
        timer = null;
    };
    const install = async (id, config, context) => {
        const deviceId = await ensureDevice();
        const sourceKey = String(config.source_key || sourceKeyFor(id, deviceId));
        const checkpointId = `source_${await importIdentity([context.owner, domain, sourceKey, deviceId])}`;
        context.check();
        owner = context.owner;
        const existing = active.get(id);
        if (existing && existing.sourceKey === sourceKey) { existing.config = config; return existing; }
        if (existing) existing.controller.abort();
        const entry = { config, sourceKey, deviceId, checkpointId, controller: new AbortController(), pending: false };
        active.set(id, entry);
        if (!timer) timer = setInterval(() => {
            if (env.document?.visibilityState === 'hidden') return;
            for (const key of active.keys()) void cycle(key);
        }, intervalMs);
        return entry;
    };
    const activate = async (id, config = {}) => {
        if (disposed) throw new Error('import_lifecycle_disposed');
        const context = store.capture();
        const safeConfig = Object.fromEntries(['source_key', 'auth_ref', 'addressbook_url', 'calendar_url', 'collections', 'start_year', 'future_years']
            .filter(key => config[key] !== undefined).map(key => [key, config[key]]));
        const previousRun = active.get(id)?.running;
        if (previousRun) await previousRun;
        context.check();
        const entry = await install(id, safeConfig, context);
        context.check();
        const states = await store.list(IMPORT_SOURCE_TYPE, context);
        const previous = importRecordProps(states.find(row => importRecordId(row) === entry.checkpointId));
        await store.write(entry.checkpointId, IMPORT_SOURCE_TYPE, { ...previous, domain_type: domain, source_key: entry.sourceKey,
            ...(!sameImportValue(previous.config, safeConfig) ? { cursor: null, coverage: null } : {}),
            source_id: id, device_id: entry.deviceId, enabled: true, config: safeConfig }, context);
        const result = await cycle(id, config);
        return result;
    };
    const deactivate = async id => {
        const context = store.capture(), entry = active.get(id);
        if (!entry) return { ok: false, error: 'import_source_inactive' };
        entry.controller.abort(); active.delete(id);
        if (entry.debounce) clearTimeout(entry.debounce);
        const rows = await store.list(IMPORT_SOURCE_TYPE, context);
        const previous = importRecordProps(rows.find(row => importRecordId(row) === entry.checkpointId));
        await store.write(entry.checkpointId, IMPORT_SOURCE_TYPE, { ...previous, enabled: false }, context);
        if (!active.size && timer) { clearInterval(timer); timer = null; }
        return { ok: true };
    };
    const resume = () => {
        if (resuming || disposed || session()?.mode !== 'authenticated') return resuming || Promise.resolve();
        const resumeGeneration = generation;
        resuming = (async () => {
            const context = store.capture(), rows = await store.list(IMPORT_SOURCE_TYPE, context);
            const currentDevice = await ensureDevice();
            for (const row of rows) {
                const props = importRecordProps(row);
                if (!props.enabled || props.domain_type !== domain || props.device_id !== currentDevice) continue;
                await restore?.(props.source_id, props.config || {});
                context.check();
                const entry = await install(props.source_id, props.config || {}, context);
                // A checkpoint written under a former key moves to the current one
                // (without its cursor: one full read adopts the former records).
                if (importRecordId(row) !== entry.checkpointId) {
                    const current = importRecordProps(rows.find(other => importRecordId(other) === entry.checkpointId));
                    await store.write(entry.checkpointId, IMPORT_SOURCE_TYPE, { recovery: props.recovery, ...current, domain_type: domain,
                        source_key: entry.sourceKey, source_id: props.source_id, device_id: entry.deviceId, enabled: true, config: props.config || {} }, context);
                    await store.write(importRecordId(row), IMPORT_SOURCE_TYPE, { ...props, enabled: false }, context);
                }
                void cycle(props.source_id);
            }
        })().catch(error => { if (resumeGeneration === generation) notify(null, { ok: false, error: 'import_resume_failed' }); })
            .finally(() => { resuming = null; });
        return resuming;
    };
    const onResume = () => { void resume(); for (const id of active.keys()) void cycle(id); };
    const onLogin = event => {
        // A token renewal re-announces the same account: its imports go on.
        if (active.size && owner && String(event?.detail?.userId ?? '') === owner) return;
        const previousResume = resuming;
        stopRuntime();
        if (previousResume) void previousResume.finally(() => resume());
        else void resume();
    };
    const onNativeChange = event => {
        if (event.detail?.domain && event.detail.domain !== domain) return;
        for (const [id, entry] of active) {
            if (entry.debounce) clearTimeout(entry.debounce);
            entry.debounce = setTimeout(() => { entry.debounce = null; void cycle(id); }, 500);
        }
    };
    const bindings = [['online', onResume], ['pageshow', onResume], ['squirrel:user-logged-in', onLogin],
        ['squirrel:auth-checked', onResume], ['squirrel:user-logged-out', stopRuntime], ['atome:native-source-changed', onNativeChange]];
    bindings.forEach(([name, listener]) => env.addEventListener?.(name, listener));
    const onVisibility = () => { if (env.document?.visibilityState !== 'hidden') onResume(); };
    env.document?.addEventListener?.('visibilitychange', onVisibility);
    if (session()?.mode === 'authenticated') void resume();
    // The sources this device has imported completely at least once (the checkpoint's `last_completed_at`).
    const completed = async () => {
        if (session()?.mode !== 'authenticated') return [];
        const context = store.capture(), currentDevice = await ensureDevice();
        const rows = await store.list(IMPORT_SOURCE_TYPE, context);
        return rows.map(importRecordProps).filter(props => props.domain_type === domain && props.device_id === currentDevice && props.last_completed_at)
            .map(props => ({ source_id: props.source_id, completed_at: props.last_completed_at }));
    };
    return { activate, deactivate, cycle, resume, completed, status: () => [...active].map(([source_id, entry]) => ({ source_id, running: !!entry.running })),
        dispose() { disposed = true; stopRuntime(); bindings.forEach(([name, listener]) => env.removeEventListener?.(name, listener));
            env.document?.removeEventListener?.('visibilitychange', onVisibility); } };
}
