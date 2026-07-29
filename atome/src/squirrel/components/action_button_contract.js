const ACTION_BUTTON_VARIANTS = new Set(['neutral', 'destructive']);

const requireBoolean = (value, name) => {
    if (value !== true && value !== false) throw new Error(`squirrel_action_button_${name}_boolean_required`);
    return value;
};

const normalizeActionButtonPresentation = ({
    label = '',
    variant = 'neutral',
    disabled = false,
    busy = false
} = {}) => {
    const normalizedLabel = String(label || '').trim();
    if (!normalizedLabel) throw new Error('squirrel_action_button_label_required');
    const normalizedVariant = String(variant || '').trim().toLowerCase();
    if (!ACTION_BUTTON_VARIANTS.has(normalizedVariant)) throw new Error(`squirrel_action_button_variant_unsupported:${normalizedVariant || 'empty'}`);
    const normalizedDisabled = requireBoolean(disabled, 'disabled');
    const normalizedBusy = requireBoolean(busy, 'busy');
    return Object.freeze({
        label: normalizedLabel,
        variant: normalizedVariant,
        disabled: normalizedDisabled || normalizedBusy,
        busy: normalizedBusy
    });
};

const normalizeActionButtonHandlers = (handlers = {}, presentation = {}) => {
    if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers)) throw new Error('squirrel_action_button_handlers_object_required');
    if (presentation.disabled === true || presentation.busy === true) return Object.freeze({});
    return Object.freeze(Object.fromEntries(
        Object.entries(handlers).filter(([, handler]) => typeof handler === 'function')
    ));
};

export {
    ACTION_BUTTON_VARIANTS,
    normalizeActionButtonHandlers,
    normalizeActionButtonPresentation
};
