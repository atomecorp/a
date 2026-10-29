/** Golden numbers (AGENTS.md rule 19, user 2026-10-28): a value eVe proposes on its own is a natural
 * number — a Fibonacci number (1, 2, 3, 5, 8, 13, 21, 34…) or a multiple of 3 (3, 6, 9, 12…).
 * A value off the series takes its nearest natural number, a Fibonacci number winning a tie, then the
 * higher one (4 → 5, 10 → 9, 14 → 13, 20 → 21, 35 → 34). A progression moves to the next natural
 * number. A quantity bound to the world (a gym's weights) keeps its step: a natural value is
 * proposed only when it lies within one step. */

const isSquare = value => Number.isInteger(Math.sqrt(value));
export const isFibonacciNumber = value => Number.isInteger(value) && value > 0
    && (isSquare(5 * value * value + 4) || isSquare(5 * value * value - 4));
export const isNaturalNumber = value => Number.isInteger(value) && value > 0 && (value % 3 === 0 || isFibonacciNumber(value));

// The natural number nearest `value` (0 stays 0: an absence is not a proposal).
export const nearestNaturalNumber = (value) => {
    const whole = Math.round(Number(value));
    if (!Number.isFinite(whole)) throw new Error('natural_number_requires_a_number');
    if (whole <= 0 || isNaturalNumber(whole)) return Math.max(0, whole);
    for (let distance = 1; ; distance += 1) {
        const lower = whole - distance, higher = whole + distance;
        const candidates = [lower, higher].filter(isNaturalNumber);
        if (candidates.length === 2) return isFibonacciNumber(lower) && !isFibonacciNumber(higher) ? lower : higher;
        if (candidates.length) return candidates[0];
    }
};

// The first natural number above `value`.
export const nextNaturalNumber = (value) => {
    let next = Math.floor(Number(value)) + 1;
    while (!isNaturalNumber(next)) next += 1;
    return next;
};

// A world-bound quantity on its `step`: `value` itself when natural, else the nearest natural value one step
// away (the higher on a tie), else `value`.
export const naturalReachableValue = (value, step) => {
    if (isNaturalNumber(value)) return value;
    const near = [value + step, value - step].filter(candidate => candidate > 0 && isNaturalNumber(candidate));
    return near.length ? near[0] : value;
};

// A world-bound quantity's next value above `value`: one step, or two when only the second is natural.
export const nextNaturalReachableValue = (value, step) => (isNaturalNumber(value + step) || !isNaturalNumber(value + 2 * step)
    ? value + step : value + 2 * step);
