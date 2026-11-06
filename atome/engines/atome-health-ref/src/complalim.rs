//! The Compl'Alim declarations (DGAL, data.gouv.fr « declarations-de-complements-alimentaires », Licence Ouverte
//! 2.0): one CSV line per declared supplement, `;`-separated, quoted, its ingredients as JSON arrays. The bundle
//! keeps the distinct active ingredients of the supplements that may be marketed, each with the number of those
//! supplements and the substance it is read as (`curated.rs` aliases); the product catalogue itself stays the
//! app's own asset (`supplement_catalogue.js`).

use crate::curated::SupplementAlias;
use crate::model::{Ingredient, IngredientKind};
use crate::text::{fold, has_words};
use serde_json::Value;
use std::collections::BTreeMap;

/// The decision of a declaration that may be on the market.
pub const MARKETABLE: &str = "Commercialisation possible";

/// The fields of a `;`-separated CSV with `"` quotes (doubled inside a field), line breaks allowed in quotes.
pub fn csv_records(text: &str) -> Result<Vec<Vec<String>>, String> {
    let mut records = Vec::new();
    let mut record = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(character) = chars.next() {
        match (quoted, character) {
            (true, '"') if chars.peek() == Some(&'"') => {
                chars.next();
                field.push('"');
            }
            (true, '"') => quoted = false,
            (true, _) => field.push(character),
            (false, '"') if field.is_empty() => quoted = true,
            (false, ';') => record.push(std::mem::take(&mut field)),
            (false, '\r') => {}
            (false, '\n') => {
                record.push(std::mem::take(&mut field));
                records.push(std::mem::take(&mut record));
            }
            (false, _) => field.push(character),
        }
    }
    if quoted {
        return Err("declarations.csv: a quoted field is not closed".to_string());
    }
    if !field.is_empty() || !record.is_empty() {
        record.push(field);
        records.push(record);
    }
    Ok(records)
}

fn column(header: &[String], name: &str) -> Result<usize, String> {
    header
        .iter()
        .position(|field| field == name)
        .ok_or_else(|| format!("declarations.csv: column '{name}' missing"))
}

fn json_list(line: usize, name: &str, field: &str) -> Result<Vec<Value>, String> {
    if field.is_empty() {
        return Ok(Vec::new());
    }
    match serde_json::from_str::<Value>(field) {
        Ok(Value::Array(items)) => Ok(items),
        _ => Err(format!(
            "declarations.csv:{line}: '{name}' is not a JSON list"
        )),
    }
}

fn named(item: &Value, key: &str) -> Option<String> {
    item.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
}

/// The substance an ingredient name is read as: the first alias whose words it contains.
pub fn substance_of(name: &str, aliases: &[SupplementAlias]) -> Option<String> {
    let folded = fold(name);
    aliases
        .iter()
        .find(|alias| {
            alias
                .names
                .iter()
                .any(|alias_name| has_words(&folded, alias_name))
        })
        .map(|alias| alias.substance.clone())
}

/// The distinct active ingredients of the marketable declarations, most declared first, and the declarations
/// left out because their own ingredient list is not valid JSON (the 2026-10-22 file has one, line 29692, a
/// strain name with a broken escape): each is named in the build report, never read halfway.
pub fn ingredients(
    csv: &str,
    aliases: &[SupplementAlias],
) -> Result<(Vec<Ingredient>, Vec<String>), String> {
    let records = csv_records(csv)?;
    let Some((header, rows)) = records.split_first() else {
        return Err("declarations.csv is empty".to_string());
    };
    let decision = column(header, "decision")?;
    let lists = [
        ("plantes", IngredientKind::Plant),
        ("nutriments", IngredientKind::Nutrient),
        ("substances", IngredientKind::Substance),
        ("micro_organismes", IngredientKind::Microorganism),
        ("autres_ingredients_actifs", IngredientKind::Other),
    ];
    let columns = lists
        .iter()
        .map(|(name, _)| column(header, name))
        .collect::<Result<Vec<_>, _>>()?;
    let mut counts: BTreeMap<(String, IngredientKind), (String, u32)> = BTreeMap::new();
    let mut malformed = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        let line = index + 2;
        if row.len() != header.len() {
            return Err(format!(
                "declarations.csv:{line}: {} fields, {} expected",
                row.len(),
                header.len()
            ));
        }
        if row[decision] != MARKETABLE {
            continue;
        }
        let items = lists
            .iter()
            .zip(&columns)
            .map(|((name, kind), at)| Ok((*name, *kind, json_list(line, name, &row[*at])?)))
            .collect::<Result<Vec<_>, String>>();
        let items = match items {
            Ok(items) => items,
            Err(error) => {
                malformed.push(error);
                continue;
            }
        };
        let mut seen = std::collections::BTreeSet::new();
        for (name, kind, list) in &items {
            for item in list {
                let label = match (kind, item) {
                    (_, Value::String(text)) => {
                        Some(text.trim().to_string()).filter(|text| !text.is_empty())
                    }
                    (IngredientKind::Microorganism, _) => {
                        match (named(item, "genre"), named(item, "espece")) {
                            (Some(genus), Some(species)) => {
                                Some(format!("{genus} {}", species.to_lowercase()))
                            }
                            (Some(genus), None) => Some(genus),
                            _ => None,
                        }
                    }
                    _ => named(item, "nom"),
                };
                let Some(label) = label else {
                    return Err(format!(
                        "declarations.csv:{line}: an ingredient of '{name}' has no name"
                    ));
                };
                let key = (fold(&label), *kind);
                if seen.insert(key.clone()) {
                    counts.entry(key).or_insert((label, 0)).1 += 1;
                }
            }
        }
    }
    let mut ingredients: Vec<Ingredient> = counts
        .into_iter()
        .map(|((_, kind), (name, products))| Ingredient {
            substance: substance_of(&name, aliases),
            name,
            kind,
            products,
        })
        .collect();
    ingredients.sort_by(|a, b| b.products.cmp(&a.products).then(a.name.cmp(&b.name)));
    Ok((ingredients, malformed))
}
