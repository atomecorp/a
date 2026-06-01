import { v4 as uuidv4 } from 'uuid';
import db from '../database/adole.js';
import { broadcastMessage } from './githubSync.js';
import {
    broadcastAtomeCreate,
    broadcastAtomeDelete,
    broadcastAtomeRealtimePatch,
    inheritPermissionsFromParent
} from './atomeRealtime.js';
import { normalizeCanonicalAtome, sanitizeAtomeProperties } from '../atome/shared/atome_contract.js';
import { formatAtome } from './atomeRouteContract.js';
import { syncAtomeViaWebSocket, updateUserSyncHash } from './atomeSyncRuntime.js';

function registerAtomeCrudRoutes({ server, validateToken }) {
    server.post('/api/atome/create', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { id, type, kind, parent_id, parent, properties, data, owner_id } = request.body;
        const objectId = id || uuidv4();
        const parentValue = parent_id || parent || null;
        const resolvedOwnerId = owner_id || user.id;
        let canonicalCreate = null;
        try {
            canonicalCreate = normalizeCanonicalAtome({
                id: objectId,
                type,
                kind: kind || null,
                properties: properties || data || {}
            }, {
                boundaryAdapter: true
            }).atome;
        } catch (error) {
            return reply.code(400).send({ success: false, error: error.message });
        }

        try {
            if (parentValue && !(await db.canCreate(parentValue, user.id))) {
                return reply.code(403).send({ success: false, error: 'Access denied (create)' });
            }

            const atome = await db.createAtome({
                id: objectId,
                type: canonicalCreate.type,
                kind: canonicalCreate.kind,
                parent: parentValue,
                owner: resolvedOwnerId,
                properties: canonicalCreate.properties,
                creator: user.id
            });

            const formatted = formatAtome(atome);

            try {
                await db.resolvePendingOwners();
            } catch (error) {
                console.warn("[cleanup] operation failed", error);
            }

            try {
                await inheritPermissionsFromParent({
                    parentId: parentValue,
                    childId: objectId,
                    childOwnerId: resolvedOwnerId,
                    grantorId: user.id
                });
            } catch (error) {
                console.warn("[cleanup] operation failed", error);
            }

            try {
                await broadcastAtomeCreate({
                    atomeId: objectId,
                    atomeType: type || 'shape',
                    parentId: parentValue,
                    particles: canonicalCreate.properties,
                    senderUserId: user.id
                });
            } catch (error) {
                console.warn("[cleanup] operation failed", error);
            }

            broadcastMessage({ type: 'atome-created', atome: formatted });
            updateUserSyncHash(user.id).catch((error) => {
                console.warn("[cleanup] operation failed", error);
            });
            syncAtomeViaWebSocket(formatted, 'create');

            return reply.code(201).send({
                success: true,
                message: 'Atome created successfully',
                atome: formatted,
                data: formatted
            });
        } catch (error) {
            console.error('[Atome] Create error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/atome/list', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { type, kind, parent_id, parent, limit = 100, offset = 0 } = request.query;
        const parentValue = parent_id || parent;

        try {
            const options = {
                type,
                limit: parseInt(limit),
                offset: parseInt(offset)
            };
            if (parentValue === 'null' || parentValue === '') options.parent = null;
            else if (parentValue) options.parent = parentValue;

            const atomes = await db.listAtomes(user.id, options);
            const filtered = kind ? atomes.filter((a) => a.kind === kind) : atomes;
            const formatted = filtered.map(formatAtome);
            return reply.send({ success: true, atomes: formatted, total: formatted.length });
        } catch (error) {
            console.error('[Atome] List error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { id } = request.params;
        try {
            const atome = await db.getAtome(id);
            if (!atome) return reply.code(404).send({ success: false, error: 'Atome not found' });
            if (atome.meta?.owner_id !== user.id && !(await db.canRead(id, user.id))) {
                return reply.code(403).send({ success: false, error: 'Access denied' });
            }
            const formatted = formatAtome(atome);
            return reply.send({ success: true, atome: formatted, data: formatted });
        } catch (error) {
            console.error('[Atome] Get error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.put('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { id } = request.params;
        const { properties, data, type, kind, parent_id } = request.body;
        const patch = sanitizeAtomeProperties(properties || data || {});

        try {
            const existing = await db.getObjectById(id);
            if (!existing) return reply.code(404).send({ success: false, error: 'Atome not found' });
            if (existing.owner !== user.id && !(await db.canWrite(id, user.id))) {
                return reply.code(403).send({ success: false, error: 'Access denied' });
            }

            if (type || kind || parent_id !== undefined) {
                await db.updateObject(id, {
                    type: type || undefined,
                    kind: kind || undefined,
                    parent: parent_id !== undefined ? parent_id : undefined
                });
            }
            if (Object.keys(patch).length) await db.setProperties(id, patch, user.id);

            const formatted = formatAtome(await db.getAtome(id));
            syncAtomeViaWebSocket(formatted, 'update');
            await broadcastPatch(id, patch, user.id);
            broadcastMessage({ type: 'atome-updated', atome: formatted });
            return reply.send({
                success: true,
                message: 'Atome updated successfully',
                atome: formatted,
                data: formatted
            });
        } catch (error) {
            console.error('[Atome] Update error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.post('/api/atome/:id/alter', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { id } = request.params;
        const changes = sanitizeAtomeProperties(request.body?.properties || request.body || {});
        const patch = {};

        try {
            const existing = await db.getObjectById(id);
            if (!existing) return reply.code(404).send({ success: false, error: 'Atome not found' });
            if (existing.owner !== user.id && !(await db.canWrite(id, user.id))) {
                return reply.code(403).send({ success: false, error: 'Access denied' });
            }

            for (const [key, value] of Object.entries(changes)) {
                if (key !== 'id' && key !== 'type' && key !== 'kind') {
                    await db.setProperty(id, key, value, user.id);
                    patch[key] = value;
                }
            }

            const formatted = formatAtome(await db.getAtome(id));
            await broadcastPatch(id, patch, user.id);
            broadcastMessage({ type: 'atome-altered', atome: formatted });
            return reply.send({ success: true, message: 'Atome altered successfully', atome: formatted });
        } catch (error) {
            console.error('[Atome] Alter error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.delete('/api/atome/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { id } = request.params;
        try {
            const existing = await db.getObjectById(id);
            if (!existing) return reply.code(404).send({ success: false, error: 'Atome not found' });
            if (existing.owner !== user.id) {
                return reply.code(403).send({ success: false, error: 'Access denied - only owner can delete' });
            }

            const atomeBeforeDelete = await db.getAtome(id);
            const formattedForSync = atomeBeforeDelete ? formatAtome(atomeBeforeDelete) : null;
            await db.deleteObject(id);
            if (formattedForSync) syncAtomeViaWebSocket(formattedForSync, 'delete');
            try {
                await broadcastAtomeDelete({ atomeId: id, senderUserId: user.id });
            } catch (error) {
                console.warn("[cleanup] operation failed", error);
            }
            broadcastMessage({ type: 'atome-deleted', atome_id: id });
            return reply.send({ success: true, message: 'Atome deleted successfully' });
        } catch (error) {
            console.error('[Atome] Delete error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/atome/:id/history', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { id } = request.params;
        const { property, limit = 50 } = request.query;

        try {
            const existing = await db.getObjectById(id);
            if (!existing) return reply.code(404).send({ success: false, error: 'Atome not found' });
            if (existing.owner !== user.id && !(await db.canRead(id, user.id))) {
                return reply.code(403).send({ success: false, error: 'Access denied' });
            }

            let history;
            if (property) history = await db.getPropertyHistory(id, property, parseInt(limit));
            else {
                history = await db.getChangesSince(0);
                history = history.filter((h) => h.object_id === id).slice(0, parseInt(limit));
            }
            return reply.send({ success: true, history, total: history.length });
        } catch (error) {
            console.error('[Atome] History error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.post('/api/atome/:id/snapshot', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) return reply.code(401).send({ success: false, error: 'Unauthorized' });

        const { id } = request.params;
        try {
            const existing = await db.getObjectById(id);
            if (!existing) return reply.code(404).send({ success: false, error: 'Atome not found' });
            if (existing.owner !== user.id) {
                return reply.code(403).send({ success: false, error: 'Access denied - only owner can create snapshots' });
            }
            const snapshotId = await db.createSnapshot(id);
            return reply.send({ success: true, message: 'Snapshot created', snapshotId });
        } catch (error) {
            console.error('[Atome] Snapshot error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });
}

async function broadcastPatch(atomeId, patch, senderUserId) {
    if (!Object.keys(patch || {}).length) return;
    try {
        await broadcastAtomeRealtimePatch({ atomeId, particles: patch, senderUserId });
    } catch (error) {
        console.warn("[cleanup] operation failed", error);
    }
}

export { registerAtomeCrudRoutes };
