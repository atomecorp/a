const clampUnit = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
};

const rgba = (red, green, blue, alpha = 1) => Object.freeze([
    clampUnit(red),
    clampUnit(green),
    clampUnit(blue),
    clampUnit(alpha)
]);

export const ATOME_RENDER_VISUAL_TOKENS = Object.freeze({
    selection: Object.freeze({
        shadow_size: 12,
        border_thickness: 1.5,
        dash_length: 6,
        dash_gap: 4,
        border_color: rgba(0.92, 0.94, 0.97, 1),
        shadow_color: rgba(0, 0, 0, 0.32)
    })
});

export const getAtomeRenderSelectionVisualStyle = () => ({
    ...ATOME_RENDER_VISUAL_TOKENS.selection,
    border_color: [...ATOME_RENDER_VISUAL_TOKENS.selection.border_color],
    shadow_color: [...ATOME_RENDER_VISUAL_TOKENS.selection.shadow_color]
});
