// ============================================================================
// ADOLE EVENT MAINTENANCE — repairs and migrations through appendEvent
// ============================================================================
// Global-scope repair of state_current and principal file migration
// bookkeeping; every state change goes through the canonical event commit.

import { query, withTransaction } from './adole_db_core.js';
import { appendEvent } from './adole_event_log.js';

export async function repairGlobalStateCurrentScopes() {
    const rows = await query('all', `SELECT sc.atome_id, COALESCE(sc.owner_id, a.owner_id) AS owner_id
        FROM state_current sc
        LEFT JOIN atomes a ON a.atome_id = sc.atome_id
        WHERE sc.project_id IS NOT NULL AND (
            LOWER(COALESCE(a.atome_type, '')) = 'user'
            OR LOWER(sc.atome_id) LIKE 'tool.ui.%'
            OR LOWER(sc.atome_id) LIKE 'tool_ui.%'
            OR LOWER(COALESCE(json_extract(sc.properties, '$.tool_scope'), '')) = 'catalog'
            OR json_extract(sc.properties, '$.atome_tool') = 1
        )`);
    const repaired = [];
    for (const row of rows || []) {
        const event = await appendEvent({
            id: `global_scope_repair_v1:${row.atome_id}`,
            kind: 'set',
            atome_id: row.atome_id,
            scope: 'global',
            actor: row.owner_id ? { type: 'user', id: row.owner_id } : null,
            payload: { props: {}, scope: 'global' }
        });
        repaired.push(event.atome_id);
    }
    return { ok: true, repaired_ids: repaired };
}

export async function preparePrincipalFileMigration(values = {}) {
    const now = new Date().toISOString();
    await query('run', `INSERT INTO principal_file_migrations
        (atome_id, legacy_principal_id, principal_id, source_path, target_path, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'prepared', ?)
        ON CONFLICT(atome_id, source_path, target_path) DO UPDATE SET
            status = CASE WHEN principal_file_migrations.status = 'completed' THEN 'completed' ELSE 'prepared' END,
            failure_code = NULL`, [
        values.atomeId,
        values.legacyPrincipalId,
        values.principalId,
        values.sourcePath,
        values.targetPath,
        now
    ]);
}

export async function completePrincipalFileMigration(values = {}) {
    const now = new Date().toISOString();
    return withTransaction(async () => {
        await appendEvent({
            id: `principal_file_migration_v1:${values.atomeId}:${values.digest}`,
            kind: 'set',
            atome_id: values.atomeId,
            actor: { type: 'user', id: values.principalId },
            payload: { props: { file_path: values.canonicalPath } }
        });
        await query('run', `UPDATE principal_file_migrations
            SET status = 'completed', content_digest = ?, completed_at = ?, failure_code = NULL
            WHERE atome_id = ? AND source_path = ? AND target_path = ?`, [
            values.digest,
            now,
            values.atomeId,
            values.sourcePath,
            values.targetPath
        ]);
    });
}

export async function failPrincipalFileMigration(values = {}, error = null) {
    await query('run', `UPDATE principal_file_migrations SET status = 'failed', failure_code = ?
        WHERE atome_id = ? AND source_path = ? AND target_path = ?`, [
        String(error?.message || error), values.atomeId, values.sourcePath, values.targetPath
    ]);
}
