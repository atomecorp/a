import db from '../database/adole.js';
import { wsSendJsonToUser, wsSendJsonToUserExcept } from './wsApiState.js';

const DATABASE_ENABLED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function getEffectiveOwnerIdForAtome(atomeId) {
  if (!atomeId) return null;
  try {
    const ownerRow = await db.query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
    const ownerId = ownerRow?.owner_id ? String(ownerRow.owner_id) : null;
    if (ownerId) return ownerId;

    const pendingRow = await db.query(
      'get',
      "SELECT particle_value FROM particles WHERE atome_id = ? AND particle_key = '_pending_owner_id' ORDER BY updated_at DESC LIMIT 1",
      [atomeId]
    );

    return pendingRow?.particle_value ? String(pendingRow.particle_value) : null;
  } catch (_) {
    return null;
  }
}

async function listAtomeRealtimeRecipients(atomeId) {
  if (!DATABASE_ENABLED || !atomeId) return [];

  try {
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
      const allowed = await db.canRead(atomeId, principalId);
      if (!allowed) continue;
      recipients.add(principalId);
    }

    return Array.from(recipients);
  } catch (_) {
    return [];
  }
}

async function inheritPermissionsFromParent({ parentId, childId, childOwnerId, grantorId }) {
  if (!DATABASE_ENABLED || !parentId || !childId) return;

  try {
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
  } catch (_) { }
}

async function broadcastAtomeCreate({ atomeId, atomeType, parentId, particles, senderUserId, senderConnection = null }) {
  if (!DATABASE_ENABLED) return;
  if (!atomeId || !senderUserId) return;

  const recipients = await listAtomeRealtimeRecipients(atomeId);
  if (!recipients || recipients.length === 0) return;

  const nowIso = new Date().toISOString();
  const msgText = JSON.stringify({
    command: 'share-create',
    params: {
      atomeId,
      atomeType,
      parentId,
      particles,
      createdAt: nowIso,
      authorId: String(senderUserId)
    }
  });

  for (const recipientId of recipients) {
    if (!recipientId) continue;

    const payload = {
      type: 'console-message',
      message: msgText,
      from: { userId: String(senderUserId), phone: null, username: null },
      to: { userId: String(recipientId), phone: null },
      timestamp: nowIso
    };

    try {
      const targetUserId = String(recipientId);
      if (String(recipientId) === String(senderUserId)) {
        wsSendJsonToUserExcept(
          targetUserId,
          payload,
          senderConnection,
          { scope: 'ws/api', op: 'share-create', targetUserId }
        );
      } else {
        wsSendJsonToUser(targetUserId, payload, { scope: 'ws/api', op: 'share-create', targetUserId });
      }
    } catch (_) { }
  }
}

async function broadcastAtomeDelete({ atomeId, senderUserId, senderConnection = null }) {
  if (!DATABASE_ENABLED) return;
  if (!atomeId || !senderUserId) return;

  const recipients = await listAtomeRealtimeRecipients(atomeId);
  if (!recipients || recipients.length === 0) return;

  const nowIso = new Date().toISOString();
  const msgText = JSON.stringify({
    command: 'share-sync',
    params: {
      atomeId,
      particles: { __deleted: true },
      deletedAt: nowIso,
      authorId: String(senderUserId)
    }
  });

  for (const recipientId of recipients) {
    if (!recipientId) continue;

    const payload = {
      type: 'console-message',
      message: msgText,
      from: { userId: String(senderUserId), phone: null, username: null },
      to: { userId: String(recipientId), phone: null },
      timestamp: nowIso
    };

    try {
      const targetUserId = String(recipientId);
      if (String(recipientId) === String(senderUserId)) {
        wsSendJsonToUserExcept(
          targetUserId,
          payload,
          senderConnection,
          { scope: 'ws/api', op: 'share-sync', targetUserId }
        );
      } else {
        wsSendJsonToUser(targetUserId, payload, { scope: 'ws/api', op: 'share-sync', targetUserId });
      }
    } catch (_) { }
  }
}

async function broadcastAtomeRealtimePatch({ atomeId, particles, senderUserId, senderConnection = null }) {
  if (!DATABASE_ENABLED) return;
  if (!atomeId || !particles || typeof particles !== 'object') return;
  if (!senderUserId) return;

  const recipients = await listAtomeRealtimeRecipients(atomeId);
  if (!recipients || recipients.length === 0) return;

  const nowIso = new Date().toISOString();
  const msgText = JSON.stringify({
    command: 'share-sync',
    params: {
      atomeId,
      particles,
      updatedAt: nowIso,
      authorId: String(senderUserId)
    }
  });

  for (const recipientId of recipients) {
    if (!recipientId) continue;

    const payload = {
      type: 'console-message',
      message: msgText,
      from: { userId: String(senderUserId), phone: null, username: null },
      to: { userId: String(recipientId), phone: null },
      timestamp: nowIso
    };

    try {
      const targetUserId = String(recipientId);
      if (String(recipientId) === String(senderUserId)) {
        wsSendJsonToUserExcept(
          targetUserId,
          payload,
          senderConnection,
          { scope: 'ws/api', op: 'share-sync', targetUserId }
        );
      } else {
        wsSendJsonToUser(targetUserId, payload, { scope: 'ws/api', op: 'share-sync', targetUserId });
      }
    } catch (_) { }
  }
}

export {
  getEffectiveOwnerIdForAtome,
  listAtomeRealtimeRecipients,
  inheritPermissionsFromParent,
  broadcastAtomeCreate,
  broadcastAtomeDelete,
  broadcastAtomeRealtimePatch
};
