// R-140 (13 Nov. 2026): the rest between two loaded sets with no change planned recalls the progression step.
import { expect, test } from 'vitest';
import { trainingRaiseReminderAt } from '../../eVe/domains/training/training_machine_sets.js';

const set = (id, kg) => ({ id, kind: 'work', planned_measures: [{ value: 10, unit: 'reps' }, ...(kg === null ? [] : [{ value: kg, unit: 'kg' }])] });
const rest = id => ({ id, kind: 'rest', planned: { value: 60, unit: 's' } });

test('recalled between equal loaded sets, not after the last, not when a change is planned, not without a load', () => {
    const equal = [set('w1', 20), rest('r1'), set('w2', 20)];
    expect(trainingRaiseReminderAt(equal, equal[1])).toBe(true);
    expect(trainingRaiseReminderAt(equal, equal[2])).toBe(false);
    const rising = [set('w1', 20), rest('r1'), set('w2', 22.5)];
    expect(trainingRaiseReminderAt(rising, rising[1])).toBe(false);
    const bare = [set('w1', null), rest('r1'), set('w2', null)];
    expect(trainingRaiseReminderAt(bare, bare[1])).toBe(false);
});

// User, 21 Nov. 2026: raised by 5 kg each time, the voice kept saying « 25 kilos » — it raised from the plan's 20, never from
// the load really lifted, and the next session started again from the load set once by hand.
test('raises from the load really lifted, carried to the next set and to the next session', async () => {
    const { trainingLoadAhead, trainingLoadBefore } = await import('../../eVe/domains/training/training_machine_sets.js');
    const { trainingLoadWords } = await import('../../eVe/domains/dashboard/dashboard_training_coach.js');
    const { suggestTrainingLoad } = await import('../../eVe/domains/training/training_progression.js');
    const done = (step, kg) => ({ ...step, status: 'confirmed', actual_measures: [{ value: 10, unit: 'reps' }, { value: kg, unit: 'kg' }] });
    const steps = [done(set('w1', 20), 25), rest('r1'), set('w2', 20), rest('r2'), set('w3', 20)];
    expect(trainingLoadBefore(steps, steps[1])).toEqual({ value: 25, unit: 'kg' });
    expect(trainingLoadAhead(steps, steps[2])).toEqual({ value: 25, unit: 'kg' });
    steps[2] = done(steps[2], 30);
    expect(trainingLoadWords({ steps, step: steps[3], raiseStep: 5, locale: 'fr' })).toContain('35');
    // A planned change (a warm-up to the first set) stays the plan's.
    const warm = [done({ ...set('u1', 10), kind: 'warmup' }, 10), rest('r'), set('w1', 20)];
    expect(trainingLoadAhead(warm, warm[1])).toEqual({ value: 20, unit: 'kg' });
    // The next session starts from the heaviest load lifted, judged on the sets done at it (bench press level 2: 9-12 reps).
    const sessions = [{ status: 'completed', end: '2026-11-20T10:00:00.000Z', steps: [done(set('a', 20), 20), done(set('b', 20), 25)].map(step => ({
        ...step, planned_measures: [{ value: 9, unit: 'reps' }, { value: 20, unit: 'kg' }] })) }];
    expect(suggestTrainingLoad({ exerciseId: 'bench_press', level: 2, sessions, loadStepKg: 5 }).load_kg).toBe(25);
});
