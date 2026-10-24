// Phone entry is local-first while the authentication protocol remains E.164-only.
// Timezone then browser language provide permission-free country signals. A
// French fallback keeps the historical +33 behaviour when neither is usable.
const COUNTRY_PHONE_METADATA = Object.freeze({
    AT: { callingCode: '43', trunkPrefix: '0' },
    AU: { callingCode: '61', trunkPrefix: '0' },
    BE: { callingCode: '32', trunkPrefix: '0' },
    BR: { callingCode: '55', trunkPrefix: '0' },
    CA: { callingCode: '1', trunkPrefix: '' },
    CH: { callingCode: '41', trunkPrefix: '0' },
    DE: { callingCode: '49', trunkPrefix: '0' },
    DK: { callingCode: '45', trunkPrefix: '' },
    ES: { callingCode: '34', trunkPrefix: '' },
    FI: { callingCode: '358', trunkPrefix: '0' },
    FR: { callingCode: '33', trunkPrefix: '0' },
    GB: { callingCode: '44', trunkPrefix: '0' },
    GR: { callingCode: '30', trunkPrefix: '' },
    IE: { callingCode: '353', trunkPrefix: '0' },
    IN: { callingCode: '91', trunkPrefix: '0' },
    IT: { callingCode: '39', trunkPrefix: '' },
    JP: { callingCode: '81', trunkPrefix: '0' },
    LU: { callingCode: '352', trunkPrefix: '' },
    MA: { callingCode: '212', trunkPrefix: '0' },
    MC: { callingCode: '377', trunkPrefix: '' },
    MX: { callingCode: '52', trunkPrefix: '' },
    NL: { callingCode: '31', trunkPrefix: '0' },
    NO: { callingCode: '47', trunkPrefix: '' },
    NZ: { callingCode: '64', trunkPrefix: '0' },
    PL: { callingCode: '48', trunkPrefix: '' },
    PT: { callingCode: '351', trunkPrefix: '' },
    SE: { callingCode: '46', trunkPrefix: '0' },
    TN: { callingCode: '216', trunkPrefix: '' },
    US: { callingCode: '1', trunkPrefix: '' }
});

// Native address books wrap numbers in direction marks (Unicode Cf), and an
// international number often keeps its national trunk as "(0)": +33 (0)6 → +336.
const cleanPhone = (value) => String(value ?? '').replace(/\p{Cf}/gu, '').trim()
    .replace(/^(\+|00)(\d+)\s*\(0\)/, '$1$2').replace(/[\s().\-/]/g, '');

const TIME_ZONE_REGIONS = Object.freeze({
    'Europe/Paris': 'FR',
    'Europe/London': 'GB',
    'Europe/Brussels': 'BE',
    'Europe/Zurich': 'CH',
    'Europe/Berlin': 'DE',
    'Europe/Madrid': 'ES',
    'Europe/Rome': 'IT',
    'Europe/Lisbon': 'PT'
});

export function inferPhoneRegion(environment = globalThis) {
    try {
        const dateTimeFormat = environment?.Intl?.DateTimeFormat;
        const timeZone = dateTimeFormat?.().resolvedOptions().timeZone;
        if (TIME_ZONE_REGIONS[timeZone]) return TIME_ZONE_REGIONS[timeZone];
    } catch (_) { /* Continue with the browser locale. */ }
    const navigatorRef = environment?.navigator;
    const locales = [...(Array.isArray(navigatorRef?.languages) ? navigatorRef.languages : []), navigatorRef?.language];
    for (const locale of locales) {
        if (!locale) continue;
        try {
            const region = new Intl.Locale(String(locale)).maximize().region;
            if (region && COUNTRY_PHONE_METADATA[region]) return region;
        } catch (_) { /* Invalid host locale: continue to the documented fallback. */ }
    }
    return 'FR';
}

export function phoneCallingCode(region = 'FR') {
    return COUNTRY_PHONE_METADATA[String(region || '').toUpperCase()]?.callingCode
        || COUNTRY_PHONE_METADATA.FR.callingCode;
}

export function normalizePhoneToE164(value, { region } = {}) {
    const compact = cleanPhone(value);
    if (!compact) return '';
    if (compact.startsWith('+')) {
        const digits = compact.slice(1);
        return /^\d+$/.test(digits) ? `+${digits}` : '';
    }
    if (compact.startsWith('00')) {
        const digits = compact.slice(2);
        return /^\d+$/.test(digits) ? `+${digits}` : '';
    }
    if (!/^\d+$/.test(compact)) return '';
    const selectedRegion = String(region || inferPhoneRegion()).toUpperCase();
    const metadata = COUNTRY_PHONE_METADATA[selectedRegion] || COUNTRY_PHONE_METADATA.FR;
    let national = compact;
    if (metadata.trunkPrefix && national.startsWith(metadata.trunkPrefix)) {
        national = national.slice(metadata.trunkPrefix.length);
    } else if (national.startsWith(metadata.callingCode)) {
        return `+${national}`;
    }
    return national ? `+${metadata.callingCode}${national}` : '';
}

export function isE164Phone(value) {
    return /^\+[1-9]\d{7,14}$/.test(String(value || ''));
}

// A verified alias supplies the dialing country for its own native card.
// Shared calling codes (US/CA) have the same national-prefix contract here.
export function phoneRegionFromE164(value) {
    if (!isE164Phone(value)) return null;
    return Object.entries(COUNTRY_PHONE_METADATA).sort((a, b) => b[1].callingCode.length - a[1].callingCode.length)
        .find(([, metadata]) => value.startsWith('+' + metadata.callingCode))?.[0] || null;
}
