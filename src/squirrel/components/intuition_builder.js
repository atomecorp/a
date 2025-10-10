import { $ } from '../squirrel.js';
import dropDown from './dropDown_builder.js';

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
const unitDropdownRegistry = new Map();
const floatingRegistry = new Map();
const floatingPersistence = new Map();
let floatingCounter = 0;
let floatingHierarchyCounter = 0;
const editModeState = {
    active: false,
    pulseTimer: null,
    dragContext: null,
    suppressToolboxClick: false
};
const EDIT_DRAG_THRESHOLD = 16;

function ensureFloatingPersistenceBucket(info) {
    if (!info || !info.id) return null;
    let bucket = floatingPersistence.get(info.id);
    if (!bucket || typeof bucket !== 'object') {
        bucket = { host: null, satellites: new Map() };
        floatingPersistence.set(info.id, bucket);
    } else if (!(bucket.satellites instanceof Map)) {
        bucket.satellites = new Map();
    }
    return bucket;
}

function getFloatingPersistenceBucket(infoOrId) {
    const id = typeof infoOrId === 'string' ? infoOrId : (infoOrId && infoOrId.id);
    if (!id) return null;
    const bucket = floatingPersistence.get(id);
    if (!bucket || typeof bucket !== 'object') return null;
    if (!(bucket.satellites instanceof Map)) {
        bucket.satellites = new Map();
    }
    return bucket;
}

function getFloatingPersistenceStore(info) {
    if (!info || !info.id) return null;
    if (info.persistedExtracted instanceof Map) {
        return info.persistedExtracted;
    }
    const bucket = getFloatingPersistenceBucket(info);
    if (bucket && bucket.satellites instanceof Map) {
        info.persistedExtracted = bucket.satellites;
        return bucket.satellites;
    }
    return null;
}

function ensureFloatingPersistenceStore(info) {
    const bucket = ensureFloatingPersistenceBucket(info);
    if (!bucket) return null;
    if (!(bucket.satellites instanceof Map)) {
        bucket.satellites = new Map();
    }
    info.persistedExtracted = bucket.satellites;
    return bucket.satellites;
}

function normalizePositionValue(value) {
    if (value == null) return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    const parsed = parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function deriveFloatingHostPosition(info, metadata = {}) {
    const metaPos = metadata.position || metadata;
    const left = metaPos && metaPos.left != null
        ? normalizePositionValue(metaPos.left)
        : (info && info.container ? normalizePositionValue(info.container.style.left) : null);
    const top = metaPos && metaPos.top != null
        ? normalizePositionValue(metaPos.top)
        : (info && info.container ? normalizePositionValue(info.container.style.top) : null);
    return {
        left: left != null ? normalizeOffsetToNumber(left) : null,
        top: top != null ? normalizeOffsetToNumber(top) : null
    };
}

function ensureFloatingHostRecord(info, theme, metadata = {}) {
    if (!info || !info.id) return null;
    const bucket = ensureFloatingPersistenceBucket(info);
    if (!bucket) return null;
    const themeRef = theme || info.theme || currentTheme;
    const contentMeta = metadata.content || {};
    const childrenMeta = Array.isArray(metadata.children)
        ? metadata.children.slice()
        : (Array.isArray(contentMeta.children) ? contentMeta.children.slice() : null);
    const fallbackChildren = childrenMeta
        || (Array.isArray(info.rootChildren) && info.rootChildren.length ? info.rootChildren.slice()
            : (Array.isArray(info.nameKeys) ? info.nameKeys.slice() : []));
    const hostRecord = {
        id: info.id,
        reference: metadata.reference != null
            ? metadata.reference
            : (info.reference != null ? info.reference : (info.parentFloatingId || 'toolbox')),
        parent: metadata.parent != null ? metadata.parent : (info.parentFloatingId || null),
        orientation: resolveOrientationValue(themeRef),
        toolboxOffsetMain: normalizeOffsetToNumber(themeRef && themeRef.toolboxOffsetMain),
        toolboxOffsetEdge: normalizeOffsetToNumber(themeRef && themeRef.toolboxOffsetEdge),
        position: deriveFloatingHostPosition(info, metadata.position || {}),
        content: {
            key: contentMeta.key != null ? contentMeta.key : (info.sourcePaletteKey || null),
            title: contentMeta.title != null
                ? contentMeta.title
                : (metadata.title != null ? metadata.title : info.title || null),
            children: fallbackChildren
        }
    };
    bucket.host = hostRecord;
    return hostRecord;
}

function updatePersistedFloatingHostPosition(info, left, top) {
    if (!info || !info.id) return;
    const bucket = getFloatingPersistenceBucket(info);
    if (!bucket || !bucket.host) return;
    const nextLeft = normalizeOffsetToNumber(left);
    const nextTop = normalizeOffsetToNumber(top);
    if (!bucket.host.position || typeof bucket.host.position !== 'object') {
        bucket.host.position = { left: nextLeft, top: nextTop };
        return;
    }
    const prev = bucket.host.position;
    if (prev.left === nextLeft && prev.top === nextTop) return;
    prev.left = nextLeft;
    prev.top = nextTop;
}

function resolveOrientationValue(theme) {
    const dir = theme && typeof theme.direction === 'string' ? theme.direction.trim() : '';
    if (dir) {
        return dir.toLowerCase();
    }
    return 'top_left_horizontal';
}

function normalizeOffsetToNumber(raw) {
    if (raw == null) return 0;
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : 0;
    }
    const parsed = parseFloat(String(raw));
    return Number.isFinite(parsed) ? parsed : 0;
}

function persistFloatingSatelliteRecord(info, nameKey, theme, metadata = {}) {
    if (!info || !nameKey) return null;
    ensureFloatingHostRecord(info, theme, metadata.host || {});
    const store = ensureFloatingPersistenceStore(info);
    if (!store) return null;
    const existing = store.get(nameKey);
    const metaPosition = metadata && typeof metadata === 'object' ? metadata.position : null;
    const hasLeftMeta = metaPosition && metaPosition.left != null;
    const hasTopMeta = metaPosition && metaPosition.top != null;
    const fallbackPosition = existing && existing.position && typeof existing.position === 'object'
        ? existing.position
        : null;
    const resolvedLeft = hasLeftMeta
        ? normalizeOffsetToNumber(metaPosition.left)
        : (fallbackPosition && fallbackPosition.left != null
            ? normalizeOffsetToNumber(fallbackPosition.left)
            : null);
    const resolvedTop = hasTopMeta
        ? normalizeOffsetToNumber(metaPosition.top)
        : (fallbackPosition && fallbackPosition.top != null
            ? normalizeOffsetToNumber(fallbackPosition.top)
            : null);
    const record = {
        id: metadata.id || (existing && existing.id) || null,
        hostId: info.id,
        reference: metadata.reference || (existing && existing.reference) || info.id,
        parent: metadata.parent != null ? metadata.parent : (existing && existing.parent != null ? existing.parent : info.parentFloatingId || null),
        content: {
            key: nameKey,
            title: metadata.paletteTitle || (existing && existing.content && existing.content.title) || null,
            children: Array.isArray(metadata.children)
                ? metadata.children.slice()
                : (existing && existing.content && Array.isArray(existing.content.children)
                    ? existing.content.children.slice()
                    : [])
        },
        orientation: resolveOrientationValue(theme),
        toolboxOffsetMain: normalizeOffsetToNumber(theme && theme.toolboxOffsetMain),
        toolboxOffsetEdge: normalizeOffsetToNumber(theme && theme.toolboxOffsetEdge),
        position: {
            left: resolvedLeft,
            top: resolvedTop
        }
    };
    store.set(nameKey, record);

    return record;
}

function updatePersistedFloatingSatellitePosition(info, nameKey, left, top) {
    if (!info || !nameKey) return;
    const store = getFloatingPersistenceStore(info);
    if (!store || !store.has(nameKey)) return;
    const record = store.get(nameKey);
    if (!record || typeof record !== 'object') return;
    const nextLeft = normalizeOffsetToNumber(left);
    const nextTop = normalizeOffsetToNumber(top);
    if (!record.position || typeof record.position !== 'object') {
        record.position = { left: nextLeft, top: nextTop };
    }
    const prevLeft = record.position.left;
    const prevTop = record.position.top;
    if (prevLeft === nextLeft && prevTop === nextTop) return;
    record.position.left = nextLeft;
    record.position.top = nextTop;

}

function removePersistedFloatingSatellite(info, nameKey) {
    if (!info || !nameKey) return;
    const store = getFloatingPersistenceStore(info);
    if (!store) return;
    store.delete(nameKey);
}

function clearPersistedFloatingSatelliteStore(infoOrId) {
    const id = typeof infoOrId === 'string' ? infoOrId : (infoOrId && infoOrId.id);
    if (!id) return;
    const bucket = floatingPersistence.get(id);
    if (bucket && bucket.satellites instanceof Map) {
        bucket.satellites.clear();
    }
    floatingPersistence.delete(id);
    if (infoOrId && typeof infoOrId === 'object') {
        if (infoOrId.persistedExtracted instanceof Map) {
            infoOrId.persistedExtracted.clear();
        }
        delete infoOrId.persistedExtracted;
    }
}

function isEditModeActive() {
    return !!editModeState.active;
}

function getEditModeColor() {
    const fallback = '#ff6f61';
    const themeColor = currentTheme && currentTheme.edit_mode_color;
    if (themeColor && typeof themeColor === 'string' && themeColor.trim() !== '') {
        return themeColor;
    }
    return fallback;
}

function ensureEditModeStyle() {
    if (document.getElementById('intuition-edit-mode-style')) return;
    const styleText = `
        @keyframes intuition-edit-pulse {
            0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.35); }
            50% { box-shadow: 0 0 0 10px rgba(255, 255, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
        }

        #toolbox.intuition-edit-mode {
            animation: intuition-edit-pulse 1.4s ease-in-out infinite;
            border: 2px solid var(--intuition-edit-color, ${getEditModeColor()});
        }

        .intuition-floating {
            position: absolute;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            justify-content: flex-start;
            background: rgba(32, 32, 32, 0.55);
            border-radius: 12px;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-shadow: 0 10px 24px rgba(0,0,0,0.25);
            z-index: 10000020;
        }

        .intuition-floating[data-collapsed="true"] .intuition-floating-body {
            display: none;
        }

        .intuition-floating-grip {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.45);
            color: #ffffff;
            font-size: 11px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            cursor: grab;
            user-select: none;
            border-radius: 12px 12px 0 0;
        }

        .intuition-floating-grip:active {
            cursor: grabbing;
        }

        .intuition-floating-delete {
            position: absolute;
            top: 4px;
            left: 8px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ff3b30;
            border: 2px solid rgba(255,255,255,0.85);
            box-shadow: 0 0 6px rgba(0,0,0,0.35);
            display: none;
            pointer-events: auto;
        }

        .intuition-floating[data-edit="true"] .intuition-floating-delete {
            display: block;
        }

        .intuition-floating-body {
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            justify-content: center;
            padding: 4px;
            gap: 6px;
        }
    `;
    $('style', { id: 'intuition-edit-mode-style', parent: 'head', text: styleText });
}

function applyToolboxPulse(enabled) {
    const toolboxEl = grab('toolbox');
    if (!toolboxEl) return;
    if (enabled) {
        ensureEditModeStyle();
        toolboxEl.classList.add('intuition-edit-mode');
        toolboxEl.style.setProperty('--intuition-edit-color', getEditModeColor());
    } else {
        toolboxEl.classList.remove('intuition-edit-mode');
        toolboxEl.style.removeProperty('--intuition-edit-color');
    }
}

function setFloatingEditMode(enabled) {
    floatingRegistry.forEach((info) => {
        if (!info || !info.container) return;
        info.container.dataset.edit = enabled ? 'true' : 'false';
        if (info.grip) {
            info.grip.style.cursor = enabled ? 'grab' : 'pointer';
        }
    });
}

function suppressInteractionDuringEdit(ev) {
    if (!isEditModeActive()) return false;
    if (ev) {
        if (ev.cancelable && typeof ev.preventDefault === 'function') {
            try { ev.preventDefault(); } catch (_) { }
        }
        if (typeof ev.stopPropagation === 'function') {
            try { ev.stopPropagation(); } catch (_) { }
        }
    }
    return true;
}

function enterEditMode() {
    if (editModeState.active) return;
    editModeState.active = true;
    applyToolboxPulse(true);
    const supportEl = grab('toolbox_support');
    if (supportEl) {
        supportEl.dataset.editMode = 'true';
    }
    setFloatingEditMode(true);
}

function exitEditMode() {
    if (!editModeState.active) return;
    editModeState.active = false;
    applyToolboxPulse(false);
    const supportEl = grab('toolbox_support');
    if (supportEl) {
        delete supportEl.dataset.editMode;
    }
    setFloatingEditMode(false);
    editModeState.dragContext = null;
    editModeState.suppressToolboxClick = false;
}

function toggleEditMode(force) {
    if (typeof force === 'boolean') {
        if (force) enterEditMode(); else exitEditMode();
        return;
    }
    if (isEditModeActive()) exitEditMode(); else enterEditMode();
}

function ensureFloatingLayer() {
    let layer = document.getElementById('intuition-floating-layer');
    if (layer) return layer;
    ensureEditModeStyle();
    layer = $('div', {
        id: 'intuition-floating-layer',
        parent: 'body',
        css: {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 10000010
        }
    });
    return layer;
}

function resolveItemSizePx() {
    const size = currentTheme && currentTheme.item_size;
    if (size == null) return 54;
    if (typeof size === 'number') return size;
    const parsed = parseFloat(size);
    return Number.isFinite(parsed) ? parsed : 54;
}

function resolveFloatingGripIconInfo(opts = {}) {
    const themeRef = (opts && opts.theme) || currentTheme;
    const info = {
        icon: undefined,
        iconColor: opts ? (opts.iconColor || opts.icon_color) : undefined,
        iconTop: opts ? (opts.iconTop || opts.icon_top) : undefined,
        iconLeft: opts ? (opts.iconLeft || opts.icon_left) : undefined,
        iconSize: opts ? (opts.iconSize || opts.icon_size) : undefined,
        theme: themeRef
    };
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'icon')) {
        info.icon = opts.icon;
        return info;
    }
    const sourceKey = opts && (opts.sourcePalette || (opts.content && opts.content.key) || opts.referencePalette);
    if (!sourceKey) {
        return info;
    }
    const def = (typeof intuition_content !== 'undefined' && intuition_content)
        ? intuition_content[sourceKey]
        : undefined;
    if (def && typeof def === 'object') {
        if (Object.prototype.hasOwnProperty.call(def, 'icon')) {
            info.icon = def.icon;
        } else {
            info.icon = sourceKey;
        }
        info.iconColor = info.iconColor || def.icon_color || def.iconColor;
        info.iconTop = info.iconTop || def.icon_top || def.iconTop;
        info.iconLeft = info.iconLeft || def.icon_left || def.iconLeft;
        info.iconSize = info.iconSize || def.icon_size || def.iconSize;
    } else {
        info.icon = sourceKey;
    }
    return info;
}

function renderFloatingGripBadge(grip, opts = {}) {
    if (!grip) return;
    grip.textContent = '';
    const iconInfo = resolveFloatingGripIconInfo(opts);
    const themeRef = iconInfo.theme || currentTheme;
    const fallbackColor = (themeRef && themeRef.icon_color) || (currentTheme && currentTheme.icon_color);
    const centeredTop = '50%';
    const centeredLeft = '50%';
    const fallbackSize = (themeRef && themeRef.icon_size) || (currentTheme && currentTheme.icon_size);
    const iconName = iconInfo.icon;
    if (iconName !== undefined && iconName !== null && iconName !== false && String(iconName).trim() !== '') {
        createIcon({
            id: grip.id,
            icon: iconName,
            icon_color: iconInfo.iconColor || fallbackColor,
            icon_top: centeredTop,
            icon_left: centeredLeft,
            icon_size: iconInfo.iconSize || fallbackSize
        });
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const gripIconEl = document.getElementById(`${grip.id}__icon`);
                if (gripIconEl && gripIconEl.style) {
                    gripIconEl.style.position = 'absolute';
                    gripIconEl.style.top = centeredTop;
                    gripIconEl.style.left = centeredLeft;
                    gripIconEl.style.transform = 'translate(-50%, -50%)';
                    gripIconEl.style.margin = '0';
                    gripIconEl.style.maxWidth = '80%';
                    gripIconEl.style.maxHeight = '80%';
                    gripIconEl.style.minWidth = '0';
                    gripIconEl.style.minHeight = '0';
                }
            });
        });
        grip.dataset.hasIcon = 'true';
        return iconName;
    }
    grip.dataset.hasIcon = 'false';
    if (opts && opts.title) {
        grip.textContent = String(opts.title).toUpperCase();
    } else {
        grip.textContent = 'MENU';
    }
    return null;
}

function updateFloatingGripLayout() {
    const itemSize = resolveItemSizePx();
    floatingRegistry.forEach((info) => {
        if (!info || !info.grip) return;
        const themeRef = info && info.theme ? info.theme : currentTheme;
        const { isHorizontal } = getDirMeta(themeRef);
        const grip = info.grip;
        const heightPx = isHorizontal ? itemSize : Math.max(18, Math.round(itemSize / 2));
        const widthPx = isHorizontal ? Math.max(18, Math.round(itemSize / 2)) : itemSize;
        grip.style.height = `${heightPx}px`;
        grip.style.minHeight = `${heightPx}px`;
        grip.style.lineHeight = `${heightPx}px`;
        grip.style.width = `${widthPx}px`;
        grip.style.minWidth = `${widthPx}px`;
        grip.style.display = 'flex';
        grip.style.alignItems = 'center';
        grip.style.justifyContent = 'center';
        const spacing = themeRef && themeRef.items_spacing ? String(themeRef.items_spacing) : '6px';
        if (isHorizontal) {
            grip.style.marginRight = spacing;
            grip.style.marginBottom = '0';
        } else {
            grip.style.marginRight = '0';
            grip.style.marginBottom = spacing;
        }
        if (info.container) {
            info.container.style.display = 'flex';
            info.container.style.flexDirection = isHorizontal ? 'row' : 'column';
            info.container.style.alignItems = isHorizontal ? 'center' : 'stretch';
        }
        if (info.body) {
            info.body.style.display = 'flex';
            info.body.style.flexDirection = isHorizontal ? 'row' : 'column';
            info.body.style.alignItems = isHorizontal ? 'center' : 'stretch';
            info.body.style.justifyContent = 'flex-start';
            info.body.style.padding = spacing;
            info.body.style.gap = spacing;
            info.body.style.margin = '0';
        }
        if (Array.isArray(info.sections)) {
            info.sections.forEach((sectionId) => {
                const sectionEl = document.getElementById(sectionId);
                if (!sectionEl) return;
                sectionEl.style.flexDirection = isHorizontal ? 'row' : 'column';
                sectionEl.style.alignItems = isHorizontal ? 'center' : 'stretch';
            });
        }
    });
}

function moveFloatingTo(info, left, top) {
    if (!info || !info.container) return;
    info.container.style.left = `${left}px`;
    info.container.style.top = `${top}px`;
    updatePersistedFloatingHostPosition(info, left, top);
}

function clampFloatingToViewport(info) {
    if (!info || !info.container) return;
    const rect = info.container.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
    const vh = window.innerHeight || document.documentElement.clientHeight || 720;
    let left = rect.left;
    let top = rect.top;
    if (left + rect.width > vw) left = Math.max(0, vw - rect.width - 12);
    if (top + rect.height > vh) top = Math.max(0, vh - rect.height - 12);
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    moveFloatingTo(info, left, top);
    repositionActiveSatellites(info);
}

function toggleFloatingCollapse(id, force) {
    const info = floatingRegistry.get(id);
    if (!info || !info.container) return;
    const collapsed = typeof force === 'boolean' ? force : !info.collapsed;
    info.collapsed = collapsed;
    info.container.dataset.collapsed = collapsed ? 'true' : 'false';
}

function removeFloating(id) {
    const info = typeof id === 'string' ? floatingRegistry.get(id) : id;
    if (!info) return;
    if (info.dependents && info.dependents.size) {
        Array.from(info.dependents).forEach((depId) => {
            if (!depId || depId === info.id) return;
            removeFloating(depId);
        });
        info.dependents.clear();
    }

    if (info.activeSatellites instanceof Map && info.activeSatellites.size) {
        Array.from(info.activeSatellites.entries()).forEach(([satKey, satState]) => {
            disposeFloatingSatelliteState(info, satKey, satState, { preventCascade: true, skipDelete: true });
        });
        info.activeSatellites.clear();
    }

    if (info.parentFloatingId) {
        const parentInfo = floatingRegistry.get(info.parentFloatingId);
        if (parentInfo && parentInfo.dependents) {
            parentInfo.dependents.delete(info.id);
        }
        if (parentInfo) {
            const sourceKey = info.sourcePaletteKey
                || (info.container && info.container.dataset && info.container.dataset.sourcePalette)
                || null;
            if (sourceKey) {
                if (parentInfo.activeSatellites instanceof Map && parentInfo.activeSatellites.has(sourceKey)) {
                    const satState = parentInfo.activeSatellites.get(sourceKey);
                    disposeFloatingSatelliteState(parentInfo, sourceKey, satState, { preventCascade: true });
                }
                if (Array.isArray(parentInfo.menuStack) && parentInfo.menuStack.length) {
                    const idx = parentInfo.menuStack.findIndex((entry) => entry && entry.parent === sourceKey);
                    if (idx >= 0) {
                        parentInfo.menuStack.splice(idx);
                    }
                }
                const topEntry = parentInfo.menuStack && parentInfo.menuStack[parentInfo.menuStack.length - 1];
                const fallbackKeys = topEntry && Array.isArray(topEntry.children)
                    ? topEntry.children.slice()
                    : (Array.isArray(parentInfo.rootChildren) && parentInfo.rootChildren.length
                        ? parentInfo.rootChildren.slice()
                        : parentInfo.nameKeys.slice());
                if (parentInfo.body && parentInfo.container && floatingRegistry.has(parentInfo.id)) {
                    ensureFloatingStackRoot(parentInfo);
                    renderFloatingBody(parentInfo, fallbackKeys);
                }
            }
        }
    }

    if (info.container) {
        const linkedPalettes = typeof document !== 'undefined'
            ? document.querySelectorAll(`[data-floating-satellite-id="${info.id}"]`)
            : [];
        if (linkedPalettes && linkedPalettes.length) {
            linkedPalettes.forEach((node) => {
                if (!node || !node.dataset) return;
                delete node.dataset.floatingSatelliteId;
                setPaletteVisualState(node, false);
            });
        }
        if (info.container.parentElement) {
            try { info.container.parentElement.removeChild(info.container); } catch (_) { }
        }
    }
    clearPersistedFloatingSatelliteStore(info);
    floatingRegistry.delete(info.id || id);
}

function attachFloatingGripInteractions(info) {
    if (!info || !info.grip) return;
    const grip = info.grip;
    if (!grip._floatingInteractionsAttached) {
        grip.addEventListener('pointerdown', (e) => {
            if (!isEditModeActive()) return;
            e.preventDefault();
            e.stopPropagation();
            beginFloatingMove(e, info);
        });
        grip.addEventListener('click', (e) => {
            if (isEditModeActive()) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            toggleFloatingCollapse(info.id);
        });
        grip._floatingInteractionsAttached = true;
    }
    if (info.deleteBtn && !info.deleteBtn._floatingDeleteAttached) {
        info.deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isEditModeActive()) return;
            removeFloating(info);
        });
        info.deleteBtn._floatingDeleteAttached = true;
    }
}

function createFloatingHost(opts = {}) {
    const layer = ensureFloatingLayer();
    const itemSize = resolveItemSizePx();
    const desiredId = (opts.id && typeof opts.id === 'string') ? opts.id.trim() : null;
    let id;
    if (desiredId) {
        id = desiredId;
        const numericMatch = id.match(/(\d+)$/);
        if (numericMatch) {
            const parsed = parseInt(numericMatch[1], 10);
            if (Number.isFinite(parsed)) {
                floatingCounter = Math.max(floatingCounter, parsed);
            }
        }
        if (floatingRegistry.has(id)) {
            removeFloating(id);
        }
        const existingNode = (typeof document !== 'undefined') ? document.getElementById(id) : null;
        if (existingNode && existingNode.parentElement) {
            try { existingNode.parentElement.removeChild(existingNode); } catch (_) { }
        }
    } else {
        id = `intuition-floating-${++floatingCounter}`;
    }
    const left = Math.max(0, (opts.x != null ? opts.x : 0) - itemSize / 2);
    const top = Math.max(0, (opts.y != null ? opts.y : 0) - itemSize / 2);
    const container = $('div', {
        id,
        parent: '#intuition-floating-layer',
        class: 'intuition-floating',
        css: {
            left: `${left}px`,
            top: `${top}px`,
            pointerEvents: 'auto'
        }
    });
    container.dataset.type = opts.type || 'item';
    if (opts.role) {
        container.dataset.role = opts.role;
    }
    container.dataset.collapsed = 'false';

    const grip = $('div', {
        id: `${id}__grip`,
        parent: `#${id}`,
        class: 'intuition-floating-grip'
    });
    const appliedGripIcon = renderFloatingGripBadge(grip, opts);

    const deleteBtn = $('div', {
        id: `${id}__delete`,
        parent: `#${id}__grip`,
        class: 'intuition-floating-delete'
    });

    const body = $('div', {
        id: `${id}__body`,
        parent: `#${id}`,
        class: 'intuition-floating-body'
    });

    const reference = opts.reference != null
        ? opts.reference
        : (opts.parentFloatingId || opts.sourcePalette || 'toolbox');
    const info = {
        id,
        container,
        grip,
        deleteBtn,
        body,
        title: opts.title || 'item',
        type: opts.type || 'item',
        gripIcon: appliedGripIcon || null,
        nameKeys: [],
        collapsed: false,
        parentFloatingId: opts.parentFloatingId || null,
        dependents: new Set(),
        rootChildren: [],
        menuStack: [],
        activeSatellites: new Map(),
        sourcePaletteKey: opts.sourcePalette || null,
        theme: opts.theme || currentTheme,
        persistedExtracted: null,
        reference
    };
    floatingRegistry.set(id, info);
    ensureFloatingPersistenceStore(info);
    ensureFloatingHostRecord(info, info.theme, {
        reference,
        position: { left, top },
        content: {
            key: info.sourcePaletteKey || null,
            title: info.title || null,
            children: Array.isArray(opts.initialChildren) ? opts.initialChildren.slice() : []
        }
    });
    if (info.parentFloatingId && floatingRegistry.has(info.parentFloatingId)) {
        const parentInfo = floatingRegistry.get(info.parentFloatingId);
        if (parentInfo) {
            if (!parentInfo.dependents) parentInfo.dependents = new Set();
            parentInfo.dependents.add(info.id);
        }
        container.dataset.parentFloatingId = info.parentFloatingId;
    }
    attachFloatingGripInteractions(info);
    updateFloatingGripLayout();
    setFloatingEditMode(isEditModeActive());
    return info;
}

function resolveFloatingInfoFromElement(el) {
    if (!el) return null;
    if (typeof el.closest === 'function') {
        const container = el.closest('.intuition-floating');
        if (container && floatingRegistry.has(container.id)) {
            return floatingRegistry.get(container.id) || null;
        }
    }
    const hostId = el.dataset
        ? (el.dataset.floatingHostId || el.dataset.parentFloatingId || el.dataset.sourceFloatingHost)
        : null;
    if (hostId && floatingRegistry.has(hostId)) {
        return floatingRegistry.get(hostId) || null;
    }
    return null;
}

function inferDefinitionType(def) {
    if (!def || typeof def !== 'object') return 'item';
    if (def.type === palette) return 'palette';
    if (def.type === tool) return 'tool';
    if (def.type === particle) return 'particle';
    if (def.type === option) return 'option';
    if (def.type === zonespecial) return 'zonespecial';
    return 'item';
}

function setupEditModeDrag(el, meta = {}) {
    if (!el || el._editDragAttached) return;
    const handler = (ev) => {
        if (!isEditModeActive()) return;
        if (editModeState.dragContext) return;
        ev.preventDefault();
        ev.stopPropagation();
        const nameKey = meta.nameKey || (el.dataset ? el.dataset.nameKey : null);
        if (!nameKey) return;
        const capturePointerId = (typeof ev.pointerId === 'number') ? ev.pointerId : null;
        if (capturePointerId != null && typeof el.setPointerCapture === 'function') {
            try { el.setPointerCapture(capturePointerId); } catch (_) { }
        }
        beginMenuItemDrag(ev, {
            el,
            nameKey,
            label: meta.label || el.getAttribute('data-label') || nameKey,
            typeName: meta.typeName || inferDefinitionType(intuition_content[nameKey]),
            capturePointerId
        });
    };
    ['pointerdown'].forEach(evt => el.addEventListener(evt, handler, true));
    el._editDragAttached = true;
}

function addFloatingEntry(info, nameKey, target, opts = {}) {
    if (!info || !nameKey) return null;
    const host = target || info.body;
    if (!host) return null;
    const def = opts.definition || intuition_content[nameKey];
    if (!def || typeof def.type !== 'function') return null;
    if (!host.id) {
        host.id = `${info.id}__host_${++floatingHierarchyCounter}`;
    }
    const typeName = inferDefinitionType(def);
    const datasetNameKey = opts.datasetNameKey || nameKey;
    const safeKey = String(nameKey).replace(/[^a-z0-9_-]/gi, '_');
    const idPrefix = opts.idPrefix || `${info.id}__floating_${safeKey}`;
    const uniqueId = opts.customId || `${idPrefix}_${info.nameKeys.length}`;
    const params = {
        id: uniqueId,
        label: def.label || nameKey,
        icon: Object.prototype.hasOwnProperty.call(def, 'icon') ? def.icon : nameKey,
        nameKey: datasetNameKey,
        parent: `#${host.id}`
    };
    if (opts.extraParams && typeof opts.extraParams === 'object') {
        Object.assign(params, opts.extraParams);
    }
    def.type(params);
    const created = document.getElementById(uniqueId);
    if (created) {
        try { created.dataset.nameKey = datasetNameKey; } catch (_) { }
        created.dataset.floating = 'true';
        try { created.dataset.floatingHostId = info.id; } catch (_) { }
        if (info.parentFloatingId) {
            try { created.dataset.parentFloatingId = info.parentFloatingId; } catch (_) { }
        } else if (created.dataset && created.dataset.parentFloatingId) {
            delete created.dataset.parentFloatingId;
        }
        const makeVisible = opts.forceVisible !== false;
        if (makeVisible) {
            created.style.visibility = 'visible';
            created.style.opacity = '1';
            created.style.transform = 'translate3d(0,0,0)';
        }
        created.style.flex = '0 0 auto';
        created.style.alignSelf = 'stretch';
        applyBackdropStyle(created, currentTheme.tool_backDrop_effect);
        setupEditModeDrag(created, { nameKey: datasetNameKey, label: def.label || nameKey, typeName });
    }
    info.nameKeys.push(datasetNameKey);
    return created;
}

function spawnFloatingFromMenuItem(nameKey, opts = {}) {
    const def = intuition_content[nameKey];
    if (!def) return null;
    let icon = nameKey;
    let iconColor;
    let iconTop;
    let iconLeft;
    let iconSize;
    if (def && typeof def === 'object') {
        if (Object.prototype.hasOwnProperty.call(def, 'icon')) {
            icon = def.icon;
        }
        iconColor = def.icon_color || def.iconColor;
        iconTop = def.icon_top || def.iconTop;
        iconLeft = def.icon_left || def.iconLeft;
        iconSize = def.icon_size || def.iconSize;
    }
    const info = createFloatingHost({
        title: opts.label || def.label || nameKey,
        type: inferDefinitionType(def),
        x: opts.x,
        y: opts.y,
        theme: opts.theme || currentTheme,
        sourcePalette: nameKey,
        reference: opts.reference != null ? opts.reference : 'toolbox',
        parentFloatingId: opts.parentFloatingId || null,
        icon,
        iconColor,
        iconTop,
        iconLeft,
        iconSize
    });
    const themeRef = info && info.theme ? info.theme : currentTheme;
    const spacing = themeRef && themeRef.items_spacing ? String(themeRef.items_spacing) : '6px';
    const { isHorizontal } = getDirMeta(themeRef);
    info.body.innerHTML = '';
    info.body.style.display = 'flex';
    info.body.style.flexDirection = isHorizontal ? 'row' : 'column';
    info.body.style.alignItems = isHorizontal ? 'center' : 'stretch';
    info.body.style.justifyContent = 'flex-start';
    info.body.style.gap = spacing;
    info.body.style.padding = '0';
    info.body.style.pointerEvents = 'auto';

    addFloatingEntry(info, nameKey, info.body, { forceVisible: true });
    if (nameKey !== 'settings' && intuition_content.settings && typeof intuition_content.settings.type === 'function') {
        addFloatingEntry(info, 'settings', info.body, { forceVisible: true });
    }

    info.rootChildren = info.nameKeys.slice();
    ensureFloatingHostRecord(info, themeRef, {
        reference: opts.reference != null ? opts.reference : 'toolbox',
        parent: opts.parentFloatingId || null,
        content: {
            key: nameKey,
            title: opts.label || def.label || nameKey,
            children: info.rootChildren.slice()
        }
    });
    clampFloatingToViewport(info);
    return info;
}

function resolveActiveSupportContext() {
    const context = {
        reference: 'toolbox',
        parentFloatingId: null
    };
    if (Array.isArray(menuStack) && menuStack.length) {
        for (let i = menuStack.length - 1; i >= 0; i -= 1) {
            const entry = menuStack[i];
            if (entry && typeof entry.parent === 'string' && entry.parent) {
                context.reference = entry.parent;
                break;
            }
        }
    }
    const supportEl = grab('toolbox_support');
    if (supportEl) {
        const supportData = supportEl.dataset || {};
        const supportReference = supportData.reference || supportData.supportReference || supportData.sourceReference;
        if (typeof supportReference === 'string' && supportReference.trim()) {
            context.reference = supportReference.trim();
        }
        const directParent = supportData.parentFloatingId || supportData.sourceFloatingHost || supportData.floatingHostId;
        if (typeof directParent === 'string' && directParent.trim()) {
            context.parentFloatingId = directParent.trim();
        }
        if (!context.parentFloatingId) {
            const childWithParent = Array.from(supportEl.children || []).find((node) => {
                if (!node || !node.dataset) return false;
                if (node.id === '_intuition_overflow_forcer') return false;
                const data = node.dataset;
                return !!(data.parentFloatingId || data.floatingHostId || data.sourceFloatingHost);
            });
            if (childWithParent && childWithParent.dataset) {
                const data = childWithParent.dataset;
                const candidate = data.parentFloatingId || data.floatingHostId || data.sourceFloatingHost;
                if (typeof candidate === 'string' && candidate.trim()) {
                    context.parentFloatingId = candidate.trim();
                }
            }
        }
    }
    if (context.parentFloatingId === 'toolbox') {
        context.parentFloatingId = null;
    }
    if (!context.reference || typeof context.reference !== 'string' || !context.reference.trim()) {
        context.reference = 'toolbox';
    }
    return context;
}

function getVisibleMenuEntries() {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return [];
    const entries = [];
    Array.from(supportEl.children || []).forEach((child) => {
        if (!child || child.id === '_intuition_overflow_forcer') return;
        const key = child.dataset ? child.dataset.nameKey : null;
        if (key) entries.push(key);
    });
    return entries;
}

function renderFloatingBody(info, nameKeys) {
    if (!info || !info.body) return;
    const themeRef = info && info.theme ? info.theme : currentTheme;
    const spacing = themeRef && themeRef.items_spacing ? String(themeRef.items_spacing) : '6px';
    const { isHorizontal } = getDirMeta(themeRef);
    const keys = Array.isArray(nameKeys) ? nameKeys.filter(Boolean) : [];
    info.body.style.display = 'flex';
    info.body.style.flexDirection = isHorizontal ? 'row' : 'column';
    info.body.style.flexWrap = 'nowrap';
    info.body.style.gap = spacing;
    info.body.style.justifyContent = 'flex-start';
    info.body.style.alignItems = isHorizontal ? 'center' : 'stretch';
    info.body.style.alignContent = 'flex-start';
    info.body.style.overflowX = isHorizontal ? 'auto' : 'hidden';
    info.body.style.overflowY = isHorizontal ? 'hidden' : 'auto';
    const existingChildren = Array.from(info.body.children || []).filter(Boolean);
    const buildFreshContent = () => {
        info.nameKeys = [];
        info.body.innerHTML = '';
        const createdEls = [];
        keys.forEach((key) => {
            const entry = addFloatingEntry(info, key, info.body, { forceVisible: true });
            if (!entry) return;
            if (entry.dataset && entry.dataset.floatingSatelliteId) {
                delete entry.dataset.floatingSatelliteId;
            }
            if (info.activeSatellites instanceof Map && info.activeSatellites.has(key)) {
                const activeState = info.activeSatellites.get(key);
                const activeId = (activeState && typeof activeState === 'object') ? activeState.id : activeState;
                if (activeId && entry.dataset) {
                    entry.dataset.floatingSatelliteId = activeId;
                    entry.dataset.floating = 'true';
                    entry.dataset.floatingHostId = info.id;
                }
                setPaletteVisualState(entry, true);
            }
            createdEls.push(entry);
        });
        if (info.body) {
            info.body.scrollTop = 0;
            info.body.scrollLeft = 0;
        }
        const animEls = createdEls.filter(Boolean);
        if (animEls.length) {
            requestAnimationFrame(() => {
                slideInItems(animEls, { theme: themeRef, origin: getFloatingBodyOrigin(info, themeRef) });
            });
        }
    };

    if (existingChildren.length) {
        slideOutItemsToOrigin(existingChildren, () => {
            buildFreshContent();
        }, { theme: themeRef, origin: getFloatingBodyOrigin(info, themeRef) });
    } else {
        buildFreshContent();
    }
}

function spawnFloatingPaletteFromSupport(nameKeys, opts = {}) {
    if (!nameKeys || !nameKeys.length) return null;
    let icon;
    let iconColor;
    let iconTop;
    let iconLeft;
    let iconSize;
    const sourceKey = opts && opts.sourcePalette;
    if (sourceKey) {
        const def = intuition_content[sourceKey];
        if (def && typeof def === 'object') {
            if (Object.prototype.hasOwnProperty.call(def, 'icon')) {
                icon = def.icon;
            } else {
                icon = sourceKey;
            }
            iconColor = def.icon_color || def.iconColor;
            iconTop = def.icon_top || def.iconTop;
            iconLeft = def.icon_left || def.iconLeft;
            iconSize = def.icon_size || def.iconSize;
        } else {
            icon = sourceKey;
        }
    }
    const info = createFloatingHost({
        title: opts.title || 'palette',
        type: 'palette',
        x: opts.x,
        y: opts.y,
        parentFloatingId: opts.parentFloatingId || null,
        role: opts.role || 'palette',
        sourcePalette: opts.sourcePalette || null,
        theme: opts.theme || currentTheme,
        reference: opts.reference != null
            ? opts.reference
            : (opts.parentFloatingId || 'toolbox'),
        initialChildren: Array.isArray(nameKeys) ? nameKeys.filter(Boolean) : [],
        icon,
        iconColor,
        iconTop,
        iconLeft,
        iconSize
    });
    const themeRef = info && info.theme ? info.theme : currentTheme;
    const spacing = themeRef && themeRef.items_spacing ? String(themeRef.items_spacing) : '6px';
    const { isHorizontal } = getDirMeta(themeRef);
    info.body.style.flexDirection = isHorizontal ? 'row' : 'column';
    info.body.style.flexWrap = 'nowrap';
    info.body.style.gap = spacing;
    info.body.style.justifyContent = 'flex-start';
    info.body.style.alignItems = isHorizontal ? 'center' : 'stretch';
    info.body.style.alignContent = 'flex-start';
    info.body.style.overflowX = isHorizontal ? 'auto' : 'hidden';
    info.body.style.overflowY = isHorizontal ? 'hidden' : 'auto';
    const normalizedKeys = Array.isArray(nameKeys) ? nameKeys.filter(Boolean) : [];
    info.rootChildren = normalizedKeys.slice();
    info.menuStack = [{ parent: opts.sourcePalette || null, children: info.rootChildren.slice(), title: opts.title || 'palette' }];
    renderFloatingBody(info, info.rootChildren);

    ensureFloatingHostRecord(info, themeRef, {
        reference: opts.reference != null ? opts.reference : (opts.parentFloatingId || 'toolbox'),
        parent: opts.parentFloatingId || null,
        content: {
            key: opts.sourcePalette || null,
            title: opts.title || 'palette',
            children: info.rootChildren.slice()
        }
    });
    clampFloatingToViewport(info);
    return info;
}

function ensureFloatingElementId(el, info) {
    if (!el) return null;
    if (!el.id || !el.id.length) {
        el.id = `${info.id}__auto_${++floatingHierarchyCounter}`;
    }
    return el.id;
}

function populateFloatingHierarchy(info, nameKey, parentEl, depth = 0, options = {}) {
    if (!info || !parentEl) return null;
    const def = intuition_content[nameKey];
    if (!def) return null;
    ensureFloatingElementId(parentEl, info);
    const entry = addFloatingEntry(info, nameKey, parentEl, {
        datasetNameKey: nameKey,
        forceVisible: true,
        idPrefix: `${info.id}__floating_entry`
    });
    if (!entry) return null;
    entry.dataset.floatingDepth = String(depth);
    entry.style.flex = '0 0 auto';
    entry.style.alignSelf = options.isHorizontal ? 'center' : 'flex-start';
    const indentStep = options.indent || 12;
    const maxIndentDepth = options.maxIndentDepth != null ? options.maxIndentDepth : 4;
    const appliedDepth = Math.min(depth, maxIndentDepth);
    if (appliedDepth > 0) {
        const indentPx = `${appliedDepth * indentStep}px`;
        if (options.isHorizontal) {
            entry.style.marginTop = indentPx;
        } else {
            entry.style.marginLeft = indentPx;
        }
    }
    const children = Array.isArray(def.children) ? def.children : [];
    if (!children.length) return entry;
    const childWrapId = `${entry.id}__children_${++floatingHierarchyCounter}`;
    const nextDepth = depth + 1;
    const childIndentDepth = Math.min(nextDepth, maxIndentDepth);
    const childIndentPx = `${childIndentDepth * indentStep}px`;
    const childWrap = $('div', {
        id: childWrapId,
        parent: `#${parentEl.id}`,
        class: 'intuition-floating-children',
        css: {
            display: 'flex',
            flexDirection: options.isHorizontal ? 'row' : 'column',
            flexWrap: 'wrap',
            gap: options.spacing || '6px',
            alignItems: options.isHorizontal ? 'center' : 'stretch',
            width: '100%',
            boxSizing: 'border-box',
            paddingLeft: options.isHorizontal ? '0' : childIndentPx,
            paddingTop: options.isHorizontal ? childIndentPx : '0',
            pointerEvents: 'auto'
        }
    });
    childWrap.dataset.parent = nameKey;
    children.forEach((childKey) => {
        populateFloatingHierarchy(info, childKey, childWrap, nextDepth, options);
    });
    return entry;
}

function beginToolboxDrag(ev) {
    if (!isEditModeActive()) return;
    if (editModeState.dragContext) return;
    const entries = getVisibleMenuEntries();
    const supportCtx = resolveActiveSupportContext();
    const pointerId = ev.pointerId != null ? ev.pointerId : 'mouse';
    const ctx = {
        kind: 'toolbox',
        pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        entries,
        floatingInfo: null,
        supportReference: supportCtx.reference,
        supportParentId: supportCtx.parentFloatingId || null
    };
    ctx.moveHandler = (e) => handleToolboxDragMove(e, ctx);
    ctx.upHandler = (e) => finishToolboxDrag(e, ctx);
    document.addEventListener('pointermove', ctx.moveHandler, true);
    document.addEventListener('pointerup', ctx.upHandler, true);
    document.addEventListener('pointercancel', ctx.upHandler, true);
    document.addEventListener('pointerleave', ctx.upHandler, true);
    editModeState.dragContext = ctx;
    ev.preventDefault();
    ev.stopPropagation();
}

function handleToolboxDragMove(e, ctx) {
    if (editModeState.dragContext !== ctx) return;
    if (ctx.pointerId != null && e.pointerId != null && e.pointerId !== ctx.pointerId) return;
    const x = e.clientX;
    const y = e.clientY;
    if (!ctx.floatingInfo) {
        const dist = Math.hypot(x - ctx.startX, y - ctx.startY);
        if (dist < EDIT_DRAG_THRESHOLD) return;
        if (!ctx.entries || !ctx.entries.length) {
            cleanupDragContext(ctx);
            return;
        }
        ctx.floatingInfo = spawnFloatingPaletteFromSupport(ctx.entries, {
            title: 'toolbox',
            x,
            y,
            theme: currentTheme,
            reference: ctx.supportReference,
            parentFloatingId: ctx.supportParentId || null
        });
        if (!ctx.floatingInfo) {
            cleanupDragContext(ctx);
            return;
        }
        const rect = ctx.floatingInfo.container.getBoundingClientRect();
        ctx.offsetX = rect.width / 2;
        ctx.offsetY = rect.height / 2;
    }
    const left = x - (ctx.offsetX || 0);
    const top = y - (ctx.offsetY || 0);
    moveFloatingTo(ctx.floatingInfo, left, top);
    e.preventDefault();
    e.stopPropagation();
}

function finishToolboxDrag(e, ctx) {
    if (editModeState.dragContext !== ctx) return;
    if (ctx.pointerId != null && e.pointerId != null && e.pointerId !== ctx.pointerId) return;
    if (ctx.floatingInfo) clampFloatingToViewport(ctx.floatingInfo);
    cleanupDragContext(ctx);
}

function cleanupDragContext(ctx) {
    if (!ctx) return;
    if (ctx.originEl && typeof ctx.originEl.releasePointerCapture === 'function' && ctx.capturePointerId != null) {
        try { ctx.originEl.releasePointerCapture(ctx.capturePointerId); } catch (_) { }
    }
    if (ctx.moveHandler) {
        document.removeEventListener('pointermove', ctx.moveHandler, true);
        document.removeEventListener('pointerup', ctx.upHandler, true);
        document.removeEventListener('pointercancel', ctx.upHandler, true);
        document.removeEventListener('pointerleave', ctx.upHandler, true);
    }
    editModeState.dragContext = null;
}

function beginMenuItemDrag(ev, meta) {
    const pointerKey = ev.pointerId != null ? ev.pointerId : 'mouse';
    const supportCtx = resolveActiveSupportContext();
    const ctx = {
        kind: 'menu-item',
        pointerId: pointerKey,
        nameKey: meta.nameKey,
        label: meta.label,
        typeName: meta.typeName,
        startX: ev.clientX,
        startY: ev.clientY,
        floatingInfo: null,
        originEl: meta.el || meta.originEl || null,
        capturePointerId: (typeof meta.capturePointerId === 'number') ? meta.capturePointerId : (typeof pointerKey === 'number' ? pointerKey : null),
        supportReference: supportCtx.reference,
        supportParentId: supportCtx.parentFloatingId || null
    };
    const dragDef = meta.nameKey ? intuition_content[meta.nameKey] : null;
    if (meta.nameKey) {
        const dragMeta = {
            reference: 'drag:start',
            content: {
                key: meta.nameKey,
                title: (dragDef && dragDef.label) || meta.label || meta.nameKey,
                children: Array.isArray(dragDef && dragDef.children) ? dragDef.children.slice() : []
            },
            orientation: resolveOrientationValue(currentTheme),
            toolboxOffsetMain: normalizeOffsetToNumber(currentTheme && currentTheme.toolboxOffsetMain),
            toolboxOffsetEdge: normalizeOffsetToNumber(currentTheme && currentTheme.toolboxOffsetEdge)
        };

    }
    ctx.moveHandler = (e) => handleMenuItemDragMove(e, ctx);
    ctx.upHandler = (e) => finishMenuItemDrag(e, ctx);
    document.addEventListener('pointermove', ctx.moveHandler, true);
    document.addEventListener('pointerup', ctx.upHandler, true);
    document.addEventListener('pointercancel', ctx.upHandler, true);
    document.addEventListener('pointerleave', ctx.upHandler, true);
    editModeState.dragContext = ctx;
}

function handleMenuItemDragMove(e, ctx) {
    if (editModeState.dragContext !== ctx) return;
    if (ctx.pointerId != null && e.pointerId != null && e.pointerId !== ctx.pointerId) return;
    const x = e.clientX;
    const y = e.clientY;
    if (!ctx.floatingInfo) {
        const dist = Math.hypot(x - ctx.startX, y - ctx.startY);
        if (dist < EDIT_DRAG_THRESHOLD) return;
        ctx.floatingInfo = spawnFloatingFromMenuItem(ctx.nameKey, {
            label: ctx.label,
            typeName: ctx.typeName,
            x,
            y,
            theme: currentTheme,
            reference: ctx.supportReference,
            parentFloatingId: ctx.supportParentId || null
        });
        if (!ctx.floatingInfo) {
            cleanupDragContext(ctx);
            return;
        }
        const rect = ctx.floatingInfo.container.getBoundingClientRect();
        ctx.offsetX = rect.width / 2;
        ctx.offsetY = rect.height / 2;
    }
    const left = x - (ctx.offsetX || 0);
    const top = y - (ctx.offsetY || 0);
    moveFloatingTo(ctx.floatingInfo, left, top);
    e.preventDefault();
    e.stopPropagation();
}

function finishMenuItemDrag(e, ctx) {
    if (editModeState.dragContext !== ctx) return;
    if (ctx.pointerId != null && e.pointerId != null && e.pointerId !== ctx.pointerId) return;
    if (ctx.floatingInfo) {
        clampFloatingToViewport(ctx.floatingInfo);
    }
    cleanupDragContext(ctx);
}

function beginFloatingMove(ev, info) {
    if (!info || !info.container) return;
    const rect = info.container.getBoundingClientRect();
    const pointerKey = ev.pointerId != null ? ev.pointerId : 'mouse';
    const originEl = ev.currentTarget || ev.target || info.grip || info.container;
    const capturePointerId = (typeof ev.pointerId === 'number') ? ev.pointerId : null;
    if (capturePointerId != null && originEl && typeof originEl.setPointerCapture === 'function') {
        try { originEl.setPointerCapture(capturePointerId); } catch (_) { /* ignore */ }
    }
    const ctx = {
        kind: 'floating-move',
        pointerId: pointerKey,
        floatingInfo: info,
        offsetX: ev.clientX - rect.left,
        offsetY: ev.clientY - rect.top,
        originEl,
        capturePointerId
    };
    ctx.moveHandler = (e) => handleFloatingMove(e, ctx);
    ctx.upHandler = (e) => finishFloatingMove(e, ctx);
    document.addEventListener('pointermove', ctx.moveHandler, true);
    document.addEventListener('pointerup', ctx.upHandler, true);
    document.addEventListener('pointercancel', ctx.upHandler, true);
    document.addEventListener('pointerleave', ctx.upHandler, true);
    editModeState.dragContext = ctx;
}

function handleFloatingMove(e, ctx) {
    if (editModeState.dragContext !== ctx) return;
    if (ctx.pointerId != null && e.pointerId != null && e.pointerId !== ctx.pointerId) return;
    const left = e.clientX - (ctx.offsetX || 0);
    const top = e.clientY - (ctx.offsetY || 0);
    moveFloatingTo(ctx.floatingInfo, left, top);
    repositionActiveSatellites(ctx.floatingInfo);
    e.preventDefault();
    e.stopPropagation();
}

function finishFloatingMove(e, ctx) {
    if (editModeState.dragContext !== ctx) return;
    if (ctx.pointerId != null && e.pointerId != null && e.pointerId !== ctx.pointerId) return;
    if (ctx.floatingInfo) {
        clampFloatingToViewport(ctx.floatingInfo);
        repositionActiveSatellites(ctx.floatingInfo);
    }
    cleanupDragContext(ctx);
}

function attachToolboxEditBehavior(toolboxEl) {
    if (!toolboxEl || toolboxEl._editBehaviorAttached) return;
    const longPressDelay = 600;
    let longPressTimer = null;
    let pointerId = null;
    let startX = 0;
    let startY = 0;

    const clearTimer = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    const onPointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        pointerId = e.pointerId != null ? e.pointerId : 'mouse';
        if (isEditModeActive()) {
            beginToolboxDrag(e);
            return;
        }
        clearTimer();
        longPressTimer = setTimeout(() => {
            enterEditMode();
            editModeState.suppressToolboxClick = true;
        }, longPressDelay);
        try { toolboxEl.setPointerCapture(pointerId); } catch (_) { }
    };

    const onPointerMove = (e) => {
        if (pointerId != null && e.pointerId != null && e.pointerId !== pointerId) return;
        if (longPressTimer) {
            const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
            if (dist > 14) {
                clearTimer();
            }
        }
    };

    const finalize = (e) => {
        if (pointerId != null && e.pointerId != null && e.pointerId !== pointerId) return;
        clearTimer();
        try { toolboxEl.releasePointerCapture(pointerId); } catch (_) { }
        pointerId = null;
    };

    toolboxEl.addEventListener('pointerdown', onPointerDown);
    toolboxEl.addEventListener('pointermove', onPointerMove);
    toolboxEl.addEventListener('pointerup', finalize);
    toolboxEl.addEventListener('pointercancel', finalize);
    toolboxEl._editBehaviorAttached = true;
}

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
        satellite_offset: '0px',
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
        toolbox_icon_size: '39%',      // px, %, ou ratio (0..1)
        toolbox_icon_top: '50%',       // position verticale
        toolbox_icon_left: '50%',
        toolboxOffsetMain: "7px",
        toolboxOffsetEdge: "7px",
        items_offset_main: item_border_radius + items_spacing + 'px',
        icon_color: "#cacacaff",
        icon_size: "39%",
        icon_top: '63%',       // position verticale
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
        direction: "top_left_horizontal",
        edit_mode_color: '#ff6f61'
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
    click: function (e) {
        if (editModeState.suppressToolboxClick) {
            e.preventDefault();
            e.stopPropagation();
            editModeState.suppressToolboxClick = false;
            return;
        }
        if (isEditModeActive()) {
            e.preventDefault();
            e.stopPropagation();
            exitEditMode();
            return;
        }
        openMenu('toolbox');
    },
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
                    setupEditModeDrag(itemEl, { nameKey: name, label, typeName: inferDefinitionType(def) });
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
        if (suppressInteractionDuringEdit(e)) return;
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
        if (suppressInteractionDuringEdit(e)) return;
        e.stopPropagation();
        handleToolSemanticEvent('touch', el, def, e);
    });
    // Pointer/touch down
    ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            if (suppressInteractionDuringEdit(e)) return;
            handleToolSemanticEvent('touch_down', el, def, e);
        }, { passive: false });
    });
    // Pointer/touch up (use capture to ensure firing even if propagation canceled in children)
    ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            if (suppressInteractionDuringEdit(e)) return;
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
        if (suppressInteractionDuringEdit(e)) return;
        e.stopPropagation();
        handleToolSemanticEvent('touch', el, def, e);
    });
    // Pointer/touch down
    ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            if (suppressInteractionDuringEdit(e)) return;
            handleToolSemanticEvent('touch_down', el, def, e);
        }, { passive: false });
    });
    // Pointer/touch up
    ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            if (suppressInteractionDuringEdit(e)) return;
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
        if (suppressInteractionDuringEdit(e)) return;
        e.stopPropagation();
        handleToolSemanticEvent('touch', el, def, e);
    });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            if (suppressInteractionDuringEdit(e)) return;
            handleToolSemanticEvent('touch_down', el, def, e);
        }, { passive: false });
    });
    ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'pointercancel'].forEach(ev => {
        el.addEventListener(ev, (e) => {
            if (suppressInteractionDuringEdit(e)) return;
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
        if (suppressInteractionDuringEdit(ev)) return;
        if (locking) {
            // Sort du lock mais laisse remonter l'event pour expansion/fermeture
            exitLock();
        }
    }, true);

    const startPress = (ev) => {
        if (suppressInteractionDuringEdit(ev)) return;
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
function runContentHandler(def, handlerName, payload = {}) {
    if (!def || !handlerName) return;
    const code = def[handlerName];
    if (!code) return;
    const { el = null, event = null, nameKey = null } = payload;
    const kind = payload.kind || handlerName;
    const context = {
        el,
        event,
        kind,
        nameKey,
        update: window.updateParticleValue,
        theme: currentTheme,
        value: payload.value
    };
    try {
        if (typeof code === 'function') {
            code(context);
        } else if (typeof code === 'string') {
            const fn = new Function('el', 'event', 'kind', 'nameKey', 'update', 'theme', 'value', code);
            fn(el, event, kind, nameKey, window.updateParticleValue, currentTheme, payload.value);
        }
    } catch (err) {
        console.error('Intuition content handler error', err);
    }
}

function handleToolSemanticEvent(kind, el, def, rawEvent) {
    if (!el) return;
    if (isEditModeActive()) return;
    const nameKey = el.dataset && el.dataset.nameKey;
    if (!def && nameKey) {
        try { def = intuition_content[nameKey]; } catch (_) { }
    }

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
            runContentHandler(def, 'inactive', { el, event: rawEvent, nameKey, kind: 'inactive' });
        } else {
            el.dataset.simpleActive = 'true';
            // ordre de fallback: tool_bg_active -> tool_active_bg -> tool_bg
            const bg = currentTheme.tool_bg_active || currentTheme.tool_active_bg || currentTheme.tool_bg || '#444';
            try { el.style.background = bg; } catch (_) { }
            el.dataset.activeTag = 'true';
            runContentHandler(def, 'active', { el, event: rawEvent, nameKey, kind: 'active' });
        }
    };

    const basePayload = { el, event: rawEvent, nameKey };

    switch (kind) {
        case 'touch_down':
            runContentHandler(def, 'touch_down', { ...basePayload, kind: 'touch_down' });
            // Ne bloque pas comportement par défaut (mais rien à faire ici encore)
            break;
        case 'touch_up':
            runContentHandler(def, 'touch_up', { ...basePayload, kind: 'touch_up' });
            break;
        case 'touch':
            runContentHandler(def, 'touch', { ...basePayload, kind: 'touch' });
            // Si tool avec enfants -> comportement historique (expand). Sinon toggle actif simple.
            if (def && Array.isArray(def.children) && def.children.length > 0) {
                try { expandToolInline(el, { id: el.id, nameKey }); } catch (_) { }
            } else {
                toggleChildlessActive();
            }
            break;
        case 'lock':
            {
                const phase = rawEvent && rawEvent.phase;
                if (phase === 'exit') {
                    if (def && def.unlock) {
                        runContentHandler(def, 'unlock', { ...basePayload, kind: 'unlock' });
                    } else {
                        runContentHandler(def, 'lock', { ...basePayload, kind: 'lock' });
                    }
                } else {
                    runContentHandler(def, 'lock', { ...basePayload, kind: 'lock' });
                }
            }
            break;
    }
}
// Render particle value + unit at bottom from currentTheme settings (plain text only)
function renderParticleValueFromTheme(cfg) {
    if (!cfg || !cfg.id) return;
    const key = (cfg && cfg.nameKey) || (cfg && cfg.id ? String(cfg.id).replace(/^_intuition_/, '') : '');
    const def = intuition_content[key];
    if (!def) return;
    const rawUnit = def.unit;
    const orientationControl = !!def && !!def.orientationControl;
    if (orientationControl && typeof def.value === 'string') {
        def._unitSelected = String(def.value).toLowerCase();
    }
    const allowInlineEdit = (def.allowInlineEdit !== false) && !orientationControl;
    const showUnitLabel = !orientationControl && def.hideUnitLabel !== true;
    const triggerDropdownOnItem = orientationControl || def.openUnitDropdownOnItem === true;
    const syncValueWithUnit = orientationControl || def.syncValueWithUnit === true;
    def._orientationControl = orientationControl;
    def._allowInlineEdit = allowInlineEdit;
    def._showUnitLabel = showUnitLabel;
    def._triggerDropdownOnItem = triggerDropdownOnItem;
    def._syncValueWithUnit = syncValueWithUnit;
    const aliasMap = (def && typeof def.unitLabelMap === 'object') ? def.unitLabelMap : null;
    let unitOptions = null;
    if (Array.isArray(rawUnit)) {
        const normalized = rawUnit.map(u => String(u));
        def._unitChoices = normalized;
        if (!def._unitSelected || !normalized.includes(def._unitSelected)) {
            def._unitSelected = normalized[0] || '';
        }
        unitOptions = normalized;
    } else {
        def._unitChoices = null;
        if (typeof rawUnit === 'string') {
            def._unitSelected = rawUnit;
        }
    }
    if (orientationControl) {
        if (!def._unitSelected && currentTheme && typeof currentTheme.direction === 'string') {
            const themeDir = String(currentTheme.direction).toLowerCase();
            if (unitOptions && unitOptions.includes(themeDir)) {
                def._unitSelected = themeDir;
            }
        }
        if (syncValueWithUnit) {
            if (def._unitSelected) {
                def.value = def._unitSelected;
            } else if (currentTheme && typeof currentTheme.direction === 'string') {
                def.value = String(currentTheme.direction).toLowerCase();
            }
        }
    }
    const unit = def._unitSelected || (typeof rawUnit === 'string' ? rawUnit : '');
    const val = def.value;
    if (val === undefined || val === null) return;
    const decimals = Math.max(0, Math.min(6, parseInt(def.ext != null ? def.ext : 0, 10)));
    const valueText = (typeof val === 'number') ? val.toFixed(decimals) : String(val);
    const displayText = (aliasMap && typeof aliasMap[val] === 'string') ? aliasMap[val] : valueText;
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
    const valueSpan = $('span', { parent: wrap, text: displayText, css: { color: valColor } });
    const triggerEvents = window.PointerEvent ? ['pointerdown'] : ['mousedown', 'click'];
    const toggleUnitDropdown = (ev) => {
        if (ev) {
            try { ev.preventDefault(); } catch (_) { }
            try { ev.stopPropagation(); } catch (_) { }
        }
        let entry = unitDropdownRegistry.get(key);
        if (!entry || !entry.wrap || !entry.dropdown) {
            renderParticleValueFromTheme({ id: cfg.id, nameKey: key });
            entry = unitDropdownRegistry.get(key);
        }
        if (!entry || !entry.wrap || !entry.dropdown) return;
        const dropdown = entry.dropdown;
        const isOpen = dropdown && typeof dropdown.isDropDownOpen === 'function'
            ? dropdown.isDropDownOpen()
            : false;
        if (!isOpen) {
            try { positionUnitDropdownEntry(entry); } catch (_) { }
        }
        if (dropdown && typeof dropdown.toggleDropDown === 'function') {
            dropdown.toggleDropDown();
        } else if (entry.wrap) {
            try { entry.wrap.click(); } catch (_) { }
        }
    };
    const attachDropdownTrigger = (target) => {
        if (!target || !target.addEventListener) return;
        triggerEvents.forEach(evtName => {
            const opts = (evtName === 'pointerdown' || evtName === 'mousedown') ? { passive: false } : false;
            target.addEventListener(evtName, toggleUnitDropdown, opts);
        });
        target.addEventListener('touchstart', toggleUnitDropdown, { passive: false });
    };
    let unitSpan = null;
    if (unit && showUnitLabel) {
        unitSpan = $('span', {
            parent: wrap,
            text: unit,
            css: {
                color: unitColor,
                marginLeft: '2px',
                pointerEvents: 'auto',
                cursor: 'pointer',
                userSelect: 'none',
                display: 'inline-flex',
                alignItems: 'center'
            }
        });
        attachDropdownTrigger(unitSpan);
    }

    if (valueSpan && allowInlineEdit) {
        ['mousedown', 'click'].forEach(ev => {
            valueSpan.addEventListener(ev, (e) => { e.stopPropagation(); });
        });
    }

    if (triggerDropdownOnItem) {
        if (valueSpan && !allowInlineEdit) {
            attachDropdownTrigger(valueSpan);
        }
        if (!allowInlineEdit && wrap) {
            attachDropdownTrigger(wrap);
        }
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
    if (valueSpan && valueSpan.addEventListener && allowInlineEdit) {
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
    if (valueSpan && valueSpan.style && !allowInlineEdit) {
        valueSpan.style.cursor = triggerDropdownOnItem ? 'pointer' : 'default';
    }
    if (wrap && wrap.addEventListener) {
        if (allowInlineEdit) {
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
        } else {
            wrap.style.cursor = triggerDropdownOnItem ? 'pointer' : 'default';
        }
    }

    removeUnitDropdown(key);
    if (unitOptions && unitOptions.length && typeof window !== 'undefined') {
        const dropDownCtor = (typeof window.dropDown === 'function') ? window.dropDown : (typeof dropDown === 'function' ? dropDown : null);
        if (dropDownCtor && particleEl) {
            const wrapId = `${cfg.id}__unit_dropdown_wrap`;
            const existingWrap = document.getElementById(wrapId);
            if (existingWrap && existingWrap.parentElement) {
                try { existingWrap.parentElement.removeChild(existingWrap); } catch (_) { /* ignore */ }
            }
            const wrapEl = document.createElement('div');
            wrapEl.id = wrapId;
            wrapEl.dataset.unitDropdown = 'true';
            wrapEl.style.position = 'fixed';
            wrapEl.style.display = 'flex';
            wrapEl.style.alignItems = 'center';
            wrapEl.style.justifyContent = 'center';
            wrapEl.style.pointerEvents = 'auto';
            wrapEl.style.zIndex = '10000060';
            const fontSizeCss = resolveToolFontSizeCss();
            const heightCss = computeDropdownHeight(fontSizeCss);
            const widthCss = resolveItemSizeCss();
            wrapEl.style.width = widthCss;
            wrapEl.style.height = heightCss;
            document.body.appendChild(wrapEl);

            const entry = { wrap: wrapEl, host: particleEl, dropdown: null, openDirection: 'down' };
            positionUnitDropdownEntry(entry);

            const dropdownRoot = dropDownCtor({
                parent: wrapEl,
                id: `${cfg.id}__unit_dropdown`,
                options: unitOptions.map(opt => ({ label: (aliasMap && typeof aliasMap[opt] === 'string') ? aliasMap[opt] : opt, value: opt })),
                value: unit,
                placeholder: '',
                openDirection: entry.openDirection || 'down',
                showSelectedLabel: false,
                css: {
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'transparent',
                    color: currentTheme.tool_text,
                    boxShadow: 'none',
                    borderRadius: currentTheme.item_border_radius,
                    fontSize: fontSizeCss,
                    fontFamily: currentTheme.tool_font_family || 'system-ui',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: '10000060'
                },
                textCss: {
                    color: currentTheme.tool_text,
                    fontSize: fontSizeCss,
                    fontFamily: currentTheme.tool_font_family || 'system-ui',
                    pointerEvents: 'none'
                },
                listCss: {
                    backgroundColor: currentTheme.tool_bg,
                    boxShadow: currentTheme.item_shadow,
                    color: currentTheme.tool_text,
                    borderRadius: currentTheme.item_border_radius,
                    zIndex: '10000061'
                },
                itemCss: {
                    color: currentTheme.tool_text,
                    fontSize: fontSizeCss,
                    fontFamily: currentTheme.tool_font_family || 'system-ui',
                    textAlign: 'center'
                },
                onChange: (val) => {
                    if (!val || val === def._unitSelected) return;
                    def._unitSelected = val;
                    if (Array.isArray(def._unitChoices) && !def._unitChoices.includes(val)) {
                        def._unitChoices.push(val);
                    }
                    if (syncValueWithUnit) {
                        window.updateParticleValue(key, val, val);
                    } else {
                        window.updateParticleValue(key, def.value, val);
                    }
                }
            });

            entry.dropdown = dropdownRoot;
            unitDropdownRegistry.set(key, entry);
        }
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

    const fire = (handlerName, extra = {}) => {
        runContentHandler(def, handlerName, { el: host, nameKey: key, ...extra });
    };

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

        let lastPointerEvent = null;
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
                lastPointerEvent = e;
                const currentValue = intuition_content[key] ? intuition_content[key].value : undefined;
                fire('touch_down', { event: e, kind: 'touch_down', value: currentValue });
                fire('touch', { event: e, kind: 'touch', value: currentValue });
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
                    lastPointerEvent = ev;
                    const cPos = (ev.touches && ev.touches.length) ? (isVertical ? ev.touches[0].clientY : ev.touches[0].clientX) : (isVertical ? ev.clientY : ev.clientX);
                    const dRaw = cPos - startPos;
                    const d = isVertical ? -dRaw : dRaw; // Inversion verticale: monter augmente, descendre diminue
                    applyDelta(d);
                    try { ev.stopPropagation(); ev.preventDefault(); } catch (_) { }
                };
                const release = (ev) => {
                    if (!dragging) return;
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
                    const upValue = intuition_content[key] ? intuition_content[key].value : undefined;
                    fire('touch_up', { event: ev || lastPointerEvent, kind: 'touch_up', value: upValue });
                    lastPointerEvent = null;
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

        let buttonObj = null;
        const pushValue = (nextVal) => {
            if (buttonObj) buttonObj._internalToggleSync = true;
            try {
                window.updateParticleValue(key, nextVal);
            } finally {
                if (buttonObj) buttonObj._internalToggleSync = false;
            }
        };

        buttonObj = Button({
            id: btnId,
            parent: wrap,
            toggle: true,
            initialState: isOn,
            onText: '', // pas de label
            offText: '',
            css: {
                width: sizePx,
                height: sizePx,
                fontSize: `${Math.max(9, Math.round(itemSizeNum * 0.22))}px`,
                backgroundColor: isOn ? currentTheme.button_active_color || currentTheme.button_color : currentTheme.button_color,
                boxShadow: currentTheme.item_shadow,
                border: 'none',
                outline: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0',
                pointerEvents: 'auto'
            },
            onStyle: {
                backgroundColor: currentTheme.button_active_color || currentTheme.button_color,
                boxShadow: currentTheme.item_shadow,
                border: 'none',
                outline: 'none'
            },
            offStyle: {
                backgroundColor: currentTheme.button_color,
                boxShadow: currentTheme.item_shadow,
                border: 'none',
                outline: 'none'
            },
            onAction: () => pushValue(100),
            offAction: () => pushValue(0)
        });

        if (buttonObj) {
            try {
                buttonObj.dataset.baseToggleSize = parseFloat(sizePx);
            } catch (_) { /* ignore */ }
        }

        try { host._helperButton = buttonObj; } catch (_) { }

        requestAnimationFrame(() => {
            const buttonNode = document.getElementById(btnId);
            if (!buttonNode) return;
            buttonNode.addEventListener('pointerdown', (e) => fire('touch_down', { event: e, kind: 'touch_down', value: intuition_content[key] ? intuition_content[key].value : undefined }), true);
            buttonNode.addEventListener('pointerup', (e) => fire('touch_up', { event: e, kind: 'touch_up', value: intuition_content[key] ? intuition_content[key].value : undefined }), true);
            buttonNode.addEventListener('click', (e) => fire('touch', { event: e, kind: 'touch', value: intuition_content[key] ? intuition_content[key].value : undefined }), true);
        });
    }
}
// ...existing code...
function removeUnitDropdown(nameKey) {
    if (!nameKey) return;
    const entry = unitDropdownRegistry.get(nameKey);
    if (!entry) return;
    try {
        if (entry.dropdown && typeof entry.dropdown.destroyDropDown === 'function') {
            entry.dropdown.destroyDropDown();
        }
    } catch (e) { /* ignore */ }
    try {
        if (entry.wrap && entry.wrap.parentElement) {
            entry.wrap.parentElement.removeChild(entry.wrap);
        }
    } catch (e) { /* ignore */ }
    unitDropdownRegistry.delete(nameKey);
}

function removeAllUnitDropdowns() {
    Array.from(unitDropdownRegistry.keys()).forEach(removeUnitDropdown);
}

function resolveToolFontSizeCss() {
    if (currentTheme && currentTheme.tool_font) {
        return String(currentTheme.tool_font);
    }
    if (currentTheme && currentTheme.tool_font_px != null) {
        return `${currentTheme.tool_font_px}px`;
    }
    return '12px';
}

function computeDropdownHeight(fontSizeCss) {
    if (!fontSizeCss) return '32px';
    const match = String(fontSizeCss).trim().match(/^([0-9]*\.?[0-9]+)(px|rem|em|vw|vh|vmin|vmax|%)$/i);
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

function resolveItemSizeCss() {
    if (currentTheme && currentTheme.item_size) {
        return String(currentTheme.item_size);
    }
    return '54px';
}

function positionUnitDropdownEntry(entry) {
    if (!entry || !entry.wrap || !entry.host) return;
    const wrapEl = entry.wrap;
    const hostEl = entry.host;
    const supportEl = grab('toolbox_support');
    if (!supportEl) return;
    const hostRect = hostEl.getBoundingClientRect();
    const supportRect = supportEl.getBoundingClientRect();
    const { isHorizontal, isBottom, isRight } = getDirMeta();
    const gap = getSatelliteOffset();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const wrapWidth = wrapEl.offsetWidth || wrapEl.getBoundingClientRect().width || 0;
    const wrapHeight = wrapEl.offsetHeight || wrapEl.getBoundingClientRect().height || 0;

    let targetLeft = hostRect.left;
    let targetTop = hostRect.top;
    let openDir = 'down';

    if (isHorizontal) {
        const aboveSpace = supportRect.top;
        const belowSpace = vh - supportRect.bottom;
        const preferAbove = !!isBottom;
        let placeAbove = preferAbove;
        if (placeAbove && aboveSpace < wrapHeight + gap) placeAbove = false;
        if (!placeAbove && !preferAbove && belowSpace < wrapHeight + gap && aboveSpace >= wrapHeight + gap) placeAbove = true;
        const desiredTop = placeAbove ? (supportRect.top - wrapHeight - gap) : (supportRect.bottom + gap);
        targetTop = Math.max(0, Math.min(vh - wrapHeight, desiredTop));
        const baseLeft = hostRect.left;
        targetLeft = Math.max(0, Math.min(vw - wrapWidth, baseLeft));
        openDir = placeAbove ? 'down' : 'up';
    } else {
        const leftSpace = supportRect.left;
        const rightSpace = vw - supportRect.right;
        const preferLeft = !!isRight;
        let placeLeft = preferLeft;
        if (placeLeft && leftSpace < wrapWidth + gap) placeLeft = false;
        if (!placeLeft && !preferLeft && rightSpace < wrapWidth + gap && leftSpace >= wrapWidth + gap) placeLeft = true;
        const desiredLeft = placeLeft ? (supportRect.left - wrapWidth - gap) : (supportRect.right + gap);
        targetLeft = Math.max(0, Math.min(vw - wrapWidth, desiredLeft));
        const baseTop = hostRect.top;
        targetTop = Math.max(0, Math.min(vh - wrapHeight, baseTop));
        openDir = 'down';
    }

    wrapEl.style.left = `${targetLeft}px`;
    wrapEl.style.top = `${targetTop}px`;
    entry.openDirection = openDir;
}

function repositionUnitDropdowns() {
    unitDropdownRegistry.forEach((entry) => {
        if (!entry || !entry.wrap || !entry.host) return;
        positionUnitDropdownEntry(entry);
    });
}
// Update a single particle's value/unit/ext in intuition_content and refresh its display
window.updateParticleValue = function (nameKey, newValue, newUnit, newExt) {
    if (!nameKey || !(nameKey in intuition_content)) return;
    const def = intuition_content[nameKey];
    if (!def) return;
    const prevValue = def.value;
    const prevActive = !!prevValue && Number(prevValue) !== 0;
    if (newValue !== undefined) def.value = newValue;
    if (newUnit !== undefined) {
        if (Array.isArray(def._unitChoices)) {
            def._unitSelected = newUnit;
        }
        if (!Array.isArray(def.unit)) {
            def.unit = newUnit;
        }
    }
    if (newExt !== undefined) def.ext = newExt;
    const elId = `_intuition_${nameKey}`;
    const el = document.getElementById(elId);
    if (el) {
        renderParticleValueFromTheme({ id: elId, nameKey });
    }
    // Sync helper slider (use stored reference if any)
    const host = el || null;
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
            if (btn && typeof btn.getState === 'function' && !btn._internalToggleSync) {
                const btnState = !!btn.getState();
                if (btnState !== active) {
                    if (active && typeof btn.setOnState === 'function') {
                        btn.setOnState();
                    } else if (!active && typeof btn.setOffState === 'function') {
                        btn.setOffState();
                    }
                }
            }
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
    const handlerValue = newValue !== undefined ? newValue : currentVal;
    const valueChanged = newValue !== undefined ? prevValue !== newValue : prevValue !== currentVal;
    if (valueChanged) {
        runContentHandler(def, 'change', { el: host, nameKey, kind: 'change', value: handlerValue });
    }
    if (prevActive !== active) {
        runContentHandler(def, active ? 'active' : 'inactive', { el: host, nameKey, kind: active ? 'active' : 'inactive', value: currentVal });
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
    attachToolboxEditBehavior(toolboxEl);
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
    repositionUnitDropdowns();
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

function getEasingOpen(theme = currentTheme) {
    const elastic = Math.max(0, Math.min(1, (theme && theme.anim_elasticity) || 0));
    if (elastic > 0) {
        return (tt) => easeOutElasticP(tt, elastic);
    }
    const s = 1.70158 + (((theme && theme.anim_bounce_overshoot) || 0.08) * 3);
    return (tt) => easeOutBackP(tt, s);
}

function getEasingClose(theme = currentTheme) {
    // For closing, avoid elastic to prevent perceived reversed oscillations
    const s = 1.70158 + (((theme && theme.anim_bounce_overshoot) || 0.08) * 3);
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

function computeOriginFromRect(rect, theme = currentTheme) {
    if (!rect) return null;
    const { isTop, isBottom, isLeft, isRight } = getDirMeta(theme);
    const ox = isRight ? rect.right : rect.left;
    const oy = isBottom ? rect.bottom : rect.top;
    return { ox, oy };
}

function getSupportOrigin(theme = currentTheme) {
    const supportEl = grab('toolbox_support');
    if (!supportEl) return null;
    return computeOriginFromRect(supportEl.getBoundingClientRect(), theme);
}

function getFloatingBodyOrigin(info, theme = currentTheme) {
    if (!info || !info.body || typeof info.body.getBoundingClientRect !== 'function') return null;
    return computeOriginFromRect(info.body.getBoundingClientRect(), theme);
}

function slideInItems(items, opts = {}) {
    const els = (items || []).filter(Boolean);
    if (!els.length) return;
    const theme = opts.theme || currentTheme;
    const origin = opts.origin || getSupportOrigin(theme);
    if (!origin) return;
    const dur = (theme && theme.anim_duration_ms) || 420;
    const stagger = (theme && theme.anim_stagger_ms) || 24;
    const easing = getEasingOpen(theme);
    const { isRight, isBottom, isHorizontal } = getDirMeta(theme);
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
function slideOutItemsToOrigin(items, onAllDone, opts = {}) {
    const els = (items || []).filter(Boolean);
    if (!els.length) { if (onAllDone) onAllDone(); return; }
    const theme = opts.theme || currentTheme;
    const origin = opts.origin || getSupportOrigin(theme);
    if (!origin) { // fallback: remove without anim
        els.forEach(el => { try { el.remove(); } catch (e) { } });
        if (onAllDone) onAllDone();
        return;
    }
    const dur = (theme && theme.anim_duration_ms) || 420;
    const stagger = (theme && theme.anim_stagger_ms) || 24;
    const easing = getEasingClose(theme);
    const { isRight, isBottom, isHorizontal } = getDirMeta(theme);
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
    const nextDir = String(dir).toLowerCase();
    currentTheme.direction = nextDir;
    Object.keys(intuition_content || {}).forEach((nameKey) => {
        const def = intuition_content[nameKey];
        if (!def || !def.unit) return;
        if (def.orientationControl) {
            def._unitSelected = nextDir;
            if (def.syncValueWithUnit || def._syncValueWithUnit) {
                def.value = nextDir;
            }
        }
    });
    removeAllUnitDropdowns();
    apply_layout();
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
                renderHelperForItem({ id: node.id, nameKey: key });
            });
        }
    } catch (e) { /* ignore */ }
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
function getSatelliteOffset(theme = currentTheme) {
    const raw = theme && theme.satellite_offset;
    if (raw != null) {
        const val = (typeof raw === 'number') ? raw : parseFloat(String(raw));
        if (Number.isFinite(val)) {
            return val;
        }
    }
    const spacing = parseFloat(theme && theme.items_spacing);
    const fallback = Number.isFinite(spacing) ? spacing : 8;
    return Math.max(8, fallback);
}

function getDirMeta(theme = currentTheme) {
    const dir = ((theme && theme.direction) || '').toLowerCase();
    const isHorizontal = dir.includes('horizontal');
    const isTop = dir.includes('top');
    const isBottom = dir.includes('bottom');
    const isLeft = dir.includes('left');
    const isRight = dir.includes('right');
    // isReverse is kept for scroll-edge alignment semantics (row-reverse/column-reverse)
    const isReverse = (isHorizontal && isRight) || (!isHorizontal && isBottom);
    return { isHorizontal, isTop, isBottom, isLeft, isRight, isReverse, dir };
}

function computeFloatingSatelliteOrigin(anchorRect, theme = currentTheme) {
    const gap = getSatelliteOffset(theme);
    const { isHorizontal, isBottom, isTop, isLeft, isRight } = getDirMeta(theme);
    const centerX = anchorRect.left + (anchorRect.width || 0) / 2;
    const centerY = anchorRect.top + (anchorRect.height || 0) / 2;
    let x = centerX;
    let y = centerY;
    if (isHorizontal) {
        if (isBottom) {
            y = anchorRect.bottom + gap;
        } else if (isTop) {
            y = anchorRect.top - gap;
        } else {
            y = centerY + (anchorRect.height || 0) / 2 + gap;
        }
    } else {
        if (isRight) {
            x = anchorRect.right + gap;
        } else if (isLeft) {
            x = anchorRect.left - gap;
        } else {
            x = centerX + (anchorRect.width || 0) / 2 + gap;
        }
    }
    return { x, y };
}

function computeExtractedPaletteTarget(placeholderRect, supportRect, width, height, theme = currentTheme) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 1280;
    const vh = window.innerHeight || document.documentElement.clientHeight || 720;
    const { isHorizontal, isBottom, isTop, isLeft, isRight } = getDirMeta(theme);
    const gap = getSatelliteOffset(theme);
    const fallbackSupport = supportRect || placeholderRect;
    if (!placeholderRect) {
        return {
            left: Math.max(0, Math.min(vw - width, 0)),
            top: Math.max(0, Math.min(vh - height, 0))
        };
    }

    if (isHorizontal) {
        const aboveSpace = fallbackSupport ? fallbackSupport.top : placeholderRect.top;
        const belowSpace = fallbackSupport ? (vh - fallbackSupport.bottom) : (vh - placeholderRect.bottom);
        const preferAbove = !!isBottom;
        let placeAbove = preferAbove;
        if (placeAbove && aboveSpace < height + gap) placeAbove = false;
        if (!placeAbove && !preferAbove && belowSpace < height + gap && aboveSpace >= height + gap) placeAbove = true;
        const supportEdgeTop = fallbackSupport ? fallbackSupport.top : placeholderRect.top;
        const supportEdgeBottom = fallbackSupport ? fallbackSupport.bottom : placeholderRect.bottom;
        const targetTop = placeAbove ? (supportEdgeTop - height - gap) : (supportEdgeBottom + gap);
        const clampedTop = Math.max(0, Math.min(vh - height, targetTop));
        const baseLeft = placeholderRect.left;
        const clampedLeft = Math.max(0, Math.min(vw - width, baseLeft));
        return { left: clampedLeft, top: clampedTop };
    }

    const leftSpace = fallbackSupport ? fallbackSupport.left : placeholderRect.left;
    const rightSpace = fallbackSupport ? (vw - fallbackSupport.right) : (vw - placeholderRect.right);
    const preferLeft = !!isRight;
    let placeLeft = preferLeft;
    if (placeLeft && leftSpace < width + gap) placeLeft = false;
    if (!placeLeft && !preferLeft && rightSpace < width + gap && leftSpace >= width + gap) placeLeft = true;
    const supportEdgeLeft = fallbackSupport ? fallbackSupport.left : placeholderRect.left;
    const supportEdgeRight = fallbackSupport ? fallbackSupport.right : placeholderRect.right;
    const targetLeft = placeLeft ? (supportEdgeLeft - width - gap) : (supportEdgeRight + gap);
    const clampedLeft = Math.max(0, Math.min(vw - width, targetLeft));
    const baseTop = placeholderRect.top;
    const clampedTop = Math.max(0, Math.min(vh - height, baseTop));
    return { left: clampedLeft, top: clampedTop };
}

function ensureFloatingStackRoot(info) {
    if (!info) return;
    if (!Array.isArray(info.rootChildren) || !info.rootChildren.length) {
        info.rootChildren = Array.isArray(info.nameKeys) ? info.nameKeys.slice() : [];
    }
    if (!Array.isArray(info.menuStack) || !info.menuStack.length) {
        const baseChildren = info.rootChildren && info.rootChildren.length
            ? info.rootChildren.slice()
            : (Array.isArray(info.nameKeys) ? info.nameKeys.slice() : []);
        info.menuStack = [{ parent: null, children: baseChildren, title: info.title || 'palette' }];
    }
}

function getFloatingFallbackKeys(info) {
    if (!info) return [];
    const stack = Array.isArray(info.menuStack) ? info.menuStack : [];
    const top = stack[stack.length - 1];
    if (top && Array.isArray(top.children)) {
        return top.children.slice();
    }
    if (Array.isArray(info.rootChildren) && info.rootChildren.length) {
        return info.rootChildren.slice();
    }
    return Array.isArray(info.nameKeys) ? info.nameKeys.slice() : [];
}

function disposeFloatingSatelliteState(hostInfo, nameKey, state, opts = {}) {
    if (!state) return;
    if (typeof state === 'object' && state.el) {
        try { setLabelCentered(state.el, false); } catch (_) { }
        try { setPaletteVisualState(state.el, false); } catch (_) { }
        if (state.el.dataset) {
            delete state.el.dataset.floatingSatellite;
            delete state.el.dataset.floatingSatelliteId;
            delete state.el.dataset.floatingHostId;
            delete state.el.dataset.floatingNameKey;
            delete state.el.dataset.floatingPaletteTitle;
            delete state.el.dataset.sourcePalette;
        }
        try { state.el.remove(); } catch (_) { }
        if (state.placeholder && state.placeholder.parentElement) {
            try { state.placeholder.parentElement.removeChild(state.placeholder); } catch (_) { }
        }
    } else if (typeof state === 'string' && floatingRegistry.has(state) && !opts.preventCascade) {
        removeFloating(state);
    }
    if (hostInfo) {
        removePersistedFloatingSatellite(hostInfo, nameKey);
    }
    if (!opts.skipDelete && hostInfo && hostInfo.activeSatellites instanceof Map) {
        hostInfo.activeSatellites.delete(nameKey);
    }
}

function repositionActiveSatellites(info) {
    if (!info || !(info.activeSatellites instanceof Map) || !info.activeSatellites.size) return;
    const hostRectRaw = info.body && typeof info.body.getBoundingClientRect === 'function'
        ? info.body.getBoundingClientRect()
        : (info.container && typeof info.container.getBoundingClientRect === 'function'
            ? info.container.getBoundingClientRect()
            : null);
    if (!hostRectRaw) return;
    const hostRect = {
        left: hostRectRaw.left,
        top: hostRectRaw.top,
        width: hostRectRaw.width,
        height: hostRectRaw.height,
        right: hostRectRaw.right != null ? hostRectRaw.right : (hostRectRaw.left + hostRectRaw.width),
        bottom: hostRectRaw.bottom != null ? hostRectRaw.bottom : (hostRectRaw.top + hostRectRaw.height)
    };
    info.activeSatellites.forEach((state, key) => {
        if (!state || state.type !== 'element' || !state.el) return;
        const anchor = state.anchor || null;
        const offset = state.offsetFromHost || (anchor && hostRect
            ? {
                x: anchor.left - hostRect.left,
                y: anchor.top - hostRect.top
            }
            : { x: 0, y: 0 });
        const width = Math.max(1, state.width || state.el.offsetWidth || resolveItemSizePx());
        const height = Math.max(1, state.height || state.el.offsetHeight || resolveItemSizePx());
        const placeholderRect = anchor
            ? {
                left: hostRect.left + offset.x,
                top: hostRect.top + offset.y,
                width: anchor.width,
                height: anchor.height,
                right: hostRect.left + offset.x + anchor.width,
                bottom: hostRect.top + offset.y + anchor.height
            }
            : {
                left: hostRect.left,
                top: hostRect.top,
                width,
                height: height * 2,
                right: hostRect.left + width,
                bottom: hostRect.top + height * 2
            };
        const themeRef = info && info.theme ? info.theme : currentTheme;
        const targetPos = computeExtractedPaletteTarget(placeholderRect, hostRect, width, height, themeRef);
        state.left = targetPos.left;
        state.top = targetPos.top;
        state.anchor = {
            left: placeholderRect.left,
            top: placeholderRect.top,
            width: placeholderRect.width,
            height: placeholderRect.height,
            right: placeholderRect.right,
            bottom: placeholderRect.bottom
        };
        state.offsetFromHost = offset;
        state.width = width;
        state.height = height;
        state.el.style.left = `${targetPos.left}px`;
        state.el.style.top = `${targetPos.top}px`;
        state.el.style.width = `${width}px`;
        state.el.style.height = `${height}px`;
        updatePersistedFloatingSatellitePosition(info, key, targetPos.left, targetPos.top);
    });
}

function createFloatingPaletteSatellite(hostInfo, el, nameKey, paletteTitle, placeholder, options = {}) {
    if (!hostInfo || !el) return null;
    const placeholderRect = placeholder && typeof placeholder.getBoundingClientRect === 'function'
        ? placeholder.getBoundingClientRect()
        : el.getBoundingClientRect();
    const hostRectRaw = hostInfo.body && typeof hostInfo.body.getBoundingClientRect === 'function'
        ? hostInfo.body.getBoundingClientRect()
        : (hostInfo.container && typeof hostInfo.container.getBoundingClientRect === 'function'
            ? hostInfo.container.getBoundingClientRect()
            : null);
    const anchorSnapshot = placeholderRect
        ? {
            left: placeholderRect.left,
            top: placeholderRect.top,
            width: placeholderRect.width,
            height: placeholderRect.height,
            right: placeholderRect.right != null ? placeholderRect.right : (placeholderRect.left + placeholderRect.width),
            bottom: placeholderRect.bottom != null ? placeholderRect.bottom : (placeholderRect.top + placeholderRect.height)
        }
        : null;
    const hostRect = hostRectRaw
        ? {
            left: hostRectRaw.left,
            top: hostRectRaw.top,
            width: hostRectRaw.width,
            height: hostRectRaw.height,
            right: hostRectRaw.right != null ? hostRectRaw.right : (hostRectRaw.left + hostRectRaw.width),
            bottom: hostRectRaw.bottom != null ? hostRectRaw.bottom : (hostRectRaw.top + hostRectRaw.height)
        }
        : null;
    const offsetFromHost = (anchorSnapshot && hostRect)
        ? {
            x: anchorSnapshot.left - hostRect.left,
            y: anchorSnapshot.top - hostRect.top
        }
        : { x: 0, y: 0 };
    const width = Math.max(1, (anchorSnapshot && anchorSnapshot.width) || el.offsetWidth || resolveItemSizePx());
    const rawHeight = Math.max(1, (anchorSnapshot && anchorSnapshot.height) || el.offsetHeight || resolveItemSizePx());
    const targetHeight = Math.max(1, rawHeight / 2);
    const satelliteId = ensureFloatingElementId(el, hostInfo);
    if (!satelliteId) return null;

    if (el.parentElement) {
        try { el.parentElement.removeChild(el); } catch (_) { }
    }
    if (typeof document !== 'undefined' && document.body && el.parentElement !== document.body) {
        try { document.body.appendChild(el); } catch (_) { }
    }

    if (el.dataset) {
        el.dataset.floatingHostId = hostInfo.id;
        el.dataset.floatingSatellite = 'true';
        el.dataset.sourcePalette = nameKey;
        el.dataset.floatingNameKey = nameKey;
        el.dataset.floatingSatelliteId = satelliteId;
        if (paletteTitle) {
            el.dataset.floatingPaletteTitle = paletteTitle;
        } else if (el.dataset.floatingPaletteTitle) {
            delete el.dataset.floatingPaletteTitle;
        }
    }

    const themeRef = hostInfo && hostInfo.theme ? hostInfo.theme : currentTheme;
    const childrenSnapshot = Array.isArray(options.children) ? options.children.slice() : [];
    const targetPos = computeExtractedPaletteTarget(anchorSnapshot || hostRect, hostRect, width, targetHeight, themeRef);
    const left = targetPos.left;
    const top = targetPos.top;

    el.style.position = 'fixed';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${targetHeight}px`;
    el.style.margin = '0';
    el.style.zIndex = '10000004';
    el.style.visibility = 'visible';
    el.style.opacity = '1';
    el.style.transform = 'translate3d(0,0,0)';

    setLabelCentered(el, true);
    setPaletteVisualState(el, true);

    const satelliteState = {
        type: 'element',
        id: satelliteId,
        el,
        hostId: hostInfo.id,
        nameKey,
        paletteTitle: paletteTitle || null,
        width,
        height: targetHeight,
        anchor: anchorSnapshot,
        offsetFromHost,
        top,
        left
    };

    const persistenceRecord = persistFloatingSatelliteRecord(hostInfo, nameKey, themeRef, {
        paletteTitle: paletteTitle || null,
        children: childrenSnapshot,
        position: {
            left,
            top
        }
    });
    if (persistenceRecord) {
        satelliteState.persistence = persistenceRecord;
        satelliteState.orientation = persistenceRecord.orientation;
        satelliteState.toolboxOffsetMain = persistenceRecord.toolboxOffsetMain;
        satelliteState.toolboxOffsetEdge = persistenceRecord.toolboxOffsetEdge;
    } else {
        satelliteState.orientation = resolveOrientationValue(themeRef);
        satelliteState.toolboxOffsetMain = normalizeOffsetToNumber(themeRef && themeRef.toolboxOffsetMain);
        satelliteState.toolboxOffsetEdge = normalizeOffsetToNumber(themeRef && themeRef.toolboxOffsetEdge);
    }

    return satelliteState;
}

function handlePaletteClick(el, cfg) {
    if (isEditModeActive()) return;
    if (el && el.dataset && el.dataset.floating === 'true') {
        handleFloatingPaletteClick(el, cfg);
        return;
    }

    // Exclusif: ramener l'ancien palette si présent
    const wasActive = handlePaletteClick.active && handlePaletteClick.active.el === el;
    el.style.height = parseFloat(currentTheme.item_size) / 2 + 'px';

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

    // Calculer la cible externe en réutilisant la même logique que le menu principal
    const elW = el.offsetWidth;
    const elH = el.offsetHeight;
    const targetPos = computeExtractedPaletteTarget(phRect, supportRect, elW, elH, currentTheme);
    const targetLeft = targetPos.left;
    const targetTop = targetPos.top;
    const key = (el && el.dataset && el.dataset.nameKey) || (cfg && cfg.nameKey) || ((cfg && cfg.id) ? String(cfg.id).replace(/^_intuition_/, '') : '');
    const desc = intuition_content[key];

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

    if (key) {
        const extractedMeta = {
            reference: 'toolbox',
            content: {
                key,
                title: (desc && desc.label) || key,
                children: Array.isArray(desc && desc.children) ? desc.children.slice() : []
            },
            orientation: resolveOrientationValue(currentTheme),
            toolboxOffsetMain: normalizeOffsetToNumber(currentTheme && currentTheme.toolboxOffsetMain),
            toolboxOffsetEdge: normalizeOffsetToNumber(currentTheme && currentTheme.toolboxOffsetEdge),
            position: {
                left: targetLeft,
                top: targetTop
            }
        };

    }

    // Mettre à jour les items restants avec le contenu du palette
    if (desc && Array.isArray(desc.children)) {
        // Push next level into the navigation stack
        menuStack.push({ parent: key, children: desc.children.slice() });
        rebuildSupportWithChildren(desc.children, el.id);
    }
}

function handleFloatingPaletteClick(el, cfg) {
    if (!el) return;
    const nameKey = (el.dataset && el.dataset.nameKey) || (cfg && cfg.nameKey) || ((cfg && cfg.id) ? String(cfg.id).replace(/^_intuition_/, '') : '');
    if (!nameKey) return;
    const def = intuition_content[nameKey];
    if (!def) return;
    const hostInfo = resolveFloatingInfoFromElement(el);
    if (!hostInfo) return;
    if (!(hostInfo.activeSatellites instanceof Map)) {
        hostInfo.activeSatellites = new Map();
    }
    const activeMap = hostInfo.activeSatellites;
    const existingState = activeMap.get(nameKey);
    if (existingState) {
        if (Array.isArray(hostInfo.menuStack) && hostInfo.menuStack.length) {
            const idx = hostInfo.menuStack.findIndex((entry) => entry && entry.parent === nameKey);
            if (idx >= 0) {
                hostInfo.menuStack.splice(idx);
            }
            if (!hostInfo.menuStack.length) {
                ensureFloatingStackRoot(hostInfo);
            }
        }
        const fallbackKeys = getFloatingFallbackKeys(hostInfo);
        disposeFloatingSatelliteState(hostInfo, nameKey, existingState);
        renderFloatingBody(hostInfo, fallbackKeys);
        return;
    }

    const floatingMenuKey = def && def.floatingMenuKey;
    const floatingDef = floatingMenuKey ? intuition_content[floatingMenuKey] : null;
    let children = [];
    let paletteTitle = def.label || nameKey;
    if (floatingDef && Array.isArray(floatingDef.children)) {
        children = floatingDef.children.filter(Boolean);
        if (floatingDef.label) {
            paletteTitle = floatingDef.label;
        }
    }
    if (!children.length) {
        children = Array.isArray(def.children) ? def.children.filter(Boolean) : [];
    }
    if (!children.length) {
        setPaletteVisualState(el, false);
        return;
    }

    ensureFloatingStackRoot(hostInfo);

    const placeholder = document.createElement('div');
    placeholder.id = `${el.id || `${hostInfo.id}__${nameKey}`}__placeholder`;
    placeholder.style.width = `${el.offsetWidth}px`;
    placeholder.style.height = `${el.offsetHeight}px`;
    placeholder.style.flex = '0 0 auto';
    placeholder.style.display = 'inline-block';
    placeholder.style.borderRadius = getComputedStyle(el).borderRadius;
    if (el.parentElement) {
        try { el.parentElement.insertBefore(placeholder, el); } catch (_) { }
    }

    const satelliteState = createFloatingPaletteSatellite(hostInfo, el, nameKey, paletteTitle, placeholder, { children });
    if (!satelliteState) {
        try { placeholder.remove(); } catch (_) { }
        return;
    }

    satelliteState.placeholder = placeholder;
    activeMap.set(nameKey, satelliteState);
    hostInfo.menuStack.push({ parent: nameKey, children: children.slice(), title: paletteTitle });
    renderFloatingBody(hostInfo, children);
}

// Helper to pop out a palette by name without altering the navigation stack
function popOutPaletteByName(name, opts = {}) {
    const supportEl = grab('toolbox_support');
    if (!supportEl || !name) return null;
    const id = `_intuition_${name}`;
    const def = intuition_content[name];
    if (!def || typeof def.type !== 'function') return null;
    const label = def.label || name;
    const icon = Object.prototype.hasOwnProperty.call(def, 'icon') ? def.icon : name;
    let el = grab(id);
    if (!el) {
        const optionalParams = { id, label, icon, nameKey: name, parent: '#toolbox_support' };
        def.type(optionalParams);
        el = grab(id);
        if (!el) return null;
    } else {
        // Ensure dataset carries the logical key
        try { if (el && el.dataset && !el.dataset.nameKey) el.dataset.nameKey = name; } catch (e) { /* ignore */ }
    }
    if (el) {
        try { el.dataset.nameKey = name; } catch (e) { /* ignore */ }
        applyBackdropStyle(el, currentTheme.tool_backDrop_effect);
        setupEditModeDrag(el, { nameKey: name, label, typeName: inferDefinitionType(def) });
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
        const gap = getSatelliteOffset();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const elW = el.offsetWidth;
        const elH = el.offsetHeight;

        if (isHorizontal) {
            const aboveSpace = supportRect.top;
            const belowSpace = vh - supportRect.bottom;
            const preferAbove = !!isBottom;
            let placeAbove = preferAbove;
            if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
            if (!placeAbove && !preferAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
            const targetTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
            const clampedTop = Math.max(0, Math.min(vh - elH, targetTop));
            el.style.top = `${clampedTop}px`;
            const baseLeft = phRect.left;
            const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
            el.style.left = `${clampedLeft}px`;
        } else {
            const leftSpace = supportRect.left;
            const rightSpace = vw - supportRect.right;
            const preferLeft = !!isRight;
            let placeLeft = preferLeft;
            if (placeLeft && leftSpace < elW + gap) placeLeft = false;
            if (!placeLeft && !preferLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
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
                setupEditModeDrag(childEl, { nameKey: name, label, typeName: inferDefinitionType(def) });
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
                setupEditModeDrag(childEl, { nameKey: name, label, typeName: inferDefinitionType(def) });
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
    const gap = getSatelliteOffset();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const elW = state.el.offsetWidth;
    const elH = state.el.offsetHeight;

    if (isHorizontal) {
        const aboveSpace = supportRect.top;
        const belowSpace = vh - supportRect.bottom;
        const preferAbove = !!isBottom;
        let placeAbove = preferAbove;
        if (placeAbove && aboveSpace < elH + gap) placeAbove = false;
        if (!placeAbove && !preferAbove && belowSpace < elH + gap && aboveSpace >= elH + gap) placeAbove = true;
        const targetTop = placeAbove ? (supportRect.top - elH - gap) : (supportRect.bottom + gap);
        const clampedTop = Math.max(0, Math.min(vh - elH, targetTop));
        state.el.style.top = `${clampedTop}px`;
        const baseLeft = phRect.left;
        const clampedLeft = Math.max(0, Math.min(vw - elW, baseLeft));
        state.el.style.left = `${clampedLeft}px`;
    } else {
        const leftSpace = supportRect.left;
        const rightSpace = vw - supportRect.right;
        const preferLeft = !!isRight;
        let placeLeft = preferLeft;
        if (placeLeft && leftSpace < elW + gap) placeLeft = false;
        if (!placeLeft && !preferLeft && rightSpace < elW + gap && leftSpace >= elW + gap) placeLeft = true;
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


function cloneFloatingPosition(position) {
    if (!position || typeof position !== 'object') {
        return { left: null, top: null };
    }
    const left = position.left != null ? normalizeOffsetToNumber(position.left) : null;
    const top = position.top != null ? normalizeOffsetToNumber(position.top) : null;
    return { left, top };
}

function cloneFloatingContent(record, fallbackKey = null, fallbackTitle = null) {
    if (!record || typeof record !== 'object') {
        return {
            key: fallbackKey,
            title: fallbackTitle,
            children: []
        };
    }
    return {
        key: record.key != null ? record.key : fallbackKey,
        title: record.title != null ? record.title : fallbackTitle,
        children: Array.isArray(record.children) ? record.children.slice() : []
    };
}

function cloneFloatingHostRecord(record, fallbackId = null) {
    if (!record || typeof record !== 'object') return null;
    const id = record.id || fallbackId || null;
    const orientation = typeof record.orientation === 'string' && record.orientation
        ? record.orientation
        : 'top_left_horizontal';
    const content = cloneFloatingContent(record.content, record.content && record.content.key || null, record.content && record.content.title || null);
    return {
        id,
        reference: record.reference != null ? record.reference : null,
        orientation,
        toolboxOffsetMain: normalizeOffsetToNumber(record.toolboxOffsetMain),
        toolboxOffsetEdge: normalizeOffsetToNumber(record.toolboxOffsetEdge),
        position: cloneFloatingPosition(record.position),
        content
    };
}

function cloneFloatingSatelliteRecord(record, fallbackKey = null) {
    if (!record || typeof record !== 'object') return null;
    const content = cloneFloatingContent(record.content, fallbackKey, record.content && record.content.title || null);
    if (!content.key) {
        content.key = fallbackKey;
    }
    const orientation = typeof record.orientation === 'string' && record.orientation
        ? record.orientation
        : 'top_left_horizontal';
    return {
        id: record.id || null,
        hostId: record.hostId || null,
        reference: record.reference != null ? record.reference : null,
        orientation,
        toolboxOffsetMain: normalizeOffsetToNumber(record.toolboxOffsetMain),
        toolboxOffsetEdge: normalizeOffsetToNumber(record.toolboxOffsetEdge),
        position: cloneFloatingPosition(record.position),
        content
    };
}

function snapshotFloatingPersistence(hostId) {
    const buildBucketSnapshot = (bucket, id) => {
        if (!bucket || typeof bucket !== 'object') return null;
        const hostRecord = bucket.host ? cloneFloatingHostRecord(bucket.host, id) : null;
        const base = hostRecord ? { ...hostRecord } : { id: id || null };
        const satellitesOut = {};
        if (bucket.satellites instanceof Map) {
            bucket.satellites.forEach((record, key) => {
                const clone = cloneFloatingSatelliteRecord(record, key);
                if (clone && clone.content && clone.content.key) {
                    satellitesOut[clone.content.key] = clone;
                }
            });
        }
        if (Object.keys(satellitesOut).length) {
            base.satellites = satellitesOut;
        }
        if (!hostRecord && !Object.keys(satellitesOut).length) {
            return null;
        }
        if (!base.id) {
            base.id = id || null;
        }
        return base;
    };

    if (hostId) {
        const bucket = getFloatingPersistenceBucket(hostId);
        return clonePlainIntuitionValue(buildBucketSnapshot(bucket, hostId));
    }
    const snapshot = {};
    floatingPersistence.forEach((bucket, id) => {
        const cloned = buildBucketSnapshot(bucket, id);
        if (cloned) {
            snapshot[id] = clonePlainIntuitionValue(cloned);
        }
    });
    return clonePlainIntuitionValue(snapshot);
}

function applyFloatingPersistenceSnapshot(hostId, payload = null) {
    if (!hostId) return;
    const info = floatingRegistry.get(hostId);
    const bucket = ensureFloatingPersistenceBucket(info || { id: hostId });
    if (!bucket) return;
    if (!(bucket.satellites instanceof Map)) {
        bucket.satellites = new Map();
    }
    const store = bucket.satellites;
    store.clear();

    const applySatRecord = (raw, keyHint) => {
        const record = cloneFloatingSatelliteRecord(raw, keyHint);
        if (!record || !record.content || !record.content.key) return;
        store.set(record.content.key, record);
    };

    if (Array.isArray(payload)) {
        payload.forEach((raw) => applySatRecord(raw, null));
    } else if (payload && typeof payload === 'object') {
        if (payload.host) {
            const hostRecord = cloneFloatingHostRecord(payload.host, hostId);
            if (hostRecord) {
                bucket.host = hostRecord;
            }
        }
        const satPayload = payload.satellites;
        if (Array.isArray(satPayload)) {
            satPayload.forEach((raw) => applySatRecord(raw, null));
        } else if (satPayload && typeof satPayload === 'object') {
            Object.keys(satPayload).forEach((key) => {
                applySatRecord(satPayload[key], key);
            });
        }
    }

    if (info) {
        info.persistedExtracted = store;
    }
}

function restoreExtractedFloatingElement(options = {}) {
    const rawPayload = options && (options.content != null ? options.content : options.record);
    if (!rawPayload) return null;

    const ensureBootstrap = () => {
        const root = ensureIntuitionLayerRoot();
        if (root && !bootstrapIntuition._initialized) {
            bootstrapIntuition();
        }
    };

    ensureBootstrap();

    const restoreOne = (entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const hostPayload = entry.host ? entry.host : entry;
        const satPayload = entry.host ? entry.satellites : entry.satellites;
        const hostRecord = cloneFloatingHostRecord(hostPayload, hostPayload && hostPayload.id ? hostPayload.id : null);
        if (!hostRecord) return null;
        const children = Array.isArray(hostRecord.content.children)
            ? hostRecord.content.children.filter(Boolean)
            : [];
        const title = hostRecord.content.title || hostRecord.content.key || 'palette';
        const hostTheme = { ...currentTheme };
        if (hostRecord.orientation) {
            hostTheme.direction = hostRecord.orientation;
        }
        const sourceKey = hostRecord.content && hostRecord.content.key ? hostRecord.content.key : null;
        let icon = sourceKey || undefined;
        let iconColor;
        let iconTop;
        let iconLeft;
        let iconSize;
        if (sourceKey) {
            const def = intuition_content[sourceKey];
            if (def && typeof def === 'object') {
                if (Object.prototype.hasOwnProperty.call(def, 'icon')) {
                    icon = def.icon;
                }
                iconColor = def.icon_color || def.iconColor;
                iconTop = def.icon_top || def.iconTop;
                iconLeft = def.icon_left || def.iconLeft;
                iconSize = def.icon_size || def.iconSize;
            }
        }
        const info = createFloatingHost({
            id: hostRecord.id || undefined,
            title,
            type: 'palette',
            role: 'palette',
            reference: hostRecord.reference || 'toolbox',
            theme: hostTheme,
            initialChildren: children,
            sourcePalette: sourceKey,
            icon,
            iconColor,
            iconTop,
            iconLeft,
            iconSize
        });
        if (!info) return null;

        info.rootChildren = children.slice();
        info.menuStack = [{ parent: hostRecord.content.key || null, children: info.rootChildren.slice(), title }];
        renderFloatingBody(info, info.rootChildren);

        ensureFloatingHostRecord(info, hostTheme, {
            reference: hostRecord.reference || 'toolbox',
            position: hostRecord.position,
            content: {
                key: hostRecord.content.key || null,
                title,
                children: info.rootChildren.slice()
            }
        });

        if (hostRecord.position && (hostRecord.position.left != null || hostRecord.position.top != null)) {
            const baseLeft = info.container && typeof info.container.style.left === 'string'
                ? normalizeOffsetToNumber(parseFloat(info.container.style.left))
                : 0;
            const baseTop = info.container && typeof info.container.style.top === 'string'
                ? normalizeOffsetToNumber(parseFloat(info.container.style.top))
                : 0;
            const left = hostRecord.position.left != null ? normalizeOffsetToNumber(hostRecord.position.left) : baseLeft;
            const top = hostRecord.position.top != null ? normalizeOffsetToNumber(hostRecord.position.top) : baseTop;
            moveFloatingTo(info, left, top);
            hostRecord.position = { left, top };
        }
        clampFloatingToViewport(info);

        hostRecord.id = info.id;

        const satellitesPayload = {};
        if (satPayload && typeof satPayload === 'object') {
            Object.keys(satPayload).forEach((key) => {
                const satRecord = cloneFloatingSatelliteRecord(satPayload[key], key);
                if (satRecord && satRecord.content && satRecord.content.key) {
                    satellitesPayload[satRecord.content.key] = satRecord;
                }
            });
        }

        applyFloatingPersistenceSnapshot(info.id, {
            host: hostRecord,
            satellites: satellitesPayload
        });

        return info;
    };

    if (Array.isArray(rawPayload)) {
        return rawPayload.map((entry) => restoreOne(entry)).filter(Boolean);
    }
    if (rawPayload && typeof rawPayload === 'object' && !rawPayload.id && !rawPayload.host && !rawPayload.content && !rawPayload.reference && !rawPayload.toolboxOffsetMain && !rawPayload.toolboxOffsetEdge && !rawPayload.position) {
        const restored = [];
        Object.keys(rawPayload).forEach((key) => {
            const entry = rawPayload[key];
            if (!entry) return;
            const composite = entry && entry.host ? entry : { ...entry, id: entry.id || key };
            if (!composite.id) composite.id = key;
            const info = restoreOne(composite);
            if (info) {
                restored.push(info);
            }
        });
        return restored;
    }
    return restoreOne(rawPayload);
}

window.getFloatingPalettePersistenceSnapshot = function getFloatingPalettePersistenceSnapshot(hostId) {
    return snapshotFloatingPersistence(hostId);
};

window.setFloatingPalettePersistenceSnapshot = function setFloatingPalettePersistenceSnapshot(hostId, records = []) {
    if (typeof hostId === 'object' && hostId !== null && !Array.isArray(hostId)) {
        const snapshot = hostId;
        Object.keys(snapshot).forEach((id) => {
            applyFloatingPersistenceSnapshot(id, snapshot[id]);
        });
        return;
    }
    applyFloatingPersistenceSnapshot(hostId, records);
};

window.clearFloatingPalettePersistenceSnapshot = function clearFloatingPalettePersistenceSnapshot(hostId) {
    if (hostId) {
        clearPersistedFloatingSatelliteStore(hostId);
    } else {
        floatingPersistence.clear();
        floatingRegistry.forEach((info) => {
            if (info && info.persistedExtracted instanceof Map) {
                info.persistedExtracted.clear();
            }
        });
    }
};

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

function mergeContentOption(contentOption) {
    if (!contentOption || typeof contentOption !== 'object') return;
    if (contentOption.version !== undefined) {
        intuition_content.version = contentOption.version;
    }
    if (contentOption.meta !== undefined) {
        const metaSnapshot = clonePlainIntuitionValue(contentOption.meta);
        if (!intuition_content.meta || typeof intuition_content.meta !== 'object') {
            intuition_content.meta = metaSnapshot;
        } else {
            Object.assign(intuition_content.meta, metaSnapshot);
        }
    }
    Object.keys(contentOption).forEach((key) => {
        if (key === 'version' || key === 'meta') return;
        intuition_content[key] = normalizeContentEntry(contentOption[key]);
    });
}

const Intuition = function Intuition(options = {}) {
    if (options && options.type === 'extract') {
        return restoreExtractedFloatingElement(options);
    }
    const intuitionRoot = ensureIntuitionLayerRoot();
    const shouldBootstrap = intuitionRoot && !bootstrapIntuition._initialized;
    const mergeContent = options && (options.merge === true || options.mergeContent === true);
    applyThemeOption(options.theme);
    if (options.content) {
        if (mergeContent) {
            mergeContentOption(options.content);
        } else {
            applyContentOption(options.content);
        }
    }
    const requestedDirection = options && (options.orientation || options.direction);
    if (requestedDirection && !mergeContent) {
        window.setDirection(requestedDirection);
    } else if (requestedDirection && mergeContent) {
        currentTheme.direction = String(requestedDirection).toLowerCase();
    }
    if (!mergeContent && typeof options.open === 'boolean') {
        if (options.open) {
            openMenu('toolbox');
        } else {
            closeMenu();
        }
    }
    if (!mergeContent) {
        if (shouldBootstrap) {
            bootstrapIntuition();
        } else if (intuitionRoot) {
            apply_layout();
        }
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


