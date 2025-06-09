/**
 * 🛠️ SHARED UTILITIES - Common functions for Matrix, Module, Slider
 * Eliminates code duplication and improves maintainability
 */

import { DOMCache } from './dom-cache.js';
import { EventManager } from './event-manager.js';

/**
 * 🎯 DRAG & DROP UTILITIES
 */
export class DragDropUtil {
    constructor(options = {}) {
        this.config = {
            threshold: 5,
            ghostOpacity: 0.5,
            snapDistance: 10,
            animationDuration: 300,
            ...options
        };
        this.eventManager = new EventManager();
        this.dragState = null;
    }

    /**
     * Make element draggable
     */
    makeDraggable(element, options = {}) {
        const config = { ...this.config, ...options };
        
        element.draggable = true;
        element.style.cursor = 'grab';
        
        const handleDragStart = (e) => {
            this.dragState = {
                element,
                startX: e.clientX,
                startY: e.clientY,
                offsetX: e.offsetX,
                offsetY: e.offsetY,
                config
            };
            
            element.style.cursor = 'grabbing';
            
            // Create ghost element
            if (config.createGhost !== false) {
                this._createGhost(element, e);
            }
            
            // Store drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', element.outerHTML);
            e.dataTransfer.setData('text/plain', element.id || '');
            
            if (config.onDragStart) {
                config.onDragStart(e, element);
            }
        };
        
        const handleDragEnd = (e) => {
            element.style.cursor = 'grab';
            this._removeGhost();
            
            if (config.onDragEnd) {
                config.onDragEnd(e, element);
            }
            
            this.dragState = null;
        };
        
        this.eventManager.on(element, 'dragstart', handleDragStart);
        this.eventManager.on(element, 'dragend', handleDragEnd);
        
        return () => {
            this.eventManager.off(element, 'dragstart', handleDragStart);
            this.eventManager.off(element, 'dragend', handleDragEnd);
        };
    }

    /**
     * Make element droppable
     */
    makeDroppable(element, options = {}) {
        const config = { ...this.config, ...options };
        
        const handleDragOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            element.classList.add('drag-over');
            
            if (config.onDragOver) {
                config.onDragOver(e, element);
            }
        };
        
        const handleDragLeave = (e) => {
            element.classList.remove('drag-over');
            
            if (config.onDragLeave) {
                config.onDragLeave(e, element);
            }
        };
        
        const handleDrop = (e) => {
            e.preventDefault();
            element.classList.remove('drag-over');
            
            const data = {
                html: e.dataTransfer.getData('text/html'),
                text: e.dataTransfer.getData('text/plain'),
                draggedElement: this.dragState?.element
            };
            
            if (config.onDrop) {
                config.onDrop(e, element, data);
            }
        };
        
        this.eventManager.on(element, 'dragover', handleDragOver);
        this.eventManager.on(element, 'dragleave', handleDragLeave);
        this.eventManager.on(element, 'drop', handleDrop);
        
        return () => {
            this.eventManager.off(element, 'dragover', handleDragOver);
            this.eventManager.off(element, 'dragleave', handleDragLeave);
            this.eventManager.off(element, 'drop', handleDrop);
        };
    }

    _createGhost(element, e) {
        const ghost = element.cloneNode(true);
        ghost.style.position = 'fixed';
        ghost.style.opacity = this.config.ghostOpacity;
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '9999';
        ghost.classList.add('drag-ghost');
        
        document.body.appendChild(ghost);
        this.ghostElement = ghost;
        
        this._updateGhostPosition(e);
    }

    _updateGhostPosition(e) {
        if (this.ghostElement) {
            this.ghostElement.style.left = (e.clientX - this.dragState.offsetX) + 'px';
            this.ghostElement.style.top = (e.clientY - this.dragState.offsetY) + 'px';
        }
    }

    _removeGhost() {
        if (this.ghostElement) {
            this.ghostElement.remove();
            this.ghostElement = null;
        }
    }

    destroy() {
        this.eventManager.destroy();
        this._removeGhost();
    }
}

/**
 * 🎯 RESIZE UTILITIES
 */
export class ResizeUtil {
    constructor(options = {}) {
        this.config = {
            minWidth: 50,
            minHeight: 50,
            handles: ['se'], // southeast corner by default
            snapToGrid: false,
            gridSize: 10,
            preserveAspectRatio: false,
            ...options
        };
        this.eventManager = new EventManager();
        this.resizeState = null;
    }

    /**
     * Make element resizable
     */
    makeResizable(element, options = {}) {
        const config = { ...this.config, ...options };
        
        this._createResizeHandles(element, config);
        
        return () => {
            this._removeResizeHandles(element);
        };
    }

    _createResizeHandles(element, config) {
        config.handles.forEach(handle => {
            const handleElement = document.createElement('div');
            handleElement.className = `resize-handle resize-${handle}`;
            handleElement.style.cssText = this._getHandleStyles(handle);
            
            element.appendChild(handleElement);
            element.style.position = 'relative';
            
            this._attachResizeEvents(handleElement, element, handle, config);
        });
    }

    _getHandleStyles(handle) {
        const baseStyles = `
            position: absolute;
            background: #007acc;
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: auto;
        `;
        
        const styles = {
            se: `${baseStyles} bottom: -3px; right: -3px; width: 10px; height: 10px; cursor: se-resize;`,
            sw: `${baseStyles} bottom: -3px; left: -3px; width: 10px; height: 10px; cursor: sw-resize;`,
            ne: `${baseStyles} top: -3px; right: -3px; width: 10px; height: 10px; cursor: ne-resize;`,
            nw: `${baseStyles} top: -3px; left: -3px; width: 10px; height: 10px; cursor: nw-resize;`,
            n: `${baseStyles} top: -3px; left: 50%; width: 10px; height: 6px; margin-left: -5px; cursor: n-resize;`,
            s: `${baseStyles} bottom: -3px; left: 50%; width: 10px; height: 6px; margin-left: -5px; cursor: s-resize;`,
            e: `${baseStyles} top: 50%; right: -3px; width: 6px; height: 10px; margin-top: -5px; cursor: e-resize;`,
            w: `${baseStyles} top: 50%; left: -3px; width: 6px; height: 10px; margin-top: -5px; cursor: w-resize;`
        };
        
        return styles[handle] || styles.se;
    }

    _attachResizeEvents(handle, element, direction, config) {
        let isResizing = false;
        let startX, startY, startWidth, startHeight, startLeft, startTop;
        
        const handleMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = element.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;
            
            document.body.style.userSelect = 'none';
            element.classList.add('resizing');
            
            if (config.onResizeStart) {
                config.onResizeStart(e, element);
            }
        };
        
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;
            
            // Calculate new dimensions based on handle direction
            if (direction.includes('e')) newWidth += deltaX;
            if (direction.includes('w')) { newWidth -= deltaX; newLeft += deltaX; }
            if (direction.includes('s')) newHeight += deltaY;
            if (direction.includes('n')) { newHeight -= deltaY; newTop += deltaY; }
            
            // Apply constraints
            newWidth = Math.max(config.minWidth, newWidth);
            newHeight = Math.max(config.minHeight, newHeight);
            
            if (config.maxWidth) newWidth = Math.min(config.maxWidth, newWidth);
            if (config.maxHeight) newHeight = Math.min(config.maxHeight, newHeight);
            
            // Preserve aspect ratio if needed
            if (config.preserveAspectRatio) {
                const aspectRatio = startWidth / startHeight;
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    newHeight = newWidth / aspectRatio;
                } else {
                    newWidth = newHeight * aspectRatio;
                }
            }
            
            // Snap to grid
            if (config.snapToGrid) {
                newWidth = Math.round(newWidth / config.gridSize) * config.gridSize;
                newHeight = Math.round(newHeight / config.gridSize) * config.gridSize;
            }
            
            // Apply new dimensions
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            
            if (config.onResize) {
                config.onResize(e, element, { width: newWidth, height: newHeight });
            }
        };
        
        const handleMouseUp = (e) => {
            if (!isResizing) return;
            
            isResizing = false;
            document.body.style.userSelect = '';
            element.classList.remove('resizing');
            
            if (config.onResizeEnd) {
                config.onResizeEnd(e, element);
            }
        };
        
        this.eventManager.on(handle, 'mousedown', handleMouseDown);
        this.eventManager.on(document, 'mousemove', handleMouseMove);
        this.eventManager.on(document, 'mouseup', handleMouseUp);
        
        // Show handles on hover
        this.eventManager.on(element, 'mouseenter', () => {
            handle.style.opacity = '1';
        });
        
        this.eventManager.on(element, 'mouseleave', () => {
            handle.style.opacity = '0';
        });
    }

    _removeResizeHandles(element) {
        const handles = element.querySelectorAll('.resize-handle');
        handles.forEach(handle => handle.remove());
    }

    destroy() {
        this.eventManager.destroy();
    }
}

/**
 * 🎯 GRID UTILITIES
 */
export class GridUtil {
    constructor(options = {}) {
        this.config = {
            cellSize: 20,
            snapThreshold: 10,
            showGrid: false,
            gridColor: '#e0e0e0',
            ...options
        };
        this.domCache = new DOMCache();
    }

    /**
     * Create grid overlay
     */
    createGrid(container, options = {}) {
        const config = { ...this.config, ...options };
        
        if (!config.showGrid) return null;
        
        const grid = document.createElement('div');
        grid.className = 'grid-overlay';
        grid.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            background-image: 
                linear-gradient(to right, ${config.gridColor} 1px, transparent 1px),
                linear-gradient(to bottom, ${config.gridColor} 1px, transparent 1px);
            background-size: ${config.cellSize}px ${config.cellSize}px;
        `;
        
        container.appendChild(grid);
        return grid;
    }

    /**
     * Snap coordinates to grid
     */
    snapToGrid(x, y, options = {}) {
        const config = { ...this.config, ...options };
        
        const snappedX = Math.round(x / config.cellSize) * config.cellSize;
        const snappedY = Math.round(y / config.cellSize) * config.cellSize;
        
        // Only snap if within threshold
        const deltaX = Math.abs(x - snappedX);
        const deltaY = Math.abs(y - snappedY);
        
        return {
            x: deltaX <= config.snapThreshold ? snappedX : x,
            y: deltaY <= config.snapThreshold ? snappedY : y,
            snapped: deltaX <= config.snapThreshold || deltaY <= config.snapThreshold
        };
    }

    /**
     * Get grid cell at coordinates
     */
    getCellAt(x, y, options = {}) {
        const config = { ...this.config, ...options };
        
        return {
            col: Math.floor(x / config.cellSize),
            row: Math.floor(y / config.cellSize)
        };
    }

    /**
     * Get coordinates from grid cell
     */
    getCellCoords(col, row, options = {}) {
        const config = { ...this.config, ...options };
        
        return {
            x: col * config.cellSize,
            y: row * config.cellSize
        };
    }
}

/**
 * 🎯 ANIMATION UTILITIES
 */
export class AnimationUtil {
    static easing = {
        easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        easeIn: (t) => t * t,
        easeOut: (t) => t * (2 - t),
        bounce: (t) => {
            const n1 = 7.5625;
            const d1 = 2.75;
            
            if (t < 1 / d1) return n1 * t * t;
            if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
            if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    };

    /**
     * Animate element properties
     */
    static animate(element, properties, options = {}) {
        const {
            duration = 300,
            easing = 'easeInOut',
            delay = 0,
            onComplete,
            onUpdate
        } = options;

        const startTime = performance.now() + delay;
        const startValues = {};
        const targetValues = {};

        // Get initial values
        for (const prop in properties) {
            const currentValue = this._getCurrentValue(element, prop);
            startValues[prop] = currentValue;
            targetValues[prop] = properties[prop];
        }

        const easingFn = typeof easing === 'string' ? this.easing[easing] : easing;

        const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            
            if (elapsed < 0) {
                requestAnimationFrame(step);
                return;
            }

            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easingFn(progress);

            // Update properties
            for (const prop in properties) {
                const start = startValues[prop];
                const target = targetValues[prop];
                const current = start + (target - start) * easedProgress;
                
                this._setCurrentValue(element, prop, current);
            }

            if (onUpdate) {
                onUpdate(progress, easedProgress);
            }

            if (progress < 1) {
                requestAnimationFrame(step);
            } else if (onComplete) {
                onComplete();
            }
        };

        requestAnimationFrame(step);
    }

    static _getCurrentValue(element, property) {
        if (property === 'opacity') {
            return parseFloat(getComputedStyle(element).opacity) || 1;
        }
        if (property.includes('translate')) {
            const transform = getComputedStyle(element).transform;
            if (transform === 'none') return 0;
            // Parse matrix values - simplified
            const matrix = transform.match(/matrix.*\((.+)\)/);
            if (matrix) {
                const values = matrix[1].split(', ');
                return property === 'translateX' ? parseFloat(values[4]) : parseFloat(values[5]);
            }
        }
        return parseFloat(getComputedStyle(element)[property]) || 0;
    }

    static _setCurrentValue(element, property, value) {
        if (property === 'opacity') {
            element.style.opacity = value;
        } else if (property === 'translateX') {
            element.style.transform = `translateX(${value}px)`;
        } else if (property === 'translateY') {
            element.style.transform = `translateY(${value}px)`;
        } else {
            element.style[property] = typeof value === 'number' ? value + 'px' : value;
        }
    }
}

/**
 * 🎯 SELECTION UTILITIES
 */
export class SelectionUtil {
    constructor(options = {}) {
        this.config = {
            multiSelect: true,
            selectClass: 'selected',
            selectOnClick: true,
            clearOnOutsideClick: true,
            ...options
        };
        this.selected = new Set();
        this.eventManager = new EventManager();
        this.container = null;
    }

    /**
     * Initialize selection for container
     */
    init(container, options = {}) {
        this.container = container;
        this.config = { ...this.config, ...options };
        
        if (this.config.selectOnClick) {
            this.eventManager.on(container, 'click', this._handleClick.bind(this));
        }
        
        if (this.config.clearOnOutsideClick) {
            this.eventManager.on(document, 'click', this._handleOutsideClick.bind(this));
        }
        
        // Keyboard support
        this.eventManager.on(document, 'keydown', this._handleKeyDown.bind(this));
    }

    /**
     * Select element
     */
    select(element, options = {}) {
        const { toggle = false, add = this.config.multiSelect } = options;
        
        if (toggle && this.isSelected(element)) {
            this.deselect(element);
            return;
        }
        
        if (!add) {
            this.clearSelection();
        }
        
        this.selected.add(element);
        element.classList.add(this.config.selectClass);
        
        this._dispatchEvent('select', { element, selected: this.getSelected() });
    }

    /**
     * Deselect element
     */
    deselect(element) {
        this.selected.delete(element);
        element.classList.remove(this.config.selectClass);
        
        this._dispatchEvent('deselect', { element, selected: this.getSelected() });
    }

    /**
     * Clear all selection
     */
    clearSelection() {
        this.selected.forEach(element => {
            element.classList.remove(this.config.selectClass);
        });
        this.selected.clear();
        
        this._dispatchEvent('clearSelection', { selected: [] });
    }

    /**
     * Check if element is selected
     */
    isSelected(element) {
        return this.selected.has(element);
    }

    /**
     * Get selected elements
     */
    getSelected() {
        return Array.from(this.selected);
    }

    /**
     * Select all selectable elements
     */
    selectAll(selector = '*') {
        if (!this.container) return;
        
        const elements = this.container.querySelectorAll(selector);
        elements.forEach(element => {
            if (this._isSelectable(element)) {
                this.select(element, { add: true });
            }
        });
    }

    _handleClick(e) {
        const element = e.target.closest('[data-selectable], .selectable');
        if (!element || !this._isSelectable(element)) return;
        
        e.stopPropagation();
        
        const isMulti = e.ctrlKey || e.metaKey;
        this.select(element, { 
            toggle: isMulti, 
            add: isMulti 
        });
    }

    _handleOutsideClick(e) {
        if (!this.container?.contains(e.target)) {
            this.clearSelection();
        }
    }

    _handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.clearSelection();
        } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            this.selectAll();
        }
    }

    _isSelectable(element) {
        return element.hasAttribute('data-selectable') || 
               element.classList.contains('selectable') ||
               (this.config.selector && element.matches(this.config.selector));
    }

    _dispatchEvent(type, detail) {
        if (this.container) {
            this.container.dispatchEvent(new CustomEvent(type, { detail }));
        }
    }

    destroy() {
        this.clearSelection();
        this.eventManager.destroy();
    }
}

/**
 * 🎯 COMPONENT BASE CLASS
 */
export class ComponentBase {
    constructor(element, options = {}) {
        this.element = element;
        this.config = { ...this.constructor.defaultConfig, ...options };
        this.eventManager = new EventManager();
        this.domCache = new DOMCache();
        this.destroyed = false;
        
        this.init();
    }

    init() {
        // Override in subclass
    }

    destroy() {
        if (this.destroyed) return;
        
        this.eventManager.destroy();
        this.domCache.clear();
        this.destroyed = true;
    }

    static defaultConfig = {};
}

export { DOMCache, EventManager };
