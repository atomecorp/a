/**
 * Unified tool router for all business domain execution.
 *
 * This module is the single execution path between the LLM/voice layer
 * and the business connectors (mail, contacts, calendar, atome).
 *
 * The flow is always:
 * 1. Understand (LLM / heuristic) -> StructuredRequest
 * 2. Route (this module) -> domain connector
 * 3. Execute -> StructuredResult
 * 4. Speak back based on real result
 *
 * No business logic leaks into the orchestrator.
 * No connector calls happen outside this router.
 */

import {
    createStructuredResult,
    SEMANTIC_DOMAINS
} from './semantic_contract.js';

// ---------------------------------------------------------------------------
// Reply builders (locale-aware, result-based)
// ---------------------------------------------------------------------------

const isEnglish = (locale) => String(locale || '').toLowerCase().startsWith('en');

const formatSenderLabel = (item) => String(
    item?.from?.name || item?.from?.address || ''
).trim();

const formatSubjectLabel = (item) => {
    const subject = String(item?.subject || '').trim();
    if (subject && !/^[\s?._\uFFFD-]+$/.test(subject) && !/^=\?[^?]+\?[bqBQ]\?/.test(subject)) {
        return subject;
    }
    return String(item?.preview || item?.body_text || '').trim().slice(0, 80) || '';
};

// Strip MIME boundaries, embedded headers, long numeric IDs, and non-human content from text
// so the voice assistant speaks clean readable content.
const sanitizeBodyForSpeech = (raw) => {
    let text = String(raw || '').trim();
    if (!text) return '';
    // Remove MIME boundaries (--boundary...)
    text = text.replace(/--[\w:.+=-]{10,}[\s\S]*?(?=\n[^-]|$)/g, '');
    // Remove embedded MIME headers (Content-Type:, Content-Transfer-Encoding:, etc.)
    text = text.replace(/^(Content-[\w-]+|MIME-Version|Message-Id|Date|From|To|Cc|Bcc|Subject|In-Reply-To|References|Return-Path|Received|X-[\w-]+)\s*:.*$/gim, '');
    // Remove long numeric sequences (timestamps, IDs > 8 digits) that are meaningless in speech
    text = text.replace(/\b\d{9,}\b/g, '');
    // Remove email-style angle bracket addresses
    text = text.replace(/<[^>@]+@[^>]+>/g, '');
    // Collapse whitespace
    text = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return text;
};

const buildMailListReply = (items, request, stats = {}) => {
    const locale = request.source?.locale || 'fr-FR';
    const en = isEnglish(locale);
    const unread = request.filters?.read_state === 'unread';
    const order = String(request.filters?.order || 'newest').toLowerCase();
    const oldest = order === 'oldest';
    const count = items.length;

    if (request.status_only) {
        if (count === 0) {
            return en
                ? (unread ? 'You do not have any unread mail.' : 'You do not have any mail.')
                : (unread ? "Tu n'as pas de mail non lu." : "Tu n'as pas de mail.");
        }
        const subjects = items.slice(0, 3).map(formatSubjectLabel).filter(Boolean);
        const subjectSuffix = subjects.length ? `: ${subjects.join(', ')}.` : '.';
        return en
            ? (unread ? `You have ${count} unread mail(s)${subjectSuffix}` : `You have ${count} mail(s)${subjectSuffix}`)
            : (unread ? `Tu as ${count} mail(s) non lu(s)${subjectSuffix}` : `Tu as ${count} mail(s)${subjectSuffix}`);
    }

    if (count === 0) {
        return en
            ? (unread ? 'I do not see any unread mail right now.' : 'I do not see any mail right now.')
            : (unread ? 'Je ne vois pas de mail non lu pour le moment.' : 'Je ne vois pas de mail pour le moment.');
    }

    // Build "sender: subject" labels to distinguish sender/subject/body clearly
    const formatItemLabel = (item) => {
        const sender = formatSenderLabel(item);
        const subject = formatSubjectLabel(item);
        if (sender && subject) return `${subject} (${en ? 'from' : 'de'} ${sender})`;
        return subject || sender || '';
    };
    const labels = items.slice(0, 3).map(formatItemLabel).filter(Boolean);
    if (en) {
        if (unread) return `Here are the unread mails: ${labels.join(', ')}.`;
        if (oldest) return `Here is the oldest mail: ${labels.join(', ')}.`;
        return `Here are the latest mails: ${labels.join(', ')}.`;
    }
    if (unread) return `Voici les mails non lus : ${labels.join(', ')}.`;
    if (oldest) return `Voici le mail le plus ancien : ${labels.join(', ')}.`;
    return `Voici les derniers mails : ${labels.join(', ')}.`;
};

const buildMailReadReply = (item, locale, request = null) => {
    const en = isEnglish(locale);
    const sender = formatSenderLabel(item) || (en ? 'unknown sender' : 'expediteur inconnu');
    const subject = formatSubjectLabel(item);
    const rawPreview = String(item?.preview || item?.body_text || '').trim();
    const cleanPreview = sanitizeBodyForSpeech(rawPreview);
    const body = cleanPreview.length > 260 ? `${cleanPreview.slice(0, 259).trim()}...` : cleanPreview;

    // Check if user explicitly asked to exclude the subject
    const utterance = String(
        request?.source?.utterance_raw || request?.source?.utterance_normalized || ''
    ).toLowerCase();
    const skipSubject = utterance.includes('pas le sujet')
        || utterance.includes('without the subject')
        || utterance.includes('no subject')
        || utterance.includes('just the body')
        || utterance.includes('juste le corps');

    if (skipSubject) {
        if (en) return body ? `Mail from ${sender}. ${body}` : `Mail from ${sender}, no readable content.`;
        return body ? `Mail de ${sender}. ${body}` : `Mail de ${sender}, pas de contenu lisible.`;
    }
    if (en) {
        return body
            ? `Mail from ${sender}. Subject: ${subject}. ${body}`
            : `Mail from ${sender} about "${subject}".`;
    }
    return body
        ? `Mail de ${sender}. Sujet: ${subject}. ${body}`
        : `Mail de ${sender} concernant "${subject}".`;
};

const buildContactsReply = (items, locale) => {
    const en = isEnglish(locale);
    const labels = items.map((c) => String(c?.name || c?.display_name || c?.email || '').trim()).filter(Boolean).slice(0, 3);
    if (!items.length) {
        return en ? 'I do not see any matching contact right now.' : 'Je ne vois pas de contact correspondant pour le moment.';
    }
    return en
        ? `I found ${items.length} contact(s): ${labels.join(', ')}.`
        : `J'ai trouve ${items.length} contact(s) : ${labels.join(', ')}.`;
};

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

// ---------------------------------------------------------------------------
// Domain executors
// ---------------------------------------------------------------------------

const executeMailRequest = async (request, connectors, workingMemory) => {
    const mailApi = connectors.mail;
    if (!mailApi) {
        return createStructuredResult({
            ok: false, domain: 'mail', operation: request.operation,
            error: 'mail_connector_unavailable',
            reply_text: isEnglish(request.source?.locale)
                ? 'I do not have access to your mail here yet.'
                : "Je n'ai pas encore acces a tes mails ici."
        });
    }

    // Ensure the mail connector is synced before any operation.
    let readyResult = null;
    if (typeof mailApi.ensureReady === 'function') {
        try {
            readyResult = await mailApi.ensureReady({ initial: false, limit: 20 });
        } catch (err) {
            readyResult = { ok: false, error: String(err?.message || err || 'ensureReady_threw') };
        }
        if (globalThis?.console?.log) {
            globalThis.console.log('[tool_router:mail] ensureReady result:', JSON.stringify({
                ok: readyResult?.ok,
                error: readyResult?.error || null,
                itemCount: Array.isArray(readyResult?.items) ? readyResult.items.length : null,
                cached: readyResult?.cached || false
            }));
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
            // Any other sync failure — report the actual error instead of proceeding with empty index.
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

    // Diagnostic: compare unfiltered vs filtered list
    if (globalThis?.console?.log) {
        const unfilteredResult = typeof mailApi.list === 'function' ? mailApi.list({}) : null;
        const filteredResult = typeof mailApi.list === 'function' ? mailApi.list(baseOpts) : null;
        const connStatus = typeof mailApi.connectorStatus === 'function' ? mailApi.connectorStatus() : null;
        globalThis.console.log('[tool_router:mail] pre-switch diagnostic:', JSON.stringify({
            operation: request.operation,
            baseOpts,
            unfilteredCount: Array.isArray(unfilteredResult?.items) ? unfilteredResult.items.length : null,
            filteredCount: Array.isArray(filteredResult?.items) ? filteredResult.items.length : null,
            connectorConfigured: connStatus?.configured ?? null,
            indexStats: unfilteredResult?.stats || null
        }));
    }

    switch (request.operation) {
        case 'list': {
            const result = typeof mailApi.list === 'function' ? mailApi.list(baseOpts) : { ok: false, items: [] };
            const items = Array.isArray(result?.items) ? result.items : [];
            if (workingMemory) {
                workingMemory.setResultSet('mail', items, 'message_id');
                workingMemory.setFilters('mail', filters);
                workingMemory.setOrder('mail', filters.order || 'newest');
                workingMemory.setLastOperation('mail', 'list');
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'list',
                items, stats: result?.stats || {},
                reply_text: buildMailListReply(items, request, result?.stats)
            });
        }

        case 'read': {
            let targetId = request.target?.id || null;

            // If no explicit target but we have an order or filters, find the right mail first.
            // This prevents reading a stale working-memory item from a previous query.
            if (!targetId && typeof mailApi.list === 'function') {
                const lookupResult = mailApi.list({ ...baseOpts, limit: 1 });
                const lookupItems = Array.isArray(lookupResult?.items) ? lookupResult.items : [];
                if (lookupItems.length > 0) {
                    targetId = lookupItems[0].message_id;
                }
            }

            // Fall back to working memory only when no order-based lookup produced a result
            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
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
                if (workingMemory) {
                    workingMemory.setCurrentItem('mail', targetId, result.item);
                    workingMemory.setLastOperation('mail', 'read');
                }
                return createStructuredResult({
                    ok: true, domain: 'mail', operation: 'read',
                    item: result.item,
                    reply_text: buildMailReadReply(result.item, locale, request)
                });
            }
            return createStructuredResult({
                ok: false, domain: 'mail', operation: 'read', error: 'mail_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that mail.' : 'Je ne trouve pas ce mail.'
            });
        }

        case 'summarize': {
            let targetId = request.target?.id || null;

            // Find the right mail based on current order/filters, not stale working memory.
            if (!targetId && typeof mailApi.list === 'function') {
                const lookupResult = mailApi.list({ ...baseOpts, limit: 1 });
                const lookupItems = Array.isArray(lookupResult?.items) ? lookupResult.items : [];
                if (lookupItems.length > 0) {
                    targetId = lookupItems[0].message_id;
                }
            }

            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
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
            // Summarize the list if no specific target
            const listResult = typeof mailApi.list === 'function' ? mailApi.list({ ...baseOpts, limit: 5 }) : { ok: false, items: [] };
            const items = Array.isArray(listResult?.items) ? listResult.items : [];
            return createStructuredResult({
                ok: listResult?.ok !== false, domain: 'mail', operation: 'summarize',
                items, stats: listResult?.stats || {},
                reply_text: buildMailListReply(items, request, listResult?.stats)
            });
        }

        case 'reply': {
            const draftText = request.draft?.reply_text;
            if (!draftText) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply', error: 'mail_reply_text_missing',
                    reply_text: isEnglish(locale) ? 'What should I reply to this mail?' : 'Que veux-tu que je reponde a ce mail ?'
                });
            }
            let targetId = request.target?.id || null;

            // Search by reply_target (sender name/address) when no explicit message ID
            const replyTarget = String(request.draft?.reply_target || '').trim().toLowerCase();
            if (!targetId && replyTarget && typeof mailApi.list === 'function') {
                const candidates = mailApi.list({ ...baseOpts, limit: 30 });
                const items = Array.isArray(candidates?.items) ? candidates.items : [];
                const match = items.find((item) => {
                    const senderName = String(item?.from?.name || '').trim().toLowerCase();
                    const senderAddr = String(item?.from?.address || '').trim().toLowerCase();
                    return (senderName && (senderName.includes(replyTarget) || replyTarget.includes(senderName)))
                        || (senderAddr && senderAddr.includes(replyTarget));
                });
                if (match?.message_id) targetId = match.message_id;
            }

            // Fall back to working memory (last viewed mail)
            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
            }

            if (!targetId || typeof mailApi.replyDraft !== 'function') {
                const en = isEnglish(locale);
                const msg = replyTarget
                    ? (en ? `I do not see any mail from ${replyTarget} to reply to.` : `Je ne trouve pas de mail de ${replyTarget} pour y repondre.`)
                    : (en ? 'I do not see which mail to reply to.' : 'Je ne vois pas a quel mail repondre.');
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply', error: 'mail_not_found',
                    reply_text: msg
                });
            }
            const draftResult = mailApi.replyDraft(targetId, { reply_text: draftText });
            if (draftResult?.ok !== true) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply', error: draftResult?.error || 'mail_reply_draft_failed',
                    reply_text: isEnglish(locale) ? 'I could not prepare the reply draft.' : "Je n'ai pas pu preparer le brouillon."
                });
            }
            if (request.draft?.auto_send && typeof mailApi.send === 'function') {
                const sendResult = await mailApi.send(draftResult.draft.draft_id, { confirmed: true });
                if (sendResult?.ok === true) {
                    if (workingMemory) workingMemory.setLastOperation('mail', 'reply_sent');
                    const recipient = formatSenderLabel(sendResult?.draft || {}) || '';
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'reply',
                        reply_text: isEnglish(locale)
                            ? (recipient ? `The reply has been sent to ${recipient}.` : 'The reply has been sent.')
                            : (recipient ? `La reponse a ete envoyee a ${recipient}.` : 'La reponse a ete envoyee.')
                    });
                }
            }
            if (workingMemory) workingMemory.setLastOperation('mail', 'reply_drafted');
            return createStructuredResult({
                ok: true, domain: 'mail', operation: 'reply',
                reply_text: isEnglish(locale)
                    ? `Reply draft prepared. Say "send the mail" to send it.`
                    : `Brouillon de reponse prepare. Dis "envoie le mail" pour l'envoyer.`
            });
        }

        case 'send': {
            if (typeof mailApi.send !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'send', error: 'mail_send_unavailable',
                    reply_text: isEnglish(locale) ? 'Mail sending is not available.' : "L'envoi de mail n'est pas disponible."
                });
            }
            // Look for the draft ID in the working memory context
            const draftId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('mail_draft') : null);
            if (!draftId) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'send', error: 'mail_draft_not_found',
                    reply_text: isEnglish(locale) ? 'I do not have a draft to send.' : "Je n'ai pas de brouillon a envoyer."
                });
            }
            const result = await mailApi.send(draftId, { confirmed: true });
            if (workingMemory) workingMemory.setLastOperation('mail', 'send');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'send',
                error: result?.ok === false ? (result?.error || 'mail_send_failed') : '',
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The mail has been sent.' : 'Le mail a ete envoye.')
                    : (isEnglish(locale) ? 'I could not send the mail.' : "Je n'ai pas pu envoyer le mail.")
            });
        }

        case 'archive': {
            const en = isEnglish(locale);
            const explicitTarget = request.target?.id || null;
            const wantedCount = filters.limit || 1;

            let targetIds = [];
            if (explicitTarget) {
                targetIds = [explicitTarget];
            } else if (typeof mailApi.list === 'function') {
                const candidates = mailApi.list({ ...baseOpts, limit: wantedCount });
                targetIds = (Array.isArray(candidates?.items) ? candidates.items : [])
                    .map((item) => item.message_id)
                    .filter(Boolean);
            }
            if (!targetIds.length && workingMemory) {
                const wmId = workingMemory.getCurrentItemId('mail');
                if (wmId) targetIds = [wmId];
            }

            if (!targetIds.length || typeof mailApi.archive !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'archive', error: 'mail_not_found',
                    reply_text: en ? 'I do not see which mail to archive.' : 'Je ne vois pas quel mail archiver.'
                });
            }

            let archivedCount = 0;
            let lastError = null;
            for (const id of targetIds) {
                try {
                    const result = await mailApi.archive(id, {});
                    if (result?.ok !== false) {
                        archivedCount++;
                        if (workingMemory) workingMemory.removeFromResultSet('mail', id);
                    } else {
                        lastError = result?.error || 'mail_archive_failed';
                    }
                } catch (err) {
                    lastError = String(err?.message || err || 'mail_archive_threw');
                }
            }

            if (workingMemory) workingMemory.setLastOperation('mail', 'archive');

            if (archivedCount === 0) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'archive',
                    error: lastError || 'mail_archive_failed',
                    reply_text: en
                        ? `I could not archive the mail${targetIds.length > 1 ? 's' : ''}.`
                        : `Je n'ai pas pu archiver ${targetIds.length > 1 ? 'les mails' : 'ce mail'}.`
                });
            }

            const replyText = archivedCount === 1
                ? (en ? 'The mail has been archived.' : 'Le mail a ete archive.')
                : (en ? `${archivedCount} mails have been archived.` : `${archivedCount} mails ont ete archives.`);

            return createStructuredResult({
                ok: true, domain: 'mail', operation: 'archive',
                reply_text: replyText
            });
        }

        case 'delete': {
            const en = isEnglish(locale);

            // Batch delete: when limit > 1 or no specific target, list first then delete each.
            const explicitTarget = request.target?.id || null;
            const wantedCount = filters.limit || 1;

            let targetIds = [];
            if (explicitTarget) {
                targetIds = [explicitTarget];
            } else if (typeof mailApi.list === 'function') {
                const candidates = mailApi.list({ ...baseOpts, limit: wantedCount });
                targetIds = (Array.isArray(candidates?.items) ? candidates.items : [])
                    .map((item) => item.message_id)
                    .filter(Boolean);
            }

            // Fall back to working memory when nothing found via list
            if (!targetIds.length && workingMemory) {
                const wmId = workingMemory.getCurrentItemId('mail');
                if (wmId) targetIds = [wmId];
            }

            if (!targetIds.length || typeof mailApi.delete !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'delete', error: 'mail_not_found',
                    reply_text: en ? 'I do not see which mail to delete.' : 'Je ne vois pas quel mail supprimer.'
                });
            }

            let deletedCount = 0;
            let lastError = null;
            for (const id of targetIds) {
                try {
                    const result = await mailApi.delete(id, {});
                    if (result?.ok !== false) {
                        deletedCount++;
                        if (workingMemory) workingMemory.removeFromResultSet('mail', id);
                    } else {
                        lastError = result?.error || 'mail_delete_failed';
                    }
                } catch (err) {
                    lastError = String(err?.message || err || 'mail_delete_threw');
                }
            }

            if (workingMemory) workingMemory.setLastOperation('mail', 'delete');

            if (deletedCount === 0) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'delete',
                    error: lastError || 'mail_delete_failed',
                    reply_text: en
                        ? `I could not delete the mail${targetIds.length > 1 ? 's' : ''}.`
                        : `Je n'ai pas pu supprimer ${targetIds.length > 1 ? 'les mails' : 'ce mail'}.`
                });
            }

            const replyText = deletedCount === 1
                ? (en ? 'The mail has been deleted.' : 'Le mail a ete supprime.')
                : (en ? `${deletedCount} mails have been deleted.` : `${deletedCount} mails ont ete supprimes.`);

            return createStructuredResult({
                ok: true, domain: 'mail', operation: 'delete',
                reply_text: replyText
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

const executeContactsRequest = async (request, connectors, workingMemory) => {
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

    // Sync if available
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
                workingMemory.setLastOperation('contacts', queryText ? 'search' : 'list');
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'contacts', operation: queryText ? 'search' : 'list',
                items,
                reply_text: buildContactsReply(items, locale)
            });
        }

        case 'read': {
            const targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('contacts') : null);
            if (!targetId || typeof contactsApi.read !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'contacts', operation: 'read', error: 'contacts_not_found',
                    reply_text: isEnglish(locale) ? 'I do not know which contact to read.' : 'Je ne sais pas quel contact lire.'
                });
            }
            const result = await contactsApi.read(targetId);
            if (result?.ok === true && result.contact) {
                if (workingMemory) {
                    workingMemory.setCurrentItem('contacts', targetId, result.contact);
                    workingMemory.setLastOperation('contacts', 'read');
                }
                const label = String(result.contact?.name || result.contact?.display_name || result.contact?.email || '').trim();
                return createStructuredResult({
                    ok: true, domain: 'contacts', operation: 'read',
                    item: result.contact,
                    reply_text: label ? `Contact: ${label}.` : buildContactsReply([result.contact], locale)
                });
            }
            return createStructuredResult({
                ok: false, domain: 'contacts', operation: 'read', error: 'contacts_not_found',
                reply_text: isEnglish(locale) ? 'I could not find that contact.' : 'Je ne trouve pas ce contact.'
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

const executeCalendarRequest = async (request, connectors, workingMemory) => {
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

    // Sync if available
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
            const targetId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('calendar') : null);
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
            const result = await calendarApi.create(request.draft || {});
            if (workingMemory) workingMemory.setLastOperation('calendar', 'create');
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'calendar', operation: 'create',
                item: result?.event || null,
                reply_text: result?.ok !== false
                    ? (isEnglish(locale) ? 'The event has been created.' : 'Le rendez-vous a ete cree.')
                    : (isEnglish(locale) ? 'I could not create the event.' : "Je n'ai pas pu creer le rendez-vous.")
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

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

/**
 * Creates a unified tool router.
 *
 * @param {object} options
 * @param {object} options.connectors - Domain API references { mail, contacts, calendar }.
 * @param {object} options.workingMemory - Session working memory instance.
 * @param {object} options.bridge - MCP/runtime bridge for atome tools.
 * @returns {object} Router API.
 */
export const createToolRouter = ({
    connectors = {},
    workingMemory = null,
    bridge = null
} = {}) => {
    const activeConnectors = { ...connectors };

    return {
        /**
         * Updates a domain connector at runtime.
         */
        setConnector(domain, api) {
            activeConnectors[domain] = api;
        },

        /**
         * Executes a StructuredRequest and returns a StructuredResult.
         *
         * @param {object} request - A StructuredRequest from semantic_contract.js.
         * @returns {Promise<object>} StructuredResult
         */
        async execute(request) {
            if (!request || typeof request !== 'object') {
                return createStructuredResult({
                    ok: false, error: 'invalid_request',
                    reply_text: 'Invalid request.'
                });
            }

            switch (request.domain) {
                case 'mail':
                    return executeMailRequest(request, activeConnectors, workingMemory);
                case 'contacts':
                    return executeContactsRequest(request, activeConnectors, workingMemory);
                case 'calendar':
                    return executeCalendarRequest(request, activeConnectors, workingMemory);
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
                    // Delegate to the existing MCP/runtime bridge
                    const result = await bridge.callRuntimeTool({
                        tool_name: request.operation,
                        params: request.filters || {}
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
