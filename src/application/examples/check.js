



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
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
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
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
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
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Also try Fastify (LibSQL)
  try {
    const fastifyResult = await FastifyAdapter.auth.login({
      phone,
      password
    });
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
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
        result.logged = true;
        result.user = tauriResult.user;
        result.source = 'tauri';

        if (typeof callback === 'function') {
          callback(result);
        }
        return result;
      }
    }
  } catch (e) {
    // Silent failure
  }

  // Try Fastify if Tauri didn't have a user
  try {
    const fastifyResult = await FastifyAdapter.auth.me();
    if (fastifyResult.ok || fastifyResult.success) {
      if (fastifyResult.user) {
        result.logged = true;
        result.user = fastifyResult.user;
        result.source = 'fastify';

        if (typeof callback === 'function') {
          callback(result);
        }
        return result;
      }
    }
  } catch (e) {
    // Silent failure
  }

  // No user logged in
  if (typeof callback === 'function') {
    callback(result);
  }

  return result;
}

async function unlog_user(callback = null) {
  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Tauri logout
  try {
    const tauriResult = await TauriAdapter.auth.logout();
    if (tauriResult.ok && tauriResult.success) {
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Fastify logout
  try {
    const fastifyResult = await FastifyAdapter.auth.logout();
    if (fastifyResult.ok && fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
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
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Also try Fastify (LibSQL)
  try {
    const fastifyResult = await FastifyAdapter.auth.deleteAccount({
      phone,
      password
    });
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
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
  const results = {
    tauri: { users: [], error: null },
    fastify: { users: [], error: null }
  };

  // Try Tauri
  try {
    const tauriResult = await TauriAdapter.atome.list({ type: 'user' });
    if (tauriResult.ok || tauriResult.success) {
      results.tauri.users = tauriResult.atomes || tauriResult.data || [];
    } else {
      results.tauri.error = tauriResult.error;
    }
  } catch (e) {
    results.tauri.error = e.message;
  }

  // Try Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.list({ type: 'user' });
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify.users = fastifyResult.atomes || fastifyResult.data || [];
    } else {
      results.fastify.error = fastifyResult.error;
    }
  } catch (e) {
    results.fastify.error = e.message;
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
  const results = {
    tauri: { database: 'Tauri/SQLite', tables: [], error: null },
    fastify: { database: 'Fastify/LibSQL', tables: [], error: null }
  };

  // Tauri: Use WebSocket adapter
  try {
    const tauriResult = await TauriAdapter.debug.listTables();
    if (tauriResult.success || tauriResult.ok) {
      results.tauri.tables = tauriResult.tables || [];
    } else {
      results.tauri.error = tauriResult.error || 'Unknown error';
    }
  } catch (e) {
    results.tauri.error = e.message;
  }

  // Fastify: Use WebSocket adapter
  try {
    const fastifyResult = await FastifyAdapter.debug.listTables();
    if (fastifyResult.success || fastifyResult.ok) {
      results.fastify.tables = fastifyResult.tables || [];
    } else {
      results.fastify.error = fastifyResult.error || 'Unknown error';
    }
  } catch (e) {
    results.fastify.error = e.message;
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
  } catch (e) {
    result.error = 'Tauri connection failed: ' + e.message;
    if (typeof callback === 'function') callback(result);
    return result;
  }

  // Fetch all atomes from Fastify
  try {
    fastifyAtomes = await fetchAllAtomes(FastifyAdapter, 'Fastify');
  } catch (e) {
    // If Fastify is offline, all Tauri atomes are "unsynced"
    result.onlyOnTauri = tauriAtomes.filter(a => !a.deleted_at);
    result.error = 'Fastify connection failed - all local atomes considered unsynced';
    if (typeof callback === 'function') callback(result);
    return result;
  }

  // If Fastify returned nothing but Tauri has atomes, check if Fastify is just unreachable
  // Could be offline, mark all as unsynced

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
      if (typeof callback === 'function') callback(result);
      return result;
    }
  } catch (e) {
    result.error = 'Failed to list unsynced atomes: ' + e.message;
    if (typeof callback === 'function') callback(result);
    return result;
  }

  result.alreadySynced = unsyncedResult.synced.length;

  // 1. Push local-only atomes to Fastify
  for (const atome of unsyncedResult.onlyOnTauri) {
    try {
      const createResult = await FastifyAdapter.atome.create({
        id: atome.atome_id,
        type: atome.atome_type,
        ownerId: atome.owner_id,
        parentId: atome.parent_id,
        particles: atome.data || atome.particles || {}
      });

      if (createResult.ok || createResult.success) {
        result.pushed.success++;
      } else {
        result.pushed.failed++;
        result.pushed.errors.push({ id: atome.atome_id, error: createResult.error });
      }
    } catch (e) {
      result.pushed.failed++;
      result.pushed.errors.push({ id: atome.atome_id, error: e.message });
    }
  }

  // 2. Pull remote-only atomes to Tauri
  for (const atome of unsyncedResult.onlyOnFastify) {
    try {
      const createResult = await TauriAdapter.atome.create({
        id: atome.atome_id,
        type: atome.atome_type,
        ownerId: atome.owner_id,
        parentId: atome.parent_id,
        particles: atome.data || atome.particles || {}
      });

      if (createResult.ok || createResult.success) {
        result.pulled.success++;
      } else {
        result.pulled.failed++;
        result.pulled.errors.push({ id: atome.atome_id, error: createResult.error });
      }
    } catch (e) {
      result.pulled.failed++;
      result.pulled.errors.push({ id: atome.atome_id, error: e.message });
    }
  }

  // Helper function to extract particles from an atome object
  const extractParticles = (atome) => {
    if (atome.data && typeof atome.data === 'object' && Object.keys(atome.data).length > 0) {
      return atome.data;
    }
    if (atome.particles && typeof atome.particles === 'object' && Object.keys(atome.particles).length > 0) {
      return atome.particles;
    }

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
  for (const item of unsyncedResult.modifiedOnTauri) {
    try {
      const particles = extractParticles(item.tauri);

      if (!particles || Object.keys(particles).length === 0) {
        result.updated.success++;
        continue;
      }

      const updateResult = await FastifyAdapter.atome.update(item.id, particles);

      if (updateResult.ok || updateResult.success) {
        result.updated.success++;
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: updateResult.error });
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
    }
  }

  // 4. Update Tauri with newer Fastify modifications
  for (const item of unsyncedResult.modifiedOnFastify) {
    try {
      const particles = extractParticles(item.fastify);

      if (!particles || Object.keys(particles).length === 0) {
        result.updated.success++;
        continue;
      }

      const updateResult = await TauriAdapter.atome.update(item.id, particles);

      if (updateResult.ok || updateResult.success) {
        result.updated.success++;
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: updateResult.error });
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
    }
  }

  // 5. Propagate deletions from Tauri to Fastify
  for (const item of unsyncedResult.deletedOnTauri) {
    try {
      const deleteResult = await FastifyAdapter.atome.softDelete(item.id);

      if (deleteResult.ok || deleteResult.success) {
        result.updated.success++;
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: deleteResult.error });
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
    }
  }

  // 6. Propagate deletions from Fastify to Tauri
  for (const item of unsyncedResult.deletedOnFastify) {
    try {
      const deleteResult = await TauriAdapter.atome.softDelete(item.id);

      if (deleteResult.ok || deleteResult.success) {
        result.updated.success++;
      } else {
        result.updated.failed++;
        result.updated.errors.push({ id: item.id, error: deleteResult.error });
      }
    } catch (e) {
      result.updated.failed++;
      result.updated.errors.push({ id: item.id, error: e.message });
    }
  }

  // 7. Report conflicts (don't auto-resolve, just report)
  result.conflicts.count = unsyncedResult.conflicts.length;
  result.conflicts.items = unsyncedResult.conflicts.map(c => c.id);

  if (typeof callback === 'function') {
    callback(result);
  }

  return result;
}

// ============================================
// PROJECT & ATOME MANAGEMENT FUNCTIONS
// ============================================

/**
 * Create a project (a project is an atome with type='project')
 * A project serves as an entry point to contain user's atomes
 * @param {string} projectName - Name of the project
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function create_project(projectName, callback) {
  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Get current user to set as owner
  const currentUserResult = await current_user();
  const ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

  if (!ownerId) {
    const error = 'No user logged in. Please log in first.';
    results.tauri.error = error;
    results.fastify.error = error;
    if (typeof callback === 'function') callback(results);
    return results;
  }

  const projectData = {
    type: 'project',
    ownerId: ownerId,
    particles: {
      name: projectName,
      created_at: new Date().toISOString()
    }
  };

  // Create on Tauri
  try {
    const tauriResult = await TauriAdapter.atome.create(projectData);
    if (tauriResult.ok || tauriResult.success) {
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Create on Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.create(projectData);
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
    results.fastify = { success: false, data: null, error: e.message };
  }

  if (typeof callback === 'function') callback(results);
  return results;
}

/**
 * List all projects for the current user
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} List of projects from both backends
 */
async function list_projects(callback) {
  const results = {
    tauri: { projects: [], error: null },
    fastify: { projects: [], error: null }
  };

  // Try Tauri
  try {
    const tauriResult = await TauriAdapter.atome.list({ type: 'project' });
    if (tauriResult.ok || tauriResult.success) {
      results.tauri.projects = tauriResult.atomes || tauriResult.data || [];
    } else {
      results.tauri.error = tauriResult.error;
    }
  } catch (e) {
    results.tauri.error = e.message;
  }

  // Try Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.list({ type: 'project' });
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify.projects = fastifyResult.atomes || fastifyResult.data || [];
    } else {
      results.fastify.error = fastifyResult.error;
    }
  } catch (e) {
    results.fastify.error = e.message;
  }

  if (typeof callback === 'function') callback(results);
  return results;
}

/**
 * Delete a project and all its contents (soft delete)
 * @param {string} projectId - ID of the project to delete
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function delete_project(projectId, callback) {
  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  if (!projectId) {
    const error = 'No project ID provided';
    results.tauri.error = error;
    results.fastify.error = error;
    if (typeof callback === 'function') callback(results);
    return results;
  }

  // Soft delete on Tauri
  try {
    const tauriResult = await TauriAdapter.atome.softDelete(projectId);
    if (tauriResult.ok || tauriResult.success) {
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Soft delete on Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.softDelete(projectId);
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
    results.fastify = { success: false, data: null, error: e.message };
  }

  if (typeof callback === 'function') callback(results);
  return results;
}

/**
 * Create an atome within a project
 * @param {Object} options - Atome options { type, color, projectId, particles }
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function create_atome(options, callback) {
  // Handle both object and callback-only signatures
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const atomeType = options.type || 'shape';
  const atomeColor = options.color || 'blue';
  const projectId = options.projectId || null;

  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Get current user
  const currentUserResult = await current_user();
  const ownerId = currentUserResult.user?.user_id || currentUserResult.user?.atome_id || currentUserResult.user?.id || null;

  if (!ownerId) {
    const error = 'No user logged in. Please log in first.';
    results.tauri.error = error;
    results.fastify.error = error;
    if (typeof callback === 'function') callback(results);
    return results;
  }

  const atomeData = {
    type: atomeType,
    ownerId: ownerId,
    parentId: projectId, // Link to project if provided
    particles: {
      color: atomeColor,
      created_at: new Date().toISOString(),
      ...options.particles
    }
  };

  // Create on Tauri
  try {
    const tauriResult = await TauriAdapter.atome.create(atomeData);
    if (tauriResult.ok || tauriResult.success) {
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Create on Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.create(atomeData);
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
    results.fastify = { success: false, data: null, error: e.message };
  }

  if (typeof callback === 'function') callback(results);
  return results;
}

/**
 * List atomes, optionally filtered by project or type
 * @param {Object} options - Filter options { type, projectId }
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} List of atomes from both backends
 */
async function list_atomes(options = {}, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const atomeType = options.type || null;

  const results = {
    tauri: { atomes: [], error: null },
    fastify: { atomes: [], error: null }
  };

  const queryOptions = atomeType ? { type: atomeType } : {};

  // Try Tauri
  try {
    const tauriResult = await TauriAdapter.atome.list(queryOptions);
    if (tauriResult.ok || tauriResult.success) {
      results.tauri.atomes = tauriResult.atomes || tauriResult.data || [];
    } else {
      results.tauri.error = tauriResult.error;
    }
  } catch (e) {
    results.tauri.error = e.message;
  }

  // Try Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.list(queryOptions);
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify.atomes = fastifyResult.atomes || fastifyResult.data || [];
    } else {
      results.fastify.error = fastifyResult.error;
    }
  } catch (e) {
    results.fastify.error = e.message;
  }

  if (typeof callback === 'function') callback(results);
  return results;
}

/**
 * Delete an atome (soft delete to preserve history)
 * @param {string} atomeId - ID of the atome to delete (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function delete_atome(atomeId, callback) {
  // Handle callback-only call
  if (typeof atomeId === 'function') {
    callback = atomeId;
    atomeId = null;
  }

  // atomeId is required
  if (!atomeId) {
    const error = 'atomeId parameter is required';
    const results = {
      tauri: { success: false, data: null, error },
      fastify: { success: false, data: null, error }
    };
    if (typeof callback === 'function') callback(results);
    return results;
  }

  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Soft delete on Tauri
  try {
    const tauriResult = await TauriAdapter.atome.softDelete(atomeId);
    if (tauriResult.ok || tauriResult.success) {
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Soft delete on Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.softDelete(atomeId);
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
    results.fastify = { success: false, data: null, error: e.message };
  }

  if (typeof callback === 'function') callback(results);
  return results;
}

/**
 * Alter an atome's particles (update with history tracking)
 * The particles_versions table stores each change for undo functionality
 * @param {string} atomeId - ID of the atome to alter (REQUIRED)
 * @param {Object} newParticles - New particle values to set/update (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Results from both backends
 */
async function alter_atome(atomeId, newParticles, callback) {
  // Handle callback as second argument
  if (typeof newParticles === 'function') {
    callback = newParticles;
    newParticles = null;
  }

  // Both atomeId and newParticles are required
  if (!atomeId || !newParticles || typeof newParticles !== 'object') {
    const error = !atomeId
      ? 'atomeId parameter is required'
      : 'newParticles object is required';
    const results = {
      tauri: { success: false, data: null, error },
      fastify: { success: false, data: null, error }
    };
    if (typeof callback === 'function') callback(results);
    return results;
  }

  const results = {
    tauri: { success: false, data: null, error: null },
    fastify: { success: false, data: null, error: null }
  };

  // Update on Tauri (particles_versions are automatically updated in the backend)
  try {
    const tauriResult = await TauriAdapter.atome.update(atomeId, newParticles);
    if (tauriResult.ok || tauriResult.success) {
      results.tauri = { success: true, data: tauriResult, error: null };
    } else {
      results.tauri = { success: false, data: null, error: tauriResult.error };
    }
  } catch (e) {
    results.tauri = { success: false, data: null, error: e.message };
  }

  // Update on Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.update(atomeId, newParticles);
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify = { success: true, data: fastifyResult, error: null };
    } else {
      results.fastify = { success: false, data: null, error: fastifyResult.error };
    }
  } catch (e) {
    results.fastify = { success: false, data: null, error: e.message };
  }

  if (typeof callback === 'function') callback(results);
  return results;
}

/**
 * Get an atome with all its particles and history
 * @param {string} atomeId - ID of the atome to retrieve (REQUIRED)
 * @param {Function} [callback] - Optional callback function(result)
 * @returns {Promise<Object>} Atome data with particles
 */
async function get_atome(atomeId, callback) {
  // Handle callback as first argument
  if (typeof atomeId === 'function') {
    callback = atomeId;
    atomeId = null;
  }

  if (!atomeId) {
    const error = 'atomeId parameter is required';
    if (typeof callback === 'function') callback({ error });
    return { error };
  }

  const results = {
    tauri: { atome: null, error: null },
    fastify: { atome: null, error: null }
  };

  // Try Tauri
  try {
    const tauriResult = await TauriAdapter.atome.get(atomeId);
    if (tauriResult.ok || tauriResult.success) {
      results.tauri.atome = tauriResult.atome || tauriResult.data || tauriResult;
    } else {
      results.tauri.error = tauriResult.error;
    }
  } catch (e) {
    results.tauri.error = e.message;
  }

  // Try Fastify
  try {
    const fastifyResult = await FastifyAdapter.atome.get(atomeId);
    if (fastifyResult.ok || fastifyResult.success) {
      results.fastify.atome = fastifyResult.atome || fastifyResult.data || fastifyResult;
    } else {
      results.fastify.error = fastifyResult.error;
    }
  } catch (e) {
    results.fastify.error = e.message;
  }

  if (typeof callback === 'function') callback(results);
  return results;
}


// ============================================
// ⚠️⚠️⚠️ TEST SECTION - DO NOT CALL FROM PRODUCTION CODE ⚠️⚠️⚠️
// ============================================
// Everything below this line is temporary test UI and will be removed.
// Production code above MUST NOT reference any element defined below.
// Any such reference will cause a crash when the test section is removed.
// ============================================

// Test state variables
let selectedProjectId = null;
let selectedAtomeId = null;
let currentProjectName = null;

/**
 * TEST ONLY - Open a project selector dialog
 * @param {Function} callback - Callback with selected project { project_id, project_name }
 */
async function open_project_selector(callback) {
  console.log('[open_project_selector] Opening project selector...');

  const projectsResult = await list_projects();
  const projects = projectsResult.tauri.projects.length > 0
    ? projectsResult.tauri.projects
    : projectsResult.fastify.projects;

  if (projects.length === 0) {
    console.log('[open_project_selector] No projects found');
    if (typeof callback === 'function') {
      callback({ project_id: null, project_name: null, cancelled: true });
    }
    return;
  }

  const existingSelector = grab('project_selector_overlay');
  if (existingSelector) existingSelector.remove();

  const overlay = $('div', {
    id: 'project_selector_overlay',
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '1000'
    }
  });

  const modal = $('div', {
    id: 'project_selector_modal',
    parent: overlay,
    css: {
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      minWidth: '300px',
      maxHeight: '400px',
      overflowY: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333' },
    text: 'Select a Project'
  });

  projects.forEach((project, index) => {
    const projectId = project.atome_id || project.id;
    const projectName = project.name || project.data?.name || project.particles?.name || 'Unnamed Project';

    $('div', {
      id: 'project_item_' + index,
      parent: modal,
      css: {
        padding: '10px',
        margin: '5px 0',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#333'
      },
      text: projectName,
      onClick: () => {
        selectedProjectId = projectId;
        currentProjectName = projectName;
        overlay.remove();
        grab('current_project').textContent = projectName;
        console.log('[open_project_selector] Selected project:', projectName, '(' + projectId + ')');
        if (typeof callback === 'function') {
          callback({ project_id: projectId, project_name: projectName, cancelled: false });
        }
      }
    });
  });

  $('div', {
    parent: modal,
    css: {
      padding: '10px',
      marginTop: '15px',
      backgroundColor: '#ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      textAlign: 'center',
      color: '#333'
    },
    text: 'Cancel',
    onClick: () => {
      overlay.remove();
      if (typeof callback === 'function') {
        callback({ project_id: null, project_name: null, cancelled: true });
      }
    }
  });
}

/**
 * TEST ONLY - Open an atome selector dialog
 * @param {Object} options - Filter options { type, projectId }
 * @param {Function} callback - Callback with selected atome { atome_id, atome }
 */
async function open_atome_selector(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  console.log('[open_atome_selector] Opening atome selector...');

  const atomesResult = await list_atomes(options);
  const atomes = atomesResult.tauri.atomes.length > 0
    ? atomesResult.tauri.atomes
    : atomesResult.fastify.atomes;

  const filteredAtomes = atomes.filter(a => {
    const type = a.atome_type || a.type;
    return type !== 'project' && type !== 'user';
  });

  if (filteredAtomes.length === 0) {
    console.log('[open_atome_selector] No atomes found');
    if (typeof callback === 'function') {
      callback({ atome_id: null, atome: null, cancelled: true });
    }
    return;
  }

  const existingSelector = grab('atome_selector_overlay');
  if (existingSelector) existingSelector.remove();

  const overlay = $('div', {
    id: 'atome_selector_overlay',
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '1000'
    }
  });

  const modal = $('div', {
    id: 'atome_selector_modal',
    parent: overlay,
    css: {
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      minWidth: '350px',
      maxHeight: '400px',
      overflowY: 'auto'
    }
  });

  $('div', {
    parent: modal,
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: '#333' },
    text: 'Select an Atome'
  });

  filteredAtomes.forEach((atome, index) => {
    const atomeId = atome.atome_id || atome.id;
    const atomeType = atome.atome_type || atome.type || 'unknown';
    const atomeColor = atome.color || atome.data?.color || atome.particles?.color || '';
    const displayText = atomeType + (atomeColor ? ' (' + atomeColor + ')' : '') + ' - ' + atomeId.substring(0, 8) + '...';

    $('div', {
      id: 'atome_item_' + index,
      parent: modal,
      css: {
        padding: '10px',
        margin: '5px 0',
        backgroundColor: '#f0f0f0',
        borderRadius: '4px',
        cursor: 'pointer',
        color: '#333',
        fontSize: '14px'
      },
      text: displayText,
      onClick: () => {
        selectedAtomeId = atomeId;
        overlay.remove();
        console.log('[open_atome_selector] Selected atome:', atomeId);
        if (typeof callback === 'function') {
          callback({ atome_id: atomeId, atome: atome, cancelled: false });
        }
      }
    });
  });

  $('div', {
    parent: modal,
    css: {
      padding: '10px',
      marginTop: '15px',
      backgroundColor: '#ccc',
      borderRadius: '4px',
      cursor: 'pointer',
      textAlign: 'center',
      color: '#333'
    },
    text: 'Cancel',
    onClick: () => {
      overlay.remove();
      if (typeof callback === 'function') {
        callback({ atome_id: null, atome: null, cancelled: true });
      }
    }
  });
}

// ============================================
// UI BUTTONS & tests
// ============================================

//todo: share atomes both atome project type and atome width other user user

//todo: restore atomes from it's history to and bring back the new state to present
//todo: restore atomes from it's history and create an altered history from the present state

/// input box below




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

// Load current project on startup
list_projects((result) => {
  const projects = result.tauri.projects.length > 0
    ? result.tauri.projects
    : result.fastify.projects;

  if (projects && projects.length > 0) {
    // Auto-select first project if none selected
    const firstProject = projects[0];
    selectedProjectId = firstProject.atome_id || firstProject.id;
    currentProjectName = firstProject.name || firstProject.data?.name || firstProject.particles?.name || 'Unnamed Project';
    grab('current_project').textContent = currentProjectName;
    puts('Project loaded: ' + currentProjectName);
  } else {
    puts('no project available');
    grab('current_project').textContent = 'no project loaded';
  }
});

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
    width: '100px'
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
    width: '100px'
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

$('span', {
  id: 'current_project',
  css: {
    backgroundColor: 'rgba(0, 255, 98, 1)',
    marginLeft: '0',
    padding: '10px',
    color: 'black',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'no project loaded',
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

$('br', {});
const atome_type = 'shape';
const atome_color = 'blue';
const atome_project_name = 'my project';

$('input', {
  id: 'atome_project_name_input',
  attrs: {
    type: 'text',
    placeholder: 'Atome Type',
    value: atome_project_name
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '100px'
  }
});



$('input', {
  id: 'atome_type_input',
  attrs: {
    type: 'text',
    placeholder: 'Atome Type',
    value: atome_type
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '100px'
  }
});


$('input', {
  id: 'atome_color_input',
  attrs: {
    type: 'text',
    placeholder: 'Atome Color',
    value: atome_color
  },
  css: {
    margin: '10px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '100px'
  }
});
$('br', {});



$('span', {
  id: 'create_project',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'create project',
  onClick: () => {
    const projectName = grab('atome_project_name_input').value;
    puts('Creating project: ' + projectName);
    create_project(projectName, (result) => {
      if (result.tauri.success || result.fastify.success) {
        puts('✅ Project created: ' + projectName);
      } else {
        puts('❌ Failed to create project');
      }
    });
  },
});

$('span', {
  id: 'load_project',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'load project',
  onClick: () => {
    puts('Select a project to load...');
    open_project_selector((selection) => {
      if (selection.cancelled) {
        puts('Loading cancelled');
        return;
      }
      selectedProjectId = selection.project_id;
      currentProjectName = selection.project_name;
      grab('current_project').textContent = selection.project_name;
      puts('✅ Project loaded: ' + selection.project_name);
    });
  },
});


$('span', {
  id: 'delete_project',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'delete project',
  onClick: () => {
    puts('Select a project to delete...');
    open_project_selector((selection) => {
      if (selection.cancelled) {
        puts('Deletion cancelled');
        return;
      }
      delete_project(selection.project_id, (result) => {
        if (result.tauri.success || result.fastify.success) {
          puts('✅ Project deleted: ' + selection.project_name);
        } else {
          puts('❌ Failed to delete project');
        }
      });
    });
  },
});

$('span', {
  id: 'list_projects',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'list projects',
  onClick: async () => {
    puts('Fetching projects...');
    const result = await list_projects();
    const projects = result.tauri.projects.length > 0 ? result.tauri.projects : result.fastify.projects;
    if (projects.length > 0) {
      puts('Projects found: ' + projects.length);
      projects.forEach(p => {
        const name = p.name || p.data?.name || p.particles?.name || 'Unnamed';
        const id = (p.atome_id || p.id).substring(0, 8);
        puts('  - ' + name + ' (' + id + '...)');
      });
    } else {
      puts('No projects found');
    }
  },
});

$('br', {});

$('span', {
  id: 'create_atome',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'create atome',
  onClick: () => {
    const atomeType = grab('atome_type_input').value;
    const atomeColor = grab('atome_color_input').value;
    puts('Creating atome: ' + atomeType + ' (' + atomeColor + ')');
    create_atome({ type: atomeType, color: atomeColor }, (result) => {
      if (result.tauri.success || result.fastify.success) {
        const newId = result.tauri.data?.atome_id || result.tauri.data?.id ||
          result.fastify.data?.atome_id || result.fastify.data?.id || 'unknown';
        puts('✅ Atome created: ' + newId.substring(0, 8) + '...');
      } else {
        puts('❌ Failed to create atome');
      }
    });
  },
});

$('span', {
  id: 'delete_atome',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'delete atome',
  onClick: () => {
    puts('Select an atome to delete...');
    delete_atome((result) => {
      if (result.cancelled) return;
      if (result.tauri?.success || result.fastify?.success) {
        puts('✅ Atome deleted');
      } else {
        puts('❌ Failed to delete atome');
      }
    });
  },
});

$('span', {
  id: 'alter_atome',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'alter atome',
  onClick: () => {
    puts('Select an atome to alter...');
    alter_atome((result) => {
      if (result.cancelled) return;
      if (result.tauri?.success || result.fastify?.success) {
        puts('✅ Atome altered');
      } else {
        puts('❌ Failed to alter atome');
      }
    });
  },
});

$('span', {
  id: 'list_atomes',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'list atomes',
  onClick: async () => {
    const atomeType = grab('atome_type_input').value;
    puts('Fetching atomes of type: ' + atomeType);
    const result = await list_atomes({ type: atomeType });
    const atomes = result.tauri.atomes.length > 0 ? result.tauri.atomes : result.fastify.atomes;
    if (atomes.length > 0) {
      puts('Atomes found: ' + atomes.length);
      atomes.forEach(a => {
        const type = a.atome_type || a.type || 'unknown';
        const color = a.color || a.data?.color || a.particles?.color || '';
        const id = (a.atome_id || a.id).substring(0, 8);
        puts('  - ' + type + (color ? ' (' + color + ')' : '') + ' - ' + id + '...');
      });
    } else {
      puts('No atomes found');
    }
  },
});

$('br', {});

$('span', {
  id: 'sync_atomes',
  css: {
    backgroundColor: 'rgba(233, 146, 6, 1)',
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


