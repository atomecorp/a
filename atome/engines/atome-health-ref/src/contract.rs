//! The bundle's contract as the app reads it: `atome/src/shared/health_reference_contract.js` is rendered
//! here from the records of `model.rs` (the only source of their shape) and checked by the `contract_js`
//! test, which rewrites it with `ATOME_HEALTH_REF_WRITE_CONTRACT=1`.

use crate::model::*;

/// The `/ws/api` frame type that serves the bundle (answered by `<frame>-response`).
pub const FRAME: &str = "health-reference";
/// The raw bytes of a part sent in one answer (base64 in the frame).
pub const CHUNK_BYTES: usize = 512 * 1024;
/// The JS file the contract is rendered to, from the project root.
pub const JS_PATH: &str = "atome/src/shared/health_reference_contract.js";

fn record<T: Record>() -> (&'static str, Vec<(&'static str, String)>) {
    (T::NAME, T::fields())
}

/// Every record, in a stable order.
pub fn records() -> Vec<(&'static str, Vec<(&'static str, String)>)> {
    vec![
        record::<Source>(),
        record::<PartEntry>(),
        record::<Manifest>(),
        record::<Component>(),
        record::<Presentation>(),
        record::<GenericLink>(),
        record::<Alert>(),
        record::<Availability>(),
        record::<Bound>(),
        record::<PosologyWhen>(),
        record::<PosologyRule>(),
        record::<Posology>(),
        record::<Medicine>(),
        record::<MedicinesPart>(),
        record::<Substance>(),
        record::<SubstancesPart>(),
        record::<ThesaurusEntry>(),
        record::<InteractionRule>(),
        record::<InteractionsPart>(),
        record::<RcpSection>(),
        record::<RcpDocument>(),
        record::<IntakeRule>(),
        record::<Criterion>(),
        record::<LabValue>(),
        record::<HealthProfile>(),
        record::<ProfileRule>(),
        record::<DosageRule>(),
        record::<ContextRule>(),
        record::<RcpPart>(),
        record::<Ingredient>(),
        record::<SupplementRule>(),
        record::<SupplementsPart>(),
        record::<Food>(),
        record::<Condition>(),
        record::<FoodRule>(),
        record::<FoodPart>(),
    ]
}

/// Every choice, in a stable order.
pub fn choices() -> Vec<(&'static str, &'static [&'static str])> {
    vec![
        (PartName::NAME, PartName::VALUES),
        (ComponentNature::NAME, ComponentNature::VALUES),
        (GenericKind::NAME, GenericKind::VALUES),
        (AvailabilityStatus::NAME, AvailabilityStatus::VALUES),
        (Level::NAME, Level::VALUES),
        (RcpSectionKey::NAME, RcpSectionKey::VALUES),
        (ContextFactor::NAME, ContextFactor::VALUES),
        (IntakeKind::NAME, IntakeKind::VALUES),
        (ProfileParameter::NAME, ProfileParameter::VALUES),
        (Comparison::NAME, Comparison::VALUES),
        (LabKey::NAME, LabKey::VALUES),
        (RuleEffect::NAME, RuleEffect::VALUES),
        (IngredientKind::NAME, IngredientKind::VALUES),
        (AdviceLevel::NAME, AdviceLevel::VALUES),
        (ConditionKind::NAME, ConditionKind::VALUES),
        (FoodRuleKind::NAME, FoodRuleKind::VALUES),
    ]
}

/// The record each part's file holds.
pub fn part_record(part: PartName) -> &'static str {
    match part {
        PartName::Medicines => MedicinesPart::NAME,
        PartName::Substances => SubstancesPart::NAME,
        PartName::Interactions => InteractionsPart::NAME,
        PartName::Rcp => RcpPart::NAME,
        PartName::Supplements => SupplementsPart::NAME,
        PartName::Food => FoodPart::NAME,
    }
}

fn quoted(values: impl IntoIterator<Item = String>) -> String {
    values
        .into_iter()
        .map(|value| format!("'{value}'"))
        .collect::<Vec<_>>()
        .join(", ")
}

const VALIDATOR: &str = r#"
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
"#;

/// The JS contract file's text.
pub fn render_js() -> String {
    let mut out = String::from(
        "// Generated from atome/engines/atome-health-ref (model.rs, contract.rs) by its `contract_js` test:\n\
         // never edit by hand. `ATOME_HEALTH_REF_WRITE_CONTRACT=1 cargo test -p atome-health-ref` rewrites it.\n\
         // The health reference bundle (BDPM, ANSM thesaurus, SmPC 4.2-4.6, supplements, food rules): a manifest\n\
         // and one gzipped JSON file per part, built monthly by the server and searched on the device only.\n\n",
    );
    out.push_str(&format!(
        "export const HEALTH_REFERENCE_SCHEMA = {SCHEMA_VERSION};\n"
    ));
    out.push_str(&format!(
        "export const HEALTH_REFERENCE_FRAME = '{FRAME}';\n"
    ));
    out.push_str(&format!(
        "export const HEALTH_REFERENCE_CHUNK_BYTES = {CHUNK_BYTES};\n\n"
    ));
    out.push_str("export const HEALTH_REFERENCE_CHOICES = Object.freeze({\n");
    for (name, values) in choices() {
        out.push_str(&format!(
            "    {name}: Object.freeze([{}]),\n",
            quoted(values.iter().map(|value| value.to_string()))
        ));
    }
    out.push_str("});\n\nexport const HEALTH_REFERENCE_RECORDS = Object.freeze({\n");
    for (name, fields) in records() {
        let body = fields
            .iter()
            .map(|(field, js)| format!("{field}: '{js}'"))
            .collect::<Vec<_>>()
            .join(", ");
        out.push_str(&format!("    {name}: Object.freeze({{ {body} }}),\n"));
    }
    out.push_str("});\n\nexport const HEALTH_REFERENCE_PART_RECORDS = Object.freeze({\n");
    for part in PartName::ALL {
        out.push_str(&format!(
            "    {}: '{}',\n",
            part.as_str(),
            part_record(*part)
        ));
    }
    out.push_str("});\n\n");
    out.push_str(
        "// Each laboratory result's unit (a result enters the profile in it) and LOINC code.\n",
    );
    out.push_str("export const HEALTH_REFERENCE_LABS = Object.freeze({\n");
    for (key, unit, loinc) in crate::criteria::LABS {
        out.push_str(&format!(
            "    {}: Object.freeze({{ unit: '{unit}', loinc: '{loinc}' }}),\n",
            key.as_str()
        ));
    }
    out.push_str("});\n");
    out.push_str(VALIDATOR);
    out.push_str(include_str!("contract_evaluator.js"));
    out
}
