// Style definitions for Lyrix application UI
// Base theme system for consistent styling across all components

const default_theme = {
    mode: 'dark',
    colors: {
        primary: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        background: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        surface: 'var(--system-panel-surface, rgba(48, 48, 48, 0.66))',
        surfaceAlt: 'var(--system-input-bg-strong, rgba(108, 108, 108, 0.62))',
        inputSurface: 'var(--system-input-bg-strong, rgba(108, 108, 108, 0.62))',
        border: 'var(--system-panel-border, rgba(255, 255, 255, 0.12))',
        borderStrong: 'var(--system-panel-border-strong, rgba(255, 255, 255, 0.18))',
        text: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
        textMuted: 'var(--system-text-muted, rgba(220, 220, 220, 0.74))',
        accent: '#3b82f6',
        accentHover: '#60a5fa',
        danger: '#ef4444',
        warning: '#f59e0b',
        success: '#10b981',
        focus: '#2563eb',
        overlay: 'rgba(24,24,24,0.18)'
    },
    spacing: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px'
    },
    borderRadius: {
        sm: '3px',
        md: '6px',
        lg: '10px'
    },
    panel: {
        headerHeight: '42px',
        shadow: 'var(--system-panel-shadow, 0 14px 36px rgba(0, 0, 0, 0.28))',
        backdrop: 'var(--system-backdrop-filter, blur(18px) saturate(145%))'
    },
    transitions: {
        normal: '150ms ease',
        slow: '300ms ease'
    },
    zIndex: {
        modal: 5000,
        panel: 3000,
        toolbar: 2000
    },
    buttonActive: {
        backgroundColor: 'var(--system-input-bg-strong, rgba(108, 108, 108, 0.62))',
        outline: '1px solid var(--system-panel-border-strong, rgba(255, 255, 255, 0.18))'
    },
    // Theme colors (optional - if not defined, uses button.backgroundColor)
    // primaryColor: '#27ae60',     // Vert pour boutons primaires
    // secondaryColor: '#3498db',   // Bleu pour boutons secondaires
    // dangerColor: '#e74c3c',      // Rouge pour boutons danger
    // warningColor: '#f39c12',     // Orange pour boutons warning
    
    // Colors for special modes
    editModeActiveColor: '#4CAF50',    // Green for active edit mode
    recordModeActiveColor: '#f44336',  // Rouge pour mode enregistrement actif
    
    button: {
    backgroundColor: 'var(--system-input-bg-strong, rgba(108, 108, 108, 0.62))',
        top: '0px',
    color: 'var(--system-text-color, rgba(244, 244, 244, 0.94))',
    border: 'none', // Border removed for cleaner toolbar buttons
        borderRadius: '3px',
        cursor: 'pointer',
        fontSize: '14px',
    transition: 'background-color 140ms ease, color 140ms ease, box-shadow 140ms ease, transform 140ms ease',
    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
        // Layout uniforme pour tous les boutons
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Espacement uniforme
        // margin: '2px',
    padding: '4px',
        // Default sizes (applied to all buttons)
        width: '30px',
        height: '30px',
        minWidth: '30px'
    },
    
    defaultColor: {
        backgroundColor: '#lightgray',
        color: '#333',
        border: '1px solid #ccc'
    }
};

// Export the theme for use in other modules
export { default_theme };
export default default_theme;

// Helper: apply themed panel styling to a Squirrel element config (mutates css)
export function applyPanelStyle(element, options = {}) {
    if (!element) return element;
    const css = element.style || element.css || element;
    css.backgroundColor = options.backgroundColor || default_theme.colors.surface;
    css.border = `1px solid ${default_theme.colors.border}`;
    css.borderRadius = default_theme.borderRadius.md;
    css.boxShadow = default_theme.panel.shadow;
    css.backdropFilter = default_theme.panel.backdrop;
    css.padding = css.padding || default_theme.spacing.md;
    css.position = css.position || 'relative';
    return element;
}

// Helper: enforce uniform header styling
export function applyHeaderStyle(elem) {
    if (!elem) return elem;
    const css = elem.style || elem.css || elem;
    css.backgroundColor = default_theme.colors.primary;
    css.borderBottom = `1px solid ${default_theme.colors.border}`;
    css.height = default_theme.panel.headerHeight;
    css.display = 'flex';
    css.alignItems = 'center';
    css.padding = `0 ${default_theme.spacing.lg}`;
    css.fontSize = '13px';
    css.letterSpacing = '0.5px';
    css.userSelect = 'none';
    return elem;
}

// Helper: standardized focus ring
export function applyFocusRing(el) {
    if (!el) return el;
    el.addEventListener && el.addEventListener('focus', () => {
        el.style.outline = `2px solid ${default_theme.colors.focus}`;
        el.style.outlineOffset = '1px';
    });
    el.addEventListener && el.addEventListener('blur', () => {
        el.style.outline = 'none';
    });
    return el;
}

// Apply active style utility
export function setButtonActive(btn, active) {
    if (!btn) return;
    if (btn._setActive) return btn._setActive(active);
    if (active) {
        btn.style.backgroundColor = default_theme.buttonActive.backgroundColor;
        btn.style.outline = default_theme.buttonActive.outline || 'none';
    } else {
        btn.style.backgroundColor = default_theme.button.backgroundColor;
        btn.style.outline = 'none';
    }
}
