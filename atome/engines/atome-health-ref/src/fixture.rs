//! A small real sample of a sources directory, for the crate's tests and the app's probes: the BDPM lines of
//! the medicines whose name matches, kept byte for byte in their file's own encoding; the thesaurus pages of
//! the chosen headings (a real PDF, the other pages removed); Compl'Alim declarations naming the chosen
//! ingredients; each kept medicine's SmPC page cut from its update date to the heading of section 4.9.

use crate::bdpm::FILE_NAMES;
use crate::complalim::{MARKETABLE, csv_records};
use crate::pdf_layout::pdf_runs;
use crate::sources::{
    BDPM_DIR, COMPLALIM_FILE, RCP_DIR, SourcesState, THESAURUS_FILE, read_state, write_state,
};
use crate::text::{decode_source, fold, has_words};
use std::collections::BTreeSet;
use std::path::Path;

pub struct Selection<'a> {
    /// Folded words a medicine's name starts with (« doliprane », « levothyrox »).
    pub medicines: &'a [&'a str],
    /// Thesaurus heading keys whose pages are kept.
    pub thesaurus: &'a [&'a str],
    /// Folded words a kept Compl'Alim declaration names, and how many declarations each keeps.
    pub supplements: &'a [&'a str],
    pub per_supplement: usize,
}

fn io(path: &Path, error: std::io::Error) -> String {
    format!("{}: {error}", path.display())
}

fn copy_lines(
    from: &Path,
    to: &Path,
    column: usize,
    keep: &BTreeSet<String>,
) -> Result<usize, String> {
    let bytes = std::fs::read(from).map_err(|error| io(from, error))?;
    let mut out = Vec::new();
    let mut kept = 0;
    for line in bytes.split_inclusive(|byte| *byte == b'\n') {
        // A blank line (CIS_CPD_bdpm has some) has no such column and is not kept.
        let Some(field) = line.split(|byte| *byte == b'\t').nth(column) else {
            continue;
        };
        if keep.contains(String::from_utf8_lossy(field).trim()) {
            out.extend_from_slice(line);
            kept += 1;
        }
    }
    std::fs::write(to, out).map_err(|error| io(to, error))?;
    Ok(kept)
}

fn quote(field: &str) -> String {
    format!("\"{}\"", field.replace('"', "\"\""))
}

/// Writes the sample under `to`; returns what it kept.
pub fn make(from: &Path, to: &Path, selection: &Selection<'_>) -> Result<Vec<String>, String> {
    let mut report = Vec::new();
    let bdpm_from = from.join(BDPM_DIR);
    let bdpm_to = to.join(BDPM_DIR);
    std::fs::create_dir_all(&bdpm_to).map_err(|error| io(&bdpm_to, error))?;
    let specialities_path = bdpm_from.join(FILE_NAMES[0]);
    let specialities = decode_source(
        FILE_NAMES[0],
        &std::fs::read(&specialities_path).map_err(|error| io(&specialities_path, error))?,
    )?;
    let keep: BTreeSet<String> = specialities
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\t');
            let cis = fields.next()?.trim();
            let name = fold(fields.next()?);
            selection
                .medicines
                .iter()
                .any(|word| name.starts_with(word))
                .then(|| cis.to_string())
        })
        .collect();
    for name in FILE_NAMES {
        let column = if name == "CIS_GENER_bdpm.txt" { 2 } else { 0 };
        let kept = copy_lines(&bdpm_from.join(name), &bdpm_to.join(name), column, &keep)?;
        report.push(format!("{name}: {kept} lines"));
    }

    let pdf_path = from.join(THESAURUS_FILE);
    let pdf = std::fs::read(&pdf_path).map_err(|error| io(&pdf_path, error))?;
    let headings: Vec<(u32, String)> = pdf_runs(&pdf)?
        .into_iter()
        .filter(|run| run.x < 34.0 && run.size >= 9.5 && run.y > 48.0)
        .map(|run| (run.page, fold(&run.text)))
        .collect();
    let mut pages = BTreeSet::new();
    for (index, (page, key)) in headings.iter().enumerate() {
        if selection.thesaurus.contains(&key.as_str()) {
            let last = headings.get(index + 1).map_or(*page, |(next, _)| *next);
            pages.extend(*page..=last);
        }
    }
    let mut document =
        lopdf::Document::load_mem(&pdf).map_err(|error| format!("thesaurus: {error}"))?;
    let all: Vec<u32> = document
        .get_pages()
        .keys()
        .copied()
        .filter(|page| !pages.contains(page))
        .collect();
    document.delete_pages(&all);
    document.prune_objects();
    let pdf_to = to.join(THESAURUS_FILE);
    std::fs::create_dir_all(pdf_to.parent().ok_or("thesaurus path")?)
        .map_err(|error| io(&pdf_to, error))?;
    document
        .save(&pdf_to)
        .map_err(|error| format!("{}: {error}", pdf_to.display()))?;
    report.push(format!("thesaurus: pages {pages:?}"));

    let csv_path = from.join(COMPLALIM_FILE);
    let csv = String::from_utf8(std::fs::read(&csv_path).map_err(|error| io(&csv_path, error))?)
        .map_err(|_| "Compl'Alim: not UTF-8")?;
    let records = csv_records(&csv)?;
    let (header, rows) = records.split_first().ok_or("Compl'Alim: empty")?;
    let at = |name: &str| {
        header
            .iter()
            .position(|field| field == name)
            .ok_or_else(|| format!("Compl'Alim: column '{name}' missing"))
    };
    let decision = at("decision")?;
    let ingredient_columns = [
        "plantes",
        "nutriments",
        "substances",
        "micro_organismes",
        "autres_ingredients_actifs",
    ]
    .into_iter()
    .map(at)
    .collect::<Result<Vec<_>, _>>()?;
    let mut kept_rows: BTreeSet<usize> = BTreeSet::new();
    for word in selection.supplements {
        // A marketable declaration whose own active ingredients name the word.
        let matching = rows.iter().enumerate().filter(|(_, row)| {
            row.get(decision).map(String::as_str) == Some(MARKETABLE)
                && ingredient_columns.iter().any(|column| {
                    row.get(*column)
                        .is_some_and(|field| has_words(&fold(field), word))
                })
        });
        kept_rows.extend(
            matching
                .take(selection.per_supplement)
                .map(|(index, _)| index),
        );
    }
    let mut out = String::new();
    for row in std::iter::once(header).chain(kept_rows.iter().map(|index| &rows[*index])) {
        out.push_str(
            &row.iter()
                .map(|field| quote(field))
                .collect::<Vec<_>>()
                .join(";"),
        );
        out.push('\n');
    }
    let csv_to = to.join(COMPLALIM_FILE);
    std::fs::create_dir_all(csv_to.parent().ok_or("Compl'Alim path")?)
        .map_err(|error| io(&csv_to, error))?;
    std::fs::write(&csv_to, out).map_err(|error| io(&csv_to, error))?;
    report.push(format!("Compl'Alim: {} declarations", kept_rows.len()));

    let state = read_state(from)?;
    let mut sample = SourcesState {
        rcp: Default::default(),
        ..state.clone()
    };
    std::fs::create_dir_all(to.join(RCP_DIR)).map_err(|error| io(&to.join(RCP_DIR), error))?;
    for (cis, retrieved) in state.rcp.iter().filter(|(cis, _)| keep.contains(*cis)) {
        let path = from.join(RCP_DIR).join(format!("{cis}.html"));
        let html = String::from_utf8(std::fs::read(&path).map_err(|error| io(&path, error))?)
            .map_err(|_| format!("SmPC {cis}: not UTF-8"))?;
        let start = html
            .find("Mis à jour le : ")
            .and_then(|at| html[..at].rfind('<'))
            .ok_or(format!("SmPC {cis}: no update date"))?;
        let end = html[start..]
            .match_indices("4.9. ")
            .map(|(at, _)| start + at)
            // The heading's own paragraph, not a « voir rubrique 4.9. » in a sentence.
            .find_map(|at| {
                html[..at]
                    .rfind("<p")
                    .filter(|paragraph| html[*paragraph..at].contains("AmmAnnexeTitre"))
            })
            .filter(|end| *end > start)
            .ok_or(format!("SmPC {cis}: no section 4.9"))?;
        let target = to.join(RCP_DIR).join(format!("{cis}.html"));
        std::fs::write(&target, &html[start..end]).map_err(|error| io(&target, error))?;
        sample.rcp.insert(cis.clone(), retrieved.clone());
    }
    report.push(format!("SmPC: {} pages", sample.rcp.len()));
    write_state(to, &sample)?;
    Ok(report)
}
