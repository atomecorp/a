import db from '../database/adole.js';
import { wsSendJsonToUser, wsSendJsonToUserExcept } from './wsApiState.js';
import {
  authorizeAtomeEventWrite,
  canReadAnyAtomeProperty,
  projectAtomePropertiesForRead,
  projectEventForRead
} from './atomePropertySecurity.js';

const DATABASE_ENABLED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('atome_realtime_json_invalid');
  }
}

async function getEffectiveOwnerIdForAtome(atomeId) {
  if (!atomeId) return null;
  const ownerRow = await db.query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
  const ownerId = ownerRow?.owner_id ? String(ownerRow.owner_id) : null;
  if (ownerId) return ownerId;

  const pendingRow = await db.query(
    'get',
    "SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = '_pending_owner_id' ORDER BY updated_at DESC LIMIT 1",
    [atomeId]
  );

  return pendingRow?.particle_value ? String(pendingRow.particle_value) : null;
}

async function listAtomeRealtimeRecipients(atomeId) {
  if (!DATABASE_ENABLED || !atomeId) return [];

  const recipients = new Set();
  const ownerId = await getEffectiveOwnerIdForAtome(atomeId);
  if (ownerId) recipients.add(ownerId);

    const permRows = await db.query(
      'all',
      "SELECT DISTINCT principal_id, share_mode FROM permissions WHERE atome_id = ? AND can_read = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
      [atomeId]
    );

    for (const row of permRows || []) {
      const principalId = row?.principal_id ? String(row.principal_id) : null;
      if (!principalId) continue;
      const shareMode = row?.share_mode ? String(row.share_mode) : null;
      const normalizedMode = shareMode ? shareMode.toLowerCase() : null;
      const realtime = !normalizedMode || normalizedMode === 'real-time' || normalizedMode === 'realtime';
      if (!realtime) continue;
      recipients.add(principalId);
    }

  return Array.from(recipients);
}

async function inheritPermissionsFromParent({ parentId, childId, childOwnerId, grantorId }) {
  if (!DATABASE_ENABLED || !parentId || !childId) return;

  const rows = await db.query(
      'all',
      `SELECT principal_id, can_read, can_write, can_delete, can_share, can_create, share_mode, conditions, expires_at, granted_by
       FROM permissions
       WHERE atome_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      [parentId]
    );

  for (const row of rows || []) {
      const principalId = row?.principal_id ? String(row.principal_id) : null;
      if (!principalId) continue;
      if (childOwnerId && principalId === String(childOwnerId)) continue;

      await db.setPermission(
        childId,
        principalId,
        row.can_read === 1,
        row.can_write === 1,
        row.can_delete === 1,
        row.can_share === 1,
        null,
        row.granted_by || grantorId,
        {
          canCreate: row.can_create === 1,
          shareMode: row.share_mode || null,
          conditions: safeParseJson(row.conditions),
          expiresAt: row.expires_at || null
        }
      );
    }

  const parentOwnerId = await getEffectiveOwnerIdForAtome(parentId);
  if (parentOwnerId && (!childOwnerId || String(parentOwnerId) !== String(childOwnerId))) {
    await db.setPermission(
        childId,
        String(parentOwnerId),
        true,
        true,
        true,
        true,
        null,
        grantorId || String(parentOwnerId),
        { canCreate: true, shareMode: 'real-time' }
    );
  }
}

async function broadcastAtomeCreate({ atomeId, atomeType, parentId, particles, senderUserId, senderConnection = null }) {
  if (!DATABASE_ENABLED) return;
  if (!atomeId || !senderUserId) return;

  const recipients = await listAtomeRealtimeRecipients(atomeId);
  if (!recipients || recipients.length === 0) return;

  const nowIso = new Date().toISOString();
  const authorIdStr = String(senderUserId);
  for (const recipientId of recipients) {
    if (!recipientId) continue;

    const projectedParticles = await projectAtomePropertiesForRead(atomeId, particles, recipientId);
    if (!Object.keys(projectedParticles).length) continue;
    const msgText = JSON.stringify({
      command: 'share-create',
      params: {
        atomeId,
        atomeType,
        parentId,
        particles: projectedParticles,
        createdAt: nowIso,
        authorId: authorIdStr
      }
    });

    const payload = {
      type: 'console-message',
      authorId: authorIdStr,
      message: msgText,
      from: { userId: authorIdStr, phone: null, username: null },
      to: { userId: String(recipientId), phone: null },
      timestamp: nowIso
    };

    const targetUserId = String(recipientId);
    if (senderConnection && targetUserId === authorIdStr) {
      wsSendJsonToUserExcept(targetUserId, payload, senderConnection, { scope: 'ws/api', op: 'share-create', targetUserId });
    } else {
      wsSendJsonToUser(targetUserId, payload, { scope: 'ws/api', op: 'share-create', targetUserId });
    }
  }
}

async function broadcastAtomeDelete({ atomeId, senderUserId, senderConnection = null }) {
  if (!DATABASE_ENABLED) return;
  if (!atomeId || !senderUserId) return;

  const recipients = await listAtomeRealtimeRecipients(atomeId);
  if (!recipients || recipients.length === 0) return;

  const nowIso = new Date().toISOString();
  const authorIdStr = String(senderUserId);
  const msgText = JSON.stringify({
    command: 'share-sync',
    params: {
      atomeId,
      particles: { __deleted: true },
      deletedAt: nowIso,
      authorId: authorIdStr
    }
  });

  for (const recipientId of recipients) {
    if (!recipientId) continue;
    const targetUserId = String(recipientId);
    const isAuthorSession = targetUserId === authorIdStr;
    if (!isAuthorSession && !await canReadAnyAtomeProperty(atomeId, recipientId)) continue;

    const payload = {
      type: 'console-message',
      authorId: authorIdStr,
      message: msgText,
      from: { userId: authorIdStr, phone: null, username: null },
      to: { userId: String(recipientId), phone: null },
      timestamp: nowIso
    };

    if (senderConnection && isAuthorSession) {
      wsSendJsonToUserExcept(targetUserId, payload, senderConnection, { scope: 'ws/api', op: 'share-sync', targetUserId });
    } else {
      wsSendJsonToUser(targetUserId, payload, { scope: 'ws/api', op: 'share-sync', targetUserId });
    }
  }
}

async function broadcastAtomeRealtimePatch({ atomeId, particles, senderUserId, senderConnection = null }) {
  if (!DATABASE_ENABLED) return { ok: false, error: 'database_unavailable' };
  if (!atomeId || !particles || typeof particles !== 'object') {
    return { ok: false, error: 'invalid_realtime_patch' };
  }
  if (!senderUserId) return { ok: false, error: 'authenticated_user_missing' };

  const authorization = await authorizeAtomeEventWrite({
    atome_id: atomeId,
    kind: 'realtime',
    payload: { props: particles }
  }, senderUserId);
  if (!authorization.allowed) {
    return { ok: false, error: authorization.reason || 'property_write_denied' };
  }

  const recipients = await listAtomeRealtimeRecipients(atomeId);
  if (!recipients || recipients.length === 0) return { ok: true, delivered: false };

  const nowIso = new Date().toISOString();
  const authorIdStr = String(senderUserId);
  for (const recipientId of recipients) {
    if (!recipientId) continue;

    const projectedParticles = await projectAtomePropertiesForRead(atomeId, particles, recipientId);
    if (!Object.keys(projectedParticles).length) continue;
    const msgText = JSON.stringify({
      command: 'share-sync',
      params: {
        atomeId,
        particles: projectedParticles,
        updatedAt: nowIso,
        authorId: authorIdStr
      }
    });

    const payload = {
      type: 'console-message',
      authorId: authorIdStr,
      message: msgText,
      from: { userId: authorIdStr, phone: null, username: null },
      to: { userId: String(recipientId), phone: null },
      timestamp: nowIso
    };

    const targetUserId = String(recipientId);
    if (senderConnection && targetUserId === authorIdStr) {
      wsSendJsonToUserExcept(targetUserId, payload, senderConnection, { scope: 'ws/api', op: 'share-sync', targetUserId });
    } else {
      wsSendJsonToUser(targetUserId, payload, { scope: 'ws/api', op: 'share-sync', targetUserId });
    }
  }
  return { ok: true, delivered: true };
}

async function broadcastCommittedAtomeEvent({ event, senderUserId, senderConnection = null }) {
  if (!DATABASE_ENABLED) return { ok: false, error: 'database_unavailable' };
  const atomeId = event?.atome_id || event?.atomeId || null;
  if (!atomeId || !senderUserId) return { ok: false, error: 'invalid_committed_event' };
  if (String(event?.kind || '').toLowerCase() === 'delete') {
    await broadcastAtomeDelete({ atomeId, senderUserId, senderConnection });
    return { ok: true, delivered: true };
  }
  if (String(event?.kind || '').toLowerCase() === 'restore') {
    const restored = await db.getAtome(atomeId);
    if (!restored) return { ok: false, error: 'restored_atome_unavailable' };
    await broadcastAtomeCreate({
      atomeId,
      atomeType: restored.atome_type || restored.type || restored.kind || 'generic',
      parentId: restored.parent_id || restored.parentId || null,
      particles: restored.properties || restored.data || {},
      senderUserId,
      senderConnection
    });
    return { ok: true, delivered: true };
  }

  const recipients = await listAtomeRealtimeRecipients(atomeId);
  if (!recipients.length) return { ok: true, delivered: false };

  const authorId = String(senderUserId);
  const timestamp = new Date().toISOString();
  let delivered = false;
  for (const recipientId of recipients) {
    if (!recipientId) continue;
    const projectedEvent = await projectEventForRead(event, recipientId);
    if (!projectedEvent) continue;
    const projectedPayload = projectedEvent.payload || {};
    const message = JSON.stringify({
      command: 'share-sync',
      params: {
        atomeId,
        particles: projectedPayload.props || {},
        delete_keys: projectedPayload.delete_keys || [],
        property_versions: projectedPayload.property_versions || {},
        event_id: projectedEvent.id || null,
        tx_id: projectedEvent.tx_id || null,
        gesture_id: projectedEvent.gesture_id || null,
        durable: true,
        updatedAt: timestamp,
        authorId
      }
    });
    const payload = {
      type: 'console-message',
      authorId,
      message,
      from: { userId: authorId, phone: null, username: null },
      to: { userId: String(recipientId), phone: null },
      timestamp
    };
    const targetUserId = String(recipientId);
    const result = senderConnection && targetUserId === authorId
      ? wsSendJsonToUserExcept(targetUserId, payload, senderConnection, {
        scope: 'ws/api', op: 'share-sync-commit', targetUserId
      })
      : wsSendJsonToUser(targetUserId, payload, {
        scope: 'ws/api', op: 'share-sync-commit', targetUserId
      });
    delivered = delivered || result?.delivered === true;
  }
  return { ok: true, delivered };
}

export {
  getEffectiveOwnerIdForAtome,
  listAtomeRealtimeRecipients,
  inheritPermissionsFromParent,
  broadcastAtomeCreate,
  broadcastAtomeDelete,
  broadcastAtomeRealtimePatch,
  broadcastCommittedAtomeEvent
};
