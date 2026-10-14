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
