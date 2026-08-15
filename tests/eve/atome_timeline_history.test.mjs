import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolveExactTimelineTransition } from '../../eVe/core/atome_timeline_history_contract.js';

test('timeline persistence resolves only one exact source transaction', () => {
    const events = [
        { kind: 'set', tx_id: 'tx_move', atome_id: 'shape', payload: { props: { left: 10 } } },
        { kind: 'set', tx_id: 'tx_move', atome_id: 'shape', payload: { props: { top: 20 } } }
    ];
    assert.deepEqual(resolveExactTimelineTransition(events, 2, 0), {
        ok: true, count: 2, operation: 'undo', sourceTxId: 'tx_move'
    });
    assert.deepEqual(resolveExactTimelineTransition(events, 0, 2), {
        ok: true, count: 2, operation: 'redo', sourceTxId: 'tx_move'
    });
    assert.equal(resolveExactTimelineTransition([
        ...events,
        { kind: 'set', tx_id: 'tx_color', atome_id: 'shape', payload: { props: { color: 'red' } } }
    ], 3, 0).error, 'history_multi_transaction_transition_unsupported');
    assert.equal(resolveExactTimelineTransition([
        { kind: 'set', atome_id: 'shape', payload: { props: { left: 10 } } }
    ], 1, 0).error, 'history_source_transaction_required');
});

test('timeline no longer owns a snapshot rewrite persistence path', async () => {
    const source = await readFile(new URL('../../eVe/core/atome_timeline.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /applyStateToBackend|buildPayloadWithClears/);
    await assert.rejects(readFile(new URL('../../eVe/core/atome_timeline_commit.js', import.meta.url), 'utf8'));
});
