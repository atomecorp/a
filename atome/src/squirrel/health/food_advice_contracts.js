// The `food_advice` family (register R-115 « Conseils alimentaires selon la santé », cahier D28/D29; mockups F1–F4): what
// the sourced rule base (the health reference bundle's `food`, `supplements`, `interactions` and `rcp` parts) says of a food
// for the person — their allergies, intolerances, pathologies, physiological parameters, medicines and supplements —, run on
// the device by rules, never by an AI. Health data: every command but `rules` answers only the person acting in the app
// (source `ui`, health access open), whatever capability a caller declares; `rules` reads the public rule base alone (no
// person in it) so the assistant can explain a rule when the person asks. A parameter nobody recorded is unknown: no verdict.
import { validateParams } from '../ai/agent_gateway_normalize.js';

export const FOOD_ADVICE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'health_access_denied_for_actor', 'health_reference_unavailable',
    'food_advice_tip_unknown', 'food_advice_list_unknown', 'prescriber_identity_required', 'food_advice_sheet_closed', 'FOOD_ADVICE_FAILED']);
const id = { type: 'string', minLength: 1, maxLength: 300 };
const words = { type: 'array', maxItems: 34, items: { type: 'string', minLength: 1, maxLength: 120 } };
const food = { type: 'object', additionalProperties: false, required: ['key', 'name'], properties: {
    key: { type: 'string', minLength: 1, maxLength: 300, description: 'The caller\'s own key for this food (an item id, a component id).' },
    name: { type: 'string', minLength: 1, maxLength: 400, description: 'The food as named (« Pâtes complètes », a product\'s name).' },
    text: { type: 'string', maxLength: 4000, description: 'What else describes it: a product\'s ingredient list.' },
    allergens: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 80 }, description: 'Open Food Facts allergen tags (en:peanuts…).' },
    traces: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 80 } },
    categories: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 120 }, description: 'Open Food Facts category tags (en:pastas…).' } } };
const output = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: FOOD_ADVICE_ERRORS } } };
const command = (action, persistent, description, properties, required = []) => Object.freeze({ name: `food_advice.${action}`, action, persistent,
    capability: `food_advice.${persistent ? 'write' : 'read'}`, description,
    input_schema: { type: 'object', additionalProperties: false, properties, required }, output_schema: output });

export const FOOD_ADVICE_COMMANDS = Object.freeze([
    command('verdicts', false, 'The person\'s verdicts on foods (up to 200): for each food key, its rows — À éviter, À limiter, an interaction with one of their medicines or supplements, a cooking or preparation tip, a corrected belief, what eVe proposes instead, their doctor\'s tip with his name — each with its reason and its source, and the mark the food takes (avoid, limit or none).',
        { foods: { type: 'array', minItems: 1, maxItems: 200, items: food } }, ['foods']),
    command('profile', false, 'What the advice is drawn from: the conditions held (from the Carnet, the declared allergens, the health profile, the measured parameters, the medicines) and those left unknown, with the parameters nobody recorded.', {}),
    command('products', false, 'D29 parity and the cross-check (R-115): for each current medicine and supplement, its interactions with the other products (ANSM thesaurus, SmPC 4.5, ANSES nutrivigilance), the spacing in hours they ask, what the person\'s conditions and allergies say of it, the SmPC 4.3/4.4/4.6 rules for their parameters (age, weight, sex, pregnancy, breastfeeding, kidneys, liver…), their antecedents, their life against the SmPC 4.2–4.8 (sport, sleep, bedtime, sun, driving, alcohol), the foods they buy or eat that it names, and what is unknown. `person_id`: a person whose list the account keeps (an ordonnance\'s patient): that list and their Carnet.', {
        person_id: { type: 'string', maxLength: 300, description: 'A person of the account\'s book whose list it keeps (an ordonnance\'s patient).' } }),
    command('reason', false, 'On the open food sheet, unfold (or fold again) the reason and the source of one of its rows.', { row: id }, ['row']),
    command('tips', false, 'The doctor\'s tips: those applied to the person (from a list they validated, each with its author\'s name) and those they wrote for others.', {}),
    command('tip_save', true, 'The doctor writes one tip in a list he keeps for a patient (share.list_create atome_list, then share.send): add (his own advice on foods), remove (a default rule id he lifts) or nuance (a default rule id he words his way). His name comes from his prescriber identity.', {
        list_id: id, tip_id: id, effect: { type: 'string', enum: ['add', 'remove', 'nuance'] }, condition: { type: 'string', maxLength: 80 },
        foods: words, words, rule_id: { type: 'string', maxLength: 120 }, text: { type: 'string', maxLength: 400 } }, ['list_id', 'effect']),
    command('tip_remove', true, 'The doctor takes one of his tips out of its list.', { tip_id: id }, ['tip_id']),
    command('rules', false, 'The public rule base alone (no person in it): every sourced rule naming a food, by condition, with its text, reason and source — to explain a rule when the person asks.', {
        name: { type: 'string', minLength: 1, maxLength: 400 } }, ['name'])
]);
export const FOOD_ADVICE_PUBLIC_ACTIONS = Object.freeze(['rules']);
export const validateFoodAdviceInput = (action, input) => {
    const contract = FOOD_ADVICE_COMMANDS.find(entry => entry.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    if (action === 'tip_save' && (input.effect === 'add' ? !input.text || !(input.foods?.length || input.words?.length)
        : !input.rule_id || (input.effect === 'nuance' && !input.text))) return 'INVALID_ARGUMENT';
    return null;
};
export const foodAdviceError = failure => (FOOD_ADVICE_ERRORS.includes(failure?.code || failure?.message) ? (failure.code || failure.message) : 'FOOD_ADVICE_FAILED');
export const FOOD_ADVICE_ASSISTANT_INSTRUCTIONS = 'Food advice from the person\'s health is health data, closed to the assistant: never call food_advice.* but food_advice.rules. When the person asks why a food is advised against or how to cook it (« pourquoi les pâtes al dente ? »), call food_advice.rules with the food\'s name and explain the rule in their words, citing its source; never say which condition the person has, never guess one, never diagnose.';
