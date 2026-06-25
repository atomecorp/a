// Extracted from matrix_builder.js: Matrix resize methods (prototype mixin; `this` bound to the Matrix instance).
export const matrixResizeMethods = {
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
    }
  },

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
  },

  /**
   * Déconnecte le ResizeObserver
   */
  disconnectResizeObserver() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  },

  /**
   * S'adapte à un élément parent spécifique
   * @param {HTMLElement|string} parentElement - Élément parent ou sélecteur
   */
  fitToParent(parentElement) {
    const parent = typeof parentElement === 'string'
      ? document.querySelector(parentElement)
      : parentElement;

    if (!parent) {
      return;
    }

    // Déplacement vers le nouveau parent
    parent.appendChild(this.container);

    // Activation du redimensionnement automatique
    this.setAutoResize(true);

    // Force une mise à jour immédiate
    const rect = parent.getBoundingClientRect();
    this.handleResize({ contentRect: rect });
  },

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
    }
  },

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
  },

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
  },

  handleResize(entry) {
    if (!this.config.autoResize) return;

    const { width, height } = entry.contentRect;

    if (this.config.debug) {
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
  },

  updateCellSizes() {
    if (this.config.cellSize) {
      const sizePx = `${this.config.cellSize}px`;
      this.cellsMap.forEach((cell) => {
        cell.element.style.width = sizePx;
        cell.element.style.height = sizePx;
        cell.element.style.minWidth = sizePx;
        cell.element.style.minHeight = sizePx;
        cell.element.style.scrollSnapAlign = 'start';
        cell.element.style.scrollSnapStop = 'always';
      });

      this.updateContainerDimensions();
      return;
    }

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
    }
  },

  addColumn() {
    const prevCols = this.config.grid.x;
    const rows = this.config.grid.y;
    const newColIndex = prevCols;

    this.config.grid.x += 1;
    this.updateGridTemplate();

    for (let y = 0; y < rows; y += 1) {
      const insertIndex = (y * this.config.grid.x) + newColIndex;
      this.createCell(newColIndex, y, insertIndex);
    }

    this.updateCellSizes();
    return this;
  },

  addRow() {
    const prevRows = this.config.grid.y;
    const cols = this.config.grid.x;
    const newRowIndex = prevRows;

    this.config.grid.y += 1;
    this.updateGridTemplate();

    for (let x = 0; x < cols; x += 1) {
      this.createCell(x, newRowIndex);
    }

    this.updateCellSizes();
    return this;
  },
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
  },

  /**
   * Convertit un nom de propriété camelCase en kebab-case
   * @param {string} camelCase - Propriété en camelCase
   * @returns {string} Propriété en kebab-case
   */
  camelToKebab(camelCase) {
    return camelCase.replace(/([A-Z])/g, '-$1').toLowerCase();
  },

  // ========================================
  // 🔍 INTERROGATION GLOBALE
  // ========================================

};
