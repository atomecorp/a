/**
 * ADOLE Data Layer v3.0 UNIFIED - Pure SQL implementation
 * 
 * Implements the ADOLE (Append-only Distributed Object Ledger Engine) data model.
 * UNIFIED SCHEMA - Same structure as Tauri (local_atome.rs)
 * 
 * Tables:
 * - atomes: Identity, category, ownership (atome_id, atome_type, parent_id, owner_id, etc.)
 * - particles: Current live state of each property (key-value pairs)
 * - particles_versions: Full history for undo/redo, time-travel, sync
 * - permissions: Fine-grained ACL per particle
 * - snapshots: Full state backups
 * - events: Event log (append-only)
 * - state_current: Projection cache
 * - sync_queue: Pending sync operations
 * - sync_state: Sync metadata per server
 * 
 * No ORM. Pure SQL. Fast. Predictable.
 */

// Facade: the default export and every named export below are the stable
// ADOLE surface consumed by the server; each section lives in its adole_* owner.

import {
    initDatabase,
    query,
    withTransaction,
    getDatabase,
    closeDatabase
} from './adole_db_core.js';
import { createAdoleSnapshotsApi } from './adole_snapshots.js';
import {
    HISTORY_EVENT_CLASS,
    HISTORY_REDO_RULE,
    HISTORY_TRANSACTION_VISIBILITY,
    buildHistoryTransactions,
    classifyHistoryEvent,
    normalizeHistoryEvent,
    resolveHistoryCursor,
    selectRedoTransaction,
    selectUndoTransaction
} from './adole_history_transactions.js';
import {
    privacyRules, permissions,
    getSyncState, updateSyncState, enqueueSyncOperation, listSyncQueue, markSyncQueueSyncing,
    markSyncQueueError, markSyncQueueDone, getPendingForSync, markAsSynced
} from './adole_api_instances.js';
import {
    getAtomeById, getAtome, getAtomesByOwner, getAtomesAccessibleToUser, getAtomeChildren, listAtomes
} from './adole_atome_reads.js';
import { createAtome, updateAtomeMetadata, updateAtome, deleteAtome } from './adole_atome_writes.js';
import { resolvePendingOwners, isGuestWorkspacePrincipal, transferOwner } from './adole_ownership.js';
import {
    setParticle, setParticles, getParticle, getParticles, getParticleHistory, getChangesSince
} from './adole_particles.js';
import { wasEventInserted, appendEvent, appendEvents, streamOfAtome } from './adole_event_log.js';
import { rebuildStateCurrentFromEvents } from './adole_state_projection.js';
import {
    listEvents, getEvent, getStateCurrent, listStateCurrent, countStateCurrent
} from './adole_event_state_reads.js';
import {
    repairGlobalStateCurrentScopes, preparePrincipalFileMigration,
    completePrincipalFileMigration, failPrincipalFileMigration
} from './adole_event_maintenance.js';
import {
    createStateSnapshot, listStateSnapshots, getStateSnapshot, restoreStateSnapshot
} from './adole_state_snapshots.js';
import { getDataSourceAdapter, getTableNames, getTableCounts } from './adole_datasource_debug.js';

export {
    HISTORY_EVENT_CLASS,
    HISTORY_REDO_RULE,
    HISTORY_TRANSACTION_VISIBILITY,
    buildHistoryTransactions,
    classifyHistoryEvent,
    normalizeHistoryEvent,
    resolveHistoryCursor,
    selectRedoTransaction,
    selectUndoTransaction
};

// Public DB foundation, re-exported from the canonical db-core module.
export {
    initDatabase,
    withTransaction,
    getDatabase,
    closeDatabase
} from './adole_db_core.js';

export {
    getAtomeById, getAtome, getAtomesByOwner, getAtomesAccessibleToUser, getAtomeChildren, listAtomes,
    createAtome, updateAtomeMetadata, updateAtome, deleteAtome,
    resolvePendingOwners, isGuestWorkspacePrincipal, transferOwner,
    setParticle, setParticles, getParticle, getParticles, getParticleHistory, getChangesSince,
    wasEventInserted, appendEvent, appendEvents, streamOfAtome, rebuildStateCurrentFromEvents,
    listEvents, getEvent, getStateCurrent, listStateCurrent, countStateCurrent,
    repairGlobalStateCurrentScopes, preparePrincipalFileMigration,
    completePrincipalFileMigration, failPrincipalFileMigration,
    createStateSnapshot, listStateSnapshots, getStateSnapshot, restoreStateSnapshot,
    getDataSourceAdapter, getTableNames, getTableCounts
};

// ============================================================================
// SNAPSHOTS — owned by adole_snapshots.js (restore via canonical appendEvent)
// ============================================================================

const {
    createSnapshot,
    getSnapshots,
    restoreSnapshot
} = createAdoleSnapshotsApi({ getAtome, appendEvent });

export {
    createSnapshot,
    getSnapshots,
    restoreSnapshot
};

// ============================================================================
// PERMISSIONS
// ============================================================================

export async function setPermission(
    atomeId,
    principalId,
    canRead = true,
    canWrite = false,
    canDelete = false,
    canShare = false,
    particleKey = null,
    grantedBy = null,
    options = {}
) {
    return await permissions.setPermission(
        atomeId,
        principalId,
        canRead,
        canWrite,
        canDelete,
        canShare,
        particleKey,
        grantedBy,
        options
    );
}

export async function canRead(atomeId, principalId, particleKey = null) {
    return await permissions.canRead(atomeId, principalId, particleKey);
}

export async function canWrite(atomeId, principalId, particleKey = null) {
    return await permissions.canWrite(atomeId, principalId, particleKey);
}

export async function canDelete(atomeId, principalId, particleKey = null) {
    return await permissions.canDelete(atomeId, principalId, particleKey);
}

export async function canShare(atomeId, principalId, particleKey = null) {
    return await permissions.canShare(atomeId, principalId, particleKey);
}

export async function canCreate(atomeId, principalId, particleKey = null) {
    return await permissions.canCreate(atomeId, principalId, particleKey);
}

// ============================================================================
// SYNC STATE + SYNC QUEUE — owned by adole_sync.js, instance in adole_api_instances.js
// ============================================================================

export {
    getSyncState,
    updateSyncState,
    enqueueSyncOperation,
    listSyncQueue,
    markSyncQueueSyncing,
    markSyncQueueError,
    markSyncQueueDone,
    getPendingForSync,
    markAsSynced
};

// ============================================================================
// LEGACY COMPATIBILITY (objects/properties API)
// ============================================================================

// Aliases for backwards compatibility
export const createObject = createAtome;
export const getObject = getAtome;
export const getObjectById = getAtomeById;
export const getObjectsByOwner = getAtomesByOwner;
export const getObjectChildren = getAtomeChildren;
export const updateObject = updateAtomeMetadata;
export const deleteObject = deleteAtome;

export const setProperty = setParticle;
export const setProperties = setParticles;
export const getProperty = getParticle;
export const getProperties = getParticles;
export const getPropertyHistory = getParticleHistory;

// ============================================================================
// EXPORT
// ============================================================================

export default {
    // Init
    initDatabase,
    getDatabase,
    closeDatabase,

    // Atomes (ADOLE v3.0)
    createAtome,
    getAtome,
    getAtomeById,
    getAtomesByOwner,
    getAtomeChildren,
    updateAtome,
    updateAtomeMetadata,
    deleteAtome,
    listAtomes,

    // Particles (ADOLE v3.0)
    setParticle,
    setParticles,
    getParticle,
    getParticles,

    // Versions
    getParticleHistory,
    getChangesSince,

    // Snapshots
    createSnapshot,
    getSnapshots,
    restoreSnapshot,
    createStateSnapshot,
    listStateSnapshots,
    getStateSnapshot,
    restoreStateSnapshot,

    // Event log + projection
    appendEvent,
    appendEvents,
    streamOfAtome,
    wasEventInserted,
    repairGlobalStateCurrentScopes,
    preparePrincipalFileMigration,
    completePrincipalFileMigration,
    failPrincipalFileMigration,
    listEvents,
    getEvent,
    rebuildStateCurrentFromEvents,
    getStateCurrent,
    listStateCurrent,
    countStateCurrent,
    buildHistoryTransactions,
    classifyHistoryEvent,
    normalizeHistoryEvent,
    resolveHistoryCursor,
    selectUndoTransaction,
    selectRedoTransaction,
    HISTORY_EVENT_CLASS,
    HISTORY_REDO_RULE,
    HISTORY_TRANSACTION_VISIBILITY,

    // Permissions
    setPermission,
    canRead,
    setPropertyPrivacyRule: privacyRules.setPropertyPrivacyRule,
    listPropertyPrivacyRules: privacyRules.listPropertyPrivacyRules,
    allowsPropertyRead: privacyRules.allowsPropertyRead,
    canWrite,
    canDelete,
    canShare,
    canCreate,

    // Sync
    getSyncState,
    updateSyncState,
    enqueueSyncOperation,
    listSyncQueue,
    markSyncQueueSyncing,
    markSyncQueueError,
    markSyncQueueDone,
    getPendingForSync,
    markAsSynced,
    resolvePendingOwners,
    transferOwner,
    isGuestWorkspacePrincipal,

    // Legacy compatibility
    createObject,
    getObject,
    getObjectById,
    getObjectsByOwner,
    getObjectChildren,
    updateObject,
    deleteObject,
    setProperty,
    setProperties,
    getProperty,
    getProperties,
    getPropertyHistory,

    // Debug
    getTableNames,
    getTableCounts,

    // Raw query access
    query,

    // Compatibility
    getDataSourceAdapter,

    // Transactions
    withTransaction
};
