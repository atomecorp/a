import { validateParams } from '../ai/agent_gateway_normalize.js';
import { SHOPPING_CATEGORIES, SHOPPING_IMAGE_SCHEMA, SHOPPING_PRICE_SCHEMA, SHOPPING_QUANTITY_SCHEMA } from '../../shared/shopping_list_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls, like GPS.
export const SHOPPING_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'AUTH_REQUIRED', 'ITEM_NOT_FOUND', 'AMBIGUOUS_ITEM',
    'ACTIVITY_NOT_FOUND', 'VERSION_CONFLICT', 'CONTEXT_CHANGED', 'LIST_INCOMPLETE', 'PRESENTATION_UNAVAILABLE', 'COMMIT_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const label = { type: 'string', minLength: 1, maxLength: 400, pattern: '\\S' };
const category = { type: 'string', enum: SHOPPING_CATEGORIES };
const note = { type: 'string', maxLength: 2000 };
const target = { item_id: id, label };
const definitions = {
    list: [{ category, checked: { type: 'boolean' } }, [], 'Read the private shopping list: unchecked items first, by category.', false],
    add: [{ label, category, quantity: SHOPPING_QUANTITY_SCHEMA, note }, ['label'],
        'Add an item in the user\'s words (food by default; beauty, hygiene, household, kitchen or other). The same unchecked item receives the quantity instead of a duplicate.', true],
    update: [{ item_id: id, label, category, quantity: SHOPPING_QUANTITY_SCHEMA, note, favorite: { type: 'boolean' },
        price: SHOPPING_PRICE_SCHEMA, image: SHOPPING_IMAGE_SCHEMA }, ['item_id'],
        'Change an item. quantity is the user\'s own amount, added to the amounts planned by meals; price { amount, currency } is what the user pays; favorite keeps it among the favourites; image is the user\'s photo (data URL).', true],
    check: [target, [], 'Mark an item as bought, by item_id or by its label in the user\'s words.', true],
    uncheck: [target, [], 'Mark a bought item as still to buy, by item_id or label.', true],
    remove: [target, [], 'Remove an item from the list, by item_id or label.', true],
    clear_checked: [{}, [], 'Remove every bought item from the list.', true],
    sync_nutrition: [{ activity_id: id }, ['activity_id'],
        'Recompute the list contributions of one nutrition activity: a planned meal adds its declared foods and portions; checked items are never touched.', true],
    open: [{}, [], 'Open the shopping list on the current presentation surface.', false]
};
const itemSchema = { type: 'object', required: ['id', 'label', 'category', 'checked'], properties: {
    id: { type: 'string' }, label: { type: 'string' }, category: { type: 'string' }, food_group: { type: 'string' },
    quantity: SHOPPING_QUANTITY_SCHEMA, checked: { type: 'boolean' }, checked_at: { type: 'string' }, note: { type: 'string' },
    product: { type: 'object' }, favorite: { type: 'boolean' }, price: SHOPPING_PRICE_SCHEMA, image: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } } };
export const SHOPPING_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `shopping.${action}`, action, description, persistent, capability: persistent ? 'shopping.write' : 'shopping.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: SHOPPING_ERRORS },
        item: itemSchema, items: { type: 'array', items: itemSchema }, candidates: { type: 'array', items: itemSchema },
        changed: { type: 'integer', minimum: 0 } } }
})));
export const validateShoppingInput = (action, input) => {
    const contract = SHOPPING_COMMANDS.find(command => command.action === action);
    if (!contract || !validateParams(contract.input_schema, input).ok) return 'INVALID_ARGUMENT';
    return ['check', 'uncheck', 'remove'].includes(action) && !input.item_id && !input.label ? 'INVALID_ARGUMENT' : null;
};
export const shoppingError = error => SHOPPING_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'COMMIT_FAILED';
export const SHOPPING_ASSISTANT_INSTRUCTIONS = 'Shopping list: « ajoute du lait », « mets 2 shampoings sur la liste » call shopping.add with the item in the user\'s words (category beauty, hygiene, household or kitchen when obvious, food otherwise); « j\'ai pris les tomates », « coche le pain » call shopping.check with the label; « le Nutella coûte 3,49 » calls shopping.update with price { amount: 3.49, currency: \'EUR\' }; « qu\'est-ce qu\'il me reste à acheter » calls shopping.list with checked false; « montre ma liste de courses » calls shopping.open. AMBIGUOUS_ITEM means ask which candidate. Never call shopping.clear_checked unless the user asks to empty the bought items.';
