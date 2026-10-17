import {
    assertIdempotentEventReplay,
    eventIdempotencyIntent,
    eventDeletedPropertyKeys,
    eventExpectedPropertyVersions,
    eventPropertyPatch,
    eventTouchedPropertyKeys,
    resolveEventPayload
} from '../atome/src/shared/adole_event_contract.js';
import { createHash } from 'node:crypto';

const intentHash = event => createHash('sha256').update(JSON.stringify(eventIdempotencyIntent(event))).digest('hex');

const parseStoredValue = (value) => {
    if (value === null || value === undefined) return null;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const versionConflict = () => {
    const error = new Error('property_version_conflict');
    error.code = 'property_version_conflict';
    return error;
};

export function createAdoleEventMutationApi({ query }) {
    const assertReplay = (existing, incoming) => {
        const stored = parseStoredValue(existing.payload) || {};
        if (stored.idempotency_intent_hash) {
            assertIdempotentEventReplay(existing, incoming, {
                existingHash: stored.idempotency_intent_hash, incomingHash: intentHash(incoming)
            });
            return;
        }
        // Before intent hashes, compacted events retained their immutable
        // projection. Only additional no-op values proven by that snapshot may
        // be removed from a legacy retry; identity/version/delete checks remain.
        const projection = parseStoredValue(existing.projection);
        if (existing.kind === 'set' && Object.hasOwn(stored, 'base_versions') && projection?.properties) {
            const recorded = eventPropertyPatch(existing) || {}, patch = eventPropertyPatch(incoming) || {};
            const expected = eventExpectedPropertyVersions(incoming);
            const props = Object.fromEntries(Object.entries(patch).filter(([key, value]) => {
                if (Object.hasOwn(recorded, key) || Object.hasOwn(expected, key) || !Object.hasOwn(projection.properties, key)) return true;
                return JSON.stringify(value) !== JSON.stringify(projection.properties[key]);
            }));
            assertIdempotentEventReplay(existing, { ...incoming, payload: { ...resolveEventPayload(incoming), props } });
            return;
        }
        assertIdempotentEventReplay(existing, incoming);
    };
    const prepare = async (event, options = {}) => {
        const incomingPayload = parseStoredValue(resolveEventPayload(event));
        event = { ...event, payload: { ...(incomingPayload && typeof incomingPayload === 'object' ? incomingPayload : {}),
            idempotency_intent_hash: intentHash(event) } };
        const atomeId = event?.atome_id || null;
        const touchedKeys = eventTouchedPropertyKeys(event);
        if (!atomeId || !touchedKeys.length) return event;

        const identity = await query('get', 'SELECT parent_id, atome_type FROM atomes WHERE atome_id = ?', [atomeId]);
        const rows = await query(
            'all',
            `SELECT particle_key, particle_value, value_type, version
             FROM particles WHERE atome_id = ?`,
            [atomeId]
        );
        const currentByKey = new Map((rows || []).map((row) => [row.particle_key, row]));
        const expectedVersions = eventExpectedPropertyVersions(event);
        if (options.skipExpectedVersions !== true) {
            for (const [key, expected] of Object.entries(expectedVersions)) {
                const row = currentByKey.get(key);
                const currentVersion = Number(row?.version || 0);
                if (currentVersion !== expected) throw versionConflict();
            }
        }

        // Une propriété réécrite à l'IDENTIQUE n'est pas un changement.
        //
        // `setParticle` applique déjà ce garde au niveau de la particule ("A write
        // that changes nothing is not history"), mais l'événement, lui, embarquait
        // le lot complet. Mesuré sur un coffre réel: un enregistrement de profil
        // réémettait `user_face` et `eve_profile` inchangés — 610 Ko chacun — dans
        // `props` ET, en écho, dans `before`; soit 2,4 Mo d'événement pour changer
        // un identifiant de projet. La table `events` pesait 52,9 Mo pour
        // 5 354 lignes, dominant tout le reste du coffre.
        //
        // Retirer ces clés est neutre pour la relecture (les rejouer ne change
        // aucun état), pour la résolution de conflit (aucune écriture, donc rien à
        // arbitrer) et pour la projection (même état résultant).
        const patch = eventPropertyPatch(event) || {};
        const unchangedKeys = new Set();
        for (const key of touchedKeys) {
            if (!(key in patch)) continue;
            const row = currentByKey.get(key);
            if (!row || row.value_type === 'deleted') continue;
            if (identity && (key === 'parent_id' || key === 'parentId')) continue;
            if (identity && ['kind', 'type', 'atome_type'].includes(key)) continue;
            if (key in expectedVersions) continue;
            let storedJson = row.particle_value;
            let patchJson;
            try { patchJson = JSON.stringify(patch[key]); } catch { continue; }
            if (patchJson !== undefined && patchJson === storedJson) unchangedKeys.add(key);
        }

        const effectiveKeys = touchedKeys.filter((key) => !unchangedKeys.has(key));
        const before = {};
        const beforeMissing = [];
        const baseVersions = {};
        for (const key of effectiveKeys) {
            const row = currentByKey.get(key);
            baseVersions[key] = Number(row?.version || 0);
            if (identity && (key === 'parent_id' || key === 'parentId')) before[key] = identity.parent_id;
            else if (identity && ['kind', 'type', 'atome_type'].includes(key)) before[key] = identity.atome_type;
            else if (!row || row.value_type === 'deleted') beforeMissing.push(key);
            else before[key] = parseStoredValue(row.particle_value);
        }

        const sourcePayload = resolveEventPayload(event);
        const payload = sourcePayload && typeof sourcePayload === 'object'
            ? { ...sourcePayload }
            : {};
        payload.props = unchangedKeys.size
            ? Object.fromEntries(Object.entries(patch).filter(([key]) => !unchangedKeys.has(key)))
            : patch;
        payload.delete_keys = eventDeletedPropertyKeys(event);
        payload.expected_versions = expectedVersions;
        payload.before = before;
        payload.before_identity = identity ? { parent_id: identity.parent_id, atome_type: identity.atome_type } : null;
        payload.before_missing = beforeMissing;
        payload.base_versions = baseVersions;
        // Compact the patch without losing the original delivery identity or
        // duplicating large unchanged profile/media properties in the journal.
        return { ...event, payload };
    };

    const applyDeletes = async ({ atomeId, keys, author = null, timestamp, eventId = null }) => {
        for (const key of keys || []) {
            const row = await query(
                'get',
                `SELECT particle_id, particle_value, value_type, version
                 FROM particles WHERE atome_id = ? AND particle_key = ?`,
                [atomeId, key]
            );
            if (!row || row.value_type === 'deleted') continue;
            const version = Number(row.version || 0) + 1;
            await query(
                'run',
                `UPDATE particles SET particle_value = NULL, value_type = 'deleted', version = ?, updated_at = ?
                 WHERE atome_id = ? AND particle_key = ?`,
                [version, timestamp, atomeId, key]
            );
            await query(
                'run',
                `INSERT INTO particles_versions
                 (particle_id, atome_id, particle_key, version, old_value, new_value, changed_by, changed_at, event_id)
                 VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
                [row.particle_id, atomeId, key, version, row.particle_value, author, timestamp, eventId]
            );
        }
    };

    return { prepare, applyDeletes, assertReplay };
}
