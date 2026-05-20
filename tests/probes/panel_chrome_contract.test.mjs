import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const { createEveDialog } = await import('../../eve/application/elements/design.js');

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

    const grips = Array.from(root.querySelectorAll('[data-role="dialog-resize-grip"]'));
    assert.equal(grips.length, 1, `${id} must expose exactly one canonical resize grip`);
    assert.equal(grips[0].dataset.edge, 'right', `${id} resize grip must be right-sided`);
    assert.equal(footer.contains(grips[0]), true, `${id} resize grip must live in the footer`);

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
};

const waitForPanelFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

const setScrollMetrics = (node, { scrollTop = 0, clientHeight = 0, scrollHeight = 0 } = {}) => {
    Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(node, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(node, 'scrollTop', {
        configurable: true,
        get() {
            return scrollTop;
        },
        set(value) {
            scrollTop = Number(value) || 0;
        }
    });
    node.scrollTop = scrollTop;
};

const readOverflowIndicators = (dialog) => ({
    top: dialog.body.querySelector('[data-role="eve-panel-overflow-indicator"][data-direction="top"]'),
    bottom: dialog.body.querySelector('[data-role="eve-panel-overflow-indicator"][data-direction="bottom"]')
});

const standardDialog = createEveDialog({
    id: 'eve_contract_probe_dialog',
    title: 'Contract Probe',
    allowStaticTitle: true,
    resize: 'both'
});
assertCanonicalPanelChrome(standardDialog, 'standard panel');

const overflowIndicators = readOverflowIndicators(standardDialog);
assert.equal(standardDialog.body.contains(overflowIndicators.top), true, 'top overflow indicator must live in the real scroll container');
assert.equal(standardDialog.body.contains(overflowIndicators.bottom), true, 'bottom overflow indicator must live in the real scroll container');
assert.equal(overflowIndicators.top.style.pointerEvents, 'none', 'top overflow indicator must not block panel content interaction');
assert.equal(overflowIndicators.bottom.style.pointerEvents, 'none', 'bottom overflow indicator must not block panel content interaction');

setScrollMetrics(standardDialog.body, { scrollTop: 0, clientHeight: 300, scrollHeight: 300 });
standardDialog.body.dispatchEvent(new window.Event('scroll'));
await waitForPanelFrame();
assert.equal(overflowIndicators.top.dataset.visible, 'false', 'fully visible panel must hide the top overflow indicator');
assert.equal(overflowIndicators.bottom.dataset.visible, 'false', 'fully visible panel must hide the bottom overflow indicator');

standardDialog.body.scrollTop = 0;
setScrollMetrics(standardDialog.body, { scrollTop: 0, clientHeight: 100, scrollHeight: 300 });
standardDialog.body.dispatchEvent(new window.Event('scroll'));
await waitForPanelFrame();
assert.equal(overflowIndicators.top.dataset.visible, 'false', 'panel at top must hide the top overflow indicator');
assert.equal(overflowIndicators.bottom.dataset.visible, 'true', 'panel with hidden content below must show the bottom overflow indicator');

standardDialog.body.scrollTop = 120;
setScrollMetrics(standardDialog.body, { scrollTop: 120, clientHeight: 100, scrollHeight: 300 });
standardDialog.body.dispatchEvent(new window.Event('scroll'));
await waitForPanelFrame();
assert.equal(overflowIndicators.top.dataset.visible, 'true', 'panel with hidden content above must show the top overflow indicator');
assert.equal(overflowIndicators.bottom.dataset.visible, 'true', 'panel with hidden content below must keep the bottom overflow indicator visible');

standardDialog.body.scrollTop = 200;
setScrollMetrics(standardDialog.body, { scrollTop: 200, clientHeight: 100, scrollHeight: 300 });
standardDialog.body.dispatchEvent(new window.Event('scroll'));
await waitForPanelFrame();
assert.equal(overflowIndicators.top.dataset.visible, 'true', 'panel at bottom must keep the top overflow indicator visible');
assert.equal(overflowIndicators.bottom.dataset.visible, 'false', 'panel at bottom must hide the bottom overflow indicator');

assertCanonicalPanelChrome(createEveDialog({
    id: 'eve_mtrack_dialog',
    title: 'Mtrack',
    allowStaticTitle: true,
    resize: 'both'
}), 'mtrack panel');

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
const bottomReserveTop = window.innerHeight - 52 - Number.parseFloat(resizedDialog.root.style.height);
assert.equal(resizedDialog.root.style.top, `${Math.round(bottomReserveTop)}px`, 'panel drag must reserve one tool height above the viewport bottom');

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
assert.equal(resizedDialog.root.style.height, `${window.innerHeight - 52}px`, 'maximized panel must reserve one tool height at the bottom');

resizedDialog.header.dispatchEvent(new window.MouseEvent('dblclick', {
    bubbles: true,
    button: 0,
    clientX: 12,
    clientY: 12
}));
assert.equal(resizedDialog.root.dataset.eveDialogFullscreen, 'false', 'header double click must restore defined panel bounds');
assert.equal(resizedDialog.root.style.left, definedBounds.left, 'restored panel must keep defined left');
assert.equal(resizedDialog.root.style.top, definedBounds.top, 'restored panel must keep defined top');
assert.equal(resizedDialog.root.style.width, definedBounds.width, 'restored panel must keep defined width');
assert.equal(resizedDialog.root.style.height, definedBounds.height, 'restored panel must keep defined height');

const forbiddenSourceChecks = [
    {
        file: 'eve/application/domains/mtrax/ui/styles.js',
        patterns: [
            '--mtrack-footer-height',
            'eve-mtrack-footer-resize-corner',
            '#${MTRACK_DIALOG_ID}.eve-mtrack-in-footer #${MTRACK_DIALOG_ID}__close'
        ]
    },
    {
        file: 'eve/application/intuition/runtime/mtrack_dock_controller.js',
        patterns: [
            'eve-mtrack-dock-close-button',
            'eve-mtrack-dock-move-header',
            '__dock_close',
            'panelCloseDisplaySnapshot'
        ]
    }
];

for (const check of forbiddenSourceChecks) {
    const source = readFileSync(check.file, 'utf8');
    check.patterns.forEach((pattern) => {
        assert.equal(source.includes(pattern), false, `${check.file} must not contain ${pattern}`);
    });
}
