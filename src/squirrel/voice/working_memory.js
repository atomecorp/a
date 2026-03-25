/**
 * Canonical session working memory for voice/text assistant flows.
 *
 * The legacy domain working sets remain for result-set navigation, but the
 * module now also owns:
 * - conversation turns
 * - compact summaries for evicted turns
 * - active entities
 * - session preferences
 *
 * This keeps one authoritative memory interface for the assistant runtime.
 */

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const defaultNow = () => Date.now();

const WORKING_MEMORY_VERSION = 2;
const MAX_RESULT_SET_IDS = 200;
const MAX_HISTORY = 20;
const MAX_CONVERSATION_TURNS = 24;
const MAX_CONVERSATION_SUMMARIES = 12;

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

const summarizeTurn = (turn = {}) => ({
    at: turn.at || null,
    user: String(turn.user || '').trim(),
    assistant: String(turn.assistant || '').trim() || null,
    domain: String(turn.domain || '').trim() || null,
    action: String(turn.action || '').trim() || null
});

const normalizeTurn = (turn = {}, now = defaultNow) => ({
    id: String(turn.id || `turn_${now()}`),
    at: Number.isFinite(Number(turn.at)) ? Number(turn.at) : now(),
    user: String(turn.user || '').trim(),
    assistant: String(turn.assistant || '').trim() || null,
    domain: String(turn.domain || '').trim() || null,
    action: String(turn.action || '').trim() || null,
    meta: turn.meta && typeof turn.meta === 'object' ? cloneValue(turn.meta) : {}
});

const normalizeEntityRecord = (domain, id, item = null) => ({
    domain: String(domain || '').trim(),
    id: String(id || '').trim() || null,
    item: item ? cloneValue(item) : null
});

export const createWorkingMemory = ({
    now = defaultNow
} = {}) => {
    const domains = new Map();
    const history = [];
    const activeEntities = new Map();
    const conversationTurns = [];
    const conversationSummaries = [];
    const sessionPreferences = {};
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

    const syncActiveEntityFromWorkingSet = (domain, ws) => {
        const normalizedDomain = String(domain || '').trim();
        if (!normalizedDomain) return;
        if (!ws.current_item_id) {
            activeEntities.delete(normalizedDomain);
            return;
        }
        activeEntities.set(normalizedDomain, normalizeEntityRecord(
            normalizedDomain,
            ws.current_item_id,
            ws.current_item
        ));
    };

    const appendConversationTurn = (turn = {}) => {
        const normalized = normalizeTurn(turn, now);
        if (!normalized.user && !normalized.assistant) return null;
        conversationTurns.push(normalized);
        if (conversationTurns.length > MAX_CONVERSATION_TURNS) {
            const evicted = conversationTurns.shift();
            if (evicted) {
                conversationSummaries.push(summarizeTurn(evicted));
                if (conversationSummaries.length > MAX_CONVERSATION_SUMMARIES) {
                    conversationSummaries.splice(0, conversationSummaries.length - MAX_CONVERSATION_SUMMARIES);
                }
            }
        }
        pushHistory({
            type: 'append_turn',
            domain: normalized.domain,
            action: normalized.action,
            turn_id: normalized.id
        });
        return cloneValue(normalized);
    };

    return {
        getWorkingSet(domain) {
            return cloneValue(getDomainSet(domain));
        },

        setCurrentItem(domain, itemId, item = null) {
            const ws = getDomainSet(domain);
            ws.current_item_id = itemId || null;
            ws.current_item = item ? cloneValue(item) : null;
            if (itemId && ws.result_set_ids.length) {
                ws.cursor_index = ws.result_set_ids.indexOf(itemId);
            }
            syncActiveEntityFromWorkingSet(domain, ws);
            pushHistory({
                type: 'set_current',
                domain,
                item_id: itemId
            });
        },

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
            syncActiveEntityFromWorkingSet(domain, ws);
            pushHistory({
                type: 'set_result_set',
                domain,
                count: ws.result_set_ids.length
            });
        },

        setFilters(domain, filters = {}) {
            const ws = getDomainSet(domain);
            ws.active_filters = filters && typeof filters === 'object' ? cloneValue(filters) : {};
            pushHistory({
                type: 'set_filters',
                domain,
                filters: ws.active_filters
            });
        },

        setOrder(domain, order) {
            const ws = getDomainSet(domain);
            ws.active_order = String(order || 'newest').trim().toLowerCase();
        },

        setScope(domain, scope) {
            const ws = getDomainSet(domain);
            ws.active_scope = String(scope || 'mailbox').trim().toLowerCase();
        },

        setLastOperation(domain, operation) {
            const ws = getDomainSet(domain);
            ws.last_operation = String(operation || '').trim() || null;
            ws.last_operation_at = now();
        },

        nextItem(domain) {
            const ws = getDomainSet(domain);
            if (!ws.result_set_ids.length) return null;
            const nextIndex = ws.cursor_index + 1;
            if (nextIndex >= ws.result_set_ids.length) return null;
            ws.cursor_index = nextIndex;
            ws.current_item_id = ws.result_set_ids[nextIndex] || null;
            ws.current_item = ws.result_set_items[nextIndex] || null;
            syncActiveEntityFromWorkingSet(domain, ws);
            pushHistory({
                type: 'next_item',
                domain,
                item_id: ws.current_item_id,
                index: nextIndex
            });
            return cloneValue(ws.current_item);
        },

        previousItem(domain) {
            const ws = getDomainSet(domain);
            if (!ws.result_set_ids.length) return null;
            const prevIndex = ws.cursor_index - 1;
            if (prevIndex < 0) return null;
            ws.cursor_index = prevIndex;
            ws.current_item_id = ws.result_set_ids[prevIndex] || null;
            ws.current_item = ws.result_set_items[prevIndex] || null;
            syncActiveEntityFromWorkingSet(domain, ws);
            pushHistory({
                type: 'previous_item',
                domain,
                item_id: ws.current_item_id,
                index: prevIndex
            });
            return cloneValue(ws.current_item);
        },

        getItemByOrder(domain, order) {
            const ws = getDomainSet(domain);
            if (!ws.result_set_items.length) return null;
            const normalized = String(order || '').trim().toLowerCase();
            if (normalized === 'oldest' || normalized === 'last') {
                const idx = ws.result_set_items.length - 1;
                ws.cursor_index = idx;
                ws.current_item_id = ws.result_set_ids[idx] || null;
                ws.current_item = ws.result_set_items[idx] || null;
                syncActiveEntityFromWorkingSet(domain, ws);
                return cloneValue(ws.current_item);
            }
            if (normalized === 'newest' || normalized === 'first') {
                ws.cursor_index = 0;
                ws.current_item_id = ws.result_set_ids[0] || null;
                ws.current_item = ws.result_set_items[0] || null;
                syncActiveEntityFromWorkingSet(domain, ws);
                return cloneValue(ws.current_item);
            }
            return null;
        },

        getCurrentItemId(domain) {
            return getDomainSet(domain).current_item_id;
        },

        getCurrentItem(domain) {
            const item = getDomainSet(domain).current_item;
            return item ? cloneValue(item) : null;
        },

        getResultSetIds(domain) {
            return [...getDomainSet(domain).result_set_ids];
        },

        getResultSetItems(domain) {
            return cloneValue(getDomainSet(domain).result_set_items);
        },

        getFilters(domain) {
            return cloneValue(getDomainSet(domain).active_filters);
        },

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
            syncActiveEntityFromWorkingSet(domain, ws);
        },

        clearDomain(domain) {
            domains.set(domain, createDomainWorkingSet());
            activeEntities.delete(String(domain || '').trim());
        },

        clearAll() {
            domains.clear();
            history.length = 0;
            activeEntities.clear();
            conversationTurns.length = 0;
            conversationSummaries.length = 0;
            Object.keys(sessionPreferences).forEach((key) => delete sessionPreferences[key]);
        },

        appendTurn(turn = {}) {
            return appendConversationTurn(turn);
        },

        listConversationTurns({ limit = null } = {}) {
            const turns = cloneValue(conversationTurns);
            if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return turns;
            return turns.slice(-Math.max(1, Math.round(Number(limit))));
        },

        listConversationSummaries({ limit = null } = {}) {
            const summaries = cloneValue(conversationSummaries);
            if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return summaries;
            return summaries.slice(-Math.max(1, Math.round(Number(limit))));
        },

        getConversationContext({ turnLimit = 6, summaryLimit = 3 } = {}) {
            return {
                turns: this.listConversationTurns({ limit: turnLimit }),
                summaries: this.listConversationSummaries({ limit: summaryLimit })
            };
        },

        setActiveEntity(domain, entityId, item = null) {
            const normalizedDomain = String(domain || '').trim();
            if (!normalizedDomain) return;
            if (!entityId) {
                activeEntities.delete(normalizedDomain);
                return;
            }
            activeEntities.set(normalizedDomain, normalizeEntityRecord(normalizedDomain, entityId, item));
        },

        getActiveEntity(domain) {
            const entry = activeEntities.get(String(domain || '').trim());
            return entry ? cloneValue(entry) : null;
        },

        listActiveEntities() {
            const output = {};
            for (const [domain, entry] of activeEntities.entries()) {
                output[domain] = cloneValue(entry);
            }
            return output;
        },

        setSessionPreference(key, value) {
            const normalizedKey = String(key || '').trim();
            if (!normalizedKey) return;
            sessionPreferences[normalizedKey] = cloneValue(value);
            pushHistory({
                type: 'set_session_preference',
                key: normalizedKey
            });
        },

        getSessionPreference(key, fallback = null) {
            const normalizedKey = String(key || '').trim();
            if (!normalizedKey || !(normalizedKey in sessionPreferences)) return fallback;
            return cloneValue(sessionPreferences[normalizedKey]);
        },

        getSessionPreferences() {
            return cloneValue(sessionPreferences);
        },

        getHistory() {
            return cloneValue(history);
        },

        snapshot() {
            const snap = {};
            for (const [domain, ws] of domains.entries()) {
                snap[domain] = cloneValue(ws);
            }
            return {
                version,
                domains: snap,
                history: cloneValue(history),
                active_entities: this.listActiveEntities(),
                conversation_turns: cloneValue(conversationTurns),
                conversation_summaries: cloneValue(conversationSummaries),
                session_preferences: cloneValue(sessionPreferences)
            };
        },

        restore(data = {}) {
            if (!data || typeof data !== 'object') return;
            domains.clear();
            activeEntities.clear();
            conversationTurns.length = 0;
            conversationSummaries.length = 0;
            Object.keys(sessionPreferences).forEach((key) => delete sessionPreferences[key]);
            if (data.domains && typeof data.domains === 'object') {
                for (const [domain, ws] of Object.entries(data.domains)) {
                    const merged = {
                        ...createDomainWorkingSet(),
                        ...ws
                    };
                    domains.set(domain, merged);
                    syncActiveEntityFromWorkingSet(domain, merged);
                }
            }
            history.length = 0;
            if (Array.isArray(data.history)) {
                history.push(...data.history.slice(-MAX_HISTORY));
            }
            if (data.active_entities && typeof data.active_entities === 'object') {
                for (const [domain, entry] of Object.entries(data.active_entities)) {
                    if (!entry || typeof entry !== 'object') continue;
                    activeEntities.set(domain, normalizeEntityRecord(domain, entry.id, entry.item));
                }
            }
            if (Array.isArray(data.conversation_turns)) {
                conversationTurns.push(...data.conversation_turns.slice(-MAX_CONVERSATION_TURNS).map((entry) => normalizeTurn(entry, now)));
            }
            if (Array.isArray(data.conversation_summaries)) {
                conversationSummaries.push(...data.conversation_summaries.slice(-MAX_CONVERSATION_SUMMARIES).map((entry) => summarizeTurn(entry)));
            }
            if (data.session_preferences && typeof data.session_preferences === 'object') {
                Object.assign(sessionPreferences, cloneValue(data.session_preferences));
            }
        }
    };
};
