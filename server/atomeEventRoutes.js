import db from '../database/adole.js';
import { syncDebugLog } from './atomeSyncRuntime.js';

function registerAtomeEventRoutes({
    server,
    validateToken,
    commitAtomeEvent,
    commitAtomeEvents,
    fastifyEventDebugLog
}) {
    server.post('/api/events/commit', async (request, reply) => {
        fastifyEventDebugLog('/api/events/commit received');
        const syncSource = String(request.headers['x-sync-source'] || '').toLowerCase();
        const user = await validateToken(request);
        if (!user) {
            fastifyEventDebugLog('/api/events/commit unauthorized - no valid token');
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const event = request.body;
        if (!event || typeof event !== 'object') {
            return reply.code(400).send({ success: false, error: 'Invalid event payload' });
        }

        fastifyEventDebugLog('/api/events/commit processing', {
            user_id: user.id,
            atome_id: event.atome_id || null,
            kind: event.kind || null
        });
        syncDebugLog('commit received', {
            user_id: user.id,
            atome_id: event.atome_id || null,
            kind: event.kind || null,
            project_id: event.project_id || null
        });

        try {
            const result = await commitAtomeEvent({
                event,
                authenticatedUserId: user.id,
                syncSource
            });
            if (!result.ok) {
                return reply.code(400).send({ success: false, error: result.error });
            }
            const created = result.event;
            syncDebugLog('commit stored', {
                atome_id: created?.atome_id || null,
                kind: created?.kind || null,
                event_id: created?.id || created?.event_id || null
            });
            return reply.send({ success: true, event: created });
        } catch (error) {
            console.error('[Events] Commit error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.post('/api/events/commit-batch', async (request, reply) => {
        fastifyEventDebugLog('/api/events/commit-batch received');
        const syncSource = String(request.headers['x-sync-source'] || '').toLowerCase();
        const user = await validateToken(request);
        if (!user) {
            fastifyEventDebugLog('/api/events/commit-batch unauthorized');
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const body = request.body || {};
        const events = Array.isArray(body) ? body : body.events;
        if (!Array.isArray(events)) {
            return reply.code(400).send({ success: false, error: 'Missing events array' });
        }

        const txId = body.tx_id || null;
        fastifyEventDebugLog('/api/events/commit-batch processing', {
            user_id: user.id,
            count: events.length
        });
        syncDebugLog('commit-batch received', {
            user_id: user.id,
            count: events.length,
            tx_id: txId
        });

        try {
            const result = await commitAtomeEvents({
                events,
                authenticatedUserId: user.id,
                actor: body.actor || null,
                txId,
                syncSource
            });
            if (!result.ok) {
                return reply.code(400).send({ success: false, error: result.error });
            }
            const created = result.events;
            syncDebugLog('commit-batch stored', {
                count: Array.isArray(created) ? created.length : 0,
                tx_id: txId
            });
            return reply.send({ success: true, events: created });
        } catch (error) {
            console.error('[Events] Commit batch error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/events', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const {
            project_id,
            atome_id,
            tx_id,
            gesture_id,
            since,
            until,
            limit,
            offset,
            order
        } = request.query || {};

        try {
            const events = await db.listEvents({
                projectId: project_id || null,
                atomeId: atome_id || null,
                txId: tx_id || null,
                gestureId: gesture_id || null,
                since: since || null,
                until: until || null,
                limit: limit !== undefined ? Number(limit) : undefined,
                offset: offset !== undefined ? Number(offset) : undefined,
                order: order || 'asc'
            });

            return reply.send({ success: true, events });
        } catch (error) {
            console.error('[Events] List error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/state_current/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params || {};
        if (!id) {
            return reply.code(400).send({ success: false, error: 'Missing atome id' });
        }

        try {
            const entry = await db.getStateCurrent(id);
            if (!entry) {
                return reply.code(404).send({ success: false, error: 'State not found' });
            }
            return reply.send({ success: true, state: entry });
        } catch (error) {
            console.error('[State] Get error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/state_current', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { project_id, limit, offset, include_shared, includeShared } = request.query || {};
        const includeSharedFlag = include_shared === '1' || include_shared === 'true' || includeShared === '1' || includeShared === 'true';

        try {
            const states = await db.listStateCurrent(project_id || null, {
                limit: limit !== undefined ? Number(limit) : undefined,
                offset: offset !== undefined ? Number(offset) : undefined,
                ownerId: user.id,
                includeShared: includeSharedFlag
            });

            return reply.send({ success: true, states });
        } catch (error) {
            console.error('[State] List error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.post('/api/snapshots', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const body = request.body || {};
        const projectId = body.project_id || null;
        const atomeId = body.atome_id || null;
        const label = body.label || null;
        const actor = body.actor || { type: 'user', id: user.id };
        const state = body.state || body.state_blob || null;
        const snapshotType = body.snapshot_type || 'manual';

        if (!projectId && !atomeId) {
            return reply.code(400).send({ success: false, error: 'Missing project_id or atome_id' });
        }

        try {
            const snapshotId = await db.createStateSnapshot({
                projectId,
                atomeId,
                label,
                actor,
                state,
                snapshotType
            });

            if (projectId || atomeId) {
                try {
                    await commitAtomeEvent({
                        authenticatedUserId: user.id,
                        event: {
                            kind: 'snapshot',
                            atome_id: atomeId || projectId,
                            project_id: projectId,
                            actor,
                            payload: { snapshot_id: snapshotId, label }
                        }
                    });
                } catch (error) {
                    console.warn("[cleanup] operation failed", error);
                }
            }

            return reply.send({ success: true, snapshotId });
        } catch (error) {
            console.error('[Snapshots] Create error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/snapshots', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { project_id, limit, offset } = request.query || {};
        const targetProject = project_id || null;
        if (!targetProject) {
            return reply.code(400).send({ success: false, error: 'Missing project_id' });
        }

        try {
            const snapshots = await db.listStateSnapshots(targetProject, {
                limit: limit !== undefined ? Number(limit) : undefined,
                offset: offset !== undefined ? Number(offset) : undefined
            });
            return reply.send({ success: true, snapshots });
        } catch (error) {
            console.error('[Snapshots] List error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });

    server.get('/api/snapshots/:id', async (request, reply) => {
        const user = await validateToken(request);
        if (!user) {
            return reply.code(401).send({ success: false, error: 'Unauthorized' });
        }

        const { id } = request.params || {};
        if (!id) {
            return reply.code(400).send({ success: false, error: 'Missing snapshot id' });
        }

        try {
            const snapshot = await db.getStateSnapshot(id);
            if (!snapshot) {
                return reply.code(404).send({ success: false, error: 'Snapshot not found' });
            }
            return reply.send({ success: true, snapshot });
        } catch (error) {
            console.error('[Snapshots] Get error:', error);
            return reply.code(500).send({ success: false, error: error.message });
        }
    });
}

export { registerAtomeEventRoutes };
