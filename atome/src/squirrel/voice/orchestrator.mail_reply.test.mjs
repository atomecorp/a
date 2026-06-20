import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';
import {
    createContextualReplyPlanner,
    createMailApiWithMessages,
    createStructuredPlanner
} from './orchestrator.test_fixture.mjs';

const { env: mailReplyEnv } = createMailApiWithMessages([
    {
        message_id: 'voice_mail_reply_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_reply_1',
        subject: 'Cool',
        preview: 'Cool',
        body_text: 'Cool',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        unread: false,
        received_at: '2026-03-20T12:00:00.000Z'
    },
    {
        message_id: 'voice_mail_reply_2',
        mailbox: 'inbox',
        thread_id: 'voice_thread_reply_2',
        subject: 'Configuration mail',
        preview: 'Voici les parametres de configuration.',
        body_text: 'Voici les parametres de configuration.',
        from: { name: 'cPanel', address: 'noreply@example.test' },
        unread: false,
        received_at: '2026-03-20T11:00:00.000Z'
    }
]);
const replyRuntime = createVoiceSessionRuntime();
const replyOrchestrator = createVoiceOrchestrator({
    env: mailReplyEnv,
    sessionRuntime: replyRuntime,
    aiPlanner: createStructuredPlanner()
});
const replySession = replyRuntime.createSession({
    session_id: 'voice_session_orchestrator_mail_reply'
});
await replyOrchestrator.executeUtterance('Fais moi un resume de mes derniers mails', {
    session_id: replySession.session_id
});
const replyResult = await replyOrchestrator.executeUtterance('Reponds a Jean-Eric que j ai bien recu le mail', {
    session_id: replySession.session_id
});
assert.equal(replyResult.ok, true, 'mail reply should resolve recent mail context');
assert.equal(replyResult.executed, false, 'mail reply should wait for durable confirmation before sending');
assert.equal(replyResult.confirmation_required, true, 'mail reply should expose the confirmation requirement');
const confirmedReplyResult = await replyOrchestrator.executeIntent(replyResult.intent, {
    session_id: replySession.session_id,
    confirmation: replyResult.confirmation,
    idempotency_key: replyResult.confirmation.idempotency_key
});
assert.equal(confirmedReplyResult.ok, true, 'confirmed mail reply should succeed when recent mail context exists');
assert.equal(confirmedReplyResult.executed, true, 'confirmed mail reply should execute through the mail api');
assert.equal(confirmedReplyResult.transport, 'mail_api', 'confirmed mail reply should stay on the mail api transport');
assert.equal(confirmedReplyResult.result?.draft?.in_reply_to, 'voice_mail_reply_1', 'confirmed mail reply should target the matched sender mail');
assert.equal(confirmedReplyResult.result?.draft?.body_text, 'j ai bien recu le mail', 'confirmed mail reply should sanitize the dictated body');
assert.equal(confirmedReplyResult.result?.draft?.status, 'queued_local_only', 'confirmed mail reply with dictated body should send immediately');
assert.match(confirmedReplyResult.reply_text, /mail a ete envoye|reponse a ete envoyee|file d'attente locale/i, 'confirmed mail reply with dictated body should acknowledge direct sending');
const sendResult = await replyOrchestrator.executeUtterance('Envoie le mail', {
    session_id: replySession.session_id
});
assert.equal(sendResult.ok, false, 'mail send should fail cleanly once the previous reply was already auto-sent');
assert.equal(sendResult.executed, false, 'mail send should not execute when no draft remains in session');
assert.equal(sendResult.transport, 'mail_api', 'mail send should stay on the mail api transport');
assert.match(sendResult.reply_text, /pas de brouillon|do not have a draft/i, 'mail send should explain that no draft remains after an auto-sent reply');

const { env: directReplyEnv } = createMailApiWithMessages([{
    message_id: 'voice_mail_direct_reply_1',
    mailbox: 'inbox',
    thread_id: 'voice_thread_direct_reply_1',
    subject: 'Cool',
    preview: 'Cool',
    body_text: 'Cool',
    from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
    received_at: '2026-03-20T12:00:00.000Z'
}]);
const directReplyOrchestrator = createVoiceOrchestrator({
    env: directReplyEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const directReplyResult = await directReplyOrchestrator.executeUtterance('Reponds a Jean-Eric que j ai bien recu le mail');
assert.equal(directReplyResult.ok, true, 'mail reply should work even without a prior mail summary step');
assert.equal(directReplyResult.confirmation_required, true, 'generic direct reply should require durable confirmation before sending');
const directReplyConfirmed = await directReplyOrchestrator.executeIntent(directReplyResult.intent, {
    confirmation: directReplyResult.confirmation,
    idempotency_key: directReplyResult.confirmation.idempotency_key
});
assert.equal(directReplyConfirmed.executed, true, 'confirmed mail reply should execute directly from a generic reply utterance');
assert.equal(directReplyConfirmed.result?.draft?.in_reply_to, 'voice_mail_direct_reply_1', 'mail reply should still resolve the matching recent mail');
assert.equal(directReplyConfirmed.result?.draft?.status, 'queued_local_only', 'generic direct reply should send after confirmation when body text is provided');

const { env: misflaggedReplyEnv } = createMailApiWithMessages([{
    message_id: 'voice_mail_misflagged_reply_1',
    mailbox: 'inbox',
    thread_id: 'voice_thread_misflagged_reply_1',
    subject: 'Cool',
    body_text: 'Cool',
    from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
    received_at: '2026-03-20T12:00:00.000Z'
}]);
const misflaggedReplyOrchestrator = createVoiceOrchestrator({
    env: misflaggedReplyEnv,
    sessionRuntime: createVoiceSessionRuntime()
});
const misflaggedReplyIntent = {
    intent_id: 'voice_intent_reply_misflagged',
    type: 'connector_tool',
    domain: 'mail',
    action: 'reply_current',
    status: 'pending_connector',
    requested_capabilities: ['mail_reply_draft'],
    entities: {
        reply_target: 'Jean-Eric',
        draft_text: 'bien recu',
        auto_send: true
    },
    execution: {
        target: 'pending_connector',
        confirmation_required: true,
        toolchain: [{
            source: 'pending_connector',
            capability: 'mail_reply_draft',
            input: {
                reply_target: 'Jean-Eric',
                draft_text: 'bien recu',
                auto_send: true
            }
        }]
    }
};
const misflaggedGate = await misflaggedReplyOrchestrator.executeIntent(misflaggedReplyIntent);
assert.equal(misflaggedGate.confirmation_required, true, 'misflagged reply should require durable confirmation');
const misflaggedReplyResult = await misflaggedReplyOrchestrator.executeIntent(misflaggedGate.intent, {
    confirmation: misflaggedGate.confirmation,
    idempotency_key: misflaggedGate.confirmation.idempotency_key
});
assert.equal(misflaggedReplyResult.executed, true, 'mail reply with confirmed:true should execute despite confirmation flag');
assert.equal(misflaggedReplyResult.result?.draft?.in_reply_to, 'voice_mail_misflagged_reply_1');
assert.equal(misflaggedReplyResult.result?.draft?.status, 'queued_local_only', 'misflagged reply should still send immediately');

const { env: contextualReplyEnv } = createMailApiWithMessages([{
    message_id: 'voice_mail_contextual_reply_1',
    mailbox: 'inbox',
    thread_id: 'voice_thread_contextual_reply_1',
    subject: 'Salut, tu as encore de bonnes nouvelles aujourd hui ?',
    preview: 'Salut, tu as encore de bonnes nouvelles aujourd hui ?',
    body_text: 'Salut, tu as encore de bonnes nouvelles aujourd hui ?',
    from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
    unread: true,
    received_at: '2026-03-21T07:50:00.000Z'
}]);
const contextualReplyRuntime = createVoiceSessionRuntime();
const contextualReplyOrchestrator = createVoiceOrchestrator({
    env: contextualReplyEnv,
    sessionRuntime: contextualReplyRuntime,
    aiPlanner: createContextualReplyPlanner()
});
const contextualReplySession = contextualReplyRuntime.createSession({
    session_id: 'voice_session_orchestrator_contextual_reply'
});
const contextualStatus = await contextualReplyOrchestrator.executeUtterance('J ai de nouveaux mails ?', {
    session_id: contextualReplySession.session_id
});
assert.match(contextualStatus.reply_text, /mail\(s\) non lu\(s\)|nouveau mail/i, 'mail status should establish the current unread mail context');
const contextualReplyResult = await contextualReplyOrchestrator.executeUtterance('Reponds oui tout va bien', {
    session_id: contextualReplySession.session_id
});
assert.equal(contextualReplyResult.ok, true, 'contextual reply should succeed after a mail status question');
assert.equal(contextualReplyResult.confirmation_required, true, 'contextual reply should require confirmation before sending');
const contextualReplyConfirmed = await contextualReplyOrchestrator.executeIntent(contextualReplyResult.intent, {
    session_id: contextualReplySession.session_id,
    confirmation: contextualReplyResult.confirmation,
    idempotency_key: contextualReplyResult.confirmation.idempotency_key
});
assert.equal(contextualReplyConfirmed.executed, true, 'confirmed contextual reply should execute');
assert.equal(contextualReplyConfirmed.transport, 'mail_api', 'confirmed contextual reply should stay on the mail api');
assert.equal(contextualReplyConfirmed.result?.draft?.in_reply_to, 'voice_mail_contextual_reply_1', 'contextual reply should target the current unread mail');
assert.equal(contextualReplyConfirmed.result?.draft?.body_text, 'oui tout va bien', 'contextual reply should preserve the dictated reply body');
assert.match(contextualReplyConfirmed.reply_text, /mail a ete envoye|reponse a ete envoyee|file d'attente locale/i, 'confirmed contextual reply should acknowledge sending instead of listing unread mails');

console.log('voice_orchestrator_mail_reply: ok');
