/**
 * Unified semantic contract for all business domains (mail, contacts, calendar, atome).
 *
 * Every voice/text request is normalized into a single StructuredRequest shape
 * before reaching any business execution path.
 *
 * This eliminates the fragmented intent/entity/toolchain spread across
 * multiple files and ensures that follow-up phrases, filters, ordering,
 * and scoping survive end-to-end.
 */

// ---------------------------------------------------------------------------
// Domain operations
// ---------------------------------------------------------------------------

export const SEMANTIC_DOMAINS = Object.freeze([
    'mail',
    'contacts',
    'calendar',
    'atome',
    'conversation',
    'unknown'
]);

export const MAIL_OPERATIONS = Object.freeze([
    'list',
    'read',
    'summarize',
    'reply',
    'send',
    'archive',
    'delete',
    'mark_read',
    'mark_unread',
    'search'
]);

export const CONTACTS_OPERATIONS = Object.freeze([
    'list',
    'search',
    'read',
    'create',
    'update',
    'delete'
]);

export const CALENDAR_OPERATIONS = Object.freeze([
    'list',
    'search',
    'read',
    'create',
    'update',
    'delete'
]);

export const ATOME_OPERATIONS = Object.freeze([
    'create',
    'update',
    'delete',
    'read',
    'list',
    'invoke_tool'
]);

const OPERATIONS_BY_DOMAIN = Object.freeze({
    mail: MAIL_OPERATIONS,
    contacts: CONTACTS_OPERATIONS,
    calendar: CALENDAR_OPERATIONS,
    atome: ATOME_OPERATIONS
});

// ---------------------------------------------------------------------------
// Target kinds
// ---------------------------------------------------------------------------

export const TARGET_KINDS = Object.freeze([
    'current',
    'selected',
    'query',
    'thread',
    'message_id',
    'contact_id',
    'event_id',
    'atome_id',
    'none'
]);

// ---------------------------------------------------------------------------
// Structured request shape
// ---------------------------------------------------------------------------

const ensureArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
    const str = String(value || '').trim();
    return str ? [str] : [];
};

const ensureString = (value, fallback = '') => {
    const str = String(value ?? '').trim();
    return str || fallback;
};

const ensurePositiveInt = (value, fallback = null) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return fallback;
    return Math.round(num);
};

const ensureObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {});

/**
 * Creates a normalized structured request.
 *
 * @param {object} raw - Partial or complete request shape.
 * @returns {object} Fully normalized StructuredRequest.
 */
export const createStructuredRequest = (raw = {}) => {
    const domain = ensureString(raw.domain, 'unknown');
    const validOps = OPERATIONS_BY_DOMAIN[domain] || [];
    const operation = validOps.includes(raw.operation) ? raw.operation : (validOps[0] || 'list');

    const target = {
        kind: TARGET_KINDS.includes(raw.target?.kind) ? raw.target.kind : 'current',
        id: ensureString(raw.target?.id)
    };

    const filters = {
        read_state: ['read', 'unread', 'any'].includes(raw.filters?.read_state) ? raw.filters.read_state : 'any',
        from: ensureArray(raw.filters?.from),
        not_from: ensureArray(raw.filters?.not_from),
        mailbox: ensureString(raw.filters?.mailbox, 'inbox').toLowerCase(),
        thread_id: ensureString(raw.filters?.thread_id),
        query_text: ensureString(raw.filters?.query_text),
        order: ['oldest', 'newest'].includes(raw.filters?.order) ? raw.filters.order : 'newest',
        limit: ensurePositiveInt(raw.filters?.limit, 10),
        temporal_ref: ensureString(raw.filters?.temporal_ref)
    };

    const scope = ['current_result_set', 'mailbox', 'all'].includes(raw.scope) ? raw.scope : 'mailbox';

    const draft = {
        reply_text: ensureString(raw.draft?.reply_text),
        reply_target: ensureString(raw.draft?.reply_target),
        auto_send: raw.draft?.auto_send === true
    };

    const source = {
        utterance_raw: ensureString(raw.source?.utterance_raw),
        utterance_normalized: ensureString(raw.source?.utterance_normalized),
        intent_id: ensureString(raw.source?.intent_id),
        session_id: ensureString(raw.source?.session_id),
        locale: ensureString(raw.source?.locale, 'fr-FR'),
        confidence: Number.isFinite(Number(raw.source?.confidence)) ? Number(raw.source.confidence) : null
    };

    const payload = ensureObject(raw.payload);

    return Object.freeze({
        domain,
        operation,
        target,
        filters,
        scope,
        draft,
        source,
        payload,
        status_only: raw.status_only === true
    });
};

// ---------------------------------------------------------------------------
// Convenience builders
// ---------------------------------------------------------------------------

export const createMailRequest = (raw = {}) => createStructuredRequest({
    ...raw,
    domain: 'mail'
});

export const createContactsRequest = (raw = {}) => createStructuredRequest({
    ...raw,
    domain: 'contacts'
});

export const createCalendarRequest = (raw = {}) => createStructuredRequest({
    ...raw,
    domain: 'calendar'
});

export const createAtomeRequest = (raw = {}) => createStructuredRequest({
    ...raw,
    domain: 'atome'
});

// ---------------------------------------------------------------------------
// Structured result shape
// ---------------------------------------------------------------------------

/**
 * Creates a normalized structured result from business execution.
 *
 * @param {object} raw - Partial result from a connector/service.
 * @returns {object} Normalized StructuredResult.
 */
export const createStructuredResult = (raw = {}) => {
    const ok = raw.ok !== false;
    const domain = ensureString(raw.domain, 'unknown');
    const operation = ensureString(raw.operation);
    const items = Array.isArray(raw.items) ? raw.items : [];
    const item = raw.item && typeof raw.item === 'object' ? raw.item : null;
    const error = ensureString(raw.error);
    const reply_text = ensureString(raw.reply_text);
    const stats = raw.stats && typeof raw.stats === 'object' ? { ...raw.stats } : {};

    return Object.freeze({
        ok,
        domain,
        operation,
        items,
        item,
        stats,
        error,
        reply_text,
        executed: raw.executed !== false,
        transport: ensureString(raw.transport)
    });
};

// ---------------------------------------------------------------------------
// Intent-to-request converter
// ---------------------------------------------------------------------------

/**
 * Converts a legacy voice intent + context into a StructuredRequest.
 * This bridges the existing intent_schema / orchestrator code with the
 * new unified contract.
 *
 * @param {object} intent - Normalized voice intent.
 * @param {object} context - Session working memory context.
 * @returns {object} StructuredRequest
 */
export const intentToStructuredRequest = (intent = {}, context = {}) => {
    const domain = ensureString(intent.domain, 'unknown');
    const action = ensureString(intent.action, 'list');
    const entities = intent.entities && typeof intent.entities === 'object' ? intent.entities : {};
    const activeEntities = context.active_intent?.entities || {};
    const sourceToolParams = (Array.isArray(context.toolchain) ? context.toolchain : [])
        .map((step) => (
            step?.params && typeof step.params === 'object'
                ? step.params
                : (step?.input && typeof step.input === 'object' ? step.input : null)
        ))
        .filter((entry) => entry && typeof entry === 'object');
    const mergedToolParams = sourceToolParams.reduce((acc, entry) => ({ ...acc, ...entry }), {});

    const operationMap = {
        list: 'list',
        read_current: 'read',
        read_next: 'read',
        read: 'read',
        summarize_current: 'summarize',
        summarize: 'summarize',
        reply_current: 'reply',
        reply: 'reply',
        send: 'send',
        archive_current: 'archive',
        archive: 'archive',
        delete_current: 'delete',
        delete: 'delete',
        mark_read_current: 'mark_read',
        mark_read: 'mark_read',
        mark_unread_current: 'mark_unread',
        mark_unread: 'mark_unread',
        search: 'search',
        search_contacts: 'search',
        list_contacts: 'list',
        read_contact: 'read',
        search_events: 'search',
        list_events: 'list',
        read_event: 'read',
        create: 'create',
        update: 'update',
        invoke_tool: 'invoke_tool'
    };
    const operation = operationMap[action] || action;

    const currentId = ensureString(
        entities.current_message_id
        || entities.current_contact_id
        || entities.current_event_id
        || mergedToolParams.message_id
        || mergedToolParams.contact_id
        || mergedToolParams.contactId
        || mergedToolParams.event_id
        || mergedToolParams.eventId
        || mergedToolParams.id
        || activeEntities.current_message_id
        || activeEntities.current_contact_id
        || activeEntities.current_event_id
    );

    const targetKind = currentId ? 'current'
        : (entities.query_text || entities.query) ? 'query'
            : 'none';

    const readState = entities.unread_only === true ? 'unread'
        : entities.read === true ? 'read'
            : 'any';

    return createStructuredRequest({
        domain,
        operation,
        target: {
            kind: targetKind,
            id: currentId
        },
        filters: {
            read_state: readState,
            from: ensureArray(entities.from || mergedToolParams.from || activeEntities.from),
            not_from: ensureArray(entities.not_from || mergedToolParams.not_from || activeEntities.not_from),
            mailbox: ensureString(entities.mailbox || mergedToolParams.mailbox || activeEntities.mailbox, 'inbox').toLowerCase(),
            thread_id: ensureString(entities.thread_id || mergedToolParams.thread_id || activeEntities.thread_id),
            query_text: ensureString(entities.query_text || entities.query || mergedToolParams.query_text || mergedToolParams.query),
            order: ensureString(entities.order || mergedToolParams.order || activeEntities.order, 'newest'),
            limit: ensurePositiveInt(entities.limit || mergedToolParams.limit || activeEntities.limit, 10),
            temporal_ref: ensureString(entities.temporal_ref || mergedToolParams.temporal_ref)
        },
        scope: ensureString(entities.scope, 'mailbox'),
        draft: {
            reply_text: ensureString(entities.draft_text || mergedToolParams.draft_text || mergedToolParams.reply_text),
            reply_target: ensureString(entities.reply_target || mergedToolParams.reply_target),
            auto_send: entities.auto_send === true || mergedToolParams.auto_send === true
        },
        source: {
            utterance_raw: ensureString(intent.utterance?.raw),
            utterance_normalized: ensureString(intent.utterance?.normalized),
            intent_id: ensureString(intent.intent_id),
            session_id: ensureString(intent.session_id),
            locale: ensureString(intent.locale, 'fr-FR'),
            confidence: Number.isFinite(Number(intent.confidence)) ? Number(intent.confidence) : null
        },
        payload: ensureObject(
            mergedToolParams.contact
            || mergedToolParams.event
            || mergedToolParams.changes
            || (
                ['create', 'update'].includes(operation)
                    ? mergedToolParams
                    : null
            )
        ),
        status_only: entities.status_only === true
    });
};
