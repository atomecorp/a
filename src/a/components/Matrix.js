/**
 * 🔲 Matrix Web Component - Squirrel Framework
 * 
 * Modern Web Component avec support complet des propriétés CSS avancées:
 * - Multiple shadows (boxShadow arrays) pour effets relief
 * - CSS gradients pour backgrounds sophistiqués
 * - Animations avancées avec changements de taille au toucher
 * - Auto-attachment et positioning
 * - Propriétés CSS personnalisées pour chaque élément
 * - Effets bombé avec ombres internes/externes
 * 
 * @version 2.0.0 - WEB COMPONENT
 * @author Squirrel Framework Team
 */

class Matrix extends HTMLElement {
    static matrices = new Map(); // Registry of all matrices
    static resizeObserver = null; // Global resize observer
    
    constructor(config = {}) {
        super();
        
        // Configuration avancée avec propriétés CSS complètes
        this.config = this.mergeConfig(config);
        
        this.id = this.config.id;
        this.cells = new Map(); // Stockage des cellules
        this.selectedCells = new Set(); // Cellules sélectionnées
        this.hoveredCell = null; // Cellule survolée
        
        // Create shadow DOM pour encapsulation
        this.attachShadow({ mode: 'open' });
        
        this._createMatrix();
        this._setupEventHandlers();
        
        // Auto-attachment si spécifié
        if (this.config.attach) {
            this.performAutoAttach();
        }
        
        // Apply positioning
        this.applyPositioning();
        
        // Register matrix
        Matrix.matrices.set(this.id, this);
        
        console.log(`🔲 Matrix Web Component created: ${this.id} (${this.config.grid.x}x${this.config.grid.y})`);
    }
    
    mergeConfig(config) {
        const defaultConfig = {
            id: `matrix_${Date.now()}`,
            attach: null,
            x: undefined,
            y: undefined,
            
            // Grid dimensions
            grid: {
                x: 3,
                y: 3
            },
            
            // Size
            size: {
                width: 400,
                height: 400
            },
            
            // Spacing avancé
            spacing: {
                horizontal: 4,
                vertical: 4,
                outer: 8
            },
            
            // Style du container avec effet relief
            containerStyle: {
                backgroundColor: '#ffffff',
                border: '2px solid #e0e0e0',
                borderRadius: '16px',
                padding: '16px',
                // Multiple shadows pour effet relief du container
                boxShadow: [
                    '0 8px 24px rgba(0, 0, 0, 0.12)', // Ombre externe pour élévation
                    'inset 0 2px 4px rgba(255, 255, 255, 0.8)', // Highlight interne
                    'inset 0 -2px 4px rgba(0, 0, 0, 0.1)' // Ombre interne pour depth
                ],
                background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 50%, #ffffff 100%)',
                fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            },
            
            // Style des cellules avec effet bombé
            cellStyle: {
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: '500',
                color: '#495057',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                userSelect: 'none',
                // Effet bombé avec ombres multiples
                boxShadow: [
                    '0 2px 8px rgba(0, 0, 0, 0.08)', // Ombre externe subtile
                    'inset 0 1px 0 rgba(255, 255, 255, 0.8)', // Highlight interne
                    'inset 0 -1px 0 rgba(0, 0, 0, 0.05)' // Ombre interne subtile
                ],
                background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)'
            },
            
            // Style au survol avec animation de taille
            cellHoverStyle: {
                backgroundColor: '#e3f2fd',
                color: '#1976d2',
                // Changement de taille animé
                transform: 'scale(1.05) translateZ(0)',
                borderColor: '#2196f3',
                // Effet relief prononcé au survol
                boxShadow: [
                    '0 12px 28px rgba(33, 150, 243, 0.15)', // Ombre externe colorée
                    '0 4px 12px rgba(33, 150, 243, 0.1)',
                    'inset 0 2px 4px rgba(255, 255, 255, 0.9)', // Highlight interne fort
                    'inset 0 -2px 4px rgba(33, 150, 243, 0.1)' // Ombre interne colorée
                ],
                background: 'linear-gradient(145deg, #e3f2fd 0%, #bbdefb 50%, #e3f2fd 100%)'
            },
            
            // Style des cellules sélectionnées
            cellSelectedStyle: {
                backgroundColor: '#1976d2',
                color: '#ffffff',
                borderColor: '#0d47a1',
                // Taille agrandie pour l'état sélectionné
                transform: 'scale(1.08) translateZ(0)',
                // Effet relief fort avec couleur
                boxShadow: [
                    '0 16px 32px rgba(25, 118, 210, 0.25)', // Ombre externe forte
                    '0 6px 16px rgba(25, 118, 210, 0.15)',
                    'inset 0 2px 6px rgba(255, 255, 255, 0.3)', // Highlight interne
                    'inset 0 -2px 6px rgba(13, 71, 161, 0.3)' // Ombre interne forte
                ],
                background: 'linear-gradient(145deg, #2196f3 0%, #1976d2 50%, #1565c0 100%)'
            },
            
            // Style des cellules actives (touch/click)
            cellActiveStyle: {
                // Animation d'impulsion au touch
                transform: 'scale(1.12) translateZ(0)',
                boxShadow: [
                    '0 20px 40px rgba(25, 118, 210, 0.3)',
                    'inset 0 3px 8px rgba(255, 255, 255, 0.4)',
                    'inset 0 -3px 8px rgba(13, 71, 161, 0.4)'
                ]
            },
            
            // Configuration des animations
            animations: {
                cellHover: {
                    duration: '0.3s',
                    easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' // Bounce effect
                },
                cellSelect: {
                    duration: '0.4s',
                    easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' // Back effect
                },
                cellActive: {
                    duration: '0.2s',
                    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // Ease out
                }
            },
            
            // Callbacks interactifs
            callbacks: {
                onCellClick: () => {},
                onCellDoubleClick: () => {},
                onCellLongClick: () => {},
                onCellHover: () => {},
                onCellLeave: () => {},
                onCellTouch: () => {},
                onSelectionChange: () => {},
                onMatrixResize: () => {}
            }
        };
        
        // Deep merge avec configuration utilisateur
        return {
            ...defaultConfig,
            ...config,
            x: config.x !== undefined ? config.x : defaultConfig.x,
            y: config.y !== undefined ? config.y : defaultConfig.y,
            grid: { ...defaultConfig.grid, ...config.grid },
            size: { ...defaultConfig.size, ...config.size },
            spacing: { ...defaultConfig.spacing, ...config.spacing },
            containerStyle: { ...defaultConfig.containerStyle, ...config.containerStyle },
            cellStyle: { ...defaultConfig.cellStyle, ...config.cellStyle },
            cellHoverStyle: { ...defaultConfig.cellHoverStyle, ...config.cellHoverStyle },
            cellSelectedStyle: { ...defaultConfig.cellSelectedStyle, ...config.cellSelectedStyle },
            cellActiveStyle: { ...defaultConfig.cellActiveStyle, ...config.cellActiveStyle },
            animations: { ...defaultConfig.animations, ...config.animations },
            callbacks: { ...defaultConfig.callbacks, ...config.callbacks }
        };
    }
    
    performAutoAttach() {
        if (!this.config.attach) return;
        
        this._doAttach();
    }
    
    _doAttach() {
        let container;
        
        if (this.config.attach === 'body') {
            container = document.body;
        } else if (typeof this.config.attach === 'string') {
            container = document.querySelector(this.config.attach);
        } else if (this.config.attach instanceof HTMLElement) {
            container = this.config.attach;
        }
        
        if (container && !this.parentElement) {
            container.appendChild(this);
        }
    }
    
    applyPositioning() {
        if (this.config.x !== undefined && this.config.y !== undefined) {
            this.style.position = 'absolute';
            this.style.left = `${this.config.x}px`;
            this.style.top = `${this.config.y}px`;
            this.style.width = `${this.config.size.width}px`;
            this.style.height = `${this.config.size.height}px`;
        } else {
            this.style.width = `${this.config.size.width}px`;
            this.style.height = `${this.config.size.height}px`;
        }
    }
    
    _createMatrix() {
        // Create styles pour shadow DOM
        const styles = this._generateStyles();
        
        // Create container principal
        this.container = document.createElement('div');
        this.container.className = 'matrix-container';
        this.container.id = this.id;
        
        // Create grid container
        this.gridContainer = document.createElement('div');
        this.gridContainer.className = 'matrix-grid';
        
        // Generate cells
        this._generateCells();
        
        this.container.appendChild(this.gridContainer);
        
        // Append to shadow DOM
        this.shadowRoot.appendChild(styles);
        this.shadowRoot.appendChild(this.container);
    }
    
    _generateStyles() {
        const style = document.createElement('style');
        
        // Helper function pour gérer les boxShadow multiples
        const formatShadow = (shadow) => {
            if (Array.isArray(shadow)) {
                return shadow.join(', ');
            }
            return shadow || '';
        };
        
        // Helper function pour générer CSS depuis objet style
        const objectToCSS = (obj) => {
            return Object.entries(obj).map(([key, value]) => {
                // Convert camelCase to kebab-case
                const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                
                // Handle special cases
                if (key === 'boxShadow') {
                    value = formatShadow(value);
                }
                
                return `${cssKey}: ${value};`;
            }).join('\\n    ');
        };
        
        style.textContent = `
            .matrix-container {
                ${objectToCSS(this.config.containerStyle)}
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
                position: relative;
                overflow: hidden;
            }
            
            .matrix-grid {
                display: grid;
                grid-template-columns: repeat(${this.config.grid.x}, 1fr);
                grid-template-rows: repeat(${this.config.grid.y}, 1fr);
                gap: ${this.config.spacing.vertical}px ${this.config.spacing.horizontal}px;
                flex: 1;
                padding: ${this.config.spacing.outer}px;
            }
            
            .matrix-cell {
                ${objectToCSS(this.config.cellStyle)}
                position: relative;
                box-sizing: border-box;
                overflow: hidden;
            }
            
            .matrix-cell:hover {
                ${objectToCSS(this.config.cellHoverStyle)}
                animation: cellHover ${this.config.animations.cellHover.duration} ${this.config.animations.cellHover.easing};
            }
            
            .matrix-cell.selected {
                ${objectToCSS(this.config.cellSelectedStyle)}
                animation: cellSelect ${this.config.animations.cellSelect.duration} ${this.config.animations.cellSelect.easing};
            }
            
            .matrix-cell.active {
                ${objectToCSS(this.config.cellActiveStyle)}
                animation: cellActive ${this.config.animations.cellActive.duration} ${this.config.animations.cellActive.easing};
            }
            
            .matrix-cell .cell-content {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                z-index: 1;
            }
            
            .matrix-cell .ripple {
                position: absolute;
                border-radius: 50%;
                background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.1) 70%, transparent 100%);
                transform: scale(0);
                animation: ripple 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
                z-index: 2;
            }
            
            /* Animations avancées */
            @keyframes cellHover {
                0% { transform: scale(1); }
                50% { transform: scale(1.02); }
                100% { transform: scale(1.05); }
            }
            
            @keyframes cellSelect {
                0% { transform: scale(1); }
                30% { transform: scale(1.15); }
                100% { transform: scale(1.08); }
            }
            
            @keyframes cellActive {
                0% { transform: scale(1.08); }
                50% { transform: scale(1.12); }
                100% { transform: scale(1.08); }
            }
            
            @keyframes ripple {
                0% {
                    transform: scale(0);
                    opacity: 1;
                }
                50% {
                    transform: scale(0.8);
                    opacity: 0.7;
                }
                100% {
                    transform: scale(2);
                    opacity: 0;
                }
            }
            
            /* Responsive design */
            @media (max-width: 768px) {
                .matrix-container {
                    font-size: 12px;
                }
                
                .matrix-grid {
                    gap: ${Math.max(1, this.config.spacing.vertical - 1)}px ${Math.max(1, this.config.spacing.horizontal - 1)}px;
                    padding: ${Math.max(4, this.config.spacing.outer - 4)}px;
                }
                
                .matrix-cell {
                    min-height: 32px;
                }
            }
            
            /* Effets de focus pour accessibilité */
            .matrix-cell:focus {
                outline: 2px solid #2196f3;
                outline-offset: 2px;
            }
            
            /* States pour debugging */
            .matrix-container.debug .matrix-cell {
                border: 2px dashed rgba(255, 0, 0, 0.3) !important;
            }
            
            .matrix-container.debug .matrix-cell::before {
                content: attr(data-position);
                position: absolute;
                top: 2px;
                left: 2px;
                font-size: 10px;
                color: red;
                background: rgba(255, 255, 255, 0.8);
                padding: 1px 3px;
                border-radius: 2px;
            }
        `;
        
        return style;
    }
    
    _generateCells() {
        for (let y = 0; y < this.config.grid.y; y++) {
            for (let x = 0; x < this.config.grid.x; x++) {
                const cellId = `${x}_${y}`;
                const cell = this._createCell(x, y, cellId);
                this.cells.set(cellId, cell);
                this.gridContainer.appendChild(cell);
            }
        }
    }
    
    _createCell(x, y, cellId) {
        const cell = document.createElement('div');
        cell.className = 'matrix-cell';
        cell.id = `${this.id}_cell_${cellId}`;
        cell.dataset.position = `${x},${y}`;
        cell.dataset.cellId = cellId;
        cell.tabIndex = 0; // Pour accessibilité
        
        // Content container
        const content = document.createElement('div');
        content.className = 'cell-content';
        content.textContent = `${x},${y}`;
        cell.appendChild(content);
        
        // Event handlers avec effets avancés
        this._setupCellEvents(cell, x, y, cellId);
        
        return cell;
    }
    
    _setupCellEvents(cell, x, y, cellId) {
        let longClickTimer = null;
        let isLongClick = false;
        
        // Click events
        cell.addEventListener('click', (e) => {
            if (isLongClick) {
                isLongClick = false;
                return;
            }
            
            this._handleCellClick(cell, x, y, cellId, e);
        });
        
        cell.addEventListener('dblclick', (e) => {
            this._handleCellDoubleClick(cell, x, y, cellId, e);
        });
        
        // Long click detection
        cell.addEventListener('mousedown', (e) => {
            longClickTimer = setTimeout(() => {
                isLongClick = true;
                this._handleCellLongClick(cell, x, y, cellId, e);
            }, 500);
        });
        
        cell.addEventListener('mouseup', () => {
            if (longClickTimer) {
                clearTimeout(longClickTimer);
                longClickTimer = null;
            }
        });
        
        // Hover effects
        cell.addEventListener('mouseenter', (e) => {
            this.hoveredCell = cellId;
            this._handleCellHover(cell, x, y, cellId, e);
        });
        
        cell.addEventListener('mouseleave', (e) => {
            this.hoveredCell = null;
            this._handleCellLeave(cell, x, y, cellId, e);
        });
        
        // Touch events pour mobile
        cell.addEventListener('touchstart', (e) => {
            this._addActiveState(cell);
            this._handleCellTouch(cell, x, y, cellId, e);
        });
        
        cell.addEventListener('touchend', () => {
            this._removeActiveState(cell);
        });
        
        // Keyboard support
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this._handleCellClick(cell, x, y, cellId, e);
            }
        });
    }
    
    _setupEventHandlers() {
        // Global event handlers
        window.addEventListener('resize', () => {
            this._handleResize();
        });
    }
    
    // Event Handlers
    _handleCellClick(cell, x, y, cellId, event) {
        // Toggle selection
        if (this.selectedCells.has(cellId)) {
            this.selectedCells.delete(cellId);
            cell.classList.remove('selected');
        } else {
            this.selectedCells.add(cellId);
            cell.classList.add('selected');
        }
        
        // Add ripple effect
        this._addRippleEffect(cell, event);
        
        // Call user callback
        this.config.callbacks.onCellClick(cell, x, y, cellId, event);
        
        // Trigger selection change
        this.config.callbacks.onSelectionChange(Array.from(this.selectedCells));
    }
    
    _handleCellDoubleClick(cell, x, y, cellId, event) {
        // Pulse effect pour double click
        cell.style.animation = 'none';
        cell.offsetHeight; // Force reflow
        cell.style.animation = `cellActive ${this.config.animations.cellActive.duration} ${this.config.animations.cellActive.easing} 2`;
        
        this.config.callbacks.onCellDoubleClick(cell, x, y, cellId, event);
    }
    
    _handleCellLongClick(cell, x, y, cellId, event) {
        // Effet spécial pour long click
        cell.style.transform = 'scale(1.15) rotateZ(2deg)';
        cell.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        
        setTimeout(() => {
            cell.style.transform = '';
            cell.style.transition = '';
        }, 300);
        
        this.config.callbacks.onCellLongClick(cell, x, y, cellId, event);
    }
    
    _handleCellHover(cell, x, y, cellId, event) {
        this.config.callbacks.onCellHover(cell, x, y, cellId, event);
    }
    
    _handleCellLeave(cell, x, y, cellId, event) {
        this.config.callbacks.onCellLeave(cell, x, y, cellId, event);
    }
    
    _handleCellTouch(cell, x, y, cellId, event) {
        // Vibration pour mobile si supporté
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        this.config.callbacks.onCellTouch(cell, x, y, cellId, event);
    }
    
    _handleResize() {
        this.config.callbacks.onMatrixResize(this.config.size.width, this.config.size.height);
    }
    
    // Utility methods
    _addRippleEffect(cell, event) {
        const ripple = document.createElement('div');
        ripple.className = 'ripple';
        
        const rect = cell.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;
        
        ripple.style.width = size + 'px';
        ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        cell.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }
    
    _addActiveState(cell) {
        cell.classList.add('active');
    }
    
    _removeActiveState(cell) {
        cell.classList.remove('active');
    }
    
    // Public API methods
    getCell(x, y) {
        const cellId = `${x}_${y}`;
        return this.cells.get(cellId);
    }
    
    selectCell(x, y) {
        const cellId = `${x}_${y}`;
        const cell = this.cells.get(cellId);
        if (cell && !this.selectedCells.has(cellId)) {
            this.selectedCells.add(cellId);
            cell.classList.add('selected');
            this.config.callbacks.onSelectionChange(Array.from(this.selectedCells));
        }
    }
    
    deselectCell(x, y) {
        const cellId = `${x}_${y}`;
        const cell = this.cells.get(cellId);
        if (cell && this.selectedCells.has(cellId)) {
            this.selectedCells.delete(cellId);
            cell.classList.remove('selected');
            this.config.callbacks.onSelectionChange(Array.from(this.selectedCells));
        }
    }
    
    clearSelection() {
        this.selectedCells.forEach(cellId => {
            const cell = this.cells.get(cellId);
            if (cell) cell.classList.remove('selected');
        });
        this.selectedCells.clear();
        this.config.callbacks.onSelectionChange([]);
    }
    
    setCellContent(x, y, content) {
        const cell = this.getCell(x, y);
        if (cell) {
            const contentEl = cell.querySelector('.cell-content');
            if (typeof content === 'string') {
                contentEl.textContent = content;
            } else if (content instanceof HTMLElement) {
                contentEl.innerHTML = '';
                contentEl.appendChild(content);
            }
        }
    }
    
    setCellStyle(x, y, styles) {
        const cell = this.getCell(x, y);
        if (cell) {
            Object.assign(cell.style, styles);
        }
    }
    
    getSelectedCells() {
        return Array.from(this.selectedCells);
    }
    
    resize(width, height) {
        this.config.size.width = width;
        this.config.size.height = height;
        this.style.width = `${width}px`;
        this.style.height = `${height}px`;
        this._handleResize();
    }
}

// Register Web Component
customElements.define('squirrel-matrix', Matrix);

// Export pour ES6 modules et usage direct
export default Matrix;

// Disponible globalement pour compatibilité
if (typeof window !== 'undefined') {
    window.SquirrelMatrix = Matrix;
}
