//! The bundle's records: the one definition of what a device receives. Each record and choice declares
//! itself to the contract (`contract.rs`), which generates the JS shapes and validators from these
//! declarations, so the app never describes a field differently from the builder.

use serde::{Deserialize, Serialize};

/// Bumped when a record changes incompatibly; a device refuses a bundle of another schema.
pub const SCHEMA_VERSION: u32 = 1;

/// How a Rust type is written in the JS contract.
pub trait JsType {
    fn js() -> String;
}

impl JsType for String {
    fn js() -> String {
        "string".to_string()
    }
}
impl JsType for bool {
    fn js() -> String {
        "boolean".to_string()
    }
}
impl JsType for u32 {
    fn js() -> String {
        "integer".to_string()
    }
}
impl JsType for u64 {
    fn js() -> String {
        "integer".to_string()
    }
}
impl JsType for f64 {
    fn js() -> String {
        "number".to_string()
    }
}
impl<T: JsType> JsType for Option<T> {
    fn js() -> String {
        format!("?{}", T::js())
    }
}
impl<T: JsType> JsType for Vec<T> {
    fn js() -> String {
        format!("{}[]", T::js())
    }
}

/// A record: its contract name and its fields with their JS types, in serialization order.
pub trait Record {
    const NAME: &'static str;
    fn fields() -> Vec<(&'static str, String)>;
}

/// A closed choice: its contract name and its serialized values.
pub trait Choice {
    const NAME: &'static str;
    const VALUES: &'static [&'static str];
}

macro_rules! record {
    ($(#[$meta:meta])* $name:ident $key:literal { $($(#[$field_meta:meta])* $field:ident : $ty:ty),* $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
        #[serde(deny_unknown_fields)]
        pub struct $name { $($(#[$field_meta])* pub $field: $ty),* }
        impl Record for $name {
            const NAME: &'static str = $key;
            fn fields() -> Vec<(&'static str, String)> { vec![$((stringify!($field), <$ty as JsType>::js())),*] }
        }
        impl JsType for $name { fn js() -> String { $key.to_string() } }
    };
}

macro_rules! choice {
    ($(#[$meta:meta])* $name:ident $key:literal { $($variant:ident => $value:literal),* $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
        pub enum $name { $(#[serde(rename = $value)] $variant),* }
        impl Choice for $name { const NAME: &'static str = $key; const VALUES: &'static [&'static str] = &[$($value),*]; }
        impl JsType for $name { fn js() -> String { $key.to_string() } }
        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$variant),*];
            pub fn as_str(self) -> &'static str { match self { $($name::$variant => $value),* } }
        }
    };
}

choice!(PartName "part_name" {
    Medicines => "medicines", Substances => "substances", Interactions => "interactions",
    Rcp => "rcp", Supplements => "supplements", Food => "food",
});
choice!(ComponentNature "component_nature" { Active => "active", Fraction => "fraction" });
choice!(GenericKind "generic_kind" {
    Princeps => "princeps", Generic => "generic", Complementary => "complementary", Substitutable => "substitutable",
});
choice!(AvailabilityStatus "availability_status" {
    Shortage => "shortage", Tension => "tension", Discontinued => "discontinued", Restored => "restored",
});
choice!(
    /// The thesaurus's four levels, most severe first.
    Level "interaction_level" {
    Contraindication => "contraindication", NotRecommended => "not_recommended",
    Precaution => "precaution", ToConsider => "to_consider",
});
choice!(RcpSectionKey "rcp_section" {
    Administration => "4.2", Contraindications => "4.3", Warnings => "4.4", Interactions => "4.5",
    Pregnancy => "4.6", Driving => "4.7", AdverseEffects => "4.8",
});
choice!(
    /// A part of the person's life a SmPC sentence speaks of in so many words (`rcp_context.rs`): driving and
    /// machines, drowsiness, the sun, physical effort, dehydration or heat, a hypoglycaemia, alcohol, sleep, an
    /// intake at bedtime, the tendons.
    ContextFactor "context_factor" {
    Driving => "driving", Somnolence => "somnolence", Photosensitivity => "photosensitivity", Effort => "effort",
    Dehydration => "dehydration", Hypoglycaemia => "hypoglycaemia", Alcohol => "alcohol", Insomnia => "insomnia",
    Bedtime => "bedtime", Tendon => "tendon",
});
choice!(
    /// A physiological or biological parameter of the person (`health_profile`) a rule can depend on.
    /// `hepatic_impairment` is graded 0 none, 1 mild, 2 moderate, 3 severe (Child-Pugh A, B, C); `bmi` is
    /// computed from the weight and the height; a `lab` criterion names its `lab_key`.
    ProfileParameter "profile_parameter" {
    AgeYears => "age_years", WeightKg => "weight_kg", HeightCm => "height_cm", Bmi => "bmi", Sex => "sex",
    Pregnancy => "pregnancy", PregnancyWeeks => "pregnancy_weeks", Breastfeeding => "breastfeeding",
    Gfr => "gfr", CreatinineClearance => "creatinine_clearance", HepaticImpairment => "hepatic_impairment",
    SystolicBp => "systolic_bp", DiastolicBp => "diastolic_bp", Lab => "lab",
});
choice!(
    /// `between` holds for `value` ≤ x < `upper`; `is` compares a category (`sex`: female or male;
    /// `pregnancy`, `breastfeeding`: yes or no).
    Comparison "comparison" {
    Lt => "lt", Le => "le", Gt => "gt", Ge => "ge", Between => "between", Is => "is",
});
choice!(
    /// The laboratory results a rule can read, each in the one unit of `LAB_UNITS`.
    LabKey "lab_key" {
    FastingGlucose => "fasting_glucose", Hba1c => "hba1c", LdlCholesterol => "ldl_cholesterol",
    Potassium => "potassium", Sodium => "sodium", Creatinine => "creatinine", UricAcid => "uric_acid",
    Inr => "inr", Alt => "alt", Tsh => "tsh", Hemoglobin => "hemoglobin", Ferritin => "ferritin",
});
choice!(
    /// What a profile rule of a SmPC says for the people its criteria describe.
    RuleEffect "rule_effect" {
    Contraindication => "contraindication", NotRecommended => "not_recommended", Precaution => "precaution",
    DoseAdjustment => "dose_adjustment", Possible => "possible",
});
choice!(IntakeKind "intake_kind" {
    Fasting => "fasting", WithMeal => "with_meal", Spacing => "spacing", AvoidFood => "avoid_food",
});
choice!(IngredientKind "ingredient_kind" {
    Plant => "plant", Nutrient => "nutrient", Substance => "substance", Microorganism => "microorganism", Other => "other",
});
choice!(AdviceLevel "advice_level" { Avoid => "avoid", AdviceFirst => "advice_first", Caution => "caution" });
choice!(ConditionKind "condition_kind" {
    Pathology => "pathology", Allergy => "allergy", State => "state", Treatment => "treatment",
});
choice!(FoodRuleKind "food_rule_kind" {
    Avoid => "avoid", Limit => "limit", Prefer => "prefer", Preparation => "preparation", Belief => "belief",
    Interaction => "interaction",
});

record!(
    /// Where a part's data comes from, cited as its licence asks (source and date, never altered).
    Source "source" {
    id: String, publisher: String, title: String, licence: String, url: String,
    /// The publisher's own version or date of the data, when it states one.
    version: Option<String>,
    retrieved: String,
});
record!(
    /// One part of a bundle: `file` is the gzipped JSON of `bytes` bytes; `sha256` and `json_bytes` are those
    /// of the JSON once inflated, which the device checks before using it.
    PartEntry "part_entry" {
    name: PartName, file: String, bytes: u64, sha256: String, json_bytes: u64, records: u64,
});
record!(
    /// The bundle's entry point: a device fetches it first and a part only when its hash changed.
    Manifest "manifest" {
    schema: u32,
    /// The hash of every part's hash: the same content always has the same version.
    version: String,
    built_on: String,
    sources: Vec<Source>,
    parts: Vec<PartEntry>,
});

record!(Component "component" {
    element: String, code: String, name: String, dosage: String, reference: String, nature: ComponentNature,
    link: u32,
    /// The substance key (`substances` part).
    substance: String,
});
record!(Presentation "presentation" {
    cip7: String, cip13: String, label: String, status: String, marketed: bool, marketed_on: Option<String>,
    reimbursement: Vec<String>, price_cents: Option<u32>,
});
record!(GenericLink "generic_link" { group: u32, label: String, kind: GenericKind });
record!(Alert "alert" { from: String, to: String, text: String, url: Option<String> });
record!(Availability "availability" {
    cip13: Option<String>, status: AvailabilityStatus, from: Option<String>, updated: Option<String>,
    restored: Option<String>, url: String,
});
record!(
    /// Bounds on one parameter, as eVe's posology model reads them (medicine_posology.js): `min` ≤ x ≤ `max`,
    /// `above` < x < `below`; a null bound is no bound.
    Bound "bound" { min: Option<f64>, max: Option<f64>, above: Option<f64>, below: Option<f64> });
record!(
    /// The person's parameters a posology rule depends on, named as eVe's `PERSON_PARAMETERS`; a null one is no
    /// condition. `egfr` is the GFR, `glycaemia` the fasting glucose (g/L), `alt` in UI/L, `systolic` and
    /// `diastolic` in mmHg.
    PosologyWhen "posology_when" {
    age_years: Option<Bound>, weight_kg: Option<Bound>, height_cm: Option<Bound>, bmi: Option<Bound>,
    sex: Option<String>, pregnant: Option<bool>, breastfeeding: Option<bool>,
    egfr: Option<Bound>, creatinine_clearance: Option<Bound>, alt: Option<Bound>, ast: Option<Bound>,
    glycaemia: Option<Bound>, hba1c: Option<Bound>, systolic: Option<Bound>, diastolic: Option<Bound>,
});
record!(
    /// One population's dose in units of the form: `per_intake` null when the form does not suit it (a
    /// contra-indication, « non adapté »). `section` and `quote` are the SmPC sentence it comes from.
    PosologyRule "posology_rule" {
    when: PosologyWhen, per_intake: Option<f64>, hours: Vec<String>, as_needed: bool, max_per_day: Option<f64>,
    section: RcpSectionKey, quote: String,
});
record!(
    /// A medicine's posology, its rules most particular first; `source` names the SmPC and its date.
    Posology "posology" { source: String, rules: Vec<PosologyRule> });
record!(Medicine "medicine" {
    cis: String, name: String, form: String, routes: Vec<String>, authorisation: String, procedure: String,
    marketed: bool, authorised_on: Option<String>, holders: Vec<String>, reinforced_monitoring: bool,
    components: Vec<Component>, generic: Option<GenericLink>, conditions: Vec<String>, alerts: Vec<Alert>,
    availability: Vec<Availability>, presentations: Vec<Presentation>,
    /// What its SmPC's doses come to in units of its form, for the person's parameters (`posology.rs`); null when
    /// none could be read.
    posology: Option<Posology>,
});
record!(MedicinesPart "medicines_part" { source: String, medicines: Vec<Medicine> });

record!(Substance "substance" {
    key: String, name: String,
    /// The name without its salt or hydrate words (« warfarine » for « WARFARINE SODIQUE »).
    base: String,
    codes: Vec<String>,
    /// The thesaurus entries it falls under: its own, then its classes.
    thesaurus: Vec<String>,
    medicines: u32,
});
record!(SubstancesPart "substances_part" { source: String, substances: Vec<Substance> });

record!(ThesaurusEntry "thesaurus_entry" {
    key: String, label: String,
    /// A class's members (substance names, folded) as the thesaurus lists them.
    members: Vec<String>,
    /// The classes the thesaurus says to see also (« Voir aussi »), as entry keys.
    see_also: Vec<String>,
    note: Option<String>,
    /// The food key when the entry is a food or a drink (`food` part).
    food: Option<String>,
});
record!(InteractionRule "interaction_rule" {
    a: String, b: String, levels: Vec<Level>, mechanism: String, conduct: String,
});
record!(InteractionsPart "interactions_part" { source: String, entries: Vec<ThesaurusEntry>, rules: Vec<InteractionRule> });

record!(RcpSection "rcp_section_ref" {
    section: RcpSectionKey,
    /// Index in the part's `texts` (generics share one text).
    text: u32,
});
record!(RcpDocument "rcp_document" { cis: String, updated: Option<String>, sections: Vec<RcpSection> });
record!(
    /// A rule the SmPC states in so many words; `quote` is its sentence, shown as it is.
    IntakeRule "intake_rule" {
    cis: String, kind: IntakeKind, food: Option<String>, partner: Option<String>,
    /// The spacing or the delay before a meal, in hours, when the sentence gives one.
    hours: Option<f64>,
    section: RcpSectionKey, quote: String,
});
record!(
    /// One condition on the person's profile. A list of criteria holds when every one holds; a criterion
    /// whose parameter the profile lacks is unknown, never assumed (`criteria.rs`, and its JS mirror in the
    /// contract).
    Criterion "criterion" {
    parameter: ProfileParameter, comparison: Comparison,
    value: Option<f64>,
    /// The upper bound of `between` (excluded).
    upper: Option<f64>,
    /// The category of `is`.
    category: Option<String>,
    /// The result a `lab` criterion reads.
    lab: Option<LabKey>,
});
record!(LabValue "lab_value" {
    key: LabKey, value: f64,
    /// The day of the result.
    date: Option<String>,
});
record!(
    /// What the device knows of the person, each field null when unknown; filled from the Health record
    /// and the measures, never sent anywhere.
    HealthProfile "health_profile" {
    age_years: Option<f64>, weight_kg: Option<f64>, height_cm: Option<f64>,
    /// `female` or `male`.
    sex: Option<String>,
    pregnant: Option<bool>,
    /// Weeks of amenorrhoea.
    pregnancy_weeks: Option<f64>,
    breastfeeding: Option<bool>,
    /// mL/min/1.73 m².
    gfr: Option<f64>,
    /// mL/min (Cockcroft-Gault).
    creatinine_clearance: Option<f64>,
    /// 0 none, 1 mild, 2 moderate, 3 severe.
    hepatic_impairment: Option<u32>,
    /// mmHg.
    systolic_bp: Option<f64>, diastolic_bp: Option<f64>,
    labs: Vec<LabValue>,
});
record!(
    /// A SmPC sentence about the people its criteria describe (an age, a weight, the kidneys, the liver, a
    /// pregnancy…), with what it says for them. A sentence whose population cannot be read is not a rule: its
    /// text stays in `texts`.
    ProfileRule "profile_rule" {
    cis: String, effect: RuleEffect, criteria: Vec<Criterion>, section: RcpSectionKey, quote: String,
});
record!(
    /// A dose the SmPC gives for a population (section 4.2), read from its sentence: an amount or a range,
    /// per kilogram or not, per intake or per day, the daily maximum and the interval between intakes when
    /// stated. `quote` is shown as it is; a value not stated stays null.
    DosageRule "dosage_rule" {
    cis: String, criteria: Vec<Criterion>,
    amount: Option<f64>, amount_max: Option<f64>,
    /// mg, g, µg, UI, mL, or the dosage unit (comprimé, gélule, sachet…).
    unit: Option<String>,
    per_kg: bool,
    /// `intake` or `day`.
    period: Option<String>,
    max_daily: Option<f64>, max_daily_unit: Option<String>,
    interval_hours: Option<f64>,
    quote: String,
});
record!(
    /// A SmPC sentence (sections 4.2 to 4.8) about one part of the person's life, quoted as written (an excerpt
    /// marked « … » when its sentence is a long list): the device crosses it with what it knows of the person (their
    /// sessions, their sleep), never more than the sentence says.
    ContextRule "context_rule" { cis: String, factor: ContextFactor, section: RcpSectionKey, quote: String });
record!(RcpPart "rcp_part" {
    source: String, texts: Vec<String>, documents: Vec<RcpDocument>, rules: Vec<IntakeRule>,
    profile_rules: Vec<ProfileRule>, dosages: Vec<DosageRule>, context_rules: Vec<ContextRule>,
});

record!(Ingredient "ingredient" {
    name: String, kind: IngredientKind,
    /// The substance or thesaurus entry key it is read as, when one is known.
    substance: Option<String>,
    products: u32,
});
record!(SupplementRule "supplement_rule" {
    id: String,
    /// The substance key the rule is about (an ingredient's `substance`).
    subject: String,
    /// Condition keys (`food` part) for which the advice holds.
    conditions: Vec<String>,
    /// Thesaurus entry or substance keys whose treatment the advice concerns.
    treatments: Vec<String>,
    level: AdviceLevel, text: String, source: String,
});
record!(SupplementsPart "supplements_part" { sources: Vec<String>, ingredients: Vec<Ingredient>, rules: Vec<SupplementRule> });

record!(Food "food_item" {
    key: String, label: String,
    /// Folded words a shopping line, a recipe or a product name is matched on.
    words: Vec<String>,
    /// The Open Food Facts categories (language-neutral `en:` tags of its taxonomy) a scanned product is this
    /// food by, whatever the language of its pack; a tag names one food at most.
    categories: Vec<String>,
});
record!(Condition "condition" {
    key: String, label: String, kind: ConditionKind,
    /// The measures that meet the condition as `measured_source` defines it: any one group, every criterion
    /// of it (« glycémie à jeun ≥ 1,26 g/l »). Empty: the condition is only declared.
    measured_by: Vec<Vec<Criterion>>,
    measured_source: Option<String>,
    /// For a treatment: the thesaurus entries (ANSM classes and substances) a medicine falls under to make it, so a
    /// medicine whose substance is linked to one (`substances` part) holds the condition. Empty for any other kind.
    thesaurus: Vec<String>,
});
record!(FoodRule "food_rule" {
    id: String, condition: String, kind: FoodRuleKind, foods: Vec<String>,
    /// Further criteria on the person for the rule to hold (a GFR, an age); empty: the condition suffices.
    criteria: Vec<Criterion>,
    text: String, reason: String, source: String,
});
record!(FoodPart "food_part" { sources: Vec<String>, foods: Vec<Food>, conditions: Vec<Condition>, rules: Vec<FoodRule> });
