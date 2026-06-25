// Extracted from tool_router.js: calendar reply builder + the calendar voice-request handler.
import { createStructuredResult } from './semantic_contract.js';
import {
    EFFECTFUL_VOICE_OPERATIONS, cloneValue, executeConnectorCall, isEnglish, isOfflineLikeFailure,
    queueOfflineMutationResult, requireVoiceMutationSecurity
} from './tool_router_shared.js';

const buildCalendarReply = (items, locale) => {
    const en = isEnglish(locale);
    const labels = items.map((e) => String(e?.title || e?.summary || e?.name || '').trim()).filter(Boolean).slice(0, 3);
    if (!items.length) {
        return en ? 'I do not see any calendar event right now.' : 'Je ne vois pas de rendez-vous pour le moment.';
    }
    return en
        ? `You have ${items.length} calendar event(s): ${labels.join(', ')}.`
        : `Tu as ${items.length} rendez-vous : ${labels.join(', ')}.`;
};


const executeCalendarRequest = async (request, connectors, workingMemory, {
    offlineQueue = null,
    allowQueue = true
} = {}) => {
    const calendarApi = connectors.calendar;
    if (!calendarApi) {
        return createStructuredResult({
            ok: false, domain: 'calendar', operation: request.operation,
            error: 'calendar_connector_unavailable',
            reply_text: isEnglish(request.source?.locale)
                ? 'I do not have access to your calendar here yet.'
                : "Je n'ai pas encore acces a ton calendrier ici."
        });
    }

    const locale = request.source?.locale || 'fr-FR';
    const queryText = request.filters?.query_text || '';
    const limit = request.filters?.limit || 10;
    const temporalRef = request.filters?.temporal_ref || '';
    let mutationOptions = {};
    if (EFFECTFUL_VOICE_OPERATIONS.has(String(request.operation || '').trim().toLowerCase())) {
        const security = requireVoiceMutationSecurity(request, 'calendar', request.operation);
        if (security.ok !== true) return security;
        request = security.request;
        mutationOptions = security.options;
    }

    if (typeof calendarApi.syncPull === 'function') {
        try { await calendarApi.syncPull({}); } catch (_) { /* keep going */ }
    }

    switch (request.operation) {
        case 'list':
        case 'search': {
            let result = null;
            if (queryText && typeof calendarApi.search === 'function') {
                result = await calendarApi.search(queryText, { limit });
            } else if (temporalRef === 'today' && typeof calendarApi.today === 'function') {
                result = await calendarApi.today({ limit });
            } else if (typeof calendarApi.next === 'function') {
                result = await calendarApi.next({ limit });
            }
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('calendar', items, 'id');
                workingMemory.setLastOperation('calendar', queryText ? 'search' : 'list');
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'calendar', operation: queryText ? 'search' : 'list',
                items,
                reply_text: buildCalendarReply(items, locale)
            });
        }

        case 'read': {
            let targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('calendar') : null);
            if (!targetId && queryText && typeof calendarApi.search === 'function') {
                const lookup = await calendarApi.search(queryText, { limit: 5 });
                const matched = Array.isArray(lookup?.items) ? lookup.items[0] : null;
                targetId = matched?.id || matched?.event_id || '';
                if (matched && workingMemory && targetId) {
                    workingMemory.setCurrentItem('calendar', targetId, matched);
                }
            }
            if (!targetId || typeof calendarApi.read !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'read', error: 'calendar_event_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which event to read.' : 'Je ne sais pas quel evenement lire.'
                });
            }
            const result = await calendarApi.read(targetId, {});
            if (result?.ok === true && result.event) {
                if (workingMemory) {
                    workingMemory.setCurrentItem('calendar', targetId, result.event);
                    workingMemory.setLastOperation('calendar', 'read');
                }
                const label = String(result.event?.title || result.event?.summary || '').trim();
                return createStructuredResult({
                    ok: true, domain: 'calendar', operation: 'read',
                    item: result.event,
                    reply_text: label
                        ? (isEnglish(locale) ? `Calendar event: ${label}.` : `Rendez-vous : ${label}.`)
                        : buildCalendarReply([result.event], locale)
                });
            }
            return createStructuredResult({
                ok: false, domain: 'calendar', operation: 'read', error: 'calendar_event_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that event.' : 'Je ne trouve pas cet evenement.'
            });
        }

        case 'create': {
            if (typeof calendarApi.create !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'create', error: 'calendar_create_unavailable',
                    reply_text: isEnglish(locale) ? 'Event creation is not available yet.' : "La creation d'evenement n'est pas encore disponible."
                });
            }
            const requestPayload = request?.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)
                ? { ...request.payload }
                : {};
            const draftPayload = request?.draft && typeof request.draft === 'object' && !Array.isArray(request.draft)
                ? { ...request.draft }
                : {};
            const payload = Object.keys(requestPayload).length ? requestPayload : draftPayload;
            const result = await executeConnectorCall(() => calendarApi.create(payload, {
                ...(request.payload || request.draft || {}),
                ...mutationOptions
            }), 'calendar_create_failed');
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        payload
                    },
                    domain: 'calendar',
                    operation: 'create',
                    locale,
                    item: result?.event || null
                });
            }
            if (workingMemory) workingMemory.setLastOperation('calendar', 'create');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'calendar', operation: 'create',
                item: result?.event || null,
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The event has been created.' : 'Le rendez-vous a ete cree.')
                    : (isEnglish(locale) ? 'I could not create the event.' : "Je n'ai pas pu creer le rendez-vous.")
            });
        }

        case 'update': {
            const targetId = request.target?.id
                || request.payload?.event_id
                || request.payload?.eventId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('calendar') : null);
            if (!targetId || typeof calendarApi.update !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'update', error: 'calendar_event_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which event to update.' : 'Je ne sais pas quel rendez-vous mettre a jour.'
                });
            }
            const changes = request?.payload && typeof request.payload === 'object' && !Array.isArray(request.payload)
                ? { ...request.payload }
                : {};
            delete changes.event_id;
            delete changes.eventId;
            delete changes.id;
            if (!Object.keys(changes).length) {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'update', error: 'calendar_update_payload_missing',
                    reply_text: isEnglish(locale)
                        ? 'I need at least one change to update the event.'
                        : "J'ai besoin d'au moins une modification pour mettre a jour le rendez-vous."
                });
            }
            const result = await executeConnectorCall(() => calendarApi.update(targetId, changes, {
                ...(request.payload || {}),
                ...mutationOptions
            }), 'calendar_update_failed');
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        target: {
                            ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                            id: targetId
                        },
                        payload: changes
                    },
                    domain: 'calendar',
                    operation: 'update',
                    locale,
                    item: result?.event || null
                });
            }
            if (result?.ok === true && workingMemory) {
                workingMemory.setLastOperation('calendar', 'update');
                if (result?.event) {
                    workingMemory.setCurrentItem('calendar', result.event.id || targetId, result.event);
                }
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'calendar',
                operation: 'update',
                item: result?.event || null,
                error: result?.ok === false ? (result?.error || 'calendar_update_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The event has been updated.' : 'Le rendez-vous a ete mis a jour.')
                    : (isEnglish(locale) ? 'I could not update the event.' : "Je n'ai pas pu mettre a jour le rendez-vous.")
            });
        }

        case 'delete': {
            const targetId = request.target?.id
                || request.payload?.event_id
                || request.payload?.eventId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('calendar') : null);
            if (!targetId || typeof calendarApi.delete !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'calendar', operation: 'delete', error: 'calendar_event_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which event to delete.' : 'Je ne sais pas quel rendez-vous supprimer.'
                });
            }
            const result = await executeConnectorCall(() => calendarApi.delete(targetId, {
                ...(request.payload || {}),
                ...mutationOptions
            }), 'calendar_delete_failed');
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        target: {
                            ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                            id: targetId
                        }
                    },
                    domain: 'calendar',
                    operation: 'delete',
                    locale
                });
            }
            if (result?.ok === true && workingMemory) {
                workingMemory.removeFromResultSet('calendar', targetId);
                workingMemory.setLastOperation('calendar', 'delete');
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'calendar',
                operation: 'delete',
                error: result?.ok === false ? (result?.error || 'calendar_delete_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The event has been deleted.' : 'Le rendez-vous a ete supprime.')
                    : (isEnglish(locale) ? 'I could not delete the event.' : "Je n'ai pas pu supprimer le rendez-vous.")
            });
        }

        default:
            return createStructuredResult({
                ok: false, domain: 'calendar', operation: request.operation,
                error: 'unsupported_calendar_operation',
                reply_text: isEnglish(locale) ? 'This calendar action is not available yet.' : "Cette action calendrier n'est pas encore disponible."
            });
    }
};


export { buildCalendarReply, executeCalendarRequest };
