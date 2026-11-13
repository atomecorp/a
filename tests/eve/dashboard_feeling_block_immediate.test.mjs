// R-136 (13 Nov. 2026): a level chosen shows at once; its write runs behind, one after the other, never awaited by the touch.
import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

const calls = [];
let release = [];
vi.mock('../../eVe/intuition/runtime/tool_gateway.js', () => ({
    invokeToolGateway: vi.fn(request => new Promise(resolve => { calls.push(request.input); release.push(() => resolve({ ok: true, payload: { ok: true } })); }))
}));
vi.mock('../../eVe/intuition/runtime/eve_intuition/tool_key_runtime.js', () => ({ unwrapToolGatewayResult: value => value }));

const { createFeelingBlock } = await import('../../eVe/domains/dashboard/dashboard_feeling_block.js');

test('Forme then Force: both shown at once, written in turn in the background', async () => {
    let repaints = 0;
    const block = createFeelingBlock({ name: 'f', aspects: ['form', 'strength'], moment: 'activity_start', immediate: true, repaint: () => { repaints += 1; } });
    block.handle({ type: 'f.toggle', aspect: 'form' });
    const first = block.handle({ type: 'f.choose', aspect: 'form', value: '4' });
    assert.deepEqual(first, { ok: true }, 'the touch returns at once, not a pending write');
    block.handle({ type: 'f.toggle', aspect: 'strength' });
    const second = block.handle({ type: 'f.choose', aspect: 'strength', value: '2' });
    assert.deepEqual(second, { ok: true });
    const shown = block.read();
    assert.ok(shown.values.form && shown.values.strength, 'both values shown before any write ended');
    assert.deepEqual(shown.open, []);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls.length, 1, 'the second write waits for the first');
    release.shift()();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls.length, 2);
    assert.equal(block.read().values.strength, shown.values.strength, 'kept shown while its write runs');
    release.shift()();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(repaints, 0, 'a write that succeeds repaints nothing itself (the day\'s feeling, followed, does)');
});
