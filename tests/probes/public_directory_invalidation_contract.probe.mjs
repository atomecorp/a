import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    DIRECTORY_INVALIDATED_EVENT,
    subscribePublicDirectoryInvalidation
} from '../../eVe/domains/user/public_directory_events.js';
import { createDashboardDataController } from '../../eVe/domains/dashboard/dashboard_data_controller.js';

const target = new EventTarget();
const received = [];
const unsubscribe = subscribePublicDirectoryInvalidation((detail) => received.push(detail), target);
target.dispatchEvent(new CustomEvent(DIRECTORY_INVALIDATED_EVENT, {
    detail: { action: 'upsert', principal_id: 'remote-principal', revision: 3, phone: 'forbidden' }
}));
target.dispatchEvent(new CustomEvent(DIRECTORY_INVALIDATED_EVENT, {
    detail: { action: 'ignored', principal_id: 'remote-principal' }
}));
assert.deepEqual(received, [{ action: 'upsert', principal_id: 'remote-principal', revision: 3 }]);
unsubscribe();
target.dispatchEvent(new CustomEvent(DIRECTORY_INVALIDATED_EVENT, {
    detail: { action: 'delete', principal_id: 'remote-principal', revision: 4 }
}));
assert.equal(received.length, 1, 'surface cleanup must unsubscribe from directory invalidations');

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
    target.dispatchEvent(new CustomEvent(DIRECTORY_INVALIDATED_EVENT, {
        detail: { action: 'revoke', principal_id: 'remote-principal', revision: 5 }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dashboardLoads, 1, 'an active Dashboard must reload its Contacts population after invalidation');
    assert.equal(dashboardRenders, 1, 'an active Dashboard must repaint the refreshed Contacts population');
    controller.disconnectDirectoryChanges();
    target.dispatchEvent(new CustomEvent(DIRECTORY_INVALIDATED_EVENT, {
        detail: { action: 'delete', principal_id: 'remote-principal', revision: 6 }
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dashboardLoads, 1, 'a disconnected Dashboard must not keep a directory listener');
} finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
}

const sources = await Promise.all([
    '../../eVe/intuition/runtime/bevy_panel/bevy_panel_contact_runtime.js',
    '../../eVe/domains/dashboard/dashboard_data_controller.js',
    '../../eVe/intuition/runtime/bevy_panel/bevy_panel_finder_runtime.js',
    '../../eVe/intuition/tools/communication.js'
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
sources.forEach((source, index) => {
    assert.match(source, /subscribePublicDirectoryInvalidation/,
        `public directory consumer ${index + 1} must use the shared invalidation contract`);
});

console.log('public_directory_invalidation_contract.test: PASS');
