/**
 * Sharing message/WebSocket API — ADOLE v3.0
 *
 * The inbound `share` frame (server/ws_api_message_handlers.js#handleWsShareRequest): every share's life — request,
 * answer, rights, revocation and the lists' versions (send, view, accept or refuse a version, detach, announce) — is the
 * canonical share engine's (server/syncSharingService.js, server/sync_share_lists.js). Only the property privacy rules
 * (§12.5) and the permission reads of the permission service stay here.
 */

import db from '../database/adole.js';
import { checkCanShare, checkPermission, getAccessibleAtomes, getSharesForAtome, parsePermission } from './sharingPermissionService.js';

// The actions of the canonical share engine (SyncSharingService#handle).
export const CANONICAL_SHARE_ACTIONS = Object.freeze(['request', 'respond', 'publish', 'create', 'revoke', 'inbox', 'shared-with-me', 'my-shares',
    'sent', 'pending', 'policy', 'update-rights', 'with-peer', 'list-view', 'accept-version', 'refuse-version', 'detach', 'announce']);

export async function handleShareMessage(message, userId, dependencies = {}) {
    const { action, requestId } = message;

    if (!userId) {
        return { requestId, success: false, error: 'Unauthorized' };
    }

    try {
        if (CANONICAL_SHARE_ACTIONS.includes(String(action || '').toLowerCase())) {
            if (!dependencies.syncSharingService) throw new Error('share_service_unavailable');
            const result = await dependencies.syncSharingService.handle(message, userId);
            return { requestId, success: result.ok !== false, data: result, ...result };
        }
        switch (action) {
            // §12.5 — output rules on one's own data. Restrictive only: the rule is
            // consulted after a permission already allowed the read and can only turn
            // it into a refusal, never a grant.
            case 'privacy-rule-set': {
                const { atome_id, particle_key, conditions } = message;
                if (!atome_id || !particle_key) {
                    return { requestId, success: false, error: 'Missing atome_id or particle_key' };
                }
                const result = await db.setPropertyPrivacyRule(
                    atome_id,
                    particle_key,
                    conditions === undefined ? null : conditions,
                    userId
                );
                return result.ok
                    ? { requestId, success: true, ...result }
                    : { requestId, success: false, error: result.error };
            }

            case 'privacy-rule-list': {
                const { atome_id } = message;
                if (!atome_id) return { requestId, success: false, error: 'Missing atome_id' };
                const result = await db.listPropertyPrivacyRules(atome_id, userId);
                return result.ok
                    ? { requestId, success: true, rules: result.rules }
                    : { requestId, success: false, error: result.error };
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
