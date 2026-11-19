// The money ledger's tables (billing/wallet.rs, billing/guard.rs; R-193): one double-entry ledger
// in whole euro cents, append-only. A transaction is keyed once by its reference (idempotence);
// its legs sum to zero; a balance is the sum of an account's legs, never a stored total.
// Holds reserve money before a provider is called; controls keep the administrators' budgets,
// ceilings and the real-spending switch; invite terms say what an invitation's activation costs.

pub(super) const MONEY: [&str; 13] = [
    r#"CREATE TABLE IF NOT EXISTS money_accounts (
        principal_id TEXT PRIMARY KEY,
        environment TEXT NOT NULL CHECK(environment IN ('real', 'test')),
        activation_ref TEXT NOT NULL,
        activated_ms INTEGER NOT NULL,
        storage_from_ms INTEGER NOT NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS money_transactions (
        txn_ref TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        principal_id TEXT,
        environment TEXT NOT NULL CHECK(environment IN ('real', 'test')),
        category TEXT,
        memo TEXT,
        meta TEXT,
        recorded_ms INTEGER NOT NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS money_legs (
        leg_id INTEGER PRIMARY KEY AUTOINCREMENT,
        txn_ref TEXT NOT NULL REFERENCES money_transactions(txn_ref),
        account TEXT NOT NULL,
        amount_cents INTEGER NOT NULL
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_money_legs_account ON money_legs(account)"#,
    r#"CREATE INDEX IF NOT EXISTS idx_money_transactions_principal ON money_transactions(principal_id, recorded_ms)"#,
    r#"CREATE TABLE IF NOT EXISTS money_holds (
        hold_ref TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        payer TEXT NOT NULL CHECK(payer IN ('wallet', 'test_budget')),
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
        state TEXT NOT NULL CHECK(state IN ('held', 'settled', 'released')),
        expires_ms INTEGER NOT NULL,
        created_ms INTEGER NOT NULL,
        closed_ms INTEGER
    )"#,
    r#"CREATE INDEX IF NOT EXISTS idx_money_holds_open ON money_holds(principal_id, state)"#,
    r#"CREATE TABLE IF NOT EXISTS money_meters (
        principal_id TEXT NOT NULL,
        payer TEXT NOT NULL,
        category TEXT NOT NULL,
        pending_micro_cents INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (principal_id, payer, category)
    )"#,
    r#"CREATE TABLE IF NOT EXISTS money_controls (
        scope TEXT PRIMARY KEY,
        settings TEXT NOT NULL,
        updated_ms INTEGER NOT NULL,
        updated_by TEXT NOT NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS money_invite_terms (
        invite_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK(mode IN ('free', 'pay', 'discount')),
        discount_pct INTEGER NOT NULL DEFAULT 0 CHECK(discount_pct BETWEEN 0 AND 100),
        set_by TEXT NOT NULL,
        set_ms INTEGER NOT NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS money_admin_proposals (
        principal_id TEXT PRIMARY KEY,
        proposed_by TEXT NOT NULL,
        proposed_ms INTEGER NOT NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS money_payments (
        payment_ref TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_id TEXT UNIQUE,
        principal_id TEXT NOT NULL,
        beneficiary_id TEXT,
        purpose TEXT NOT NULL CHECK(purpose IN ('activation', 'topup')),
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        refunded_cents INTEGER NOT NULL DEFAULT 0,
        environment TEXT NOT NULL CHECK(environment IN ('real', 'test')),
        state TEXT NOT NULL CHECK(state IN ('open', 'paid', 'failed')),
        created_ms INTEGER NOT NULL,
        updated_ms INTEGER NOT NULL
    )"#,
    r#"CREATE TABLE IF NOT EXISTS money_client_proofs (
        key_id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL,
        environment TEXT NOT NULL CHECK(environment IN ('real', 'test')),
        verified_ms INTEGER NOT NULL
    )"#,
];
