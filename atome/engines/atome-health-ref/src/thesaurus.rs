//! The ANSM « Thesaurus des interactions médicamenteuses » read from its PDF's positioned runs
//! (`pdf_layout.rs`). Its layout, checked on the September 2023 edition (the last: the ANSM no longer updates
//! it and keeps it online until 15 June 2027):
//! - a substance or class heading at the left margin, 10 pt;
//! - under a class, its description, « Voir aussi : … » and its members « (a, b, c) », 7 pt, slightly indented;
//! - each interaction « + PARTNER », 8 pt; then two columns: the risk and its mechanism on the left, the level
//!   (« CONTRE-INDICATION », « Association DECONSEILLEE », « Précaution d'emploi », « A prendre en compte », or
//!   their abbreviations joined by « - ») then the conduct on the right.
//!
//! A level outside that vocabulary or an interaction without a heading fails the read: the layout changed.

use crate::model::{InteractionRule, Level, ThesaurusEntry};
use crate::pdf_layout::Run;
use crate::text::{fold, squash};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Column {
    Heading,
    Plus,
    Partner,
    Note,
    Mechanism,
    Conduct,
}

fn column(run: &Run) -> Column {
    match run.x {
        x if x < 34.0 && run.size >= 9.5 => Column::Heading,
        x if x < 36.0 && run.text.trim() == "+" => Column::Plus,
        x if x < 60.0 && run.size >= 7.5 => Column::Partner,
        x if x < 60.0 => Column::Note,
        x if x < 300.0 => Column::Mechanism,
        _ => Column::Conduct,
    }
}

/// Lines of one column as one text: a line ending in a word-break hyphen joins the next without a space.
fn join(lines: &[String]) -> String {
    let mut out = String::new();
    for line in lines {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let glued = out.ends_with('-') && out.chars().rev().nth(1).is_some_and(char::is_alphabetic);
        if !out.is_empty() && !glued {
            out.push(' ');
        }
        out.push_str(line);
    }
    squash(&out)
}

/// The levels a rule's level line names, most severe first.
pub fn levels(text: &str) -> Result<Vec<Level>, String> {
    let folded = fold(text);
    let whole = match folded.as_str() {
        "contre indication" => Some(Level::Contraindication),
        "association deconseillee" => Some(Level::NotRecommended),
        "precaution d'emploi" => Some(Level::Precaution),
        "a prendre en compte" => Some(Level::ToConsider),
        _ => None,
    };
    if let Some(level) = whole {
        return Ok(vec![level]);
    }
    let mut found = BTreeSet::new();
    for word in folded.split(' ') {
        found.insert(match word {
            "ci" => Level::Contraindication,
            "asdec" => Level::NotRecommended,
            "pe" => Level::Precaution,
            "apec" => Level::ToConsider,
            _ => return Err(format!("interaction level '{text}' unknown")),
        });
    }
    Ok(found.into_iter().collect())
}

#[derive(Default)]
struct Heading {
    label: Vec<String>,
    notes: Vec<String>,
    closed: bool,
}

#[derive(Default)]
struct Pending {
    partner: Vec<String>,
    level: Option<Vec<Level>>,
    mechanism: Vec<String>,
    conduct: Vec<String>,
}

fn entry(heading: &Heading) -> ThesaurusEntry {
    let label = join(&heading.label);
    let start = heading
        .notes
        .iter()
        .rposition(|line| line.trim_start().starts_with('('));
    let (description, members) = match start {
        Some(index)
            if heading
                .notes
                .last()
                .is_some_and(|line| line.trim_end().ends_with(')')) =>
        {
            let list = join(&heading.notes[index..]);
            let inner = list.trim().trim_start_matches('(').trim_end_matches(')');
            let members = inner
                .split(',')
                .map(fold)
                .filter(|member| !member.is_empty())
                .collect();
            (&heading.notes[..index], members)
        }
        _ => (&heading.notes[..], Vec::new()),
    };
    // « Voir aussi : » names classes in lower case: a following line starting in lower case, or following a line
    // cut after a preposition, continues it.
    let mut see_also_lines: Vec<String> = Vec::new();
    let mut note = Vec::new();
    let mut in_see_also = false;
    for line in description {
        let line = line.trim();
        if let Some(classes) = line.strip_prefix("Voir aussi :") {
            see_also_lines.push(classes.to_string());
            in_see_also = true;
        } else if in_see_also
            && (line.chars().next().is_some_and(char::is_lowercase)
                || see_also_lines.last().is_some_and(|previous| {
                    let previous = previous.trim_end();
                    [
                        " du", " de", " des", " la", " le", " les", " à", " par", " et", " -",
                    ]
                    .iter()
                    .any(|end| previous.ends_with(end))
                }))
        {
            see_also_lines.push(line.to_string());
        } else {
            in_see_also = false;
            note.push(line.to_string());
        }
    }
    let see_also = join(&see_also_lines)
        .split(" - ")
        .map(fold)
        .filter(|class| !class.is_empty())
        .collect();
    let note = join(&note);
    ThesaurusEntry {
        key: fold(&label),
        label,
        members,
        see_also,
        note: if note.is_empty() { None } else { Some(note) },
        food: None,
    }
}

fn close_rule(
    pending: Option<Pending>,
    heading: &Heading,
    rules: &mut Vec<InteractionRule>,
) -> Result<(), String> {
    let Some(pending) = pending else {
        return Ok(());
    };
    let partner = join(&pending.partner);
    let Some(levels) = pending.level else {
        return Err(format!("interaction '+{partner}' has no level"));
    };
    if heading.label.is_empty() {
        return Err(format!("interaction '+{partner}' has no heading"));
    }
    rules.push(InteractionRule {
        a: fold(&join(&heading.label)),
        b: fold(&partner),
        levels,
        mechanism: join(&pending.mechanism),
        conduct: join(&pending.conduct),
    });
    Ok(())
}

/// The thesaurus's entries and rules. Each interaction is listed under both its sides: a pair stated twice with
/// the same levels is kept once.
pub fn parse(runs: &[Run]) -> Result<(Vec<ThesaurusEntry>, Vec<InteractionRule>), String> {
    let mut runs: Vec<Run> = runs.iter().filter(|run| run.y > 48.0).cloned().collect();
    // A « + » sits a point lower or higher than its partner's name: it is moved just above it.
    let partners: Vec<(u32, f64)> = runs
        .iter()
        .filter(|run| column(run) == Column::Partner)
        .map(|run| (run.page, run.y))
        .collect();
    for run in runs.iter_mut().filter(|run| column(run) == Column::Plus) {
        if let Some((_, y)) = partners
            .iter()
            .find(|(page, y)| *page == run.page && (y - run.y).abs() < 2.5)
        {
            run.y = y - 0.01;
        }
    }
    runs.sort_by(|a, b| {
        a.page
            .cmp(&b.page)
            .then(a.y.total_cmp(&b.y))
            .then(a.x.total_cmp(&b.x))
    });
    let Some(first) = runs.iter().position(|run| column(run) == Column::Heading) else {
        return Err("thesaurus: no heading found".to_string());
    };
    let mut entries = Vec::new();
    let mut rules = Vec::new();
    let mut heading = Heading::default();
    let mut pending: Option<Pending> = None;
    let mut last: Option<(u32, f64, Column)> = None;
    for run in &runs[first..] {
        let kind = column(run);
        let text = run.text.trim().to_string();
        // Runs of one column on one baseline are one line.
        let same_line = last.is_some_and(|(page, y, previous)| {
            page == run.page && (y - run.y).abs() < 1.5 && previous == kind
        });
        let push = |lines: &mut Vec<String>| match lines.last_mut() {
            Some(line) if same_line => {
                line.push(' ');
                line.push_str(&text);
            }
            _ => lines.push(text.clone()),
        };
        match kind {
            Column::Heading => {
                let continued = !heading.closed
                    && heading.notes.is_empty()
                    && pending.is_none()
                    && matches!(last, Some((_, _, Column::Heading)));
                if continued {
                    push(&mut heading.label);
                } else {
                    close_rule(pending.take(), &heading, &mut rules)?;
                    if !heading.label.is_empty() {
                        entries.push(entry(&heading));
                    }
                    heading = Heading {
                        label: vec![text.clone()],
                        ..Heading::default()
                    };
                }
            }
            Column::Plus => {
                close_rule(pending.take(), &heading, &mut rules)?;
                heading.closed = true;
                pending = Some(Pending::default());
            }
            Column::Partner => match pending.as_mut() {
                Some(rule) if rule.level.is_none() && rule.mechanism.is_empty() => {
                    push(&mut rule.partner)
                }
                _ => {
                    return Err(format!(
                        "thesaurus page {}: partner text '{text}' outside an interaction",
                        run.page
                    ));
                }
            },
            Column::Note => push(&mut heading.notes),
            Column::Mechanism => match pending.as_mut() {
                Some(rule) => push(&mut rule.mechanism),
                None => push(&mut heading.notes),
            },
            Column::Conduct => match pending.as_mut() {
                Some(rule) if rule.level.is_none() => {
                    rule.level = Some(
                        levels(&text)
                            .map_err(|error| format!("thesaurus page {}: {error}", run.page))?,
                    )
                }
                Some(rule) => push(&mut rule.conduct),
                None => push(&mut heading.notes),
            },
        }
        last = Some((run.page, run.y, kind));
    }
    close_rule(pending.take(), &heading, &mut rules)?;
    if !heading.label.is_empty() {
        entries.push(entry(&heading));
    }
    // « +AUTRES X » (or « +X AUTRES ») under a member of class X names the class.
    let keys: BTreeSet<String> = entries
        .iter()
        .map(|entry: &ThesaurusEntry| entry.key.clone())
        .collect();
    for rule in rules.iter_mut().filter(|rule| !keys.contains(&rule.b)) {
        let class = rule
            .b
            .strip_prefix("autres ")
            .or_else(|| rule.b.strip_suffix(" autres"));
        if let Some(class) = class.filter(|class| keys.contains(*class)) {
            rule.b = class.to_string();
        }
    }
    let mut seen = BTreeSet::new();
    rules.retain(|rule| {
        let pair = if rule.a <= rule.b {
            (rule.a.clone(), rule.b.clone())
        } else {
            (rule.b.clone(), rule.a.clone())
        };
        seen.insert((pair, rule.levels.clone()))
    });
    Ok((entries, rules))
}
