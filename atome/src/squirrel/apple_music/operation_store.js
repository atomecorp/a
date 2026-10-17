import { stableStringify } from '../ai/agent_gateway_normalize.js';

const fail = code => { throw Object.assign(new Error(code), { code }); };
// A lost native acknowledgement is never a reason to duplicate a playlist or append tracks twice.
// All durable intents/receipts use the existing event pipeline; Apple remains the library authority.
export function createMusicOperationStore({ api, readActor, type = 'apple_music_operation', idPrefix = type + '_', createId = () => crypto.randomUUID() }) {
    const context = owner => { if (!owner) fail('AUTH_REQUIRED'); if (readActor() !== owner) fail('CONTEXT_CHANGED'); };
    const normalize = (record, owner) => {
        if (!record || (record.type || record.atome_type) !== type || record.project_id
            || (record.owner_id || record.meta?.owner_id) !== owner || record.deleted || record.deleted_at || record.properties?.__deleted)
            fail('OPERATION_NOT_FOUND');
        return record;
    };
    const read = async requestId => {
        const owner = readActor(); context(owner);
        const record = await api.getStateCurrent(idPrefix + requestId); context(owner);
        return normalize(record, owner);
    };
    const commit = async (requestId, props, record, eventId = createId()) => {
        const owner = readActor(); context(owner);
        const revision = record?.properties.revision;
        const result = await api.commit({ id: eventId, kind: 'set', type, scope: 'global',
            atome_id: idPrefix + requestId, payload: { props,
                ...(record ? { expected_versions: { revision: revision + 1 } } : {}) } });
        context(owner);
        if (result?.ok !== true) fail(result?.error === 'property_version_conflict' ? 'VERSION_CONFLICT' : 'COMMIT_FAILED');
        return read(requestId);
    };
    return { read,
        async prepare(requestId, request) {
            const owner = readActor(); context(owner);
            const previous = await api.getStateCurrent(idPrefix + requestId); context(owner);
            if (previous) {
                const record = normalize(previous, owner);
                if (stableStringify(record.properties.request) !== stableStringify(request)) fail('OPERATION_CONFLICT');
                return record;
            }
            return commit(requestId, { request, status: 'prepared', revision: 0, access: 'private', visibility: 'private' }, null,
                (type === 'apple_music_operation' ? 'apple_music_prepare_' : idPrefix + 'prepare_') + requestId);
        },
        transition(requestId, record, patch) {
            return commit(requestId, { ...patch, revision: record.properties.revision + 1 }, record);
        }
    };
}
