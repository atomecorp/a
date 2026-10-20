// ============================================================================
// ADOLE API INSTANCES — single instances of the section factories
// ============================================================================
// Privacy rules, permissions, event mutation, conflict and sync APIs are
// created once here and imported by every consumer, so each keeps one owner.

import { query } from './adole_db_core.js';
import { createAdolePermissionApi } from './adole_permissions.js';
import { createAdolePrivacyRuleApi } from './adole_privacy_rules.js';
import { createAdoleSyncApi } from './adole_sync.js';
import { createAdoleEventMutationApi } from './adole_event_mutation.js';
import { createAdoleConflictApi } from './adole_conflicts.js';
import { getAtome, getEffectiveOwnerId } from './adole_atome_reads.js';

export const privacyRules = createAdolePrivacyRuleApi({
    query,
    getAtome,
    getEffectiveOwnerId
});

export const permissions = createAdolePermissionApi({
    query,
    getAtome,
    getEffectiveOwnerId,
    allowsPropertyRead: privacyRules.allowsPropertyRead
});

export const eventMutations = createAdoleEventMutationApi({ query });
export const eventConflicts = createAdoleConflictApi({ query });

export const {
    getSyncState,
    updateSyncState,
    enqueueSyncOperation,
    listSyncQueue,
    markSyncQueueSyncing,
    markSyncQueueError,
    markSyncQueueDone,
    getPendingForSync,
    markAsSynced
} = createAdoleSyncApi({ getAtome });
