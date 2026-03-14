import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';

const runtimeTools = [
    { tool_id: 'tool.main.mtrack', tool_key: 'main_mtrack' },
    { tool_id: 'calendar.ensure_calendar', tool_key: 'calendar_ensure_calendar' },
    { tool_id: 'calendar.create_event', tool_key: 'calendar_create_event' },
    { tool_id: 'calendar.list_events', tool_key: 'calendar_list_events' }
];

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

const orchestrator = createVoiceOrchestrator({ env, sessionRuntime: runtime });
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
assert.equal(mailRead.ok, true);
assert.equal(mailRead.executed, false);
assert.equal(mailRead.transport, 'pending_connector');
assert.deepEqual(mailRead.requested_capabilities, ['mail_read', 'mail_next_unread']);

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
assert.equal(nextExecution.transport, 'pending_connector');

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

const callsBeforeConfirmation = mcpCalls.length;
const confirmationGate = await orchestrator.executeIntent({
    intent_id: 'voice_intent_confirm_delete',
    type: 'runtime_tool',
    domain: 'calendar',
    action: 'delete_event',
    status: 'ready',
    utterance: { raw: 'Supprime ce rendez-vous' },
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
assert.equal(mcpCalls.length, callsBeforeConfirmation, 'confirmation gate should not invoke MCP before approval');

const confirmedDelete = await orchestrator.executeIntent({
    intent_id: 'voice_intent_confirm_delete',
    type: 'runtime_tool',
    domain: 'calendar',
    action: 'delete_event',
    status: 'ready',
    utterance: { raw: 'Supprime ce rendez-vous' },
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
}, {
    confirmed: true
});
assert.equal(confirmedDelete.executed, true);
assert.equal(confirmedDelete.result.tool_id, 'calendar.delete_event');

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
