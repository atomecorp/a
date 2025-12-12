



// ============================================
// ADOLE v3.0 - WebSocket API Functions
// ============================================

import { TauriAdapter, FastifyAdapter, CONFIG } from '../../squirrel/apis/unified/_shared.js';

/**
 * Create a user via WebSocket
 * @param {string} phone - Phone number
 * @param {string} password - Password
 * @param {string} username - Username
 */
async function create_user(phone, password, username) {
  console.log('[create_user] Creating user via WebSocket...');

  // Try Tauri first (local SQLite)
  try {
    const tauriResult = await TauriAdapter.auth.register({
      phone,
      password,
      username
    });
    if (tauriResult.ok || tauriResult.success) {
      console.log('[Tauri/SQLite] ✅ User created successfully:', tauriResult);
    } else {
      console.error('[Tauri/SQLite] ERROR:', tauriResult.error);
      console.error('[Tauri/SQLite] REASON: Registration failed on Tauri/Axum WebSocket server.');
      if (tauriResult.error?.includes('UNIQUE constraint')) {
        console.error('[Tauri/SQLite] SOLUTION: This user already exists. Use a different phone number or delete the existing user.');
      } else if (tauriResult.error?.includes('at least')) {
        console.error('[Tauri/SQLite] SOLUTION: Check that phone (6+ chars), password (6+ chars), and username (2+ chars) meet requirements.');
      } else {
        console.error('[Tauri/SQLite] SOLUTION: Check WebSocket connection and server logs.');
      }
    }
  } catch (e) {
    console.error('[Tauri/SQLite] ERROR:', e.message);
    console.error('[Tauri/SQLite] REASON: Exception during WebSocket communication.');
    console.error('[Tauri/SQLite] SOLUTION: Ensure Tauri server is running on ws://127.0.0.1:3000/ws/api');
  }

  // Also try Fastify (LibSQL)
  try {
    const fastifyResult = await FastifyAdapter.auth.register({
      phone,
      password,
      username
    });
    if (fastifyResult.ok || fastifyResult.success) {
      console.log('[Fastify/LibSQL] ✅ User created successfully:', fastifyResult);
    } else {
      console.error('[Fastify/LibSQL] ERROR:', fastifyResult.error);
      console.error('[Fastify/LibSQL] REASON: Registration failed on Fastify WebSocket server.');
      if (fastifyResult.error?.includes('UNIQUE') || fastifyResult.error?.includes('already')) {
        console.error('[Fastify/LibSQL] SOLUTION: This user already exists. Use a different phone number or delete the existing user.');
      } else if (fastifyResult.error?.includes('at least')) {
        console.error('[Fastify/LibSQL] SOLUTION: Check that phone (6+ chars), password (6+ chars), and username (2+ chars) meet requirements.');
      } else {
        console.error('[Fastify/LibSQL] SOLUTION: Check WebSocket connection and server logs.');
      }
    }
  } catch (e) {
    console.error('[Fastify/LibSQL] ERROR:', e.message);
    console.error('[Fastify/LibSQL] REASON: Exception during WebSocket communication.');
    console.error('[Fastify/LibSQL] SOLUTION: Ensure Fastify server is running on ws://127.0.0.1:3001/ws/api');
  }
}

/**
 * List all users via WebSocket
 * Uses atome.list to get user-type atomes
 */
async function user_list() {
  console.log('[user_list] Fetching users via WebSocket...');

  const results = {
    tauri: { users: [], error: null },
    fastify: { users: [], error: null }
  };

  // Try Tauri
  try {
    const tauriResult = await TauriAdapter.atome.list({ type: 'user' });
    if (tauriResult.ok || tauriResult.success) {
      results.tauri.users = tauriResult.atomes || tauriResult.data || [];
      console.log('[Tauri/SQLite] ✅ Users found:', results.tauri.users.length);
      console.log('[Tauri/SQLite] Users:', results.tauri);
    } else {
      results.tauri.error = tauriResult.error;
      console.error('[Tauri/SQLite] ERROR:', tauriResult.error);
      console.error('[Tauri/SQLite] REASON: Failed to list users from Tauri/Axum WebSocket server.');
      console.error('[Tauri/SQLite] SOLUTION: Check that the atome.list action is implemented in local_atome.rs');
    }
  } catch (e) {
    results.tauri.error = e.message;
    console.error('[Tauri/SQLite] ERROR:', e.message);
    console.error('[Tauri/SQLite] REASON: Exception during WebSocket communication.');
    console.error('[Tauri/SQLite] SOLUTION: Ensure Tauri server is running on ws://127.0.0.1:3000/ws/api');
  }

  // Try Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.list({ type: 'user' });
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify.users = fastifyResult.atomes || fastifyResult.data || [];
      console.log('[Fastify/LibSQL] ✅ Users found:', results.fastify.users.length);
      console.log('[Fastify/LibSQL] Users:', results.fastify);
    } else {
      results.fastify.error = fastifyResult.error;
      console.error('[Fastify/LibSQL] ERROR:', fastifyResult.error);
      console.error('[Fastify/LibSQL] REASON: Failed to list users from Fastify WebSocket server.');
      console.error('[Fastify/LibSQL] SOLUTION: Check WebSocket handler in server.js');
    }
  } catch (e) {
    results.fastify.error = e.message;
    console.error('[Fastify/LibSQL] ERROR:', e.message);
    console.error('[Fastify/LibSQL] REASON: Exception during WebSocket communication.');
    console.error('[Fastify/LibSQL] SOLUTION: Ensure Fastify server is running on ws://127.0.0.1:3001/ws/api');
  }

  return results;
}

/**
 * List all tables from both databases via WebSocket
 */
async function list_tables() {
  console.log('[list_tables] Fetching tables...');

  const results = {
    tauri: { database: 'Tauri/SQLite', tables: [], error: null },
    fastify: { database: 'Fastify/LibSQL', tables: [], error: null }
  };

  // Tauri: The debug/tables endpoint does not exist in WebSocket-only mode
  // This is expected behavior after ADOLE v3.0 migration
  console.error('[Tauri/SQLite] ERROR: The endpoint /api/debug/tables does not exist.');
  console.error('[Tauri/SQLite] REASON: Tauri/Axum server has been migrated to WebSocket-only architecture (ADOLE v3.0).');
  console.error('[Tauri/SQLite] SOLUTION: To list tables, you need to either:');
  console.error('  1. Add a WebSocket handler for "debug" messages in local_atome.rs');
  console.error('  2. Or query the database directly via SQLite tools');
  console.error('  3. Or add an HTTP route in mod.rs for /api/debug/tables');
  results.tauri.error = 'Endpoint not available - WebSocket-only mode (ADOLE v3.0)';

  // Fastify: Try HTTP debug endpoint
  try {
    const response = await fetch(`${CONFIG.FASTIFY_BASE_URL}/api/adole/debug/tables`);
    if (response.ok) {
      const data = await response.json();
      results.fastify.tables = data.tables || [];
      console.log('[Fastify/LibSQL] Tables:', results.fastify.tables);
    } else {
      const status = response.status;
      const statusText = response.statusText;
      console.error(`[Fastify/LibSQL] ERROR: HTTP ${status} ${statusText}`);
      console.error(`[Fastify/LibSQL] REASON: The endpoint /api/adole/debug/tables returned an error.`);
      console.error(`[Fastify/LibSQL] SOLUTION: Check if the debug route is registered in atomeRoutes.orm.js`);
      results.fastify.error = `HTTP ${status} ${statusText}`;
    }
  } catch (e) {
    console.error('[Fastify/LibSQL] ERROR:', e.message);
    console.error('[Fastify/LibSQL] REASON: Network error or server not reachable.');
    console.error('[Fastify/LibSQL] SOLUTION: Ensure Fastify server is running on port 3001');
    results.fastify.error = e.message;
  }

  return results;
}

// ============================================
// UI BUTTONS
// ============================================

// Keep existing UI and code




$('span', {
  id: 'clear_console',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'clear console',
  onClick: () => {
    console.clear();
  },
});


$('span', {
  id: 'create_user',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'create user',
  onClick: () => {
    create_user('00000000', '00000000', 'jeezs');
  },
});



$('span', {
  id: 'user_list',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Get user list',
  onClick: () => {
    console.log(user_list());
  },
});

$('span', {
  id: 'list_tables',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'List all tables',
  onClick: () => {
    console.log(list_tables());
  },
});



