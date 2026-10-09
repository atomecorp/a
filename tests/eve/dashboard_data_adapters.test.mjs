import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createDashboardDataAdapters } from '../../eVe/domains/dashboard/dashboard_data_adapters.js';
import {
    dashboardItemTextFields,
    formatDashboardCalendarDisplayDate
} from '../../eVe/domains/dashboard/dashboard_item_text_fields.js';
import { DASHBOARD_WORKSPACE_PROJECT_ID } from '../../eVe/domains/dashboard/dashboard_workspace_mode.js';

test('dashboard Calendar cards keep canonical title, start, and project scope together', async () => {
    const start = new Date(2026, 7, 11, 14, 30);
    let requestedProjectId = '';
    const adapters = createDashboardDataAdapters({
        calendarApiLoader: async () => ({
            listEvents: async ({ projectId } = {}) => {
                requestedProjectId = projectId;
                return {
                    ok: true,
                    items: [{
                        id: 'calendar_exact',
                        title: 'QA Calendar 11 août',
                        name: 'Stale fallback',
                        start,
                        createdAt: new Date(2026, 6, 1)
                    }]
                };
            }
        })
    });

    const [item] = await adapters.list(
        { id: 'calendar', data_source: 'calendar' },
        { projectId: 'calendar_project_exact' }
    );
    const fields = dashboardItemTextFields(item, { id: 'calendar' }, { x: 0, y: 0, width: 160, height: 120 });

    assert.equal(requestedProjectId, 'calendar_project_exact');
    assert.equal(item.id, 'calendar_exact');
    assert.equal(item.title, 'QA Calendar 11 août');
    assert.equal(item.start, start);
    assert.equal(item.payload.title, item.title);
    assert.equal(item.payload.start, item.start);
    assert.equal(fields[0].value, item.title);
    assert.equal(fields[1].display_value, formatDashboardCalendarDisplayDate(start));
});

test('dashboard Calendar reads reject the renderer workspace and use the canonical project', async () => {
    const previousWindow = globalThis.window;
    let requestedProjectId = '';
    globalThis.window = {
        AdoleAPI: { projects: { getCurrentId: () => 'calendar_project_canonical' } }
    };
    try {
        const adapters = createDashboardDataAdapters({
            calendarApiLoader: async () => ({
                listEvents: async ({ projectId } = {}) => {
                    requestedProjectId = projectId;
                    return { ok: true, items: [] };
                }
            })
        });

        await adapters.list(
            { id: 'calendar', data_source: 'calendar' },
            { projectId: DASHBOARD_WORKSPACE_PROJECT_ID }
        );

        assert.equal(requestedProjectId, 'calendar_project_canonical');
        assert.notEqual(requestedProjectId, DASHBOARD_WORKSPACE_PROJECT_ID);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});

test('dashboard project items do not capture every missing preview during list hydration', async () => {
    let previewCalls = 0;
    const adapters = createDashboardDataAdapters({
        projectsLoader: async () => [{ id: 'project_a', name: 'Scene A' }],
        projectPreviewLoader: async () => {
            previewCalls += 1;
            throw new Error('bulk_preview_capture_forbidden');
        }
    });

    const items = await adapters.list({ id: 'projects', data_source: 'projects' });

    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Scene A');
    assert.deepEqual(items[0].metadata, {});
    assert.equal(previewCalls, 0);
});

test('dashboard project items can skip renderer preview hydration for first paint', async () => {
    let previewCalls = 0;
    const adapters = createDashboardDataAdapters({
        projectsLoader: async () => [{ id: 'project_a', name: 'Scene A' }],
        projectPreviewLoader: async () => {
            previewCalls += 1;
            throw new Error('preview_loader_should_not_block_first_paint');
        }
    });

    const items = await adapters.list(
        { id: 'projects', data_source: 'projects' },
        { hydratePreviews: false }
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Scene A');
    assert.deepEqual(items[0].metadata, {});
    assert.equal(previewCalls, 0);
});

test('dashboard project items ignore whitespace-only labels and use project ids', async () => {
    const adapters = createDashboardDataAdapters({
        projectsLoader: async () => [{ id: 'project_a', name: '   ', label: '   ' }],
        projectPreviewLoader: async () => {
            throw new Error('preview_loader_should_not_run');
        }
    });

    const items = await adapters.list(
        { id: 'projects', data_source: 'projects' },
        { hydratePreviews: false }
    );

    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'project_a');
});

test('dashboard project items preserve persisted preview dimensions when reloaded', async () => {
    const adapters = createDashboardDataAdapters({
        projectsLoader: async () => [{
            id: 'project_a',
            name: 'Scene A',
            preview_url: 'data:image/png;base64,persisted',
            preview_width: 640,
            preview_height: 360
        }],
        projectPreviewLoader: async () => {
            throw new Error('persisted_preview_should_not_hydrate');
        }
    });

    const items = await adapters.list({ id: 'projects', data_source: 'projects' });

    assert.equal(items[0].metadata.project_preview_source, 'data:image/png;base64,persisted');
    assert.equal(items[0].metadata.project_preview_kind, 'persisted');
    assert.equal(items[0].metadata.project_preview_width, 640);
    assert.equal(items[0].metadata.project_preview_height, 360);
});

test('dashboard project items are ordered by most recently modified first', async () => {
    const adapters = createDashboardDataAdapters({
        projectsLoader: async () => [
            { id: 'project_old', name: 'Old', updated_at: '2026-01-01T10:00:00.000Z' },
            { id: 'project_new', name: 'New', updatedAt: '2026-06-01T10:00:00.000Z' },
            { id: 'project_created', name: 'Created', created_at: '2026-05-01T10:00:00.000Z' },
            { id: 'project_no_date_b', name: 'No Date B' },
            { id: 'project_no_date_a', name: 'No Date A' }
        ],
        projectPreviewLoader: async () => ({ empty: true })
    });

    const items = await adapters.list(
        { id: 'projects', data_source: 'projects' },
        { hydratePreviews: false }
    );

    assert.deepEqual(items.map((item) => item.id), [
        'project_new',
        'project_old',
        'project_created',
        'project_no_date_a',
        'project_no_date_b'
    ]);
});

test('dashboard current project without dates stays closest to the header without changing Matrix order', async () => {
    globalThis.__currentProject = { id: 'project_current', name: 'Current' };
    try {
        const adapters = createDashboardDataAdapters({
            projectsLoader: async () => [
                { id: 'project_old', name: 'Old', updated_at: '2026-01-01T10:00:00.000Z' },
                { id: 'project_new', name: 'New', updated_at: '2026-06-01T10:00:00.000Z' }
            ],
            projectPreviewLoader: async () => ({ empty: true })
        });

        const items = await adapters.list(
            { id: 'projects', data_source: 'projects' },
            { hydratePreviews: false }
        );

        assert.deepEqual(items.map((item) => item.id), ['project_current', 'project_new', 'project_old']);
    } finally {
        delete globalThis.__currentProject;
    }
});

test('dashboard current project preview is refreshed instead of reusing persisted metadata on open hydration', async () => {
    globalThis.__currentProject = { id: 'project_a', name: 'Current Scene' };
    let previewCalls = 0;
    const commits = [];
    globalThis.Atome = {
        commit: async (payload) => {
            commits.push(payload);
            return { ok: true };
        }
    };
    try {
        let loaderInput = null;
        const adapters = createDashboardDataAdapters({
            projectsLoader: async () => [{
                id: 'project_a',
                name: 'Current Scene',
                preview_url: 'data:image/png;base64,stale',
                preview_width: 120,
                preview_height: 120
            }],
            projectPreviewLoader: async (input) => {
                loaderInput = input;
                previewCalls += 1;
                return {
                    ok: true,
                    project_id: input.projectId,
                    preview_url: 'data:image/png;base64,fresh',
                    width: 320,
                    height: 200,
                    source: 'bevy_capture'
                };
            }
        });

        const items = await adapters.list(
            { id: 'projects', data_source: 'projects' },
            { forceCurrentProjectPreview: true }
        );

        assert.equal(previewCalls, 1);
        assert.equal(loaderInput.forceCapture, true);
        assert.equal(loaderInput.project.preview_url, 'data:image/png;base64,stale');
        assert.equal(commits.length, 1);
        assert.deepEqual(commits[0].kind, 'set');
        assert.deepEqual(commits[0].atome_id, 'project_a');
        assert.equal(commits[0].props.preview_url, 'data:image/png;base64,fresh');
        assert.equal(commits[0].props.preview_width, 320);
        assert.equal(commits[0].props.preview_height, 200);
        assert.match(commits[0].props.preview_updated_at, /^\d{4}-\d{2}-\d{2}T/);
        assert.equal(items[0].metadata.project_preview_source, 'data:image/png;base64,fresh');
        assert.equal(items[0].metadata.project_preview_kind, 'persisted');
        assert.equal(items[0].metadata.project_preview_width, 320);
        assert.equal(items[0].metadata.project_preview_height, 200);
    } finally {
        delete globalThis.__currentProject;
        delete globalThis.Atome;
    }
});

test('dashboard keeps the last durable preview when a forced refresh cannot be committed', async () => {
    globalThis.__currentProject = { id: 'project_a', name: 'Current Scene' };
    globalThis.Atome = { commit: async () => { throw new Error('commit_failed'); } };
    try {
        const adapters = createDashboardDataAdapters({
            projectsLoader: async () => [{ id: 'project_a', name: 'Current Scene', preview_url: 'data:image/png;base64,stale' }],
            projectPreviewLoader: async () => ({
                ok: true,
                project_id: 'project_a',
                preview_url: 'data:image/png;base64,fresh',
                width: 320,
                height: 200,
                source: 'bevy_capture'
            })
        });

        const items = await adapters.list(
            { id: 'projects', data_source: 'projects' },
            { forceCurrentProjectPreview: true }
        );

        assert.equal(items[0].metadata.project_preview_source, 'data:image/png;base64,stale');
        assert.equal(items[0].metadata.project_preview_kind, 'persisted');
        assert.equal(items[0].metadata.project_preview_error, 'commit_failed');
    } finally {
        delete globalThis.__currentProject;
        delete globalThis.Atome;
    }
});

test('dashboard keeps the last durable preview when a forced recapture fails', async () => {
    globalThis.__currentProject = { id: 'project_a', name: 'Current Scene' };
    try {
        const adapters = createDashboardDataAdapters({
            projectsLoader: async () => [{
                id: 'project_a',
                name: 'Current Scene',
                preview_url: 'data:image/png;base64,durable',
                preview_width: 320,
                preview_height: 180
            }],
            projectPreviewLoader: async () => {
                throw new Error('bevy_project_preview_capture_empty:project_a');
            }
        });

        const items = await adapters.list(
            { id: 'projects', data_source: 'projects' },
            { forceCurrentProjectPreview: true }
        );

        assert.equal(items[0].metadata.project_preview_source, 'data:image/png;base64,durable');
        assert.equal(items[0].metadata.project_preview_width, 320);
        assert.equal(items[0].metadata.project_preview_height, 180);
        assert.equal(items[0].metadata.project_preview_error, 'bevy_project_preview_capture_empty:project_a');
    } finally {
        delete globalThis.__currentProject;
    }
});

test('dashboard contact items prefer display names and carry profile photos', async () => {
    const adapters = createDashboardDataAdapters({
        peopleDirectoryLoader: async () => [{
            id: 'contact_a',
            phone: '0600000000',
            display_name: 'Ada Lovelace',
            user_face: '/profile/ada.png'
        }],
        contactsApiLoader: async () => ({
            ensureReady: async () => ({ ok: true }),
            list: async () => ({ items: [] })
        }),
        currentUserLoader: async () => null
    });

    const items = await adapters.list({ id: 'contacts', data_source: 'contacts' });

    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Ada Lovelace');
    assert.equal(items[0].metadata.user_face, '/profile/ada.png');
});

test('dashboard contact items ignore whitespace-only display names and use stable identity fields', async () => {
    const adapters = createDashboardDataAdapters({
        peopleDirectoryLoader: async () => [{
            id: 'contact_a',
            display_name: '   ',
            name: '   ',
            email: 'ada@example.test'
        }],
        contactsApiLoader: async () => ({
            ensureReady: async () => ({ ok: true }),
            list: async () => ({ items: [] })
        }),
        currentUserLoader: async () => null
    });

    const items = await adapters.list({ id: 'contacts', data_source: 'contacts' });

    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'ada@example.test');
});

test('dashboard contact identity never merges or creates cards from phone and email display data', async () => {
    const adapters = createDashboardDataAdapters({
        peopleDirectoryLoader: async () => [
            { id: 'contact_a', name: 'Ada', phone: '0600000000', email: 'shared@example.test' },
            { id: 'contact_b', name: 'Grace', phone: '0600000000', email: 'shared@example.test' },
            { name: 'Unidentified', phone: '0600000000', email: 'shared@example.test' }
        ],
        contactsApiLoader: async () => ({
            ensureReady: async () => ({ ok: true }),
            list: async () => ({ items: [] })
        }),
        currentUserLoader: async () => null
    });

    const items = await adapters.list({ id: 'contacts', data_source: 'contacts' });

    assert.deepEqual(items.map((item) => item.id), ['contact_a', 'contact_b']);
});

test('dashboard contact items exclude the current user and preserve alphabetical order', async () => {
    const adapters = createDashboardDataAdapters({
        peopleDirectoryLoader: async () => [
            { id: 'contact_z', name: 'Zoe' },
            { id: 'current_user', name: 'Stale Current', phone: '+33000000000' },
            { id: 'contact_a', name: 'Ada' }
        ],
        contactsApiLoader: async () => ({
            ensureReady: async () => ({ ok: true }),
            list: async () => ({ items: [] })
        }),
        currentUserLoader: async () => ({
            id: 'current_user',
            name: 'Jeezs',
            phone: '+33000000000',
            user_face: '/profile/current.png'
        })
    });

    const items = await adapters.list({ id: 'contacts', data_source: 'contacts' });

    assert.deepEqual(items.map((item) => item.id), ['contact_a', 'contact_z']);
});

test('dashboard self exclusion follows canonical identities across refresh and account changes', async () => {
    let current = { id: 'user_a', email: 'shared@example.test', phone: '0600000000' };
    const adapters = createDashboardDataAdapters({
        peopleDirectoryLoader: async () => [
            { id: 'user_a', name: 'Ada', email: current.email, phone: current.phone },
            { id: 'user_b', name: 'Bea' },
            { id: 'own_projection', source_provider: 'current_user', name: 'Own profile' },
            { id: 'shared_contact', name: 'Shared', email: current.email, phone: current.phone }
        ],
        contactsApiLoader: async () => ({ ensureReady: async () => ({ ok: true }), list: async () => ({ items: [
            { id: 'local_link', user_id: 'user_a', name: 'Linked profile' }
        ] }) }),
        currentUserLoader: async () => current
    });
    const list = () => adapters.list({ id: 'contacts', data_source: 'contacts' });
    assert.deepEqual((await list()).map(item => item.id), ['user_b', 'shared_contact']);
    assert.deepEqual((await list()).map(item => item.id), ['user_b', 'shared_contact']);
    current = { id: 'user_b', email: 'shared@example.test', phone: '0600000000' };
    assert.deepEqual((await list()).map(item => item.id), ['user_a', 'local_link', 'shared_contact']);
});

test('anonymous Dashboard treats unavailable authenticated contacts as an empty row', async () => {
    const denied = async () => { throw new Error('not_authenticated'); };
    const adapters = createDashboardDataAdapters({
        peopleDirectoryLoader: denied,
        contactsApiLoader: denied,
        currentUserLoader: denied
    });

    const items = await adapters.list({ id: 'contacts', data_source: 'contacts' });

    assert.deepEqual(items, []);
});
