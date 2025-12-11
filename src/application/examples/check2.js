
import { TauriAdapter, FastifyAdapter, checkBackends, CONFIG } from '../../squirrel/apis/unified/_shared.js';

/**
 * Create a new user with phone/password: 99999999
 */
async function create_user() {
  const phone = '99999999';
  const password = '99999999';
  const backends = await checkBackends(true);
  const results = { tauri: null, fastify: null };

  if (backends.tauri) {
    try {
      results.tauri = await TauriAdapter.auth.register({ username: phone, phone, password });
      console.log('[Tauri/SQLite] Create user result:', results.tauri);
    } catch (e) {
      results.tauri = { error: e.message };
      console.error('[Tauri/SQLite] Error:', e.message);
    }
  } else {
    console.warn('[Tauri/SQLite] Server offline');
  }

  if (backends.fastify) {
    try {
      results.fastify = await FastifyAdapter.auth.register({ username: phone, phone, password });
      console.log('[Fastify/LibSQL] Create user result:', results.fastify);
    } catch (e) {
      results.fastify = { error: e.message };
      console.error('[Fastify/LibSQL] Error:', e.message);
    }
  } else {
    console.warn('[Fastify/LibSQL] Server offline');
  }

  return results;
}

/**
 * List users from both databases
 * Returns which database is queried: 'Tauri/SQLite' or 'Fastify/LibSQL'
 */
async function user_list() {
  const backends = await checkBackends(true);
  const results = {
    tauri: { database: 'Tauri/SQLite', users: [], error: null },
    fastify: { database: 'Fastify/LibSQL', users: [], error: null }
  };

  // Tauri: /api/auth/local/users
  if (backends.tauri) {
    try {
      const response = await fetch(`${CONFIG.TAURI_BASE_URL}/api/auth/local/users`);
      const data = await response.json();
      if (data.success) {
        results.tauri.users = data.users || [];
        console.log('[Tauri/SQLite] Users:', results.tauri.users);
      } else {
        results.tauri.error = data.error || 'Unknown error';
        console.error('[Tauri/SQLite] Error:', data.error);
      }
    } catch (e) {
      results.tauri.error = e.message;
      console.error('[Tauri/SQLite] Error:', e.message);
    }
  }

  // Fastify: /api/auth/users
  if (backends.fastify) {
    try {
      const response = await fetch(`${CONFIG.FASTIFY_BASE_URL}/api/auth/users`);
      const data = await response.json();
      if (data.success) {
        results.fastify.users = data.users || [];
        console.log('[Fastify/LibSQL] Users:', results.fastify.users);
      } else {
        results.fastify.error = data.error || 'Unknown error';
        console.error('[Fastify/LibSQL] Error:', data.error);
      }
    } catch (e) {
      results.fastify.error = e.message;
      console.error('[Fastify/LibSQL] Error:', e.message);
    }
  }

  return results;
}

/**
 * List all tables from both databases
 * Returns table names from Tauri/SQLite and Fastify/LibSQL
 */
async function list_tables() {
  const backends = await checkBackends(true);
  const results = {
    tauri: { database: 'Tauri/SQLite', tables: [], error: null },
    fastify: { database: 'Fastify/LibSQL', tables: [], error: null }
  };

  // Tauri: use /api/atome/debug/tables endpoint
  if (backends.tauri) {
    try {
      const response = await fetch(`${CONFIG.TAURI_BASE_URL}/api/atome/debug/tables`);
      const data = await response.json();
      if (data.success) {
        results.tauri.tables = data.tables || [];
        console.log('[Tauri/SQLite] Tables:', results.tauri.tables);
      } else {
        results.tauri.error = data.error || 'Unknown error';
        console.error('[Tauri/SQLite] Error:', data.error);
      }
    } catch (e) {
      results.tauri.error = e.message;
      console.error('[Tauri/SQLite] Error:', e.message);
    }
  }

  // Fastify: use /api/adole/debug/tables endpoint
  if (backends.fastify) {
    try {
      const response = await fetch(`${CONFIG.FASTIFY_BASE_URL}/api/adole/debug/tables`);
      const data = await response.json();
      if (data.success) {
        results.fastify.tables = data.tables || [];
        console.log('[Fastify/LibSQL] Tables:', results.fastify.tables);
      } else {
        results.fastify.error = data.error || 'Unknown error';
        console.error('[Fastify/LibSQL] Error:', data.error);
      }
    } catch (e) {
      results.fastify.error = e.message;
      console.error('[Fastify/LibSQL] Error:', e.message);
    }
  }

  return results;
}

// Keep existing UI


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



