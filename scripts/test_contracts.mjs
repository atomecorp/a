/* Contract tests for Axum (Tauri) vs Fastify (Node) parity. */

const FASTIFY_URL = process.env.FASTIFY_URL || 'http://127.0.0.1:3001';
const TAURI_URL = process.env.TAURI_URL || 'http://127.0.0.1:3000';

const REQUIRED_TABLES = [
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

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function normalizeTables(tables) {
  return new Set((tables || []).map((t) => String(t).trim()).filter(Boolean));
}

function diffSets(a, b) {
  const onlyA = [];
  for (const item of a) {
    if (!b.has(item)) onlyA.push(item);
  }
  return onlyA;
}

async function main() {
  let ok = true;
  try {
    const [fastifyStatus, tauriStatus] = await Promise.all([
      fetchJson(`${FASTIFY_URL}/api/db/status`),
      fetchJson(`${TAURI_URL}/api/db/status`)
    ]);

    if (!fastifyStatus.success || !tauriStatus.success) {
      console.error('❌ /api/db/status not successful');
      ok = false;
    }

    if (fastifyStatus.schema_hash && tauriStatus.schema_hash && fastifyStatus.schema_hash !== tauriStatus.schema_hash) {
      console.error('❌ Schema hash mismatch');
      console.error('fastify:', fastifyStatus.schema_hash);
      console.error('tauri  :', tauriStatus.schema_hash);
      ok = false;
    }

    const fastifyTables = normalizeTables(fastifyStatus.tables);
    const tauriTables = normalizeTables(tauriStatus.tables);

    const missingFastify = REQUIRED_TABLES.filter((t) => !fastifyTables.has(t));
    const missingTauri = REQUIRED_TABLES.filter((t) => !tauriTables.has(t));
    if (missingFastify.length) {
      console.error('❌ Fastify missing tables:', missingFastify.join(', '));
      ok = false;
    }
    if (missingTauri.length) {
      console.error('❌ Tauri missing tables:', missingTauri.join(', '));
      ok = false;
    }

    const [fastifyDebug, tauriDebug] = await Promise.all([
      fetchJson(`${FASTIFY_URL}/api/adole/debug/tables`),
      fetchJson(`${TAURI_URL}/api/adole/debug/tables`)
    ]);

    if (!fastifyDebug.success || !tauriDebug.success) {
      console.error('❌ /api/adole/debug/tables not successful');
      ok = false;
    }

    const fastifyDebugTables = normalizeTables(fastifyDebug.tables);
    const tauriDebugTables = normalizeTables(tauriDebug.tables);

    const onlyFastify = diffSets(fastifyDebugTables, tauriDebugTables);
    const onlyTauri = diffSets(tauriDebugTables, fastifyDebugTables);
    if (onlyFastify.length || onlyTauri.length) {
      console.error('❌ Table list mismatch');
      if (onlyFastify.length) console.error('fastify only:', onlyFastify.join(', '));
      if (onlyTauri.length) console.error('tauri only  :', onlyTauri.join(', '));
      ok = false;
    }

    if (fastifyDebug.schema_hash && tauriDebug.schema_hash && fastifyDebug.schema_hash !== tauriDebug.schema_hash) {
      console.error('❌ Schema hash mismatch in debug tables');
      ok = false;
    }
  } catch (error) {
    console.error('❌ Contract test failed:', error.message);
    ok = false;
  }

  if (!ok) {
    process.exit(1);
  }

  console.log('✅ Contract tests passed (Axum vs Fastify).');
}

main();
