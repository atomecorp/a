// Extracted from tool_router.js: read-side mail/communication operations
// (list, read, summarize, search, mark_read, mark_unread). Receives the executeMailRequest context.
import { createStructuredResult } from './semantic_contract.js';
import { isEnglish } from './tool_router_shared.js';
import {
    buildMailListReply, buildMailReadReply, buildCommunicationListReply, buildCommunicationReadReply,
    formatSubjectLabel, loadCommunicationList, normalizeCommunicationItem, parseCommunicationItemId
} from './tool_router_mail_helpers.js';
import { computeTrustScore, buildTrustWarning } from './mail_trust_scoring.js';

export const executeMailOpsA = async (ctx) => {
    const { mailApi, messagesApi, locale, filters, requestedSurfaces, baseOpts, hasMessagesSurface, request, workingMemory } = ctx;
    switch (request.operation) {
        case 'list': {
            if (hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText: '',
                    baseOpts,
                });
                if (workingMemory) {
                    workingMemory.setResultSet('mail', items, 'message_id');
                    workingMemory.setFilters('mail', { ...filters, communication_surfaces: requestedSurfaces });
                    workingMemory.setOrder('mail', filters.order || null);
                    workingMemory.setLastOperation('mail', 'list');
                    const firstItem = items[0] || null;
                    const firstId = firstItem?.message_id || firstItem?.id || null;
                    if (firstItem && firstId) {
                        workingMemory.setCurrentItem('mail', firstId, firstItem);
                    }
                }
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'list',
                    items,
                    reply_text: buildCommunicationListReply(items, request, locale)
                });
            }
            const result = typeof mailApi.list === 'function' ? mailApi.list(baseOpts) : { ok: false, items: [] };
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('mail', items, 'message_id');
                workingMemory.setFilters('mail', filters);
                workingMemory.setOrder('mail', filters.order || null);
                workingMemory.setLastOperation('mail', 'list');
                const firstItem = items[0] || null;
                const firstId = firstItem?.message_id || firstItem?.id || null;
                if (firstItem && firstId) {
                    workingMemory.setCurrentItem('mail', firstId, firstItem);
                }
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'list',
                items, stats: result?.stats || {},
                reply_text: buildMailListReply(items, request)
            });
        }

        case 'read': {
            let targetId = request.target?.id || null;
            const currentMemoryItem = workingMemory ? workingMemory.getCurrentItem('mail') : null;

            if (!targetId && hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText: filters.query_text || '',
                    baseOpts: { ...baseOpts, limit: 1 },
                });
                if (items.length > 0) targetId = items[0].message_id;
            } else if (!targetId && typeof mailApi.list === 'function') {
                const lookupResult = mailApi.list({ ...baseOpts, limit: 1 });
                const lookupItems = Array.isArray(lookupResult?.items) ? lookupResult.items : [];
                if (lookupItems.length > 0) {
                    targetId = lookupItems[0].message_id;
                }
            }

            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
            }

            const targetInfo = parseCommunicationItemId(targetId);
            if (targetInfo.surface === 'messages' && messagesApi) {
                const readResult = typeof messagesApi.read === 'function'
                    ? await messagesApi.read(targetInfo.source_id)
                    : { ok: currentMemoryItem?.comm_surface === 'messages', item: currentMemoryItem };
                const readItem = readResult?.item || readResult?.message || currentMemoryItem || null;
                if (readResult?.ok === true && readItem) {
                    const normalizedItem = normalizeCommunicationItem(readItem, 'messages');
                    const readTrust = computeTrustScore(normalizedItem);
                    if (workingMemory) {
                        workingMemory.setCurrentItem('mail', normalizedItem.message_id, normalizedItem);
                        workingMemory.setLastOperation('mail', 'read');
                    }
                    const readWarning = readTrust.level !== 'trusted' ? buildTrustWarning(readTrust, locale) : '';
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'read',
                        item: normalizedItem,
                        trust_score: readTrust.score,
                        trust_level: readTrust.level,
                        trust_signals: readTrust.signals,
                        reply_text: buildCommunicationReadReply(normalizedItem, locale, request)
                            + (readWarning ? '\n\n' + readWarning : '')
                    });
                }
            }

            if (!targetId || typeof mailApi.read !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'read', error: 'mail_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which mail to read right now.' : 'Je ne vois pas quel mail lire pour le moment.'
                });
            }
            const result = mailApi.read(targetId);
            if (result?.ok === true && result.item) {
                if (typeof mailApi.markRead === 'function') {
                    await mailApi.markRead(targetId, { read: true });
                }
                const mailReadTrust = computeTrustScore(result.item);
                if (workingMemory) {
                    workingMemory.setCurrentItem('mail', targetId, result.item);
                    workingMemory.setLastOperation('mail', 'read');
                }
                const mailReadWarning = mailReadTrust.level !== 'trusted' ? buildTrustWarning(mailReadTrust, locale) : '';
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'read',
                    item: result.item,
                    trust_score: mailReadTrust.score,
                    trust_level: mailReadTrust.level,
                    trust_signals: mailReadTrust.signals,
                    reply_text: buildMailReadReply(result.item, locale, request)
                        + (mailReadWarning ? '\n\n' + mailReadWarning : '')
                });
            }
            return createStructuredResult({
                ok: false, domain: 'mail', operation: 'read', error: 'mail_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that mail.' : 'Je ne trouve pas ce mail.'
            });
        }

        case 'summarize': {
            let targetId = request.target?.id || null;

            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
            }

            if (!targetId && hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText: filters.query_text || '',
                    baseOpts: { ...baseOpts, limit: 5 },
                });
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'summarize',
                    items,
                    reply_text: buildCommunicationListReply(items, request, locale)
                });
            }
            if (!targetId && typeof mailApi.list === 'function') {
                const lookupResult = mailApi.list({ ...baseOpts, limit: 1 });
                const lookupItems = Array.isArray(lookupResult?.items) ? lookupResult.items : [];
                if (lookupItems.length > 0) {
                    targetId = lookupItems[0].message_id;
                }
            }

            if (targetId && typeof mailApi.read === 'function') {
                const result = mailApi.read(targetId);
                if (result?.ok === true && result.item) {
                    if (workingMemory) {
                        workingMemory.setCurrentItem('mail', targetId, result.item);
                        workingMemory.setLastOperation('mail', 'summarize');
                    }
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'summarize',
                        item: result.item,
                        reply_text: buildMailReadReply(result.item, locale, request)
                    });
                }
            }
            const listResult = typeof mailApi.list === 'function' ? mailApi.list({ ...baseOpts, limit: 5 }) : { ok: false, items: [] };
            const items = Array.isArray(listResult?.items) ? listResult.items : [];
            return createStructuredResult({
                ok: listResult?.ok !== false, domain: 'mail', operation: 'summarize',
                items, stats: listResult?.stats || {},
                reply_text: buildMailListReply(items, request)
            });
        }

        case 'mark_read': {
            const targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('mail') : null);
            if (!targetId || typeof mailApi.markRead !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'mark_read', error: 'mail_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which mail to update.' : 'Je ne vois pas quel mail mettre a jour.'
                });
            }
            const result = await mailApi.markRead(targetId, { read: true });
            if (workingMemory) workingMemory.setLastOperation('mail', 'mark_read');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'mark_read',
                reply_text: isEnglish(locale) ? 'The mail has been marked as read.' : 'Le mail a ete marque comme lu.'
            });
        }

        case 'mark_unread': {
            const targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('mail') : null);
            if (!targetId || typeof mailApi.markRead !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'mark_unread', error: 'mail_not_found',
                    reply_text: isEnglish(locale) ? 'I do not see which mail to update.' : 'Je ne vois pas quel mail mettre a jour.'
                });
            }
            const result = await mailApi.markRead(targetId, { read: false });
            if (workingMemory) workingMemory.setLastOperation('mail', 'mark_unread');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'mark_unread',
                reply_text: isEnglish(locale) ? 'The mail has been marked as unread.' : 'Le mail a ete marque comme non lu.'
            });
        }

        case 'search': {
            const queryText = filters.query_text;
            if (!queryText || typeof mailApi.search !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'search', error: 'mail_search_query_missing',
                    reply_text: isEnglish(locale) ? 'What should I search for in your mails?' : 'Que veux-tu que je cherche dans tes mails ?'
                });
            }
            if (hasMessagesSurface) {
                const items = await loadCommunicationList({
                    request,
                    mailApi,
                    messagesApi,
                    queryText,
                    baseOpts,
                });
                if (workingMemory) {
                    workingMemory.setResultSet('mail', items, 'message_id');
                    workingMemory.setFilters('mail', { ...filters, query_text: queryText, communication_surfaces: requestedSurfaces });
                    workingMemory.setLastOperation('mail', 'search');
                }
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'search',
                    items,
                    reply_text: buildCommunicationListReply(items, request, locale)
                });
            }
            const result = mailApi.search(queryText, baseOpts);
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('mail', items, 'message_id');
                workingMemory.setFilters('mail', { ...filters, query_text: queryText });
                workingMemory.setLastOperation('mail', 'search');
            }
            const subjects = items.slice(0, 3).map(formatSubjectLabel).filter(Boolean);
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'search',
                items,
                reply_text: subjects.length
                    ? (isEnglish(locale)
                        ? `I found these mails for "${queryText}": ${subjects.join(', ')}.`
                        : `J'ai trouve ces mails pour "${queryText}" : ${subjects.join(', ')}.`)
                    : (isEnglish(locale)
                        ? `I did not find any mail for "${queryText}".`
                        : `Je n'ai trouve aucun mail pour "${queryText}".`)
            });
        }

        default:
            return createStructuredResult({
                ok: false, domain: 'mail', operation: request.operation,
                error: 'unsupported_mail_operation',
                reply_text: isEnglish(locale) ? 'I do not know this mail action.' : 'Je ne connais pas cette action mail.'
            });
    }
};
