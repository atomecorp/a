// The money rules (atome/src/shared/billing_contract.js `BILLING_MONEY`, compiled in through the
// generated catalog): the 3 % on top, the storage taken day by day, the AI's real cost per token.
use super::catalog;
use serde_json::Value as JsonValue;

pub const DAY_MS: i64 = 86_400_000;

fn money() -> &'static JsonValue {
    &catalog::catalog()["money"]
}

fn cents(path: &[&str]) -> i64 {
    path.iter()
        .fold(money(), |value, key| &value[*key])
        .as_i64()
        .unwrap_or_else(|| panic!("billing_money_field:{}", path.join(".")))
}

pub fn entry_cents() -> i64 {
    cents(&["entryCents"])
}

pub fn topup_min_cents() -> i64 {
    cents(&["topupMinCents"])
}

pub fn hold_ttl_ms() -> i64 {
    cents(&["holdTtlMs"])
}

pub fn hold_cents(category: &str) -> Result<i64, String> {
    money()["holdCents"][category]
        .as_i64()
        .ok_or_else(|| format!("money_category_unknown:{category}"))
}

pub fn category_known(category: &str) -> bool {
    money()["categories"]
        .as_array()
        .is_some_and(|list| list.iter().any(|known| known == category))
}

/// `billingCommissionCents`: the 3 % on top, half rounded up (10,00 € → 0,30 €; 0,50 € → 0,02 €).
pub fn commission(cents: i64) -> i64 {
    (cents * cents_of("commissionBps") + 5000).div_euclid(10_000)
}

fn cents_of(name: &str) -> i64 {
    cents(&[name])
}

/// The storage due for `days` whole days since the account's storage start: the cost and its
/// 3 % spread over the period, cumulative so no cent drifts (5,15 € for 30 days: 0,17 € a day,
/// then 0,18 € on the days the remainder carries).
pub fn storage_due(days: i64) -> i64 {
    let cost = cents(&["storage", "costCents"]);
    let period = cents(&["storage", "periodDays"]);
    let total = cost + commission(cost);
    (total * days).div_euclid(period)
}

/// What one storage period costs the person (5 € + 3 % = 5,15 €) and its length in days.
pub fn storage_period() -> (i64, i64) {
    let cost = cents(&["storage", "costCents"]);
    (cost + commission(cost), cents(&["storage", "periodDays"]))
}

/// The provider's real cost of one answer, in millionths of a cent: the model's dated price per
/// token, or the operation's flat price. A model with no price is refused, never guessed.
pub fn ai_cost_micro_cents(action: &str, usage: &JsonValue) -> Result<i64, String> {
    if let Some(flat) = money()["ai"]["flatMicroCents"][action].as_i64() {
        return Ok(flat);
    }
    let model = usage
        .get("model")
        .and_then(JsonValue::as_str)
        .unwrap_or_default();
    let price = &money()["ai"]["prices"][model];
    let (Some(input), Some(output)) = (price["input"].as_i64(), price["output"].as_i64()) else {
        return Err(format!("money_ai_price_missing:{model}"));
    };
    let tokens = |name: &str| usage.get(name).and_then(JsonValue::as_i64).unwrap_or(0);
    Ok(tokens("input_tokens") * input + tokens("output_tokens") * output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commission_is_three_percent_half_up() {
        assert_eq!(commission(1000), 30);
        assert_eq!(commission(50), 2);
        assert_eq!(commission(49), 1);
        assert_eq!(commission(1200), 36);
        assert_eq!(commission(0), 0);
    }

    #[test]
    fn storage_sums_to_the_period_price() {
        assert_eq!(storage_period(), (515, 30));
        assert_eq!(storage_due(1), 17);
        assert_eq!(storage_due(30), 515);
        assert_eq!(storage_due(60), 1030);
    }

    #[test]
    fn ai_price_is_read_or_refused() {
        let usage = serde_json::json!({ "model": "gpt-5.6-sol", "input_tokens": 1000, "output_tokens": 100 });
        assert_eq!(
            ai_cost_micro_cents("responses", &usage),
            Ok(1000 * 115 + 100 * 920)
        );
        let unknown = serde_json::json!({ "model": "other", "input_tokens": 1 });
        assert!(ai_cost_micro_cents("responses", &unknown).is_err());
        assert_eq!(
            ai_cost_micro_cents("speech", &JsonValue::Null),
            Ok(1_000_000)
        );
    }
}
