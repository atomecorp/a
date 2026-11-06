//! The SmPC sentences about a part of the person's life (register R-115, cross-check of 5 Nov. 2026): driving
//! and machines (4.7), drowsiness, the sun, physical effort, dehydration or heat, a hypoglycaemia, alcohol,
//! sleep, an intake at bedtime, the tendons — each one a sentence of sections 4.2 to 4.8 that names it in so
//! many words. A sentence that only says there is no such effect (« n'a aucun effet sur l'aptitude à conduire »,
//! « Sans objet ») gives no rule, unless it goes on with « mais », « toutefois »… A factor gives one rule per
//! section, its first sentence, quoted as written; a sentence longer than `QUOTE_CHARS` (a list of effects in
//! 4.8) is quoted by the part of it around the words, its cut ends marked « … ». Nothing is inferred: the
//! device only says the sentence beside what it knows of the person.

use crate::model::{ContextFactor, ContextRule, RcpSectionKey};
use crate::rcp::{RcpPage, sentences};
use crate::text::{fold, has_words};

/// The longest quote kept whole; a longer sentence is quoted around its words.
const QUOTE_CHARS: usize = 320;
/// The words kept on each side of the factor's words in a cut quote.
const QUOTE_WORDS: usize = 18;

/// The folded words that name each factor in any section.
const WORDS: &[(ContextFactor, &[&str])] = &[
    (
        ContextFactor::Driving,
        &[
            "conduite de vehicules",
            "conduite des vehicules",
            "conduite automobile",
            "conduire des vehicules",
            "conduire un vehicule",
            "utiliser des machines",
            "utilisation de machines",
        ],
    ),
    (
        ContextFactor::Somnolence,
        &[
            "somnolence",
            "somnolences",
            "sedation",
            "endormissement",
            "assoupissement",
        ],
    ),
    (
        ContextFactor::Photosensitivity,
        &[
            "photosensibilite",
            "photosensibilisation",
            "photosensibilisant",
            "exposition au soleil",
            "exposition solaire",
            "rayons uv",
            "rayonnement uv",
            "ultraviolets",
            "ultra violets",
        ],
    ),
    (
        ContextFactor::Effort,
        &[
            "exercice physique",
            "exercices physiques",
            "effort physique",
            "efforts physiques",
            "effort intense",
            "effort intensif",
            "efforts intenses",
            "activite physique",
            "activites physiques",
            "activite sportive",
            "pratique sportive",
        ],
    ),
    (
        ContextFactor::Dehydration,
        &[
            "deshydratation",
            "deshydrate",
            "forte chaleur",
            "fortes chaleurs",
            "coup de chaleur",
        ],
    ),
    (
        ContextFactor::Hypoglycaemia,
        &["hypoglycemie", "hypoglycemies", "coma hypoglycemique"],
    ),
    (
        ContextFactor::Alcohol,
        &[
            "alcool",
            "alcools",
            "boissons alcoolisees",
            "boisson alcoolisee",
            "alcoolisme",
            "alcoolique",
            "alcooliques",
        ],
    ),
    (
        ContextFactor::Insomnia,
        &["insomnie", "insomnies", "troubles du sommeil"],
    ),
    (
        ContextFactor::Tendon,
        &[
            "tendinite",
            "tendinites",
            "tendinopathie",
            "tendinopathies",
            "rupture de tendon",
            "ruptures de tendon",
            "rupture des tendons",
            "rupture du tendon",
        ],
    ),
];

/// Section 4.7 is about driving: its sentences that name the ability or an effect on it.
const DRIVING_SECTION_WORDS: &[&str] = &[
    "conduire",
    "conduite",
    "machines",
    "vigilance",
    "temps de reaction",
    "vertige",
    "vertiges",
    "etourdissement",
    "etourdissements",
    "somnolence",
    "vision",
    "convulsions",
    "hypoglycemie",
];

/// An excipient named « alcool » is not a drink.
const EXCIPIENT_ALCOHOLS: &[&str] = &[
    "alcool benzylique",
    "alcool cetylique",
    "alcool stearylique",
    "alcool cetostearylique",
    "alcool polyvinylique",
    "alcool isopropylique",
];

/// The sentence only says there is no such effect.
const NONE_WORDS: &[&str] = &[
    "aucun effet",
    "pas d'effet",
    "aucune influence",
    "pas d'influence",
    "effet negligeable",
    "influence negligeable",
    "influence directe negligeable",
    "sans objet",
    "n'entraine pas",
    "ne provoque pas",
    "n'ont pas ete etudies",
    "n'a pas ete etudie",
];
const BUT_WORDS: &[&str] = &["mais", "toutefois", "cependant", "par contre", "neanmoins"];

/// Intake at bedtime, stated in 4.2 as an instruction not to (« ne doit pas être pris au coucher »).
const BEDTIME_WORDS: &[&str] = &["au coucher", "le soir au coucher"];
const NOT_WORDS: &[&str] = &["ne doit pas", "ne doivent pas", "eviter", "ne pas"];

fn any(folded: &str, words: &[&str]) -> bool {
    words.iter().any(|word| has_words(folded, word))
}

fn says_none(folded: &str) -> bool {
    any(folded, NONE_WORDS) && !any(folded, BUT_WORDS)
}

/// The factors a sentence of `section` names.
fn factors(section: RcpSectionKey, folded: &str) -> Vec<ContextFactor> {
    if says_none(folded) {
        return Vec::new();
    }
    let mut found = Vec::new();
    if section == RcpSectionKey::Driving && any(folded, DRIVING_SECTION_WORDS) {
        found.push(ContextFactor::Driving);
    }
    for (factor, words) in WORDS {
        if found.contains(factor) {
            continue;
        }
        let text = if *factor == ContextFactor::Alcohol {
            EXCIPIENT_ALCOHOLS
                .iter()
                .fold(folded.to_string(), |text, excipient| {
                    text.replace(excipient, " ")
                })
        } else {
            folded.to_string()
        };
        if any(&text, words) {
            found.push(*factor);
        }
    }
    if section == RcpSectionKey::Administration
        && any(folded, BEDTIME_WORDS)
        && any(folded, NOT_WORDS)
    {
        found.push(ContextFactor::Bedtime);
    }
    found
}

/// The sentence as quoted: whole when short, else its part around the factor's words (a table row's cell first).
fn quote(sentence: &str, factor: ContextFactor) -> String {
    if sentence.chars().count() <= QUOTE_CHARS {
        return sentence.to_string();
    }
    let words: &[&str] = match factor {
        ContextFactor::Driving => DRIVING_SECTION_WORDS,
        ContextFactor::Bedtime => BEDTIME_WORDS,
        _ => WORDS
            .iter()
            .find(|(entry, _)| *entry == factor)
            .map_or(&[], |(_, words)| *words),
    };
    let cell = sentence
        .split(" | ")
        .find(|cell| any(&fold(cell), words))
        .unwrap_or(sentence);
    if cell.chars().count() <= QUOTE_CHARS {
        return cell.trim().to_string();
    }
    let tokens: Vec<&str> = cell.split_whitespace().collect();
    let first = words
        .iter()
        .filter_map(|phrase| phrase.split(' ').next())
        // A word glued to its article (« d'alcool », « l'hypoglycémie ») is the word.
        .find_map(|head| {
            tokens
                .iter()
                .position(|token| fold(token).rsplit('\'').next() == Some(head))
        })
        .unwrap_or(0);
    let from = first.saturating_sub(QUOTE_WORDS);
    let to = (first + QUOTE_WORDS + 1).min(tokens.len());
    let mut out = tokens[from..to].join(" ");
    if from > 0 {
        out.insert_str(0, "… ");
    }
    if to < tokens.len() {
        out.push_str(" …");
    }
    out
}

/// A bullet of a list (« · Déshydratation »): it is read with the sentence that opens its list.
fn is_bullet(sentence: &str) -> bool {
    sentence.starts_with(['·', '•', '-', '–']) || sentence.starts_with("o ")
}

/// The context rules one SmPC states: per section and factor, its first sentence.
pub fn context_rules(cis: &str, page: &RcpPage) -> Vec<ContextRule> {
    let mut rules: Vec<ContextRule> = Vec::new();
    for (section, text) in &page.sections {
        // The sentence that opens a list (« … à utiliser avec précaution en cas de : »), for its bullets.
        let mut lead: Option<String> = None;
        for (sentence, is_heading) in sentences(text) {
            if is_heading && *section != RcpSectionKey::AdverseEffects {
                lead = None;
                continue;
            }
            let bullet = is_bullet(&sentence);
            if !bullet {
                lead = sentence.ends_with(':').then(|| sentence.clone());
            }
            let said = match (&lead, bullet) {
                (Some(lead), true) => format!("{lead} {sentence}"),
                _ => sentence.clone(),
            };
            for factor in factors(*section, &fold(&said)) {
                if rules
                    .iter()
                    .any(|rule| rule.section == *section && rule.factor == factor)
                {
                    continue;
                }
                rules.push(ContextRule {
                    cis: cis.to_string(),
                    factor,
                    section: *section,
                    quote: quote(&said, factor),
                });
            }
        }
    }
    rules
}
