// /ws/api type 'atome': requester identity, provisioning and the canonical-commit
// guard, then the read-side actions. Every mutating action is answered
// 'canonical_event_commit_required' (mutations go through events/commit).
import db from '../database/adole.js';
import { attachWsApiClientToUser, detachWsApiClient } from './wsApiState.js';
import { isWsApiPrincipalProvisioned, requiredJwtSecret as getRequiredJwtSecret } from './wsApiIdentity.js';
import { isDuplicateWsRequest } from './server_dedup.js';
import { projectAtomePropertiesForRead } from './atomePropertySecurity.js';
import { handleWsApiAtomeList } from './ws_api_atome_list.js';

export async function handleWsApiAtomeRequest({ data, connection, safeSend }) {
  const action = data.action || '';
  const requestId = data.requestId || data.request_id;
  const mutatingActions = new Set(['create', 'update', 'alter', 'delete', 'soft-delete']);
  if (requestId && mutatingActions.has(action) && isDuplicateWsRequest(connection, requestId)) {
    safeSend({
      type: 'atome-response',
      requestId,
      success: true,
      duplicate: true
    });
    return;
  }

  // Resolve requester identity:
  // - Prefer the attached ws identity (fast path)
  // - Enforce expiry
  // - If missing (or expired), verify JWT from the message and attach the connection
  let requesterId = connection?._wsApiUserId || null;
  let hasAuthIdentity = !!requesterId;

  try {
    const authExpMs = connection && typeof connection._wsApiAuthExpMs === 'number' ? connection._wsApiAuthExpMs : null;
    if (requesterId && authExpMs && Date.now() >= authExpMs) {
      // Stale connection identity
      detachWsApiClient(connection);
      requesterId = null;
    }
  } catch (error) {
    console.warn("[server] operation failed", error);
  }

  if (!requesterId && data.token) {
    try {
      const jwt = await import('jsonwebtoken');
      const jwtSecret = getRequiredJwtSecret();
      const decoded = jwt.default.verify(String(data.token), jwtSecret);
      const decodedUserId = decoded?.userId || decoded?.id || decoded?.user_id || decoded?.sub || null;
      if (decodedUserId) {
        requesterId = String(decodedUserId);
        attachWsApiClientToUser(connection, requesterId);
        hasAuthIdentity = true;
        if (decoded && typeof decoded.exp === 'number') {
          connection._wsApiAuthExpMs = decoded.exp * 1000;
        }
      }
    } catch (error) {
      console.warn("[server] operation failed", error);
      requesterId = null;
    }
  }

  if (!requesterId) {
    safeSend({
      type: 'atome-response',
      requestId,
      success: false,
      error: 'atome_request_auth_required'
    });
    return;
  }

  if (!await isWsApiPrincipalProvisioned(requesterId)) {
    safeSend({
      type: 'atome-response',
      requestId,
      success: false,
      error: 'remote_account_not_provisioned'
    });
    return;
  }

  if (new Set([
    'create', 'update', 'alter', 'delete', 'soft-delete', 'set-particle',
    'delete-particle', 'realtime'
  ]).has(action)) {
    safeSend({
      type: 'atome-response',
      requestId,
      success: false,
      error: 'canonical_event_commit_required'
    });
    return;
  }

  try {
    if (action === 'get') {
      const atomeId = data.atome_id || data.id;

      if (requesterId && atomeId) {
        const allowed = await db.canRead(atomeId, requesterId);
        if (!allowed) {
          safeSend({
            type: 'atome-response',
            requestId,
            success: false,
            ok: false,
            error: 'Access denied'
          });
          return;
        }
      }

      const atome = await db.getAtome(atomeId);

      // Return success: false if atome not found
      safeSend({
        type: 'atome-response',
        requestId,
        success: !!atome,
        ok: !!atome,
        atome
      });
    } else if (action === 'transfer-owner') {
      const fromOwnerId = data.from_owner_id || null;
      const toOwnerId = data.to_owner_id || null;
      const includeCreator = data.include_creator !== false;

      if (!requesterId) {
        safeSend({
          type: 'atome-response',
          requestId,
          success: false,
          ok: false,
          error: 'Unauthenticated (token required)'
        });
        return;
      }

      if (!fromOwnerId || !toOwnerId) {
        safeSend({
          type: 'atome-response',
          requestId,
          success: false,
          error: 'Missing from_owner_id or to_owner_id'
        });
        return;
      }

      if (String(toOwnerId) !== String(requesterId)) {
        safeSend({
          type: 'atome-response',
          requestId,
          success: false,
          error: 'Access denied - target owner must be current user'
        });
        return;
      }

      let allowTransfer = String(fromOwnerId) === String(requesterId);
      if (!allowTransfer) {
        try {
          allowTransfer = await db.isGuestWorkspacePrincipal(fromOwnerId);
        } catch (error) {
          console.warn("[server] operation failed", error);
          allowTransfer = false;
        }
      }

      if (!allowTransfer) {
        safeSend({
          type: 'atome-response',
          requestId,
          success: false,
          error: 'Access denied - source owner must be an active guest workspace'
        });
        return;
      }

      if (String(fromOwnerId) !== String(requesterId) && data.adoption_confirmed !== true) {
        safeSend({
          type: 'atome-response',
          requestId,
          success: false,
          error: 'guest_adoption_confirmation_required'
        });
        return;
      }

      const result = await db.transferOwner({
        fromOwnerId,
        toOwnerId,
        includeCreator,
        operationId: data.operation_id || data.operationId || null
      });

      safeSend({
        type: 'atome-response',
        requestId,
        success: true,
        data: result
      });
    } else if (action === 'list') {
      await handleWsApiAtomeList({ data, requestId, requesterId, hasAuthIdentity, safeSend });
    } else if (action === 'get-particle') {
      const { atome_id, key } = data;
      if (!await db.canRead(atome_id, requesterId, key)) {
        safeSend({ type: 'atome-response', requestId, success: false, error: 'Access denied' });
        return;
      }
      const value = await db.getParticle(atome_id, key);

      safeSend({
        type: 'atome-response',
        requestId,
        success: true,
        value
      });
    } else if (action === 'get-particles') {
      const { atome_id } = data;
      const particles = await projectAtomePropertiesForRead(
        atome_id,
        await db.getParticles(atome_id),
        requesterId
      );
      if (!Object.keys(particles).length) {
        safeSend({ type: 'atome-response', requestId, success: false, error: 'Access denied' });
        return;
      }

      safeSend({
        type: 'atome-response',
        requestId,
        success: true,
        particles
      });
    } else {
      safeSend({
        type: 'atome-response',
        requestId,
        success: false,
        error: `Unknown atome action: ${action}`
      });
    }
  } catch (error) {
    console.error(`❌ Atome WebSocket error: ${error.message}`);
    safeSend({
      type: 'atome-response',
      requestId,
      success: false,
      error: error.message
    });
  }
}
