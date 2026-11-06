/** The health profile's vocabulary (decisions Q25, Q28, Q29 of 30 Oct. 2026, Q71 of 31 Oct.; study
 *  todo/etude_sante_plaisir_thalasso_2026-10-22.md § 5). Its first declaration is a list of standard checkbox rows, one per
 *  category of what a practice must take care of, « Rien à déclarer » first; a care's or a breath's precautions name the same
 *  categories, so only the missing one is ever asked. The whole profile lives on the server, sealed for its owner alone
 *  (AGENTS.md rule 21, 4 Nov. 2026, replacing Q70's « this device only »; #eVe/domains/programs/health_profile_store.js): the
 *  declaration record (`healthProfileId`) and the Programme preferences that detail a category (`preference_key`: allergies,
 *  intolerances; #program_collection_contract.js). The assistant reads it only with the person's agreement, asked each time. */
import { deviceAtomeId } from './device_scope_contract.js';

export const HEALTH_PROFILE_CATEGORIES = Object.freeze([
    ['allergies', 'allergies'], ['intolerances', 'intolerances'], ['pregnancy', null], ['breastfeeding', null], ['driving', null], ['sun', null], ['heart', null], ['joints', null],
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
/** The profile's one value set on a roller (R-115 cross-check, 5 Nov. 2026): the glasses of alcohol a week, a whole number. */
export const HEALTH_PROFILE_ALCOHOL = 'alcohol';
export const HEALTH_PROFILE_ALCOHOL_MAX = 99;
const glassesValid = glasses => Number.isInteger(glasses) && glasses >= 0 && glasses <= HEALTH_PROFILE_ALCOHOL_MAX;
/** The person's declaration on this device: `{ version: 1, nothing, declared: [category ids], alcohol_week?, date }` —
 * `alcohol_week` absent while the person never set it (unknown). */
export const healthProfileId = actor => 'health_profile:' + encodeURIComponent(String(actor));
/** Where Q70 kept it, on one device (read once by the move to the server, then deleted). */
export const healthProfileDeviceId = actor => deviceAtomeId('health_profile', String(actor));
export const validateHealthProfileDeclaration = value => {
    const valid = value?.version === 1 && Object.keys(value).every(key => ['version', 'nothing', 'declared', 'alcohol_week', 'date'].includes(key))
        && typeof value.nothing === 'boolean' && Array.isArray(value.declared) && new Set(value.declared).size === value.declared.length
        && value.declared.every(id => HEALTH_PROFILE_CATEGORY_IDS.includes(id)) && !(value.nothing && value.declared.length)
        && (value.alcohol_week === undefined || glassesValid(value.alcohol_week)) && !(value.nothing && value.alcohol_week > 0)
        && typeof value.date === 'string' && Number.isFinite(Date.parse(value.date));
    if (!valid) throw new Error('health_profile_declaration_invalid');
    return value;
};
/** One row touched: « Rien à déclarer » ticked clears the categories; a category ticked clears « Rien à déclarer ». */
/** The glasses a week: « Rien à déclarer » ticked sets them to 0, glasses set above 0 clear it. */
export const healthProfileDeclare = (previous, row, ticked, date) => {
    const declared = previous?.declared || [];
    const glasses = previous?.alcohol_week === undefined ? {} : { alcohol_week: previous.alcohol_week };
    if (row === HEALTH_PROFILE_NOTHING) return validateHealthProfileDeclaration({ version: 1, nothing: ticked, declared: ticked ? [] : declared,
        ...(ticked && glasses.alcohol_week !== undefined ? { alcohol_week: 0 } : glasses), date });
    healthProfileCategory(row);
    const next = ticked ? [...new Set([...declared, row])] : declared.filter(id => id !== row);
    return validateHealthProfileDeclaration({ version: 1, nothing: ticked ? false : previous?.nothing === true, declared: next, ...glasses, date });
};
export const healthProfileAlcohol = (previous, glasses, date) => {
    if (!glassesValid(glasses)) throw new Error('health_profile_declaration_invalid');
    return validateHealthProfileDeclaration({ version: 1, nothing: glasses > 0 ? false : previous?.nothing === true, declared: previous?.declared || [],
        alcohol_week: glasses, date });
};
