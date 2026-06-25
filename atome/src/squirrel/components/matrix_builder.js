import { matrixEventsMethods } from './matrix_events.js';
import { matrixStateMethods } from './matrix_state.js';
import { matrixResizeMethods } from './matrix_resize.js';
import { matrixQueryMethods } from './matrix_query.js';
import { matrixContentMethods } from './matrix_content.js';

/**
 * 🎯 MATRIX COMPONENT - VERSION 2.0 COMPLÈTE
 * Composant Matrix avec gestion d'état granulaire et customisation complète des cellules
 */

class Matrix {
  constructor(options = {}) {
    // Configuration par défaut
    this.config = {
      id: options.id || `matrix-${Date.now()}`,
      grid: { x: 4, y: 4, ...options.grid },
      size: { width: 400, height: 400, ...options.size },
      position: { x: 0, y: 0, ...options.position },
      spacing: { horizontal: 8, vertical: 8, external: 16, ...options.spacing },
      attach: options.attach || 'body',

      // Configuration des cellules
      cells: options.cells || {},
      states: options.states || {},
      containerStyle: options.containerStyle || {},

      // Options avancées
      debug: options.debug || false,
      responsive: options.responsive !== false,
      autoResize: options.autoResize !== false,
      maintainAspectRatio: options.maintainAspectRatio || false,
      cellSize: typeof options.cellSize === 'number' ? options.cellSize : null
    };

    // Stockage interne
    this.cellsMap = new Map();           // Map des cellules avec leurs données
    this.cellStates = new Map();         // États par cellule
    this.cellElements = new Map();       // Éléments DOM par cellule
    this.selectedCells = new Set();      // Cellules sélectionnées

    // Index pour accès rapide par ID de cellule
    this.cellIdToKey = new Map();        // cellId -> "x,y"

    // Callbacks
    this.callbacks = {
      onCellClick: options.onCellClick || null,
      onCellDoubleClick: options.onCellDoubleClick || null,
      onCellLongClick: options.onCellLongClick || null,
      onCellHover: options.onCellHover || null,
      onCellLeave: options.onCellLeave || null,
      onCellStateChange: options.onCellStateChange || null,
      onSelectionChange: options.onSelectionChange || null,
      onResize: options.onResize || null
    };

    // État interne
    this.container = null;
    this.longClickTimer = null;
    this.resizeObserver = null;
    this.isInitialized = false;

    // Initialisation
    this.init();
  }

  // ========================================
  // 🏗️ INITIALISATION
  // ========================================

  init() {
    try {
      this.createContainer();
      this.createCells();
      this.setupEventListeners();
      this.setupResizeObserver();
      this.applyInitialStates();
      this.isInitialized = true;

      if (this.config.debug) {
      }
    } catch (error) {
    }
  }

  createContainer() {
    // Attachement au DOM
    const attachPoint = typeof this.config.attach === 'string'
      ? document.querySelector(this.config.attach)
      : this.config.attach;

    if (!attachPoint) {
      throw new Error(`Point d'attachement "${this.config.attach}" non trouvé`);
    }

    // Création du container principal
    this.container = document.createElement('div');
    this.container.__refObj = this;
    this.container.id = this.config.id;
    this.container.className = 'matrix-container';

    // Application des styles
    this.applyContainerStyles();

    attachPoint.appendChild(this.container);
  }

  applyContainerStyles() {
    const trackSize = this.getTrackSize();
    const defaultStyles = {
      position: 'absolute',
      left: `${this.config.position.x}px`,
      top: `${this.config.position.y}px`,
      display: 'grid',
      gridTemplateColumns: `repeat(${this.config.grid.x}, ${trackSize})`,
      gridTemplateRows: `repeat(${this.config.grid.y}, ${trackSize})`,
      gap: `${this.config.spacing.vertical}px ${this.config.spacing.horizontal}px`,
      background: '#f8f9fa',
      borderRadius: '12px',
      border: '1px solid #dee2e6',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      userSelect: 'none',
      boxSizing: 'border-box'
    };

    // Gestion du redimensionnement automatique
    if (this.config.autoResize) {
      // Mode responsive : s'adapte au parent
      Object.assign(defaultStyles, {
        position: 'relative',
        left: 'auto',
        top: 'auto',
        width: '100%',
        height: '100%',
        padding: `${this.config.spacing.external}px`
      });
    } else {
      // Mode taille fixe
      Object.assign(defaultStyles, {
        width: `${this.config.size.width}px`,
        height: `${this.config.size.height}px`,
        padding: `${this.config.spacing.external}px`
      });
    }

    // Fusion avec les styles personnalisés
    const finalStyles = { ...defaultStyles, ...this.config.containerStyle };
    Object.assign(this.container.style, finalStyles);

    this.updateGridTemplate();
    this.updateContainerDimensions();
  }

  getTrackSize() {
    return this.config.cellSize ? `${this.config.cellSize}px` : '1fr';
  }

  updateGridTemplate() {
    if (!this.container) return;
    const trackSize = this.getTrackSize();
    this.container.style.gridTemplateColumns = `repeat(${this.config.grid.x}, ${trackSize})`;
    this.container.style.gridTemplateRows = `repeat(${this.config.grid.y}, ${trackSize})`;
  }

  calculateContentDimension(axis) {
    if (!this.config.cellSize) return 0;

    const isHorizontal = axis === 'width';
    const cellCount = isHorizontal ? this.config.grid.x : this.config.grid.y;
    const spacing = isHorizontal ? this.config.spacing.horizontal : this.config.spacing.vertical;
    const gaps = Math.max(0, cellCount - 1);

    return (this.config.cellSize * cellCount) + (spacing * gaps);
  }

  updateContainerDimensions() {
    if (!this.container) return;

    if (!this.config.autoResize || this.config.cellSize) {
      if (this.config.cellSize) {
        const contentWidth = this.calculateContentDimension('width');
        const contentHeight = this.calculateContentDimension('height');
        const externalPadding = this.config.spacing?.external || 0;

        if (contentWidth) {
          const totalWidth = contentWidth + (externalPadding * 2);
          this.container.style.width = `${totalWidth}px`;
        }

        if (contentHeight) {
          const totalHeight = contentHeight + (externalPadding * 2);
          this.container.style.height = `${totalHeight}px`;
        }

        return;
      }

      if (this.config.size.width) {
        this.container.style.width = `${this.config.size.width}px`;
      }

      if (this.config.size.height) {
        this.container.style.height = `${this.config.size.height}px`;
      }
    }
  }

  createCells() {
    for (let y = 0; y < this.config.grid.y; y++) {
      for (let x = 0; x < this.config.grid.x; x++) {
        this.createCell(x, y);
      }
    }
  }

  createCell(x, y, insertIndex) {
    const cellKey = `${x},${y}`;
    const cellConfig = this.config.cells[cellKey] || {};
    const defaultConfig = this.config.cells.default || {};

    // ID de la cellule (personnalisé ou auto-généré)
    const cellId = cellConfig.id || `${this.config.id}-cell-${x}-${y}`;

    // Création de l'élément DOM
    const cellElement = document.createElement('div');
    cellElement.id = cellId;
    cellElement.className = 'matrix-cell';
    cellElement.tabIndex = 0;
    cellElement.setAttribute('data-x', x);
    cellElement.setAttribute('data-y', y);
    cellElement.setAttribute('data-cell-id', cellId);
    cellElement.setAttribute('role', 'button');
    cellElement.setAttribute('aria-label', `Cellule ${x}, ${y}`);

    // Contenu de la cellule
    const content = cellConfig.content || defaultConfig.content || '';
    cellElement.textContent = content;

    // Styles par défaut des cellules
    const defaultCellStyles = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffffff',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      minHeight: '40px',
      transition: 'all 0.2s ease',
      userSelect: 'none'
    };

    // Application des styles (défaut + personnalisés)
    const cellStyles = {
      ...defaultCellStyles,
      ...defaultConfig.style,
      ...cellConfig.style
    };
    Object.assign(cellElement.style, cellStyles);

    if (this.config.cellSize) {
      const sizePx = `${this.config.cellSize}px`;
      cellElement.style.width = sizePx;
      cellElement.style.height = sizePx;
      cellElement.style.minWidth = sizePx;
      cellElement.style.minHeight = sizePx;
      cellElement.style.scrollSnapAlign = 'start';
      cellElement.style.scrollSnapStop = 'always';
    }

    // Stockage des données de la cellule
    this.cellsMap.set(cellKey, {
      id: cellId,
      x, y,
      content,
      element: cellElement,
      config: cellConfig
    });

    // Index id -> key
    this.cellIdToKey.set(cellId, cellKey);

    // Stockage de l'élément DOM
    this.cellElements.set(cellKey, cellElement);

    // Initialisation des états
    const initialStates = new Set(['normal']);
    if (cellConfig.states) {
      cellConfig.states.forEach(state => initialStates.add(state));
    }
    this.cellStates.set(cellKey, initialStates);

    // Debug mode
    if (this.config.debug) {
      cellElement.setAttribute('title', `Cellule (${x}, ${y}) - ID: ${cellId}`);
    }

    let reference = null;
    if (typeof insertIndex === 'number' && insertIndex >= 0) {
      reference = this.container.children[insertIndex] || null;
    }
    if (reference) {
      this.container.insertBefore(cellElement, reference);
    } else {
      this.container.appendChild(cellElement);
    }

    return cellElement;
  }

  applyInitialStates() {
    // Application des styles d'états initiaux
    this.cellStates.forEach((states, cellKey) => {
      states.forEach(stateName => {
        if (stateName !== 'normal' && this.config.states[stateName]) {
          const [x, y] = cellKey.split(',').map(Number);
          this.applyCellStateStyle(x, y, stateName);
        }
      });
    });
  }

  // ========================================
  // 🎯 GESTION DES ÉVÉNEMENTS
  // ========================================

  destroy() {
    try {
      // Nettoyage des timers
      if (this.longClickTimer) {
        clearTimeout(this.longClickTimer);
        this.longClickTimer = null;
      }

      // Nettoyage du ResizeObserver
      this.disconnectResizeObserver();

      // Suppression des event listeners
      if (this.container) {
        this.container.removeEventListener('click', this.handleCellClick);
        this.container.removeEventListener('dblclick', this.handleCellDoubleClick);
        this.container.removeEventListener('mousedown', this.handleCellMouseDown);
        this.container.removeEventListener('mouseup', this.handleCellMouseUp);
        this.container.removeEventListener('mouseenter', this.handleCellHover);
        this.container.removeEventListener('mouseleave', this.handleCellLeave);
        this.container.removeEventListener('keydown', this.handleCellKeyDown);

        // Suppression du DOM
        if (this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
      }

      // Nettoyage des Maps
      this.cellsMap.clear();
      this.cellStates.clear();
      this.cellElements.clear();
      this.selectedCells.clear();
      this.cellIdToKey.clear();

      // Reset des callbacks
      this.callbacks = {};

    } catch (error) {
    }
  }
}

Object.assign(Matrix.prototype, matrixEventsMethods, matrixStateMethods, matrixResizeMethods, matrixQueryMethods, matrixContentMethods);


// ========================================
// 🌟 EXPORT DU MODULE
// ========================================

// Factory functions pour usage simplifié
function createMatrix(options) {
  return new Matrix(options);
}

/**
 * Crée une matrix responsive qui s'adapte à son parent
 * @param {HTMLElement|string} parent - Élément parent ou sélecteur
 * @param {Object} options - Options de configuration
 * @returns {Matrix} Instance de Matrix
 */
function createResponsiveMatrix(parent, options = {}) {
  const parentElement = typeof parent === 'string' ? document.querySelector(parent) : parent;

  if (!parentElement) {
    throw new Error(`Élément parent "${parent}" non trouvé`);
  }

  return new Matrix({
    autoResize: true,
    maintainAspectRatio: false,
    attach: parentElement,
    ...options
  });
}

/**
 * Crée une matrix avec auto-dimensionnement des cellules
 * @param {Object} options - Options de configuration
 * @returns {Matrix} Instance de Matrix
 */
function createAutoSizedMatrix(options = {}) {
  const matrix = new Matrix({
    autoResize: false,
    ...options
  });

  // Auto-dimensionnement après création
  setTimeout(() => {
    matrix.fitToContent();
  }, 0);

  return matrix;
}

// === EXPORTS ===
// createMatrix est déjà exporté à la ligne 1178, mais ajoutons l'export nommé pour cohérence
export { createMatrix };

// Alias pour compatibilité avec l'ancien pattern (éviter le conflit avec la classe Matrix)
const MatrixComponent = createMatrix;
export { MatrixComponent };
export { MatrixComponent as Matrix };

// Export par défaut - fonction directe pour usage: Matrix({...})
export default createMatrix;

// Export des utilitaires supplémentaires
export {
  createResponsiveMatrix,
  createAutoSizedMatrix
};

