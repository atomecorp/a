//! How a rule's criteria meet the person's profile. Three answers, never a guess: `True` when every criterion
//! holds, `False` when one does not, `Unknown` when none fails but one reads a parameter the profile lacks (the
//! device then asks, or shows the rule as « to check »). The contract's JS (`evaluateHealthReferenceCriteria`)
//! is the same evaluation, checked against this one on `fixtures/criteria_cases.json`.

use crate::model::{Comparison, Criterion, HealthProfile, LabKey, ProfileParameter};

/// Each laboratory result's unit and LOINC code: a result in another unit is converted before it enters the
/// profile.
pub const LABS: &[(LabKey, &str, &str)] = &[
    (LabKey::FastingGlucose, "g/L", "1558-6"),
    (LabKey::Hba1c, "%", "4548-4"),
    (LabKey::LdlCholesterol, "g/L", "13457-7"),
    (LabKey::Potassium, "mmol/L", "2823-3"),
    (LabKey::Sodium, "mmol/L", "2951-2"),
    (LabKey::Creatinine, "µmol/L", "14682-9"),
    (LabKey::UricAcid, "mg/L", "3084-1"),
    (LabKey::Inr, "ratio", "6301-6"),
    (LabKey::Alt, "UI/L", "1742-6"),
    (LabKey::Tsh, "mUI/L", "3016-3"),
    (LabKey::Hemoglobin, "g/dL", "718-7"),
    (LabKey::Ferritin, "µg/L", "2276-4"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Truth {
    True,
    False,
    Unknown,
}

enum Value {
    Number(f64),
    Category(&'static str),
}

fn yes_no(value: Option<bool>) -> Option<Value> {
    value.map(|value| Value::Category(if value { "yes" } else { "no" }))
}

fn read(criterion: &Criterion, profile: &HealthProfile) -> Option<Value> {
    let number = |value: Option<f64>| value.map(Value::Number);
    match criterion.parameter {
        ProfileParameter::AgeYears => number(profile.age_years),
        ProfileParameter::WeightKg => number(profile.weight_kg),
        ProfileParameter::HeightCm => number(profile.height_cm),
        ProfileParameter::Bmi => match (profile.weight_kg, profile.height_cm) {
            (Some(weight), Some(height)) if height > 0.0 => {
                Some(Value::Number(weight / (height / 100.0).powi(2)))
            }
            _ => None,
        },
        ProfileParameter::Sex => match profile.sex.as_deref() {
            Some("female") => Some(Value::Category("female")),
            Some("male") => Some(Value::Category("male")),
            _ => None,
        },
        ProfileParameter::Pregnancy => yes_no(profile.pregnant),
        // Not pregnant: no week of pregnancy reaches any bound.
        ProfileParameter::PregnancyWeeks => match profile.pregnant {
            Some(false) => Some(Value::Number(-1.0)),
            _ => number(profile.pregnancy_weeks),
        },
        ProfileParameter::Breastfeeding => yes_no(profile.breastfeeding),
        ProfileParameter::Gfr => number(profile.gfr),
        ProfileParameter::CreatinineClearance => number(profile.creatinine_clearance),
        ProfileParameter::HepaticImpairment => number(profile.hepatic_impairment.map(f64::from)),
        ProfileParameter::SystolicBp => number(profile.systolic_bp),
        ProfileParameter::DiastolicBp => number(profile.diastolic_bp),
        ProfileParameter::Lab => {
            // The latest result of that key (ISO days sort as text; an undated one counts as the oldest).
            let key = criterion.lab?;
            profile
                .labs
                .iter()
                .filter(|lab| lab.key == key)
                .max_by(|a, b| a.date.cmp(&b.date))
                .map(|lab| Value::Number(lab.value))
        }
    }
}

/// One criterion against the profile.
pub fn holds(criterion: &Criterion, profile: &HealthProfile) -> Truth {
    let Some(value) = read(criterion, profile) else {
        return Truth::Unknown;
    };
    let verdict = match (value, criterion.comparison) {
        (Value::Category(category), Comparison::Is) => {
            criterion.category.as_deref() == Some(category)
        }
        (Value::Number(x), comparison) => match (comparison, criterion.value, criterion.upper) {
            (Comparison::Lt, Some(bound), _) => x < bound,
            (Comparison::Le, Some(bound), _) => x <= bound,
            (Comparison::Gt, Some(bound), _) => x > bound,
            (Comparison::Ge, Some(bound), _) => x >= bound,
            (Comparison::Between, Some(low), Some(high)) => low <= x && x < high,
            _ => return Truth::Unknown,
        },
        _ => return Truth::Unknown,
    };
    if verdict { Truth::True } else { Truth::False }
}

/// Every criterion of the list (an empty list holds for everyone).
pub fn evaluate(criteria: &[Criterion], profile: &HealthProfile) -> Truth {
    let mut truth = Truth::True;
    for criterion in criteria {
        match holds(criterion, profile) {
            Truth::False => return Truth::False,
            Truth::Unknown => truth = Truth::Unknown,
            Truth::True => {}
        }
    }
    truth
}

/// Any one group of criteria (a condition's `measured_by`; no group: never met by a measure).
pub fn evaluate_any(groups: &[Vec<Criterion>], profile: &HealthProfile) -> Truth {
    let mut truth = Truth::False;
    for group in groups {
        match evaluate(group, profile) {
            Truth::True => return Truth::True,
            Truth::Unknown => truth = Truth::Unknown,
            Truth::False => {}
        }
    }
    truth
}

/// A criterion is well formed: its comparison has the values it needs, a `lab` one names its result.
pub fn check(criterion: &Criterion) -> Result<(), String> {
    let categorical = matches!(
        criterion.parameter,
        ProfileParameter::Sex | ProfileParameter::Pregnancy | ProfileParameter::Breastfeeding
    );
    let well_formed = match criterion.comparison {
        Comparison::Is => {
            categorical
                && match criterion.parameter {
                    ProfileParameter::Sex => {
                        matches!(criterion.category.as_deref(), Some("female" | "male"))
                    }
                    _ => matches!(criterion.category.as_deref(), Some("yes" | "no")),
                }
        }
        Comparison::Between => {
            !categorical
                && matches!((criterion.value, criterion.upper), (Some(low), Some(high)) if low < high)
        }
        _ => !categorical && criterion.value.is_some(),
    };
    let lab_named = (criterion.parameter == ProfileParameter::Lab) == criterion.lab.is_some();
    if well_formed && lab_named {
        Ok(())
    } else {
        Err(format!("criterion {criterion:?} is not well formed"))
    }
}
