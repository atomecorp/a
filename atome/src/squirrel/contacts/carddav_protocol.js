import { normalizeText, xmlDecode, escapeXml } from './carddav_shared.js';
import { parseVcardData } from './carddav_vcard.js';

const buildBasicAuthHeader = ({ username, password } = {}) => {
    const user = normalizeText(username);
    const secret = normalizeText(password);
    if (!user || !secret) return null;
    const payload = Buffer.from(`${user}:${secret}`, 'utf8').toString('base64');
    return `Basic ${payload}`;
};

const extractTagValue = (xml = '', tagName = '') => {
    const matcher = new RegExp(`<(?:[A-Za-z0-9._-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9._-]+:)?${tagName}>`, 'i');
    const match = String(xml || '').match(matcher);
    return match ? match[1] : null;
};

const extractResponseBlocks = (xml = '') => {
    const matcher = /<(?:[A-Za-z0-9._-]+:)?response\b[^>]*>[\s\S]*?<\/(?:[A-Za-z0-9._-]+:)?response>/gi;
    return String(xml || '').match(matcher) || [];
};

const extractHrefFromProperty = (xml = '', propertyTag = '') => {
    const content = extractTagValue(xml, propertyTag);
    if (!content) return null;
    return normalizeText(xmlDecode(extractTagValue(content, 'href') || '')) || null;
};

const hasAddressBookCollectionType = (xml = '') => {
    const resourceType = extractTagValue(xml, 'resourcetype');
    return /<(?:[A-Za-z0-9._-]+:)?addressbook\b/i.test(String(resourceType || ''));
};

const ensureFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl;
    if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
    throw new Error('carddav_fetch_unavailable');
};

const ensureOkResponse = async (response, label = 'carddav_request_failed') => {
    if (response?.ok === true) return response;
    const body = typeof response?.text === 'function' ? await response.text() : '';
    const status = response?.status || null;
    const statusText = normalizeText(response?.statusText || '') || null;
    const summary = [label, status, statusText].filter(Boolean).join(':');
    const error = new Error(summary || label);
    error.status = status;
    error.statusText = statusText;
    error.body = body;
    throw error;
};

const shouldDiscoverAddressBookUrl = (value) => {
    try {
        const url = new URL(String(value || ''));
        return !url.pathname || url.pathname === '/';
    } catch (_error) {
        return false;
    }
};

const buildCurrentUserPrincipalBody = () => `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
  </d:prop>
</d:propfind>`;

const buildAddressBookHomeSetBody = () => `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <card:addressbook-home-set />
  </d:prop>
</d:propfind>`;

const buildAddressBookCollectionListBody = () => `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
  </d:prop>
</d:propfind>`;

const buildAddressBookQueryBody = () => `<?xml version="1.0" encoding="UTF-8"?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag />
    <card:address-data />
  </d:prop>
</card:addressbook-query>`;

const buildSyncCollectionBody = ({ cursor } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<d:sync-collection xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:sync-token>${escapeXml(cursor || '')}</d:sync-token>
  <d:sync-level>1</d:sync-level>
  <d:prop>
    <d:getetag />
    <card:address-data />
  </d:prop>
</d:sync-collection>`;

const parseMultiStatus = (xml = '') => ({
    sync_token: normalizeText(xmlDecode(extractTagValue(xml, 'sync-token') || '')) || null,
    responses: extractResponseBlocks(xml).map((block) => {
        const href = normalizeText(xmlDecode(extractTagValue(block, 'href') || '')) || null;
        const status = normalizeText(xmlDecode(extractTagValue(block, 'status') || '')) || null;
        const etag = normalizeText(xmlDecode(extractTagValue(block, 'getetag') || '')) || null;
        const addressData = extractTagValue(block, 'address-data');
        return {
            href,
            status,
            etag,
            deleted: !addressData && /404/i.test(String(status || '')),
            address_data: addressData ? xmlDecode(addressData) : null
        };
    })
});

const normalizeCarddavResponseItems = (responses = [], { addressbook_url = null } = {}) => {
    const items = [];
    const removed_hrefs = [];

    responses.forEach((response) => {
        if (response.deleted === true) {
            if (response.href) removed_hrefs.push(response.href);
            return;
        }
        const parsed = parseVcardData(response.address_data || '');
        items.push({
            ...parsed,
            id: normalizeText(parsed.id || response.href || ''),
            addressbookId: normalizeText(addressbook_url || '') || null,
            href: response.href || null,
            etag: response.etag || null,
            raw_vcard: response.address_data || ''
        });
    });

    return { items, removed_hrefs };
};

export {
    buildBasicAuthHeader,
    extractTagValue,
    extractResponseBlocks,
    extractHrefFromProperty,
    hasAddressBookCollectionType,
    ensureFetch,
    ensureOkResponse,
    shouldDiscoverAddressBookUrl,
    buildCurrentUserPrincipalBody,
    buildAddressBookHomeSetBody,
    buildAddressBookCollectionListBody,
    buildAddressBookQueryBody,
    buildSyncCollectionBody,
    parseMultiStatus,
    normalizeCarddavResponseItems
};
