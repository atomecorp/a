// Domains & mail of the websites (decisions Q13, Q14, Q15, Q16 of todo/publication_web_2026-10-28.md).
// - A domain the user already has is connected by proof (a TXT record) and a CNAME to atome; once its DNS answers and
//   its certificate is issued (ATOME_SITE_CERT_COMMAND, the production's certbot step), its host serves the site.
// - Buying, transferring, DNS records, renewals and mail boxes go through a SIMULATED provider: nothing is bought,
//   nothing is charged, and every answer says so. Each charge is still written to a ledger keeping the provider's cost,
//   atome's share (3 % at least, rounded up to the cent, included in the price, never shown apart) and the tax apart.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promises as dnsPromises } from 'node:dns';

const TLD_PROVIDER_CENTS = Object.freeze({ fr: 699, com: 1099, net: 1199, org: 1099, eu: 599, shop: 199, site: 299 });
const TLD_RENEW_CENTS = Object.freeze({ shop: 2499, site: 2499 });
const HOUR = 3600_000;
const TAX_RATE = 0.2;
const COMMISSION_RATE = 0.03;
const QUOTE_HOLD_MS = 15 * 60_000;
const MAILBOX_CENTS_PER_MONTH = 149;
const MAILBOX_QUOTA_GB = 5;
export const SITE_CNAME_TARGET = 'sites.atome.one';
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const fail = error => ({ ok: false, error });
const parse = value => { try { return JSON.parse(value); } catch { return []; } };

// The price the user sees: the provider's cost with atome's share included, then the tax.
export const domainPrice = providerCents => {
    const price = providerCents + Math.ceil(providerCents * COMMISSION_RATE);
    const tax = Math.round(price * TAX_RATE);
    return { provider_cents: providerCents, price_cents: price, commission_cents: price - providerCents, tax_cents: tax, total_cents: price + tax };
};
// What the user is shown of a price: the price (atome's share inside it), the tax, the total; never the provider's cost.
const shownPrice = ({ price_cents, tax_cents, total_cents }) => ({ price_cents, tax_cents, total_cents });
// The simulated registry: a name is taken when its hash says so (stable, so a search answers the same twice).
const takenInSimulation = domain => crypto.createHash('sha256').update(domain).digest()[0] % 4 === 0;

export function createSiteDomains({ query, store, publishing, resolver = dnsPromises, certCommand = process.env.ATOME_SITE_CERT_COMMAND || '',
    hosting = async () => ({}), now = () => Date.now() }) {
    const one = (sql, params) => query('get', sql, params), run = (sql, params) => query('run', sql, params);
    const owned = async (ownerId, domain) => { const row = await one('SELECT * FROM site_domains WHERE domain = ?', [domain]); return row?.owner_id === ownerId ? row : null; };
    const normalized = value => String(value || '').trim().toLowerCase().replace(/\.$/, '');
    const quotes = new Map();
    const ledger = (ownerId, domain, kind, price, ref) => run(`INSERT INTO site_domain_ledger (entry_ref, owner_id, domain, kind, provider_cents, commission_cents, tax_cents, total_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(entry_ref) DO NOTHING`, [ref, ownerId, domain, kind, price.provider_cents, price.commission_cents, price.tax_cents, price.total_cents]);
    const managedRecords = domain => [{ type: 'A', name: '@', value: 'atome', managed: true }, { type: 'CNAME', name: 'www', value: SITE_CNAME_TARGET, managed: true },
        { type: 'MX', name: '@', value: 'mail.atome.one', priority: 10, managed: true }, { type: 'TXT', name: '@', value: 'v=spf1 include:atome.one ~all', managed: false }];
    const yearLater = () => new Date(now() + 365 * 24 * HOUR).toISOString();

    const search = async ({ name }) => {
        const label = normalized(name).replace(/\..*$/, '');
        if (!LABEL.test(label)) return fail('DOMAIN_INVALID');
        const results = [];
        for (const tld of ['fr', 'com', 'shop', 'net', 'eu', 'org']) {
            const domain = `${label}.${tld}`, known = await one('SELECT domain FROM site_domains WHERE domain = ?', [domain]);
            results.push({ domain, free: !known && !takenInSimulation(domain), ...shownPrice(domainPrice(TLD_PROVIDER_CENTS[tld])), first_year: !!TLD_RENEW_CENTS[tld] });
        }
        return { ok: true, simulated: true, results };
    };
    const quote = async ({ domain: input }) => {
        const domain = normalized(input), tld = domain.split('.').pop();
        if (!DOMAIN.test(domain) || !TLD_PROVIDER_CENTS[tld]) return fail('DOMAIN_INVALID');
        if (takenInSimulation(domain) || await one('SELECT domain FROM site_domains WHERE domain = ?', [domain])) return fail('DOMAIN_TAKEN');
        const entry = { domain, years: 1, ...domainPrice(TLD_PROVIDER_CENTS[tld]), renew: domainPrice(TLD_RENEW_CENTS[tld] || TLD_PROVIDER_CENTS[tld]),
            held_until: new Date(now() + QUOTE_HOLD_MS).toISOString(), simulated: true };
        quotes.set(domain, entry);
        return { ok: true, quote: { domain, years: 1, ...shownPrice(entry), renew: shownPrice(entry.renew), held_until: entry.held_until, simulated: true } };
    };
    const buy = async (ownerId, { domain: input, renew = true, site_id: siteId = '' }) => {
        const domain = normalized(input), held = quotes.get(domain);
        if (!held || Date.parse(held.held_until) < now()) return fail('QUOTE_EXPIRED');
        if (await one('SELECT domain FROM site_domains WHERE domain = ?', [domain])) return fail('DOMAIN_TAKEN');
        await ledger(ownerId, domain, 'buy', held, `buy:${domain}`);
        await run(`INSERT INTO site_domains (domain, owner_id, state, expires_at, auto_renew, records_json) VALUES (?, ?, 'active', ?, ?, ?)`,
            [domain, ownerId, yearLater(), renew === false ? 0 : 1, JSON.stringify(managedRecords(domain))]);
        quotes.delete(domain);
        const attached = siteId ? await attach(ownerId, siteId, domain, 'active') : null;
        return { ok: true, simulated: true, domain, total_cents: held.total_cents, ...(attached?.ok ? { site: attached.site } : {}) };
    };
    const attach = async (ownerId, siteId, domain, state) => {
        const claimed = await publishing.ensureRow(ownerId, siteId);
        if (!claimed.ok) return claimed;
        const row = claimed.row;
        const holder = await store.byDomain(domain);
        if (holder && holder.site_id !== siteId) return fail('DOMAIN_TAKEN');
        const token = row.domain === domain && row.domain_token ? row.domain_token : crypto.randomBytes(8).toString('hex');
        await store.update(siteId, { domain, domain_state: state, domain_token: token });
        return { ok: true, site: await publishing.writeStatus(ownerId, siteId), records: proofRecords(domain, token) };
    };
    const proofRecords = (domain, token) => [{ type: 'TXT', name: `_atome.${domain}`, value: `atome-verify=${token}` }, { type: 'CNAME', name: domain, value: SITE_CNAME_TARGET }];
    const connect = async (ownerId, { site_id: siteId, domain: input }) => {
        const domain = normalized(input);
        if (!DOMAIN.test(domain)) return fail('DOMAIN_INVALID');
        return attach(ownerId, siteId, domain, 'pending');
    };
    const issueCertificate = domain => new Promise(resolve => {
        if (!certCommand) return resolve(false);
        execFile(certCommand, [domain], { timeout: 120_000 }, error => resolve(!error));
    });
    const verify = async (ownerId, { site_id: siteId }) => {
        const row = await store.site(siteId);
        if (!row || row.owner_id !== ownerId || !row.domain) return fail('NOT_FOUND');
        const txt = (await resolver.resolveTxt(`_atome.${row.domain}`).catch(() => [])).map(parts => parts.join(''));
        const cname = await resolver.resolveCname(row.domain).catch(() => []);
        const steps = { domain: true, dns: txt.includes(`atome-verify=${row.domain_token}`) && cname.map(normalized).includes(SITE_CNAME_TARGET), certificate: false };
        if (steps.dns) steps.certificate = row.domain_state === 'active' || await issueCertificate(row.domain);
        const state = steps.certificate ? 'active' : (steps.dns ? 'certificate_pending' : 'pending');
        await store.update(siteId, { domain_state: state });
        return { ok: true, steps, site: await publishing.writeStatus(ownerId, siteId), records: proofRecords(row.domain, row.domain_token) };
    };
    const primary = async (ownerId, { site_id: siteId, primary: value }) => {
        const row = await store.site(siteId);
        if (!row || row.owner_id !== ownerId) return fail('NOT_FOUND');
        if (value === 'domain' && row.domain_state !== 'active') return fail('DOMAIN_NOT_VERIFIED');
        await store.update(siteId, { primary_host: value === 'domain' ? 'domain' : 'atome' });
        return { ok: true, site: await publishing.writeStatus(ownerId, siteId) };
    };
    const unlink = async (ownerId, { site_id: siteId }) => {
        const row = await store.site(siteId);
        if (!row || row.owner_id !== ownerId) return fail('NOT_FOUND');
        await store.update(siteId, { domain: null, domain_state: null, domain_token: null, primary_host: 'atome' });
        return { ok: true, site: await publishing.writeStatus(ownerId, siteId) };
    };
    const transfer = async (ownerId, { domain: input, code }) => {
        const domain = normalized(input), tld = domain.split('.').pop();
        if (!DOMAIN.test(domain) || !TLD_PROVIDER_CENTS[tld] || String(code || '').length < 4) return fail('DOMAIN_INVALID');
        if (await one('SELECT domain FROM site_domains WHERE domain = ?', [domain])) return fail('DOMAIN_TAKEN');
        const price = domainPrice(TLD_RENEW_CENTS[tld] || TLD_PROVIDER_CENTS[tld]);
        await ledger(ownerId, domain, 'transfer', price, `transfer:${domain}`);
        await run(`INSERT INTO site_domains (domain, owner_id, state, expires_at, records_json) VALUES (?, ?, 'transferring', ?, ?)`,
            [domain, ownerId, yearLater(), JSON.stringify(managedRecords(domain))]);
        return { ok: true, simulated: true, domain, state: 'transferring', total_cents: price.total_cents };
    };
    const records = async (ownerId, { domain }) => {
        const row = await owned(ownerId, normalized(domain));
        if (!row) return fail('NOT_FOUND');
        const tld = row.domain.split('.').pop();
        return { ok: true, simulated: true, domain: row.domain, state: row.state, expires_at: row.expires_at, auto_renew: row.auto_renew === 1,
            renew: shownPrice(domainPrice(TLD_RENEW_CENTS[tld] || TLD_PROVIDER_CENTS[tld])), records: parse(row.records_json) };
    };
    const recordSet = async (ownerId, { domain, type, name = '@', value, remove = false }) => {
        const row = await owned(ownerId, normalized(domain));
        if (!row) return fail('NOT_FOUND');
        const list = parse(row.records_json), same = entry => entry.type === type && entry.name === (name || '@');
        if (list.some(entry => same(entry) && entry.managed)) return fail('NOT_ALLOWED');
        const next = remove ? list.filter(entry => !same(entry)) : [...list.filter(entry => !same(entry)), { type, name: name || '@', value: String(value), managed: false }];
        await run('UPDATE site_domains SET records_json = ? WHERE domain = ?', [JSON.stringify(next), row.domain]);
        return { ok: true, records: next };
    };
    const renewal = async (ownerId, { domain, auto }) => {
        const row = await owned(ownerId, normalized(domain));
        if (!row) return fail('NOT_FOUND');
        await run('UPDATE site_domains SET auto_renew = ? WHERE domain = ?', [auto ? 1 : 0, row.domain]);
        return { ok: true, auto_renew: !!auto };
    };
    const leave = async (ownerId, { domain }) => {
        const row = await owned(ownerId, normalized(domain));
        if (!row) return fail('NOT_FOUND');
        await run(`UPDATE site_domains SET state = 'leaving' WHERE domain = ?`, [row.domain]);
        return { ok: true, simulated: true, code: crypto.createHash('sha256').update(`${row.domain}|${row.created_at}`).digest('base64url').slice(0, 12) };
    };
    const mailList = async (ownerId, { domain }) => {
        const row = await owned(ownerId, normalized(domain));
        return row ? { ok: true, simulated: true, boxes: parse(row.mail_json) } : fail('NOT_FOUND');
    };
    const mailAdd = async (ownerId, { domain, local, forward_to: forwardTo = '', alias_of: aliasOf = '' }) => {
        const row = await owned(ownerId, normalized(domain)), name = normalized(local);
        if (!row) return fail('NOT_FOUND');
        if (!/^[a-z0-9](?:[a-z0-9._-]{0,62})$/.test(name)) return fail('INVALID_ARGUMENT');
        const list = parse(row.mail_json);
        if (list.some(entry => entry.local === name)) return fail('DOMAIN_TAKEN');
        const kind = forwardTo ? 'forward' : (aliasOf ? 'alias' : 'box');
        const entry = { local: name, address: `${name}@${row.domain}`, kind, ...(kind === 'box' ? { quota_gb: MAILBOX_QUOTA_GB, used_gb: 0, cents_per_month: MAILBOX_CENTS_PER_MONTH } : {}),
            ...(forwardTo ? { to: String(forwardTo) } : {}), ...(aliasOf ? { to: String(aliasOf) } : {}) };
        await run('UPDATE site_domains SET mail_json = ? WHERE domain = ?', [JSON.stringify([...list, entry]), row.domain]);
        return { ok: true, simulated: true, boxes: [...list, entry] };
    };
    const mailRemove = async (ownerId, { domain, local }) => {
        const row = await owned(ownerId, normalized(domain));
        if (!row) return fail('NOT_FOUND');
        const next = parse(row.mail_json).filter(entry => entry.local !== normalized(local));
        await run('UPDATE site_domains SET mail_json = ? WHERE domain = ?', [JSON.stringify(next), row.domain]);
        return { ok: true, boxes: next };
    };
    const domains = async ownerId => (await query('all', 'SELECT domain, state, expires_at, auto_renew, mail_json FROM site_domains WHERE owner_id = ?', [ownerId]) || [])
        .map(row => ({ domain: row.domain, state: row.state, expires_at: row.expires_at, auto_renew: row.auto_renew === 1,
            renew: shownPrice(domainPrice(TLD_RENEW_CENTS[row.domain.split('.').pop()] || TLD_PROVIDER_CENTS[row.domain.split('.').pop()] || 0)), boxes: parse(row.mail_json) }));

    const handle = async (data, userId) => {
        const owner = { domain_buy: buy, domain_connect: connect, domain_verify: verify, domain_primary: primary, domain_unlink: unlink,
            domain_transfer: transfer, domain_records: records, domain_record_set: recordSet, domain_renewal: renewal, domain_leave: leave,
            mail_list: mailList, mail_add: mailAdd, mail_remove: mailRemove }[data.action];
        if (data.action === 'domain_search') return search(data);
        if (data.action === 'domain_quote') return quote(data);
        if (data.action === 'hosting') return { ok: true, simulated: true, hosting: { ...await hosting(userId), domains: await domains(userId) } };
        return owner ? owner(userId, data) : null;
    };
    return { handle, search, quote, buy, connect, verify, primary, unlink, transfer, records, recordSet, renewal, leave, mailList, mailAdd, mailRemove, domains };
}
