// The rules the bundle states: the SmPC intake rules, the supplements and the curated food rules.

mod support;

use atome_health_ref::complalim;
use atome_health_ref::model::*;
use atome_health_ref::rcp::{self, Patterns};
use support::*;

// ---- The SmPC ----

fn intake(cis: &str) -> Vec<&'static IntakeRule> {
    rcp_part()
        .rules
        .iter()
        .filter(|rule| rule.cis == cis)
        .collect()
}

#[test]
fn levothyrox_is_taken_fasting_half_an_hour_before_breakfast_and_apart_from_iron_and_calcium() {
    let rules = intake("68416845");
    let fasting = rules
        .iter()
        .find(|rule| rule.kind == IntakeKind::Fasting)
        .expect("fasting");
    assert_eq!(fasting.hours, Some(0.5));
    assert_eq!(fasting.section, RcpSectionKey::Administration);
    let spacing = rules
        .iter()
        .find(|rule| {
            rule.kind == IntakeKind::Spacing
                && rule
                    .partner
                    .as_deref()
                    .is_some_and(|partner| partner.contains("fer, de calcium"))
        })
        .expect("spacing from iron and calcium");
    assert_eq!(spacing.hours, Some(2.0));
    assert_eq!(
        spacing.quote,
        "Prendre la lévothyroxine à distance de ces produits (plus de 2 heures, si possible)."
    );
}

#[test]
fn a_condition_is_not_a_fasting_instruction() {
    // Ciprofloxacine: « S'ils sont ingérés à jeun, la substance active est absorbée plus rapidement. »
    assert!(
        intake("67706265")
            .iter()
            .all(|rule| rule.kind != IntakeKind::Fasting)
    );
    assert!(
        intake("67706265")
            .iter()
            .any(|rule| rule.kind == IntakeKind::Spacing && rule.food.as_deref() == Some("dairy"))
    );
}

#[test]
fn foods_to_avoid_are_read_with_their_quote() {
    let simvastatine = intake("69094525");
    let grapefruit = simvastatine
        .iter()
        .find(|rule| rule.kind == IntakeKind::AvoidFood)
        .expect("grapefruit");
    assert_eq!(grapefruit.food.as_deref(), Some("grapefruit"));
    // The SmPC gives it as a table row: the row is the quote, its cells parted by « | ».
    assert_eq!(
        grapefruit.quote,
        "Jus de pamplemousse | Eviter le jus de pamplemousse durant le traitement par la simvastatine."
    );
    let sintrom = intake("61510352");
    let st_johns_wort = sintrom
        .iter()
        .find(|rule| rule.food.as_deref() == Some("st_johns_wort"))
        .expect("millepertuis");
    assert_eq!(
        st_johns_wort.quote,
        "Associations contre-indiquées : + Millepertuis"
    );
    // A heading ends the « + » partner: Tardyféron's food paragraph is not about trientine.
    assert!(
        intake("68269288")
            .iter()
            .all(|rule| rule.partner.as_deref() != Some("Trientine"))
    );
}

#[test]
fn every_smpc_document_points_at_its_texts() {
    let part = rcp_part();
    assert_eq!(part.documents.len(), 18);
    for document in &part.documents {
        assert!(document.updated.is_some(), "{}", document.cis);
        for section in &document.sections {
            assert!((section.text as usize) < part.texts.len());
        }
    }
    let page = rcp::parse_page("<p>Mis à jour le : 05/11</p>");
    assert!(page.is_err(), "a cut update date is refused");
    let patterns = Patterns::new().expect("patterns");
    let empty = rcp::parse_page("<p>no section</p>").expect("a page without sections");
    assert!(rcp::intake_rules("1", &empty, &[], &patterns).is_empty());
}

fn context(cis: &str, factor: ContextFactor) -> Vec<&'static ContextRule> {
    rcp_part()
        .context_rules
        .iter()
        .filter(|rule| rule.cis == cis && rule.factor == factor)
        .collect()
}

#[test]
fn the_smpc_sentences_about_the_person_s_life_are_quoted_as_written() {
    // Ciprofloxacin: 4.7 its reaction time, 4.4 the sun and the tendons, a sentence of 4.8 each.
    let driving = context("67706265", ContextFactor::Driving);
    assert_eq!(driving.len(), 1);
    assert_eq!(driving[0].section, RcpSectionKey::Driving);
    assert!(
        driving[0].quote.contains("temps de réaction"),
        "{}",
        driving[0].quote
    );
    let sun = context("67706265", ContextFactor::Photosensitivity);
    assert!(
        sun.iter()
            .any(|rule| rule.section == RcpSectionKey::Warnings)
    );
    assert!(
        sun.iter()
            .any(|rule| rule.section == RcpSectionKey::AdverseEffects)
    );
    assert!(!context("67706265", ContextFactor::Tendon).is_empty());
    // A list's bullet is read with the sentence opening its list.
    let dehydration = context("60234100", ContextFactor::Dehydration);
    let warning = dehydration
        .iter()
        .find(|rule| rule.section == RcpSectionKey::Warnings)
        .expect("paracetamol 4.4 dehydration");
    assert!(
        warning
            .quote
            .starts_with("Le paracétamol doit être administré avec précaution"),
        "{}",
        warning.quote
    );
    // « n'a aucun effet ou qu'un effet négligeable sur l'aptitude à conduire » gives no rule; « Toutefois… » does.
    assert!(context("60234100", ContextFactor::Driving).is_empty());
    assert!(context("68212077", ContextFactor::Driving).is_empty());
    assert_eq!(context("69094525", ContextFactor::Driving).len(), 1);
    // An excipient alcohol is not a drink; an intake not to take at bedtime is read from 4.2.
    assert!(context("66053338", ContextFactor::Alcohol).is_empty());
    assert_eq!(
        context("63281774", ContextFactor::Bedtime)[0].section,
        RcpSectionKey::Administration
    );
    // A long sentence is quoted around its words, each cut end marked.
    for rule in &rcp_part().context_rules {
        assert!(rule.quote.chars().count() <= 400, "{}", rule.quote);
    }
    // Section 4.8 stays as its rules only: no document keeps its text.
    assert!(rcp_part().documents.iter().all(|document| {
        document
            .sections
            .iter()
            .all(|section| section.section != RcpSectionKey::AdverseEffects)
    }));
}

// ---- Supplements and food ----

#[test]
fn complalim_fields_are_read_as_written() {
    let records = complalim::csv_records("a;\"b;\"\"c\"\"\nd\"\n1;2\n").expect("csv");
    assert_eq!(
        records,
        [
            vec!["a".to_string(), "b;\"c\"\nd".to_string()],
            vec!["1".to_string(), "2".to_string()]
        ]
    );
    assert!(complalim::csv_records("a;\"b\n").is_err());
}

#[test]
fn supplement_ingredients_are_read_as_their_substance() {
    let supplements: SupplementsPart = part(PartName::Supplements);
    let st_johns_wort = supplements
        .ingredients
        .iter()
        .find(|ingredient| {
            ingredient
                .name
                .to_lowercase()
                .starts_with("hypericum perforatum")
        })
        .expect("millepertuis");
    assert_eq!(st_johns_wort.substance.as_deref(), Some("millepertuis"));
    assert!(st_johns_wort.products > 0);
    let thesaurus: Vec<&str> = interactions()
        .entries
        .iter()
        .map(|entry| entry.key.as_str())
        .collect();
    for rule in &supplements.rules {
        assert!(
            !rule.text.is_empty() && !rule.source.is_empty(),
            "{}",
            rule.id
        );
        assert!(
            rule.treatments
                .iter()
                .all(|treatment| thesaurus.contains(&treatment.as_str())),
            "{}",
            rule.id
        );
    }
}

#[test]
fn a_declaration_with_a_broken_ingredient_list_is_left_out_and_named() {
    let csv = "decision;plantes;nutriments;substances;micro_organismes;autres_ingredients_actifs\n\
               \"Commercialisation possible\";\"[{\"\"nom\"\": \"\"Hypericum perforatum L.\"\"}]\";;;;\n\
               \"Commercialisation possible\";;;;\"[{\"\"genre\"\": \"\"x\\\\\"\"y\"\"}]\";\n";
    let (ingredients, malformed) = complalim::ingredients(csv, &[]).expect("read");
    assert_eq!(ingredients.len(), 1);
    assert_eq!(
        malformed,
        ["declarations.csv:3: 'micro_organismes' is not a JSON list"]
    );
}

#[test]
fn every_food_rule_cites_a_source_and_the_conditions_asked_for() {
    let food: FoodPart = part(PartName::Food);
    let sources: Vec<&str> = built()
        .manifest
        .sources
        .iter()
        .map(|source| source.id.as_str())
        .collect();
    for rule in &food.rules {
        assert!(
            sources.contains(&rule.source.as_str()),
            "{}: {}",
            rule.id,
            rule.source
        );
        assert!(
            !rule.text.is_empty() && !rule.reason.is_empty(),
            "{}",
            rule.id
        );
    }
    let conditions: Vec<&str> = food
        .conditions
        .iter()
        .map(|condition| condition.key.as_str())
        .collect();
    for key in [
        "diabetes_type_1",
        "diabetes_type_2",
        "hypertension",
        "hypercholesterolaemia",
        "coeliac_disease",
        "chronic_kidney_disease",
        "gout",
        "pregnancy",
        "treatment_avk",
        "treatment_statin",
    ] {
        assert!(conditions.contains(&key), "{key}");
        assert!(
            food.rules.iter().any(|rule| rule.condition == key),
            "a rule for {key}"
        );
    }
    assert_eq!(
        food.conditions
            .iter()
            .filter(|condition| condition.kind == ConditionKind::Allergy)
            .count(),
        14
    );
    let statin = food
        .rules
        .iter()
        .find(|rule| rule.id == "statin_grapefruit")
        .expect("statin and grapefruit");
    assert!(
        statin.text.contains("simvastatine") && statin.text.contains("déconseillée"),
        "{}",
        statin.text
    );
}

#[test]
fn a_treatment_names_its_thesaurus_classes_and_a_medicine_of_it_falls_under_them() {
    let food: FoodPart = part(PartName::Food);
    let avk = food
        .conditions
        .iter()
        .find(|condition| condition.key == "treatment_avk")
        .unwrap();
    assert_eq!(avk.thesaurus, ["antivitamines k"]);
    assert!(
        food.conditions
            .iter()
            .all(|condition| (condition.kind == ConditionKind::Treatment)
                != condition.thesaurus.is_empty())
    );
    // Coumadine's warfarin is linked to that class in the substances part.
    let substances: SubstancesPart = part(PartName::Substances);
    assert!(substances.substances.iter().any(|substance| {
        substance.name.to_lowercase().contains("warfarine")
            && substance
                .thesaurus
                .iter()
                .any(|entry| entry == "antivitamines k")
    }));
}

#[test]
fn a_scanned_product_is_a_food_by_its_open_food_facts_category() {
    let food: FoodPart = part(PartName::Food);
    let of = |tag: &str| {
        food.foods
            .iter()
            .find(|item| item.categories.iter().any(|category| category == tag))
            .map(|item| item.key.as_str())
    };
    assert_eq!(of("en:orange-juices"), Some("fruit_juice"));
    assert_eq!(of("en:oranges"), Some("whole_fruit"));
    assert_eq!(of("en:instant-mashed-potatoes"), Some("instant_starches"));
    assert!(food.sources.iter().any(|source| source == "off_categories"));
    // The juice the diabetes base advises against has, from the same source, a whole fruit to prefer.
    assert!(
        food.rules
            .iter()
            .any(|rule| rule.id == "diabetes_t2_whole_fruit"
                && rule.kind == FoodRuleKind::Prefer
                && rule.source == "ffd_boissons"
                && rule.foods == ["whole_fruit"])
    );
}
