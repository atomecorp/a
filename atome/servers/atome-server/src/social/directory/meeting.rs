// Rencontre (atome/src/shared/meeting_contract.js, ported for the server that matches): a person
// declares on their own card what they come for (goals, each with its themes), who they are and
// look for, and where; the server matches from these declarations only and never shows them. A
// match sees the person's card for Rencontre: a hook, a presentation and their photos. Rencontre is
// for adults only, read from the card's own birth date.
use crate::social::news::db::text;
use crate::vault_router::js;
use chrono::{Datelike, Local, NaiveDate};
use serde_json::{Value as JsonValue, json};

// The goals a card can declare, each with its themes (none: the goal alone), and whether it is
// intimate (each one must be among the people the other seeks).
const GOALS: [(&str, &[&str], bool); 8] = [
    (
        "professional",
        &[
            "health",
            "science_tech",
            "education",
            "commerce",
            "administration",
            "culture",
        ],
        false,
    ),
    ("sex", &[], true),
    ("love", &[], true),
    ("friendship", &[], false),
    (
        "help",
        &["home_help", "homework", "computing", "paperwork", "repairs"],
        false,
    ),
    (
        "advice",
        &[
            "education",
            "computing",
            "health",
            "daily_life",
            "paperwork",
        ],
        false,
    ),
    (
        "discussion",
        &[
            "philosophy",
            "misc",
            "science",
            "sport",
            "music",
            "cinema",
            "health",
        ],
        false,
    ),
    ("passion", &["sport", "shows", "music", "cinema"], false),
];
// `all` is a search choice only (every goal), never a declaration.
const SEARCH_ALL: &str = "all";
const SEXES: [&str; 3] = ["woman", "man", "other"];
const ORIENTATIONS: [&str; 3] = ["hetero", "homo", "bi"];
const SCOPES: [&str; 3] = ["france", "world", "area"];
const MINIMUM_AGE: i32 = 18;
const OLDEST_AGE: i32 = 120;
const PHOTOS_MAX: usize = 6;
const HIDDEN_MAX: usize = 500;

/// A card's declarations, cleaned (`normalizeMeetingProfile`).
pub struct Meeting {
    goals: Vec<(&'static str, Vec<&'static str>)>,
    sex: String,
    orientation: String,
    seeking: Vec<&'static str>,
    pub country: String,
    pub area: String,
    pub hook: String,
    pub presentation: String,
    pub photos: Vec<String>,
    hidden: Vec<String>,
}

/// A search: `{ goal, theme, scope, query }`, each as typed.
pub struct Search {
    pub goal: String,
    pub theme: String,
    pub scope: String,
    pub query: String,
}

// `value.map(text).filter(Boolean)` of an array, nothing of anything else.
fn texts(value: Option<&JsonValue>) -> Vec<String> {
    value
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .map(|item| text(Some(item)))
        .filter(|item| !item.is_empty())
        .collect()
}

fn unique(items: Vec<String>) -> Vec<String> {
    let mut kept: Vec<String> = Vec::new();
    for item in items {
        if !kept.contains(&item) {
            kept.push(item);
        }
    }
    kept
}

/// Lowered, its accents dropped (NFD, then no combining mark U+0300–U+036F).
fn fold(value: &str) -> String {
    let decomposed =
        icu_normalizer::DecomposingNormalizerBorrowed::new_nfd().normalize(js::trim(value));
    decomposed
        .chars()
        .filter(|c| !('\u{300}'..='\u{36f}').contains(c))
        .collect::<String>()
        .to_lowercase()
}

impl Meeting {
    pub fn normalize(value: Option<&JsonValue>) -> Self {
        let source = value.filter(|value| value.is_object());
        let field = |key: &str| source.and_then(|source| source.get(key));
        // Later declarations of a goal replace earlier ones, as a Map's entries do.
        let mut declared: Vec<(String, Vec<String>)> = Vec::new();
        for entry in field("goals")
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten()
        {
            let goal = match entry.get("goal") {
                Some(goal) if !goal.is_null() => text(Some(goal)),
                _ => text(Some(entry)),
            };
            let themes = entry
                .get("themes")
                .and_then(JsonValue::as_array)
                .map(|themes| themes.iter().map(|theme| text(Some(theme))).collect())
                .unwrap_or_default();
            declared.retain(|(key, _)| *key != goal);
            declared.push((goal, themes));
        }
        let goals = GOALS
            .iter()
            .filter_map(|(key, themes, _)| {
                let (_, chosen) = declared.iter().find(|(goal, _)| goal == key)?;
                let kept = themes
                    .iter()
                    .copied()
                    .filter(|theme| chosen.iter().any(|chosen| chosen == theme))
                    .collect();
                Some((*key, kept))
            })
            .collect();
        let seeking = match field("seeking").and_then(JsonValue::as_array) {
            Some(seeking) => {
                let wanted: Vec<String> = seeking.iter().map(|sex| text(Some(sex))).collect();
                SEXES
                    .into_iter()
                    .filter(|sex| wanted.iter().any(|wanted| wanted == sex))
                    .collect()
            }
            None => Vec::new(),
        };
        let listed = |key: &str, choices: &[&str]| {
            let value = text(field(key));
            if choices.contains(&value.as_str()) {
                value
            } else {
                String::new()
            }
        };
        let mut hidden = unique(texts(field("hidden")));
        hidden.drain(..hidden.len().saturating_sub(HIDDEN_MAX));
        let mut photos = unique(texts(field("photos")));
        photos.truncate(PHOTOS_MAX);
        Self {
            goals,
            sex: listed("sex", &SEXES),
            orientation: listed("orientation", &ORIENTATIONS),
            seeking,
            country: js::slice(&text(field("country")), 80),
            area: js::slice(&text(field("area")), 120),
            hook: js::slice(&text(field("hook")), 60),
            presentation: js::slice(&text(field("presentation")), 1000),
            photos,
            hidden,
        }
    }

    /// A card with no goal declared never appears in Rencontre.
    pub fn declared(&self) -> bool {
        !self.goals.is_empty()
    }

    /// What the server keeps to match a card (never its photos, texts or hidden people).
    pub fn declarations(&self) -> JsonValue {
        json!({
            "goals": self.goals.iter().map(|(goal, themes)| json!({ "goal": goal, "themes": themes })).collect::<Vec<_>>(),
            "sex": self.sex,
            "orientation": self.orientation,
            "seeking": self.seeking,
            "country": self.country,
            "area": self.area,
        })
    }

    /// The whole card, as `normalizeMeetingProfile` returns it.
    pub fn json(&self) -> JsonValue {
        let mut card = self.declarations();
        card["hook"] = json!(self.hook);
        card["presentation"] = json!(self.presentation);
        card["photos"] = json!(self.photos);
        card["hidden"] = json!(self.hidden);
        card
    }

    /// Does `candidate` (its declarations, named `name`, account `candidate_id`) answer this
    /// searcher's `search`? The people the searcher hid never come back.
    pub fn matches(
        &self,
        candidate: Option<&JsonValue>,
        search: &Search,
        name: &str,
        candidate_id: &str,
    ) -> bool {
        let candidate = Self::normalize(candidate);
        if candidate.goals.is_empty()
            || (!candidate_id.is_empty()
                && self
                    .hidden
                    .iter()
                    .any(|hidden| hidden == js::trim(candidate_id)))
        {
            return false;
        }
        let goal = search.goal.as_str();
        let declared: Vec<&(&str, Vec<&str>)> = candidate
            .goals
            .iter()
            .filter(|(key, _)| goal == SEARCH_ALL || *key == goal)
            .collect();
        if declared.is_empty() {
            return false;
        }
        // A goal declared without themes covers them all; with themes, the theme sought must be one of them.
        if !search.theme.is_empty()
            && !declared
                .iter()
                .any(|(_, themes)| themes.is_empty() || themes.contains(&search.theme.as_str()))
        {
            return false;
        }
        let intimate = GOALS
            .iter()
            .any(|(key, _, intimate)| *intimate && *key == goal);
        let seek_each_other = !self.sex.is_empty()
            && !candidate.sex.is_empty()
            && candidate.seeking.contains(&self.sex.as_str())
            && self.seeking.contains(&candidate.sex.as_str());
        if intimate && !seek_each_other {
            return false;
        }
        let scope = if SCOPES.contains(&search.scope.as_str()) {
            search.scope.as_str()
        } else {
            "world"
        };
        if scope == "france" && fold(&candidate.country) != "france" {
            return false;
        }
        if scope == "area" && (self.area.is_empty() || fold(&candidate.area) != fold(&self.area)) {
            return false;
        }
        // The words typed: the published name, or the city or region the person declared.
        let needle = fold(&search.query);
        needle.is_empty() || fold(name).contains(&needle) || fold(&candidate.area).contains(&needle)
    }
}

/// `meetingAllowed(birth)`: the age read from a typed birth date (`12/03/1990`, `12.03.1990`,
/// `12-03-1990`, `1990-03-12`, an ISO timestamp) is 18 or more; a missing, unreadable,
/// impossible or future date keeps Rencontre closed.
pub fn allowed(birth: Option<&JsonValue>) -> bool {
    let birth = text(birth);
    let date = birth.split('T').next().unwrap_or_default();
    let parts: Vec<&str> = date.split(['/', '.', '-']).collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.bytes().all(|b| b.is_ascii_digit()))
    {
        return false;
    }
    let ordered = if parts[0].len() == 4 {
        [parts[0], parts[1], parts[2]]
    } else {
        [parts[2], parts[1], parts[0]]
    };
    let [Ok(year), Ok(month), Ok(day)] = ordered.map(str::parse::<u32>) else {
        return false;
    };
    if !(1000..=9999).contains(&year) {
        return false;
    }
    let Some(born) = NaiveDate::from_ymd_opt(year as i32, month, day) else {
        return false;
    };
    let today = Local::now().date_naive();
    if born > today {
        return false;
    }
    let before_birthday = (today.month(), today.day()) < (month, day);
    let age = today.year() - year as i32 - i32::from(before_birthday);
    (MINIMUM_AGE..=OLDEST_AGE).contains(&age)
}
