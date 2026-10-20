/** Explicit food choices; quantities and nutritional advice are never inferred. A planned meal's
 *  declared components feed the shopping list as they are (eVe/domains/shopping/shopping_list_model.js). */
export const NUTRITION_MEAL_TYPES = Object.freeze(['breakfast', 'lunch', 'dinner', 'snack', 'before_activity', 'after_activity', 'other']);
export const NUTRITION_FOOD_GROUPS = Object.freeze(['starches', 'vegetables', 'fruit', 'legumes', 'protein', 'dairy_alternative', 'fat', 'drink']);
export const NUTRITION_PORTION_UNITS = Object.freeze(['g', 'ml', 'portion', 'piece']);
export const PROGRAM_NUTRITION_SCHEMA = { type: 'object', additionalProperties: false, required: ['version', 'mode'], properties: {
    version: { type: 'number', enum: [1] }, mode: { type: 'string', enum: ['habit', 'meal'] },
    habit: { type: 'string', minLength: 1, maxLength: 2000 }, meal_type: { type: 'string', enum: NUTRITION_MEAL_TYPES },
    planning_state: { type: 'string', enum: ['proposed', 'planned'] },
    components: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', additionalProperties: false,
        required: ['id', 'group', 'food'], properties: { id: { type: 'string', minLength: 1 },
            group: { type: 'string', enum: NUTRITION_FOOD_GROUPS }, food: { type: 'string', minLength: 1, maxLength: 400 },
            portion: { type: 'object', additionalProperties: false, required: ['value', 'unit'], properties: {
                value: { type: 'number', minimum: 0 }, unit: { type: 'string', enum: NUTRITION_PORTION_UNITS }
            } }
        } } },
    preparation_minutes: { type: 'number', minimum: 0, maximum: 10080 },
    shopping_notes: { type: 'string', maxLength: 4000 }, recipe_source: { type: 'string', maxLength: 2000 }
} };
export const NUTRITION_CONSUMPTION_SCHEMA = { type: 'object', additionalProperties: false,
    required: ['version', 'activity_id', 'activity_version', 'date', 'meal'], properties: {
        version: { type: 'number', enum: [1] }, activity_id: { type: 'string', minLength: 1 },
        activity_version: { type: 'number', minimum: 1 }, date: { type: 'string' }, meal: PROGRAM_NUTRITION_SCHEMA
    } };
