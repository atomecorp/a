import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
globalThis.localStorage = globalThis.localStorage || {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {}
};

const { classifyVoiceIntent } = await import('./intent_schema.js');
const { createVoiceOrchestrator } = await import('./orchestrator.js');
const { createVoiceSessionRuntime } = await import('./session_runtime.js');

const runtimeTools = [
    { tool_id: 'calendar.ensure_calendar', tool_key: 'calendar_ensure_calendar' },
    { tool_id: 'calendar.list_events', tool_key: 'calendar_list_events' },
    { tool_id: 'calendar.create_event', tool_key: 'calendar_create_event' }
];

const env = {
    async handleAtomeMCPRequestAsync(request = {}) {
        if (request.method === 'runtime.tools.list') {
            return { jsonrpc: '2.0', id: request.id, result: { tools: runtimeTools } };
        }
        if (request.method === 'runtime.tools.call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: { ok: true, tool_id: request.params.tool_id }
            };
        }
        if (request.method === 'runtime.tools.batch_call') {
            return {
                jsonrpc: '2.0',
                id: request.id,
                result: {
                    ok: true,
                    results: request.params.events.map((entry) => ({ ok: true, tool_id: entry.tool_id }))
                }
            };
        }
        return { jsonrpc: '2.0', id: request.id, error: { message: `Unhandled ${request.method}` } };
    }
};

const runtime = createVoiceSessionRuntime();
const orchestrator = createVoiceOrchestrator({
    env,
    sessionRuntime: runtime
});

const mailSession = runtime.createSession({ session_id: 'voice_priority_mail' });
const calendarSession = runtime.createSession({ session_id: 'voice_priority_calendar' });

const mailList = await orchestrator.executeUtterance('Lis mes mails', {
    session_id: mailSession.session_id
});
assert.equal(mailList.transport, 'mail_api');
assert.deepEqual(mailList.intent.requested_capabilities, ['mail_list']);

const mailNext = await orchestrator.executeUtterance('Lis le suivant', {
    session_id: mailSession.session_id
});
assert.equal(mailNext.transport, 'mail_api');
assert.deepEqual(mailNext.intent.requested_capabilities, ['mail_next_unread']);

const mailReply = await orchestrator.executeUtterance('Reponds que je m en occupe demain', {
    session_id: mailSession.session_id
});
assert.equal(mailReply.transport, 'mail_api');
assert.deepEqual(mailReply.intent.requested_capabilities, ['mail_reply_draft']);
assert.equal(mailReply.intent.entities.draft_text, 'que je m en occupe demain');

const calendarList = await orchestrator.executeUtterance('Quels sont mes rendez-vous demain', {
    session_id: calendarSession.session_id
});
assert.equal(calendarList.executed, true);
assert.equal(calendarList.transport, 'calendar_api');
assert.equal(Array.isArray(calendarList.result?.items), true);

const calendarCreate = await orchestrator.executeUtterance('Ajoute un rendez-vous demain a 15h avec Paul', {
    session_id: calendarSession.session_id
});
assert.equal(calendarCreate.executed, true);
assert.deepEqual(
    calendarCreate.result.results.map((entry) => entry.tool_id),
    ['calendar.ensure_calendar', 'calendar.create_event']
);

const bankSummary = await orchestrator.executeUtterance('Ou en est mon compte');
assert.ok(
    ['pending_connector', 'bank_api'].includes(bankSummary.transport),
    'bank summary should remain on a business connector transport'
);
assert.deepEqual(
    bankSummary.intent?.requested_capabilities || bankSummary.requested_capabilities,
    ['bank_balance', 'bank_summary']
);

const stopIntent = classifyVoiceIntent('Arrete', {
    runtime_tools: runtimeTools
});
assert.equal(stopIntent.execution.target, 'voice_runtime');
assert.equal(stopIntent.action, 'stop');

const nextIntent = classifyVoiceIntent('Passe au suivant', {
    runtime_tools: runtimeTools
});
assert.equal(nextIntent.execution.target, 'voice_runtime');
assert.equal(nextIntent.action, 'next');

console.log('voice_priority_flows: ok');
