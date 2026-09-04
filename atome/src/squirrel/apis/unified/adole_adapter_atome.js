// Extracted from adole_adapter.js: the adapter's `atome` API sub-object (commit/list/get/etc.),
// built per-adapter from the WS accessor + token key.
import { sanitizeAtomeProperties } from '../../../shared/atome_contract.js';
import { getToken } from './adole_connection.js';

const normalizeCommitEvent = (event = {}) => {
    const rawProps = event.props || event.properties || event.patch || event.delta || event.payload?.props || null;
    const sourcePayload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const normalizedEvent = {
        ...event,
        kind: event.kind || event.event || 'set',
        atome_id: event.atome_id || event.atomeId || event.id || null,
        project_id: event.project_id || event.projectId || null,
        ...(event.parent_id || event.parentId ? { parent_id: event.parent_id || event.parentId } : {}),
        payload: {
            ...sourcePayload,
            props: rawProps && typeof rawProps === 'object' ? sanitizeAtomeProperties(rawProps) : {},
            delete_keys: sourcePayload.delete_keys || sourcePayload.deleteKeys || event.delete_keys || event.deleteKeys || [],
            expected_versions: sourcePayload.expected_versions || sourcePayload.expectedVersions
                || event.expected_versions || event.expectedVersions || {}
        }
    };
    delete normalizedEvent.id;
    delete normalizedEvent.atomeId;
    delete normalizedEvent.projectId;
    delete normalizedEvent.parentId;
    delete normalizedEvent.props;
    delete normalizedEvent.properties;
    delete normalizedEvent.patch;
    delete normalizedEvent.delta;
    delete normalizedEvent.delete_keys;
    delete normalizedEvent.deleteKeys;
    delete normalizedEvent.expected_versions;
    delete normalizedEvent.expectedVersions;
    return normalizedEvent;
};

export const buildAtomeApi = ({ getWs, tokenKey }) => ({
            async commit(event = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'events',
                    action: 'commit',
                    token,
                    event: normalizeCommitEvent(event)
                });
            },
            async commitBatch(events = []) {
                const token = getToken(tokenKey);
                const normalizedEvents = Array.isArray(events)
                    ? events.map(normalizeCommitEvent)
                    : [];
                return getWs().send({
                    type: 'events',
                    action: 'commit-batch',
                    token,
                    events: normalizedEvents
                });
            },
            async create(data) {
                const token = getToken(tokenKey);
                const ownerId = data.owner_id || data.user_id || data.ownerId || data.owner || null;
                const properties = sanitizeAtomeProperties(data?.properties || data?.particles || data);
                const resolvedId = data.atome_id || data.id || data.atomeId || null;
                const resolvedType = data.atome_type || data.type || data.kind || data.atomeType || null;
                const parentId = data.parent_id || data.parent || data.parentId || null;
                const payload = {
                    type: 'atome',
                    action: 'create',
                    token,
                    id: resolvedId,  // Allow specifying ID for sync operations
                    atome_type: resolvedType,
                    atome_id: resolvedId,
                    parent_id: parentId,
                    particles: properties
                };
                if (data && Object.prototype.hasOwnProperty.call(data, 'sync')) {
                    payload.sync = data.sync;
                }
                if (ownerId) {
                    payload.owner_id = ownerId;
                }
                return getWs().send(payload);
            },
            async get(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'get',
                    token,
                    atome_id: id
                });
            },
            async list(params = {}) {
                const token = getToken(tokenKey);
                const ownerId = params.owner_id || params.user_id || params.ownerId;
                const parentId = params.parent_id || params.parent;
                const atomeType = params.atome_type || params.type || params.kind;
                const includeDeleted = params.include_deleted || params.includeDeleted || false;
                return getWs().send({
                    type: 'atome',
                    action: 'list',
                    token,
                    atome_type: atomeType,
                    parent_id: parentId,
                    owner_id: ownerId,
                    since: params.since || params.updated_since || params.updatedSince || null,
                    exclude_particle_keys: Array.isArray(params.excludeParticleKeys || params.exclude_particle_keys)
                        ? (params.excludeParticleKeys || params.exclude_particle_keys)
                        : [],
                    include_deleted: includeDeleted,
                    limit: params.limit,
                    offset: params.offset || ((params.page || 0) * (params.limit || 50))
                });
            },
            async softDelete(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'soft-delete',
                    token,
                    atome_id: id
                });
            },
            async alter(id, data) {
                const token = getToken(tokenKey);
                const properties = sanitizeAtomeProperties(data?.properties || data?.particles || data);
                return getWs().send({
                    type: 'atome',
                    action: 'alter',
                    token,
                    atome_id: id,
                    particles: properties
                });
            },
            async update(id, data) {
                const token = getToken(tokenKey);
                const properties = sanitizeAtomeProperties(data?.properties || data?.particles || data);
                return getWs().send({
                    type: 'atome',
                    action: 'update',
                    token,
                    atome_id: id,
                    particles: properties
                });
            },
            async transferOwner(data = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'transfer-owner',
                    token,
                    from_owner_id: data.from_owner_id || data.fromOwnerId || data.fromOwner || null,
                    to_owner_id: data.to_owner_id || data.toOwnerId || data.toOwner || null,
                    include_creator: data.includeCreator !== false,
                    operation_id: data.operation_id || data.operationId || null,
                    adoption_confirmed: data.adoption_confirmed === true || data.adoptionConfirmed === true
                });
            },

            // Broadcast-only realtime patch (no DB write)
            async realtime(atomeId, particles) {
                const token = getToken(tokenKey);
                const properties = sanitizeAtomeProperties(particles?.properties || particles?.particles || particles);
                const ws = getWs();
                const message = {
                    type: 'atome',
                    action: 'realtime',
                    token,
                    atome_id: atomeId,
                    particles: properties,
                    noReply: true
                };

                if (ws && typeof ws.sendFireAndForget === 'function') {
                    return ws.sendFireAndForget(message);
                }
                return ws.send(message);
            },
            async delete(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'delete',
                    token,
                    atome_id: id
                });
            },
            async history(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'atome',
                    action: 'history',
                    token,
                    atome_id: id
                });
            },
            async undo(sourceTxId, requestId) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'history', action: 'undo', token,
                    source_tx_id: sourceTxId,
                    requestId
                });
            },
            async redo(sourceTxId, requestId) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'history', action: 'redo', token,
                    source_tx_id: sourceTxId,
                    requestId
                });
            },
            async restore(id, data) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'snapshot',
                    action: 'restore',
                    token,
                    snapshot_id: data?.snapshot_id || data?.snapshotId || data?.id || id,
                    tx_id: data?.tx_id || data?.txId || null
                });
            },
            async getStateCurrent(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'state-current',
                    action: 'get',
                    token,
                    atome_id: id
                });
            },
            async listStateCurrent(params = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'state-current',
                    action: 'list',
                    token,
                    atome_type: params.atome_type || params.atomeType || params.type || null,
                    project_id: params.project_id || params.projectId || params.parent_id || params.parentId || null,
                    include_shared: params.include_shared === true || params.includeShared === true,
                    include_total: params.include_total === true || params.includeTotal === true,
                    exclude_system: params.exclude_system === true || params.excludeSystem === true,
                    exclude_particle_keys: Array.isArray(params.excludeParticleKeys || params.exclude_particle_keys)
                        ? (params.excludeParticleKeys || params.exclude_particle_keys)
                        : [],
                    limit: params.limit,
                    offset: params.offset
                });
            },
            async listEvents(params = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'events',
                    action: 'list',
                    token,
                    project_id: params.project_id || params.projectId || null,
                    atome_id: params.atome_id || params.atomeId || null,
                    tx_id: params.tx_id || params.txId || null,
                    gesture_id: params.gesture_id || params.gestureId || null,
                    since: params.since || null,
                    until: params.until || null,
                    order: params.order,
                    limit: params.limit,
                    offset: params.offset
                });
            },
            async conditions(params = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'conditions',
                    action: params.action || 'once',
                    token,
                    request: params.request || params
                });
            },
            async createSnapshot(params = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'snapshot',
                    action: 'create',
                    token,
                    project_id: params.project_id || params.projectId || null,
                    atome_id: params.atome_id || params.atomeId || null,
                    label: params.label || null,
                    state: params.state || params.state_blob || params.stateBlob || null,
                    snapshot_type: params.snapshot_type || params.snapshotType || 'manual'
                });
            },
            async listSnapshots(params = {}) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'snapshot',
                    action: 'list',
                    token,
                    project_id: params.project_id || params.projectId || null,
                    limit: params.limit,
                    offset: params.offset
                });
            },
            async getSnapshot(id) {
                const token = getToken(tokenKey);
                return getWs().send({
                    type: 'snapshot',
                    action: 'get',
                    token,
                    snapshot_id: id
                });
            }
});
