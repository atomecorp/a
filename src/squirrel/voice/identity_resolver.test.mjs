import assert from 'node:assert/strict';

import { createWorkingMemory } from './working_memory.js';
import { resolveIdentityContext } from './identity_resolver.js';

const workingMemory = createWorkingMemory();
workingMemory.setCurrentItem('contacts', 'contact_identity_1', {
    source_contact_id: 'contact_identity_1',
    name: 'Regis Martin'
});

const contactsApi = {
    async search(query) {
        if (String(query).toLowerCase() !== 'sylvain') {
            return { ok: true, items: [] };
        }
        return {
            ok: true,
            items: [{
                source_contact_id: 'contact_identity_2',
                name: 'Sylvain Dupont',
                email: 'sylvain@example.test'
            }]
        };
    }
};

const deictic = await resolveIdentityContext({
    utterance: 'Ajoute ce mail a ce contact',
    workingMemory,
    connectors: { contacts: contactsApi }
});

assert.equal(deictic.resolved.some((entry) => entry.domain === 'contacts' && entry.entity_id === 'contact_identity_1'), true, 'identity resolver should use working memory for deictic references');

const named = await resolveIdentityContext({
    utterance: 'Quel est le numero de Sylvain ?',
    workingMemory,
    connectors: { contacts: contactsApi }
});

assert.equal(named.resolved.some((entry) => entry.label === 'Sylvain Dupont'), true, 'identity resolver should resolve named contacts through the connector search');
assert.equal(named.sources_queried.includes('contacts.search'), true, 'identity resolver should report queried sources');

console.log('identity_resolver.test: PASS');
process.exit(0);
