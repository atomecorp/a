import db from '../database/adole.js';

const DATABASE_ENABLED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    throw new Error('atome_realtime_json_invalid');
  }
}

async function getEffectiveOwnerIdForAtome(atomeId) {
  if (!atomeId) return null;
  const ownerRow = await db.query('get', 'SELECT owner_id FROM atomes WHERE atome_id = ?', [atomeId]);
  if (ownerRow?.owner_id) return String(ownerRow.owner_id);
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
  const rows = await db.query(
    'all',
    `SELECT DISTINCT principal_id, share_mode FROM permissions
     WHERE atome_id = ? AND can_read = 1
       AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    [atomeId]
  );
  for (const row of rows || []) {
    const mode = String(row.share_mode || '').trim().toLowerCase();
    if (mode && mode !== 'real-time' && mode !== 'realtime') continue;
    if (row.principal_id) recipients.add(String(row.principal_id));
  }
  return Array.from(recipients);
}

async function inheritPermissionsFromParent({ parentId, childId, childOwnerId, grantorId }) {
  if (!DATABASE_ENABLED || !parentId || !childId) return;
  const rows = await db.query(
    'all',
    `SELECT principal_id, can_read, can_write, can_delete, can_share, can_create,
            share_mode, conditions, expires_at, granted_by
     FROM permissions
     WHERE atome_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    [parentId]
  );
  for (const row of rows || []) {
    const principalId = row?.principal_id ? String(row.principal_id) : null;
    if (!principalId || (childOwnerId && principalId === String(childOwnerId))) continue;
    await db.setPermission(
      childId, principalId, row.can_read === 1, row.can_write === 1,
      row.can_delete === 1, row.can_share === 1, null,
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
      childId, String(parentOwnerId), true, true, true, true,
      null, grantorId || String(parentOwnerId),
      { canCreate: true, shareMode: 'real-time' }
    );
  }
}

export { getEffectiveOwnerIdForAtome, listAtomeRealtimeRecipients, inheritPermissionsFromParent };
