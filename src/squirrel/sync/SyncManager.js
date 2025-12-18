/**
 * SyncManager - ADOLE-Compliant Bidirectional Synchronization Engine
 * 
 * Implements the ADOLE (Atome Description Object Language Engine) synchronization
 * protocol for bidirectional sync between Tauri (SQLite) and Fastify (PostgreSQL).
 * 
 * Key Features:
 * - Offline-first architecture with local queue persistence
 * - Bidirectional sync with conflict resolution based on logical clocks
 * - Full ADOLE compliance (objects, properties, commits, changes)
 * - Device-aware synchronization with device_id tracking
 * - Granular property-level sync (particles in ADOLE terminology)
 * 
 * @module src/squirrel/sync/SyncManager
 * @version 2.0.0
 */

import { getCloudServerUrl, getLocalServerUrl } from '../apis/serverUrls.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SYNC_CONFIG = {
  // Server endpoints
  TAURI_BASE: null,
  FASTIFY_BASE: null,

  // Timing
  SYNC_INTERVAL_MS: 30000,        // Auto-sync every 30 seconds
  DEBOUNCE_MS: 1000,              // Debounce rapid operations
  SERVER_TIMEOUT_MS: 5000,        // Server request timeout
  RETRY_DELAY_MS: 5000,           // Retry failed operations after 5s
  MAX_RETRIES: 3,                 // Maximum retry attempts

  // Storage keys
  SYNC_QUEUE_KEY: 'adole_sync_queue',
  DEVICE_ID_KEY: 'adole_device_id',
  LAST_SYNC_KEY: 'adole_last_sync',

  // Feature flags
  ENABLE_AUTO_SYNC: true,
  ENABLE_CONFLICT_RESOLUTION: true,
  ENABLE_PROPERTY_LEVEL_SYNC: true
};

// =============================================================================
// TYPES & INTERFACES (JSDoc for TypeScript-like safety)
// =============================================================================

/**
 * @typedef {Object} ADOLEObject
 * @property {string} object_id - UUID primary key
 * @property {string} tenant_id - Tenant/user UUID
 * @property {string} type - Object type (user, project, atome, etc.)
 * @property {string} kind - Logical kind (shape, sound, text, etc.)
 * @property {string} [parent_id] - Parent object UUID for hierarchy
 * @property {string} created_by - Principal UUID who created
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 * @property {number} schema_version - Schema version number
 * @property {Object} meta - Additional metadata (JSONB)
 * @property {Object} snapshot - Current state snapshot (JSONB)
 * @property {number} logical_clock - Monotonic version counter
 * @property {string} device_id - Source device UUID
 * @property {string} sync_status - 'synced' | 'pending' | 'conflict'
 * @property {boolean} is_local - Local-only flag
 * @property {boolean} deleted - Soft delete flag
 */

/**
 * @typedef {Object} SyncOperation
 * @property {string} id - Operation UUID
 * @property {string} object_id - Target object UUID
 * @property {'create'|'update'|'delete'} action - Operation type
 * @property {string} target - 'tauri' | 'fastify' | 'both'
 * @property {Object} payload - Operation data
 * @property {'pending'|'sent'|'acked'|'failed'} status - Operation status
 * @property {number} retries - Retry count
 * @property {string} device_id - Source device UUID
 * @property {string} created_at - ISO timestamp
 * @property {string} [sent_at] - When operation was sent
 * @property {string} [acked_at] - When operation was acknowledged
 * @property {string} [error] - Last error message
 */

/**
 * @typedef {Object} SyncResult
 * @property {boolean} success - Operation success
 * @property {string} [error] - Error message if failed
 * @property {ADOLEObject} [data] - Resulting object data
 * @property {boolean} [queued] - Whether operation was queued
 * @property {string[]} [conflicts] - List of conflict object IDs
 */

// =============================================================================
// STATE
// =============================================================================

const state = {
  // Device identification
  deviceId: null,

  // Server availability
  tauriAvailable: null,
  fastifyAvailable: null,
  lastServerCheck: 0,

  // Authentication
  tauriToken: null,
  fastifyToken: null,
  tenantId: null,

  // Sync queue (persisted)
  queue: [],

  // Sync state
  syncInProgress: false,
  lastSyncTime: 0,
  syncTimer: null,

  // Event listeners
  listeners: new Map(),

  // Initialization flag
  initialized: false
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate a UUID v4
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or create device ID (persisted)
 */
function getDeviceId() {
  if (state.deviceId) return state.deviceId;

  try {
    let deviceId = localStorage.getItem(SYNC_CONFIG.DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = generateUUID();
      localStorage.setItem(SYNC_CONFIG.DEVICE_ID_KEY, deviceId);
    }
    state.deviceId = deviceId;
    return deviceId;
  } catch {
    // localStorage not available
    state.deviceId = generateUUID();
    return state.deviceId;
  }
}

/**
 * Get current ISO timestamp
 */
function now() {
  return new Date().toISOString();
}

/**
 * Check if we're in a Tauri environment
 */
function isTauriEnvironment() {
  if (typeof window === 'undefined') return false;
  if (window.__TAURI__ || window.__TAURI_INTERNALS__) return true;
  if (window.location?.port === '1420' || window.location?.port === '1430') return true;
  return false;
}

/**
 * Detect the current platform origin
 */
function getOrigin() {
  if (isTauriEnvironment()) return 'tauri';
  if (typeof window !== 'undefined' && window.location?.port === '3001') return 'fastify';
  return 'web';
}

// =============================================================================
// TOKEN MANAGEMENT
// =============================================================================

/**
 * Get authentication tokens from storage
 */
function loadTokens() {
  try {
    state.tauriToken = localStorage.getItem('local_auth_token');
    state.fastifyToken = localStorage.getItem('cloud_auth_token') || localStorage.getItem('auth_token');

    // Extract tenant_id from token (UUID from phone number)
    const token = state.tauriToken || state.fastifyToken;
    if (token) {
      try {
        const [, payload] = token.split('.');
        const decoded = JSON.parse(atob(payload));
        state.tenantId = decoded.id || decoded.userId || decoded.sub;
      } catch { /* Invalid token format */ }
    }
  } catch { /* localStorage not available */ }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  loadTokens();
  return !!(state.tauriToken || state.fastifyToken) && !!state.tenantId;
}

// =============================================================================
// SERVER AVAILABILITY
// =============================================================================

/**
 * Check if a server is reachable
 */
async function checkServer(baseUrl) {
  if (!baseUrl) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SYNC_CONFIG.SERVER_TIMEOUT_MS);

    const response = await fetch(`${baseUrl}/api/server-info`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store'
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Update server availability status
 */
async function updateServerAvailability(forceRefresh = false) {
  const cacheAge = Date.now() - state.lastServerCheck;
  if (!forceRefresh && cacheAge < 5000) {
    return { tauri: state.tauriAvailable, fastify: state.fastifyAvailable };
  }

  const tauriBase = getLocalServerUrl();
  const fastifyBase = getCloudServerUrl();

  // Check in parallel
  const [tauri, fastify] = await Promise.all([
    isTauriEnvironment() ? checkServer(tauriBase) : Promise.resolve(false),
    checkServer(fastifyBase)
  ]);

  state.tauriAvailable = tauri;
  state.fastifyAvailable = fastify;
  state.lastServerCheck = Date.now();

  console.debug('[SyncManager] Server availability:', { tauri, fastify });

  return { tauri, fastify };
}

// =============================================================================
// API REQUESTS
// =============================================================================

/**
 * Make authenticated API request to a server
 */
async function apiRequest(baseUrl, token, method, endpoint, data = null) {
  if (!token) {
    console.debug('[SyncManager] No token for', baseUrl);
    return null;
  }

  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Device-ID': getDeviceId()
      }
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${baseUrl}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.debug(`[SyncManager] ${method} ${endpoint} failed:`, error);
      return { success: false, error: error.error || error.message || 'Request failed' };
    }

    return await response.json();
  } catch (error) {
    console.debug(`[SyncManager] Request error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Request to Tauri server
 */
async function tauriRequest(method, endpoint, data = null) {
  if (!state.tauriAvailable) return null;
  const baseUrl = getLocalServerUrl();
  if (!baseUrl) return null;
  return apiRequest(baseUrl, state.tauriToken, method, endpoint, data);
}

/**
 * Request to Fastify server
 */
async function fastifyRequest(method, endpoint, data = null) {
  if (!state.fastifyAvailable) return null;
  const baseUrl = getCloudServerUrl();
  if (!baseUrl) return null;
  return apiRequest(baseUrl, state.fastifyToken, method, endpoint, data);
}

// =============================================================================
// SYNC QUEUE MANAGEMENT
// =============================================================================

/**
 * Load sync queue from persistent storage
 */
function loadQueue() {
  try {
    const stored = localStorage.getItem(SYNC_CONFIG.SYNC_QUEUE_KEY);
    if (stored) {
      state.queue = JSON.parse(stored);
    }
  } catch {
    state.queue = [];
  }
}

/**
 * Save sync queue to persistent storage
 */
function saveQueue() {
  try {
    // Limit queue size to prevent storage overflow
    if (state.queue.length > 1000) {
      state.queue = state.queue.slice(-1000);
    }
    localStorage.setItem(SYNC_CONFIG.SYNC_QUEUE_KEY, JSON.stringify(state.queue));
  } catch (error) {
    console.warn('[SyncManager] Failed to save queue:', error.message);
  }
}

/**
 * Add operation to sync queue
 * @param {'create'|'update'|'delete'} action
 * @param {string} objectId
 * @param {Object} payload
 * @param {'tauri'|'fastify'|'both'} target
 */
function enqueue(action, objectId, payload, target = 'both') {
  const operation = {
    id: generateUUID(),
    object_id: objectId,
    action,
    target,
    payload,
    status: 'pending',
    retries: 0,
    device_id: getDeviceId(),
    created_at: now()
  };

  // Remove any pending operation for the same object (supersede)
  state.queue = state.queue.filter(op =>
    !(op.object_id === objectId && op.status === 'pending')
  );

  state.queue.push(operation);
  saveQueue();

  console.debug('[SyncManager] Enqueued:', action, objectId);

  // Trigger sync if servers are available
  debouncedProcessQueue();

  return operation;
}

/**
 * Mark operation as completed
 */
function markCompleted(operationId) {
  const op = state.queue.find(o => o.id === operationId);
  if (op) {
    op.status = 'acked';
    op.acked_at = now();
    saveQueue();
  }
}

/**
 * Mark operation as failed
 */
function markFailed(operationId, error) {
  const op = state.queue.find(o => o.id === operationId);
  if (op) {
    op.retries++;
    op.error = error;
    if (op.retries >= SYNC_CONFIG.MAX_RETRIES) {
      op.status = 'failed';
    }
    saveQueue();
  }
}

/**
 * Clean up old completed operations (older than 24h)
 */
function cleanupQueue() {
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  state.queue = state.queue.filter(op => {
    if (op.status === 'acked' || op.status === 'failed') {
      const opTime = new Date(op.acked_at || op.created_at).getTime();
      return opTime > cutoff;
    }
    return true;
  });
  saveQueue();
}

// =============================================================================
// ADOLE OBJECT FORMATTING
// =============================================================================

/**
 * Format object for ADOLE-compliant API
 * @param {Object} data - Input object data
 * @returns {ADOLEObject}
 */
function formatADOLEObject(data) {
  const deviceId = getDeviceId();
  const timestamp = now();

  return {
    object_id: data.object_id || data.id || generateUUID(),
    tenant_id: data.tenant_id || state.tenantId,
    type: data.type || 'atome',
    kind: data.kind || 'generic',
    parent_id: data.parent_id || data.parentId || null,
    created_by: data.created_by || state.tenantId,
    created_at: data.created_at || timestamp,
    updated_at: timestamp,
    schema_version: data.schema_version || 1,
    meta: data.meta || {},
    snapshot: data.snapshot || data.data || data.properties || {},
    logical_clock: data.logical_clock || data.version || 1,
    device_id: data.device_id || deviceId,
    sync_status: 'pending',
    is_local: data.is_local !== undefined ? data.is_local : false,
    deleted: data.deleted || false
  };
}

/**
 * Convert ADOLE object to legacy atome format (for backward compatibility)
 */
function toLegacyFormat(adoleObject) {
  return {
    id: adoleObject.object_id,
    kind: adoleObject.kind,
    tag: adoleObject.snapshot?.tag || 'div',
    parent_id: adoleObject.parent_id,
    data: adoleObject.snapshot,
    properties: adoleObject.snapshot,
    created_at: adoleObject.created_at,
    updated_at: adoleObject.updated_at,
    owner_id: adoleObject.tenant_id,
    version: adoleObject.logical_clock
  };
}

/**
 * Convert legacy atome format to ADOLE object
 */
function fromLegacyFormat(legacyAtome) {
  return formatADOLEObject({
    object_id: legacyAtome.id,
    kind: legacyAtome.kind,
    parent_id: legacyAtome.parent_id || legacyAtome.parentId,
    snapshot: legacyAtome.data || legacyAtome.properties,
    created_at: legacyAtome.created_at || legacyAtome.createdAt,
    updated_at: legacyAtome.updated_at || legacyAtome.updatedAt,
    logical_clock: legacyAtome.version || 1
  });
}

// =============================================================================
// CONFLICT RESOLUTION
// =============================================================================

/**
 * Resolve conflict between two versions of an object
 * Uses logical_clock (version) and updated_at for Last-Write-Wins
 * @param {ADOLEObject} local - Local version
 * @param {ADOLEObject} remote - Remote version
 * @returns {{ winner: ADOLEObject, loser: ADOLEObject, strategy: string }}
 */
function resolveConflict(local, remote) {
  // Compare logical clocks first
  if (local.logical_clock !== remote.logical_clock) {
    const winner = local.logical_clock > remote.logical_clock ? local : remote;
    const loser = local.logical_clock > remote.logical_clock ? remote : local;
    return { winner, loser, strategy: 'logical_clock' };
  }

  // Fall back to timestamp comparison
  const localTime = new Date(local.updated_at).getTime();
  const remoteTime = new Date(remote.updated_at).getTime();

  if (localTime !== remoteTime) {
    const winner = localTime > remoteTime ? local : remote;
    const loser = localTime > remoteTime ? remote : local;
    return { winner, loser, strategy: 'timestamp' };
  }

  // Same version and timestamp - prefer remote (server is authoritative)
  return { winner: remote, loser: local, strategy: 'server_authority' };
}

// =============================================================================
// SYNC ENGINE
// =============================================================================

let processQueueTimeout = null;

/**
 * Debounced queue processing
 */
function debouncedProcessQueue() {
  if (processQueueTimeout) {
    clearTimeout(processQueueTimeout);
  }
  processQueueTimeout = setTimeout(() => {
    processQueue().catch(err => console.error('[SyncManager] Queue processing error:', err));
  }, SYNC_CONFIG.DEBOUNCE_MS);
}

/**
 * Process pending operations in the queue
 */
async function processQueue() {
  if (state.syncInProgress) {
    console.debug('[SyncManager] Sync already in progress, skipping');
    return;
  }

  const pending = state.queue.filter(op => op.status === 'pending');
  if (pending.length === 0) {
    return;
  }

  state.syncInProgress = true;

  try {
    await updateServerAvailability(true);
    loadTokens();

    if (!state.tauriAvailable && !state.fastifyAvailable) {
      console.debug('[SyncManager] No servers available, operations remain queued');
      return;
    }

    console.debug(`[SyncManager] Processing ${pending.length} pending operations`);

    for (const op of pending) {
      try {
        await processOperation(op);
      } catch (error) {
        console.error('[SyncManager] Operation failed:', error);
        markFailed(op.id, error.message);
      }
    }

    // Clean up old operations
    cleanupQueue();

  } finally {
    state.syncInProgress = false;
    state.lastSyncTime = Date.now();
  }
}

/**
 * Process a single sync operation
 */
async function processOperation(op) {
  const { action, object_id, payload, target } = op;

  let tauriSuccess = false;
  let fastifySuccess = false;

  // Determine which servers to target
  const sendToTauri = (target === 'tauri' || target === 'both') && state.tauriAvailable;
  const sendToFastify = (target === 'fastify' || target === 'both') && state.fastifyAvailable;

  if (!sendToTauri && !sendToFastify) {
    console.debug('[SyncManager] No target servers available for operation');
    return;
  }

  const adolePayload = formatADOLEObject(payload);
  const legacyPayload = toLegacyFormat(adolePayload);

  // Execute operation on each server
  if (sendToTauri) {
    let result;
    switch (action) {
      case 'create':
        result = await tauriRequest('POST', '/api/atome/create', legacyPayload);
        break;
      case 'update':
        result = await tauriRequest('PUT', `/api/atome/${object_id}`, legacyPayload);
        break;
      case 'delete':
        result = await tauriRequest('DELETE', `/api/atome/${object_id}`);
        break;
    }
    tauriSuccess = result?.success === true;
    if (tauriSuccess) {
      console.debug(`[SyncManager] ${action} on Tauri successful:`, object_id);
    }
  }

  if (sendToFastify) {
    let result;
    switch (action) {
      case 'create':
        result = await fastifyRequest('POST', '/api/atome/create', legacyPayload);
        break;
      case 'update':
        result = await fastifyRequest('PUT', `/api/atome/${object_id}`, legacyPayload);
        break;
      case 'delete':
        result = await fastifyRequest('DELETE', `/api/atome/${object_id}`);
        break;
    }
    fastifySuccess = result?.success === true;
    if (fastifySuccess) {
      console.debug(`[SyncManager] ${action} on Fastify successful:`, object_id);
    }
  }

  // Mark operation status
  if ((sendToTauri && tauriSuccess) || (sendToFastify && fastifySuccess)) {
    markCompleted(op.id);
    emitEvent('operation:completed', { operation: op });
  } else {
    markFailed(op.id, 'Operation failed on target servers');
  }
}

/**
 * Perform full bidirectional sync between Tauri and Fastify
 */
async function synchronize() {
  if (state.syncInProgress) {
    console.debug('[SyncManager] Sync already in progress');
    return { success: false, error: 'Sync in progress' };
  }

  await updateServerAvailability(true);

  if (!state.tauriAvailable || !state.fastifyAvailable) {
    console.debug('[SyncManager] Both servers required for full sync');
    return {
      success: false,
      error: 'Both servers required for bidirectional sync',
      tauriAvailable: state.tauriAvailable,
      fastifyAvailable: state.fastifyAvailable
    };
  }

  state.syncInProgress = true;

  try {
    console.log('[SyncManager] Starting bidirectional sync...');

    // Fetch objects from both servers
    const [tauriResult, fastifyResult] = await Promise.all([
      tauriRequest('GET', '/api/atome/list'),
      fastifyRequest('GET', '/api/atome/list')
    ]);

    if (!tauriResult?.data || !fastifyResult?.data) {
      return { success: false, error: 'Failed to fetch objects from servers' };
    }

    const tauriObjects = new Map(tauriResult.data.map(o => [o.id, fromLegacyFormat(o)]));
    const fastifyObjects = new Map(fastifyResult.data.map(o => [o.id, fromLegacyFormat(o)]));

    const stats = {
      syncedToFastify: 0,
      syncedToTauri: 0,
      conflictsResolved: 0,
      errors: []
    };

    // Find objects only on Tauri → sync to Fastify
    for (const [id, obj] of tauriObjects) {
      if (!fastifyObjects.has(id)) {
        const result = await fastifyRequest('POST', '/api/atome/create', toLegacyFormat(obj));
        if (result?.success) {
          stats.syncedToFastify++;
          console.debug('[SyncManager] Synced to Fastify:', id);
        } else {
          stats.errors.push({ id, target: 'fastify', error: result?.error });
        }
      }
    }

    // Find objects only on Fastify → sync to Tauri
    for (const [id, obj] of fastifyObjects) {
      if (!tauriObjects.has(id)) {
        const result = await tauriRequest('POST', '/api/atome/create', toLegacyFormat(obj));
        if (result?.success) {
          stats.syncedToTauri++;
          console.debug('[SyncManager] Synced to Tauri:', id);
        } else {
          stats.errors.push({ id, target: 'tauri', error: result?.error });
        }
      }
    }

    // Resolve conflicts (objects on both with different versions)
    for (const [id, tauriObj] of tauriObjects) {
      if (fastifyObjects.has(id)) {
        const fastifyObj = fastifyObjects.get(id);

        // Check if versions differ
        if (tauriObj.logical_clock !== fastifyObj.logical_clock ||
          tauriObj.updated_at !== fastifyObj.updated_at) {

          const { winner, loser, strategy } = resolveConflict(tauriObj, fastifyObj);

          console.debug(`[SyncManager] Conflict resolved for ${id} using ${strategy}`);

          // Update the loser's server with the winner's data
          const winnerData = toLegacyFormat(winner);
          if (winner === tauriObj) {
            await fastifyRequest('PUT', `/api/atome/${id}`, winnerData);
          } else {
            await tauriRequest('PUT', `/api/atome/${id}`, winnerData);
          }

          stats.conflictsResolved++;
        }
      }
    }

    // Save last sync time
    try {
      localStorage.setItem(SYNC_CONFIG.LAST_SYNC_KEY, now());
    } catch { /* localStorage not available */ }

    console.log('[SyncManager] Sync complete:', stats);
    emitEvent('sync:complete', stats);

    return { success: true, stats };

  } catch (error) {
    console.error('[SyncManager] Sync error:', error);
    return { success: false, error: error.message };
  } finally {
    state.syncInProgress = false;
    state.lastSyncTime = Date.now();
  }
}

// =============================================================================
// EVENT SYSTEM
// =============================================================================

/**
 * Emit event to listeners
 */
function emitEvent(type, data) {
  // Dispatch DOM event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(`sync:${type}`, { detail: data }));
  }

  // Call registered listeners
  const listeners = state.listeners.get(type) || [];
  for (const listener of listeners) {
    try {
      listener(data);
    } catch (error) {
      console.error('[SyncManager] Event listener error:', error);
    }
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

const SyncManager = {
  /**
   * Initialize the sync manager
   */
  async init() {
    if (state.initialized) {
      console.debug('[SyncManager] Already initialized');
      return;
    }

    // Load persistent state
    getDeviceId();
    loadTokens();
    loadQueue();

    // Check server availability
    await updateServerAvailability(true);

    // Process any pending operations
    await processQueue();

    // Set up auto-sync timer
    if (SYNC_CONFIG.ENABLE_AUTO_SYNC) {
      state.syncTimer = setInterval(() => {
        processQueue().catch(console.error);
      }, SYNC_CONFIG.SYNC_INTERVAL_MS);

      // Listen for online event
      window.addEventListener('online', () => {
        console.log('[SyncManager] Network online, triggering sync');
        processQueue().catch(console.error);
      });
    }

    state.initialized = true;
    console.log('[SyncManager] Initialized', {
      deviceId: state.deviceId,
      tauriAvailable: state.tauriAvailable,
      fastifyAvailable: state.fastifyAvailable,
      pendingOperations: state.queue.filter(o => o.status === 'pending').length
    });
  },

  /**
   * Create a new ADOLE object
   * @param {Object} data - Object data
   * @returns {Promise<SyncResult>}
   */
  async create(data) {
    if (!isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    const adoleObject = formatADOLEObject(data);

    // Queue the operation
    enqueue('create', adoleObject.object_id, adoleObject, 'both');

    // Emit creation event
    emitEvent('created', { data: adoleObject });

    return {
      success: true,
      data: adoleObject,
      queued: true
    };
  },

  /**
   * Update an existing ADOLE object
   * @param {string} objectId - Object UUID
   * @param {Object} data - Updated data
   * @returns {Promise<SyncResult>}
   */
  async update(objectId, data) {
    if (!isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    const adoleObject = formatADOLEObject({
      ...data,
      object_id: objectId,
      logical_clock: (data.logical_clock || data.version || 0) + 1
    });

    // Queue the operation
    enqueue('update', objectId, adoleObject, 'both');

    // Emit update event
    emitEvent('updated', { id: objectId, data: adoleObject });

    return {
      success: true,
      data: adoleObject,
      queued: true
    };
  },

  /**
   * Delete an ADOLE object (soft delete)
   * @param {string} objectId - Object UUID
   * @returns {Promise<SyncResult>}
   */
  async delete(objectId) {
    if (!isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    // Queue the operation
    enqueue('delete', objectId, { object_id: objectId, deleted: true }, 'both');

    // Emit delete event
    emitEvent('deleted', { id: objectId });

    return {
      success: true,
      id: objectId,
      queued: true
    };
  },

  /**
   * Get an object by ID
   * @param {string} objectId - Object UUID
   * @returns {Promise<SyncResult>}
   */
  async get(objectId) {
    if (!isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    await updateServerAvailability();

    // Try Tauri first (local is faster)
    if (state.tauriAvailable) {
      const result = await tauriRequest('GET', `/api/atome/${objectId}`);
      if (result?.success) {
        return { success: true, data: fromLegacyFormat(result.data) };
      }
    }

    // Fall back to Fastify
    if (state.fastifyAvailable) {
      const result = await fastifyRequest('GET', `/api/atome/${objectId}`);
      if (result?.success) {
        return { success: true, data: fromLegacyFormat(result.data) };
      }
    }

    return { success: false, error: 'Object not found' };
  },

  /**
   * List all objects
   * @param {Object} [filters] - Optional filters (kind, parent_id, etc.)
   * @returns {Promise<SyncResult>}
   */
  async list(filters = {}) {
    if (!isAuthenticated()) {
      return { success: false, error: 'Not authenticated' };
    }

    await updateServerAvailability();

    const query = new URLSearchParams(filters).toString();
    const endpoint = `/api/atome/list${query ? '?' + query : ''}`;

    // Try Tauri first
    if (state.tauriAvailable) {
      const result = await tauriRequest('GET', endpoint);
      if (result?.success) {
        return {
          success: true,
          data: result.data.map(fromLegacyFormat),
          source: 'tauri'
        };
      }
    }

    // Fall back to Fastify
    if (state.fastifyAvailable) {
      const result = await fastifyRequest('GET', endpoint);
      if (result?.success) {
        return {
          success: true,
          data: result.data.map(fromLegacyFormat),
          source: 'fastify'
        };
      }
    }

    return { success: false, error: 'Failed to list objects' };
  },

  /**
   * Trigger full bidirectional sync
   * @returns {Promise<SyncResult>}
   */
  async sync() {
    return synchronize();
  },

  /**
   * Force process the sync queue
   */
  async flush() {
    return processQueue();
  },

  /**
   * Register event listener
   * @param {string} event - Event type
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!state.listeners.has(event)) {
      state.listeners.set(event, []);
    }
    state.listeners.get(event).push(callback);
  },

  /**
   * Remove event listener
   * @param {string} event - Event type
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    const listeners = state.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  },

  /**
   * Get current sync status
   */
  getStatus() {
    return {
      initialized: state.initialized,
      deviceId: state.deviceId,
      tenantId: state.tenantId,
      tauriAvailable: state.tauriAvailable,
      fastifyAvailable: state.fastifyAvailable,
      pendingOperations: state.queue.filter(o => o.status === 'pending').length,
      failedOperations: state.queue.filter(o => o.status === 'failed').length,
      lastSyncTime: state.lastSyncTime,
      syncInProgress: state.syncInProgress
    };
  },

  /**
   * Get the sync queue (for debugging)
   */
  getQueue() {
    return [...state.queue];
  },

  /**
   * Clear all failed operations from queue
   */
  clearFailed() {
    state.queue = state.queue.filter(o => o.status !== 'failed');
    saveQueue();
  },

  // Expose config for external modification
  config: SYNC_CONFIG
};

// =============================================================================
// EXPORTS
// =============================================================================

export default SyncManager;
export { SyncManager, formatADOLEObject, toLegacyFormat, fromLegacyFormat };
