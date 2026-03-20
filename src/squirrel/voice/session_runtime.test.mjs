import assert from 'node:assert/strict';

import {
    VOICE_LOCAL_COMMANDS,
    createVoiceSessionRuntime,
    normalizeLocalVoiceCommand
} from './session_runtime.js';

let tick = 0;
let seq = 0;

const runtime = createVoiceSessionRuntime({
    now: () => {
        tick += 1;
        return tick;
    },
    idFactory: (prefix = 'voice') => {
        seq += 1;
        return `${prefix}_${seq}`;
    },
    uiSink: (event) => uiEvents.push(event),
    mcpSink: (event) => mcpEvents.push(event)
});

const uiEvents = [];
const mcpEvents = [];
const internalEvents = [];
runtime.subscribe((event) => internalEvents.push(event));

const session = runtime.createSession({
    actor: { id: 'user_voice_1' },
    locale: 'fr-FR'
});

assert.equal(session.phase, 'created', 'new voice sessions should start in created state');
assert.equal(session.source.type, 'voice', 'voice sessions should expose voice as source type');
assert.equal(session.source.layer, 'voice_session_runtime', 'voice sessions should expose a stable source layer');

runtime.startCapture(session.session_id, { device: 'mic-default' });
let snapshot = runtime.getSession(session.session_id);
assert.equal(snapshot.phase, 'capturing', 'capture start should move the session to capturing');
assert.equal(snapshot.capture.state, 'capturing', 'capture state should track recording start');
assert.equal(snapshot.active_channels.includes('capture'), true, 'capture should expose an abortable channel');

runtime.stopCapture(session.session_id, { duration_ms: 900, bytes: 48000 });
snapshot = runtime.getSession(session.session_id);
assert.equal(snapshot.phase, 'captured', 'capture stop should move the session to captured');
assert.equal(snapshot.capture.state, 'stopped', 'capture state should track stop');
assert.equal(snapshot.capture.result.duration_ms, 900, 'capture result should be stored on the session');

runtime.startListening(session.session_id, { lang: 'fr-FR', partial: true, provider: 'host-macos' });
runtime.pushPartial(session.session_id, { text: 'Lis le mail suivant', confidence: 0.91 });
runtime.finalizeListening(session.session_id, {
    text: 'Lis le mail suivant',
    confidence: 0.93,
    segments: [{ text: 'Lis le mail suivant', startMs: 0, endMs: 1100 }]
});
snapshot = runtime.getSession(session.session_id);
assert.equal(snapshot.phase, 'processing', 'final STT should move the session to processing');
assert.equal(snapshot.transcript.final, 'Lis le mail suivant', 'final transcript should be stored');
assert.equal(snapshot.conversation.last_user_text, 'Lis le mail suivant', 'final transcript should become the last user text');

runtime.bindIntentContext(session.session_id, {
    intent_id: 'voice_intent_mail_current',
    type: 'connector_tool',
    domain: 'mail',
    action: 'read',
    status: 'pending_connector',
    requested_capabilities: ['mail_read'],
    execution: {
        target: 'pending_connector',
        toolchain: []
    }
}, {
    origin: 'session_runtime_test'
});
snapshot = runtime.getSession(session.session_id);
assert.equal(snapshot.conversation.active_intent.domain, 'mail', 'binding an intent should persist the active domain on the session');
assert.equal(runtime.getActiveIntent(session.session_id)?.action, 'read', 'runtime should expose the currently bound active intent');

runtime.startProcessing(session.session_id, { step: 'mcp_toolchain', target: 'mail.next_unread' });
const processingSignal = runtime.getAbortSignal(session.session_id, 'processing');
assert.equal(!!processingSignal, true, 'processing should expose an abort signal for backend work');
assert.equal(processingSignal.aborted, false, 'fresh processing abort signals should not be aborted');

runtime.startSpeaking(session.session_id, { text: 'Je lis le prochain mail.', voice_id: 'system-fr' });
const speakingContext = runtime.buildInvocationContext(session.session_id);
assert.equal(speakingContext.trace_id, session.trace_id, 'voice invocation context should preserve the session trace_id');
assert.equal(speakingContext.source.type, 'voice', 'voice invocation context should expose the voice source');
assert.equal(speakingContext.source.phase, 'speaking', 'voice invocation context should expose the current phase');

const summarizeCommand = runtime.handleLocalCommand(session.session_id, 'Resume');
snapshot = runtime.getSession(session.session_id);
assert.equal(summarizeCommand.matched, true, 'local summarize commands should be detected');
assert.equal(summarizeCommand.command, VOICE_LOCAL_COMMANDS.SUMMARIZE, 'resume should normalize to summarize');
assert.equal(snapshot.phase, 'interrupted', 'interrupting during TTS should move the session to interrupted');
assert.equal(processingSignal.aborted, true, 'local interruption should abort backend work immediately');
assert.equal(snapshot.conversation.pending_followup, 'summarize_current', 'summarize should queue a shorter followup');
assert.equal(snapshot.conversation.interrupted_from_phase, 'speaking', 'interruptions should preserve the previous phase');

const followup = runtime.consumePendingFollowup(session.session_id);
snapshot = runtime.getSession(session.session_id);
assert.equal(followup.followup, 'summarize_current', 'queued followups should be consumable after interruption');
assert.equal(snapshot.phase, 'processing', 'consuming a followup should move the session back to processing');
assert.equal(snapshot.intent_id, followup.context.intent_id, 'consuming a followup should rotate the intent id');

runtime.startSpeaking(session.session_id, { text: 'Resume court.' });
const previousCommand = runtime.handleLocalCommand(session.session_id, 'precedent');
snapshot = runtime.getSession(session.session_id);
assert.equal(previousCommand.command, VOICE_LOCAL_COMMANDS.PREVIOUS, 'precedent should normalize to previous');
assert.equal(snapshot.conversation.pending_followup, 'previous_item', 'previous should queue the previous item followup');
const previousFollowup = runtime.consumePendingFollowup(session.session_id);
assert.equal(previousFollowup.followup, 'previous_item', 'previous followups should also be consumable after interruption');

runtime.startSpeaking(session.session_id, { text: 'Resume court.' });
const stopCommand = runtime.handleLocalCommand(session.session_id, 'Ca suffit');
snapshot = runtime.getSession(session.session_id);
assert.equal(stopCommand.command, VOICE_LOCAL_COMMANDS.STOP, 'ca suffit should normalize to stop');
assert.equal(snapshot.conversation.pending_followup, null, 'pure stop should not queue a followup');
assert.equal(snapshot.conversation.resume_available, true, 'stopping spoken output should keep resume availability for later orchestration');
const resumeFollowup = runtime.consumePendingFollowup(session.session_id);
snapshot = runtime.getSession(session.session_id);
assert.equal(resumeFollowup.followup, 'resume_interrupted', 'consuming followup after a plain stop should resume the interrupted intent context');
assert.equal(snapshot.conversation.resume_available, false, 'consuming a resume followup should clear resume availability');

const cancelCommand = runtime.handleLocalCommand(session.session_id, 'annule');
snapshot = runtime.getSession(session.session_id);
assert.equal(cancelCommand.command, VOICE_LOCAL_COMMANDS.CANCEL, 'annule should normalize to cancel');
assert.equal(snapshot.phase, 'cancelled', 'cancel commands should close the current voice session');
assert.equal(snapshot.conversation.status, 'cancelled', 'cancel commands should update the conversation status');

assert.equal(normalizeLocalVoiceCommand('passe au suivant')?.command, VOICE_LOCAL_COMMANDS.NEXT, 'passe au suivant should normalize to next');
assert.equal(normalizeLocalVoiceCommand('precedent')?.command, VOICE_LOCAL_COMMANDS.PREVIOUS, 'precedent should normalize to previous');
assert.equal(normalizeLocalVoiceCommand('reponds')?.command, VOICE_LOCAL_COMMANDS.REPLY, 'reponds should normalize to reply');
assert.equal(normalizeLocalVoiceCommand('Fais moi un résumé de mes nouveaux mails'), null, 'business utterances containing resume should not be downgraded to local summarize commands');
assert.equal(normalizeLocalVoiceCommand('Reponds au message de Paul'), null, 'business utterances containing reponds should not be downgraded to local reply commands');
assert.equal(normalizeLocalVoiceCommand('bonjour'), null, 'non-command utterances should not be classified as local commands');

assert.equal(uiEvents.some((event) => event.type === 'voice.tts.state'), true, 'voice runtime should emit TTS events to the UI channel');
assert.equal(mcpEvents.some((event) => event.type === 'voice.interruption'), true, 'voice runtime should emit interruption events to the MCP channel');
assert.equal(internalEvents.some((event) => event.type === 'voice.capture.state'), true, 'voice runtime should expose the full event stream to internal listeners');

console.log('voice_session_runtime: ok');
