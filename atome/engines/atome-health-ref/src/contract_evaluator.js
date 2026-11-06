
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
