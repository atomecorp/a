import assert from 'node:assert/strict';

import { BANK_V1_ARCHITECTURE_DECISION } from './connector_contract.js';
import { createBankService } from './service.js';

const service = createBankService({
    now: () => Date.parse('2026-03-13T12:00:00.000Z')
});

service.ingestAccounts([
    {
        account_id: 'bank_account_1',
        label: 'Compte courant',
        currency: 'EUR',
        balance: 1250.55,
        available_balance: 1240.55
    }
]);

service.ingestTransactions([
    {
        transaction_id: 'bank_tx_1',
        account_id: 'bank_account_1',
        amount: 1200,
        payer: 'Romeo',
        label: 'Virement Romeo',
        category: 'income',
        booked_at: '2026-03-03T10:00:00Z'
    },
    {
        transaction_id: 'bank_tx_2',
        account_id: 'bank_account_1',
        amount: -54.4,
        merchant: 'Monoprix',
        label: 'Courses Monoprix',
        category: 'groceries',
        booked_at: '2026-03-10T18:30:00Z'
    },
    {
        transaction_id: 'bank_tx_3',
        account_id: 'bank_account_1',
        amount: -14.9,
        merchant: 'Spotify',
        label: 'Abonnement Spotify',
        category: 'subscription',
        booked_at: '2026-02-10T08:00:00Z'
    },
    {
        transaction_id: 'bank_tx_4',
        account_id: 'bank_account_1',
        amount: -14.9,
        merchant: 'Spotify',
        label: 'Abonnement Spotify',
        category: 'subscription',
        booked_at: '2026-03-10T08:00:00Z'
    }
]);

assert.equal(BANK_V1_ARCHITECTURE_DECISION.read_source.id, 'powens_psd2', 'bank architecture decision should keep Powens as the v1 read source');

const accounts = service.bankAccounts();
assert.equal(accounts.ok, true, 'bank service should list normalized accounts');
assert.equal(accounts.items[0]?.account_id, 'bank_account_1', 'bank service should expose normalized account ids');

const balance = service.bankBalance({ account_id: 'bank_account_1' });
assert.equal(balance.ok, true, 'bank service should expose balances by account');
assert.equal(balance.account?.balance, 1250.55, 'bank service should expose the stored account balance');

const transactions = service.bankTransactions({ period: 'current_month' });
assert.equal(transactions.ok, true, 'bank service should expose transactions for the current month');
assert.equal(transactions.items.length, 3, 'bank service should filter transactions by period');

const summary = service.bankSummary({ period: 'current_month' });
assert.equal(summary.ok, true, 'bank service should expose a current period summary');
assert.match(summary.summary, /Depenses:/, 'bank summary should describe debit totals');

const search = service.bankSearchTransactions('monoprix');
assert.equal(search.ok, true, 'bank service should search transactions in natural language');
assert.equal(search.items[0]?.transaction_id, 'bank_tx_2', 'bank search should return matching transactions');

const payer = service.bankFindPayer('Romeo', { period: 'current_month' });
assert.equal(payer.ok, true, 'bank service should find incoming payers');
assert.equal(payer.paid, true, 'bank service should confirm that Romeo paid this month');

const spending = service.bankSpendingByPeriod({ period: 'current_month', granularity: 'day' });
assert.equal(spending.ok, true, 'bank service should aggregate spending by period');
assert.equal(spending.total_spent > 0, true, 'bank spending by period should total debit amounts');

const topMerchants = service.bankSpendingTopMerchants({ period: 'current_month', limit: 2 });
assert.equal(topMerchants.ok, true, 'bank service should expose top merchants');
assert.equal(topMerchants.items[0]?.merchant, 'monoprix', 'bank service should rank merchants by debit amount');

const recurring = service.bankRecurringPayments();
assert.equal(recurring.ok, true, 'bank service should detect recurring payments');
assert.equal(recurring.items[0]?.merchant, 'Spotify', 'bank recurring payments should detect repeated merchant charges');

console.log('bank_service: ok');
