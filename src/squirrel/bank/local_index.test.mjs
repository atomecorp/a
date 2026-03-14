import assert from 'node:assert/strict';

import { createBankIndex, normalizeBankTransactionRecord } from './local_index.js';

const index = createBankIndex();

const accounts = index.upsertAccounts([
    {
        account_id: 'bank_account_1',
        label: 'Compte courant',
        currency: 'EUR',
        balance: 1250.55
    }
]);

assert.equal(accounts[0]?.account_id, 'bank_account_1', 'bank index should normalize account ids');

const normalized = normalizeBankTransactionRecord({
    transaction_id: 'bank_tx_1',
    account_id: 'bank_account_1',
    amount: -42.3,
    label: 'Restaurant',
    merchant: 'Bistro',
    booked_at: '2026-03-13T12:00:00Z'
});
assert.equal(normalized.type, 'debit', 'bank index should infer debit transactions from negative amounts');

index.upsertTransactions([
    normalized,
    {
        transaction_id: 'bank_tx_2',
        account_id: 'bank_account_1',
        amount: 900,
        payer: 'Romeo',
        label: 'Virement Romeo',
        booked_at: '2026-03-12T09:00:00Z'
    }
]);

assert.equal(index.listAccounts().length, 1, 'bank index should list ingested accounts');
assert.equal(index.listTransactions().length, 2, 'bank index should list ingested transactions');
assert.equal(index.searchTransactions('romeo').length, 1, 'bank index should search normalized transactions');

console.log('bank_local_index: ok');
