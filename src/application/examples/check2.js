



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
 * Delete a user via WebSocket
 * @param {string} phone - Phone number of the user to delete
 * @param {string} password - Password for verification
 * @param {string} username - Username (for logging purposes)
 */
async function delete_user(phone, password, username) {
  console.log(`[delete_user] Deleting user "${username}" via WebSocket...`);

  // Try Tauri first (local SQLite)
  try {
    const tauriResult = await TauriAdapter.auth.deleteAccount({
      phone,
      password
    });
    if (tauriResult.ok || tauriResult.success) {
      console.log('[Tauri/SQLite] ✅ User deleted successfully:', tauriResult);
    } else {
      console.error('[Tauri/SQLite] ERROR:', tauriResult.error);
      console.error('[Tauri/SQLite] REASON: Delete failed on Tauri/Axum WebSocket server.');
      if (tauriResult.error?.includes('not found') || tauriResult.error?.includes('Not found')) {
        console.error('[Tauri/SQLite] SOLUTION: This user does not exist. Check the phone number.');
      } else if (tauriResult.error?.includes('password') || tauriResult.error?.includes('Invalid')) {
        console.error('[Tauri/SQLite] SOLUTION: The password is incorrect. Verify the password.');
      } else if (tauriResult.error?.includes('token') || tauriResult.error?.includes('unauthorized')) {
        console.error('[Tauri/SQLite] SOLUTION: You must be logged in to delete your account.');
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
    const fastifyResult = await FastifyAdapter.auth.deleteAccount({
      phone,
      password
    });
    if (fastifyResult.ok || fastifyResult.success) {
      console.log('[Fastify/LibSQL] ✅ User deleted successfully:', fastifyResult);
    } else {
      console.error('[Fastify/LibSQL] ERROR:', fastifyResult.error);
      console.error('[Fastify/LibSQL] REASON: Delete failed on Fastify WebSocket server.');
      if (fastifyResult.error?.includes('not found') || fastifyResult.error?.includes('Not found')) {
        console.error('[Fastify/LibSQL] SOLUTION: This user does not exist. Check the phone number.');
      } else if (fastifyResult.error?.includes('password') || fastifyResult.error?.includes('Invalid')) {
        console.error('[Fastify/LibSQL] SOLUTION: The password is incorrect. Verify the password.');
      } else if (fastifyResult.error?.includes('token') || fastifyResult.error?.includes('unauthorized')) {
        console.error('[Fastify/LibSQL] SOLUTION: You must be logged in to delete your account.');
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
  console.log('[list_tables] Fetching tables via WebSocket...');

  const results = {
    tauri: { database: 'Tauri/SQLite', tables: [], error: null },
    fastify: { database: 'Fastify/LibSQL', tables: [], error: null }
  };

  // Tauri: Use WebSocket debug handler
  try {
    // Get the WebSocket connection from TauriAdapter
    const tauriResult = await new Promise((resolve) => {
      // Create WebSocket connection to Tauri
      const ws = new WebSocket('ws://127.0.0.1:3000/ws/api');
      const requestId = `debug_${Date.now()}`;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'debug',
          action: 'list-tables',
          requestId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === requestId) {
            ws.close();
            resolve(data);
          }
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      };

      ws.onerror = (e) => {
        resolve({ success: false, error: 'WebSocket connection failed' });
      };

      // Timeout after 5 seconds
      setTimeout(() => {
        ws.close();
        resolve({ success: false, error: 'Request timeout' });
      }, 5000);
    });

    if (tauriResult.success) {
      results.tauri.tables = tauriResult.tables || [];
      console.log('[Tauri/SQLite] ✅ Tables:', results.tauri.tables);
    } else {
      results.tauri.error = tauriResult.error;
      console.error('[Tauri/SQLite] ERROR:', tauriResult.error);
      console.error('[Tauri/SQLite] REASON: WebSocket debug request failed.');
      console.error('[Tauri/SQLite] SOLUTION: Ensure Tauri server is running on ws://127.0.0.1:3000/ws/api');
    }
  } catch (e) {
    results.tauri.error = e.message;
    console.error('[Tauri/SQLite] ERROR:', e.message);
    console.error('[Tauri/SQLite] REASON: Exception during WebSocket communication.');
    console.error('[Tauri/SQLite] SOLUTION: Ensure Tauri server is running on ws://127.0.0.1:3000/ws/api');
  }

  // Fastify: Use WebSocket debug handler
  try {
    const fastifyResult = await new Promise((resolve) => {
      const ws = new WebSocket('ws://127.0.0.1:3001/ws/api');
      const requestId = `debug_${Date.now()}`;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'debug',
          action: 'list-tables',
          requestId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === requestId) {
            ws.close();
            resolve(data);
          }
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      };

      ws.onerror = (e) => {
        resolve({ success: false, error: 'WebSocket connection failed' });
      };

      setTimeout(() => {
        ws.close();
        resolve({ success: false, error: 'Request timeout' });
      }, 5000);
    });

    if (fastifyResult.success) {
      results.fastify.tables = fastifyResult.tables || [];
      console.log('[Fastify/LibSQL] ✅ Tables:', results.fastify.tables);
    } else {
      results.fastify.error = fastifyResult.error;
      console.error('[Fastify/LibSQL] ERROR:', fastifyResult.error);
      console.error('[Fastify/LibSQL] REASON: WebSocket debug request failed.');
      console.error('[Fastify/LibSQL] SOLUTION: Ensure Fastify server is running on ws://127.0.0.1:3001/ws/api');
    }
  } catch (e) {
    results.fastify.error = e.message;
    console.error('[Fastify/LibSQL] ERROR:', e.message);
    console.error('[Fastify/LibSQL] REASON: Exception during WebSocket communication.');
    console.error('[Fastify/LibSQL] SOLUTION: Ensure Fastify server is running on ws://127.0.0.1:3001/ws/api');
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
    puts('Clearing console...');
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
    puts('Creating user...');
    create_user('00000000', '00000000', 'jeezs');
  },
});

$('span', {
  id: 'delete_user',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'delete user',
  onClick: () => {
    puts('Deleting user...');
    delete_user('00000000', '00000000', 'jeezs');
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
    puts('Fetching user list...');
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
    puts('Listing all tables...');
    console.log(list_tables());
  },
});



