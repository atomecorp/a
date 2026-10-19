import { BILLING_PERIOD_MS, BILLING_PLANS, BILLING_SOURCES, findBillingProduct } from '../../atome/src/shared/billing_contract.js';

// Owner of purchases, entitlements and the credit ledger. Every store proof
// (StoreKit, Google Play, Stripe, or the development simulation) ends in
// `applyPurchase`; the active plan and both credit balances are derived from
// rows, never stored as mutable totals. Included credits belong to one paid
// period and lapse with it; purchased credits never lapse.
export const createBillingLedger = ({ query, transaction, now = Date.now } = {}) => {
    if (typeof query !== 'function' || typeof transaction !== 'function') throw new Error('billing_ledger_storage_required');
    const sum = async (sql, params) => Number((await query('get', sql, params))?.total || 0);
    const activePlan = (principal) => query('get', `SELECT * FROM billing_purchases
        WHERE principal_id = ? AND revoked_ms IS NULL AND period_end_ms > ? AND product_id LIKE 'one.atome.plan.%'
        ORDER BY period_end_ms DESC LIMIT 1`, [principal, now()]);
    const balances = async (principal) => {
        const current = await activePlan(principal);
        const included = current ? await sum(`SELECT SUM(credits) AS total FROM billing_credit_ledger
            WHERE principal_id = ? AND bucket = 'included' AND period_ref = ?`, [principal, current.purchase_ref]) : 0;
        const purchased = await sum(`SELECT SUM(credits) AS total FROM billing_credit_ledger
            WHERE principal_id = ? AND bucket = 'purchased'`, [principal]);
        return { current, included, purchased };
    };
    const record = (entryRef, principal, bucket, credits, periodRef, reason) => query('run',
        `INSERT INTO billing_credit_ledger (entry_ref, principal_id, bucket, credits, period_ref, reason, recorded_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(entry_ref) DO NOTHING`,
        [entryRef, principal, bucket, credits, periodRef, reason, now()]);

    return {
        // Idempotent per store transaction. A transaction already bound to
        // another principal is refused: a receipt cannot be replayed elsewhere.
        async applyPurchase(principal, { source, transactionId, originalTransactionId, productId, periodStartMs = null, periodEndMs = null }) {
            const product = findBillingProduct(productId);
            if (!principal || !product) throw new Error('billing_product_unknown');
            if (!BILLING_SOURCES.includes(source) || !transactionId) throw new Error('billing_proof_invalid');
            if (product.kind === 'plan' && !(Number(periodEndMs) > Number(periodStartMs))) throw new Error('billing_period_invalid');
            const purchaseRef = `${source}:${transactionId}`;
            // Each statement is idempotent and the grant follows the ownership
            // check, so this also runs inside a caller's open transaction.
            const inserted = await query('run', `INSERT INTO billing_purchases (purchase_ref, principal_id, source, product_id, original_ref,
                period_start_ms, period_end_ms, recorded_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(purchase_ref) DO NOTHING`,
            [purchaseRef, principal, source, productId, `${source}:${originalTransactionId || transactionId}`,
                product.kind === 'plan' ? periodStartMs : null, product.kind === 'plan' ? periodEndMs : null, now()]);
            const owner = await query('get', 'SELECT principal_id FROM billing_purchases WHERE purchase_ref = ?', [purchaseRef]);
            if (owner?.principal_id !== principal) throw new Error('billing_purchase_owned_elsewhere');
            if (product.kind === 'plan') await record(`included:${purchaseRef}`, principal, 'included', product.monthlyCredits, purchaseRef, 'plan_period');
            else await record(`pack:${purchaseRef}`, principal, 'purchased', product.credits, null, 'credit_pack');
            return { purchaseRef, created: Number(inserted?.changes) === 1 };
        },
        // The account-creation payment is still simulated: it opens one real
        // period of the base plan, recorded with source `simulated`.
        async applySimulatedPlan(principal) {
            const product = BILLING_PLANS[0];
            const start = now();
            await this.applyPurchase(principal, { source: 'simulated', transactionId: `${principal}:${start}`,
                productId: product.productId, periodStartMs: start, periodEndMs: start + BILLING_PERIOD_MS });
            return { mode: 'simulated', productId: product.productId, amountCents: product.priceCents, currency: product.currency, period: product.period };
        },
        // The account that holds a store subscription (or one-time purchase):
        // renewals and restores of the same original transaction stay with it.
        async ownerOfOriginal(source, originalTransactionId) {
            const row = await query('get', 'SELECT principal_id FROM billing_purchases WHERE original_ref = ? LIMIT 1',
                [`${source}:${originalTransactionId}`]);
            return row?.principal_id || null;
        },
        // Refund or chargeback: the plan stops and an unspent pack is withdrawn.
        async revokePurchase(source, transactionId) {
            const purchaseRef = `${source}:${transactionId}`;
            return transaction(async () => {
                const purchase = await query('get', 'SELECT * FROM billing_purchases WHERE purchase_ref = ?', [purchaseRef]);
                if (!purchase || purchase.revoked_ms !== null) return { revoked: false };
                await query('run', 'UPDATE billing_purchases SET revoked_ms = ? WHERE purchase_ref = ?', [now(), purchaseRef]);
                const product = findBillingProduct(purchase.product_id);
                if (product?.kind === 'pack') await record(`revoke:${purchaseRef}`, purchase.principal_id, 'purchased', -product.credits, null, 'pack_revoked');
                return { revoked: true };
            });
        },
        async status(principal) {
            const { current, included, purchased } = await balances(principal);
            const product = current ? findBillingProduct(current.product_id) : null;
            return {
                plan: product ? { productId: product.productId, tier: product.tier, source: current.source,
                    periodEndMs: Number(current.period_end_ms), storageBytes: product.storageBytes } : null,
                credits: { included: Math.max(0, included), purchased, total: Math.max(0, included) + purchased }
            };
        },
        // Debits real usage after a provider call, included credits first. The
        // purchased bucket may go briefly negative by the last call's cost; the
        // next call is then refused by `authorize`.
        async debit(principal, credits, reference) {
            const amount = Math.ceil(Number(credits) || 0);
            if (amount <= 0) return { debited: 0 };
            return transaction(async () => {
                const { current, included } = await balances(principal);
                const fromIncluded = current ? Math.min(amount, Math.max(0, included)) : 0;
                if (fromIncluded) await record(`debit:${reference}:included`, principal, 'included', -fromIncluded, current.purchase_ref, 'usage');
                if (amount > fromIncluded) await record(`debit:${reference}:purchased`, principal, 'purchased', fromIncluded - amount, null, 'usage');
                return { debited: amount };
            });
        },
        async authorize(principal) {
            const { included, purchased } = await balances(principal);
            if (Math.max(0, included) + purchased <= 0) throw new Error('insufficient_quota');
        }
    };
};
