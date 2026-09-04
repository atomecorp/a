import { beforeEach, describe, expect, it, vi } from 'vitest';

const surface = vi.hoisted(() => ({
    mode: 'natural',
    projectId: '',
    mounted: false,
    mount: vi.fn(async ({ mode, projectId }) => {
        surface.mode = mode;
        surface.projectId = projectId;
        surface.mounted = true;
        return { ok: true, mode, projectId };
    }),
    unmount: vi.fn(async ({ projectId }) => {
        surface.mode = 'natural';
        surface.projectId = projectId;
        surface.mounted = false;
        return { ok: true, mode: 'natural', projectId };
    })
}));

const persistence = vi.hoisted(() => ({
    commitBatch: vi.fn(async () => ({ ok: true })),
    getStateCurrent: vi.fn(async () => ({ properties: { view_mode: 'natural' } }))
}));

vi.mock('../../eVe/domains/rendering/project_view_surface_runtime.js', () => ({
    PROJECT_VIEW_MODES: Object.freeze({
        NATURAL: 'natural',
        LIST: 'list',
        TABLE: 'table',
        MIX: 'mix',
        TIMELINE: 'timeline'
    }),
    mountProjectViewSurface: surface.mount,
    readProjectViewSurfaceState: () => ({
        mode: surface.mode,
        projectId: surface.projectId,
        mounted: surface.mounted
    }),
    unmountProjectViewSurface: surface.unmount
}));

vi.mock('../../eVe/core/atome_commit.js', () => ({
    commitBatch: persistence.commitBatch,
    getStateCurrent: persistence.getStateCurrent
}));

vi.mock('../../eVe/domains/rendering/project_view_records.js', () => ({
    currentProjectId: () => 'project_default'
}));

import {
    forgetProjectViewMode,
    getProjectViewMode,
    prefetchPersistedProjectViewMode,
    restoreProjectViewMode,
    setProjectViewMode
} from '../../eVe/domains/rendering/project_view_mode_state.js';

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

describe('project view mode state', () => {
    const projectId = 'project_ios_restore_race';

    beforeEach(() => {
        forgetProjectViewMode(projectId);
        surface.mode = 'natural';
        surface.projectId = projectId;
        surface.mounted = false;
        surface.mount.mockClear();
        surface.unmount.mockClear();
        persistence.commitBatch.mockClear();
        persistence.getStateCurrent.mockReset();
        persistence.getStateCurrent.mockResolvedValue({ properties: { view_mode: 'natural' } });
    });

    it('keeps an explicit Natural choice authoritative over a delayed Matrix restore', async () => {
        const storedMode = deferred();
        persistence.getStateCurrent.mockImplementation(async () => {
            await storedMode.promise;
            return { properties: { view_mode: 'table' } };
        });

        prefetchPersistedProjectViewMode(projectId);
        const restoration = restoreProjectViewMode(projectId);
        const choice = await setProjectViewMode('natural', { projectId, persist: true });
        storedMode.resolve();
        const restored = await restoration;

        expect(choice).toMatchObject({ ok: true, mode: 'natural', changed: false });
        expect(restored).toMatchObject({
            ok: true,
            mode: 'natural',
            restored: false,
            reason: 'user_choice'
        });
        expect(surface.mount).not.toHaveBeenCalled();
        expect(getProjectViewMode(projectId)).toBe('natural');
        expect(persistence.commitBatch).toHaveBeenCalledWith([{
            kind: 'set',
            atome_id: projectId,
            project_id: projectId,
            props: { view_mode: 'natural' }
        }], { refreshState: false });
    });

    it('keeps a Natural choice made after prefetch but before restoration authoritative', async () => {
        const storedMode = deferred();
        persistence.getStateCurrent.mockImplementation(async () => {
            await storedMode.promise;
            return { properties: { view_mode: 'table' } };
        });

        prefetchPersistedProjectViewMode(projectId);
        await setProjectViewMode('natural', { projectId, persist: true });
        const restoration = restoreProjectViewMode(projectId);
        storedMode.resolve();
        const restored = await restoration;

        expect(restored).toMatchObject({
            ok: true,
            mode: 'natural',
            restored: false,
            reason: 'user_choice'
        });
        expect(surface.mount).not.toHaveBeenCalled();
        expect(persistence.getStateCurrent).toHaveBeenCalledOnce();
    });

    it('still restores a remembered Matrix when no user choice supersedes it', async () => {
        persistence.getStateCurrent.mockResolvedValue({ properties: { view_mode: 'table' } });

        const restored = await restoreProjectViewMode(projectId);

        expect(restored).toMatchObject({ ok: true, mode: 'table', restored: true });
        expect(surface.mount).toHaveBeenCalledOnce();
        expect(surface.mount).toHaveBeenCalledWith({ mode: 'table', projectId });
        expect(getProjectViewMode(projectId)).toBe('table');
    });

    it('forwards the already loaded project snapshot to the restored Matrix', async () => {
        const sourceRecords = [{ id: 'shape_1', project_id: projectId }];
        persistence.getStateCurrent.mockResolvedValue({ properties: { view_mode: 'table' } });

        const restored = await restoreProjectViewMode(projectId, { sourceRecords });

        expect(restored).toMatchObject({ ok: true, mode: 'table', restored: true });
        expect(surface.mount).toHaveBeenCalledWith({
            mode: 'table',
            projectId,
            sourceRecords
        });
    });

    it('does not permanently disable a legitimate later restore after a prior choice', async () => {
        await setProjectViewMode('natural', { projectId, persist: true });
        persistence.getStateCurrent.mockResolvedValue({ properties: { view_mode: 'table' } });

        const restored = await restoreProjectViewMode(projectId);

        expect(restored).toMatchObject({
            ok: true,
            mode: 'table',
            restored: true
        });
        expect(surface.mount).toHaveBeenCalledOnce();
        expect(getProjectViewMode(projectId)).toBe('table');
    });
});
