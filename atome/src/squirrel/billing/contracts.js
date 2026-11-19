import { validateParams } from '../ai/agent_gateway_normalize.js';

// The money screens' commands (register R-193): every action of Réglages › Paiement (the balance, a top-up, a withdrawal,
// the history) and of the administrators' Réglages › Budget (real spending, budgets, an account's ceilings, the
// administrators, an invitation's terms), for runtime V2, AI discovery, voice and direct MCP calls alike, run by
// eVe/domains/billing/billing_commands.js through the same `billing` frames as the screens. Amounts are integer cents.
const cents = { type: 'integer', minimum: 0, maximum: 10_000_000 };
const principal = { type: 'string', minLength: 1, maxLength: 200, description: 'An account\'s principal id (billing.budget lists them).' };
const categories = { type: 'object', additionalProperties: false, properties: { ai: cents, domains: cents, shop: cents, services: cents } };
const definitions = {
    open: [{ screen: { type: 'string', enum: ['payment', 'topup', 'withdraw', 'history', 'budget'] } }, [],
        'Open Réglages › Paiement (the balance), one of its screens (topup, withdraw, history), or an administrator\'s Budget.', false, 'control'],
    wallet: [{}, [], 'The person\'s balance in cents, what counts it down (storage per day, the AI this month), what can be withdrawn, the environment (real or test).', false, 'read'],
    history: [{}, [], 'The person\'s ledger, newest first: each entry\'s kind, category, memo, date and signed amount in cents.', false, 'read'],
    topup: [{ amountCents: { ...cents, minimum: 100 }, beneficiary: principal }, ['amountCents'],
        'Top up the balance (or a contact\'s, beneficiary): opens the card payment page in the browser. Say the amount and wait for the user\'s yes.', true, 'write'],
    withdraw: [{ amountCents: { ...cents, minimum: 1 } }, ['amountCents'],
        'Give unused balance back onto the card that paid it. Say the amount and wait for the user\'s yes.', true, 'write'],
    budget: [{}, [], 'Administrators: real spending on or off, the test budget, the ceilings per category, the allowed accounts and the administrators.', false, 'read'],
    budget_set: [{ realSpending: { type: 'boolean' }, testBudgetMonthCents: cents, categoryMonthCents: categories }, [],
        'Administrators: turn real spending on or off, set the test budget or the ceilings per category. Wait for the user\'s yes.', true, 'write'],
    account_set: [{ principal, listed: { type: 'boolean' }, allowed: { type: 'boolean' }, perOpCents: cents, perDayCents: cents, perMonthCents: cents,
        aiPromptsPerDay: { type: 'integer', minimum: 0, maximum: 10_000 },
        categories: { type: 'array', maxItems: 4, items: { type: 'string', enum: ['ai', 'domains', 'shop', 'services'] } } }, ['principal'],
    'Administrators: list or unlist an allowed account, allow or block it, set its ceilings, AI prompts a day and categories. Wait for the user\'s yes.', true, 'write'],
    admin_move: [{ verb: { type: 'string', enum: ['propose', 'confirm', 'revoke'] }, principal }, ['verb', 'principal'],
        'Administrators: propose an administrator, confirm one (the principal administrator), or revoke one. Wait for the user\'s yes.', true, 'write'],
    invite: [{ email: { type: 'string', minLength: 3, maxLength: 254 }, mode: { type: 'string', enum: ['free', 'pay', 'discount'] },
        discountPct: { type: 'integer', minimum: 1, maximum: 99 } }, ['email', 'mode'],
    'Administrators: invite a person by mail with the terms of their activation: offered, to pay (12 €) or with a discount (discountPct). Wait for the user\'s yes.', true, 'write']
};
export const BILLING_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `billing.${action}`, action, description, persistent, capability: `billing.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string' } } }
})));
export const BILLING_CONFIRMED_COMMANDS = Object.freeze(['billing.topup', 'billing.withdraw', 'billing.budget_set', 'billing.account_set', 'billing.admin_move', 'billing.invite']);
export const validateBillingInput = (action, input) => {
    const contract = BILLING_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const BILLING_ASSISTANT_INSTRUCTIONS = 'Money: « mon solde » calls billing.wallet (cents: say euros); « recharge 21 € » says the amount then billing.topup with amountCents 2100 after the yes; « rends-moi mon solde » billing.withdraw; « mon historique » billing.open with screen history. Administrators only: billing.budget, billing.budget_set (realSpending false stops every real spending), billing.account_set, billing.admin_move, billing.invite (offered, to pay, or a discount).';
