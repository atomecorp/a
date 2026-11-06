// The central tables of sync and of the social layer, as database/adole_schema_migrations.js creates
// them (`ensureSyncEventTables`, `ensureCommunicationTables`): each text byte for byte, since
// SQLite keeps it in `sqlite_master` and a table first made here keeps the text it was made with.

// Streams, their counters and winners, manual shares, the vault registries, then the share requests.
pub(super) const SYNC_STREAMS: [&str; 9] = [
    r#"CREATE TABLE IF NOT EXISTS sync_streams (
        stream_id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL UNIQUE,
        project_id TEXT,
        atome_id TEXT,
        owner_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS sync_stream_sequences (
        stream_id TEXT PRIMARY KEY,
        last_sequence INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(stream_id) REFERENCES sync_streams(stream_id) ON DELETE CASCADE
    )"#,
    r#"CREATE TABLE IF NOT EXISTS event_property_winners (
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_ts TEXT,
        timestamp_valid INTEGER NOT NULL DEFAULT 0,
        sequence INTEGER NOT NULL,
        decision TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(atome_id, particle_key),
        FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE RESTRICT
    )"#,
    r#"CREATE TABLE IF NOT EXISTS manual_share_cursors (
        share_id TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        published_sequence INTEGER NOT NULL DEFAULT 0,
        acknowledged_sequence INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(share_id, stream_id),
        FOREIGN KEY(stream_id) REFERENCES sync_streams(stream_id) ON DELETE CASCADE
    )"#,
    r#"CREATE TABLE IF NOT EXISTS vault_principal_registry (
        principal_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        vault_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        provisioned_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(provider IN ('process', 'freebsd-jail')),
        CHECK(status IN ('active', 'stopped', 'failed'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS vault_object_registry (
        atome_id TEXT PRIMARY KEY,
        vault_principal_id TEXT NOT NULL,
        registered_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(vault_principal_id) REFERENCES vault_principal_registry(principal_id) ON DELETE RESTRICT
    )"#,
    r#"CREATE TABLE IF NOT EXISTS vault_stream_registry (
        stream_id TEXT PRIMARY KEY,
        vault_principal_id TEXT NOT NULL,
        project_id TEXT,
        atome_id TEXT,
        registered_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(vault_principal_id) REFERENCES vault_principal_registry(principal_id) ON DELETE RESTRICT
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_vault_stream_principal ON vault_stream_registry(vault_principal_id)"#,
    r#"CREATE TABLE IF NOT EXISTS sync_share_requests (
        share_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        atome_id TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        share_type TEXT NOT NULL,
        share_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        allowed_properties_json TEXT,
        publication_cursor INTEGER NOT NULL DEFAULT 0,
        detached_atome_id TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(share_type IN ('linked', 'detached')),
        CHECK(share_mode IN ('real-time', 'manual')),
        CHECK(status IN ('pending', 'active', 'accepted', 'rejected', 'revoked', 'expired'))
    )"#,
];

// The share requests' indexes (after their sharing-chain columns), the policies, the directory's profiles.
pub(super) const SHARES: [&str; 5] = [
    r#"CREATE INDEX IF NOT EXISTS idx_sync_share_recipient ON sync_share_requests(principal_id, status)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sync_share_parent ON sync_share_requests(parent_share_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_sync_share_stream ON sync_share_requests(stream_id, principal_id, status)"#,
    r#"CREATE TABLE IF NOT EXISTS sync_share_policies (
        owner_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        policy TEXT NOT NULL,
        permissions_json TEXT,
        revoked_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(owner_id, peer_id),
        CHECK(policy IN ('one-shot', 'always', 'never', 'block'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS directory_public_profiles (
        principal_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        user_face TEXT,
        card_json TEXT,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
];

// The directory's public events (after the profiles' columns).
pub(super) const DIRECTORY_EVENTS: [&str; 1] =
    [r#"CREATE TABLE IF NOT EXISTS directory_public_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL,
        action TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK(action IN ('upsert', 'revoke', 'delete'))
    )"#];

// Contacts, the News and their votes and reports, communities, forums, planned visio rooms.
pub(super) const COMMUNICATION: [&str; 17] = [
    r#"CREATE TABLE IF NOT EXISTS communication_preferences (
        user_id TEXT PRIMARY KEY,
        accept_unknown INTEGER NOT NULL DEFAULT 1,
        address_book_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS communication_contacts (
        owner_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(owner_id, peer_id),
        CHECK(status IN ('pending', 'accepted', 'refused'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS communication_contact_requests (
        request_id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        target_id TEXT,
        note TEXT,
        created_ms INTEGER NOT NULL,
        resolved_ms INTEGER
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_communication_contact_requests_sender ON communication_contact_requests(sender_id, created_ms)"#,
    r#"CREATE TABLE IF NOT EXISTS news_publications (
        news_id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        project_id TEXT,
        title TEXT,
        summary TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        audience_json TEXT NOT NULL DEFAULT '"all"',
        payload_json TEXT,
        media_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS news_subscriptions (
        user_id TEXT PRIMARY KEY,
        tags_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS news_tags (
        slug TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        origin TEXT NOT NULL DEFAULT 'user',
        use_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_news_publications_author ON news_publications(author_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_news_publications_thread ON news_publications(thread_ref, root_id)"#,
    r#"CREATE TABLE IF NOT EXISTS news_votes (
        news_id TEXT NOT NULL,
        voter_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(news_id, voter_id)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS news_reports (
        news_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT,
        dismissed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(news_id, reporter_id)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS communities (
        community_id TEXT PRIMARY KEY,
        host_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS community_members (
        community_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(community_id, user_id),
        CHECK(status IN ('member', 'refused', 'banned'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS forums (
        forum_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS forum_members (
        forum_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        invited_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(forum_id, user_id),
        CHECK(status IN ('invited', 'member'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS forum_guests (
        token TEXT PRIMARY KEY,
        forum_id TEXT NOT NULL,
        name TEXT,
        invited_by TEXT NOT NULL,
        claimed_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS visio_rooms (
        room_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        title TEXT,
        starts_at TEXT,
        ends_at TEXT,
        invitees_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
];
