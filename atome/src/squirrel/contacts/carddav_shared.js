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

const resolveUrl = (base, href) => {
    const normalizedHref = normalizeText(href || '');
    if (!normalizedHref) return normalizeText(base || '') || null;
    try {
        return new URL(normalizedHref, base).toString();
    } catch (_error) {
        return normalizedHref;
    }
};

const makeGeneratedUid = () => `eve-contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export {
    normalizeText,
    xmlDecode,
    escapeXml,
    escapeVcardValue,
    resolveUrl,
    makeGeneratedUid
};
