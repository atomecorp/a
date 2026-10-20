// Canonical private shopping list item. One Atome per item so that checking on one device
// never conflicts with an addition on another. Nutrition contributions copy the user's
// declared foods and portions; nothing is inferred.
import { NUTRITION_FOOD_GROUPS, NUTRITION_PORTION_UNITS } from './program_nutrition_contract.js';

export const SHOPPING_ITEM_ATOME_TYPE = 'shopping_item';
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
    verdict: { type: 'string', enum: SHOPPING_VERDICTS }, fetched_at: { type: 'string' }
} });
export const SHOPPING_ITEM_TYPE = Object.freeze({ type: SHOPPING_ITEM_ATOME_TYPE, kind: 'data_model', traits: ['data', 'editable'], schema: {
    label: { type: 'string', minLength: 1, maxLength: 400 }, normalized_label: { type: 'string', minLength: 1, maxLength: 400 },
    category: { type: 'string', enum: SHOPPING_CATEGORIES }, food_group: { type: 'string', enum: NUTRITION_FOOD_GROUPS },
    quantity: SHOPPING_QUANTITY_SCHEMA, checked: { type: 'boolean' }, checked_at: { type: 'string' },
    note: { type: 'string', maxLength: 2000 },
    contributions: { type: 'array', maxItems: 200, items: SHOPPING_CONTRIBUTION_SCHEMA },
    product: SHOPPING_PRODUCT_SCHEMA, favorite: { type: 'boolean' }, price: SHOPPING_PRICE_SCHEMA, image: SHOPPING_IMAGE_SCHEMA, revision: { type: 'number', minimum: 0 },
    access: { type: 'string', enum: ['private'] }, visibility: { type: 'string', enum: ['private'] }
} });
