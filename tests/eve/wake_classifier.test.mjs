import { test, expect } from 'vitest';
import { trainWakeClassifier, scoreWakeWindow, serializeWakeClassifier, deserializeWakeClassifier } from '../../atome/src/squirrel/voice/wake_classifier.js';

const SIZE = 48;
const examples = (count, center, seed) => {
    let state = seed;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    return Array.from({ length: count }, () => Float32Array.from({ length: SIZE }, (_, index) => (index < 8 ? center : 0) + (random() - 0.5) * 2));
};
const positives = examples(40, 1.5, 1), negatives = examples(120, -1.5, 2);

test('a logistic verifier separates the two classes', () => {
    const model = trainWakeClassifier({ positives, negatives, epochs: 40, batchSize: 16, learningRate: 0.01, seed: 3 });
    expect(positives.every(window => scoreWakeWindow(model, window) > 0.9)).toBe(true);
    expect(negatives.every(window => scoreWakeWindow(model, window) < 0.1)).toBe(true);
});

test('a hidden-layer model trains and training is deterministic for one seed', () => {
    const train = () => trainWakeClassifier({ positives, negatives, hidden: [8], epochs: 30, learningRate: 0.005, seed: 5 });
    const first = train(), second = train();
    expect(scoreWakeWindow(first, positives[0])).toBeGreaterThan(0.5);
    expect(scoreWakeWindow(first, negatives[0])).toBeLessThan(0.5);
    expect(scoreWakeWindow(first, positives[3])).toBe(scoreWakeWindow(second, positives[3]));
});

test('serialization round-trips the exact scores', () => {
    const model = trainWakeClassifier({ positives, negatives, hidden: [4], epochs: 3, seed: 9 });
    const restored = deserializeWakeClassifier(JSON.parse(JSON.stringify(serializeWakeClassifier(model, { version: 1 }))));
    expect(scoreWakeWindow(restored, negatives[7])).toBe(scoreWakeWindow(model, negatives[7]));
    expect(() => deserializeWakeClassifier({})).toThrow('wake_classifier_invalid');
});
