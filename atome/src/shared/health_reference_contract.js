// Generated from atome/engines/atome-health-ref (model.rs, contract.rs) by its `contract_js` test:
// never edit by hand. `ATOME_HEALTH_REF_WRITE_CONTRACT=1 cargo test -p atome-health-ref` rewrites it.
// The health reference bundle (BDPM, ANSM thesaurus, SmPC 4.2-4.6, supplements, food rules): a manifest
// and one gzipped JSON file per part, built monthly by the server and searched on the device only.

export const HEALTH_REFERENCE_SCHEMA = 1;
export const HEALTH_REFERENCE_FRAME = 'health-reference';
export const HEALTH_REFERENCE_CHUNK_BYTES = 524288;

export const HEALTH_REFERENCE_CHOICES = Object.freeze({
    part_name: Object.freeze(['medicines', 'substances', 'interactions', 'rcp', 'supplements', 'food']),
    component_nature: Object.freeze(['active', 'fraction']),
    generic_kind: Object.freeze(['princeps', 'generic', 'complementary', 'substitutable']),
    availability_status: Object.freeze(['shortage', 'tension', 'discontinued', 'restored']),
    interaction_level: Object.freeze(['contraindication', 'not_recommended', 'precaution', 'to_consider']),
    rcp_section: Object.freeze(['4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8']),
    context_factor: Object.freeze(['driving', 'somnolence', 'photosensitivity', 'effort', 'dehydration', 'hypoglycaemia', 'alcohol', 'insomnia', 'bedtime', 'tendon']),
    intake_kind: Object.freeze(['fasting', 'with_meal', 'spacing', 'avoid_food']),
    profile_parameter: Object.freeze(['age_years', 'weight_kg', 'height_cm', 'bmi', 'sex', 'pregnancy', 'pregnancy_weeks', 'breastfeeding', 'gfr', 'creatinine_clearance', 'hepatic_impairment', 'systolic_bp', 'diastolic_bp', 'lab']),
    comparison: Object.freeze(['lt', 'le', 'gt', 'ge', 'between', 'is']),
    lab_key: Object.freeze(['fasting_glucose', 'hba1c', 'ldl_cholesterol', 'potassium', 'sodium', 'creatinine', 'uric_acid', 'inr', 'alt', 'tsh', 'hemoglobin', 'ferritin']),
    rule_effect: Object.freeze(['contraindication', 'not_recommended', 'precaution', 'dose_adjustment', 'possible']),
    ingredient_kind: Object.freeze(['plant', 'nutrient', 'substance', 'microorganism', 'other']),
    advice_level: Object.freeze(['avoid', 'advice_first', 'caution']),
    condition_kind: Object.freeze(['pathology', 'allergy', 'state', 'treatment']),
    food_rule_kind: Object.freeze(['avoid', 'limit', 'prefer', 'preparation', 'belief', 'interaction']),
});

export const HEALTH_REFERENCE_RECORDS = Object.freeze({
    source: Object.freeze({ id: 'string', publisher: 'string', title: 'string', licence: 'string', url: 'string', version: '?string', retrieved: 'string' }),
    part_entry: Object.freeze({ name: 'part_name', file: 'string', bytes: 'integer', sha256: 'string', json_bytes: 'integer', records: 'integer' }),
    manifest: Object.freeze({ schema: 'integer', version: 'string', built_on: 'string', sources: 'source[]', parts: 'part_entry[]' }),
    component: Object.freeze({ element: 'string', code: 'string', name: 'string', dosage: 'string', reference: 'string', nature: 'component_nature', link: 'integer', substance: 'string' }),
    presentation: Object.freeze({ cip7: 'string', cip13: 'string', label: 'string', status: 'string', marketed: 'boolean', marketed_on: '?string', reimbursement: 'string[]', price_cents: '?integer' }),
    generic_link: Object.freeze({ group: 'integer', label: 'string', kind: 'generic_kind' }),
    alert: Object.freeze({ from: 'string', to: 'string', text: 'string', url: '?string' }),
    availability: Object.freeze({ cip13: '?string', status: 'availability_status', from: '?string', updated: '?string', restored: '?string', url: 'string' }),
    bound: Object.freeze({ min: '?number', max: '?number', above: '?number', below: '?number' }),
    posology_when: Object.freeze({ age_years: '?bound', weight_kg: '?bound', height_cm: '?bound', bmi: '?bound', sex: '?string', pregnant: '?boolean', breastfeeding: '?boolean', egfr: '?bound', creatinine_clearance: '?bound', alt: '?bound', ast: '?bound', glycaemia: '?bound', hba1c: '?bound', systolic: '?bound', diastolic: '?bound' }),
    posology_rule: Object.freeze({ when: 'posology_when', per_intake: '?number', hours: 'string[]', as_needed: 'boolean', max_per_day: '?number', section: 'rcp_section', quote: 'string' }),
    posology: Object.freeze({ source: 'string', rules: 'posology_rule[]' }),
    medicine: Object.freeze({ cis: 'string', name: 'string', form: 'string', routes: 'string[]', authorisation: 'string', procedure: 'string', marketed: 'boolean', authorised_on: '?string', holders: 'string[]', reinforced_monitoring: 'boolean', components: 'component[]', generic: '?generic_link', conditions: 'string[]', alerts: 'alert[]', availability: 'availability[]', presentations: 'presentation[]', posology: '?posology' }),
    medicines_part: Object.freeze({ source: 'string', medicines: 'medicine[]' }),
    substance: Object.freeze({ key: 'string', name: 'string', base: 'string', codes: 'string[]', thesaurus: 'string[]', medicines: 'integer' }),
    substances_part: Object.freeze({ source: 'string', substances: 'substance[]' }),
    thesaurus_entry: Object.freeze({ key: 'string', label: 'string', members: 'string[]', see_also: 'string[]', note: '?string', food: '?string' }),
    interaction_rule: Object.freeze({ a: 'string', b: 'string', levels: 'interaction_level[]', mechanism: 'string', conduct: 'string' }),
    interactions_part: Object.freeze({ source: 'string', entries: 'thesaurus_entry[]', rules: 'interaction_rule[]' }),
    rcp_section_ref: Object.freeze({ section: 'rcp_section', text: 'integer' }),
    rcp_document: Object.freeze({ cis: 'string', updated: '?string', sections: 'rcp_section_ref[]' }),
    intake_rule: Object.freeze({ cis: 'string', kind: 'intake_kind', food: '?string', partner: '?string', hours: '?number', section: 'rcp_section', quote: 'string' }),
    criterion: Object.freeze({ parameter: 'profile_parameter', comparison: 'comparison', value: '?number', upper: '?number', category: '?string', lab: '?lab_key' }),
    lab_value: Object.freeze({ key: 'lab_key', value: 'number', date: '?string' }),
    health_profile: Object.freeze({ age_years: '?number', weight_kg: '?number', height_cm: '?number', sex: '?string', pregnant: '?boolean', pregnancy_weeks: '?number', breastfeeding: '?boolean', gfr: '?number', creatinine_clearance: '?number', hepatic_impairment: '?integer', systolic_bp: '?number', diastolic_bp: '?number', labs: 'lab_value[]' }),
    profile_rule: Object.freeze({ cis: 'string', effect: 'rule_effect', criteria: 'criterion[]', section: 'rcp_section', quote: 'string' }),
    dosage_rule: Object.freeze({ cis: 'string', criteria: 'criterion[]', amount: '?number', amount_max: '?number', unit: '?string', per_kg: 'boolean', period: '?string', max_daily: '?number', max_daily_unit: '?string', interval_hours: '?number', quote: 'string' }),
    context_rule: Object.freeze({ cis: 'string', factor: 'context_factor', section: 'rcp_section', quote: 'string' }),
    rcp_part: Object.freeze({ source: 'string', texts: 'string[]', documents: 'rcp_document[]', rules: 'intake_rule[]', profile_rules: 'profile_rule[]', dosages: 'dosage_rule[]', context_rules: 'context_rule[]' }),
    ingredient: Object.freeze({ name: 'string', kind: 'ingredient_kind', substance: '?string', products: 'integer' }),
    supplement_rule: Object.freeze({ id: 'string', subject: 'string', conditions: 'string[]', treatments: 'string[]', level: 'advice_level', text: 'string', source: 'string' }),
    supplements_part: Object.freeze({ sources: 'string[]', ingredients: 'ingredient[]', rules: 'supplement_rule[]' }),
    food_item: Object.freeze({ key: 'string', label: 'string', words: 'string[]', categories: 'string[]' }),
    condition: Object.freeze({ key: 'string', label: 'string', kind: 'condition_kind', measured_by: 'criterion[][]', measured_source: '?string', thesaurus: 'string[]' }),
    food_rule: Object.freeze({ id: 'string', condition: 'string', kind: 'food_rule_kind', foods: 'string[]', criteria: 'criterion[]', text: 'string', reason: 'string', source: 'string' }),
    food_part: Object.freeze({ sources: 'string[]', foods: 'food_item[]', conditions: 'condition[]', rules: 'food_rule[]' }),
});

export const HEALTH_REFERENCE_PART_RECORDS = Object.freeze({
    medicines: 'medicines_part',
    substances: 'substances_part',
    interactions: 'interactions_part',
    rcp: 'rcp_part',
    supplements: 'supplements_part',
    food: 'food_part',
});

// Each laboratory result's unit (a result enters the profile in it) and LOINC code.
export const HEALTH_REFERENCE_LABS = Object.freeze({
    fasting_glucose: Object.freeze({ unit: 'g/L', loinc: '1558-6' }),
    hba1c: Object.freeze({ unit: '%', loinc: '4548-4' }),
    ldl_cholesterol: Object.freeze({ unit: 'g/L', loinc: '13457-7' }),
    potassium: Object.freeze({ unit: 'mmol/L', loinc: '2823-3' }),
    sodium: Object.freeze({ unit: 'mmol/L', loinc: '2951-2' }),
    creatinine: Object.freeze({ unit: 'µmol/L', loinc: '14682-9' }),
    uric_acid: Object.freeze({ unit: 'mg/L', loinc: '3084-1' }),
    inr: Object.freeze({ unit: 'ratio', loinc: '6301-6' }),
    alt: Object.freeze({ unit: 'UI/L', loinc: '1742-6' }),
    tsh: Object.freeze({ unit: 'mUI/L', loinc: '3016-3' }),
    hemoglobin: Object.freeze({ unit: 'g/dL', loinc: '718-7' }),
    ferritin: Object.freeze({ unit: 'µg/L', loinc: '2276-4' }),
});

export class HealthReferenceContractError extends Error {
    constructor(code, path) {
        super(`${code}: ${path}`);
        this.name = 'HealthReferenceContractError';
        this.code = code;
        this.path = path;
    }
}

const SCALARS = Object.freeze({
    string: value => typeof value === 'string',
    boolean: value => typeof value === 'boolean',
    number: value => typeof value === 'number' && Number.isFinite(value),
    integer: value => Number.isInteger(value) && value >= 0
});

const check = (type, value, path) => {
    if (type.startsWith('?')) {
        if (value !== null) check(type.slice(1), value, path);
        return;
    }
    if (type.endsWith('[]')) {
        if (!Array.isArray(value)) throw new HealthReferenceContractError('health_reference_array_expected', path);
        value.forEach((item, index) => check(type.slice(0, -2), item, `${path}[${index}]`));
        return;
    }
    if (SCALARS[type]) {
        if (!SCALARS[type](value)) throw new HealthReferenceContractError(`health_reference_${type}_expected`, path);
        return;
    }
    if (HEALTH_REFERENCE_CHOICES[type]) {
        if (!HEALTH_REFERENCE_CHOICES[type].includes(value)) throw new HealthReferenceContractError('health_reference_choice_unknown', path);
        return;
    }
    const fields = HEALTH_REFERENCE_RECORDS[type];
    if (!fields) throw new HealthReferenceContractError('health_reference_type_unknown', path);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HealthReferenceContractError('health_reference_record_expected', path);
    for (const key of Object.keys(value)) {
        if (!Object.hasOwn(fields, key)) throw new HealthReferenceContractError('health_reference_field_unknown', `${path}.${key}`);
    }
    for (const [key, fieldType] of Object.entries(fields)) {
        if (!Object.hasOwn(value, key)) throw new HealthReferenceContractError('health_reference_field_missing', `${path}.${key}`);
        check(fieldType, value[key], `${path}.${key}`);
    }
};

/** `value` checked as the record `name` (a key of HEALTH_REFERENCE_RECORDS); throws on the first mismatch. */
export const validateHealthReferenceRecord = (name, value) => {
    check(name, value, name);
    return value;
};

/** A manifest checked, including its schema. */
export const validateHealthReferenceManifest = (value) => {
    validateHealthReferenceRecord('manifest', value);
    if (value.schema !== HEALTH_REFERENCE_SCHEMA) throw new HealthReferenceContractError('health_reference_schema_unsupported', 'manifest.schema');
    return value;
};

/** A part's parsed file checked as the record its part holds. */
export const validateHealthReferencePart = (part, value) => {
    const name = HEALTH_REFERENCE_PART_RECORDS[part];
    if (!name) throw new HealthReferenceContractError('health_reference_part_unknown', String(part));
    return validateHealthReferenceRecord(name, value);
};

// A rule's criteria against the person's `health_profile`, the same evaluation as criteria.rs: 'true' when every
// criterion holds, 'false' when one does not, 'unknown' when none fails but one reads a parameter the profile
// lacks (never assumed). An empty list holds for everyone. Nothing leaves the device.
const yesNo = (value) => (value === true ? 'yes' : value === false ? 'no' : null);
const known = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const latestLab = (labs, key) => {
    let latest = null;
    for (const lab of labs || []) {
        if (lab.key === key && (latest === null || (lab.date ?? '') >= (latest.date ?? ''))) latest = lab;
    }
    return latest === null ? null : known(latest.value);
};

const readParameter = (criterion, profile) => {
    switch (criterion.parameter) {
        case 'age_years': return known(profile.age_years);
        case 'weight_kg': return known(profile.weight_kg);
        case 'height_cm': return known(profile.height_cm);
        case 'bmi': {
            const weight = known(profile.weight_kg), height = known(profile.height_cm);
            return weight !== null && height !== null && height > 0 ? weight / (height / 100) ** 2 : null;
        }
        case 'sex': return profile.sex === 'female' || profile.sex === 'male' ? profile.sex : null;
        case 'pregnancy': return yesNo(profile.pregnant);
        case 'pregnancy_weeks': return profile.pregnant === false ? -1 : known(profile.pregnancy_weeks);
        case 'breastfeeding': return yesNo(profile.breastfeeding);
        case 'gfr': return known(profile.gfr);
        case 'creatinine_clearance': return known(profile.creatinine_clearance);
        case 'hepatic_impairment': return known(profile.hepatic_impairment);
        case 'systolic_bp': return known(profile.systolic_bp);
        case 'diastolic_bp': return known(profile.diastolic_bp);
        case 'lab': return criterion.lab ? latestLab(profile.labs, criterion.lab) : null;
        default: throw new HealthReferenceContractError('health_reference_parameter_unknown', String(criterion.parameter));
    }
};

/** One criterion against the profile: 'true', 'false' or 'unknown'. */
export const holdsHealthReferenceCriterion = (criterion, profile) => {
    const value = readParameter(criterion, profile || {});
    if (value === null) return 'unknown';
    const { comparison, category } = criterion;
    const bound = criterion.value ?? null, upper = criterion.upper ?? null;
    let verdict;
    if (typeof value === 'string') {
        if (comparison !== 'is') return 'unknown';
        verdict = category === value;
    } else if (comparison === 'between') {
        if (bound === null || upper === null) return 'unknown';
        verdict = bound <= value && value < upper;
    } else {
        if (bound === null || comparison === 'is') return 'unknown';
        verdict = comparison === 'lt' ? value < bound : comparison === 'le' ? value <= bound
            : comparison === 'gt' ? value > bound : value >= bound;
    }
    return verdict ? 'true' : 'false';
};

/** Every criterion of the list: 'false' at the first that fails, 'unknown' if one cannot be read. */
export const evaluateHealthReferenceCriteria = (criteria, profile) => {
    let truth = 'true';
    for (const criterion of criteria || []) {
        const held = holdsHealthReferenceCriterion(criterion, profile);
        if (held === 'false') return 'false';
        if (held === 'unknown') truth = 'unknown';
    }
    return truth;
};

/** Any one group (a condition's `measured_by`): 'true' at the first group met; no group: 'false'. */
export const evaluateHealthReferenceMeasures = (groups, profile) => {
    let truth = 'false';
    for (const group of groups || []) {
        const held = evaluateHealthReferenceCriteria(group, profile);
        if (held === 'true') return 'true';
        if (held === 'unknown') truth = 'unknown';
    }
    return truth;
};
