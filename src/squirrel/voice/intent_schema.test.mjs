import assert from 'node:assert/strict';

import { classifyVoiceIntent } from './intent_schema.js';

const localCommand = classifyVoiceIntent('stop');
assert.equal(localCommand.type, 'local_command');
assert.equal(localCommand.domain, 'conversation_control');
assert.equal(localCommand.execution.target, 'voice_runtime');

const businessRequest = classifyVoiceIntent('Quel est le numero de Regis ?');
assert.equal(businessRequest.type, 'ambiguous');
assert.equal(businessRequest.domain, 'unknown');
assert.equal(businessRequest.execution.target, 'none');

const creativeRequest = classifyVoiceIntent('Peux-tu creer un cercle rouge ?');
assert.equal(creativeRequest.type, 'ambiguous');
assert.equal(creativeRequest.domain, 'unknown');
assert.equal(creativeRequest.execution.target, 'none');

console.log('voice_intent_schema: ok');
