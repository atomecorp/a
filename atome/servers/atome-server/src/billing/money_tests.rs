// The money matrix of the cahier (R-193) on a real central database, schema included: activation,
// top-up, the 3 % on top, holds and concurrency, never below zero, idempotence, storage and AI
// counting down, the TestFlight lock, the administrators' controls, withdrawal, a balanced ledger.
use super::{admin, guard, money, usage, wallet};
use rusqlite::Connection;
use serde_json::{Value as JsonValue, json};

const DAY: i64 = 86_400_000;
const NOW: i64 = 1_800_000_000_000;

fn db() -> (tempfile::TempDir, Connection) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("central.db");
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    crate::central_schema::prepare(&path, &root).unwrap();
    let db = Connection::open(&path).unwrap();
    for user in ["alice", "bob", "boss", "owner"] {
        db.execute(
            "INSERT INTO atomes (atome_id, atome_type) VALUES (?, 'user')",
            [user],
        )
        .unwrap();
    }
    (directory, db)
}

fn key(db: &Connection, key: &str, user: &str, device: &str, platform: &str) {
    db.execute(
        "INSERT INTO auth_device_keys (key_id, principal_id, public_key, enrolled_ms, restricted_until_ms, device_id, platform)
         VALUES (?, ?, '{}', 0, 0, ?, ?)",
        rusqlite::params![key, user, device, platform],
    )
    .unwrap();
}

fn role(db: &Connection, user: &str, role: &str) {
    db.execute(
        "INSERT INTO auth_account_roles (principal_id, role, granted_ms, granted_by) VALUES (?, ?, 0, 'test')",
        [user, role],
    )
    .unwrap();
}

fn switch_on(db: &Connection) {
    guard::set_controls(
        db,
        "global",
        &json!({ "realSpending": true, "testBudgetMonthCents": 3400,
        "categoryMonthCents": { "ai": 1300, "domains": 2100 } }),
        "test",
        NOW,
    )
    .unwrap();
}

// A real account with `cents` of credit, paid through the provider's confirmed webhook.
fn real(db: &Connection, user: &str) {
    key(db, &format!("k-{user}"), user, &format!("d-{user}"), "web");
    let (reference, ..) = money::open_payment(
        db,
        user,
        &json!({ "purpose": "activation" }),
        "stripe",
        "real",
        NOW,
    )
    .unwrap();
    assert!(money::payment_confirmed(db, &reference, &format!("pi_{user}"), 1200, NOW).unwrap());
}

fn balance(db: &Connection, user: &str) -> i64 {
    wallet::balance(db, &wallet::wallet(user)).unwrap()
}

fn ledger_balanced(db: &Connection) {
    let total: i64 = db
        .query_row(
            "SELECT COALESCE(SUM(amount_cents), 0) FROM money_legs",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(total, 0, "every transaction sums to zero");
}

#[test]
fn activation_opens_the_whole_entry_as_credit_once() {
    let (_dir, db) = db();
    real(&db, "alice");
    assert_eq!(balance(&db, "alice"), 1200);
    // The provider's webhook arriving twice credits once.
    let reference: String = db
        .query_row("SELECT payment_ref FROM money_payments", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert!(!money::payment_confirmed(&db, &reference, "pi_alice", 1200, NOW).unwrap());
    assert_eq!(balance(&db, "alice"), 1200);
    assert!(
        money::open_payment(
            &db,
            "alice",
            &json!({ "purpose": "activation" }),
            "stripe",
            "real",
            NOW
        )
        .is_err()
    );
    ledger_balanced(&db);
}

#[test]
fn the_entry_is_free_from_the_minimum_and_becomes_credit_whole() {
    let (_dir, db) = db();
    key(&db, "k_carol", "carol", "d_carol", "web");
    let low = json!({ "purpose": "activation", "amountCents": 99 });
    assert_eq!(
        money::open_payment(&db, "carol", &low, "stripe", "real", NOW).unwrap_err(),
        "money_amount_too_small"
    );
    let chosen = json!({ "purpose": "activation", "amountCents": 300 });
    let (reference, amount, _) =
        money::open_payment(&db, "carol", &chosen, "stripe", "real", NOW).unwrap();
    assert_eq!(amount, 300);
    money::payment_confirmed(&db, &reference, "pi_carol", 300, NOW).unwrap();
    assert_eq!(balance(&db, "carol"), 300);
    ledger_balanced(&db);
}

#[test]
fn a_paid_amount_must_match() {
    let (_dir, db) = db();
    key(&db, "k", "alice", "d", "web");
    let (reference, ..) = money::open_payment(
        &db,
        "alice",
        &json!({ "purpose": "topup", "amountCents": 500 }),
        "stripe",
        "real",
        NOW,
    )
    .unwrap();
    assert_eq!(
        money::payment_confirmed(&db, &reference, "pi", 499, NOW).unwrap_err(),
        "money_payment_amount_mismatch"
    );
    assert!(
        money::open_payment(
            &db,
            "alice",
            &json!({ "purpose": "topup", "amountCents": 99 }),
            "stripe",
            "real",
            NOW
        )
        .is_err()
    );
}

#[test]
fn a_purchase_adds_three_percent_for_the_buyer_and_pays_the_supplier_whole() {
    let (_dir, db) = db();
    real(&db, "alice");
    switch_on(&db);
    guard::reserve(&db, "alice", "domains", 1030, "dom1", NOW).unwrap();
    guard::settle(
        &db,
        &guard::Settlement {
            hold: "dom1",
            supplier: "provider:ovh",
            supplier_cents: 1000,
            commission_cents: super::pricing::commission(1000),
            memo: "atelier-lune.fr".into(),
            meta: json!({}),
        },
        NOW,
    )
    .unwrap();
    assert_eq!(balance(&db, "alice"), 170);
    assert_eq!(wallet::balance(&db, "provider:ovh").unwrap(), 1000);
    assert_eq!(wallet::balance(&db, "revenue:domains").unwrap(), 30);
    assert_eq!(wallet::balance(&db, &wallet::hold("alice")).unwrap(), 0);
    ledger_balanced(&db);
}

#[test]
fn never_below_zero_even_at_the_same_time() {
    let (_dir, db) = db();
    real(&db, "alice");
    switch_on(&db);
    guard::reserve(&db, "alice", "domains", 1000, "first", NOW).unwrap();
    // The second purchase sees the money held by the first.
    assert_eq!(
        guard::reserve(&db, "alice", "domains", 1000, "second", NOW).unwrap_err(),
        "money_insufficient_balance"
    );
    guard::release(&db, "first", NOW).unwrap();
    assert_eq!(balance(&db, "alice"), 1200);
    guard::reserve(&db, "alice", "domains", 1000, "third", NOW).unwrap();
    assert_eq!(balance(&db, "alice"), 200);
    // An expired hold goes back by itself.
    guard::release_expired(&db, "alice", NOW + 16 * 60_000).unwrap();
    assert_eq!(balance(&db, "alice"), 1200);
    ledger_balanced(&db);
}

#[test]
fn the_switch_off_stops_every_real_spending() {
    let (_dir, db) = db();
    real(&db, "alice");
    assert_eq!(
        guard::reserve(&db, "alice", "ai", 5, "h", NOW).unwrap_err(),
        "money_real_spending_off"
    );
}

#[test]
fn testflight_and_test_accounts_spend_only_when_allowed() {
    let (_dir, db) = db();
    switch_on(&db);
    // A test account (simulated or sandbox payment): nothing without the allow-list.
    money::activate_new(&db, "bob", Some("test"), NOW).unwrap();
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "h1", NOW).unwrap_err(),
        guard::TESTFLIGHT_REFUSED
    );
    // Listed but no ceiling: still refused (AI quota 0 by default).
    role(&db, "bob", "tester");
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "h2", NOW).unwrap_err(),
        guard::TESTFLIGHT_REFUSED
    );
    guard::set_controls(
        &db,
        "account:bob",
        &json!({ "allowed": true, "categories": ["ai"], "perOpCents": 13,
        "perDayCents": 13, "perMonthCents": 21, "aiPromptsPerDay": 2 }),
        "boss",
        NOW,
    )
    .unwrap();
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "h3", NOW).unwrap()["payer"],
        "test_budget"
    );
    guard::reserve(&db, "bob", "ai", 5, "h4", NOW).unwrap();
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "h5", NOW).unwrap_err(),
        "money_budget_exceeded"
    );
    assert_eq!(
        guard::reserve(&db, "bob", "domains", 5, "h6", NOW).unwrap_err(),
        guard::TESTFLIGHT_REFUSED
    );
    // A real account on an unproven iOS install counts as TestFlight.
    real(&db, "alice");
    key(&db, "k-ios", "alice", "d-ios", "ios");
    assert!(guard::testflight(&db, "alice").unwrap());
    assert_eq!(
        guard::reserve(&db, "alice", "ai", 5, "h7", NOW).unwrap_err(),
        guard::TESTFLIGHT_REFUSED
    );
    money::record_client_proof(&db, "alice", "d-ios", "real", NOW).unwrap();
    assert!(!guard::testflight(&db, "alice").unwrap());
    assert_eq!(
        guard::reserve(&db, "alice", "ai", 5, "h8", NOW).unwrap()["payer"],
        "wallet"
    );
}

#[test]
fn storage_counts_down_by_the_day_and_atome_carries_it_at_zero() {
    let (_dir, db) = db();
    real(&db, "alice");
    usage::accrue_storage(&db, "alice", NOW + 30 * DAY).unwrap();
    usage::accrue_storage(&db, "alice", NOW + 30 * DAY).unwrap();
    assert_eq!(balance(&db, "alice"), 1200 - 515);
    usage::accrue_storage(&db, "alice", NOW + 90 * DAY).unwrap();
    assert_eq!(balance(&db, "alice"), 0);
    assert_eq!(wallet::balance(&db, "revenue:storage").unwrap(), 3 * 515);
    assert_eq!(
        wallet::balance(&db, "absorbed:storage").unwrap(),
        -(3 * 515 - 1200)
    );
    ledger_balanced(&db);
}

#[test]
fn ai_is_owed_to_the_provider_that_answered() {
    let (_dir, db) = db();
    real(&db, "alice");
    switch_on(&db);
    guard::reserve(&db, "alice", "ai", 5, "chat0", NOW).unwrap();
    // 3 cents of DeepSeek's cost: the supplier's part goes to DeepSeek, none to OpenAI.
    usage::settle_ai(&db, "chat0", "chat", "deepseek", 3_000_000, NOW).unwrap();
    assert_ne!(wallet::balance(&db, "provider:deepseek").unwrap(), 0);
    assert_eq!(wallet::balance(&db, "provider:openai").unwrap(), 0);
    ledger_balanced(&db);
}

#[test]
fn ai_is_paid_at_its_real_cost_plus_three_percent_without_losing_fractions() {
    let (_dir, db) = db();
    real(&db, "alice");
    switch_on(&db);
    for index in 0..3 {
        let hold = format!("ai{index}");
        guard::reserve(&db, "alice", "ai", 5, &hold, NOW).unwrap();
        // 0,4 cent of provider cost each: nothing taken until a whole cent adds up.
        usage::settle_ai(&db, &hold, "responses", "openai", 400_000, NOW).unwrap();
    }
    // 3 × 0,412 = 1,236 cents: one cent taken, the rest kept for the next call.
    assert_eq!(balance(&db, "alice"), 1199);
    ledger_balanced(&db);
}

#[test]
fn invitations_offer_or_discount_the_entry() {
    let (_dir, db) = db();
    role(&db, "boss", "admin");
    for (id, user, mode, pct) in [
        ("inv-free", "alice", "free", 0),
        ("inv-off", "bob", "discount", 34),
    ] {
        db.execute(
            "INSERT INTO auth_invites (invite_id, token_hash, inviter_principal, email_index, client_ref, created_ms, expires_ms, consumed_ms, consumed_by)
             VALUES (?, ?, 'boss', ?, ?, 0, 1, 1, ?)",
            rusqlite::params![id, id, id, id, user],
        )
        .unwrap();
        let terms = admin::invite_terms(Some(&json!({ "mode": mode, "discountPct": pct })))
            .unwrap()
            .unwrap();
        admin::record_invite_terms(&db, id, &terms, "boss", NOW).unwrap();
    }
    // Only an administrator offers.
    let terms = admin::invite_terms(Some(&json!({ "mode": "free" })))
        .unwrap()
        .unwrap();
    assert!(admin::record_invite_terms(&db, "x", &terms, "alice", NOW).is_err());
    assert_eq!(
        money::activate_new(&db, "alice", None, NOW).unwrap()["environment"],
        "real"
    );
    assert_eq!(balance(&db, "alice"), 1200);
    money::activate_new(&db, "bob", None, NOW).unwrap();
    key(&db, "k-bob", "bob", "d-bob", "web");
    let (reference, amount, _) = money::open_payment(
        &db,
        "bob",
        &json!({ "purpose": "activation" }),
        "stripe",
        "real",
        NOW,
    )
    .unwrap();
    assert_eq!(amount, 792);
    money::payment_confirmed(&db, &reference, "pi_bob", 792, NOW).unwrap();
    assert_eq!(balance(&db, "bob"), 1200);
    ledger_balanced(&db);
}

#[test]
fn a_sandbox_receipt_never_brings_money() {
    let (_dir, db) = db();
    assert_eq!(
        money::activate_new(&db, "alice", Some("test"), NOW).unwrap()["environment"],
        "test"
    );
    assert_eq!(balance(&db, "alice"), 0);
}

#[test]
fn withdrawal_gives_unused_top_ups_back_never_the_entry() {
    let (_dir, db) = db();
    real(&db, "alice");
    let (reference, ..) = money::open_payment(
        &db,
        "alice",
        &json!({ "purpose": "topup", "amountCents": 500 }),
        "stripe",
        "real",
        NOW,
    )
    .unwrap();
    money::payment_confirmed(&db, &reference, "pi_top", 500, NOW).unwrap();
    assert_eq!(
        money::status(&db, "alice", NOW).unwrap()["withdrawableCents"],
        500
    );
    assert!(money::plan_withdrawal(&db, "alice", 600, NOW).is_err());
    let plan = money::plan_withdrawal(&db, "alice", 500, NOW).unwrap();
    assert_eq!(plan, vec![("pi_top".to_string(), reference, 500)]);
    assert_eq!(balance(&db, "alice"), 1200);
    assert_eq!(
        money::status(&db, "alice", NOW).unwrap()["withdrawableCents"],
        0
    );
    ledger_balanced(&db);
}

#[test]
fn administrators_are_proposed_then_confirmed_by_the_owner() {
    let (_dir, db) = db();
    role(&db, "boss", "admin");
    role(&db, "owner", "owner");
    assert_eq!(
        admin::frame(&db, "admin.money", &json!({}), "alice", NOW).unwrap_err(),
        "money_admin_required"
    );
    assert_eq!(
        admin::frame(
            &db,
            "admin.confirm",
            &json!({ "principal": "alice" }),
            "owner",
            NOW
        )
        .unwrap_err(),
        "money_admin_not_proposed"
    );
    admin::frame(
        &db,
        "admin.propose",
        &json!({ "principal": "alice" }),
        "boss",
        NOW,
    )
    .unwrap();
    assert_eq!(
        admin::frame(
            &db,
            "admin.confirm",
            &json!({ "principal": "alice" }),
            "boss",
            NOW
        )
        .unwrap_err(),
        "money_owner_required"
    );
    admin::frame(
        &db,
        "admin.confirm",
        &json!({ "principal": "alice" }),
        "owner",
        NOW,
    )
    .unwrap();
    assert!(admin::is_admin(&db, "alice").unwrap());
    let set = admin::frame(
        &db,
        "admin.money.set",
        &json!({ "settings": { "realSpending": true } }),
        "alice",
        NOW,
    )
    .unwrap();
    assert_eq!(set["global"]["realSpending"], true);
    assert!(
        admin::frame(
            &db,
            "admin.money.set",
            &json!({ "settings": { "realSpending": "yes" } }),
            "alice",
            NOW
        )
        .is_err()
    );
}

#[test]
fn a_server_with_no_settings_answers_every_field() {
    let (_dir, db) = db();
    role(&db, "owner", "owner");
    role(&db, "alice", "tester");
    let shown = admin::frame(&db, "admin.money", &json!({}), "owner", NOW).unwrap();
    assert_eq!(shown["global"]["realSpending"], false);
    assert_eq!(shown["global"]["testBudgetMonthCents"], 0);
    assert_eq!(shown["global"]["categoryMonthCents"]["ai"], 0);
    assert_eq!(shown["global"]["categoryMonthCents"]["services"], 0);
    let alice = &shown["accounts"][0]["controls"];
    assert_eq!(alice["allowed"], false);
    assert_eq!(alice["categories"], json!([]));
    assert_eq!(alice["aiPromptsPerDay"], 0);
    let set = admin::frame(
        &db,
        "admin.money.set",
        &json!({ "settings": { "categoryMonthCents": { "ai": 2100 } } }),
        "owner",
        NOW,
    )
    .unwrap();
    assert_eq!(set["global"]["categoryMonthCents"]["ai"], 2100);
    assert_eq!(set["global"]["categoryMonthCents"]["shop"], 0);
    assert_eq!(set["global"]["realSpending"], false);
}

#[test]
fn everyone_spends_on_its_ceilings_and_the_block_list_is_refused() {
    let (_dir, db) = db();
    role(&db, "owner", "owner");
    switch_on(&db);
    // The white list by default: an account not on it is refused.
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "e1", NOW).unwrap_err(),
        guard::TESTFLIGHT_REFUSED
    );
    let set = |settings: JsonValue| {
        admin::frame(
            &db,
            "admin.money.set",
            &json!({ "settings": settings }),
            "owner",
            NOW,
        )
        .unwrap()
    };
    set(json!({ "accessMode": "all", "everyone": { "perDayCents": 13, "aiPromptsPerDay": 2 } }));
    // A month's ceiling still at zero refuses.
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "e2", NOW).unwrap_err(),
        "money_budget_exceeded"
    );
    let shown = set(json!({ "everyone": { "perMonthCents": 21 } }));
    assert_eq!(shown["global"]["everyone"]["perDayCents"], 13);
    assert_eq!(shown["global"]["accessMode"], "all");
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "e3", NOW).unwrap()["payer"],
        "test_budget"
    );
    // Everyone is on the AI alone.
    assert_eq!(
        guard::reserve(&db, "bob", "domains", 5, "e4", NOW).unwrap_err(),
        guard::TESTFLIGHT_REFUSED
    );
    assert_eq!(
        admin::frame(
            &db,
            "admin.money.set",
            &json!({ "settings": { "accessMode": "some" } }),
            "owner",
            NOW
        )
        .unwrap_err(),
        "money_value_invalid:accessMode:\"some\""
    );
    // On the block list: refused, then back.
    let blocked = admin::frame(
        &db,
        "admin.account.set",
        &json!({ "principal": "bob", "settings": { "blocked": true } }),
        "owner",
        NOW,
    )
    .unwrap();
    assert_eq!(blocked["blocked"][0]["principal_id"], "bob");
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "e5", NOW).unwrap_err(),
        guard::TESTFLIGHT_REFUSED
    );
    admin::frame(
        &db,
        "admin.account.set",
        &json!({ "principal": "bob", "settings": { "blocked": false } }),
        "owner",
        NOW,
    )
    .unwrap();
    assert_eq!(
        guard::reserve(&db, "bob", "ai", 5, "e6", NOW).unwrap()["payer"],
        "test_budget"
    );
}

#[test]
fn an_account_is_found_by_its_phone() {
    let (_dir, db) = db();
    role(&db, "owner", "owner");
    db.execute(
        "INSERT INTO principal_phone_credentials (principal_id, normalized_phone, verified_at) VALUES ('bob', '+33612345678', '2026-11-24')",
        [],
    )
    .unwrap();
    let found = admin::frame(
        &db,
        "admin.account.find",
        &json!({ "phone": "+33 6 12 34 56 78" }),
        "owner",
        NOW,
    )
    .unwrap();
    assert_eq!(found["account"]["principal_id"], "bob");
    assert_eq!(found["account"]["phone"], "+33612345678");
    assert_eq!(found["account"]["listed"], false);
    assert_eq!(
        admin::frame(
            &db,
            "admin.account.find",
            &json!({ "phone": "+33 7 00" }),
            "owner",
            NOW
        )
        .unwrap_err(),
        "money_account_not_found"
    );
}

#[test]
fn a_roles_table_made_before_the_block_list_takes_it_and_keeps_its_rows() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("central.db");
    Connection::open(&path)
        .unwrap()
        .execute_batch(
            "CREATE TABLE auth_account_roles (principal_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'tester', 'owner')),
                granted_ms INTEGER NOT NULL, granted_by TEXT NOT NULL, PRIMARY KEY (principal_id, role));
             INSERT INTO auth_account_roles VALUES ('boss', 'owner', 1, 'root');",
        )
        .unwrap();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    crate::central_schema::prepare(&path, &root).unwrap();
    let db = Connection::open(&path).unwrap();
    role(&db, "bob", "blocked");
    let held: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM auth_account_roles WHERE (principal_id, role) IN (VALUES ('boss', 'owner'), ('bob', 'blocked'))",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(held, 2);
}
