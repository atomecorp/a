import path from 'path';
import { promises as fs } from 'fs';
import AdmZip from 'adm-zip';

const ALLOWED_TABLES = [
  'atomes',
  'particles',
  'particles_versions',
  'snapshots',
  'events',
  'state_current',
  'permissions',
  'sync_queue',
  'sync_state'
];

const IMPORT_ORDER = [
  'atomes',
  'particles',
  'particles_versions',
  'snapshots',
  'events',
  'state_current',
  'permissions',
  'sync_state',
  'sync_queue'
];

const safeParseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
};

const normalizeIdList = (values) => (
  Array.isArray(values) ? values.filter(Boolean).map((value) => String(value)) : []
);

const buildInClause = (values) => values.map(() => '?').join(',');

const normalizeEntryPath = (entryName) => entryName.replace(/\\/g, '/');

const normalizeInsertValue = (value) => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
};

const selectRows = async (dataSource, table, whereClause, params) => {
  if (!whereClause) return [];
  return dataSource.query(`SELECT * FROM ${table} WHERE ${whereClause}`, params);
};

const insertRows = async (dataSource, table, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return { inserted: 0 };
  const columns = new Set();
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => columns.add(key)));
  const columnList = Array.from(columns);
  if (!columnList.length) return { inserted: 0 };

  const quotedColumns = columnList.map((col) => `"${col}"`).join(',');
  const placeholders = columnList.map(() => '?').join(',');
  const sql = `INSERT OR IGNORE INTO ${table} (${quotedColumns}) VALUES (${placeholders})`;

  let inserted = 0;
  for (const row of rows) {
    const values = columnList.map((col) => normalizeInsertValue(row?.[col]));
    await dataSource.query(sql, values);
    inserted += 1;
  }
  return { inserted };
};

export async function buildUserExportZip({
  projectRoot,
  dataSource,
  userIds,
  includeFiles = true
}) {
  const users = normalizeIdList(userIds);
  if (!users.length) {
    return { buffer: null, manifest: { users: [] }, tables: {} };
  }

  const userClause = buildInClause(users);
  const atomeRows = await dataSource.query(
    `SELECT * FROM atomes WHERE atome_id IN (${userClause}) OR owner_id IN (${userClause}) OR creator_id IN (${userClause})`,
    [...users, ...users, ...users]
  );

  const atomeIds = new Set(atomeRows.map((row) => row.atome_id));
  users.forEach((id) => atomeIds.add(id));
  const atomeList = Array.from(atomeIds);
  const atomeClause = buildInClause(atomeList);

  const tables = {
    atomes: atomeRows,
    particles: await selectRows(dataSource, 'particles', `atome_id IN (${atomeClause})`, atomeList),
    particles_versions: await selectRows(
      dataSource,
      'particles_versions',
      `atome_id IN (${atomeClause})`,
      atomeList
    ),
    snapshots: await selectRows(
      dataSource,
      'snapshots',
      `atome_id IN (${atomeClause}) OR project_id IN (${atomeClause})`,
      [...atomeList, ...atomeList]
    ),
    events: await selectRows(
      dataSource,
      'events',
      `atome_id IN (${atomeClause}) OR project_id IN (${atomeClause})`,
      [...atomeList, ...atomeList]
    ),
    state_current: await selectRows(
      dataSource,
      'state_current',
      `atome_id IN (${atomeClause}) OR owner_id IN (${userClause})`,
      [...atomeList, ...users]
    ),
    permissions: await selectRows(
      dataSource,
      'permissions',
      `atome_id IN (${atomeClause}) OR principal_id IN (${userClause}) OR granted_by IN (${userClause})`,
      [...atomeList, ...users, ...users]
    ),
    sync_queue: await selectRows(dataSource, 'sync_queue', `atome_id IN (${atomeClause})`, atomeList),
    sync_state: await selectRows(dataSource, 'sync_state', `atome_id IN (${atomeClause})`, atomeList)
  };

  const manifest = {
    format: 'eve-user-export',
    version: 1,
    exported_at: new Date().toISOString(),
    users,
    tables: Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0])
    )
  };

  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

  for (const [table, rows] of Object.entries(tables)) {
    if (!ALLOWED_TABLES.includes(table)) continue;
    zip.addFile(`db/${table}.json`, Buffer.from(JSON.stringify(rows || [], null, 2)));
  }

  if (includeFiles) {
    for (const userId of users) {
      const userDir = path.join(projectRoot, 'data', 'users', userId);
      try {
        const stat = await fs.stat(userDir);
        if (stat.isDirectory()) {
          const targetRoot = normalizeEntryPath(path.join('data', 'users', userId));
          zip.addLocalFolder(userDir, targetRoot);
        }
      } catch (_) {
        // Skip missing user folder
      }
    }
  }

  return { buffer: zip.toBuffer(), manifest, tables };
}

export function inspectUserExportZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const manifestEntry = zip.getEntry('manifest.json');
  let manifest = null;
  if (manifestEntry) {
    manifest = safeParseJson(manifestEntry.getData().toString('utf8'));
  }

  let users = Array.isArray(manifest?.users) ? manifest.users : [];
  if (!users.length) {
    const atomesEntry = zip.getEntry('db/atomes.json');
    if (atomesEntry) {
      const atomes = safeParseJson(atomesEntry.getData().toString('utf8')) || [];
      if (Array.isArray(atomes)) {
        users = atomes
          .filter((row) => row?.atome_type === 'user')
          .map((row) => row?.atome_id)
          .filter(Boolean);
      }
    }
  }

  return { manifest, users };
}

export async function importUserExportZip({
  projectRoot,
  dataSource,
  zipBuffer
}) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const tables = {};

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = normalizeEntryPath(entry.entryName);
    if (!name.startsWith('db/') || !name.endsWith('.json')) continue;
    const tableName = name.replace(/^db\//, '').replace(/\.json$/, '');
    if (!ALLOWED_TABLES.includes(tableName)) continue;
    const payload = safeParseJson(entry.getData().toString('utf8'));
    if (!Array.isArray(payload)) continue;
    tables[tableName] = payload;
  }

  const importStats = {};

  for (const tableName of IMPORT_ORDER) {
    if (!tables[tableName]) continue;
    const result = await insertRows(dataSource, tableName, tables[tableName]);
    importStats[tableName] = result.inserted;
  }

  const baseUsersDir = path.join(projectRoot, 'data', 'users');
  const baseResolved = path.resolve(baseUsersDir) + path.sep;
  let filesWritten = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = normalizeEntryPath(entry.entryName);
    if (!name.startsWith('data/users/')) continue;
    const relative = name.replace(/^data\/users\//, '');
    const normalized = path.normalize(relative);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) continue;
    const targetPath = path.join(baseUsersDir, normalized);
    const resolved = path.resolve(targetPath);
    if (!resolved.startsWith(baseResolved)) continue;
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, entry.getData());
    filesWritten += 1;
  }

  return {
    tables: importStats,
    files_written: filesWritten
  };
}

