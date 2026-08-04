import assert from 'node:assert/strict';

import {
    buildEventParticles,
    expandOccurrences,
    normalizeEvent
} from '../../eVe/intuition/tools/calendar_model.js';

const todo = normalizeEvent({
    id: 'todo_1',
    properties: {
        type: 'calendar_event', kind: 'todo', status: 'done',
        title: 'Ship Calendar', start: '2026-08-03T12:00:00.000Z',
        completed_at: '2026-08-03T11:00:00.000Z'
    }
});
assert.equal(todo.kind, 'todo');
assert.equal(todo.status, 'done');
assert.equal(todo.dueAt.toISOString(), '2026-08-03T12:00:00.000Z');
assert.equal(todo.completedAt.toISOString(), '2026-08-03T11:00:00.000Z');

const particles = buildEventParticles(todo);
assert.equal(particles.kind, 'todo');
assert.equal(particles.status, 'done');
assert.equal(particles.due_at, '2026-08-03T12:00:00.000Z');
assert.equal(particles.completed_at, '2026-08-03T11:00:00.000Z');

const recurring = normalizeEvent({
    id: 'repeat_1', title: 'Three times', start: '2026-08-01T09:00:00.000Z',
    recurrence: { freq: 'daily', count: 3 }
});
assert.equal(
    expandOccurrences(recurring, new Date('2026-08-01T00:00:00.000Z'), new Date('2026-08-31T23:59:59.999Z')).length,
    3,
    'recurrence count bounds expansion'
);

console.log('calendar_todo_contract: ok');
