import db from '../database/adole.js';

const DATABASE_ENABLED = Boolean(process.env.SQLITE_PATH || process.env.LIBSQL_URL);

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

export { getEffectiveOwnerIdForAtome, listAtomeRealtimeRecipients };
