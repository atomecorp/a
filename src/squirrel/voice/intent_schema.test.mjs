import assert from 'node:assert/strict';

import {
    VOICE_INTENT_SCHEMA_VERSION,
    classifyVoiceIntent,
    normalizeVoiceIntent
} from './intent_schema.js';

const runtimeTools = [
    { tool_id: 'tool.main.mtrack', tool_key: 'main_mtrack' },
    { tool_id: 'tool.main.time', tool_key: 'main_time' },
    { tool_id: 'tool.main.capture', tool_key: 'main_capture' },
    { tool_id: 'ui.circle', tool_key: 'circle' },
    { tool_id: 'ui.text.create', tool_key: 'text_create' },
    { tool_id: 'ui.select', tool_key: 'select' },
    { tool_id: 'ui.move', tool_key: 'move' },
    { tool_id: 'ui.play', tool_key: 'play' },
    { tool_id: 'ui.pause', tool_key: 'pause' },
    { tool_id: 'calendar.ensure_calendar', tool_key: 'calendar_ensure_calendar' },
    { tool_id: 'calendar.list_events', tool_key: 'calendar_list_events' },
    { tool_id: 'calendar.create_event', tool_key: 'calendar_create_event' }
];

const localIntent = classifyVoiceIntent('Passe au suivant', {
    intent_id: 'voice_intent_test_local',
    runtime_tools: runtimeTools
});
assert.equal(localIntent.schema_version, VOICE_INTENT_SCHEMA_VERSION);
assert.equal(localIntent.type, 'local_command');
assert.equal(localIntent.domain, 'conversation_control');
assert.equal(localIntent.action, 'next');
assert.equal(localIntent.execution.target, 'voice_runtime');

const calendarQuery = classifyVoiceIntent('Quels sont mes rendez-vous demain ?', {
    runtime_tools: runtimeTools
});
assert.equal(calendarQuery.domain, 'calendar');
assert.equal(calendarQuery.action, 'list_events');
assert.equal(calendarQuery.execution.target, 'runtime_v2');
assert.equal(calendarQuery.execution.toolchain[0].tool_id, 'calendar.list_events');
assert.equal(calendarQuery.entities.temporal_ref, 'tomorrow');

const calendarCreate = classifyVoiceIntent('Ajoute un rendez-vous demain a 15h avec Paul', {
    runtime_tools: runtimeTools
});
assert.equal(calendarCreate.domain, 'calendar');
assert.equal(calendarCreate.action, 'create_event');
assert.deepEqual(
    calendarCreate.execution.toolchain.map((step) => step.tool_id),
    ['calendar.ensure_calendar', 'calendar.create_event']
);
assert.equal(calendarCreate.entities.time_hint, '15:00');
assert.equal(calendarCreate.entities.participant_hint, 'Paul');

const runtimeIntent = classifyVoiceIntent('Ouvre Mtrack', {
    runtime_tools: runtimeTools
});
assert.equal(runtimeIntent.domain, 'media');
assert.equal(runtimeIntent.action, 'open_mtrack');
assert.equal(runtimeIntent.execution.toolchain[0].tool_id, 'tool.main.mtrack');

const creativeIntent = classifyVoiceIntent('Dessine un cercle', {
    runtime_tools: runtimeTools
});
assert.equal(creativeIntent.domain, 'creative');
assert.equal(creativeIntent.execution.toolchain[0].tool_id, 'ui.circle');

const bankIntent = classifyVoiceIntent('Romeo m a t il paye ce mois ci ?', {
    runtime_tools: runtimeTools
});
assert.equal(bankIntent.domain, 'bank');
assert.equal(bankIntent.action, 'find_payer');
assert.equal(bankIntent.execution.target, 'pending_connector');
assert.deepEqual(bankIntent.requested_capabilities, ['bank_find_payer']);

const mailIntent = classifyVoiceIntent('Lis mes mails', {
    runtime_tools: runtimeTools
});
assert.equal(mailIntent.domain, 'mail');
assert.equal(mailIntent.action, 'read');
assert.equal(mailIntent.execution.target, 'pending_connector');

const mailSummaryIntent = classifyVoiceIntent('Fais moi un résumé de mes nouveaux mails', {
    runtime_tools: runtimeTools
});
assert.equal(mailSummaryIntent.type, 'connector_toolchain');
assert.equal(mailSummaryIntent.domain, 'mail');
assert.equal(mailSummaryIntent.action, 'summarize');
assert.equal(mailSummaryIntent.execution.target, 'pending_connector');

const unreadMailIntent = classifyVoiceIntent('Ais je de nouveaux mails nion lues ?', {
    runtime_tools: runtimeTools
});
assert.equal(unreadMailIntent.domain, 'mail');
assert.equal(unreadMailIntent.action, 'list');
assert.equal(unreadMailIntent.entities.unread_only, true);
assert.equal(unreadMailIntent.entities.status_only, true);

const mailSendIntent = classifyVoiceIntent('Envoie le mail', {
    runtime_tools: runtimeTools
});
assert.equal(mailSendIntent.domain, 'mail');
assert.equal(mailSendIntent.action, 'send');
assert.equal(mailSendIntent.execution.confirmation_required, false);

const mailArchiveIntent = classifyVoiceIntent('Archive ce mail', {
    runtime_tools: runtimeTools
});
assert.equal(mailArchiveIntent.domain, 'mail');
assert.equal(mailArchiveIntent.action, 'archive');
assert.deepEqual(mailArchiveIntent.requested_capabilities, ['mail_archive']);

const mailDeleteIntent = classifyVoiceIntent('Supprime ce mail', {
    runtime_tools: runtimeTools
});
assert.equal(mailDeleteIntent.domain, 'mail');
assert.equal(mailDeleteIntent.action, 'delete');
assert.deepEqual(mailDeleteIntent.requested_capabilities, ['mail_delete']);

const mailMarkUnreadIntent = classifyVoiceIntent('Marque ce mail comme non lu', {
    runtime_tools: runtimeTools
});
assert.equal(mailMarkUnreadIntent.domain, 'mail');
assert.equal(mailMarkUnreadIntent.action, 'mark_unread');
assert.equal(mailMarkUnreadIntent.execution.toolchain[0]?.input?.read, false);

const directReplyIntent = classifyVoiceIntent('Reponds a Jean-Eric que j ai bien recu le mail', {
    runtime_tools: runtimeTools
});
assert.equal(directReplyIntent.domain, 'mail');
assert.equal(directReplyIntent.action, 'reply');
assert.deepEqual(directReplyIntent.requested_capabilities, ['mail_reply_draft']);
assert.equal(directReplyIntent.entities.reply_target, 'Jean-Eric');
assert.equal(directReplyIntent.entities.draft_text, 'j ai bien recu le mail');

const contextualReplyIntent = classifyVoiceIntent('Reponds a Jean-Eric que j ai bien recu le mail', {
    runtime_tools: runtimeTools,
    context: {
        active_domain: 'mail'
    }
});
assert.equal(contextualReplyIntent.domain, 'mail');
assert.equal(contextualReplyIntent.action, 'reply_current');
assert.equal(contextualReplyIntent.execution.target, 'pending_connector');
assert.equal(contextualReplyIntent.entities.reply_target, 'Jean-Eric');
assert.equal(contextualReplyIntent.entities.draft_text, 'j ai bien recu le mail');

const contextualArchiveIntent = classifyVoiceIntent('Archive le', {
    runtime_tools: runtimeTools,
    context: {
        active_domain: 'mail'
    }
});
assert.equal(contextualArchiveIntent.domain, 'mail');
assert.equal(contextualArchiveIntent.action, 'archive_current');
assert.deepEqual(contextualArchiveIntent.requested_capabilities, ['mail_archive']);

const contextualDeleteIntent = classifyVoiceIntent('Supprime le', {
    runtime_tools: runtimeTools,
    context: {
        active_domain: 'mail'
    }
});
assert.equal(contextualDeleteIntent.domain, 'mail');
assert.equal(contextualDeleteIntent.action, 'delete_current');
assert.deepEqual(contextualDeleteIntent.requested_capabilities, ['mail_delete']);

const aiFirstHeuristic = classifyVoiceIntent('Lis mes mails', {
    runtime_tools: runtimeTools,
    allow_business_heuristics: false
});
assert.equal(aiFirstHeuristic.status, 'ambiguous');
assert.equal(aiFirstHeuristic.execution.target, 'none');

const normalized = normalizeVoiceIntent({
    utterance: '  Ouvre calendrier  ',
    type: 'runtime_tool',
    domain: 'calendar',
    status: 'ready',
    execution: {
        target: 'runtime_v2',
        toolchain: [{ source: 'runtime_v2', tool_id: 'tool.main.time', action: 'pointer.click' }]
    }
});
assert.equal(normalized.utterance.normalized, 'ouvre calendrier');
assert.equal(normalized.execution.toolchain[0].tool_id, 'tool.main.time');

console.log('voice_intent_schema: ok');
