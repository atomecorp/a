import { expect, test, vi } from 'vitest';
// Selection is unrelated to native Music. Isolate its scene bootstrap from this command-envelope test.
vi.mock('../../eVe/intuition/tools/core/tool_runtime_context.js', () => ({
    buildRuntimeContext: () => ({ selection: { ids: [] } }), readInputSelectionIds: () => []
}));
import { createToolRuntimeDispatch } from '../../eVe/intuition/tools/core/tool_runtime_dispatch.js';
import { createToolRuntimeInvokeMethods } from '../../eVe/intuition/tools/core/tool_runtime_invoke_methods.js';
test('Runtime V2 dry-run validates a music write without calling its effectful executor', async () => {
    const effect = vi.fn(async () => ({ ok: true }));
    const tool = { id: 'apple_music.create_playlist', tool_key: 'apple_music_create_playlist',
        behavior: { effects: { 'pointer.click': 'ephemeral' } } };
    const dispatch = createToolRuntimeDispatch({ DEFAULT_PRESENTATION: 'mcp', V2_SOURCE_LAYER: 'test',
        normalizeAction: value => value, normalizeEventFromAction: value => value, isSelectionTargetAllowed: () => true });
    const methods = createToolRuntimeInvokeMethods({ ...dispatch, validateCapabilities: async () => ({ ok: true }),
        resolveExecutionMode: () => 'registered_handler', resolveExecutor: () => effect, latchTraceEnabled: () => false });
    const runtime = { ...methods, resolveTool: async () => tool, updateLatchTrackingAfterInvoke: async () => {}, handleSelectionLatchPropagationAfterInvoke: async () => {} };
    const context = { input: { name: 'A' }, dry_run: true, meta: { idempotency_key: 'preview', intent_id: 'preview', trace_id: 'preview' },
        actor: { id: 'alice' }, source: { type: 'voice', layer: 'test' } };
    expect(await runtime.invoke(tool.tool_key, 'pointer.click', context)).toMatchObject({ ok: true, dry_run: true });
    expect(effect).not.toHaveBeenCalled();
    expect(await runtime.invoke(tool.tool_key, 'pointer.click', { ...context, dry_run: false })).toMatchObject({ ok: true });
    expect(effect).toHaveBeenCalledTimes(1);
});
