// Deterministic health verdict for a packaged product, shared by the server
// provider (server/ws_open_food_facts.js) and any client that re-assesses a
// stored product. It reads only open Open Food Facts data:
//   - the Nutri-Score grade (a-e);
//   - the NOVA processing group (1-4);
//   - the EFSA overexposure risk of each additive, taken from the OFF additives
//     taxonomy (`efsa_evaluation_overexposure_risk`: en:high / en:moderate / en:no);
//   - whether OFF analysed an ingredient list (`ingredients_n` > 0): additives
//     are read from that list, so without it nothing is known about them.
// This is NOT the Yuka score: Yuka's rating is proprietary and unpublished, and
// nothing here reproduces or approximates it.
//
// Rules, first match wins:
//   avoid: what the selection policy below excludes — Nutri-Score E, an additive with
//          a high overexposure risk, or Nutri-Score D together with NOVA 4;
//   limit: Nutri-Score D, NOVA 4, an additive with a moderate risk, or a nutrient
//          above its high level (FOOD_NUTRIENT_HIGH: salt, sugars, fat, saturated fat);
//   good:  any other product carrying a Nutri-Score, whose ingredient list was
//          analysed: both rules above can then be checked.
// Anything else cannot be assessed: the verdict is null rather than a guess
// (a product known only by its NOVA group, like Nutella's OFF sheet of
// 2026-10-28 without Nutri-Score, is not good).
// Unknown never passes for good (user rule, todo/etude_nutrition_menus_2026-10-27.md).

import { foodAllergenTag } from './food_allergen_contract.js';

export const FOOD_HEALTH_VERDICTS = Object.freeze(['good', 'limit', 'avoid']);
export const FOOD_SELECTION_STATES = Object.freeze(['compliant', 'excluded', 'to_check']);

// The selection policy (todo/etude_nutrition_menus_2026-10-27.md §6.3): versioned data, each rule with
// what it reads and where that comes from. v1 is provisional (arbitrage 2, 2026-10-28): it only restates
// the rules eVe already applied to « avoid », in wait of the list established with professionals; the
// « limit » rules exclude nothing and stay an information of the product sheet. v2 (same day) adds the person's own
// declared allergens (validated mockup M2-C): a product naming one, or its traces when they count too, is excluded.
export const FOOD_SELECTION_POLICY = Object.freeze({ version: 'v2', provisional: true, since: '2026-10-28', rules: Object.freeze([
    // The person's own: first, so a sheet names it first; it is no provisional rule.
    { id: 'allergen_declared', provisional: false, reads: ['allergens', 'traces', 'ingredients_known', 'declared_allergens'],
        source: 'Open Food Facts: allergens and traces; the allergens the person declared (EU Regulation 1169/2011, Annex II)' },
    { id: 'nutriscore_e', provisional: true, reads: ['nutriscore'], source: 'Open Food Facts: Nutri-Score' },
    { id: 'nutriscore_d_nova_4', provisional: true, reads: ['nutriscore', 'nova'], source: 'Open Food Facts: Nutri-Score, NOVA group' },
    { id: 'additive_high_risk', provisional: true, reads: ['additives', 'ingredients_known'], source: 'Open Food Facts additives taxonomy: EFSA overexposure risk' }
].map(rule => Object.freeze({ ...rule, reads: Object.freeze(rule.reads) }))) });
export const FOOD_ADDITIVE_RISKS = Object.freeze(['high', 'moderate', 'no']);

// The « high » level per 100 g of the UK FSA front-of-pack scheme, the one Open Food Facts shows
// (its nutrient_levels); a drink's thresholds are half a food's. A nutrient above it makes the
// product « limit » (user, 2026-10-28).
export const FOOD_NUTRIENT_HIGH = Object.freeze({ fat: 17.5, saturated_fat: 5, sugars: 22.5, salt: 1.5 });
const DRINK_CATEGORY = 'en:beverages';

// The nutrients of a product (`nutriments_100g`, `categories_tags`) above their high level, in FOOD_NUTRIENT_HIGH's order.
export const highFoodNutrients = (product) => {
    const share = (product?.categories_tags || []).includes(DRINK_CATEGORY) ? 0.5 : 1;
    return Object.entries(FOOD_NUTRIENT_HIGH).filter(([key, high]) => Number(product?.nutriments_100g?.[key]) > high * share).map(([key]) => key);
};

const NUTRISCORE_GRADES = 'abcde';

// Each rule answers [state, reason]: unknown data is « to_check », never compliant.
const RULE_CHECKS = Object.freeze({
    nutriscore_e: ({ grade }) => (!grade ? ['to_check', 'no_nutriscore'] : grade === 'e' ? ['excluded', 'nutriscore_e'] : ['compliant']),
    nutriscore_d_nova_4: ({ grade, nova }) => (!grade ? ['to_check', 'no_nutriscore'] : grade !== 'd' ? ['compliant']
        : !nova ? ['to_check', 'no_nova'] : nova === 4 ? ['excluded', 'nutriscore_d_nova_4'] : ['compliant']),
    // An additive is read from the analysed ingredient list; the taxonomy marks the ones of high risk.
    additive_high_risk: ({ additives, known }) => (additives.some(additive => additive?.risk === 'high') ? ['excluded', 'additive_high_risk']
        : known ? ['compliant'] : ['to_check', 'ingredients_unknown']),
    // Nothing declared, nothing to check. A product whose ingredient list was not analysed may hide one.
    allergen_declared: ({ allergens, traces, known, declared }) => {
        if (!declared.allergens.length) return ['compliant'];
        const tags = declared.allergens.map(foodAllergenTag);
        return allergens.some(tag => tags.includes(tag)) ? ['excluded', 'allergen_declared']
            : declared.traces && traces.some(tag => tags.includes(tag)) ? ['excluded', 'allergen_traces']
                : known ? ['compliant'] : ['to_check', 'allergens_unknown'];
    }
});

// `product`: { nutriscore, nova, additives: [{ tag, risk }], ingredients_known, allergens, traces } (a product as
// server/ws_open_food_facts.js normalizes it, or as a shopping item keeps it); `declared`: { allergens: [key], traces }
// (program_collection_runtime.js `allergens_read`), absent where the person is not known.
// Returns { policy, provisional, state, rules: [{ rule_id, state, reason?, provisional, reads }] }: excluded when one
// rule excludes, else to_check when one cannot be checked, else compliant.
export const evaluateFoodSelection = (product, policy = FOOD_SELECTION_POLICY, declared = null) => {
    const facts = { grade: NUTRISCORE_GRADES.includes(product?.nutriscore || '-') ? product.nutriscore : null,
        nova: [1, 2, 3, 4].includes(product?.nova) ? product.nova : null,
        additives: Array.isArray(product?.additives) ? product.additives : [], known: product?.ingredients_known === true,
        allergens: Array.isArray(product?.allergens) ? product.allergens : [], traces: Array.isArray(product?.traces) ? product.traces : [],
        declared: { allergens: Array.isArray(declared?.allergens) ? declared.allergens : [], traces: declared?.traces === true } };
    const rules = policy.rules.map(({ id, reads, provisional }) => {
        const [state, reason] = RULE_CHECKS[id](facts);
        return { rule_id: id, state, ...(reason ? { reason } : {}), provisional, reads };
    });
    const state = ['excluded', 'to_check'].find(wanted => rules.some(rule => rule.state === wanted)) || 'compliant';
    return { policy: policy.version, provisional: policy.provisional, state, rules };
};

// `product`: { nutriscore: 'a'..'e' | null, nova: 1..4 | null, additives: [{ tag }], ingredients_known: boolean }.
// `additiveRisks`: Map of additive tag (e.g. 'en:e250') → 'high' | 'moderate' | 'no'.
// « avoid » is what the selection policy excludes.
export const assessFoodHealth = (product, additiveRisks) => {
    if (!(additiveRisks instanceof Map)) throw new TypeError('assessFoodHealth: additiveRisks must be a Map');
    const additives = (Array.isArray(product?.additives) ? product.additives : []).map(additive => ({ ...additive, risk: additiveRisks.get(additive?.tag) || null }));
    if (evaluateFoodSelection({ ...product, additives }).state === 'excluded') return 'avoid';
    const grade = NUTRISCORE_GRADES.includes(product?.nutriscore || '-') ? product.nutriscore : null;
    if (grade === 'd' || product?.nova === 4 || additives.some(additive => additive.risk === 'moderate')
        || highFoodNutrients(product).length) return 'limit';
    return grade && product?.ingredients_known === true ? 'good' : null;
};

// The worst additive risk of a normalized product (`additives: [{ tag, risk }]`):
// 'none' only when its ingredient list was analysed and every additive found
// carries a known EFSA risk below moderate; 'unknown' otherwise.
export const summarizeAdditivesRisk = (product) => {
    const additives = Array.isArray(product?.additives) ? product.additives : [];
    if (additives.some((entry) => entry?.risk === 'high')) return 'high';
    if (additives.some((entry) => entry?.risk === 'moderate')) return 'moderate';
    return product?.ingredients_known === true && additives.every((entry) => entry?.risk) ? 'none' : 'unknown';
};

// The OFF additives taxonomy (additives.json) → Map consumed above.
export const readAdditiveRisks = (taxonomy) => {
    const risks = new Map();
    for (const [tag, entry] of Object.entries(taxonomy || {})) {
        const risk = String(entry?.efsa_evaluation_overexposure_risk?.en || '').replace(/^en:/, '');
        if (FOOD_ADDITIVE_RISKS.includes(risk)) risks.set(tag, risk);
    }
    return risks;
};
