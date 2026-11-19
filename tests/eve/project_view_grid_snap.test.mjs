import assert from 'node:assert/strict';
import { test, afterEach } from 'vitest';
import { setActiveProjectViewProject } from '../../eVe/domains/rendering/project_view_camera.js';
import { buildTargetProps } from '../../eVe/domains/rendering/surface_pointer_runtime.js';

// « Grille » (user, 19 Nov. 2026): while a project's grid shows, a moved object
// lays its corner on the grid and a resized one takes a width of whole steps;
// the grid off, the gesture stays free.
afterEach(() => { delete globalThis.window; setActiveProjectViewProject(''); });

const withGrid = (on) => {
    globalThis.window = { __eveProfilePreferences: { projectViewGrids: on ? { p: true } : {} } };
    setActiveProjectViewProject('p');
};
const origin = { x: 47, y: 13, width: 100, height: 50 };

test('a move snaps the lead corner to the grid and keeps the group together', () => {
    withGrid(true);
    const targets = [{ atome_id: 'a', origin }, { atome_id: 'b', origin: { ...origin, x: 207, y: 93 } }];
    const [a, b] = buildTargetProps({ mode: 'drag', origin, targets }, { x: 20, y: 4 });
    assert.deepEqual([a.props.left, a.props.top], [60, 30]);
    assert.deepEqual([b.props.left - a.props.left, b.props.top - a.props.top], [160, 80]);
});

test('a resize gives a width of whole grid steps', () => {
    withGrid(true);
    const [a] = buildTargetProps({ mode: 'resize', origin, scale: 1.37, anchor: { x: 47, y: 13 } }, {});
    assert.equal(Math.round(a.props.width), 150);
    assert.equal(Math.round(a.props.height), 75);
});

test('the grid off leaves the gesture free', () => {
    withGrid(false);
    const [a] = buildTargetProps({ mode: 'drag', origin, targets: [{ atome_id: 'a', origin }] }, { x: 20, y: 4 });
    assert.deepEqual([a.props.left, a.props.top], [67, 17]);
});
