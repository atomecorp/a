export const INTUITION_ROOT_ID = 'intuition';
export const INTUITION_FLOATING_GROUP_LAYER_ID = 'intuition_floating_group_layer';

export const INTUITION_LAYER_Z_INDEX = Object.freeze({
    FLOATING_GROUP_LAYER_BASE: 50004,
    FLOATING_GROUP_NODE: 50005
});

const FLOATING_GROUP_LAYER_STYLE = Object.freeze({
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
    isolation: 'isolate',
    willChange: 'transform',
    zIndex: String(INTUITION_LAYER_Z_INDEX.FLOATING_GROUP_LAYER_BASE)
});

const resolveDocument = () => (typeof document === 'undefined' ? null : document);

const applyStyle = (node, style) => {
    if (!node?.style) return node;
    Object.entries(style).forEach(([key, value]) => {
        if (node.style[key] !== value) {
            node.style[key] = value;
        }
    });
    return node;
};

export const ensureIntuitionRoot = () => {
    const doc = resolveDocument();
    if (!doc) return null;
    let root = doc.getElementById(INTUITION_ROOT_ID);
    if (!root) {
        const parent = doc.body || doc.documentElement;
        if (!parent) return null;
        root = doc.createElement('div');
        root.id = INTUITION_ROOT_ID;
        parent.appendChild(root);
    }
    return applyStyle(root, {
        position: 'fixed',
        inset: '0px',
        left: '0px',
        top: '0px',
        width: '100vw',
        height: '100vh',
        overflow: 'visible',
        background: 'transparent',
        color: 'lightgray',
        zIndex: '9999999',
        pointerEvents: 'none'
    });
};

export const ensureIntuitionFloatingGroupLayer = () => {
    const doc = resolveDocument();
    if (!doc) return null;
    const root = ensureIntuitionRoot();
    if (!root) return null;
    let layer = doc.getElementById(INTUITION_FLOATING_GROUP_LAYER_ID);
    if (!layer) {
        layer = doc.createElement('div');
        layer.id = INTUITION_FLOATING_GROUP_LAYER_ID;
        root.appendChild(layer);
    }
    layer.dataset.layerRole = 'floating_group';
    return applyStyle(layer, FLOATING_GROUP_LAYER_STYLE);
};

export const attachToIntuitionFloatingGroupLayer = (node) => {
    if (!node) return null;
    const layer = ensureIntuitionFloatingGroupLayer();
    if (!layer) return null;
    if (node.parentNode !== layer) {
        layer.appendChild(node);
    }
    node.dataset.eveRequiredLayer = INTUITION_FLOATING_GROUP_LAYER_ID;
    return node;
};
