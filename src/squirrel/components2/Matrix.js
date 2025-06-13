/**
 * 🔲 Matrix Web Component - Version Propre From Scratch
 * 
 * Web Component moderne et simple pour créer des grilles interactives
 * ✅ Shadow DOM pour isolation complète
 * ✅ Configuration simple et intuitive
 * ✅ CellStyle avec borderRadius qui fonctionne
 * ✅ Événements clairs et performants
 * ✅ CSS moderne et optimisé
 * 
 * @version 1.0.0 - CLEAN VERSION
 * @author Squirrel Framework Team
 */

class Matrix extends HTMLElement {
    constructor() {
        super();
        
        // Configuration par défaut
        this.config = {
            id: 'matrix-' + Date.now(),
            grid: { x: 3, y: 3 },
            size: { width: '300px', height: '300px' },
            cellStyle: {
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
            },
            cellHoverStyle: {
                backgroundColor: '#e3f2fd',
                transform: 'scale(1.05)'
            },
            callbacks: {
                onClick: () => {}
            }
        };
        
        // État interne
        this.cells = new Map();
        this.selectedCells = new Set();
        
        // Créer Shadow DOM
        this.attachShadow({ mode: 'open' });
        
        // Initialiser
        this._init();
    }
    
    /**
     * 🚀 INITIALISATION
     */
    _init() {
        // Merger la configuration depuis les attributs
        this._parseAttributes();
        
        // Créer la structure
        this._createStructure();
        this._createStyles();
        this._createCells();
        this._setupEvents();
        
        console.log(`🔲 Matrix créée: ${this.config.grid.x}x${this.config.grid.y}`);
    }
    
    /**
     * 📝 PARSER LES ATTRIBUTS HTML
     */
    _parseAttributes() {
        // Grid depuis attributs
        if (this.hasAttribute('grid-x')) {
            this.config.grid.x = parseInt(this.getAttribute('grid-x'));
        }
        if (this.hasAttribute('grid-y')) {
            this.config.grid.y = parseInt(this.getAttribute('grid-y'));
        }
        
        // Taille depuis attributs
        if (this.hasAttribute('width')) {
            this.config.size.width = this.getAttribute('width');
        }
        if (this.hasAttribute('height')) {
            this.config.size.height = this.getAttribute('height');
        }
        
        // ID depuis attribut
        if (this.hasAttribute('id')) {
            this.config.id = this.getAttribute('id');
        }
    }
    
    /**
     * 🏗️ CRÉER LA STRUCTURE HTML
     */
    _createStructure() {
        this.container = document.createElement('div');
        this.container.className = 'matrix-container';
        this.container.id = this.config.id;
        
        this.grid = document.createElement('div');
        this.grid.className = 'matrix-grid';
        
        this.container.appendChild(this.grid);
        this.shadowRoot.appendChild(this.container);
    }
    
    /**
     * 🎨 CRÉER LES STYLES CSS
     */
    _createStyles() {
        const style = document.createElement('style');
        
        // Helper pour convertir un objet en CSS
        const objectToCSS = (obj) => {
            if (!obj || typeof obj !== 'object') return '';
            
            return Object.entries(obj)
                .filter(([key, value]) => value !== null && value !== undefined)
                .map(([key, value]) => {
                    // Convertir camelCase en kebab-case
                    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                    return `${cssKey}: ${value};`;
                })
                .join('\n    '); // ← FIX PRINCIPAL: single backslash
        };
        
        style.textContent = `
            :host {
                display: block;
                width: ${this.config.size.width};
                height: ${this.config.size.height};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            
            .matrix-container {
                width: 100%;
                height: 100%;
                background: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 12px;
                padding: 8px;
                box-sizing: border-box;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            
            .matrix-grid {
                display: grid;
                grid-template-columns: repeat(${this.config.grid.x}, 1fr);
                grid-template-rows: repeat(${this.config.grid.y}, 1fr);
                gap: 4px;
                width: 100%;
                height: 100%;
            }
            
            .matrix-cell {
                ${objectToCSS(this.config.cellStyle)}
                display: flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                font-size: 12px;
                font-weight: 500;
                color: #495057;
                box-sizing: border-box;
                outline: none;
            }
            
            .matrix-cell:hover {
                ${objectToCSS(this.config.cellHoverStyle)}
            }
            
            .matrix-cell.selected {
                background-color: #007bff !important;
                color: white !important;
                border-color: #0056b3 !important;
            }
            
            .matrix-cell:focus {
                outline: 2px solid #007bff;
                outline-offset: 2px;
            }
            
            .matrix-cell:active {
                transform: scale(0.95);
            }
            
            /* Animation de ripple */
            .matrix-cell .ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.6);
                pointer-events: none;
                transform: scale(0);
                animation: ripple 0.6s linear;
            }
            
            @keyframes ripple {
                to {
                    transform: scale(2);
                    opacity: 0;
                }
            }
        `;
        
        this.shadowRoot.appendChild(style);
    }
    
    /**
     * 🔲 CRÉER LES CELLULES
     */
    _createCells() {
        for (let y = 0; y < this.config.grid.y; y++) {
            for (let x = 0; x < this.config.grid.x; x++) {
                const cell = this._createCell(x, y);
                this.grid.appendChild(cell);
            }
        }
    }
    
    /**
     * 🔲 CRÉER UNE CELLULE
     */
    _createCell(x, y) {
        const cellId = `${x}_${y}`;
        
        const cell = document.createElement('div');
        cell.className = 'matrix-cell';
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.dataset.cellId = cellId;
        cell.textContent = `${x+1},${y+1}`;
        cell.tabIndex = 0; // Pour accessibilité
        
        // Stocker la cellule
        this.cells.set(cellId, cell);
        
        return cell;
    }
    
    /**
     * 🎯 SETUP DES ÉVÉNEMENTS
     */
    _setupEvents() {
        // Délégation d'événements sur le grid
        this.grid.addEventListener('click', (e) => {
            if (e.target.classList.contains('matrix-cell')) {
                this._handleCellClick(e.target, e);
            }
        });
        
        // Support clavier
        this.grid.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('matrix-cell')) {
                e.preventDefault();
                this._handleCellClick(e.target, e);
            }
        });
    }
    
    /**
     * 👆 GÉRER LE CLIC SUR UNE CELLULE
     */
    _handleCellClick(cell, event) {
        const x = parseInt(cell.dataset.x);
        const y = parseInt(cell.dataset.y);
        const cellId = cell.dataset.cellId;
        
        // Toggle sélection
        if (this.selectedCells.has(cellId)) {
            this.selectedCells.delete(cellId);
            cell.classList.remove('selected');
        } else {
            this.selectedCells.add(cellId);
            cell.classList.add('selected');
        }
        
        // Effet ripple
        this._addRipple(cell, event);
        
        // Callback utilisateur
        this.config.callbacks.onClick(cellId, x, y, cell, event);
        
        // Dispatcher un événement personnalisé
        this.dispatchEvent(new CustomEvent('cell-click', {
            detail: { x, y, cellId, cell, selected: this.selectedCells.has(cellId) }
        }));
    }
    
    /**
     * 💫 AJOUTER EFFET RIPPLE
     */
    _addRipple(cell, event) {
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
        ripple.style.position = 'absolute';
        
        const cellPosition = getComputedStyle(cell).position;
        if (cellPosition === 'static') {
            cell.style.position = 'relative';
        }
        
        cell.appendChild(ripple);
        
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }
    
    // ==========================================
    // 🔧 API PUBLIQUE
    // ==========================================
    
    /**
     * 📝 CONFIGURER LA MATRIX
     */
    configure(newConfig) {
        // Merger la nouvelle config
        this.config = {
            ...this.config,
            ...newConfig,
            grid: { ...this.config.grid, ...newConfig.grid },
            size: { ...this.config.size, ...newConfig.size },
            cellStyle: { ...this.config.cellStyle, ...newConfig.cellStyle },
            cellHoverStyle: { ...this.config.cellHoverStyle, ...newConfig.cellHoverStyle },
            callbacks: { ...this.config.callbacks, ...newConfig.callbacks }
        };
        
        // Recréer si nécessaire
        this._recreate();
    }
    
    /**
     * 🔄 RECRÉER LA MATRIX
     */
    _recreate() {
        // Vider le shadow DOM
        this.shadowRoot.innerHTML = '';
        this.cells.clear();
        this.selectedCells.clear();
        
        // Recréer
        this._createStructure();
        this._createStyles();
        this._createCells();
        this._setupEvents();
    }
    
    /**
     * 🎯 SÉLECTIONNER UNE CELLULE
     */
    selectCell(x, y) {
        const cellId = `${x}_${y}`;
        const cell = this.cells.get(cellId);
        
        if (cell && !this.selectedCells.has(cellId)) {
            this.selectedCells.add(cellId);
            cell.classList.add('selected');
        }
    }
    
    /**
     * ❌ DÉSÉLECTIONNER UNE CELLULE
     */
    deselectCell(x, y) {
        const cellId = `${x}_${y}`;
        const cell = this.cells.get(cellId);
        
        if (cell && this.selectedCells.has(cellId)) {
            this.selectedCells.delete(cellId);
            cell.classList.remove('selected');
        }
    }
    
    /**
     * 🧹 VIDER LA SÉLECTION
     */
    clearSelection() {
        this.selectedCells.forEach(cellId => {
            const cell = this.cells.get(cellId);
            if (cell) cell.classList.remove('selected');
        });
        this.selectedCells.clear();
    }
    
    /**
     * 📦 OBTENIR LES CELLULES SÉLECTIONNÉES
     */
    getSelectedCells() {
        return Array.from(this.selectedCells);
    }
    
    /**
     * 📝 MODIFIER LE CONTENU D'UNE CELLULE
     */
    setCellContent(x, y, content) {
        const cellId = `${x}_${y}`;
        const cell = this.cells.get(cellId);
        
        if (cell) {
            cell.textContent = content;
        }
    }
    
    /**
     * 🎨 MODIFIER LE STYLE D'UNE CELLULE
     */
    setCellStyle(x, y, styles) {
        const cellId = `${x}_${y}`;
        const cell = this.cells.get(cellId);
        
        if (cell) {
            Object.assign(cell.style, styles);
        }
    }
}

// 🚀 Enregistrer le Web Component
customElements.define('squirrel-matrix', Matrix);

// Export pour modules ES6
export default Matrix;

// Global pour compatibilité
if (typeof window !== 'undefined') {
    window.Matrix = Matrix;
}
