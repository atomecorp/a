



// ============================================
// ADOLE v3.0 - WebSocket API Functions
// ============================================

import { TauriAdapter, FastifyAdapter, CONFIG } from '../../squirrel/apis/unified/adole.js';

/**
 * Create a user via WebSocket
 * @param {string} phone - Phone number
 * @param {string} password - Password
 * @param {string} username - Username
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function create_user(phone, password, username, callback) {
  console.log('[create_user] Creating user via WebSocket...');

  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Try Tauri first (local SQLite)
  try {
    const tauriResult = await TauriAdapter.auth.register({
      phone,
      password,
      username
    });
    if (tauriResult.ok || tauriResult.success) {
      console.log('[Tauri/SQLite] ✅ User created successfully:', tauriResult);
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      console.error('[Tauri/SQLite] ERROR:', tauriResult.error);
      console.error('[Tauri/SQLite] REASON: Registration failed on Tauri/Axum WebSocket server.');
      results.tauri = { success: false, data: null, error: tauriResult.error };
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
    results.tauri = { success: false, data: null, error: e.message };
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
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
      // Only log errors if server is reachable (not just offline)
      if (fastifyResult.error !== 'Server unreachable') {
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
    }
  } catch (e) {
    console.error('[Fastify/LibSQL] ERROR:', e.message);
    console.error('[Fastify/LibSQL] REASON: Exception during WebSocket communication.');
    console.error('[Fastify/LibSQL] SOLUTION: Ensure Fastify server is running on ws://127.0.0.1:3001/ws/api');
    results.fastify = { success: false, data: null, error: e.message };
  }

  // Call callback if provided
  if (typeof callback === 'function') {
    callback(results);
  }

  return results;
}

/**
 * Login a user via WebSocket
 * @param {string} phone - Phone number
 * @param {string} password - Password
 * @param {string} username - Username (for logging purposes)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function log_user(phone, password, username, callback) {
  console.log(`[log_user] Logging in user "${username}" via WebSocket...`);

  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Try Tauri first (local SQLite)
  try {
    const tauriResult = await TauriAdapter.auth.login({
      phone,
      password
    });
    if (tauriResult.ok || tauriResult.success) {
      console.log('[Tauri/SQLite] ✅ User logged in successfully');
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
      // Clean log for expected cases
      if (tauriResult.error?.includes('not found') || tauriResult.error?.includes('Not found')) {
        console.log('[Tauri/SQLite] ℹ️ User not found');
      } else if (tauriResult.error?.includes('password') || tauriResult.error?.includes('Invalid')) {
        console.log('[Tauri/SQLite] ℹ️ Invalid credentials');
      } else {
        console.log('[Tauri/SQLite] ℹ️ Login failed:', tauriResult.error);
      }
    }
  } catch (e) {
    console.log('[Tauri/SQLite] ℹ️ Connection failed:', e.message);
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Also try Fastify (LibSQL)
  try {
    const fastifyResult = await FastifyAdapter.auth.login({
      phone,
      password
    });
    if (fastifyResult.ok || fastifyResult.success) {
      console.log('[Fastify/LibSQL] ✅ User logged in successfully');
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
      if (fastifyResult.error !== 'Server unreachable') {
        // Clean log for expected cases
        if (fastifyResult.error?.includes('not found') || fastifyResult.error?.includes('Not found')) {
          console.log('[Fastify/LibSQL] ℹ️ User not found');
        } else if (fastifyResult.error?.includes('password') || fastifyResult.error?.includes('Invalid')) {
          console.log('[Fastify/LibSQL] ℹ️ Invalid credentials');
        } else {
          console.log('[Fastify/LibSQL] ℹ️ Login failed:', fastifyResult.error);
        }
      }
    }
  } catch (e) {
    console.log('[Fastify/LibSQL] ℹ️ Connection failed:', e.message);
    results.fastify = { success: false, data: null, error: e.message };
  }

  // Call callback if provided
  if (typeof callback === 'function') {
    callback(results);
  }

  return results;
}

/**
 * Get the currently logged in user
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{logged: boolean, user: Object|null, source: string}>}
 */
async function current_user(callback) {
  console.log('[current_user] Checking current user via WebSocket...');

  const result = {
    logged: false,
    user: null,
    source: null
  };

  // Try Tauri first
  try {
    const tauriResult = await TauriAdapter.auth.me();
    if (tauriResult.ok || tauriResult.success) {
      if (tauriResult.user) {
        console.log('[Tauri/SQLite] ✅ Current user:', tauriResult.user);
        result.logged = true;
        result.user = tauriResult.user;
        result.source = 'tauri';
        grab('logged_user').textContent = 'user logged: ' + (tauriResult.user.username || tauriResult.user.phone);

        if (typeof callback === 'function') {
          callback(result);
        }
        return result;
      }
    }
  } catch (e) {
    console.error('[Tauri/SQLite] Current user check failed:', e.message);
  }

  // Try Fastify if Tauri didn't have a user
  try {
    const fastifyResult = await FastifyAdapter.auth.me();
    if (fastifyResult.ok || fastifyResult.success) {
      if (fastifyResult.user) {
        console.log('[Fastify/LibSQL] ✅ Current user:', fastifyResult.user);
        result.logged = true;
        result.user = fastifyResult.user;
        result.source = 'fastify';
        grab('logged_user').textContent = 'user logged: ' + (fastifyResult.user.username || fastifyResult.user.phone);

        if (typeof callback === 'function') {
          callback(result);
        }
        return result;
      }
    }
  } catch (e) {
    // Silent if server unreachable
    if (!e.message?.includes('unreachable')) {
      console.error('[Fastify/LibSQL] Current user check failed:', e.message);
    }
  }

  // No user logged in
  console.log('[current_user] No user logged in');
  grab('logged_user').textContent = 'no user logged';

  if (typeof callback === 'function') {
    callback(result);
  }

  return result;
}

async function unlog_user(callback = null) {
  puts('Logging out user...');
  console.log('[unlog_user] Logging out via WebSocket...');

  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Tauri logout
  try {
    const tauriResult = await TauriAdapter.auth.logout();
    if (tauriResult.ok && tauriResult.success) {
      console.log('[Tauri/SQLite] ✅ User logged out successfully');
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      console.error('[Tauri/SQLite] Logout failed:', tauriResult.error);
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    console.error('[Tauri/SQLite] Logout exception:', e.message);
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Fastify logout
  try {
    const fastifyResult = await FastifyAdapter.auth.logout();
    if (fastifyResult.ok && fastifyResult.success) {
      console.log('[Fastify/LibSQL] ✅ User logged out successfully');
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      // Silent if server unreachable
      if (fastifyResult.error !== 'Server unreachable') {
        console.error('[Fastify/LibSQL] Logout failed:', fastifyResult.error);
      }
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
    console.error('[Fastify/LibSQL] Logout exception:', e.message);
    results.fastify = { success: false, data: null, error: e.message };
  }

  // Execute callback if provided
  if (callback && typeof callback === 'function') {
    callback(results);
  }

  return results;
}

// ...existing code...

/**
 * Delete a user via WebSocket
 * @param {string} phone - Phone number of the user to delete
 * @param {string} password - Password for verification
 * @param {string} username - Username (for logging purposes)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<{tauri: Object, fastify: Object}>} Results from both backends
 */
async function delete_user(phone, password, username, callback) {
  console.log(`[delete_user] Deleting user "${username}" via WebSocket...`);

  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Try Tauri first (local SQLite)
  try {
    const tauriResult = await TauriAdapter.auth.deleteAccount({
      phone,
      password
    });
    if (tauriResult.ok || tauriResult.success) {
      console.log('[Tauri/SQLite] ✅ User deleted successfully:', tauriResult);
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      console.error('[Tauri/SQLite] ERROR:', tauriResult.error);
      console.error('[Tauri/SQLite] REASON: Delete failed on Tauri/Axum WebSocket server.');
      results.tauri = { success: false, data: null, error: tauriResult.error };
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
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Also try Fastify (LibSQL)
  try {
    const fastifyResult = await FastifyAdapter.auth.deleteAccount({
      phone,
      password
    });
    if (fastifyResult.ok || fastifyResult.success) {
      console.log('[Fastify/LibSQL] ✅ User deleted successfully:', fastifyResult);
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
      if (fastifyResult.error !== 'Server unreachable') {
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
    }
  } catch (e) {
    console.error('[Fastify/LibSQL] ERROR:', e.message);
    console.error('[Fastify/LibSQL] REASON: Exception during WebSocket communication.');
    console.error('[Fastify/LibSQL] SOLUTION: Ensure Fastify server is running on ws://127.0.0.1:3001/ws/api');
    results.fastify = { success: false, data: null, error: e.message };
  }

  // Call callback if provided
  if (typeof callback === 'function') {
    callback(results);
  }

  return results;
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
      if (fastifyResult.error !== 'Server unreachable') {
        console.error('[Fastify/LibSQL] ERROR:', fastifyResult.error);
        console.error('[Fastify/LibSQL] REASON: Failed to list users from Fastify WebSocket server.');
        console.error('[Fastify/LibSQL] SOLUTION: Check WebSocket handler in server.js');
      }
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
 * Send a debug request via the existing WebSocket adapters
 * @param {Object} adapter - TauriAdapter or FastifyAdapter
 * @param {string} action - Debug action (e.g., 'list-tables')
 * @returns {Promise<Object>} Result from server
 */
async function sendDebugRequest(adapter, action) {
  // Access the internal WebSocket send method
  // The adapter uses ws.send() internally, we need to use the same pattern
  const ws = adapter === TauriAdapter ? getTauriWsInternal() : getFastifyWsInternal();

  if (!ws) {
    return { success: false, error: 'WebSocket not available' };
  }

  return ws.send({
    type: 'debug',
    action: action
  });
}

// Helper to access internal WebSocket instances
/**
 * List all tables from both databases via WebSocket
 * Uses the TauriAdapter and FastifyAdapter debug.listTables() method
 */
async function list_tables() {
  console.log('[list_tables] Fetching tables via WebSocket...');

  const results = {
    tauri: { database: 'Tauri/SQLite', tables: [], error: null },
    fastify: { database: 'Fastify/LibSQL', tables: [], error: null }
  };

  // Tauri: Use WebSocket adapter
  try {
    const tauriResult = await TauriAdapter.debug.listTables();
    if (tauriResult.success || tauriResult.ok) {
      results.tauri.tables = tauriResult.tables || [];
      console.log('[Tauri/SQLite] ✅ Tables:', results.tauri.tables);
    } else {
      results.tauri.error = tauriResult.error || 'Unknown error';
      console.error('[Tauri/SQLite] ERROR:', results.tauri.error);
    }
  } catch (e) {
    results.tauri.error = e.message;
    console.error('[Tauri/SQLite] ERROR:', e.message);
  }

  // Fastify: Use WebSocket adapter
  try {
    const fastifyResult = await FastifyAdapter.debug.listTables();
    if (fastifyResult.success || fastifyResult.ok) {
      results.fastify.tables = fastifyResult.tables || [];
      console.log('[Fastify/LibSQL] ✅ Tables:', results.fastify.tables);
    } else {
      results.fastify.error = fastifyResult.error || 'Unknown error';
      console.error('[Fastify/LibSQL] ERROR:', results.fastify.error);
    }
  } catch (e) {
    results.fastify.error = e.message;
    console.error('[Fastify/LibSQL] ERROR:', e.message);
  }

  return results;
}

/**
 * List all unsynced atomes between Tauri (local) and Fastify (remote)
 * Compares both presence and content (particles) to detect modifications
 * Also detects soft-deleted atomes that need to be propagated
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Sync status with categorized atomes
 */
async function list_unsynced_atomes(callback) {
  console.log('[list_unsynced_atomes] Comparing atomes between backends...');

  const result = {
    onlyOnTauri: [],      // Atomes to push to server
    onlyOnFastify: [],    // Atomes to pull from server
    modifiedOnTauri: [],  // Local modifications not synced
    modifiedOnFastify: [], // Remote modifications not synced
    deletedOnTauri: [],   // Deleted on Tauri, need to propagate to Fastify
    deletedOnFastify: [], // Deleted on Fastify, need to propagate to Tauri
    conflicts: [],        // Modified on both sides (need resolution)
    synced: [],           // Identical on both sides
    error: null
  };

  // Known atome types to query (server requires a type when no owner specified)
  const atomeTypes = ['user', 'atome', 'shape', 'color', 'text', 'image', 'audio', 'video', 'code', 'data'];

  let tauriAtomes = [];
  let fastifyAtomes = [];

  // Helper to fetch all atomes of all types from an adapter (including deleted for sync)
  const fetchAllAtomes = async (adapter, name) => {
    const allAtomes = [];
    for (const type of atomeTypes) {
      try {
        // Include deleted atomes for sync comparison
        const result = await adapter.atome.list({ type, includeDeleted: true });
        if (result.ok || result.success) {
          const atomes = result.atomes || result.data || [];
          allAtomes.push(...atomes);
        }
      } catch (e) {
        // Ignore errors for individual types
      }
    }
    return allAtomes;
  };

  // Fetch all atomes from Tauri
  try {
    tauriAtomes = await fetchAllAtomes(TauriAdapter, 'Tauri');
    console.log('[Tauri/SQLite] ✅ Fetched', tauriAtomes.length, 'atomes (including deleted)');
  } catch (e) {
    result.error = 'Tauri connection failed: ' + e.message;
    console.error('[list_unsynced_atomes] ERROR:', result.error);
    if (typeof callback === 'function') callback(result);
    return result;
  }

  // Fetch all atomes from Fastify
  try {
    fastifyAtomes = await fetchAllAtomes(FastifyAdapter, 'Fastify');
    console.log('[Fastify/LibSQL] ✅ Fetched', fastifyAtomes.length, 'atomes (including deleted)');
  } catch (e) {
    // If Fastify is offline, all Tauri atomes are "unsynced"
    result.onlyOnTauri = tauriAtomes.filter(a => !a.deleted_at);
    result.error = 'Fastify connection failed - all local atomes considered unsynced';
    console.warn('[list_unsynced_atomes] Fastify offline, all local atomes unsynced');
    if (typeof callback === 'function') callback(result);
    return result;
  }

  // If Fastify returned nothing but Tauri has atomes, check if Fastify is just unreachable
  if (fastifyAtomes.length === 0 && tauriAtomes.length > 0) {
    // Could be offline, mark all as unsynced
    console.warn('[list_unsynced_atomes] Fastify has no atomes, may be offline');
  }

  // Create lookup maps by atome_id
  const tauriMap = new Map();
  const fastifyMap = new Map();

  tauriAtomes.forEach(atome => {
    const id = atome.atome_id || atome.id;
    if (id) tauriMap.set(id, atome);
  });

  fastifyAtomes.forEach(atome => {
    const id = atome.atome_id || atome.id;
    if (id) fastifyMap.set(id, atome);
  });

  // Helper function to extract particles from an atome (handles inline format)
  const extractParticlesForComparison = (atome) => {
    // If data field exists and has content, use it
    if (atome.data && typeof atome.data === 'object' && Object.keys(atome.data).length > 0) {
      return atome.data;
    }
    // If particles field exists and has content, use it
    if (atome.particles && typeof atome.particles === 'object' && Object.keys(atome.particles).length > 0) {
      return atome.particles;
    }

    // Otherwise, extract inline particles (all fields except metadata)
    const metadataFields = [
      'atome_id', 'atome_type', 'parent_id', 'owner_id', 'creator_id',
      'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
      'created_source', 'id', 'type', 'data', 'particles'
    ];

    const inlineParticles = {};
    for (const [key, value] of Object.entries(atome)) {
      if (!metadataFields.includes(key) && value !== null && value !== undefined) {
        inlineParticles[key] = value;
      }
    }
    return inlineParticles;
  };

  // Helper function to compare atome content
  const compareAtomes = (atome1, atome2) => {
    // First, compare particles content (the actual data)
    const particles1 = extractParticlesForComparison(atome1);
    const particles2 = extractParticlesForComparison(atome2);

    const count1 = Object.keys(particles1).length;
    const count2 = Object.keys(particles2).length;

    // Sort keys for consistent comparison
    const sortedP1 = JSON.stringify(particles1, Object.keys(particles1).sort());
    const sortedP2 = JSON.stringify(particles2, Object.keys(particles2).sort());

    // If content is identical, they are synced
    if (sortedP1 === sortedP2) {
      return 'equal';
    }

    // Content differs - special case: one has data, other is empty
    // The one with data should "win" regardless of timestamp
    if (count1 === 0 && count2 > 0) {
      // Tauri is empty, Fastify has data - Fastify is "newer" (more complete)
      return 'fastify_newer';
    }
    if (count2 === 0 && count1 > 0) {
      // Fastify is empty, Tauri has data - Tauri is "newer" (more complete)
      return 'tauri_newer';
    }

    // Both have data but differ - use timestamps to determine which is newer
    const updated1 = atome1.updated_at || atome1.updatedAt;
    const updated2 = atome2.updated_at || atome2.updatedAt;

    if (updated1 && updated2) {
      const date1 = new Date(updated1).getTime();
      const date2 = new Date(updated2).getTime();
      if (date1 > date2) return 'tauri_newer';
      if (date2 > date1) return 'fastify_newer';
    }

    // If timestamps are equal or missing but content differs, it's a conflict
    return 'conflict';
  };

  // Compare atomes
  const allIds = new Set([...tauriMap.keys(), ...fastifyMap.keys()]);

  for (const id of allIds) {
    const tauriAtome = tauriMap.get(id);
    const fastifyAtome = fastifyMap.get(id);

    // Check for soft deletes
    const tauriDeleted = tauriAtome?.deleted_at != null;
    const fastifyDeleted = fastifyAtome?.deleted_at != null;

    if (tauriAtome && !fastifyAtome) {
      // Only on Tauri (local)
      if (tauriDeleted) {
        // Already deleted, nothing to do
        result.synced.push({ id, tauri: tauriAtome, fastify: null, status: 'deleted_local_only' });
      } else {
        // Needs to be pushed
        result.onlyOnTauri.push(tauriAtome);
      }
    } else if (!tauriAtome && fastifyAtome) {
      // Only on Fastify (remote)
      if (fastifyDeleted) {
        // Already deleted, nothing to do
        result.synced.push({ id, tauri: null, fastify: fastifyAtome, status: 'deleted_remote_only' });
      } else {
        // Needs to be pulled
        result.onlyOnFastify.push(fastifyAtome);
      }
    } else if (tauriAtome && fastifyAtome) {
      // Exists on both - check for deletion propagation first
      if (tauriDeleted && !fastifyDeleted) {
        // Deleted on Tauri, not on Fastify - propagate deletion
        result.deletedOnTauri.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
      } else if (!tauriDeleted && fastifyDeleted) {
        // Deleted on Fastify, not on Tauri - propagate deletion
        result.deletedOnFastify.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
      } else if (tauriDeleted && fastifyDeleted) {
        // Both deleted - synced
        result.synced.push({ id, tauri: tauriAtome, fastify: fastifyAtome, status: 'both_deleted' });
      } else {
        // Neither deleted - compare content
        const comparison = compareAtomes(tauriAtome, fastifyAtome);

        switch (comparison) {
          case 'equal':
            result.synced.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
            break;
          case 'tauri_newer':
            result.modifiedOnTauri.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
            break;
          case 'fastify_newer':
            result.modifiedOnFastify.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
            break;
          case 'conflict':
            result.conflicts.push({ id, tauri: tauriAtome, fastify: fastifyAtome });
            break;
        }
      }
    }
  }

  // Log summary
  console.log('[list_unsynced_atomes] Summary:');
  console.log('  - Only on Tauri (to push):', result.onlyOnTauri.length);
  console.log('  - Only on Fastify (to pull):', result.onlyOnFastify.length);
  console.log('  - Modified on Tauri:', result.modifiedOnTauri.length);
  console.log('  - Modified on Fastify:', result.modifiedOnFastify.length);
  console.log('  - Deleted on Tauri (to propagate):', result.deletedOnTauri.length);
  console.log('  - Deleted on Fastify (to propagate):', result.deletedOnFastify.length);
  console.log('  - Conflicts:', result.conflicts.length);
  console.log('  - Synced:', result.synced.length);

  if (typeof callback === 'function') {
    callback(result);
  }

  return result;
}

/**
 * Synchronize atomes between Tauri (local) and Fastify (remote)
 * - Pushes local-only atomes to Fastify
 * - Pulls remote-only atomes to Tauri
 * - Updates based on most recent modification
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Sync results with success/failure counts
 */
async function sync_atomes(callback) {
  console.log('[sync_atomes] Starting synchronization...');

  const result = {
    pushed: { success: 0, failed: 0, errors: [] },
    pulled: { success: 0, failed: 0, errors: [] },
    updated: { success: 0, failed: 0, errors: [] },
    conflicts: { count: 0, items: [] },
    alreadySynced: 0,
    error: null
  };

  // First, get the list of unsynced atomes
  let unsyncedResult;
  try {
    unsyncedResult = await list_unsynced_atomes();
    if (unsyncedResult.error) {
      result.error = unsyncedResult.error;
      console.error('[sync_atomes] ERROR:', result.error);
      if (typeof callback === 'function') callback(result);
      return result;
    }
  } catch (e) {
    result.error = 'Failed to list unsynced atomes: ' + e.message;
    console.error('[sync_atomes] ERROR:', result.error);
    if (typeof callback === 'function') callback(result);
    return result;
  }

  result.alreadySynced = unsyncedResult.synced.length;

  // 1. Push local-only atomes to Fastify
  console.log('[sync_atomes] Pushing', unsyncedResult.onlyOnTauri.length, 'atomes to Fastify...');
  for (const atome of unsyncedResult.onlyOnTauri) {
    try {
      const createResult = await FastifyAdapter.atome.create({
        id: atome.atome_id,  // Preserve original ID for sync
        type: atome.atome_type,
        ownerId: atome.owner_id,
        parentId: atome.parent_id,
        particles: atome.data || atome.particles || {}
      });

      if (createResult.ok || createResult.success) {
        result.pushed.success++;
        console.log('[sync_atomes] ✅ Pushed to Fastify:', atome.atome_id);
      } else {
        result.pushed.failed++;
        result.pushed.errors.push({ id: atome.atome_id, error: createResult.error });
        console.error('[sync_atomes] ❌ Failed to push:', atome.atome_id, createResult.error);
      }
    } catch (e) {
      result.pushed.failed++;
      result.pushed.errors.push({ id: atome.atome_id, error: e.message });
      console.error('[sync_atomes] ❌ Exception pushing:', atome.atome_id, e.message);
    }
  }

  // 2. Pull remote-only atomes to Tauri
  console.log('[sync_atomes] Pulling', unsyncedResult.onlyOnFastify.length, 'atomes to Tauri...');
  for (const atome of unsyncedResult.onlyOnFastify) {
    try {
      const createResult = await TauriAdapter.atome.create({
        id: atome.atome_id,  // Preserve original ID for sync
        type: atome.atome_type,
        ownerId: atome.owner_id,
        parentId: atome.parent_id,
        particles: atome.data || atome.particles || {}
      });

      if (createResult.ok || createResult.success) {
        result.pulled.success++;
        console.log('[sync_atomes] ✅ Pulled to Tauri:', atome.atome_id);
      } else {
        result.pulled.failed++;
        result.pulled.errors.push({ id: atome.atome_id, error: createResult.error });
        console.error('[sync_atomes] ❌ Failed to pull:', atome.atome_id, createResult.error);
      }
    } catch (e) {
      result.pulled.failed++;
      result.pulled.errors.push({ id: atome.atome_id, error: e.message });
      console.error('[sync_atomes] ❌ Exception pulling:', atome.atome_id, e.message);
    }
  }

  // Helper function to extract particles from an atome object
  // Handles different formats: { data: {...} }, { particles: {...} }, or inline { phone: "...", username: "..." }
  const extractParticles = (atome) => {
    // If data or particles field exists, use it
    if (atome.data && typeof atome.data === 'object' && Object.keys(atome.data).length > 0) {
      return atome.data;
    }
    if (atome.particles && typeof atome.particles === 'object' && Object.keys(atome.particles).length > 0) {
      return atome.particles;
    }

    // Otherwise, extract inline particles (all fields except metadata)
    const metadataFields = [
      'atome_id', 'atome_type', 'parent_id', 'owner_id', 'creator_id',
      'sync_status', 'created_at', 'updated_at', 'deleted_at', 'last_sync',
      'created_source', 'id', 'type', 'data', 'particles'
    ];

    const inlineParticles = {};
    for (const [key, value] of Object.entries(atome)) {
      if (!metadataFields.includes(key) && value !== null && value !== undefined) {
        inlineParticles[key] = value;
      }
    }
    return inlineParticles;
  };

  // 3. Update Fastify with newer Tauri modifications
  console.log('[sync_atomes] Updating Fastify with', unsyncedResult.modifiedOnTauri.length, 'local changes...');
  for (const item of unsyncedResult.modifiedOnTauri) {
    try {
      // Debug: log the raw item structure
      console.log('[sync_atomes] DEBUG item.tauri:', JSON.stringify(item.tauri));

      // Get the particles data using helper function
      const particles = extractParticles(item.tauri);

      // Debug: log what extractParticles returned
      console.log('[sync_atomes] DEBUG extracted particles:', JSON.stringify(particles));

      // Log for debugging
      console.log('[sync_atomes] Updating Fastify atome:', item.id, 'with particles:', Object.keys(particles));

      // Skip if no particles to update
      if (!particles || Object.keys(particles).length === 0) {
        console.warn('[sync_atomes] ⚠️ No particles to update for:', item.id);
        result.updated.success++; // Consider it synced since there's nothing to update
        continue;
      }

      const updateResult = await FastifyAdapter.atome.update(item.id, particles);

      if (updateResult.ok || updateResult.success) {
        result.updated.success++;
        console.log('[sync_atomes] ✅ Updated Fastify:', item.id);
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: updateResult.error });
        console.error('[sync_atomes] ❌ Failed to update Fastify:', item.id, updateResult.error);
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
      console.error('[sync_atomes] ❌ Exception updating Fastify:', item.id, e.message);
    }
  }

  // 4. Update Tauri with newer Fastify modifications
  console.log('[sync_atomes] Updating Tauri with', unsyncedResult.modifiedOnFastify.length, 'remote changes...');
  for (const item of unsyncedResult.modifiedOnFastify) {
    try {
      // Get the particles data using helper function
      const particles = extractParticles(item.fastify);

      // Log for debugging
      console.log('[sync_atomes] Updating Tauri atome:', item.id, 'with particles:', Object.keys(particles));

      // Skip if no particles to update
      if (!particles || Object.keys(particles).length === 0) {
        console.warn('[sync_atomes] ⚠️ No particles to update for:', item.id);
        result.updated.success++; // Consider it synced since there's nothing to update
        continue;
      }

      const updateResult = await TauriAdapter.atome.update(item.id, particles);

      if (updateResult.ok || updateResult.success) {
        result.updated.success++;
        console.log('[sync_atomes] ✅ Updated Tauri:', item.id);
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: updateResult.error });
        console.error('[sync_atomes] ❌ Failed to update Tauri:', item.id, updateResult.error);
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
      console.error('[sync_atomes] ❌ Exception updating Tauri:', item.id, e.message);
    }
  }

  // 5. Propagate deletions from Tauri to Fastify
  console.log('[sync_atomes] Propagating', unsyncedResult.deletedOnTauri.length, 'deletions to Fastify...');
  for (const item of unsyncedResult.deletedOnTauri) {
    try {
      const deleteResult = await FastifyAdapter.atome.softDelete(item.id);

      if (deleteResult.ok || deleteResult.success) {
        result.updated.success++;
        console.log('[sync_atomes] ✅ Deleted on Fastify:', item.id);
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: deleteResult.error });
        console.error('[sync_atomes] ❌ Failed to delete on Fastify:', item.id, deleteResult.error);
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
      console.error('[sync_atomes] ❌ Exception deleting on Fastify:', item.id, e.message);
    }
  }

  // 6. Propagate deletions from Fastify to Tauri
  console.log('[sync_atomes] Propagating', unsyncedResult.deletedOnFastify.length, 'deletions to Tauri...');
  for (const item of unsyncedResult.deletedOnFastify) {
    try {
      const deleteResult = await TauriAdapter.atome.softDelete(item.id);

      if (deleteResult.ok || deleteResult.success) {
        result.updated.success++;
        console.log('[sync_atomes] ✅ Deleted on Tauri:', item.id);
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: deleteResult.error });
        console.error('[sync_atomes] ❌ Failed to delete on Tauri:', item.id, deleteResult.error);
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
      console.error('[sync_atomes] ❌ Exception deleting on Tauri:', item.id, e.message);
    }
  }

  // 7. Report conflicts (don't auto-resolve, just report)
  result.conflicts.count = unsyncedResult.conflicts.length;
  result.conflicts.items = unsyncedResult.conflicts.map(c => c.id);
  if (result.conflicts.count > 0) {
    console.warn('[sync_atomes] ⚠️', result.conflicts.count, 'conflicts need manual resolution:', result.conflicts.items);
  }

  // Log summary
  console.log('[sync_atomes] ========== SYNC COMPLETE ==========');
  console.log('  Pushed to Fastify:', result.pushed.success, 'success,', result.pushed.failed, 'failed');
  console.log('  Pulled to Tauri:', result.pulled.success, 'success,', result.pulled.failed, 'failed');
  console.log('  Updated:', result.updated.success, 'success,', result.updated.failed, 'failed');
  console.log('  Deletions propagated:', unsyncedResult.deletedOnTauri.length + unsyncedResult.deletedOnFastify.length);
  console.log('  Conflicts:', result.conflicts.count);
  console.log('  Already synced:', result.alreadySynced);

  if (typeof callback === 'function') {
    callback(result);
  }

  return result;
}

// ============================================
// UI BUTTONS & tests
// ============================================

// Keep existing UI and code

//todo : do not log user when creating user
//todo : create/delete/modify atomes project type and atomes and theyre particles and sync

//todo: share atomes both atome project type and atome width other user user

//todo: restore atomes from it's history to and brig back the new state to present
//todo : estore atomes from it's history and create  and  alterated  history from the present state

/// input box below

const phone_pass = '11111111';
const username = 'jeezs';

$('input', {
  id: 'phone_pass_input',
  attrs: {
    type: 'text',
    placeholder: 'Phone / Password',
    value: phone_pass
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '200px'
  }
});

$('input', {
  id: 'username_input',
  attrs: {
    type: 'text',
    placeholder: 'Username',
    value: username
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '200px'
  }
});
$('span', {
  id: 'clear_console',
  css: {
    backgroundColor: 'rgba(247, 0, 255, 1)',
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
  id: 'logged_user',
  css: {
    backgroundColor: 'rgba(0, 255, 98, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'black',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'no user logged',

});

$('br', {});

$('span', {
  id: 'current_user',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'get current user',
  onClick: () => {
    current_user((result) => {
      if (result.logged && result.user) {
        const user_found = result.user.username;
        puts(user_found);
        grab('logged_user').textContent = user_found;
      } else {
        puts('no user logged');
        grab('logged_user').textContent = 'no user logged';
      }
    });
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
  onClick: async () => {
    puts('Fetching user list...');
    const result = await user_list();
    console.log('[user_list] Result:', result);

    // Display users from Tauri
    if (result.tauri.users && result.tauri.users.length > 0) {
      puts('[Tauri] Users:');
      result.tauri.users.forEach(user => {
        const name = user.username || user.data?.username || 'unknown';
        const phone = user.phone || user.data?.phone || 'unknown';
        puts('  - ' + name + ' (' + phone + ')');
      });
    } else {
      puts('[Tauri] No users found');
    }

    // Display users from Fastify
    if (result.fastify.users && result.fastify.users.length > 0) {
      puts('[Fastify] Users:');
      result.fastify.users.forEach(user => {
        const name = user.username || user.data?.username || 'unknown';
        const phone = user.phone || user.data?.phone || 'unknown';
        puts('  - ' + name + ' (' + phone + ')');
      });
    } else {
      puts('[Fastify] No users found');
    }
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
  onClick: async () => {
    puts('Listing all tables...');
    const result = await list_tables();

    if (result.tauri.tables && result.tauri.tables.length > 0) {
      puts('[Tauri] Tables: ' + result.tauri.tables.join(', '));
    } else {
      puts('[Tauri] No tables found or error: ' + (result.tauri.error || 'unknown'));
    }

    if (result.fastify.tables && result.fastify.tables.length > 0) {
      puts('[Fastify] Tables: ' + result.fastify.tables.join(', '));
    } else {
      puts('[Fastify] No tables found or error: ' + (result.fastify.error || 'unknown'));
    }
  },
});

$('span', {
  id: 'list_unsynced',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'list unsynced',
  onClick: () => {
    list_unsynced_atomes((result) => {
      // Create a concise summary including deletion states
      const summary = {
        onlyOnTauri: result.onlyOnTauri.length,
        onlyOnFastify: result.onlyOnFastify.length,
        modifiedOnTauri: result.modifiedOnTauri.length,
        modifiedOnFastify: result.modifiedOnFastify.length,
        deletedOnTauri: result.deletedOnTauri.length,
        deletedOnFastify: result.deletedOnFastify.length,
        conflicts: result.conflicts.length,
        synced: result.synced.length,
        error: result.error
      };

      // Check if there's anything to sync (including deletions)
      const hasUnsyncedItems = summary.onlyOnTauri > 0 || summary.onlyOnFastify > 0 ||
        summary.modifiedOnTauri > 0 || summary.modifiedOnFastify > 0 ||
        summary.deletedOnTauri > 0 || summary.deletedOnFastify > 0 ||
        summary.conflicts > 0;

      if (hasUnsyncedItems) {
        puts('Unsynced atomes: ' + JSON.stringify(summary));
        // Show IDs of items needing sync
        if (result.onlyOnTauri.length > 0) {
          puts('  To push: ' + result.onlyOnTauri.map(a => a.atome_id).join(', '));
        }
        if (result.onlyOnFastify.length > 0) {
          puts('  To pull: ' + result.onlyOnFastify.map(a => a.atome_id).join(', '));
        }
        if (result.deletedOnTauri.length > 0) {
          puts('  Deleted on Tauri (propagate to Fastify): ' + result.deletedOnTauri.map(d => d.id).join(', '));
        }
        if (result.deletedOnFastify.length > 0) {
          puts('  Deleted on Fastify (propagate to Tauri): ' + result.deletedOnFastify.map(d => d.id).join(', '));
        }
        if (result.conflicts.length > 0) {
          puts('  Conflicts: ' + result.conflicts.map(c => c.id).join(', '));
        }
      } else {
        puts('✅ All ' + summary.synced + ' atomes are synchronized');
      }
    });
  },
});


$('br', {});


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
    const user_phone = grab('phone_pass_input').value;
    const user_name = grab('username_input').value;

    create_user(user_phone, user_phone, user_name, (results) => {
      grab('logged_user').textContent = user_name;
      // puts('user created: ' + user_name + 'user phone created: ' + user_phone);
    });
  },
});

$('span', {
  id: 'log_user',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'log user',
  onClick: () => {
    const phone = grab('phone_pass_input').value;
    log_user(phone, phone, '', (results) => {
      if (results.tauri.success || results.fastify.success) {
        // Get username from the successful result
        const userData = results.tauri.success ? results.tauri.data : results.fastify.data;
        const loggedUsername = userData?.user?.username || userData?.username || 'unknown';
        puts('Logged in as: ' + loggedUsername);
        grab('logged_user').textContent = loggedUsername;
      } else {
        puts('no user logged');
        grab('logged_user').textContent = 'no user logged';
      }
    });
  },
});

$('span', {
  id: 'unlog_user',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'unlog user',
  onClick: () => {
    unlog_user((results) => {
      if (results.tauri.success || results.fastify.success) {
        puts('User logged out');
        grab('logged_user').textContent = 'no user logged';
      } else {
        puts('Logout failed');
      }
    });
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
    const phone = grab('phone_pass_input').value;
    const user_name = grab('username_input').value;
    delete_user(phone, phone, user_name, (results) => {
      if (results.tauri.success || results.fastify.success) {
        puts('User deleted, logging out...');
        unlog_user();
        grab('logged_user').textContent = 'no user logged';
      }
    });
  },
});



$('span', {
  id: 'sync_atomes',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'sync atomes',
  onClick: () => {
    sync_atomes((result) => {
      puts('sync atomes: ' + JSON.stringify(result));
    });
  },
});




current_user((result) => {
  if (result.logged && result.user) {
    const user_found = result.user.username;
    puts(user_found);
    grab('logged_user').textContent = user_found;
  } else {
    puts('no user logged');
    grab('logged_user').textContent = 'no user logged';
  }
});