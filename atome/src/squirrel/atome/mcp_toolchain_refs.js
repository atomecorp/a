// A toolchain step takes what an earlier step gave (R-246, user 24 Nov. 2026: bricks assembled « le plus simplement… en
// mangeant le moins de tokens possible », toward coding on the fly): any value of a step's params written
// `{ "$step": <index>, "path": "a.b.0" }` is replaced by that step's result at that path before the step is dispatched.
// A chain resumed after a held step passes the `steps` the held answer returned as `prior_steps`, so its later steps
// still reach the earlier results. A reference to a step not yet run, or to a path its result lacks, is an error.
const isRef = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => key === '$step' || key === 'path') && '$step' in value;

const readPath = (result, path, index) => String(path || '').split('.').filter(Boolean).reduce((node, key) => {
    if (node === null || typeof node !== 'object' || !(key in node)) throw new Error(`toolchain_ref_path_missing:${index}:${path}`);
    return node[key];
}, result);

/** The results reachable by reference: the steps run before this call (`prior_steps`), then those run in it. */
export const priorResults = (priorSteps) => {
    const results = new Map();
    (Array.isArray(priorSteps) ? priorSteps : []).forEach((step) => {
        if (Number.isInteger(step?.index)) results.set(step.index, step.result);
    });
    return results;
};

/** The step's params with every reference replaced by the earlier result it names. */
export function resolveStepRefs(value, results) {
    if (isRef(value)) {
        const index = value.$step;
        if (!Number.isInteger(index) || !results.has(index)) throw new Error(`toolchain_ref_step_unavailable:${index}`);
        return readPath(results.get(index), value.path, index);
    }
    if (Array.isArray(value)) return value.map(item => resolveStepRefs(item, results));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveStepRefs(item, results)]));
    }
    return value;
}
