import { describe, it, expect } from 'vitest';

const { trainingSessionLeft } = await import('../../eVe/domains/dashboard/dashboard_training_cardio_session.js');

const timed = (id, seconds, status = 'pending') => ({ id, status, planned: { value: seconds, unit: 's' } });
const session = remaining => ({ remaining: () => remaining, stepSeconds: step => (step.planned?.unit === 's' ? step.planned.value : null) });

describe('the whole session left (R-144)', () => {
    it('adds the step under way and every timed step still to come', () => {
        const steps = [timed('a', 60, 'confirmed'), timed('b', 60, 'active'), timed('c', 60), timed('d', 30)];
        expect(trainingSessionLeft(session(42), steps, steps[1])).toBe(42 + 60 + 30);
    });
    it('is unknown while a step is open or one to come has no time', () => {
        const steps = [timed('a', 60, 'active'), { id: 'b', status: 'pending', planned: { value: 2, unit: 'km' } }];
        expect(trainingSessionLeft(session(null), steps, steps[0])).toBe(null);
        expect(trainingSessionLeft(session(10), steps, steps[0])).toBe(null);
    });
});
