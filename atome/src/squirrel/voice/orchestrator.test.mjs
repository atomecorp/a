import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';
import {
    createHostWindowMailEnv,
    createMcpEnv,
    createReadyMailEnv,
    createStructuredPlanner
} from './orchestrator.test_fixture.mjs';

const mcpCalls = [];
const runtime = createVoiceSessionRuntime();
const env = createMcpEnv(mcpCalls);

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

const openHome = await orchestrator.executeUtterance('Ouvre Home', {
    session_id: runtimeSession.session_id,
    intent_id: 'voice_intent_orchestrator_home',
    trace_id: 'voice_trace_home'
});
assert.equal(openHome.ok, true);
assert.equal(openHome.executed, true);
assert.equal(openHome.transport, 'mcp');
assert.equal(openHome.result.tool_id, 'tool.main.home');

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

const mailEnsureReadyEnv = createReadyMailEnv();
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

const { env: partialVoiceEnv, requests: hostWindowMailRequests } = createHostWindowMailEnv();
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
const confirmationEnv = createMcpEnv(confirmationMcpCalls);
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
