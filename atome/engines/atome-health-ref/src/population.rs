//! The population a SmPC sentence speaks of, read as profile criteria from its folded text
//! (`text::fold_measures`, decimals and the signs < > / kept):
//! an age or a weight band, the kidneys (creatinine clearance, GFR), the liver, a pregnancy and its term,
//! breastfeeding, a kalaemia. Only what the words state: a number is taken as written; a named grade takes the
//! bound of the classification the SmPCs follow (EMA guidelines: renal impairment severe < 30 mL/min,
//! moderate 30–59, mild 60–89; the elderly from 65; a child under 18, an infant under 2; hepatic impairment
//! by Child-Pugh), and the sentence stays quoted beside the criteria.

use crate::model::{Comparison, Criterion, LabKey, ProfileParameter};
use regex::Regex;

pub struct PopulationPatterns {
    range: Regex,
    lower: Regex,
    upper: Regex,
    renal: Regex,
    gfr: Regex,
    weeks: Regex,
    renal_range: Regex,
    gfr_range: Regex,
    bmi: Regex,
    kalaemia: Regex,
}

fn number(text: &str) -> Option<f64> {
    text.replace(',', ".").parse().ok()
}

fn criterion(
    parameter: ProfileParameter,
    comparison: Comparison,
    value: f64,
    upper: Option<f64>,
) -> Criterion {
    Criterion {
        parameter,
        comparison,
        value: Some(value),
        upper,
        category: None,
        lab: None,
    }
}

fn category(parameter: ProfileParameter, category: &str) -> Criterion {
    Criterion {
        parameter,
        comparison: Comparison::Is,
        value: None,
        upper: None,
        category: Some(category.to_string()),
        lab: None,
    }
}

/// The parameter a unit measures, and the factor to the profile's unit.
fn unit_parameter(unit: &str) -> Option<(ProfileParameter, f64)> {
    match unit {
        "kg" => Some((ProfileParameter::WeightKg, 1.0)),
        "ans" | "an" => Some((ProfileParameter::AgeYears, 1.0)),
        "mois" => Some((ProfileParameter::AgeYears, 1.0 / 12.0)),
        _ => None,
    }
}

impl PopulationPatterns {
    pub fn new() -> Result<Self, String> {
        let compile = |pattern: &str| {
            Regex::new(pattern).map_err(|error| format!("population pattern: {error}"))
        };
        let n = r"(\d+(?:\.\d+)?)";
        let unit = r"(kg|ans|an|mois)\b";
        Ok(Self {
            range: compile(&format!(
                r"\b(?:de |entre )?{n}(?: (?:kg|ans|mois))? (?:a|et|-) {n} {unit}( / m2)?"
            ))?,
            lower: compile(&format!(
                r"(?:\b(a partir de|plus de|au dela de|superieure? (?:ou egale? )?a|d'au moins|au moins|pesant au moins)|> ?=?) {n} {unit}( / m2)?"
            ))?,
            upper: compile(&format!(
                r"(?:\b(moins de|inferieure? a|jusqu'a)|< ?=?) {n} {unit}( / m2)?"
            ))?,
            renal: compile(&format!(
                r"clairance (?:de la )?creatinine[^.;]*?(inferieure a|inferieure ou egale a|moins de|<=?|superieure a|superieure ou egale a|>=?|plus de|entre|de) {n}(?: (?:et|a) {n})?(?: ml / min|$)"
            ))?,
            gfr: compile(&format!(
                r"\b(?:dfg|debit de filtration glomerulaire|dfge)[^.;]*?(inferieure? a|inferieure? ou egale? a|moins de|<=?|superieure? a|superieure? ou egale? a|>=?|entre|de) {n}(?: (?:et|a) {n})?(?: ml / min|$)"
            ))?,
            weeks: compile(
                r"\b(?:a partir de|au dela de|apres) (\d+) (?:semaines d'amenorrhee|sa)\b",
            )?,
            // A table's header and first cell read together end on the bounds (« DFG mL/min 60 89 »).
            renal_range: compile(&format!(
                r"clairance (?:de la )?creatinine[^.;]*?{n} (?:a |et )?{n}(?: ml / min|$)"
            ))?,
            gfr_range: compile(&format!(
                r"\b(?:dfg|debit de filtration glomerulaire|dfge)[^.;]*?{n} (?:a |et )?{n}(?: ml / min|$)"
            ))?,
            bmi: compile(&format!(
                r"\b(?:imc|indice de masse corporelle) (> ?=?|< ?=?|superieure? a|inferieure? a) {n}"
            ))?,
            kalaemia: compile(&format!(
                r"\bkaliemie (superieure a|>|inferieure a|<) {n} mmol"
            ))?,
        })
    }

    fn bounded(
        &self,
        parameter: ProfileParameter,
        word: &str,
        low: f64,
        high: Option<f64>,
    ) -> Option<Criterion> {
        let below = matches!(word, "inferieure a" | "inferieur a" | "moins de" | "<");
        let at_most = matches!(word, "inferieure ou egale a" | "inferieur ou egal a" | "<=");
        let above = matches!(word, "superieure a" | "superieur a" | ">" | "plus de");
        let at_least = matches!(word, "superieure ou egale a" | "superieur ou egal a" | ">=");
        match (below, at_most, above, at_least, high) {
            (true, ..) => Some(criterion(parameter, Comparison::Lt, low, None)),
            (_, true, ..) => Some(criterion(parameter, Comparison::Le, low, None)),
            (_, _, true, ..) => Some(criterion(parameter, Comparison::Gt, low, None)),
            (_, _, _, true, _) => Some(criterion(parameter, Comparison::Ge, low, None)),
            (.., Some(high)) => Some(criterion(parameter, Comparison::Between, low, Some(high))),
            _ => None,
        }
    }

    /// The criteria a folded sentence states. Months in a sentence about a pregnancy count its term, not an age.
    pub fn criteria(&self, folded: &str) -> Vec<Criterion> {
        // « moins d'un mois » is « moins de 1 mois ».
        let spelled = [" d'un ", " d un "]
            .iter()
            .fold(folded.to_string(), |text, article| {
                text.replace(&format!("{article}mois"), " de 1 mois")
                    .replace(&format!("{article}an "), " de 1 an ")
            });
        let folded = spelled.as_str();
        let pregnancy = has(folded, &["grossesse", "femme enceinte", "femmes enceintes"]);
        let unit_parameter =
            |unit: &str| unit_parameter(unit).filter(|_| !(pregnancy && unit == "mois"));
        let mut found = Vec::new();
        let mut covered: Vec<ProfileParameter> = Vec::new();
        for captures in self.range.captures_iter(folded) {
            // « kg/m² » is a body mass index, read below.
            let (Some(low), Some(high), Some((parameter, factor)), None) = (
                number(&captures[1]),
                number(&captures[2]),
                unit_parameter(&captures[3]),
                captures.get(4),
            ) else {
                continue;
            };
            if low < high {
                found.push(criterion(
                    parameter,
                    Comparison::Between,
                    low * factor,
                    Some(high * factor),
                ));
                covered.push(parameter);
            }
        }
        for (pattern, comparison) in [(&self.lower, Comparison::Ge), (&self.upper, Comparison::Lt)]
        {
            for captures in pattern.captures_iter(folded) {
                let (Some(value), Some((parameter, factor)), None) = (
                    number(&captures[2]),
                    unit_parameter(&captures[3]),
                    captures.get(4),
                ) else {
                    continue;
                };
                // « au moins 4 ans » of follow-up is a duration, not an age.
                let duration = captures
                    .get(1)
                    .is_some_and(|word| word.as_str().ends_with("au moins"))
                    && parameter == ProfileParameter::AgeYears;
                if !duration && !covered.contains(&parameter) {
                    found.push(criterion(parameter, comparison, value * factor, None));
                }
            }
        }
        if !covered.contains(&ProfileParameter::AgeYears)
            && !found
                .iter()
                .any(|c| c.parameter == ProfileParameter::AgeYears)
        {
            if has(
                folded,
                &[
                    "sujet age",
                    "sujets ages",
                    "personne agee",
                    "personnes agees",
                    "patients ages",
                    "patient age",
                ],
            ) {
                found.push(criterion(
                    ProfileParameter::AgeYears,
                    Comparison::Ge,
                    65.0,
                    None,
                ));
            } else if has(folded, &["nourrisson", "nourrissons"]) {
                found.push(criterion(
                    ProfileParameter::AgeYears,
                    Comparison::Lt,
                    2.0,
                    None,
                ));
            } else if has(folded, &["enfant", "enfants", "population pediatrique"])
                && !has(folded, &["adulte", "adultes"])
            {
                found.push(criterion(
                    ProfileParameter::AgeYears,
                    Comparison::Lt,
                    18.0,
                    None,
                ));
            } else if has(folded, &["adulte", "adultes"]) && !has(folded, &["enfant", "enfants"]) {
                found.push(criterion(
                    ProfileParameter::AgeYears,
                    Comparison::Ge,
                    18.0,
                    None,
                ));
            }
        }
        if let Some(captures) = self.bmi.captures(folded) {
            let word = captures[1].replace(' ', "");
            if let Some(value) = number(&captures[2]) {
                let comparison = match word.as_str() {
                    ">=" => Comparison::Ge,
                    "<=" => Comparison::Le,
                    "<" | "inferieurea" | "inferieura" => Comparison::Lt,
                    _ => Comparison::Gt,
                };
                found.push(criterion(ProfileParameter::Bmi, comparison, value, None));
            }
        }
        let renal = self.renal_criteria(folded);
        found.extend(renal);
        if let Some(hepatic) = hepatic(folded) {
            found.push(hepatic);
        }
        if let Some(captures) = self.weeks.captures(folded) {
            if let Some(weeks) = number(&captures[1]) {
                found.push(criterion(
                    ProfileParameter::PregnancyWeeks,
                    Comparison::Ge,
                    weeks,
                    None,
                ));
            }
        } else if has(
            folded,
            &[
                "6eme mois",
                "sixieme mois",
                "troisieme trimestre",
                "3eme trimestre",
            ],
        ) {
            found.push(criterion(
                ProfileParameter::PregnancyWeeks,
                Comparison::Ge,
                24.0,
                None,
            ));
        } else if has(folded, &["grossesse", "femme enceinte", "femmes enceintes"]) {
            found.push(category(ProfileParameter::Pregnancy, "yes"));
        }
        if has(folded, &["allaitement", "allaitante", "allaitantes"]) {
            found.push(category(ProfileParameter::Breastfeeding, "yes"));
        }
        if has(
            folded,
            &["femme en age de procreer", "femmes en age de procreer"],
        ) {
            found.push(category(ProfileParameter::Sex, "female"));
        }
        if let Some(captures) = self.kalaemia.captures(folded) {
            let comparison = if captures[1].starts_with('s') || &captures[1] == ">" {
                Comparison::Gt
            } else {
                Comparison::Lt
            };
            if let Some(value) = number(&captures[2]) {
                found.push(Criterion {
                    lab: Some(LabKey::Potassium),
                    ..criterion(ProfileParameter::Lab, comparison, value, None)
                });
            }
        }
        found
    }

    fn renal_criteria(&self, folded: &str) -> Vec<Criterion> {
        for (pattern, parameter) in [
            (&self.renal_range, ProfileParameter::CreatinineClearance),
            (&self.gfr_range, ProfileParameter::Gfr),
        ] {
            if let Some(captures) = pattern.captures(folded)
                && let (Some(low), Some(high)) = (number(&captures[1]), number(&captures[2]))
                && low < high
            {
                // « 60-89 » in a table holds 89: the bound above is the next whole number.
                let upper = if high.fract() == 0.0 && folded.ends_with(&captures[2]) {
                    high + 1.0
                } else {
                    high
                };
                return vec![criterion(parameter, Comparison::Between, low, Some(upper))];
            }
        }
        for (pattern, parameter) in [
            (&self.renal, ProfileParameter::CreatinineClearance),
            (&self.gfr, ProfileParameter::Gfr),
        ] {
            if let Some(captures) = pattern.captures(folded) {
                let low = number(&captures[2]);
                let high = captures.get(3).and_then(|high| number(high.as_str()));
                if let Some(found) =
                    low.and_then(|low| self.bounded(parameter, &captures[1], low, high))
                {
                    return vec![found];
                }
            }
        }
        let clearance = |comparison, value, upper| {
            vec![criterion(
                ProfileParameter::CreatinineClearance,
                comparison,
                value,
                upper,
            )]
        };
        if has(
            folded,
            &[
                "insuffisance renale severe",
                "insuffisants renaux severes",
                "insuffisance renale terminale",
            ],
        ) {
            clearance(Comparison::Lt, 30.0, None)
        } else if has(folded, &["insuffisance renale moderee a severe"]) {
            clearance(Comparison::Lt, 60.0, None)
        } else if has(folded, &["insuffisance renale moderee"]) {
            clearance(Comparison::Between, 30.0, Some(60.0))
        } else if has(folded, &["insuffisance renale legere"]) {
            clearance(Comparison::Between, 60.0, Some(90.0))
        } else if has(
            folded,
            &[
                "insuffisance renale",
                "insuffisants renaux",
                "insuffisant renal",
            ],
        ) {
            clearance(Comparison::Lt, 60.0, None)
        } else {
            Vec::new()
        }
    }
}

fn has(folded: &str, phrases: &[&str]) -> bool {
    phrases
        .iter()
        .any(|phrase| crate::text::has_words(folded, phrase))
}

fn hepatic(folded: &str) -> Option<Criterion> {
    let grade = |comparison, value, upper| {
        Some(criterion(
            ProfileParameter::HepaticImpairment,
            comparison,
            value,
            upper,
        ))
    };
    let named = |grade_words: &str| {
        has(
            folded,
            &[
                &format!("insuffisance hepatique {grade_words}"),
                &format!("insuffisants hepatiques {grade_words}"),
            ],
        )
    };
    if named("moderee a severe") || named("moderee ou severe") {
        grade(Comparison::Ge, 2.0, None)
    } else if named("severe")
        || named("severes")
        || has(folded, &["hepatopathie severe", "child pugh c"])
    {
        grade(Comparison::Ge, 3.0, None)
    } else if named("moderee") || has(folded, &["child pugh b"]) {
        grade(Comparison::Between, 2.0, Some(3.0))
    } else if named("legere")
        || named("legere a moderee")
        // An impairment of no stated grade is any grade.
        || has(
        folded,
        &[
            "insuffisance hepatique",
            "insuffisants hepatiques",
            "insuffisant hepatique",
        ],
    ) {
        grade(Comparison::Ge, 1.0, None)
    } else {
        None
    }
}
