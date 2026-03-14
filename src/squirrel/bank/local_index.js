const normalizeText = (value) => String(value || '').trim();

const toFiniteNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
};

const toTimestamp = (value, fallback = 0) => {
    const direct = toFiniteNumber(value, null);
    if (direct != null) return direct;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toIso = (value) => {
    const timestamp = toTimestamp(value, null);
    return timestamp != null ? new Date(timestamp).toISOString() : null;
};

export const normalizeBankAccountRecord = (record = {}) => ({
    account_id: normalizeText(record.account_id || record.accountId || record.id || ''),
    label: normalizeText(record.label || record.name || record.display_name || ''),
    iban: normalizeText(record.iban || ''),
    currency: normalizeText(record.currency || 'EUR').toUpperCase() || 'EUR',
    balance: toFiniteNumber(record.balance, 0),
    available_balance: toFiniteNumber(record.available_balance ?? record.availableBalance ?? record.balance, 0),
    type: normalizeText(record.type || record.account_type || 'checking') || 'checking',
    institution: normalizeText(record.institution || record.bank_name || record.provider || ''),
    updated_at: toIso(record.updated_at || record.updatedAt || Date.now()),
    raw: record
});

export const normalizeBankTransactionRecord = (record = {}) => {
    const amount = toFiniteNumber(record.amount, 0);
    const type = normalizeText(record.type || (amount < 0 ? 'debit' : 'credit')).toLowerCase() || (amount < 0 ? 'debit' : 'credit');
    const merchant = normalizeText(record.merchant || record.merchant_name || record.shop || '');
    const payer = normalizeText(record.payer || record.counterparty || record.counterparty_name || record.sender || '');
    return {
        transaction_id: normalizeText(record.transaction_id || record.transactionId || record.id || ''),
        account_id: normalizeText(record.account_id || record.accountId || ''),
        amount,
        currency: normalizeText(record.currency || 'EUR').toUpperCase() || 'EUR',
        type,
        label: normalizeText(record.label || record.wording || record.description || ''),
        merchant,
        payer,
        counterparty: normalizeText(record.counterparty || payer || merchant || ''),
        category: normalizeText(record.category || record.category_name || ''),
        booked_at: toTimestamp(record.booked_at || record.bookedAt || record.date || record.operation_date, 0),
        booked_at_iso: toIso(record.booked_at || record.bookedAt || record.date || record.operation_date),
        metadata: record.metadata && typeof record.metadata === 'object' ? { ...record.metadata } : {},
        raw: record
    };
};

const byNewestTransaction = (left, right) => (right.booked_at || 0) - (left.booked_at || 0);

export const createBankIndex = () => {
    const accounts = new Map();
    const transactions = new Map();

    const listTransactions = ({
        account_id = null,
        type = null,
        start = null,
        end = null,
        limit = 100
    } = {}) => {
        const startTs = start ? toTimestamp(start, 0) : null;
        const endTs = end ? toTimestamp(end, 0) : null;
        return Array.from(transactions.values())
            .filter((entry) => !account_id || entry.account_id === String(account_id))
            .filter((entry) => !type || entry.type === String(type))
            .filter((entry) => startTs == null || entry.booked_at >= startTs)
            .filter((entry) => endTs == null || entry.booked_at <= endTs)
            .sort(byNewestTransaction)
            .slice(0, Math.max(1, Math.round(Number(limit) || 100)))
            .map((entry) => ({ ...entry }));
    };

    return {
        upsertAccounts(items = []) {
            const list = Array.isArray(items) ? items : [items];
            const records = list
                .map((entry) => normalizeBankAccountRecord(entry))
                .filter((entry) => entry.account_id);
            records.forEach((entry) => {
                accounts.set(entry.account_id, entry);
            });
            return records.map((entry) => ({ ...entry }));
        },
        upsertTransactions(items = []) {
            const list = Array.isArray(items) ? items : [items];
            const records = list
                .map((entry) => normalizeBankTransactionRecord(entry))
                .filter((entry) => entry.transaction_id);
            records.forEach((entry) => {
                transactions.set(entry.transaction_id, entry);
            });
            return records.map((entry) => ({ ...entry }));
        },
        listAccounts() {
            return Array.from(accounts.values())
                .sort((left, right) => String(left.label || '').localeCompare(String(right.label || '')))
                .map((entry) => ({ ...entry }));
        },
        readAccount(accountId) {
            const record = accounts.get(String(accountId || ''));
            return record ? { ...record } : null;
        },
        listTransactions,
        readTransaction(transactionId) {
            const record = transactions.get(String(transactionId || ''));
            return record ? { ...record } : null;
        },
        searchTransactions(query, options = {}) {
            const needle = normalizeText(query).toLowerCase();
            return listTransactions(options).filter((entry) => [
                entry.label,
                entry.merchant,
                entry.payer,
                entry.counterparty,
                entry.category
            ].some((value) => normalizeText(value).toLowerCase().includes(needle)));
        },
        stats() {
            return {
                accounts: accounts.size,
                transactions: transactions.size
            };
        }
    };
};
