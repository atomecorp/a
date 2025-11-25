import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataSource } from 'typeorm';
import { UserEntity } from './User.js';
import { ProjectEntity } from './Project.js';
import { AtomeEntity } from './Atome.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadEnvFile(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) {
      continue;
    }
    const delimiterIndex = line.indexOf('=');
    if (delimiterIndex === -1) {
      continue;
    }

    const key = line.slice(0, delimiterIndex).trim();
    if (!key) {
      continue;
    }

    let value = line.slice(delimiterIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n');

    if (override || !(key in process.env)) {
      process.env[key] = value;
    }
  }

  return true;
}

loadEnvFile(path.join(PROJECT_ROOT, '.env'));
loadEnvFile(path.join(PROJECT_ROOT, '.env.local'), { override: true });

export const PG_URL = process.env.ADOLE_PG_DSN || process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL;

if (!PG_URL) {
  throw new Error('ADOLE_PG_DSN (or PG_CONNECTION_STRING/DATABASE_URL) must be defined. Add it to .env or export it before starting Squirrel.');
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: PG_URL,
  synchronize: true, // Attention: à désactiver en prod une fois stable, utiliser les migrations
  logging: false,
  entities: [UserEntity, ProjectEntity, AtomeEntity],
  subscribers: [],
  migrations: [],
});

export const ensureAdoleSchema = async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  // TypeORM synchronize: true handles schema creation automatically
  console.log("✅ Database schema synchronized via TypeORM");

  // Execute raw SQL for ADOLE specific tables if needed (legacy support)
  await AppDataSource.query(ADOLE_SCHEMA_SQL);
};

// Helper pour garder la compatibilité si besoin, mais idéalement utiliser AppDataSource.getRepository(Entity)
export const db = AppDataSource;

const ADOLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id   UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS principals (
  principal_id UUID PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES tenants(tenant_id),
  kind         TEXT CHECK (kind IN ('user','service')),
  email        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS objects (
  object_id   UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  type        TEXT NOT NULL,
  created_by  UUID REFERENCES principals(principal_id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  schema_version INT DEFAULT 1,
  capability_flags JSONB DEFAULT '{}'::jsonb,
  meta JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS branches (
  branch_id   UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  object_id   UUID NOT NULL REFERENCES objects(object_id),
  name        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (object_id, name)
);

CREATE TABLE IF NOT EXISTS commits (
  commit_id     UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id),
  object_id     UUID NOT NULL REFERENCES objects(object_id),
  branch_id     UUID NOT NULL REFERENCES branches(branch_id),
  author_id     UUID REFERENCES principals(principal_id),
  logical_clock BIGINT NOT NULL,
  lsn_hint      PG_LSN,
  created_at    TIMESTAMPTZ DEFAULT now(),
  message       TEXT,
  meta          JSONB DEFAULT '{}'::jsonb,
  root_hash     BYTEA
);

CREATE TABLE IF NOT EXISTS commit_parents (
  commit_id  UUID NOT NULL REFERENCES commits(commit_id) ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES commits(commit_id),
  PRIMARY KEY (commit_id, parent_id)
);

CREATE TABLE IF NOT EXISTS changes (
  change_id     BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id),
  commit_id     UUID NOT NULL REFERENCES commits(commit_id) ON DELETE CASCADE,
  property_path TEXT NOT NULL,
  patch_op      TEXT NOT NULL,
  patch_value   JSONB,
  prev_hash     BYTEA,
  new_hash      BYTEA,
  meta          JSONB DEFAULT '{}'::jsonb,
  inverse_op    TEXT,
  inverse_value JSONB
);

CREATE TABLE IF NOT EXISTS object_state (
  tenant_id   UUID NOT NULL REFERENCES tenants(tenant_id),
  object_id   UUID NOT NULL REFERENCES objects(object_id),
  branch_id   UUID NOT NULL REFERENCES branches(branch_id),
  version_seq BIGINT NOT NULL,
  snapshot    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, object_id, branch_id)
);

CREATE TABLE IF NOT EXISTS acls (
  acl_id        UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id),
  object_id     UUID NOT NULL REFERENCES objects(object_id),
  property_path TEXT,
  principal_id  UUID NOT NULL REFERENCES principals(principal_id),
  action        TEXT NOT NULL,
  allow         BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS shares (
  share_id      UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(tenant_id),
  object_id     UUID NOT NULL REFERENCES objects(object_id),
  target_tenant UUID NOT NULL REFERENCES tenants(tenant_id),
  mode          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
  object_id UUID NOT NULL REFERENCES objects(object_id),
  device_id UUID,
  action TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS changes_by_commit ON changes (tenant_id, commit_id);
CREATE INDEX IF NOT EXISTS changes_by_path   ON changes (tenant_id, property_path);
CREATE INDEX IF NOT EXISTS object_state_json ON object_state USING GIN (snapshot jsonb_path_ops);
CREATE INDEX IF NOT EXISTS acls_idx          ON acls (tenant_id, object_id, property_path, action, principal_id);
`;

export const isPostgres = true;

