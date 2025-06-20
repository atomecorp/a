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
      maintainAspectRatio: options.maintainAspectRatio || false
    };

    // Stockage interne
    this.cellsMap = new Map();           // Map des cellules avec leurs données
    this.cellStates = new Map();         // États par cellule
    this.cellElements = new Map();       // Éléments DOM par cellule
    this.selectedCells = new Set();      // Cellules sélectionnées

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
// console.log(`✅ Matrix "${this.config.id}" initialisée avec succès`);
// console.log(`📊 ${this.config.grid.x}×${this.config.grid.y} = ${this.getTotalCells()} cellules`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors de l'initialisation de Matrix "${this.config.id}":`, error);
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
    this.container.id = this.config.id;
    this.container.className = 'matrix-container';
    
    // Application des styles
    this.applyContainerStyles();
    
    attachPoint.appendChild(this.container);
  }

  applyContainerStyles() {
    const defaultStyles = {
      position: 'absolute',
      left: `${this.config.position.x}px`,
      top: `${this.config.position.y}px`,
      display: 'grid',
      gridTemplateColumns: `repeat(${this.config.grid.x}, 1fr)`,
      gridTemplateRows: `repeat(${this.config.grid.y}, 1fr)`,
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
  }

  createCells() {
    for (let y = 0; y < this.config.grid.y; y++) {
      for (let x = 0; x < this.config.grid.x; x++) {
        this.createCell(x, y);
      }
    }
  }

  createCell(x, y) {
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

    // Stockage des données de la cellule
    this.cellsMap.set(cellKey, {
      id: cellId,
      x, y,
      content,
      element: cellElement,
      config: cellConfig
    });

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

    this.container.appendChild(cellElement);
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

  setupEventListeners() {
    // Event delegation sur le container
    this.container.addEventListener('click', this.handleCellClick.bind(this));
    this.container.addEventListener('dblclick', this.handleCellDoubleClick.bind(this));
    this.container.addEventListener('mousedown', this.handleCellMouseDown.bind(this));
    this.container.addEventListener('mouseup', this.handleCellMouseUp.bind(this));
    this.container.addEventListener('mouseenter', this.handleCellHover.bind(this), true);
    this.container.addEventListener('mouseleave', this.handleCellLeave.bind(this), true);
    this.container.addEventListener('keydown', this.handleCellKeyDown.bind(this));
  }

  handleCellClick(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData) return;

    const { x, y, id, element } = cellData;

    // Callback
    if (this.callbacks.onCellClick) {
      this.callbacks.onCellClick(element, x, y, id, event);
    }
  }

  handleCellDoubleClick(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData) return;

    const { x, y, id, element } = cellData;

    // Callback
    if (this.callbacks.onCellDoubleClick) {
      this.callbacks.onCellDoubleClick(element, x, y, id, event);
    }
  }

  handleCellMouseDown(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData) return;

    const { x, y, id, element } = cellData;

    // Démarrage du timer pour long click
    this.longClickTimer = setTimeout(() => {
      if (this.callbacks.onCellLongClick) {
        this.callbacks.onCellLongClick(element, x, y, id, event);
      }
    }, 500);
  }

  handleCellMouseUp(event) {
    // Annulation du long click
    if (this.longClickTimer) {
      clearTimeout(this.longClickTimer);
      this.longClickTimer = null;
    }
  }

  handleCellHover(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData || !event.target.classList.contains('matrix-cell')) return;

    const { x, y, id, element } = cellData;

    // Application du style hover s'il est défini
    if (this.config.states.hover) {
      this.applyStylesToElement(element, this.config.states.hover, true);
    }

    // Callback
    if (this.callbacks.onCellHover) {
      this.callbacks.onCellHover(element, x, y, id, event);
    }
  }

  handleCellLeave(event) {
    const cellData = this.getCellFromEvent(event);
    if (!cellData || !event.target.classList.contains('matrix-cell')) return;

    const { x, y, id, element } = cellData;

    // Suppression du style hover et réapplication des styles d'états
    this.reapplyCellStyles(x, y);

    // Callback
    if (this.callbacks.onCellLeave) {
      this.callbacks.onCellLeave(element, x, y, id, event);
    }
  }

  handleCellKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.handleCellClick(event);
    }
  }

  getCellFromEvent(event) {
    const cellElement = event.target.closest('.matrix-cell');
    if (!cellElement) return null;

    const x = parseInt(cellElement.getAttribute('data-x'));
    const y = parseInt(cellElement.getAttribute('data-y'));
    const id = cellElement.getAttribute('data-cell-id');
    const cellKey = `${x},${y}`;
    const cellData = this.cellsMap.get(cellKey);

    return { x, y, id, element: cellElement, cellData };
  }

  // ========================================
  // 🗂️ GESTION D'ÉTAT DES CELLULES
  // ========================================

  getCellState(x, y) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey);
    if (!states || states.size === 0) return null;
    
    // Retourne l'état principal (le dernier ajouté qui n'est pas 'normal')
    const statesArray = Array.from(states);
    return statesArray.find(state => state !== 'normal') || 'normal';
  }

  getCellStates(x, y) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey);
    return states ? Array.from(states) : [];
  }

  hasCellState(x, y, stateName) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey);
    return states ? states.has(stateName) : false;
  }

  setCellState(x, y, stateName, active = true) {
    const cellKey = `${x},${y}`;
    const states = this.cellStates.get(cellKey) || new Set();
    const cell = this.cellsMap.get(cellKey);

    if (!cell) return;

    const wasActive = states.has(stateName);

    if (active && !wasActive) {
      states.add(stateName);
      this.applyCellStateStyle(x, y, stateName);
    } else if (!active && wasActive) {
      states.delete(stateName);
      this.removeCellStateStyle(x, y, stateName);
    }

    this.cellStates.set(cellKey, states);

    // Gestion de la sélection
    if (stateName === 'selected') {
      if (active) {
        this.selectedCells.add(cellKey);
      } else {
        this.selectedCells.delete(cellKey);
      }
      this.triggerSelectionChange();
    }

    // Callback
    if (this.callbacks.onCellStateChange && wasActive !== active) {
      this.callbacks.onCellStateChange(cell.element, x, y, stateName, active);
    }
  }

  addCellState(x, y, stateName) {
    this.setCellState(x, y, stateName, true);
  }

  removeCellState(x, y, stateName) {
    this.setCellState(x, y, stateName, false);
  }

  toggleCellState(x, y, stateName) {
    const hasState = this.hasCellState(x, y, stateName);
    this.setCellState(x, y, stateName, !hasState);
    return !hasState;
  }

  clearCellStates(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    
    if (!cell) return;

    // Retour au style par défaut
    this.resetCellStyle(x, y);
    
    // Réinitialisation avec état normal uniquement
    this.cellStates.set(cellKey, new Set(['normal']));
    
    // Suppression de la sélection
    this.selectedCells.delete(cellKey);
    this.triggerSelectionChange();
  }

  applyCellStateStyle(x, y, stateName) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    const stateStyle = this.config.states[stateName];

    if (cell && stateStyle) {
      // Application des styles avec priorité !important pour éviter les conflits
      this.applyStylesToElement(cell.element, stateStyle, true);
    }
  }

  removeCellStateStyle(x, y, stateName) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    
    if (!cell) return;

    // Suppression spécifique des propriétés CSS de cet état
    const stateStyle = this.config.states[stateName];
    if (stateStyle) {
      Object.keys(stateStyle).forEach(property => {
        const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
        cell.element.style.removeProperty(cssProp);
      });
    }

    // Réapplication des styles d'états restants
    this.reapplyCellStyles(x, y);
  }

  reapplyCellStyles(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    const states = this.cellStates.get(cellKey);

    if (!cell || !states) return;

    // Reset et réapplication des styles de base
    this.resetCellStyle(x, y);

    // Réapplication des styles d'états actifs avec priorité !important
    states.forEach(stateName => {
      if (stateName !== 'normal' && this.config.states[stateName]) {
        this.applyStylesToElement(cell.element, this.config.states[stateName], true);
      }
    });
  }

  // ========================================
  // 📐 MÉTHODES DE REDIMENSIONNEMENT
  // ========================================

  /**
   * Force un redimensionnement manuel de la matrice
   * @param {number} width - Nouvelle largeur (optionnel)
   * @param {number} height - Nouvelle hauteur (optionnel)
   */
  resize(width, height) {
    if (width !== undefined && height !== undefined) {
      this.config.size.width = width;
      this.config.size.height = height;
      
      if (!this.config.autoResize) {
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
      }
    }
    
    this.updateCellSizes();
    
    if (this.config.debug) {
// console.log(`📐 Matrix "${this.config.id}" redimensionnée à ${this.config.size.width}x${this.config.size.height}px`);
    }
  }

  /**
   * Active ou désactive le redimensionnement automatique
   * @param {boolean} enabled - Activer ou désactiver
   */
  setAutoResize(enabled) {
    const wasEnabled = this.config.autoResize;
    this.config.autoResize = enabled;

    if (enabled && !wasEnabled) {
      // Activation du redimensionnement automatique
      this.applyContainerStyles();
      this.setupResizeObserver();
    } else if (!enabled && wasEnabled) {
      // Désactivation du redimensionnement automatique
      this.disconnectResizeObserver();
      this.applyContainerStyles();
    }
  }

  /**
   * Déconnecte le ResizeObserver
   */
  disconnectResizeObserver() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  /**
   * S'adapte à un élément parent spécifique
   * @param {HTMLElement|string} parentElement - Élément parent ou sélecteur
   */
  fitToParent(parentElement) {
    const parent = typeof parentElement === 'string' 
      ? document.querySelector(parentElement) 
      : parentElement;

    if (!parent) {
      console.error('❌ Élément parent non trouvé');
      return;
    }

    // Déplacement vers le nouveau parent
    parent.appendChild(this.container);
    
    // Activation du redimensionnement automatique
    this.setAutoResize(true);
    
    // Force une mise à jour immédiate
    const rect = parent.getBoundingClientRect();
    this.handleResize({ contentRect: rect });
  }

  /**
   * Ajuste automatiquement la taille des cellules en fonction de leur contenu
   * @param {Object} options - Options d'ajustement
   */
  autoSizeCells(options = {}) {
    const { 
      minWidth = 40, 
      minHeight = 40, 
      padding = 8,
      fontSize = null 
    } = options;

    this.cellsMap.forEach((cell, cellKey) => {
      const element = cell.element;
      const content = element.textContent || '';
      
      if (content.length > 0) {
        // Créer un élément temporaire pour mesurer le texte
        const measureEl = document.createElement('div');
        measureEl.style.cssText = `
          position: absolute;
          top: -9999px;
          left: -9999px;
          visibility: hidden;
          white-space: nowrap;
          font-family: ${element.style.fontFamily || 'inherit'};
          font-size: ${fontSize || element.style.fontSize || '14px'};
          font-weight: ${element.style.fontWeight || 'inherit'};
        `;
        measureEl.textContent = content;
        document.body.appendChild(measureEl);
        
        const textWidth = measureEl.offsetWidth;
        const textHeight = measureEl.offsetHeight;
        
        document.body.removeChild(measureEl);
        
        // Appliquer les nouvelles dimensions
        const newWidth = Math.max(textWidth + padding * 2, minWidth);
        const newHeight = Math.max(textHeight + padding * 2, minHeight);
        
        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;
      }
    });
    
    if (this.config.debug) {
// console.log(`📏 Auto-dimensionnement des cellules effectué`);
    }
  }

  /**
   * Redimensionne la grille pour s'adapter au contenu
   * @param {Object} options - Options de redimensionnement
   */
  fitToContent(options = {}) {
    this.autoSizeCells(options);
    
    // Recalcul de la taille du container
    let maxWidth = 0;
    let maxHeight = 0;
    
    this.cellsMap.forEach((cell) => {
      const rect = cell.element.getBoundingClientRect();
      maxWidth = Math.max(maxWidth, rect.width);
      maxHeight = Math.max(maxHeight, rect.height);
    });
    
    const totalWidth = (maxWidth * this.config.grid.x) + 
                      (this.config.spacing.horizontal * (this.config.grid.x - 1)) + 
                      (this.config.spacing.external * 2);
                      
    const totalHeight = (maxHeight * this.config.grid.y) + 
                       (this.config.spacing.vertical * (this.config.grid.y - 1)) + 
                       (this.config.spacing.external * 2);
    
    this.resize(totalWidth, totalHeight);
  }

  setupResizeObserver() {
    if (!this.config.autoResize || !window.ResizeObserver) return;

    // Observer pour détecter les changements de taille du parent
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        this.handleResize(entry);
      }
    });

    // Observer le parent du container
    const parent = this.container.parentElement;
    if (parent) {
      this.resizeObserver.observe(parent);
    }
  }

  handleResize(entry) {
    if (!this.config.autoResize) return;

    const { width, height } = entry.contentRect;
    
    if (this.config.debug) {
// console.log(`🔄 Matrix "${this.config.id}" - Redimensionnement détecté:`, { width, height });
    }

    // Mise à jour de la configuration interne
    this.config.size.width = width;
    this.config.size.height = height;

    // Redimensionnement des cellules si nécessaire
    this.updateCellSizes();

    // Callback de redimensionnement si défini
    if (this.callbacks.onResize) {
      this.callbacks.onResize(width, height);
    }
  }

  updateCellSizes() {
    if (!this.config.autoResize) return;

    // Les cellules se redimensionnent automatiquement grâce au CSS Grid
    // Mais on peut ajuster certaines propriétés si nécessaire
    
    const containerRect = this.container.getBoundingClientRect();
    const availableWidth = containerRect.width - (2 * this.config.spacing.external);
    const availableHeight = containerRect.height - (2 * this.config.spacing.external);
    
    const cellWidth = (availableWidth - (this.config.spacing.horizontal * (this.config.grid.x - 1))) / this.config.grid.x;
    const cellHeight = (availableHeight - (this.config.spacing.vertical * (this.config.grid.y - 1))) / this.config.grid.y;

    // Maintien du ratio d'aspect si demandé
    if (this.config.maintainAspectRatio) {
      const minSize = Math.min(cellWidth, cellHeight);
      this.cellsMap.forEach((cell) => {
        cell.element.style.width = `${minSize}px`;
        cell.element.style.height = `${minSize}px`;
      });
    }

    if (this.config.debug) {
// console.log(`📐 Taille des cellules: ${cellWidth.toFixed(1)}x${cellHeight.toFixed(1)}px`);
    }
  }
  // ========================================
  // 🎨 UTILITAIRES DE STYLES
  // ========================================

  /**
   * Applique un objet de styles à un élément avec gestion automatique camelCase/kebab-case
   * @param {HTMLElement} element - Élément DOM
   * @param {Object} styles - Objet de styles
   * @param {boolean} important - Utiliser !important
   */
  applyStylesToElement(element, styles, important = false) {
    Object.entries(styles).forEach(([property, value]) => {
      if (typeof value === 'string' || typeof value === 'number') {
        const cssProp = property.replace(/([A-Z])/g, '-$1').toLowerCase();
        element.style.setProperty(cssProp, String(value), important ? 'important' : '');
      }
    });
  }

  /**
   * Convertit un nom de propriété camelCase en kebab-case
   * @param {string} camelCase - Propriété en camelCase
   * @returns {string} Propriété en kebab-case
   */
  camelToKebab(camelCase) {
    return camelCase.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  // ========================================
  // 🔍 INTERROGATION GLOBALE
  // ========================================

  getCellsByState(stateName) {
    const result = [];
    
    this.cellStates.forEach((states, cellKey) => {
      if (states.has(stateName)) {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({ x, y, id: cell.id, element: cell.element });
      }
    });

    return result;
  }

  getCellsWithAnyState(stateNames) {
    const result = [];
    
    this.cellStates.forEach((states, cellKey) => {
      const hasAnyState = stateNames.some(stateName => states.has(stateName));
      if (hasAnyState) {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({ 
          x, y, 
          id: cell.id, 
          element: cell.element, 
          states: Array.from(states) 
        });
      }
    });

    return result;
  }

  getCellsWithAllStates(stateNames) {
    const result = [];
    
    this.cellStates.forEach((states, cellKey) => {
      const hasAllStates = stateNames.every(stateName => states.has(stateName));
      if (hasAllStates) {
        const [x, y] = cellKey.split(',').map(Number);
        const cell = this.cellsMap.get(cellKey);
        result.push({ 
          x, y, 
          id: cell.id, 
          element: cell.element, 
          states: Array.from(states) 
        });
      }
    });

    return result;
  }

  getStateCount(stateName) {
    let count = 0;
    this.cellStates.forEach(states => {
      if (states.has(stateName)) count++;
    });
    return count;
  }

  getAllStates() {
    const allStates = new Set();
    this.cellStates.forEach(states => {
      states.forEach(state => allStates.add(state));
    });
    return Array.from(allStates);
  }

  getStateDistribution() {
    const distribution = {};
    this.cellStates.forEach(states => {
      states.forEach(state => {
        distribution[state] = (distribution[state] || 0) + 1;
      });
    });
    return distribution;
  }

  // ========================================
  // 🔍 RECHERCHE AVANCÉE
  // ========================================

  findCells(criteria) {
    const result = [];
    
    this.cellsMap.forEach((cell, cellKey) => {
      const [x, y] = cellKey.split(',').map(Number);
      let matches = true;

      // Vérification des critères
      if (criteria.state && !this.hasCellState(x, y, criteria.state)) {
        matches = false;
      }
      
      if (criteria.hasContent !== undefined) {
        const hasContent = cell.content && cell.content.trim().length > 0;
        if (criteria.hasContent !== hasContent) {
          matches = false;
        }
      }
      
      if (criteria.position) {
        if (criteria.position.x) {
          if (criteria.position.x.min !== undefined && x < criteria.position.x.min) matches = false;
          if (criteria.position.x.max !== undefined && x > criteria.position.x.max) matches = false;
        }
        if (criteria.position.y) {
          if (criteria.position.y.min !== undefined && y < criteria.position.y.min) matches = false;
          if (criteria.position.y.max !== undefined && y > criteria.position.y.max) matches = false;
        }
      }

      if (matches) {
        result.push({ 
          x, y, 
          id: cell.id, 
          element: cell.element,
          content: cell.content,
          states: this.getCellStates(x, y)
        });
      }
    });

    return result;
  }

  getCellsInRange(x1, y1, x2, y2) {
    const result = [];
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cellKey = `${x},${y}`;
        const cell = this.cellsMap.get(cellKey);
        if (cell) {
          result.push({ 
            x, y, 
            id: cell.id, 
            element: cell.element 
          });
        }
      }
    }

    return result;
  }

  getCellsInRow(rowIndex) {
    const result = [];
    for (let x = 0; x < this.config.grid.x; x++) {
      const cellKey = `${x},${rowIndex}`;
      const cell = this.cellsMap.get(cellKey);
      if (cell) {
        result.push({ 
          x, 
          y: rowIndex, 
          id: cell.id, 
          element: cell.element 
        });
      }
    }
    return result;
  }

  getCellsInColumn(columnIndex) {
    const result = [];
    for (let y = 0; y < this.config.grid.y; y++) {
      const cellKey = `${columnIndex},${y}`;
      const cell = this.cellsMap.get(cellKey);
      if (cell) {
        result.push({ 
          x: columnIndex, 
          y, 
          id: cell.id, 
          element: cell.element 
        });
      }
    }
    return result;
  }

  compareCellStates(x1, y1, x2, y2) {
    const states1 = new Set(this.getCellStates(x1, y1));
    const states2 = new Set(this.getCellStates(x2, y2));
    
    const same = [...states1].every(state => states2.has(state)) && 
                 [...states2].every(state => states1.has(state));
    
    const common = [...states1].filter(state => states2.has(state));
    const different1 = [...states1].filter(state => !states2.has(state));
    const different2 = [...states2].filter(state => !states1.has(state));
    
    return { same, common, different1, different2 };
  }

  findSimilarCells(x, y) {
    const referenceStates = new Set(this.getCellStates(x, y));
    const result = [];
    
    this.cellStates.forEach((states, cellKey) => {
      const [cellX, cellY] = cellKey.split(',').map(Number);
      
      // Skip la cellule de référence
      if (cellX === x && cellY === y) return;
      
      // Vérifier si les états sont identiques
      const same = states.size === referenceStates.size && 
                   [...states].every(state => referenceStates.has(state));
      
      if (same) {
        const cell = this.cellsMap.get(cellKey);
        result.push({ 
          x: cellX, 
          y: cellY, 
          id: cell.id, 
          element: cell.element 
        });
      }
    });
    
    return result;
  }

  groupCellsByState() {
    const groups = {};
    
    this.cellStates.forEach((states, cellKey) => {
      const [x, y] = cellKey.split(',').map(Number);
      const cell = this.cellsMap.get(cellKey);
      
      states.forEach(stateName => {
        if (!groups[stateName]) {
          groups[stateName] = [];
        }
        groups[stateName].push({ 
          x, y, 
          id: cell.id, 
          element: cell.element 
        });
      });
    });
    
    return groups;
  }

  // ========================================
  // 📝 GESTION DU CONTENU ET STYLES
  // ========================================

  getCellId(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.id : null;
  }

  getCellContent(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.content : null;
  }

  setCellContent(x, y, content) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    
    if (cell) {
      cell.content = content;
      cell.element.textContent = content;
    }
  }

  getCellStyle(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.element.style : null;
  }

  setCellStyle(x, y, styles) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    
    if (cell) {
      Object.assign(cell.element.style, styles);
    }
  }

  resetCellStyle(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    
    if (cell) {
      // Récupération des styles de base
      const cellConfig = cell.config;
      const defaultConfig = this.config.cells.default || {};
      
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

      const baseStyles = { 
        ...defaultCellStyles, 
        ...defaultConfig.style, 
        ...cellConfig.style 
      };

      // Reset complet du style
      cell.element.removeAttribute('style');
      
      // Réapplication des styles de base avec priorité normale
      this.applyStylesToElement(cell.element, baseStyles, false);
    }
  }

  // ========================================
  // 🎯 GESTION DE LA SÉLECTION
  // ========================================

  getSelectedCells() {
    const result = [];
    this.selectedCells.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number);
      const cell = this.cellsMap.get(cellKey);
      result.push({ 
        x, y, 
        id: cell.id, 
        element: cell.element 
      });
    });
    return result;
  }

  clearSelection() {
    const selectedCoords = Array.from(this.selectedCells);
    selectedCoords.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number);
      this.removeCellState(x, y, 'selected');
    });
  }

  triggerSelectionChange() {
    if (this.callbacks.onSelectionChange) {
      this.callbacks.onSelectionChange(this.getSelectedCells());
    }
  }

  // ========================================
  // 📊 UTILITAIRES ET STATISTIQUES
  // ========================================

  getTotalCells() {
    return this.config.grid.x * this.config.grid.y;
  }

  getCell(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.element : null;
  }

  getCellData(x, y) {
    const cellKey = `${x},${y}`;
    return this.cellsMap.get(cellKey);
  }

  // ========================================
  // 🧹 NETTOYAGE
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

      // Reset des callbacks
      this.callbacks = {};

// console.log(`✅ Matrix "${this.config.id}" détruite avec succès`);
    } catch (error) {
      console.error(`❌ Erreur lors de la destruction de Matrix "${this.config.id}":`, error);
    }
  }
}

// ========================================
// 🌟 EXPORT DU MODULE
// ========================================

// Factory functions pour usage simplifié
export function createMatrix(options) {
  return new Matrix(options);
}

/**
 * Crée une matrix responsive qui s'adapte à son parent
 * @param {HTMLElement|string} parent - Élément parent ou sélecteur
 * @param {Object} options - Options de configuration
 * @returns {Matrix} Instance de Matrix
 */
export function createResponsiveMatrix(parent, options = {}) {
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
export function createAutoSizedMatrix(options = {}) {
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
// createMatrix est déjà exporté à la ligne 1178

// Alias pour compatibilité avec l'ancien pattern (éviter le conflit avec la classe Matrix)
const MatrixComponent = createMatrix;
export { MatrixComponent };
export { MatrixComponent as Matrix };

// Export par défaut - fonction directe pour usage: Matrix({...})
export default createMatrix;

// Export des utilitaires supplémentaires - déjà exportés comme functions aux lignes 1188 et 1208
// export { createResponsiveMatrix, createAutoSizedMatrix };
