import { normalizeText, resolveUrl, xmlDecode } from './carddav_shared.js';
import {
    deriveWritableContactUid,
    buildAddressbookHref,
    buildHrefValue,
    normalizeWritableContactPayload,
    buildWritableVcard,
    parseVcardData
} from './carddav_vcard.js';
import {
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
} from './carddav_protocol.js';

export { parseVcardData };

export const createNodeCarddavClient = ({
    auth = {},
    carddav = {},
    fetchImpl = null
} = {}) => {
    const fetcher = ensureFetch(fetchImpl);
    const authorization = buildBasicAuthHeader(auth);
    let discoveredAddressBookUrl = null;

    const requestXml = async ({
        method = 'REPORT',
        addressbook_url = carddav?.addressbook_url,
        body = '',
        depth = '1'
    } = {}) => {
        const url = normalizeText(addressbook_url || carddav?.addressbook_url || '');
        if (!url) {
            throw new Error('carddav_url_missing');
        }
        const response = await fetcher(url, {
            method,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                Depth: depth,
                ...(authorization ? { Authorization: authorization } : {})
            },
            body
        });
        await ensureOkResponse(response, 'carddav_http_failed');
        return {
            text: await response.text(),
            url
        };
    };

    const requestRaw = async ({
        method = 'PUT',
        url = '',
        headers = {},
        body = ''
    } = {}) => {
        const target = normalizeText(url || '');
        if (!target) {
            throw new Error('carddav_url_missing');
        }
        const response = await fetcher(target, {
            method,
            headers: {
                ...(authorization ? { Authorization: authorization } : {}),
                ...headers
            },
            body
        });
        await ensureOkResponse(response, 'carddav_http_failed');
        return response;
    };

    const discoverAddressBookUrl = async () => {
        const configuredUrl = normalizeText(carddav?.addressbook_url || '');
        if (!configuredUrl) {
            throw new Error('carddav_url_missing');
        }
        if (!shouldDiscoverAddressBookUrl(configuredUrl)) {
            discoveredAddressBookUrl = configuredUrl;
            return discoveredAddressBookUrl;
        }

        const principalResponse = await requestXml({
            method: 'PROPFIND',
            addressbook_url: configuredUrl,
            body: buildCurrentUserPrincipalBody(),
            depth: '0'
        });
        const principalHref = extractHrefFromProperty(principalResponse.text, 'current-user-principal');
        if (!principalHref) {
            throw new Error('carddav_principal_discovery_failed');
        }

        const homeResponse = await requestXml({
            method: 'PROPFIND',
            addressbook_url: resolveUrl(configuredUrl, principalHref),
            body: buildAddressBookHomeSetBody(),
            depth: '0'
        });
        const addressbookHomeHref = extractHrefFromProperty(homeResponse.text, 'addressbook-home-set');
        if (!addressbookHomeHref) {
            throw new Error('carddav_home_set_discovery_failed');
        }

        const collectionsResponse = await requestXml({
            method: 'PROPFIND',
            addressbook_url: resolveUrl(configuredUrl, addressbookHomeHref),
            body: buildAddressBookCollectionListBody(),
            depth: '1'
        });
        const responseBlocks = extractResponseBlocks(collectionsResponse.text);
        const selected = responseBlocks.find((block) => hasAddressBookCollectionType(block));
        const href = selected ? normalizeText(xmlDecode(extractTagValue(selected, 'href') || '')) : null;
        if (!href) {
            throw new Error('carddav_addressbook_collection_missing');
        }
        discoveredAddressBookUrl = resolveUrl(configuredUrl, href);
        return discoveredAddressBookUrl;
    };

    const ensureAddressBookUrl = async (explicitUrl = null) => {
        const url = normalizeText(explicitUrl || '');
        if (url && !shouldDiscoverAddressBookUrl(url)) return url;
        if (discoveredAddressBookUrl) return discoveredAddressBookUrl;
        return discoverAddressBookUrl();
    };

    return {
        async fetchInitialContacts({
            addressbook_url = carddav?.addressbook_url
        } = {}) {
            const resolvedUrl = await ensureAddressBookUrl(addressbook_url);
            const response = await requestXml({
                method: 'REPORT',
                addressbook_url: resolvedUrl,
                body: buildAddressBookQueryBody(),
                depth: '1'
            });
            const parsed = parseMultiStatus(response.text);
            const normalized = normalizeCarddavResponseItems(parsed.responses, {
                addressbook_url: resolvedUrl
            });
            discoveredAddressBookUrl = resolvedUrl;
            return {
                ok: true,
                addressbook_url: resolvedUrl,
                cursor: parsed.sync_token || null,
                items: normalized.items,
                removed_hrefs: normalized.removed_hrefs
            };
        },
        async fetchDelta({
            addressbook_url = carddav?.addressbook_url,
            cursor = null
        } = {}) {
            const resolvedUrl = await ensureAddressBookUrl(addressbook_url);
            const response = await requestXml({
                method: 'REPORT',
                addressbook_url: resolvedUrl,
                body: buildSyncCollectionBody({ cursor }),
                depth: '1'
            });
            const parsed = parseMultiStatus(response.text);
            const normalized = normalizeCarddavResponseItems(parsed.responses, {
                addressbook_url: resolvedUrl
            });
            discoveredAddressBookUrl = resolvedUrl;
            return {
                ok: true,
                addressbook_url: resolvedUrl,
                cursor: parsed.sync_token || cursor || null,
                items: normalized.items,
                removed_hrefs: normalized.removed_hrefs
            };
        },
        async createOrUpdateContact({
            contact = {},
            addressbook_url = carddav?.addressbook_url,
            href = null,
            etag = null
        } = {}) {
            const resolvedUrl = await ensureAddressBookUrl(addressbook_url);
            const normalized = normalizeWritableContactPayload(contact, {
                uid: deriveWritableContactUid(contact),
                href,
                etag,
                addressbook_url: resolvedUrl
            });
            const targetUrl = resolveUrl(resolvedUrl, buildAddressbookHref(resolvedUrl, normalized.id, normalized.href));
            const vcard = buildWritableVcard(normalized);
            const response = await requestRaw({
                method: 'PUT',
                url: targetUrl,
                headers: {
                    'Content-Type': 'text/vcard; charset=utf-8',
                    ...(normalized.etag ? { 'If-Match': normalized.etag } : { 'If-None-Match': '*' })
                },
                body: vcard
            });
            const remoteEtag = normalizeText(response?.headers?.get?.('etag') || response?.headers?.get?.('ETag') || '') || normalized.etag || null;
            const remoteHref = buildHrefValue(resolvedUrl, targetUrl, normalized.href);
            discoveredAddressBookUrl = resolvedUrl;
            return {
                ok: true,
                addressbook_url: resolvedUrl,
                href: remoteHref,
                etag: remoteEtag,
                created: !normalized.href,
                updated: !!normalized.href,
                contact: {
                    ...normalized,
                    id: normalized.id,
                    href: remoteHref,
                    etag: remoteEtag,
                    addressbookId: resolvedUrl,
                    raw_vcard: vcard
                }
            };
        }
    };
};
