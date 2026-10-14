import { validateParams } from '../ai/agent_gateway_normalize.js';
import { GPS_TRIP_TYPE } from '../../shared/gps_trip_contract.js';

const error = code => Object.assign(new Error(code), { code });
export function createGpsTripStore({ api, readActor, createId, now = () => new Date().toISOString() }) {
    const actor = () => { const id = readActor(); if (!id) throw error('AUTH_REQUIRED'); return id; };
    const context = id => { if (actor() !== id) throw error('CONTEXT_CHANGED'); };
    const normalize = (record, owner) => {
        if (!record || record.deleted || record.deleted_at || record.properties?.__deleted
            || String(record.owner_id || record.meta?.owner_id || '') !== owner
            || (record.type || record.atome_type || record.properties?.type) !== 'gps_trip'
            || record.project_id) throw error('TRIP_NOT_FOUND');
        return { id: record.id || record.atome_id, properties: record.properties,
            property_versions: record.property_versions, owner_id: owner, updated_at: record.updated_at || record.meta?.updated_at };
    };
    const read = async id => {
        const owner = actor(), record = await api.getStateCurrent(id); context(owner);
        return normalize(record, owner);
    };
    const write = async (id, properties, record, eventId = createId()) => {
        const owner = actor();
        if (!validateParams({ type: 'object', properties: GPS_TRIP_TYPE.schema, additionalProperties: false }, properties).ok)
            throw error('INVALID_ARGUMENT');
        let expected;
        if (record) {
            if (record.owner_id !== owner || !Number.isInteger(record.properties.revision)) throw error('VERSION_CONFLICT');
            // Revision is a canonical particle, written on every trip transaction.
            // Creation writes value 0 at particle version 1; each update increments both.
            expected = { revision: record.properties.revision + 1 };
        }
        context(owner);
        try {
            const result = await api.commit({ id: eventId, kind: 'set', type: 'gps_trip', atome_id: id, scope: 'global',
                payload: { props: properties, ...(expected ? { expected_versions: expected } : {}) } });
            if (result?.ok !== true) {
                const failure = error(result?.error === 'property_version_conflict' ? 'VERSION_CONFLICT' : 'PROVIDER_UNAVAILABLE');
                failure.cause = new Error(String(result?.error || 'COMMIT_RESULT_INVALID'));
                throw failure;
            }
        } catch (failure) { if (String(failure.message).includes('property_version_conflict')) throw error('VERSION_CONFLICT'); throw failure; }
        context(owner); return read(id);
    };
    return {
        read,
        async list({ offset = 0, limit = 1000, activeId = '' } = {}) {
            const owner = actor();
            const records = await api.listStateCurrent(null, { atomeType: 'gps_trip', limit, offset }); context(owner);
            return records.filter(record => !record.deleted && !record.deleted_at && !record.properties?.__deleted
                && !record.project_id && String(record.owner_id || record.meta?.owner_id || '') === owner)
                .map(record => normalize(record, owner)).sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId)
                    || String(b.updated_at || '').localeCompare(String(a.updated_at || '')) || a.id.localeCompare(b.id));
        },
        async create(input) {
            if (!/^[a-zA-Z0-9_-]{1,200}$/.test(input.request_id)) throw error('INVALID_ARGUMENT');
            const id = 'gps_trip_' + input.request_id, owner = actor();
            const previous = await api.getStateCurrent(id); context(owner);
            const identity = { name: input.name || input.destination.label || '', origin: input.origin,
                destination: input.destination, waypoints: input.waypoints || [] };
            if (previous) {
                const record = normalize(previous, owner);
                if (Object.entries(identity).some(([key, value]) => JSON.stringify(record.properties[key]) !== JSON.stringify(value)))
                    throw error('VERSION_CONFLICT');
                return record;
            }
            return write(id, { ...identity, revision: 0, status: 'planned', access: 'private', visibility: 'private' }, null,
                'gps_create_' + input.request_id);
        },
        async update(record, patch) { return write(record.id, { ...patch, revision: record.properties.revision + 1 }, record); }
    };
}
