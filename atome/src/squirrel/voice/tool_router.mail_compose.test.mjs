import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import { intentToStructuredRequest } from './semantic_contract.js';

const contactsApi = {
    async search(query) {
        const normalized = String(query || '').toLowerCase();
        if (normalized.includes('sylvain')) {
            return {
                ok: true,
                query,
                items: [
                    {
                        source_contact_id: 'compose_contact_1',
                        name: 'Sylvain Godard',
                        phone: '08 76 65 67',
                        email: 'sylvain@example.test'
                    }
                ]
            };
        }
        return { ok: true, query, items: [] };
    }
};

const composedDrafts = [];
const sentDrafts = [];

const mailApi = {
    composeDraft({ to, subject, body_text }) {
        const draft = {
            draft_id: `draft_compose_${composedDrafts.length + 1}`,
            to,
            subject: subject || '',
            body_text
        };
        composedDrafts.push(draft);
        return { ok: true, draft };
    },
    async send(draftId, { confirmed } = {}) {
        sentDrafts.push({ draftId, confirmed });
        return { ok: true, draft: { draft_id: draftId } };
    }
};

const confirmation = {
    confirmation_id: 'confirm_mail_test',
    actor_id: 'actor_mail_test',
    idempotency_key: 'idem_mail_test'
};

const router = createToolRouter({
    env: {},
    connectors: {
        contacts: contactsApi,
        mail: mailApi
    }
});

// Test 1: compose action from intentToStructuredRequest produces operation='compose'
const composeIntent = {
    domain: 'mail',
    action: 'compose',
    entities: {
        reply_target: 'Sylvain',
        draft_text: 'Comment vas-tu ?',
        auto_send: true
    },
    locale: 'fr-FR'
};

const structuredRequest = intentToStructuredRequest(composeIntent);
const confirmedStructuredRequest = {
    ...structuredRequest,
    source: {
        ...structuredRequest.source,
        actor_id: confirmation.actor_id
    },
    confirmation,
    idempotency_key: confirmation.idempotency_key
};
assert.equal(structuredRequest.domain, 'mail', 'compose intent should map to mail domain');
assert.equal(structuredRequest.operation, 'compose', 'compose intent action should map to compose operation');
assert.equal(structuredRequest.draft.reply_target, 'Sylvain', 'compose intent should preserve reply_target');
assert.equal(structuredRequest.draft.reply_text, 'Comment vas-tu ?', 'compose intent should map draft_text to reply_text');
assert.equal(structuredRequest.draft.auto_send, true, 'compose intent should preserve auto_send');

// Test 2: compose_mail action also maps to compose
const composeMail = intentToStructuredRequest({ domain: 'mail', action: 'compose_mail', entities: { reply_target: 'Alice', draft_text: 'Hello' } });
assert.equal(composeMail.operation, 'compose', 'compose_mail action should also map to compose operation');

// Test 3: tool_router executes compose with auto_send and resolves contact email
composedDrafts.length = 0;
sentDrafts.length = 0;
const unconfirmedComposeResult = await router.execute(structuredRequest);
assert.equal(unconfirmedComposeResult.ok, false, 'auto-send compose should require explicit confirmation');
assert.equal(unconfirmedComposeResult.confirmation_required, true, 'auto-send compose should expose confirmation requirement');

const composeResult = await router.execute(confirmedStructuredRequest);
assert.equal(composeResult.ok, true, 'compose execution should succeed');
assert.equal(composeResult.domain, 'mail', 'compose result domain should be mail');
assert.equal(composeResult.operation, 'compose', 'compose result operation should be compose');
assert.ok(composedDrafts.length >= 1, 'composeDraft should have been called');
assert.equal(composedDrafts[0].to[0].address, 'sylvain@example.test', 'compose should resolve contact email from contacts API');
assert.equal(composedDrafts[0].to[0].name, 'Sylvain Godard', 'compose should resolve contact name from contacts API');
assert.equal(composedDrafts[0].body_text, 'Comment vas-tu ?', 'compose should pass draft_text as body_text');
assert.ok(sentDrafts.length >= 1, 'send should have been called (auto_send=true)');
assert.equal(sentDrafts[0].confirmed, undefined, 'voice router must not inject raw confirmed=true');
assert.match(composeResult.reply_text || '', /envoye|sent/i, 'compose+send reply should confirm sending');

// Test 4: compose without auto_send creates draft only
composedDrafts.length = 0;
sentDrafts.length = 0;
const draftOnlyRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'compose',
    entities: {
        reply_target: 'Sylvain',
        draft_text: 'On se voit demain ?',
        auto_send: false
    },
    locale: 'fr-FR'
});
const draftResult = await router.execute(draftOnlyRequest);
assert.equal(draftResult.ok, true, 'draft-only compose should succeed');
assert.ok(composedDrafts.length >= 1, 'composeDraft should have been called for draft');
assert.equal(sentDrafts.length, 0, 'send should NOT have been called when auto_send is false');
assert.match(draftResult.reply_text || '', /brouillon|draft/i, 'draft reply should mention draft');

// Test 5: compose with unknown contact fails with no_email error
composedDrafts.length = 0;
const unknownRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'compose',
    entities: {
        reply_target: 'UnknownPerson',
        draft_text: 'Hello'
    },
    locale: 'fr-FR'
});
const unknownResult = await router.execute(unknownRequest);
assert.equal(unknownResult.ok, false, 'compose with unknown contact should fail');
assert.match(unknownResult.error || '', /mail_compose_no_email/, 'error should indicate no email found');

// Test 6: compose without draft_text asks what to write
const noTextRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'compose',
    entities: {
        reply_target: 'Sylvain'
    },
    locale: 'fr-FR'
});
const noTextResult = await router.execute(noTextRequest);
assert.equal(noTextResult.ok, false, 'compose without text should fail gracefully');
assert.match(noTextResult.error || '', /mail_compose_text_missing/, 'error should indicate missing text');

console.log('tool_router.mail_compose.test: PASS');
