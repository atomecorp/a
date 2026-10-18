-- Protected authentication infrastructure. Never replicated as Atome properties.
CREATE TABLE IF NOT EXISTS auth_password_credentials (
    principal_id TEXT PRIMARY KEY,
    verifier TEXT NOT NULL,
    updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_password_failures (
    bucket TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    next_ms INTEGER NOT NULL,
    expires_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_push_installations (
    installation_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    key_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    token TEXT NOT NULL,
    environment TEXT NOT NULL,
    updated_ms INTEGER NOT NULL,
    provider TEXT NOT NULL DEFAULT 'apns',
    PRIMARY KEY (installation_id, kind),
    UNIQUE(token, kind, environment)
);
CREATE TABLE IF NOT EXISTS auth_push_deliveries (
    delivery_id TEXT PRIMARY KEY,
    installation_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    expires_ms INTEGER NOT NULL
);

-- Bounded test seats on the platform OpenAI key. A revoked row also blocks a
-- principal that never held a seat.
CREATE TABLE IF NOT EXISTS provider_shared_seats (
    principal_id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK(state IN ('active', 'revoked')),
    granted_by TEXT NOT NULL CHECK(granted_by IN ('auto', 'admin')),
    claimed_ms INTEGER NOT NULL,
    revoked_ms INTEGER
);
CREATE TABLE IF NOT EXISTS provider_shared_usage (
    principal_id TEXT NOT NULL,
    day TEXT NOT NULL,
    operations INTEGER NOT NULL DEFAULT 0,
    tokens INTEGER NOT NULL DEFAULT 0,
    realtime INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (principal_id, day)
);
CREATE TABLE IF NOT EXISTS provider_shared_settings (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
