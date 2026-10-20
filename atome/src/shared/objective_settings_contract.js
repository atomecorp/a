// The three settings of an objective: the time given to it, the effort wanted
// and an optional money budget. Each lives as the `template_value` of its own
// control Atome in the objective's engagement Matrix (`objective_engagement`);
// the panel, MCP and the assistant read and write those same Atomes.
export const OBJECTIVE_MONEY_BUDGET_BASES = Object.freeze(['total', 'month', 'week']);
export const OBJECTIVE_MONEY_BUDGET_MAX = 1e9;

export const OBJECTIVE_TIME_BUDGET_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['minutes', 'basis', 'days'], properties: {
        minutes: { type: 'number', minimum: 0, maximum: 10080 }, basis: { type: 'string', enum: ['day', 'week'] },
        days: { type: 'array', maxItems: 7, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 6 } }
    } });
export const OBJECTIVE_EFFORT_SCHEMA = Object.freeze({ type: 'integer', minimum: 1, maximum: 5 });
export const OBJECTIVE_MONEY_BUDGET_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
    required: ['amount', 'currency', 'basis'], properties: {
        amount: { type: 'number', minimum: 0, maximum: OBJECTIVE_MONEY_BUDGET_MAX },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' }, basis: { type: 'string', enum: OBJECTIVE_MONEY_BUDGET_BASES }
    } });

// Setting name → its engagement control (value_key and control kind).
export const OBJECTIVE_SETTING_CONTROLS = Object.freeze({
    time_budget: Object.freeze({ value_key: 'available_time_budget', kind: 'time_budget' }),
    effort: Object.freeze({ value_key: 'accepted_engagement', kind: 'slider' }),
    money_budget: Object.freeze({ value_key: 'money_budget', kind: 'money_budget' })
});

// `null` is no budget; an amount of zero is a budget of nothing to spend.
export const validateMoneyBudget = input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || JSON.stringify(Object.keys(input).sort()) !== '["amount","basis","currency"]'
        || !Number.isFinite(input.amount) || input.amount < 0 || input.amount > OBJECTIVE_MONEY_BUDGET_MAX
        || typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency)
        || !OBJECTIVE_MONEY_BUDGET_BASES.includes(input.basis)) throw new Error('objective_money_budget_invalid');
    return { amount: input.amount, currency: input.currency, basis: input.basis };
};
