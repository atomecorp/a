import { validateParams } from '../ai/agent_gateway_normalize.js';
import { DASHBOARD_OBJECTIVE_TARGET_SCHEMA, DASHBOARD_UNLOCK_SOURCES } from '../../shared/dashboard_progression_contract.js';
import { OBJECTIVE_EFFORT_SCHEMA, OBJECTIVE_MONEY_BUDGET_SCHEMA, OBJECTIVE_TIME_BUDGET_SCHEMA } from '../../shared/objective_settings_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls: the eVe Basic
// home grows with the user's health objectives. The home, its Objectives rubric
// and the monitor selector run through these commands too. A locked brick is only
// absent from the eVe Basic home: it never removes a capability, training.*,
// shopping.*, food.*, gps.* and every other tool stay callable by MCP, voice and
// panels at any tier. Counts only, never a health value.
const count = { type: 'number', minimum: 0 };
export const DASHBOARD_PROGRESSION_ERRORS = Object.freeze(['progression_actor_required', 'progression_context_changed',
    'progression_objective_required', 'progression_target_invalid', 'progression_monitor_unknown', 'progression_monitor_not_selected',
    'progression_commit_failed', 'progression_unlock_invalid', 'progression_read_incomplete', 'progression_unknown_command',
    'progression_invalid_argument', 'progression_settings_invalid', 'progression_settings_unavailable']);

const progress = { type: 'object', properties: { source: { type: 'string', enum: DASHBOARD_UNLOCK_SOURCES }, met: count, required: count, window_days: count } };
const brick = { type: 'object', properties: { brick_id: { type: 'string' }, kind: { type: 'string', enum: ['tile', 'activity', 'tool'] },
    ref: { type: 'string' }, tier: { type: 'number' }, state: { type: 'string', enum: ['unlocked', 'next', 'locked', 'unavailable'] },
    unlocked_at: { type: 'string' } } };
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const settings = read => ({ type: 'object', additionalProperties: false, properties: { time_budget: read ? nullable(OBJECTIVE_TIME_BUDGET_SCHEMA) : OBJECTIVE_TIME_BUDGET_SCHEMA,
    effort: read ? nullable(OBJECTIVE_EFFORT_SCHEMA) : OBJECTIVE_EFFORT_SCHEMA, money_budget: nullable(OBJECTIVE_MONEY_BUDGET_SCHEMA) } });
const output = properties => ({ type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' },
    error: { type: 'string', enum: DASHBOARD_PROGRESSION_ERRORS }, ...properties } });
const definitions = {
    'progression.read': [{ include: { type: 'string', enum: ['catalog'] } }, [], false,
        'Read how far the user\'s eVe Basic home has grown: current tier, unlocked bricks (tiles, activities, tools) with their '
        + 'date, the next brick and its progress as counts (days or sessions held, never a health value). '
        + 'include "catalog" adds every tier, its rule and its bricks.',
        { tier: { type: 'number' }, bricks: { type: 'array', items: brick }, next: { type: 'object', properties: { brick_id: { type: 'string' },
            tier: { type: 'number' }, rule_id: { type: 'string' }, objective_id: { type: 'string' }, progress } },
            visible_refs: { type: 'array', items: { type: 'string' } }, activity_keys: { type: 'array', items: { type: 'string' } }, health: { type: 'string', enum: ['counted', 'denied_for_actor', 'unavailable'] },
            catalog: { type: 'object' } }],
    'progression.evaluate': [{ preview: { type: 'boolean' } }, [], true,
        'Check the user\'s health objectives against the tier rules and record the bricks newly earned (an earned brick is never '
        + 'taken back; calling it again records nothing new). preview true only reports what would unlock. Health measures count only for the user acting in the app; '
        + 'for an assistant or MCP caller only declared sessions count and the health rules are listed in skipped.',
        { unlocked: { type: 'array', items: brick }, skipped: { type: 'array', items: { type: 'object', properties: {
            rule_id: { type: 'string' }, reason: { type: 'string' } } } }, tier: { type: 'number' } }],
    'objectives.list': [{}, [], false,
        'List the user\'s own health objectives (projects) with their goal, measurable target and progress counts.',
        { objectives: { type: 'array', items: { type: 'object', properties: { objective_id: { type: 'string' }, name: { type: 'string' },
            goal: { type: 'string' }, catalog_id: { type: 'string' }, target: DASHBOARD_OBJECTIVE_TARGET_SCHEMA, tier: { type: 'number' } } } } }],
    'objective.target.set': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 }, monitor_id: { type: 'string', minLength: 1, maxLength: 64 },
        comparator: { type: 'string', enum: ['gte', 'lte'] }, value: { type: 'number', minimum: 0 }, sessions_only: { type: 'boolean' } }, ['objective_id'], true,
        'Set or adjust the measurable target of one of the user\'s health objectives: a health monitor (e.g. steps, sleep) with '
        + 'its daily value, or sessions_only true to count declared sessions. Omitted fields keep their value.',
        { objective_id: { type: 'string' }, target: DASHBOARD_OBJECTIVE_TARGET_SCHEMA }],
    'objective.settings.read': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 } }, ['objective_id'], false,
        'Read the three settings of one of the user\'s objectives: the time given to it (minutes per day or week, chosen days), '
        + 'the effort wanted (1 minimum … 5 ambitious) and its money budget (null when it has none).',
        { objective_id: { type: 'string' }, settings: settings(true) }],
    'objective.settings.set': [{ objective_id: { type: 'string', minLength: 1, maxLength: 200 }, ...settings(false).properties }, ['objective_id'], true,
        'Set one or more settings of one of the user\'s objectives, as its panel does: time_budget (minutes per day or week and the '
        + 'chosen days, 0 Sunday … 6 Saturday), effort (1 minimum, 2 gentle, 3 regular, 4 sustained, 5 ambitious), money_budget '
        + '(amount, ISO currency, basis total, month or week; null removes the budget). Omitted settings keep their value.',
        { objective_id: { type: 'string' }, settings: settings(true) }],
    'monitors.select': [{ ids: { type: 'array', maxItems: 64, uniqueItems: true, items: { type: 'string', pattern: '^[a-z0-9_]{1,64}$' } } }, ['ids'], true,
        'Choose the health monitors the user\'s home shows, in order (ids from the health catalog). Replaces the selection.',
        { ids: { type: 'array', items: { type: 'string' } } }],
    'monitors.place': [{ id: { type: 'string', pattern: '^[a-z0-9_]{1,64}$' }, position: { type: 'integer', enum: [0, 1, 2] } }, ['id', 'position'], true,
        'Place one selected health monitor on the eVe Pro home: position 1 or 2 (its two monitor cells), 0 = not on the home '
        + '(still selected). A taken position: the two swap when the monitor held the other one, else the former one leaves the home.',
        { ids: { type: 'array', items: { type: 'string' } }, slots: { type: 'array', items: { type: 'string' } } }]
};
export const DASHBOARD_PROGRESSION_COMMANDS = Object.freeze(Object.entries(definitions)
    .map(([action, [properties, required, persistent, description, result]]) => Object.freeze({
        name: `dashboard.${action}`, action, description, persistent, capability: persistent ? 'progression.write' : 'progression.read',
        input_schema: { type: 'object', additionalProperties: false, properties, required }, output_schema: output(result)
    })));

export const validateDashboardProgressionInput = (action, input) => {
    const contract = DASHBOARD_PROGRESSION_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'progression_invalid_argument';
};
export const DASHBOARD_PROGRESSION_ASSISTANT_INSTRUCTIONS = 'Home progression: the eVe Basic home starts with the Atom, Contacts, '
    + 'Calendar and Goals and earns more tiles (Activity, Capture, Plan, Create…) as the user keeps a health objective; the monitors '
    + 'the user chooses (dashboard.monitors.select) show above the Atom, up to six; '
    + '« qu\'est-ce que j\'ai débloqué », « qu\'est-ce qui vient ensuite » call dashboard.progression.read and answer with the next '
    + 'brick and its count (days or sessions held), never a health value you do not have. « mes objectifs » calls '
    + 'dashboard.objectives.list; « vise 8000 pas par jour », « je veux dormir 7 heures » call dashboard.objective.target.set '
    + '(sleep in minutes). « j\'y consacre 20 minutes par jour », « effort léger », « budget de 50 euros par mois », « plus de budget » '
    + 'call dashboard.objective.settings.set on that objective (dashboard.objective.settings.read to answer about them). A locked brick is only hidden from that home: it removes no capability, so never refuse a Sport, '
    + 'shopping, food, GPS or any other request because of the tier, call its tool directly.';
