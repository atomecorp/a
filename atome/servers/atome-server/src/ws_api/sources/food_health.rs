// A packaged product as Open Food Facts describes it, made the one product eVe reads
// (server/ws_open_food_facts.js `normalizeFoodProduct`, ported) with its deterministic health
// verdict and its selection (atome/src/shared/food_health_assessment.js `assessFoodHealth`,
// `evaluateFoodSelection`, `highFoodNutrients`, `readAdditiveRisks`, ported). It reads only open
// data: the Nutri-Score grade, the NOVA group, the EFSA overexposure risk of each additive (the
// OFF additives taxonomy) and whether OFF analysed an ingredient list. This is NOT the Yuka score.
// Unknown never passes for good. On the server no allergen is declared (`declared` is null).
use super::common::{iso, number, or_empty};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::collections::HashMap;

/// An additive's tag and its EFSA overexposure risk (`high`, `moderate`, `no`).
pub(super) type Risks = HashMap<String, String>;

const GRADES: &str = "abcde";
const RISKS: [&str; 3] = ["high", "moderate", "no"];
// The « high » level per 100 g of the UK FSA front-of-pack scheme; a drink's thresholds are half a food's.
const NUTRIENT_HIGH: [(&str, f64); 4] = [
    ("fat", 17.5),
    ("saturated_fat", 5.0),
    ("sugars", 22.5),
    ("salt", 1.5),
];

/// The databases: their host and name.
pub(super) fn database(source: &str) -> Option<(&'static str, &'static str)> {
    match source {
        "off" => Some(("https://world.openfoodfacts.org", "Open Food Facts")),
        "obf" => Some(("https://world.openbeautyfacts.org", "Open Beauty Facts")),
        "opf" => Some(("https://world.openproductsfacts.org", "Open Products Facts")),
        _ => None,
    }
}

fn grade(value: Option<&JsonValue>) -> JsonValue {
    let letter = or_empty(value).to_lowercase();
    if letter.len() == 1 && GRADES.contains(&letter) {
        json!(letter)
    } else {
        JsonValue::Null
    }
}

fn amount(value: Option<&JsonValue>) -> JsonValue {
    match value {
        None | Some(JsonValue::Null) => JsonValue::Null,
        Some(JsonValue::String(text)) if text.is_empty() => JsonValue::Null,
        value => {
            let number = number(value);
            if number.is_finite() {
                js::number_json(number)
            } else {
                JsonValue::Null
            }
        }
    }
}

fn tags(value: Option<&JsonValue>) -> Vec<String> {
    match value {
        Some(JsonValue::Array(items)) => items.iter().map(|item| js::text(Some(item))).collect(),
        _ => Vec::new(),
    }
}

// `String(value || '').trim() ? String(value).trim().slice(0, max) : null`.
fn text(value: Option<&JsonValue>, max: usize) -> JsonValue {
    let text = js::trim(&or_empty(value)).to_string();
    if text.is_empty() {
        JsonValue::Null
    } else {
        json!(js::slice(&text, max))
    }
}

fn first_brand(brands: Option<&JsonValue>) -> String {
    let first = match brands {
        Some(JsonValue::Array(items)) => or_empty(items.first()),
        _ => or_empty(brands).split(',').next().unwrap_or("").to_string(),
    };
    js::trim(&first).to_string()
}

fn high_nutrients(nutriments: &JsonValue, categories: &[String]) -> usize {
    let share = if categories.iter().any(|tag| tag == "en:beverages") {
        0.5
    } else {
        1.0
    };
    NUTRIENT_HIGH
        .iter()
        .filter(|(key, high)| number(nutriments.get(*key)) > high * share)
        .count()
}

/// `evaluateFoodSelection(product)`: each rule's `[state, reason]`, excluded when one rule
/// excludes, else to_check when one cannot be checked, else compliant.
fn selection(
    grade: Option<&str>,
    nova: Option<f64>,
    additives: &[JsonValue],
    known: bool,
    evaluated: bool,
) -> JsonValue {
    let high = additives
        .iter()
        .any(|additive| additive.get("risk") == Some(&json!("high")));
    let checks: [(&str, bool, &[&str], (&str, Option<&str>)); 4] = [
        // Nothing declared, nothing to check.
        (
            "allergen_declared",
            false,
            &[
                "allergens",
                "traces",
                "ingredients_known",
                "declared_allergens",
            ],
            ("compliant", None),
        ),
        (
            "nutriscore_e",
            true,
            &["nutriscore"],
            match grade {
                None => ("to_check", Some("no_nutriscore")),
                Some("e") => ("excluded", Some("nutriscore_e")),
                _ => ("compliant", None),
            },
        ),
        (
            "nutriscore_d_nova_4",
            true,
            &["nutriscore", "nova"],
            match (grade, nova) {
                (None, _) => ("to_check", Some("no_nutriscore")),
                (Some(grade), _) if grade != "d" => ("compliant", None),
                (_, None) => ("to_check", Some("no_nova")),
                (_, Some(4.0)) => ("excluded", Some("nutriscore_d_nova_4")),
                _ => ("compliant", None),
            },
        ),
        // An additive is read from the analysed ingredient list; additives whose risks could not
        // be read are not cleared.
        (
            "additive_high_risk",
            true,
            &["additives", "ingredients_known", "additives_evaluated"],
            if high {
                ("excluded", Some("additive_high_risk"))
            } else if !known {
                ("to_check", Some("ingredients_unknown"))
            } else if !evaluated && !additives.is_empty() {
                ("to_check", Some("additives_unevaluated"))
            } else {
                ("compliant", None)
            },
        ),
    ];
    let rules: Vec<JsonValue> = checks
        .iter()
        .map(|(id, provisional, reads, (state, reason))| {
            let mut rule = serde_json::Map::new();
            rule.insert("rule_id".into(), json!(id));
            rule.insert("state".into(), json!(state));
            if let Some(reason) = reason {
                rule.insert("reason".into(), json!(reason));
            }
            rule.insert("provisional".into(), json!(provisional));
            rule.insert("reads".into(), json!(reads));
            JsonValue::Object(rule)
        })
        .collect();
    let state = ["excluded", "to_check"]
        .into_iter()
        .find(|wanted| checks.iter().any(|(_, _, _, (state, _))| state == wanted))
        .unwrap_or("compliant");
    json!({ "policy": "v2", "provisional": true, "state": state, "rules": rules })
}

/// `normalizeFoodProduct(raw, source, additiveRisks)`; a modification date past what a date holds
/// throws (`toISOString`), as on Fastify.
pub(super) fn normalize(
    raw: &JsonValue,
    source: &str,
    risks: Option<&Risks>,
) -> Result<JsonValue, String> {
    let (host, name) = database(source).ok_or("PROVIDER_UNAVAILABLE")?;
    let field = |name: &str| raw.get(name);
    let fallback = json!({});
    let nutriments = raw
        .get("nutriments")
        .filter(|value| js::truthy(Some(value)))
        .unwrap_or(&fallback);
    let code = or_empty(field("code"));
    let nova = number(field("nova_group"));
    let nova = [1.0, 2.0, 3.0, 4.0].contains(&nova).then_some(nova);
    let additives: Vec<JsonValue> = tags(field("additives_tags"))
        .into_iter()
        .map(|tag| {
            let risk = risks
                .and_then(|risks| risks.get(&tag))
                .map_or(JsonValue::Null, |risk| json!(risk));
            json!({ "tag": tag, "risk": risk })
        })
        .collect();
    let known = number(field("ingredients_n")) > 0.0;
    let nutriments_100g = json!({
        "energy_kcal": amount(nutriments.get("energy-kcal_100g")), "fat": amount(nutriments.get("fat_100g")),
        "saturated_fat": amount(nutriments.get("saturated-fat_100g")),
        "carbohydrates": amount(nutriments.get("carbohydrates_100g")), "sugars": amount(nutriments.get("sugars_100g")),
        "salt": amount(nutriments.get("salt_100g")), "fiber": amount(nutriments.get("fiber_100g")),
        "proteins": amount(nutriments.get("proteins_100g")),
    });
    let modified = number(field("last_modified_t"));
    let last_modified = if modified > 0.0 {
        json!(iso(modified * 1000.0).ok_or("RangeError: Invalid time value")?)
    } else {
        JsonValue::Null
    };
    let categories = tags(field("categories_tags"));
    let nutriscore = grade(field("nutriscore_grade"));
    let product_grade = nutriscore.as_str().map(str::to_string);
    let selected = selection(
        product_grade.as_deref(),
        nova,
        &additives,
        known,
        risks.is_some(),
    );
    // `assessFoodHealth`: « avoid » is what the selection excludes; « good » needs a Nutri-Score
    // and an analysed ingredient list whose additives were all judged.
    let verdict = if selected["state"] == "excluded" {
        json!("avoid")
    } else if product_grade.as_deref() == Some("d")
        || nova == Some(4.0)
        || additives
            .iter()
            .any(|additive| additive["risk"] == "moderate")
        || high_nutrients(&nutriments_100g, &categories) > 0
    {
        json!("limit")
    } else if product_grade.is_some() && known && (risks.is_some() || additives.is_empty()) {
        json!("good")
    } else {
        JsonValue::Null
    };
    Ok(json!({
        "barcode": code, "source": source, "name": or_empty(field("product_name")), "brand": first_brand(field("brands")),
        "quantity": or_empty(field("quantity")), "image_url": or_empty(field("image_url")), "nutriscore": nutriscore,
        "nova": nova.map_or(JsonValue::Null, js::number_json), "green_score": grade(field("ecoscore_grade")),
        "additives": additives,
        // The additives taxonomy unreachable: their risks are unknown, never « no risk ».
        "additives_evaluated": risks.is_some(),
        // OFF reads additives from the analysed ingredient list; without one, nothing is known about them.
        "ingredients_known": known,
        "allergens": tags(field("allergens_tags")), "traces": tags(field("traces_tags")),
        "nutriments_100g": nutriments_100g, "categories_tags": categories,
        // Absent stays null, never an empty answer read as « none ».
        "ingredients_text": text(field("ingredients_text"), 4000), "ingredients_lang": text(field("lang"), 8),
        "origins": text(field("origins"), 400), "manufacturing_places": text(field("manufacturing_places"), 400),
        "provenance": { "database": name, "licence": "ODbL", "url": format!("{host}/product/{code}"),
            "last_modified": last_modified, "completeness": amount(field("completeness")) },
        "verdict": verdict, "selection": selected,
    }))
}

/// `readAdditiveRisks(taxonomy)`: the OFF additives taxonomy (additives.json) read.
pub(super) fn additive_risks(taxonomy: &JsonValue) -> Risks {
    let entries: Vec<(String, &JsonValue)> = match taxonomy {
        JsonValue::Object(map) => map
            .iter()
            .map(|(tag, entry)| (tag.clone(), entry))
            .collect(),
        JsonValue::Array(items) => items
            .iter()
            .enumerate()
            .map(|(index, entry)| (index.to_string(), entry))
            .collect(),
        _ => Vec::new(),
    };
    entries
        .into_iter()
        .filter_map(|(tag, entry)| {
            let risk = or_empty(entry.pointer("/efsa_evaluation_overexposure_risk/en"));
            let risk = risk.strip_prefix("en:").unwrap_or(&risk).to_string();
            RISKS.contains(&risk.as_str()).then_some((tag, risk))
        })
        .collect()
}
