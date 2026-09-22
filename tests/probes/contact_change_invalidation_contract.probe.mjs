// A contact changes through two producers during a session: a local contact
// create/update/delete in the contacts service, and an update of the signed-in
// user's own profile identity. The Dashboard keeps its item list in a session
// cache, so both producers must invalidate the `contacts` category; otherwise a
// renamed contact or a replaced photo stays invisible on the contact vignette
// until the whole application is restarted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    CONTACT_CHANGE_EVENT_NAMES,
    subscribeContactChanges
} from '../../eVe/domains/user/contact_change_events.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';

assert.deepEqual(
    [...CONTACT_CHANGE_EVENT_NAMES],
    ['eve:people-directory-updated', 'eve:user-profile-updated'],
    'the contact change contract must cover local contacts and the signed-in identity'
);

const target = new EventTarget();
const received = [];
const unsubscribe = subscribeContactChanges((change) => received.push(change), target);
target.dispatchEvent(new CustomEvent('eve:people-directory-updated', {
    detail: { action: 'update', contact_id: 'contact-one' }
}));
target.dispatchEvent(new CustomEvent('eve:profile-preferences-updated', { detail: { preferences: {} } }));
target.dispatchEvent(new CustomEvent('eve:user-profile-updated', { detail: { userId: 'user-one' } }));
assert.deepEqual(
    received.map((change) => change.type),
    ['eve:people-directory-updated', 'eve:user-profile-updated'],
    'only contact population changes may reach a contact consumer'
);
unsubscribe();
target.dispatchEvent(new CustomEvent('eve:people-directory-updated', {
    detail: { action: 'delete', contact_id: 'contact-one' }
}));
assert.equal(received.length, 2, 'a released surface must stop consuming contact changes');

const previousWindow = globalThis.window;
let dashboardLoads = 0;
let dashboardRenders = 0;
globalThis.window = target;
try {
    const state = {
        active: true,
        closing: false,
        sceneProjectId: 'dashboard',
        dataProjectId: 'project-a',
        allCategories: [{ id: 'contacts', label: 'Contacts', visible: true }],
        categories: [{ id: 'contacts', label: 'Contacts', visible: true }]
    };
    const controller = createDashboardDataController({
        state,
        adapters: {
            listMany: async (categories) => {
                dashboardLoads += 1;
                return new Map(categories.map((category) => [category.id, []]));
            }
        },
        renderDashboard: () => { dashboardRenders += 1; }
    });
    controller.connectDirectoryChanges();
    target.dispatchEvent(new CustomEvent('eve:people-directory-updated', {
        detail: { action: 'update', contact_id: 'contact-one' }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dashboardLoads, 1, 'a local contact change must reload the Dashboard Contacts population');
    assert.equal(dashboardRenders, 1, 'a local contact change must repaint the Dashboard Contacts vignettes');
    target.dispatchEvent(new CustomEvent('eve:user-profile-updated', {
        detail: { userId: 'user-one' }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dashboardLoads, 2, 'a profile identity change must reload the Dashboard Contacts population');
    assert.equal(dashboardRenders, 2, 'a profile identity change must repaint the Dashboard Contacts vignettes');
    controller.disconnectDirectoryChanges();
    target.dispatchEvent(new CustomEvent('eve:people-directory-updated', {
        detail: { action: 'delete', contact_id: 'contact-one' }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dashboardLoads, 2, 'a disconnected Dashboard must not keep a contact change listener');
    // A contact edited while the Dashboard is closed must still drop the cached
    // Contacts category: a reopened Dashboard hydrates only uncached categories,
    // so a retained cache would repaint the stale vignette until the next start.
    let offlineRenders = 0;
    const offlineState = {
        active: false,
        closing: false,
        sceneProjectId: 'dashboard',
        dataProjectId: 'project-a',
        allCategories: [{ id: 'contacts', label: 'Contacts', visible: true }],
        categories: [{ id: 'contacts', label: 'Contacts', visible: true }]
    };
    const offlineController = createDashboardDataController({
        state: offlineState,
        adapters: {
            listMany: async (categories) => new Map(categories.map((category) => [category.id, []]))
        },
        renderDashboard: () => { offlineRenders += 1; }
    });
    offlineController.connectDirectoryChanges();
    offlineController.cacheItems('contacts', [{ id: 'contact-one', category_id: 'contacts', title: 'Stale name' }]);
    assert.equal(offlineController.hasCategoryCache('contacts'), true,
        'the closed Dashboard must start the case with a cached Contacts category');
    target.dispatchEvent(new CustomEvent('eve:people-directory-updated', {
        detail: { action: 'update', contact_id: 'contact-one' }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(offlineController.hasCategoryCache('contacts'), false,
        'a closed Dashboard must drop its cached Contacts items so the next open reloads them');
    assert.equal(offlineRenders, 0, 'a closed Dashboard must not repaint on a contact change');
    offlineController.disconnectDirectoryChanges();
} finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
}

// The producers must dispatch the exact names this contract consumes; a rename
// on either side of the loop would silently re-open the stale-vignette bug.
const producerSources = await Promise.all([
    '../../atome/src/squirrel/contacts/bootstrap.js',
    '../../eVe/domains/user/profile_events.js',
    '../../eVe/domains/user/profile_api.js',
    '../../eVe/domains/dashboard/dashboard_data_controller.js'
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
const [contactsBootstrap, profileEvents, profileApi, dashboardController] = producerSources;
assert.match(contactsBootstrap, /PEOPLE_DIRECTORY_UPDATED_EVENT = 'eve:people-directory-updated'/,
    'the local contacts bootstrap must dispatch the people directory change consumed here');
['createLocalContact', 'updateLocalContact', 'deleteLocalContact'].forEach((producer) => {
    const call = contactsBootstrap.slice(contactsBootstrap.indexOf(`async ${producer}(`));
    assert.match(call.slice(0, 400), /dispatchPeopleDirectoryUpdated\(env/,
        `contacts.${producer} must publish a people directory change`);
});
assert.match(profileEvents, /USER_PROFILE_UPDATED_EVENT = 'eve:user-profile-updated'/,
    'the profile identity owner must expose the signed-in identity change consumed here');
assert.match(profileApi, /dispatchUserProfileUpdated\(/,
    'the profile identity owner must publish the identity change after a profile upsert');
assert.match(dashboardController, /subscribeContactChanges\(refreshContactsPopulation\)/,
    'the Dashboard must consume the contact change contract');

console.log('contact_change_invalidation_contract.test: PASS');
