// The public sources as read from the fixture sample: the BDPM files, the thesaurus PDF and the
// sources directory itself.

mod support;

use atome_health_ref::bdpm::{self, BdpmFiles};
use atome_health_ref::model::*;
use atome_health_ref::{pdf_layout, sources, thesaurus};
use std::path::Path;
use support::*;

// ---- BDPM ----

fn presentation_by_cip13(cip13: &str) -> (&'static Medicine, &'static Presentation) {
    medicines()
        .medicines
        .iter()
        .find_map(|medicine| {
            medicine
                .presentations
                .iter()
                .find(|presentation| presentation.cip13 == cip13)
                .map(|presentation| (medicine, presentation))
        })
        .unwrap_or_else(|| panic!("no presentation {cip13}"))
}

#[test]
fn a_scanned_cip13_finds_its_medicine_dosage_and_substance() {
    let (medicine, presentation) = presentation_by_cip13("3400930065891");
    assert_eq!(medicine.cis, "68416845");
    assert_eq!(
        medicine.name,
        "LEVOTHYROX 100 microgrammes, comprimé sécable"
    );
    assert_eq!(medicine.form, "comprimé sécable");
    assert_eq!(medicine.routes, ["orale"]);
    assert_eq!(presentation.cip7, "3006589");
    assert_eq!(
        presentation.label,
        "plaquette(s) PVC aluminium de 30 comprimé(s)"
    );
    // The medicine's own price, before the pharmacist's fee (1,96 €; 2,98 € with it).
    assert_eq!(presentation.price_cents, Some(196));
    assert_eq!(presentation.reimbursement, ["65%"]);
    let active: Vec<&Component> = medicine
        .components
        .iter()
        .filter(|component| component.nature == ComponentNature::Active)
        .collect();
    assert!(!active.is_empty());
    assert!(
        medicine
            .components
            .iter()
            .all(|component| component.substance == "levothyroxine"),
        "{:?}",
        medicine.components
    );
}

#[test]
fn the_sample_holds_the_medicines_asked_for() {
    for prefix in [
        "DOLIPRANE",
        "LEVOTHYROX",
        "AMOXICILLINE",
        "ATORVASTATINE",
        "TARDYFERON",
        "CACIT",
        "PYOSTACINE",
        "COUMADINE",
        "PREVISCAN",
        "SINTROM",
    ] {
        assert!(
            medicines()
                .medicines
                .iter()
                .any(|medicine| medicine.name.starts_with(prefix)),
            "{prefix}"
        );
    }
    let lasilix = medicines()
        .medicines
        .iter()
        .find(|medicine| medicine.cis == "65606743")
        .expect("LASILIX 40 mg");
    assert!(
        lasilix.name.starts_with("LASILIX 40 mg"),
        "{}",
        lasilix.name
    );
    assert!(
        lasilix
            .availability
            .iter()
            .any(|notice| notice.status == AvailabilityStatus::Tension),
        "the supply notice of Lasilix: {:?}",
        lasilix.availability
    );
    // Every alert kept is still current on the build day.
    assert!(
        medicines()
            .medicines
            .iter()
            .flat_map(|medicine| &medicine.alerts)
            .all(|alert| alert.to >= built_on())
    );
}

fn bdpm_files() -> BdpmFiles {
    sources::read_bdpm(&fixture_sources()).expect("fixture BDPM")
}

#[test]
fn a_bdpm_row_with_a_missing_field_is_refused() {
    let mut files = bdpm_files();
    let first = files
        .specialities
        .lines()
        .next()
        .expect("a row")
        .to_string();
    let cut = first.rsplit_once('\t').expect("tabs").0.to_string();
    files.specialities = files.specialities.replacen(&first, &cut, 1);
    let error = bdpm::parse(&files).err().expect("a short row fails");
    assert!(error.contains("CIS_bdpm.txt"), "{error}");
}

#[test]
fn a_cip13_with_a_wrong_check_digit_is_refused() {
    let mut files = bdpm_files();
    files.presentations = files
        .presentations
        .replacen("3400930065891", "3400930065892", 1);
    let error = bdpm::parse(&files).err().expect("a bad check digit fails");
    assert!(error.contains("3400930065892"), "{error}");
    assert!(!atome_health_ref::text::gtin_valid("3400930065892"));
    assert!(atome_health_ref::text::gtin_valid("3400930065891"));
}

#[test]
fn a_salt_is_read_as_its_base_for_the_thesaurus() {
    assert_eq!(bdpm::base_name("warfarine sodique"), "warfarine");
    let substances: SubstancesPart = part(PartName::Substances);
    let levothyroxine = substances
        .substances
        .iter()
        .find(|substance| substance.key == "levothyroxine")
        .expect("levothyroxine");
    assert!(
        levothyroxine
            .thesaurus
            .iter()
            .any(|key| key == "hormones thyroidiennes"),
        "{:?}",
        levothyroxine.thesaurus
    );
}

// ---- The thesaurus ----

#[test]
fn the_thesaurus_pages_give_their_rules() {
    let avk_pristinamycine = rule("antivitamines k", "pristinamycine");
    assert_eq!(avk_pristinamycine.levels, [Level::Precaution]);
    assert!(
        avk_pristinamycine.conduct.contains("INR"),
        "{}",
        avk_pristinamycine.conduct
    );
    assert_eq!(
        rule("atorvastatine", "pamplemousse jus et fruit").levels,
        [Level::ToConsider]
    );
    assert_eq!(
        rule("simvastatine", "pamplemousse jus et fruit").levels,
        [Level::NotRecommended]
    );
    let iron = rule("fer", "hormones thyroidiennes");
    assert_eq!(iron.levels, [Level::Precaution]);
    assert!(iron.conduct.contains("2 heures"), "{}", iron.conduct);
    let avk = interactions()
        .entries
        .iter()
        .find(|entry| entry.key == "antivitamines k")
        .expect("AVK class");
    assert_eq!(avk.members, ["acenocoumarol", "fluindione", "warfarine"]);
    let grapefruit = interactions()
        .entries
        .iter()
        .find(|entry| entry.key == "pamplemousse jus et fruit")
        .expect("grapefruit");
    assert_eq!(grapefruit.food.as_deref(), Some("grapefruit"));
}

#[test]
fn the_thesaurus_levels_are_read_whole_or_refused() {
    assert_eq!(
        thesaurus::levels("CI - ASDEC").expect("two levels"),
        [Level::Contraindication, Level::NotRecommended]
    );
    assert_eq!(
        thesaurus::levels("Précaution d'emploi").expect("one level"),
        [Level::Precaution]
    );
    assert!(thesaurus::levels("Peut-être").is_err());
}

#[test]
fn the_pdf_runs_keep_their_positions() {
    let runs = pdf_layout::pdf_runs(
        &std::fs::read(fixture_sources().join(sources::THESAURUS_FILE)).expect("pdf"),
    )
    .expect("runs");
    let heading = runs
        .iter()
        .find(|run| run.text.trim() == "ANTIVITAMINES K")
        .expect("the AVK heading");
    assert!(heading.x < 34.0 && heading.size >= 9.5, "{heading:?}");
    assert!(
        runs.iter()
            .any(|run| run.text.trim() == "+" && run.x < 36.0)
    );
    assert!(pdf_layout::pdf_runs(b"not a pdf").is_err());
}

#[test]
fn the_sources_state_refuses_a_missing_retrieval_day() {
    let dir = crate_dir().join("../../../temp/atome_health_ref_state_test");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("dir");
    sources::write_state(&dir, &sources::SourcesState::default()).expect("state");
    let error = sources::read_inputs(Path::new(&dir), "2026-11-05")
        .err()
        .expect("no BDPM");
    assert!(error.contains("CIS_bdpm.txt"), "{error}");
    std::fs::remove_dir_all(&dir).expect("cleanup");
}
