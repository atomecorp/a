const MEDIA_CARD_STATUSES = new Set(['ready', 'loading', 'error']);

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

export {
    MEDIA_CARD_STATUSES,
    normalizeMediaCardPresentation
};
