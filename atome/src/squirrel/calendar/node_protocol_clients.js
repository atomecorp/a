import { CALENDAR_V1_ARCHITECTURE_DECISION } from './connector_contract.js';

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

const buildBasicAuthHeader = ({ username, password } = {}) => {
    const user = normalizeText(username);
    const secret = normalizeText(password);
    if (!user || !secret) return null;
    const payload = Buffer.from(`${user}:${secret}`, 'utf8').toString('base64');
    return `Basic ${payload}`;
};

const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const toIcsFloating = (value) => {
    const date = toDate(value);
    if (!date) return '';
    const pad = (input) => String(input).padStart(2, '0');
    return [
        date.getUTCFullYear(),
        pad(date.getUTCMonth() + 1),
        pad(date.getUTCDate())
    ].join('') + 'T' + [
        pad(date.getUTCHours()),
        pad(date.getUTCMinutes()),
        pad(date.getUTCSeconds())
    ].join('') + 'Z';
};

const unfoldIcs = (value) => String(value || '').replace(/\r?\n[ \t]/g, '');

const parseIcsDate = (value, params = {}) => {
    const normalized = normalizeText(value);
    if (!normalized) return { date: null, allDay: false };
    const isAllDay = String(params.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(normalized);
    if (isAllDay) {
        const year = Number(normalized.slice(0, 4));
        const month = Number(normalized.slice(4, 6)) - 1;
        const day = Number(normalized.slice(6, 8));
        return {
            date: new Date(Date.UTC(year, month, day, 0, 0, 0, 0)),
            allDay: true
        };
    }

    const match = normalized.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!match) {
        const date = toDate(normalized);
        return { date, allDay: false };
    }
    const [, year, month, day, hour, minute, second, zulu] = match;
    const numeric = [year, month, day, hour, minute, second].map(Number);
    const date = zulu
        ? new Date(Date.UTC(numeric[0], numeric[1] - 1, numeric[2], numeric[3], numeric[4], numeric[5], 0))
        : new Date(numeric[0], numeric[1] - 1, numeric[2], numeric[3], numeric[4], numeric[5], 0);
    return { date, allDay: false };
};

const parseRrule = (value) => {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    const entries = normalized.split(';').map((part) => part.split('='));
    const rule = Object.fromEntries(entries.map(([key, entry]) => [String(key || '').toUpperCase(), String(entry || '')]));
    const weekdays = String(rule.BYDAY || '')
        .split(',')
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
        .map((entry) => ({ SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }[entry]))
        .filter((entry) => Number.isInteger(entry));
    return {
        freq: String(rule.FREQ || '').toLowerCase() || null,
        interval: Number.isFinite(Number(rule.INTERVAL)) ? Number(rule.INTERVAL) : 1,
        byWeekday: weekdays.length ? weekdays : undefined
    };
};

const parseIcsProperty = (line = '') => {
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
        value: value || ''
    };
};

export const parseCalendarData = (calendarData = '') => {
    const text = unfoldIcs(calendarData);
    const lines = text.split(/\r?\n/);
    const events = [];
    let current = null;

    lines.forEach((line) => {
        const trimmed = String(line || '').trim();
        if (!trimmed) return;
        if (trimmed === 'BEGIN:VEVENT') {
            current = [];
            return;
        }
        if (trimmed === 'END:VEVENT') {
            if (Array.isArray(current)) events.push(current);
            current = null;
            return;
        }
        if (current) current.push(trimmed);
    });

    return events.map((properties) => {
        const state = {
            id: null,
            title: '',
            description: '',
            location: '',
            start: null,
            end: null,
            allDay: false,
            updatedAt: null,
            recurrence: null
        };

        properties.forEach((line) => {
            const property = parseIcsProperty(line);
            if (!property) return;
            switch (property.name) {
                case 'UID':
                    state.id = normalizeText(property.value);
                    break;
                case 'SUMMARY':
                    state.title = xmlDecode(property.value);
                    break;
                case 'DESCRIPTION':
                    state.description = xmlDecode(property.value).replace(/\\n/g, '\n');
                    break;
                case 'LOCATION':
                    state.location = xmlDecode(property.value);
                    break;
                case 'DTSTART': {
                    const parsed = parseIcsDate(property.value, property.params);
                    state.start = parsed.date;
                    state.allDay = parsed.allDay;
                    break;
                }
                case 'DTEND': {
                    const parsed = parseIcsDate(property.value, property.params);
                    state.end = parsed.date;
                    break;
                }
                case 'LAST-MODIFIED':
                case 'DTSTAMP': {
                    const parsed = parseIcsDate(property.value, property.params);
                    if (parsed.date) state.updatedAt = parsed.date.toISOString();
                    break;
                }
                case 'RRULE':
                    state.recurrence = parseRrule(property.value);
                    break;
                default:
                    break;
            }
        });

        return state;
    }).filter((entry) => entry.start);
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

const parseMultiStatus = (xml = '') => ({
    sync_token: normalizeText(xmlDecode(extractTagValue(xml, 'sync-token') || '')) || null,
    responses: extractResponseBlocks(xml).map((block) => {
        const href = normalizeText(xmlDecode(extractTagValue(block, 'href') || '')) || null;
        const status = normalizeText(xmlDecode(extractTagValue(block, 'status') || '')) || null;
        const etag = normalizeText(xmlDecode(extractTagValue(block, 'getetag') || '')) || null;
        const calendarData = extractTagValue(block, 'calendar-data');
        return {
            href,
            status,
            etag,
            deleted: !calendarData && /404/i.test(String(status || '')),
            calendar_data: calendarData ? xmlDecode(calendarData) : null
        };
    })
});

const buildCalendarQueryBody = ({ start, end } = {}) => {
    const timeRange = start || end
        ? `<c:time-range${start ? ` start="${escapeXml(toIcsFloating(start))}"` : ''}${end ? ` end="${escapeXml(toIcsFloating(end))}"` : ''}/>`
        : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        ${timeRange}
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
};

const buildSyncCollectionBody = ({ cursor } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:sync-token>${escapeXml(cursor || '')}</d:sync-token>
  <d:sync-level>1</d:sync-level>
  <d:prop>
    <d:getetag />
    <c:calendar-data />
  </d:prop>
</d:sync-collection>`;

const buildCurrentUserPrincipalBody = () => `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal />
  </d:prop>
</d:propfind>`;

const buildCalendarHomeSetBody = () => `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <c:calendar-home-set />
  </d:prop>
</d:propfind>`;

const buildCalendarCollectionListBody = () => `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname />
    <d:resourcetype />
  </d:prop>
</d:propfind>`;

const normalizeCalendarResponseItems = (responses = [], { calendar_url = null } = {}) => {
    const items = [];
    const removed_hrefs = [];

    responses.forEach((response) => {
        if (response.deleted === true) {
            if (response.href) removed_hrefs.push(response.href);
            return;
        }
        const parsedEvents = parseCalendarData(response.calendar_data || '');
        parsedEvents.forEach((event) => {
            items.push({
                ...event,
                id: normalizeText(event.id || response.href || ''),
                calendarId: normalizeText(calendar_url || ''),
                href: response.href || null,
                etag: response.etag || null
            });
        });
    });

    return { items, removed_hrefs };
};

const ensureFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl;
    if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
    throw new Error('caldav_fetch_unavailable');
};

const shouldDiscoverCollectionUrl = (value) => {
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

const extractHrefFromProperty = (xml = '', propertyTag = '') => {
    const content = extractTagValue(xml, propertyTag);
    if (!content) return null;
    return normalizeText(xmlDecode(extractTagValue(content, 'href') || '')) || null;
};

const hasCalendarCollectionType = (xml = '') => {
    const resourceType = extractTagValue(xml, 'resourcetype');
    return /<(?:[A-Za-z0-9._-]+:)?calendar\b/i.test(String(resourceType || ''));
};

const ensureOkResponse = async (response, label = 'caldav_request_failed') => {
    if (response?.ok === true) return response;
    const body = typeof response?.text === 'function' ? await response.text() : '';
    const status = response?.status || null;
    const statusText = normalizeText(response?.statusText || '') || null;
    const summary = [label, status, statusText].filter(Boolean).join(':');
    const error = new Error(summary || label);
    error.status = response?.status || null;
    error.statusText = statusText;
    error.body = body;
    throw error;
};

export const createNodeCaldavClient = ({
    provider = CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.id,
    auth = {},
    caldav = {},
    fetchImpl = null
} = {}) => {
    const fetcher = ensureFetch(fetchImpl);
    const authorization = buildBasicAuthHeader(auth);
    let discoveredCalendarUrl = null;

    const requestXml = async ({
        method = 'REPORT',
        calendar_url = caldav?.calendar_url,
        body = '',
        depth = '1'
    } = {}) => {
        const url = normalizeText(calendar_url || caldav?.calendar_url || '');
        if (!url) {
            throw new Error('calendar_url_required');
        }
        const headers = {
            Accept: 'application/xml, text/xml',
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: depth
        };
        if (authorization) headers.Authorization = authorization;
        const response = await fetcher(url, {
            method,
            headers,
            body
        });
        return ensureOkResponse(response, 'caldav_http_failed');
    };

    const discoverCalendarUrl = async (options = {}) => {
        const configuredUrl = normalizeText(options.calendar_url || discoveredCalendarUrl || caldav?.calendar_url || '');
        if (!configuredUrl) {
            throw new Error('calendar_url_required');
        }
        if (!shouldDiscoverCollectionUrl(configuredUrl)) {
            discoveredCalendarUrl = configuredUrl;
            return discoveredCalendarUrl;
        }

        const principalResponse = await requestXml({
            method: 'PROPFIND',
            calendar_url: configuredUrl,
            depth: '0',
            body: buildCurrentUserPrincipalBody()
        });
        const principalXml = await principalResponse.text();
        const principalUrl = resolveUrl(configuredUrl, extractHrefFromProperty(principalXml, 'current-user-principal') || configuredUrl);

        const homeResponse = await requestXml({
            method: 'PROPFIND',
            calendar_url: principalUrl,
            depth: '0',
            body: buildCalendarHomeSetBody()
        });
        const homeXml = await homeResponse.text();
        const homeUrl = resolveUrl(principalUrl, extractHrefFromProperty(homeXml, 'calendar-home-set') || principalUrl);

        const collectionsResponse = await requestXml({
            method: 'PROPFIND',
            calendar_url: homeUrl,
            depth: '1',
            body: buildCalendarCollectionListBody()
        });
        const collectionsXml = await collectionsResponse.text();
        const blocks = extractResponseBlocks(collectionsXml);
        const discoveredCollection = blocks
            .map((block) => resolveUrl(homeUrl, extractTagValue(block, 'href')))
            .find((url, index) => hasCalendarCollectionType(blocks[index]) && url);

        discoveredCalendarUrl = discoveredCollection || homeUrl;
        return discoveredCalendarUrl;
    };

    return {
        async fetchInitialCalendar(options = {}) {
            const calendarUrl = await discoverCalendarUrl(options);
            const response = await requestXml({
                method: 'REPORT',
                calendar_url: calendarUrl,
                depth: '1',
                body: buildCalendarQueryBody({
                    start: options.start || null,
                    end: options.end || null
                })
            });
            const xml = await response.text();
            const parsed = parseMultiStatus(xml);
            const normalized = normalizeCalendarResponseItems(parsed.responses, {
                calendar_url: calendarUrl || null
            });
            return {
                ok: true,
                provider: String(provider || CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.id),
                calendar_url: calendarUrl || null,
                cursor: parsed.sync_token,
                items: normalized.items,
                removed_hrefs: normalized.removed_hrefs
            };
        },
        async fetchDelta(options = {}) {
            const cursor = normalizeText(options.cursor || '');
            if (!cursor) {
                return this.fetchInitialCalendar(options);
            }
            const calendarUrl = await discoverCalendarUrl(options);
            const response = await requestXml({
                method: 'REPORT',
                calendar_url: calendarUrl,
                depth: '1',
                body: buildSyncCollectionBody({ cursor })
            });
            const xml = await response.text();
            const parsed = parseMultiStatus(xml);
            const normalized = normalizeCalendarResponseItems(parsed.responses, {
                calendar_url: calendarUrl || null
            });
            return {
                ok: true,
                provider: String(provider || CALENDAR_V1_ARCHITECTURE_DECISION.primary_write_source.id),
                calendar_url: calendarUrl || null,
                cursor: parsed.sync_token || cursor,
                items: normalized.items,
                removed_hrefs: normalized.removed_hrefs
            };
        }
    };
};
