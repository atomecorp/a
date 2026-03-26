import assert from 'node:assert/strict';

import {
    computeTrustScore,
    buildTrustWarning,
    describeTrustSignals,
    TRUST_THRESHOLD_OK,
    TRUST_THRESHOLD_WARN,
    extractSenderEmail,
    extractSenderName,
    extractBodyText,
    extractSubject
} from './mail_trust_scoring.js';

// ── Helpers ──────────────────────────────────────────────────────────

const cleanMail = {
    from: { name: 'Alice Martin', address: 'alice.martin@example.com' },
    subject: 'Meeting tomorrow',
    body_text: 'Hi, can we meet tomorrow at 3pm? Let me know if that works. Best, Alice'
};

const phishingMail = {
    from: { name: 'Apple Security', address: 'no-reply@appleid-verify.tk' },
    subject: 'URGENT: Your account has been compromised!!!',
    body_text: 'Your Apple ID has been compromised. Click here immediately to verify your account: https://192.168.1.1/login. You must enter your credentials within 24 hours or your account will be closed. Provide your password and credit card number to restore access.'
};

const spamMail = {
    from: { name: 'Lucky Winner', address: 'winner@promo.xyz' },
    subject: 'YOU HAVE WON $1,000,000!!!',
    body_text: 'Claim your prize now! Send money for processing fees to our bank account. Wire transfer required immediately. Act now or lose your chance!'
};

const suspiciousMail = {
    from: { name: 'Support Team', address: 'billing@company-secure-login.click' },
    subject: 'Update your payment information',
    body_text: 'We noticed unusual activity on your account. Please update your payment details at https://bit.ly/abc123. This is your last chance to avoid account suspension.'
};

const borderlineMail = {
    from: { name: 'Jean Dupont', address: 'jean@enterprise.fr' },
    subject: 'Urgent: project deadline',
    body_text: 'Hi, the deadline for the project is approaching. Can you send me the updated slides by end of day? Thanks, Jean'
};

const emptyBodyMail = {
    from: { name: 'Unknown Sender', address: 'noreply@mysterious.info' },
    subject: 'Verify your account immediately',
    body_text: ''
};

const frenchPhishingMail = {
    from: { name: 'Service Client', address: 'service@banque-securite.ga' },
    subject: 'Action urgente requise',
    body_text: 'Votre compte a ete compromis. Confirmez votre identite immediatement. Fournissez votre numero de securite sociale et vos coordonnees bancaires. Cliquez ici: https://t.co/fake'
};

// ── Unit tests: extractors ───────────────────────────────────────────

// extractSenderEmail
assert.equal(extractSenderEmail(cleanMail), 'alice.martin@example.com');
assert.equal(extractSenderEmail({ from: 'bob@test.com' }), 'bob@test.com');
assert.equal(extractSenderEmail({}), '');
assert.equal(extractSenderEmail(null), '');

// extractSenderName
assert.equal(extractSenderName(cleanMail), 'Alice Martin');
assert.equal(extractSenderName({ from: { address: 'x@y.com' } }), '');

// extractBodyText
assert.ok(extractBodyText(cleanMail).includes('meet tomorrow'));
assert.equal(extractBodyText({ body: 'test body' }), 'test body');
assert.equal(extractBodyText({ text: 'text fallback' }), 'text fallback');
assert.equal(extractBodyText({ snippet: 'snippet' }), 'snippet');
assert.equal(extractBodyText({}), '');

// extractSubject
assert.equal(extractSubject(cleanMail), 'Meeting tomorrow');
assert.equal(extractSubject({}), '');

console.log('PASS extractors');

// ── Unit tests: computeTrustScore ────────────────────────────────────

// Clean mail should be trusted
const cleanResult = computeTrustScore(cleanMail);
assert.ok(cleanResult.score >= TRUST_THRESHOLD_OK, `Clean mail score ${cleanResult.score} should be >= ${TRUST_THRESHOLD_OK}`);
assert.equal(cleanResult.level, 'trusted');
assert.equal(cleanResult.signals.length, 0, 'Clean mail should have no signals');

// Phishing mail should be blocked
const phishResult = computeTrustScore(phishingMail);
assert.ok(phishResult.score < TRUST_THRESHOLD_WARN, `Phishing mail score ${phishResult.score} should be < ${TRUST_THRESHOLD_WARN}`);
assert.equal(phishResult.level, 'blocked');
assert.ok(phishResult.signals.length > 0, 'Phishing mail should have signals');
const phishSignalIds = phishResult.signals.map((s) => s.id);
assert.ok(phishSignalIds.includes('phishing_phrases'), 'Should detect phishing phrases');
assert.ok(phishSignalIds.includes('suspicious_links'), 'Should detect suspicious links');
assert.ok(phishSignalIds.includes('credential_request'), 'Should detect credential request');
assert.ok(phishSignalIds.includes('urgency_language'), 'Should detect urgency language');

// Spam mail should be blocked or at least suspicious
const spamResult = computeTrustScore(spamMail);
assert.ok(spamResult.score < TRUST_THRESHOLD_OK, `Spam mail score ${spamResult.score} should be < ${TRUST_THRESHOLD_OK}`);
assert.ok(spamResult.level === 'blocked' || spamResult.level === 'suspicious', `Spam level should be blocked or suspicious, got ${spamResult.level}`);
const spamSignalIds = spamResult.signals.map((s) => s.id);
assert.ok(spamSignalIds.includes('phishing_phrases') || spamSignalIds.includes('urgency_language') || spamSignalIds.includes('credential_request'),
    'Spam mail should trigger at least one content signal');

// Suspicious mail should be suspicious or blocked
const suspResult = computeTrustScore(suspiciousMail);
assert.ok(suspResult.score < TRUST_THRESHOLD_OK, `Suspicious mail score ${suspResult.score} should be < ${TRUST_THRESHOLD_OK}`);
assert.ok(suspResult.level !== 'trusted', 'Suspicious mail should not be trusted');

// Borderline mail should not be blocked (might be slightly suspicious or trusted)
const borderResult = computeTrustScore(borderlineMail);
assert.ok(borderResult.score >= TRUST_THRESHOLD_WARN, `Borderline mail score ${borderResult.score} should be >= ${TRUST_THRESHOLD_WARN}`);

// Empty body mail with suspicious subject
const emptyResult = computeTrustScore(emptyBodyMail);
assert.ok(emptyResult.score < TRUST_THRESHOLD_OK, `Empty body mail score ${emptyResult.score} should be < ${TRUST_THRESHOLD_OK}`);
const emptySignalIds = emptyResult.signals.map((s) => s.id);
assert.ok(emptySignalIds.includes('empty_body'), 'Should detect empty body');

// French phishing
const frResult = computeTrustScore(frenchPhishingMail);
assert.ok(frResult.score < TRUST_THRESHOLD_WARN, `French phishing score ${frResult.score} should be < ${TRUST_THRESHOLD_WARN}`);
assert.equal(frResult.level, 'blocked');

// Null / undefined input
const nullResult = computeTrustScore(null);
assert.equal(nullResult.score, 0);
assert.equal(nullResult.level, 'blocked');

const undefinedResult = computeTrustScore(undefined);
assert.equal(undefinedResult.score, 0);
assert.equal(undefinedResult.level, 'blocked');

console.log('PASS computeTrustScore');

// ── Unit tests: buildTrustWarning ────────────────────────────────────

// Blocked — English
const blockedWarningEN = buildTrustWarning(phishResult, 'en-US');
assert.ok(blockedWarningEN.includes('unsafe'), 'Blocked EN warning should mention unsafe');
assert.ok(blockedWarningEN.includes('blocked'), 'Blocked EN warning should mention blocked');

// Blocked — French
const blockedWarningFR = buildTrustWarning(phishResult, 'fr-FR');
assert.ok(blockedWarningFR.includes('dangereux'), 'Blocked FR warning should mention dangereux');
assert.ok(blockedWarningFR.includes('bloque'), 'Blocked FR warning should mention bloque');

// Suspicious — English
const suspWarningEN = buildTrustWarning(suspResult, 'en-US');
assert.ok(suspWarningEN.includes('suspicious') || suspWarningEN.includes('unsafe'), 'Suspicious EN warning should be relevant');

// Trusted — no warning
const trustedWarning = buildTrustWarning(cleanResult, 'en-US');
assert.equal(trustedWarning, '', 'Trusted mail should produce no warning');

console.log('PASS buildTrustWarning');

// ── Unit tests: describeTrustSignals ─────────────────────────────────

const phishDesc = describeTrustSignals(phishResult.signals, 'en');
assert.ok(phishDesc.includes('phishing phrases'), 'EN description should include phishing phrases');
assert.ok(phishDesc.includes('suspicious links'), 'EN description should include suspicious links');

const phishDescFR = describeTrustSignals(phishResult.signals, 'fr');
assert.ok(phishDescFR.includes('hameconnage'), 'FR description should include hameconnage');
assert.ok(phishDescFR.includes('liens suspects'), 'FR description should include liens suspects');

console.log('PASS describeTrustSignals');

// ── Integration test: tool_router trust gate ─────────────────────────

import { createToolRouter } from './tool_router.js';
import { intentToStructuredRequest } from './semantic_contract.js';

const composedDrafts = [];
const sentDrafts = [];

const testMailApi = {
    ensureReady() { return { ok: true }; },
    list() { return { ok: true, items: [phishingMail] }; },
    read(id) { return { ok: true, item: phishingMail }; },
    composeDraft({ to, subject, body_text }) {
        const draft = { draft_id: `draft_${composedDrafts.length + 1}`, to, subject, body_text };
        composedDrafts.push(draft);
        return { ok: true, draft };
    },
    replyDraft(id, { reply_text }) {
        return { ok: true, draft: { draft_id: `reply_draft_${id}`, reply_text } };
    },
    async send(draftId, opts) {
        sentDrafts.push({ draftId, ...opts });
        return { ok: true, draft: { draft_id: draftId } };
    },
    markRead() { return { ok: true }; }
};

// Simulate a working memory that holds the phishing mail as current item
class TestWorkingMemory {
    #items = {};
    #ids = {};
    #lastOp = {};
    #resultSets = {};
    #filters = {};
    #order = {};
    setCurrentItem(domain, id, item) { this.#ids[domain] = id; this.#items[domain] = item; }
    getCurrentItem(domain) { return this.#items[domain] || null; }
    getCurrentItemId(domain) { return this.#ids[domain] || null; }
    setLastOperation(domain, op) { this.#lastOp[domain] = op; }
    getLastOperation(domain) { return this.#lastOp[domain] || null; }
    setResultSet(domain, items, key) { this.#resultSets[domain] = items; }
    setFilters(domain, f) { this.#filters[domain] = f; }
    setOrder(domain, o) { this.#order[domain] = o; }
}

const wm = new TestWorkingMemory();
wm.setCurrentItem('mail', 'msg_phishing_1', {
    ...phishingMail,
    message_id: 'msg_phishing_1'
});

const router = createToolRouter({
    connectors: {
        mail: testMailApi,
        contacts: { async search() { return { ok: true, items: [] }; } }
    },
    workingMemory: wm
});

// Test: reply to phishing mail should be BLOCKED (trust_level blocked)
const replyRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'reply_current',
    entities: {
        reply_target: 'Apple Security',
        draft_text: 'Here is my password: 12345',
        auto_send: true
    },
    locale: 'en-US'
});

const replyResult = await router.execute(replyRequest);
assert.ok(replyResult, 'Reply result should exist');
// Phishing mail trust score is very low — should be blocked or require confirmation
assert.ok(
    replyResult.trust_level === 'blocked' || replyResult.confirmation_required === true,
    `Reply to phishing mail should be blocked or require confirmation, got trust_level=${replyResult.trust_level}, confirmation_required=${replyResult.confirmation_required}`
);
assert.ok(replyResult.reply_text, 'Should have a trust warning message');

// Test: compose when phishing mail is current should also be gated
composedDrafts.length = 0;
const composeRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'compose',
    entities: {
        reply_target: 'Apple Security',
        draft_text: 'Here are my details',
        auto_send: true
    },
    locale: 'fr-FR'
});

const composeResult = await router.execute(composeRequest);
assert.ok(composeResult, 'Compose result should exist');
assert.ok(
    composeResult.trust_level === 'blocked' || composeResult.confirmation_required === true,
    `Compose with phishing mail in context should be blocked or require confirmation`
);

// Test: send should also be gated
sentDrafts.length = 0;
wm.setCurrentItem('mail_draft', 'draft_1', { draft_id: 'draft_1', raw_draft_id: 'draft_1', comm_surface: 'mail' });
const sendRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'send',
    entities: {},
    locale: 'en-US'
});

const sendResult = await router.execute(sendRequest);
assert.ok(sendResult, 'Send result should exist');
assert.ok(
    sendResult.trust_level === 'blocked' || sendResult.confirmation_required === true,
    `Send with phishing mail in context should be blocked or require confirmation`
);
assert.equal(sentDrafts.length, 0, 'No mail should have been actually sent');

console.log('PASS tool_router trust gate: phishing mail blocks reply/compose/send');

// Test: read should return trust score info
const readRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'read_current',
    entities: {},
    locale: 'en-US'
});

const readResult = await router.execute(readRequest);
assert.ok(readResult, 'Read result should exist');
assert.ok(readResult.ok === true, 'Read should succeed');
assert.ok(typeof readResult.trust_score === 'number', 'Read result should include trust_score');
assert.ok(typeof readResult.trust_level === 'string', 'Read result should include trust_level');

console.log('PASS tool_router: read returns trust score');

// Test: clean mail should let reply through normally
const wm2 = new TestWorkingMemory();
wm2.setCurrentItem('mail', 'msg_clean_1', {
    ...cleanMail,
    message_id: 'msg_clean_1'
});

const router2 = createToolRouter({
    connectors: {
        mail: testMailApi,
        contacts: { async search() { return { ok: true, items: [] }; } }
    },
    workingMemory: wm2
});

const cleanReplyRequest = intentToStructuredRequest({
    domain: 'mail',
    action: 'reply_current',
    entities: {
        reply_target: 'Alice Martin',
        draft_text: 'Sure, 3pm works for me!',
        auto_send: true
    },
    locale: 'en-US'
});

const cleanReplyResult = await router2.execute(cleanReplyRequest);
assert.ok(cleanReplyResult, 'Clean reply result should exist');
// Clean mail — should NOT be blocked, should go through normally
assert.ok(
    !cleanReplyResult.trust_level || cleanReplyResult.trust_level === 'trusted',
    `Clean mail reply should not be blocked, got trust_level=${cleanReplyResult.trust_level}`
);
assert.ok(!cleanReplyResult.confirmation_required, 'Clean mail reply should not require confirmation from trust gate');

console.log('PASS tool_router: clean mail allows reply through');

console.log('\n=== ALL mail_trust_scoring TESTS PASSED ===');
