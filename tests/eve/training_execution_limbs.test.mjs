// R-146 (13 Nov. 2026): every exercise of an arm or a leg may be done one side after the other or both at once.
import { expect, test } from 'vitest';
import { trainingExecutionModes, trainingExecutionUnits, trainingExerciseLimb } from '../../eVe/domains/training/training_resume.js';
import { trainingExercise } from '../../atome/src/shared/training_catalog.js';

test('arms and legs offer both modes; the trunk and a bar only one', () => {
    const modes = id => trainingExecutionModes(trainingExercise(id));
    expect(modes('biceps_curl')).toEqual(['bilateral', 'unilateral']);
    expect(modes('lunge')).toEqual(['unilateral', 'bilateral']);
    expect(modes('push_up')).toEqual(['bilateral', 'unilateral']);
    expect(modes('crunch')).toEqual(['bilateral']);
    expect(trainingExerciseLimb(trainingExercise('lunge'))).toBe('leg');
    expect(trainingExerciseLimb(trainingExercise('biceps_curl'))).toBe('arm');
});

test('units keep the history: a pair of dumbbells loads per side, a side-by-side exercise keeps its load whole', () => {
    expect(trainingExecutionUnits(trainingExercise('biceps_curl'), 'unilateral')).toEqual({ reps: 'reps_per_side', load: 'kg_per_side' });
    expect(trainingExecutionUnits(trainingExercise('lunge'), null)).toEqual({ reps: 'reps_per_side', load: 'kg' });
    expect(trainingExecutionUnits(trainingExercise('lunge'), 'bilateral')).toEqual({ reps: 'reps', load: 'kg' });
    expect(trainingExecutionUnits(trainingExercise('crunch'), 'unilateral')).toEqual({ reps: 'reps', load: 'kg' });
});
