import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';
import { normalizeVoiceIntent } from './intent_schema.js';
import { createGlobalMailApi } from '../mail/bootstrap.js';

const runtimeTools = [
    { tool_id: 'tool.main.mtrack', tool_key: 'main_mtrack' },
    { tool_id: 'calendar.ensure_calendar', tool_key: 'calendar_ensure_calendar' },
    { tool_id: 'calendar.create_event', tool_key: 'calendar_create_event' },
    { tool_id: 'calendar.list_events', tool_key: 'calendar_list_events' }
];

const createStructuredPlanner = () => ({
    async planUtterance(utterance, options = {}) {
        const raw = String(utterance || '').trim();
        const normalized = raw.toLowerCase();
        const locale = options.locale || 'fr-FR';
        const base = {
            intent_id: options.intent_id || `voice_test_${normalized.replace(/[^a-z0-9]+/g, '_')}`,
            utterance: { raw },
            locale,
            source: options.source,
            context: options.context
        };

        if (normalized === 'ouvre mtrack') {
            return normalizeVoiceIntent({
                ...base,
                type: 'runtime_tool',
                domain: 'ui_navigation',
                action: 'open_tool',
                status: 'ready',
                assistant_reply: 'J ouvre Mtrack.',
                execution: {
                    target: 'runtime_v2',
                    confirmation_required: false,
                    toolchain: [{
                        source: 'runtime_v2',
                        tool_id: 'tool.main.mtrack',
                        action: 'pointer.click',
                        input: {}
                    }]
                }
            });
        }

        if (normalized.includes('ajoute un rendez-vous demain a 15h avec paul')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'runtime_toolchain',
                domain: 'calendar',
                action: 'create_event',
                status: 'ready',
                entities: {
                    temporal_ref: 'tomorrow',
                    time_hint: '15:00',
                    participant_hint: 'Paul'
                },
                execution: {
                    target: 'runtime_v2',
                    confirmation_required: false,
                    toolchain: [
                        {
                            source: 'runtime_v2',
                            tool_id: 'calendar.ensure_calendar',
                            action: 'pointer.click',
                            input: {}
                        },
                        {
                            source: 'runtime_v2',
                            tool_id: 'calendar.create_event',
                            action: 'pointer.click',
                            input: {
                                temporal_ref: 'tomorrow',
                                time_hint: '15:00',
                                participant_hint: 'Paul'
                            }
                        }
                    ]
                }
            });
        }

        if (normalized === 'lis mes mails') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'marque le comme non lu') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'mark_unread_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'archive le') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'archive_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('resume de mes derniers mails') || normalized.includes('fais moi un resume de mes derniers mails')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'summarize',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('ais je de nouveaux mails') || normalized.includes('j ai de nouveaux mails')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                entities: {
                    unread_only: true,
                    status_only: true
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes("d autres personnes que jean-eric")) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'list',
                status: 'ready',
                entities: {
                    status_only: true,
                    not_from: 'Jean-Eric'
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('que contient ce mail') || normalized.includes('fais moi un resume')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'summarize_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.includes('mail le plus ancien')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'read_current',
                status: 'ready',
                entities: {
                    order: 'oldest'
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'lis le') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'read_current',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized.startsWith('reponds a jean-eric que ')) {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'reply_current',
                status: 'ready',
                entities: {
                    reply_target: 'Jean-Eric',
                    draft_text: 'j ai bien recu le mail',
                    auto_send: true
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'reponds oui tout va bien') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'reply_current',
                status: 'ready',
                entities: {
                    draft_text: 'oui tout va bien',
                    auto_send: true
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        if (normalized === 'envoie le mail') {
            return normalizeVoiceIntent({
                ...base,
                type: 'connector_tool',
                domain: 'mail',
                action: 'send',
                status: 'ready',
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }

        return normalizeVoiceIntent({
            ...base,
            type: 'ambiguous',
            domain: 'unknown',
            action: 'unknown',
            status: 'failed',
            assistant_reply: "Le planner IA n'a pas su classifier cette demande de test.",
            context: {
                ...(options.context && typeof options.context === 'object' ? options.context : {}),
                ai_error: 'test_planner_unmatched'
            },
            execution: {
                target: 'none',
                confirmation_required: false,
                toolchain: []
            }
        });
    }
});

const mcpCalls = [];
const runtime = createVoiceSessionRuntime();
const env = {
    async handleAtomeMCPRequestAsync(request = {}) {
        mcpCalls.push(request);
        if (request.method === 'runtime.tools.list') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    tools: runtimeTools
                }
            };
        }
        if (request.method === 'runtime.tools.call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    mode: 'single',
                    tool_id: request.params.tool_id
                }
            };
        }
        if (request.method === 'runtime.tools.batch_call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    mode: 'batch',
                    tx_id: request.params.tx_id,
                    results: request.params.events.map((entry) => ({ ok: true, tool_id: entry.tool_id }))
                }
            };
        }
        return {
            jsonrpc: '2.0',
            id: request.id,
            error: { message: `Unhandled ${request.method}` }
        };
    }
};

const orchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: runtime,
    aiPlanner: createStructuredPlanner()
});
const journalEvents = [];
const unsubscribe = orchestrator.subscribe((entry) => {
    journalEvents.push(entry.type);
});

const runtimeSession = runtime.createSession({
    session_id: 'voice_session_orchestrator_runtime'
});
const mailSession = runtime.createSession({
    session_id: 'voice_session_orchestrator_mail'
});

const planned = await orchestrator.planUtterance('Ajoute un rendez-vous demain a 15h avec Paul');
assert.equal(planned.domain, 'calendar');
assert.equal(planned.action, 'create_event');
assert.deepEqual(
    planned.execution.toolchain.map((step) => step.tool_id),
    ['calendar.ensure_calendar', 'calendar.create_event']
);

const openMtrack = await orchestrator.executeUtterance('Ouvre Mtrack', {
    session_id: runtimeSession.session_id,
    intent_id: 'voice_intent_orchestrator_mtrack',
    trace_id: 'voice_trace_mtrack'
});
assert.equal(openMtrack.ok, true);
assert.equal(openMtrack.executed, true);
assert.equal(openMtrack.transport, 'mcp');
assert.equal(openMtrack.result.tool_id, 'tool.main.mtrack');

const calendarCreate = await orchestrator.executeUtterance('Ajoute un rendez-vous demain a 15h avec Paul', {
    session_id: runtimeSession.session_id,
    intent_id: 'voice_intent_orchestrator_calendar',
    trace_id: 'voice_trace_calendar'
});
assert.equal(calendarCreate.ok, true);
assert.equal(calendarCreate.executed, true);
assert.equal(calendarCreate.result.mode, 'batch');
assert.deepEqual(
    calendarCreate.result.results.map((entry) => entry.tool_id),
    ['calendar.ensure_calendar', 'calendar.create_event']
);

const mailRead = await orchestrator.executeUtterance('Lis mes mails', {
    session_id: mailSession.session_id
});
assert.equal(mailRead.ok, false);
assert.equal(mailRead.executed, false);
assert.equal(mailRead.transport, 'mail_api');
assert.equal(mailRead.error, 'mail_credentials_missing');
assert.match(mailRead.reply_text, /configuration mail|reglages/i);

const mailEnsureReadyEnv = {
    atome: {
        mail: {
            __readyCalls: 0,
            async ensureReady() {
                this.__readyCalls += 1;
                return {
                    ok: true,
                    items: [
                        {
                            message_id: 'voice_mail_ready_1',
                            mailbox: 'inbox',
                            subject: 'Mail distant disponible',
                            preview: 'Le miroir Fastify a hydrate l index local',
                            body_text: 'Le miroir Fastify a hydrate l index local',
                            unread: true,
                            from: { address: 'alice@example.test' },
                            received_at: '2026-03-17T13:00:00Z'
                        }
                    ]
                };
            },
            connectorStatus() {
                return { ok: true, configured: false, provider: null };
            },
            list() {
                return {
                    ok: true,
                    items: [
                        {
                            message_id: 'voice_mail_ready_1',
                            mailbox: 'inbox',
                            subject: 'Mail distant disponible',
                            preview: 'Le miroir Fastify a hydrate l index local',
                            body_text: 'Le miroir Fastify a hydrate l index local',
                            unread: true,
                            from: { address: 'alice@example.test' },
                            received_at: '2026-03-17T13:00:00Z'
                        }
                    ]
                };
            },
            nextUnread() {
                return {
                    ok: true,
                    item: {
                        message_id: 'voice_mail_ready_1',
                        mailbox: 'inbox',
                        subject: 'Mail distant disponible',
                        preview: 'Le miroir Fastify a hydrate l index local',
                        body_text: 'Le miroir Fastify a hydrate l index local',
                        unread: true,
                        from: { address: 'alice@example.test' }
                    }
                };
            },
            buildReadout() {
                return {
                    ok: true,
                    text: 'De alice@example.test. Sujet: Mail distant disponible. Le miroir Fastify a hydrate l index local.'
                };
            },
            summarize() {
                return {
                    ok: true,
                    summary: '1 unread message out of 1.'
                };
            }
        }
    }
};
const readyOrchestrator = createVoiceOrchestrator({
    env: mailEnsureReadyEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const readyMail = await readyOrchestrator.executeUtterance('Lis mes mails');
assert.equal(readyMail.ok, true, 'mail ensureReady should unblock mail execution before the connector check');
assert.equal(readyMail.transport, 'mail_api');
assert.match(readyMail.reply_text, /Mail distant disponible/);
assert.equal(mailEnsureReadyEnv.atome.mail.__readyCalls, 1, 'mail ensureReady should be attempted once before pending connector execution');

const hostWindowMailRequests = [];
const hostWindow = {
    location: {
        origin: 'http://127.0.0.1:3000',
        protocol: 'http:',
        hostname: '127.0.0.1'
    },
    fetch: async (url, options = {}) => {
        hostWindowMailRequests.push({ url, options });
        return {
            ok: true,
            async json() {
                return {
                    ok: true,
                    provider: 'custom_imap_smtp',
                    mailbox: 'inbox',
                    items: [{
                        message_id: 'voice_mail_host_window_1',
                        mailbox: 'inbox',
                        subject: 'Mail via host window',
                        preview: 'Lecture depuis le host window',
                        body_text: 'Lecture depuis le host window',
                        unread: true,
                        from: { address: 'host@example.test' },
                        received_at: '2026-03-18T10:00:00Z'
                    }]
                };
            }
        };
    },
    Squirrel: {},
    atome: {},
    __eveProfilePreferences: {
        mail: {
            provider: 'custom_imap_smtp',
            email: 'jeezs@atome.one',
            username: 'jeezs@atome.one',
            password: 'secret-pass',
            mailbox: 'INBOX',
            imap: { host: 'rousse.o2switch.net', port: 993, security: 'tls' },
            smtp: { host: 'rousse.o2switch.net', port: 587, security: 'starttls' }
        }
    }
};
const partialVoiceEnv = {
    window: hostWindow,
    Squirrel: {},
    atome: {}
};
const hostWindowOrchestrator = createVoiceOrchestrator({
    env: partialVoiceEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const hostWindowMail = await hostWindowOrchestrator.executeUtterance('Lis mes mails');
assert.equal(hostWindowMail.ok, true, 'voice mail orchestration should resolve the mail API on the real host window when the injected env is partial');
assert.match(hostWindowMail.reply_text, /Mail via host window/i, 'voice mail orchestration should use the host-window mail transport when available');
assert.equal(hostWindowMailRequests[0]?.url, 'http://127.0.0.1:3000/api/eve/mail/sync', 'voice mail orchestration should sync through the host window loopback transport');

const localCommand = await orchestrator.executeUtterance('stop');
assert.equal(localCommand.ok, true);
assert.equal(localCommand.executed, false);
assert.equal(localCommand.transport, 'voice_runtime');

runtime.handleLocalCommand(mailSession.session_id, 'passe au suivant');
const nextIntent = orchestrator.planSessionFollowup(mailSession.session_id, {
    consume: false
});
assert.equal(nextIntent.action, 'next_item');
assert.deepEqual(nextIntent.requested_capabilities, ['mail_next_unread']);
const nextExecution = await orchestrator.executeSessionFollowup(mailSession.session_id);
assert.equal(nextExecution.executed, false);
assert.equal(nextExecution.transport, 'mail_api');

runtime.handleLocalCommand(mailSession.session_id, 'precedent');
const previousIntent = orchestrator.planSessionFollowup(mailSession.session_id);
assert.equal(previousIntent.action, 'previous_item');
assert.deepEqual(previousIntent.requested_capabilities, ['mail_list']);

runtime.handleLocalCommand(mailSession.session_id, 'reponds');
const replyIntent = orchestrator.planSessionFollowup(mailSession.session_id);
assert.equal(replyIntent.action, 'reply_current');
assert.deepEqual(replyIntent.requested_capabilities, ['mail_reply_draft']);

runtime.startSpeaking(runtimeSession.session_id, { text: 'Lecture interrompable' });
runtime.handleLocalCommand(runtimeSession.session_id, 'stop');
const resumeIntent = orchestrator.planSessionFollowup(runtimeSession.session_id);
assert.equal(resumeIntent.action, 'create_event', 'resume should revive the last bound active intent');
assert.equal(resumeIntent.execution.target, 'runtime_v2');

const confirmationMcpCalls = [];
const confirmationEnv = {
    async handleAtomeMCPRequestAsync(request = {}) {
        confirmationMcpCalls.push(request);
        if (request.method === 'runtime.tools.list') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    tools: runtimeTools
                }
            };
        }
        if (request.method === 'runtime.tools.call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    mode: 'single',
                    tool_id: request.params.tool_id
                }
            };
        }
        return {
            jsonrpc: '2.0',
            id: request.id,
            error: { message: `Unhandled ${request.method}` }
        };
    }
};
const confirmationOrchestrator = createVoiceOrchestrator({
    env: confirmationEnv,
    sessionRuntime: createVoiceSessionRuntime()
});
const confirmationGate = await confirmationOrchestrator.executeIntent({
    intent_id: 'voice_intent_confirm_delete',
    type: 'runtime_tool',
    domain: 'calendar',
    action: 'delete_event',
    status: 'ready',
    utterance: { raw: 'Confirme avant de supprimer ce rendez-vous' },
    execution: {
        target: 'runtime_v2',
        confirmation_required: true,
        toolchain: [{
            source: 'runtime_v2',
            tool_id: 'calendar.delete_event',
            action: 'pointer.click',
            input: { eventId: 'evt_1' }
        }]
    }
});
assert.equal(confirmationGate.executed, false);
assert.equal(confirmationGate.confirmation_required, true);
assert.equal(confirmationMcpCalls.length, 0, 'confirmation gate should not invoke MCP before approval');

const confirmedDelete = await confirmationOrchestrator.bridge.callRuntimeTool({
    tool_id: 'calendar.delete_event',
    action: 'pointer.click',
    input: { eventId: 'evt_1' }
});
assert.equal(confirmedDelete.ok, true);
assert.equal(confirmedDelete.tool_id, 'calendar.delete_event');
assert.equal(confirmationMcpCalls.length, 1, 'confirmed execution should invoke MCP exactly once');

const mailExecEnv = {};
const mailApi = createGlobalMailApi({ env: mailExecEnv });
mailApi.ingest([{
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

const stalledMailEnv = {
    __SQUIRREL_VOICE_MAIL_SYNC_TIMEOUT_MS: 5,
    Squirrel: {
        mail: {
            connectorStatus() {
                return { ok: true, configured: true, provider: 'icloud_imap_smtp' };
            },
            syncPull() {
                return new Promise(() => { });
            },
            list() {
                return {
                    ok: true,
                    items: [{
                        message_id: 'voice_mail_stalled_1',
                        subject: 'Resume hebdomadaire',
                        preview: 'Voici le resume',
                        body_text: 'Voici le resume',
                        from: { name: 'Alice', address: 'alice@example.test' }
                    }]
                };
            },
            nextUnread() {
                return {
                    ok: true,
                    item: {
                        message_id: 'voice_mail_stalled_1',
                        subject: 'Resume hebdomadaire',
                        preview: 'Voici le resume',
                        body_text: 'Voici le resume',
                        from: { name: 'Alice', address: 'alice@example.test' }
                    }
                };
            },
            buildReadout() {
                return {
                    ok: true,
                    text: 'De Alice. Sujet: Resume hebdomadaire. Voici le resume'
                };
            }
        }
    }
};
const stalledMailOrchestrator = createVoiceOrchestrator({
    env: stalledMailEnv,
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

const mailSummaryEnv = {};
const summaryMailApi = createGlobalMailApi({ env: mailSummaryEnv });
summaryMailApi.ingest([
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

const unreadMailEnv = {};
const unreadMailApi = createGlobalMailApi({ env: unreadMailEnv });
unreadMailApi.ingest([
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

const junkSubjectEnv = {};
const junkSubjectMailApi = createGlobalMailApi({ env: junkSubjectEnv });
junkSubjectMailApi.ingest([
    {
        message_id: 'voice_mail_junk_subject_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_junk_subject_1',
        subject: '?????',
        preview: 'Facture a regler avant vendredi',
        body_text: 'Facture a regler avant vendredi',
        from: { name: 'Compta', address: 'compta@example.test' },
        unread: true,
        received_at: '2026-03-20T14:00:00.000Z'
    }
]);
const junkSubjectOrchestrator = createVoiceOrchestrator({
    env: junkSubjectEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const junkSubjectResult = await junkSubjectOrchestrator.executeUtterance('Ais je de nouveaux mails non lus ?');
assert.match(junkSubjectResult.reply_text, /Facture a regler avant vendredi/i, 'unread status should fall back to preview text when the subject is unreadable');
assert.doesNotMatch(junkSubjectResult.reply_text, /\?{3,}/, 'unread status should not speak junk placeholder subjects');

const filteredMailEnv = {};
const filteredMailApi = createGlobalMailApi({ env: filteredMailEnv });
filteredMailApi.ingest([
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

const mailReplyEnv = {};
const replyMailApi = createGlobalMailApi({ env: mailReplyEnv });
replyMailApi.ingest([
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
assert.equal(replyResult.ok, true, 'mail reply should succeed when recent mail context exists');
assert.equal(replyResult.executed, true, 'mail reply should execute through the mail api');
assert.equal(replyResult.transport, 'mail_api', 'mail reply should stay on the mail api transport');
assert.equal(replyResult.result?.draft?.in_reply_to, 'voice_mail_reply_1', 'mail reply should target the matched sender mail');
assert.equal(replyResult.result?.draft?.body_text, 'j ai bien recu le mail', 'mail reply should sanitize the dictated body');
assert.equal(replyResult.result?.draft?.status, 'queued_local_only', 'mail reply with dictated body should send immediately');
assert.match(replyResult.reply_text, /mail a ete envoye|reponse a ete envoyee|file d'attente locale/i, 'mail reply with dictated body should acknowledge direct sending');
const sendResult = await replyOrchestrator.executeUtterance('Envoie le mail', {
    session_id: replySession.session_id
});
assert.equal(sendResult.ok, false, 'mail send should fail cleanly once the previous reply was already auto-sent');
assert.equal(sendResult.executed, false, 'mail send should not execute when no draft remains in session');
assert.equal(sendResult.transport, 'mail_api', 'mail send should stay on the mail api transport');
assert.match(sendResult.reply_text, /pas de brouillon|do not have a draft/i, 'mail send should explain that no draft remains after an auto-sent reply');

const directReplyEnv = {};
const directReplyMailApi = createGlobalMailApi({ env: directReplyEnv });
directReplyMailApi.ingest([
    {
        message_id: 'voice_mail_direct_reply_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_direct_reply_1',
        subject: 'Cool',
        preview: 'Cool',
        body_text: 'Cool',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        received_at: '2026-03-20T12:00:00.000Z'
    }
]);
const directReplyOrchestrator = createVoiceOrchestrator({
    env: directReplyEnv,
    sessionRuntime: createVoiceSessionRuntime(),
    aiPlanner: createStructuredPlanner()
});
const directReplyResult = await directReplyOrchestrator.executeUtterance('Reponds a Jean-Eric que j ai bien recu le mail');
assert.equal(directReplyResult.ok, true, 'mail reply should work even without a prior mail summary step');
assert.equal(directReplyResult.executed, true, 'mail reply should execute directly from a generic reply utterance');
assert.equal(directReplyResult.result?.draft?.in_reply_to, 'voice_mail_direct_reply_1', 'mail reply should still resolve the matching recent mail');
assert.equal(directReplyResult.result?.draft?.status, 'queued_local_only', 'generic direct reply should send immediately when body text is provided');

const misflaggedReplyEnv = {};
const misflaggedReplyMailApi = createGlobalMailApi({ env: misflaggedReplyEnv });
misflaggedReplyMailApi.ingest([
    {
        message_id: 'voice_mail_misflagged_reply_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_misflagged_reply_1',
        subject: 'Cool',
        body_text: 'Cool',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        received_at: '2026-03-20T12:00:00.000Z'
    }
]);
const misflaggedReplyOrchestrator = createVoiceOrchestrator({
    env: misflaggedReplyEnv,
    sessionRuntime: createVoiceSessionRuntime()
});
const misflaggedReplyResult = await misflaggedReplyOrchestrator.executeIntent({
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
}, { confirmed: true });
assert.equal(misflaggedReplyResult.executed, true, 'mail reply with confirmed:true should execute despite confirmation flag');
assert.equal(misflaggedReplyResult.result?.draft?.in_reply_to, 'voice_mail_misflagged_reply_1');
assert.equal(misflaggedReplyResult.result?.draft?.status, 'queued_local_only', 'misflagged reply should still send immediately');

const contextualReplyEnv = {};
const contextualReplyMailApi = createGlobalMailApi({ env: contextualReplyEnv });
contextualReplyMailApi.ingest([
    {
        message_id: 'voice_mail_contextual_reply_1',
        mailbox: 'inbox',
        thread_id: 'voice_thread_contextual_reply_1',
        subject: 'Salut, tu as encore de bonnes nouvelles aujourd hui ?',
        preview: 'Salut, tu as encore de bonnes nouvelles aujourd hui ?',
        body_text: 'Salut, tu as encore de bonnes nouvelles aujourd hui ?',
        from: { name: 'Jean-Eric Godard', address: 'jean-eric@example.test' },
        unread: true,
        received_at: '2026-03-21T07:50:00.000Z'
    }
]);
const contextualReplyRuntime = createVoiceSessionRuntime();
const contextualReplyOrchestrator = createVoiceOrchestrator({
    env: contextualReplyEnv,
    sessionRuntime: contextualReplyRuntime,
    aiPlanner: {
        async planUtterance(utterance, options = {}) {
            if (/j ai de nouveaux mails/i.test(String(utterance))) {
                return normalizeVoiceIntent({
                    intent_id: options.intent_id,
                    utterance: { raw: utterance },
                    locale: options.locale || 'fr-FR',
                    source: options.source,
                    context: options.context,
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
                            tool_name: 'mail.status',
                            params: { unread_only: true, status_only: true }
                        }]
                    }
                });
            }
            return normalizeVoiceIntent({
                intent_id: options.intent_id,
                utterance: { raw: utterance },
                locale: options.locale || 'fr-FR',
                source: options.source,
                context: options.context,
                type: 'connector_tool',
                domain: 'mail',
                action: 'reply_current',
                status: 'ready',
                assistant_reply: '',
                entities: {
                    draft_text: 'oui tout va bien',
                    auto_send: true
                },
                execution: {
                    target: 'pending_connector',
                    confirmation_required: false,
                    toolchain: []
                }
            });
        }
    }
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
assert.equal(contextualReplyResult.executed, true, 'contextual reply should execute immediately');
assert.equal(contextualReplyResult.transport, 'mail_api', 'contextual reply should stay on the mail api');
assert.equal(contextualReplyResult.result?.draft?.in_reply_to, 'voice_mail_contextual_reply_1', 'contextual reply should target the current unread mail');
assert.equal(contextualReplyResult.result?.draft?.body_text, 'oui tout va bien', 'contextual reply should preserve the dictated reply body');
assert.match(contextualReplyResult.reply_text, /mail a ete envoye|reponse a ete envoyee|file d'attente locale/i, 'contextual reply should acknowledge sending instead of listing unread mails');

const journal = orchestrator.listJournal({ limit: 10 });
assert.ok(journal.length >= 4, 'orchestrator should record planning/execution journal entries');
assert.ok(journal.some((entry) => entry.type === 'voice.intent.planned'));
assert.ok(journal.some((entry) => entry.type === 'voice.intent.executed'));
assert.ok(journalEvents.includes('voice.intent.planned'));
assert.ok(journalEvents.includes('voice.intent.executed'));
unsubscribe();

const methods = mcpCalls.map((entry) => entry.method);
assert.ok(methods.includes('runtime.tools.list'));
assert.ok(methods.includes('runtime.tools.call'));
assert.ok(methods.includes('runtime.tools.batch_call'));

console.log('voice_orchestrator: ok');
