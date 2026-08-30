import {
    eventDeletedPropertyKeys,
    eventExpectedPropertyVersions,
    eventPropertyPatch,
    eventTouchedPropertyKeys,
    resolveEventPayload
} from './adole_event_contract.js';

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
    const prepare = async (event, options = {}) => {
        const atomeId = event?.atome_id || null;
        const touchedKeys = eventTouchedPropertyKeys(event);
        if (!atomeId || !touchedKeys.length) return event;

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

        const before = {};
        const beforeMissing = [];
        const baseVersions = {};
        for (const key of touchedKeys) {
            const row = currentByKey.get(key);
            baseVersions[key] = Number(row?.version || 0);
            if (!row || row.value_type === 'deleted') beforeMissing.push(key);
            else before[key] = parseStoredValue(row.particle_value);
        }

        const sourcePayload = resolveEventPayload(event);
        const payload = sourcePayload && typeof sourcePayload === 'object'
            ? { ...sourcePayload }
            : {};
        payload.props = eventPropertyPatch(event) || {};
        payload.delete_keys = eventDeletedPropertyKeys(event);
        payload.expected_versions = expectedVersions;
        payload.before = before;
        payload.before_missing = beforeMissing;
        payload.base_versions = baseVersions;
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

    return { prepare, applyDeletes };
}
