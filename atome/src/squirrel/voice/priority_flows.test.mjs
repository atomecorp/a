import assert from 'node:assert/strict';

import { createVoiceSessionRuntime } from './session_runtime.js';
import { createVoiceOrchestrator } from './orchestrator.js';

const runtime = createVoiceSessionRuntime();
const orchestrator = createVoiceOrchestrator({
    sessionRuntime: runtime
});

const session = runtime.createSession({
    session_id: 'voice_priority_flows_session'
});

runtime.startSpeaking(session.session_id, { text: 'Lecture interrompable' });
runtime.handleLocalCommand(session.session_id, 'stop');

const followup = orchestrator.planSessionFollowup(session.session_id, {
    consume: false
});

assert.equal(followup.action, 'unknown');
assert.equal(followup.context.followup_kind, 'resume_interrupted');

console.log('priority_flows.test: PASS');
