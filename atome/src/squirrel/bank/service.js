import { createBankIndex } from './local_index.js';

const normalizeText = (value) => String(value || '').trim();

const toTimestamp = (value, fallback = null) => {
    if (value === null || value === undefined || value === '') return fallback;
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toRange = (options = {}, now = () => Date.now()) => {
    const reference = toTimestamp(options.reference, now()) || now();
    if (options.start || options.end) {
        return {
            start: toTimestamp(options.start, null),
            end: toTimestamp(options.end, null)
        };
    }
    const period = normalizeText(options.period || '').toLowerCase();
    const date = new Date(reference);
    if (period === 'current_week' || period === 'week' || period === 'this_week') {
        const weekday = date.getDay() || 7;
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (weekday - 1), 0, 0, 0, 0).getTime();
        const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (7 - weekday), 23, 59, 59, 999).getTime();
        return { start, end };
    }
    if (period === 'current_month' || period === 'month' || period === 'this_month') {
        const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0).getTime();
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        return { start, end };
    }
    return { start: null, end: null };
};

const formatMoney = (amount = 0, currency = 'EUR') => `${amount.toFixed(2)} ${currency}`;

const recurringKeyFor = (transaction = {}) => {
    const base = normalizeText(transaction.merchant || transaction.counterparty || transaction.label).toLowerCase();
    const amount = Math.abs(Number(transaction.amount || 0)).toFixed(2);
    return `${base}|${amount}|${transaction.currency || 'EUR'}`;
};

const groupBy = (items = [], keyBuilder) => {
    const map = new Map();
    items.forEach((entry) => {
        const key = keyBuilder(entry);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(entry);
    });
    return map;
};

export const createBankService = ({
    index = createBankIndex(),
    now = () => Date.now()
} = {}) => ({
    index,
    ingestAccounts(items = []) {
        const records = index.upsertAccounts(items);
        return {
            ok: true,
            ingested: records.length,
            stats: index.stats()
        };
    },
    ingestTransactions(items = []) {
        const records = index.upsertTransactions(items);
        return {
            ok: true,
            ingested: records.length,
            stats: index.stats()
        };
    },
    bankAccounts() {
        return {
            ok: true,
            items: index.listAccounts(),
            stats: index.stats()
        };
    },
    bankBalance(options = {}) {
        const accountId = normalizeText(options.account_id || options.accountId || '');
        if (!accountId) {
            const items = index.listAccounts();
            const total = items.reduce((sum, entry) => sum + Number(entry.balance || 0), 0);
            return {
                ok: true,
                total_balance: total,
                currency: items[0]?.currency || 'EUR',
                items
            };
        }
        const account = index.readAccount(accountId);
        if (!account) {
            return { ok: false, error: 'bank_account_not_found', account_id: accountId };
        }
        return {
            ok: true,
            account
        };
    },
    bankTransactions(options = {}) {
        const range = toRange(options, now);
        return {
            ok: true,
            items: index.listTransactions({
                account_id: options.account_id || options.accountId || null,
                type: options.type || null,
                start: range.start,
                end: range.end,
                limit: options.limit || 100
            })
        };
    },
    bankSummary(options = {}) {
        const range = toRange(options, now);
        const items = index.listTransactions({
            account_id: options.account_id || options.accountId || null,
            start: range.start,
            end: range.end,
            limit: options.limit || 500
        });
        const debit = items.filter((entry) => Number(entry.amount) < 0).reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);
        const credit = items.filter((entry) => Number(entry.amount) > 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const currency = items[0]?.currency || index.listAccounts()[0]?.currency || 'EUR';
        return {
            ok: true,
            debit_total: debit,
            credit_total: credit,
            net_total: credit - debit,
            currency,
            summary: `Depenses: ${formatMoney(debit, currency)}. Entrees: ${formatMoney(credit, currency)}. Net: ${formatMoney(credit - debit, currency)}.`,
            items
        };
    },
    bankSearchTransactions(query, options = {}) {
        return {
            ok: true,
            query: normalizeText(query),
            items: index.searchTransactions(query, {
                account_id: options.account_id || options.accountId || null,
                start: options.start,
                end: options.end,
                limit: options.limit || 100
            })
        };
    },
    bankFindPayer(name, options = {}) {
        const needle = normalizeText(name).toLowerCase();
        const range = toRange(options, now);
        const items = index.listTransactions({
            account_id: options.account_id || options.accountId || null,
            start: range.start,
            end: range.end,
            limit: options.limit || 500
        }).filter((entry) => Number(entry.amount) > 0)
            .filter((entry) => [
                entry.payer,
                entry.counterparty,
                entry.label
            ].some((value) => normalizeText(value).toLowerCase().includes(needle)));
        return {
            ok: true,
            name: normalizeText(name),
            paid: items.length > 0,
            items
        };
    },
    bankSpendingByPeriod(options = {}) {
        const range = toRange(options, now);
        const granularity = normalizeText(options.granularity || 'day').toLowerCase() || 'day';
        const items = index.listTransactions({
            account_id: options.account_id || options.accountId || null,
            start: range.start,
            end: range.end,
            limit: options.limit || 1000
        }).filter((entry) => Number(entry.amount) < 0);
        const buckets = groupBy(items, (entry) => {
            const date = new Date(entry.booked_at);
            if (granularity === 'month') {
                return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
            }
            if (granularity === 'week') {
                const weekday = date.getUTCDay() || 7;
                const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - (weekday - 1)));
                return monday.toISOString().slice(0, 10);
            }
            return date.toISOString().slice(0, 10);
        });
        const breakdown = Array.from(buckets.entries()).map(([bucket, entries]) => ({
            bucket,
            amount: entries.reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0),
            count: entries.length
        })).sort((left, right) => String(left.bucket).localeCompare(String(right.bucket)));
        return {
            ok: true,
            granularity,
            total_spent: breakdown.reduce((sum, entry) => sum + entry.amount, 0),
            breakdown
        };
    },
    bankSpendingTopMerchants(options = {}) {
        const range = toRange(options, now);
        const items = index.listTransactions({
            account_id: options.account_id || options.accountId || null,
            start: range.start,
            end: range.end,
            limit: options.limit || 1000
        }).filter((entry) => Number(entry.amount) < 0);
        const grouped = groupBy(items, (entry) => normalizeText(entry.merchant || entry.counterparty || entry.label).toLowerCase() || 'unknown');
        const merchants = Array.from(grouped.entries()).map(([merchant, entries]) => ({
            merchant,
            amount: entries.reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0),
            count: entries.length,
            currency: entries[0]?.currency || 'EUR'
        })).sort((left, right) => right.amount - left.amount);
        return {
            ok: true,
            items: merchants.slice(0, Math.max(1, Math.round(Number(options.limit) || 5)))
        };
    },
    bankRecurringPayments(options = {}) {
        const items = index.listTransactions({
            account_id: options.account_id || options.accountId || null,
            limit: options.limit || 2000
        }).filter((entry) => Number(entry.amount) < 0);
        const grouped = groupBy(items, recurringKeyFor);
        const recurring = Array.from(grouped.entries())
            .filter(([, entries]) => entries.length >= 2)
            .map(([signature, entries]) => ({
                signature,
                merchant: entries[0]?.merchant || entries[0]?.counterparty || entries[0]?.label || 'unknown',
                amount: Math.abs(Number(entries[0]?.amount || 0)),
                currency: entries[0]?.currency || 'EUR',
                occurrences: entries.length,
                latest_at: entries.sort((left, right) => right.booked_at - left.booked_at)[0]?.booked_at_iso || null
            }))
            .sort((left, right) => right.occurrences - left.occurrences);
        return {
            ok: true,
            items: recurring
        };
    }
});
