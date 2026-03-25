import assert from 'node:assert/strict';

import { intentToStructuredRequest } from './semantic_contract.js';

const contactsRequest = intentToStructuredRequest({
    domain: 'contacts',
    action: 'update',
    entities: {
        query_text: 'Regis',
        email: 'jeezs@jeezs.net'
    },
    execution: {
        target: 'pending_connector',
        toolchain: []
    }
});

assert.equal(contactsRequest.domain, 'contacts');
assert.equal(contactsRequest.operation, 'update');
assert.equal(contactsRequest.filters.query_text, 'Regis');
assert.equal(contactsRequest.payload.email, 'jeezs@jeezs.net', 'structured requests should preserve planner top-level contact payload fields');

const calendarRequest = intentToStructuredRequest({
    domain: 'calendar',
    action: 'create_event',
    entities: {
        temporal_ref: 'tomorrow',
        time_hint: '15:00',
        participant_hint: 'Paul'
    },
    execution: {
        target: 'pending_connector',
        toolchain: []
    }
});

assert.equal(calendarRequest.domain, 'calendar');
assert.equal(calendarRequest.operation, 'create');
assert.equal(calendarRequest.filters.temporal_ref, 'tomorrow');
assert.equal(calendarRequest.payload.time_hint, '15:00');
assert.equal(calendarRequest.payload.participant_hint, 'Paul');

console.log('voice_semantic_contract_entities_payload: ok');
