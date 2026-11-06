//! The BDPM files (ANSM, HAS, UNCAM; « Contenu et format des fichiers téléchargeables dans la BDM v5 », 13 Oct.
//! 2026): tab-separated, no header, one record a line. Every line is checked against the documented layout; a
//! field count, a code or a date that does not match fails the import with its file and line, never skipped.

use crate::model::{
    Alert, Availability, AvailabilityStatus, Component, ComponentNature, GenericKind, GenericLink,
    Medicine, Presentation,
};
use crate::text::{fold, french_date, gtin_valid, html_text, iso_date};
use std::collections::BTreeMap;

/// The decoded texts of the files one build reads, by their BDPM names.
pub struct BdpmFiles {
    pub specialities: String,
    pub presentations: String,
    pub compositions: String,
    pub generics: String,
    pub conditions: String,
    pub important: String,
    pub availability: String,
}

pub const FILE_NAMES: [&str; 7] = [
    "CIS_bdpm.txt",
    "CIS_CIP_bdpm.txt",
    "CIS_COMPO_bdpm.txt",
    "CIS_GENER_bdpm.txt",
    "CIS_CPD_bdpm.txt",
    "CIS_InfoImportantes.txt",
    "CIS_CIP_Dispo_Spec.txt",
];

/// The rows of a file with their line numbers: empty lines carry no record.
fn rows<'a>(
    file: &'a str,
    text: &'a str,
    width: usize,
) -> impl Iterator<Item = Result<(usize, Vec<&'a str>), String>> + 'a {
    text.split('\n')
        .enumerate()
        .filter_map(move |(index, line)| {
            let line = line.strip_suffix('\r').unwrap_or(line);
            if line.trim().is_empty() {
                return None;
            }
            let fields: Vec<&str> = line.split('\t').map(str::trim).collect();
            Some(if fields.len() == width {
                Ok((index + 1, fields))
            } else {
                Err(format!(
                    "{file}:{}: {} fields, {width} expected",
                    index + 1,
                    fields.len()
                ))
            })
        })
}

fn digits(
    file: &str,
    line: usize,
    what: &str,
    value: &str,
    length: usize,
) -> Result<String, String> {
    if value.len() == length && value.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(value.to_string())
    } else {
        Err(format!(
            "{file}:{line}: {what} '{value}' is not {length} digits"
        ))
    }
}

fn at<T>(file: &str, line: usize, result: Result<T, String>) -> Result<T, String> {
    result.map_err(|error| format!("{file}:{line}: {error}"))
}

fn list(field: &str) -> Vec<String> {
    field
        .split(';')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

/// A price in euros in cents: the last comma is the decimal one, an earlier one groups thousands (« 24,34 »,
/// « 1,466,29 »).
fn cents(file: &str, line: usize, field: &str) -> Result<Option<u32>, String> {
    if field.is_empty() {
        return Ok(None);
    }
    let plain: String = field
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '\u{a0}')
        .collect();
    let (units, decimals) = plain.rsplit_once(',').unwrap_or((plain.as_str(), ""));
    let units = units.replace(',', "");
    let decimals = format!("{decimals:0<2}");
    let valid = !units.is_empty()
        && units.bytes().all(|byte| byte.is_ascii_digit())
        && decimals.bytes().all(|byte| byte.is_ascii_digit());
    if !valid {
        return Err(format!("{file}:{line}: price '{field}' unreadable"));
    }
    let value: u64 = format!("{units}{}", &decimals[..2])
        .parse()
        .map_err(|_| format!("{file}:{line}: price '{field}' unreadable"))?;
    u32::try_from(value)
        .map(Some)
        .map_err(|_| format!("{file}:{line}: price '{field}' too large"))
}

fn generic_kind(file: &str, line: usize, field: &str) -> Result<GenericKind, String> {
    Ok(match field {
        "0" => GenericKind::Princeps,
        "1" => GenericKind::Generic,
        "2" => GenericKind::Complementary,
        "4" => GenericKind::Substitutable,
        _ => return Err(format!("{file}:{line}: generic type '{field}' unknown")),
    })
}

fn availability_status(file: &str, line: usize, field: &str) -> Result<AvailabilityStatus, String> {
    Ok(match field {
        "1" => AvailabilityStatus::Shortage,
        "2" => AvailabilityStatus::Tension,
        "3" => AvailabilityStatus::Discontinued,
        "4" => AvailabilityStatus::Restored,
        _ => {
            return Err(format!(
                "{file}:{line}: availability status '{field}' unknown"
            ));
        }
    })
}

/// The link of an important information's text (« <a … href='URL'>text</a> »).
fn href(html: &str) -> Option<String> {
    let start = html.find("href=")? + 5;
    let quote = html[start..].chars().next()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let rest = &html[start + 1..];
    rest.find(quote).map(|end| rest[..end].to_string())
}

/// What a parse read: the medicines by CIS, and per file the rows about a CIS that CIS_bdpm.txt no longer lists.
/// CIS_bdpm.txt holds the medicines marketed or stopped for less than two years (format v5, §3.1), while the
/// generic groups, the important information and the availability notices keep older ones: those rows describe
/// no medicine of the base and are counted, not read.
pub struct Parsed {
    pub medicines: BTreeMap<String, Medicine>,
    pub outside: BTreeMap<&'static str, usize>,
}

/// The base's medicines, by CIS, with their compositions, presentations, generic group, conditions, important
/// information and availability notices. `substance` of each component is its key (`link_substances`).
pub fn parse(files: &BdpmFiles) -> Result<Parsed, String> {
    let mut medicines = BTreeMap::new();
    let mut outside: BTreeMap<&'static str, usize> = BTreeMap::new();
    let file: &'static str = FILE_NAMES[0];
    for row in rows(file, &files.specialities, 12) {
        let (line, f) = row?;
        let cis = digits(file, line, "CIS", f[0], 8)?;
        let marketed = match f[6] {
            "Commercialisée" => true,
            "Non commercialisée" => false,
            other => return Err(format!("{file}:{line}: marketing state '{other}' unknown")),
        };
        let reinforced_monitoring = match f[11] {
            "Oui" => true,
            "Non" => false,
            other => {
                return Err(format!(
                    "{file}:{line}: reinforced monitoring '{other}' unknown"
                ));
            }
        };
        let medicine = Medicine {
            cis: cis.clone(),
            name: f[1].to_string(),
            form: f[2].to_string(),
            routes: list(f[3]),
            authorisation: f[4].to_string(),
            procedure: f[5].to_string(),
            marketed,
            authorised_on: at(file, line, french_date(f[7]))?,
            holders: list(f[10]),
            reinforced_monitoring,
            components: Vec::new(),
            generic: None,
            conditions: Vec::new(),
            alerts: Vec::new(),
            availability: Vec::new(),
            presentations: Vec::new(),
            posology: None,
        };
        if medicines.insert(cis, medicine).is_some() {
            return Err(format!("{file}:{line}: CIS listed twice"));
        }
    }

    let file: &'static str = FILE_NAMES[1];
    for row in rows(file, &files.presentations, 13) {
        let (line, f) = row?;
        let cip13 = digits(file, line, "CIP13", f[6], 13)?;
        if !gtin_valid(&cip13) {
            return Err(format!(
                "{file}:{line}: CIP13 {cip13} fails its check digit"
            ));
        }
        let presentation = Presentation {
            cip7: digits(file, line, "CIP7", f[1], 7)?,
            cip13,
            label: f[2].to_string(),
            status: f[3].to_string(),
            marketed: f[4] == "Déclaration de commercialisation",
            marketed_on: at(file, line, french_date(f[5]))?,
            reimbursement: list(f[8]),
            price_cents: cents(file, line, f[9])?,
        };
        match medicines.get_mut(f[0]) {
            Some(medicine) => medicine.presentations.push(presentation),
            None => *outside.entry(file).or_default() += 1,
        }
    }

    let file: &'static str = FILE_NAMES[2];
    for row in rows(file, &files.compositions, 8) {
        let (line, f) = row?;
        let nature = match f[6] {
            "SA" => ComponentNature::Active,
            "FT" => ComponentNature::Fraction,
            other => return Err(format!("{file}:{line}: component nature '{other}' unknown")),
        };
        let link = f[7]
            .parse::<u32>()
            .map_err(|_| format!("{file}:{line}: link '{}' is not a number", f[7]))?;
        let component = Component {
            element: f[1].to_string(),
            code: digits(file, line, "substance code", f[2], 5)?,
            name: f[3].to_string(),
            dosage: f[4].to_string(),
            reference: f[5].to_string(),
            nature,
            link,
            substance: String::new(),
        };
        match medicines.get_mut(f[0]) {
            Some(medicine) => medicine.components.push(component),
            None => *outside.entry(file).or_default() += 1,
        }
    }
    for medicine in medicines.values_mut() {
        link_substances(&mut medicine.components);
    }

    let file: &'static str = FILE_NAMES[3];
    for row in rows(file, &files.generics, 5) {
        let (line, f) = row?;
        let group = f[0]
            .parse::<u32>()
            .map_err(|_| format!("{file}:{line}: group '{}' is not a number", f[0]))?;
        let generic = GenericLink {
            group,
            label: f[1].to_string(),
            kind: generic_kind(file, line, f[3])?,
        };
        match medicines.get_mut(f[2]) {
            Some(medicine) => medicine.generic = Some(generic),
            None => *outside.entry(file).or_default() += 1,
        }
    }

    let file: &'static str = FILE_NAMES[4];
    for row in rows(file, &files.conditions, 2) {
        let (_, f) = row?;
        match medicines.get_mut(f[0]) {
            Some(medicine) => medicine.conditions.push(f[1].to_string()),
            None => *outside.entry(file).or_default() += 1,
        }
    }

    let file: &'static str = FILE_NAMES[5];
    for row in rows(file, &files.important, 4) {
        let (line, f) = row?;
        let alert = Alert {
            from: at(file, line, iso_date(f[1]))?,
            to: at(file, line, iso_date(f[2]))?,
            text: html_text(f[3]),
            url: href(f[3]),
        };
        match medicines.get_mut(f[0]) {
            Some(medicine) => medicine.alerts.push(alert),
            None => *outside.entry(file).or_default() += 1,
        }
    }

    let file: &'static str = FILE_NAMES[6];
    for row in rows(file, &files.availability, 8) {
        let (line, f) = row?;
        let cip13 = if f[1].is_empty() {
            None
        } else {
            Some(digits(file, line, "CIP13", f[1], 13)?)
        };
        let notice = Availability {
            cip13,
            status: availability_status(file, line, f[2])?,
            from: at(file, line, french_date(f[4]))?,
            updated: at(file, line, french_date(f[5]))?,
            restored: at(file, line, french_date(f[6]))?,
            url: f[7].to_string(),
        };
        match medicines.get_mut(f[0]) {
            Some(medicine) => medicine.availability.push(notice),
            None => *outside.entry(file).or_default() += 1,
        }
    }
    Ok(Parsed { medicines, outside })
}

/// Each component's substance key: the therapeutic fraction of its link when the base gives one (« FER » for
/// « FERREUX (SULFATE) DESSÉCHÉ »), else its own active substance.
fn link_substances(components: &mut [Component]) {
    let fractions: BTreeMap<(String, u32), String> = components
        .iter()
        .filter(|component| component.nature == ComponentNature::Fraction)
        .map(|component| {
            (
                (component.element.clone(), component.link),
                fold(&component.name),
            )
        })
        .collect();
    for component in components.iter_mut() {
        component.substance = fractions
            .get(&(component.element.clone(), component.link))
            .cloned()
            .unwrap_or_else(|| fold(&component.name));
    }
}

/// Salt, ester and hydrate words a substance name carries around its active moiety.
const SALT_WORDS: &[&str] = &[
    "sodique",
    "disodique",
    "monosodique",
    "potassique",
    "dipotassique",
    "calcique",
    "magnesique",
    "chlorhydrate",
    "dichlorhydrate",
    "bromhydrate",
    "sulfate",
    "maleate",
    "fumarate",
    "hemifumarate",
    "tartrate",
    "succinate",
    "mesilate",
    "besilate",
    "acetate",
    "phosphate",
    "monohydrate",
    "monohydratee",
    "dihydrate",
    "dihydratee",
    "trihydrate",
    "trihydratee",
    "hemihydrate",
    "hemihydratee",
    "sesquihydrate",
    "anhydre",
    "hydrate",
    "hydratee",
    "dessechee",
];

/// A substance key without its salt and hydrate words (« warfarine sodique » → « warfarine »).
pub fn base_name(key: &str) -> String {
    let mut kept: Vec<&str> = Vec::new();
    let mut dropped = false;
    for word in key.split(' ') {
        if SALT_WORDS.contains(&word) {
            dropped = true;
            continue;
        }
        if dropped && (word == "de" || word == "d") {
            dropped = false;
            continue;
        }
        dropped = false;
        kept.push(word);
    }
    if kept.is_empty() {
        key.to_string()
    } else {
        kept.join(" ")
    }
}
