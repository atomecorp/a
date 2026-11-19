// The order's states on a real central database (the schema chain of central_schema), a real
// account paying from its wallet: pending → active settles the hold, pending → cancelled or a
// failure releases it and frees the name.
use super::*;
use crate::billing::wallet;
use std::path::{Path, PathBuf};

const NOW: i64 = 1_800_000_000_000;

fn database(name: &str) -> Connection {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let directory = root.join("temp/finance_2026-11-16/db");
    std::fs::create_dir_all(&directory).expect("test directory");
    let path: PathBuf = directory.join(format!("{name}.sqlite"));
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
    crate::central_schema::prepare(&path, &root).expect("schema");
    let db = Connection::open(&path).expect("open");
    guard::set_controls(&db, "global", &json!({ "realSpending": true }), "test", NOW)
        .expect("switch");
    wallet::activate(&db, "alice", wallet::REAL, "act:alice", NOW).expect("account");
    wallet::post(
        &db,
        &wallet::Posting {
            reference: "topup:alice".into(),
            kind: "topup",
            principal: Some("alice"),
            environment: wallet::REAL,
            category: None,
            memo: None,
            meta: json!({}),
            legs: vec![
                ("cash:stripe".into(), -2_000),
                (wallet::wallet("alice"), 2_000),
            ],
        },
        NOW,
    )
    .expect("credit");
    db
}

// A quote of 6,99 € HT: 8,39 € with tax, 0,25 € of commission, 8,64 € in all.
fn order() -> Order {
    Order {
        owner: "alice".into(),
        domain: "atome-test.fr".into(),
        hold: "domain:alice:atome-test.fr:q1".into(),
        site_id: String::new(),
        auto_renew: true,
        quote: json!({ "provider_cents": 699, "price_cents": 839, "commission_cents": 25, "total_cents": 864,
            "renew": { "provider_cents": 899 } }),
        expires_at: "2027-11-16T00:00:00.000Z".into(),
        records: "[]".into(),
    }
}

fn state(db: &Connection, table: &str, hold_or_domain: &str) -> Option<String> {
    let sql = if table == "orders" {
        "SELECT state FROM site_domain_orders WHERE hold_ref = ?"
    } else {
        "SELECT state FROM site_domains WHERE domain = ?"
    };
    db.query_row(sql, [hold_or_domain], |row| row.get(0))
        .optional()
        .expect("state")
}

#[test]
fn domain_order_delivered_settles_the_hold_and_activates() {
    let db = database("domain_order_delivered");
    let order = order();
    begin(&db, &order, NOW).expect("begin");
    assert_eq!(
        state(&db, "domains", &order.domain).as_deref(),
        Some("pending")
    );
    assert_eq!(
        wallet::balance(&db, &wallet::wallet("alice")).expect("balance"),
        2_000 - 864
    );
    assert_eq!(begin(&db, &order, NOW), Err("DOMAIN_TAKEN".into()));
    ordered(&db, &order.hold, 4242).expect("ordered");
    assert_eq!(
        state(&db, "orders", &order.hold).as_deref(),
        Some("pending")
    );
    // OVH takes a day: the ordered hold is never released by age.
    let later = NOW + 86_400_000;
    guard::release_expired(&db, "alice", later).expect("expiry pass");
    let row = deliver(&db, &order.hold, later).expect("deliver");
    assert_eq!(row["order_id"], json!(4242));
    assert_eq!(
        state(&db, "domains", &order.domain).as_deref(),
        Some("active")
    );
    assert_eq!(
        state(&db, "orders", &order.hold).as_deref(),
        Some("delivered")
    );
    assert_eq!(
        wallet::balance(&db, &wallet::wallet("alice")).expect("balance"),
        2_000 - 864
    );
    assert_eq!(
        wallet::balance(&db, &wallet::hold("alice")).expect("hold"),
        0
    );
    assert_eq!(wallet::balance(&db, "provider:ovh").expect("ovh"), 839);
    assert_eq!(
        wallet::balance(&db, "revenue:domains").expect("revenue"),
        25
    );
}

#[test]
fn domain_order_cancelled_or_failed_releases_the_hold_and_frees_the_name() {
    let db = database("domain_order_released");
    let order = order();
    begin(&db, &order, NOW).expect("begin");
    ordered(&db, &order.hold, 7).expect("ordered");
    abandon(&db, &order.hold, "cancelled", NOW + 1).expect("cancel");
    assert_eq!(state(&db, "domains", &order.domain), None);
    assert_eq!(
        state(&db, "orders", &order.hold).as_deref(),
        Some("cancelled")
    );
    assert_eq!(
        wallet::balance(&db, &wallet::wallet("alice")).expect("balance"),
        2_000
    );
    assert_eq!(wallet::balance(&db, "provider:ovh").expect("ovh"), 0);
    // The name is free again: a new quote orders it, and OVH's refusal releases that one too.
    let again = Order {
        hold: "domain:alice:atome-test.fr:q2".into(),
        ..order
    };
    begin(&db, &again, NOW + 2).expect("again");
    abandon(&db, &again.hold, "failed", NOW + 3).expect("failed");
    assert_eq!(state(&db, "domains", &again.domain), None);
    assert_eq!(
        wallet::balance(&db, &wallet::wallet("alice")).expect("balance"),
        2_000
    );
}

#[test]
fn domain_order_refused_by_the_guard_records_nothing() {
    let db = database("domain_order_refused");
    let mut poor = order();
    poor.quote["total_cents"] = json!(2_001);
    assert_eq!(
        begin(&db, &poor, NOW),
        Err("money_insufficient_balance".into())
    );
    guard::set_controls(
        &db,
        "global",
        &json!({ "realSpending": false }),
        "test",
        NOW,
    )
    .expect("off");
    assert_eq!(
        begin(&db, &order(), NOW),
        Err("money_real_spending_off".into())
    );
}
