import assert from 'node:assert/strict';
import { virtualizedHierarchicalSelectableListNode } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_virtual_window.js';

const entries = Array.from({ length: 4001 }, (_, index) => ({ id: `atom_${index}`, label: `Item ${index}`,
    visualRecord: { id: `atom_${index}`, type: 'text', properties: { text: `Text ${index}` } } }));
const before = JSON.stringify(entries);
const project = (entry, index) => ({ ...entry, label: `Projected ${index}`, playing: index % 3 === 0,
    meta: { absoluteIndex: index } });
const flatten = node => [node, ...(node.children || []).flatMap(flatten)];
for (const visibleStart of [0, 1998, 3999]) {
    const calls = [];
    const options = { id: 'projection_probe', entries, width: 600, rowHeight: 60, gap: 3, viewportHeight: 300,
        windowState: { pageSize: entries.length, totalCount: entries.length, visibleStart, anchorEnd: false },
        onActivate: (id, entry) => ({ id, absoluteIndex: entry.meta.absoluteIndex }) };
    const deferred = virtualizedHierarchicalSelectableListNode({ ...options, mapEntry: (entry, index) => {
        calls.push(index); return project(entry, index);
    } });
    const eager = virtualizedHierarchicalSelectableListNode({ ...options, entries: entries.map(project) });
    assert.deepEqual(JSON.parse(JSON.stringify(deferred)), JSON.parse(JSON.stringify(eager)),
        'windowed preparation must preserve the complete projected node data');
    assert.equal(calls.length, deferred.visibleCount);
    assert.deepEqual(calls, Array.from({ length: deferred.visibleCount }, (_, index) => deferred.visibleStart + index));
    assert.ok(calls.length < 30, 'offscreen entries must not be prepared');
    const actualRow = flatten(deferred.node).find(node => node.id === `projection_probe_entry_${deferred.visibleStart}`);
    const expectedRow = flatten(eager.node).find(node => node.id === actualRow.id);
    assert.deepEqual(actualRow.on.activate({}), expectedRow.on.activate({}), 'events retain the projected entry and absolute identity');
}
assert.equal(JSON.stringify(entries), before, 'projection must leave source entries intact');
console.log('virtual_window_projection: PASS (beginning, middle, end; tree and event parity)');
