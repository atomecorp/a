// eVe/registry/generated/billing_catalog.json — the single offer (plans, credit packs, sources, stores, the simulated
// payment methods, the paid period), generated from its JS owner (atome/src/shared/billing_contract.js) for the
// servers that cannot import it: atome-server (src/billing/, compiled in).
import fs from 'node:fs';
import { generatedFile } from './registry_paths.mjs';

export const BILLING_CATALOG_FILE = 'billing_catalog.json';

const billingCatalogText = async () => {
    const contract = await import('../../atome/src/shared/billing_contract.js');
    // The owner's own key order: the `offers` answer is the catalog as the owner writes it.
    return `${JSON.stringify({ format: 'billing_catalog/1', owner: 'atome/src/shared/billing_contract.js',
        plans: contract.BILLING_PLANS, packs: contract.BILLING_PACKS, sources: contract.BILLING_SOURCES, stores: contract.BILLING_STORES,
        simulated_methods: contract.BILLING_SIMULATED_METHODS, period_ms: contract.BILLING_PERIOD_MS })}\n`;
};

export const writeBillingCatalog = async () => fs.writeFileSync(generatedFile(BILLING_CATALOG_FILE), await billingCatalogText());

// registry:check — the generated file must be what the owner produces now.
export const billingCatalogErrors = async () => {
    const file = generatedFile(BILLING_CATALOG_FILE);
    if (!fs.existsSync(file)) return [`billing_catalog_not_built: eVe/registry/generated/${BILLING_CATALOG_FILE} is missing (npm run registry:build)`];
    return fs.readFileSync(file, 'utf8') === await billingCatalogText()
        ? [] : ['stale_billing_catalog: atome/src/shared/billing_contract.js changed since the last build (npm run registry:build)'];
};
