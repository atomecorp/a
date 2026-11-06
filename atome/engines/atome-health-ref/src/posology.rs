//! A medicine's posology as eVe's posology model reads it (eVe/domains/health_protocol/medicine_posology.js): its
//! SmPC's doses (`DosageRule`) put in units of its form, and the populations its form does not suit (a
//! contra-indication or a « not recommended » of sections 4.2, 4.3, 4.4 and 4.6) as rules recommending nothing.
//! A dose is put in units only when the text allows it exactly: a dose in tablets for a tablet, or a dose in mg
//! that is a whole or half number of the one strength the medicine holds; a dose per kilogram, a daily dose
//! split over several intakes, a criterion eVe's parameters cannot hold (a Child-Pugh grade, a term of
//! pregnancy) give no rule. Rules: the « does not suit » ones first, then the most particular.

use crate::model::{
    Bound, Comparison, Criterion, DosageRule, LabKey, Medicine, Posology, PosologyRule,
    PosologyWhen, ProfileParameter, ProfileRule, RcpSectionKey, RuleEffect,
};
use crate::population::PopulationPatterns;
use crate::rcp_profile::each_state;
use crate::text::{fold, fold_measures, has_words};

fn tighten(bound: &mut Option<Bound>, criterion: &Criterion) -> Option<()> {
    let value = criterion.value?;
    let bound = bound.get_or_insert(Bound {
        min: None,
        max: None,
        above: None,
        below: None,
    });
    match criterion.comparison {
        Comparison::Lt => bound.below = Some(bound.below.map_or(value, |old| old.min(value))),
        Comparison::Le => bound.max = Some(bound.max.map_or(value, |old| old.min(value))),
        Comparison::Gt => bound.above = Some(bound.above.map_or(value, |old| old.max(value))),
        Comparison::Ge => bound.min = Some(bound.min.map_or(value, |old| old.max(value))),
        Comparison::Between => {
            bound.min = Some(bound.min.map_or(value, |old| old.max(value)));
            let upper = criterion.upper?;
            bound.below = Some(bound.below.map_or(upper, |old| old.min(upper)));
        }
        Comparison::Is => return None,
    }
    Some(())
}

fn yes(criterion: &Criterion) -> Option<bool> {
    match criterion.category.as_deref()? {
        "yes" => Some(true),
        "no" => Some(false),
        _ => None,
    }
}

/// The criteria as eVe's `when`, and how many conditions it holds; None when one cannot be held there.
fn when_of(criteria: &[Criterion]) -> Option<(PosologyWhen, usize)> {
    let mut when = PosologyWhen {
        age_years: None,
        weight_kg: None,
        height_cm: None,
        bmi: None,
        sex: None,
        pregnant: None,
        breastfeeding: None,
        egfr: None,
        creatinine_clearance: None,
        alt: None,
        ast: None,
        glycaemia: None,
        hba1c: None,
        systolic: None,
        diastolic: None,
    };
    for criterion in criteria {
        match criterion.parameter {
            ProfileParameter::AgeYears => tighten(&mut when.age_years, criterion)?,
            ProfileParameter::WeightKg => tighten(&mut when.weight_kg, criterion)?,
            ProfileParameter::HeightCm => tighten(&mut when.height_cm, criterion)?,
            ProfileParameter::Bmi => tighten(&mut when.bmi, criterion)?,
            ProfileParameter::Gfr => tighten(&mut when.egfr, criterion)?,
            ProfileParameter::CreatinineClearance => {
                tighten(&mut when.creatinine_clearance, criterion)?
            }
            ProfileParameter::SystolicBp => tighten(&mut when.systolic, criterion)?,
            ProfileParameter::DiastolicBp => tighten(&mut when.diastolic, criterion)?,
            ProfileParameter::Sex => when.sex = Some(criterion.category.clone()?),
            ProfileParameter::Pregnancy => when.pregnant = Some(yes(criterion)?),
            ProfileParameter::Breastfeeding => when.breastfeeding = Some(yes(criterion)?),
            ProfileParameter::Lab => match criterion.lab? {
                LabKey::FastingGlucose => tighten(&mut when.glycaemia, criterion)?,
                LabKey::Hba1c => tighten(&mut when.hba1c, criterion)?,
                LabKey::Alt => tighten(&mut when.alt, criterion)?,
                _ => return None,
            },
            ProfileParameter::PregnancyWeeks | ProfileParameter::HepaticImpairment => return None,
        }
    }
    let value = serde_json::to_value(&when).ok()?;
    let count = value
        .as_object()?
        .values()
        .filter(|value| !value.is_null())
        .count();
    Some((when, count))
}

fn milligrams(amount: f64, unit: &str) -> Option<f64> {
    match unit {
        "mg" => Some(amount),
        "g" => Some(amount * 1000.0),
        "µg" => Some(amount / 1000.0),
        _ => None,
    }
}

/// The one strength of the medicine in mg, when it holds one active substance.
fn strength(medicine: &Medicine) -> Option<f64> {
    let mut links: Vec<u32> = medicine
        .components
        .iter()
        .map(|component| component.link)
        .collect();
    links.sort_unstable();
    links.dedup();
    if links.len() != 1 {
        return None;
    }
    let component = medicine.components.first()?;
    let folded = fold_measures(&component.dosage);
    let mut words = folded.split(' ');
    let amount: f64 = words.next()?.parse().ok()?;
    let unit = match words.next()? {
        "mg" => "mg",
        "g" => "g",
        "µg" | "microgrammes" | "microgramme" => "µg",
        _ => return None,
    };
    milligrams(amount, unit)
}

/// `amount` of `unit` as units of the medicine's form, when exact to a half.
fn units(medicine: &Medicine, amount: f64, unit: &str) -> Option<f64> {
    let count = match milligrams(amount, unit) {
        Some(mg) => mg / strength(medicine)?,
        None if has_words(&fold(&medicine.form), unit)
            || fold(&medicine.form).starts_with(unit) =>
        {
            amount
        }
        None => return None,
    };
    let halves = count * 2.0;
    ((halves - halves.round()).abs() < 1e-6 && count > 0.0 && count <= 12.0)
        .then_some(halves.round() / 2.0)
}

/// Words that make a dose depend on something the parameters do not hold (an indication, a doctor's choice, a
/// step of a titration, another presentation): such a sentence gives no rule.
const QUALIFIED: &[&str] = &[
    " peut ",
    " peuvent ",
    "par exemple",
    "jusqu'a",
    "jusqu a",
    "portee a",
    "augment",
    "il existe",
    "dans certains cas",
    "en fonction",
    "selon ",
    "initial",
    "envisage",
];

/// Words that make a « not recommended » about something else than the form for that population: an
/// association, a dose to adjust or to keep low.
const NOT_THE_FORM: &[&str] = &[
    "associ",
    "adaptation posolog",
    "ajustement",
    "afin d",
    "pour eviter",
    "fortes doses",
    "doses elevees",
    "doses superieures",
];

fn dose_rule(medicine: &Medicine, dose: &DosageRule) -> Option<(PosologyRule, usize)> {
    let folded = format!(" {} ", fold_measures(&dose.quote));
    if dose.per_kg || QUALIFIED.iter().any(|word| folded.contains(word)) {
        return None;
    }
    let unit = dose.unit.as_deref()?;
    let amount = dose.amount?;
    // A ceiling alone (« ne doit pas dépasser 2000 mg/jour ») is no dose.
    if dose.max_daily == Some(amount) && dose.max_daily_unit.as_deref() == Some(unit) {
        return None;
    }
    let count = units(medicine, amount, unit)?;
    let repeated = folded.contains("renouveler") || dose.interval_hours.is_some();
    let once = [
        "une seule prise",
        "en une prise",
        "1 fois par jour",
        "une fois par jour",
        "prise unique",
    ]
    .iter()
    .any(|phrase| folded.contains(phrase));
    let in_form = milligrams(amount, unit).is_none();
    // A daily dose is an intake only when the text says one intake, or gives one unit of the form a day.
    let per_day = match dose.period.as_deref() {
        Some("intake") => false,
        _ if repeated => false,
        Some("day") if once || (in_form && count == 1.0) => true,
        None if in_form => false,
        _ => return None,
    };
    let largest = match (dose.amount_max, per_day) {
        (Some(high), true) => Some(units(medicine, high, unit)?),
        (None, true) => Some(count),
        _ => None,
    };
    let max_per_day = match (dose.max_daily, dose.max_daily_unit.as_deref()) {
        (Some(max), Some(max_unit)) => Some(units(medicine, max, max_unit)?),
        _ => largest,
    };
    let (when, conditions) = when_of(&dose.criteria)?;
    let as_needed = repeated
        || [
            "si necessaire",
            "si besoin",
            "en cas de douleur",
            "en cas de fievre",
            "au moment de",
        ]
        .iter()
        .any(|phrase| folded.contains(phrase));
    let rule = PosologyRule {
        when,
        per_intake: Some(count),
        hours: Vec::new(),
        as_needed,
        max_per_day,
        section: RcpSectionKey::Administration,
        quote: dose.quote.clone(),
    };
    Some((rule, conditions))
}

/// A population the form does not suit: a contra-indication or a « not recommended » whose sentence names its
/// population itself (a population carried from a heading is not enough to withhold a medicine).
fn unsuited_rules(
    rule: &ProfileRule,
    population: &PopulationPatterns,
) -> Vec<(PosologyRule, usize)> {
    if !matches!(
        rule.effect,
        RuleEffect::Contraindication | RuleEffect::NotRecommended
    ) {
        return Vec::new();
    }
    let folded = fold_measures(&rule.quote);
    if NOT_THE_FORM.iter().any(|word| folded.contains(word)) {
        return Vec::new();
    }
    let own = population.criteria(&folded);
    if own.is_empty() {
        return Vec::new();
    }
    // « Pendant la grossesse et l'allaitement »: each state its own rule.
    each_state(own)
        .iter()
        .filter_map(|criteria| when_of(criteria))
        .map(|(when, count)| {
            let rule = PosologyRule {
                when,
                per_intake: None,
                hours: Vec::new(),
                as_needed: false,
                max_per_day: None,
                section: rule.section,
                quote: rule.quote.clone(),
            };
            (rule, count)
        })
        .collect()
}

/// The posology of one medicine from its SmPC's rules; None when none could be read.
pub fn posology(
    medicine: &Medicine,
    updated: Option<&str>,
    doses: &[&DosageRule],
    rules: &[&ProfileRule],
    population: &PopulationPatterns,
) -> Option<Posology> {
    let mut unsuited: Vec<(PosologyRule, usize)> = rules
        .iter()
        .flat_map(|rule| unsuited_rules(rule, population))
        .collect();
    let mut dosed: Vec<(PosologyRule, usize)> = doses
        .iter()
        .filter_map(|dose| dose_rule(medicine, dose))
        .collect();
    if dosed.is_empty() && unsuited.is_empty() {
        return None;
    }
    unsuited.sort_by_key(|rule| std::cmp::Reverse(rule.1));
    dosed.sort_by_key(|rule| std::cmp::Reverse(rule.1));
    let mut ordered: Vec<PosologyRule> = Vec::new();
    for (rule, _) in unsuited.into_iter().chain(dosed) {
        if ordered.iter().all(|kept| kept.when != rule.when) {
            ordered.push(rule);
        }
    }
    let date = updated.map_or_else(String::new, |date| format!(", mis à jour le {date}"));
    Some(Posology {
        source: format!("BDPM, RCP du CIS {}{date}", medicine.cis),
        rules: ordered,
    })
}
