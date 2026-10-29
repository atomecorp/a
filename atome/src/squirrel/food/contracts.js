import { validateParams } from '../ai/agent_gateway_normalize.js';
import { SHOPPING_IMAGE_SCHEMA, SHOPPING_PRODUCT_SOURCES } from '../../shared/shopping_list_contract.js';

// One contract for runtime V2, AI discovery and direct MCP calls, like GPS. Product data
// comes from Open Food Facts (food), Open Beauty Facts and Open Products Facts (ODbL).
// The verdict is eVe's open assessment (food_health_assessment.js), never the Yuka score.
export const FOOD_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_CONFIGURED', 'RATE_LIMITED', 'PRODUCT_NOT_FOUND',
    'PROVIDER_UNAVAILABLE', 'ITEM_NOT_FOUND', 'AUTH_REQUIRED', 'VERSION_CONFLICT', 'CONTEXT_CHANGED', 'COMMIT_FAILED',
    'HOST_UNSUPPORTED', 'PERMISSION_DENIED', 'CANCELLED', 'NO_BARCODE', 'PHOTO_UNAVAILABLE']);

const barcode = { type: 'string', pattern: '^[0-9]{8,14}$' };
const source = { type: 'string', enum: SHOPPING_PRODUCT_SOURCES };
const definitions = {
    lookup: [{ barcode, source }, ['barcode'], 'Read one product by barcode: name, brand, Nutri-Score, NOVA group, additives with their EFSA risk, nutriments per 100 g, eVe\'s verdict (good, limit, avoid) and its selection (compliant, excluded, to_check under the policy v2, each rule with its reason; it counts the allergens the person declared). source: off food (default), obf beauty, opf other products.', false],
    search: [{ query: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' }, source, limit: { type: 'integer', minimum: 1, maximum: 20 } },
        ['query'], 'Search products by words (product, brand) to propose, with their verdict; does not change the shopping list.', false],
    alternatives: [{ barcode }, ['barcode'], 'Propose up to three healthier food products of the same category (verdict good, better Nutri-Score, none naming an allergen the person declared), and apart (to_check) those the selection policy cannot check.', false],
    attach: [{ item_id: { type: 'string', minLength: 1, maxLength: 200 }, barcode, source }, ['item_id', 'barcode'],
        'Link a product to a shopping list item: the item keeps the product\'s scores, verdict and what its selection reads.', true],
    scan: [{ item_id: { type: 'string', minLength: 1, maxLength: 200 }, check: { type: 'boolean' } }, [],
        'Scan a barcode with this device camera and read the product; the matching unchecked shopping item (item_id, else by barcode or name) is checked, else the product is returned to propose adding it. check false only links the product to that item, leaving it to buy.', true],
    add: [{ barcode, source, avoid: { type: 'boolean' }, confirm: { type: 'boolean' }, image: SHOPPING_IMAGE_SCHEMA }, [],
        'Add a product to the shopping list in one take: without barcode the device camera reads its barcode and takes its photo at the same instant. A product judged good (or without verdict) joins the basket at once (added true); one to limit or to avoid, or one already set aside in « À éviter », is NOT added: warning true, with its verdict, risky additives and high nutrients (nutrients_high) to say before asking. Then call again with its barcode (and the image the warning gave back): confirm true puts it in the basket anyway, avoid true sets it aside in « À éviter » (advised).', true],
    identify: [{}, [], 'Scan a barcode with this device camera and only read the product, changing nothing (the shopping list stays as it is): a meal\'s food in the Programme links it to count its nutrients.', false]
};
export const FOOD_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent]]) => Object.freeze({
    name: `food.${action}`, action, description, persistent, capability: persistent ? 'shopping.write' : 'food.read',
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: FOOD_ERRORS },
        product: { type: 'object' }, products: { type: 'array', items: { type: 'object' } }, alternatives: { type: 'array', items: { type: 'object' } },
        to_check: { type: 'array', items: { type: 'object' } },
        item: { type: 'object' }, checked: { type: 'boolean' }, added: { type: 'boolean' }, warning: { type: 'boolean' }, avoided: { type: 'boolean' }, image: { type: 'string' } } }
})));
export const validateFoodInput = (action, input) => {
    const contract = FOOD_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const foodError = error => FOOD_ERRORS.includes(error?.code || error?.message || error)
    ? (error?.code || error?.message || error) : 'PROVIDER_UNAVAILABLE';
export const FOOD_ASSISTANT_INSTRUCTIONS = 'Products: « est-ce que ce produit est sain », « c\'est quoi le Nutri-Score du Nutella » call food.search (or food.lookup with a barcode) and say the verdict, Nutri-Score and NOVA group in plain words; « trouve-moi mieux », « une alternative plus saine » call food.alternatives; « ajoute ce produit » calls food.add: on warning, say why (verdict, a declared allergen, risky additives, high salt, sugars or fat) and advise « À éviter », then food.add with its barcode and avoid true, or confirm true if the user still wants it; « scanne ce produit » calls food.scan (food.identify only reads it, for a meal\'s food). The verdict is eVe\'s open assessment from Open Food Facts data, never the Yuka score. NOT_CONFIGURED or PROVIDER_UNAVAILABLE means the product service is unavailable: say so, invent nothing. A product without verdict lacks the data to be assessed (often its ingredient list): say so, never call it healthy. selection.state excluded gives each excluding rule\'s reason (say so when the rule is provisional; allergen_declared or allergen_traces: the product names an allergen the person declared, never advise it); to_check says what is missing: never present it as compliant nor among the proposals.';
