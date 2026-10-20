// ============================================================================
// ADOLE EVENT LOG — append-only events commit (ADOLE v3.0)
// ============================================================================
// Normalizes, sequences, conflict-evaluates and inserts events, projects them
// into `state_current` and enqueues sync. Owns the inserted-result WeakSet.

import { v4 as uuidv4 } from 'uuid';
import { query, safeParseJson, serializeJson, withTransaction } from './adole_db_core.js';
import { resolveEventPayload } from '../atome/src/shared/adole_event_contract.js';
import { eventMutations, eventConflicts, enqueueSyncOperation } from './adole_api_instances.js';
import { applyEventToStateCurrent, resolveActorId } from './adole_state_projection.js';
import { isProjectAtome, resolveEventProjectId } from './adole_event_containment.js';
import { getStateCurrent } from './adole_event_state_reads.js';
import { resolvePendingOwners } from './adole_ownership.js';

const insertedEventResults = new WeakSet();

export function wasEventInserted(event) {
    return Boolean(event && insertedEventResults.has(event));
}

// ============================================================================
// EVENT LOG + STATE CURRENT (Projection)
// ============================================================================

function normalizeEventInput(event, options = {}) {
    if (!event || typeof event !== 'object') {
        throw new Error('Invalid event payload');
    }

    const kind = String(event.kind || '').trim();
    if (!kind) {
        throw new Error('Missing event kind');
    }

    const now = new Date().toISOString();
    const id = event.id || event.event_id || uuidv4();
    const ts = event.ts || event.timestamp || options.ts || now;
    const atomeId = event.atome_id || event.atomeId || null;
    const scope = event.scope || options.scope || null;
    const projectId = scope === 'global' ? null : (event.project_id || event.projectId || null);
    const parentId = event.parent_id || event.parentId || null;
    const rawPayload = resolveEventPayload(event);
    const scopedPayload = scope === 'global'
        ? { ...(rawPayload && typeof rawPayload === 'object' ? rawPayload : {}), scope: 'global' }
        : rawPayload;
    const payload = parentId
        ? {
            ...(scopedPayload && typeof scopedPayload === 'object' ? scopedPayload : {}),
            props: {
                ...(scopedPayload?.props && typeof scopedPayload.props === 'object' ? scopedPayload.props : {}),
                parent_id: parentId
            }
        }
        : scopedPayload;
    const actor = event.actor ?? null;
    const txId = event.tx_id || event.txId || options.txId || null;
    const gestureId = event.gesture_id || event.gestureId || null;
    const source = event.source || event.source_id || event.sourceId || options.source || null;

    return {
        id,
        ts,
        atome_id: atomeId,
        project_id: projectId,
        ...(parentId ? { parent_id: parentId } : {}),
        kind,
        payload,
        actor,
        tx_id: txId,
        gesture_id: gestureId,
        source
    };
}

// A project and its content share one stream `project:<id>`: the event's project is
// resolved from containment (adole_event_containment.js), so a linked share of the
// project follows a single stream for the root and all its descendants.
function eventScope(event) {
    if (event.project_id) return { key: `project:${event.project_id}`, projectId: event.project_id, atomeId: null };
    return event.atome_id
        ? { key: `atome:${event.atome_id}`, projectId: null, atomeId: event.atome_id }
        : { key: 'global', projectId: null, atomeId: null };
}

async function ensureScopeStream(scope, ownerId) {
    const existing = await query('get', 'SELECT stream_id FROM sync_streams WHERE scope_key = ?', [scope.key]);
    if (existing) return existing.stream_id;
    await query(
        'run',
        `INSERT OR IGNORE INTO sync_streams (stream_id, scope_key, project_id, atome_id, owner_id)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), scope.key, scope.projectId, scope.atomeId, ownerId || null]
    );
    const stream = await query('get', 'SELECT stream_id FROM sync_streams WHERE scope_key = ?', [scope.key]);
    return stream.stream_id;
}

async function assignEventSequence(event) {
    const streamId = await ensureScopeStream(eventScope(event), resolveActorId(event.actor));
    const counter = await query('get', 'SELECT last_sequence FROM sync_stream_sequences WHERE stream_id = ?', [streamId]);
    const sequence = Number(counter?.last_sequence || 0) + 1;
    await query(
        'run',
        `INSERT INTO sync_stream_sequences (stream_id, last_sequence) VALUES (?, ?)
         ON CONFLICT(stream_id) DO UPDATE SET last_sequence = excluded.last_sequence`,
        [streamId, sequence]
    );
    return { ...event, stream_id: streamId, stream: streamId, sequence };
}

// Stream a share of `atomeId` binds to: a project's own stream (created when the project
// predates this rule and has no content yet), otherwise the stream of the atome's latest event.
export async function streamOfAtome(atomeId) {
    if (await isProjectAtome(atomeId)) {
        const owner = await query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
        const scope = { key: `project:${atomeId}`, projectId: atomeId, atomeId: null };
        return { stream_id: await ensureScopeStream(scope, owner?.owner_id), project_id: atomeId, atome_id: atomeId };
    }
    const latest = await query(
        'get',
        'SELECT stream_id, project_id FROM events WHERE atome_id = ? ORDER BY ts DESC LIMIT 1',
        [atomeId]
    );
    return latest?.stream_id
        ? { stream_id: latest.stream_id, project_id: latest.project_id || null, atome_id: atomeId }
        : null;
}

export async function appendEvent(event, options = {}) {
    let normalized = normalizeEventInput(event, options);
    const syncTarget = options.syncTarget || options.target_server || null;
    const skipQueue = options.skipQueue === true;
    const conflictMode = options.conflictMode === 'offline-lww' ? 'offline-lww' : 'interactive';
    let inserted = false;

    await withTransaction(async () => {
        const existing = await query(
            'get',
            'SELECT * FROM events WHERE id = ?',
            [normalized.id]
        );
        if (existing) {
            eventMutations.assertReplay(existing, normalized);
            normalized = {
                ...existing,
                payload: safeParseJson(existing.payload),
                actor: safeParseJson(existing.actor),
                projection: safeParseJson(existing.projection),
                lww_decisions: safeParseJson(existing.lww_decisions),
                stream: existing.stream_id,
                inserted: false
            };
            return;
        }
        normalized = await eventMutations.prepare(normalized, {
            skipExpectedVersions: conflictMode === 'offline-lww'
        });
        normalized.project_id = await resolveEventProjectId(normalized);
        normalized = await assignEventSequence(normalized);
        const evaluation = await eventConflicts.evaluate(normalized, conflictMode);
        normalized.lww_decisions = evaluation.decisions;
        const payloadJson = serializeJson(normalized.payload);
        const actorJson = serializeJson(normalized.actor);
        await query(
            'run',
            `INSERT INTO events
             (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id, stream_id, sequence, source, lww_decisions)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                normalized.id,
                normalized.ts,
                normalized.atome_id,
                normalized.project_id,
                normalized.kind,
                payloadJson,
                actorJson,
                normalized.tx_id,
                normalized.gesture_id,
                normalized.stream_id,
                normalized.sequence,
                normalized.source,
                serializeJson(normalized.lww_decisions)
            ]
        );
        inserted = true;
        await eventConflicts.record(normalized, evaluation);

        const projection = evaluation.projectionEvent
            ? await applyEventToStateCurrent(evaluation.projectionEvent)
            : await getStateCurrent(normalized.atome_id);
        normalized.projection = projection;
        await query('run', 'UPDATE events SET projection = ? WHERE id = ?', [serializeJson(projection), normalized.id]);
        if (syncTarget && !skipQueue) {
            await enqueueSyncOperation({
                atome_id: normalized.atome_id,
                operation: 'events:commit',
                payload: normalized,
                target_server: syncTarget
            });
        }
    });

    if (inserted) {
        insertedEventResults.add(normalized);
        await resolvePendingOwners(normalized.atome_id);
    }

    return normalized;
}

export async function appendEvents(events, options = {}) {
    if (!Array.isArray(events)) {
        throw new Error('Events must be an array');
    }

    const results = [];
    const created = [];
    const txId = options.tx_id || options.txId || null;
    const syncTarget = options.syncTarget || options.target_server || null;
    const skipQueue = options.skipQueue === true;
    const conflictMode = options.conflictMode === 'offline-lww' ? 'offline-lww' : 'interactive';

    await withTransaction(async () => {
        for (const evt of events) {
            let normalized = normalizeEventInput(evt, { txId, source: options.source || null });

            const existing = await query(
                'get',
                'SELECT * FROM events WHERE id = ?',
                [normalized.id]
            );
            if (existing) {
                eventMutations.assertReplay(existing, normalized);
                results.push({
                    ...existing,
                    payload: safeParseJson(existing.payload),
                    actor: safeParseJson(existing.actor),
                    projection: safeParseJson(existing.projection),
                    lww_decisions: safeParseJson(existing.lww_decisions),
                    stream: existing.stream_id,
                    inserted: false
                });
                continue;
            }

            normalized = await eventMutations.prepare(normalized, {
                skipExpectedVersions: conflictMode === 'offline-lww'
            });
            normalized.project_id = await resolveEventProjectId(normalized);
            normalized = await assignEventSequence(normalized);
            const evaluation = await eventConflicts.evaluate(normalized, conflictMode);
            normalized.lww_decisions = evaluation.decisions;
            const payloadJson = serializeJson(normalized.payload);
            const actorJson = serializeJson(normalized.actor);

            await query(
                'run',
                `INSERT INTO events
                 (id, ts, atome_id, project_id, kind, payload, actor, tx_id, gesture_id, stream_id, sequence, source, lww_decisions)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    normalized.id,
                    normalized.ts,
                    normalized.atome_id,
                    normalized.project_id,
                    normalized.kind,
                    payloadJson,
                    actorJson,
                    normalized.tx_id,
                normalized.gesture_id,
                normalized.stream_id,
                normalized.sequence,
                normalized.source,
                serializeJson(normalized.lww_decisions)
            ]
        );
            await eventConflicts.record(normalized, evaluation);

            const projection = evaluation.projectionEvent
                ? await applyEventToStateCurrent(evaluation.projectionEvent)
                : await getStateCurrent(normalized.atome_id);
            normalized.projection = projection;
            await query('run', 'UPDATE events SET projection = ? WHERE id = ?', [serializeJson(projection), normalized.id]);

            if (syncTarget && !skipQueue) {
                await enqueueSyncOperation({
                    atome_id: normalized.atome_id,
                    operation: 'events:commit',
                    payload: normalized,
                    target_server: syncTarget
                });
            }

            created.push(normalized);
            results.push(normalized);
        }
    });

    created.forEach((event) => insertedEventResults.add(event));
    if (created.length > 0) {
        for (const atomeId of new Set(created.map((event) => event.atome_id).filter(Boolean))) {
            await resolvePendingOwners(atomeId);
        }
    }

    return results;
}
