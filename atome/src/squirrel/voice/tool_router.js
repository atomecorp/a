import { createStructuredResult } from './semantic_contract.js';
import { resolveAtomeRuntimeInvocation } from '../atome/runtime_tool_resolution.js';
import { createOfflineMutationQueue } from '../ai/offline_mutation_queue.js';
import { isEnglish, OFFLINE_MUTATION_OPERATIONS } from './tool_router_shared.js';
import { normalizeCommunicationSurfaces } from './tool_router_mail_helpers.js';
import { executeContactsRequest } from './tool_router_contacts.js';
import { executeCalendarRequest } from './tool_router_calendar.js';
import { executeMailOpsA } from './tool_router_mail_ops_a.js';
import { executeMailOpsB } from './tool_router_mail_ops_b.js';

const executeMailRequest = async (request, connectors, workingMemory) => {
    const mailApi = connectors.mail;
    const messagesApi = connectors.messages || null;
    if (!mailApi) {
        return createStructuredResult({
            ok: false, domain: 'mail', operation: request.operation,
            error: 'mail_connector_unavailable',
            reply_text: isEnglish(request.source?.locale)
                ? 'I do not have access to your mail here yet.'
                : "Je n'ai pas encore acces a tes mails ici."
        });
    }

    let readyResult = null;
    if (typeof mailApi.ensureReady === 'function') {
        try {
            readyResult = await mailApi.ensureReady({ initial: false, limit: 20 });
        } catch (err) {
            readyResult = { ok: false, error: String(err?.message || err || 'ensureReady_threw') };
        }
        if (readyResult?.ok === false) {
            const en = isEnglish(request.source?.locale);
            const errKey = String(readyResult.error || '');
            if (
                errKey === 'mail_credentials_missing'
                || errKey === 'icloud_mail_live_smoke_missing_credentials'
                || errKey === 'icloud_mail_credentials_missing'
            ) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: request.operation,
                    error: errKey,
                    reply_text: en
                        ? 'I do not see any mail credentials configured in your settings yet.'
                        : 'Je ne trouve pas encore toute la configuration mail dans tes reglages.'
                });
            }
            return createStructuredResult({
                ok: false, domain: 'mail', operation: request.operation,
                error: errKey || 'mail_sync_failed',
                reply_text: en
                    ? `Mail sync failed: ${errKey || 'unknown error'}. Check your connection and credentials.`
                    : `La synchronisation mail a echoue : ${errKey || 'erreur inconnue'}. Verifie ta connexion et tes identifiants.`
            });
        }
    }

    const locale = request.source?.locale || 'fr-FR';
    const filters = request.filters || {};
    const requestedSurfaces = normalizeCommunicationSurfaces(request.surfaces || ['mail']);
    const normalizedMailbox = String(filters.mailbox || '').trim().toLowerCase() || '';
    const baseOpts = {
        limit: filters.limit || 10,
        ...(normalizedMailbox && normalizedMailbox !== 'inbox' ? { mailbox: normalizedMailbox } : {}),
        ...(filters.thread_id ? { thread_id: filters.thread_id } : {}),
        ...(filters.from?.length ? { from: filters.from } : {}),
        ...(filters.not_from?.length ? { not_from: filters.not_from } : {}),
        ...(filters.order ? { order: filters.order } : {}),
        ...(filters.read_state === 'unread' ? { unread_only: true } : {})
    };
    const hasMessagesSurface = requestedSurfaces.includes('messages') && !!messagesApi;

    if (hasMessagesSurface && typeof messagesApi.syncPull === 'function') {
        try { await messagesApi.syncPull({ limit: 100 }); } catch (_) { /* keep going */ }
    }

    const ctx = { mailApi, messagesApi, connectors, locale, filters, requestedSurfaces, normalizedMailbox, baseOpts, hasMessagesSurface, request, workingMemory };
    const MAIL_READ_OPS = new Set(['list', 'read', 'summarize', 'search', 'mark_read', 'mark_unread']);
    if (MAIL_READ_OPS.has(request.operation)) return executeMailOpsA(ctx);
    return executeMailOpsB(ctx);
};


export const createToolRouter = ({
    connectors = {},
    workingMemory = null,
    bridge = null,
    offlineQueue = null,
    env = globalThis
} = {}) => {
    const activeConnectors = { ...connectors };
    const mutationQueue = offlineQueue && typeof offlineQueue.enqueue === 'function'
        ? offlineQueue
        : createOfflineMutationQueue({ env });
    let flushPromise = null;

    const flushPendingMutations = async ({ limit = 25 } = {}) => {
        if (!mutationQueue || typeof mutationQueue.flush !== 'function') {
            return { processed: 0, failed: 0, remaining: 0 };
        }
        if (flushPromise) return flushPromise;
        flushPromise = mutationQueue.flush(async (queuedRequest) => {
            if (!queuedRequest || typeof queuedRequest !== 'object') {
                return { ok: false, error: 'offline_queue_request_invalid' };
            }
            const domain = String(queuedRequest.domain || '').trim().toLowerCase();
            if (!OFFLINE_MUTATION_OPERATIONS.has(String(queuedRequest.operation || '').trim().toLowerCase())) {
                return { ok: false, error: 'offline_queue_operation_invalid' };
            }
            switch (domain) {
                case 'contacts':
                    return executeContactsRequest(queuedRequest, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: false
                    });
                case 'calendar':
                    return executeCalendarRequest(queuedRequest, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: false
                    });
                default:
                    return { ok: false, error: 'offline_queue_domain_unsupported' };
            }
        }, { limit }).finally(() => {
            flushPromise = null;
        });
        return flushPromise;
    };

    return {
        setConnector(domain, api) {
            activeConnectors[domain] = api;
        },

        listPendingMutations({ limit = 50 } = {}) {
            if (!mutationQueue || typeof mutationQueue.list !== 'function') return [];
            return mutationQueue.list({ limit });
        },

        async flushPendingMutations(options = {}) {
            return flushPendingMutations(options);
        },

        async execute(request) {
            if (!request || typeof request !== 'object') {
                return createStructuredResult({
                    ok: false, error: 'invalid_request',
                    reply_text: 'Invalid request.'
                });
            }

            await flushPendingMutations();

            switch (request.domain) {
                case 'mail':
                    return executeMailRequest(request, activeConnectors, workingMemory);
                case 'contacts':
                    return executeContactsRequest(request, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: true
                    });
                case 'calendar':
                    return executeCalendarRequest(request, activeConnectors, workingMemory, {
                        offlineQueue: mutationQueue,
                        allowQueue: true
                    });
                case 'atome': {
                    if (!bridge) {
                        return createStructuredResult({
                            ok: false, domain: 'atome', operation: request.operation,
                            error: 'atome_bridge_unavailable',
                            reply_text: isEnglish(request.source?.locale)
                                ? 'The Atome runtime is not available.'
                                : "Le runtime Atome n'est pas disponible."
                        });
                    }
                    const runtimeParams = {
                        ...(request.filters && typeof request.filters === 'object' ? request.filters : {}),
                        ...(request.payload && typeof request.payload === 'object' ? request.payload : {}),
                        ...(request.target?.id ? {
                            atome_id: request.target.id,
                            id: request.target.id
                        } : {})
                    };
                    const invocation = resolveAtomeRuntimeInvocation({
                        operation: request.operation,
                        params: runtimeParams
                    });
                    if (!invocation?.tool_id) {
                        return createStructuredResult({
                            ok: false, domain: 'atome', operation: request.operation,
                            error: 'atome_runtime_tool_unresolved',
                            reply_text: isEnglish(request.source?.locale)
                                ? 'I could not resolve this Atome action to a Runtime V2 tool.'
                                : "Je n'ai pas pu resoudre cette action Atome vers un tool Runtime V2."
                        });
                    }
                    const result = await bridge.callRuntimeTool({
                        tool_id: invocation.tool_id,
                        action: invocation.action,
                        input: invocation.input
                    });
                    return createStructuredResult({
                        ok: result?.ok !== false, domain: 'atome', operation: request.operation,
                        item: result,
                        reply_text: result?.ok !== false
                            ? (isEnglish(request.source?.locale) ? 'The action has been completed.' : "L'action a ete executee.")
                            : (isEnglish(request.source?.locale) ? 'The action failed.' : "L'action a echoue.")
                    });
                }
                case 'conversation':
                    return createStructuredResult({
                        ok: true, domain: 'conversation', operation: 'reply', executed: false,
                        reply_text: request.draft?.reply_text || ''
                    });
                default:
                    return createStructuredResult({
                        ok: false, domain: request.domain, operation: request.operation,
                        error: 'unknown_domain',
                        reply_text: isEnglish(request.source?.locale)
                            ? 'I do not know how to handle this request.'
                            : 'Je ne sais pas comment traiter cette demande.'
                    });
            }
        }
    };
};