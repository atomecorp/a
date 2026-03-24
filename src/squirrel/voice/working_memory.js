/**
 * Session working memory for multi-turn voice interactions.
 *
 * Stores the current working set so that follow-up phrases like
 * "this mail", "the oldest one", "the next one", "the others"
 * resolve correctly to the right items.
 *
 * This replaces the shallow active_intent-only approach with a
 * proper working set per domain.
 */

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const defaultNow = () => Date.now();

const WORKING_MEMORY_VERSION = 1;
const MAX_RESULT_SET_IDS = 200;
const MAX_HISTORY = 20;

/**
 * Creates a fresh domain working set.
 */
const createDomainWorkingSet = () => ({
    current_item_id: null,
    current_item: null,
    result_set_ids: [],
    result_set_items: [],
    active_filters: {},
    active_order: 'newest',
    active_scope: 'mailbox',
    cursor_index: -1,
    last_operation: null,
    last_operation_at: null
});

/**
 * Creates a session working memory instance.
 *
 * @param {object} options
 * @param {Function} options.now - Clock function.
 * @returns {object} Working memory API.
 */
export const createWorkingMemory = ({
    now = defaultNow
} = {}) => {
    const domains = new Map();
    const history = [];
    let version = WORKING_MEMORY_VERSION;

    const getDomainSet = (domain) => {
        if (!domains.has(domain)) {
            domains.set(domain, createDomainWorkingSet());
        }
        return domains.get(domain);
    };

    const pushHistory = (entry) => {
        history.push({
            ...entry,
            at: now()
        });
        if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
        }
    };

    return {
        /**
         * Returns the current working set for a domain.
         */
        getWorkingSet(domain) {
            return cloneValue(getDomainSet(domain));
        },

        /**
         * Updates the current item for a domain.
         *
         * @param {string} domain
         * @param {string} itemId
         * @param {object} item - Optional full item data for readout.
         */
        setCurrentItem(domain, itemId, item = null) {
            const ws = getDomainSet(domain);
            ws.current_item_id = itemId || null;
            ws.current_item = item ? cloneValue(item) : null;
            if (itemId && ws.result_set_ids.length) {
                ws.cursor_index = ws.result_set_ids.indexOf(itemId);
            }
            pushHistory({
                type: 'set_current',
                domain,
                item_id: itemId
            });
        },

        /**
         * Stores a result set (list of item IDs + optional items) from a query.
         *
         * @param {string} domain
         * @param {Array<object>} items - Items from the result set.
         * @param {string} idField - The field name for the item ID.
         */
        setResultSet(domain, items = [], idField = 'message_id') {
            const ws = getDomainSet(domain);
            const safeItems = Array.isArray(items) ? items : [];
            ws.result_set_ids = safeItems
                .map((item) => String(item?.[idField] || item?.id || '').trim())
                .filter(Boolean)
                .slice(0, MAX_RESULT_SET_IDS);
            ws.result_set_items = safeItems.slice(0, MAX_RESULT_SET_IDS).map((item) => cloneValue(item));
            if (safeItems.length > 0 && !ws.current_item_id) {
                ws.current_item_id = ws.result_set_ids[0] || null;
                ws.current_item = ws.result_set_items[0] || null;
                ws.cursor_index = 0;
            }
            pushHistory({
                type: 'set_result_set',
                domain,
                count: ws.result_set_ids.length
            });
        },

        /**
         * Updates the active filters for a domain.
         */
        setFilters(domain, filters = {}) {
            const ws = getDomainSet(domain);
            ws.active_filters = filters && typeof filters === 'object' ? cloneValue(filters) : {};
            pushHistory({
                type: 'set_filters',
                domain,
                filters: ws.active_filters
            });
        },

        /**
         * Updates ordering.
         */
        setOrder(domain, order) {
            const ws = getDomainSet(domain);
            ws.active_order = String(order || 'newest').trim().toLowerCase();
        },

        /**
         * Updates the scope.
         */
        setScope(domain, scope) {
            const ws = getDomainSet(domain);
            ws.active_scope = String(scope || 'mailbox').trim().toLowerCase();
        },

        /**
         * Records the last operation performed.
         */
        setLastOperation(domain, operation) {
            const ws = getDomainSet(domain);
            ws.last_operation = String(operation || '').trim() || null;
            ws.last_operation_at = now();
        },

        /**
         * Advances the cursor to the next item in the result set.
         * Returns the new current item or null if at end.
         */
        nextItem(domain) {
            const ws = getDomainSet(domain);
            if (!ws.result_set_ids.length) return null;
            const nextIndex = ws.cursor_index + 1;
            if (nextIndex >= ws.result_set_ids.length) return null;
            ws.cursor_index = nextIndex;
            ws.current_item_id = ws.result_set_ids[nextIndex] || null;
            ws.current_item = ws.result_set_items[nextIndex] || null;
            pushHistory({
                type: 'next_item',
                domain,
                item_id: ws.current_item_id,
                index: nextIndex
            });
            return cloneValue(ws.current_item);
        },

        /**
         * Goes back to the previous item in the result set.
         */
        previousItem(domain) {
            const ws = getDomainSet(domain);
            if (!ws.result_set_ids.length) return null;
            const prevIndex = ws.cursor_index - 1;
            if (prevIndex < 0) return null;
            ws.cursor_index = prevIndex;
            ws.current_item_id = ws.result_set_ids[prevIndex] || null;
            ws.current_item = ws.result_set_items[prevIndex] || null;
            pushHistory({
                type: 'previous_item',
                domain,
                item_id: ws.current_item_id,
                index: prevIndex
            });
            return cloneValue(ws.current_item);
        },

        /**
         * Returns the item at a specific position by order keyword.
         * Supports: 'oldest', 'newest', 'first', 'last'
         */
        getItemByOrder(domain, order) {
            const ws = getDomainSet(domain);
            if (!ws.result_set_items.length) return null;
            const normalized = String(order || '').trim().toLowerCase();
            if (normalized === 'oldest' || normalized === 'last') {
                const idx = ws.result_set_items.length - 1;
                ws.cursor_index = idx;
                ws.current_item_id = ws.result_set_ids[idx] || null;
                ws.current_item = ws.result_set_items[idx] || null;
                return cloneValue(ws.current_item);
            }
            if (normalized === 'newest' || normalized === 'first') {
                ws.cursor_index = 0;
                ws.current_item_id = ws.result_set_ids[0] || null;
                ws.current_item = ws.result_set_items[0] || null;
                return cloneValue(ws.current_item);
            }
            return null;
        },

        /**
         * Returns the current item ID for a domain.
         */
        getCurrentItemId(domain) {
            return getDomainSet(domain).current_item_id;
        },

        /**
         * Returns the full current item for a domain.
         */
        getCurrentItem(domain) {
            const item = getDomainSet(domain).current_item;
            return item ? cloneValue(item) : null;
        },

        /**
         * Returns the result set IDs for a domain.
         */
        getResultSetIds(domain) {
            return [...getDomainSet(domain).result_set_ids];
        },

        /**
         * Returns the active filters for a domain.
         */
        getFilters(domain) {
            return cloneValue(getDomainSet(domain).active_filters);
        },

        /**
         * Removes an item from the result set (e.g., after archive/delete).
         */
        removeFromResultSet(domain, itemId) {
            const ws = getDomainSet(domain);
            const idx = ws.result_set_ids.indexOf(itemId);
            if (idx === -1) return;
            ws.result_set_ids.splice(idx, 1);
            ws.result_set_items.splice(idx, 1);
            if (ws.current_item_id === itemId) {
                const nextIdx = Math.min(idx, ws.result_set_ids.length - 1);
                ws.current_item_id = ws.result_set_ids[nextIdx] || null;
                ws.current_item = ws.result_set_items[nextIdx] || null;
                ws.cursor_index = nextIdx >= 0 ? nextIdx : -1;
            } else if (ws.cursor_index > idx) {
                ws.cursor_index = Math.max(0, ws.cursor_index - 1);
            }
        },

        /**
         * Clears the working set for a domain.
         */
        clearDomain(domain) {
            domains.set(domain, createDomainWorkingSet());
        },

        /**
         * Clears everything.
         */
        clearAll() {
            domains.clear();
            history.length = 0;
        },

        /**
         * Returns the full history log.
         */
        getHistory() {
            return cloneValue(history);
        },

        /**
         * Exports a snapshot of all domain working sets.
         */
        snapshot() {
            const snap = {};
            for (const [domain, ws] of domains.entries()) {
                snap[domain] = cloneValue(ws);
            }
            return {
                version,
                domains: snap,
                history: cloneValue(history)
            };
        },

        /**
         * Restores from a snapshot.
         */
        restore(data = {}) {
            if (!data || typeof data !== 'object') return;
            domains.clear();
            if (data.domains && typeof data.domains === 'object') {
                for (const [domain, ws] of Object.entries(data.domains)) {
                    domains.set(domain, {
                        ...createDomainWorkingSet(),
                        ...ws
                    });
                }
            }
            history.length = 0;
            if (Array.isArray(data.history)) {
                history.push(...data.history.slice(-MAX_HISTORY));
            }
        }
    };
};
