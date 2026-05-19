const normalizeText = (value) => String(value || '').trim();

const xmlDecode = (value) => String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&');

const escapeXml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const escapeVcardValue = (value) => String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

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

const resolveUrl = (base, href) => {
    const normalizedHref = normalizeText(href || '');
    if (!normalizedHref) return normalizeText(base || '') || null;
    try {
        return new URL(normalizedHref, base).toString();
    } catch (_error) {
        return normalizedHref;
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

const unfoldVcard = (value = '') => String(value || '').replace(/\r?\n[ \t]/g, '');

const parseVcardProperty = (line = '') => {
    const separator = line.indexOf(':');
    if (separator === -1) return null;
    const rawKey = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const [namePart, ...paramParts] = rawKey.split(';');
    const params = {};
    paramParts.forEach((part) => {
        const [paramKey, paramValue] = part.split('=');
        if (!paramKey) return;
        params[String(paramKey || '').toUpperCase()] = String(paramValue || '');
    });
    return {
        name: String(namePart || '').toUpperCase(),
        params,
        value
    };
};

const decodeVcardValue = (value = '') => xmlDecode(String(value || '').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n'));

const normalizeCustomFieldLabel = (value) => normalizeText(value || '').toLowerCase();

const normalizeCarddavLabel = (params = {}) => {
    const type = String(params.TYPE || params.type || '').split(',').map((entry) => entry.trim()).filter(Boolean);
    return type[0] || 'other';
};

const normalizeList = (value = []) => (Array.isArray(value) ? value : [])
    .map((entry) => ({
        label: normalizeText(entry?.label || '') || 'other',
        value: normalizeText(entry?.value || '')
    }))
    .filter((entry) => entry.value);

const dedupeByValue = (items = []) => {
    const seen = new Set();
    return normalizeList(items).filter((entry) => {
        const key = `${normalizeCustomFieldLabel(entry.label)}:${entry.value}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const findCustomFieldValue = (customFields = [], aliases = []) => {
    const labels = (Array.isArray(aliases) ? aliases : [aliases])
        .map((entry) => normalizeCustomFieldLabel(entry))
        .filter(Boolean);
    if (!labels.length) return '';
    const field = (Array.isArray(customFields) ? customFields : []).find((entry) => labels.includes(normalizeCustomFieldLabel(entry?.label || '')));
    return normalizeText(field?.value || '');
};

const makeGeneratedUid = () => `eve-contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const deriveWritableContactUid = (contact = {}) => {
    const candidates = [
        contact?.raw?.original_source_contact_id,
        contact?.source_contact_id,
        contact?.id,
        contact?.raw?.id
    ].map((entry) => normalizeText(entry || '')).filter(Boolean);
    const explicit = candidates.find((entry) => !/^(phone:|email:|name:|local:)/i.test(entry));
    return explicit || makeGeneratedUid();
};

const buildAddressbookHref = (addressbookUrl, uid, existingHref = null) => {
    const explicit = normalizeText(existingHref || '');
    if (explicit) return explicit;
    const normalizedUid = normalizeText(uid || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || makeGeneratedUid();
    const base = normalizeText(addressbookUrl || '');
    if (!base) return `${normalizedUid}.vcf`;
    return resolveUrl(base.endsWith('/') ? base : `${base}/`, `${normalizedUid}.vcf`);
};

const buildHrefValue = (addressbookUrl, targetUrl, existingHref = null) => {
    const explicit = normalizeText(existingHref || '');
    if (explicit) return explicit;
    try {
        const target = new URL(String(targetUrl || ''));
        const base = new URL(String(addressbookUrl || ''));
        if (target.origin === base.origin) {
            return `${target.pathname}${target.search || ''}`;
        }
    } catch (_error) {
        // fall through
    }
    return normalizeText(targetUrl || '') || null;
};

const normalizeWritableContactPayload = (contact = {}, { uid = null, href = null, etag = null, addressbook_url = null, raw_vcard = null } = {}) => {
    const phones = dedupeByValue([
        ...(Array.isArray(contact?.raw?.phones) ? contact.raw.phones : []),
        ...(contact?.phone ? [{ label: 'cell', value: contact.phone }] : [])
    ]);
    const emails = dedupeByValue([
        ...(Array.isArray(contact?.raw?.emails) ? contact.raw.emails : []),
        ...(contact?.email ? [{ label: 'home', value: contact.email }] : [])
    ]);
    const customFields = Array.isArray(contact?.custom_fields) ? contact.custom_fields : [];
    const organization = normalizeText(contact?.raw?.organization || findCustomFieldValue(customFields, ['organisation', 'organization', 'org']) || '');
    const note = normalizeText(contact?.raw?.note || findCustomFieldValue(customFields, ['note']) || '');
    const firstName = normalizeText(contact?.first_name || contact?.raw?.first_name || '');
    const name = normalizeText(contact?.name || contact?.raw?.name || '') || firstName || emails[0]?.value || phones[0]?.value || 'Contact';
    return {
        id: normalizeText(uid || deriveWritableContactUid(contact)),
        name,
        first_name: firstName,
        nickname: normalizeText(contact?.nickname || contact?.raw?.nickname || ''),
        phones,
        emails,
        organization,
        note,
        href: normalizeText(href || contact?.href || contact?.raw?.href || '') || null,
        etag: normalizeText(etag || contact?.etag || contact?.raw?.etag || '') || null,
        addressbookId: normalizeText(addressbook_url || contact?.addressbookId || contact?.raw?.addressbookId || '') || null,
        raw_vcard: normalizeText(raw_vcard || '') || null
    };
};

const buildWritableVcard = (contact = {}) => {
    const uid = normalizeText(contact.id || '') || makeGeneratedUid();
    const fullName = normalizeText(contact.name || '') || contact.emails?.[0]?.value || contact.phones?.[0]?.value || 'Contact';
    const firstName = normalizeText(contact.first_name || '');
    const lastName = firstName && fullName.startsWith(firstName)
        ? normalizeText(fullName.slice(firstName.length).trim())
        : '';
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `UID:${escapeVcardValue(uid)}`,
        `FN:${escapeVcardValue(fullName)}`,
        `N:${escapeVcardValue(lastName)};${escapeVcardValue(firstName)};;;`
    ];
    if (contact.nickname) {
        lines.push(`NICKNAME:${escapeVcardValue(contact.nickname)}`);
    }
    if (contact.organization) {
        lines.push(`ORG:${escapeVcardValue(contact.organization)}`);
    }
    if (contact.note) {
        lines.push(`NOTE:${escapeVcardValue(contact.note)}`);
    }
    dedupeByValue(contact.phones).forEach((entry) => {
        lines.push(`TEL;TYPE=${escapeVcardValue((entry.label || 'other').toUpperCase())}:${escapeVcardValue(entry.value)}`);
    });
    dedupeByValue(contact.emails).forEach((entry) => {
        lines.push(`EMAIL;TYPE=${escapeVcardValue((entry.label || 'other').toUpperCase())}:${escapeVcardValue(entry.value)}`);
    });
    lines.push('END:VCARD');
    return lines.join('\r\n');
};

export const parseVcardData = (vcard = '') => {
    const text = unfoldVcard(vcard);
    const lines = text.split(/\r?\n/);
    const state = {
        id: null,
        name: '',
        first_name: '',
        last_name: '',
        middle_name: '',
        nickname: '',
        organization: '',
        note: '',
        phones: [],
        emails: []
    };

    lines.forEach((line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed || /^BEGIN:VCARD$/i.test(trimmed) || /^END:VCARD$/i.test(trimmed) || /^VERSION:/i.test(trimmed)) {
            return;
        }
        const property = parseVcardProperty(trimmed);
        if (!property) return;
        const value = decodeVcardValue(property.value);
        switch (property.name) {
        case 'UID':
            state.id = normalizeText(value) || null;
            break;
        case 'FN':
            state.name = normalizeText(value);
            break;
        case 'N': {
            const [lastName, firstName, middleName] = String(value || '').split(';');
            if (!state.last_name) state.last_name = normalizeText(lastName);
            if (!state.first_name) state.first_name = normalizeText(firstName);
            if (!state.middle_name) state.middle_name = normalizeText(middleName);
            break;
        }
        case 'NICKNAME':
            state.nickname = normalizeText(value);
            break;
        case 'ORG':
            state.organization = normalizeText(String(value || '').split(';').filter(Boolean).join(' '));
            break;
        case 'NOTE':
            state.note = normalizeText(value);
            break;
        case 'TEL':
            state.phones.push({
                label: normalizeCarddavLabel(property.params),
                value: normalizeText(value)
            });
            break;
        case 'EMAIL':
            state.emails.push({
                label: normalizeCarddavLabel(property.params),
                value: normalizeText(value)
            });
            break;
        default:
            break;
        }
    });

    if (!state.name) {
        state.name = [state.first_name, state.middle_name, state.last_name].filter(Boolean).join(' ').trim()
            || state.nickname
            || state.organization
            || state.emails[0]?.value
            || state.phones[0]?.value
            || 'Contact';
    }

    return state;
};

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
