import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="intuition"></div><div id="intuition_panel_layer"></div></body></html>');
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.CustomEvent = window.CustomEvent;
globalThis.MutationObserver = window.MutationObserver;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
if (typeof window.PointerEvent !== 'function') {
    window.PointerEvent = window.MouseEvent;
}

window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
window.cancelAnimationFrame = (id) => clearTimeout(id);
Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
window.ResizeObserver = class {
    observe() {}
    disconnect() {}
};
globalThis.ResizeObserver = window.ResizeObserver;

globalThis.$ = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.id) node.id = String(options.id);
    if (options.className) node.className = String(options.className);
    if (options.text !== undefined) node.textContent = String(options.text);
    if (options.attrs && typeof options.attrs === 'object') {
        Object.entries(options.attrs).forEach(([key, value]) => {
            node.setAttribute(key, String(value));
        });
    }
    if (options.css && typeof options.css === 'object') {
        Object.entries(options.css).forEach(([key, value]) => {
            if (value !== undefined && value !== null) node.style[key] = String(value);
        });
    }
    Object.entries(options).forEach(([key, value]) => {
        if (!key.startsWith('on') || typeof value !== 'function') return;
        const eventName = key.slice(2).toLowerCase();
        node.addEventListener(eventName, value);
    });
    const parent = typeof options.parent === 'string'
        ? document.querySelector(options.parent)
        : options.parent;
    if (parent) parent.appendChild(node);
    return node;
};

const { createEveDialog } = await import('../../eVe/elements/design.js');
const { createEveCloseControl, createEvePanelCloseControl } = await import('../../eVe/elements/design/panel_chrome.js');
const {
    SYSTEM_UI_PANEL_CHROME_TOKENS,
    SYSTEM_UI_PANEL_EDGE_COLOR,
    SYSTEM_UI_INPUT_TOKENS,
    SYSTEM_UI_THEME_TOKENS
} = await import('../../eVe/elements/system_ui_tokens.js');

assert.equal(createEveCloseControl, createEvePanelCloseControl, 'generic and panel close factories must share one implementation');
const closeControl = createEveCloseControl();
const hasNoBorderContour = (style) => (
    !style?.border
    || style.border === 'none'
    || style.borderStyle === 'none'
    || style.borderWidth === '0px'
);
assert.equal(closeControl.style.width, '16px', 'shared close control should stay compact inside panel chrome');
assert.equal(closeControl.style.height, '16px', 'shared close control should preserve square geometry');
assert.equal(closeControl.style.borderRadius, '3px', 'shared close control should keep a restrained rounded corner');
assert.equal(hasNoBorderContour(closeControl.style), true, 'shared close control must not reserve a transparent contour');
assert.equal(
    SYSTEM_UI_PANEL_CHROME_TOKENS.background,
    SYSTEM_UI_PANEL_EDGE_COLOR,
    'panel chrome background must be opaque so bright app content cannot bleed through rounded edge antialiasing'
);
assert.equal(
    SYSTEM_UI_THEME_TOKENS.panelShadow,
    '0 0 12px 1px rgba(0, 0, 0, 1)',
    'panel root shadow must start at the outer edge without relying on a border contour'
);
assert.equal(
    SYSTEM_UI_INPUT_TOKENS.borderWidthPx,
    0,
    'shared panel inputs must not reserve a transparent border pixel'
);
assert.equal(
    SYSTEM_UI_INPUT_TOKENS.borderStyle,
    'none',
    'shared panel inputs must not keep a hidden border style'
);
assert.equal(
    SYSTEM_UI_PANEL_CHROME_TOKENS.innerShadow,
    'inset 0 -1px 4px rgba(0,0,0,0.34)',
    'panel chrome shadow must not draw a light inset that looks like a border'
);

const installStyleRect = (node) => {
    Object.defineProperty(node, 'offsetWidth', {
        configurable: true,
        get() {
            return Number.parseFloat(String(node.style.width || '')) || 0;
        }
    });
    Object.defineProperty(node, 'offsetHeight', {
        configurable: true,
        get() {
            return Number.parseFloat(String(node.style.height || node.style.minHeight || '')) || 0;
        }
    });
    node.getBoundingClientRect = () => {
        const left = Number.parseFloat(String(node.style.left || '')) || 0;
        const top = Number.parseFloat(String(node.style.top || '')) || 0;
        const width = Number.parseFloat(String(node.style.width || '')) || Number(node.offsetWidth || 0);
        const height = Number.parseFloat(String(node.style.height || node.style.minHeight || '')) || Number(node.offsetHeight || 0);
        return {
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
            x: left,
            y: top
        };
    };
};

document.documentElement.style.setProperty('--tool-size', '52px');
const panelLayer = document.getElementById('intuition_panel_layer');
installStyleRect(panelLayer);
Object.defineProperty(panelLayer, 'clientWidth', { configurable: true, get: () => window.innerWidth });
Object.defineProperty(panelLayer, 'clientHeight', { configurable: true, get: () => window.innerHeight });
panelLayer.style.width = `${window.innerWidth}px`;
panelLayer.style.height = `${window.innerHeight}px`;

const assertCanonicalPanelChrome = (dialog, id) => {
    const { root, header, body, footer, toolsDock, close } = dialog;
    assert.equal(root.dataset.evePanel, 'true', `${id} must declare the panel contract`);
    assert.equal(body.dataset.evePanelScrollContainer, 'body', `${id} body must declare the canonical scroll container`);
    assert.equal(header.dataset.role, 'eve-dialog-header-chrome', `${id} must use the canonical header role`);
    assert.equal(footer.dataset.role, 'eve-dialog-footer-chrome', `${id} must use the canonical footer role`);
    assert.equal(toolsDock.dataset.role, 'eve-dialog-tools-dock', `${id} must use the canonical tools dock role`);
    assert.equal(footer.contains(dialog.title), true, `${id} title must live in the footer`);
    assert.equal(footer.contains(close), true, `${id} close control must live in the footer`);
    assert.equal(close.dataset.evePanelClose, 'true', `${id} close control must use the shared close marker`);
    assert.equal(
        root.style.background,
        'var(--eve-panel-chrome-bg, var(--system-panel-chrome-background))',
        `${id} root edge surface must match header/footer chrome`
    );
    assert.equal(hasNoBorderContour(root.style), true, `${id} root must not reserve a visible or transparent border contour`);
    assert.equal(root.style.padding, '', `${id} root must not add padding around chrome bands`);
    assert.equal(root.style.margin, '', `${id} root must not add margin around chrome bands`);
    assert.equal(header.style.paddingLeft, '0px', `${id} header chrome must touch the left panel edge`);
    assert.equal(header.style.paddingRight, '0px', `${id} header chrome must touch the right panel edge`);
    assert.equal(footer.style.paddingLeft, '0px', `${id} footer chrome must touch the left panel edge`);
    assert.equal(footer.style.paddingRight, '0px', `${id} footer chrome must touch the right panel edge`);
    assert.equal(header.style.width, '100%', `${id} header chrome must exactly match the parent width`);
    assert.equal(footer.style.width, '100%', `${id} footer chrome must exactly match the parent width`);
    assert.equal(toolsDock.style.width, '100%', `${id} tools dock must fill the panel width`);
    assert.equal(header.style.boxSizing, 'border-box', `${id} header chrome width must include its own geometry`);
    assert.equal(footer.style.boxSizing, 'border-box', `${id} footer chrome width must include its own geometry`);
    assert.equal(toolsDock.style.boxSizing, 'border-box', `${id} tools dock width must include its own geometry`);
    assert.equal(header.style.marginLeft, '0px', `${id} header chrome must not offset from the left edge`);
    assert.equal(header.style.marginRight, '0px', `${id} header chrome must not offset from the right edge`);
    assert.equal(header.style.marginTop, '0px', `${id} header chrome must not offset from the top edge`);
    assert.equal(footer.style.marginLeft, '0px', `${id} footer chrome must not offset from the left edge`);
    assert.equal(footer.style.marginRight, '0px', `${id} footer chrome must not offset from the right edge`);
    assert.equal(footer.style.marginBottom, '0px', `${id} footer chrome must not offset from the bottom edge`);
    assert.equal(
        toolsDock.style.background,
        'linear-gradient(180deg, rgba(0, 0, 0, 0.34) 0%, rgba(0, 0, 0, 0.24) 58%, rgba(0, 0, 0, 0.08) 88%, rgba(0, 0, 0, 0) 100%)',
        `${id} tools dock gradient must extend across the full dock height while keeping the bottom transparent`
    );
    assert.equal(
        toolsDock.style.boxShadow,
        'inset 0 10px 12px -12px rgba(0, 0, 0, 0.95), 0 -8px 14px -12px rgba(0, 0, 0, 0.9)',
        `${id} tools dock must expose a visible top shadow`
    );
    assert.equal(header.style.borderTopLeftRadius, 'inherit', `${id} header must inherit the outer top-left panel corner`);
    assert.equal(header.style.borderTopRightRadius, 'inherit', `${id} header must inherit the outer top-right panel corner`);
    assert.equal(header.style.borderBottomLeftRadius, '0px', `${id} header must not round its inner bottom-left corner`);
    assert.equal(header.style.borderBottomRightRadius, '0px', `${id} header must not round its inner bottom-right corner`);
    assert.equal(footer.style.borderTopLeftRadius, '0px', `${id} footer must not round its inner top-left corner`);
    assert.equal(footer.style.borderTopRightRadius, '0px', `${id} footer must not round its inner top-right corner`);
    assert.equal(footer.style.borderBottomLeftRadius, 'inherit', `${id} footer must inherit the outer bottom-left panel corner`);
    assert.equal(footer.style.borderBottomRightRadius, 'inherit', `${id} footer must inherit the outer bottom-right panel corner`);
    assert.equal(
        body.style.background,
        'var(--eve-panel-surface, var(--system-panel-surface))',
        `${id} body must own the inner panel surface instead of relying on the root`
    );
    assert.equal(body.style.margin, '', `${id} body must not create an outer margin against panel chrome`);
    assert.equal(body.style.border, '', `${id} body must not create a border against panel chrome`);
    assert.equal(header.style.border, '', `${id} header chrome must not create a border contour`);
    assert.equal(footer.style.border, '', `${id} footer chrome must not create a border contour`);
    assert.equal(hasNoBorderContour(close.style), true, `${id} close control must not create a border contour`);
    assert.equal(close.style.marginLeft, '5px', `${id} close control must keep its visual inset without padding the footer chrome`);
    assert.equal(dialog.title.style.position, 'absolute', `${id} title must be centered independently from footer controls`);
    assert.equal(dialog.title.style.left, '50%', `${id} title must stay horizontally centered in the footer`);
    assert.equal(dialog.title.style.top, '50%', `${id} title must stay vertically centered in the footer`);
    assert.equal(dialog.title.style.transform, 'translate(-50%, -50%)', `${id} title centering must not depend on panel width`);
    assert.equal(dialog.title.style.textAlign, 'center', `${id} title text must be centered`);
    assert.equal(dialog.title.style.pointerEvents, 'none', `${id} centered title must preserve footer drag behavior`);

    const grips = Array.from(root.querySelectorAll('[data-role="dialog-resize-grip"]'));
    assert.equal(grips.length, 1, `${id} must expose exactly one canonical resize grip`);
    assert.equal(grips[0].dataset.edge, 'right', `${id} resize grip must be right-sided`);
    assert.equal(footer.contains(grips[0]), true, `${id} resize grip must live in the footer`);
    assert.equal(grips[0].style.right, '0px', `${id} resize grip must keep the bottom-right footer edge`);
    assert.equal(grips[0].style.opacity, '0', `${id} resize grip must remain invisible`);
    assert.equal(grips[0].style.background, 'transparent', `${id} resize grip must remain visually transparent`);
    assert.equal(grips[0].style.pointerEvents, 'auto', `${id} resize grip must remain interactive`);

    const children = Array.from(root.children);
    const contentHost = dialog.content || body;
    assert.equal(children.indexOf(header) < children.indexOf(contentHost), true, `${id} header must precede body host`);
    assert.equal(children.indexOf(contentHost) < children.indexOf(toolsDock), true, `${id} body host must precede tools dock`);
    assert.equal(children.indexOf(toolsDock) < children.indexOf(footer), true, `${id} tools dock must precede footer`);
    assert.equal(children.indexOf(footer), children.length - 1, `${id} footer must be the final chrome band`);
    if (dialog.content) {
        assert.equal(dialog.content.contains(body), true, `${id} body must live in the content wrapper`);
        assert.equal(dialog.content.contains(dialog.bodyHeader), true, `${id} body header must live in the content wrapper`);
        assert.equal(dialog.content.contains(dialog.bodyFooter), true, `${id} body footer must live in the content wrapper`);
        assert.equal(
            dialog.content.style.background,
            'var(--eve-panel-surface, var(--system-panel-surface))',
            `${id} content wrapper must own the inner panel surface`
        );
        assert.equal(dialog.content.style.margin, '', `${id} content wrapper must not offset from chrome`);
        assert.equal(dialog.content.style.padding, '', `${id} content wrapper must not pad chrome`);
        assert.equal(dialog.content.style.border, '', `${id} content wrapper must not border chrome`);
    }

    const scrollableValues = new Set(['auto', 'scroll', 'overlay']);
    const isScrollable = (node) => {
        const style = window.getComputedStyle(node);
        return scrollableValues.has(String(style.overflowY || '').toLowerCase())
            || scrollableValues.has(String(style.overflow || '').toLowerCase());
    };
    assert.equal(isScrollable(body), true, `${id} body must be the canonical scrollable area`);
    assert.equal(isScrollable(root), false, `${id} root must not become a scroll container`);
    if (dialog.content) {
        assert.equal(isScrollable(dialog.content), false, `${id} content wrapper must not become a scroll container`);
    }
    assert.equal(isScrollable(header), false, `${id} header must not become a scroll container`);
    assert.equal(isScrollable(toolsDock), false, `${id} tools dock must not become a scroll container`);
    assert.equal(isScrollable(footer), false, `${id} footer must not become a scroll container`);

    assert.equal(
        body.querySelectorAll('[data-role="eve-panel-overflow-indicator"]').length,
        0,
        `${id} must not inject scroll overflow arrow indicators`
    );
};

const standardDialog = createEveDialog({
    id: 'eve_contract_probe_dialog',
    title: 'Contract Probe',
    allowStaticTitle: true,
    resize: 'both'
});
assertCanonicalPanelChrome(standardDialog, 'standard panel');

assertCanonicalPanelChrome(createEveDialog({
    id: 'eve_body_zones_contract_probe_dialog',
    title: 'Body Zones Contract Probe',
    allowStaticTitle: true,
    showBodyHeader: true,
    showBodyFooter: true,
    resize: 'both'
}), 'body zones panel');

const resizedDialog = createEveDialog({
    id: 'eve_resized_drag_probe_dialog',
    title: 'Resize Drag Probe',
    allowStaticTitle: true,
    resize: 'both',
    css: {
        left: '100px',
        top: '80px',
        width: '340px',
        height: '500px',
        minHeight: '240px'
    }
});
installStyleRect(resizedDialog.root);
resizedDialog.root.style.width = '620px';
resizedDialog.root.style.height = '430px';
const resizeGrip = resizedDialog.root.querySelector('[data-role="dialog-resize-grip"]');
resizeGrip.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: 720,
    clientY: 510,
    pointerId: 1
}));
document.dispatchEvent(new window.PointerEvent('pointermove', {
    bubbles: true,
    clientX: 760,
    clientY: 540,
    pointerId: 1
}));
document.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 1
}));
const widthAfterResize = resizedDialog.root.style.width;
const heightAfterResize = resizedDialog.root.style.height;
resizedDialog.header.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: 120,
    clientY: 100,
    pointerId: 2
}));
document.dispatchEvent(new window.PointerEvent('pointermove', {
    bubbles: true,
    clientX: 180,
    clientY: 130,
    pointerId: 2
}));
document.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 2
}));
assert.equal(resizedDialog.root.style.width, widthAfterResize, 'dragging a resized panel must preserve resized width');
assert.equal(resizedDialog.root.style.height, heightAfterResize, 'dragging a resized panel must preserve resized height');
assert.equal(resizedDialog.root.dataset.eveDialogUserWidth, 'true', 'resize must mark user width');
assert.equal(resizedDialog.root.dataset.eveDialogUserHeight, 'true', 'resize must mark user height');

resizedDialog.header.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: 180,
    clientY: 130,
    pointerId: 3
}));
document.dispatchEvent(new window.PointerEvent('pointermove', {
    bubbles: true,
    clientX: -200,
    clientY: 130,
    pointerId: 3
}));
document.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 3
}));
assert.equal(resizedDialog.root.style.left, '0px', 'panel drag must allow flush placement on the left edge');

resizedDialog.header.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: 0,
    clientY: 130,
    pointerId: 4
}));
document.dispatchEvent(new window.PointerEvent('pointermove', {
    bubbles: true,
    clientX: 4000,
    clientY: 130,
    pointerId: 4
}));
document.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 4
}));
const expectedRightFlushLeft = `${Math.round(window.innerWidth - Number.parseFloat(resizedDialog.root.style.width))}px`;
assert.equal(resizedDialog.root.style.left, expectedRightFlushLeft, 'panel drag must allow flush placement on the right edge');

resizedDialog.header.dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: Number.parseFloat(resizedDialog.root.style.left),
    clientY: 130,
    pointerId: 5
}));
document.dispatchEvent(new window.PointerEvent('pointermove', {
    bubbles: true,
    clientX: Number.parseFloat(resizedDialog.root.style.left),
    clientY: 4000,
    pointerId: 5
}));
document.dispatchEvent(new window.PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 5
}));
const bottomFlushTop = window.innerHeight - Number.parseFloat(resizedDialog.root.style.height);
assert.equal(resizedDialog.root.style.top, `${Math.round(bottomFlushTop)}px`, 'panel drag must allow flush placement against the viewport bottom when no main toolbar is present');

const definedBounds = {
    left: resizedDialog.root.style.left,
    top: resizedDialog.root.style.top,
    width: resizedDialog.root.style.width,
    height: resizedDialog.root.style.height
};
resizedDialog.footer.dispatchEvent(new window.MouseEvent('dblclick', {
    bubbles: true,
    button: 0,
    clientX: 12,
    clientY: 12
}));
assert.equal(resizedDialog.root.dataset.eveDialogFullscreen, 'true', 'footer double click must maximize panel');
assert.equal(resizedDialog.root.style.left, '0px', 'maximized panel must start at the left viewport edge');
assert.equal(resizedDialog.root.style.top, '0px', 'maximized panel must start at the top viewport edge');
assert.equal(resizedDialog.root.style.width, `${window.innerWidth}px`, 'maximized panel must use the viewport width');
assert.equal(resizedDialog.root.style.height, `${window.innerHeight}px`, 'maximized panel must use the viewport height when no main toolbar is present');

Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });
panelLayer.style.width = `${window.innerWidth}px`;
panelLayer.style.height = `${window.innerHeight}px`;
window.dispatchEvent(new window.Event('resize'));
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(resizedDialog.root.style.width, '900px', 'fullscreen panel must follow viewport width changes');
assert.equal(resizedDialog.root.style.height, '640px', 'fullscreen panel must follow viewport height changes when no main toolbar is present');

resizedDialog.header.dispatchEvent(new window.MouseEvent('dblclick', {
    bubbles: true,
    button: 0,
    clientX: 12,
    clientY: 12
}));
assert.equal(resizedDialog.root.dataset.eveDialogFullscreen, 'false', 'header double click must restore defined panel bounds');
assert.equal(Number.parseFloat(resizedDialog.root.style.left) <= Number.parseFloat(definedBounds.left), true, 'restored panel left may clamp inside the resized viewport');
assert.equal(Number.parseFloat(resizedDialog.root.style.top) <= Number.parseFloat(definedBounds.top), true, 'restored panel top may clamp inside the resized viewport');
assert.equal(resizedDialog.root.style.width, definedBounds.width, 'restored panel must keep defined width');
assert.equal(resizedDialog.root.style.height, definedBounds.height, 'restored panel must keep defined height');

Object.defineProperty(window, 'innerWidth', { configurable: true, value: 760 });
Object.defineProperty(window, 'innerHeight', { configurable: true, value: 560 });
panelLayer.style.width = `${window.innerWidth}px`;
panelLayer.style.height = `${window.innerHeight}px`;
window.dispatchEvent(new window.Event('resize'));
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(resizedDialog.root.style.width, definedBounds.width, 'restored custom panel width must not track viewport changes');
assert.equal(resizedDialog.root.style.height, definedBounds.height, 'restored custom panel height must not track viewport changes');
