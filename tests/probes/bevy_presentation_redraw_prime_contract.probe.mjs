import assert from 'node:assert/strict';
import { schedulePresentationRedrawPrime } from '../../eVe/domains/rendering/bevy_web_presentation_runtime.js';

const timers = [];
const diagnostics = [];
const ownerWindow = {
    __EVE_PERF_EVENTS__: true,
    __squirrelPerf: { record: (event) => diagnostics.push(event) },
    setTimeout: (callback, delay) => {
        const timer = { callback, delay };
        timers.push(timer);
        return timer;
    }
};
globalThis.window = ownerWindow;

const surface = { ownerDocument: { defaultView: ownerWindow } };
let redraws = 0;
const module = { request_atome_bevy_redraw: () => { redraws += 1; } };

assert.deepEqual(schedulePresentationRedrawPrime(surface, module, 'diff'), { scheduled: true, count: 4 });
assert.deepEqual(schedulePresentationRedrawPrime(surface, module, 'diff'), { scheduled: false, coalesced: true });
assert.equal(redraws, 1, 'the first redraw is requested immediately');
assert.equal(timers.length, 3, 'one active prime sequence owns the three delayed retries');
timers.forEach(({ callback }) => callback());
assert.equal(redraws, 4, 'coalescing must preserve the required presentation retries');
assert.deepEqual(
    diagnostics.map((event) => event.name),
    ['bevy.redraw.prime.schedule'],
    'internal retries must not flood the user-facing performance log'
);

console.log('bevy_presentation_redraw_prime_contract.test: PASS');
