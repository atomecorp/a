// The central tables of the principals' identity and of the server's services, as
// database/adole_principal_identity_schema.js, adole_public_events_schema.js, adole_shop_schema.js,
// adole_coach_schema.js, adole_scheduled_sends_schema.js, adole_site_schema.js and
// adole_objective_network_schema.js create them: each text byte for byte (`sqlite_master` keeps it).

// Verified phones (before their non-E.164 spellings are retired).
pub(super) const PHONE_CREDENTIALS: [&str; 3] = [
    r#"CREATE TABLE IF NOT EXISTS principal_phone_credentials (
        credential_id INTEGER PRIMARY KEY AUTOINCREMENT,
        principal_id TEXT NOT NULL,
        normalized_phone TEXT NOT NULL,
        verified_at TEXT NOT NULL,
        revoked_at TEXT,
        revoked_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
    )"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_principal_phone_active_unique ON principal_phone_credentials(normalized_phone) WHERE revoked_at IS NULL"#,
    r#"CREATE INDEX IF NOT EXISTS idx_principal_phone_principal ON principal_phone_credentials(principal_id, revoked_at)"#,
];

// Guests, aliases, identity and file migrations, privacy rules, surface grants, provisioning and guest adoption.
pub(super) const IDENTITY: [&str; 12] = [
    r#"CREATE TABLE IF NOT EXISTS guest_workspace_principals (
        guest_principal_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        adopted_principal_id TEXT,
        adoption_operation_digest TEXT UNIQUE,
        classified_at TEXT NOT NULL DEFAULT (datetime('now')),
        adopted_at TEXT,
        CHECK(status IN ('active', 'adopted'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS principal_identity_aliases (
        alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
        alias_value TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL,
        alias_kind TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(alias_kind IN ('legacy_principal'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS principal_identity_migrations (
        migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
        legacy_principal_id TEXT NOT NULL UNIQUE,
        principal_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failure_code TEXT,
        CHECK(status IN ('prepared', 'completed', 'failed'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS principal_file_migrations (
        migration_id INTEGER PRIMARY KEY AUTOINCREMENT,
        atome_id TEXT NOT NULL,
        legacy_principal_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        content_digest TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        failure_code TEXT,
        UNIQUE(atome_id, source_path, target_path),
        FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('prepared', 'completed', 'failed'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS property_privacy_rules (
        rule_id TEXT PRIMARY KEY,
        atome_id TEXT NOT NULL,
        particle_key TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        conditions TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(atome_id, particle_key),
        FOREIGN KEY(atome_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        FOREIGN KEY(owner_id) REFERENCES atomes(atome_id) ON DELETE CASCADE
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_privacy_rules_atome ON property_privacy_rules(atome_id, particle_key)"#,
    r#"CREATE TABLE IF NOT EXISTS surface_grants (
        grant_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        surface_id TEXT NOT NULL,
        grantee_id TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        decided_at TEXT,
        revoked_at TEXT,
        expires_at TEXT,
        FOREIGN KEY(owner_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        FOREIGN KEY(grantee_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('pending', 'granted', 'denied', 'revoked'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_surface_grants_owner ON surface_grants(owner_id, surface_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_surface_grants_grantee ON surface_grants(grantee_id, status)"#,
    r#"CREATE TABLE IF NOT EXISTS account_provision_operations (
        operation_digest TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('completed'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS guest_adoption_operations (
        operation_digest TEXT PRIMARY KEY,
        guest_principal_id TEXT NOT NULL,
        target_principal_id TEXT NOT NULL,
        manifest_digest TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        committed_at TEXT,
        completed_at TEXT,
        failure_code TEXT,
        FOREIGN KEY(target_principal_id) REFERENCES atomes(atome_id) ON DELETE CASCADE,
        CHECK(status IN ('prepared', 'importing', 'committed', 'completed', 'failed'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS guest_adoption_payloads (
        operation_digest TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        payload_digest TEXT NOT NULL,
        profile_event_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(operation_digest) REFERENCES guest_adoption_operations(operation_digest) ON DELETE CASCADE
    )"#,
];

// A guest adoption's files (after the payloads' profile event column).
pub(super) const GUEST_ADOPTION_FILES: [&str; 1] = [
    r#"CREATE TABLE IF NOT EXISTS guest_adoption_files (
        operation_digest TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_digest TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        status TEXT NOT NULL,
        staged_path TEXT,
        target_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(operation_digest, file_id),
        FOREIGN KEY(operation_digest) REFERENCES guest_adoption_operations(operation_digest) ON DELETE CASCADE,
        CHECK(status IN ('declared', 'staged', 'moved'))
    )"#,
];

// Public events, the shop, coaches, scheduled sends, websites, the objectives network and moderation, in that order.
pub(super) const SERVICES: [&str; 44] = [
    r#"CREATE TABLE IF NOT EXISTS public_event_series (
        event_id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL,
        reports INTEGER NOT NULL DEFAULT 0,
        hidden_at TEXT,
        published_at TEXT NOT NULL DEFAULT (datetime('now')),
        projected_until TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_public_event_series_author ON public_event_series(author_id, published_at)"#,
    r#"CREATE TABLE IF NOT EXISTS public_events (
        occurrence_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        cell INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        categories TEXT NOT NULL,
        free INTEGER NOT NULL DEFAULT 0
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_public_events_cell ON public_events(cell, end_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_public_events_event ON public_events(event_id)"#,
    r#"CREATE TABLE IF NOT EXISTS public_event_reports (
        event_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(event_id, reporter_id)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS shop_listings (
        listing_id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL,
        seller_name TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        price REAL NOT NULL,
        payload_json TEXT NOT NULL,
        reports INTEGER NOT NULL DEFAULT 0,
        hidden_at TEXT,
        published_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_listings_seller ON shop_listings(seller_id, updated_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_listings_recent ON shop_listings(updated_at)"#,
    r#"CREATE TABLE IF NOT EXISTS shop_listing_reports (
        listing_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(listing_id, reporter_id)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS shop_orders (
        order_id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        state TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        amount REAL NOT NULL,
        commission REAL NOT NULL,
        net REAL NOT NULL,
        deposit REAL NOT NULL DEFAULT 0,
        method TEXT NOT NULL,
        delivery TEXT NOT NULL DEFAULT '',
        tracking TEXT NOT NULL DEFAULT '',
        starts_at TEXT,
        ends_at TEXT,
        delivery_date TEXT,
        delivered_at TEXT,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_orders_buyer ON shop_orders(buyer_id, updated_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_orders_seller ON shop_orders(seller_id, updated_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_orders_listing ON shop_orders(listing_id, state)"#,
    r#"CREATE TABLE IF NOT EXISTS shop_order_steps (
        step_id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        action TEXT NOT NULL,
        role TEXT NOT NULL,
        actor_id TEXT NOT NULL DEFAULT '',
        from_state TEXT NOT NULL DEFAULT '',
        to_state TEXT NOT NULL,
        detail_json TEXT NOT NULL DEFAULT '{}',
        at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_shop_order_steps_order ON shop_order_steps(order_id, step_id)"#,
    r#"CREATE TABLE IF NOT EXISTS coach_directory (
        coach_id TEXT PRIMARY KEY,
        calendar_id TEXT NOT NULL,
        name TEXT NOT NULL,
        quality TEXT NOT NULL,
        words TEXT NOT NULL DEFAULT '',
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_coach_directory_name ON coach_directory(name)"#,
    r#"CREATE TABLE IF NOT EXISTS coach_bookings (
        booking_id TEXT PRIMARY KEY,
        coach_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        coach_name TEXT NOT NULL DEFAULT '',
        client_name TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        minutes INTEGER NOT NULL,
        cancel_hours INTEGER NOT NULL,
        title TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        client_calendar_id TEXT NOT NULL DEFAULT '',
        client_timezone TEXT NOT NULL DEFAULT '',
        coach_event_id TEXT NOT NULL DEFAULT '',
        client_event_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_coach_bookings_coach ON coach_bookings(coach_id, starts_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_coach_bookings_client ON coach_bookings(client_id, starts_at)"#,
    r#"CREATE TABLE IF NOT EXISTS coach_booking_steps (
        step_id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id TEXT NOT NULL,
        action TEXT NOT NULL,
        role TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        from_state TEXT NOT NULL DEFAULT '',
        to_state TEXT NOT NULL,
        at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_coach_booking_steps_booking ON coach_booking_steps(booking_id, step_id)"#,
    r#"CREATE TABLE IF NOT EXISTS scheduled_sends (
        send_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        parent_id TEXT,
        title TEXT NOT NULL DEFAULT '',
        due_at TEXT NOT NULL,
        state TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        done_at TEXT
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_scheduled_sends_due ON scheduled_sends(state, due_at)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_scheduled_sends_owner ON scheduled_sends(owner_id, due_at)"#,
    r#"CREATE TABLE IF NOT EXISTS site_publications (
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
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_site_publications_owner ON site_publications(owner_id)"#,
    r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_site_publications_domain ON site_publications(domain) WHERE domain IS NOT NULL"#,
    r#"CREATE TABLE IF NOT EXISTS site_slugs (
        slug TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS site_versions (
        site_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        author TEXT NOT NULL DEFAULT 'user',
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(site_id, version)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS site_operations (
        op_id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        version INTEGER,
        due_at TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        done_at TEXT
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_site_operations_due ON site_operations(state, due_at)"#,
    r#"CREATE TABLE IF NOT EXISTS site_media (
        sha256 TEXT NOT NULL,
        site_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        mime TEXT NOT NULL,
        PRIMARY KEY(sha256, site_id, version)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS site_contact_log (
        site_id TEXT NOT NULL,
        ip_key TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_site_contact_log ON site_contact_log(site_id, created_at)"#,
    r#"CREATE TABLE IF NOT EXISTS site_traffic (
        owner_id TEXT NOT NULL,
        month TEXT NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(owner_id, month)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS site_domains (
        domain TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        state TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        auto_renew INTEGER NOT NULL DEFAULT 1,
        records_json TEXT NOT NULL DEFAULT '[]',
        mail_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS site_domain_ledger (
        entry_ref TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        domain TEXT NOT NULL,
        kind TEXT NOT NULL,
        provider_cents INTEGER NOT NULL,
        commission_cents INTEGER NOT NULL,
        tax_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE TABLE IF NOT EXISTS objective_network_entries (
        objective_atome_id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        objective_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_objective_network_key ON objective_network_entries(objective_key, principal_id)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_objective_network_principal ON objective_network_entries(principal_id)"#,
    r#"CREATE TABLE IF NOT EXISTS objective_network_reports (
        target_id TEXT NOT NULL,
        reporter_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(target_id, reporter_id)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS moderation_cases (
        case_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reports INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        hidden_at TEXT,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        handled_by TEXT,
        UNIQUE(kind, target_id)
    )"#,
];
