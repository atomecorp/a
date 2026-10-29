// SQL of the websites (database/adole_site_schema.js), for server/site_publishing.js and server/site_http.js.
export function createSiteStore({ query }) {
    const one = (sql, params = []) => query('get', sql, params);
    const all = async (sql, params = []) => (await query('all', sql, params)) || [];
    const run = (sql, params = []) => query('run', sql, params);
    return {
        site: siteId => one('SELECT * FROM site_publications WHERE site_id = ?', [siteId]),
        bySlug: async slug => {
            const row = await one('SELECT site_id FROM site_slugs WHERE slug = ?', [slug]);
            return row ? one('SELECT * FROM site_publications WHERE site_id = ?', [row.site_id]) : null;
        },
        slugOwner: async slug => (await one('SELECT site_id FROM site_slugs WHERE slug = ?', [slug]))?.site_id || null,
        byDomain: domain => one('SELECT * FROM site_publications WHERE domain = ?', [domain]),
        ofOwner: owner => all('SELECT * FROM site_publications WHERE owner_id = ? ORDER BY updated_at DESC', [owner]),
        create: ({ siteId, ownerId, projectId, slug }) => run(`INSERT INTO site_publications (site_id, owner_id, project_id, slug) VALUES (?, ?, ?, ?)`,
            [siteId, ownerId, projectId, slug]),
        claimSlug: (slug, siteId) => run('INSERT OR IGNORE INTO site_slugs (slug, site_id) VALUES (?, ?)', [slug, siteId]),
        update: (siteId, fields) => {
            const keys = Object.keys(fields);
            return run(`UPDATE site_publications SET ${keys.map(key => `${key} = ?`).join(', ')}, updated_at = datetime('now') WHERE site_id = ?`,
                [...keys.map(key => fields[key]), siteId]);
        },
        nextVersion: async siteId => Number((await one('SELECT MAX(version) AS v FROM site_versions WHERE site_id = ?', [siteId]))?.v || 0) + 1,
        addVersion: ({ siteId, version, author, manifest }) => run('INSERT INTO site_versions (site_id, version, author, manifest_json) VALUES (?, ?, ?, ?)',
            [siteId, version, author, JSON.stringify(manifest)]),
        version: async (siteId, version) => {
            const row = await one('SELECT * FROM site_versions WHERE site_id = ? AND version = ?', [siteId, version]);
            return row ? { ...row, manifest: JSON.parse(row.manifest_json) } : null;
        },
        versions: siteId => all('SELECT site_id, version, author, created_at FROM site_versions WHERE site_id = ? ORDER BY version DESC', [siteId]),
        addMedia: ({ sha256, siteId, version, filePath, mime }) => run('INSERT OR IGNORE INTO site_media (sha256, site_id, version, file_path, mime) VALUES (?, ?, ?, ?, ?)',
            [sha256, siteId, version, filePath, mime]),
        copyMedia: (siteId, from, to) => run(`INSERT OR IGNORE INTO site_media (sha256, site_id, version, file_path, mime)
            SELECT sha256, site_id, ?, file_path, mime FROM site_media WHERE site_id = ? AND version = ?`, [to, siteId, from]),
        // A media is public while a version online points to it.
        liveMedia: sha256 => one(`SELECT m.file_path, m.mime, p.owner_id FROM site_media m JOIN site_publications p
            ON p.site_id = m.site_id AND p.live_version = m.version AND p.state = 'online' WHERE m.sha256 = ? LIMIT 1`, [sha256]),
        addOperation: ({ opId, siteId, kind, version, dueAt }) => run(`INSERT INTO site_operations (op_id, site_id, kind, version, due_at) VALUES (?, ?, ?, ?, ?)`,
            [opId, siteId, kind, version, dueAt]),
        pending: siteId => one(`SELECT * FROM site_operations WHERE site_id = ? AND state = 'pending' ORDER BY due_at LIMIT 1`, [siteId]),
        due: at => all(`SELECT * FROM site_operations WHERE state = 'pending' AND due_at <= ? ORDER BY due_at`, [at]),
        nextDue: async () => (await one(`SELECT MIN(due_at) AS at FROM site_operations WHERE state = 'pending'`))?.at || null,
        finishOperation: (opId, state, error = null) => run(`UPDATE site_operations SET state = ?, error = ?, done_at = datetime('now') WHERE op_id = ? AND state = 'pending'`,
            [state, error, opId]),
        movePending: (siteId, dueAt) => run(`UPDATE site_operations SET due_at = ? WHERE site_id = ? AND state = 'pending'`, [dueAt, siteId]),
        cancelPending: siteId => run(`UPDATE site_operations SET state = 'cancelled', done_at = datetime('now') WHERE site_id = ? AND state = 'pending'`, [siteId]),
        operations: siteId => all('SELECT * FROM site_operations WHERE site_id = ? ORDER BY created_at DESC LIMIT 50', [siteId]),
        logContact: (siteId, ipKey, at) => run('INSERT INTO site_contact_log (site_id, ip_key, created_at) VALUES (?, ?, ?)', [siteId, ipKey, at]),
        contactCount: async (siteId, ipKey, since) => Number((await one(`SELECT COUNT(*) AS n FROM site_contact_log WHERE site_id = ? AND created_at >= ?
            ${ipKey ? 'AND ip_key = ?' : ''}`, ipKey ? [siteId, since, ipKey] : [siteId, since]))?.n || 0),
        addTraffic: (ownerId, month, bytes) => run(`INSERT INTO site_traffic (owner_id, month, bytes) VALUES (?, ?, ?)
            ON CONFLICT(owner_id, month) DO UPDATE SET bytes = bytes + excluded.bytes`, [ownerId, month, bytes]),
        traffic: async (ownerId, month) => Number((await one('SELECT bytes FROM site_traffic WHERE owner_id = ? AND month = ?', [ownerId, month]))?.bytes || 0)
    };
}
