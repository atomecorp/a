import assert from 'node:assert/strict';

import { createWorkingMemory } from './working_memory.js';

let tick = 0;
const memory = createWorkingMemory({
    now: () => {
        tick += 1;
        return tick;
    }
});

memory.setResultSet('contacts', [{
    source_contact_id: 'contact_memory_1',
    name: 'Regis'
}], 'source_contact_id');

memory.setCurrentItem('contacts', 'contact_memory_1', {
    source_contact_id: 'contact_memory_1',
    name: 'Regis'
});

memory.appendTurn({
    user: 'Ajoute jeezs@jeezs.net a Regis',
    assistant: 'Je mets a jour Regis.',
    domain: 'contacts',
    action: 'update'
});

memory.setSessionPreference('locale', 'fr-FR');

const activeEntity = memory.getActiveEntity('contacts');
const conversationContext = memory.getConversationContext({ turnLimit: 4, summaryLimit: 2 });
const snapshot = memory.snapshot();

assert.equal(activeEntity?.id, 'contact_memory_1', 'working memory should expose active entities as canonical session context');
assert.equal(conversationContext.turns.length, 1, 'working memory should keep recent conversation turns');
assert.equal(conversationContext.turns[0]?.domain, 'contacts', 'conversation turns should preserve semantic metadata');
assert.equal(snapshot.session_preferences?.locale, 'fr-FR', 'working memory snapshots should persist session preferences');

console.log('working_memory.session_authority.test: PASS');
process.exit(0);
