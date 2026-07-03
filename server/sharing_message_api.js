/**
 * Sharing message/WebSocket API — ADOLE v3.0
 *
 * Inbound `share` WS message dispatcher + handler registration. Split out of
 * sharing.js so that module holds share workflow helpers + ACL re-exports. This
 * module imports those helpers one-way (no back-import), so no cycle.
 */

import db, { withTransaction } from '../database/adole.js';
import { getABoxEventBus } from './aBoxServer.js';
import {
    PERMISSION,
    checkCanShare,
    checkPermission,
    createShare,
    getAccessibleAtomes,
    getPermissionName,
    getSharesForAtome,
    getSharesForUser,
    getSharesGrantedByUser,
    parsePermission,
    revokeShare
} from './sharingPermissionService.js';
import {
    atomeIdOf,
    atomeOwnerIdOf,
    atomeParentIdOf,
    atomeTypeOf
} from './sharingAtomeAccessors.js';
import {
    commitSharingAtomePatch,
    ensureProjectContainer,
    extractShareType,
    normalizeShareMode,
    resolveShareAtomeIds,
    resolveTargetUserId,
    resolveUserCurrentProjectId,
    upsertSharePolicy
} from './sharing.js';
import { broadcastShareCommand, enforceRecipientVisibility, listShareRequestsForUser, loadShareRequestById, loadShareRequestsByRequestId, normalizeParticles } from './sharing_recipients.js';
import { createShareRequest, applyShareAcceptance } from './sharing_requests.js';

export async function handleShareMessage(message, userId) {
    const { action, requestId } = message;

    if (!userId) {
        return { requestId, success: false, error: 'Unauthorized' };
    }

    try {
        switch (action) {
            case 'request': {
                const {
                    target_user_id,
                    target_phone,
                    atome_ids,
                    permissions,
                    mode,
                    share_type,
                    property_overrides
                } = message || {};

                const resolvedTargetUserId = await resolveTargetUserId({ targetUserId: target_user_id, targetPhone: target_phone });
                if (!resolvedTargetUserId) {
                    return { requestId, success: false, error: 'Target user not found' };
                }

                const visibilityCheck = await enforceRecipientVisibility({
                    sharerId: userId,
                    targetUserId: resolvedTargetUserId,
                    context: 'share-request'
                });
                if (!visibilityCheck.ok) {
                    return { requestId, success: false, error: visibilityCheck.error || 'Recipient is private' };
                }

                const idsInput = Array.isArray(atome_ids) ? atome_ids.map(String).filter(Boolean) : (atome_ids ? [String(atome_ids)] : []);
                const resolvedIds = await resolveShareAtomeIds(idsInput);
                if (resolvedIds.error) {
                    return { requestId, success: false, error: resolvedIds.error };
                }
                const ids = resolvedIds.ids;
                if (!ids.length) return { requestId, success: false, error: 'No atomes to share' };

                console.log('[Share] Checking permissions for share request:', { userId, targetUserId: resolvedTargetUserId, atomeIds: ids });

                for (const atomeId of ids) {
                    const allowed = await checkCanShare(userId, atomeId);
                    console.log('[Share] checkCanShare result:', { userId, atomeId, allowed });
                    if (!allowed) {
                        console.warn('[Share] Share request failed:', {
                            targetPhone: target_phone,
                            atomeIds: ids,
                            mode,
                            error: 'Access denied (share)',
                            targetUserId: resolvedTargetUserId,
                            failedAtomeId: atomeId
                        });
                        return { requestId, success: false, error: 'Access denied (share)' };
                    }
                }

                const resolvedShareType = extractShareType({ share_type, property_overrides });
                const res = await createShareRequest({
                    sharerId: userId,
                    targetUserId: resolvedTargetUserId,
                    targetPhone: target_phone || null,
                    atomeIds: ids,
                    permissions: permissions || {},
                    mode: mode || 'real-time',
                    shareType: resolvedShareType,
                    propertyOverrides: property_overrides || {}
                });

                return { requestId, success: res.ok, data: res, error: res.error || null };
            }

            case 'respond': {
                const statusRaw = String(message?.status || message?.decision || '').toLowerCase();
                const requestAtomeId = message?.request_atome_id || message?.atome_id || null;
                const requestIdValue = message?.request_id || null;
                const receiverProjectId = message?.receiver_project_id || null;
                const policy = message?.policy || null;

                if (!requestAtomeId && !requestIdValue) {
                    return { requestId, success: false, error: 'Missing request identifier' };
                }

                const inboxRequest = requestAtomeId
                    ? await loadShareRequestById(requestAtomeId)
                    : null;

                let requestRecord = inboxRequest;
                if (!requestRecord && requestIdValue) {
                    const candidates = await loadShareRequestsByRequestId(requestIdValue);
                    requestRecord = candidates.find(r => String(atomeOwnerIdOf(r) || '') === String(userId)) || null;
                }

                if (!requestRecord) {
                    return { requestId, success: false, error: 'Share request not found' };
                }

                const particles = normalizeParticles(requestRecord);
                if (String(particles.box || '') !== 'inbox') {
                    return { requestId, success: false, error: 'Not an inbox request' };
                }

                const sharerId = particles.sharer_id || particles.sharerId || null;
                const requestIdResolved = particles.request_id || particles.requestId || requestIdValue;
                const modeValue = normalizeShareMode(particles.mode || 'real-time');
                const shareType = extractShareType(particles);

                if (!sharerId || !requestIdResolved) {
                    return { requestId, success: false, error: 'Invalid share request data' };
                }

                const newStatus = (statusRaw === 'accepted')
                    ? (shareType === 'linked' && modeValue === 'real-time' ? 'active' : 'accepted')
                    : (statusRaw === 'rejected' ? 'rejected' : null);

                if (!newStatus) {
                    return { requestId, success: false, error: 'Unsupported status' };
                }

                if (policy && policy !== 'one-shot') {
                    await upsertSharePolicy(userId, sharerId, policy, particles.permissions || {});
                }

                let acceptanceResult = { ok: true };
                let resolvedProjectId = receiverProjectId || particles.receiver_project_id || null;
                if (newStatus === 'active' || newStatus === 'accepted') {
                    if (!resolvedProjectId) {
                        resolvedProjectId = await resolveUserCurrentProjectId(userId);
                    }
                    const ensureResult = await ensureProjectContainer({
                        projectId: resolvedProjectId,
                        ownerId: userId
                    });
                    if (!resolvedProjectId || !ensureResult.ok) {
                        console.warn('[Share] Reject accept: invalid receiver_project_id', {
                            requestAtomeId,
                            receiverProjectId: resolvedProjectId,
                            userId,
                            reason: ensureResult.reason
                        });
                        return { requestId, success: false, error: 'Invalid receiver_project_id' };
                    }
                }

                const updates = {
                    status: newStatus,
                    statusUpdatedAt: new Date().toISOString(),
                    acceptedAt: newStatus === 'accepted' || newStatus === 'active' ? new Date().toISOString() : undefined,
                    rejectedAt: newStatus === 'rejected' ? new Date().toISOString() : undefined,
                    receiver_project_id: resolvedProjectId || null
                };

                const inboxId = particles.inboxId || atomeIdOf(requestRecord);
                const outboxId = particles.outboxId || null;

                const finalResult = await withTransaction(async () => {
                    if (newStatus === 'active' || newStatus === 'accepted') {
                        console.log('[Share] Processing accept - receiver_project_id:', resolvedProjectId);
                        const acceptanceParticles = {
                            ...particles,
                            receiver_project_id: resolvedProjectId
                        };
                        acceptanceResult = await applyShareAcceptance({
                            sharerId,
                            targetUserId: userId,
                            particles: acceptanceParticles
                        });
                        if (!acceptanceResult?.ok) {
                            throw new Error(acceptanceResult.error || 'Acceptance failed');
                        }
                        if (acceptanceResult?.copies?.length) {
                            updates.importedAtomeIds = acceptanceResult.copies.map(c => c.sharedAtomeId);
                            updates.importedAtomesCount = acceptanceResult.copies.length;
                            updates.linkMappings = acceptanceResult.mapping || {};
                        }
                    }

                    if (inboxId) await commitSharingAtomePatch(inboxId, updates, userId);
                    if (outboxId) await commitSharingAtomePatch(outboxId, updates, userId);

                    if (!outboxId && requestIdResolved) {
                        const related = await loadShareRequestsByRequestId(requestIdResolved);
                        for (const item of related) {
                            if (String(atomeOwnerIdOf(item) || '') !== String(sharerId)) continue;
                            const id = atomeIdOf(item);
                            if (!id) continue;
                            await commitSharingAtomePatch(id, updates, userId);
                        }
                    }

                    return acceptanceResult;
                });

                return {
                    requestId,
                    success: true,
                    status: newStatus,
                    data: finalResult || null
                };
            }

            case 'publish': {
                const requestAtomeId = message?.request_atome_id || message?.atome_id || null;
                const requestIdValue = message?.request_id || null;

                const sourceRequest = requestAtomeId
                    ? await loadShareRequestById(requestAtomeId)
                    : null;

                let requestRecord = sourceRequest;
                if (!requestRecord && requestIdValue) {
                    const candidates = await loadShareRequestsByRequestId(requestIdValue);
                    requestRecord = candidates.find(r => String(atomeOwnerIdOf(r) || '') === String(userId)) || null;
                }

                if (!requestRecord) {
                    return { requestId, success: false, error: 'Share request not found' };
                }

                const particles = normalizeParticles(requestRecord);
                const targetUserId = particles.target_user_id || particles.targetUserId || null;
                const shareMode = normalizeShareMode(particles.mode || 'real-time');
                const atomeIds = Array.isArray(particles.atome_ids) ? particles.atome_ids : [];

                if (!targetUserId || !atomeIds.length) {
                    return { requestId, success: false, error: 'Invalid share request payload' };
                }

                if (shareMode === 'real-time') {
                    return { requestId, success: false, error: 'Real-time shares do not require publish' };
                }

                const items = [];
                for (const id of atomeIds) {
                    const atome = await db.getAtome(String(id));
                    if (!atome) continue;
                    items.push({
                        atome_id: String(id),
                        parent_id: atomeParentIdOf(atome),
                        atome_type: atomeTypeOf(atome) || null
                    });
                }

                await broadcastShareCommand({
                    recipients: [String(targetUserId)],
                    senderUserId: userId,
                    command: 'share-publish',
                    params: {
                        request_id: particles.request_id || particles.requestId || requestIdValue || null,
                        items,
                        at: new Date().toISOString()
                    }
                });

                await commitSharingAtomePatch(
                    atomeIdOf(requestRecord),
                    { published_at: new Date().toISOString() },
                    userId
                );

                return { requestId, success: true };
            }

            case 'policy': {
                const peerUserId = message?.peer_user_id || null;
                const policy = message?.policy || null;
                const permissions = message?.permissions || null;
                if (!peerUserId || !policy) {
                    return { requestId, success: false, error: 'Missing peer_user_id or policy' };
                }
                const policyId = await upsertSharePolicy(userId, peerUserId, policy, permissions);
                return { requestId, success: true, policyId };
            }

            case 'create': {
                const { atome_id, principal_id, permission, particle_key, expires_at } = message;
                if (!atome_id || !principal_id) {
                    return { requestId, success: false, error: 'Missing atome_id or principal_id' };
                }
                const visibilityCheck = await enforceRecipientVisibility({
                    sharerId: userId,
                    targetUserId: principal_id,
                    context: 'share-create'
                });
                if (!visibilityCheck.ok) {
                    return { requestId, success: false, error: visibilityCheck.error || 'Recipient is private' };
                }
                const permLevel = typeof permission === 'string' ? parsePermission(permission) : (permission || PERMISSION.READ);
                const result = await createShare(userId, atome_id, principal_id, permLevel, {
                    particleKey: particle_key,
                    expiresAt: expires_at
                });
                return { requestId, ...result };
            }

            case 'revoke': {
                const { permission_id } = message;
                if (!permission_id) {
                    return { requestId, success: false, error: 'Missing permission_id' };
                }
                const result = await revokeShare(userId, parseInt(permission_id));
                return { requestId, ...result };
            }

            case 'get-atome': {
                const { atome_id } = message;
                if (!atome_id) {
                    return { requestId, success: false, error: 'Missing atome_id' };
                }
                const canView = await checkCanShare(userId, atome_id);
                if (!canView) {
                    return { requestId, success: false, error: 'Access denied' };
                }
                const shares = await getSharesForAtome(atome_id);
                return { requestId, success: true, data: shares };
            }

            case 'my-shares': {
                const shares = await getSharesGrantedByUser(userId);
                return { requestId, success: true, data: shares };
            }

            case 'shared-with-me': {
                const shares = await getSharesForUser(userId);
                return { requestId, success: true, data: shares };
            }

            case 'inbox': {
                const box = message?.box || 'inbox';
                const status = message?.status || message?.statuses || null;
                const requests = await listShareRequestsForUser(userId, { box, status });
                console.log('[Share] Inbox fetch:', {
                    userId,
                    box,
                    status,
                    count: Array.isArray(requests) ? requests.length : 0
                });
                return { requestId, success: true, data: requests };
            }

            case 'accessible': {
                const { atome_type } = message;
                const atomes = await getAccessibleAtomes(userId, atome_type || null);
                return { requestId, success: true, data: atomes, count: atomes.length };
            }

            case 'check': {
                const { atome_id, permission } = message;
                if (!atome_id) {
                    return { requestId, success: false, error: 'Missing atome_id' };
                }
                const permLevel = parsePermission(permission || 'read');
                const hasPermission = await checkPermission(userId, atome_id, permLevel);
                return {
                    requestId,
                    success: true,
                    atome_id,
                    user_id: userId,
                    permission: permission || 'read',
                    granted: hasPermission
                };
            }

            default:
                return { requestId, success: false, error: `Unknown action: ${action}` };
        }
    } catch (error) {
        console.error('Share message error:', error.message);
        return { requestId, success: false, error: error.message };
    }
}

/**
 * Register sharing WebSocket handler with EventBus
 */
export function registerSharingWebSocket() {
    const eventBus = getABoxEventBus();
    if (!eventBus) {
        console.warn('EventBus not available, sharing WebSocket handler not registered');
        return;
    }

    eventBus.on('share', async (message, socket) => {
        const userId = socket?.userId || message.userId;
        const response = await handleShareMessage(message, userId);

        if (socket && typeof socket.send === 'function') {
            socket.send(JSON.stringify({ type: 'share-response', ...response }));
        }
    });

    console.log('Sharing WebSocket handler registered (ADOLE v3.0)');
}

/**
 * Register sharing routes (backward compatibility)
 * In ADOLE v3.0, sharing is handled via WebSocket, not HTTP routes
 */
export function registerSharingRoutes(server, validateToken) {
    // Register WebSocket handler
    registerSharingWebSocket();
    console.log('Sharing routes registered (ADOLE v3.0 - WebSocket mode)');
}
