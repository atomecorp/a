// R-109 (cahier V1.2 §5.7): every committed write reaches the command bus (`atome_committed`), after the frame and in
// one batch, ids and kinds only: the writer's own cost is one array push.
import { test, expect, vi } from 'vitest';
import { observeCommittedEvents } from '../../eVe/core/atome_commit_effects.js';

test('commits are traced on the bus after the frame, batched, without their values', async () => {
    vi.useFakeTimers();
    const appended = [];
    globalThis.window = { atome: { tools: { v2CommandBus: { append: entry => appended.push(entry) } } } };
    try {
        observeCommittedEvents([{ atome_id: 'a1', kind: 'set', project_id: 'p', payload: { props: { secret: 'x' } } }], { tx_id: 'tx1', source: 'ui' });
        observeCommittedEvents([{ atome_id: 'a2', kind: 'set' }, { atome_id: 'a3', kind: 'delete' }], { tx_id: 'tx2', tool_id: 'ui.shape.create' });
        expect(appended).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(0);
        expect(appended).toEqual([
            { kind: 'atome_committed', source: 'ui', source_layer: 'atome_commit', tool_id: '', tx_id: 'tx1', count: 1,
                atomes: [{ atome_id: 'a1', kind: 'set', project_id: 'p' }] },
            { kind: 'atome_committed', source: 'local', source_layer: 'atome_commit', tool_id: 'ui.shape.create', tx_id: 'tx2', count: 2,
                atomes: [{ atome_id: 'a2', kind: 'set', project_id: '' }, { atome_id: 'a3', kind: 'delete', project_id: '' }] }]);
        expect(JSON.stringify(appended)).not.toContain('secret');
    } finally { delete globalThis.window; vi.useRealTimers(); }
});
