// Canonical private shopping list item. One Atome per item so that checking on one device
// never conflicts with an addition on another. Nutrition contributions copy the user's
// declared foods and portions; nothing is inferred.
import { NUTRITION_FOOD_GROUPS, NUTRITION_PORTION_UNITS } from './program_nutrition_contract.js';

export const SHOPPING_ITEM_ATOME_TYPE = 'shopping_item';
// Each account's basket: one root under which every item lies (its meta parent_id). Shared live with
// other accounts, it carries every item, present and to come (server/syncShareHierarchy.js).
export const SHOPPING_LIST_ATOME_TYPE = 'shopping_list';
export const shoppingListId = owner => `shopping_list_${owner}`;
export const SHOPPING_LIST_TYPE = Object.freeze({ type: SHOPPING_LIST_ATOME_TYPE, kind: 'data_model', traits: ['data'], schema: {
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] } } });
export const SHOPPING_CATEGORIES = Object.freeze(['food', 'beauty', 'hygiene', 'household', 'kitchen', 'other']);
export const SHOPPING_UNITS = NUTRITION_PORTION_UNITS;
export const SHOPPING_PRODUCT_SOURCES = Object.freeze(['off', 'obf', 'opf']);
export const SHOPPING_VERDICTS = Object.freeze(['good', 'limit', 'avoid', 'unknown']);

export const SHOPPING_QUANTITY_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['value', 'unit'],
    properties: { value: { type: 'number', minimum: 0 }, unit: { type: 'string', enum: SHOPPING_UNITS } } });
// What the user paid or expects to pay, typed as they go (no budget is derived here).
export const SHOPPING_PRICE_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['amount', 'currency'],
    properties: { amount: { type: 'number', minimum: 0, maximum: 100000 }, currency: { type: 'string', pattern: '^[A-Z]{3}$' } } });
// The user's own photo of the item, kept small on the item itself (a few tens of kB).
export const SHOPPING_IMAGE_SCHEMA = Object.freeze({ type: 'string', maxLength: 120000, pattern: '^data:image/(jpeg|png|webp);base64,' });
export const SHOPPING_CONTRIBUTION_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['kind'], properties: {
    kind: { type: 'string', enum: ['manual', 'nutrition'] }, activity_id: { type: 'string', minLength: 1 },
    activity_version: { type: 'number', minimum: 1 }, component_id: { type: 'string', minLength: 1 }, quantity: SHOPPING_QUANTITY_SCHEMA
} });
export const SHOPPING_PRODUCT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['barcode', 'source'], properties: {
    barcode: { type: 'string', pattern: '^[0-9]{8,14}$' }, source: { type: 'string', enum: SHOPPING_PRODUCT_SOURCES },
    name: { type: 'string', maxLength: 400 }, brand: { type: 'string', maxLength: 400 }, image_url: { type: 'string', maxLength: 2000 },
    nutriscore: { type: 'string', maxLength: 16 }, nova: { type: 'number', minimum: 1, maximum: 4 },
    green_score: { type: 'string', maxLength: 16 }, additives_risk: { type: 'string', enum: ['none', 'moderate', 'high', 'unknown'] },
    // What the selection policy reads (food_health_assessment.js#evaluateFoodSelection), kept so it judges the item again.
    additives: { type: 'array', maxItems: 64, items: { type: 'object', additionalProperties: false, required: ['tag', 'risk'], properties: {
        tag: { type: 'string', minLength: 1, maxLength: 80 }, risk: { type: ['string', 'null'], enum: ['high', 'moderate', 'no', null] } } } },
    ingredients_known: { type: 'boolean' },
    // The Open Food Facts allergens taxonomy tags it names, and those it may hold as traces (the rule `allergen_declared`).
    allergens: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 80 } },
    traces: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 80 } },
    // The nutrients above their high level (food_health_assessment.js#highFoodNutrients), reasons of a « limit ».
    nutrients_high: { type: 'array', maxItems: 4, items: { type: 'string', enum: ['fat', 'saturated_fat', 'sugars', 'salt'] } },
    verdict: { type: 'string', enum: SHOPPING_VERDICTS }, fetched_at: { type: 'string' }
} });
export const SHOPPING_ITEM_TYPE = Object.freeze({ type: SHOPPING_ITEM_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    label: { type: 'string', minLength: 1, maxLength: 400 }, normalized_label: { type: 'string', minLength: 1, maxLength: 400 },
    category: { type: 'string', enum: SHOPPING_CATEGORIES }, food_group: { type: 'string', enum: NUTRITION_FOOD_GROUPS },
    quantity: SHOPPING_QUANTITY_SCHEMA, checked: { type: 'boolean' }, checked_at: { type: 'string' },
    // When it was last put in the basket (added, or taken back out of the bought ones): Quotidien's Récent.
    added_at: { type: 'string' },
    note: { type: 'string', maxLength: 2000 },
    contributions: { type: 'array', maxItems: 200, items: SHOPPING_CONTRIBUTION_SCHEMA },
    product: SHOPPING_PRODUCT_SCHEMA, favorite: { type: 'boolean' }, price: SHOPPING_PRICE_SCHEMA, image: SHOPPING_IMAGE_SCHEMA, revision: { type: 'number', minimum: 0 },
    // Set aside in Quotidien's « À éviter » (never in the basket), and since when.
    avoided: { type: 'boolean' }, avoided_at: { type: 'string' },
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] }
} });
