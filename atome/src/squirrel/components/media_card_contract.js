const MEDIA_CARD_STATUSES = new Set(['ready', 'loading', 'error']);
const IDENTITY_PLACEHOLDER_SOURCE = './assets/images/icons/user.svg';

const requiredText = (value, name) => {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`squirrel_media_card_${name}_required`);
    return normalized;
};

const normalizeMediaCardPresentation = ({ status, title, message, source = '', accessibilityLabel } = {}) => {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!MEDIA_CARD_STATUSES.has(normalizedStatus)) {
        throw new Error(`squirrel_media_card_status_unsupported:${normalizedStatus || 'empty'}`);
    }
    const normalizedSource = String(source || '').trim();
    if (normalizedStatus === 'ready' && !normalizedSource) throw new Error('squirrel_media_card_source_required');
    return Object.freeze({
        status: normalizedStatus,
        title: requiredText(title, 'title'),
        message: requiredText(message, 'message'),
        source: normalizedSource || null,
        accessibilityLabel: requiredText(accessibilityLabel, 'accessibility_label')
    });
};

const normalizeIdentityMediaPresentation = (source = '') => {
    const normalizedSource = String(source || '').trim();
    return Object.freeze({
        source: normalizedSource || IDENTITY_PLACEHOLDER_SOURCE,
        placeholder: !normalizedSource,
        fit: normalizedSource ? 'cover' : 'contain'
    });
};

export {
    IDENTITY_PLACEHOLDER_SOURCE,
    MEDIA_CARD_STATUSES,
    normalizeIdentityMediaPresentation,
    normalizeMediaCardPresentation
};
