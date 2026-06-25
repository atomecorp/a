// Extracted from tool_router.js: shared voice-router primitives — locale, offline detection/queueing,
// connector-call wrapper, and voice-mutation security normalization.
import { createStructuredResult } from './semantic_contract.js';

const isEnglish = (locale) => String(locale || '').toLowerCase().startsWith('en');
const OFFLINE_MUTATION_OPERATIONS = new Set(['create', 'update', 'delete']);

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const isOfflineLikeFailure = (value) => {
    if (!value) return false;
    if (value?.offline === true || value?.status === 0) return true;
    const text = String(value?.error || value?.message || value || '').toLowerCase();
    return text.includes('offline')
        || text.includes('unreachable')
        || text.includes('timeout')
        || text.includes('network')
        || text.includes('connection lost')
        || text.includes('fetch failed')
        || text.includes('service unavailable');
};

const executeConnectorCall = async (callback, fallbackError = 'connector_execution_failed') => {
    try {
        const result = await callback();
        return result && typeof result === 'object'
            ? result
            : { ok: result !== false };
    } catch (error) {
        return {
            ok: false,
            error: String(error?.message || error || fallbackError),
            offline: isOfflineLikeFailure(error)
        };
    }
};

const buildOfflineQueuedReply = (domain, operation, locale) => {
    const en = isEnglish(locale);
    const subject = domain === 'contacts'
        ? (en ? 'contact change' : 'modification du contact')
        : domain === 'calendar'
            ? (en ? 'calendar change' : 'modification du calendrier')
            : (en ? 'change' : 'modification');
    if (en) {
        return `I cannot reach the ${domain} service right now. I queued this ${subject} locally and will sync it when connectivity returns.`;
    }
    return `Je ne peux pas joindre le service ${domain === 'calendar' ? 'calendrier' : domain} pour le moment. J'ai mis cette ${subject} en file locale et elle sera synchronisee quand la connexion reviendra.`;
};

const queueOfflineMutationResult = ({
    offlineQueue = null,
    request = {},
    domain = '',
    operation = '',
    locale = 'fr-FR',
    item = null,
    draft = null
} = {}) => {
    const queueEntry = offlineQueue && typeof offlineQueue.enqueue === 'function'
        ? offlineQueue.enqueue(request)
        : null;
    const queueSize = offlineQueue && typeof offlineQueue.list === 'function'
        ? offlineQueue.list().length
        : (queueEntry ? 1 : 0);
    return createStructuredResult({
        ok: true,
        domain,
        operation,
        item,
        draft,
        executed: false,
        queued: true,
        offline: true,
        queue_entry_id: queueEntry?.id || '',
        transport: 'offline_queue',
        stats: {
            queue_size: queueSize
        },
        reply_text: buildOfflineQueuedReply(domain, operation, locale)
    });
};

const EFFECTFUL_VOICE_OPERATIONS = new Set(['create', 'update', 'delete', 'send']);

const normalizeVoiceMutationSecurity = (request = {}) => {
    const confirmation = request.confirmation && typeof request.confirmation === 'object'
        ? request.confirmation
        : {};
    const confirmationId = String(
        confirmation.confirmation_id
        || confirmation.confirmationId
        || request.confirmation_id
        || request.confirmationId
        || ''
    ).trim();
    const actorId = String(
        confirmation.actor_id
        || confirmation.actorId
        || request.source?.actor_id
        || request.source?.actorId
        || ''
    ).trim();
    const idempotencyKey = String(
        request.idempotency_key
        || request.idempotencyKey
        || confirmation.idempotency_key
        || confirmation.idempotencyKey
        || ''
    ).trim();
    if (!confirmationId || !actorId || !idempotencyKey) {
        return {
            ok: false,
            error: 'voice_mutation_confirmation_required'
        };
    }
    return {
        ok: true,
        confirmation: {
            confirmation_id: confirmationId,
            actor_id: actorId,
            idempotency_key: idempotencyKey
        },
        audit: {
            ...(request.audit && typeof request.audit === 'object' ? cloneValue(request.audit) : {}),
            source: 'voice_tool_router'
        },
        idempotency_key: idempotencyKey
    };
};

const requireVoiceMutationSecurity = (request = {}, domain = '', operation = '') => {
    if (!EFFECTFUL_VOICE_OPERATIONS.has(String(operation || request.operation || '').trim().toLowerCase())) {
        return { ok: true, options: {} };
    }
    const security = normalizeVoiceMutationSecurity(request);
    if (security.ok !== true) {
        return createStructuredResult({
            ok: false,
            domain,
            operation: operation || request.operation,
            error: security.error,
            confirmation_required: true,
            executed: false,
            reply_text: isEnglish(request.source?.locale)
                ? 'This action needs explicit confirmation before I can execute it.'
                : "Cette action necessite une confirmation explicite avant execution."
        });
    }
    return {
        ok: true,
        options: {
            confirmation: security.confirmation,
            audit: security.audit,
            idempotency_key: security.idempotency_key
        },
        request: {
            ...cloneValue(request),
            confirmation: security.confirmation,
            audit: security.audit,
            idempotency_key: security.idempotency_key
        }
    };
};


export {
    isEnglish, OFFLINE_MUTATION_OPERATIONS, cloneValue, isOfflineLikeFailure, executeConnectorCall,
    buildOfflineQueuedReply, queueOfflineMutationResult, EFFECTFUL_VOICE_OPERATIONS,
    normalizeVoiceMutationSecurity, requireVoiceMutationSecurity
};
