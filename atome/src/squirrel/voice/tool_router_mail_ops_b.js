// Extracted from tool_router.js: write-side mail operations
// (compose, reply_prompt, reply, send, archive, delete) + the unsupported-operation default.
// Receives the executeMailRequest context.
import { createStructuredResult } from './semantic_contract.js';
import { isEnglish, requireVoiceMutationSecurity } from './tool_router_shared.js';
import {
    checkMailTrust, createCommunicationItemId, formatSenderLabel, parseCommunicationItemId
} from './tool_router_mail_helpers.js';

export const executeMailOpsB = async (ctx) => {
    const { mailApi, messagesApi, connectors, locale, filters, baseOpts, request, workingMemory } = ctx;
    switch (request.operation) {
        case 'compose': {
            const composeTrust = checkMailTrust(workingMemory, locale, 'compose');
            if (composeTrust && !composeTrust.__trust_warning) return composeTrust;
            if (composeTrust?.__trust_warning && !request._trust_acknowledged) {
                return {
                    ok: true, domain: 'mail', operation: 'compose',
                    trust_score: composeTrust.trust_score,
                    trust_level: composeTrust.trust_level,
                    trust_signals: composeTrust.trust_signals,
                    confirmation_required: true,
                    reply_text: composeTrust.trust_warning_text,
                    executed: false
                };
            }
            const composeText = request.draft?.reply_text;
            if (!composeText) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_text_missing',
                    reply_text: isEnglish(locale) ? 'What should I write in the mail?' : 'Que veux-tu que j ecrive dans le mail ?'
                });
            }
            const composeTarget = String(request.draft?.reply_target || '').trim();
            if (!composeTarget) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_no_recipient',
                    reply_text: isEnglish(locale) ? 'Who should I send the mail to?' : 'A qui dois-je envoyer le mail ?'
                });
            }
            let recipientEmail = null;
            let recipientName = composeTarget;
            const contactsApi = connectors.contacts;
            if (contactsApi && typeof contactsApi.search === 'function') {
                try {
                    const contactResult = await contactsApi.search(composeTarget, { limit: 5 });
                    const contacts = Array.isArray(contactResult?.items) ? contactResult.items : [];
                    const match = contacts.find((c) => {
                        const cName = String(c?.name || '').trim().toLowerCase();
                        const target = composeTarget.toLowerCase();
                        return cName && (cName.includes(target) || target.includes(cName));
                    });
                    if (match) {
                        recipientEmail = match.email || null;
                        recipientName = match.name || composeTarget;
                    }
                } catch (_) { /* contacts lookup failed, continue */ }
            }
            if (!recipientEmail) {
                const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/;
                if (emailPattern.test(composeTarget)) {
                    recipientEmail = composeTarget;
                }
            }
            if (!recipientEmail) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_no_email',
                    reply_text: isEnglish(locale)
                        ? `I cannot find an email address for ${recipientName}.`
                        : `Je ne trouve pas d adresse email pour ${recipientName}.`
                });
            }
            const subject = request.draft?.subject || '';
            if (typeof mailApi.composeDraft === 'function') {
                const composeResult = mailApi.composeDraft({
                    to: [{ name: recipientName, address: recipientEmail }],
                    subject,
                    body_text: composeText
                });
                if (composeResult?.ok === true) {
                    if (request.draft?.auto_send && typeof mailApi.send === 'function') {
                        const security = requireVoiceMutationSecurity(request, 'mail', 'send');
                        if (security.ok !== true) return security;
                        const sendResult = await mailApi.send(composeResult.draft.draft_id, security.options);
                        if (sendResult?.ok === true) {
                            if (workingMemory) {
                                workingMemory.setLastOperation('mail', 'compose_sent');
                                workingMemory.setCurrentItem('mail_draft', null, null);
                            }
                            return createStructuredResult({
                                ok: true, domain: 'mail', operation: 'compose',
                                draft: sendResult?.draft || composeResult?.draft || null,
                                reply_text: isEnglish(locale)
                                    ? `Mail sent to ${recipientName}.`
                                    : `Mail envoye a ${recipientName}.`
                            });
                        }
                    }
                    if (workingMemory) {
                        const rawDraftId = String(composeResult.draft.draft_id || '').trim();
                        const draftId = createCommunicationItemId('mail', rawDraftId);
                        workingMemory.setCurrentItem('mail_draft', draftId, {
                            ...(composeResult.draft || {}),
                            draft_id: draftId,
                            raw_draft_id: rawDraftId,
                            comm_surface: 'mail'
                        });
                        workingMemory.setLastOperation('mail', 'compose_drafted');
                    }
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'compose',
                        draft: composeResult.draft || null,
                        reply_text: isEnglish(locale)
                            ? `Draft mail to ${recipientName} prepared. Say "send the mail" to send it.`
                            : `Brouillon de mail a ${recipientName} prepare. Dis "envoie le mail" pour l'envoyer.`
                    });
                }
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'compose', error: composeResult?.error || 'mail_compose_failed',
                    reply_text: isEnglish(locale) ? 'I could not prepare the mail draft.' : 'Je n ai pas pu preparer le brouillon.'
                });
            }
            return createStructuredResult({
                ok: false, domain: 'mail', operation: 'compose', error: 'mail_compose_unavailable',
                reply_text: isEnglish(locale) ? 'Mail composition is not available.' : 'La composition de mail n est pas disponible.'
            });
        }

        case 'reply_prompt':
            if (!request.draft?.reply_text) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply_prompt', error: 'mail_reply_text_missing',
                    reply_text: isEnglish(locale) ? 'What should I reply to this mail?' : 'Que veux-tu que je reponde a ce mail ?'
                });
            }
        // fall through to reply when draft_text is available

        case 'reply': {
            const replyTrust = checkMailTrust(workingMemory, locale, 'reply');
            if (replyTrust && !replyTrust.__trust_warning) return replyTrust;
            if (replyTrust?.__trust_warning && !request._trust_acknowledged) {
                return {
                    ok: true, domain: 'mail', operation: 'reply',
                    trust_score: replyTrust.trust_score,
                    trust_level: replyTrust.trust_level,
                    trust_signals: replyTrust.trust_signals,
                    confirmation_required: true,
                    reply_text: replyTrust.trust_warning_text,
                    executed: false
                };
            }
            const draftText = request.draft?.reply_text;
            if (!draftText) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'reply', error: 'mail_reply_text_missing',
                    reply_text: isEnglish(locale) ? 'What should I reply to this mail?' : 'Que veux-tu que je reponde a ce mail ?'
                });
            }
            let targetId = request.target?.id || null;

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

            if (!targetId && workingMemory) {
                targetId = workingMemory.getCurrentItemId('mail');
            }
            const targetInfo = parseCommunicationItemId(targetId);

            if (
                targetInfo.surface === 'messages'
                && messagesApi
                && typeof messagesApi.replyDraft === 'function'
            ) {
                const draftResult = await messagesApi.replyDraft(targetInfo.source_id, { reply_text: draftText });
                if (draftResult?.ok === true) {
                    const rawDraftId = String(draftResult?.draft?.draft_id || draftResult?.draft_id || '').trim();
                    const draftId = createCommunicationItemId('messages', rawDraftId);
                    if (workingMemory) {
                        workingMemory.setCurrentItem('mail_draft', draftId, {
                            ...(draftResult?.draft || {}),
                            draft_id: draftId,
                            raw_draft_id: rawDraftId,
                            comm_surface: 'messages'
                        });
                        workingMemory.setLastOperation('mail', 'reply_drafted');
                    }
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'reply',
                        draft: draftResult?.draft || null,
                        reply_text: isEnglish(locale)
                            ? `Reply draft prepared. Say "send the mail" to send it.`
                            : `Brouillon de reponse prepare. Dis "envoie le mail" pour l'envoyer.`
                    });
                }
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
                const security = requireVoiceMutationSecurity(request, 'mail', 'send');
                if (security.ok !== true) return security;
                const sendResult = await mailApi.send(draftResult.draft.draft_id, security.options);
                if (sendResult?.ok === true) {
                    if (workingMemory) {
                        workingMemory.setLastOperation('mail', 'reply_sent');
                        workingMemory.setCurrentItem('mail_draft', null, null);
                    }
                    const recipient = formatSenderLabel(sendResult?.draft || {}) || '';
                    return createStructuredResult({
                        ok: true, domain: 'mail', operation: 'reply',
                        draft: sendResult?.draft || draftResult?.draft || null,
                        reply_text: isEnglish(locale)
                            ? (recipient ? `The reply has been sent to ${recipient}.` : 'The reply has been sent.')
                            : (recipient ? `La reponse a ete envoyee a ${recipient}.` : 'La reponse a ete envoyee.')
                    });
                }
            }
            if (workingMemory) {
                const rawDraftId = String(draftResult?.draft?.draft_id || '').trim();
                const draftId = createCommunicationItemId('mail', rawDraftId);
                workingMemory.setCurrentItem('mail_draft', draftId, {
                    ...(draftResult?.draft || {}),
                    draft_id: draftId,
                    raw_draft_id: rawDraftId,
                    comm_surface: 'mail'
                });
                workingMemory.setLastOperation('mail', 'reply_drafted');
            }
            return createStructuredResult({
                ok: true, domain: 'mail', operation: 'reply',
                draft: draftResult?.draft || null,
                reply_text: isEnglish(locale)
                    ? `Reply draft prepared. Say "send the mail" to send it.`
                    : `Brouillon de reponse prepare. Dis "envoie le mail" pour l'envoyer.`
            });
        }

        case 'send': {
            const sendTrust = checkMailTrust(workingMemory, locale, 'send');
            if (sendTrust && !sendTrust.__trust_warning) return sendTrust;
            if (sendTrust?.__trust_warning && !request._trust_acknowledged) {
                return {
                    ok: true, domain: 'mail', operation: 'send',
                    trust_score: sendTrust.trust_score,
                    trust_level: sendTrust.trust_level,
                    trust_signals: sendTrust.trust_signals,
                    confirmation_required: true,
                    reply_text: sendTrust.trust_warning_text,
                    executed: false
                };
            }
            const currentDraft = workingMemory ? workingMemory.getCurrentItem('mail_draft') : null;
            const currentDraftId = request.target?.id
                || (workingMemory ? workingMemory.getCurrentItemId('mail_draft') : null);
            const currentDraftInfo = parseCommunicationItemId(currentDraftId);
            const sendSurface = currentDraft?.comm_surface || currentDraftInfo.surface || 'mail';
            const sendApi = sendSurface === 'messages' ? messagesApi : mailApi;
            if (!sendApi || typeof sendApi.send !== 'function') {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'send', error: 'mail_send_unavailable',
                    reply_text: isEnglish(locale) ? 'Mail sending is not available.' : "L'envoi de mail n'est pas disponible."
                });
            }
            const draftId = String(
                currentDraft?.raw_draft_id
                || currentDraftInfo.source_id
                || ''
            ).trim();
            if (!draftId) {
                return createStructuredResult({
                    ok: false, domain: 'mail', operation: 'send', error: 'mail_draft_not_found',
                    reply_text: isEnglish(locale) ? 'I do not have a draft to send.' : "Je n'ai pas de brouillon a envoyer."
                });
            }
            const security = requireVoiceMutationSecurity(request, 'mail', 'send');
            if (security.ok !== true) return security;
            const result = await sendApi.send(draftId, security.options);
            if (workingMemory) {
                workingMemory.setLastOperation('mail', 'send');
                workingMemory.setCurrentItem('mail_draft', null, null);
            }
            return createStructuredResult({
                ok: result?.ok !== false, domain: 'mail', operation: 'send',
                draft: result?.draft || null,
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

        default:
            return createStructuredResult({
                ok: false, domain: 'mail', operation: request.operation,
                error: 'unsupported_mail_operation',
                reply_text: isEnglish(locale) ? 'I do not know this mail action.' : 'Je ne connais pas cette action mail.'
            });
    }
};
