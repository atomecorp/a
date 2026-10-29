// Websites (todo/publication_web_2026-10-28.md, server/site_publishing.js). The truth of a site's settings is its
// `site` Atome in the author's vault; these tables hold what only the server makes: the address claimed on
// atome.one, the frozen versions and the pointer to the one online, the operations (now or planned), the media a
// version points to by content (never copied), the contact form's rate log and the simulated domains and mail.
export async function ensureSiteTables(query) {
    await query('run', `CREATE TABLE IF NOT EXISTS site_publications (
        site_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL DEFAULT 'draft',
        live_version INTEGER,
        domain TEXT,
        domain_state TEXT,
        domain_token TEXT,
        primary_host TEXT NOT NULL DEFAULT 'atome',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_site_publications_owner ON site_publications(owner_id)');
    await query('run', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_site_publications_domain ON site_publications(domain) WHERE domain IS NOT NULL');
    // An address once used stays its site's for ever: an old one redirects to the current one (Q7).
    await query('run', `CREATE TABLE IF NOT EXISTS site_slugs (
        slug TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS site_versions (
        site_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        author TEXT NOT NULL DEFAULT 'user',
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(site_id, version)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS site_operations (
        op_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        version INTEGER,
        due_at TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        done_at TEXT
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_site_operations_due ON site_operations(state, due_at)');
    // A media of a version: its content's SHA-256 and the original file it is read from.
    await query('run', `CREATE TABLE IF NOT EXISTS site_media (
        sha256 TEXT NOT NULL,
        site_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        mime TEXT NOT NULL,
        PRIMARY KEY(sha256, site_id, version)
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS site_contact_log (
        site_id TEXT NOT NULL,
        ip_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )`);
    await query('run', 'CREATE INDEX IF NOT EXISTS idx_site_contact_log ON site_contact_log(site_id, created_at)');
    await query('run', `CREATE TABLE IF NOT EXISTS site_traffic (
        owner_id TEXT NOT NULL,
        month TEXT NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(owner_id, month)
    )`);
    // Simulated provider (Q14): the domains bought or transferred, their records and mail, and the ledger of each
    // charge (provider cost, atome's share, tax kept apart; nothing is really charged).
    await query('run', `CREATE TABLE IF NOT EXISTS site_domains (
        domain TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        state TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        auto_renew INTEGER NOT NULL DEFAULT 1,
        records_json TEXT NOT NULL DEFAULT '[]',
        mail_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    await query('run', `CREATE TABLE IF NOT EXISTS site_domain_ledger (
        entry_ref TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        kind TEXT NOT NULL,
        provider_cents INTEGER NOT NULL,
        commission_cents INTEGER NOT NULL,
        tax_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
}
