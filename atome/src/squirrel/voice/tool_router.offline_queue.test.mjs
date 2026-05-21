import assert from 'node:assert/strict';

import { createToolRouter } from './tool_router.js';
import {
    createCalendarRequest,
    createContactsRequest
} from './semantic_contract.js';

const contactsStore = [];
const calendarStore = [];

let contactsOnline = false;
let calendarOnline = false;

const contactsApi = {
    async createLocalContact(payload = {}) {
        if (!contactsOnline) return { ok: false, offline: true, error: 'Server unreachable' };
        const contact = {
            source_contact_id: `contact_${contactsStore.length + 1}`,
            ...payload
        };
        contactsStore.push(contact);
        return { ok: true, contact };
    },
    async list() {
        return {
            ok: true,
            items: contactsStore.map((entry) => ({ ...entry }))
        };
    }
};

const calendarApi = {
    async create(payload = {}) {
        if (!calendarOnline) return { ok: false, offline: true, error: 'Server unreachable' };
        const event = {
            id: `event_${calendarStore.length + 1}`,
            ...payload
        };
        calendarStore.push(event);
        return { ok: true, event };
    },
    async next() {
        return {
            ok: true,
            items: calendarStore.map((entry) => ({ ...entry }))
        };
    }
};

const router = createToolRouter({
    connectors: {
        contacts: contactsApi,
        calendar: calendarApi
    }
});

const confirmation = {
    confirmation_id: 'confirm_voice_test',
    actor_id: 'actor_voice_test',
    idempotency_key: 'idem_voice_test'
};

const queuedContact = await router.execute(createContactsRequest({
    operation: 'create',
    payload: {
        name: 'Sylvain Godard',
        phone: '0611223344'
    },
    source: {
        locale: 'fr-FR',
        actor_id: confirmation.actor_id
    },
    confirmation,
    idempotency_key: confirmation.idempotency_key
}));

assert.equal(queuedContact.ok, true, 'offline contact creation should still succeed as a queued mutation');
assert.equal(queuedContact.queued, true, 'offline contact creation should be marked queued');
assert.equal(queuedContact.executed, false, 'queued contact creation should not pretend to be executed');
assert.equal(router.listPendingMutations().length, 1, 'queued contact mutation should be persisted locally');
assert.equal(contactsStore.length, 0, 'offline contact mutation should not execute immediately');

contactsOnline = true;

const listedContacts = await router.execute(createContactsRequest({
    operation: 'list',
    source: {
        locale: 'fr-FR'
    }
}));

assert.equal(listedContacts.ok, true, 'contacts listing should still work after queue replay');
assert.equal(contactsStore.length, 1, 'queued contact mutation should replay once connectivity returns');
assert.equal(router.listPendingMutations().length, 0, 'contact queue should flush after successful replay');
assert.equal(listedContacts.items[0]?.name, 'Sylvain Godard', 'replayed contact should become visible through the normal connector path');

const queuedEvent = await router.execute(createCalendarRequest({
    operation: 'create',
    payload: {
        title: 'Dentiste',
        start_at: '2026-03-26T09:00:00.000Z'
    },
    source: {
        locale: 'fr-FR',
        actor_id: confirmation.actor_id
    },
    confirmation: {
        ...confirmation,
        confirmation_id: 'confirm_calendar_test',
        idempotency_key: 'idem_calendar_test'
    },
    idempotency_key: 'idem_calendar_test'
}));

assert.equal(queuedEvent.ok, true, 'offline calendar creation should be accepted into the queue');
assert.equal(queuedEvent.queued, true, 'offline calendar creation should be marked queued');
assert.equal(calendarStore.length, 0, 'offline calendar creation should not execute immediately');
assert.equal(router.listPendingMutations().length, 1, 'calendar mutation should join the local queue');

calendarOnline = true;

const listedEvents = await router.execute(createCalendarRequest({
    operation: 'list',
    source: {
        locale: 'fr-FR'
    }
}));

assert.equal(listedEvents.ok, true, 'calendar listing should still work after replay');
assert.equal(calendarStore.length, 1, 'queued calendar mutation should replay once connectivity returns');
assert.equal(router.listPendingMutations().length, 0, 'calendar queue should flush after successful replay');
assert.equal(listedEvents.items[0]?.title, 'Dentiste', 'replayed event should be visible through the normal connector path');

console.log('tool_router.offline_queue.test: PASS');
