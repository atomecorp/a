//! The bundle assembled from the sources: six parts, each one compact JSON file stored gzipped, and the manifest that lists
//! them with their hashes. The same inputs always give the same bytes and the same version.

use crate::bdpm::{self, BdpmFiles};
use crate::complalim;
use crate::curated;
use crate::model::*;
use crate::pdf_layout::Run;
use crate::posology;
use crate::rcp;
use crate::rcp_context;
use crate::rcp_profile;
use crate::text::{fold, sha256_hex};
use crate::thesaurus;
use std::collections::{BTreeMap, BTreeSet};

pub const BDPM_SOURCE: &str = "bdpm";
pub const THESAURUS_SOURCE: &str = "ansm_thesaurus";
pub const RCP_SOURCE: &str = "bdpm_rcp";
pub const COMPLALIM_SOURCE: &str = "complalim";

/// Everything one build reads.
pub struct Inputs {
    pub bdpm: BdpmFiles,
    /// The day the BDPM files were downloaded (`YYYY-MM-DD`).
    pub bdpm_retrieved: String,
    pub thesaurus_runs: Vec<Run>,
    pub thesaurus_retrieved: String,
    /// SmPC pages by CIS, with the day each was downloaded.
    pub rcp_pages: BTreeMap<String, (String, String)>,
    pub complalim_csv: String,
    /// The dataset's own date (data.gouv.fr `last_modified`) and the download day.
    pub complalim_version: String,
    pub complalim_retrieved: String,
    pub built_on: String,
}

/// A built bundle: the manifest, each part's bytes, and what the build counted on its way.
pub struct Bundle {
    pub manifest: Manifest,
    pub parts: Vec<(PartName, Vec<u8>)>,
    pub report: Vec<String>,
}

fn built_in_sources(inputs: &Inputs) -> Result<Vec<Source>, String> {
    let latest_rcp = inputs
        .rcp_pages
        .values()
        .map(|(_, retrieved)| retrieved.clone())
        .max()
        .ok_or_else(|| "no SmPC page among the sources".to_string())?;
    Ok(vec![
        Source {
            id: BDPM_SOURCE.to_string(),
            publisher: "ANSM, HAS, UNCAM".to_string(),
            title: "Base de données publique des médicaments".to_string(),
            licence: "Licence de réutilisation de la BDPM : citer la source et sa date, ne pas altérer les données".to_string(),
            url: "https://base-donnees-publique.medicaments.gouv.fr/telechargement".to_string(),
            version: Some(inputs.bdpm_retrieved.clone()),
            retrieved: inputs.bdpm_retrieved.clone(),
        },
        Source {
            id: RCP_SOURCE.to_string(),
            publisher: "ANSM".to_string(),
            title: "Résumés des caractéristiques du produit (rubriques 4.2 à 4.8), base de données publique des médicaments".to_string(),
            licence: "Licence de réutilisation de la BDPM : citer la source et sa date, ne pas altérer les données".to_string(),
            url: "https://base-donnees-publique.medicaments.gouv.fr/affichageDoc.php?typedoc=R".to_string(),
            version: None,
            retrieved: latest_rcp,
        },
        Source {
            id: THESAURUS_SOURCE.to_string(),
            publisher: "ANSM".to_string(),
            title: "Thesaurus des interactions médicamenteuses (dernière édition ; en ligne jusqu'au 15 juin 2027, le RCP de chaque médicament fait référence)".to_string(),
            licence: "Citation de la source, contenu non altéré".to_string(),
            url: "https://ansm.sante.fr/uploads/2024/06/07/20230915-thesaurus-interactions-medicamenteuses-septembre-2023.pdf".to_string(),
            version: Some("2023-09-15".to_string()),
            retrieved: inputs.thesaurus_retrieved.clone(),
        },
        Source {
            id: COMPLALIM_SOURCE.to_string(),
            publisher: "Ministère de l'Agriculture et de la Souveraineté alimentaire (DGAL)".to_string(),
            title: "Déclarations de compléments alimentaires (Compl'Alim)".to_string(),
            licence: "Licence Ouverte / Open Licence 2.0".to_string(),
            url: "https://www.data.gouv.fr/fr/datasets/declarations-de-complements-alimentaires/".to_string(),
            version: Some(inputs.complalim_version.clone()),
            retrieved: inputs.complalim_retrieved.clone(),
        },
    ])
}

/// The substances the medicines name, each linked to the thesaurus entries it falls under.
fn substances(
    medicines: &BTreeMap<String, Medicine>,
    entries: &[ThesaurusEntry],
) -> Vec<Substance> {
    let mut found: BTreeMap<String, Substance> = BTreeMap::new();
    for medicine in medicines.values() {
        let mut counted = BTreeSet::new();
        for component in &medicine.components {
            let substance = found
                .entry(component.substance.clone())
                .or_insert_with(|| Substance {
                    key: component.substance.clone(),
                    name: String::new(),
                    base: bdpm::base_name(&component.substance),
                    codes: Vec::new(),
                    thesaurus: Vec::new(),
                    medicines: 0,
                });
            if fold(&component.name) == substance.key || substance.name.is_empty() {
                substance.name = component.name.clone();
            }
            if !substance.codes.contains(&component.code) {
                substance.codes.push(component.code.clone());
            }
            if counted.insert(component.substance.clone()) {
                substance.medicines += 1;
            }
        }
    }
    let by_key: BTreeMap<&str, &ThesaurusEntry> = entries
        .iter()
        .map(|entry| (entry.key.as_str(), entry))
        .collect();
    for substance in found.values_mut() {
        let names = [substance.key.as_str(), substance.base.as_str()];
        let mut linked: Vec<String> = Vec::new();
        for name in names {
            if let Some(entry) = by_key.get(name) {
                linked.push(entry.key.clone());
                linked.extend(entry.see_also.iter().cloned());
            }
        }
        let mut classes: Vec<String> = entries
            .iter()
            .filter(|entry| {
                entry.members.iter().any(|member| {
                    names.contains(&member.as_str()) || bdpm::base_name(member) == substance.base
                })
            })
            .map(|entry| entry.key.clone())
            .collect();
        classes.sort();
        for key in classes {
            if !linked.contains(&key) {
                linked.push(key);
            }
        }
        linked.dedup();
        substance.codes.sort();
        substance.thesaurus = linked;
    }
    found.into_values().collect()
}

fn part<T: serde::Serialize>(
    name: PartName,
    value: &T,
    records: usize,
) -> Result<(PartEntry, Vec<u8>), String> {
    use std::io::Write;
    let json = serde_json::to_vec(value).map_err(|error| format!("{}: {error}", name.as_str()))?;
    // The part travels and is stored gzipped (the medicines part shrinks about sevenfold); the gzip header
    // carries no time or name, so the same JSON always gives the same file.
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::best());
    encoder
        .write_all(&json)
        .map_err(|error| format!("{}: {error}", name.as_str()))?;
    let bytes = encoder
        .finish()
        .map_err(|error| format!("{}: {error}", name.as_str()))?;
    let entry = PartEntry {
        name,
        file: format!("{}.json.gz", name.as_str()),
        bytes: bytes.len() as u64,
        sha256: sha256_hex(&json),
        json_bytes: json.len() as u64,
        records: records as u64,
    };
    Ok((entry, bytes))
}

/// The bundle of these inputs.
pub fn build(inputs: &Inputs) -> Result<Bundle, String> {
    let mut report = Vec::new();
    let parsed = bdpm::parse(&inputs.bdpm)?;
    for (file, count) in &parsed.outside {
        report.push(format!(
            "{file}: {count} rows about a CIS no longer in CIS_bdpm.txt"
        ));
    }
    let mut medicines = parsed.medicines;
    // An important information past its end date is no longer one.
    for medicine in medicines.values_mut() {
        medicine.alerts.retain(|alert| alert.to >= inputs.built_on);
    }

    let (mut entries, rules) = thesaurus::parse(&inputs.thesaurus_runs)?;
    let food = curated::food_data(&[THESAURUS_SOURCE, BDPM_SOURCE, RCP_SOURCE])?;
    let entry_keys: BTreeSet<String> = entries.iter().map(|entry| entry.key.clone()).collect();
    for (entry_key, food_key) in &food.thesaurus_foods {
        if !entry_keys.contains(entry_key) {
            return Err(format!(
                "thesaurus food '{entry_key}' is not a thesaurus entry"
            ));
        }
        if let Some(entry) = entries.iter_mut().find(|entry| &entry.key == entry_key) {
            entry.food = Some(food_key.clone());
        }
    }
    if let Some((condition, entry)) = food.conditions.iter().find_map(|condition| {
        condition
            .thesaurus
            .iter()
            .find(|entry| !entry_keys.contains(*entry))
            .map(|entry| (&condition.key, entry))
    }) {
        return Err(format!(
            "condition '{condition}': '{entry}' is not a thesaurus entry"
        ));
    }
    let substances = substances(&medicines, &entries);
    report.push(format!(
        "substances: {}, {} linked to the thesaurus",
        substances.len(),
        substances
            .iter()
            .filter(|substance| !substance.thesaurus.is_empty())
            .count()
    ));

    let patterns = rcp::Patterns::new()?;
    let dose_patterns = rcp_profile::DosePatterns::new()?;
    let mut dosages = Vec::new();
    let mut profile_rules = Vec::new();
    let mut texts: Vec<String> = Vec::new();
    let mut text_index: BTreeMap<String, u32> = BTreeMap::new();
    let mut documents = Vec::new();
    let mut intake = Vec::new();
    let mut context_rules = Vec::new();
    let mut outside_rcp = 0;
    for (cis, (html, _)) in &inputs.rcp_pages {
        if !medicines.contains_key(cis) {
            outside_rcp += 1;
            continue;
        }
        let page = rcp::parse_page(html).map_err(|error| format!("SmPC {cis}: {error}"))?;
        intake.extend(rcp::intake_rules(cis, &page, &food.foods, &patterns));
        let (page_dosages, page_rules) = rcp_profile::profile_rules(cis, &page, &dose_patterns);
        dosages.extend(page_dosages);
        profile_rules.extend(page_rules);
        context_rules.extend(rcp_context::context_rules(cis, &page));
        // Section 4.8 (the effects, a long list) is kept as its context rules only.
        let sections = page
            .sections
            .iter()
            .filter(|(section, _)| *section != RcpSectionKey::AdverseEffects)
            .map(|(section, text)| {
                let next = texts.len() as u32;
                let index = *text_index.entry(text.clone()).or_insert(next);
                if index == next {
                    texts.push(text.clone());
                }
                RcpSection {
                    section: *section,
                    text: index,
                }
            })
            .collect();
        documents.push(RcpDocument {
            cis: cis.clone(),
            updated: page.updated,
            sections,
        });
    }
    let mut with_posology = 0;
    for document in &documents {
        let Some(medicine) = medicines.get_mut(&document.cis) else {
            continue;
        };
        let doses: Vec<&DosageRule> = dosages
            .iter()
            .filter(|dose| dose.cis == document.cis)
            .collect();
        let rules: Vec<&ProfileRule> = profile_rules
            .iter()
            .filter(|rule| rule.cis == document.cis)
            .collect();
        medicine.posology = posology::posology(
            medicine,
            document.updated.as_deref(),
            &doses,
            &rules,
            &dose_patterns.population,
        );
        with_posology += usize::from(medicine.posology.is_some());
    }
    report.push(format!("SmPC: {with_posology} medicines with a posology"));
    report.push(format!(
        "SmPC: {} pages read, {} without a medicine of the base, {} distinct section texts, {} intake rules, {} doses, {} profile rules, {} context rules",
        documents.len(),
        outside_rcp,
        texts.len(),
        intake.len(),
        dosages.len(),
        profile_rules.len(),
        context_rules.len()
    ));

    let supplements = curated::supplement_data(
        &food
            .conditions
            .iter()
            .map(|condition| condition.key.as_str())
            .collect(),
    )?;
    for rule in &supplements.rules {
        if let Some(missing) = rule
            .treatments
            .iter()
            .find(|treatment| !entry_keys.contains(*treatment))
        {
            return Err(format!(
                "supplement rule '{}': '{missing}' is not a thesaurus entry",
                rule.id
            ));
        }
    }
    let (ingredients, malformed) =
        complalim::ingredients(&inputs.complalim_csv, &supplements.aliases)?;
    report.extend(
        malformed
            .into_iter()
            .map(|error| format!("left out: {error}")),
    );
    report.push(format!(
        "Compl'Alim: {} distinct active ingredients, {} read as a substance",
        ingredients.len(),
        ingredients
            .iter()
            .filter(|ingredient| ingredient.substance.is_some())
            .count()
    ));

    let mut sources = built_in_sources(inputs)?;
    sources.extend(food.sources.iter().cloned());
    sources.extend(supplements.sources.iter().cloned());

    let medicine_count = medicines.len();
    let built = [
        part(
            PartName::Medicines,
            &MedicinesPart {
                source: BDPM_SOURCE.to_string(),
                medicines: medicines.into_values().collect(),
            },
            medicine_count,
        )?,
        part(
            PartName::Substances,
            &SubstancesPart {
                source: BDPM_SOURCE.to_string(),
                substances: substances.clone(),
            },
            substances.len(),
        )?,
        part(
            PartName::Interactions,
            &InteractionsPart {
                source: THESAURUS_SOURCE.to_string(),
                entries: entries.clone(),
                rules: rules.clone(),
            },
            rules.len(),
        )?,
        part(
            PartName::Rcp,
            &RcpPart {
                source: RCP_SOURCE.to_string(),
                texts,
                documents: documents.clone(),
                rules: intake,
                profile_rules,
                dosages,
                context_rules,
            },
            documents.len(),
        )?,
        part(
            PartName::Supplements,
            &SupplementsPart {
                sources: std::iter::once(COMPLALIM_SOURCE.to_string())
                    .chain(supplements.sources.iter().map(|source| source.id.clone()))
                    .collect(),
                ingredients: ingredients.clone(),
                rules: supplements.rules.clone(),
            },
            ingredients.len(),
        )?,
        part(
            PartName::Food,
            &FoodPart {
                sources: food
                    .sources
                    .iter()
                    .map(|source| source.id.clone())
                    .collect(),
                foods: food.foods.clone(),
                conditions: food.conditions.clone(),
                rules: food.rules.clone(),
            },
            food.rules.len(),
        )?,
    ];
    let hashes: String = built
        .iter()
        .map(|(entry, _)| format!("{}:{}\n", entry.name.as_str(), entry.sha256))
        .collect();
    let manifest = Manifest {
        schema: SCHEMA_VERSION,
        version: sha256_hex(hashes.as_bytes())[..16].to_string(),
        built_on: inputs.built_on.clone(),
        sources,
        parts: built.iter().map(|(entry, _)| entry.clone()).collect(),
    };
    let parts = built
        .into_iter()
        .map(|(entry, bytes)| (entry.name, bytes))
        .collect();
    Ok(Bundle {
        manifest,
        parts,
        report,
    })
}

/// Writes the bundle under `out/<version>/` and then points `out/current` at it: a reader sees the previous
/// bundle or the new one whole, never a half-written one. The bundle that was current stays, so a device in
/// the middle of its download finishes it; older ones are removed.
pub fn write(bundle: &Bundle, out: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let io = |what: &str, error: std::io::Error| format!("{what}: {error}");
    let previous = match std::fs::read_to_string(out.join("current")) {
        Ok(version) => Some(version),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(io("current", error)),
    };
    let directory = out.join(&bundle.manifest.version);
    std::fs::create_dir_all(&directory).map_err(|error| io("bundle directory", error))?;
    for (name, bytes) in &bundle.parts {
        std::fs::write(directory.join(format!("{}.json.gz", name.as_str())), bytes)
            .map_err(|error| io(name.as_str(), error))?;
    }
    let manifest = serde_json::to_vec_pretty(&bundle.manifest)
        .map_err(|error| format!("manifest: {error}"))?;
    std::fs::write(directory.join("manifest.json"), manifest)
        .map_err(|error| io("manifest", error))?;
    let pointer = out.join("current.tmp");
    std::fs::write(&pointer, &bundle.manifest.version).map_err(|error| io("current", error))?;
    std::fs::rename(&pointer, out.join("current")).map_err(|error| io("current", error))?;
    let kept = [Some(bundle.manifest.version.as_str()), previous.as_deref()];
    for entry in std::fs::read_dir(out).map_err(|error| io("bundles", error))? {
        let entry = entry.map_err(|error| io("bundles", error))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_version = name.len() == 16 && name.bytes().all(|byte| byte.is_ascii_hexdigit());
        if is_version && entry.path().is_dir() && !kept.contains(&Some(name.as_str())) {
            std::fs::remove_dir_all(entry.path()).map_err(|error| io(&name, error))?;
        }
    }
    Ok(directory)
}
