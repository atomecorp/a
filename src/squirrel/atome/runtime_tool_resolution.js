const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

const ensureString = (value, fallback = '') => {
    const text = String(value == null ? '' : value).trim();
    return text || fallback;
};

const readExplicitRuntimeToolId = (params = {}) => {
    const candidates = [
        params.tool_id,
        params.toolId,
        params.tool_key,
        params.toolKey,
        params.tool_name,
        params.tool
    ];
    for (const candidate of candidates) {
        const value = ensureString(candidate);
        if (value) return value;
    }
    return '';
};

const sanitizeInvocationInput = (payload = {}) => {
    const next = isPlainObject(payload) ? { ...payload } : {};
    delete next.mergeDefaults;
    delete next.values;
    delete next.tool_id;
    delete next.toolId;
    delete next.tool_key;
    delete next.toolKey;
    delete next.tool_name;
    delete next.tool;
    return next;
};

const isCirclePayload = (payload = {}) => {
    const values = [
        payload.shape_variant,
        payload.shapeVariant,
        payload.variant,
        payload.kind,
        payload.type
    ].map((entry) => ensureString(entry).toLowerCase()).filter(Boolean);
    return values.includes('circle');
};

const isTextPayload = (payload = {}) => {
    const values = [
        payload.kind,
        payload.type,
        payload.visualType,
        payload.media_type
    ].map((entry) => ensureString(entry).toLowerCase()).filter(Boolean);
    return values.includes('text');
};

const normalizeShapePayload = (payload = {}, operation = '') => {
    const next = sanitizeInvocationInput(payload);
    const normalizedOperation = ensureString(operation).toLowerCase();
    const kind = ensureString(next.kind || next.type || '', '').toLowerCase();
    if (normalizedOperation === 'box' && !kind) {
        next.kind = 'shape';
        next.type = 'shape';
    }
    const normalizedKind = ensureString(next.kind || next.type || '', '').toLowerCase();
    if (normalizedKind === 'shape' || normalizedOperation === 'box') {
        const fill = ensureString(
            next.color
            || next.backgroundColor
            || next.background
            || next.bg,
            ''
        );
        if (fill && !ensureString(next.color, '')) next.color = fill;
    }
    return next;
};

const hasColorUpdate = (payload = {}) => {
    return [
        payload.color,
        payload.value,
        payload.backgroundColor,
        payload.background,
        payload.bg
    ].some((entry) => ensureString(entry, '').length > 0);
};

const hasFontUpdate = (payload = {}) => {
    return [
        payload.font,
        payload.fontFamily,
        payload.font_family,
        payload.value
    ].some((entry) => ensureString(entry, '').length > 0);
};

const hasSizeUpdate = (payload = {}) => {
    return [payload.size, payload.value, payload.width, payload.height]
        .some((entry) => Number.isFinite(Number(entry)) || ensureString(entry, '').length > 0);
};

const hasRenameUpdate = (payload = {}) => {
    return ensureString(payload.name || payload.next_name || payload.nextName, '').length > 0;
};

const buildUpdateInvocation = (payload = {}) => {
    const input = sanitizeInvocationInput(payload);
    if (hasRenameUpdate(input)) {
        return {
            tool_id: 'ui.rename.atome',
            action: 'pointer.click',
            input
        };
    }
    if (hasColorUpdate(input)) {
        return {
            tool_id: 'ui.couleur.apply',
            action: 'pointer.click',
            input
        };
    }
    if (hasFontUpdate(input)) {
        return {
            tool_id: 'ui.font.apply',
            action: 'pointer.click',
            input
        };
    }
    if (hasSizeUpdate(input)) {
        return {
            tool_id: 'ui.size.apply',
            action: 'pointer.click',
            input
        };
    }
    return null;
};

export const resolveAtomeRuntimeInvocation = ({
    operation = '',
    params = {},
    defaults = {}
} = {}) => {
    const normalizedOperation = ensureString(operation).toLowerCase();
    const values = isPlainObject(params?.values) ? params.values : params;
    const mergeDefaults = params?.mergeDefaults !== false;
    const resolvedPayload = mergeDefaults
        ? { ...(isPlainObject(defaults) ? defaults : {}), ...(isPlainObject(values) ? values : {}) }
        : { ...(isPlainObject(values) ? values : {}) };
    const explicitToolId = readExplicitRuntimeToolId(params) || readExplicitRuntimeToolId(resolvedPayload);
    if (explicitToolId) {
        return {
            tool_id: explicitToolId,
            action: ensureString(params.action || params.event, 'pointer.click'),
            input: sanitizeInvocationInput(resolvedPayload)
        };
    }
    if (normalizedOperation.startsWith('ui.')) {
        return {
            tool_id: normalizedOperation,
            action: ensureString(params.action || params.event, 'pointer.click'),
            input: sanitizeInvocationInput(resolvedPayload)
        };
    }
    if (normalizedOperation === 'create' || normalizedOperation === 'box') {
        if (isCirclePayload(resolvedPayload)) {
            return {
                tool_id: 'ui.circle',
                action: ensureString(params.action || params.event, 'pointer.click'),
                input: sanitizeInvocationInput(resolvedPayload)
            };
        }
        if (isTextPayload(resolvedPayload)) {
            return {
                tool_id: 'ui.text.create',
                action: ensureString(params.action || params.event, 'pointer.click'),
                input: sanitizeInvocationInput(resolvedPayload)
            };
        }
        return {
            tool_id: 'ui.creator',
            action: ensureString(params.action || params.event, 'pointer.click'),
            input: normalizeShapePayload(resolvedPayload, normalizedOperation)
        };
    }
    if (normalizedOperation === 'update') {
        return buildUpdateInvocation(resolvedPayload);
    }
    return null;
};
