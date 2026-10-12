import crypto from 'crypto';
import { mergeGuestProfileProperties, personalProfileFromProperties } from '../atome/src/shared/profile_sharing.js';
import { handleWsAtomeOperation } from './wsAtomeOperations.js';
import { withTransaction } from '../database/adole.js';
import { isWsApiPrincipalProvisioned, resolveWsApiPrincipal } from './wsApiIdentity.js';
import { adoptionFiles, completeAdoptionFiles, declareAdoptionFiles, ensureAdoptionFilesStaged, stageAdoptionFile } from './wsApiGuestAdoptionFiles.js';
import { wsResponse } from './wsResponse.js';

const MAX_ADOPTION_TTL_MS = 15 * 60 * 1000;
const DIGEST_RE = /^[a-f0-9]{64}$/i;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationLocks = new Map();

// Family-bound alias over the shared envelope (server/wsResponse.js).
const response = (message, success, fields) => wsResponse('guest-adoption', message, success, fields);

function digest(value) {
    return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function operationDigest(operationId) {
    return digest(String(operationId));
}

function validExpiry(value) {
    const expiresAt = Date.parse(String(value || ''));
    const now = Date.now();
    return Number.isFinite(expiresAt) && expiresAt > now && expiresAt - now <= MAX_ADOPTION_TTL_MS;
}

function parsePayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('guest_adoption_payload_invalid');
    const atomes = Array.isArray(payload.atomes) ? payload.atomes : [];
    const events = Array.isArray(payload.events) ? payload.events : [];
    const snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
    const queue = Array.isArray(payload.sync_queue) ? payload.sync_queue : [];
    const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
    const files = Array.isArray(payload.files) ? payload.files : [];
    if (!atomes.length && (events.length || snapshots.length || queue.length || permissions.length || files.length)) {
        throw new Error('guest_adoption_atomes_required');
    }
    if (payload.profile != null && (typeof payload.profile !== 'object' || Array.isArray(payload.profile))) throw new Error('guest_adoption_profile_invalid');
    return { atomes, events, snapshots, sync_queue: queue, permissions, files: adoptionFiles(files),
        profile: payload.profile ? personalProfileFromProperties({ eve_profile: payload.profile }) : null };
}

function normalizeAtome(record, guestPrincipalId, targetPrincipalId) {
    const atomeId = String(record?.atome_id || record?.id || '').trim();
    const atomeType = String(record?.atome_type || record?.type || '').trim();
    if (!atomeId || !atomeType || atomeType === 'user' || atomeType === 'guest_workspace') {
        throw new Error('guest_adoption_atome_invalid');
    }
    const properties = record?.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)
        ? record.properties : {};
    const parentId = record?.parent_id || record?.parentId || null;
    const projectId = record?.project_id || record?.projectId || null;
    return {
        atomeId,
        atomeType,
        parentId: parentId ? String(parentId) : null,
        projectId: projectId ? String(projectId) : null,
        properties,
        createdAt: record?.created_at || record?.createdAt || new Date().toISOString(),
        updatedAt: record?.updated_at || record?.updatedAt || new Date().toISOString(),
        guestPrincipalId,
        targetPrincipalId
    };
}

function sortAtomes(records) {
    const remaining = new Map(records.map((record) => [record.atomeId, record]));
    const ordered = [];
    while (remaining.size) {
        const ready = Array.from(remaining.values()).filter((record) => !record.parentId || !remaining.has(record.parentId));
        if (!ready.length) throw new Error('guest_adoption_parent_cycle');
        ready.forEach((record) => {
            ordered.push(record);
            remaining.delete(record.atomeId);
        });
    }
    return ordered;
}

async function one(dataSource, sql, params = []) {
    const rows = await dataSource.query(sql, params);
    return rows?.[0] || null;
}

async function requireAuthenticatedPrincipal(message, connection) {
    const principalId = resolveWsApiPrincipal(connection, message);
    if (!principalId || !await isWsApiPrincipalProvisioned(principalId)) throw new Error('remote_account_not_provisioned');
    return principalId;
}

async function loadOperation(dataSource, operationId) {
    return one(dataSource, `SELECT * FROM guest_adoption_operations WHERE operation_digest = ?`, [operationDigest(operationId)]);
}

async function runOperationSerially(operationId, work) {
    const key = String(operationId || '');
    if (!key) return work();
    const previous = operationLocks.get(key) || Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    operationLocks.set(key, next);
    try {
        return await next;
    } finally {
        if (operationLocks.get(key) === next) operationLocks.delete(key);
    }
}

async function prepare(message, context, targetPrincipalId) {
    if (message.confirmed !== true && message.adoption_confirmed !== true) return response(message, false, { error: 'guest_adoption_confirmation_required' });
    const operationId = String(message.operation_id || message.operationId || '').trim();
    const guestPrincipalId = String(message.guest_principal_id || message.guestPrincipalId || '').trim();
    const manifestDigest = String(message.manifest_digest || message.manifestDigest || '').trim();
    const expiresAt = message.expires_at || message.expiresAt;
    if (!UUID_V4_RE.test(operationId)) return response(message, false, { error: 'guest_adoption_operation_invalid' });
    if (!UUID_V4_RE.test(guestPrincipalId) || !DIGEST_RE.test(manifestDigest) || !validExpiry(expiresAt)) {
        return response(message, false, { error: 'guest_adoption_manifest_invalid' });
    }
    const existing = await loadOperation(context.dataSource, operationId);
    if (existing) {
        if (existing.target_principal_id !== targetPrincipalId || existing.guest_principal_id !== guestPrincipalId || existing.manifest_digest !== manifestDigest) {
            return response(message, false, { error: 'guest_adoption_operation_conflict' });
        }
        if (!['committed', 'completed'].includes(existing.status)) await context.dataSource.query(
            'UPDATE guest_adoption_operations SET expires_at = ? WHERE operation_digest = ?', [expiresAt, existing.operation_digest]);
        return response(message, true, { status: existing.status, replayed: true });
    }
    try {
        await context.dataSource.query(`INSERT INTO guest_adoption_operations
            (operation_digest, guest_principal_id, target_principal_id, manifest_digest, status, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'prepared', ?, datetime('now'), datetime('now'))`,
        [operationDigest(operationId), guestPrincipalId, targetPrincipalId, manifestDigest, expiresAt]);
    } catch (error) {
        const raced = await loadOperation(context.dataSource, operationId);
        if (raced && raced.target_principal_id === targetPrincipalId && raced.guest_principal_id === guestPrincipalId && raced.manifest_digest === manifestDigest) {
            return response(message, true, { status: raced.status, replayed: true });
        }
        throw error;
    }
    return response(message, true, { status: 'prepared', replayed: false });
}

async function importPayload(message, context, targetPrincipalId) {
    const operationId = String(message.operation_id || message.operationId || '').trim();
    const operation = await loadOperation(context.dataSource, operationId);
    if (!operation || operation.target_principal_id !== targetPrincipalId) return response(message, false, { error: 'guest_adoption_not_prepared' });
    if (!['committed', 'completed'].includes(operation.status) && Date.parse(operation.expires_at) < Date.now()) return response(message, false, { error: 'guest_adoption_expired' });
    if (operation.status === 'completed' || operation.status === 'committed') {
        return response(message, true, { status: operation.status, replayed: true });
    }
    const payloadJson = JSON.stringify(message.payload);
    const payloadDigest = digest(payloadJson);
    if (String(message.payload_digest || message.payloadDigest || '') !== payloadDigest) {
        return response(message, false, { error: 'guest_adoption_payload_digest_invalid' });
    }
    if (payloadDigest !== operation.manifest_digest) {
        return response(message, false, { error: 'guest_adoption_manifest_conflict' });
    }
    let payload;
    try { payload = parsePayload(message.payload); } catch (error) { return response(message, false, { error: error.message }); }
    const existing = await one(context.dataSource, `SELECT payload_digest FROM guest_adoption_payloads WHERE operation_digest = ?`, [operation.operation_digest]);
    if (existing && existing.payload_digest !== payloadDigest) return response(message, false, { error: 'guest_adoption_payload_conflict' });
    if (!existing) await context.dataSource.query(`INSERT INTO guest_adoption_payloads
        (operation_digest, payload_json, payload_digest, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [operation.operation_digest, payloadJson, payloadDigest]);
    try {
        await declareAdoptionFiles(context.dataSource, operation.operation_digest, payload.files);
    } catch (error) {
        return response(message, false, { error: error.message || 'guest_adoption_file_invalid' });
    }
    await context.dataSource.query(`UPDATE guest_adoption_operations SET status = 'importing', updated_at = datetime('now') WHERE operation_digest = ?`, [operation.operation_digest]);
    return response(message, true, { status: 'importing', replayed: Boolean(existing) });
}

async function stageFile(message, context, targetPrincipalId) {
    const operationId = String(message.operation_id || message.operationId || '').trim();
    const operation = await loadOperation(context.dataSource, operationId);
    if (!operation || operation.target_principal_id !== targetPrincipalId) return response(message, false, { error: 'guest_adoption_not_prepared' });
    if (['committed', 'completed'].includes(operation.status)) return response(message, true, { status: operation.status, replayed: true });
    if (Date.parse(operation.expires_at) < Date.now()) return response(message, false, { error: 'guest_adoption_expired' });
    if (operation.status !== 'importing') return response(message, false, { error: 'guest_adoption_payload_missing' });
    try {
        await stageAdoptionFile({
            dataSource: context.dataSource,
            projectRoot: context.projectRoot,
            operationDigest: operation.operation_digest,
            fileId: String(message.file_id || message.fileId || '').trim(),
            contentBase64: message.content_base64 || message.contentBase64
        });
    } catch (error) {
        return response(message, false, { error: error.message || 'guest_adoption_file_stage_failed' });
    }
    return response(message, true, { status: 'importing' });
}

async function finalize(message, context, targetPrincipalId) {
    const operationId = String(message.operation_id || message.operationId || '').trim();
    const operation = await loadOperation(context.dataSource, operationId);
    if (!operation || operation.target_principal_id !== targetPrincipalId) return response(message, false, { error: 'guest_adoption_not_prepared' });
    if (operation.status === 'completed') {
        const saved = await one(context.dataSource, 'SELECT profile_event_json FROM guest_adoption_payloads WHERE operation_digest = ?', [operation.operation_digest]);
        return response(message, true, { status: 'completed', replayed: true, profile_event: saved?.profile_event_json ? JSON.parse(saved.profile_event_json) : null });
    }
    const stored = await one(context.dataSource, `SELECT payload_json, payload_digest, profile_event_json FROM guest_adoption_payloads WHERE operation_digest = ?`, [operation.operation_digest]);
    if (!stored) return response(message, false, { error: 'guest_adoption_payload_missing' });
    let payload;
    try { payload = parsePayload(JSON.parse(stored.payload_json)); } catch (error) { return response(message, false, { error: error.message }); }
    let atomes;
    try {
        atomes = sortAtomes(payload.atomes.map(record => normalizeAtome(record, operation.guest_principal_id, targetPrincipalId)));
        if (operation.status !== 'committed') {
            await ensureAdoptionFilesStaged(context.dataSource, operation.operation_digest);
            await importWorkspaceEvents(context, operation, payload, atomes, targetPrincipalId);
        }
        if (operation.status !== 'committed') await withTransaction(async () => {
            const current = await loadOperation(context.dataSource, operationId);
            if (!current || current.target_principal_id !== targetPrincipalId) throw new Error('guest_adoption_not_prepared');
            if (current.status === 'completed' || current.status === 'committed') return;
            if (current.status !== 'importing') throw new Error('guest_adoption_payload_missing');
            await ensureAdoptionFilesStaged(context.dataSource, operation.operation_digest);
            // Vault events reconstruct adopted state. Original guest checkpoints
            // and owner grants stay in the immutable operation payload; writing
            // central copies would create a second business-data authority.
            if (!context.connection?._wsApiVaultRouter) {
                for (const snapshot of payload.snapshots) {
                    if (!snapshot?.atome_id || !atomes.some((record) => record.atomeId === String(snapshot.atome_id))) throw new Error('guest_adoption_snapshot_invalid');
                    await context.dataSource.query(`INSERT INTO snapshots
                        (atome_id, project_id, snapshot_data, state_blob, label, snapshot_type, actor, created_by, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [snapshot.atome_id, snapshot.project_id || null, snapshot.snapshot_data || '{}', snapshot.state_blob || null, snapshot.label || null, snapshot.snapshot_type || 'guest_adoption', JSON.stringify(snapshot.actor || { type: 'guest', id: operation.guest_principal_id }), operation.guest_principal_id, snapshot.created_at || new Date().toISOString()]);
                }
                for (const permission of payload.permissions) {
                    const atomeId = String(permission?.atome_id || '').trim();
                    const principalId = String(permission?.principal_id || '').trim();
                    const grantedBy = String(permission?.granted_by || '').trim();
                    if (!atomes.some((record) => record.atomeId === atomeId)) throw new Error('guest_adoption_permission_invalid');
                    if (principalId && principalId !== operation.guest_principal_id && principalId !== targetPrincipalId) throw new Error('guest_adoption_acl_ambiguous');
                    if (grantedBy && grantedBy !== operation.guest_principal_id && grantedBy !== targetPrincipalId) throw new Error('guest_adoption_acl_ambiguous');
                    await context.dataSource.query(`INSERT INTO permissions
                        (atome_id, particle_key, principal_id, can_read, can_write, can_delete, can_share, can_create, share_mode, conditions, granted_by, granted_at, expires_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [atomeId, permission.particle_key || null, targetPrincipalId,
                        permission.can_read === false ? 0 : 1, permission.can_write === true ? 1 : 0,
                        permission.can_delete === true ? 1 : 0, permission.can_share === true ? 1 : 0,
                        permission.can_create === true ? 1 : 0, permission.share_mode || 'real-time',
                        permission.conditions ? JSON.stringify(permission.conditions) : null, targetPrincipalId,
                        permission.granted_at || new Date().toISOString(), permission.expires_at || null]);
                }
            }
            await context.dataSource.query(`INSERT OR IGNORE INTO guest_workspace_principals
                (guest_principal_id, status, adopted_principal_id, adoption_operation_digest, classified_at, adopted_at)
                VALUES (?, 'adopted', ?, ?, datetime('now'), datetime('now'))`,
            [operation.guest_principal_id, targetPrincipalId, operation.operation_digest]);
            await context.dataSource.query(`UPDATE guest_adoption_operations SET status = 'committed', committed_at = datetime('now'), updated_at = datetime('now') WHERE operation_digest = ?`, [operation.operation_digest]);
        });
        await completeAdoptionFiles({
            dataSource: context.dataSource,
            projectRoot: context.projectRoot,
            operationDigest: operation.operation_digest,
            targetPrincipalId
        });
        await adoptProfile(message, context, operation, stored, payload.profile, targetPrincipalId);
        await context.dataSource.query(`UPDATE guest_adoption_operations SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE operation_digest = ?`, [operation.operation_digest]);
    } catch (error) {
        const current = await one(context.dataSource, `SELECT status FROM guest_adoption_operations WHERE operation_digest = ?`, [operation.operation_digest]);
        if (current?.status !== 'committed') {
            await context.dataSource.query(`UPDATE guest_adoption_operations SET status = 'failed', failure_code = ?, updated_at = datetime('now') WHERE operation_digest = ?`, [String(error.message || 'guest_adoption_failed').slice(0, 120), operation.operation_digest]);
        }
        return response(message, false, { error: error.message || 'guest_adoption_failed' });
    }
    return response(message, true, { status: 'completed', replayed: false, profile_event: stored.profile_event_json ? JSON.parse(stored.profile_event_json) : null });
}

// Adopted project writes use the same event owner as ordinary commands. The
// original guest events remain unchanged in the adoption journal and local
// source history; these authorized account events get canonical stream metadata.
async function importWorkspaceEvents(context, operation, payload, atomes, targetId) {
    for (const snapshot of payload.snapshots) {
        if (!snapshot?.atome_id || !atomes.some(record => record.atomeId === String(snapshot.atome_id))) throw new Error('guest_adoption_snapshot_invalid');
    }
    for (const permission of payload.permissions) {
        if (!atomes.some(record => record.atomeId === String(permission?.atome_id))) throw new Error('guest_adoption_permission_invalid');
        for (const principal of [permission.principal_id, permission.granted_by]) {
            if (principal && principal !== operation.guest_principal_id && principal !== targetId) throw new Error('guest_adoption_acl_ambiguous');
        }
    }
    const batch = [];

    for (const event of payload.events) {
        if (!event?.id || !atomes.some(record => record.atomeId === String(event.atome_id))) throw new Error('guest_adoption_event_invalid');
        if (String(event.actor?.id || event.actor?.user_id || '') !== operation.guest_principal_id) throw new Error('guest_adoption_actor_invalid');
    }
    for (const entry of payload.sync_queue) {
        if (!atomes.some(record => record.atomeId === String(entry?.payload?.atome_id))) throw new Error('guest_adoption_queue_invalid');
    }
    for (const record of atomes) {
        const source = payload.events.filter(event => String(event.atome_id) === record.atomeId);
        const inputs = source.length ? source : [{ id: 'guest-import:' + operation.operation_digest + ':' + record.atomeId,
            kind: 'set', atome_id: record.atomeId, payload: { props: record.properties } }];
        const existing = await handleWsAtomeOperation({ type: 'state-current', action: 'get', atome_id: record.atomeId }, context.connection);
        if (existing?.success) {
            const prior = await handleWsAtomeOperation({ type: 'events', action: 'list', atome_id: record.atomeId, limit: 10000 }, context.connection);
            if (!prior?.events?.some(event => inputs.some(input => input.id === event.id))) throw new Error('guest_adoption_atome_collision');
        } else if (existing?.error !== 'State not found') throw new Error(existing?.error || 'guest_adoption_state_read_failed');
        const lastSet = inputs.findLastIndex(event => event.kind === 'set');
        const events = inputs.map((input, index) => ({ ...input, type: record.atomeType,
            ts: input.ts || operation.created_at, actor: { type: 'user', id: targetId },
            tx_id: input.tx_id || 'guest-import:' + operation.operation_digest,
            project_id: record.projectId, ...(record.parentId ? { parent_id: record.parentId } : {}),
            payload: { ...(input.payload || {}), ...(record.projectId ? {} : { scope: 'global' }),
                ...(input.kind === 'set' ? { props: { ...(input.payload?.props || {}),
                    ...(index === lastSet ? record.properties : {}), type: record.atomeType } } : {}) } }));
        batch.push(...events);
    }
    if (batch.length) {
        const committed = await handleWsAtomeOperation({ type: 'events', action: 'commit-batch', events: batch, source: 'guest-adoption' }, context.connection);
        if (!committed?.success) throw new Error(committed?.error || 'guest_adoption_events_commit_failed');
    }
}

// The journal stores the exact intent before the canonical account commit, so a
// lost reply or restart retries the same event without re-merging changed data.
async function adoptProfile(message, context, operation, stored, profile, targetId) {
    if (!profile) return;
    if (!stored.profile_event_json) {
        const loaded = await handleWsAtomeOperation({ type: 'state-current', action: 'get', atome_id: targetId }, context.connection);
        if (!loaded?.success && loaded?.error !== 'State not found') throw new Error(loaded?.error || 'guest_adoption_profile_read_failed');
        const props = mergeGuestProfileProperties(loaded?.state?.properties || {}, profile);
        if (!props) return;
        const versions = loaded?.state?.property_versions;
        const event = { id: 'guest-profile:' + operation.operation_digest, kind: 'set', type: 'user', atome_id: targetId, scope: 'global',
            project_id: null, actor: { type: 'user', id: targetId }, tx_id: 'guest-profile:' + operation.operation_digest,
            ts: new Date().toISOString(), payload: { scope: 'global', props,
                ...(versions ? { expected_versions: Object.fromEntries(Object.keys(props).map(key => [key, versions[key] || 0])) } : {}) } };
        stored.profile_event_json = JSON.stringify(event);
        await context.dataSource.query('UPDATE guest_adoption_payloads SET profile_event_json = ? WHERE operation_digest = ?',
            [stored.profile_event_json, operation.operation_digest]);
    }
    const committed = await handleWsAtomeOperation({ type: 'events', action: 'commit', event: JSON.parse(stored.profile_event_json) }, context.connection);
    if (!committed?.success) {
        if (committed?.error === 'property_version_conflict') {
            await context.dataSource.query('UPDATE guest_adoption_payloads SET profile_event_json = NULL WHERE operation_digest = ?', [operation.operation_digest]);
        }
        throw new Error(committed?.error || 'guest_adoption_profile_commit_failed');
    }
}

export async function handleWsApiGuestAdoption(message, context) {
    if (message?.type !== 'guest-adoption') return null;
    let principalId;
    try { principalId = await requireAuthenticatedPrincipal(message, context.connection); }
    catch (error) { return response(message, false, { error: error.message }); }
    const action = String(message.action || '').trim();
    const operationId = String(message.operation_id || message.operationId || '').trim();
    if (action === 'prepare') return runOperationSerially(operationId, () => prepare(message, context, principalId));
    if (action === 'import') return runOperationSerially(operationId, () => importPayload(message, context, principalId));
    if (action === 'stage-file') return runOperationSerially(operationId, () => stageFile(message, context, principalId));
    if (action === 'finalize') return runOperationSerially(operationId, () => finalize(message, context, principalId));
    return response(message, false, { error: 'guest_adoption_action_invalid' });
}
