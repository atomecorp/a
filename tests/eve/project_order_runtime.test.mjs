import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProjectOrderRuntime } from '../../eVe/intuition/matrix/core/project_order_runtime.js';

test('stable project order remains usable when slot persistence has no auth token', async () => {
    const previousWindow = globalThis.window;
    const commitCalls = [];
    globalThis.window = {
        Atome: {
            commitBatch: async (events) => {
                commitCalls.push(events);
                throw new Error('Auth token is missing');
            }
        }
    };

    try {
        const runtime = createProjectOrderRuntime({
            loadProjectList: async () => []
        });
        const projects = [
            { id: 'project_b', createdAt: '2026-01-02T00:00:00.000Z' },
            { id: 'project_a', createdAt: '2026-01-01T00:00:00.000Z' }
        ];

        const ordered = await runtime.applyStableProjectOrder(projects, null);

        assert.deepEqual(ordered.map((project) => project.id), ['project_a', 'project_b']);
        assert.deepEqual(projects.map((project) => project.matrix_slot), [1, 0]);
        assert.equal(commitCalls.length, 1);
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
    }
});

test('stale project creation and historical slot collisions reconcile without dropping a project', async () => {
    const previousWindow = globalThis.window;
    const projects = [
        { id: 'project_1', createdAt: '2026-01-01T00:00:00.000Z', matrix_slot: 0, project_number: 1 }
    ];
    globalThis.window = {
        Atome: {
            commitBatch: async (events) => {
                events.forEach((event) => {
                    const project = projects.find((entry) => entry.id === event.atome_id);
                    if (!project) return;
                    project.matrix_slot = event.props.matrix_slot;
                    project.project_number = event.props.project_number;
                });
                return { ok: true };
            }
        }
    };
    try {
        const runtime = createProjectOrderRuntime({
            loadProjectListRaw: async () => projects.map((project) => ({ ...project }))
        });
        projects.push({ id: 'project_2', createdAt: '2026-01-02T00:00:00.000Z' });
        await runtime.appendProjectToStableOrder('project_2', 'user_a');
        projects.push({ id: 'project_3', createdAt: '2026-01-03T00:00:00.000Z', matrix_slot: 0, project_number: 1 });
        const ordered = await runtime.reconcileProjectOrder('user_a');

        assert.deepEqual(ordered.map((project) => project.id), ['project_1', 'project_2', 'project_3']);
        assert.deepEqual(projects.map((project) => project.matrix_slot), [0, 1, 2]);
        assert.equal(new Set(projects.map((project) => project.matrix_slot)).size, 3);
    } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
    }
});
