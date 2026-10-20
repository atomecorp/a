// Atome schemas of the eVe Basic progression: a health objective's target
// (`project_intent.target`) and the unlock facts (`record.dashboard_unlock`).
// No health value is ever stored, only « rule held » counts. The commands live
// in #squirrel/dashboard_progression/contracts.js.
export const DASHBOARD_PROGRESSION_SOURCE_DOMAIN = 'dashboard_progression';
export const DASHBOARD_UNLOCK_SOURCES = Object.freeze(['objective', 'health', 'sessions']);

// A target without `monitor_id` counts declared sessions only.
export const DASHBOARD_OBJECTIVE_TARGET_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'comparator'], properties: {
        version: { type: 'number', enum: [1] }, monitor_id: { type: 'string', minLength: 1, maxLength: 64 },
        comparator: { type: 'string', enum: ['gte', 'lte'] }, value: { type: 'number', minimum: 0 }, unit: { type: 'string', maxLength: 16 }
    } });
const count = { type: 'number', minimum: 0 };
export const DASHBOARD_UNLOCK_EVIDENCE_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['source', 'met', 'required', 'window_days'], properties: {
        source: { type: 'string', enum: DASHBOARD_UNLOCK_SOURCES }, met: count, required: count, window_days: count
    } });
export const DASHBOARD_UNLOCK_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['version', 'brick_id', 'tier', 'objective_id', 'rule_id', 'unlocked_at', 'evidence'], properties: {
        version: { type: 'number', enum: [1] }, brick_id: { type: 'string', minLength: 1 }, tier: { type: 'number', minimum: 1 },
        objective_id: { type: 'string', minLength: 1 }, rule_id: { type: 'string', minLength: 1 },
        unlocked_at: { type: 'string' }, evidence: DASHBOARD_UNLOCK_EVIDENCE_SCHEMA
    } });
export const dashboardUnlockId = (actor, brickId) => 'dashboard_unlock:' + encodeURIComponent(actor) + ':' + brickId;

const instant = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
const known = (value, schema) => Object.keys(value).every(key => Object.hasOwn(schema.properties, key));
const finiteCount = value => Number.isFinite(value) && value >= 0;
export const validateDashboardObjectiveTarget = input => {
    if (!input || typeof input !== 'object' || input.version !== 1 || !['gte', 'lte'].includes(input.comparator)
        || !known(input, DASHBOARD_OBJECTIVE_TARGET_SCHEMA)
        || (input.monitor_id !== undefined && !/^[a-z0-9_]{1,64}$/.test(input.monitor_id))
        || (input.monitor_id !== undefined) !== finiteCount(input.value)
        || (input.monitor_id === undefined && (input.value !== undefined || input.unit !== undefined))
        || (input.unit !== undefined && (typeof input.unit !== 'string' || input.unit.length > 16)))
        throw new Error('progression_target_invalid');
    return { ...input };
};
export const validateDashboardUnlock = input => {
    const evidence = input?.evidence;
    if (!input || input.version !== 1 || !known(input, DASHBOARD_UNLOCK_SCHEMA) || typeof input.brick_id !== 'string' || !input.brick_id
        || !Number.isSafeInteger(input.tier) || input.tier < 1 || typeof input.objective_id !== 'string' || !input.objective_id
        || typeof input.rule_id !== 'string' || !input.rule_id || !Number.isFinite(instant(input.unlocked_at))
        || !evidence || !known(evidence, DASHBOARD_UNLOCK_EVIDENCE_SCHEMA) || !DASHBOARD_UNLOCK_SOURCES.includes(evidence.source)
        || ![evidence.met, evidence.required, evidence.window_days].every(finiteCount) || evidence.met < evidence.required)
        throw new Error('progression_unlock_invalid');
    return { ...input, evidence: { ...evidence } };
};
