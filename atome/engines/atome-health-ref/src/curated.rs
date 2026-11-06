//! The rule bases this crate authors itself, each rule with its source: `data/food_rules.json` (food advice by
//! pathology, state, treatment and allergy — HAS, Assurance Maladie, FFD, AFDIAG, France Rein, OMS, EU 1169/2011,
//! ANSM) and `data/supplements.json` (Compl'Alim ingredient aliases and the Anses nutrivigilance opinions). Both
//! are embedded in the binary and checked at every build: a rule naming an unknown source, condition or food
//! fails the build.

use crate::model::{
    Condition, ConditionKind, Food, FoodRule, ProfileParameter, Source, SupplementRule,
};
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};

pub const FOOD_RULES_JSON: &str = include_str!("../data/food_rules.json");
pub const SUPPLEMENTS_JSON: &str = include_str!("../data/supplements.json");
/// The source of the foods' Open Food Facts categories.
pub const OFF_CATEGORIES_SOURCE: &str = "off_categories";

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FoodData {
    pub sources: Vec<Source>,
    pub foods: Vec<Food>,
    pub conditions: Vec<Condition>,
    pub rules: Vec<FoodRule>,
    /// Thesaurus entry key → food key: the thesaurus entries that are a food or a drink.
    pub thesaurus_foods: BTreeMap<String, String>,
}

/// The substance (a thesaurus entry key, or a key of its own for an Anses opinion) a supplement ingredient is
/// read as, and the folded names that say it.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupplementAlias {
    pub substance: String,
    pub names: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SupplementData {
    pub sources: Vec<Source>,
    pub aliases: Vec<SupplementAlias>,
    pub rules: Vec<SupplementRule>,
}

fn unique<'a>(
    what: &str,
    keys: impl Iterator<Item = &'a String>,
) -> Result<BTreeSet<&'a str>, String> {
    let mut seen = BTreeSet::new();
    for key in keys {
        if key.trim().is_empty() || !seen.insert(key.as_str()) {
            return Err(format!("{what} '{key}' is empty or listed twice"));
        }
    }
    Ok(seen)
}

/// The food rule base, checked. `outside_sources` are the ids of sources the bundle cites by itself (the ANSM
/// thesaurus).
pub fn food_data(outside_sources: &[&str]) -> Result<FoodData, String> {
    let data: FoodData = serde_json::from_str(FOOD_RULES_JSON)
        .map_err(|error| format!("food_rules.json: {error}"))?;
    let mut sources = unique("food source", data.sources.iter().map(|source| &source.id))?;
    sources.extend(outside_sources);
    let foods = unique("food", data.foods.iter().map(|food| &food.key))?;
    let conditions = unique(
        "condition",
        data.conditions.iter().map(|condition| &condition.key),
    )?;
    unique("food rule", data.rules.iter().map(|rule| &rule.id))?;
    for food in &data.foods {
        if food.words.is_empty()
            || food
                .words
                .iter()
                .any(|word| crate::text::fold(word) != *word)
        {
            return Err(format!(
                "food '{}': its words must be folded and not empty",
                food.key
            ));
        }
    }
    // An Open Food Facts tag names one food, and the taxonomy is cited.
    unique(
        "Open Food Facts category",
        data.foods.iter().flat_map(|food| food.categories.iter()),
    )?;
    let tagged = data.foods.iter().any(|food| !food.categories.is_empty());
    if let Some(tag) = data
        .foods
        .iter()
        .flat_map(|food| food.categories.iter())
        .find(|tag| !tag.starts_with("en:") || tag.contains(' '))
    {
        return Err(format!(
            "Open Food Facts category '{tag}' is not an en: tag"
        ));
    }
    if tagged && !sources.contains(OFF_CATEGORIES_SOURCE) {
        return Err(format!(
            "food categories need the source '{OFF_CATEGORIES_SOURCE}'"
        ));
    }
    for condition in &data.conditions {
        // A treatment names the thesaurus entries that make it; no other condition does.
        if (condition.kind == ConditionKind::Treatment) == condition.thesaurus.is_empty() {
            return Err(format!(
                "condition '{}': a treatment, and only a treatment, names its thesaurus entries",
                condition.key
            ));
        }
        // A threshold on a measure (a glycaemia, a pressure, a GFR) is cited; a state the profile holds as such
        // (an age, a pregnancy) is the condition itself and needs none.
        let definitional = condition.measured_by.iter().flatten().all(|criterion| {
            matches!(
                criterion.parameter,
                ProfileParameter::AgeYears
                    | ProfileParameter::Sex
                    | ProfileParameter::Pregnancy
                    | ProfileParameter::Breastfeeding
            )
        });
        let sourced = match &condition.measured_source {
            Some(source) => sources.contains(source.as_str()) && !condition.measured_by.is_empty(),
            None => definitional,
        };
        if !sourced || condition.measured_by.iter().any(Vec::is_empty) {
            return Err(format!(
                "condition '{}': a measured threshold needs its source, and a source its measures",
                condition.key
            ));
        }
        for criterion in condition.measured_by.iter().flatten() {
            crate::criteria::check(criterion)
                .map_err(|error| format!("condition '{}': {error}", condition.key))?;
        }
    }
    for rule in &data.rules {
        for criterion in &rule.criteria {
            crate::criteria::check(criterion)
                .map_err(|error| format!("food rule '{}': {error}", rule.id))?;
        }
        let known = sources.contains(rule.source.as_str())
            && conditions.contains(rule.condition.as_str())
            && !rule.foods.is_empty()
            && rule.foods.iter().all(|food| foods.contains(food.as_str()))
            && !rule.text.trim().is_empty()
            && !rule.reason.trim().is_empty();
        if !known {
            return Err(format!(
                "food rule '{}': unknown source, condition or food, or empty text",
                rule.id
            ));
        }
    }
    if let Some((entry, food)) = data
        .thesaurus_foods
        .iter()
        .find(|(_, food)| !foods.contains(food.as_str()))
    {
        return Err(format!("thesaurus food '{entry}': food '{food}' unknown"));
    }
    Ok(data)
}

/// The supplement base, checked against the food base's conditions.
pub fn supplement_data(conditions: &BTreeSet<&str>) -> Result<SupplementData, String> {
    let data: SupplementData = serde_json::from_str(SUPPLEMENTS_JSON)
        .map_err(|error| format!("supplements.json: {error}"))?;
    let sources = unique(
        "supplement source",
        data.sources.iter().map(|source| &source.id),
    )?;
    unique("supplement rule", data.rules.iter().map(|rule| &rule.id))?;
    let subjects: BTreeSet<&str> = data
        .aliases
        .iter()
        .map(|alias| alias.substance.as_str())
        .collect();
    for alias in &data.aliases {
        if alias.names.is_empty()
            || alias
                .names
                .iter()
                .any(|name| crate::text::fold(name) != *name)
        {
            return Err(format!(
                "supplement alias '{}': its names must be folded and not empty",
                alias.substance
            ));
        }
    }
    for rule in &data.rules {
        let known = sources.contains(rule.source.as_str())
            && subjects.contains(rule.subject.as_str())
            && rule
                .conditions
                .iter()
                .all(|condition| conditions.contains(condition.as_str()))
            && (!rule.conditions.is_empty() || !rule.treatments.is_empty())
            && !rule.text.trim().is_empty();
        if !known {
            return Err(format!(
                "supplement rule '{}': unknown source, subject or condition, or nothing it applies to",
                rule.id
            ));
        }
    }
    Ok(data)
}
