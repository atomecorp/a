//! The SmPC rules that depend on the person: the doses of section 4.2 by population, and the sentences of
//! sections 4.3, 4.4 and 4.6 that name a population (an age, a weight, the kidneys, the liver, a pregnancy,
//! breastfeeding) with what they say for it. A heading (« Population pédiatrique », « Insuffisance rénale »,
//! « Grossesse », « Allaitement ») or a short sentence that only names a population (« Réservé à l'adulte et à
//! l'enfant à partir de 50 kg ») sets the population of the sentences that follow, until another one; a dose
//! table is read row by row, each cell by its column's header. A
//! sentence whose population cannot be read gives no rule; its text stays for display. Under a heading, a
//! sentence naming no population of its own is a rule only when it says something for it.

use crate::model::{
    Criterion, DosageRule, ProfileParameter, ProfileRule, RcpSectionKey, RuleEffect,
};
use crate::population::PopulationPatterns;
use crate::rcp::{RcpPage, sentences};
use crate::text::{fold_measures, has_words};
use regex::Regex;

pub struct DosePatterns {
    pub(crate) population: PopulationPatterns,
    amount: Regex,
    maximum: Regex,
    hours: Regex,
    interval: Regex,
}

/// A number as the folded text writes it, thousands parted by a space (« 3 000 »).
fn number(text: &str) -> Option<f64> {
    text.replace(' ', "").parse().ok()
}

fn unit(word: &str) -> String {
    match word {
        "microgrammes" | "microgramme" | "µg" | "mcg" => "µg".to_string(),
        "ui" => "UI".to_string(),
        "ml" => "mL".to_string(),
        other => other.trim_end_matches('s').to_string(),
    }
}

const UNITS: &str = r"(mg|g|µg|mcg|microgrammes?|ui|ml|comprimes?|gelules?|sachets?|capsules?|doses?|gouttes?|suppositoires?)";

impl DosePatterns {
    pub fn new() -> Result<Self, String> {
        let compile =
            |pattern: &str| Regex::new(pattern).map_err(|error| format!("dose pattern: {error}"));
        let n = r"(\d{1,3}(?: \d{3})+|\d+(?:\.\d+)?)";
        // What follows the unit: per kilogram or per square metre, per day.
        let per = r"((?: / kg| par kg| / m2)?(?: / (?:j|jour|24 h)\b| par jour| par 24 heures)?)";
        Ok(Self {
            population: PopulationPatterns::new()?,
            amount: compile(&format!(r"\b{n}(?: (?:a|-) {n})? {UNITS}\b{per}( / min)?"))?,
            maximum: compile(&format!(
                r"\b(?:depasser|exceder|maximale? (?:de |est de )?|maximum (?:de )?|au maximum )[^.]*?{n} {UNITS}\b"
            ))?,
            hours: compile(&format!(r"\b{n} (?:heures|h)\b"))?,
            interval: compile(&format!(
                r"\b(?:(?:au moins|minimum|espacees? d'au moins|intervalle (?:minimum )?de) {n} (?:heures|h)|{n} (?:heures|h) (?:minimum|au moins))\b"
            ))?,
        })
    }

    /// A row of a dose table (« Poids | Dose maximale par administration | Intervalle | Dose journalière
    /// maximale »): its first cell is the population, read with its column's header; the others by theirs.
    fn table_row(
        &self,
        cis: &str,
        context: &[Criterion],
        header: &[String],
        cells: &[&str],
        sentence: &str,
    ) -> Option<DosageRule> {
        let column = |index: usize| header.get(index).map_or("", String::as_str);
        let first = format!("{} {}", column(0), fold_measures(cells.first()?));
        let own = self.population.criteria(&first);
        if own.is_empty() {
            return None;
        }
        let mut criteria: Vec<Criterion> = context
            .iter()
            .filter(|kept| own.iter().all(|new| new.parameter != kept.parameter))
            .cloned()
            .collect();
        criteria.extend(own);
        let mut dose: Option<DosageRule> = None;
        let (mut max_daily, mut max_daily_unit, mut interval) = (None, None, None);
        for (index, cell) in cells.iter().enumerate().skip(1) {
            let folded = fold_measures(cell);
            let heading = column(index);
            if heading.contains("intervalle") {
                interval = self
                    .hours
                    .captures(&folded)
                    .and_then(|hours| number(&hours[1]));
            } else if heading.contains("journaliere")
                || heading.contains("quotidienne")
                || heading.contains("par jour")
                || heading.contains("totale")
            {
                if let Some(found) = self
                    .amount
                    .captures_iter(&folded)
                    .find(|found| found.get(5).is_none())
                {
                    max_daily = number(&found[1]);
                    max_daily_unit = Some(unit(&found[3]));
                }
            } else if dose.is_none() && heading.contains("dose") {
                dose = self.dosage(cis, &criteria, sentence, &folded);
                if let Some(dose) = dose.as_mut()
                    && (heading.contains("administration") || heading.contains("prise"))
                {
                    dose.period = Some("intake".to_string());
                }
            }
        }
        if dose.is_none() && max_daily.is_none() {
            return None;
        }
        let mut dose = dose.unwrap_or_else(|| DosageRule {
            cis: cis.to_string(),
            criteria: criteria.clone(),
            amount: None,
            amount_max: None,
            unit: None,
            per_kg: false,
            period: None,
            max_daily: None,
            max_daily_unit: None,
            interval_hours: None,
            quote: sentence.to_string(),
        });
        dose.max_daily = max_daily.or(dose.max_daily);
        dose.max_daily_unit = max_daily_unit.or(dose.max_daily_unit);
        dose.interval_hours = interval.or(dose.interval_hours);
        Some(dose)
    }

    fn dosage(
        &self,
        cis: &str,
        criteria: &[Criterion],
        sentence: &str,
        folded: &str,
    ) -> Option<DosageRule> {
        // A rate (« 30 ml/min ») is a clearance, not a dose.
        let found = self
            .amount
            .captures_iter(folded)
            .find(|found| found.get(5).is_none())?;
        let per = found.get(4).map_or("", |per| per.as_str());
        let per_kg = per.contains("kg");
        // « 2 comprimés par prise, trois fois par jour »: the words right after the dose say what it is per.
        // One word may part them (« 1 comprimé enrobé par prise »).
        let after: Vec<&str> = folded[found.get(0)?.end()..]
            .split_whitespace()
            .take(3)
            .collect();
        let per_intake = ["prise", "administration"]
            .iter()
            .any(|word| after.windows(2).take(2).any(|pair| pair == ["par", *word]));
        let per_day = !per_intake
            && (per.contains('j') || per.contains("24") || has_words(folded, "par jour"));
        let mut dose_unit = unit(&found[3]);
        if per.contains("m2") {
            dose_unit.push_str("/m²");
        }
        let maximum = self.maximum.captures(folded);
        Some(DosageRule {
            cis: cis.to_string(),
            criteria: criteria.to_vec(),
            amount: number(&found[1]),
            amount_max: found.get(2).and_then(|high| number(high.as_str())),
            unit: Some(dose_unit),
            per_kg,
            period: if per_day {
                Some("day".to_string())
            } else if per_intake
                || has_words(folded, "par prise")
                || has_words(folded, "prise unique")
                || has_words(folded, "par administration")
            {
                Some("intake".to_string())
            } else {
                None
            },
            max_daily: maximum.as_ref().and_then(|maximum| number(&maximum[1])),
            max_daily_unit: maximum.as_ref().map(|maximum| unit(&maximum[2])),
            interval_hours: self
                .interval
                .captures(folded)
                .and_then(|interval| interval.get(1).or_else(|| interval.get(2)))
                .and_then(|hours| number(hours.as_str())),
            quote: sentence.to_string(),
        })
    }
}

fn effect(section: RcpSectionKey, folded: &str) -> RuleEffect {
    let says = |phrases: &[&str]| phrases.iter().any(|phrase| folded.contains(phrase));
    if section == RcpSectionKey::Contraindications
        || says(&["contre indiqu", "ne doit jamais", "ne jamais"])
    {
        RuleEffect::Contraindication
    } else if says(&[
        "ne doit pas depasser",
        "ne doit pas exceder",
        "sans depasser",
        "sans exceder",
    ]) {
        // A ceiling on the dose, not a population the medicine does not suit.
        RuleEffect::DoseAdjustment
    } else if says(&[
        "deconseill",
        "ne doit pas",
        "ne pas utiliser",
        "ne pas administrer",
        "eviter",
        "n'est pas adapte",
        "pas adaptee",
        "ne convient pas",
    ]) {
        RuleEffect::NotRecommended
    } else if says(&[
        "adapter la posologie",
        "reduire la posologie",
        "reduire la dose",
        "diminuer la dose",
        "ajustement de la posologie",
        "ajuster la posologie",
        "adaptation de la posologie",
        "posologie doit etre",
    ]) {
        RuleEffect::DoseAdjustment
    } else if section == RcpSectionKey::Pregnancy
        && says(&[
            "peut etre utilise",
            "peut etre prescrit",
            "peut etre envisage",
            "possible",
            "peut etre pris",
        ])
    {
        RuleEffect::Possible
    } else {
        RuleEffect::Precaution
    }
}

/// « Grossesse et allaitement » names two populations, not one person both pregnant and breastfeeding: a rule
/// for each.
pub(crate) fn each_state(criteria: Vec<Criterion>) -> Vec<Vec<Criterion>> {
    let state = |criterion: &Criterion| {
        matches!(
            criterion.parameter,
            ProfileParameter::Pregnancy
                | ProfileParameter::PregnancyWeeks
                | ProfileParameter::Breastfeeding
        )
    };
    let pregnancy = criteria.iter().any(|criterion| {
        state(criterion) && criterion.parameter != ProfileParameter::Breastfeeding
    });
    let breastfeeding = criteria
        .iter()
        .any(|criterion| criterion.parameter == ProfileParameter::Breastfeeding);
    if !(pregnancy && breastfeeding) {
        return vec![criteria];
    }
    let without = |dropped: &dyn Fn(&Criterion) -> bool| {
        criteria
            .iter()
            .filter(|criterion| !dropped(criterion))
            .cloned()
            .collect()
    };
    vec![
        without(&|criterion: &Criterion| criterion.parameter == ProfileParameter::Breastfeeding),
        without(&|criterion: &Criterion| {
            state(criterion) && criterion.parameter != ProfileParameter::Breastfeeding
        }),
    ]
}

/// The doses and the profile rules of one SmPC.
pub fn profile_rules(
    cis: &str,
    page: &RcpPage,
    patterns: &DosePatterns,
) -> (Vec<DosageRule>, Vec<ProfileRule>) {
    let mut dosages = Vec::new();
    let mut rules = Vec::new();
    for (section, text) in &page.sections {
        // Populations are named in 4.2, 4.3, 4.4 and 4.6; 4.5, 4.7 and 4.8 give no profile rule.
        if matches!(
            section,
            RcpSectionKey::Interactions | RcpSectionKey::Driving | RcpSectionKey::AdverseEffects
        ) {
            continue;
        }
        let mut context: Vec<Criterion> = Vec::new();
        let mut header: Vec<String> = Vec::new();
        let mut in_table = false;
        for (sentence, is_heading) in sentences(text) {
            if *section == RcpSectionKey::Administration && sentence.contains(" | ") {
                let cells: Vec<&str> = sentence.split(" | ").collect();
                // A table's first row is its header.
                if !in_table {
                    header = cells.iter().map(|cell| fold_measures(cell)).collect();
                } else if let Some(dosage) =
                    patterns.table_row(cis, &context, &header, &cells, &sentence)
                {
                    dosages.push(dosage);
                }
                in_table = true;
                continue;
            }
            in_table = false;
            let folded = fold_measures(&sentence);
            let own = patterns.population.criteria(&folded);
            if is_heading {
                // A heading naming a population sets it; a heading naming none (« En association avec
                // l'insuline ») keeps the one above it, unless it opens another part (« Mode d'administration »).
                let opens = [
                    "posologie",
                    "mode d'administration",
                    "population",
                    "grossesse",
                    "allaitement",
                    "fertilite",
                ]
                .iter()
                .any(|word| folded.starts_with(word));
                if !own.is_empty() || opens {
                    context = own;
                }
                header.clear();
                continue;
            }
            let criteria = if own.is_empty() {
                context.clone()
            } else {
                // A sentence's own criteria refine the heading's on the other parameters it does not name.
                let mut merged: Vec<Criterion> = context
                    .iter()
                    .filter(|kept| own.iter().all(|new| new.parameter != kept.parameter))
                    .cloned()
                    .collect();
                merged.extend(own.iter().cloned());
                merged
            };
            if *section == RcpSectionKey::Administration {
                match patterns.dosage(cis, &criteria, &sentence, &folded) {
                    Some(dosage) if !criteria.is_empty() => dosages.push(dosage),
                    Some(_) => {}
                    // A population named alone as an introduction (« Chez l'adulte : », « Réservé à l'adulte
                    // et à l'enfant à partir de 50 kg ») sets the following sentences' population; a population
                    // the medicine is withheld from (« n'est pas adaptée aux enfants de moins de 6 ans ») does not.
                    None if !own.is_empty()
                        && !matches!(
                            effect(*section, &folded),
                            RuleEffect::Contraindication | RuleEffect::NotRecommended
                        )
                        && (sentence.trim_end().ends_with(':')
                            || folded.starts_with("reserve")
                            || sentence.chars().count() < 100) =>
                    {
                        context = criteria.clone()
                    }
                    None => {}
                }
                if effect(*section, &folded) != RuleEffect::Precaution
                    && !criteria.is_empty()
                    && !own.is_empty()
                {
                    rules.push(ProfileRule {
                        cis: cis.to_string(),
                        effect: effect(*section, &folded),
                        criteria,
                        section: *section,
                        quote: sentence,
                    });
                }
                continue;
            }
            // Under a heading, a sentence that names no population of its own is a rule only when it says
            // something for it (contra-indicated, not recommended, a dose to adapt, possible).
            let says = !own.is_empty() || effect(*section, &folded) != RuleEffect::Precaution;
            if !criteria.is_empty() && says {
                for criteria in each_state(criteria) {
                    rules.push(ProfileRule {
                        cis: cis.to_string(),
                        effect: effect(*section, &folded),
                        criteria,
                        section: *section,
                        quote: sentence.clone(),
                    });
                }
            }
        }
    }
    (dosages, rules)
}
