import { validateParams } from '../ai/agent_gateway_normalize.js';
import { SHOPPING_PRODUCT_SOURCES } from '../../shared/shopping_list_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls, like GPS. Product data
// comes from Open Food Facts (food), Open Beauty Facts and Open Products Facts (ODbL).
// The verdict is eVe's open assessment (food_health_assessment.js), never the Yuka score.
export const FOOD_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_CONFIGURED', 'RATE_LIMITED', 'PRODUCT_NOT_FOUND',
    'PROVIDER_UNAVAILABLE', 'ITEM_NOT_FOUND', 'AUTH_REQUIRED', 'VERSION_CONFLICT', 'CONTEXT_CHANGED', 'COMMIT_FAILED',
    'HOST_UNSUPPORTED', 'PERMISSION_DENIED', 'CANCELLED', 'NO_BARCODE']);

const barcode = { type: 'string', pattern: '^[0-9]{8,14}$' };
const source = { type: 'string', enum: SHOPPING_PRODUCT_SOURCES };
const definitions = {
    lookup: [{ barcode, source }, ['barcode'], 'Read one product by barcode: name, brand, Nutri-Score, NOVA group, additives with their EFSA risk, nutriments per 100 g and eVe\'s verdict (good, limit, avoid). source: off food (default), obf beauty, opf other products.', false],
    search: [{ query: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' }, source, limit: { type: 'integer', minimum: 1, maximum: 20 } },
        ['query'], 'Search products by words (product, brand) to propose, with their verdict; does not change the shopping list.', false],
    alternatives: [{ barcode }, ['barcode'], 'Propose up to three healthier food products of the same category (verdict good, better Nutri-Score).', false],
    attach: [{ item_id: { type: 'string', minLength: 1, maxLength: 200 }, barcode, source }, ['item_id', 'barcode'],
        'Link a product to a shopping list item: the item keeps the product\'s scores and verdict.', true],
    scan: [{ item_id: { type: 'string', minLength: 1, maxLength: 200 }, check: { type: 'boolean' } }, [],
        'Scan a barcode with this device camera and read the product; the matching unchecked shopping item (item_id, else by barcode or name) is checked, else the product is returned to propose adding it. check false only links the product to that item, leaving it to buy.', true]
};
export const FOOD_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `food.${action}`, action, description, persistent, capability: persistent ? 'shopping.write' : 'food.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: FOOD_ERRORS },
        product: { type: 'object' }, products: { type: 'array', items: { type: 'object' } }, alternatives: { type: 'array', items: { type: 'object' } },
        item: { type: 'object' }, checked: { type: 'boolean' } } }
})));
export const validateFoodInput = (action, input) => {
    const contract = FOOD_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const foodError = error => FOOD_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'PROVIDER_UNAVAILABLE';
export const FOOD_ASSISTANT_INSTRUCTIONS = 'Products: « est-ce que ce produit est sain », « c\'est quoi le Nutri-Score du Nutella » call food.search (or food.lookup with a barcode) and say the verdict, Nutri-Score and NOVA group in plain words; « trouve-moi mieux », « une alternative plus saine » call food.alternatives; « scanne ce produit » calls food.scan. The verdict is eVe\'s open assessment from Open Food Facts data, never the Yuka score. NOT_CONFIGURED or PROVIDER_UNAVAILABLE means the product service is unavailable: say so, invent nothing.';
