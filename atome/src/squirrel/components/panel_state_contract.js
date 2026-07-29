const PANEL_STATE_KINDS = new Set(['empty', 'loading', 'error', 'permission_denied']);

const requiredText = (value, name) => {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`squirrel_panel_state_${name}_required`);
    return normalized;
};

const normalizePanelStatePresentation = ({ status, title, message } = {}) => {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!PANEL_STATE_KINDS.has(normalizedStatus)) {
        throw new Error(`squirrel_panel_state_status_unsupported:${normalizedStatus || 'empty'}`);
    }
    return Object.freeze({
        status: normalizedStatus,
        title: requiredText(title, 'title'),
        message: requiredText(message, 'message')
    });
};

export {
    PANEL_STATE_KINDS,
    normalizePanelStatePresentation
};
