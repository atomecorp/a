// Extracted from tool_router.js: the contacts voice-request handler (list/get/create/update/delete).
import { createStructuredResult } from './semantic_contract.js';
import { buildContactQueryReply, buildContactsFieldReply } from './contact_reply.js';
import {
    EFFECTFUL_VOICE_OPERATIONS, cloneValue, executeConnectorCall, isEnglish, isOfflineLikeFailure,
    queueOfflineMutationResult, requireVoiceMutationSecurity
} from './tool_router_shared.js';
import {
    buildContactsReply, normalizePhoneForContactCreate, extractContactCreatePayload, extractContactUpdatePayload,
    normalizeContactComparable, contactMatchesMutationPayload, findExistingContactForMutation
} from './tool_router_contacts_model.js';

const executeContactsRequest = async (request, connectors, workingMemory, {
    offlineQueue = null,
    allowQueue = true
} = {}) => {
    const contactsApi = connectors.contacts;
    if (!contactsApi) {
        return createStructuredResult({
            ok: false, domain: 'contacts', operation: request.operation,
            error: 'contacts_connector_unavailable',
            reply_text: isEnglish(request.source?.locale)
                ? 'I do not have access to your contacts here yet.'
                : "Je n'ai pas encore acces a tes contacts ici."
        });
    }

    const locale = request.source?.locale || 'fr-FR';
    const queryText = request.filters?.query_text || '';
    const limit = request.filters?.limit || 10;
    let mutationOptions = {};
    if (EFFECTFUL_VOICE_OPERATIONS.has(String(request.operation || '').trim().toLowerCase())) {
        const security = requireVoiceMutationSecurity(request, 'contacts', request.operation);
        if (security.ok !== true) return security;
        request = security.request;
        mutationOptions = security.options;
    }

    if (typeof contactsApi.syncPull === 'function') {
        try { await contactsApi.syncPull({ limit: 100 }); } catch (_) { /* keep going */ }
    }

    switch (request.operation) {
        case 'list':
        case 'search': {
            const result = queryText && typeof contactsApi.search === 'function'
                ? await contactsApi.search(queryText, { limit })
                : (typeof contactsApi.list === 'function' ? await contactsApi.list({ limit }) : { ok: false, items: [] });
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('contacts', items, 'source_contact_id');
                const firstItem = items[0] || null;
                const firstId = firstItem?.source_contact_id || firstItem?.id || null;
                if (firstItem && firstId) {
                    workingMemory.setCurrentItem('contacts', firstId, firstItem);
                }
                workingMemory.setLastOperation('contacts', queryText ? 'search' : 'list');
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'contacts', operation: queryText ? 'search' : 'list',
                items,
                reply_text: (
                    items.length >= 1
                        ? buildContactsFieldReply(items, {
                            locale,
                            contact_field: request.contact_field || null,
                            utteranceRaw: request.source?.utterance_raw || '',
                            utteranceNormalized: request.source?.utterance_normalized || ''
                        })
                        : ''
                ) || buildContactsReply(items, locale)
            });
        }

        case 'read': {
            let targetId = request.target?.id || null;
            const currentResultSet = workingMemory ? workingMemory.getResultSetItems('contacts') : [];
            if (
                !targetId
                && Array.isArray(currentResultSet)
                && currentResultSet.length > 1
            ) {
                const multiFieldReply = buildContactsFieldReply(currentResultSet, {
                    locale,
                    contact_field: request.contact_field || null,
                    utteranceRaw: request.source?.utterance_raw || '',
                    utteranceNormalized: request.source?.utterance_normalized || ''
                });
                if (multiFieldReply) {
                    return createStructuredResult({
                        ok: true,
                        domain: 'contacts',
                        operation: 'read',
                        items: currentResultSet,
                        reply_text: multiFieldReply
                    });
                }
            }
            if (!targetId && queryText && typeof contactsApi.search === 'function') {
                const lookup = await contactsApi.search(queryText, { limit: 5 });
                const matched = Array.isArray(lookup?.items) ? lookup.items[0] : null;
                targetId = matched?.source_contact_id || matched?.id || '';
                if (matched && workingMemory && typeof workingMemory.setCurrentItem === 'function' && targetId) {
                    workingMemory.setCurrentItem('contacts', targetId, matched);
                }
            }
            if (!targetId && workingMemory && !queryText) {
                targetId = workingMemory.getCurrentItemId('contacts');
            }
            if (!targetId || typeof contactsApi.read !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'read', error: 'contacts_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which contact to read.' : 'Je ne sais pas quel contact lire.'
                });
            }
            const result = await contactsApi.read(targetId);
            if (result?.ok === true && result.contact) {
                if (workingMemory && typeof workingMemory.setCurrentItem === 'function') {
                    workingMemory.setCurrentItem('contacts', targetId, result.contact);
                }
                if (workingMemory && typeof workingMemory.setLastOperation === 'function') {
                    workingMemory.setLastOperation('contacts', 'read');
                }
                const label = String(result.contact?.name || result.contact?.display_name || result.contact?.email || '').trim();
                return createStructuredResult({
                    ok: true, domain: 'contacts', operation: 'read',
                    item: result.contact,
                    reply_text: buildContactQueryReply(result.contact, {
                        locale,
                        contact_field: request.contact_field || null,
                        utteranceRaw: request.source?.utterance_raw || '',
                        utteranceNormalized: request.source?.utterance_normalized || ''
                    }) || (label ? `Contact: ${label}.` : buildContactsReply([result.contact], locale))
                });
            }
            return createStructuredResult({
                ok: false, domain: 'contacts', operation: 'read', error: 'contacts_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that contact.' : 'Je ne trouve pas ce contact.'
            });
        }

        case 'create': {
            const payload = extractContactCreatePayload(request);
            if (!payload.name && !payload.phone) {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'create', error: 'contacts_create_payload_missing',
                    reply_text: isEnglish(locale)
                        ? 'I need at least a name or a phone number to create the contact.'
                        : "J'ai besoin d'un nom ou d'un numero pour creer le contact."
                });
            }
            const existingContact = await findExistingContactForMutation(contactsApi, payload);
            if (existingContact && typeof contactsApi.updateLocalContact === 'function') {
                const targetId = existingContact.source_contact_id || existingContact.id || '';
                const changes = { ...payload };
                delete changes.source_contact_id;
                delete changes.id;
                delete changes.query;
                delete changes.query_text;
                const updated = await executeConnectorCall(() => contactsApi.updateLocalContact(targetId, changes, {
                    source: 'voice',
                    ...mutationOptions
                }), 'contacts_update_failed');
                const updatedContact = updated?.contact || existingContact;
                if (allowQueue && offlineQueue && isOfflineLikeFailure(updated)) {
                    return queueOfflineMutationResult({
                        offlineQueue,
                        request: {
                            ...cloneValue(request),
                            operation: 'update',
                            target: {
                                ...(request.target && typeof request.target === 'object' ? cloneValue(request.target) : {}),
                                id: targetId
                            },
                            payload: changes
                        },
                        domain: 'contacts',
                        operation: 'update',
                        locale,
                        item: updatedContact
                    });
                }
                if (workingMemory && targetId) {
                    workingMemory.setCurrentItem('contacts', targetId, updatedContact);
                    workingMemory.setLastOperation('contacts', 'update');
                }
                return createStructuredResult({
                    ok: updated?.ok !== false,
                    domain: 'contacts',
                    operation: 'update',
                    item: updatedContact,
                    reply_text: updated?.ok !== false
                        ? (isEnglish(locale) ? 'The contact has been updated.' : 'Le contact a ete mis a jour.')
                        : (isEnglish(locale) ? 'I could not update the contact.' : "Je n'ai pas pu mettre a jour le contact.")
                });
            }
            if (typeof contactsApi.createLocalContact !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'create', error: 'contacts_create_unavailable',
                    reply_text: isEnglish(locale) ? 'Contact creation is not available yet.' : "La creation de contact n'est pas encore disponible."
                });
            }
            const result = await executeConnectorCall(() => contactsApi.createLocalContact(payload, {
                source: 'voice',
                ...mutationOptions
            }), 'contacts_create_failed');
            const createdContact = result?.contact || (Array.isArray(result?.items) ? result.items[0] : null) || null;
            if (allowQueue && offlineQueue && isOfflineLikeFailure(result)) {
                return queueOfflineMutationResult({
                    offlineQueue,
                    request: {
                        ...cloneValue(request),
                        payload
                    },
                    domain: 'contacts',
                    operation: 'create',
                    locale,
                    item: createdContact
                });
            }
            if (result?.ok === true && createdContact && workingMemory) {
                const contactId = createdContact.source_contact_id || createdContact.id || null;
                if (contactId) {
                    workingMemory.setCurrentItem('contacts', contactId, createdContact);
                    workingMemory.setLastOperation('contacts', 'create');
                }
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'contacts', operation: 'create',
                item: createdContact,
                reply_text: result?.ok !== false
                    ? (isEnglish(locale)
                        ? `The contact ${String(createdContact?.name || payload.name || payload.phone || '').trim()} has been created.`
                        : `Le contact ${String(createdContact?.name || payload.name || payload.phone || '').trim()} a ete cree.`)
                    : (isEnglish(locale) ? 'I could not create the contact.' : "Je n'ai pas pu creer le contact.")
            });
        }

        case 'update': {
            let targetId = request.target?.id
                || request.payload?.contact_id
                || request.payload?.contactId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('contacts') : null);
            const queryTarget = String(
                request.filters?.query_text
                || request.payload?.query_text
                || request.payload?.query
                || ''
            ).trim();
            if (!targetId && queryTarget && typeof contactsApi.search === 'function') {
                const lookup = await contactsApi.search(queryTarget, { limit: 5 });
                const matched = Array.isArray(lookup?.items) ? lookup.items[0] : null;
                targetId = matched?.source_contact_id || matched?.id || '';
                if (matched && workingMemory) {
                    workingMemory.setCurrentItem('contacts', targetId, matched);
                }
            }
            if (!targetId || typeof contactsApi.updateLocalContact !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'update', error: 'contacts_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which contact to update.' : 'Je ne sais pas quel contact mettre a jour.'
                });
            }
            const changes = extractContactUpdatePayload(request);
            if (!Object.keys(changes).length) {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'update', error: 'contacts_update_payload_missing',
                    reply_text: isEnglish(locale)
                        ? 'I need at least one change to update the contact.'
                        : "J'ai besoin d'au moins une modification pour mettre a jour le contact."
                });
            }
            const result = await executeConnectorCall(() => contactsApi.updateLocalContact(targetId, changes, {
                source: 'voice',
                ...mutationOptions
            }), 'contacts_update_failed');
            const updatedContact = result?.contact || null;
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
                    domain: 'contacts',
                    operation: 'update',
                    locale,
                    item: updatedContact
                });
            }
            if (result?.ok === true && updatedContact && workingMemory) {
                const contactId = updatedContact.source_contact_id || updatedContact.id || targetId;
                workingMemory.setCurrentItem('contacts', contactId, updatedContact);
                workingMemory.setLastOperation('contacts', 'update');
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'contacts',
                operation: 'update',
                item: updatedContact,
                error: result?.ok === false ? (result?.error || 'contacts_update_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The contact has been updated.' : 'Le contact a ete mis a jour.')
                    : (isEnglish(locale) ? 'I could not update the contact.' : "Je n'ai pas pu mettre a jour le contact.")
            });
        }

        case 'delete': {
            const targetId = request.target?.id
                || request.payload?.contact_id
                || request.payload?.contactId
                || request.payload?.id
                || (workingMemory ? workingMemory.getCurrentItemId('contacts') : null);
            if (!targetId || typeof contactsApi.deleteLocalContact !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'delete', error: 'contacts_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which contact to delete.' : 'Je ne sais pas quel contact supprimer.'
                });
            }
            const result = await executeConnectorCall(() => contactsApi.deleteLocalContact(targetId, {
                source: 'voice',
                ...mutationOptions
            }), 'contacts_delete_failed');
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
                    domain: 'contacts',
                    operation: 'delete',
                    locale
                });
            }
            if (result?.ok === true && workingMemory) {
                workingMemory.removeFromResultSet('contacts', targetId);
                workingMemory.setLastOperation('contacts', 'delete');
            }
            return createStructuredResult({
                ok: result?.ok !== false,
                domain: 'contacts',
                operation: 'delete',
                error: result?.ok === false ? (result?.error || 'contacts_delete_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The contact has been deleted.' : 'Le contact a ete supprime.')
                    : (isEnglish(locale) ? 'I could not delete the contact.' : "Je n'ai pas pu supprimer le contact.")
            });
        }

        default:
            return createStructuredResult({
                ok: false, domain: 'contacts', operation: request.operation,
                error: 'unsupported_contacts_operation',
                reply_text: isEnglish(locale) ? 'This contacts action is not available yet.' : "Cette action contacts n'est pas encore disponible."
            });
    }
};


export { executeContactsRequest };
