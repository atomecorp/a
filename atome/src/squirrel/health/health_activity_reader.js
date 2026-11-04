// The sessions this device's health store holds, read for their import (D18 improvement 6; #health_activity_sync.js):
// HealthKit's workouts through an HKAnchoredObjectQuery (platforms/ios/atome-auv3/Common/AppNativeHealthActivities.swift),
// Health Connect's exercise sessions through its history pages then its changes tokens
// (platforms/desktop-tauri/vendor/tauri-plugin-health/android/src/main/java/HealthActivityImport.kt). The host reads
// only the categories the person chose, never the sessions eVe itself wrote (its training workouts), and gives each
// session's measures from the app that recorded it; a measure it does not hold is absent. `anchor` is the store's
// position, opaque here: null reads the history from `from` (the store's own limits apply), else what changed since.
// The values only travel in this reply, to the import (#health_imports.js); never to the caller of a command.
import { validateActivityImportEntry, ACTIVITY_IMPORT_MEASURES, ACTIVITY_IMPORT_MEASURE_SOURCE } from '../../shared/activity_import_contract.js';
import { ACTIVITY_SOURCE_CATEGORIES } from '../../shared/activity_source_contract.js';

export const HEALTH_ACTIVITY_STORES = Object.freeze({ ios: 'apple_health', android: 'health_connect' });
const ANCHOR_MAX = 8192;

// A host's session as the import keeps it, or null when the host's row is not one (counted, never guessed).
export const healthActivityEntry = (source, row, at) => {
    if (!row || typeof row !== 'object' || !Number.isFinite(row.start) || !Number.isFinite(row.end)) return null;
    const entry = { source, source_id: String(row.source_id ?? ''), sport: String(row.sport ?? ''),
        start: new Date(row.start).toISOString(), end: new Date(row.end).toISOString(),
        ...Object.fromEntries(ACTIVITY_IMPORT_MEASURES.filter(key => Number.isFinite(row[key]) && row[key] >= 0).map(key => [key, row[key]])),
        ...(typeof row.origin === 'string' && row.origin ? { origin: row.origin } : {}),
        ...(typeof row.device === 'string' && row.device ? { device: row.device.slice(0, 60) } : {}),
        measure_source: ACTIVITY_IMPORT_MEASURE_SOURCE, imported_at: at };
    try { return validateActivityImportEntry(entry); } catch { return null; }
};

const failure = error => ({ ok: false, error });

export function createHealthActivityReader({ call, context, loadLinkStatus, describe, now = () => Date.now() }) {
    // One page: { ok, activities (contract entries without source fields), deleted: ids, rejected, anchor, more }.
    const read = async ({ categories, anchor = null, from = null } = {}) => {
        const host = describe();
        const source = HEALTH_ACTIVITY_STORES[host.host];
        if (!host.supported || !source) return failure(host.reason || 'health_host_unsupported');
        const chosen = Array.isArray(categories) ? categories.filter(category => ACTIVITY_SOURCE_CATEGORIES.includes(category)) : [];
        if (!chosen.includes('workouts')) return failure('health_activities_invalid');
        if (anchor !== null && !(typeof anchor === 'string' && anchor && anchor.length <= ANCHOR_MAX)) return failure('health_anchor_invalid');
        const ctx = context();
        const link = await loadLinkStatus();
        if (!link.linked) return failure(link.reason || 'health_link_required');
        const reply = await call('health_activities_read', { categories: chosen, anchor, ...(Number.isFinite(from) ? { from } : {}) }, ctx);
        if (reply.stale) return failure('health_context_changed');
        if (!reply.ok || reply.result?.ok === false) return failure(reply.error || reply.result?.error || 'health_activities_failed');
        const result = reply.result || {};
        if (typeof result.anchor !== 'string' || !result.anchor || result.anchor.length > ANCHOR_MAX || !Array.isArray(result.activities)) return failure('health_activities_reply_invalid');
        const at = new Date(now()).toISOString();
        const entries = result.activities.map(row => healthActivityEntry(source, row, at));
        return { ok: true, source, anchor: result.anchor, more: result.more === true,
            activities: entries.filter(Boolean).map(({ source: _source, measure_source: _measure, imported_at: _at, ...activity }) => activity),
            rejected: entries.filter(entry => !entry).length,
            deleted: Array.isArray(result.deleted) ? result.deleted.filter(id => typeof id === 'string').length : 0 };
    };
    return Object.freeze({ read });
}
