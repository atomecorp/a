// The 14 allergens the EU requires a label to name (Regulation (EU) No 1169/2011, Annex II), in its order,
// each with the Open Food Facts allergens taxonomy tag a product's `allergens_tags` / `traces_tags` carry.
// A person declares them by key (program_collection_contract.js, question « allergies »); the selection
// policy compares their tags (food_health_assessment.js, rule `allergen_declared`).
export const FOOD_ALLERGENS = Object.freeze([
    ['gluten', 'en:gluten'], ['crustaceans', 'en:crustaceans'], ['eggs', 'en:eggs'], ['fish', 'en:fish'],
    ['peanuts', 'en:peanuts'], ['soybeans', 'en:soybeans'], ['milk', 'en:milk'], ['nuts', 'en:nuts'],
    ['celery', 'en:celery'], ['mustard', 'en:mustard'], ['sesame', 'en:sesame-seeds'],
    ['sulphites', 'en:sulphur-dioxide-and-sulphites'], ['lupin', 'en:lupin'], ['molluscs', 'en:molluscs']
].map(([key, tag]) => Object.freeze({ key, tag })));
export const FOOD_ALLERGEN_KEYS = Object.freeze(FOOD_ALLERGENS.map(allergen => allergen.key));
const TAG_BY_KEY = new Map(FOOD_ALLERGENS.map(allergen => [allergen.key, allergen.tag]));
export const foodAllergenTag = key => {
    const tag = TAG_BY_KEY.get(key);
    if (!tag) throw new Error(`food_allergen_unknown:${key}`);
    return tag;
};
