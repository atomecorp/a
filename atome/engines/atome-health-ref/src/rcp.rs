//! The SmPC (RCP) of a medicine as the BDPM site shows it (`affichageDoc.php?specid=CIS&typedoc=R`): its
//! sections 4.2 to 4.8 as plain text, and the intake rules a sentence states in so many words — fasting, with a
//! meal, a spacing in hours from a medicine or a food, a food to avoid. A sentence that says less gives no rule:
//! its text stays for display, never guessed into one.
//!
//! The pages' anchors vary from one SmPC to the next; their section headings do not: every section starts at a
//! `AmmAnnexeTitre1` or `AmmAnnexeTitre2` paragraph whose text begins with its number (« 4.5. Interactions … »).

use crate::model::{Food, IntakeKind, IntakeRule, RcpSectionKey};
use crate::text::{fold, fold_measures, french_date, has_words, html_text};
use regex::Regex;

/// The sections of one SmPC page, with the date the page says it was updated.
pub struct RcpPage {
    pub updated: Option<String>,
    pub sections: Vec<(RcpSectionKey, String)>,
}

fn section_key(heading: &str) -> Option<RcpSectionKey> {
    let number = heading.split_whitespace().next()?.trim_end_matches('.');
    match number {
        "4.2" => Some(RcpSectionKey::Administration),
        "4.3" => Some(RcpSectionKey::Contraindications),
        "4.4" => Some(RcpSectionKey::Warnings),
        "4.5" => Some(RcpSectionKey::Interactions),
        "4.6" => Some(RcpSectionKey::Pregnancy),
        "4.7" => Some(RcpSectionKey::Driving),
        "4.8" => Some(RcpSectionKey::AdverseEffects),
        _ => None,
    }
}

/// The start of every section heading paragraph, with its heading text and the end of the paragraph.
fn headings(html: &str) -> Vec<(usize, usize, String)> {
    let mut found = Vec::new();
    let mut from = 0;
    while let Some(offset) = html[from..].find("AmmAnnexeTitre") {
        let at = from + offset;
        from = at + 14;
        let level = html.as_bytes().get(at + 14).copied();
        let next = html.as_bytes().get(at + 15).copied();
        if !matches!(level, Some(b'1' | b'2')) || next.is_some_and(|byte| byte.is_ascii_digit()) {
            continue;
        }
        let (Some(start), Some(end)) = (
            html[..at].rfind("<p"),
            html[at..].find("</p>").map(|end| at + end + 4),
        ) else {
            continue;
        };
        found.push((start, end, html_text(&html[start..end])));
    }
    found
}

/// The page's sections 4.2–4.8. A page without any of them (a SmPC published as a scanned document) gives none.
pub fn parse_page(html: &str) -> Result<RcpPage, String> {
    let updated = match html.find("Mis à jour le : ") {
        Some(at) => french_date(
            html[at + 17..]
                .get(..10)
                .ok_or("SmPC: the update date is cut short")?,
        )?,
        None => None,
    };
    let headings = headings(html);
    let mut sections = Vec::new();
    for (index, (_, end, heading)) in headings.iter().enumerate() {
        let Some(key) = section_key(heading) else {
            continue;
        };
        let stop = headings
            .get(index + 1)
            .map_or(html.len(), |(start, _, _)| *start);
        let body = html_text(&html[*end..stop]);
        if !body.is_empty() {
            sections.push((key, body));
        }
    }
    Ok(RcpPage { updated, sections })
}

/// The intake sentence patterns, compiled once per build.
pub struct Patterns {
    hours: Regex,
    minutes: Regex,
    fasting: Regex,
    instruction: Regex,
    meal: Regex,
    spacing: Regex,
    avoid: Regex,
}

impl Patterns {
    pub fn new() -> Result<Self, String> {
        let compile =
            |pattern: &str| Regex::new(pattern).map_err(|error| format!("intake pattern: {error}"));
        Ok(Self {
            hours: compile(r"(\d+(?:\.\d+)?)\s*(?:heures?|h)\b")?,
            minutes: compile(r"(\d+)\s*min(?:utes?)?\b")?,
            fasting: compile(r"\ba jeun\b")?,
            instruction: compile(
                r"\b(?:prendre|a prendre|pris|prise|prises|administr\w*|avaler|avale\w*)\b",
            )?,
            meal: compile(
                r"\b(?:au cours d(?:'un|es|u) repas|pendant (?:le|les) repas|avec (?:un|le|les|des) repas|au moment des repas|en mangeant)\b",
            )?,
            spacing: compile(
                r"\b(?:a distance|distance d|intervalle|espacer|espacees?|ecart|avant ou apres|apres ou avant|au moins|plus de)\b",
            )?,
            avoid: compile(
                r"\b(?:eviter|evitez|deconseill\w*|contre indiqu\w*|ne pas (?:consommer|boire|prendre)|a proscrire|ne doit pas etre (?:pris|prise|consomme\w*))\b",
            )?,
        })
    }

    fn hours_in(&self, folded: &str) -> Option<f64> {
        if has_words(folded, "une demi heure") {
            return Some(0.5);
        }
        if let Some(found) = self.hours.captures(folded) {
            return found[1].replace(',', ".").parse().ok();
        }
        self.minutes
            .captures(folded)
            .and_then(|found| found[1].parse::<f64>().ok())
            .map(|minutes| minutes / 60.0)
    }
}

/// A paragraph that is a heading of its section (« Associations déconseillées », « Autres formes
/// d'interactions »): short, capitalised, with no end mark nor bracket, neither a « + » line nor a bullet.
pub(crate) fn is_heading(line: &str) -> bool {
    let line = line.trim();
    line.chars().count() < 60
        && line.chars().next().is_some_and(char::is_uppercase)
        && !line.ends_with(['.', ':', ';', ')'])
        && !line.contains('(')
}

/// The sentences of a section's text (a line is a paragraph; « . » followed by a space ends a sentence), each
/// with whether it is a heading paragraph.
pub(crate) fn sentences(text: &str) -> Vec<(String, bool)> {
    let mut out = Vec::new();
    for line in text.lines() {
        if is_heading(line) {
            out.push((line.trim().to_string(), true));
            continue;
        }
        let mut current = String::new();
        let mut chars = line.chars().peekable();
        while let Some(character) = chars.next() {
            current.push(character);
            if character == '.' && chars.peek().is_none_or(|next| *next == ' ') {
                out.push((current.trim().to_string(), false));
                current.clear();
            }
        }
        if !current.trim().is_empty() {
            out.push((current.trim().to_string(), false));
        }
    }
    out
}

fn food_in<'a>(folded: &str, foods: &'a [Food]) -> Option<&'a Food> {
    foods
        .iter()
        .find(|food| food.words.iter().any(|word| has_words(folded, word)))
}

/// The rules one SmPC states. In 4.5, a line starting with « + » names the medicine or food the next sentences
/// are about (`partner`) until the next heading; a food named so under « Associations contre-indiquées » or
/// « déconseillées » is to avoid, quoted as that heading and the line. A fasting rule is an instruction (« à
/// prendre à jeun »), never a condition (« s'ils sont ingérés à jeun », « en cas d'ingestion à jeun »).
pub fn intake_rules(
    cis: &str,
    page: &RcpPage,
    foods: &[Food],
    patterns: &Patterns,
) -> Vec<IntakeRule> {
    let mut rules = Vec::new();
    for (section, text) in &page.sections {
        // Intake is stated in 4.2 (how to take it) and 4.5 (with what); 4.3, 4.4 and 4.6 give profile rules.
        if !matches!(
            section,
            RcpSectionKey::Administration | RcpSectionKey::Interactions
        ) {
            continue;
        }
        let mut partner: Option<String> = None;
        let mut heading: Option<String> = None;
        for (sentence, is_heading) in sentences(text) {
            if is_heading {
                partner = None;
                heading = Some(sentence);
                continue;
            }
            if *section == RcpSectionKey::Interactions
                && let Some(name) = sentence.strip_prefix('+')
            {
                let name = name.trim().to_string();
                let to_avoid = heading.as_deref().is_some_and(|heading| {
                    let heading = fold(heading);
                    heading.contains("contre indiqu") || heading.contains("deconseill")
                });
                if let (true, Some(food), Some(heading)) =
                    (to_avoid, food_in(&fold(&name), foods), heading.as_deref())
                {
                    rules.push(IntakeRule {
                        cis: cis.to_string(),
                        kind: IntakeKind::AvoidFood,
                        food: Some(food.key.clone()),
                        partner: Some(name.clone()),
                        hours: None,
                        section: *section,
                        quote: format!("{heading} : + {name}"),
                    });
                }
                partner = Some(name);
                continue;
            }
            let folded = fold_measures(&sentence);
            let food = food_in(&folded, foods).or_else(|| {
                partner
                    .as_deref()
                    .and_then(|name| food_in(&fold(name), foods))
            });
            let rule = |kind: IntakeKind, hours: Option<f64>| IntakeRule {
                cis: cis.to_string(),
                kind,
                food: food.map(|food| food.key.clone()),
                partner: partner.clone(),
                hours,
                section: *section,
                quote: sentence.clone(),
            };
            let conditional = folded.starts_with("si ")
                || folded.starts_with("s'il")
                || folded.contains("en cas d");
            if patterns.fasting.is_match(&folded)
                && patterns.instruction.is_match(&folded)
                && !conditional
            {
                rules.push(rule(IntakeKind::Fasting, patterns.hours_in(&folded)));
            } else if patterns.meal.is_match(&folded) && *section == RcpSectionKey::Administration {
                rules.push(rule(IntakeKind::WithMeal, None));
            }
            let hours = patterns.hours_in(&folded);
            if hours.is_some()
                && patterns.spacing.is_match(&folded)
                && (partner.is_some() || food.is_some())
            {
                rules.push(rule(IntakeKind::Spacing, hours));
            } else if food.is_some() && patterns.avoid.is_match(&folded) {
                rules.push(rule(IntakeKind::AvoidFood, None));
            }
        }
    }
    rules
}
