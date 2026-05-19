import assert from 'node:assert/strict';

import { createGlobalBankApi } from './bootstrap.js';

const env = {};
const api = createGlobalBankApi({ env });

assert.equal(env.Squirrel.bank, api, 'bank bootstrap should expose a global Squirrel bank API');
assert.equal(env.atome.bank, api, 'bank bootstrap should expose a global atome bank API');
assert.equal(env.atome.tools.bank, api, 'bank bootstrap should expose bank under atome.tools');

api.ingestAccounts([
    {
        account_id: 'bank_bootstrap_account_1',
        label: 'Compte courant',
        currency: 'EUR',
        balance: 500
    }
]);

api.ingestTransactions([
    {
        transaction_id: 'bank_bootstrap_tx_1',
        account_id: 'bank_bootstrap_account_1',
        amount: -24.9,
        merchant: 'Netflix',
        label: 'Netflix',
        booked_at: '2026-03-13T09:00:00Z'
    }
]);

assert.equal(api.accounts().items[0]?.account_id, 'bank_bootstrap_account_1', 'bank bootstrap should use the shared bank service singleton');
assert.equal(api.summary().ok, true, 'bank bootstrap should expose analytical summary helpers');
assert.equal(api.topMerchants().items[0]?.merchant, 'netflix', 'bank bootstrap should expose merchant analytics through the shared service');

console.log('bank_bootstrap: ok');
