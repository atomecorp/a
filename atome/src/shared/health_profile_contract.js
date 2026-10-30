/** The health profile's vocabulary (decisions Q25, Q28, Q29 of 30 Oct. 2026; study todo/etude_sante_plaisir_thalasso_2026-10-22.md
 *  § 5). Its first declaration is a set of pills, each a category of what a practice must take care of, plus « Rien à
 *  déclarer »; a care's or a breath's precautions name the same categories, so only the missing one is ever asked.
 *  `preference_key`: the Programme preference that already holds the category (#program_collection_contract.js), null for a
 *  category no store holds yet: the profile stays on the device only (Q29) and no device-only store exists (FRAMEWORK_STATE
 *  2026-10-30, « Santé, Plaisir, Thalasso »). The assistant reads it only with the person's agreement, asked each time. */
export const HEALTH_PROFILE_CATEGORIES = Object.freeze([
    ['allergies', 'allergies'], ['intolerances', 'intolerances'], ['pregnancy', null], ['heart', null], ['joints', null],
    ['breathing', null], ['skin', null], ['metabolism', null], ['epilepsy', null], ['panic', null]
].map(([id, preference_key]) => Object.freeze({ id, preference_key, label_key: `eve.health.profile.pill.${id}` })));
export const HEALTH_PROFILE_CATEGORY_IDS = Object.freeze(HEALTH_PROFILE_CATEGORIES.map(category => category.id));
/** The pill that declares nothing (`answer_state` « unknown » of the Programme permissions, never a fact). */
export const HEALTH_PROFILE_NOTHING = 'nothing';
/** The categories a store holds today: what the assistant may read, once the person agrees. */
export const HEALTH_PROFILE_STORED = Object.freeze(HEALTH_PROFILE_CATEGORIES.filter(category => category.preference_key));
export const healthProfileCategory = id => {
    const category = HEALTH_PROFILE_CATEGORIES.find(entry => entry.id === id);
    if (!category) throw new Error('health_profile_category_unknown');
    return category;
};
