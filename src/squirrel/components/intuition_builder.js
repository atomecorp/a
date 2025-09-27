import { $ } from '../squirrel.js';

let calculatedCSS = {};
const shadowLeft = 0,
    shadowTop = 0,
    shadowBlur = 12;
const items_spacing = 3;
const item_border_radius = 6;
const item_size = 54;
const DIRECTIONS = [
    "top_left_horizontal",
    "top_right_horizontal",
    "bottom_left_horizontal",
    "bottom_right_horizontal",
    "top_left_vertical",
    "bottom_left_vertical",
    "top_right_vertical",
    "bottom_right_vertical"
];
let menuOpen = 'false';
let menuStack = [];

const palette = createPalette;
const tool = createTool;
const particle = createParticle;
const option = createOption;
const zonespecial = createZonespecial;

const Intuition_theme = {
    basic: {
        button_color: 'rgba(204, 35, 35, 0.85)',
        button_active_color: "#bbeb0eff",
        palette_bg: '#2d25d0ff',
        tool_bg: 'linear-gradient(180deg, rgba(32, 190, 48, 0.85) 0%, rgba(72,71,71,0.35) 100%)',
        particle_bg: '#4a4a4aff',
        option_bg: '#c40fdfff',
        zonespecial_bg: '#4a4a4aff',
        slider_length: '70%',
        slider_zoom_length: '100%',
        slider_length_vertical: '30%',
        slider_zoom_length_vertical: '69%',
        slider_track_color: 'rgba(241, 139, 49, 1)',
        slider_revealed_track_color: 'rgba(241, 139, 49, 1)',
        handle_color: 'rgba(248, 184, 128, 1)',
        slider_handle_size: '16%', // relative handle size (%, px, or ratio)
        slider_handle_radius: '25%', // border-radius for handle (%, px, or ratio 0..1)
        item_zoom: '330%',            // width target when pressing a slider item
        item_zoom_transition: '220ms',// animation duration
        drag_sensitivity: 0.5, // 0.5 => dx direct; <0.5 plus fin; >0.5 plus rapide
        drag_mode: 'unit', // 'unit' => 1px pointeur = 1 unité; 'percent' => (dx/width*100)
        button_size: '33%',

        items_spacing: items_spacing + 'px',
        item_size: item_size + 'px',
        support_thickness: item_size + shadowBlur + shadowTop + shadowLeft + 'px',
        // Translucent gradient for a glassy look
        tool_bg: 'linear-gradient(180deg, rgba(72,71,71,0.85) 0%, rgba(72,71,71,0.35) 100%)',
        tool_bg_active: "#7a7c73ff",
        tool_backDrop_effect: '8px',
        tool_text: "#cacacaff",
        tool_font: "0.9vw",
        tool_font_px: 10,
        text_char_max: 9,
        tool_active_bg: "#e0e0e0",
        tool_lock_bg: '#ff5555', // couleur lock
        tool_lock_pulse_duration: '1400ms', // durée animation clignotement doux
        tool_lock_toggle_mode: 'long', // 'long' (par défaut) ou 'click' pour permettre le clic simple de sortir
        tool_lock_bg: "#b22929ff",
        toolbox_icon: 'menu',            // false pour masquer, ou 'settings', 'play', etc.
        toolbox_icon_color: '#cacacaff',
        toolbox_icon_size: '30%',      // px, %, ou ratio (0..1)
        toolbox_icon_top: '50%',       // position verticale
        toolbox_icon_left: '50%',
        toolboxOffsetMain: "7px",
        toolboxOffsetEdge: "7px",
        items_offset_main: item_border_radius + items_spacing + 'px',
        icon_color: "#cacacaff",
        icon_size: "39%",
        icon_top: '60%',       // position verticale
        icon_left: '50%',
        // Toggle label/icon visibility when a palette is popped out
        palette_icon: false,
        palette_label: true,
        // Particle value/unit display (theme-driven)
        particle_value_unit: '%',
        particle_value_value: 30,
        particle_value_decimals: 0,
        particle_value_font_px: 11,
        particle_value_bottom: '6%',
        particle_value_color: '#cacacaff',
        particle_unit_color: '#9e9e9eff',
        item_shadow: `${shadowLeft}px ${shadowTop}px ${shadowBlur}px rgba(0,0,0,0.69)`,
        item_border_radius: item_border_radius + 'px',
        // Animation settings for menu open
        anim_duration_ms: 333,
        anim_stagger_ms: 33,
        anim_bounce_overshoot: 0.09,
        // Elasticity controls extra rebounds (0 = back easing, 1 = strong elastic)
        anim_elasticity: 6,
        direction: "top_left_horizontal"
    }
};





const intuition_content = {};

const currentTheme = Intuition_theme.basic;




function calculate_positions() {
    const dir = (currentTheme?.direction || 'top_left_horizontal').toLowerCase();
    const thickness = currentTheme.support_thickness || (parseFloat(currentTheme.item_size || '0') + parseFloat((currentTheme.margin || '0')) + 'px');

    const thicknessNum = parseFloat(thickness) || 0;
    const itemsSizeNum = parseFloat(currentTheme.item_size) || 0;
    const toolboxOffsetMainNum = parseFloat(currentTheme.toolboxOffsetMain) || 0;
    const toolboxOffsetEdgeNum = parseFloat(currentTheme.toolboxOffsetEdge) || 0;
    const itemsOffsetMainNum = parseFloat(currentTheme.items_offset_main || '0') || 0;

    // centrage cross‑axis
    const centerDelta = (itemsSizeNum - thicknessNum) / 2;
    const item_border_radius = parseFloat(currentTheme.item_border_radius);

    // offsets
    const itemOffsetMainPx = `${toolboxOffsetMainNum + itemsSizeNum - item_border_radius}px`;
    const itemOffsetEdgeNum = toolboxOffsetEdgeNum + centerDelta;
    const itemOffsetEdgePx = `${itemOffsetEdgeNum}px`;

    // support sizes (we remove the main padding to avoid overflow)
    const H = { width: `calc(100vw - ${itemOffsetEdgeNum}px - ${itemsOffsetMainNum}px)`, height: thickness, columnGap: currentTheme.items_spacing };
    const V = { width: thickness, height: `calc(100vh - ${itemOffsetEdgeNum}px - ${itemsOffsetMainNum}px)`, rowGap: currentTheme.items_spacing };

    let support = {};
    let trigger = {};

    switch (dir) {
        case 'top_left_horizontal':
            support = { ...H, flexDirection: 'row', top: itemOffsetEdgePx, left: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
            trigger = { top: `${toolboxOffsetEdgeNum}px`, left: `${toolboxOffsetMainNum}px` };
            break;
        case 'top_right_horizontal':
            support = { ...H, flexDirection: 'row-reverse', top: itemOffsetEdgePx, right: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
            trigger = { top: `${toolboxOffsetEdgeNum}px`, right: `${toolboxOffsetMainNum}px` };
            break;
        case 'bottom_left_horizontal':
            support = { ...H, flexDirection: 'row', bottom: itemOffsetEdgePx, left: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
            trigger = { bottom: `${toolboxOffsetEdgeNum}px`, left: `${toolboxOffsetMainNum}px` };
            break;
        case 'bottom_right_horizontal':
            support = { ...H, flexDirection: 'row-reverse', bottom: itemOffsetEdgePx, right: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
            trigger = { bottom: `${toolboxOffsetEdgeNum}px`, right: `${toolboxOffsetMainNum}px` };
            break;
        case 'top_left_vertical':
            support = { ...V, flexDirection: 'column', top: itemOffsetMainPx, left: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
            trigger = { top: `${toolboxOffsetMainNum}px`, left: `${toolboxOffsetEdgeNum}px` };
            break;
        case 'bottom_left_vertical':
            support = { ...V, flexDirection: 'column-reverse', bottom: itemOffsetMainPx, left: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
            trigger = { bottom: `${toolboxOffsetMainNum}px`, left: `${toolboxOffsetEdgeNum}px` };
            break;
        case 'top_right_vertical':
            support = { ...V, flexDirection: 'column', top: itemOffsetMainPx, right: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
            trigger = { top: `${toolboxOffsetMainNum}px`, right: `${toolboxOffsetEdgeNum}px` };
            break;
        case 'bottom_right_vertical':
            support = { ...V, flexDirection: 'column-reverse', bottom: itemOffsetMainPx, right: itemOffsetEdgePx, alignItems: 'center', overflowX: 'hidden', overflowY: 'auto' };
            trigger = { bottom: `${toolboxOffsetMainNum}px`, right: `${toolboxOffsetEdgeNum}px` };
            break;
        default:
            support = { ...H, flexDirection: 'row', top: itemOffsetEdgePx, left: itemOffsetMainPx, alignItems: 'center', overflowX: 'auto', overflowY: 'hidden' };
            trigger = { top: `${toolboxOffsetEdgeNum}px`, left: `${toolboxOffsetMainNum}px` };
    }

    // Apply item offset on the main axis using the support’s padding
    const isHorizontal = dir.includes('horizontal');
    const isReverse = (isHorizontal && dir.includes('right')) || (!isHorizontal && dir.includes('bottom'));
    const padPx = `${itemsOffsetMainNum}px`;

    if (isHorizontal) {
        if (isReverse) support.paddingRight = padPx;
        else support.paddingLeft = padPx;
    } else {
        if (isReverse) support.paddingBottom = padPx;
        else support.paddingTop = padPx;
    }

    // Fade mask on both edges. Important: when blur is active on children, avoid applying a mask on the parent
    // because WebKit may suppress backdrop-filter rendering for descendants under a masked ancestor.
    if (!currentTheme.tool_backDrop_effect) {
        const fadePx = Math.max(12, parseFloat(currentTheme.items_spacing) || 20);
        const mask = isHorizontal
            ? `linear-gradient(to right, transparent 0, black ${fadePx}px, black calc(100% - ${fadePx}px), transparent 100%)`
            : `linear-gradient(to bottom, transparent 0, black ${fadePx}px, black calc(100% - ${fadePx}px), transparent 100%)`;

        if (typeof CSS !== 'undefined' && CSS.supports &&
            (CSS.supports('mask-image: linear-gradient(black, transparent)') ||
                CSS.supports('-webkit-mask-image: linear-gradient(black, transparent)'))) {
            support.webkitMaskImage = mask;
            support.maskImage = mask;
        }
    } else {
        support.webkitMaskImage = 'none';
        support.maskImage = 'none';
    }

    // iOS native scroll needs the scrollable container to receive touch events
    // and to have momentum scrolling enabled. Also hint the primary pan axis.
    support.pointerEvents = 'none';
    support.WebkitOverflowScrolling = 'touch';
    support.touchtouch = isHorizontal ? 'pan-x' : 'pan-y';


    return { toolbox_support: support, toolbox: trigger };
}

calculatedCSS = calculate_positions();
const width = calculatedCSS.toolbox_support.width;
const height = calculatedCSS.toolbox_support.height;
const posCss = calculatedCSS.toolbox_support;

const toolbox_support = {
    id: 'toolbox_support',
    type: 'toolbox_support',
    parent: '#intuition',
    css: {
        display: 'flex',
        boxSizing: 'border-box',
        justifyContent: 'flex-start',
        position: 'fixed',
        // No width/height/posCss here, apply_layout will set them
        background: 'transparent',
        // Important: support container must NOT blur
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        // Remove any shadow on the support container
        boxShadow: 'none',
        gap: currentTheme.items_spacing,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
        // default overflow; calculate_positions will override per direction
        overflowX: 'auto',
        overflowY: 'hidden',
        pointerEvents: 'none',       // let background interactions pass through; real items stay interactive
        touchtouch: 'manipulation'
    }
};



const toolbox = {
    id: 'toolbox',
    type: 'toolbox',
    parent: '#intuition',
    css: {
        background: currentTheme.tool_bg,
        position: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 10000000,
        ...calculatedCSS.toolbox
    },
    click: function (e) { openMenu('toolbox'); },
    label: null,
    icon: 'menu'
};



function openMenu(parent) {
    const methods = (intuition_content[parent] && intuition_content[parent].children) || [];
    if (menuOpen !== parent) {
        // Reset any popped-out palette before rebuilding
        if (typeof handlePaletteClick !== 'undefined' && handlePaletteClick.active) {
            restorePalette(handlePaletteClick.active);
        }
        // Initialize navigation stack with top-level methods
        menuStack = [{ parent, children: methods.slice() }];
        const created = [];
        methods.forEach(name => {
            const def = intuition_content[name] || {};
            const label = def.label || name;
            const icon = Object.prototype.hasOwnProperty.call(def, 'icon') ? def.icon : name;
            const fct_exec = def.type;
            if (typeof fct_exec === 'function') {
                const optionalParams = { id: `_intuition_${name}`, label, icon, nameKey: name, parent: '#toolbox_support', ...(intuitionAddOn[name] || {}) };
                fct_exec(optionalParams);
                // Apply blur to the newly created item
                const itemEl = grab(`_intuition_${name}`);
                if (itemEl) {
                    try { itemEl.dataset.nameKey = name; } catch (e) { /* ignore */ }
                    applyBackdropStyle(itemEl, currentTheme.tool_backDrop_effect);
                    created.push(itemEl);
                }
            } else {
                console.warn(`Function ${fct_exec} not found`);
            }
        });
        // Add a green overflow-forcing item when opening the menu
        addOverflowForcer();
        ensureOverflowForcerAtEnd();
        requestAnimationFrame(() => {
            alignSupportToToolboxEdge();
            slideInItems(created);
        });
        menuOpen = parent;
    } else {
        // Full close: close any submenu and restore state
        closeMenu();
    }
}

function intuitionCommon(cfg) {
    const el = $('div', {
        id: cfg.id,
        parent: cfg.parent,
        class: cfg.type,
        css: {
            background: currentTheme.tool_bg,
            width: currentTheme.item_size,
            height: currentTheme.item_size,
            color: 'lightgray',
            margin: 0,
            boxShadow: currentTheme.item_shadow,
            borderRadius: currentTheme.item_border_radius,
            textAlign: 'center',
            display: 'inline-block',
            position: 'relative',
            flex: '0 0 auto',
            pointerEvents: 'auto',        // réactive les events sur l’item
            touchtouch: 'manipulation',  // tap/drag mobiles OK
            // Hide new menu items until slideIn sets their initial transform to avoid visible nudge
            visibility: (cfg.id && String(cfg.id).startsWith('_intuition_')) ? 'hidden' : 'visible',
            ...(cfg.css || {})
        }
    });
    el.click = cfg.click;
    if (typeof cfg.click === 'function') {
        el.addEventListener('click', function (e) {
            try { cfg.click.call(el, e); } catch (err) { console.error(err); }
        });
    }

    // Propagate logical key for reliable lookups regardless of display label
    if (cfg && cfg.nameKey && el && el.dataset) {
        try { el.dataset.nameKey = cfg.nameKey; } catch (e) { /* ignore */ }
    }


    // Apply or disable blur according to element type
    if (cfg.id === 'toolbox_support') {
        applyBackdropStyle(el, null);
    } else if (cfg.id === 'toolbox') {
        applyBackdropStyle(el, currentTheme.tool_backDrop_effect);
    }


    return el;
}


function createIcon(cfg) {
    // puts(cfg.icon_top);
    const parentId = cfg.id;
    const svgId = `${parentId}__icon`;
    // Nettoyer une éventuelle icône précédente
    const prev = document.getElementById(svgId);
    if (prev) { try { prev.remove(); } catch (e) { /* ignore */ } }
    const icon = cfg.icon;
    if (icon === null || icon === false || (typeof icon === 'string' && icon.trim() === '')) {
        return;
    }
    let icon_color = (cfg.icon_color || currentTheme.icon_color || '#ffffffff').trim();
    let icon_Left = (cfg.icon_left || currentTheme.icon_left || '10%').trim();
    let icon_Top = (cfg.icon_top || currentTheme.icon_top || '50%').trim();

    dataFetcher(`assets/images/icons/${icon}.svg`)
        .then(svgData => {
            // Injecte le SVG dans le parent
            render_svg(svgData, svgId, parentId, '0px', '0px', '100%', '100%', icon_color, icon_color);
            // Normalisation et centrage + taille basée sur currentTheme.icon_size
            requestAnimationFrame(() => {
                const svgEl = document.getElementById(svgId);
                const parentEl = document.getElementById(parentId);
                if (!svgEl || !parentEl) return;
                // Responsif via CSS (pas d'attributs width/height)
                svgEl.removeAttribute('width');
                svgEl.removeAttribute('height');
                svgEl.style.position = 'absolute';
                svgEl.style.left = icon_Left;
                svgEl.style.top = icon_Top;
                svgEl.style.transform = 'translate(-50%, -50%)';
                svgEl.style.display = 'block';
                svgEl.style.pointerEvents = 'none';

                // Taille: basée sur currentTheme.icon_size
                const baseSize = Math.max(1,
                    Math.min(parentEl.clientWidth || 0, parentEl.clientHeight || 0) ||
                    (parseFloat(currentTheme.item_size) || 54)
                );

                // const szDefRaw = currentTheme.icon_size != null ? String(currentTheme.icon_size).trim() : '16%';
                const szDefRaw = (cfg.icon_size || currentTheme.icon_size || '16%').trim();

                let iconSize = NaN;
                if (szDefRaw.endsWith('%')) {
                    const pct = parseFloat(szDefRaw);
                    if (!isNaN(pct)) iconSize = Math.round((pct / 100) * baseSize);
                } else if (szDefRaw.endsWith('px')) {
                    const px = parseFloat(szDefRaw);
                    if (!isNaN(px)) iconSize = Math.round(px);
                } else {
                    const num = parseFloat(szDefRaw);
                    if (!isNaN(num)) {
                        // num < 1 => ratio, sinon px
                        iconSize = num <= 1 ? Math.round(num * baseSize) : Math.round(num);
                    }
                }
                if (!isFinite(iconSize) || isNaN(iconSize)) {
                    iconSize = Math.round(0.16 * baseSize); // fallback 16%
                }
                iconSize = Math.max(8, iconSize);
                svgEl.style.width = iconSize + 'px';
                svgEl.style.height = iconSize + 'px';

                if (!svgEl.getAttribute('viewBox')) {
                    svgEl.setAttribute('viewBox', `0 0 ${iconSize} ${iconSize}`);
                }
                if (!svgEl.getAttribute('preserveAspectRatio')) {
                    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                }
            });
        })
        .catch(err => { console.error('Erreur (createIcon):', err); });
}
function createLabel(cfg) {
    if (cfg.label) {
        const rawText = String(cfg.label);
        const maxChars = parseInt(currentTheme.text_char_max, 10);
        let displayText = rawText;
        if (!isNaN(maxChars) && maxChars > 0 && rawText.length > maxChars) {
            // Réserver 1 caractère pour l'ellipse si possible
            displayText = maxChars > 1 ? rawText.slice(0, maxChars - 1) + '.' : rawText.slice(0, maxChars);
        }
        const labelEl = $('div', {
            parent: `#${cfg.id}`,
            text: displayText,
            attrs: { title: rawText },
            class: 'intuition-label',
            css: {
                position: 'absolute',
                top: '9%',             // à l'intérieur de l'item pour éviter overflow hidden du parent
                left: '50%',
                transform: 'translateX(-50%)',
                // taille fixe pour être identique dans toutes les divs
                fontSize: (currentTheme.tool_font_px || 13) + 'px',
                lineHeight: '1',
                color: currentTheme.tool_text,
                padding: '0 4px',
                backgroundColor: 'transparent',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                userSelect: 'none'
            }
        });
        // Taille fixée via Intuition_theme.tool_font_px
    }
}


const items_common = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'sans-serif',
    userSelect: 'none',

};

function createPalette(cfg) {
    const finalCss = { ...items_common, ...(cfg?.css || {}) };
    if (finalCss.background == null) {
        finalCss.background = currentTheme.palette_bg || '#4a4a4aff';
    }
    const finalCfg = { ...cfg, css: finalCss };
    var el = intuitionCommon(finalCfg);
    createLabel(finalCfg);
    createIcon(finalCfg);
    el.addEventListener('click', (e) => {
        // el.style.height = parseFloat(currentTheme.item_size) / 3 + 'px';
        // el.style.width = parseFloat(currentTheme.item_size) * 3 + 'px';
        e.stopPropagation();
        handlePaletteClick(el, finalCfg);
    });

}
function createTool(cfg) {
    const finalCss = { ...items_common, ...(cfg?.css || {}) };
    if (finalCss.background == null) {
        finalCss.background = currentTheme.tool_bg || '#4a4a4aff';
    }
    const finalCfg = { ...cfg, css: finalCss };
    const el = intuitionCommon(finalCfg);
    createLabel(finalCfg);
    createIcon(finalCfg);
    const nameKey = finalCfg.nameKey;
    const def = nameKey ? intuition_content[nameKey] : null;

    // Base click: behaves as 'touch' semantic event
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        handleToolSemanticEvent('touch', el, def, e);
    });
    // Pointer/touch down
    ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            handleToolSemanticEvent('touch_down', el, def, e);
        }, { passive: true });
    });
    // Pointer/touch up (use capture to ensure firing even if propagation canceled in children)
    ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            handleToolSemanticEvent('touch_up', el, def, e);
        }, true);
    });
    attachToolLockBehavior(el, cfg);
}
function createParticle(cfg) {
    const finalCss = { ...items_common, ...(cfg?.css || {}) };
    if (finalCss.background == null) {
        finalCss.background = currentTheme.particle_bg || currentTheme.tool_bg || '#4a4a4aff';
    }
    const finalCfg = { ...cfg, css: finalCss };
    intuitionCommon(finalCfg);
    createLabel(finalCfg);
    // createIcon(finalCfg)
    renderParticleValueFromTheme(finalCfg);
    // Render helper component (slider/button) if defined for this particle
    renderHelperForItem(finalCfg);
}
function createOption(cfg) {
    const finalCss = { ...items_common, ...(cfg?.css || {}) };
    if (finalCss.background == null) {
        finalCss.background = currentTheme.option_bg || currentTheme.tool_bg || '#4a4a4aff';
    }
    const finalCfg = { ...cfg, css: finalCss };
    const el = intuitionCommon(finalCfg);
    createLabel(finalCfg);
    createIcon(finalCfg);
    const nameKey = finalCfg.nameKey;
    const def = nameKey ? intuition_content[nameKey] : null;
    // Click behaves like semantic 'touch'
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        handleToolSemanticEvent('touch', el, def, e);
    });
    // Pointer/touch down
    ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            handleToolSemanticEvent('touch_down', el, def, e);
        }, { passive: true });
    });
    // Pointer/touch up
    ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            handleToolSemanticEvent('touch_up', el, def, e);
        }, true);
    });
}
function createZonespecial(cfg) {
    const finalCss = { ...items_common, ...(cfg?.css || {}) };
    if (finalCss.background == null) {
        finalCss.background = currentTheme.zonespecial_bg || currentTheme.tool_bg || '#4a4a4aff';
    }
    const finalCfg = { ...cfg, css: finalCss };
    const el = intuitionCommon(finalCfg);
    createLabel(finalCfg);
    createIcon(finalCfg);
    const nameKey = finalCfg.nameKey;
    const def = nameKey ? intuition_content[nameKey] : null;
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        handleToolSemanticEvent('touch', el, def, e);
    });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            handleToolSemanticEvent('touch_down', el, def, e);
        }, { passive: true });
    });
    ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            handleToolSemanticEvent('touch_up', el, def, e);
        }, true);
    });

}

// Gestion du mode lock (long press) pour les tools
function attachToolLockBehavior(el, cfg) {
    if (!el) return;
    const longPressDelay = 450; // ms
    let pressTimer = null;
    let locking = false;
    const activeColor = currentTheme.tool_active_bg || '#e0e0e0';
    const lockColor = currentTheme.tool_lock_bg || '#ff5555';
    const iconId = `${cfg.id}__icon`;
    let previousBg = '';
    let suppressNextClick = false; // évite de sortir du lock immédiatement après long press
    let pressActive = false; // vrai tant que la pression est maintenue

    // Injection d'un style global (une seule fois)
    if (!document.getElementById('intuition_tool_lock_style')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'intuition_tool_lock_style';
        styleTag.textContent = `@keyframes intuitionToolLockPulse {0%{background: var(--tool-lock-color-a);}45%{background: var(--tool-lock-color-b);}55%{background: var(--tool-lock-color-b);}100%{background: var(--tool-lock-color-a);}}
    .tool-locked{animation: intuitionToolLockPulse var(--tool-lock-pulse-duration,1200ms) ease-in-out infinite; position:relative;}
    .tool-locked .lock-glow{pointer-events:none; position:absolute; inset:0; border-radius:inherit; box-shadow:0 0 6px 2px rgba(255,255,255,0.35); mix-blend-mode:screen; animation: lockGlowPulse 1600ms ease-in-out infinite; opacity:0.9;}
    @keyframes lockGlowPulse {0%,100%{opacity:0.25; filter:blur(1px);}50%{opacity:0.75; filter:blur(2px);}}`;
        document.head.appendChild(styleTag);
    }

    const applyLockVisual = () => {
        el.style.setProperty('--tool-lock-color-a', activeColor);
        el.style.setProperty('--tool-lock-color-b', lockColor);
        el.style.setProperty('--tool-lock-pulse-duration', currentTheme.tool_lock_pulse_duration || '1400ms');
        previousBg = el.style.background;
        // Ajoute un calque glow si pas déjà
        if (!el.querySelector('.lock-glow')) {
            const glow = document.createElement('div');
            glow.className = 'lock-glow';
            el.appendChild(glow);
        }
        el.classList.add('tool-locked');
        // Tag logique lock
        el.dataset.lockTag = 'true';
    };
    const clearLockVisual = () => {
        el.classList.remove('tool-locked');
        const glow = el.querySelector('.lock-glow');
        if (glow) try { glow.remove(); } catch (_) { }
        if (previousBg) {
            try { el.style.background = previousBg; } catch (_) { }
        } else {
            try { el.style.background = currentTheme.tool_bg || ''; } catch (_) { }
        }
        delete el.dataset.lockTag;
    };

    const enterLock = () => {
        if (locking) return;
        locking = true;
        el.dataset.locked = 'true';
        applyLockVisual();
        suppressNextClick = true; // le clic qui suit le long press ne doit pas quitter le lock
        // Appel handler 'lock' (entrée)
        try { handleToolSemanticEvent('lock', el, intuition_content[el.dataset.nameKey], { phase: 'enter' }); } catch (_) { }
    };
    const exitLock = () => {
        if (!locking) return;
        locking = false;
        delete el.dataset.locked;
        clearLockVisual();
        // Appel handler 'lock' (sortie)
        try { handleToolSemanticEvent('lock', el, intuition_content[el.dataset.nameKey], { phase: 'exit' }); } catch (_) { }
    };

    // Toggle par simple clic si déjà en lock
    // Clic simple : ouvre/ferme menu via handler existant + sort du lock si actif (après suppression synthétique)
    el.addEventListener('click', (ev) => {
        if (suppressNextClick) {
            suppressNextClick = false;
            ev.stopPropagation();
            ev.preventDefault();
            return; // n'ouvre pas le menu pour le clic synthétique post long press
        }
        if (locking) {
            // Sort du lock mais laisse remonter l'event pour expansion/fermeture
            exitLock();
        }
    }, true);

    const startPress = (ev) => {
        // Ignore second pointer if already tracking
        pressActive = true;
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            if (!pressActive) return; // relâché avant délai => ne rien faire
            if (locking) {
                exitLock();
                suppressNextClick = true; // supprime le clic synthétique post long press (sortie)
            } else {
                enterLock(); // définit suppressNextClick pour ignorer le clic synthétique (entrée)
            }
        }, longPressDelay);
    };
    const cancelPress = () => {
        // Annule la détection si on a relâché avant d'atteindre le délai
        if (pressActive && !locking) {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        }
        pressActive = false;
    };

    ['mousedown', 'pointerdown', 'touchstart'].forEach(ev => el.addEventListener(ev, startPress, { passive: true }));
    ['mouseleave', 'touchcancel', 'pointercancel', 'mouseup', 'pointerup', 'touchend'].forEach(ev => el.addEventListener(ev, cancelPress));
    // On ne retire plus le lock au mouseup/pointerup/touchend pour que l'animation persiste
}

// --- Semantic tool event dispatcher ---
function handleToolSemanticEvent(kind, el, def, rawEvent) {
    if (!el) return;
    const nameKey = el.dataset && el.dataset.nameKey;
    if (!def && nameKey) {
        try { def = intuition_content[nameKey]; } catch (_) { }
    }
    const exec = (code) => {
        try {
            if (typeof code === 'function') { code({ el, event: rawEvent, kind, nameKey }); return; }
            if (typeof code === 'string') {
                // Provide limited sandbox context
                const fn = new Function('el', 'event', 'kind', 'nameKey', 'update', 'theme', code);
                fn(el, rawEvent, kind, nameKey, window.updateParticleValue, currentTheme);
            }
        } catch (err) { console.error('Tool semantic handler error', err); }
    };

    // Activation simple pour tools sans enfants
    const toggleChildlessActive = () => {
        if (!def) return;
        if (el.dataset.locked === 'true') return; // ne pas toucher si lock actif
        const hasChildren = def && Array.isArray(def.children) && def.children.length > 0;
        if (hasChildren) return;
        const isActive = el.dataset.simpleActive === 'true';
        if (isActive) {
            delete el.dataset.simpleActive;
            try { el.style.background = currentTheme.tool_bg || ''; } catch (_) { }
            delete el.dataset.activeTag;
        } else {
            el.dataset.simpleActive = 'true';
            // ordre de fallback: tool_bg_active -> tool_active_bg -> tool_bg
            const bg = currentTheme.tool_bg_active || currentTheme.tool_active_bg || currentTheme.tool_bg || '#444';
            try { el.style.background = bg; } catch (_) { }
            el.dataset.activeTag = 'true';
        }
    };

    switch (kind) {
        case 'touch_down':
            if (def && def.touch_down) exec(def.touch_down);
            // Ne bloque pas comportement par défaut (mais rien à faire ici encore)
            break;
        case 'touch_up':
            if (def && def.touch_up) exec(def.touch_up);
            break;
        case 'touch':
            if (def && def.touch) exec(def.touch);
            // Si tool avec enfants -> comportement historique (expand). Sinon toggle actif simple.
            if (def && Array.isArray(def.children) && def.children.length > 0) {
                try { expandToolInline(el, { id: el.id, nameKey }); } catch (_) { }
            } else {
                toggleChildlessActive();
            }
            break;
        case 'lock':
            if (def && def.lock) exec(def.lock);
            break;
    }
}
// Render particle value + unit at bottom from currentTheme settings (plain text only)
function renderParticleValueFromTheme(cfg) {
    if (!cfg || !cfg.id) return;
    const key = (cfg && cfg.nameKey) || (cfg && cfg.id ? String(cfg.id).replace(/^_intuition_/, '') : '');
    const def = intuition_content[key];
    if (!def) return;
    const unit = def.unit || '';
    const val = def.value;
    if (val === undefined || val === null) return;
    const decimals = Math.max(0, Math.min(6, parseInt(def.ext != null ? def.ext : 0, 10)));
    const valueText = (typeof val === 'number') ? val.toFixed(decimals) : String(val);
    const id = `${cfg.id}__particle_value`;
    const prev = document.getElementById(id);
    if (prev) { try { prev.remove(); } catch (e) { /* ignore */ } }
    const wrap = $('div', {
        id,
        parent: `#${cfg.id}`,
        class: 'particle-value',
        css: {
            position: 'absolute',
            bottom: String(currentTheme.particle_value_bottom || '6%'),
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: (currentTheme.particle_value_font_px || 11) + 'px',
            lineHeight: '1',
            background: 'transparent',
            color: 'inherit',
            pointerEvents: 'auto',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            zIndex: 30 // au-dessus du helper slider (qui est ajouté après et recouvrait le double‑clic)
        }
    });
    const valColor = String(currentTheme.particle_value_color || currentTheme.tool_text || '#fff');
    const unitColor = String(currentTheme.particle_unit_color || currentTheme.tool_text || '#fff');
    const valueSpan = $('span', { parent: wrap, text: valueText, css: { color: valColor } });
    if (unit) {
        $('span', { parent: wrap, text: unit, css: { color: unitColor, marginLeft: '2px' } });
    }

    // Empêche le parent d'intercepter le premier clic pour permettre le double‑clic immédiat
    if (valueSpan) {
        ['mousedown', 'click'].forEach(ev => {
            valueSpan.addEventListener(ev, (e) => { e.stopPropagation(); });
        });
    }

    // Inline edit on double click (value only; unit stays static)
    const particleEl = document.getElementById(cfg.id);
    const nameKey = (particleEl && particleEl.dataset && particleEl.dataset.nameKey) || (cfg && cfg.nameKey) || (cfg && cfg.id ? String(cfg.id).replace(/^_intuition_/, '') : '');
    const beginEdit = () => {
        if (!nameKey) return;
        const def = intuition_content[nameKey];
        if (!def) return;
        // Hide current value text
        try { valueSpan.style.display = 'none'; } catch (_) { }
        const inputId = `${cfg.id}__particle_value_input`;
        let input = document.getElementById(inputId);
        if (input) { try { input.remove(); } catch (e) { } }
        const isNumeric = (typeof def.value === 'number');
        input = $('input', {
            id: inputId,
            parent: wrap,
            attrs: { type: isNumeric ? 'number' : 'text', step: 'any', inputmode: isNumeric ? 'decimal' : 'text' },
            css: {
                position: 'relative',
                marginLeft: '4px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: valColor,
                fontSize: (currentTheme.particle_value_font_px || 11) + 'px',
                width: 'auto',
                minWidth: '28px',
                textAlign: 'center'
            }
        });
        input.value = String(def.value ?? '');
        // Focus/select
        try { input.focus(); input.select(); } catch (_) { }
        const commit = () => {
            const raw = input.value;
            let newVal = raw;
            if (isNumeric) {
                const n = parseFloat(raw);
                if (!isNaN(n)) {
                    // Clamp 0..100 for helper coherence (slider domain)
                    newVal = Math.max(0, Math.min(100, n));
                }
            }
            // Utilise updateParticleValue pour forcer la synchronisation helpers
            try { input.remove(); } catch (_) { }
            window.updateParticleValue(nameKey, newVal);
        };
        const cancel = () => {
            try { input.remove(); } catch (_) { }
            try { valueSpan.style.display = ''; } catch (_) { }
        };
        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
            else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
            ev.stopPropagation();
        });
        input.addEventListener('blur', commit);
    };
    // Attach on value text only to avoid accidental edit on unit
    if (valueSpan && valueSpan.addEventListener) {
        valueSpan.style.cursor = 'text';
        valueSpan.addEventListener('dblclick', (e) => { e.stopPropagation(); beginEdit(); });
        // Mobile double-tap detection
        (function setupValueMobileTap() {
            let lastTapTime = 0;
            let lastX = 0, lastY = 0;
            const TAP_DELAY = 320; // ms
            const MAX_DIST = 26;   // px tolerance between taps
            valueSpan.addEventListener('touchstart', (ev) => {
                if (!ev.touches || !ev.touches.length) return;
                const t = ev.touches[0];
                const now = Date.now();
                const dx = t.clientX - lastX;
                const dy = t.clientY - lastY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (now - lastTapTime < TAP_DELAY && dist < MAX_DIST) {
                    ev.stopPropagation();
                    ev.preventDefault();
                    lastTapTime = 0; // reset
                    beginEdit();
                    return;
                }
                lastTapTime = now;
                lastX = t.clientX; lastY = t.clientY;
            }, { passive: true });
            // Long press fallback (press & hold ~500ms)
            let lpTimer = null; let pressed = false;
            valueSpan.addEventListener('touchstart', (ev) => {
                pressed = true;
                if (lpTimer) clearTimeout(lpTimer);
                lpTimer = setTimeout(() => { if (pressed) { try { ev.stopPropagation(); } catch (_) { } beginEdit(); } }, 520);
            }, { passive: true });
            ['touchend', 'touchcancel'].forEach(evName => valueSpan.addEventListener(evName, () => { pressed = false; if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }));
        })();
    }
    if (wrap && wrap.addEventListener) {
        wrap.style.cursor = 'text';
        // Stop simple clic pour ne pas déclencher une expansion avant le double‑clic
        wrap.addEventListener('mousedown', (e) => { e.stopPropagation(); });
        wrap.addEventListener('click', (e) => { e.stopPropagation(); });
        wrap.addEventListener('dblclick', (e) => { e.stopPropagation(); beginEdit(); });
        // Same mobile support on the whole wrap (in case value span is small)
        (function setupWrapMobileTap() {
            let lastTapTime = 0; let lastX = 0, lastY = 0; const TAP_DELAY = 320; const MAX_DIST = 28;
            wrap.addEventListener('touchstart', (ev) => {
                if (!ev.touches || !ev.touches.length) return;
                const t = ev.touches[0];
                const now = Date.now();
                const dx = t.clientX - lastX; const dy = t.clientY - lastY; const dist = Math.sqrt(dx * dx + dy * dy);
                if (now - lastTapTime < TAP_DELAY && dist < MAX_DIST) {
                    ev.stopPropagation(); ev.preventDefault(); lastTapTime = 0; beginEdit(); return;
                }
                lastTapTime = now; lastX = t.clientX; lastY = t.clientY;
            }, { passive: true });
            let lpTimer = null; let pressed = false;
            wrap.addEventListener('touchstart', (ev) => { pressed = true; if (lpTimer) clearTimeout(lpTimer); lpTimer = setTimeout(() => { if (pressed) { try { ev.stopPropagation(); } catch (_) { } beginEdit(); } }, 520); }, { passive: true });
            ['touchend', 'touchcancel'].forEach(n => wrap.addEventListener(n, () => { pressed = false; if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }));
        })();
    }
}

// Render a Squirrel helper (Slider/Button) inside an item when def.helper is set
// ...existing code...
function renderHelperForItem(cfg) {
    if (!cfg || !cfg.id) return;
    const key = (cfg && cfg.nameKey) || (cfg && cfg.id ? String(cfg.id).replace(/^_intuition_/, '') : '');
    const def = intuition_content[key];
    if (!def || !def.helper) return;

    const wrapId = `${cfg.id}__helper_wrap`;
    const prev = document.getElementById(wrapId);
    if (prev) { try { prev.remove(); } catch (e) { /* ignore */ } }

    const host = document.getElementById(cfg.id);
    if (!host) return;

    // Taille de l'item (base pour convertir % / ratios)
    const itemSizeNum = parseFloat(currentTheme.item_size) || host.clientWidth || 54;

    // Wrapper plein cadre pour que les % fonctionnent (sinon % basés sur auto => 0)
    const wrap = $('div', {
        id: wrapId,
        parent: `#${cfg.id}`,
        css: {
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Laisse passer les événements hors des éléments interactifs internes
            pointerEvents: 'none',
            background: 'transparent',
            width: '100%',
            height: '100%',
            zIndex: 10
        }
    });

    // Normalisation d’une définition de taille (%, px, ratio, nombre)
    const normalizeSize = (raw, fallbackPct) => {
        let v = (raw == null ? `${fallbackPct}%` : String(raw)).trim();
        if (v.endsWith('%')) {
            const pct = parseFloat(v);
            if (!isNaN(pct)) return Math.max(4, Math.round((pct / 100) * itemSizeNum)) + 'px';
        } else if (v.endsWith('px')) {
            const px = parseFloat(v);
            if (!isNaN(px)) return Math.max(4, px) + 'px';
        } else {
            const num = parseFloat(v);
            if (!isNaN(num)) {
                if (num <= 1) { // ratio
                    return Math.max(4, Math.round(num * itemSizeNum)) + 'px';
                }
                return Math.max(4, Math.round(num)) + 'px';
            }
        }
        return Math.round((fallbackPct / 100) * itemSizeNum) + 'px';
    };

    const helper = String(def.helper).toLowerCase();

    if (helper === 'slider' && typeof window.Slider === 'function') {
        const dir = (currentTheme?.direction || 'top_left_horizontal').toLowerCase();
        const isVertical = dir.includes('vertical');
        // Choix des clefs selon orientation
        const rawLen = isVertical ? currentTheme.slider_length_vertical : currentTheme.slider_length;
        const rawZoomLen = isVertical ? currentTheme.slider_zoom_length_vertical : currentTheme.slider_zoom_length;
        // Taille principale (width si horizontal, height si vertical)
        let mainSize;
        if (rawLen && typeof rawLen === 'string' && rawLen.trim().endsWith('%')) {
            mainSize = rawLen.trim();
        } else {
            mainSize = normalizeSize(rawLen, isVertical ? 30 : 70); // fallback 30% vertical, 70% horizontal
        }
        // Longueur alternative pendant zoom
        let zoomMainSize = null;
        if (rawZoomLen != null) {
            if (typeof rawZoomLen === 'string' && rawZoomLen.trim().endsWith('%')) {
                zoomMainSize = rawZoomLen.trim();
            } else {
                zoomMainSize = normalizeSize(rawZoomLen, isVertical ? 80 : 70);
            }
        }
        // Taille secondaire (épaisseur du slider)
        const thicknessPx = Math.max(10, Math.round(itemSizeNum * 0.28)) + 'px';

        const sliderId = `${cfg.id}__helper_slider`;
        const valueNum = (typeof def.value === 'number') ? def.value : parseFloat(def.value) || 0;
        const step = (() => {
            const ext = parseInt(def.ext != null ? def.ext : 0, 10);
            if (!isFinite(ext) || ext <= 0) return 1;
            return Math.pow(10, -Math.min(3, ext));
        })();

        const slider = Slider({
            id: sliderId,
            parent: wrap,
            type: isVertical ? 'vertical' : 'horizontal',
            min: 0,
            max: 100,
            value: Math.max(0, Math.min(100, valueNum)),
            step,
            showLabel: false,
            css: {
                width: isVertical ? thicknessPx : mainSize,
                height: isVertical ? mainSize : thicknessPx,
                pointerEvents: 'auto'
            },
            onInput: (v) => {
                const nv = (typeof v === 'number') ? v : parseFloat(v) || 0;
                if (slider._syncing) return;
                window.updateParticleValue(key, nv);
            },
            onChange: (v) => {
                const nv = (typeof v === 'number') ? v : parseFloat(v) || 0;
                if (slider._syncing) return;
                window.updateParticleValue(key, nv);
            }
        });
        try { host._helperSlider = slider; } catch (_) { }

        // Zoom animation on press / touch (parent + option slider width)
        (function attachZoom() {
            const itemEl = host;
            if (!itemEl || itemEl._zoomAttached) return;
            itemEl._zoomAttached = true;
            const zoomRaw = currentTheme.item_zoom; // réutilisé pour width (horizontal) ou height (vertical)
            const dur = currentTheme.item_zoom_transition || '200ms';
            const parseTarget = (raw, base) => {
                if (!raw) return null;
                const s = String(raw).trim();
                if (s.endsWith('%')) { const p = parseFloat(s); if (!isNaN(p)) return base * (p / 100); }
                else if (s.endsWith('px')) { const px = parseFloat(s); if (!isNaN(px)) return px; }
                else { const num = parseFloat(s); if (!isNaN(num)) return (num <= 3 ? base * num : num); }
                return null;
            };
            const onDown = (e) => {
                if (e.type === 'mousedown' && e.button !== 0) return;
                if (isVertical) {
                    if (!itemEl._origHeightPx) itemEl._origHeightPx = itemEl.getBoundingClientRect().height;
                } else {
                    if (!itemEl._origWidthPx) itemEl._origWidthPx = itemEl.getBoundingClientRect().width;
                }
                const baseDim = isVertical ? itemEl._origHeightPx : itemEl._origWidthPx;
                const target = parseTarget(zoomRaw, baseDim);
                const sliderRoot = document.getElementById(sliderId);
                const hasSliderAlt = !!zoomMainSize && sliderRoot;
                const doParentZoom = target && Math.abs(target - baseDim) >= 2;
                if (!doParentZoom && !hasSliderAlt) return; // rien à faire
                // Empêche la lib interne d'attraper l'event et de repositionner brutalement le handle
                try { e.stopPropagation(); e.preventDefault(); } catch (_) { }
                if (doParentZoom) {
                    if (isVertical) {
                        itemEl.style.transition = `height ${dur} ease`;
                        itemEl.style.height = target + 'px';
                    } else {
                        itemEl.style.transition = `width ${dur} ease`;
                        itemEl.style.width = target + 'px';
                    }
                    itemEl.dataset.zoomed = 'true';
                }
                if (hasSliderAlt) {
                    if (isVertical) {
                        if (!sliderRoot._origHeightStyle) sliderRoot._origHeightStyle = sliderRoot.style.height;
                        try { sliderRoot.style.transition = `height ${dur} ease`; } catch (_) { }
                        if (zoomMainSize !== sliderRoot.style.height && zoomMainSize) {
                            sliderRoot.style.height = zoomMainSize;
                        }
                    } else {
                        if (!sliderRoot._origWidthStyle) sliderRoot._origWidthStyle = sliderRoot.style.width;
                        try { sliderRoot.style.transition = `width ${dur} ease`; } catch (_) { }
                        if (zoomMainSize !== sliderRoot.style.width && zoomMainSize) {
                            sliderRoot.style.width = zoomMainSize;
                        }
                    }
                }
                // Mode drag relatif : capture la valeur et la position de départ
                let baseVal = intuition_content[key] && intuition_content[key].value;
                if (typeof baseVal !== 'number') baseVal = parseFloat(baseVal) || 0;
                baseVal = Math.max(0, Math.min(100, baseVal));
                const startPos = (e.touches && e.touches.length) ? (isVertical ? e.touches[0].clientY : e.touches[0].clientX) : (isVertical ? e.clientY : e.clientX);
                const rect = (sliderRoot || itemEl).getBoundingClientRect();
                const spanRef = isVertical ? rect.height : rect.width;
                const sensitivity = (() => {
                    const s = parseFloat(currentTheme.drag_sensitivity);
                    return (isFinite(s) && s > 0) ? s : 1;
                })();
                let dragging = true;
                const dragMode = currentTheme.drag_mode || 'unit';
                const applyDelta = (d) => {
                    d = d * sensitivity; // applique sensibilité
                    let nv;
                    if (dragMode === 'percent') {
                        nv = baseVal + (d / spanRef) * 100; // ancien mode
                    } else {
                        // unit: 1px = 1 unité de valeur
                        nv = baseVal + d;
                    }
                    nv = Math.max(0, Math.min(100, nv));
                    if (step && step > 0) {
                        const inv = 1 / step;
                        nv = Math.round(nv * inv) / inv;
                    }
                    window.updateParticleValue(key, nv);
                };
                const onMove = (ev) => {
                    if (!dragging) return;
                    const cPos = (ev.touches && ev.touches.length) ? (isVertical ? ev.touches[0].clientY : ev.touches[0].clientX) : (isVertical ? ev.clientY : ev.clientX);
                    const dRaw = cPos - startPos;
                    const d = isVertical ? -dRaw : dRaw; // Inversion verticale: monter augmente, descendre diminue
                    applyDelta(d);
                    try { ev.stopPropagation(); ev.preventDefault(); } catch (_) { }
                };
                const release = () => {
                    if (itemEl.dataset.zoomed) {
                        try { itemEl.style.transition = `${isVertical ? 'height' : 'width'} ${dur} ease`; } catch (_) { }
                        if (isVertical) {
                            itemEl.style.height = itemEl._origHeightPx + 'px';
                        } else {
                            itemEl.style.width = itemEl._origWidthPx + 'px';
                        }
                        delete itemEl.dataset.zoomed;
                    }
                    if (sliderRoot) {
                        if (isVertical && sliderRoot._origHeightStyle != null) {
                            try { sliderRoot.style.transition = `height ${dur} ease`; } catch (_) { }
                            sliderRoot.style.height = sliderRoot._origHeightStyle;
                        } else if (!isVertical && sliderRoot._origWidthStyle != null) {
                            try { sliderRoot.style.transition = `width ${dur} ease`; } catch (_) { }
                            sliderRoot.style.width = sliderRoot._origWidthStyle;
                        }
                    }
                    dragging = false;
                    ['mousemove', 'pointermove', 'touchmove'].forEach(ev => document.removeEventListener(ev, onMove, true));
                    ['mouseup', 'pointerup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => document.removeEventListener(ev, release, true));
                };
                ['mouseup', 'pointerup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => document.addEventListener(ev, release, true));
                ['mousemove', 'pointermove', 'touchmove'].forEach(ev => document.addEventListener(ev, onMove, true));
            };
            const sliderRootInit = document.getElementById(sliderId);
            if (sliderRootInit) {
                if (isVertical) {
                    if (String(sliderRootInit.style.height).endsWith('%')) {
                        try { sliderRootInit.style.transition = `height ${dur} ease`; } catch (_) { }
                    }
                    sliderRootInit.addEventListener('mousedown', onDown, true);
                    sliderRootInit.addEventListener('pointerdown', onDown, true);
                    sliderRootInit.addEventListener('touchstart', onDown, { passive: true, capture: true });
                } else {
                    if (String(sliderRootInit.style.width).endsWith('%')) {
                        try { sliderRootInit.style.transition = `width ${dur} ease`; } catch (_) { }
                    }
                    sliderRootInit.addEventListener('mousedown', onDown, true);
                    sliderRootInit.addEventListener('pointerdown', onDown, true);
                    sliderRootInit.addEventListener('touchstart', onDown, { passive: true, capture: true });
                }
            }
        })();
        // Apply relative handle size from theme
        requestAnimationFrame(() => {
            const handleSizeRaw = currentTheme.slider_handle_size;
            if (!handleSizeRaw) return;
            let pxVal = null;
            const norm = String(handleSizeRaw).trim();
            if (norm.endsWith('%')) {
                const pct = parseFloat(norm);
                if (!isNaN(pct)) pxVal = Math.max(4, Math.round(itemSizeNum * (pct / 100)));
            } else if (norm.endsWith('px')) {
                const n = parseFloat(norm); if (!isNaN(n)) pxVal = Math.max(4, n);
            } else {
                const n = parseFloat(norm);
                if (!isNaN(n)) {
                    // treat <=1 as ratio
                    pxVal = n <= 1 ? Math.max(4, Math.round(itemSizeNum * n)) : Math.max(4, Math.round(n));
                }
            }
            if (pxVal == null) return;
            const root = document.getElementById(sliderId);
            if (!root) return;
            const handleSelectors = ['.hs-slider-handle', '.slider-handle', '.slider_handle', '.handle'];
            let handleEl = null;
            for (const sel of handleSelectors) { handleEl = root.querySelector(sel); if (handleEl) break; }
            if (!handleEl) return;
            // Colorize track / progression / handle from theme
            const trackEl = root.querySelector('.hs-slider-track');
            if (trackEl && currentTheme.slider_track_color) {
                try { trackEl.style.backgroundColor = currentTheme.slider_track_color; } catch (_) { }
            }
            const progEl = root.querySelector('.hs-slider-progression');
            if (progEl && currentTheme.slider_revealed_track_color) {
                try { progEl.style.backgroundColor = currentTheme.slider_revealed_track_color; } catch (_) { }
            }
            handleEl.style.width = pxVal + 'px';
            handleEl.style.height = pxVal + 'px';
            handleEl.style.minWidth = pxVal + 'px';
            handleEl.style.minHeight = pxVal + 'px';
            // Remove default blue border/outline from base slider component
            handleEl.style.border = 'none';
            handleEl.style.outline = 'none';
            if (currentTheme.handle_color) {
                try { handleEl.style.backgroundColor = currentTheme.handle_color; } catch (_) { }
            }
            // Optionally remove box shadow if undesired; comment out if you want to keep it
            // handleEl.style.boxShadow = 'none';
            // Apply radius from theme
            const rRaw = currentTheme.slider_handle_radius;
            if (rRaw != null) {
                const rStr = String(rRaw).trim();
                if (rStr.endsWith('%') || rStr.endsWith('px')) {
                    handleEl.style.borderRadius = rStr;
                } else {
                    const rv = parseFloat(rStr);
                    if (!isNaN(rv)) {
                        if (rv <= 1) handleEl.style.borderRadius = (rv * 50) + '%';
                        else handleEl.style.borderRadius = rv + 'px';
                    }
                }
            } else {
                handleEl.style.borderRadius = '50%';
            }
        });
    } else if (helper === 'button' && typeof window.Button === 'function') {
        const rawBtn = currentTheme.button_size;
        const sizePx = normalizeSize(rawBtn, 33);
        const btnId = `${cfg.id}__helper_button`;
        const curVal = intuition_content[key] && intuition_content[key].value;
        const isOn = !!curVal && Number(curVal) !== 0;
        const buttonObj = Button({
            id: btnId,
            parent: wrap,
            onText: '', // pas de label
            offText: '',
            css: {
                width: sizePx,
                height: sizePx,
                fontSize: `${Math.max(9, Math.round(itemSizeNum * 0.22))}px`,
                backgroundColor: isOn ? currentTheme.button_active_color : currentTheme.button_color,
                boxShadow: currentTheme.item_shadow,
                border: 'none',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0',
                pointerEvents: 'auto'
            },
            ontouch: () => {
                const cur = intuition_content[key] && intuition_content[key].value;
                const on = !!cur && Number(cur) !== 0;
                const next = on ? 0 : 100;
                window.updateParticleValue(key, next);
            },
            offtouch: () => {
                const cur = intuition_content[key] && intuition_content[key].value;
                const on = !!cur && Number(cur) !== 0;
                const next = on ? 0 : 100;
                window.updateParticleValue(key, next);
            }
        });
        try { host._helperButton = buttonObj; } catch (_) { }
    }
}
// ...existing code...
// Update a single particle's value/unit/ext in intuition_content and refresh its display
window.updateParticleValue = function (nameKey, newValue, newUnit, newExt) {
    if (!nameKey || !(nameKey in intuition_content)) return;
    const def = intuition_content[nameKey];
    if (!def) return;
    if (newValue !== undefined) def.value = newValue;
    if (newUnit !== undefined) def.unit = newUnit;
    if (newExt !== undefined) def.ext = newExt;
    const elId = `_intuition_${nameKey}`;
    const el = document.getElementById(elId);
    if (!el) return;
    renderParticleValueFromTheme({ id: elId, nameKey });
    // Sync helper slider (use stored reference if any)
    const host = el;
    const currentVal = def.value;
    if (host && host._helperSlider) {
        const comp = host._helperSlider;
        if (typeof comp.setValue === 'function') {
            try { comp._syncing = true; comp.setValue(currentVal); } catch (_) { } finally { try { comp._syncing = false; } catch (_) { } }
        }
    } else {
        const sliderEl = document.getElementById(`${elId}__helper_slider`);
        if (sliderEl && typeof sliderEl.setValue === 'function') {
            try { sliderEl._syncing = true; sliderEl.setValue(currentVal); } catch (_) { } finally { try { sliderEl._syncing = false; } catch (_) { } }
        }
    }
    // Ensure visual progression update (some slider libs only update on input events)
    try {
        const root = document.getElementById(`${elId}__helper_slider`);
        if (root) {
            const prog = root.querySelector('.hs-slider-progression');
            if (prog) prog.style.width = Math.max(0, Math.min(100, parseFloat(currentVal))) + '%';
        }
    } catch (_) { }
    // Sync helper button color/state
    const active = !!currentVal && Number(currentVal) !== 0;
    if (host && host._helperButton) {
        const btn = host._helperButton;
        try {
            // Récupère le node style cible (certaines implémentations exposent .el, d'autres .root ou rien)
            let targetEl = null;
            if (btn) {
                if (btn.el) targetEl = btn.el;
                else if (btn.root) targetEl = btn.root;
                else if (typeof btn.getElement === 'function') targetEl = btn.getElement();
            }
            if (!targetEl) {
                // Fallback via id
                targetEl = document.getElementById(`${elId}__helper_button`);
            }
            if (targetEl && targetEl.style) {
                targetEl.style.backgroundColor = active ? currentTheme.button_active_color : currentTheme.button_color;
                targetEl.style.boxShadow = currentTheme.item_shadow;
                targetEl.style.border = 'none';
                targetEl.style.outline = 'none';
            }
        } catch (_) { }
    } else {
        const btnEl = document.getElementById(`${elId}__helper_button`);
        if (btnEl) {
            try { btnEl.style.backgroundColor = active ? currentTheme.button_active_color : currentTheme.button_color; } catch (_) { }
            try { btnEl.style.boxShadow = currentTheme.item_shadow; } catch (_) { }
        }
    }
};
// Toggle an inline expansion of a tool's children right after the clicked tool
function expandToolInline(el, cfg) {
    if (!el) return;
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    const key = (el.dataset && el.dataset.nameKey) || (cfg && cfg.nameKey) || ((cfg && cfg.id) ? String(cfg.id).replace(/^_intuition_/, '') : '');
    const desc = intuition_content[key];
    const children = (desc && Array.isArray(desc.children)) ? desc.children : null;
    if (!children || !children.length) return;

    // If already expanded, collapse the contiguous inline children belonging to this tool
    if (el.dataset && el.dataset.expanded === 'true') {
        let node = el.nextSibling;
        while (node && node.id !== '_intuition_overflow_forcer') {
            const inlineParent = node && node.dataset ? node.dataset.inlineParent : null;
            if (inlineParent !== key) break;
            const toRemove = node;
            node = node.nextSibling;
            try { toRemove.remove(); } catch (e) { /* ignore */ }
        }
        el.dataset.expanded = 'false';
        // Restore inactive background when collapsed
        try { el.style.background = currentTheme.tool_bg; } catch (_) { }
        delete el.dataset.activeTag;
        ensureOverflowForcerAtEnd();
        return;
    }

    // Expand: create/insert each child right after the tool, in order
    let insertAfter = el;
    const created = [];
    children.forEach((name) => {
        const def = intuition_content[name];
        if (!def || typeof def.type !== 'function') return;
        const id = `_intuition_${name}`;
        let childEl = document.getElementById(id);
        if (!childEl) {
            const label = def.label || name;
            const icon = Object.prototype.hasOwnProperty.call(def, 'icon') ? def.icon : name;
            const params = { id, label, icon, nameKey: name, parent: '#toolbox_support' };
            def.type(params);
            childEl = document.getElementById(id);
        }
        if (!childEl) return;
        // Mark as inline child of this tool for collapse logic
        try { if (childEl.dataset) childEl.dataset.inlineParent = key; } catch (_) { }
        // Ensure it becomes visible even though intuitionCommon hides new menu items until slideIn
        childEl.style.visibility = 'visible';
        childEl.style.transform = 'translate3d(0,0,0)';
        applyBackdropStyle(childEl, currentTheme.tool_backDrop_effect);
        // Insert right after the current insertion point
        if (insertAfter.nextSibling) supportEl.insertBefore(childEl, insertAfter.nextSibling);
        else supportEl.appendChild(childEl);
        insertAfter = childEl;
        created.push(childEl);
    });

    // Maintain overflow-forcer at the end so layout remains correct
    ensureOverflowForcerAtEnd();
    if (el.dataset) el.dataset.expanded = 'true';
    // Highlight as active while expanded
    try { el.style.background = currentTheme.tool_bg_active; } catch (_) { }
    el.dataset.activeTag = 'true';
}
const intuitionAddOn = {
    communication: { label: 'communication', icon: 'communication' }
};

function ensureIntuitionLayerRoot() {
    if (typeof document === 'undefined') return null;
    let root = document.getElementById('intuition');
    if (root) return root;
    const parent = document.body || document.documentElement;
    if (!parent) return null;
    root = $('div', {
        id: 'intuition',
        class: 'atome',
        parent,
        css: {
            zIndex: 9999999,
            background: 'transparent',
            color: 'lightgray',
            left: '0px',
            top: '0px',
            position: 'absolute',
            width: '0px',
            height: '0px',
            overflow: 'visible'
        }
    });
    return root;
}

function createToolbox() {
    intuitionCommon(toolbox_support);
    const toolboxEl = intuitionCommon(toolbox);
    // Ensure scrolling on the toolbox controls the support overflow
    setupToolboxScrollProxy();
    enforceSupportHitThrough();
    // Apply initial backdrop styles
    const supportEl = grab('toolbox_support');
    if (supportEl) applyBackdropStyle(supportEl, null);
    if (toolboxEl) applyBackdropStyle(toolboxEl, currentTheme.tool_backDrop_effect);

    // >>> Ajouter l’icône du toolbox (optionnelle via le thème)
    {
        const iconName = (currentTheme.toolbox_icon === false) ? null : (currentTheme.toolbox_icon || toolbox.icon);

        if (iconName) {
            const iconSize = currentTheme.toolbox_icon_size || '30%';
            const iconTop = currentTheme.toolbox_icon_top || '50%';
            const iconLeft = currentTheme.toolbox_icon_left || '50%';
            createIcon({
                id: 'toolbox',
                icon: iconName,
                icon_color: currentTheme.toolbox_icon_color || currentTheme.icon_color,
                icon_size: iconSize,
                icon_top: iconTop,
                icon_left: iconLeft
            });
        }
    }

    // Hide scrollbars on iOS/WebKit (visual only, scrolling still works)
    ensureHiddenScrollbarsStyle();
}

function apply_layout() {
    calculatedCSS = calculate_positions();

    const supportEl = grab('toolbox_support');
    const triggerEl = grab('toolbox');

    if (supportEl) {
        // Reset anchors and paddings that may remain from a previous direction
        ['top', 'right', 'bottom', 'left'].forEach(k => supportEl.style[k] = 'auto');
        ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(k => supportEl.style[k] = '0');

        Object.assign(supportEl.style, calculatedCSS.toolbox_support);
        supportEl.style.width = calculatedCSS.toolbox_support.width;
        supportEl.style.height = calculatedCSS.toolbox_support.height;
        supportEl.style.gap = currentTheme.items_spacing;
    }
    if (triggerEl) {
        ['top', 'right', 'bottom', 'left'].forEach(k => triggerEl.style[k] = 'auto');
        Object.assign(triggerEl.style, calculatedCSS.toolbox);
    }
    // Re-ensure scroll proxy after layout updates
    setupToolboxScrollProxy();
    enforceSupportHitThrough();
    // Re-apply backdrop styles (layout may reset style props)
    if (supportEl) applyBackdropStyle(supportEl, null);
    if (triggerEl) applyBackdropStyle(triggerEl, currentTheme.tool_backDrop_effect);
    if (supportEl) {
        Array.from(supportEl.children || []).forEach(child => {
            if (child && child.id !== '_intuition_overflow_forcer') {
                applyBackdropStyle(child, currentTheme.tool_backDrop_effect);
            }
        });
    }
    // Align to toolbox edge first (direction may have changed), then reposition popped-out palette
    alignSupportToToolboxEdge();
    // Reposition any popped-out palette on layout changes
    repositionPoppedPalette();
    // If a palette is currently popped out, re-apply icon/label visibility according to theme
    if (typeof handlePaletteClick !== 'undefined' && handlePaletteClick.active && handlePaletteClick.active.el) {
        setPaletteVisualState(handlePaletteClick.active.el, true);
    }
}


// Inject CSS to hide scrollbars for the support container (WebKit/iOS)
function ensureHiddenScrollbarsStyle() {
    if (document.getElementById('intuition-hidden-scrollbar-style')) return;
    const css = `
  /* Hide scrollbars at all times for the support container */
  #toolbox_support { -ms-overflow-style: none; scrollbar-width: none; }
  #toolbox_support::-webkit-scrollbar { display: none; width: 0 !important; height: 0 !important; background: transparent; }
  `;
    $('style', { id: 'intuition-hidden-scrollbar-style', parent: 'head', text: css });
}

// Helper to set backdrop-filter with WebKit prefix
function applyBackdropStyle(el, blurPx) {
    if (!el || !el.style) return;
    const val = blurPx ? `blur(${blurPx})` : 'none';
    try {
        el.style.backdropFilter = val;
        el.style.WebkitBackdropFilter = val;
        el.style.setProperty('backdrop-filter', val);
        el.style.setProperty('-webkit-backdrop-filter', val);
    } catch (e) { /* ignore */ }
}

// Center label utilities for pop-out state
function setLabelCentered(el, centered) {
    if (!el || !el.querySelector) return;
    const lbl = el.querySelector('.intuition-label');
    if (!lbl) return;
    if (centered) {
        lbl.style.top = '50%';
        lbl.style.left = '50%';
        lbl.style.transform = 'translate(-50%, -50%)';
        lbl.style.textAlign = 'center';
    } else {
        lbl.style.top = '9%';
        lbl.style.left = '50%';
        lbl.style.transform = 'translateX(-50%)';
        lbl.style.textAlign = '';
    }
}

// Control label/icon visibility depending on palette state and theme options
function setPaletteVisualState(el, isOutside) {
    if (!el) return;
    const labelEl = el.querySelector('.intuition-label');
    const iconEl = document.getElementById(`${el.id}__icon`);
    if (isOutside) {
        if (labelEl) labelEl.style.display = (currentTheme.palette_label === false) ? 'none' : '';
        if (iconEl) iconEl.style.display = (currentTheme.palette_icon === false) ? 'none' : '';
    } else {
        if (labelEl) labelEl.style.display = '';
        if (iconEl) iconEl.style.display = '';
    }
}

// ===== Animation helpers (menu open) =====
function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Parametric back easing to tune overshoot based on theme
function easeOutBackP(t, s) {
    const c3 = s + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}

// Elastic easing (parametric): s in [0..1] controls strength, 0 -> no elastic, 1 -> strong
function easeOutElasticP(t, s) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    // Map s to amplitude/duration parameters
    const p = 0.3 + 0.2 * s; // period
    const a = 1; // amplitude
    const c4 = (2 * Math.PI) / p;
    return a * Math.pow(2, -10 * t) * Math.sin((t - p / 4) * c4) + 1;
}

function getEasingOpen() {
    const elastic = Math.max(0, Math.min(1, currentTheme.anim_elasticity || 0));
    if (elastic > 0) {
        return (tt) => easeOutElasticP(tt, elastic);
    }
    const s = 1.70158 + ((currentTheme.anim_bounce_overshoot || 0.08) * 3);
    return (tt) => easeOutBackP(tt, s);
}

function getEasingClose() {
    // For closing, avoid elastic to prevent perceived reversed oscillations
    const s = 1.70158 + ((currentTheme.anim_bounce_overshoot || 0.08) * 3);
    return (tt) => easeOutBackP(tt, s);
}

function animate(duration, onUpdate, onDone) {
    const start = (performance && performance.now ? performance.now() : Date.now());
    const tick = () => {
        const now = (performance && performance.now ? performance.now() : Date.now());
        const t = Math.min(1, (now - start) / duration);
        onUpdate(t);
        if (t < 1) requestAnimationFrame(tick); else if (onDone) onDone();
    };
    requestAnimationFrame(tick);
}

function getSupportOrigin() {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return null;
    const r = supportEl.getBoundingClientRect();
    const { isTop, isBottom, isLeft, isRight } = getDirMeta();
    const ox = isRight ? r.right : r.left;
    const oy = isBottom ? r.bottom : r.top;
    return { ox, oy };
}

function slideInItems(items) {
    const els = (items || []).filter(Boolean);
    if (!els.length) return;
    const origin = getSupportOrigin();
    if (!origin) return;
    const dur = currentTheme.anim_duration_ms || 420;
    const stagger = currentTheme.anim_stagger_ms || 24;
    const easing = getEasingOpen();
    const { isRight, isBottom, isHorizontal } = getDirMeta();
    els.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        // Anchor to the edge matching the origin corner to avoid initial nudge
        const anchorX = isRight ? rect.right : rect.left;
        const anchorY = isBottom ? rect.bottom : rect.top;
        let dx = origin.ox - anchorX;
        let dy = origin.oy - anchorY;
        // Avoid cross-axis movement: only animate along main axis
        if (isHorizontal) dy = 0; else dx = 0;
        // Start visually at support origin corner. Hide until the transform is in place
        el.style.willChange = 'transform';
        el.style.visibility = 'hidden';
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        const delay = idx * stagger;
        // Ensure the initial position is committed before animating
        requestAnimationFrame(() => {
            el.style.visibility = '';
            setTimeout(() => {
                animate(dur, (tt) => {
                    const t = easing(tt);
                    // Convert to translate from origin to final
                    const f = 1 - t;
                    el.style.transform = `translate3d(${dx * f}px, ${dy * f}px, 0)`;
                }, () => {
                    el.style.transform = 'translate3d(0, 0, 0)';
                    el.style.willChange = '';
                });
            }, delay);
        });
    });
}

// Slide items out toward the support origin corner, then remove them
function slideOutItemsToOrigin(items, onAllDone) {
    const els = (items || []).filter(Boolean);
    if (!els.length) { if (onAllDone) onAllDone(); return; }
    const origin = getSupportOrigin();
    if (!origin) { // fallback: remove without anim
        els.forEach(el => { try { el.remove(); } catch (e) { } });
        if (onAllDone) onAllDone();
        return;
    }
    const dur = currentTheme.anim_duration_ms || 420;
    const stagger = currentTheme.anim_stagger_ms || 24;
    const easing = getEasingClose();
    const { isRight, isBottom, isHorizontal } = getDirMeta();
    let done = 0;
    els.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        // Anchor to the edge matching the origin corner to avoid initial nudge
        const anchorX = isRight ? rect.right : rect.left;
        const anchorY = isBottom ? rect.bottom : rect.top;
        let dx = origin.ox - anchorX;
        let dy = origin.oy - anchorY;
        // Avoid cross-axis movement: only animate along main axis
        if (isHorizontal) dy = 0; else dx = 0;
        el.style.willChange = 'transform';
        const delay = idx * stagger;
        setTimeout(() => {
            animate(dur, (tt) => {
                const t = easing(tt);
                // Move from current position to origin with slight overshoot
                el.style.transform = `translate(${dx * t}px, ${dy * t}px)`;
            }, () => {
                try { el.remove(); } catch (e) { }
                el.style.willChange = '';
                done++;
                if (done === els.length && onAllDone) onAllDone();
            });
        }, delay);
    });
}


// Isolated methods to add/remove a green item to force overflow
function addOverflowForcer() {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    if (document.getElementById('_intuition_overflow_forcer')) return;

    // Create a transparent block matching the item size to extend the scrollable area
    $('div', {
        id: '_intuition_overflow_forcer',
        parent: '#toolbox_support',
        css: {
            backgroundColor: 'transparent', // was 'green' for testing
            width: currentTheme.item_size,
            height: currentTheme.item_size,
            borderRadius: currentTheme.item_border_radius,
            flex: '0 0 auto',
            pointerEvents: 'none'
        }
    });

    // Ensure it's at the very end so it truly forces extra scroll
    const el = document.getElementById('_intuition_overflow_forcer');
    if (el && el.parentElement && el.parentElement.lastElementChild !== el) {
        el.parentElement.appendChild(el);
    }
}

function removeOverflowForcer() {
    const el = document.getElementById('_intuition_overflow_forcer');
    if (el) el.remove();
}

function enforceSupportHitThrough() {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    supportEl.style.pointerEvents = 'none';
}



window.addEventListener('resize', apply_layout);
window.setDirection = function (dir) {
    currentTheme.direction = String(dir).toLowerCase();
    apply_layout();
};

// Helper to recalculate after theme/value changes
window.refreshMenu = function (partialTheme = {}) {
    Object.assign(currentTheme, partialTheme);
    apply_layout();
    // Update active popped palette visuals after theme change
    if (typeof handlePaletteClick !== 'undefined' && handlePaletteClick.active && handlePaletteClick.active.el) {
        setPaletteVisualState(handlePaletteClick.active.el, true);
    }
    // Refresh particle displays from theme without rebuilding the whole menu
    try {
        const supportEl = grab('toolbox_support');
        if (supportEl) {
            const nodes = supportEl.querySelectorAll('[id^="_intuition_"]');
            nodes.forEach(node => {
                if (!node || !node.dataset) return;
                const key = node.dataset.nameKey || String(node.id).replace(/^_intuition_/, '');
                const def = intuition_content[key];
                if (!def || def.type !== particle) return;
                renderParticleValueFromTheme({ id: node.id, nameKey: key });
                // Refresh helper sizing/placement too
                renderHelperForItem({ id: node.id, nameKey: key });
            });
        }
    } catch (e) { /* ignore */ }
};
const bootstrapIntuition = () => {
    const intuitionRoot = document.getElementById('intuition');
    const viewRoot = document.getElementById('view');
    if (!intuitionRoot || !viewRoot) return;
    if (!bootstrapIntuition._initialized) {
        createToolbox();
        apply_layout();
        bootstrapIntuition._initialized = true;
    } else {
        apply_layout();
    }

    window.removeEventListener('squirrel:ready', bootstrapIntuition, true);
    document.removeEventListener('DOMContentLoaded', bootstrapIntuition, true);
};

if (document.readyState !== 'loading') {
    bootstrapIntuition();
}
window.addEventListener('squirrel:ready', bootstrapIntuition, true);
document.addEventListener('DOMContentLoaded', bootstrapIntuition, true);
requestAnimationFrame(bootstrapIntuition);



// Forward wheel/touch intertouch on the toolbox to scroll the toolbox_support overflow
function setupToolboxScrollProxy() {
    const toolboxEl = grab('toolbox');
    const supportEl = grab('toolbox_support');
    if (!toolboxEl || !supportEl) return;
    if (toolboxEl._scrollProxyAttached) return;

    const isHorizontal = () => (currentTheme?.direction || '').toLowerCase().includes('horizontal');

    const onWheel = (e) => {
        const horiz = isHorizontal();
        const dx = e.deltaX || 0;
        const dy = e.deltaY || 0;
        // Prefer the component aligned with our main axis; fall back to dy for horizontal if dx is tiny
        const main = horiz ? (Math.abs(dx) > Math.abs(dy) ? dx : dy) : dy;
        if (main === 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (horiz) supportEl.scrollBy({ left: main, behavior: 'auto' });
        else supportEl.scrollBy({ top: main, behavior: 'auto' });
    };

    let tX = 0, tY = 0;
    const onTouchStart = (e) => {
        if (!e.touches || e.touches.length === 0) return;
        tX = e.touches[0].clientX;
        tY = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
        if (!e.touches || e.touches.length === 0) return;
        const horiz = isHorizontal();
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - tX;
        const dy = y - tY;
        const main = horiz ? -dx : -dy; // natural feel
        if (main !== 0) {
            e.preventDefault();
            e.stopPropagation();
            if (horiz) supportEl.scrollBy({ left: main, behavior: 'auto' });
            else supportEl.scrollBy({ top: main, behavior: 'auto' });
        }
        tX = x; tY = y;
    };

    toolboxEl.addEventListener('wheel', onWheel, { passive: false });
    toolboxEl.addEventListener('touchstart', onTouchStart, { passive: true });
    // On iOS, let the native scroll handle touchmove on the scrollable support container.
    // To avoid fighting with native momentum, don't intercept touchmove when the support can scroll.
    toolboxEl.addEventListener('touchmove', (e) => {
        const canScrollX = supportEl.scrollWidth > supportEl.clientWidth;
        const canScrollY = supportEl.scrollHeight > supportEl.clientHeight;
        if (canScrollX || canScrollY) {
            // Allow native scroll
            return;
        }
        // Fallback to proxy when no native overflow
        onTouchMove(e);
    }, { passive: true });
    toolboxEl._scrollProxyAttached = true;
}

// ===== Palette pop-out logic =====
function getDirMeta() {
    const dir = (currentTheme?.direction || '').toLowerCase();
    const isHorizontal = dir.includes('horizontal');
    const isTop = dir.includes('top');
    const isBottom = dir.includes('bottom');
    const isLeft = dir.includes('left');
    const isRight = dir.includes('right');
    // isReverse is kept for scroll-edge alignment semantics (row-reverse/column-reverse)
    const isReverse = (isHorizontal && isRight) || (!isHorizontal && isBottom);
    return { isHorizontal, isTop, isBottom, isLeft, isRight, isReverse, dir };
}

function handlePaletteClick(el, cfg) {

    // Exclusif: ramener l'ancien palette si présent
    const wasActive = handlePaletteClick.active && handlePaletteClick.active.el === el;
    el.style.height = parseFloat(currentTheme.item_size) / 3 + 'px';

    // el.style.width = '300px';

    if (wasActive) {
        // BACK: go up one level in the stack and rebuild
        if (menuStack.length > 1) {
            const prevEntry = menuStack[menuStack.length - 2];
            // remove current level
            const currState = handlePaletteClick.active;
            const anchorRect = currState && currState.el ? currState.el.getBoundingClientRect() : null;
            menuStack.pop();
            // Restore current popped-out palette back into the menu
            if (currState) restorePalette(currState);
            handlePaletteClick.active = null;
            // Rebuild the menu to the previous level's children
            rebuildSupportToNames(prevEntry.children.slice());
            // Pop out the previous parent outside (e.g., 'home')
            popOutPaletteByName(prevEntry.parent, { anchorRect });
        } else {
            // At top level already; just restore palette and ensure top is shown
            const top = (menuStack[0] && menuStack[0].children) ? menuStack[0].children.slice() : [];
            // Remove any external popped item entirely at root
            if (handlePaletteClick.active) {
                restorePalette(handlePaletteClick.active);
            }
            rebuildSupportToNames(top);
            handlePaletteClick.active = null;
        }
        return;
    } else if (handlePaletteClick.active) {
        // Another palette was active; restore it before proceeding forward
        restorePalette(handlePaletteClick.active);
    }

    const supportEl = grab('toolbox_support');
    if (!supportEl || !el) return;

    // Créer un placeholder pour garder la place dans le flux
    const placeholder = document.createElement('div');
    placeholder.id = `${el.id}__placeholder`;
    placeholder.style.width = `${el.offsetWidth}px`;
    placeholder.style.height = `${el.offsetHeight}px`;
    placeholder.style.flex = '0 0 auto';
    placeholder.style.display = 'inline-block';
    placeholder.style.borderRadius = getComputedStyle(el).borderRadius;

    // Insérer le placeholder à la position de l'élément et extraire l'élément
    supportEl.insertBefore(placeholder, el);

    // Calculer la position de référence (placeholder) et du support
    const phRect = placeholder.getBoundingClientRect();
    const supportRect = supportEl.getBoundingClientRect();

    // Figer la taille courante pour éviter l'effondrement (pourcentage/flex) en position:fixed
    el.style.width = `${phRect.width}px`;
    el.style.height = `${phRect.height}px`;
    // Passer l'élément en position fixed pour le sortir du container, sans changer x/y main-axis
    el.style.position = 'fixed';
    // Déplacer dans le body pour éviter le bug des ancêtres transformés qui piègent position:fixed
    try { if (document.body && el.parentElement !== document.body) document.body.appendChild(el); } catch (e) { }
    el.style.left = `${phRect.left}px`;
    el.style.top = `${phRect.top}px`;
    el.style.margin = '0';
    el.style.zIndex = '10000004';
    el.style.visibility = 'visible';
    // Center label while outside
    setLabelCentered(el, true);
    // Apply palette icon/label visibility rules while outside
    setPaletteVisualState(el, true);

    // Maintenant déplacer l'élément le long de l'axe transversal pour être totalement hors du support
    const { isHorizontal, isTop, isBottom, isLeft, isRight } = getDirMeta();
    const gap = Math.max(8, parseFloat(currentTheme.items_spacing) || 8);
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;

    // Calcul de la cible externe (sans saut visuel, on animera via transform)
    let targetLeft = phRect.left;
    let targetTop = phRect.top;
    if (isHorizontal) {
        // axe principal = X; on sort sur Y (au-dessus si possible quand top_*, sinon en dessous)
        const aboveSpace = supportRect.top;
        const belowSpace = vh - supportRect.bottom;
        let placeAbove = !!isTop;
        if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
        if (!placeAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
        const wantedTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
        const clampedTop = Math.max(0, Math.min(vh - elH, wantedTop));
        targetTop = clampedTop;
        // garder l’axe X ancré à la placeholder, mais clamp dans l’écran
        const baseLeft = phRect.left;
        const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
        targetLeft = clampedLeft;
    } else {
        // axe principal = Y; on sort sur X (à gauche si possible quand *_left, sinon à droite)
        const leftSpace = supportRect.left;
        const rightSpace = vw - supportRect.right;
        let placeLeft = !!isLeft;
        if (placeLeft && leftSpace < elW + gap) placeLeft = false;
        if (!placeLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
        const wantedLeft = placeLeft ? (supportRect.left - elW - gap) : (supportRect.right + gap);
        const clampedLeft = Math.max(0, Math.min(vw - elW, wantedLeft));
        targetLeft = clampedLeft;
        // garder l’axe Y ancré à la placeholder, mais clamp dans l’écran
        const baseTop = phRect.top;
        const clampedTop = Math.max(0, Math.min(vh - elH, baseTop));
        targetTop = clampedTop;
    }

    // Animer le glissement de la position placeholder vers la position externe
    const dx = targetLeft - phRect.left;
    const dy = targetTop - phRect.top;
    const dur = currentTheme.anim_duration_ms || 333;
    const easing = getEasingOpen();
    el.style.willChange = 'transform';
    el.style.transform = 'translate(0, 0)';
    animate(dur, (tt) => {
        const t = easing(tt);
        el.style.transform = `translate(${dx * t}px, ${dy * t}px)`;
    }, () => {
        // Fixer la position finale puis nettoyer la transform
        el.style.left = `${targetLeft}px`;
        el.style.top = `${targetTop}px`;
        el.style.transform = '';
        el.style.willChange = '';
    });

    // Marquer l'état actif et garder les références pour restauration
    handlePaletteClick.active = { el, placeholder };

    // Mettre à jour les items restants avec le contenu du palette
    const key = (el && el.dataset && el.dataset.nameKey) || (cfg && cfg.nameKey) || ((cfg && cfg.id) ? String(cfg.id).replace(/^_intuition_/, '') : '');
    const desc = intuition_content[key];
    if (desc && Array.isArray(desc.children)) {
        // Push next level into the navigation stack
        menuStack.push({ parent: key, children: desc.children.slice() });
        rebuildSupportWithChildren(desc.children, el.id);
    }
}

// Helper to pop out a palette by name without altering the navigation stack
function popOutPaletteByName(name, opts = {}) {
    const supportEl = grab('toolbox_support');
    if (!supportEl || !name) return null;
    const id = `_intuition_${name}`;
    let el = grab(id);
    if (!el) {
        const def = intuition_content[name];
        if (!def || typeof def.type !== 'function') return null;
        const label = def.label || name;
        const icon = Object.prototype.hasOwnProperty.call(def, 'icon') ? def.icon : name;
        const optionalParams = { id, label, icon, nameKey: name, parent: '#toolbox_support' };
        def.type(optionalParams);
        el = grab(id);
        if (!el) return null;
        try { el.dataset.nameKey = name; } catch (e) { /* ignore */ }
        applyBackdropStyle(el, currentTheme.tool_backDrop_effect);
    } else {
        // Ensure dataset carries the logical key
        try { if (el && el.dataset && !el.dataset.nameKey) el.dataset.nameKey = name; } catch (e) { /* ignore */ }
    }

    const { anchorRect } = opts;
    if (anchorRect) {
        // Use provided anchor (previous popped element position/size). No placeholder in menu.
        // If the element is currently in the support, detach it so it won't appear inside the menu.
        if (el.parentElement === supportEl) {
            try { el.remove(); } catch (e) { /* ignore */ }
        }
        el.style.width = `${anchorRect.width}px`;
        el.style.height = `${anchorRect.height}px`;
        el.style.position = 'fixed';
        try { if (document.body && el.parentElement !== document.body) document.body.appendChild(el); } catch (e) { }
        el.style.left = `${anchorRect.left}px`;
        el.style.top = `${anchorRect.top}px`;
        el.style.margin = '0';
        el.style.zIndex = '10000004';
        el.style.visibility = 'visible';
        // Center label while outside (anchored mode)
        setLabelCentered(el, true);
        // Apply palette icon/label visibility while outside
        setPaletteVisualState(el, true);
        handlePaletteClick.active = { el, placeholder: null };
        return el;
    } else {
        // Default behavior: create a placeholder at the element's position and extract it
        const placeholder = document.createElement('div');
        placeholder.id = `${id}__placeholder`;
        placeholder.style.width = `${el.offsetWidth}px`;
        placeholder.style.height = `${el.offsetHeight}px`;
        placeholder.style.flex = '0 0 auto';
        placeholder.style.display = 'inline-block';
        placeholder.style.borderRadius = getComputedStyle(el).borderRadius;
        supportEl.insertBefore(placeholder, el);

        const phRect = placeholder.getBoundingClientRect();
        const supportRect = supportEl.getBoundingClientRect();

        el.style.width = `${phRect.width}px`;
        el.style.height = `${phRect.height}px`;
        el.style.position = 'fixed';
        try { if (document.body && el.parentElement !== document.body) document.body.appendChild(el); } catch (e) { }
        el.style.left = `${phRect.left}px`;
        el.style.top = `${phRect.top}px`;
        el.style.margin = '0';
        el.style.zIndex = '10000004';
        el.style.visibility = 'visible';
        // Center label while outside (extracted mode)
        setLabelCentered(el, true);
        // Apply palette icon/label visibility while outside
        setPaletteVisualState(el, true);

        const { isHorizontal, isTop, isBottom, isLeft, isRight } = getDirMeta();
        const gap = Math.max(8, parseFloat(currentTheme.items_spacing) || 8);
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const elW = el.offsetWidth;
        const elH = el.offsetHeight;

        if (isHorizontal) {
            const aboveSpace = supportRect.top;
            const belowSpace = vh - supportRect.bottom;
            let placeAbove = !!isTop;
            if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
            if (!placeAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
            const targetTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
            const clampedTop = Math.max(0, Math.min(vh - elH, targetTop));
            el.style.top = `${clampedTop}px`;
            const baseLeft = phRect.left;
            const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
            el.style.left = `${clampedLeft}px`;
        } else {
            const leftSpace = supportRect.left;
            const rightSpace = vw - supportRect.right;
            let placeLeft = !!isLeft;
            if (placeLeft && leftSpace < elW + gap) placeLeft = false;
            if (!placeLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
            const targetLeft = placeLeft ? (supportRect.left - elW - gap) : (supportRect.right + gap);
            const clampedLeft = Math.max(0, Math.min(vw - elW, targetLeft));
            el.style.left = `${clampedLeft}px`;
            const baseTop = phRect.top;
            const clampedTop = Math.max(0, Math.min(vh - elH, baseTop));
            el.style.top = `${clampedTop}px`;
        }

        handlePaletteClick.active = { el, placeholder };
        return el;
    }
}

function restorePalette(state) {
    if (!state || !state.el) return;
    const { el, placeholder } = state;
    // Restaurer positionnement par défaut
    el.style.position = 'relative';
    el.style.left = '';
    el.style.top = '';
    el.style.zIndex = '';
    el.style.width = '';
    el.style.height = '';
    // Restore label position inside menu
    setLabelCentered(el, false);
    // Restore label/icon visibility for in-menu state
    setPaletteVisualState(el, false);
    // Si un placeholder existe, on replace l'élément à sa position
    if (placeholder && placeholder.parentElement) {
        placeholder.parentElement.replaceChild(el, placeholder);
    } else {
        // Sinon, l'élément avait été extrait sans placeholder (mode ancré):
        // on le supprime du DOM pour éviter qu'il apparaisse à la fois dehors et dans le menu.
        try { el.remove(); } catch (e) { /* ignore */ }
    }
    handlePaletteClick.active = null;
}

function rebuildSupportWithChildren(childrenNames, excludeId) {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    // 1) Animer les items existants vers l'origine (sauf placeholder et overflow-forcer et élément exclu)
    const toRemove = [];
    Array.from(supportEl.children).forEach(ch => {
        if (ch.id === '_intuition_overflow_forcer') return;
        if (excludeId && ch.id === `${excludeId}__placeholder`) return;
        if (excludeId && ch.id === `${excludeId}`) return;
        toRemove.push(ch);
    });

    const buildNewChildren = () => {
        // 2) Ajouter les nouveaux enfants puis les animer depuis l'origine
        const placeholder = excludeId ? document.getElementById(`${excludeId}__placeholder`) : null;
        const createdEls = [];
        childrenNames.forEach(name => {
            const def = intuition_content[name];
            if (!def || typeof def.type !== 'function') return;
            const label = def.label || name;
            const icon = Object.prototype.hasOwnProperty.call(def, 'icon') ? def.icon : name;
            const optionalParams = { id: `_intuition_${name}`, label, icon, nameKey: name, parent: '#toolbox_support' };
            if (excludeId && optionalParams.id === excludeId) return; // éviter doublon avec l'élément pop-out
            def.type(optionalParams);
            const childEl = grab(`_intuition_${name}`);
            if (placeholder && childEl && childEl.parentElement === supportEl) {
                supportEl.insertBefore(childEl, placeholder);
            }
            if (childEl) {
                try { childEl.dataset.nameKey = name; } catch (e) { /* ignore */ }
                applyBackdropStyle(childEl, currentTheme.tool_backDrop_effect);
                createdEls.push(childEl);
            }
        });
        addOverflowForcer();
        ensureOverflowForcerAtEnd();
        requestAnimationFrame(() => {
            alignSupportToToolboxEdge();
            slideInItems(createdEls);
        });
    };

    if (toRemove.length) {
        slideOutItemsToOrigin(toRemove, buildNewChildren);
    } else {
        buildNewChildren();
    }
}

// Rebuild the support with an explicit list of item names (no placeholder logic)
function rebuildSupportToNames(names) {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    // 1) Animer l'état actuel vers l'origine, puis reconstruire et animer l'état précédent
    const toRemove = [];
    Array.from(supportEl.children).forEach(ch => {
        if (ch.id === '_intuition_overflow_forcer') return;
        toRemove.push(ch);
    });

    const buildNew = () => {
        const createdEls = [];
        names.forEach(name => {
            const def = intuition_content[name];
            if (!def || typeof def.type !== 'function') return;
            const label = def.label || name;
            const icon = Object.prototype.hasOwnProperty.call(def, 'icon') ? def.icon : name;
            const optionalParams = { id: `_intuition_${name}`, label, icon, nameKey: name, parent: '#toolbox_support' };
            def.type(optionalParams);
            const childEl = grab(`_intuition_${name}`);
            if (childEl) {
                try { childEl.dataset.nameKey = name; } catch (e) { /* ignore */ }
                applyBackdropStyle(childEl, currentTheme.tool_backDrop_effect);
                createdEls.push(childEl);
            }
        });
        addOverflowForcer();
        ensureOverflowForcerAtEnd();
        requestAnimationFrame(() => {
            alignSupportToToolboxEdge();
            slideInItems(createdEls);
        });
    };

    if (toRemove.length) {
        slideOutItemsToOrigin(toRemove, buildNew);
    } else {
        buildNew();
    }
}

function ensureOverflowForcerAtEnd() {
    const el = document.getElementById('_intuition_overflow_forcer');
    if (el && el.parentElement && el.parentElement.lastElementChild !== el) {
        el.parentElement.appendChild(el);
    }
}

function closeMenu() {
    const supportEl = grab('toolbox_support');
    // Restore popped-out palette and remove its placeholder if any
    if (typeof handlePaletteClick !== 'undefined' && handlePaletteClick.active) {
        const ph = handlePaletteClick.active.placeholder;
        restorePalette(handlePaletteClick.active);
        if (ph && ph.parentElement) ph.remove();
        handlePaletteClick.active = null;
    }
    // Animate all items inside support out toward the origin, then cleanup
    if (supportEl) {
        const toRemove = Array.from(supportEl.children).filter(ch => ch.id !== '_intuition_overflow_forcer');
        slideOutItemsToOrigin(toRemove, () => {
            // Ensure everything is gone
            Array.from(supportEl.children).forEach(ch => ch.remove());
        });
    }
    // Remove overflow forcer explicitly
    removeOverflowForcer();
    // Reset state
    menuOpen = 'false';
    menuStack = [];
}

function repositionPoppedPalette() {
    const state = handlePaletteClick.active;
    if (!state || !state.el || !state.placeholder) return;
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    const phRect = state.placeholder.getBoundingClientRect();
    const supportRect = supportEl.getBoundingClientRect();
    // Recalibrer la position X/Y principale à celle de la placeholder
    // Garder la taille verrouillée à celle de la placeholder
    state.el.style.width = `${phRect.width}px`;
    state.el.style.height = `${phRect.height}px`;
    state.el.style.left = `${phRect.left}px`;
    state.el.style.top = `${phRect.top}px`;

    // Puis re-déporter transversalement hors du support
    const { isHorizontal, isTop, isBottom, isLeft, isRight } = getDirMeta();
    const gap = Math.max(8, parseFloat(currentTheme.items_spacing) || 8);
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const elW = state.el.offsetWidth;
    const elH = state.el.offsetHeight;

    if (isHorizontal) {
        const aboveSpace = supportRect.top;
        const belowSpace = vh - supportRect.bottom;
        let placeAbove = !!isTop;
        if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
        if (!placeAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
        const targetTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
        const clampedTop = Math.max(0, Math.min(vh - elH, targetTop));
        state.el.style.top = `${clampedTop}px`;
        const baseLeft = phRect.left;
        const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
        state.el.style.left = `${clampedLeft}px`;
    } else {
        const leftSpace = supportRect.left;
        const rightSpace = vw - supportRect.right;
        let placeLeft = !!isLeft;
        if (placeLeft && leftSpace < elW + gap) placeLeft = false;
        if (!placeLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
        const targetLeft = placeLeft ? (supportRect.left - elW - gap) : (supportRect.right + gap);
        const clampedLeft = Math.max(0, Math.min(vw - elW, targetLeft));
        state.el.style.left = `${clampedLeft}px`;
        const baseTop = phRect.top;
        const clampedTop = Math.max(0, Math.min(vh - elH, baseTop));
        state.el.style.top = `${clampedTop}px`;
    }
}

function alignSupportToToolboxEdge() {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    const { isHorizontal, isReverse } = getDirMeta();
    const items = Array.from(supportEl.children || []).filter((ch) => ch && ch.id !== '_intuition_overflow_forcer');
    if (items.length) {
        const target = isReverse ? items[items.length - 1] : items[0];
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({
                behavior: 'auto',
                block: isHorizontal ? 'nearest' : (isReverse ? 'end' : 'start'),
                inline: isHorizontal ? (isReverse ? 'end' : 'start') : 'nearest'
            });
            return;
        }
    }
    if (isHorizontal) {
        supportEl.scrollLeft = isReverse ? Math.max(0, supportEl.scrollWidth - supportEl.clientWidth) : 0;
    } else {
        supportEl.scrollTop = isReverse ? Math.max(0, supportEl.scrollHeight - supportEl.clientHeight) : 0;
    }
}







const INTUITION_TYPE_MAP = {
    palette,
    tool,
    particle,
    option,
    zonespecial
};

function clonePlainIntuitionValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => clonePlainIntuitionValue(item));
    }
    if (value && typeof value === 'object') {
        const clone = {};
        Object.keys(value).forEach((key) => {
            clone[key] = clonePlainIntuitionValue(value[key]);
        });
        return clone;
    }
    return value;
}

function normalizeContentEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return clonePlainIntuitionValue(entry);
    }
    const clone = {};
    Object.keys(entry).forEach((key) => {
        if (key === 'type') {
            const rawType = entry[key];
            if (typeof rawType === 'string') {
                const resolver = INTUITION_TYPE_MAP[rawType.toLowerCase()];
                clone.type = resolver || rawType;
            } else {
                clone.type = rawType;
            }
        } else {
            clone[key] = clonePlainIntuitionValue(entry[key]);
        }
    });
    if (!clone.type && entry.type) {
        clone.type = entry.type;
    }
    return clone;
}

const REGISTERED_THEMES = new Map();
Object.keys(Intuition_theme).forEach((name) => {
    REGISTERED_THEMES.set(name.toLowerCase(), clonePlainIntuitionValue(Intuition_theme[name]));
});

function applyThemeOption(themeOption) {
    if (!themeOption) return;
    if (typeof themeOption === 'string') {
        const key = themeOption.toLowerCase();
        if (REGISTERED_THEMES.has(key)) {
            const snapshot = clonePlainIntuitionValue(REGISTERED_THEMES.get(key));
            Object.keys(currentTheme).forEach((prop) => {
                delete currentTheme[prop];
            });
            Object.assign(currentTheme, snapshot);
            window.refreshMenu({});
        }
        return;
    }
    if (typeof themeOption === 'object') {
        Object.assign(currentTheme, themeOption);
        window.refreshMenu(themeOption);
    }
}

function applyContentOption(contentOption) {
    if (!contentOption || typeof contentOption !== 'object') return;
    const wasOpen = menuOpen !== 'false';
    closeMenu();
    Object.keys(intuition_content).forEach((key) => {
        if (key !== 'version' && key !== 'meta') {
            delete intuition_content[key];
        }
    });
    if (contentOption.version !== undefined) {
        intuition_content.version = contentOption.version;
    }
    if (contentOption.meta !== undefined) {
        intuition_content.meta = clonePlainIntuitionValue(contentOption.meta);
    }
    Object.keys(contentOption).forEach((key) => {
        if (key === 'version' || key === 'meta') return;
        intuition_content[key] = normalizeContentEntry(contentOption[key]);
    });
    if (wasOpen) {
        openMenu('toolbox');
    }
}

const Intuition = function Intuition(options = {}) {
    const intuitionRoot = ensureIntuitionLayerRoot();
    const shouldBootstrap = intuitionRoot && !bootstrapIntuition._initialized;
    applyThemeOption(options.theme);
    applyContentOption(options.content);
    const requestedDirection = options && (options.orientation || options.direction);
    if (requestedDirection) {
        window.setDirection(requestedDirection);
    }
    if (typeof options.open === 'boolean') {
        if (options.open) {
            openMenu('toolbox');
        } else {
            closeMenu();
        }
    }
    if (shouldBootstrap) {
        bootstrapIntuition();
    } else if (intuitionRoot) {
        apply_layout();
    }
    return {
        open: () => openMenu('toolbox'),
        close: () => closeMenu(),
        refresh: (themePatch = {}) => window.refreshMenu(themePatch),
        setDirection: (dir) => window.setDirection(dir),
        updateTheme: (themePatch) => applyThemeOption(themePatch),
        updateContent: (contentPatch) => applyContentOption(contentPatch),
        getTheme: (name = 'current') => {
            if (name === 'current') return clonePlainIntuitionValue(currentTheme);
            const key = String(name).toLowerCase();
            if (REGISTERED_THEMES.has(key)) {
                return clonePlainIntuitionValue(REGISTERED_THEMES.get(key));
            }
            return null;
        },
        listThemes: () => Array.from(REGISTERED_THEMES.keys()),
        getContent: () => clonePlainIntuitionValue(intuition_content)
    };
};

Intuition.addTheme = function addTheme(theme) {
    if (!theme || typeof theme !== 'object') return null;
    const name = String(theme.themeName || theme.name || '').trim().toLowerCase();
    if (!name) return null;
    const base = REGISTERED_THEMES.get('light') || clonePlainIntuitionValue(currentTheme);
    const merged = { ...clonePlainIntuitionValue(base), ...clonePlainIntuitionValue(theme), themeName: name };
    Intuition_theme[name] = merged;
    REGISTERED_THEMES.set(name, clonePlainIntuitionValue(merged));
    return merged;
};

Intuition.getTheme = function getTheme(name = 'light') {
    const key = String(name).toLowerCase();
    if (REGISTERED_THEMES.has(key)) {
        return clonePlainIntuitionValue(REGISTERED_THEMES.get(key));
    }
    if (key === 'current') {
        return clonePlainIntuitionValue(currentTheme);
    }
    return null;
};

Intuition.listThemes = function listThemes() {
    return Array.from(REGISTERED_THEMES.keys());
};

Intuition.refresh = function refresh(themePatch = {}) {
    window.refreshMenu(themePatch);
};

Intuition.openMenu = function openMenuBridge(name = 'toolbox') {
    openMenu(name);
};

Intuition.closeMenu = function closeMenuBridge() {
    closeMenu();
};

Intuition.setDirection = function setDirectionBridge(dir) {
    window.setDirection(dir);
};

Intuition.getContent = function getContentBridge() {
    return clonePlainIntuitionValue(intuition_content);
};

Intuition.setContent = function setContentBridge(content) {
    applyContentOption(content);
};

export default Intuition;


