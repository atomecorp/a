import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';
import {
    createMailApiWithMessages,
    createStalledMailEnv,
    createStructuredPlanner
} from './orchestrator.test_fixture.mjs';

const { env: mailExecEnv, mailApi } = createMailApiWithMessages([{
    message_id: 'voice_mail_1',
    mailbox: 'inbox',
    thread_id: 'voice_thread_1',
    subject: 'Bonjour Jean',
    preview: 'Peux-tu lire ce message',
    body_text: 'Peux-tu lire ce message',
    from: { name: 'Alice', address: 'alice@example.test' },
    to: [{ name: 'Jean', address: 'jean@example.test' }],
    unread: true,
    received_at: '2026-03-14T12:00:00.000Z'
}]);
const mailExecRuntime = createVoiceSessionRuntime();
const mailExecOrchestrator = createVoiceOrchestrator({
    env: mailExecEnv,
    sessionRuntime: mailExecRuntime,
    aiPlanner: createStructuredPlanner()
});
const mailExecSession = mailExecRuntime.createSession({
    session_id: 'voice_session_orchestrator_mail_exec'
});
const mailReadExecuted = await mailExecOrchestrator.executeUtterance('Lis mes mails', {
    session_id: mailExecSession.session_id
});
assert.equal(mailReadExecuted.ok, true);
assert.equal(mailReadExecuted.executed, true);
assert.equal(mailReadExecuted.transport, 'mail_api');
assert.match(mailReadExecuted.reply_text, /Bonjour Jean/);

const mailMarkUnreadExecuted = await mailExecOrchestrator.executeUtterance('Marque le comme non lu', {
    session_id: mailExecSession.session_id
});
assert.equal(mailMarkUnreadExecuted.ok, true);
assert.equal(mailMarkUnreadExecuted.executed, true);
assert.match(mailMarkUnreadExecuted.reply_text, /non lu/i);
assert.equal(mailApi.read('voice_mail_1').item.unread, true, 'contextual mark unread should update the current mail state');

const mailArchiveExecuted = await mailExecOrchestrator.executeUtterance('Archive le', {
    session_id: mailExecSession.session_id
});
assert.equal(mailArchiveExecuted.ok, true);
assert.equal(mailArchiveExecuted.executed, true);
assert.match(mailArchiveExecuted.reply_text, /archive/i);
assert.equal(mailApi.read('voice_mail_1').item.mailbox, 'archive', 'contextual archive should move the current mail out of inbox');

const stalledMailOrchestrator = createVoiceOrchestrator({
    env: createStalledMailEnv(),
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const stalledMailResult = await stalledMailOrchestrator.executeUtterance('Lis mes mails');
assert.equal(stalledMailResult.ok, true, 'mail connector stalls should not block the voice orchestrator');
assert.equal(stalledMailResult.executed, true, 'mail connector stalls should still fall back to the local mail index');
assert.equal(stalledMailResult.transport, 'mail_api', 'mail connector stalls should keep the local mail API transport');
assert.match(stalledMailResult.reply_text, /Resume hebdomadaire/, 'mail connector stalls should still produce a readout from local mail data');
assert.ok(
    stalledMailOrchestrator.listJournal().some((entry) => (
        entry.type === 'voice.intent.connector_timeout'
        || entry.type === 'voice.tool_router.result'
    )),
    'mail connector stalls should leave an execution trace in the orchestrator journal'
);

const { env: mailSummaryEnv } = createMailApiWithMessages([
    {
        message_id: 'voice_mail_summary_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_summary_1',
        subject: 'Facture mars',
        preview: 'Merci de valider la facture avant vendredi.',
        body_text: 'Merci de valider la facture avant vendredi.',
        from: { name: 'Compta', address: 'compta@example.test' },
        unread: false,
        received_at: '2026-03-20T10:00:00.000Z'
    },
    {
        message_id: 'voice_mail_summary_2',
        mailbox: 'inbox',
        thread_id: 'voice_thread_summary_2',
        subject: 'Invitation reunion',
        preview: 'Peux-tu confirmer ta presence demain a 9h ?',
        body_text: 'Peux-tu confirmer ta presence demain a 9h ?',
        from: { name: 'Paul', address: 'paul@example.test' },
        unread: false,
        received_at: '2026-03-20T11:00:00.000Z'
    }
]);
const summaryOrchestrator = createVoiceOrchestrator({
    env: mailSummaryEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner(),
    mailAiSummarizer: async () => ({
        ok: true,
        text: 'Tu as recu deux mails recents: une facture a valider avant vendredi et une invitation a confirmer pour demain 9h.'
    })
});
const summaryResult = await summaryOrchestrator.executeUtterance('Fais moi un resume de mes derniers mails');
assert.equal(summaryResult.ok, true, 'mail summarize should succeed when local mail exists');
assert.equal(summaryResult.executed, true, 'mail summarize should execute through the mail api');
assert.equal(summaryResult.transport, 'mail_api', 'mail summarize should stay on the mail api transport');
assert.match(summaryResult.reply_text, /facture a valider/i, 'mail summarize should prefer the AI summary when available');

const { env: unreadMailEnv, mailApi: unreadMailApi } = createMailApiWithMessages([
    {
        message_id: 'voice_mail_unread_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_unread_1',
        subject: 'Cool',
        preview: 'Cool',
        body_text: 'Cool',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        unread: false,
        received_at: '2026-03-20T12:00:00.000Z'
    },
    {
        message_id: 'voice_mail_unread_2',
        mailbox: 'inbox',
        thread_id: 'voice_thread_unread_2',
        subject: '=?UTF-8?B?W2F0b21lLm9uZV0gQ2xpZW50IGNvbmZpZ3VyYXRpb24gc2V0dGluZ3MgZm9yIOKAnGplZXpzQGF0b21lLm9uZeKAnS4=?=',
        preview: 'Parametres',
        body_text: 'Parametres',
        from: { name: 'cPanel', address: 'noreply@example.test' },
        unread: true,
        received_at: '2026-03-20T13:00:00.000Z'
    }
]);
const unreadOrchestrator = createVoiceOrchestrator({
    env: unreadMailEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const unreadResult = await unreadOrchestrator.executeUtterance('Ais je de nouveaux mails nion lues ?');
assert.equal(unreadResult.ok, true, 'unread mail status question should succeed');
assert.equal(unreadResult.transport, 'mail_api', 'unread mail status question should stay on the mail api transport');
assert.match(unreadResult.reply_text, /mail\(s\) non lu\(s\)|mail non lu/i, 'unread mail status question should answer on unread mail only');
assert.doesNotMatch(unreadResult.reply_text, /^Voici les derniers mails:/i, 'unread mail status question should not fall back to the latest mail list');
assert.doesNotMatch(unreadResult.reply_text, /=\?UTF-8\?/i, 'unread mail status question should not expose raw MIME encoded subjects');

const unreadReadSession = unreadOrchestrator.sessionRuntime.createSession({
    session_id: 'voice_session_orchestrator_unread_read_current'
});
const unreadStatus = await unreadOrchestrator.executeUtterance('Ais je de nouveaux mails nion lues ?', {
    session_id: unreadReadSession.session_id
});
assert.match(unreadStatus.reply_text, /mail\(s\) non lu\(s\)|mail non lu/i, 'unread status should seed the current unread mail context');
const readCurrentUnread = await unreadOrchestrator.executeUtterance('lis le', {
    session_id: unreadReadSession.session_id
});
assert.equal(readCurrentUnread.ok, true, 'read current unread followup should succeed');
assert.equal(readCurrentUnread.executed, true, 'read current unread followup should execute immediately');
assert.equal(readCurrentUnread.transport, 'mail_api', 'read current unread followup should execute on the mail api');
assert.match(readCurrentUnread.reply_text, /cPanel|Parametres|configuration/i, 'read current unread followup should read the unread mail currently in context');
const unreadAfterRead = unreadMailApi.list({ unread_only: true });
assert.equal(unreadAfterRead.items.length, 0, 'read current unread followup should mark the current unread mail as read');

const { env: junkSubjectEnv } = createMailApiWithMessages([{
    message_id: 'voice_mail_junk_subject_1',
    mailbox: 'inbox',
    thread_id: 'voice_thread_junk_subject_1',
    subject: '?????',
    preview: 'Facture a regler avant vendredi',
    body_text: 'Facture a regler avant vendredi',
    from: { name: 'Compta', address: 'compta@example.test' },
    unread: true,
    received_at: '2026-03-20T14:00:00.000Z'
}]);
const junkSubjectOrchestrator = createVoiceOrchestrator({
    env: junkSubjectEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const junkSubjectResult = await junkSubjectOrchestrator.executeUtterance('Ais je de nouveaux mails non lus ?');
assert.match(junkSubjectResult.reply_text, /Facture a regler avant vendredi/i, 'unread status should fall back to preview text when the subject is unreadable');
assert.doesNotMatch(junkSubjectResult.reply_text, /\?{3,}/, 'unread status should not speak junk placeholder subjects');

const { env: filteredMailEnv } = createMailApiWithMessages([
    {
        message_id: 'voice_mail_filtered_jean_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_filtered_jean_1',
        subject: 'Message Jean',
        preview: 'Message Jean',
        body_text: 'Message Jean',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        unread: false,
        received_at: '2026-03-20T15:00:00.000Z'
    },
    {
        message_id: 'voice_mail_filtered_other_old',
        mailbox: 'inbox',
        thread_id: 'voice_thread_filtered_other_old',
        subject: 'ALPHA ancien',
        preview: 'Ancien message robot alpha',
        body_text: 'Contenu ancien robot alpha',
        from: { name: 'EVE TEST ROBOT ALPHA', address: 'alpha@example.test' },
        unread: false,
        received_at: '2026-03-20T10:00:00.000Z'
    },
    {
        message_id: 'voice_mail_filtered_other_new',
        mailbox: 'inbox',
        thread_id: 'voice_thread_filtered_other_new',
        subject: 'BETA recent',
        preview: 'Message beta recent',
        body_text: 'Contenu recent robot beta',
        from: { name: 'EVE TEST ROBOT BETA', address: 'beta@example.test' },
        unread: false,
        received_at: '2026-03-20T14:00:00.000Z'
    }
]);
const filteredRuntime = createVoiceSessionRuntime();
const filteredSummaryCalls = [];
const filteredOrchestrator = createVoiceOrchestrator({
    env: filteredMailEnv,
    sessionRuntime: filteredRuntime,
    aiPlanner: createStructuredPlanner(),
    mailAiSummarizer: async ({ items = [] }) => {
        filteredSummaryCalls.push(items.map((item) => item?.message_id));
        const item = items[0] || {};
        return {
            ok: true,
            text: `Resume cible: ${item.subject || 'sans objet'}`
        };
    }
});
const filteredSession = filteredRuntime.createSession({
    session_id: 'voice_session_orchestrator_filtered_mail'
});
const filteredStatus = await filteredOrchestrator.executeUtterance('Ais je des messages d autres personnes que Jean-Eric ?', {
    session_id: filteredSession.session_id
});
assert.match(filteredStatus.reply_text, /BETA recent/i, 'sender exclusion status should seed the latest non-Jean-Eric mail in context');
const filteredSummary = await filteredOrchestrator.executeUtterance('Que contient ce mail, fais moi un resume', {
    session_id: filteredSession.session_id
});
assert.equal(filteredSummary.ok, true, 'current mail summary should succeed');
assert.match(filteredSummary.reply_text, /Resume cible: BETA recent/i, 'current mail summary should target the current filtered mail only');
assert.deepEqual(filteredSummaryCalls.at(-1), ['voice_mail_filtered_other_new'], 'current mail summary should summarize only one selected mail');
const oldestFilteredRead = await filteredOrchestrator.executeUtterance('Lis moi le mail le plus ancien', {
    session_id: filteredSession.session_id
});
assert.equal(oldestFilteredRead.ok, true, 'oldest filtered mail read should succeed');
assert.match(oldestFilteredRead.reply_text, /ALPHA ancien|Contenu ancien robot alpha/i, 'oldest filtered mail read should select the oldest mail inside the active filtered result set');

console.log('voice_orchestrator_mail_flows: ok');
