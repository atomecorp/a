import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildPathHandles,
    parsePathDataToAbsoluteSegments,
    parseSvgPointsAttribute,
    serializeAbsolutePathSegments,
    serializeSvgPointsAttribute
} from '../../eVe/intuition/tools/core/svg_path_data.js';

test('absolute path data parses to segments', () => {
    const segs = parsePathDataToAbsoluteSegments('M0 0 L10 10 L20 0');
    assert.deepEqual(segs.map((s) => s.cmd), ['M', 'L', 'L']);
    assert.deepEqual(segs[1].values, [10, 10]);
});

test('relative commands are absolutized', () => {
    const segs = parsePathDataToAbsoluteSegments('m5 5 l10 0');
    assert.deepEqual(segs[0].values, [5, 5]);
    assert.deepEqual(segs[1].values, [15, 5]); // 5 + 10
});

test('implicit moveto chunks become lineto', () => {
    const segs = parsePathDataToAbsoluteSegments('M0 0 10 10');
    assert.deepEqual(segs.map((s) => s.cmd), ['M', 'L']);
});

test('serialize round-trips an absolute path', () => {
    const d = 'M0 0 L10 10 Z';
    assert.equal(serializeAbsolutePathSegments(parsePathDataToAbsoluteSegments(d)), 'M 0 0 L 10 10 Z');
});

test('handles map to anchors/controls with stable ids', () => {
    const handles = buildPathHandles(parsePathDataToAbsoluteSegments('M0 0 C1 1 2 2 3 3'));
    assert.deepEqual(handles.map((h) => h.id), ['p1', 'p2', 'p3', 'p4']);
    assert.deepEqual(handles.map((h) => h.role), ['anchor', 'control', 'control', 'anchor']);
});

test('polygon points parse and serialize', () => {
    const pairs = parseSvgPointsAttribute('0,0 10,10 20,0');
    assert.deepEqual(pairs, [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    assert.equal(serializeSvgPointsAttribute(pairs), '0,0 10,10 20,0');
});
