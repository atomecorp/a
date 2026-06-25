// Extracted from matrix_builder.js: Matrix content methods (prototype mixin; `this` bound to the Matrix instance).
export const matrixContentMethods = {
  getCellId(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.id : null;
  },

  getCellContent(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.content : null;
  },

  setCellContent(x, y, content) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);

    if (cell) {
      cell.content = content;
      cell.element.textContent = content;
    }
  },

  setCellContentById(cellId, content) {
    const cellKey = this.getCellKeyById(cellId);
    if (!cellKey) return false;
    const [x, y] = cellKey.split(',').map(Number);
    this.setCellContent(x, y, content);
    return true;
  },

  getCellStyle(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.element.style : null;
  },

  setCellStyle(x, y, styles) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);

    if (cell) {
      Object.assign(cell.element.style, styles);
    }
  },

  resetCellStyle(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);

    if (cell) {
      const preserved = {
        width: cell.element.style.width,
        height: cell.element.style.height,
        minWidth: cell.element.style.minWidth,
        minHeight: cell.element.style.minHeight
      };
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

      Object.entries(preserved).forEach(([prop, value]) => {
        if (value && value.length) {
          cell.element.style[prop] = value;
        }
      });
    }
  },

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
  },

  clearSelection() {
    const selectedCoords = Array.from(this.selectedCells);
    selectedCoords.forEach(cellKey => {
      const [x, y] = cellKey.split(',').map(Number);
      this.removeCellState(x, y, 'selected');
    });
  },

  triggerSelectionChange() {
    if (this.callbacks.onSelectionChange) {
      this.callbacks.onSelectionChange(this.getSelectedCells());
    }
  },

  // ========================================
  // 📊 UTILITAIRES ET STATISTIQUES
  // ========================================

  getTotalCells() {
    return this.config.grid.x * this.config.grid.y;
  },

  getCell(x, y) {
    const cellKey = `${x},${y}`;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.element : null;
  },

  getCellData(x, y) {
    const cellKey = `${x},${y}`;
    return this.cellsMap.get(cellKey);
  },

  // ========================================
  // 🆔 API PAR ID
  // ========================================

  getCellKeyById(cellId) {
    return this.cellIdToKey.get(cellId) || null;
  },

  getCellById(cellId) {
    const cellKey = this.getCellKeyById(cellId);
    if (!cellKey) return null;
    const cell = this.cellsMap.get(cellKey);
    return cell ? cell.element : null;
  },

  getCellDataById(cellId) {
    const cellKey = this.getCellKeyById(cellId);
    if (!cellKey) return null;
    return this.cellsMap.get(cellKey) || null;
  },

  appendCellContentById(cellId, text, { separator = '' } = {}) {
    const cellKey = this.getCellKeyById(cellId);
    if (!cellKey) return false;
    const cell = this.cellsMap.get(cellKey);
    if (!cell) return false;

    const next = `${cell.content || ''}${separator}${text}`;
    const [x, y] = cellKey.split(',').map(Number);
    this.setCellContent(x, y, next);
    return true;
  },

  setCellStateById(cellId, stateName, active = true) {
    const cellKey = this.getCellKeyById(cellId);
    if (!cellKey) return false;
    const [x, y] = cellKey.split(',').map(Number);
    this.setCellState(x, y, stateName, active);
    return true;
  },

  selectCellById(cellId, { clearFirst = false } = {}) {
    if (clearFirst) this.clearSelection();
    return this.setCellStateById(cellId, 'selected', true);
  },

  // ========================================
  // 🧹 NETTOYAGE
  // ========================================

};
