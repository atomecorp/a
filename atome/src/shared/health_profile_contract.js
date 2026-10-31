/** The health profile's vocabulary (decisions Q25, Q28, Q29 of 30 Oct. 2026, Q70 and Q71 of 31 Oct.; study
 *  todo/etude_sante_plaisir_thalasso_2026-10-22.md § 5). Its first declaration is a list of standard checkbox rows, one per
 *  category of what a practice must take care of, « Rien à déclarer » first; a care's or a breath's precautions name the same
 *  categories, so only the missing one is ever asked. The whole profile stays on this device only (Q29, Q70:
 *  #device_scope_contract.js): the declaration record (`healthProfileId`) and the Programme preferences that detail a category
 *  (`preference_key`: allergies, intolerances; #program_collection_contract.js). The assistant reads it only with the
 *  person's agreement, asked each time. */
import { deviceAtomeId } from './device_scope_contract.js';

export const HEALTH_PROFILE_CATEGORIES = Object.freeze([
    ['allergies', 'allergies'], ['intolerances', 'intolerances'], ['pregnancy', null], ['heart', null], ['joints', null],
    ['breathing', null], ['skin', null], ['metabolism', null], ['epilepsy', null], ['panic', null]
].map(([id, preference_key]) => Object.freeze({ id, preference_key, label_key: `eve.health.profile.pill.${id}` })));
export const HEALTH_PROFILE_CATEGORY_IDS = Object.freeze(HEALTH_PROFILE_CATEGORIES.map(category => category.id));
/** The row that declares nothing: ticked, it unticks every category; a category ticked unticks it. */
export const HEALTH_PROFILE_NOTHING = 'nothing';
export const healthProfileCategory = id => {
    const category = HEALTH_PROFILE_CATEGORIES.find(entry => entry.id === id);
    if (!category) throw new Error('health_profile_category_unknown');
    return category;
};
/** The person's declaration on this device: `{ version: 1, nothing, declared: [category ids], date }`. */
export const healthProfileId = actor => deviceAtomeId('health_profile', String(actor));
export const validateHealthProfileDeclaration = value => {
    const valid = value?.version === 1 && Object.keys(value).every(key => ['version', 'nothing', 'declared', 'date'].includes(key))
        && typeof value.nothing === 'boolean' && Array.isArray(value.declared) && new Set(value.declared).size === value.declared.length
        && value.declared.every(id => HEALTH_PROFILE_CATEGORY_IDS.includes(id)) && !(value.nothing && value.declared.length)
        && typeof value.date === 'string' && Number.isFinite(Date.parse(value.date));
    if (!valid) throw new Error('health_profile_declaration_invalid');
    return value;
};
/** One row touched: « Rien à déclarer » ticked clears the categories; a category ticked clears « Rien à déclarer ». */
export const healthProfileDeclare = (previous, row, ticked, date) => {
    const declared = previous?.declared || [];
    if (row === HEALTH_PROFILE_NOTHING) return validateHealthProfileDeclaration({ version: 1, nothing: ticked, declared: ticked ? [] : declared, date });
    healthProfileCategory(row);
    const next = ticked ? [...new Set([...declared, row])] : declared.filter(id => id !== row);
    return validateHealthProfileDeclaration({ version: 1, nothing: ticked ? false : previous?.nothing === true, declared: next, date });
};
