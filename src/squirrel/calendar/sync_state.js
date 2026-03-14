const cloneValue = (value) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
};

export const createCalendarSyncState = ({
    provider = 'icloud_caldav_legacy',
    now = () => Date.now()
} = {}) => {
    const state = {
        provider: String(provider || 'icloud_caldav_legacy'),
        cursor: null,
        last_sync_at: null,
        batches: 0,
        ingested: 0,
        removed: 0,
        changes: []
    };

    return {
        applyBatch(events = [], {
            cursor = null,
            removed_ids = [],
            source = { provider: state.provider }
        } = {}) {
            const timestamp = now();
            const list = Array.isArray(events) ? events : [events];
            const removedList = Array.isArray(removed_ids) ? removed_ids.filter(Boolean).map((entry) => String(entry)) : [];
            state.batches += 1;
            state.ingested += list.length;
            state.removed += removedList.length;
            state.cursor = cursor != null ? String(cursor) : state.cursor;
            state.last_sync_at = timestamp;
            state.changes.push({
                at: timestamp,
                cursor: state.cursor,
                ingested: list.length,
                removed: removedList.length,
                removed_ids: removedList,
                source: source && typeof source === 'object' ? { ...source } : { provider: state.provider }
            });
            if (state.changes.length > 50) {
                state.changes.splice(0, state.changes.length - 50);
            }
            return {
                ok: true,
                cursor: state.cursor,
                ingested: list.length,
                removed: removedList.length,
                last_sync_at: state.last_sync_at
            };
        },
        status() {
            return cloneValue(state);
        }
    };
};
