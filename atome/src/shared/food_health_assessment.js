// Deterministic health verdict for a packaged product, shared by the server
// provider (server/ws_open_food_facts.js) and any client that re-assesses a
// stored product. It reads only open Open Food Facts data:
//   - the Nutri-Score grade (a-e);
//   - the NOVA processing group (1-4);
//   - the EFSA overexposure risk of each additive, taken from the OFF additives
//     taxonomy (`efsa_evaluation_overexposure_risk`: en:high / en:moderate / en:no).
// This is NOT the Yuka score: Yuka's rating is proprietary and unpublished, and
// nothing here reproduces or approximates it.
//
// Rules, first match wins:
//   avoid: Nutri-Score E, an additive with a high overexposure risk, or
//          Nutri-Score D together with NOVA 4;
//   limit: Nutri-Score D, NOVA 4, or an additive with a moderate risk;
//   good:  any other product carrying a Nutri-Score or a NOVA group.
// A product with neither grade and no risky additive cannot be assessed: the
// verdict is null rather than a guess.

export const FOOD_HEALTH_VERDICTS = Object.freeze(['good', 'limit', 'avoid']);
export const FOOD_ADDITIVE_RISKS = Object.freeze(['high', 'moderate', 'no']);

const NUTRISCORE_GRADES = 'abcde';

// `product`: { nutriscore: 'a'..'e' | null, nova: 1..4 | null, additives: [{ tag }] }.
// `additiveRisks`: Map of additive tag (e.g. 'en:e250') → 'high' | 'moderate' | 'no'.
export const assessFoodHealth = (product, additiveRisks) => {
    if (!(additiveRisks instanceof Map)) throw new TypeError('assessFoodHealth: additiveRisks must be a Map');
    const grade = NUTRISCORE_GRADES.includes(product?.nutriscore || '-') ? product.nutriscore : null;
    const nova = [1, 2, 3, 4].includes(product?.nova) ? product.nova : null;
    const risks = new Set((Array.isArray(product?.additives) ? product.additives : [])
        .map((additive) => additiveRisks.get(additive?.tag)));
    if (grade === 'e' || risks.has('high') || (grade === 'd' && nova === 4)) return 'avoid';
    if (grade === 'd' || nova === 4 || risks.has('moderate')) return 'limit';
    return grade || nova ? 'good' : null;
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
