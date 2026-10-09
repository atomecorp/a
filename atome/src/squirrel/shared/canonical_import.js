import { getSessionState } from '../apis/unified/adole_api/session.js';
import { importData, reconcileImport, sameImportValue, compareImportVersion } from './import_reconciliation.js';

export const IMPORT_ORIGIN_TYPE = 'import_origin';
export const IMPORT_SOURCE_TYPE = 'import_source_state';
export const importRecordProps = row => row?.properties || row?.particles || {};
export const importRecordId = row => row?.atome_id || row?.id;
export const importRecordDeleted = row => !!(row?.deleted_at || row?.deleted || importRecordProps(row).__deleted);
const externalHref = input => {
    if (!input.href) return '';
    const base = input.source_collection || input.raw?.source_collection || input.addressbookId || input.raw?.addressbookId;
    return base ? new URL(input.href, base).href : String(input.href);
};

export async function importIdentity(parts) {
    const input = new TextEncoder().encode(JSON.stringify(parts));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Durable import bookkeeping uses the same private Atomes as domain objects. */
export function createCanonicalImport({ type, api = () => globalThis.window?.Atome || globalThis.Atome,
    session = getSessionState, normalize = value => value } = {}) {
    const fieldGroups = type === 'calendar_event'
        ? [['start', 'end', 'timezone', 'all_day', 'recurrence', 'recurrence_id', 'exdates', 'rdates', 'icalendar']]
        : type === 'contact' ? [['phone', 'phones'], ['email', 'emails']] : [];
    const capture = () => {
        const state = session();
        if (state?.mode !== 'authenticated' || !state.user?.id) throw new Error('import_authenticated_owner_required');
        const owner = String(state.user.id), stamp = state.updatedAt;
        const check = () => {
            const active = session();
            if (active?.mode !== 'authenticated' || String(active.user?.id) !== owner || active.updatedAt !== stamp) throw new Error('import_session_changed');
        };
        const store = api();
        if (!store?.commit || !store?.listStateCurrent) throw new Error('canonical_import_api_unavailable');
        return { owner, check, store };
    };
    const list = async (recordType = type, context = capture()) => {
        const rows = [];
        // Import bookkeeping reaches tens of thousands of rows (contacts and
        // calendars share the origins): 1000-row pages keep a full read to a few
        // dozen requests instead of hundreds.
        for (let offset = 0; ; offset += 1000) {
            context.check();
            const page = await context.store.listStateCurrent(null, { atomeType: recordType, includeDeleted: true, limit: 1000, pageSize: 1000, offset });
            context.check();
            if (!Array.isArray(page)) throw new Error('canonical_import_read_invalid');
            rows.push(...page.filter(row => !row.owner_id || String(row.owner_id) === context.owner));
            if (page.length < 1000) return rows;
        }
    };
    const write = async (id, recordType, props, context, kind = 'set') => {
        context.check();
        const result = await context.store.commit({ kind, atome_id: id, type: recordType, scope: 'global',
            ...(kind === 'set' ? { props: importData({ ...props, access: 'private', visibility: 'private' }) } : {}) });
        context.check();
        if (result?.ok !== true) throw new Error(result?.error || 'canonical_import_commit_failed');
        return result;
    };
    const identify = async (input, source, context) => {
        const externalId = String(input.source_contact_id || input.source_event_id || input.uid || input.id || '').trim();
        if (!externalId) throw new Error('import_external_identity_required');
        const occurrence = input.recurrence_id || input.recurrenceId || '';
        const originId = `origin_${await importIdentity([context.owner, type, source,
            input.source_collection || input.raw?.source_collection || '', externalId, occurrence])}`;
        return { externalId, occurrence, originId };
    };
    const resolveIds = async (items, source) => {
        const context = capture(), origins = await list(IMPORT_ORIGIN_TYPE, context);
        const rows = origins.map(importRecordProps).filter(props => props.domain_type === type && props.source_key === source);
        const ids = new Map(rows.map(props => [props.external_id, props.canonical_id]));
        for (const input of items) {
            const { externalId, originId } = await identify(input, source, context);
            ids.set(externalId, rows.find(props => props.external_id === externalId)?.canonical_id || `${type}_${originId.slice(7)}`);
        }
        context.check(); return ids;
    };
    const collect = async (items, meta = {}) => {
        meta.checkSession?.();
        const context = capture();
        const sessionCheck = context.check;
        context.check = () => { sessionCheck(); meta.checkSession?.(); if (meta.signal?.aborted) throw new Error('import_cancelled'); };
        if (!Array.isArray(items)) throw new Error('import_items_invalid');
        const source = String(meta.source_key || meta.imported_from_source || '').trim();
        if (!source) throw new Error('import_source_identity_required');
        if (meta.signal?.aborted) throw new Error('import_cancelled');
        const [records, origins] = await Promise.all([list(type, context), list(IMPORT_ORIGIN_TYPE, context)]);
        const byId = new Map(records.map(row => [importRecordId(row), row]));
        const byOrigin = new Map(origins.map(row => [importRecordId(row), importRecordProps(row)]));
        let changed = 0, skipped = 0;
        for (const input of items) {
            context.check();
            meta.checkSession?.();
            if (meta.signal?.aborted) throw new Error('import_cancelled');
            const { externalId, occurrence, originId } = await identify(input, source, context);
            const old = byOrigin.get(originId);
            // Deterministic reservation also survives simultaneous observations on two devices.
            const recordId = old?.canonical_id || `${type}_${originId.slice(7)}`;
            const record = byId.get(recordId);
            if (old?.suppressed || importRecordDeleted(record)) { skipped += 1; continue; }
            const normalized = importData(normalize(input));
            const suppliedVersion = input.version ?? input.raw?.version;
            const modifiedAt = Date.parse(input.updatedAt || input.raw?.updatedAt || '');
            const sequence = input.sequence ?? input.raw?.sequence;
            const revision = suppliedVersion && typeof suppliedVersion === 'object' || Number.isFinite(sequence) || Number.isFinite(modifiedAt)
                ? importData({ ...(suppliedVersion && typeof suppliedVersion === 'object' ? suppliedVersion : {}),
                    ...(Number.isFinite(sequence) ? { sequence } : {}), ...(Number.isFinite(modifiedAt) ? { modified_at: modifiedAt } : {}) })
                : suppliedVersion ?? input.etag ?? null;
            if (old && compareImportVersion(revision, old.external_version) === -1) { skipped += 1; continue; }
            const current = importRecordProps(record);
            // Reserve the correspondence before the object: a crash must reuse its id.
            if (!old) await write(originId, IMPORT_ORIGIN_TYPE, { canonical_id: recordId, domain_type: type,
                source_key: source, external_id: externalId, recurrence_id: occurrence, pending: true, baseline: normalized,
                source_collection: input.source_collection || input.raw?.source_collection || '',
                external_href: externalHref(input) }, context);
            const merged = old && record ? reconcileImport(current, old.baseline, normalized, old.conflicts, fieldGroups) : { properties: normalized, conflicts: {} };
            const next = { ...merged.properties, access: 'private', visibility: 'private',
                exchange_uid: current.exchange_uid || input.uid || input.exchange_uid || recordId };
            if (!record || !sameImportValue(current, next)) {
                await write(recordId, type, next, context);
                const stored = { atome_id: recordId, owner_id: context.owner, properties: next };
                byId.set(recordId, stored);
                changed += 1;
            }
            const origin = { canonical_id: recordId, domain_type: type, source_key: source, external_id: externalId,
                recurrence_id: occurrence, baseline: { ...old?.baseline, ...normalized }, external_version: revision,
                conflicts: merged.conflicts, removed: false, suppressed: false, access: 'private', visibility: 'private',
                source_collection: input.source_collection || input.raw?.source_collection || '',
                external_href: externalHref(input) };
            if (!sameImportValue(old, origin)) await write(originId, IMPORT_ORIGIN_TYPE, origin, context);
            byOrigin.set(originId, origin);
        }
        for (const href of meta.removed_hrefs || []) {
            for (const [id, old] of byOrigin) {
                if (old.domain_type === type && old.source_key === source && old.external_href === href && !old.removed)
                    await write(id, IMPORT_ORIGIN_TYPE, { ...old, removed: true }, context);
            }
        }
        // Only explicit deletion evidence counts; absent or partial snapshots never do.
        for (const externalId of meta.removed_ids || []) {
            for (const [id, old] of byOrigin) {
                if (old.domain_type === type && old.source_key === source && old.external_id === String(externalId) && !old.removed) {
                    await write(id, IMPORT_ORIGIN_TYPE, { ...old, removed: true }, context);
                }
            }
        }
        if (meta.complete === true && meta.cursor != null) {
            const checkpointId = `source_${await importIdentity([context.owner, type, source, meta.device_id || 'connector'])}`;
            const prior = (await list(IMPORT_SOURCE_TYPE, context)).find(row => importRecordId(row) === checkpointId);
            const checkpoint = { ...importRecordProps(prior), domain_type: type, source_key: source, device_id: meta.device_id || 'connector', cursor: meta.cursor,
                coverage: meta.coverage || null };
            if (!sameImportValue(importRecordProps(prior), checkpoint)) await write(checkpointId, IMPORT_SOURCE_TYPE, checkpoint, context);
        }
        return { ok: true, imported: items.length, changed, skipped, durability: 'canonical_commit',
            correspondences: [...byOrigin.values()].filter(p => p.domain_type === type && p.source_key === source),
            local_persisted: true, remote_acknowledgement: 'not_observed', replication: 'existing_pipeline',
            items: [...byId.values()].filter(row => !importRecordDeleted(row)) };
    };
    const create = async input => {
        const context = capture(), id = `${type}_${globalThis.crypto.randomUUID()}`;
        await write(id, type, { ...importData(normalize(input)), access: 'private', visibility: 'private', exchange_uid: globalThis.crypto.randomUUID() }, context);
        return id;
    };
    const replace = async items => {
        const context = capture(), existing = await list(type, context);
        const next = new Map(items.map(row => [row.id || row.source_contact_id, row]));
        const origins = await list(IMPORT_ORIGIN_TYPE, context);
        for (const row of existing.filter(entry => !importRecordDeleted(entry))) {
            const id = importRecordId(row), input = next.get(id);
            if (!input) {
                for (const origin of origins.filter(entry => importRecordProps(entry).canonical_id === id)) {
                    await write(importRecordId(origin), IMPORT_ORIGIN_TYPE, { ...importRecordProps(origin), suppressed: true }, context);
                }
                await write(id, type, null, context, 'delete');
            } else {
                const props = { ...importData(normalize(input)), exchange_uid: importRecordProps(row).exchange_uid };
                if (!sameImportValue(importRecordProps(row), props)) await write(id, type, props, context);
            }
        }
        return { ok: true };
    };
    const suppress = async id => {
        const context = capture();
        for (const origin of await list(IMPORT_ORIGIN_TYPE, context)) {
            const props = importRecordProps(origin);
            if (props.domain_type === type && props.canonical_id === id && !props.suppressed)
                await write(importRecordId(origin), IMPORT_ORIGIN_TYPE, { ...props, suppressed: true }, context);
        }
    };
    return { list, collect, create, replace, capture, write, suppress, resolveIds };
}
