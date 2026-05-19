export const calculatedCSS = {};

export const DIRECTIONS = [
    'top_left_horizontal',
    'top_right_horizontal',
    'bottom_left_horizontal',
    'bottom_right_horizontal',
    'top_left_vertical',
    'bottom_left_vertical',
    'top_right_vertical',
    'bottom_right_vertical'
];

export let menuOpen = 'false';
export const menuStack = [];
export const menuVisibilityState = {
    hidden: false,
    wasOpen: false,
    parent: null
};

export const unitDropdownRegistry = new Map();
export const floatingRegistry = new Map();
export const floatingPersistence = new Map();
export const orientationSelectionMap = new Map();

export let floatingCounter = 0;
export let floatingHierarchyCounter = 0;
export let intuitionDragActive = false;

export const editModeState = {
    active: false,
    pulseTimer: null,
    dragContext: null,
    suppressToolboxClick: false
};

export const EDIT_DRAG_THRESHOLD = 16;
export const FLOATING_DRAG_ACTIVATION_THRESHOLD = 2;
export const POINTER_TOUCH_ID_OFFSET = 1000;

export let activeContentHandlerContext = null;
export let pendingParticleUpdateHost = null;

export function setMenuOpen(value) {
    menuOpen = value;
}

export function setFloatingCounter(value) {
    floatingCounter = value;
}

export function nextFloatingCounter() {
    floatingCounter += 1;
    return floatingCounter;
}

export function nextFloatingHierarchyCounter() {
    floatingHierarchyCounter += 1;
    return floatingHierarchyCounter;
}

export function setIntuitionDragActive(value) {
    intuitionDragActive = value;
}

export function setActiveContentHandlerContext(value) {
    activeContentHandlerContext = value;
}

export function setPendingParticleUpdateHost(value) {
    pendingParticleUpdateHost = value;
}
