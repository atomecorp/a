import { createCanonicalImport, IMPORT_SOURCE_TYPE, importIdentity, importRecordId, importRecordProps } from './canonical_import.js';
import { getLocalSurfaceId } from '../apis/unified/adole_api/surfaces.js';
import { getSessionState } from '../apis/unified/adole_api/session.js';
import { sameImportValue } from './import_reconciliation.js';

/** One cancellable, serialized collector per configured source and account. */
export function createImportLifecycle({ domain, run, restore, env = globalThis, api, session = getSessionState,
    device = getLocalSurfaceId, intervalMs = 300000 } = {}) {
    const store = createCanonicalImport({ type: domain, api, session });
    const active = new Map();
    let timer = null, generation = 0, disposed = false, resuming = null;
    const notify = (source_id, result) => {
        if (env.dispatchEvent && env.CustomEvent) env.dispatchEvent(new env.CustomEvent('squirrel:import-updated', { detail: {
            domain, source_id, ok: result?.ok === true, error: result?.ok === false ? result.error : null
        } }));
    };
    const cycle = (id, options = {}) => {
        const entry = active.get(id);
        if (!entry || disposed) return Promise.resolve({ ok: false, error: 'import_source_inactive' });
        entry.pending = true;
        if (entry.running) return entry.running;
        const currentGeneration = generation;
        entry.running = (async () => {
            let result;
            while (entry.pending && currentGeneration === generation && !entry.controller.signal.aborted) {
                entry.pending = false;
                const context = store.capture();
                const checkpoints = await store.list(IMPORT_SOURCE_TYPE, context);
                const checkpoint = checkpoints.find(row => importRecordId(row) === entry.checkpointId);
                const props = importRecordProps(checkpoint);
                result = await run(id, { ...entry.config, ...options, source_key: entry.sourceKey,
                    device_id: entry.deviceId, cursor: props.cursor ?? null, incremental: props.cursor != null,
                    signal: entry.controller.signal, checkSession: context.check });
                context.check();
                if (currentGeneration === generation) notify(id, result);
                if (result?.ok === true && result.more === true) entry.pending = true;
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
        if (timer) clearInterval(timer);
        timer = null;
    };
    const install = async (id, config, context) => {
        const deviceId = device();
        const sourceKey = String(config.source_key || (['macos_contacts', 'native_calendar'].includes(id) ? `${id}/${deviceId}` : id));
        const checkpointId = `source_${await importIdentity([context.owner, domain, sourceKey, deviceId])}`;
        context.check();
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
            for (const row of rows) {
                const props = importRecordProps(row);
                if (!props.enabled || props.domain_type !== domain || props.device_id !== device()) continue;
                await restore?.(props.source_id, props.config || {});
                context.check();
                await install(props.source_id, props.config || {}, context);
                void cycle(props.source_id);
            }
        })().catch(error => { if (resumeGeneration === generation) notify(null, { ok: false, error: 'import_resume_failed' }); })
            .finally(() => { resuming = null; });
        return resuming;
    };
    const onResume = () => { void resume(); for (const id of active.keys()) void cycle(id); };
    const onLogin = () => {
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
    return { activate, deactivate, cycle, resume, status: () => [...active].map(([source_id, entry]) => ({ source_id, running: !!entry.running })),
        dispose() { disposed = true; stopRuntime(); bindings.forEach(([name, listener]) => env.removeEventListener?.(name, listener));
            env.document?.removeEventListener?.('visibilitychange', onVisibility); } };
}
