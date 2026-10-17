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

// An import cycle (every page of one pass over a source) reads each table once:
// the lifecycle hands its pages one snapshot, and this module's own writes keep it
// current. A history import used to reread the calendar and its 8000+ origins
// (13 s of local database on Tauri) for each year it imported. Outside a cycle,
// and at the start of every cycle, tables are read afresh.
export const createImportSnapshot = () => new Map();
const applySnapshotWrite = (rows, id, kind, props, owner) => {
    const index = rows.findIndex(row => importRecordId(row) === id);
    const current = index >= 0 ? rows[index] : null;
    const next = kind === 'set'
        ? { ...(current || { atome_id: id, owner_id: owner }), properties: { ...importRecordProps(current), ...props } }
        : current && { ...current, deleted: kind === 'delete', deleted_at: kind === 'delete' ? new Date().toISOString() : null,
            properties: { ...importRecordProps(current), __deleted: kind === 'delete' } };
    if (!next) return;
    if (index >= 0) rows[index] = next; else rows.push(next);
};

/** Durable import bookkeeping uses the same private Atomes as domain objects. */
// Fusion d'une observation dans une fiche deja presente (meme identite metier) :
// ce qui est deja rempli gagne (les modifications de l'utilisateur), le vide est
// complete, les listes (numeros, e-mails…) sont reunies sans doublon.
const LIST_IDENTITY = entry => JSON.stringify(entry && typeof entry === 'object' ? (entry.value ?? entry) : entry);
const preferExisting = (current = {}, incoming = {}) => {
    const out = { ...current };
    for (const [key, value] of Object.entries(incoming)) {
        const existing = current[key];
        if (Array.isArray(value) && Array.isArray(existing)) {
            const seen = new Set(existing.map(LIST_IDENTITY));
            out[key] = [...existing, ...value.filter(entry => !seen.has(LIST_IDENTITY(entry)))];
        } else if (existing === undefined || existing === null || existing === '' || (Array.isArray(existing) && !existing.length)) out[key] = value;
    }
    return out;
};

export { preferExisting as preferExistingImportValues };

export function createCanonicalImport({ type, api = () => globalThis.window?.Atome || globalThis.Atome,
    session = getSessionState, normalize = value => value,
    // Identite metier d'une fiche (ex. numeros E.164 d'un contact) : une observation
    // nouvelle qui partage une cle avec une fiche vivante est fusionnee dedans au lieu
    // de creer un doublon (import repete, autre appareil, autre carnet).
    identityKeys = null,
    // Fusion d'une observation dans la fiche reprise par identite (defaut : ce qui
    // est rempli gagne, le vide est complete, les listes sont reunies).
    mergeIntoExisting = preferExisting } = {}) {
    const fieldGroups = type === 'calendar_event'
        ? [['start', 'end', 'timezone', 'all_day', 'recurrence', 'recurrence_id', 'exdates', 'rdates', 'icalendar']]
        : type === 'contact' ? [['phone', 'phones'], ['email', 'emails']] : [];
    const capture = () => {
        const state = session();
        if (state?.mode !== 'authenticated' || !state.user?.id) throw new Error('import_authenticated_owner_required');
        // Identity, not freshness: iOS/Tauri renew the local token of the same
        // account every 14 min (new `updatedAt`), which aborted every long import.
        const owner = String(state.user.id);
        const check = () => {
            const active = session();
            if (active?.mode !== 'authenticated' || String(active.user?.id) !== owner) throw new Error('import_session_changed');
        };
        const store = api();
        if (!store?.commit || !store?.listStateCurrent) throw new Error('canonical_import_api_unavailable');
        return { owner, check, store };
    };
    const list = async (recordType = type, context = capture(), snapshot = null) => {
        const key = `${context.owner}|${recordType}`;
        if (snapshot?.has(key)) return snapshot.get(key).slice();
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
            if (page.length < 1000) break;
        }
        snapshot?.set(key, rows);
        return rows.slice();
    };
    const write = async (id, recordType, props, context, kind = 'set', snapshot = null) => {
        context.check();
        const written = kind === 'set' ? importData({ ...props, access: 'private', visibility: 'private' }) : null;
        const result = await context.store.commit({ kind, atome_id: id, type: recordType, scope: 'global',
            ...(kind === 'set' ? { props: written } : {}) });
        context.check();
        if (result?.ok !== true) { snapshot?.delete(`${context.owner}|${recordType}`); throw new Error(result?.error || 'canonical_import_commit_failed'); }
        const rows = snapshot?.get(`${context.owner}|${recordType}`);
        if (rows) applySnapshotWrite(rows, id, kind, written, context.owner);
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
    // A native book keeps its record identifiers across app reinstalls, while
    // the device-scoped key it was first imported under does not: a record
    // observed under a former key of the same book is adopted, never duplicated.
    // Former origins are found by their external identity; their ids cannot be
    // recomputed (older ones were hashed with another owner id).
    const formerOrigins = (byOrigin, source, prefix) => {
        const index = new Map();
        if (!prefix) return index;
        for (const props of [...byOrigin.values()].sort((a, b) => String(a.source_key).localeCompare(String(b.source_key)))) {
            if (props.domain_type !== type || props.source_key === source || !String(props.source_key).startsWith(prefix)) continue;
            const key = JSON.stringify([props.source_collection || '', props.external_id, props.recurrence_id || '']);
            index.set(key, [...(index.get(key) || []), props]);
        }
        return index;
    };
    const identityIndex = (records) => {
        const index = new Map();
        if (typeof identityKeys !== 'function') return index;
        for (const row of records) {
            if (importRecordDeleted(row)) continue;
            for (const keyValue of identityKeys(importRecordProps(row)) || []) if (keyValue && !index.has(keyValue)) index.set(keyValue, importRecordId(row));
        }
        return index;
    };
    const matchIdentity = (props, index) => {
        if (typeof identityKeys !== 'function') return null;
        for (const keyValue of identityKeys(props) || []) if (keyValue && index.has(keyValue)) return index.get(keyValue);
        return null;
    };
    const adopt = (input, { externalId, occurrence }, former, byId) => {
        const candidates = former.get(JSON.stringify([input.source_collection || input.raw?.source_collection || '', externalId, occurrence])) || [];
        const live = candidates.find(props => byId.has(props.canonical_id) && !importRecordDeleted(byId.get(props.canonical_id)));
        return live || candidates[0] || null;
    };
    const resolveIds = async (items, source, { legacy_source_prefix: prefix, snapshot = null } = {}) => {
        const context = capture();
        const [records, origins] = await Promise.all([prefix || identityKeys ? list(type, context, snapshot) : [], list(IMPORT_ORIGIN_TYPE, context, snapshot)]);
        const byId = new Map(records.map(row => [importRecordId(row), row]));
        const byIdentity = identityIndex(records);
        const byOrigin = new Map(origins.map(row => [importRecordId(row), importRecordProps(row)]));
        const former = formerOrigins(byOrigin, source, prefix);
        // Group members absent from a delta keep their known ids.
        const ids = new Map([...byOrigin.values()].filter(props => props.domain_type === type && props.source_key === source)
            .map(props => [props.external_id, props.canonical_id]));
        for (const input of items) {
            const identity = await identify(input, source, context);
            const old = byOrigin.get(identity.originId) || adopt(input, identity, former, byId);
            const matched = old ? null : matchIdentity(importData(normalize(input)), byIdentity);
            ids.set(identity.externalId, old?.canonical_id || matched || `${type}_${identity.originId.slice(7)}`);
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
        const snapshot = meta.snapshot || null;
        const [records, origins] = await Promise.all([list(type, context, snapshot), list(IMPORT_ORIGIN_TYPE, context, snapshot)]);
        const byId = new Map(records.map(row => [importRecordId(row), row]));
        const byOrigin = new Map(origins.map(row => [importRecordId(row), importRecordProps(row)]));
        const former = formerOrigins(byOrigin, source, meta.legacy_source_prefix);
        const byIdentity = identityIndex(records);
        let changed = 0, skipped = 0, merged_into_existing = 0;
        for (const input of items) {
            context.check();
            meta.checkSession?.();
            if (meta.signal?.aborted) throw new Error('import_cancelled');
            const identity = await identify(input, source, context), { externalId, occurrence, originId } = identity;
            const old = byOrigin.get(originId) || adopt(input, identity, former, byId);
            // Jamais vu sous aucune cle : une fiche vivante de meme identite metier
            // (meme numero…) le recoit, sans doublon.
            const matched = old ? null : matchIdentity(importData(normalize(input)), byIdentity);
            // Deterministic reservation also survives simultaneous observations on two devices.
            const recordId = old?.canonical_id || matched || `${type}_${originId.slice(7)}`;
            let record = byId.get(recordId);
            // Seule une suppression demandee par l'utilisateur fait foi. Une
            // reecriture globale (`replace`) sur un cache incomplet a supprime des
            // contacts a tort : une recuperation explicite les restaure.
            const userDeleted = old?.suppressed_reason === 'user_delete';
            if ((old?.suppressed || importRecordDeleted(record)) && (userDeleted || meta.restore_suppressed !== true)) { skipped += 1; continue; }
            if (record && importRecordDeleted(record)) {
                await write(recordId, type, null, context, 'restore', snapshot);
                record = { ...record, deleted: false, deleted_at: null, properties: { ...importRecordProps(record), __deleted: false } };
            }
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
                external_href: externalHref(input) }, context, 'set', snapshot);
            const merged = old && record ? reconcileImport(current, old.baseline, normalized, old.conflicts, fieldGroups)
                : matched && record ? { properties: mergeIntoExisting(current, normalized, { recordId }), conflicts: {} }
                    : { properties: normalized, conflicts: {} };
            if (matched && record) merged_into_existing += 1;
            const next = { ...merged.properties, access: 'private', visibility: 'private',
                exchange_uid: current.exchange_uid || input.uid || input.exchange_uid || recordId };
            if (!record || !sameImportValue(current, next)) {
                await write(recordId, type, next, context, 'set', snapshot);
                const stored = { atome_id: recordId, owner_id: context.owner, properties: next };
                byId.set(recordId, stored);
                for (const keyValue of (typeof identityKeys === 'function' ? identityKeys(next) : null) || []) if (keyValue && !byIdentity.has(keyValue)) byIdentity.set(keyValue, recordId);
                changed += 1;
            }
            const origin = { canonical_id: recordId, domain_type: type, source_key: source, external_id: externalId,
                recurrence_id: occurrence, baseline: { ...old?.baseline, ...normalized }, external_version: revision,
                conflicts: merged.conflicts, pending: false, removed: false, suppressed: false, access: 'private', visibility: 'private',
                source_collection: input.source_collection || input.raw?.source_collection || '',
                external_href: externalHref(input) };
            if (!sameImportValue(old, origin)) await write(originId, IMPORT_ORIGIN_TYPE, origin, context, 'set', snapshot);
            byOrigin.set(originId, origin);
        }
        for (const href of meta.removed_hrefs || []) {
            for (const [id, old] of byOrigin) {
                if (old.domain_type === type && old.source_key === source && old.external_href === href && !old.removed)
                    await write(id, IMPORT_ORIGIN_TYPE, { ...old, removed: true }, context, 'set', snapshot);
            }
        }
        // Only explicit deletion evidence counts; absent or partial snapshots never do.
        for (const externalId of meta.removed_ids || []) {
            for (const [id, old] of byOrigin) {
                if (old.domain_type === type && old.source_key === source && old.external_id === String(externalId) && !old.removed) {
                    await write(id, IMPORT_ORIGIN_TYPE, { ...old, removed: true }, context, 'set', snapshot);
                }
            }
        }
        if (meta.complete === true && meta.cursor != null) {
            const checkpointId = `source_${await importIdentity([context.owner, type, source, meta.device_id || 'connector'])}`;
            const prior = (await list(IMPORT_SOURCE_TYPE, context, snapshot)).find(row => importRecordId(row) === checkpointId);
            const checkpoint = { ...importRecordProps(prior), domain_type: type, source_key: source, device_id: meta.device_id || 'connector', cursor: meta.cursor,
                coverage: meta.coverage || null };
            if (!sameImportValue(importRecordProps(prior), checkpoint)) await write(checkpointId, IMPORT_SOURCE_TYPE, checkpoint, context, 'set', snapshot);
        }
        return { ok: true, imported: items.length, changed, skipped, merged_into_existing, durability: 'canonical_commit',
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
                    await write(importRecordId(origin), IMPORT_ORIGIN_TYPE, { ...importRecordProps(origin), suppressed: true, suppressed_reason: 'replace' }, context);
                }
                await write(id, type, null, context, 'delete');
            } else {
                const props = { ...importData(normalize(input)), exchange_uid: importRecordProps(row).exchange_uid };
                if (!sameImportValue(importRecordProps(row), props)) await write(id, type, props, context);
            }
        }
        return { ok: true };
    };
    // Inside an import pass, `snapshot` serves the origins already read: a cleanup
    // removing hundreds of former copies reread every origin for each of them.
    const suppress = async (id, { reason = 'user_delete', context = capture(), snapshot = null } = {}) => {
        for (const origin of await list(IMPORT_ORIGIN_TYPE, context, snapshot)) {
            const props = importRecordProps(origin);
            if (props.domain_type === type && props.canonical_id === id && !props.suppressed)
                await write(importRecordId(origin), IMPORT_ORIGIN_TYPE, { ...props, suppressed: true, suppressed_reason: reason }, context, 'set', snapshot);
        }
    };
    // Ecriture d'un seul enregistrement : jamais de reecriture globale depuis une
    // edition unitaire (un cache partiel supprimerait tout ce qui y manque).
    const update = async (id, input) => {
        const context = capture();
        await write(id, type, importData(normalize(input)), context);
        return { ok: true };
    };
    const remove = async (id, { reason = 'user_delete', snapshot = null } = {}) => {
        const context = capture();
        await suppress(id, { reason, context, snapshot });
        await write(id, type, null, context, 'delete', snapshot);
        return { ok: true };
    };
    return { list, collect, create, replace, update, remove, capture, write, suppress, resolveIds };
}
