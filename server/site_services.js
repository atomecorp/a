// The websites' server pieces, made once (server/server_services.js): the store, the publishing service and its clock,
// the domains & mail (simulated provider) and the hosting summary (Q15: included in the subscription).
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { BILLING_PLANS } from '../atome/src/shared/billing_contract.js';
import { SITE_TRAFFIC_GB_BY_TIER } from '../atome/src/shared/site_contract.js';
import { getBillingLedger } from './billing/ws_billing_operations.js';
import { resolveDownloadTarget } from './server_uploads.js';
import { getUserHome } from './userHome.js';
import { createSiteStore } from './site_store.js';
import { createSitePublishing } from './site_publishing.js';
import { createSiteDomains } from './site_domains.js';

const GB = 1000 ** 3;
const folderBytes = async (folder) => {
    let total = 0;
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
        const at = path.join(folder, entry.name);
        total += entry.isDirectory() ? await folderBytes(at) : (await fs.stat(at).catch(() => ({ size: 0 }))).size;
    }
    return total;
};

export function createSiteServices({ query, vaultRouter, syncRuntime, projectRoot, origin = process.env.ATOME_SITE_ORIGIN || 'https://atome.one' }) {
    const store = createSiteStore({ query });
    // A media placed on a page: `/api/uploads/<file>?media_user_id=<owner>`, read as its owner reads it.
    const resolveFile = async (ownerId, mediaUrl) => {
        const url = new URL(mediaUrl, origin);
        if (!url.pathname.startsWith('/api/uploads/')) return null;
        const target = await resolveDownloadTarget(decodeURIComponent(url.pathname.slice('/api/uploads/'.length)), ownerId);
        return target?.filePath ? target : null;
    };
    const publishing = createSitePublishing({ store, vaultRouter, syncRuntime, resolveFile, origin,
        sitesRoot: path.resolve(projectRoot, process.env.ATOME_SITES_ROOT || 'data/sites') });
    const hosting = async (ownerId) => {
        const status = await getBillingLedger().status(ownerId).catch(() => null);
        const plan = BILLING_PLANS.find(entry => entry.productId === status?.plan?.productId) || null;
        const sites = (await store.ofOwner(ownerId)).filter(row => row.state === 'online');
        return { included: true, sites: sites.map(row => ({ slug: row.slug, domain: row.domain_state === 'active' ? row.domain : null })),
            traffic_bytes: await store.traffic(ownerId, new Date().toISOString().slice(0, 7)),
            traffic_limit_bytes: plan ? SITE_TRAFFIC_GB_BY_TIER[plan.tier] * GB : null,
            storage_bytes: await folderBytes(getUserHome(projectRoot, { id: ownerId }).home), storage_limit_bytes: plan?.storageBytes ?? null };
    };
    const domains = createSiteDomains({ query, store, publishing, hosting });
    const handle = async (data, userId) => (String(data?.action || '').startsWith('domain_') || String(data?.action || '').startsWith('mail_') || data?.action === 'hosting'
        ? domains.handle(data, userId) : publishing.handle(data, userId));
    return { store, publishing, domains, handle };
}
