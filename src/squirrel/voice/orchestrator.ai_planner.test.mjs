import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';
import { createGlobalMailApi } from '../mail/bootstrap.js';

const runtime = createVoiceSessionRuntime();

const createStubCalendarApi = (titles = ['Déjeuner avec Paul']) => ({
    async syncPull() {
        return {
            ok: true,
            items: titles.map((title, index) => ({
                id: `calendar_stub_${index + 1}`,
                title
            }))
        };
    },
    async search() {
        return {
            ok: true,
            items: titles.map((title, index) => ({
                id: `calendar_stub_${index + 1}`,
                title
            }))
        };
    },
    async today() {
        return { ok: true, items: [] };
    },
    async next() {
        return {
            ok: true,
            items: titles.map((title, index) => ({
                id: `calendar_stub_${index + 1}`,
                title
            }))
        };
    },
    async read(eventId) {
        return {
            ok: true,
            event: {
                id: eventId || 'calendar_stub_1',
                title: titles[0] || 'Rendez-vous'
            }
        };
    }
});

const calls = [];
const env = {
    Squirrel: {
        contacts: {
            async syncPull() {
                return {
                    ok: true,
                    items: [
                        {
                            source_contact_id: 'contact_seed_1',
                            name: 'Alice Durand',
                            phone: '+33601020304',
                            email: 'alice@example.test'
                        }
                    ]
                };
            },
            async list() {
                return {
                    ok: true,
                    items: [
                        {
                            source_contact_id: 'contact_seed_1',
                            name: 'Alice Durand',
                            phone: '+33601020304',
                            email: 'alice@example.test'
                        }
                    ]
                };
            },
            async search(query) {
                return {
                    ok: true,
                    query,
                    items: [
                        {
                            source_contact_id: 'contact_seed_1',
                            name: 'Alice Durand',
                            phone: '+33601020304',
                            email: 'alice@example.test'
                        }
                    ]
                };
            },
            async read(contactId) {
                return {
                    ok: true,
                    contact: {
                        source_contact_id: contactId || 'contact_seed_1',
                        name: 'Alice Durand',
                        phone: '+33601020304',
                        email: 'alice@example.test'
                    }
                };
            }
        }
    },
    AtomeAI: {
        async callTool(request = {}) {
            calls.push(request);
            return {
                status: 'OK',
                human_summary: `${request.tool_name} executed`
            };
        }
    }
};

const aiPlanner = {
    async planUtterance(utterance, options = {}) {
        if (String(utterance) === 'stop') {
            throw new Error('local commands should not reach the ai planner');
        }
        if (String(utterance) === 'Lis mes mails') {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_mail',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                assistant_reply: 'Je regarde tes mails.',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'mail.list',
                        params: { limit: 5 }
                    }]
                }
            };
        }
        return {
            intent_id: options.intent_id || 'voice_ai_intent_1',
            utterance: { raw: utterance },
            locale: options.locale || 'fr-FR',
            type: 'agent_tool',
            domain: 'contacts',
            action: 'list_contacts',
            status: 'ready',
            assistant_reply: 'Je lis les contacts.',
            execution: {
                target: 'atome_ai',
                confirmation_required: false,
                toolchain: [{
                    source: 'atome_ai',
                    tool_name: 'contacts.list',
                    params: { limit: 5 }
                }]
            }
        };
    }
};

const orchestrator = createVoiceOrchestrator({
    env,
    aiPlanner,
    sessionRuntime: runtime
});

const session = runtime.createSession({
    session_id: 'voice_ai_session_orchestrator'
});

const executed = await orchestrator.executeUtterance('Lis mes contacts', {
    session_id: session.session_id,
    trace_id: 'trace_voice_contacts'
});

assert.equal(executed.ok, true, 'voice orchestrator should execute ai planned toolchains');
assert.equal(executed.transport, 'contacts_api', 'voice orchestrator should execute contacts queries through the deterministic contacts API');
assert.match(executed.spoken_reply || '', /Alice Durand/i, 'voice orchestrator should verbalize contacts API results');
assert.equal(calls.length, 0, 'voice orchestrator should not invoke AtomeAI when a deterministic contacts route exists');

const localCommand = await orchestrator.executeUtterance('stop', {
    session_id: session.session_id
});
assert.equal(localCommand.transport, 'voice_runtime', 'local commands should remain outside the ai planner');

const heuristicMail = await orchestrator.executeUtterance('Lis mes mails', {
    session_id: session.session_id
});
assert.equal(heuristicMail.transport, 'mail_api', 'mail requests should execute through the deterministic mail connector even when AI planning is available');
assert.equal(calls.length, 0, 'mail requests should not invoke AtomeAI when a deterministic business connector route exists');

const failingOrchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: runtime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_fail',
                utterance: { raw: utterance },
                locale: options.locale || 'en-US',
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'failed',
                assistant_reply: 'The AI is not responding.',
                context: { ai_error: 'provider_timeout' },
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});

const failed = await failingOrchestrator.executeUtterance('Open the project', {
    session_id: session.session_id,
    locale: 'en-US'
});

assert.equal(failed.ok, false, 'voice orchestrator should surface ai planner failures as execution failures');
assert.equal(failed.spoken_reply, 'The AI is not responding.', 'voice orchestrator should preserve localized spoken failures');

const fallbackOrchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: runtime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_none',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});

const fallbackMail = await fallbackOrchestrator.executeUtterance('Lis mes mails', {
    session_id: session.session_id
});
assert.equal(fallbackMail.transport, 'mail_api', 'voice orchestrator should fall back to deterministic business routing when the ai planner returns no executable plan');

const contactsContextMailEnv = {};
const contactsContextMailApi = createGlobalMailApi({ env: contactsContextMailEnv });
contactsContextMailApi.ingest([
    {
        message_id: 'voice_ai_mail_contacts_ctx_oldest',
        mailbox: 'inbox',
        thread_id: 'voice_ai_mail_contacts_ctx_thread',
        subject: 'Alpha ancien',
        preview: 'Contenu ancien robot alpha',
        body_text: 'Contenu ancien robot alpha',
        from: { name: 'Regis', address: 'jeezs@jeezs.net' },
        unread: false,
        received_at: '2026-03-18T08:00:00.000Z'
    },
    {
        message_id: 'voice_ai_mail_contacts_ctx_newest',
        mailbox: 'inbox',
        thread_id: 'voice_ai_mail_contacts_ctx_thread',
        subject: 'Beta recent',
        preview: 'Contenu recent robot beta',
        body_text: 'Contenu recent robot beta',
        from: { name: 'Regis', address: 'jeezs@jeezs.net' },
        unread: true,
        received_at: '2026-03-22T08:00:00.000Z'
    }
]);
const contactsContextRuntime = createVoiceSessionRuntime();
const contactsContextSession = contactsContextRuntime.createSession({
    session_id: 'voice_ai_session_contacts_context_mail'
});
contactsContextRuntime.bindIntentContext(contactsContextSession.session_id, {
    intent_id: 'voice_contacts_context_active',
    type: 'connector_tool',
    domain: 'contacts',
    action: 'search_contacts',
    status: 'pending_connector',
    utterance: { raw: "Donne moi l'adresse mail de Regis" },
    entities: {
        current_contact_id: 'contact_regis_primary',
        query_text: 'Regis'
    },
    execution: {
        target: 'pending_connector',
        confirmation_required: false,
        toolchain: []
    }
}, {
    phase: 'executed'
});
const contactsContextFailedPlanner = createVoiceOrchestrator({
    env: contactsContextMailEnv,
    sessionRuntime: contactsContextRuntime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_contacts_ctx_failed',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'ambiguous',
                domain: 'unknown',
                action: 'unknown',
                status: 'failed',
                assistant_reply: "L'IA est temporairement limitee.",
                context: { ai_error: 'provider_rate_limited' },
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});
const explicitMailAfterContactsFailure = await contactsContextFailedPlanner.executeUtterance('Lis moi le mail le plus ancien', {
    session_id: contactsContextSession.session_id
});
assert.equal(explicitMailAfterContactsFailure.transport, 'mail_api', 'explicit mail reads should stay on the mail connector even after a contacts turn when the planner is rate-limited');
assert.match(explicitMailAfterContactsFailure.reply_text || '', /Alpha ancien|Contenu ancien robot alpha/i, 'explicit oldest-mail reads should resolve against mailbox content instead of the active contacts result set');

const plannerMailReplyShouldUseConnector = createVoiceOrchestrator({
    env,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_mail_reply',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'mail',
                action: 'reply_current',
                status: 'ready',
                assistant_reply: 'Je réponds au mail et je l’envoie.',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'mail.reply',
                        params: { reply_target: 'Jean-Eric', draft_text: 'bien recu' }
                    }]
                }
            };
        }
    }
});

const connectorReply = await plannerMailReplyShouldUseConnector.executeUtterance('Reponds a Jean-Eric que j ai bien recu le mail');
assert.equal(connectorReply.transport, 'mail_api', 'mail reply should use the deterministic mail connector even when the ai planner proposes an AtomeAI action');
assert.notEqual(connectorReply.reply_text, 'Je réponds au mail et je l’envoie.', 'mail reply should not surface a planner placeholder instead of the transport result');

const placeholderMailEnv = {};
const placeholderMailApi = createGlobalMailApi({ env: placeholderMailEnv });
placeholderMailApi.ingest([
    {
        message_id: 'voice_ai_mail_placeholder_1',
        mailbox: 'inbox',
        thread_id: 'voice_ai_mail_placeholder_thread_1',
        subject: 'Nouveau message',
        preview: 'Comment tu vas ?',
        body_text: 'Comment tu vas ?',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        unread: true,
        received_at: '2026-03-20T20:00:00.000Z'
    }
]);
const placeholderMailRuntime = createVoiceSessionRuntime();
const placeholderMailOrchestrator = createVoiceOrchestrator({
    env: placeholderMailEnv,
    sessionRuntime: placeholderMailRuntime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_mail_placeholder',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'ambiguous',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                assistant_reply: String(utterance).toLowerCase().includes('alors')
                    ? 'Je suis en train de te préparer un résumé de tes mails non lus.'
                    : 'Je regarde tes nouveaux messages.',
                execution: {
                    target: 'none',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});
const placeholderMailSession = placeholderMailRuntime.createSession({
    session_id: 'voice_ai_session_orchestrator_mail_placeholder'
});
const placeholderMailList = await placeholderMailOrchestrator.executeUtterance('j ai de nouveaux messages ?', {
    session_id: placeholderMailSession.session_id
});
assert.equal(placeholderMailList.transport, 'mail_api', 'mail placeholders from the ai planner should be materialized into a real mail execution');
assert.match(placeholderMailList.reply_text, /mail\(s\) non lu\(s\)|mail non lu|mails non lus|Voici les mails non lus/i, 'mail placeholder planning should resolve to the actual unread mail response');
assert.notEqual(placeholderMailList.reply_text, 'Je regarde tes nouveaux messages.', 'mail placeholder planning should not leak the placeholder text');
const placeholderMailFollowup = await placeholderMailOrchestrator.executeUtterance('alors ?', {
    session_id: placeholderMailSession.session_id
});
assert.equal(placeholderMailFollowup.transport, 'mail_api', 'mail followups should stay on the deterministic mail route');
assert.notEqual(placeholderMailFollowup.reply_text, 'Je suis en train de te préparer un résumé de tes mails non lus.', 'mail followups should not leak planner progress placeholders');

const fuzzyMailEnv = {};
const fuzzyMailApi = createGlobalMailApi({ env: fuzzyMailEnv });
fuzzyMailApi.ingest([
    {
        message_id: 'voice_ai_mail_fuzzy_1',
        mailbox: 'inbox',
        thread_id: 'voice_ai_mail_fuzzy_thread_1',
        subject: 'Nouveau message',
        preview: 'Comment tu vas ?',
        body_text: 'Comment tu vas ?',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        unread: true,
        received_at: '2026-03-21T06:00:00.000Z'
    }
]);
const fuzzyMailOrchestrator = createVoiceOrchestrator({
    env: fuzzyMailEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_mail_fuzzy',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'mail.list',
                        params: { unread_only: true, limit: 5 }
                    }]
                }
            };
        }
    }
});
const fuzzyMailResult = await fuzzyMailOrchestrator.executeUtterance('j ai de noueavu message ?', {
    session_id: 'voice_ai_session_orchestrator_mail_fuzzy'
});
assert.equal(fuzzyMailResult.transport, 'mail_api', 'mail toolchains planned through AtomeAI should still execute through the deterministic mail connector');
assert.match(fuzzyMailResult.reply_text || '', /mail\(s\) non lu\(s\)|mail non lu|mails non lus/i, 'fuzzy mail requests should produce a real unread mail answer');

const structuredContactsEnv = {
    Squirrel: {
        contacts: {
            async syncPull() {
                return {
                    ok: true,
                    items: [{
                        source_contact_id: 'contact_structured_1',
                        name: 'Sylvain Godard',
                        phone: '08766567',
                        email: 'sylvain@example.test'
                    }]
                };
            },
            async search(query) {
                return {
                    ok: true,
                    query,
                    items: [{
                        source_contact_id: 'contact_structured_1',
                        name: 'Sylvain Godard',
                        phone: '08766567',
                        email: 'sylvain@example.test'
                    }]
                };
            },
            async read(contactId) {
                return {
                    ok: true,
                    contact: {
                        source_contact_id: contactId || 'contact_structured_1',
                        name: 'Sylvain Godard',
                        phone: '08766567',
                        email: 'sylvain@example.test'
                    }
                };
            }
        }
    }
};
const structuredContactsOrchestrator = createVoiceOrchestrator({
    env: structuredContactsEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_structured_contact',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'connector_tool',
                domain: 'contacts',
                action: 'read_contact',
                status: 'ready',
                assistant_reply: '',
                entities: {
                    query_text: 'Sylvain'
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            };
        }
    }
});
const structuredContactsResult = await structuredContactsOrchestrator.executeUtterance('Quel est le numero de Sylvain ?', {
    session_id: 'voice_ai_session_structured_contacts'
});
assert.equal(structuredContactsResult.transport, 'contacts_api', 'structured contact intents without legacy toolchains should execute through the contacts API');
assert.match(structuredContactsResult.reply_text || '', /08766567|Sylvain Godard/i, 'structured contact intents should return contact data instead of falling back to a free reply');

const senderFilterEnv = {};
const senderFilterMailApi = createGlobalMailApi({ env: senderFilterEnv });
senderFilterMailApi.ingest([
    {
        message_id: 'voice_ai_mail_filter_1',
        mailbox: 'inbox',
        thread_id: 'voice_ai_mail_filter_thread_1',
        subject: 'Nouveau message',
        preview: 'Comment tu vas ?',
        body_text: 'Comment tu vas ?',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        unread: true,
        received_at: '2026-03-21T06:00:00.000Z'
    },
    {
        message_id: 'voice_ai_mail_filter_2',
        mailbox: 'inbox',
        thread_id: 'voice_ai_mail_filter_thread_2',
        subject: 'Facture mars',
        preview: 'La facture est disponible',
        body_text: 'La facture est disponible',
        from: { name: 'Compta', address: 'compta@example.test' },
        unread: true,
        received_at: '2026-03-21T05:30:00.000Z'
    }
]);
const senderFilterOrchestrator = createVoiceOrchestrator({
    env: senderFilterEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_mail_filter',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'mail.list',
                        params: {
                            status_only: true,
                            not_from: 'Jean-Eric'
                        }
                    }]
                }
            };
        }
    }
});
const senderFilterResult = await senderFilterOrchestrator.executeUtterance('Ais je des messages d autres personnes que Jean-Eric ?', {
    session_id: 'voice_ai_session_orchestrator_mail_filter'
});
assert.equal(senderFilterResult.transport, 'mail_api', 'mail sender filters should still route through the deterministic mail connector');
assert.match(senderFilterResult.reply_text || '', /autres personnes que Jean-Eric/i, 'mail sender filters should be reflected in the spoken reply');
assert.match(senderFilterResult.reply_text || '', /Facture mars/i, 'mail sender exclusion should keep only matching mails');
assert.doesNotMatch(senderFilterResult.reply_text || '', /Nouveau message/i, 'mail sender exclusion should exclude Jean-Eric messages from the answer');

const synthesizedAgentReplyCalls = [];
const synthesizedAgentReplyOrchestrator = createVoiceOrchestrator({
    env: {
        Squirrel: {
            calendar: createStubCalendarApi(['Déjeuner avec Paul', 'Point projet'])
        },
        AtomeAI: {
            async callTool(request = {}) {
                synthesizedAgentReplyCalls.push(request);
                return {
                    status: 'OK',
                    result: {
                        ok: true,
                        items: [
                            { title: 'Déjeuner avec Paul' },
                            { title: 'Point projet' }
                        ]
                    }
                };
            }
        }
    },
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_calendar_synth',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'calendar',
                action: 'list_events',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'calendar.search',
                        params: { query: 'demain' }
                    }]
                }
            };
        }
    }
});
const synthesizedCalendarReply = await synthesizedAgentReplyOrchestrator.executeIntent({
    intent_id: 'voice_ai_intent_calendar_synth_execute',
    utterance: { raw: 'Quels sont mes rendez-vous demain ?' },
    locale: 'fr-FR',
    type: 'agent_tool',
    domain: 'calendar',
    action: 'list_events',
    status: 'ready',
    assistant_reply: '',
    execution: {
        target: 'atome_ai',
        confirmation_required: false,
        toolchain: [{
            source: 'atome_ai',
            tool_name: 'calendar.search',
            params: { query: 'demain' }
        }]
    }
}, {
    session_id: 'voice_ai_session_orchestrator_calendar_synth'
});
assert.equal(synthesizedCalendarReply.transport, 'calendar_api', 'calendar queries should execute through the deterministic calendar API');
assert.match(synthesizedCalendarReply.reply_text || '', /Déjeuner avec Paul|Point projet|rendez vous|rendez-vous/i, 'calendar tool results should be verbalized when the planner returned no assistant reply');

const synthesizedRuntimeReplyOrchestrator = createVoiceOrchestrator({
    env: {
        Squirrel: {
            calendar: createStubCalendarApi(['Déjeuner avec Paul'])
        }
    },
    bridge: {
        kind: 'runtime_v2',
        async callRuntimeTool() {
            return {
                ok: true,
                items: [
                    { title: 'Déjeuner avec Paul' }
                ]
            };
        }
    },
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_runtime_calendar_synth',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'runtime_tool',
                domain: 'calendar',
                action: 'list_events',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'runtime_v2',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'runtime_v2',
                        tool_id: 'calendar.list_events',
                        action: 'pointer.click',
                        input: { temporal_ref: 'tomorrow' }
                    }]
                }
            };
        }
    }
});
const synthesizedRuntimeCalendarReply = await synthesizedRuntimeReplyOrchestrator.executeIntent({
    intent_id: 'voice_ai_intent_runtime_calendar_synth_execute',
    utterance: { raw: 'Quels sont mes rendez-vous demain ?' },
    locale: 'fr-FR',
    type: 'runtime_tool',
    domain: 'calendar',
    action: 'list_events',
    status: 'ready',
    assistant_reply: '',
    execution: {
        target: 'runtime_v2',
        confirmation_required: false,
        toolchain: [{
            source: 'runtime_v2',
            tool_id: 'calendar.list_events',
            action: 'pointer.click',
            input: { temporal_ref: 'tomorrow' }
        }]
    }
}, {
    session_id: 'voice_ai_session_orchestrator_runtime_calendar_synth'
});
assert.equal(synthesizedRuntimeCalendarReply.transport, 'calendar_api', 'runtime calendar requests should also resolve through the deterministic calendar API when available');
assert.match(synthesizedRuntimeCalendarReply.reply_text || '', /Déjeuner avec Paul|rendez vous|rendez-vous/i, 'runtime calendar results should be verbalized when no assistant reply is provided');

const contactsConnectorEnv = {
    Squirrel: {
        contacts: {
            async syncPull() {
                return {
                    ok: true,
                    items: [
                        {
                            source_contact_id: 'contact_ai_1',
                            name: 'Chloe Martin',
                            phone: '+33600000000',
                            email: 'chloe@example.test'
                        }
                    ]
                };
            },
            async list() {
                return {
                    ok: true,
                    items: [
                        {
                            source_contact_id: 'contact_ai_1',
                            name: 'Chloe Martin',
                            phone: '+33600000000',
                            email: 'chloe@example.test'
                        }
                    ]
                };
            },
            async search(query) {
                return {
                    ok: true,
                    query,
                    items: [
                        {
                            source_contact_id: 'contact_ai_1',
                            name: 'Chloe Martin',
                            phone: '+33600000000',
                            email: 'chloe@example.test'
                        }
                    ]
                };
            },
            async read(contactId) {
                return {
                    ok: true,
                    contact: {
                        source_contact_id: contactId || 'contact_ai_1',
                        name: 'Chloe Martin',
                        phone: '+33600000000',
                        email: 'chloe@example.test'
                    }
                };
            }
        }
    }
};
const contactsConnectorOrchestrator = createVoiceOrchestrator({
    env: contactsConnectorEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_contacts_connector',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'contacts',
                action: 'list_contacts',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'contacts.list',
                        params: { limit: 5 }
                    }]
                }
            };
        }
    }
});
const contactsConnectorReply = await contactsConnectorOrchestrator.executeUtterance('lis mes contacts', {
    session_id: 'voice_ai_session_contacts_connector'
});
assert.equal(contactsConnectorReply.transport, 'contacts_api', 'contacts queries should execute through the deterministic contacts API');
assert.match(contactsConnectorReply.reply_text || '', /Chloe Martin/i, 'contacts deterministic execution should verbalize returned contacts');

const contactsConflictStore = [
    {
        source_contact_id: 'contact_regis_conflict_1',
        name: 'Regis',
        phone: '0825232456',
        email: ''
    }
];
const contactsConflictEnv = {
    Squirrel: {
        contacts: {
            async syncPull() {
                return {
                    ok: true,
                    items: contactsConflictStore.map((entry) => ({ ...entry }))
                };
            },
            async search(query = '') {
                const needle = String(query || '').trim().toLowerCase();
                return {
                    ok: true,
                    items: contactsConflictStore
                        .filter((entry) => `${entry.name} ${entry.phone} ${entry.email}`.toLowerCase().includes(needle))
                        .map((entry) => ({ ...entry }))
                };
            },
            async createLocalContact(input = {}) {
                const created = {
                    source_contact_id: `contact_regis_conflict_${contactsConflictStore.length + 1}`,
                    name: String(input.name || '').trim() || 'Sans nom',
                    phone: String(input.phone || '').trim(),
                    email: String(input.email || '').trim()
                };
                contactsConflictStore.push(created);
                return { ok: true, contact: { ...created } };
            },
            async updateLocalContact(contactId, changes = {}) {
                const index = contactsConflictStore.findIndex((entry) => entry.source_contact_id === contactId);
                if (index < 0) return { ok: false, error: 'contacts_not_found' };
                contactsConflictStore[index] = { ...contactsConflictStore[index], ...changes };
                return { ok: true, contact: { ...contactsConflictStore[index] } };
            }
        }
    },
    AtomeAI: {
        async callTool(request = {}) {
            calls.push(request);
            return {
                status: 'OK',
                human_summary: `${request.tool_name} executed`
            };
        }
    }
};
const contactsConflictOrchestrator = createVoiceOrchestrator({
    env: contactsConflictEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_contacts_conflict',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'contacts',
                action: 'create',
                status: 'ready',
                assistant_reply: 'Je cree le contact.',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'contacts.create',
                        params: {
                            name: 'Regis',
                            email: 'jeezs@jeezs.net'
                        }
                    }]
                }
            };
        }
    }
});
const contactsConflictReply = await contactsConflictOrchestrator.executeUtterance('Ajoute le mail suivant a Regis : jeezs@jeezs.net', {
    session_id: 'voice_ai_session_contacts_conflict'
});
assert.equal(contactsConflictReply.transport, 'contacts_api', 'contacts updates should prefer the deterministic contacts route over a conflicting AI create plan');
assert.match(contactsConflictReply.reply_text || '', /mis a jour/i, 'existing contact updates should be confirmed as updates');
assert.equal(contactsConflictStore.length, 1, 'conflicting AI create plans must not duplicate existing contacts');
assert.equal(contactsConflictStore[0].email, 'jeezs@jeezs.net', 'the existing contact should be updated in place');

const calendarConnectorEnv = {
    Squirrel: {
        calendar: createStubCalendarApi(['Déjeuner avec Paul'])
    }
};
const calendarConnectorStart = new Date();
calendarConnectorStart.setDate(calendarConnectorStart.getDate() + 1);
calendarConnectorStart.setHours(12, 0, 0, 0);
const calendarConnectorEnd = new Date(calendarConnectorStart.getTime() + (60 * 60 * 1000));
calendarConnectorEnv.Squirrel.calendar.search = async (_query, options = {}) => ({
    ok: true,
    items: [
        {
            id: 'calendar_ai_1',
            title: 'Déjeuner avec Paul',
            start: options?.start ? new Date(options.start).toISOString() : calendarConnectorStart.toISOString(),
            end: options?.end ? new Date(options.end).toISOString() : calendarConnectorEnd.toISOString()
        }
    ]
});
calendarConnectorEnv.Squirrel.calendar.next = async () => ({
    ok: true,
    items: [
        {
            id: 'calendar_ai_1',
            title: 'Déjeuner avec Paul',
            start: calendarConnectorStart.toISOString(),
            end: calendarConnectorEnd.toISOString()
        }
    ]
});
calendarConnectorEnv.Squirrel.calendar.read = async (eventId) => ({
    ok: true,
    event: {
        id: eventId || 'calendar_ai_1',
        title: 'Déjeuner avec Paul',
        start: calendarConnectorStart.toISOString(),
        end: calendarConnectorEnd.toISOString()
    }
});
const calendarConnectorOrchestrator = createVoiceOrchestrator({
    env: calendarConnectorEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            return {
                intent_id: options.intent_id || 'voice_ai_intent_calendar_connector',
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                type: 'agent_tool',
                domain: 'calendar',
                action: 'list_events',
                status: 'ready',
                assistant_reply: '',
                execution: {
                    target: 'atome_ai',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'atome_ai',
                        tool_name: 'calendar.search',
                        params: { temporal_ref: 'tomorrow' }
                    }]
                }
            };
        }
    }
});
const calendarConnectorReply = await calendarConnectorOrchestrator.executeUtterance('quels sont mes rendez vous demain ?', {
    session_id: 'voice_ai_session_calendar_connector'
});
assert.equal(calendarConnectorReply.transport, 'calendar_api', 'calendar queries should execute through the deterministic calendar API');
assert.match(calendarConnectorReply.reply_text || '', /Déjeuner avec Paul/i, 'calendar deterministic execution should verbalize returned events');

console.log('voice_orchestrator_ai_planner: ok');
