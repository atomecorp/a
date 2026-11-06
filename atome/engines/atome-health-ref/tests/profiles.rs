// The rules on the person's parameters: the criteria's three-valued evaluation (the same cases the contract's JS
// evaluator is checked on), the SmPC sentences read as profile rules and doses, and the posology eVe reads.

mod support;

use atome_health_ref::criteria::{self, Truth};
use atome_health_ref::model::*;
use support::*;

#[derive(serde::Deserialize)]
struct Case {
    name: String,
    criteria: Vec<Criterion>,
    profile: serde_json::Value,
    expected: Truth,
}

#[test]
fn criteria_are_true_false_or_unknown_never_assumed() {
    let text = std::fs::read_to_string(crate_dir().join("fixtures/criteria_cases.json")).unwrap();
    let cases: Vec<Case> = serde_json::from_str(&text).unwrap();
    assert!(cases.len() >= 16);
    for case in cases {
        let mut profile = case.profile;
        profile
            .as_object_mut()
            .unwrap()
            .entry("labs")
            .or_insert(serde_json::json!([]));
        let profile: HealthProfile = serde_json::from_value(profile).unwrap();
        assert_eq!(
            criteria::evaluate(&case.criteria, &profile),
            case.expected,
            "{}",
            case.name
        );
    }
}

#[test]
fn every_lab_has_its_unit_and_loinc_code() {
    for value in LabKey::VALUES {
        let key: LabKey = serde_json::from_value(serde_json::json!(value)).unwrap();
        assert!(
            criteria::LABS
                .iter()
                .any(|(lab, unit, loinc)| *lab == key && !unit.is_empty() && loinc.contains('-')),
            "{value}"
        );
    }
}

fn medicine(cis: &str) -> &'static Medicine {
    medicines()
        .medicines
        .iter()
        .find(|medicine| medicine.cis == cis)
        .unwrap_or_else(|| panic!("{cis}"))
}

fn rules(cis: &str) -> Vec<&'static PosologyRule> {
    medicine(cis)
        .posology
        .as_ref()
        .unwrap_or_else(|| panic!("{cis} has no posology"))
        .rules
        .iter()
        .collect()
}

fn bound(bound: &Option<Bound>) -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>) {
    bound.as_ref().map_or((None, None, None, None), |bound| {
        (bound.min, bound.max, bound.above, bound.below)
    })
}

#[test]
fn a_contra_indication_is_read_with_its_population() {
    let metformin: Vec<&ProfileRule> = rcp_part()
        .profile_rules
        .iter()
        .filter(|rule| rule.cis == "67346461" && rule.section == RcpSectionKey::Contraindications)
        .collect();
    assert!(
        metformin
            .iter()
            .any(|rule| rule.effect == RuleEffect::Contraindication
                && rule.criteria.len() == 1
                && rule.criteria[0].parameter == ProfileParameter::Gfr
                && rule.criteria[0].comparison == Comparison::Lt
                && rule.criteria[0].value == Some(30.0)
                && rule.quote.contains("DFG < 30"))
    );
}

#[test]
fn an_infant_dose_is_read_by_weight_band() {
    let dose = rcp_part()
        .dosages
        .iter()
        .find(|dose| dose.cis == "66057393" && dose.quote.contains("5 à 8 kg"))
        .expect("5 to 8 kg");
    assert_eq!(
        (dose.amount, dose.unit.as_deref()),
        (Some(100.0), Some("mg"))
    );
    assert_eq!(
        (dose.max_daily, dose.max_daily_unit.as_deref()),
        (Some(4.0), Some("suppositoire"))
    );
    assert!(dose.criteria.iter().any(|criterion| criterion.parameter
        == ProfileParameter::WeightKg
        && criterion.comparison == Comparison::Between
        && (criterion.value, criterion.upper) == (Some(5.0), Some(8.0))));
}

#[test]
fn paracetamol_1000_suits_from_50_kg_one_tablet_three_a_day() {
    let doliprane = rules("60234100");
    let unsuited = doliprane[0];
    assert_eq!(unsuited.per_intake, None);
    assert_eq!(
        bound(&unsuited.when.weight_kg),
        (None, None, None, Some(50.0))
    );
    let adult = doliprane
        .iter()
        .find(|rule| rule.per_intake.is_some())
        .unwrap();
    assert_eq!(bound(&adult.when.weight_kg), (Some(50.0), None, None, None));
    assert_eq!(
        (adult.per_intake, adult.max_per_day, adult.as_needed),
        (Some(1.0), Some(3.0), true)
    );
    assert_eq!(adult.section, RcpSectionKey::Administration);
    assert!(
        adult
            .quote
            .starts_with("Adulte et enfant à partir de 50 kg")
    );
    // « Ne doit pas dépasser 2000 mg/jour » is a ceiling, not a dose of two tablets.
    assert!(doliprane.iter().all(|rule| rule.per_intake != Some(2.0)));
    assert!(
        medicine("60234100")
            .posology
            .as_ref()
            .unwrap()
            .source
            .contains("mis à jour le")
    );
}

#[test]
fn phloroglucinol_tablets_two_for_an_adult_none_under_six() {
    let spasfon = rules("68081368");
    let under_six = spasfon
        .iter()
        .find(|rule| rule.per_intake.is_none() && rule.when.age_years.is_some())
        .unwrap();
    assert_eq!(
        bound(&under_six.when.age_years),
        (None, None, None, Some(6.0))
    );
    let adult = spasfon
        .iter()
        .find(|rule| bound(&rule.when.age_years).0 == Some(18.0))
        .unwrap();
    assert_eq!(
        (adult.per_intake, adult.max_per_day, adult.as_needed),
        (Some(2.0), Some(6.0), true)
    );
    let child = spasfon
        .iter()
        .find(|rule| bound(&rule.when.age_years).3 == Some(18.0) && rule.per_intake.is_some())
        .unwrap();
    assert_eq!(
        (child.per_intake, child.max_per_day),
        (Some(1.0), Some(2.0))
    );
}

#[test]
fn a_sentence_about_an_association_withholds_nothing() {
    // « L'association … à un antithyroïdien … n'est pas indiquée en cas de grossesse »: levothyroxine itself is
    // not withheld from a pregnant woman.
    for cis in ["62080626", "68416845"] {
        assert!(
            medicine(cis)
                .posology
                .as_ref()
                .is_none_or(|posology| posology
                    .rules
                    .iter()
                    .all(|rule| rule.when.pregnant.is_none())),
            "{cis}"
        );
    }
}

#[test]
fn every_posology_rule_is_quoted_and_every_tablet_count_is_whole_or_half() {
    let mut seen = 0;
    for medicine in &medicines().medicines {
        let Some(posology) = &medicine.posology else {
            continue;
        };
        assert!(!posology.rules.is_empty(), "{}", medicine.cis);
        for rule in &posology.rules {
            seen += 1;
            assert!(!rule.quote.is_empty());
            for count in [rule.per_intake, rule.max_per_day].into_iter().flatten() {
                assert!(
                    count > 0.0 && (count * 2.0).fract() == 0.0,
                    "{}: {count}",
                    medicine.cis
                );
            }
            if let (Some(intake), Some(day)) = (rule.per_intake, rule.max_per_day) {
                assert!(intake <= day, "{}: {intake} > {day}", medicine.cis);
            }
        }
    }
    assert!(seen >= 20, "{seen}");
}
