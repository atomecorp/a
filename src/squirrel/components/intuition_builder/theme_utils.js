export function resolveItemSizePx() {
    const size = currentTheme && currentTheme.item_size;
    if (size == null) return 54;
    if (typeof size === 'number') return size;
    const parsed = parseFloat(size);
    return Number.isFinite(parsed) ? parsed : 54;
}

export function resolveOrientationValue(theme) {
    const dir = theme && typeof theme.direction === 'string' ? theme.direction.trim() : '';
    if (dir) {
        return dir.toLowerCase();
    }
    return 'top_left_horizontal';
}

export function normalizeOffsetToNumber(raw) {
    if (raw == null) return 0;
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : 0;
    }
    const parsed = parseFloat(String(raw));
    return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePositionValue(value) {
    if (value == null) return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

export function resolveToolFontSizeCss() {
    if (currentTheme && currentTheme.tool_font) {
        return String(currentTheme.tool_font);
    }
    if (currentTheme && currentTheme.tool_font_px != null) {
        return `${currentTheme.tool_font_px}px`;
    }
    return '12px';
}

export function computeDropdownHeight(fontSizeCss) {
    if (!fontSizeCss) return '32px';
    const match = String(fontSizeCss).trim()
        .match(/^([0-9]*\.?[0-9]+)(px|rem|em|vw|vh|vmin|vmax|%)$/i);
    if (match) {
        const value = parseFloat(match[1]) || 0;
        const unit = match[2].toLowerCase();
        if (unit === 'px') {
            return Math.max(18, Math.round(value * 2.2)) + 'px';
        }
        return `calc(${match[0]} * 2.2)`;
    }
    if (currentTheme && currentTheme.tool_font_px) {
        return Math.max(18, Math.round(currentTheme.tool_font_px * 2.2)) + 'px';
    }
    return '32px';
}

export function resolveItemSizeCss() {
    if (currentTheme && currentTheme.item_size) {
        return String(currentTheme.item_size);
    }
    return '54px';
}

export function resolveThemeItemSizeCss(theme) {
    if (!theme) return `${item_size}px`;
    const raw = theme.item_size;
    if (raw == null) {
        return `${item_size}px`;
    }
    if (typeof raw === 'number') {
        return `${raw}px`;
    }
    const str = String(raw).trim();
    if (!str) {
        return `${item_size}px`;
    }
    if (/^[0-9.]+$/.test(str)) {
        return `${str}px`;
    }
    return str;
}

export function resolveFloatingEntryBackground(theme, typeName) {
    const fallback = (theme && theme.tool_bg != null) ? theme.tool_bg : 'transparent';
    if (!theme) return fallback;
    switch (typeName) {
        case 'palette':
            return theme.palette_bg != null ? theme.palette_bg : fallback;
        case 'particle':
            return theme.particle_bg != null ? theme.particle_bg : fallback;
        case 'option':
            return theme.option_bg != null ? theme.option_bg : fallback;
        case 'zonespecial':
            return theme.zonespecial_bg != null ? theme.zonespecial_bg : fallback;
        default:
            return fallback;
    }
}

export function resolveFloatingBodyPadding(theme, spacingFallback = '0') {
    const defaultPadding = '0';
    const hasThemeValue = theme && Object.prototype.hasOwnProperty.call(theme, 'floating_body_padding');
    if (!hasThemeValue) {
        return defaultPadding;
    }
    const raw = theme.floating_body_padding;
    if (raw == null) {
        return defaultPadding;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return `${raw}px`;
    }
    const str = String(raw).trim();
    if (!str) {
        return defaultPadding;
    }
    if (str === 'spacing') {
        return spacingFallback;
    }
    return str;
}

export function resolveFloatingHostBackground(theme, infoType) {
    if (!theme) return 'transparent';
    if (Object.prototype.hasOwnProperty.call(theme, 'floating_host_bg')) {
        const raw = theme.floating_host_bg;
        if (raw === null || raw === undefined || raw === '') {
            return 'transparent';
        }
        return String(raw);
    }
    if (infoType === 'palette') {
        return theme.palette_bg != null ? theme.palette_bg : 'transparent';
    }
    if (infoType === 'tool' || infoType === 'particle' || infoType === 'option' || infoType === 'zonespecial') {
        return theme.tool_bg != null ? theme.tool_bg : 'transparent';
    }
    return 'transparent';
}

export function resolveFloatingHostBlur(theme, background) {
    if (!theme) return null;
    if (Object.prototype.hasOwnProperty.call(theme, 'floating_host_blur')) {
        const raw = theme.floating_host_blur;
        if (raw === null || raw === undefined || raw === '' || raw === false) {
            return null;
        }
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            return `${raw}px`;
        }
        const str = String(raw).trim();
        if (!str) {
            return null;
        }
        return str;
    }
    if (!background || background === 'transparent' || background === 'none') {
        return null;
    }
    return theme.tool_backDrop_effect || null;
}

export function resolveFloatingGripBlur(theme, background) {
    if (!theme) return null;
    if (Object.prototype.hasOwnProperty.call(theme, 'floating_grip_blur')) {
        const raw = theme.floating_grip_blur;
        if (raw === null || raw === undefined || raw === '' || raw === false) {
            return null;
        }
        if (typeof raw === 'number' && Number.isFinite(raw)) {
            return `${raw}px`;
        }
        const str = String(raw).trim();
        if (!str) {
            return null;
        }
        return str;
    }
    const hostBlur = resolveFloatingHostBlur(theme, background);
    if (hostBlur) {
        return hostBlur;
    }
    return theme.tool_backDrop_effect || null;
}
