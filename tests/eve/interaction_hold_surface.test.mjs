import { afterEach, describe, it, expect, vi } from 'vitest';
import { createInteractionSurfaceLayer } from '../../eVe/domains/rendering/interaction_surface_layer.js';
import { setProjectWorkMode } from '../../eVe/domains/rendering/project_work_mode_state.js';

const scene = { atoms: [{ id: 'child', parentId: 'button', bounds: { x: 0, y: 0, width: 50, height: 50 } }],
    byId: new Map([['button', { id: 'button' }]]) };
const payload = (phase, x = 10, pointerId = 1) => ({ phase, point: { x, y: 10 }, scene, event: { pointerId } });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('Hold Interaction on canonical project surface', () => {
    afterEach(() => vi.useRealTimers());
    const fixture = async () => {
        vi.useFakeTimers();
        const projectId = crypto.randomUUID();
        await setProjectWorkMode('consultation', { windowRef: { __eveWorkspaceMode: { mode: 'project', projectId } }, prepare: async () => ({ ok: true }) });
        let current = projectId;
        const runtime = { installInteractionRuntime: vi.fn(), readPointerTriggerIds: () => new Set(['child', 'button']),
            hasHoldInteraction: async () => true, dispatchInteractionTrigger: vi.fn() };
        const layer = createInteractionSurfaceLayer({ readProjectId: () => current, loadRuntime: async () => runtime });
        await tick();
        return { layer, runtime, changeProject: () => { current = 'other'; }, projectId };
    };
    it('dispatches hold to the hit chain once and suppresses activate on release', async () => {
        const { layer, runtime } = await fixture();
        expect(layer(payload('pointerdown')).handled).toBe(true);
        await tick(); await vi.advanceTimersByTimeAsync(520);
        layer(payload('pointerup'));
        expect(runtime.dispatchInteractionTrigger).toHaveBeenCalledTimes(1);
        expect(runtime.dispatchInteractionTrigger.mock.calls[0][0]).toMatchObject({ kind: 'hold', atome_ids: ['child', 'button'] });
    });
    it('cancels a hold after movement, cancel, or a change of project', async () => {
        for (const exit of ['pointermove', 'pointercancel', 'project']) {
            const { layer, runtime, changeProject } = await fixture();
            layer(payload('pointerdown')); await tick();
            if (exit === 'project') changeProject(); else layer(payload(exit, 30));
            await vi.advanceTimersByTimeAsync(600); layer(payload('pointerup'));
            expect(runtime.dispatchInteractionTrigger).not.toHaveBeenCalled();
        }
    });
    it('keeps a short click and does not intercept editing gestures', async () => {
        const { layer, runtime, projectId } = await fixture();
        layer(payload('pointerdown')); await tick(); layer(payload('pointerup'));
        await vi.advanceTimersByTimeAsync(600);
        expect(runtime.dispatchInteractionTrigger.mock.calls[0][0].kind).toBe('activate');
        await setProjectWorkMode('edit', { windowRef: { __eveWorkspaceMode: { mode: 'project', projectId } }, prepare: async () => ({ ok: true }) });
        expect(layer(payload('pointerdown'))).toBe(false);
    });
});
