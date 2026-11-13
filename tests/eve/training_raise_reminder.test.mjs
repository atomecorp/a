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
